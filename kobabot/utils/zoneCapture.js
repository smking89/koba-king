"use strict";

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist, isInsideGrid } = require("../rcon/parsers");
const { formatStyledMessage } = require("./messageStyle");
const { infoEmbed } = require("./embeds");

const RAW_MATERIAL_FIELDS = ["sulfur_cores", "emp_capacitors", "uranium_rods", "blueprints"];

/**
 * Feature 5 - Automated Zone Capture Tracking.
 * In-memory hold-state per "guildId:gridLabel" - resets on contest/empty,
 * resets `awarded` on a fresh hold so a team can be rewarded again next
 * time they (re)take the zone. State is intentionally not persisted: a bot
 * restart just restarts the hold-timer clock, which is an acceptable
 * simplification for a live war-tracking feature.
 */
const zoneState = new Map();

function teamHoldingGrid(guildId, gamertags) {
  const teams = new Set();
  for (const gamertag of gamertags) {
    const row = db.getMemberByGamertag(guildId, gamertag);
    if (row) teams.add(row.team_name);
  }
  return teams;
}

async function logZoneCapture(client, guild, team, gridLabel, part) {
  const meta = db.getGuildMeta(guild.id);
  if (!meta?.logs_channel_id) return;
  const channel = await guild.channels.fetch(meta.logs_channel_id).catch(() => null);
  if (!channel) return;
  await channel
    .send({
      embeds: [
        infoEmbed(
          "Zone Secured",
          `**${team}** held grid **${gridLabel}** unchallenged and recovered 1x **${part.replace(/_/g, " ")}**.`
        ),
      ],
    })
    .catch(() => {});
}

/** Runs one capture-tracking pass for a single guild's linked Rust server. */
async function runZoneCaptureTick(client, guild) {
  let rcon;
  try {
    rcon = await getRcon(guild.id);
  } catch {
    return; // server offline - just skip this tick, state carries over
  }

  const grids = db.getConfig(guild.id, "monument_capture_grids") || [];
  const gridBoundaries = db.getConfig(guild.id, "grid_boundaries") || {};
  const captureDuration = db.getConfig(guild.id, "zone_capture_duration");

  let players;
  try {
    players = parsePlayerlist(await rcon.send("players"));
  } catch (err) {
    console.warn("[KOBA Bot] Zone capture playerlist poll failed:", err.message);
    return;
  }

  for (const gridLabel of grids) {
    const bounds = gridBoundaries[gridLabel];
    if (!bounds) continue;

    const key = `${guild.id}:${gridLabel}`;
    const gamertagsInZone = players.filter((p) => isInsideGrid(p.x, p.z, bounds)).map((p) => p.gamertag);
    const teamsPresent = teamHoldingGrid(guild.id, gamertagsInZone);
    const state = zoneState.get(key) || { holdingTeam: null, since: 0, awarded: false };

    if (teamsPresent.size !== 1) {
      // Empty (no registered players present) or contested (2+ teams) - reset the hold clock.
      zoneState.set(key, { holdingTeam: null, since: 0, awarded: false });
      continue;
    }

    const [team] = teamsPresent;

    if (state.holdingTeam !== team) {
      // New (or first) holder - start the clock fresh.
      zoneState.set(key, { holdingTeam: team, since: Date.now(), awarded: false });
      continue;
    }

    if (!state.awarded && Date.now() - state.since >= captureDuration) {
      const part = RAW_MATERIAL_FIELDS[Math.floor(Math.random() * RAW_MATERIAL_FIELDS.length)];
      db.adjustTeamMaterials(guild.id, team, { [part]: 1 });
      await rcon.say(formatStyledMessage(guild.id, "event", { message: `[ NOTICE ] COMPONENT RECOVERY: Team ${team} has secured the extraction zone!` })).catch(() => {});
      await logZoneCapture(client, guild, team, gridLabel, part);
      zoneState.set(key, { ...state, awarded: true });
    }
  }
}

module.exports = { runZoneCaptureTick, zoneState };

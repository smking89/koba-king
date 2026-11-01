"use strict";

/**
 * Feature: Zone Events & Component Economy.
 * Resolves events whose timer has expired: polls live RCON player
 * positions, and whoever's registered team is the sole team with players
 * still inside the zone bounds at that exact moment wins the reward. An
 * empty or contested zone at expiry means no winner - this is a literal
 * "last one standing when the clock hits zero" check, not a continuous
 * hold-timer (see utils/zoneCapture.js for the hold-timer variant used by
 * the static monument-capture feature).
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist, parsePrintPos } = require("../rcon/parsers");
const { MATERIAL_LABELS, MATERIAL_EMOJI } = require("../config/materials");
const { formatStyledMessage } = require("../utils/messageStyle");
const { successEmbed, infoEmbed } = require("../utils/embeds");

function isInsideCircle(x, z, centerX, centerZ, radius) {
  const dx = x - centerX;
  const dz = z - centerZ;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * FIXED (2026-09-10): /create-event-wizard defaults to (and mostly creates)
 * Box-shaped zones, but this resolver only ever checked a circle - a Box
 * event's win-check was silently wrong shape the whole time. Rotation
 * direction is a best-effort guess (RCE's own docs don't specify sign
 * convention for zones.createcustomzone's yaw) - unrotated (rotation === 0,
 * far and away the common case) is unaffected either way.
 */
function isInsideBox(x, z, event) {
  const dx = x - event.center_x;
  const dz = z - event.center_z;
  const theta = (-(event.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= event.box_x / 2 && Math.abs(localZ) <= event.box_z / 2;
}

function isInsideZone(x, z, event) {
  if (event.shape === "Box" && event.box_x && event.box_z) return isInsideBox(x, z, event);
  return isInsideCircle(x, z, event.center_x, event.center_z, event.radius);
}

/**
 * FIXED (2026-09-10): this used to trust `players`' own `posi` column for
 * x/z - confirmed elsewhere (see rcon/parsers.js's parsePlayerlist header)
 * that column is empty on this server build, so EVERY zone event resolution saw zero
 * players in the zone regardless of who was actually standing in it - a
 * player could hold a zone the entire event and still get "no winner".
 * Real live position only comes from `server.printpos "<gamertag>"`, one
 * call per online player - more RCON round-trips than the old (broken)
 * single-poll approach, but zone events only resolve once per event's
 * timer, not on a hot path, so this is cheap in practice.
 */
async function teamsInZone(guildId, rcon, players, event) {
  const teams = new Set();
  for (const p of players) {
    if (!p.gamertag) continue;
    let pos;
    try {
      pos = parsePrintPos(await rcon.send(`server.printpos "${p.gamertag}"`));
    } catch {
      continue; // couldn't read this one player's position - skip, don't fail the whole resolution
    }
    if (!pos) continue;
    if (!isInsideZone(pos.x, pos.z, event)) continue;
    const member = db.getMemberByGamertag(guildId, p.gamertag);
    if (member) teams.add(member.team_name);
  }
  return teams;
}

async function announceResult(client, guild, event, winnerTeam) {
  const meta = db.getGuildMeta(guild.id);
  const announcementChannelId = meta?.events_channel_id || meta?.announcement_channel_id || meta?.panel_channel_id;
  if (!announcementChannelId) return;
  const channel = await guild.channels.fetch(announcementChannelId).catch(() => null);
  if (!channel) return;

  const embed = winnerTeam
    ? successEmbed(
        `Event Resolved: ${event.event_name}`,
        `**${winnerTeam}** held **${event.zone_name}** when the timer expired and wins **${event.reward_qty}x ${MATERIAL_LABELS[event.reward_material] || event.reward_material}** ${MATERIAL_EMOJI[event.reward_material] || ""}.`
      )
    : infoEmbed(`Event Resolved: ${event.event_name}`, `No single team was holding **${event.zone_name}** when the timer expired - no reward awarded.`);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

/** Checks every guild for zone events whose timer has expired and resolves them. */
async function runZoneEventsTick(client) {
  const dueEvents = db.listDueZoneEvents();
  if (!dueEvents.length) return;

  // Events can span multiple guilds, each possibly on its own linked RCON
  // server (/add-server), AND each event now remembers exactly which linked
  // Cluster map (event.server_name) it was actually created on - FIXED
  // (2026-09-10): this used to always resolve against the guild's single
  // default connection, so a Cluster guild's per-map event either resolved
  // against the wrong map's players entirely or failed outright if that
  // guild never linked a default connection. Cache is keyed per (guild, map)
  // pair rather than just per guild for this reason.
  const playersByKey = new Map(); // "guildId:serverName" -> { rcon, players[] } | null (null = poll failed, skip this key's events)

  for (const event of dueEvents) {
    const guild = client.guilds.cache.get(event.guild_id);
    if (!guild) {
      db.cancelZoneEvent(event.id);
      continue;
    }

    const cacheKey = `${event.guild_id}:${event.server_name || ""}`;
    if (!playersByKey.has(cacheKey)) {
      try {
        const rcon = await getRcon(event.guild_id, event.server_name || undefined);
        playersByKey.set(cacheKey, { rcon, players: parsePlayerlist(await rcon.send("players")) });
      } catch (err) {
        console.warn(`[KOBA Bot] Zone event resolution playerlist poll failed for guild ${event.guild_id} (map: ${event.server_name || "default"}):`, err.message);
        playersByKey.set(cacheKey, null);
      }
    }

    const cached = playersByKey.get(cacheKey);
    if (!cached) continue; // server offline - leave this guild's events pending, retried next tick
    const { rcon, players } = cached;

    const teams = await teamsInZone(event.guild_id, rcon, players, event);
    const winnerTeam = teams.size === 1 ? [...teams][0] : null;

    // Temporary debug logging (2026-09-03) - a report came in of a solo
    // linked/teamed player holding a zone the whole event and still getting
    // "no winner". This snapshot-at-expiry design (see header comment) can
    // only fail two ways: (a) another team's player was also inside the
    // zone at this exact poll moment (teams.size > 1, working as designed
    // but surprising), or (b) the reporting player's gamertag/position
    // didn't match anyone (teams.size === 0 - likely a real bug, e.g. a
    // gamertag mismatch between /link and what RCON reports, or a stale/
    // inaccurate position at poll time). This log distinguishes the two.
    console.log(
      `[KOBA Bot] Zone event resolved: "${event.event_name}" in guild ${event.guild_id} - ${players.length} total players polled, teams found in zone: [${[...teams].join(", ")}], winner: ${winnerTeam || "none"}`
    );

    if (winnerTeam) db.adjustTeamMaterials(event.guild_id, winnerTeam, { [event.reward_material]: event.reward_qty });
    db.resolveZoneEvent(event.id, winnerTeam);
    await announceResult(client, guild, event, winnerTeam).catch((err) => console.error("[KOBA Bot] Zone event announcement failed:", err));

    if (winnerTeam) {
      try {
        const rcon = await getRcon(event.guild_id, event.server_name || undefined);
        await rcon.say(formatStyledMessage(event.guild_id, "event_winner", { event: event.event_name, winner: winnerTeam }));
      } catch (err) {
        console.warn(`[KOBA Bot] Zone event winner in-game broadcast failed for guild ${event.guild_id}:`, err.message);
      }
    }

    // Clean up the actual in-game zone created by /create-event - otherwise
    // every past event's zone marker stays live on the map forever.
    try {
      const rcon = await getRcon(event.guild_id, event.server_name || undefined);
      await rcon.send(`zones.deletecustomzone "${event.zone_name}"`);
    } catch (err) {
      console.warn(`[KOBA Bot] Zone deletion failed for "${event.zone_name}" in guild ${event.guild_id}:`, err.message);
    }
  }
}

module.exports = { runZoneEventsTick };

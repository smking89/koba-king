"use strict";

/**
 * ORP ("ZORP"-style Offline Raid Protection) - commands/orp.js is the slash
 * command surface; this file owns the actual RCON zone lifecycle
 * (register/remove) and the background presence-toggle tick
 * (utils/backgroundLoops.js's runOrpTick).
 *
 * See schema.sql's orp_zones header for the full design rationale:
 * one zone PER TEAM (not per player), state flipped by polling the same
 * `players` RCON list utils/rewardDelivery.js's isPlayerOnline and
 * utils/zoneEvents.js's teamsInZone already use (no new presence mechanism
 * invented here), and the toggle itself is a VISUAL/chat marker only
 * (color + entermessage/leavemessage/showchatmessage via
 * zones.editcustomzone) - there's no confirmed RCE command to flip PvP/
 * building-damage on a zone that already exists, so this does not, on its
 * own, block raid damage. zones.createcustomzone/editcustomzone/
 * deletecustomzone calling convention (unquoted setting names, parenthesized
 * comma-separated coordinates) matches utils/eventCreation.js's current,
 * already-fixed (2026-10-11) calling convention exactly - not the stale
 * quoted-setting-name example docs/RUST_CONSOLE_RCON_REFERENCE.md's Gap
 * Check section flagged, which predates that fix.
 *
 * Appearance (colors/messages/shape) is admin-configurable PER GUILD (not
 * per-team) via /orp-config set (commands/orp-config.js, ManageGuild-gated same as
 * every other *-config command) and stored on guild_meta.orp_* - see
 * schema.sql's guild_meta header. Unset fields fall back to the DEFAULT_*
 * constants below. Colors and enter/leave messages are read live off
 * guild_meta every time a zone's visual is applied (register + every
 * background-tick state flip), so an admin changing them takes effect
 * immediately without a re-register. Shape/box size, by contrast, is
 * snapshotted onto the orp_zones row itself at register time (see
 * db.upsertOrpZone) - an admin changing the default shape later doesn't
 * retroactively resize an already-deployed zone.
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist, parsePrintPos, findOnlinePlayerId } = require("../rcon/parsers");
const { isValidHex } = require("./messageStyle");
const { successEmbed, infoEmbed } = require("./embeds");

const DEFAULT_ONLINE_COLOR = "#00FF00";
const DEFAULT_PROTECTED_COLOR = "#FF0000";
const DEFAULT_ENTER_MESSAGE = "Entering an ORP zone - raiding here may be protected while the owning team is offline.";
const DEFAULT_LEAVE_MESSAGE = "Leaving the ORP zone.";
const DEFAULT_SHAPE = "Sphere";

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

function orpZoneName(teamName) {
  return `ORP-${teamName}`;
}

/** Resolves this guild's /orp-config appearance, falling back to the DEFAULT_* constants for anything not yet configured. */
function resolveOrpAppearance(guildId) {
  const meta = db.getGuildMeta(guildId);
  return {
    shape: meta?.orp_shape === "Box" ? "Box" : DEFAULT_SHAPE,
    onlineColor: isValidHex(meta?.orp_online_color) ? meta.orp_online_color : DEFAULT_ONLINE_COLOR,
    protectedColor: isValidHex(meta?.orp_protected_color) ? meta.orp_protected_color : DEFAULT_PROTECTED_COLOR,
    enterMessage: meta?.orp_enter_message || DEFAULT_ENTER_MESSAGE,
    leaveMessage: meta?.orp_leave_message || DEFAULT_LEAVE_MESSAGE,
  };
}

async function applyZoneVisual(guildId, rcon, zoneName, state) {
  const { onlineColor, protectedColor, enterMessage, leaveMessage } = resolveOrpAppearance(guildId);
  const rgb = hexToRgb(state === "protected" ? protectedColor : onlineColor);
  // Setting-name tokens unquoted, same convention utils/eventCreation.js's
  // deployZoneEvent currently sends (2026-10-11 fix) - only the zone name
  // and free-text message values stay quoted. Enter/leave messages are
  // direction-based (not state-based) - the color is what signals online
  // vs protected, same as a standard ZORP's behavior.
  await rcon.send(`zones.editcustomzone "${zoneName}" color (${rgb.r},${rgb.g},${rgb.b})`);
  await rcon.send(`zones.editcustomzone "${zoneName}" showchatmessage 1`);
  await rcon.send(`zones.editcustomzone "${zoneName}" entermessage "${enterMessage.replace(/"/g, "'")}"`);
  await rcon.send(`zones.editcustomzone "${zoneName}" leavemessage "${leaveMessage.replace(/"/g, "'")}"`);
}

/**
 * /orp register - captures the caller's LIVE position via
 * `server.printpos "<gamertag>"` (same confirmed mechanism as
 * player_homes/Set Home - utils/playerPanel.js's qc_set_home), then
 * creates (or replaces) the team's zone, both in the DB and in-game.
 * Returns { ok: true, zone } or { ok: false, error }.
 */
async function registerOrpZone(guild, { teamName, gamertag, radius, boxWidth, boxHeight, boxLength, createdBy, serverName }) {
  const rcon = await getRcon(guild.id, serverName);
  const pos = parsePrintPos(await rcon.send(`server.printpos "${gamertag}"`));
  if (!pos) return { ok: false, error: "not_online" };

  const zoneName = orpZoneName(teamName);
  // Shape is the guild's current /orp-config default, snapshotted onto the
  // zone row below - see this file's header comment.
  const { shape } = resolveOrpAppearance(guild.id);
  // zones.createcustomzone's [4] size arg is a bare radius for Sphere, or a
  // parenthesized (x,y,z) triple for Box - confirmed against RCE's Custom
  // Zones feature guide (docs/RUST_CONSOLE_RCON_REFERENCE.md).
  const sizeArg = shape === "Box" ? `(${boxWidth},${boxHeight},${boxLength})` : `${radius}`;

  // Best-effort replace of any previously-deployed zone for this team - not
  // fatal if it never existed server-side (fresh register) or the server's
  // briefly unreachable, same "don't block the DB write on RCON" pattern as
  // deployZoneEvent.
  try {
    await rcon.send(`zones.deletecustomzone "${zoneName}"`);
  } catch {
    // never existed, or server unreachable - fine, createcustomzone below still runs
  }

  try {
    // pvp=1/npc=0/radiationdamage=0/buildingdamage=1/allowbuilding=1 - a
    // normal, undamaged zone to start (team's online right now, since
    // they're the one running this command) - the first background tick
    // after they actually go offline is what flips the visual to protected.
    await rcon.send(`zones.createcustomzone "${zoneName}" (${pos.x},${pos.y},${pos.z}) 0 ${shape} ${sizeArg} 1 0 0 1 1`);
    await rcon.send(`zones.editcustomzone "${zoneName}" showarea 1`);
    await applyZoneVisual(guild.id, rcon, zoneName, "online");
  } catch (err) {
    console.warn(`[KOBA Bot] ORP zone creation RCON failed for team "${teamName}" in guild ${guild.id}:`, err.message);
  }

  const zone = db.upsertOrpZone(guild.id, teamName, {
    zoneName,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    radius: shape === "Box" ? 0 : radius,
    shape,
    boxWidth: shape === "Box" ? boxWidth : null,
    boxHeight: shape === "Box" ? boxHeight : null,
    boxLength: shape === "Box" ? boxLength : null,
    createdBy,
  });
  return { ok: true, zone };
}

/** /orp remove - deletes the in-game zone (best-effort) and the DB row. */
async function removeOrpZone(guild, teamName, serverName) {
  const zone = db.getOrpZone(guild.id, teamName);
  if (!zone) return { ok: false, error: "not_found" };

  try {
    const rcon = await getRcon(guild.id, serverName);
    await rcon.send(`zones.deletecustomzone "${zone.zone_name}"`);
  } catch (err) {
    console.warn(`[KOBA Bot] ORP zone deletion RCON failed for team "${teamName}" in guild ${guild.id}:`, err.message);
  }

  db.deleteOrpZone(guild.id, teamName);
  return { ok: true, zone };
}

async function announceStateChange(guild, zone, newState) {
  const meta = db.getGuildMeta(guild.id);
  const announcementChannelId = meta?.events_channel_id || meta?.announcement_channel_id || meta?.panel_channel_id;
  if (!announcementChannelId) return;
  const channel = await guild.channels.fetch(announcementChannelId).catch(() => null);
  if (!channel) return;

  const embed =
    newState === "protected"
      ? successEmbed("🔴 ORP Zone Protected", `**${zone.team_name}**'s base is now offline - their ORP zone (\`${zone.zone_name}\`) is flagged **protected**.`)
      : infoEmbed("🟢 ORP Zone Online", `**${zone.team_name}** is back online - their ORP zone (\`${zone.zone_name}\`) is back to its normal, unprotected state.`);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Background tick (utils/backgroundLoops.js) - for every registered ORP
 * zone, checks whether ANY of that team's linked members are currently
 * connected (same `players` RCON poll/findOnlinePlayerId lookup
 * utils/rewardDelivery.js's isPlayerOnline already uses) and flips the
 * zone's state + in-game visual + posts a Discord notification on change.
 * Playerlist is polled once per (guild, server) pair per tick, not once per
 * zone - same caching reasoning as utils/zoneEvents.js's runZoneEventsTick.
 */
async function runOrpTick(client) {
  const zones = db.listAllOrpZones();
  if (!zones.length) return;

  const playersByGuild = new Map(); // guildId -> players[] | null (null = poll failed, skip this guild's zones this tick)

  for (const zone of zones) {
    const guild = client.guilds.cache.get(zone.guild_id);
    if (!guild) continue; // bot no longer in this guild - leave the row, don't delete data the guild might re-add later

    if (!playersByGuild.has(zone.guild_id)) {
      try {
        const rcon = await getRcon(zone.guild_id);
        playersByGuild.set(zone.guild_id, parsePlayerlist(await rcon.send("players")));
      } catch (err) {
        console.warn(`[KOBA Bot] ORP tick playerlist poll failed for guild ${zone.guild_id}:`, err.message);
        playersByGuild.set(zone.guild_id, null);
      }
    }
    const players = playersByGuild.get(zone.guild_id);
    if (!players) continue; // server unreachable this tick - leave state as-is, retried next tick

    const roster = db.listTeamMembers(zone.guild_id, zone.team_name);
    const anyOnline = roster.some((m) => m.gamertag && findOnlinePlayerId(players, m.gamertag));
    const newState = anyOnline ? "online" : "protected";
    if (newState === zone.state) continue;

    db.setOrpZoneState(zone.guild_id, zone.team_name, newState);
    try {
      const rcon = await getRcon(zone.guild_id);
      await applyZoneVisual(zone.guild_id, rcon, zone.zone_name, newState);
    } catch (err) {
      console.warn(`[KOBA Bot] ORP zone visual update failed for team "${zone.team_name}" in guild ${zone.guild_id}:`, err.message);
    }
    await announceStateChange(guild, zone, newState).catch((err) => console.error("[KOBA Bot] ORP state-change announcement failed:", err));
  }
}

module.exports = { registerOrpZone, removeOrpZone, runOrpTick, orpZoneName };

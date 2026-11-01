"use strict";

/**
 * Prison/Jail system (Category 6, Phase 2 - KOBABOT_FULL_ROADMAP.md flagged
 * this as a real, confirmed competitive gap: KAOSBOT and Ch33ky's RCE Bot
 * both ship one, KOBA Bot had none). Unlike /mod ban (Discord-access-only
 * per that file's own header comment), this actually touches the live Rust
 * server: an admin-set coordinate (guild_meta.jail_x/y/z, see schema.sql)
 * plus a polling background tick that keeps a jailed player pinned there.
 *
 * There's no RCON event for "player left an area" on this server build
 * (same gap zoneEvents.js/zoneCapture.js already work around for zone
 * holds), so movement-lock enforcement is a plain interval-gated polling
 * loop: server.printpos every tick for each active sentence, and
 * global.teleportpos back to the jail coordinate if they've drifted past
 * JAIL_DRIFT_RADIUS. Same confirmed RCON calling convention as
 * utils/autoKitEngine.js's deliverTeleport (teleport binding delivery) -
 * parenthesized/comma-separated coordinates, gamertag as the quoted
 * "player ID" argument.
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePrintPos } = require("../rcon/parsers");
const { successEmbed, dangerEmbed } = require("./embeds");

// Rust Console Edition has no built-in "leash" radius to copy a convention
// from (zones.createcustomzone's own radius is event-specific, not a fixed
// product default - see zoneEvents.js). 20m is small enough that a jailed
// player can't meaningfully reach a door/wall/loot outside a typical jail
// cell footprint, but large enough that normal server.printpos jitter
// (confirmed non-exact on repeated polls elsewhere in this codebase) won't
// false-positive a re-teleport while standing still. Needs a live-server
// check against whatever cell size an admin actually builds.
const JAIL_DRIFT_RADIUS = 20;

function distance2D(x1, z1, x2, z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dz * dz);
}

async function postToLogs(client, guildId, embed) {
  const meta = db.getGuildMeta(guildId);
  if (!meta?.logs_channel_id) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const channel = await guild.channels.fetch(meta.logs_channel_id).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Teleports `gamertag` to (x,y,z) on `guildId`'s linked RCON connection.
 * Same confirmed command/coordinate-format convention as
 * utils/autoKitEngine.js's deliverTeleport - see that file's header for the
 * "lower-confidence than other RCON fixes, worth a live test" caveat on the
 * parenthesized-coordinate format specifically.
 */
async function teleportTo(guildId, gamertag, x, y, z) {
  const rcon = await getRcon(guildId);
  await rcon.send(`global.teleportpos (${x},${y},${z}) "${gamertag}"`);
}

/** Auto-release: duration elapsed. Returns the player to original_x/y/z if one was recorded, otherwise leaves them at the jail coordinate. */
async function autoRelease(client, sentence) {
  db.releaseJailSentence(sentence.id, null);

  if (sentence.original_x != null) {
    try {
      await teleportTo(sentence.guild_id, sentence.gamertag, sentence.original_x, sentence.original_y, sentence.original_z);
    } catch (err) {
      console.warn(`[KOBA Bot] Jail auto-release teleport-back failed for ${sentence.gamertag} (guild=${sentence.guild_id}):`, err.message);
    }
  }

  await postToLogs(
    client,
    sentence.guild_id,
    successEmbed("🔓 Jail Sentence Expired", `**${sentence.gamertag}**'s jail sentence has run out - released automatically${sentence.original_x != null ? " and returned to their original position" : ""}.`)
  ).catch((err) => console.error("[KOBA Bot] Jail auto-release log post failed:", err));

  console.log(`[KOBA Bot] Auto-released ${sentence.gamertag} from jail (guild=${sentence.guild_id}, sentence=${sentence.id}) - duration elapsed.`);
}

/** Drift check: polls the jailed player's live position and re-teleports them if they've wandered past JAIL_DRIFT_RADIUS. */
async function enforceDrift(sentence) {
  const rcon = await getRcon(sentence.guild_id);
  let pos;
  try {
    pos = parsePrintPos(await rcon.send(`server.printpos "${sentence.gamertag}"`));
  } catch (err) {
    // Offline, or RCON unreachable this tick - not fatal, just skip; next tick retries.
    return;
  }
  if (!pos) return;

  if (distance2D(pos.x, pos.z, sentence.jail_x, sentence.jail_z) <= JAIL_DRIFT_RADIUS) return;

  await rcon.send(`global.teleportpos (${sentence.jail_x},${sentence.jail_y},${sentence.jail_z}) "${sentence.gamertag}"`);
  console.log(`[KOBA Bot] Jail drift detected - re-teleported ${sentence.gamertag} back to the jail coordinate (guild=${sentence.guild_id}, sentence=${sentence.id}).`);
}

/**
 * Single tick: (a) auto-releases any sentence whose duration has elapsed,
 * (b) polls every other active sentence's live position and snaps them
 * back if they've drifted outside JAIL_DRIFT_RADIUS. Both halves are
 * best-effort per-sentence - one player's offline/RCON-failure doesn't
 * block any other guild's sentences from being checked this same tick,
 * matching utils/zoneEvents.js's per-player try/catch inside its own loop.
 */
async function runJailTick(client) {
  const due = db.listDueJailSentences();
  for (const sentence of due) {
    try {
      await autoRelease(client, sentence);
    } catch (err) {
      console.error(`[KOBA Bot] Jail auto-release failed for ${sentence.gamertag} (guild=${sentence.guild_id}):`, err.message);
    }
  }

  const dueIds = new Set(due.map((s) => s.id));
  const active = db.listAllActiveJailSentences().filter((s) => !dueIds.has(s.id));
  for (const sentence of active) {
    try {
      await enforceDrift(sentence);
    } catch (err) {
      console.warn(`[KOBA Bot] Jail drift check failed for ${sentence.gamertag} (guild=${sentence.guild_id}):`, err.message);
    }
  }
}

module.exports = { runJailTick, JAIL_DRIFT_RADIUS };

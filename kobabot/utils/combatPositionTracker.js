"use strict";

/**
 * Killfeed distance estimation (2026-10-18). RCE's kill broadcast line has
 * no distance field (confirmed, see rcon/combatParser.js), and the bulk
 * `players` command's own position column is confirmed EMPTY on this
 * server build (see rcon/parsers.js's parsePlayerlist header - real
 * capture showed a blank `posi` column for every row). The only real
 * position source is `server.printpos "<gamertag>"`, one call per online
 * player - same command utils/zoneEvents.js and utils/jailSystem.js
 * already use successfully.
 *
 * This runs a periodic background poll (NOT per-kill - a kill needs an
 * answer in real time, there's no time to fire printpos for both players
 * and wait on a kill line arriving) that keeps an in-process cache of each
 * online player's last-known position. At kill time,
 * utils/killfeedEngine.js reads both players' most recent cached position
 * and computes a real 3D Euclidean distance between them - NOT a random
 * number. This is deliberately presented as an ESTIMATE (both players'
 * positions are each up to POLL_INTERVAL_MS stale, so the number can be
 * off by however far either player moved since their last poll) - never
 * labeled as an exact measured distance, which would be a fabrication
 * this project's own "No Fabrication" principle (spec section 29) already
 * rules out elsewhere.
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist, parsePrintPos } = require("../rcon/parsers");

const POLL_INTERVAL_MS = 15000; // matches config/defaults.js's rcon_loop_interval cadence for zone capture - same RCON-traffic tradeoff reasoning
const STALE_AFTER_MS = POLL_INTERVAL_MS * 2; // a position older than two poll cycles is too stale to trust - better to show no distance than a misleading one

const cache = new Map(); // `${guildId}:${gamertag.toLowerCase()}` -> { x, y, z, updatedAt }

function cacheKey(guildId, gamertag) {
  return `${guildId}:${gamertag.toLowerCase()}`;
}

function setPosition(guildId, gamertag, pos) {
  cache.set(cacheKey(guildId, gamertag), { ...pos, updatedAt: Date.now() });
}

/** Returns the cached {x,y,z} for this gamertag if it's fresh enough, else null - never returns a stale position silently. */
function getFreshPosition(guildId, gamertag) {
  const entry = cache.get(cacheKey(guildId, gamertag));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > STALE_AFTER_MS) return null;
  return entry;
}

function distance3D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/** Real distance between two gamertags' last-known positions, rounded to the nearest meter - null if either side has no fresh enough position cached. */
function estimateDistance(guildId, killerGamertag, victimGamertag) {
  const a = getFreshPosition(guildId, killerGamertag);
  const b = getFreshPosition(guildId, victimGamertag);
  if (!a || !b) return null;
  return Math.round(distance3D(a, b));
}

/** Background tick (see utils/backgroundLoops.js) - only polls guilds with a killfeed channel configured, since this is extra RCON traffic (one `players` call + one `printpos` call per online player, every POLL_INTERVAL_MS) that a guild not using the killfeed shouldn't pay for. */
async function runPositionPollTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.kill_feed_channel_id) continue;

    let rcon;
    try {
      rcon = await getRcon(guild.id);
    } catch {
      continue; // RCON down - skip this guild this tick, not an error worth logging on every poll
    }

    let players;
    try {
      players = parsePlayerlist(await rcon.send("players"));
    } catch (err) {
      console.warn(`[KOBA Bot] Combat position poll failed to list players for guild ${guild.id}:`, err.message);
      continue;
    }

    for (const p of players) {
      if (!p.gamertag) continue;
      try {
        const pos = parsePrintPos(await rcon.send(`server.printpos "${p.gamertag}"`));
        if (pos) setPosition(guild.id, p.gamertag, pos);
      } catch {
        // couldn't read this one player's position this tick - leave their cache entry to age out naturally, don't fail the whole poll
      }
    }
  }
}

module.exports = { estimateDistance, runPositionPollTick, POLL_INTERVAL_MS };

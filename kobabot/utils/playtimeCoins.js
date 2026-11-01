"use strict";

/**
 * Playtime coin earning + anti-AFK-farm kick (see /coin-earn-config).
 *
 * Every tick, for each guild with playtime coins enabled: pulls the live
 * playerlist (default connection only - Multi-Server Cluster per-map earning
 * isn't wired up here, same scope as the original single-connection economy
 * commands), compares each online player's x/z against what was stored last
 * tick in playtime_tracking. If position hasn't changed since last_moved_at
 * for longer than the configured afk_kick_minutes, they're kicked (RCON
 * command name is a best guess - see caveat below) and skip that award
 * entirely. Otherwise, once per configured interval_minutes since their
 * last_coin_award_at, they're credited the configured coin amount.
 *
 * IMPORTANT RCON caveat: Rust Console Edition's exact WebRCON kick command
 * syntax is not confirmed here - `kick "<gamertag>" "<reason>"` is the
 * best-guess based on common Rust server-command conventions, flagged the
 * same way as every other unverified RCON command in this project. Confirm
 * against a real server and adjust if it doesn't work as expected.
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist } = require("../rcon/parsers");

const AFK_KICK_REASON = "Kicked for inactivity (AFK coin-farm prevention)";

/** True if (x,z) moved further than this tiny epsilon from the stored position - guards against float jitter counting as "moved". */
function hasMoved(lastX, lastZ, x, z) {
  if (lastX == null || lastZ == null || x == null || z == null) return true; // no prior/no current position data - treat as moved (don't false-positive AFK-kick on missing telemetry)
  return Math.abs(x - lastX) > 0.5 || Math.abs(z - lastZ) > 0.5;
}

async function runPlaytimeCoinsTick(client) {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const enabled = db.getConfig(guild.id, "playtime_coins_enabled");
    if (!enabled) continue;

    const meta = db.getGuildMeta(guild.id);
    if (!meta?.rcon_host) continue; // no default RCON connection linked yet

    const currencyId = db.getConfig(guild.id, "playtime_coins_currency_id");
    const amount = db.getConfig(guild.id, "playtime_coins_amount");
    const intervalMs = (db.getConfig(guild.id, "playtime_coins_interval_minutes") || 0) * 60 * 1000;
    const afkKickMs = db.getConfig(guild.id, "playtime_afk_kick_minutes") ? db.getConfig(guild.id, "playtime_afk_kick_minutes") * 60 * 1000 : null;
    if (!currencyId || !amount || !intervalMs) continue;

    let rcon;
    try {
      rcon = await getRcon(guild.id);
    } catch {
      continue;
    }

    let players;
    try {
      players = parsePlayerlist(await rcon.send("players"));
    } catch (err) {
      console.error(`[KOBA Bot] Playtime coins: playerlist poll failed for guild ${guild.id}:`, err);
      continue;
    }

    for (const player of players) {
      const gamertag = player.gamertag;
      const tracking = db.getPlaytimeTracking(guild.id, gamertag);
      const moved = hasMoved(tracking?.last_x, tracking?.last_z, player.x, player.z);

      let lastMovedAt = tracking?.last_moved_at ?? now;
      if (moved) lastMovedAt = now;

      // AFK kick check - only if we have real position data to judge by.
      if (afkKickMs && player.x != null && player.z != null && now - lastMovedAt >= afkKickMs) {
        try {
          await rcon.sendJson(`kick "${gamertag}" "${AFK_KICK_REASON}"`);
        } catch (err) {
          console.error(`[KOBA Bot] Playtime coins: AFK kick failed for ${gamertag} in guild ${guild.id}:`, err);
        }
        // Reset tracking so they get a clean slate if/when they reconnect, and skip this tick's award.
        db.upsertPlaytimeTracking(guild.id, gamertag, { last_x: player.x, last_z: player.z, last_moved_at: now, last_coin_award_at: tracking?.last_coin_award_at ?? null });
        continue;
      }

      // Coin award check. Wallets are keyed by Discord user id everywhere
      // else in the economy - a gamertag with no rostered/linked member
      // (see database/db.js's getMemberByGamertag) has nowhere to credit
      // coins to, so it still updates position tracking but earns nothing
      // until the player runs /link.
      const discordId = db.getMemberByGamertag(guild.id, gamertag)?.discord_id || null;
      const lastAward = tracking?.last_coin_award_at ?? null;
      if (discordId && moved && (lastAward == null || now - lastAward >= intervalMs)) {
        db.grantFromSupply(guild.id, currencyId, discordId, amount);
        db.upsertPlaytimeTracking(guild.id, gamertag, { last_x: player.x, last_z: player.z, last_moved_at: lastMovedAt, last_coin_award_at: now });
      } else {
        db.upsertPlaytimeTracking(guild.id, gamertag, { last_x: player.x, last_z: player.z, last_moved_at: lastMovedAt, last_coin_award_at: lastAward });
      }
    }
  }
}

module.exports = { runPlaytimeCoinsTick };

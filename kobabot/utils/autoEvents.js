"use strict";

/**
 * Auto-Event Scheduler (/event-config auto) - fires a saved config on its
 * own once both conditions hold: at least `interval_minutes`
 * since it last actually fired, AND at least `min_players` currently online.
 * A config blocked purely on player count is rechecked every tick (not
 * skipped for the rest of its window) - last_triggered_at only advances on
 * an actual fire, see schema.sql.
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parseServerInfo } = require("../rcon/parsers");
const { deployZoneEvent } = require("./eventCreation");

async function runAutoEventsTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const configs = db.listEnabledAutoEvents(guild.id);
    if (!configs.length) continue; // skip the RCON round-trip entirely for guilds with nothing configured

    const now = Date.now();
    const due = configs.filter((c) => now - (c.last_triggered_at || c.created_at) >= c.interval_minutes * 60 * 1000);
    if (!due.length) continue;

    let playerCount;
    try {
      const rcon = await getRcon(guild.id);
      const info = parseServerInfo(await rcon.sendJson("serverinfo"));
      playerCount = info.players;
    } catch (err) {
      console.warn(`[KOBA Bot] Auto-event player count poll failed for guild ${guild.id}:`, err.message);
      continue; // server offline - retry every config next tick
    }

    for (const config of due) {
      if (playerCount < config.min_players) continue; // still under threshold - rechecked next tick, last_triggered_at untouched

      const result = await deployZoneEvent(guild, {
        eventName: config.event_name,
        zoneName: config.zone_name,
        centerX: config.center_x,
        centerY: config.center_y,
        centerZ: config.center_z,
        radius: config.radius,
        durationMinutes: config.duration_minutes,
        rewardMaterial: config.reward_material,
        rewardQty: config.reward_qty,
        colorHex: config.color_hex,
        ingameMessage: config.ingame_message,
        discordMessage: config.discord_message,
        createdBy: config.created_by,
      }).catch((err) => {
        console.error(`[KOBA Bot] Auto-event "${config.config_name}" fire failed for guild ${guild.id}:`, err);
        return { ok: false };
      });

      if (result.ok) db.markAutoEventTriggered(config.id, now);
    }
  }
}

module.exports = { runAutoEventsTick };

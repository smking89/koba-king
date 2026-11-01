"use strict";

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");

/**
 * Proactively connects every guild's linked RCON server(s) - both the
 * single default connection and every Multi-Server Cluster map - so
 * broadcast-driven features (currently: utils/spawnFeed.js's admin-feed item-
 * spawn catch-all) start listening immediately rather than waiting for
 * whichever OTHER feature's own periodic tick happens to call getRcon() first.
 *
 * Extracted 2026-09-10 from the old utils/killFeed.js's
 * runPlatformIdBackfillTick, when the killfeed feature itself was removed
 * entirely per explicit user request. That old function did two things:
 * this connect-sweep, AND a playerlist poll to backfill platform-id ->
 * gamertag pairs for killfeed name resolution - only the connect-sweep still
 * had a real consumer, so the backfill part is gone, not just moved.
 * (AutoKit Quickchat, this connect-sweep's other original consumer, was
 * itself removed in a later pruning pass the same day - see the removal
 * report - but spawnFeed.js's own broadcast listener still needs this.)
 */
async function runRconWarmupTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    const servers = db.listGuildServers(guild.id);
    if (!meta?.rcon_host && !servers.length) continue;

    // undefined serverName below connects the single default connection -
    // only attempted if one's actually configured, so a Cluster-only guild
    // with no default link doesn't waste a connection attempt against nothing.
    const targets = [...(meta?.rcon_host ? [undefined] : []), ...servers.map((s) => s.server_name)];
    for (const serverName of targets) {
      try {
        await getRcon(guild.id, serverName);
      } catch {
        // offline/misconfigured - next tick retries, same as before
      }
    }
  }
}

module.exports = { runRconWarmupTick };

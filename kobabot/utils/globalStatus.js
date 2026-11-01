"use strict";

/**
 * Feature 10 - Global Status Monitoring Suite.
 *
 *  - runPlayerCountTick: per-guild, renames 🌐 Local (the guild's single
 *    default RCON connection) AND 🌍 Global (that default PLUS every
 *    per-map connection in guild_servers - see database/schema.sql). A
 *    guild with no guild_servers rows just has one server, so Global and
 *    Local end up identical - that's expected, not a bug. Also refreshes
 *    the 🗺️-servers hub panel (utils/serversHub.js) on the same tick.
 *  - runOfficialStatsTick: official-server-only, pure DB query (no RCON) -
 *    renames the STATS category's three channels with product-wide totals
 *    across the ENTIRE KOBA Bot network (every guild, not just this one).
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parseServerInfo } = require("../rcon/parsers");
const { flagshipGuildId } = require("./premium");

/** One server's live player/queue count, or null if unreachable - never throws. */
async function pollServer(guildId, serverName) {
  try {
    const rcon = await getRcon(guildId, serverName);
    return parseServerInfo(await rcon.sendJson("serverinfo"));
  } catch {
    return null;
  }
}

async function runPlayerCountTick(guild) {
  const meta = db.getGuildMeta(guild.id);
  const hasDefault = Boolean(meta?.rcon_host);
  const servers = db.listGuildServers(guild.id);

  // Local = the guild's own single default connection only.
  if (meta?.player_count_channel_id) {
    const localChannel = guild.channels.cache.get(meta.player_count_channel_id);
    if (localChannel) {
      const info = hasDefault ? await pollServer(guild.id, undefined) : null;
      // Just the emoji + raw number, no "Players"/"Queued" words and no
      // "/maxPlayers" suffix - different servers run different slot counts,
      // and showing just the live count avoids implying every server is
      // the same size (or that the max is even reported accurately).
      const newName = info ? `🌐 ${info.players} | ⏰ ${info.queued}` : "🌐 Offline";
      if (localChannel.name !== newName) await localChannel.setName(newName).catch(() => {});
    }
  }

  // Global = default (if configured) + every linked map server, summed.
  if (meta?.global_player_count_channel_id) {
    const globalChannel = guild.channels.cache.get(meta.global_player_count_channel_id);
    if (globalChannel) {
      let totalPlayers = 0;
      let totalQueued = 0;
      let anyReachable = false;

      if (hasDefault) {
        const info = await pollServer(guild.id, undefined);
        if (info) {
          anyReachable = true;
          totalPlayers += info.players;
          totalQueued += info.queued;
        }
      }
      for (const server of servers) {
        const info = await pollServer(guild.id, server.server_name);
        if (info) {
          anyReachable = true;
          totalPlayers += info.players;
          totalQueued += info.queued;
        }
        // Each map's own Local channel inside its Cluster category.
        if (info && server.player_count_channel_id) {
          const mapChannel = guild.channels.cache.get(server.player_count_channel_id);
          const mapName = `🌐 ${info.players} | ⏰ ${info.queued}`;
          if (mapChannel && mapChannel.name !== mapName) await mapChannel.setName(mapName).catch(() => {});
        }
      }

      const newName = anyReachable ? `🌍 ${totalPlayers} | ⏰ ${totalQueued}` : "🌍 Offline";
      if (globalChannel.name !== newName) await globalChannel.setName(newName).catch(() => {});
    }
  }

}

async function runOfficialStatsTick(client) {
  const officialGuildId = flagshipGuildId();
  if (!officialGuildId) return;

  const guild = client.guilds.cache.get(officialGuildId);
  if (!guild) return;

  const meta = db.getGuildMeta(guild.id);
  if (!meta) return;

  const stats = db.productWideStats();
  const renames = [
    [meta.stats_servers_channel_id, `🛡️ ${stats.servers} Servers`],
    [meta.stats_owners_channel_id, `👑 ${stats.owners} Owners`],
    [meta.stats_players_channel_id, `⚔️ ${stats.players} Players`],
  ];

  for (const [channelId, newName] of renames) {
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.name === newName) continue;
    await channel.setName(newName).catch(() => {});
  }
}

module.exports = { runPlayerCountTick, runOfficialStatsTick };

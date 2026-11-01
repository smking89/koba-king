"use strict";

const { RconClient } = require("./rcon");
const db = require("../database/db");
const { isOfficialGuild } = require("../utils/premium");
const { postRconAlert } = require("../utils/botHealthAlerts");

/**
 * Per-guild RCON connections, cached by guild id. A guild that hasn't run
 * `/add-server` yet falls back to the env-var default connection (cached
 * under the special key "__default__") - this keeps every existing single-
 * server deployment working unchanged while multi-server guilds opt in.
 */
const connections = new Map(); // guildId (or "__default__") -> { client, connecting }
// connection key -> Set<subscriber> where subscriber is "guildId" (default
// connection) or "guildId:serverName" (a linked Cluster map) - tracks WHICH
// (guild, map) pairs are listening on a given physical connection, so a
// broadcast on it can be attributed to the right map, not just the right
// guild - needed so per-map features (e.g. utils/zoneEvents.js resolving an
// event against the specific Cluster map it was created on, not always the
// guild's default connection) can tell cluster guilds apart instead of
// every map landing in one guild-wide bucket (see subscriberKey/
// parseSubscriberKey below).
const guildsByKey = new Map();
const broadcastHandlers = []; // fn(guildId, rawBroadcastMessage, serverName) - e.g. utils/spawnFeed.js's admin-feed item-spawn catch-all; serverName is undefined for a guild's single default connection

function subscriberKey(guildId, serverName) {
  return serverName ? `${guildId}:${serverName}` : guildId;
}

/** Inverse of subscriberKey - guildId is always the segment before the first ":" (guildIds are pure numeric snowflakes, never contain one). */
function parseSubscriberKey(key) {
  const idx = key.indexOf(":");
  return idx === -1 ? { guildId: key, serverName: undefined } : { guildId: key.slice(0, idx), serverName: key.slice(idx + 1) };
}

/** Registers a handler called for every broadcast (chat/kill feed/etc.) on every guild's connection, once wired up here. */
function onGuildBroadcast(handler) {
  broadcastHandlers.push(handler);
}

function credentialsFor(guildId, serverName) {
  // Per-map credentials (Multi-Server Cluster guilds, see database/schema.sql's
  // guild_servers header) take priority when a serverName is given - falls
  // through to the guild's single default connection if that specific map
  // was never individually linked, so a Cluster category with no per-map
  // /add-server run yet still works (just shares the default server).
  if (guildId && serverName) {
    const server = db.getGuildServer(guildId, serverName);
    if (server) return { key: `${guildId}:${serverName}`, host: server.rcon_host, port: Number(server.rcon_port), password: server.rcon_password };
  }

  const meta = guildId ? db.getGuildMeta(guildId) : null;
  if (meta?.rcon_host && meta?.rcon_port && meta?.rcon_password) {
    return { key: guildId, host: meta.rcon_host, port: Number(meta.rcon_port), password: meta.rcon_password };
  }

  // The shared env-var connection is reserved for the official/dev guild
  // (or an explicit no-guildId internal call) ONLY - NOT every guild that
  // simply hasn't run /add-server yet. That used to bucket multiple
  // unrelated customer guilds onto the exact same physical connection: the
  // broadcast fan-out below (player count, queue, spawn-feed logging)
  // delivers to every guild subscribed to a given key, so two totally
  // separate Discord servers ended up seeing each other's queue/player
  // count the moment both had ever called getRcon() without their own
  // linked server. It was also a live security hole -
  // any unlinked guild could run /rcon against the developer's own real
  // Rust server before configuring their own. Now an unlinked, non-official
  // guild gets a clean "not configured" error instead of silently sharing
  // someone else's connection.
  if (!guildId || isOfficialGuild(guildId)) {
    return { key: "__default__", host: process.env.RCON_HOST, port: Number(process.env.RCON_PORT), password: process.env.RCON_PASSWORD };
  }

  throw new Error("This server hasn't been linked yet - run /add-server first.");
}

/**
 * @param {string} [guildId] - omit to use the env-var default connection directly
 * (e.g. a one-off script). Every feature call site should pass its guild id
 * so a guild with its own /add-server credentials gets its own connection.
 * @param {string} [serverName] - for Multi-Server Cluster guilds with
 * per-map credentials linked; omit to use the guild's single default
 * connection (unaffected by anything in guild_servers).
 */
// FIXED (2026-09-10): reconnection used to be entirely passive - a dropped
// connection only ever got re-established the next time SOMETHING happened
// to call getRcon() again for that same key (a periodic tick, an admin
// command, etc.). In practice utils/rconWarmup.js's connect sweep runs every
// 15s for every guild with RCON configured, so this mostly self-healed
// within that window - but it meant broadcast-driven features' reliability
// was silently riding on an unrelated tick's cadence, and a guild's FIRST
// connection of the bot's lifetime didn't happen until whichever tick got
// there first (up to a few seconds after boot). Both are fixed now: `close`
// schedules its own backoff-retried reconnect using the SAME credentials
// the connection was created with (stored on the entry), as long as at
// least one guild/map is still subscribed to this key; and events/ready.js
// proactively connects every linked server the moment the bot logs in,
// rather than waiting on the first tick.
const RECONNECT_DELAYS_MS = [5000, 15000, 30000, 60000];

/**
 * Bot Health monitoring (utils/botHealthAlerts.js) is officialGuildOnly -
 * posting an alert for every customer guild's RCON hiccup would spam the
 * one shared internal channel with noise that isn't the bot operator's to
 * act on. "__default__" is the shared env-var connection, reserved for the
 * official/dev guild only (see credentialsFor's comment above) so it
 * always counts; any other key is official only if its guildId segment is.
 */
function isOfficialConnectionKey(key) {
  if (key === "__default__") return true;
  const { guildId } = parseSubscriberKey(key);
  return isOfficialGuild(guildId);
}

function scheduleReconnect(key, attempt = 0) {
  const entry = connections.get(key);
  if (!entry) return; // invalidateRcon() already dropped this key - don't resurrect it
  if (!guildsByKey.get(key)?.size) return; // nobody's subscribed to this connection anymore
  if (entry.reconnectTimer) return; // a reconnect is already pending

  const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
  entry.reconnectTimer = setTimeout(async () => {
    entry.reconnectTimer = null;
    if (!connections.has(key) || !guildsByKey.get(key)?.size) return;
    try {
      await connectEntry(key, entry.host, entry.port, entry.password, attempt > 0);
    } catch (err) {
      console.warn(`[KOBA Bot] RCON reconnect attempt failed for "${key}" (retrying):`, err.message);
      // Alert once we hit the longest backoff tier - a transient blip that
      // recovers within the first couple of quick retries isn't worth
      // paging anyone about, but still-down after ~50s of retrying is.
      if (attempt + 1 === RECONNECT_DELAYS_MS.length - 1 && isOfficialConnectionKey(key)) {
        postRconAlert(`🔴 RCON connection still down after repeated attempts (\`${key}\`) — ${err.message}`).catch(() => {});
      }
      scheduleReconnect(key, attempt + 1);
    }
  }, delay);
}

/** Actually opens the connection for `key` and wires it into `connections`/broadcast fan-out - shared by getRcon()'s first-connect path and scheduleReconnect()'s retries so they can't drift apart. `isRecovery` is true only when this call came from scheduleReconnect (not a guild's very first connect ever) - lets the official-guild recovery alert fire once without needing separate state tracking. */
function connectEntry(key, host, port, password, isRecovery = false) {
  let entry = connections.get(key) || {};
  entry.host = host;
  entry.port = port;
  entry.password = password;

  entry.connecting = (async () => {
    const c = new RconClient({ host, port, password });
    await c.connect();
    if (isRecovery && isOfficialConnectionKey(key)) {
      postRconAlert(`🟢 RCON connection recovered (\`${key}\`)`).catch(() => {});
    }
    // One broadcast listener per physical connection, fanned out to every
    // guild currently using it (almost always just one, except guilds still
    // sharing the env-var "__default__" connection).
    c.onBroadcast((message) => {
      for (const sub of guildsByKey.get(key) || []) {
        const { guildId: gid, serverName: sName } = parseSubscriberKey(sub);
        for (const handler of broadcastHandlers) {
          Promise.resolve()
            .then(() => handler(gid, message, sName))
            .catch((err) => console.error(`[KOBA Bot] RCON broadcast handler failed for guild ${gid}:`, err));
        }
      }
    });
    c.ws.once("close", () => {
      if (isOfficialConnectionKey(key)) {
        postRconAlert(`⚠️ RCON connection dropped (\`${key}\`) — attempting to reconnect...`).catch(() => {});
      }
      scheduleReconnect(key);
    });
    entry.client = c;
    return c;
  })();
  connections.set(key, entry);

  return entry.connecting.finally(() => {
    entry.connecting = null;
  });
}

async function getRcon(guildId, serverName) {
  const { key, host, port, password } = credentialsFor(guildId, serverName);

  if (guildId) {
    if (!guildsByKey.has(key)) guildsByKey.set(key, new Set());
    guildsByKey.get(key).add(subscriberKey(guildId, serverName));
  }

  const entry = connections.get(key);
  if (entry?.client?.connected) return entry.client;
  if (entry?.connecting) return entry.connecting;

  return connectEntry(key, host, port, password);
}

/**
 * Live-tests a set of credentials without touching the cache - used by
 * /add-server to verify a connection before saving it.
 */
async function testRconConnection({ host, port, password }) {
  const c = new RconClient({ host, port: Number(port), password });
  try {
    await c.connect();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    c.close();
  }
}

/** Drops a guild's (or one of its maps') cached connection so the next getRcon() reconnects with fresh credentials (called after /add-server saves a change). */
function invalidateRcon(guildId, serverName) {
  connections.delete(subscriberKey(guildId, serverName));
  // Also stop counting this guild(+map) against any connection it was
  // previously sharing (e.g. it just switched off the "__default__"
  // connection onto its own /add-server) so stray broadcasts don't keep
  // firing for it - only the exact (guild, map) pair being unlinked, not
  // every other map this guild still has linked.
  const target = subscriberKey(guildId, serverName);
  for (const set of guildsByKey.values()) set.delete(target);
}

/**
 * True if this guild has never run /add-server for this connection, so
 * getRcon() would silently fall through to the shared env-var "__default__"
 * connection - almost certainly NOT this guild's own Rust server. High-risk
 * commands (/rcon) should surface this instead of letting an admin believe
 * their commands hit their own box when they actually hit whatever's in
 * .env RCON_HOST/PORT/PASSWORD (which could be a totally different server,
 * including one shared with other unlinked guilds).
 */
function usesSharedDefaultConnection(guildId, serverName) {
  return credentialsFor(guildId, serverName).key === "__default__";
}

module.exports = { getRcon, testRconConnection, invalidateRcon, onGuildBroadcast, usesSharedDefaultConnection };

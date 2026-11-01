"use strict";

/**
 * Best-effort parsers for Rust Console Edition WebRCON JSON payloads.
 *
 * IMPORTANT: RCE's exact JSON field casing/shape for `global.entcount --json`
 * and `global.playerlist --json` can vary by server build/plugin set - these
 * parsers check several plausible field-name spellings so the bot degrades
 * gracefully instead of throwing, but you should log a raw payload from your
 * actual target server once and adjust the fallbacks below to match it.
 */

function firstDefined(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Normalizes `global.entcount "Gamertag" --json` into [{ entityId, prefab }]. */
function parseEntcount(raw) {
  const list = Array.isArray(raw) ? raw : raw?.Entities || raw?.entities || [];
  return list
    .map((e) => ({
      entityId: firstDefined(e, ["EntityId", "entityId", "EntId", "id", "ID"]),
      prefab: String(firstDefined(e, ["ShortPrefabName", "shortname", "PrefabName", "prefab"]) || "").toLowerCase(),
    }))
    .filter((e) => e.entityId !== undefined);
}

/** True if a lowercased prefab string matches any of the given substrings. */
function matchesAnyPrefab(prefab, filters) {
  return filters.some((f) => prefab.includes(f));
}

/**
 * FIXED (2026-09-07): the real command is `players` (also works as
 * `global.players`) - NOT `global.playerlist --json`, which isn't a real RCE
 * command at all (it silently returned the literal text "[]" every single
 * time, never an error, which is why this went undetected for so long - it
 * LOOKED like "zero players online" instead of "wrong command"). Confirmed
 * against a real captured server console log (2026-09-06):
 *
 *   id ;name ;ping ;snap ;updt ;posi ;dist ;
 *   NA ;Carter322ALT ;49 ; ;0 ; ;0 ;
 *   NA ;Savage2k7k ;86 ; ;0 ; ;0 ;
 *
 * This is a PLAIN TEXT semicolon-delimited table, not JSON - `players`
 * (unlike `global.playerlist --json`) must be sent with plain rcon.send(),
 * never rcon.sendJson() (which would throw trying to JSON.parse this).
 * The `id` column shows literally "NA" for every player in the one capture
 * confirmed so far - platform ID may simply not be exposed via this command
 * on RCE at all. Until proven otherwise, treat `id` as usually unavailable;
 * every caller needs to keep working from `gamertag` alone (already true
 * for isPlayerOnline/isOnline-style checks - only the RCON role commands
 * that specifically need a platform ID, e.g. /add-role, are still blocked
 * on this).
 */
function parsePlayerlist(raw) {
  const text = typeof raw === "string" ? raw : raw?.Message || raw?.message || "";
  // The captured log shows "\n" between rows - handles both a real newline
  // and a literal backslash-n, in case WebRCON encodes it differently than
  // the server's own console log file does.
  const lines = text
    .split(/\r?\n|\\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  // First line is the header (id ;name ;ping ;snap ;updt ;posi ;dist ;) -
  // column order is fixed, so this is skipped rather than parsed.
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(";").map((c) => c.trim());
      const [rawId, gamertag, ping, , , posi] = cols;
      const id = rawId && rawId.toUpperCase() !== "NA" ? rawId : undefined;
      let x, y, z;
      if (posi) {
        const parts = posi.split(",").map((n) => parseFloat(n.trim()));
        if (parts.length === 3 && parts.every(Number.isFinite)) [x, y, z] = parts;
      }
      return { gamertag: gamertag || undefined, id, ping: ping ? Number(ping) : undefined, x, y, z };
    })
    .filter((p) => p.gamertag);
}

/**
 * Parses `server.printpos "ID"` output - CONFIRMED (captured 2026-09-06)
 * against a real server console log to be plain text, not JSON:
 *
 *   09/06/2026 22:48:58:LOG: (213.21, 8.79, -1433.12)
 *
 * This is the REAL position lookup - unlike `players`/`global.players`
 * (whose `posi` column is confirmed empty on this server build),
 * `server.printpos` actually returns live X/Y/Z. The parens are made
 * optional in the regex in case a different server build omits them.
 * Returns null if nothing parseable was found (e.g. an unknown/offline ID).
 */
function parsePrintPos(raw) {
  const text = typeof raw === "string" ? raw : raw?.Message || raw?.message || "";
  const match = text.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
  if (!match) return null;
  const [, x, y, z] = match;
  return { x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) };
}

/** Finds one online player's platform ID by gamertag (case-insensitive) - null if they're not currently connected. */
function findOnlinePlayerId(players, gamertag) {
  const match = players.find((p) => p.gamertag?.toLowerCase() === gamertag.toLowerCase());
  return match?.id || null;
}

function isInsideGrid(x, z, bounds) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * Feature 10 - Global Status Monitoring. Normalizes `serverinfo --json`
 * (Rust's standard status query) into { players, maxPlayers, queued }.
 * Field names are checked against several plausible spellings, same
 * degrade-gracefully approach as the other parsers here - confirm against
 * your actual server and adjust if RCE's build differs.
 */
function parseServerInfo(raw) {
  const players = firstDefined(raw, ["Players", "players"]) ?? 0;
  const maxPlayers = firstDefined(raw, ["MaxPlayers", "maxPlayers", "Max"]) ?? 0;
  const queued = firstDefined(raw, ["Queued", "queued", "QueuedPlayers"]) ?? 0;
  // UpTime/Memory are confirmed present in global.serverinfo's real payload
  // (docs/RUST_CONSOLE_RCON_REFERENCE.md) but were never parsed out - no
  // FPS/entity-count field exists anywhere in that payload, confirmed
  // against the official docs, so those are deliberately not here.
  const upTime = firstDefined(raw, ["UpTime", "Uptime", "uptime"]) ?? null;
  const memory = firstDefined(raw, ["Memory", "memory", "MemoryUsage"]) ?? null;
  return {
    players: Number(players) || 0,
    maxPlayers: Number(maxPlayers) || 0,
    queued: Number(queued) || 0,
    upTime: upTime !== null ? Number(upTime) || upTime : null,
    memory: memory !== null ? Number(memory) || memory : null,
  };
}

/**
 * Parses `kit list`'s raw text response into individual kit names, for
 * KOBA Bot's own "Sync Kits" auto-discovery (kitPanel.js) - previously only
 * ever substring-searched as one raw blob (commands/referral-config.js's
 * checkKitExists), never actually split into a list. UNCONFIRMED against a
 * real captured "kit list" response as of this writing - handles the
 * plausible shapes (a "kit list:"-style prefix before the names, then
 * comma- or newline-separated names) defensively rather than assuming one
 * exact format; adjust here if a real server's output doesn't match.
 */
function parseKitList(raw) {
  const text = typeof raw === "string" ? raw : raw?.Message || raw?.message || "";
  const withoutPrefix = text.replace(/^.*?kit list\s*:?\s*/i, "");
  return withoutPrefix
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

module.exports = { parseEntcount, matchesAnyPrefab, parsePlayerlist, parsePrintPos, findOnlinePlayerId, isInsideGrid, parseServerInfo, parseKitList };

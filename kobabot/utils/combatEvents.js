"use strict";

/**
 * Immutable Combat Event Pipeline.
 *
 * Rust Server -> existing WebRCON broadcast stream (rcon/manager.js's
 * onGuildBroadcast, already KOBA Bot's internal pub/sub for RCON broadcast
 * messages - utils/spawnFeed.js is a live example consumer) -> combat log
 * parser (rcon/combatParser.js) -> player identity resolution -> point-in-
 * time clan/Clan War resolution -> normalized, immutable event -> Combat
 * Event Store (pvp_kills table) with an idempotency check -> internal event
 * bus (onCombatEvent/publishCombatEvent below) -> downstream consumers
 * (player stats, handled directly here since no separate stats engine
 * exists yet; future Rival/achievement systems subscribe via
 * onCombatEvent instead of this file growing a branch per feature).
 *
 * IDENTITY MODEL - a deliberate, documented deviation from a literal
 * "player UID is the permanent identity" design: Rust Console Edition's
 * WebRCON `players` command returns "NA" for the id column on every real
 * capture taken from this project's actual target server (see
 * rcon/parsers.js's parsePlayerlist header) - there is no stable numeric
 * UID available on this platform the way Steam64 IDs work on PC Rust. The
 * GAMERTAG is KOBA Bot's actual stable identity anchor everywhere else in
 * this codebase (members.gamertag, boom_identities.platform_id), so it's
 * the identity anchor here too. The one UID-shaped thing RCE's kill log
 * DOES sometimes show - a raw numeric placeholder before a display name
 * resolves - is treated as exactly that: a temporary placeholder resolved
 * back to the real gamertag via player_platform_ids, never as the "true"
 * permanent identity.
 *
 * ACHIEVEMENTS - there is no achievement system anywhere in KOBA Bot yet
 * (confirmed via full-repo inspection). This pipeline does not fabricate
 * one; onCombatEvent() below is the integration point a future achievement
 * engine (or the Rival system, built next) would subscribe to.
 */

const crypto = require("crypto");
const db = require("../database/db");
const { onGuildBroadcast } = require("../rcon/manager");
const { parseCombatLine, classifyEvent, looksLikePlatformId, isNpcName, PARSER_VERSION } = require("../rcon/combatParser");

// ---------------------------------------------------------------------------
// Observability (spec section 25) - simple in-memory counters, no external
// metrics platform. Reset only on process restart; not persisted (a restart
// count reset is fine, these are for live debugging, not billing/audit).
// ---------------------------------------------------------------------------
const metrics = {
  "combat.events.received": 0,
  "combat.events.parsed": 0,
  "combat.events.unknown": 0,
  "combat.events.duplicate": 0,
  "combat.events.unresolved_player": 0,
  "combat.events.persisted": 0,
  "combat.events.processing_error": 0,
};

function getCombatMetrics() {
  return { ...metrics };
}

// ---------------------------------------------------------------------------
// Internal event bus - downstream consumers (Rival system, future
// achievements, etc.) subscribe here instead of this module knowing about
// them (spec section 16: the pipeline must not contain scattered per-
// feature business logic).
// ---------------------------------------------------------------------------
const consumers = [];
function onCombatEvent(handler) {
  consumers.push(handler);
}
function publishCombatEvent(event) {
  for (const handler of consumers) {
    Promise.resolve()
      .then(() => handler(event))
      .catch((err) => console.error("[KOBA Bot] Combat event consumer failed:", err));
  }
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

// RCE's WebRCON broadcast stream carries no native per-line event id and no
// embedded timestamp (unlike an exported console LOG file) - so the
// fingerprint buckets wall-clock ARRIVAL time into a short window instead.
// Two deliveries of the exact same raw line within one window are a
// WebSocket reconnect/duplicate-packet replay of the SAME event and must
// collapse to one row; the identical text arriving again after the window
// has elapsed is a genuinely separate, later death (e.g. the same player
// dying to "fall!" twice in one play session) and must NOT be dropped.
const DEDUPE_WINDOW_MS = 5000;

function buildFingerprint(serverKey, rawText) {
  const bucket = Math.floor(Date.now() / DEDUPE_WINDOW_MS);
  return crypto.createHash("sha256").update(`${serverKey}|${rawText}|${bucket}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

/** Resolves a killer/victim name that might be a raw numeric platform-id placeholder back to the real gamertag it was last seen paired with - never guesses; falls back to the bare id honestly if it's never been seen (spec section 9, Unknown Player Handling). */
function resolvePlayerName(guildId, rawName) {
  if (!looksLikePlatformId(rawName)) return { name: rawName, unresolved: false };
  const resolved = db.getGamertagByPlatformId(guildId, rawName);
  return resolved ? { name: resolved, unresolved: false } : { name: rawName, unresolved: true };
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------

async function handleBroadcast(guildId, rawMessage, serverName) {
  const text = typeof rawMessage === "string" ? rawMessage : rawMessage?.Message || rawMessage?.message;
  if (!text) return;
  metrics["combat.events.received"]++;

  let parsed;
  try {
    parsed = parseCombatLine(text);
  } catch (err) {
    metrics["combat.events.processing_error"]++;
    console.error("[KOBA Bot] Combat parser threw on a broadcast line (ignored, bot kept running):", err.message);
    return;
  }
  if (!parsed) return; // not a join/kill line - chat, spawn messages, etc. are none of this pipeline's concern
  metrics["combat.events.parsed"]++;

  if (parsed.type === "join") {
    // Backfills player_platform_ids WHEN the bracketed join value happens
    // to be purely numeric - every real capture taken so far shows a
    // hardware/platform codename here instead (e.g. "SCARLETT"), so this is
    // defensive for a different server build, not something confirmed to
    // fire in practice yet. Harmless no-op otherwise.
    if (looksLikePlatformId(parsed.platformTag)) db.upsertPlatformId(guildId, parsed.platformTag, parsed.gamertag);
    return;
  }
  if (parsed.type !== "kill") return;

  try {
    await processKillEvent(guildId, serverName, text, parsed);
  } catch (err) {
    metrics["combat.events.processing_error"]++;
    console.error(`[KOBA Bot] Combat event processing failed for guild ${guildId} (event dropped, not stored):`, err);
  }
}

async function processKillEvent(guildId, serverName, rawText, parsed) {
  const killerResolved = parsed.killer ? resolvePlayerName(guildId, parsed.killer) : { name: null, unresolved: false };
  const victimResolved = parsed.victim ? resolvePlayerName(guildId, parsed.victim) : { name: null, unresolved: false };
  if (killerResolved.unresolved || victimResolved.unresolved) metrics["combat.events.unresolved_player"]++;

  const killerGamertag = killerResolved.name;
  const victimGamertag = victimResolved.name;
  const eventType = classifyEvent(killerGamertag, victimGamertag, parsed.causeTag);
  if (eventType === "UNKNOWN_DEATH") metrics["combat.events.unknown"]++;

  // Point-in-time clan snapshot (spec section 12) - resolved NOW, never
  // re-derived later from a player's CURRENT team. Only meaningful for a
  // real PvP kill between two rostered players; an NPC/environment "killer"
  // has no team to resolve.
  const killerMember = eventType === "PVP_KILL" && killerGamertag ? db.getMemberByGamertag(guildId, killerGamertag) : null;
  const victimMember = victimGamertag && !isNpcName(victimGamertag) ? db.getMemberByGamertag(guildId, victimGamertag) : null;
  const killerTeamName = killerMember?.team_name || null;
  const victimTeamName = victimMember?.team_name || null;

  // Clan War attribution (spec section 13) - only when the SPECIFIC pairing
  // is at war with each other (not merely "the killer's team is at war with
  // someone"). Ordinary PvP between two teams with no war between them
  // never gets a clan_war_id, per the spec's explicit requirement.
  let clanWarId = null;
  if (eventType === "PVP_KILL" && killerTeamName && victimTeamName && killerTeamName !== victimTeamName) {
    const war = db.getActiveWarForTeam(guildId, killerTeamName);
    if (war && ((war.team_a === killerTeamName && war.team_b === victimTeamName) || (war.team_b === killerTeamName && war.team_a === victimTeamName))) {
      clanWarId = war.id;
    }
  }

  const serverKey = serverName ? `${guildId}:${serverName}` : guildId;
  const fingerprint = buildFingerprint(serverKey, rawText);

  const result = db.insertCombatEvent({
    guildId,
    killerGamertag,
    victimGamertag,
    weapon: null, // not exposed by RCE's WebRCON kill line - never fabricated (spec section 29)
    eventType,
    killedAt: Date.now(),
    killerTeamName,
    victimTeamName,
    clanWarId,
    distance: null, // same - not exposed on this platform, unlike the PC-Rust CombatLog example format
    rawMessage: rawText,
    parserVersion: PARSER_VERSION,
    source: "WEBRCON",
    serverName: serverName || null,
    eventFingerprint: fingerprint,
  });

  if (!result.inserted) {
    // WebSocket reconnect replay / duplicate packet / restart replay -
    // downstream consumers (stats, event bus) MUST NEVER see this, or a
    // reconnect would double-count a kill that already happened.
    metrics["combat.events.duplicate"]++;
    return;
  }
  metrics["combat.events.persisted"]++;

  // Statistics (spec sections 16/17) - only ever runs for a genuinely new,
  // non-duplicate event. UNKNOWN_DEATH never touches stats (spec section
  // 11: unknown events may be stored for diagnostics but must not affect
  // statistics).
  // Snapshot the victim's streak BEFORE resetKillStreak zeroes it - this is
  // the only way a downstream consumer (utils/killfeedEngine.js's Shutdown
  // tier) can ever know "how big a streak did the victim have going into
  // this death", since pvp_streaks.current_streak is gone by the time
  // publishCombatEvent() below hands the event to consumers. Attached onto
  // the event object only (not a new pvp_kills column) - it's a convenience
  // derived from pvp_streaks at this exact moment, not part of the
  // immutable stored row.
  const victimStreakBeforeDeath = victimGamertag && !isNpcName(victimGamertag) ? db.getPvpStreak(guildId, victimGamertag).current_streak : 0;

  if (eventType !== "UNKNOWN_DEATH") {
    // Any confirmed death resets the victim's streak - but only when the
    // victim is an actual player, not the NPC-name side of a "player killed
    // an NPC" PVE_KILL row (there's no player stat to reset for "bear").
    if (victimGamertag && !isNpcName(victimGamertag)) db.resetKillStreak(guildId, victimGamertag);
    // Streak BUMPS are PvP-only, matching this table's pre-existing name
    // (pvp_streaks) and intent - a PvE kill (killer = NPC name, in the
    // other direction) never bumps a real player's kill streak.
    if (eventType === "PVP_KILL" && killerGamertag) db.bumpKillStreak(guildId, killerGamertag);
  }

  const event = db.getCombatEvent(guildId, result.id);
  event.victim_streak_before_death = victimStreakBeforeDeath;
  console.log(
    `[KOBA Bot] Combat event #${event.id} guild=${guildId} type=${eventType} killer=${killerGamertag || "-"} victim=${victimGamertag || "-"}${clanWarId ? ` war=${clanWarId}` : ""}`
  );
  publishCombatEvent(event);
}

onGuildBroadcast(handleBroadcast);

module.exports = { onCombatEvent, getCombatMetrics, handleBroadcast };

"use strict";

/**
 * Rust Console Edition combat log parser - adapter/rule system, NOT one
 * giant regex (per the Combat Event Pipeline spec's explicit requirement).
 * This is a rebuild of logic that used to live in the now-removed
 * utils/killFeed.js/config/npcNames.js (deleted 2026-09-10 along with the
 * killfeed DISPLAY feature) - that removal was about a visible kill-feed
 * channel players didn't want, not about this parsing logic being wrong.
 * The classification rules below were empirically validated against a real
 * ~15,500-line captured console log from the user's own server (see the
 * inline comments on each pattern) and are recovered here unchanged for
 * utils/combatEvents.js to build the new immutable pipeline on top of,
 * rather than being re-derived from scratch or guessed at again.
 *
 * PARSER VERSION - bumped whenever a rule below changes, stored on every
 * CombatEvent row so historical interpretation can be traced (spec section
 * 15, Immutability) without ever rewriting an already-stored event.
 */
const PARSER_VERSION = "1.0.0";

const TIMESTAMP_PREFIX = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}:LOG:\s*/;

/**
 * Only "join" and "kill" matter for the combat pipeline (the old parser
 * also had "team"/"auth" lines, unrelated to combat, not recreated here -
 * this module is purpose-built, not a generic catch-all).
 */
const PARSER_RULES = [
  {
    type: "join",
    // CONFIRMED (2026-09-02, real server capture) - {gamertag} [{platformTag}]
    // has entered the game. platformTag is a hardware/platform codename
    // (e.g. "SCARLETT" = Xbox Series X), NOT a numeric player id.
    regex: /^(.+?)\s*\[([^\]]+)\]\s*has entered the game$/i,
    parse: (m) => ({ type: "join", gamertag: m[1], platformTag: m[2] }),
  },
  {
    type: "kill",
    // CONFIRMED (2026-09-02/03, real server captures) - {victim} was killed
    // by {killer}, optionally followed by (causeTag) - e.g. "...killed by
    // patrolhelicopter (entity)" for an NPC/vehicle kill. A real PvP kill
    // line ("...killed by Killer43580") has NO parenthetical at all.
    // NOTE: RCE's WebRCON does not expose a distance field for this event
    // (unlike the PC-Rust CombatLog plugin format sometimes seen in
    // examples) - distance is always recorded as null, never fabricated
    // (spec section 29, No Fabrication).
    regex: /^(.+?)\s*was killed by\s*(.+?)(?:\s*\(([^)]*)\))?$/i,
    parse: (m) => ({ type: "kill", victim: m[1], killer: m[2], causeTag: m[3]?.trim().toLowerCase() || null }),
  },
];

/** Returns `{ type, ...fields }` for a matching line, or null if the line isn't a join/kill event we care about. */
function parseCombatLine(rawText) {
  const trimmed = (rawText || "").trim().replace(TIMESTAMP_PREFIX, "");
  if (!trimmed) return null;
  for (const rule of PARSER_RULES) {
    const match = trimmed.match(rule.regex);
    if (match) return rule.parse(match);
  }
  return null;
}

// ---------------------------------------------------------------------------
// NPC / self-death classification (recovered from config/npcNames.js)
// ---------------------------------------------------------------------------

/**
 * Anchored to the FULL name (not a substring match) - an earlier unanchored
 * version misclassified real PvP kills as PvE whenever a gamertag merely
 * CONTAINED one of these words (e.g. "Boarmaster99" matching "boar").
 */
const NPC_NAME_PATTERNS = [
  /^scientist$/i,
  /^heavy scientist$/i,
  /^murderer$/i,
  /^zombie$/i,
  /^tunnel dweller$/i,
  /^bear$/i,
  /^wolf$/i,
  /^boar$/i,
  /^stag$/i,
  /^chicken$/i,
  /^horse$/i,
  /^shark$/i,
  /^patrolhelicopter$/i,
  /^bradley$/i,
  /^bradleyapc$/i,
  /^npc/i, // deliberately a prefix match - covers "npc_*"/"npcplayer*" prefab names, never a real gamertag prefix
];

/**
 * No-real-killer environmental/status-effect deaths - the killer NAME field
 * itself IS the cause ("... was killed by Drowned", "... was killed by
 * fall!"). "Drowned" and "fall!" (exact text, trailing "!" included) are
 * CONFIRMED against a real ~15,500-line console log capture; the rest were
 * cross-checked against a competitor bot's published PvE feed-cause
 * reference list. "Hunger"/"Thirst" were an earlier unconfirmed guess and
 * are deliberately NOT included - nothing corroborated them.
 */
const SELF_DEATH_PATTERNS = [
  /^drowned$/i,
  /^fall!?$/i,
  /^bled out$/i,
  /^bleeding$/i,
  /^cold$/i,
  /^heat$/i,
  /^radiation$/i,
  /^suicide$/i,
];

/** True for a plain run of digits - RCE's kill log occasionally shows this instead of a gamertag before the display name resolves (see database/schema.sql's player_platform_ids). A real gamertag is never purely numeric in practice. */
function looksLikePlatformId(name) {
  return /^\d+$/.test(name || "");
}

/**
 * True for anything that isn't a real player gamertag - a known NPC name
 * pattern, a no-real-killer self-death cause, OR contains a literal "."
 * (Rust entity/prefab shortnames like "sentry.bandit.static" always do; a
 * real Xbox/PSN gamertag never does). Does NOT treat a bare numeric name as
 * an NPC - at scale (516 of 930 real captured kill lines had bare-numeric
 * BOTH sides, several independently confirmed to be real players elsewhere
 * in the same log) that's overwhelmingly an unresolved player id, not an
 * NPC - see looksLikePlatformId/resolvePlayerName in utils/combatEvents.js.
 */
function isNpcName(name) {
  if (!name) return false;
  if (name.includes(".")) return true;
  if (SELF_DEATH_PATTERNS.some((p) => p.test(name))) return true;
  return NPC_NAME_PATTERNS.some((p) => p.test(name));
}

/**
 * Classifies a resolved (killer, victim, causeTag) into one of the
 * pipeline's supported event types. Never guesses - anything that doesn't
 * confidently match a known shape falls through to UNKNOWN_DEATH (spec
 * section 11) rather than being fabricated as PvP or PvE.
 */
function classifyEvent(killer, victim, causeTag) {
  if (causeTag === "entity") return "PVE_KILL"; // CONFIRMED: causeTag "entity" = NPC/vehicle/environmental kill source
  if (killer && SELF_DEATH_PATTERNS.some((p) => p.test(killer))) {
    if (/^fall!?$/i.test(killer)) return "FALL";
    if (/^radiation$/i.test(killer)) return "RADIATION";
    if (/^suicide$/i.test(killer)) return "SUICIDE";
    return "PVE_KILL"; // drowned/bled out/bleeding/cold/heat - a real death cause, just not one of the specifically-named types above
  }
  // Either direction makes this a PvE encounter - a player killed BY an NPC
  // (killer is the NPC/entity name) OR a player killing an NPC (victim is
  // the NPC name, e.g. "bear was killed by Zero0None0" for a hunt).
  if ((killer && isNpcName(killer)) || (victim && isNpcName(victim))) return "PVE_KILL";
  if (killer && victim) return "PVP_KILL";
  return "UNKNOWN_DEATH";
}

module.exports = { PARSER_VERSION, parseCombatLine, classifyEvent, isNpcName, looksLikePlatformId };

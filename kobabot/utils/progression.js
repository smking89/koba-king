"use strict";

/**
 * Progression System - permanent per-guild career XP/Level/Prestige (spec:
 * "KOBA Bot — XP, Levels, Prestige, Points & Sessions").
 *
 * OWNERSHIP: this module owns XP/Level/Prestige/badge-award ONLY. Session
 * Points are a SEPARATE system (utils/sessionManager.js) - "XP and Points
 * are completely separate" is one of the spec's most emphasized rules, so
 * this file never touches session_points, and sessionManager.js never
 * touches player_progression.
 *
 * INTEGRATION: this module doesn't parse raw game/combat/challenge state
 * itself - it subscribes to the event buses those systems already publish
 * (utils/gameEvents.js's onGameCompleted, utils/combatEvents.js's
 * onCombatEvent, utils/challengeEngine.js's onChallengeSettled), exactly
 * matching the spec's "games/combat/challenges emit results; progression
 * consumes them" ownership model. No achievement/competition system exists
 * yet in KOBA Bot to integrate with (confirmed via repo-wide inspection,
 * same finding as the Combat Pipeline and Rival System passes) - the
 * achievement/competition integration points from the spec are therefore
 * not implemented, not silently faked.
 */

const db = require("../database/db");
const { onGameCompleted } = require("./gameEvents");
const { onCombatEvent } = require("./combatEvents");
const { onChallengeSettled } = require("./challengeEngine");
const { infoEmbed } = require("./embeds");
const { progressionRankForLevel, prestigeTier } = require("../config/progressionRanks");
const { subBadgeForTenure } = require("../config/subBadges");

/** Incremental XP required to climb from level-1 to level (NOT cumulative) - configurable per guild (spec: "do not hard-code the XP curve"). */
function xpForLevel(curve, level) {
  return Math.round(curve.base * Math.pow(level, curve.growth));
}

/**
 * Walks the curve from level 1 up to find where `xp` currently sits.
 * Level is capped at curve.maxLevel regardless of how much XP a player has
 * beyond that threshold - lifetime_xp (tracked separately, see awardXp)
 * keeps growing unbounded either way, so nothing is ever lost, just not
 * reflected in a level number past the cap (spec section 15: "Level 100
 * MAX LEVEL" - eligible for Prestige from there, not a higher level).
 */
function getLevelInfo(guildId, xp) {
  const curve = db.getXpCurveConfig(guildId);
  let level = 1;
  let remaining = xp;
  while (level < curve.maxLevel) {
    const needed = xpForLevel(curve, level + 1);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  const xpForNext = level < curve.maxLevel ? xpForLevel(curve, level + 1) : 0;
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpForNext, maxLevel: curve.maxLevel, atMaxLevel: level >= curve.maxLevel };
}

/**
 * Idempotent XP award (spec section 5) - a duplicate (discordId,
 * sourceType, sourceId) is a guaranteed no-op, enforced by xp_events'
 * unique index, not just app-level logic (so it holds even across a bot
 * restart mid-processing). Returns null on a duplicate; otherwise the new
 * progression row plus whether this award caused a level-up.
 */
function awardXp(guildId, discordId, amount, sourceType, sourceId) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const isNew = db.recordXpEvent(guildId, discordId, amount, sourceType, sourceId);
  if (!isNew) return null; // already awarded for this exact source event - no-op, never double-awards

  const before = db.getPlayerProgression(guildId, discordId);
  const newXp = before.xp + amount;
  const newLifetimeXp = before.lifetime_xp + amount;
  const { level: newLevel } = getLevelInfo(guildId, newXp);

  db.upsertPlayerProgression(guildId, discordId, { xp: newXp, lifetimeXp: newLifetimeXp, level: newLevel, prestige: before.prestige });
  checkMilestoneBadges(guildId, discordId, { level: newLevel, prestige: before.prestige, lifetimeXp: newLifetimeXp });

  return { leveledUp: newLevel > before.level, previousLevel: before.level, newLevel, xp: newXp, lifetimeXp: newLifetimeXp };
}

/**
 * Prestige (spec sections 15-18) - only touches player_progression's own
 * xp/prestige columns. Preservation of everything else (achievements,
 * game/combat statistics, badges, assets, currencies, clan state, Session
 * state) is structurally guaranteed simply by this NOT touching any of
 * those other tables, rather than needing special-case preservation logic.
 */
function prestige(guildId, discordId) {
  const curve = db.getXpCurveConfig(guildId);
  const progression = db.getPlayerProgression(guildId, discordId);
  const { level } = getLevelInfo(guildId, progression.xp);

  if (level < curve.maxLevel) return { ok: false, reason: `You need to reach Level ${curve.maxLevel} first (currently Level ${level}).` };
  if (progression.prestige >= curve.maxPrestige) return { ok: false, reason: `You've already reached the maximum Prestige (${curve.maxPrestige}).` };

  const newPrestige = progression.prestige + 1;
  // xp resets to 0 (fresh level progression) - lifetime_xp is untouched, exactly as spec section 17 requires.
  db.upsertPlayerProgression(guildId, discordId, { xp: 0, lifetimeXp: progression.lifetime_xp, level: 1, prestige: newPrestige });
  checkMilestoneBadges(guildId, discordId, { level: 1, prestige: newPrestige, lifetimeXp: progression.lifetime_xp });

  return { ok: true, newPrestige };
}

function isPrestigeEligible(guildId, discordId) {
  const curve = db.getXpCurveConfig(guildId);
  const progression = db.getPlayerProgression(guildId, discordId);
  const { level } = getLevelInfo(guildId, progression.xp);
  return level >= curve.maxLevel && progression.prestige < curve.maxPrestige;
}

// ---------------------------------------------------------------------------
// Badges (spec section 20) - automatic milestone conditions only for this
// pass (xp_milestone/level_milestone/prestige_milestone); manual awards use
// db.awardBadge directly from an admin command. Game/combat/session-
// placement/challenge/event milestone conditions are a documented follow-up
// (no live data source wired for those specific triggers yet in this pass).
// ---------------------------------------------------------------------------

function checkMilestoneBadges(guildId, discordId, { level, prestige: prestigeLevel, lifetimeXp }) {
  const checks = [
    { type: "level_milestone", value: level },
    { type: "prestige_milestone", value: prestigeLevel },
    { type: "xp_milestone", value: lifetimeXp },
  ];
  for (const check of checks) {
    for (const badge of db.getServerBadgesByCondition(guildId, check.type)) {
      const threshold = Number(badge.condition_value);
      if (Number.isFinite(threshold) && check.value >= threshold) db.awardBadge(guildId, discordId, badge.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Event consumers - the actual "games/combat/challenges emit, progression
// consumes" wiring (spec sections 23, 28, 30).
// ---------------------------------------------------------------------------

/**
 * Points are a completely separate system (utils/sessionManager.js owns
 * the Session lifecycle) - called directly against db.js here rather than
 * requiring sessionManager.js itself, since everything needed
 * (getActiveSession/addSessionPoints/recordSessionPointEvent) is already a
 * plain db.js function with no session-lifecycle logic attached; avoids a
 * needless cross-module dependency for what's really just two DB calls.
 */
function awardForSource(guildId, discordId, sourceType, sourceId) {
  awardXp(guildId, discordId, db.getXpSourceAmount(guildId, sourceType), sourceType, sourceId);

  const session = db.getActiveSession(guildId);
  if (!session) return; // Points only ever accrue during an active Session (spec section 6) - no active Session, no Points awarded, not an error
  const amount = db.getPointsSourceAmount(guildId, sourceType);
  if (amount <= 0) return;
  const isNew = db.recordSessionPointEvent(guildId, session.id, discordId, amount, sourceType, sourceId);
  if (isNew) db.addSessionPoints(guildId, session.id, discordId, amount);
}

onGameCompleted((event) => {
  awardForSource(event.guildId, event.discordId, "game_completion", event.sourceId);
  if (event.won) awardForSource(event.guildId, event.discordId, "game_win", `${event.sourceId}:win`);
});

onCombatEvent((event) => {
  if (event.event_type === "PVP_KILL" && event.killer_gamertag) {
    const member = db.getMemberByGamertag(event.guild_id, event.killer_gamertag);
    if (member?.discord_id) awardForSource(event.guild_id, member.discord_id, "pvp_kill", `combat_event:${event.id}`);
  } else if (event.event_type === "PVE_KILL" && event.killer_gamertag) {
    const member = db.getMemberByGamertag(event.guild_id, event.killer_gamertag);
    if (member?.discord_id) awardForSource(event.guild_id, member.discord_id, "pve_kill", `combat_event:${event.id}`);
  }
});

onChallengeSettled((event) => {
  awardForSource(event.guildId, event.winnerId, "challenge_win", `challenge:${event.challengeId}`);
});

/**
 * Extracted (2026-09-14) from commands/progression.js's "view" subcommand
 * so utils/mainPanels.js's Player Panel can show the exact same real
 * content as a call-through panel entry instead of a tip pointing at
 * /progression - one render path, not a duplicated copy.
 */
function buildProgressionView(guildId, discordId, username) {
  const record = db.getPlayerProgression(guildId, discordId);
  const levelInfo = getLevelInfo(guildId, record.xp);
  const badges = db.listPlayerBadges(guildId, discordId);
  const badgeLines = badges.length ? badges.map((b) => `${b.icon || "🏅"} ${b.name}`).join("\n") : "_None yet._";
  const xpLine = levelInfo.atMaxLevel ? `**MAX LEVEL**` : `**${levelInfo.xpIntoLevel} / ${levelInfo.xpForNextLevel}** XP to next level`;

  // "KOBA Rank" - explicitly labeled to never be confused with the
  // separate, manually-assigned Clan Rank (config/ranks.js, /clan-config) -
  // see config/progressionRanks.js's header for why these can legitimately
  // disagree for the same player at the same time.
  const kobaRank = progressionRankForLevel(levelInfo.level);
  const prestigeBadge = prestigeTier(record.prestige);
  const kobaScore = db.getKobaScore(discordId);
  // Shield tenure badge - a paying KOBA Pro/Max member's real membership
  // length, not tied to level/prestige/rank at all (see config/subBadges.js).
  const subBadge = subBadgeForTenure(db.getSubscriptionTenureMonths(discordId));

  const embed = infoEmbed(
    `💥 ${username}`,
    [
      `🎖️ **KOBA Rank: ${kobaRank.name}**`,
      `${prestigeBadge ? `🔥 **${prestigeBadge.name}**\n` : ""}⭐ **Level ${levelInfo.level}**${levelInfo.atMaxLevel ? " (MAX)" : ""}`,
      xpLine,
      `Lifetime XP: **${record.lifetime_xp.toLocaleString()}**`,
      `🏆 KOBA Score: **${Math.round(kobaScore.rating)}** (${kobaScore.wins}W-${kobaScore.losses}L)`,
      subBadge ? `🛡️ **KOBA Member - ${subBadge.name}**` : "",
      "",
      "🏅 **Badges**",
      badgeLines,
    ].join("\n")
  );
  return { embeds: [embed] };
}

module.exports = {
  getLevelInfo,
  awardXp,
  prestige,
  isPrestigeEligible,
  checkMilestoneBadges,
  buildProgressionView,
};

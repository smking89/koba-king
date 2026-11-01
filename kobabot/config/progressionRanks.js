"use strict";

/**
 * KOBA Rank - the visible insignia tied to a player's individual XP level
 * (utils/progression.js, levels 1-100). Deliberately a SEPARATE concept
 * from config/ranks.js's RANKS (E1-E9/ADMIN) - that one is a manually
 * assigned CLAN/TEAM role tied to squad size, this one is automatic,
 * account-wide, and driven purely by XP. Several names collide on purpose
 * (both use military terms like "Sergeant") because that's the brief, but
 * every surface that renders one must label it explicitly ("KOBA Rank" vs
 * "Clan Rank") so the two are never confused - they can disagree for the
 * same player at the same time, and that's expected, not a bug.
 *
 * badgeUrl mirrors config/ranks.js's own convention - served from
 * assets/icons/progression-ranks/ via the same /game-icons static mount
 * admin/server.js already exposes.
 */

const BADGE_BASE_URL = "https://kobabot.store/game-icons/progression-ranks";

const PROGRESSION_RANKS = [
  { tier: 1, name: "Recruit", minLevel: 1, maxLevel: 10, badgeUrl: `${BADGE_BASE_URL}/tier-1-recruit.png` },
  { tier: 2, name: "Private", minLevel: 11, maxLevel: 20, badgeUrl: `${BADGE_BASE_URL}/tier-2-private.png` },
  { tier: 3, name: "Corporal", minLevel: 21, maxLevel: 30, badgeUrl: `${BADGE_BASE_URL}/tier-3-corporal.png` },
  { tier: 4, name: "Sergeant", minLevel: 31, maxLevel: 40, badgeUrl: `${BADGE_BASE_URL}/tier-4-sergeant.png` },
  { tier: 5, name: "Staff Sergeant", minLevel: 41, maxLevel: 50, badgeUrl: `${BADGE_BASE_URL}/tier-5-staff-sergeant.png` },
  { tier: 6, name: "Lieutenant", minLevel: 51, maxLevel: 60, badgeUrl: `${BADGE_BASE_URL}/tier-6-lieutenant.png` },
  { tier: 7, name: "Captain", minLevel: 61, maxLevel: 70, badgeUrl: `${BADGE_BASE_URL}/tier-7-captain.png` },
  { tier: 8, name: "Major", minLevel: 71, maxLevel: 80, badgeUrl: `${BADGE_BASE_URL}/tier-8-major.png` },
  { tier: 9, name: "Colonel", minLevel: 81, maxLevel: 90, badgeUrl: `${BADGE_BASE_URL}/tier-9-colonel.png` },
  { tier: 10, name: "Commander", minLevel: 91, maxLevel: 100, badgeUrl: `${BADGE_BASE_URL}/tier-10-commander.png` },
];

/** Escalating recognition once a player hits Level 100 and Prestiges (utils/progression.js's prestige()) - a separate badge track from the level-tier ones above, since level resets to 1 on Prestige but this doesn't. Names match the actual generated badge art (assets/icons/progression-ranks/) exactly: "Elite Prestige" starts at VII, not VI; X is "Master Prestige". */
const PRESTIGE_TIERS = [
  { prestige: 1, name: "Prestige I", badgeUrl: `${BADGE_BASE_URL}/prestige-1.png` },
  { prestige: 2, name: "Prestige II", badgeUrl: `${BADGE_BASE_URL}/prestige-2.png` },
  { prestige: 3, name: "Prestige III", badgeUrl: `${BADGE_BASE_URL}/prestige-3.png` },
  { prestige: 4, name: "Prestige IV", badgeUrl: `${BADGE_BASE_URL}/prestige-4.png` },
  { prestige: 5, name: "Prestige V", badgeUrl: `${BADGE_BASE_URL}/prestige-5.png` },
  { prestige: 6, name: "Prestige VI", badgeUrl: `${BADGE_BASE_URL}/prestige-6.png` },
  { prestige: 7, name: "Elite Prestige VII", badgeUrl: `${BADGE_BASE_URL}/prestige-7.png` },
  { prestige: 8, name: "Elite Prestige VIII", badgeUrl: `${BADGE_BASE_URL}/prestige-8.png` },
  { prestige: 9, name: "Elite Prestige IX", badgeUrl: `${BADGE_BASE_URL}/prestige-9.png` },
  { prestige: 10, name: "Master Prestige", badgeUrl: `${BADGE_BASE_URL}/prestige-10.png` },
];

function progressionRankForLevel(level) {
  return PROGRESSION_RANKS.find((r) => level >= r.minLevel && level <= r.maxLevel) || PROGRESSION_RANKS[PROGRESSION_RANKS.length - 1];
}

function prestigeTier(prestigeLevel) {
  if (!prestigeLevel || prestigeLevel < 1) return null;
  return PRESTIGE_TIERS.find((p) => p.prestige === prestigeLevel) || PRESTIGE_TIERS[PRESTIGE_TIERS.length - 1];
}

module.exports = { PROGRESSION_RANKS, PRESTIGE_TIERS, progressionRankForLevel, prestigeTier };

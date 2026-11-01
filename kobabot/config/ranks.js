/**
 * Feature 3 - Rank hierarchy registry (the 4-Man Scaling Model).
 * Ordered lowest -> highest. `minTeamSize` is the smallest max_team_size
 * a team must be configured for before this rank becomes assignable -
 * this is what powers the dynamic scaling rule (a team capped at 4 only
 * ever sees E1-E4 + Corporal, never Sergeant and above).
 *
 * `badgeUrl` (2026-09-14) - the DEFAULT badge art for a rank, shown
 * anywhere a rank renders (promote/demote confirmations, the website's
 * rank ladder, etc.) unless a team's own /clan-config override
 * (database/db.js's rank_overrides table) replaces it - see
 * utils/rankOverrides.js's getEffectiveRank, which falls back to this
 * field. Served from assets/icons/rank-badges/ (same /game-icons static
 * mount as every other game-icon asset - admin/server.js). E9 has no
 * default badge yet - the source art only covered 9 sequential badges,
 * which map to the 9 lowest tiers (E1 through E8), not includng E9 or the
 * Discord-only ADMIN tier (which was never meant to have one - it's not a
 * real clan rank, per explicit product decision).
 */
const RANKS = [
  { tier: 1, id: "E1", name: "Recruit", minTeamSize: 4, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E1.png" },
  { tier: 2, id: "E2", name: "Private", minTeamSize: 4, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E2.png" },
  { tier: 3, id: "E3", name: "Private First Class", minTeamSize: 4, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E3.png" },
  { tier: 4, id: "E4-SPEC", name: "Specialist", minTeamSize: 4, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E4-SPEC.png" },
  { tier: 5, id: "E4-CPL", name: "Corporal", minTeamSize: 4, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E4-CPL.png" }, // Fireteam Leader
  { tier: 6, id: "E5", name: "Sergeant", minTeamSize: 12, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E5.png" }, // Squad Leader
  { tier: 7, id: "E6", name: "Staff Sergeant", minTeamSize: 36, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E6.png" }, // Platoon Leader
  { tier: 8, id: "E7", name: "Sergeant First Class", minTeamSize: 72, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E7.png" }, // Company Commander
  { tier: 9, id: "E8", name: "First Sergeant", minTeamSize: 72, badgeUrl: "https://kobabot.store/game-icons/rank-badges/E8.png" }, // Team Administrator
  { tier: 10, id: "E9", name: "Sergeant Major", minTeamSize: 72, badgeUrl: null }, // Supreme Commander (one per team) - no default badge art yet
  { tier: 11, id: "ADMIN", name: "Admin (Legacy Architect)", minTeamSize: 4, badgeUrl: null }, // Discord-side only, never leads in-game ops - not a real clan rank, no badge
];

/** Fireteam dual-class specialization slots (Feature 3, 4-Man Core Roles). */
const FIRETEAM_ROLES = ["Leader", "Quartermaster", "Engineer", "Vanguard"];

/** Structural scaling ladder used by the roster validation checker. */
const SCALE_LADDER = [
  { label: "Fireteam", size: 4, requiredRank: "E4-CPL" },
  { label: "Squad", size: 12, requiredRank: "E5" },
  { label: "Platoon", size: 36, requiredRank: "E6" },
  { label: "Company", size: 72, requiredRank: "E7" },
  { label: "Army Cmd", size: Infinity, requiredRank: "E9" },
];

function rankById(id) {
  return RANKS.find((r) => r.id === id) || null;
}

function rankByTier(tier) {
  return RANKS.find((r) => r.tier === tier) || null;
}

/** Ranks assignable given a team's configured max size (dynamic scaling rule). */
function allowedRanks(maxTeamSize) {
  return RANKS.filter((r) => maxTeamSize >= r.minTeamSize);
}

function nextRank(currentId) {
  const cur = rankById(currentId);
  if (!cur) return null;
  return rankByTier(cur.tier + 1);
}

function prevRank(currentId) {
  const cur = rankById(currentId);
  if (!cur) return null;
  return rankByTier(cur.tier - 1);
}

module.exports = { RANKS, FIRETEAM_ROLES, SCALE_LADDER, rankById, rankByTier, allowedRanks, nextRank, prevRank };

"use strict";

const db = require("../database/db");
const { rankById, RANKS } = require("../config/ranks");

/**
 * Merges the built-in rank registry with a team's /clan-config overrides.
 * Every other command that displays a rank (promote/demote confirmations,
 * roster display, etc.) should go through this instead of rankById()
 * directly, so a renamed/rebadged rank actually shows up everywhere.
 */
function getEffectiveRank(guildId, teamName, rankId) {
  const base = rankById(rankId);
  if (!base) return null;
  const override = db.getRankOverride(guildId, teamName, rankId);
  return {
    ...base,
    name: override?.custom_name || base.name,
    badgeUrl: override?.badge_url || base.badgeUrl || null,
    isCustomName: Boolean(override?.custom_name),
    isCustomBadge: Boolean(override?.badge_url),
  };
}

/** Every rank for a team with overrides applied, in registry order - powers /clan-config view. */
function listEffectiveRanks(guildId, teamName) {
  return RANKS.map((r) => getEffectiveRank(guildId, teamName, r.id));
}

module.exports = { getEffectiveRank, listEffectiveRanks };

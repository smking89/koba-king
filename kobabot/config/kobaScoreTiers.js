"use strict";

/**
 * KOBA Score visible rank tiers (Bronze through Legend) - buckets the raw
 * global rating (utils/kobaScore.js) into something a player can read at a
 * glance, per the explicit request to "bucket Elo into visible tiers
 * rather than showing a raw number people can't contextualize." A THIRD
 * rank-shaped concept alongside config/ranks.js's Clan Rank and
 * config/progressionRanks.js's KOBA Rank - all three can disagree for the
 * same player at the same time, by design (they measure different things:
 * team role, XP progression, and competitive rating).
 */

const KOBA_SCORE_TIERS = [
  { name: "Bronze", min: 0, max: 899 },
  { name: "Silver", min: 900, max: 1099 },
  { name: "Gold", min: 1100, max: 1299 },
  { name: "Platinum", min: 1300, max: 1499 },
  { name: "Diamond", min: 1500, max: 1799 },
  { name: "Legend", min: 1800, max: Infinity },
];

function scoreTierFor(rating) {
  return KOBA_SCORE_TIERS.find((t) => rating >= t.min && rating <= t.max) || KOBA_SCORE_TIERS[0];
}

module.exports = { KOBA_SCORE_TIERS, scoreTierFor };

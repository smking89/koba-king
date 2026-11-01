"use strict";

/**
 * KOBA Sub Badges - shield-shaped tenure badges (purchased Twitch sub
 * badge set, Shield_Twitch_Sub_Badges) marking how long a player has been
 * a paying KOBA Pro/Max member (db.getSubscriptionTenureMonths -
 * player_subscriptions.first_subscribed_at, set once and never
 * overwritten by a later plan change). A FOURTH, distinct badge-shaped
 * concept alongside config/ranks.js's Clan Rank, config/progressionRanks.js's
 * KOBA Rank, and config/kobaScoreTiers.js's KOBA Score tier - this one
 * measures none of those, only "how long have you been paying."
 *
 * Served from assets/icons/sub-badges/ via the same /game-icons static
 * mount admin/server.js already exposes for every other game-icon asset.
 */

const BADGE_BASE_URL = "https://kobabot.store/game-icons/sub-badges";

const SUB_BADGE_TIERS = [
  { months: 1, name: "1 Month", file: "1-Month.png" },
  { months: 2, name: "2 Months", file: "2-Month.png" },
  { months: 3, name: "3 Months", file: "3-Month.png" },
  { months: 6, name: "6 Months", file: "6-Month.png" },
  { months: 9, name: "9 Months", file: "9-Month.png" },
  { months: 12, name: "1 Year", file: "1-Year.png" },
  { months: 18, name: "18 Months", file: "18-Month.png" },
  { months: 24, name: "2 Years", file: "2-Year.png" },
  { months: 30, name: "30 Months", file: "30-Month.png" },
  { months: 36, name: "3 Years", file: "3-Year.png" },
  { months: 48, name: "4 Years", file: "4-Year.png" },
  { months: 60, name: "5 Years", file: "5-Year.png" },
];

/** The highest tier this many tenure-months qualifies for, or null below 1 month (nothing to show - never a badge for a non-subscriber). */
function subBadgeForTenure(months) {
  let best = null;
  for (const tier of SUB_BADGE_TIERS) {
    if (months >= tier.months) best = tier;
  }
  return best ? { ...best, badgeUrl: `${BADGE_BASE_URL}/${best.file}` } : null;
}

module.exports = { SUB_BADGE_TIERS, subBadgeForTenure };

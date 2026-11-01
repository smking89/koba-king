"use strict";

/**
 * KOBA Bot Directory Ranking Algorithm (2026-09-15) - replaces the naive
 * "sort by current player count" the Server Directory used before. A
 * real, explainable weighted score instead, combining every trust/quality
 * signal that already exists on a listing:
 *
 *  - Live population (log-scaled so one mega-server doesn't permanently
 *    bury every other listing - going from 10 to 20 players matters a lot
 *    more for a small community than going from 500 to 510 does for a
 *    huge one) - the heaviest-weighted signal, since "is anyone actually
 *    playing here right now" is the single most useful thing a visitor
 *    wants to know.
 *  - Rating (average stars), damped by review count until a listing has
 *    ~10 reviews - a single 5-star review from the owner's friend
 *    shouldn't outrank a well-established server with 40 honest reviews
 *    averaging 4.5.
 *  - Staff-verified bonus - the one real, curated trust signal KOBA Bot
 *    staff actually apply by hand.
 *  - New-listing boost - decays linearly over a server's first 7 days, so
 *    a brand-new registration gets a real (if temporary) chance to be
 *    discovered instead of starting at the bottom under every established
 *    listing with zero live players yet to prove themselves. This is the
 *    "cold start" problem every real recommendation/ranking system solves
 *    the same way - give new content a fair, bounded trial window.
 *
 * Every weight below is a named constant specifically so this can be
 * tuned later without hunting through the formula - e.g. once Boom Coins'
 * server Boost feature ships (a real, purchased, time-limited ranking
 * boost - still deferred to its own future session), it plugs in as one
 * more additive term here, not a rewrite.
 */

const WEIGHT_LIVE_POPULATION = 3;
const WEIGHT_RATING = 2;
const VERIFIED_BONUS = 2;
const NEW_LISTING_BOOST_MAX = 1.5;
const NEW_LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATING_TRUST_THRESHOLD = 10; // review count at which rating.avgStars counts at full weight

function liveScore(server) {
  if (!server.isLive) return 0;
  const population = (server.playerCount || 0) + (server.queued || 0);
  return Math.log10(1 + population) * WEIGHT_LIVE_POPULATION;
}

function ratingScore(rating) {
  if (!rating.reviewCount) return 0;
  const trust = Math.min(1, rating.reviewCount / RATING_TRUST_THRESHOLD);
  return rating.avgStars * trust * WEIGHT_RATING;
}

function newListingBoost(createdAt) {
  const age = Date.now() - (createdAt || 0);
  if (age >= NEW_LISTING_WINDOW_MS || age < 0) return 0;
  return (1 - age / NEW_LISTING_WINDOW_MS) * NEW_LISTING_BOOST_MAX;
}

/**
 * @param server - a directory_servers row (isLive/playerCount/queued/createdAt already resolved by the caller)
 * @param rating - { avgStars, reviewCount } from db.getDirectoryRating
 * @param flags - { verified }
 */
function scoreServer(server, rating, flags = {}) {
  return (
    liveScore(server) +
    ratingScore(rating) +
    (flags.verified ? VERIFIED_BONUS : 0) +
    newListingBoost(server.createdAt)
  );
}

/** Sorts a list of { server, rating, flags } entries by score, highest first - ties broken by live population so the ordering is stable and explainable. */
function rankServers(entries) {
  return entries
    .map((entry) => ({ ...entry, score: scoreServer(entry.server, entry.rating, entry.flags) }))
    .sort((a, b) => b.score - a.score || (b.server.playerCount || 0) - (a.server.playerCount || 0));
}

module.exports = { scoreServer, rankServers, liveScore, ratingScore, newListingBoost };

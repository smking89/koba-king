"use strict";

/**
 * Player-level Basic/Pro/Max entitlements (Koba-rivals) - exact numbers
 * from the KOBA Platform Economy & Subscription System spec (Part 2).
 * Deliberately separate from the guild-owner plan in utils/premium.js -
 * that one gates bot FEATURES for a server owner; this one gates an
 * individual PLAYER's swipe/Challenge activity, same identity (discord_id)
 * used by database/koba_scores and config/progressionRanks.
 *
 * No payment flow is wired to this yet (see schema.sql's
 * player_subscriptions comment) - this file is the entitlement TABLE only,
 * enforcement lives where each limit actually matters
 * (utils/challengeEngine.js for Challenge limits, admin/rivalsApi.js for
 * the swipe cap).
 */

const PLANS = {
  basic: {
    label: "Basic",
    dailySwipeLimit: 20, // null = unlimited
    challengesCreatedPerDay: 3,
    maxActiveCreatedChallenges: 2,
    maxStakePerChallenge: 100,
    priorityMatchmaking: false,
    seeWhoSwipedOnYou: false,
    advancedStatistics: false,
    earlyAccess: false,
    adFree: false,
  },
  pro: {
    label: "Pro",
    dailySwipeLimit: null,
    challengesCreatedPerDay: 5,
    maxActiveCreatedChallenges: 5,
    maxStakePerChallenge: 250,
    priorityMatchmaking: true,
    seeWhoSwipedOnYou: true,
    advancedStatistics: false,
    earlyAccess: false,
    adFree: false,
  },
  max: {
    label: "Max",
    dailySwipeLimit: null,
    challengesCreatedPerDay: 10,
    maxActiveCreatedChallenges: 10,
    maxStakePerChallenge: 1000,
    priorityMatchmaking: true,
    seeWhoSwipedOnYou: true,
    advancedStatistics: true,
    earlyAccess: true,
    adFree: true,
  },
};

function entitlementsFor(plan) {
  return PLANS[plan] || PLANS.basic;
}

/** Today's UTC day key, e.g. "2026-10-31" - the daily-reset boundary for swipe/Challenge-creation counters (player_daily_usage). */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { PLANS, entitlementsFor, todayKey };

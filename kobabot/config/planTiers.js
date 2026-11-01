"use strict";

/**
 * Real Basic/Pro/Max plan model (finalized after direct clarification -
 * earlier drafts of this file gated marketplace/auctions/clan-wars/kit
 * caps per tier, which turned out to be wrong):
 *
 *  - Basic (free, the existing unauthorized-guild fallback - see
 *    database/db.js's getGuildPlan) already gets full core functionality:
 *    community, economy, Rust integration, teams, events, marketplace.
 *    Nothing about that changes.
 *  - Pro (monthly) and Max (yearly) are IDENTICAL in features - Max is
 *    purely an annual-billing/"best value" framing of the same plan, per
 *    explicit product decision ("there shouldn't be any artificial
 *    Max-only features... a customer choosing Max is essentially choosing
 *    the annual billing option for Pro").
 *
 * Subscriptions are already 1-per-server and moved between servers via
 * the existing /transfer command (database/db.js's transferGuildLicense) -
 * nothing new needed there.
 */
const PLAN_LIMITS = {
  basic: {},
  pro: {},
  max: {},
};

function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.basic;
}

module.exports = { PLAN_LIMITS, getPlanLimits };

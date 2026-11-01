"use strict";

/**
 * KOBA Score - global, cross-server, Challenge-outcome-driven competitive
 * rating (see database/schema.sql's koba_scores header for why this is a
 * separate system from pvp_elo/killfeedEngine.js's per-guild kill Elo).
 *
 * Updates ONLY on a real, adjudicated Challenge settlement
 * (utils/challengeEngine.js's onChallengeSettled - itself only ever fired
 * by a real win/loss from utils/duelTracker.js's live kill tracking or its
 * timeout-forfeit path, never a fabricated result) - a player farming raw
 * kills against a weaker opponent doesn't move this number at all, by
 * construction, matching the explicit "reward competitive success, not
 * activity" requirement this was built from.
 *
 * Same symmetric Elo formula as killfeedEngine.js's computeEloDelta,
 * duplicated here (not shared) since global KOBA Score and the Pulse/
 * killfeed Elo are independent systems with independent K-factors - a
 * tuning change to one must never silently move the other.
 */

const db = require("../database/db");
const { onChallengeSettled } = require("./challengeEngine");

const K_FACTOR = 32;

/** Standard Elo expected-score formula - the winner's rating gain (loser drops by the same amount, zero-sum). */
function computeKobaScoreDelta(winnerRating, loserRating) {
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.round(K_FACTOR * (1 - expected));
}

onChallengeSettled((event) => {
  const winner = db.getKobaScore(event.winnerId);
  const loser = db.getKobaScore(event.loserId);
  const delta = computeKobaScoreDelta(winner.rating, loser.rating);
  db.applyKobaScoreResult(event.winnerId, event.loserId, winner.rating, loser.rating, delta);
});

module.exports = { computeKobaScoreDelta, K_FACTOR };

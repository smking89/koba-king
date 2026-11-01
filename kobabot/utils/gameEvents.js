"use strict";

/**
 * Minimal "a player's game session just completed" event bus - the missing
 * piece flagged in both the Rival/Challenge System and Progression System
 * passes: every existing wager game (Lootbox, Defuse Wire, Grid Minefield,
 * Tower Climb) resolves a result directly against the interaction with no
 * event of any kind emitted afterward, so nothing else in the codebase can
 * react to "a game just finished" without this.
 *
 * Deliberately tiny and additive - each game gets exactly ONE new call to
 * publishGameCompleted() at its existing close-out point(s), no change to
 * any game's actual mechanics/odds/payout logic. Same onX/publishX shape as
 * utils/combatEvents.js's onCombatEvent, for consistency.
 *
 * `won` is a simple boolean (cashed out/cleared vs failed/lost) - `payout`
 * is included for forward compatibility (e.g. a future Rival Challenge
 * comparing two independent playthroughs) but progression's flat per-
 * completion/per-win XP+Points awards (spec: "Game Completion +25, Game Win
 * +100" - flat amounts, not wager-proportional) don't need it.
 */

const consumers = [];

function onGameCompleted(handler) {
  consumers.push(handler);
}

/**
 * @param {object} event
 * @param {string} event.guildId
 * @param {string} event.discordId
 * @param {string} event.gameKey - matches config/games.js's registry keys ("lootbox", "defuse_wire", "grid_minefield", "tower_climb")
 * @param {boolean} event.won
 * @param {number} [event.wager]
 * @param {number|null} [event.payout] - null when the game's reward isn't currency-denominated (e.g. a Lootbox item win)
 * @param {string} event.sourceId - a stable, unique-per-completion id (e.g. the underlying run's own DB row id) for downstream idempotency
 */
function publishGameCompleted(event) {
  for (const handler of consumers) {
    Promise.resolve()
      .then(() => handler(event))
      .catch((err) => console.error("[KOBA Bot] Game-completed consumer failed:", err));
  }
}

module.exports = { onGameCompleted, publishGameCompleted };

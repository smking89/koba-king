"use strict";

/**
 * Treasure Slots - a 3-reel slot game. Fixed reel odds/payout table (not
 * admin-configurable, same "don't let odds be misconfigured" reasoning as
 * Grid Minefield's fixed trap count - see schema.sql's
 * treasure_slots_settings header).
 *
 * Expected value - deliberately matched to Tower Climb's own documented
 * house edge (utils/towerClimb.js's header: "a flat 4% house edge" / 0.96
 * RTP), not an arbitrary casino-slot edge. Verified by direct Monte Carlo
 * simulation of spin() over 3,000,000 spins (~0.952 RTP, ~4.8% edge) -
 * the first draft of this table came out to 0.57 RTP, which would have
 * made this game feel like a ripoff next to every other wager game here.
 */
const SYMBOLS = [
  { key: "coin", label: "Copper Coin", icon: "copper-coin.png", weight: 40, threeMultiplier: 2.5, twoMultiplier: 0.65 },
  { key: "sapphire", label: "Sapphire", icon: "sapphire.png", weight: 26, threeMultiplier: 5, twoMultiplier: 1 },
  { key: "topaz", label: "Topaz", icon: "topaz.png", weight: 18, threeMultiplier: 10, twoMultiplier: 1.7 },
  { key: "chalice", label: "Gold Chalice", icon: "gold-chalice.png", weight: 10, threeMultiplier: 25, twoMultiplier: 3.3 },
  { key: "star", label: "Star", icon: "star.png", weight: 5, threeMultiplier: 65, twoMultiplier: 6.5 },
  { key: "jackpot", label: "Jackpot", icon: "jackpot-gem.png", weight: 1, threeMultiplier: 250, twoMultiplier: 17 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function rollSymbol() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }
  return SYMBOLS[0]; // float rounding fallback
}

/** Spins 3 independent reels and resolves the payout multiplier for this combo - 3-of-a-kind pays that symbol's threeMultiplier, exactly 2-of-a-kind pays the highest-rarity matching pair's twoMultiplier, no match pays 0 (the wager is simply lost). */
function spin() {
  const reels = [rollSymbol(), rollSymbol(), rollSymbol()];
  const counts = new Map();
  for (const s of reels) counts.set(s.key, (counts.get(s.key) || 0) + 1);

  let multiplier = 0;
  let matchedSymbol = null;
  for (const [key, count] of counts) {
    const symbol = SYMBOLS.find((s) => s.key === key);
    if (count === 3) {
      multiplier = symbol.threeMultiplier;
      matchedSymbol = symbol;
      break;
    }
    if (count === 2 && symbol.threeMultiplier > (matchedSymbol?.threeMultiplier ?? -1)) {
      multiplier = symbol.twoMultiplier;
      matchedSymbol = symbol;
    }
  }

  return { reels, multiplier, matchedSymbol };
}

module.exports = { SYMBOLS, spin };

"use strict";

/**
 * Registry of every game the Games Panel (/games-panel, utils/gamesPanel.js)
 * can launch. Add a new entry here (and a launcher in gamesPanel.js) to
 * make a new game selectable - the panel's flow (server -> game -> mode ->
 * bet) adapts automatically based on each game's own `modes` list, so a
 * solo-only game never shows a pointless mode picker, and a future
 * multiplayer-only game skips straight to a lobby step instead.
 */
const GAMES_REGISTRY = [
  {
    key: "lootbox",
    label: "Lootbox",
    description: "Wager coins to open a lucky box for a chance at a random reward.",
    modes: ["solo"], // "multiplayer" for future head-to-head games
    enabled: true,
  },
  {
    key: "defuse_wire",
    label: "The Defuse Wire",
    description: "Cut a wire on the bomb - clip safe, double your pool, or blow it all. Cash out any time.",
    modes: ["solo"],
    enabled: true,
  },
  {
    key: "grid_minefield",
    label: "The Grid Minefield",
    description: "Reveal cells on a 4x4 grid - stars grow your payout, but 3 hidden traps lose it all. Walk away any time.",
    modes: ["solo"],
    enabled: true,
  },
  {
    key: "tower_climb",
    label: "Tower Climb",
    description: "Climb the tower one floor at a time - each floor grows your payout, but the higher you go, the greater the risk of falling. Cash out any time.",
    modes: ["solo"],
    enabled: true,
  },
  {
    key: "vault_heist",
    label: "The Co-op Vault Heist",
    description: "A shared server-wide event - everyone attacks the same Locked Vault, rewards split by damage dealt when it cracks.",
    modes: [], // ambient event, not a player-picked wager - see configureOnly below
    enabled: true,
    configureOnly: true, // excluded from the Play flow's game list; only reachable via Configure
  },
  {
    key: "scrap_merchant",
    label: "The Scrap Merchant",
    description: "Sell scrap items you've picked up from other games for coins - no wager, just a persistent junk inventory to cash in whenever you want.",
    modes: [], // no bet/mode step - launches straight to the player's inventory (see gamesPanel.js's startGameSetup)
    enabled: true,
  },
  {
    key: "jackpot",
    label: "The Ticket Jackpot",
    description: "Buy progressive tickets to win the pot! Pool scales live with entries - no max wager limit.",
    modes: ["solo"], // picked individually from Play, but every ticket buyer shares ONE growing per-guild pot (see utils/ticketJackpot.js) - not a per-player wager like the other "solo" games
    enabled: true,
    emoji: "🎰",
  },
  {
    key: "recycler_roulette",
    label: "The Recycler Roulette",
    description: "Wager coins, pick a risk tier, and run the recycler - cash out early for a safe partial profit or risk it all for the full payout.",
    modes: ["solo"],
    enabled: true,
  },
  {
    key: "target_range",
    label: "The Target Range",
    description: "Pay an entry fee and react fast - hit the target before the grid shuffles to build a score multiplier before time runs out.",
    modes: ["solo"],
    enabled: true,
  },
  {
    key: "treasure_slots",
    label: "Treasure Slots",
    description: "Wager coins and spin 3 reels - match 2 or 3 symbols for a payout, up to a 150x Jackpot.",
    modes: ["solo"],
    enabled: true,
    emoji: "🎰",
  },
  {
    key: "bradley_ambush",
    label: "The Bradley APC Ambush",
    description: "A shared server-wide raid - stake in during check-in, then fight down the Bradley's HP together before time runs out.",
    modes: [], // ambient event, not a player-picked wager - see configureOnly below, same pattern as vault_heist
    enabled: true,
    configureOnly: true,
  },
  {
    key: "cargo_ship_heist",
    label: "Cargo Ship Heist",
    description: "A shared server-wide PvP event - board the Cargo Ship and fight for control of the Main Deck across 10 rounds for the grand prize.",
    modes: [], // ambient event, not a player-picked wager - see configureOnly below, same pattern as vault_heist
    enabled: true,
    configureOnly: true,
  },
  {
    key: "coord_events",
    label: "Coordinate-Spawned Events",
    description: "Spawn a Pyramid/Bridge/House loot-crate cluster at a map coordinate for players to rush - see utils/coordEventsPanel.js.",
    modes: [], // admin-triggered event, not a player-picked wager - see configureOnly below, same pattern as vault_heist/bradley_ambush/cargo_ship_heist
    enabled: true,
    configureOnly: true,
  },
];

function getGame(key) {
  return GAMES_REGISTRY.find((g) => g.key === key) || null;
}

module.exports = { GAMES_REGISTRY, getGame };

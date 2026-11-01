"use strict";

/**
 * Fixed set of 8 lootbox art tiers (icons match assets/lootboxes/*.png).
 * The art/label list is global and shared by every guild - what's actually
 * IN each box (rewards, odds, cost/currency) is per-guild, configured via
 * /lootbox-config and stored in the lootbox_rewards + lootbox_settings
 * tables (see database/db.js). suggestedCost is just a starting-point
 * default shown in /lootbox-config's help text, not enforced.
 */
const LOOTBOX_TYPES = [
  { key: "brown", label: "Brown Lucky Box", file: "brown.png", suggestedCost: 50 },
  { key: "red", label: "Red Lucky Box", file: "red.png", suggestedCost: 100 },
  { key: "blue", label: "Dark Blue Lucky Box", file: "blue.png", suggestedCost: 150 },
  { key: "lemon", label: "Lemon Lucky Box", file: "lemon.png", suggestedCost: 200 },
  { key: "black", label: "Black Lucky Box", file: "black.png", suggestedCost: 300 },
  { key: "crystal", label: "Crystal Lucky Box", file: "crystal.png", suggestedCost: 500 },
  { key: "angry", label: "Angry Lucky Block", file: "angry.png", suggestedCost: 750 },
  { key: "xmas", label: "X-Mas Lucky Box", file: "xmas.png", suggestedCost: 1000 },
];

const LOOTBOX_LABELS = Object.fromEntries(LOOTBOX_TYPES.map((b) => [b.key, b.label]));

const REWARD_TYPE_CHOICES = [
  { name: "Rust item", value: "item" },
  { name: "Discord role (permanent)", value: "role" },
  { name: "Discord role (temporary)", value: "temp_role" },
  { name: "Kit", value: "kit" },
  { name: "Crafting material", value: "material" },
];

module.exports = { LOOTBOX_TYPES, LOOTBOX_LABELS, REWARD_TYPE_CHOICES };

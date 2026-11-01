"use strict";

/**
 * RCE entity shortnames for /luckycrates. Confirmed 2026-09-01 from the
 * user's own in-game item/entity reference list (not the gitbook guess
 * this was originally seeded from) - safe to spawn via entity.spawnatpos.
 */
const CRATE_TIERS = {
  high: ["heli_crate", "supply_drop", "codelockedhackablecrate", "crate_elite"],
  medium: ["crate_normal_2", "crate_ammunition", "crate_tools", "crate_underwater_advanced"],
  basic: ["crate_normal", "crate_basic", "crate_food_1", "crate_food_2", "crate_medical", "crate_fuel", "foodbox", "loot_barrel_1", "loot_barrel_2", "oil_barrel"],
};

/** Full reference list, for anything that wants the raw name->shortname map (e.g. a future admin picker UI). */
const ALL_CRATE_SHORTNAMES = {
  "Bradley Crate": "bradley_crate",
  "Code Locked Hackable Crate": "codelockedhackablecrate",
  "Ammunition Crate": "crate_ammunition",
  "Basic Crate": "crate_basic",
  "Elite Crate": "crate_elite",
  "Food Crate 1": "crate_food_1",
  "Food Crate 2": "crate_food_2",
  "Fuel Crate": "crate_fuel",
  "Medical Crate": "crate_medical",
  "Cube Crate": "crate_normal",
  "Cube Crate 2": "crate_normal_2",
  "Cube Crate (Food)": "crate_normal_2_food",
  "Cube Crate (Medical)": "crate_normal_2_medical",
  "Tool Crate": "crate_tools",
  "Underwater Crate (Large)": "crate_underwater_advanced",
  "Underwater Crate (Small)": "crate_underwater_basic",
  "Food Box": "foodbox",
  "Heli Crate": "heli_crate",
  "Barrel 1": "loot_barrel_1",
  "Barrel 2": "loot_barrel_2",
  "Barrel 3": "loot-barrel-1",
  "Oil Barrel": "oil_barrel",
  "Supply Drop": "supply_drop",
};

module.exports = { CRATE_TIERS, ALL_CRATE_SHORTNAMES };

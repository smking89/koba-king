"use strict";

/**
 * Rust Console Edition's quick-chat wheel identifiers, confirmed 2026-09-19
 * directly from the user (the real d11_quick_chat_* id list, KaosBot's
 * reference mapping). Each maps to a plain-English label for display in
 * KOBA Bot's own dropdowns - the STORED value used for matching is always
 * the real id (what the game itself uses), the label is presentation only.
 */
const QUICK_CHAT_TRIGGERS = {
  d11_quick_chat_enemy_spotted: "Enemy Spotted!",
  d11_quick_chat_moving_here: "Moving Here",
  d11_quick_chat_attacking_here: "Attacking Here",
  d11_quick_chat_defending_here: "Defending Here",
  d11_quick_chat_group_up: "Group Up",
  d11_quick_chat_retreat: "Retreat",
  d11_quick_chat_hold_position: "Hold Position",
  d11_quick_chat_thanks: "Thanks",
  d11_quick_chat_sorry: "Sorry",
  d11_quick_chat_ok: "OK",
  d11_quick_chat_out_of_ammo: "Out Of Ammo",
  d11_quick_chat_going_for_stone: "Going For Stone",
  d11_quick_chat_going_for_wood: "Going For Wood",
  d11_quick_chat_going_for_metal: "Going For Metal",
  d11_quick_chat_going_for_food: "Going For Food",
  d11_quick_chat_going_for_water: "Going For Water",
  d11_quick_chat_going_for_scrap: "Going For Scrap",
  d11_quick_chat_going_for_metal_fragments: "Going For Metal Fragments",
  d11_quick_chat_going_for_medicine: "Going For Medicine",
  d11_quick_chat_have_high_quality_metal: "Have High Quality Metal",
  d11_quick_chat_have_scrap: "Have Scrap",
  d11_quick_chat_have_low_grade_fuel: "Have Low Grade Fuel",
  d11_quick_chat_have_food: "Have Food",
  d11_quick_chat_have_water: "Have Water",
  d11_quick_chat_have_hatchet: "Have Hatchet",
  d11_quick_chat_have_pickaxe: "Have Pickaxe",
  d11_quick_chat_have_hunting_bow: "Have Hunting Bow",
  d11_quick_chat_need_high_quality_metal: "Need High Quality Metal",
  d11_quick_chat_need_scrap: "Need Scrap",
  d11_quick_chat_need_low_grade_fuel: "Need Low Grade Fuel",
  d11_quick_chat_need_food: "Need Food",
  d11_quick_chat_need_metal_fragments: "Need Metal Fragments",
  d11_quick_chat_need_stones: "Need Stones",
  d11_quick_chat_need_wood: "Need Wood",
  d11_quick_chat_need_water: "Need Water",
  d11_quick_chat_teleport_north: "Teleport North",
  d11_quick_chat_teleport_north_east: "Teleport North East",
  d11_quick_chat_teleport_east: "Teleport East",
  d11_quick_chat_teleport_south_east: "Teleport South East",
  d11_quick_chat_teleport_south: "Teleport South",
  d11_quick_chat_teleport_south_west: "Teleport South West",
  d11_quick_chat_teleport_west: "Teleport West",
  d11_quick_chat_teleport_north_west: "Teleport North West",
  d11_quick_chat_teleport_home: "Teleport Home",
  d11_quick_chat_here_take_this: "Here, Take This",
};

/** The 9 teleport-direction triggers, reserved for the Teleport binding type (utils/autoKitAdminPanel.js) - kit/vehicle bindings pick from every OTHER trigger instead, so a teleport slot can never accidentally get bound to a kit. */
const TELEPORT_TRIGGER_IDS = Object.keys(QUICK_CHAT_TRIGGERS).filter((id) => id.startsWith("d11_quick_chat_teleport_"));
const NON_TELEPORT_TRIGGER_IDS = Object.keys(QUICK_CHAT_TRIGGERS).filter((id) => !TELEPORT_TRIGGER_IDS.includes(id));

module.exports = { QUICK_CHAT_TRIGGERS, TELEPORT_TRIGGER_IDS, NON_TELEPORT_TRIGGER_IDS };

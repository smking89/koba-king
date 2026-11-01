"use strict";

/**
 * RCE vehicle entity shortnames, confirmed 2026-09-19 from the user's own
 * pasted "Entity Spawning" reference doc (real RCE console command syntax:
 * `entity.spawn {shortname} {x,y,z}`). Used by utils/kitPanel.js's player-
 * facing Vehicle Delivery drawer.
 */
const ALL_VEHICLE_SHORTNAMES = {
  "2 Module Car (Premade)": "2module_car_spawned.entity",
  "3 Module Car (Premade)": "3module_car_spawned.entity",
  "4 Module Car (Premade)": "4module_car_spawned.entity",
  "Attack Helicopter": "attackhelicopter.entity",
  "2 Module Car (Empty)": "car_chassis_2module.entity",
  "3 Module Car (Empty)": "car_chassis_3module.entity",
  "4 Module Car (Empty)": "car_chassis_4module.entity",
  "Hot Air Balloon": "hotairballoon",
  Kayak: "kayak",
  Minicopter: "minicopter.entity",
  Motorbike: "motorbike",
  "Motorbike (with Sidecar)": "motorbike_sidecar",
  "Pedal Bike": "pedalbike",
  "Pedal Trike": "pedaltrike",
  RHIB: "rhib",
  Rowboat: "rowboat",
  "Scrap Transport Helicopter": "scraptransporthelicopter",
  Horse: "testridablehorse",
};

/**
 * Vehicles that actually burn Low Grade Fuel to run, per standard documented
 * Rust game mechanics (not independently confirmed via a KOBA Bot-specific
 * WebRCON capture, unlike the shortnames themselves) - used by the Kit
 * Engine's Vehicle binding type to decide whether to even offer a fuel
 * amount setting. Kayak/Rowboat/Pedal Bike/Pedal Trike/Horse have no fuel
 * tank at all.
 */
const FUEL_VEHICLE_SHORTNAMES = new Set([
  "2module_car_spawned.entity",
  "3module_car_spawned.entity",
  "4module_car_spawned.entity",
  "attackhelicopter.entity",
  "car_chassis_2module.entity",
  "car_chassis_3module.entity",
  "car_chassis_4module.entity",
  "hotairballoon",
  "minicopter.entity",
  "motorbike",
  "motorbike_sidecar",
  "rhib",
  "scraptransporthelicopter",
]);

module.exports = { ALL_VEHICLE_SHORTNAMES, FUEL_VEHICLE_SHORTNAMES };

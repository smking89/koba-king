"use strict";

/**
 * Coordinate-Spawned Item Events (Pyramid/Bridge/House) - per
 * KOBABOT_FULL_ROADMAP.md's Phase 5. A "shape" is NOT a special RCON
 * capability of its own: `entity.spawnatpos` is confirmed RCON-reachable
 * for ONE entity at a time only (docs/RUST_CONSOLE_RCON_REFERENCE.md's
 * Section 4 flags this as "the single most technically uncertain item in
 * the whole wishlist" - no documentation basis for how rapidly-stacked
 * entities behave on a live server: collision, stability, build-volume
 * checks, RCON rate limits are all unverified). This module just computes a
 * plain geometric offset list per shape and fires `entity.spawnatpos` in a
 * sequential loop - same best-effort, log-and-continue shape as
 * utils/autoKitEngine.js's deliverVehicle loop, so one failed spawn in the
 * middle of a pyramid doesn't abort the rest of it.
 *
 * Axis convention: X/Z are the horizontal ground plane and Y is vertical
 * height, matching this codebase's own established convention
 * (rcon/parsers.js's isInsideGrid(x, z, bounds) already treats X/Z as the
 * ground-plane pair) - so "stacked upward" in the Pyramid shape means
 * offsetting Y, never Z.
 */

const { getRcon } = require("../rcon/manager");
const { ALL_CRATE_SHORTNAMES } = require("../config/crateShortnames");

/**
 * Loot-crate shortnames to anchor a shape event around - a curated subset of
 * config/crateShortnames.js's ALL_CRATE_SHORTNAMES (itself "Confirmed
 * 2026-09-01 from the user's own in-game item/entity reference list").
 * Deliberately excludes barrels/ammo/fuel/food/basic crates from that list
 * (too low-value to anchor a rush-worthy mini-event around) and does NOT
 * include "woodbox_deployed", which was on the roadmap's own candidate list
 * but has never been confirmed anywhere in this codebase (not in
 * ALL_CRATE_SHORTNAMES, not in docs/RUST_CONSOLE_RCON_REFERENCE.md) - left
 * out rather than guessed.
 */
const SHAPE_EVENT_ENTITIES = {
  "Cube Crate": "crate_normal",
  "Cube Crate 2": "crate_normal_2",
  "Cube Crate (Food)": "crate_normal_2_food",
  "Elite Crate": "crate_elite",
  "Code Locked Hackable Crate": "codelockedhackablecrate",
  "Heli Crate": "heli_crate",
  "Bradley Crate": "bradley_crate",
};

function isValidShapeEntity(shortname) {
  return Object.values(SHAPE_EVENT_ENTITIES).includes(shortname) || Object.values(ALL_CRATE_SHORTNAMES).includes(shortname);
}

function displayNameForEntity(shortname) {
  const match = Object.entries(SHAPE_EVENT_ENTITIES).find(([, v]) => v === shortname) || Object.entries(ALL_CRATE_SHORTNAMES).find(([, v]) => v === shortname);
  return match ? match[0] : shortname;
}

/**
 * Concentric shrinking-radius rings of entities stacked upward in Y, capped
 * with a single apex entity - the "decreasing square/circle radius stacked
 * upward" shape from the roadmap's own wording. Ring point-count shrinks
 * alongside the radius so the rings stay visually proportioned rather than
 * bunching up near the top.
 */
function pyramidOffsets({ levels = 4, baseRadius = 6, baseSides = 8, levelHeight = 1.5 } = {}) {
  const offsets = [];
  for (let level = 0; level < levels; level++) {
    const shrink = 1 - level / levels; // 1 at the base ring, shrinking toward the apex
    const y = level * levelHeight;
    if (level === levels - 1) {
      offsets.push({ x: 0, y, z: 0 }); // apex - single entity caps the pyramid
      continue;
    }
    const radius = baseRadius * shrink;
    const sides = Math.max(4, Math.round(baseSides * shrink));
    for (let i = 0; i < sides; i++) {
      const angle = (2 * Math.PI * i) / sides;
      offsets.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius });
    }
  }
  return offsets;
}

/**
 * A straight line of entities along X, constant Y/Z - lowest geometric
 * complexity on purpose (per KOBABOT_FULL_ROADMAP.md's Phase 5 pilot note:
 * "The Bridge Event (linear chain, no vertical stacking, lowest geometric
 * complexity) as the feasibility proof before attempting the Pyramid").
 */
function bridgeOffsets({ count = 7, spacing = 3 } = {}) {
  const totalLength = (count - 1) * spacing;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    offsets.push({ x: i * spacing - totalLength / 2, y: 0, z: 0 });
  }
  return offsets;
}

/**
 * A rectangular perimeter of entities on a single Y level (a building
 * footprint/outline players can rush around) - deliberately kept to one
 * level/one room per the task's "keep this simple, no over-engineering"
 * instruction, rather than attempting multi-room interiors with no real
 * RCON basis for how placed entities would interact.
 */
function houseOffsets({ width = 8, depth = 6, spacing = 2 } = {}) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const stepsW = Math.max(1, Math.round(width / spacing));
  const stepsD = Math.max(1, Math.round(depth / spacing));
  const seen = new Set();
  const offsets = [];
  const add = (x, z) => {
    const key = `${x.toFixed(2)}:${z.toFixed(2)}`;
    if (seen.has(key)) return; // corners get visited from both edges that meet there - only place one entity
    seen.add(key);
    offsets.push({ x, y: 0, z });
  };
  for (let i = 0; i <= stepsW; i++) {
    const x = -halfW + (i * width) / stepsW;
    add(x, -halfD);
    add(x, halfD);
  }
  for (let i = 0; i <= stepsD; i++) {
    const z = -halfD + (i * depth) / stepsD;
    add(-halfW, z);
    add(halfW, z);
  }
  return offsets;
}

const SHAPE_BUILDERS = { pyramid: pyramidOffsets, bridge: bridgeOffsets, house: houseOffsets };
const SHAPE_NAMES = Object.keys(SHAPE_BUILDERS);

function shapeOffsets(shape, opts) {
  const builder = SHAPE_BUILDERS[shape];
  if (!builder) throw new Error(`Unknown shape "${shape}" - expected one of: ${SHAPE_NAMES.join(", ")}`);
  return builder(opts);
}

/**
 * Fires the actual RCON spawns for one shape event - sequential, best-effort
 * per entity (one failed entity.spawnatpos doesn't abort the rest). Returns
 * a summary the caller renders into the announcement embed; never throws
 * for individual spawn failures, only for an unknown shape/entity or an
 * unreachable RCON connection (both caller errors, not server behavior).
 */
async function spawnShapeEvent(guildId, { shape, entityKey, center, serverName, shapeOptions } = {}) {
  if (!isValidShapeEntity(entityKey)) throw new Error(`"${entityKey}" isn't a confirmed loot-crate shortname for shape events.`);
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
    throw new Error("A valid center {x,y,z} is required.");
  }

  const offsets = shapeOffsets(shape, shapeOptions);
  const rcon = await getRcon(guildId, serverName);

  let spawned = 0;
  const failures = [];
  for (const offset of offsets) {
    const x = (center.x + offset.x).toFixed(2);
    const y = (center.y + offset.y).toFixed(2);
    const z = (center.z + offset.z).toFixed(2);
    try {
      // entity.spawn is in-game-console-only with no position argument;
      // entity.spawnatpos is the documented RCON-capable coordinate-spawn
      // command (see docs/RUST_CONSOLE_RCON_REFERENCE.md and the already-
      // fixed bug this exact mismatch caused in utils/autoKitEngine.js).
      await rcon.send(`entity.spawnatpos "${entityKey}" "${x},${y},${z}"`);
      spawned++;
    } catch (err) {
      failures.push(err.message);
    }
  }

  return { attempted: offsets.length, spawned, failures };
}

module.exports = {
  SHAPE_NAMES,
  SHAPE_EVENT_ENTITIES,
  isValidShapeEntity,
  displayNameForEntity,
  pyramidOffsets,
  bridgeOffsets,
  houseOffsets,
  shapeOffsets,
  spawnShapeEvent,
};

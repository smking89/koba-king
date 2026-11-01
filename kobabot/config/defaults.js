/**
 * Central default configuration.
 * These values are seeded into the `config` table on first boot and can be
 * overridden live per-guild via /set-config (Feature 7) without a restart.
 * Code should always read live values through database/db.js:getConfig(),
 * never import this object directly at runtime.
 */
module.exports = {
  // --- RCON loop timing (ms unless noted) ---
  rcon_loop_interval: 15000, // how often global.playerlist --json is polled for zone capture

  // --- Zone capture (Feature 5) ---
  zone_capture_duration: 600000, // 10 min unchallenged hold required to award a part

  // --- Team scaling defaults (Feature 3) ---
  default_max_team_size: 72, // owner can lower this per-team; 4 collapses to Fireteam-only mode

  // --- Zone events (/create-event, /create-event-wizard, /auto-event-config) ---
  event_join_emoji: "🎯", // shown on the "Join Event" button - set via /event-config set-join-emoji

  // --- Lootbox claim delivery (/lootbox-config set-claim) ---
  lootbox_claim_delay_sec: 3, // pause before an item/kit/material actually lands in-game after Claim is pressed
  // FIXED (2026-09-07): was "🎁 {gamertag}, here - take this!" - the emoji
  // rendered as a garbled glyph in-game (RCE can't display emoji in chat,
  // see rcon.js's say()). This is in-game-only text (utils/lootboxPanel.js
  // never reuses it for the Discord claim embed), so no emoji belongs here
  // at all - rcon.js's say() also strips any emoji as a backstop in case an
  // admin re-adds one via /lootbox-config set-claim.
  lootbox_claim_message: "{gamertag}, here - take this!", // in-game chat line sent alongside delivery

  // --- Ticket archive auto-delete (/set-config ticket_archive_delete_minutes) ---
  ticket_archive_delete_minutes: 60, // an archived ticket channel is permanently deleted this many minutes after being archived; 0 disables auto-delete

  // --- Grid coordinate dictionary (hardcoded, edit per-map) ---
  // Every grid label KOBA Bot needs to reason about for monument capture
  // zones (Feature 5) resolves through this single map.
  grid_boundaries: {
    G11: { minX: -900, maxX: -800, minZ: 100, maxZ: 200 },
    G12: { minX: -900, maxX: -800, minZ: 0, maxZ: 100 },
    H11: { minX: -800, maxX: -700, minZ: 100, maxZ: 200 },
    H12: { minX: -800, maxX: -700, minZ: 0, maxZ: 100 },
  },

  // Which grid_boundaries labels count as monument capture zones for Feature 5.
  // (Team home-base grids can reuse other labels from grid_boundaries without
  // being contestable monument zones.)
  monument_capture_grids: ["G11", "G12", "H11", "H12"],
};

"use strict";

/**
 * Feature 7 - the subset of config/defaults.js keys that are plain integers
 * and safe to expose through /set-config. (grid_boundaries is a structured
 * object, not a single integer, and is deliberately not editable through
 * this command.)
 */
const SCALAR_CONFIG_KEYS = ["rcon_loop_interval", "zone_capture_duration", "default_max_team_size", "ticket_archive_delete_minutes"];

module.exports = { SCALAR_CONFIG_KEYS };

"use strict";

const db = require("../database/db");

/** Resolves an admin-chosen display name to its bound internal kit name - null if unregistered (caller decides whether to fall back to treating the input as a raw internal name). */
function resolveInternalKitName(guildId, displayName) {
  return db.getKit(guildId, displayName)?.internal_kit_name || null;
}

module.exports = { resolveInternalKitName };

"use strict";

/**
 * TEMPORARY diagnostic tool (2026-10-14) - logs every single raw WebRCON
 * broadcast line to its own file, unfiltered, so a live capture can
 * directly confirm (or rule out) unverified claims about what RCE's
 * broadcast stream actually contains (quickchat/gesture lines, damage
 * events, etc.) instead of relying on a relayed/possibly-mistyped paste.
 * Delete this file and its require in index.js once the capture is done -
 * not meant to run in production long-term (unbounded log growth).
 *
 * FIXED (2026-10-18): this used to log only `rawMessage.Message` - the
 * text content - discarding the rest of the JSON frame WebRCON actually
 * sends (base Rust WebRCON protocol includes a `Type` field, e.g. "Generic"
 * / "Chat", confirmed via the 2026-10-18 killfeed research pass). Every
 * prior "confirmed real capture" in this project (rcon/combatParser.js's
 * header, etc.) was done the same text-only way, so nobody has actually
 * checked whether a kill/damage event arrives under a distinct Type with
 * more structured data than the plain text line. Logging the full frame
 * (falling back to the old text-only line if rawMessage is already a bare
 * string, e.g. a non-JSON broadcast) settles that for real instead of
 * re-guessing it a third time.
 */

const fs = require("fs");
const path = require("path");
const { onGuildBroadcast } = require("../rcon/manager");

const LOG_PATH = path.join(__dirname, "..", "raw-broadcast-capture.log");

onGuildBroadcast((guildId, rawMessage, serverName) => {
  const payload = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage);
  const line = `[${new Date().toISOString()}] guild=${guildId}${serverName ? ` server=${serverName}` : ""} :: ${payload}\n`;
  fs.appendFile(LOG_PATH, line, () => {});
});

console.log("[KOBA Bot] raw-broadcast-capture logger active -> raw-broadcast-capture.log");

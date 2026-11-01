"use strict";

/**
 * Shared constants/helpers for the split /config-* commands (economy,
 * events, staff, misc) - extracted 2026-10-13 when the original single
 * /config command (14 subcommand groups) was found to exceed Discord's
 * 8000-byte per-command size cap. Kept as one shared module instead of
 * duplicated into each command file to avoid drift between copies.
 */

const { CronExpressionParser } = require("cron-parser");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { getRcon } = require("../rcon/manager");

const AUCTION_REWARD_TYPE_CHOICES = [
  { name: "Item (raw Rust item)", value: "item" },
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
  { name: "Material", value: "material" },
];
const AUCTION_MATERIAL_CHOICES = MATERIAL_FIELDS.map((f) => ({ name: MATERIAL_LABELS[f] || f, value: f }));

const GIFT_TYPE_CHOICES = [
  { name: "Welcome (new Discord member)", value: "welcome" },
  { name: "Hourly", value: "hourly" },
  { name: "Daily", value: "daily" },
  { name: "Weekly", value: "weekly" },
  { name: "Monthly", value: "monthly" },
  { name: "Yearly", value: "yearly" },
];
const GIFT_REWARD_TYPE_CHOICES = [
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
  { name: "Coins", value: "coins" },
];

const LEADERBOARD_PERIOD_CHOICES = [
  { name: "Daily", value: "daily" },
  { name: "Weekly", value: "weekly" },
  { name: "Monthly", value: "monthly" },
  { name: "Yearly", value: "yearly" },
];
const LEADERBOARD_REWARD_TYPE_CHOICES = [
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
];

/**
 * Best-effort kit existence check via RCON. Doesn't block saving if RCON is
 * offline or the server's `kit list` output format doesn't match what we
 * expect - it's a helpful warning, not a hard requirement, since an admin
 * should be able to configure this before their server is even connected.
 */
async function checkKitExists(guildId, kitName) {
  try {
    const rcon = await getRcon(guildId);
    const raw = await rcon.send("kit list");
    if (!raw.toLowerCase().includes(kitName.toLowerCase())) {
      return { checked: true, exists: false };
    }
    return { checked: true, exists: true };
  } catch {
    return { checked: false };
  }
}

/** Parses "MM/DD/YYYY HH:mm" (matching the spec's own admin-flow example format) in the server's local time - returns null (not a throw) on anything unparseable, so the command can show a clean error instead of a stack trace. */
function parseDateTime(value) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function nextAutoMessageFireDescription(config) {
  const since = config.last_sent_at || config.created_at;
  if (config.schedule_type === "cron") {
    try {
      const next = CronExpressionParser.parse(config.cron_expression, { currentDate: new Date(since) }).next().toDate();
      return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
    } catch {
      return "invalid cron expression";
    }
  }
  return `<t:${Math.floor((since + config.interval_seconds * 1000) / 1000)}:R>`;
}

module.exports = {
  AUCTION_REWARD_TYPE_CHOICES,
  AUCTION_MATERIAL_CHOICES,
  GIFT_TYPE_CHOICES,
  GIFT_REWARD_TYPE_CHOICES,
  LEADERBOARD_PERIOD_CHOICES,
  LEADERBOARD_REWARD_TYPE_CHOICES,
  checkKitExists,
  parseDateTime,
  nextAutoMessageFireDescription,
};

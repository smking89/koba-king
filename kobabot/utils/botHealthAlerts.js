"use strict";

/**
 * Feature: Bot Health automated monitoring (2026-10-15, consolidated same
 * day into a single channel per direct product spec). Posts heartbeat,
 * RCON, and error alerts all into "📡-dev-logs" (config/templates.js's
 * BOT_ADMIN_TEMPLATE "DEV & STAFF" category) - was 3 separate channels
 * (bot-status-logs/rcon-health/error-alerts) until the template redesign
 * replaced them with one "where automated logs...are dumped automatically
 * by the bot" channel. Scoped to the official/flagship guild only, same as
 * every other officialGuildOnly feature (utils/globalStatus.js's
 * runOfficialStatsTick) - this is monitoring for the bot itself, not a
 * per-customer-guild feature.
 */

const db = require("../database/db");
const { flagshipGuildId } = require("./premium");

let discordClient = null;

/** Called once from index.js after the client is ready, so the other functions here don't need a client passed through every call site. */
function registerClient(client) {
  discordClient = client;
}

async function postToHealthChannel(metaField, content) {
  if (!discordClient) return;
  const guildId = flagshipGuildId();
  if (!guildId) return;
  const meta = db.getGuildMeta(guildId);
  const channelId = meta?.[metaField];
  if (!channelId) return; // not provisioned yet - run /template repair on the official guild to create these channels
  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (channel?.isTextBased()) await channel.send(content);
  } catch (err) {
    // Deliberately swallowed - a health-alert delivery failure must never
    // crash the bot or cascade into triggering the error-alert channel
    // itself (that would be an infinite loop the moment error-alerts is
    // the thing that's unreachable).
    console.error(`[KOBA Bot] Health alert delivery failed (${metaField}):`, err.message);
  }
}

function postHeartbeat() {
  const hours = (process.uptime() / 3600).toFixed(1);
  return postToHealthChannel("dev_logs_channel_id", `✅ KOBA Bot heartbeat — online, uptime ${hours}h`);
}

function postRconAlert(message) {
  return postToHealthChannel("dev_logs_channel_id", message);
}

function postErrorAlert(message) {
  return postToHealthChannel("dev_logs_channel_id", message);
}

module.exports = { registerClient, postHeartbeat, postRconAlert, postErrorAlert };

"use strict";

/**
 * Auto-Message Scheduler (/auto-message-config) - fires admin-defined
 * recurring in-game broadcasts, independent of the built-in 15-min "ad"
 * broadcast in backgroundLoops.js. Each config is either a simple
 * minutes/seconds interval or a standard cron expression.
 */

const { CronExpressionParser } = require("cron-parser");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { colorize } = require("./messageStyle");

function isDue(config, now) {
  const since = config.last_sent_at || config.created_at;
  if (config.schedule_type === "cron") {
    try {
      const next = CronExpressionParser.parse(config.cron_expression, { currentDate: new Date(since) }).next().toDate();
      return next.getTime() <= now;
    } catch (err) {
      console.warn(`[KOBA Bot] Auto-message "${config.config_name}" has an invalid cron expression, skipping:`, err.message);
      return false;
    }
  }
  return now - since >= config.interval_seconds * 1000;
}

async function runAutoMessagesTick(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const configs = db.listEnabledAutoMessages(guild.id);
    if (!configs.length) continue;

    const due = configs.filter((c) => isDue(c, now));
    if (!due.length) continue;

    let rcon;
    try {
      rcon = await getRcon(guild.id);
    } catch (err) {
      console.warn(`[KOBA Bot] Auto-message RCON connection failed for guild ${guild.id}:`, err.message);
      continue; // server offline - retried next tick
    }

    for (const config of due) {
      try {
        await rcon.say(colorize(config.message_text, config.color_hex || "#00FF00", config.size_pt));
        db.markAutoMessageSent(config.id, now);
      } catch (err) {
        console.warn(`[KOBA Bot] Auto-message "${config.config_name}" send failed for guild ${guild.id}:`, err.message);
      }
    }
  }
}

module.exports = { runAutoMessagesTick };

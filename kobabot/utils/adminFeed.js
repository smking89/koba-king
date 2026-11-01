"use strict";

const db = require("../database/db");
const { baseEmbed, COLORS } = require("./embeds");

/**
 * Single audit-log entry point for the admin feed channel
 * (guild_meta.admin_feed_channel_id) - kit deliveries (manual, AutoKit,
 * referral rewards), entity spawns, and /rcon usage all funnel through here
 * so there's one consistent place to look for "who did what, to whom".
 * Best-effort: a missing/unconfigured channel just means no Discord post,
 * never an error surfaced to the caller.
 *
 * Dual-writes to database/schema.sql's activity_log (2026-09-14) - the
 * real backing data for the website's ServerDashboard activity console
 * (admin/dashboard.js's /api/server-dashboard). Every existing call site
 * automatically starts populating that feed with zero changes needed on
 * their end, same as before this only ever posted to Discord.
 */
async function logAdminAction(guild, { title, description, color } = {}) {
  db.logActivity(guild.id, title, description);
  try {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.admin_feed_channel_id) return;
    const channel = await guild.channels.fetch(meta.admin_feed_channel_id).catch(() => null);
    if (!channel) return;
    const embed = baseEmbed(color || COLORS.brand)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch {
    // best-effort only - never let audit logging break the action it's logging
  }
}

module.exports = { logAdminAction };

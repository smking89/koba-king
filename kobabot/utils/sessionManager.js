"use strict";

/**
 * Session lifecycle (spec sections 8-14) - a temporary competitive period
 * intended to align with Rust wipe cycles, but that's just the common case,
 * not enforced. Session Points themselves live in database/db.js
 * (session_points/session_point_events) and are awarded directly by
 * utils/progression.js's event consumers - this module owns starting/
 * ending Sessions and building the leaderboard/rank views, not awarding
 * individual Points.
 *
 * Only one 'active' Session per guild at a time (db.activateSession only
 * ever moves a 'scheduled' row to 'active' - nothing in this codebase ends
 * the PREVIOUS active session automatically, per explicit design: starting
 * a new Session while one is still active is a staff mistake to catch and
 * reject, not silently paper over by force-ending whatever was running).
 */

const { infoEmbed } = require("./embeds");
const db = require("../database/db");

function createSession(guildId, name, startsAt, endsAt) {
  if (startsAt && endsAt && startsAt >= endsAt) return { ok: false, reason: "Start time must be before end time." };
  const session = db.createSession(guildId, name, startsAt, endsAt);
  // Server Achievements (config/serverAchievements.js) - counts only if this
  // guild is also a registered directory listing; db.js's UPDATE is a no-op
  // otherwise, so this never needs a lookup/guard here.
  db.incrementDirectoryServerEventsHosted(guildId);
  return { ok: true, session };
}

function startSession(guildId, sessionId) {
  if (db.getActiveSession(guildId)) return { ok: false, reason: "A Session is already active - end it first." };
  const started = db.activateSession(guildId, sessionId);
  if (!started) return { ok: false, reason: "That Session isn't in a startable state (already active/ended, or doesn't exist)." };
  return { ok: true, session: db.getSession(guildId, sessionId) };
}

/** Ending a Session never deletes session_points - that IS the permanent Session History (spec section 10), it just stops being "current". */
function endSession(guildId, sessionId) {
  const ended = db.endSession(guildId, sessionId);
  if (!ended) return { ok: false, reason: "That Session isn't currently active." };
  // Only on a real active->ended transition (db.endSession's own WHERE
  // status='active' guard) - never on the "already ended" no-op path, so a
  // duplicate scheduler tick or double /session end can't double-count.
  db.incrementDirectoryServerEventsCompleted(guildId);
  return { ok: true, session: db.getSession(guildId, sessionId) };
}

/**
 * Background sweep (utils/backgroundLoops.js) - auto-starts a scheduled
 * Session once its start time arrives and auto-ends the active one once
 * its end time arrives. Both db.activateSession/db.endSession guard their
 * own transition with a WHERE status=... clause, so a duplicate tick
 * firing twice for the same Session is a guaranteed no-op the second time
 * (spec section 11: "recurring Sessions must be idempotent").
 */
function runSessionSchedulerTick() {
  const now = Date.now();
  for (const session of db.listDueScheduledSessions(now)) {
    if (!db.getActiveSession(session.guild_id)) db.activateSession(session.guild_id, session.id);
    // If another Session is already active for this guild, this scheduled
    // one is deliberately left alone (not force-started) - same "staff
    // mistake to catch, not silently override" reasoning as startSession.
  }
  for (const session of db.listDueActiveSessions(now)) {
    db.endSession(session.guild_id, session.id);
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function buildSessionStatusView(guildId) {
  const active = db.getActiveSession(guildId);
  if (!active) return { embeds: [infoEmbed("🏆 Session", "No Session is currently active.")] };
  const top = db.getSessionLeaderboard(guildId, active.id, 10);
  const lines = top.length ? top.map((row, i) => `**${i + 1}.** <@${row.discord_id}> - ${row.points} Points`).join("\n") : "_No Points recorded yet this Session._";
  return { embeds: [infoEmbed(`🏆 ${active.name} (Session #${active.id})`, lines)] };
}

function buildMyRankView(guildId, discordId) {
  const active = db.getActiveSession(guildId);
  if (!active) return { embeds: [infoEmbed("🏆 Session", "No Session is currently active.")] };
  const my = db.getSessionPoints(guildId, active.id, discordId);
  const rank = db.getSessionRank(guildId, active.id, discordId);
  const near = db.getPlayersNearRank(guildId, active.id, discordId, 2);
  const nearLines = near.map((row) => (row.discord_id === discordId ? `**<@${row.discord_id}> - ${row.points} Points (you)**` : `<@${row.discord_id}> - ${row.points} Points`)).join("\n");
  return {
    embeds: [infoEmbed(`🏆 ${active.name}`, `Your Points: **${my.points}**\nYour Rank: **#${rank}**\n\n**Near You**\n${nearLines || "_Not enough players yet._"}`)],
  };
}

function buildSessionHistoryView(guildId) {
  const history = db.listSessionHistory(guildId, 10);
  if (!history.length) return { embeds: [infoEmbed("📜 Session History", "No Sessions have ended yet.")] };
  const lines = history.map((s) => `**${s.name}** (#${s.id}) - ended ${new Date(s.ended_at).toLocaleDateString()}`).join("\n");
  return { embeds: [infoEmbed("📜 Session History", lines)] };
}

module.exports = {
  createSession,
  startSession,
  endSession,
  runSessionSchedulerTick,
  buildSessionStatusView,
  buildMyRankView,
  buildSessionHistoryView,
};

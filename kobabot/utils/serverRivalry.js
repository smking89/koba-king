"use strict";

/**
 * Server Rivalry - community vs community, distinct from a player
 * rivalship (spec: "Complete Rivalry, Server Rivalry & Official Leaderboard
 * System", sections 13-24).
 *
 * OWNERSHIP RULE (spec's own words: "mandatory security/business rule" -
 * this is the one piece of this whole spec that's actually load-bearing
 * enough to get its own dedicated function, checked from every single
 * creation path per section 17): a server owner must never be able to
 * rival their own two servers. "Owner" here is KOBA Bot's own authoritative
 * licensing identity (database/db.js's getGuildOwnerDiscordId - whoever
 * holds the active subscription/license claiming that guild), NOT
 * Discord's guild.ownerId - the spec explicitly anticipates one real
 * subscriber legitimately running multiple Discord servers under one
 * license account, which is exactly the same-owner case that must be
 * rejected regardless of which Discord account clicked which button.
 *
 * SCORING SOURCES this pass: game wins (utils/gameEvents.js), Challenge
 * wins (utils/challengeEngine.js's onChallengeSettled), Clan War wins
 * (commands/declare-war.js calls recordClanWarWin directly after
 * db.endWar - not an event bus, since ending a war is already a single,
 * rare call site with no other consumers to decouple from). Competition
 * placements are NOT wired (no Competition system exists anywhere in
 * KOBA Bot - same finding as every prior spec pass this session).
 */

const db = require("../database/db");
const { infoEmbed } = require("./embeds");
const { onGameCompleted } = require("./gameEvents");
const { onChallengeSettled } = require("./challengeEngine");

function otherGuild(rivalry, guildId) {
  return rivalry.guild_a === guildId ? rivalry.guild_b : rivalry.guild_a;
}

/**
 * The one function every creation/acceptance pathway MUST call before
 * doing anything else (spec section 15/17) - re-validated at BOTH
 * invitation and acceptance time (section 23: ownership can change in
 * between).
 */
function validateServerPair(guildIdX, guildIdY) {
  if (guildIdX === guildIdY) return { ok: false, reason: "A server can't rival itself." };
  const ownerX = db.getGuildOwnerDiscordId(guildIdX);
  const ownerY = db.getGuildOwnerDiscordId(guildIdY);
  if (!ownerX || !ownerY) return { ok: false, reason: "Both servers need an active KOBA Bot license to enter a Server Rivalry." };
  if (ownerX === ownerY) return { ok: false, reason: "These two servers are licensed to the same owner - a server can't rival its own owner's other server." };
  return { ok: true };
}

function createInvitation(guildIdX, guildIdY) {
  const validation = validateServerPair(guildIdX, guildIdY);
  if (!validation.ok) return validation;
  if (db.getActiveServerRivalryFor(guildIdX)) return { ok: false, reason: "Your server is already in a Server Rivalry (or has a pending invitation) - end it first." };
  if (db.getActiveServerRivalryFor(guildIdY)) return { ok: false, reason: "The other server is already in a Server Rivalry (or has a pending invitation)." };
  try {
    const rivalry = db.createServerRivalryInvitation(guildIdX, guildIdY, guildIdX);
    return { ok: true, rivalry };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** Re-runs full validation at acceptance (spec section 23/17 - ownership could have changed since the invitation was sent). */
function acceptInvitation(rivalryId) {
  const rivalry = db.getServerRivalryById(rivalryId);
  if (!rivalry || rivalry.status !== "pending") return { ok: false, reason: "This invitation is no longer pending." };

  const validation = validateServerPair(rivalry.guild_a, rivalry.guild_b);
  if (!validation.ok) {
    db.voidServerRivalry(rivalryId, validation.reason);
    return { ok: false, reason: `Can't accept - ${validation.reason}` };
  }

  const activated = db.activateServerRivalry(rivalryId);
  if (!activated) return { ok: false, reason: "This invitation is no longer pending." };
  return { ok: true, rivalry: db.getServerRivalryById(rivalryId) };
}

function declineInvitation(rivalryId) {
  const rivalry = db.getServerRivalryById(rivalryId);
  if (!rivalry || rivalry.status !== "pending") return { ok: false, reason: "This invitation is no longer pending." };
  db.declineServerRivalryInvitation(rivalryId);
  return { ok: true };
}

function endRivalry(guildId) {
  const rivalry = db.getActiveServerRivalryFor(guildId);
  if (!rivalry || rivalry.status !== "active") return { ok: false, reason: "Your server isn't in an active Server Rivalry." };
  db.endServerRivalry(rivalry.id);
  return { ok: true, rivalry: db.getServerRivalryById(rivalry.id) };
}

/**
 * Background sweep (utils/backgroundLoops.js) - spec section 24:
 * "same-owner servers must never remain eligible for active competition."
 * Ownership can change out-of-band (a /transfer, a license getting
 * revoked/reassigned) with no event to hook, so this periodically re-
 * checks every currently active/pending rivalry's ownership and voids
 * (not silently "ends" - a distinct, honest status) any pair that's
 * drifted into a same-owner or unlicensed conflict.
 */
function runOwnershipConflictSweep() {
  for (const rivalry of db.listActiveServerRivalries()) {
    const validation = validateServerPair(rivalry.guild_a, rivalry.guild_b);
    if (!validation.ok) db.voidServerRivalry(rivalry.id, validation.reason);
  }
}

// ---------------------------------------------------------------------------
// Scoring consumers
// ---------------------------------------------------------------------------

function creditRivalryScore(guildId, sourceType, sourceId, points) {
  if (points <= 0) return;
  const rivalry = db.getActiveServerRivalryFor(guildId);
  if (!rivalry || rivalry.status !== "active") return; // no active rivalry for this guild - nothing to credit, not an error
  db.recordServerRivalryEvent(rivalry.id, guildId, points, sourceType, sourceId);
}

onGameCompleted((event) => {
  if (!event.won) return;
  creditRivalryScore(event.guildId, "game_win", event.sourceId, db.getGuildMeta(event.guildId)?.server_rivalry_game_win_points ?? 1);
});

onChallengeSettled((event) => {
  creditRivalryScore(event.guildId, "challenge_win", `challenge:${event.challengeId}`, db.getGuildMeta(event.guildId)?.server_rivalry_challenge_win_points ?? 2);
});

/** Called directly from commands/declare-war.js right after db.endWar - not an event bus, see this file's header for why. */
function recordClanWarWin(guildId, warId, winnerTeam) {
  if (!winnerTeam) return; // a war can end with no declared winner - nothing to credit
  creditRivalryScore(guildId, "clan_war_win", `war:${warId}`, db.getGuildMeta(guildId)?.server_rivalry_clan_war_win_points ?? 10);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function buildScorecardView(guild, rivalry) {
  const stats = db.getServerRivalryStats(rivalry.id);
  const leaderName = stats.current_leader_guild ? (stats.current_leader_guild === rivalry.guild_a ? "Guild A" : "Guild B") : "Tied";
  const embed = infoEmbed(
    "🔥 Server Rivalry",
    [
      `Guild A vs Guild B`,
      "",
      `Current Leader: **${leaderName}**`,
      `Rivalry Score: **${stats.score_a}** — **${stats.score_b}**`,
      `Game Wins: **${stats.game_wins_a}** — **${stats.game_wins_b}**`,
      `Challenge Wins: **${stats.challenge_wins_a}** — **${stats.challenge_wins_b}**`,
      `Clan War Wins: **${stats.clan_war_wins_a}** — **${stats.clan_war_wins_b}**`,
    ].join("\n")
  );
  return { embeds: [embed] };
}

function buildHistoryView(guildId) {
  const history = db.listServerRivalryHistory(guildId, 10);
  if (!history.length) return { embeds: [infoEmbed("📜 Server Rivalry History", "No past rivalries yet.")] };
  const lines = history.map((r) => {
    const stats = db.getServerRivalryStats(r.id);
    const opponent = otherGuild(r, guildId);
    const outcome = r.status === "voided" ? `Voided (${r.void_reason})` : stats.current_leader_guild ? (stats.current_leader_guild === guildId ? "You won" : "You lost") : "Tied";
    return `vs **${opponent}** - ${stats.score_a} — ${stats.score_b} - ${outcome}`;
  });
  return { embeds: [infoEmbed("📜 Server Rivalry History", lines.join("\n"))] };
}

module.exports = {
  validateServerPair,
  createInvitation,
  acceptInvitation,
  declineInvitation,
  endRivalry,
  runOwnershipConflictSweep,
  recordClanWarWin,
  buildScorecardView,
  buildHistoryView,
  otherGuild,
};

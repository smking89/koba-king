"use strict";

/**
 * Rival System - persistent 1:1 competitive relationships between players
 * (spec: "COMPLETE RIVAL, CHALLENGE & COMPETITIVE RIVALRY SYSTEM").
 *
 * SCOPE NOTE for this pass (see utils/challengeEngine.js's header for the
 * full reasoning): Rank Challenges are still deferred, but level/rank
 * DISPLAY is now wired to the real Progression System (utils/progression.js,
 * database/db.js's player_progression/sessions tables) - a player who
 * hasn't earned any XP yet just shows Level 1 and no Rank (no active
 * Session), which is honest, not a placeholder.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { renderRivalVsGif } = require("./rivalVsImage");

function otherSide(rivalship, discordId) {
  return rivalship.player_a === discordId ? rivalship.player_b : rivalship.player_a;
}

function requestRow(rivalshipId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rival:accept:${rivalshipId}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rival:decline:${rivalshipId}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
  );
}

/** Sends a Rival request (spec section 6) - fails cleanly (not thrown to the caller as a raw DB error) if a rivalship for this pair already exists in any status, since reactivation is the correct path for an ended one, not a duplicate request. */
function sendRivalRequest(guildId, requestedBy, targetId) {
  if (requestedBy === targetId) return { ok: false, reason: "You can't become a Rival with yourself." };
  const existing = db.getRivalship(guildId, requestedBy, targetId);
  if (existing) {
    if (existing.status === "active") return { ok: false, reason: "You're already Rivals." };
    if (existing.status === "pending") return { ok: false, reason: "There's already a pending Rival request between you two." };
    // status === "ended" - reactivate instead of a second row (spec section 57).
    db.reactivateRivalship(existing.id);
    return { ok: true, rivalship: db.getRivalshipById(guildId, existing.id), reactivated: true };
  }
  const rivalship = db.createRivalshipRequest(guildId, requestedBy, requestedBy, targetId);
  return { ok: true, rivalship, reactivated: false };
}

function acceptRivalRequest(guildId, rivalshipId, acceptingUserId) {
  const rivalship = db.getRivalshipById(guildId, rivalshipId);
  if (!rivalship || rivalship.status !== "pending") return { ok: false, reason: "This Rival request isn't pending anymore." };
  if (rivalship.requested_by === acceptingUserId) return { ok: false, reason: "You can't accept your own Rival request." };
  if (otherSide(rivalship, rivalship.requested_by) !== acceptingUserId) return { ok: false, reason: "This request isn't yours to accept." };
  db.acceptRivalshipRequest(rivalshipId);
  return { ok: true, rivalship: db.getRivalshipById(guildId, rivalshipId) };
}

function declineRivalRequest(guildId, rivalshipId, decliningUserId) {
  const rivalship = db.getRivalshipById(guildId, rivalshipId);
  if (!rivalship || rivalship.status !== "pending") return { ok: false, reason: "This Rival request isn't pending anymore." };
  if (otherSide(rivalship, rivalship.requested_by) !== decliningUserId) return { ok: false, reason: "This request isn't yours to decline." };
  db.declineRivalshipRequest(rivalshipId);
  return { ok: true };
}

/** Ends an active rivalship - status only, history/stats preserved (spec section 56). Either side can end it. */
function removeRival(guildId, rivalshipId, requestingUserId) {
  const rivalship = db.getRivalshipById(guildId, rivalshipId);
  if (!rivalship || rivalship.status !== "active") return { ok: false, reason: "That Rival relationship isn't active." };
  if (rivalship.player_a !== requestingUserId && rivalship.player_b !== requestingUserId) return { ok: false, reason: "That isn't your Rival relationship." };
  db.endRivalship(rivalshipId);
  return { ok: true };
}

function listRivals(guildId, discordId) {
  return db.listRivalshipsForPlayer(guildId, discordId, "active");
}

/** Applies one settled Challenge's outcome to the rivalship it's attached to, if any - called by utils/challengeEngine.js at settlement, never anywhere else (keeps this the single place head-to-head stats get written). */
function recordChallengeResult(rivalshipId, matchFields) {
  db.recordRivalshipMatch(rivalshipId, matchFields);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function buildRivalRequestView(rivalship, requesterTag) {
  const embed = infoEmbed("⚔️ Rival Request", `**${requesterTag}** wants to make you a Rival.\n\nHead-to-Head: **0-0** (brand new rivalry)`);
  return { embeds: [embed], components: [requestRow(rivalship.id)] };
}

function buildRivalListView(guildId, discordId) {
  const rivals = listRivals(guildId, discordId);
  if (!rivals.length) return { embeds: [infoEmbed("⚔️ My Rivals", "You don't have any Rivals yet - use `/server rival add` to challenge someone to a rivalry.")] };
  const lines = rivals.map((r) => {
    const opponentId = otherSide(r, discordId);
    const stats = db.getRivalshipStats(r.id);
    const isA = r.player_a === discordId;
    const myWins = isA ? stats.wins_a : stats.wins_b;
    const theirWins = isA ? stats.wins_b : stats.wins_a;
    const streakNote = stats.current_streak_holder ? (stats.current_streak_holder === discordId ? ` - 🔥 ${stats.current_streak_count} win streak` : ` - 💀 on a ${stats.current_streak_count} loss streak`) : "";
    return `<@${opponentId}> - **${myWins}-${theirWins}**${streakNote}`;
  });
  return { embeds: [infoEmbed("⚔️ My Rivals", lines.join("\n"))] };
}

function buildRivalProfileView(guildId, discordId, rivalship) {
  const stats = db.getRivalshipStats(rivalship.id);
  const isA = rivalship.player_a === discordId;
  const myWins = isA ? stats.wins_a : stats.wins_b;
  const theirWins = isA ? stats.wins_b : stats.wins_a;
  const myBest = isA ? stats.best_streak_a : stats.best_streak_b;
  const theirBest = isA ? stats.best_streak_b : stats.best_streak_a;
  const opponentId = otherSide(rivalship, discordId);
  const streakLine = stats.current_streak_holder
    ? stats.current_streak_holder === discordId
      ? `You: 🔥 ${stats.current_streak_count} Win Streak`
      : `<@${opponentId}>: 🔥 ${stats.current_streak_count} Win Streak`
    : "No current streak";
  const lastMatch = stats.last_match_at
    ? stats.last_winner === discordId
      ? "You won the last match"
      : stats.last_winner
        ? "You lost the last match"
        : "The last match was a push"
    : "No matches played yet";

  const embed = infoEmbed(
    "⚔️ Rival Profile",
    [
      `**You** vs <@${opponentId}>`,
      "",
      `Head-to-Head: **${myWins}-${theirWins}**`,
      `Current Streak: ${streakLine}`,
      `Best Streak - You: **${myBest}** | Them: **${theirBest}**`,
      `Last Match: ${lastMatch}`,
    ].join("\n")
  );
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rival:remove:${rivalship.id}`).setLabel("Remove Rival").setStyle(ButtonStyle.Danger));
  return { embeds: [embed], components: [row] };
}

/**
 * Resolves one side's REAL Discord display name, clan (members.team_name +
 * teams.clan_tag), current level (utils/progression.js's player_progression
 * - defaults to Level 1 until that system has actually awarded this player
 * any XP), and Session rank (only if the guild has an active Session -
 * otherwise omitted rather than showing a fabricated "#1") into the shape
 * utils/rivalVsImage.js expects. Requires a live `guild` (Discord API call
 * to resolve the real username/nickname) - this is why the card-building
 * function below is async and lives here rather than in rivalVsImage.js
 * itself (which stays a pure renderer with zero Discord/DB dependencies).
 */
async function resolvePlayerCardData(guild, discordId, extra = {}) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  const displayName = member?.displayName || member?.user?.username || `Unknown (${discordId})`;

  const record = db.getMember(guild.id, discordId);
  const team = record?.team_name ? db.getTeam(guild.id, record.team_name) : null;
  const clanName = team ? team.clan_tag || team.team_name : null;

  const progression = db.getPlayerProgression(guild.id, discordId);
  const activeSession = db.getActiveSession(guild.id);
  const rank = activeSession ? db.getSessionRank(guild.id, activeSession.id, discordId) : null;

  return {
    username: displayName,
    clanName,
    level: progression.level,
    rank: rank ?? "-",
    streak: 0,
    pointsBonus: 0,
    ...extra,
  };
}

/**
 * Builds the animated Rival "VS" GIF card (utils/rivalVsImage.js) with real
 * Discord username, clan, level, and Session rank for both sides, plus
 * this SPECIFIC rivalry's own head-to-head streak (more meaningful here
 * than a generic game streak - this card is about these two players'
 * history with each other). Returns a ready-to-send payload (embeds/files)
 * - callers just spread it alongside whatever text embed they're already
 * building, same shape convention as every other view builder in this file.
 */
async function buildRivalVsCardAttachment(guild, rivalship, opts = {}) {
  const stats = db.getRivalshipStats(rivalship.id);

  const streakFor = (discordId) => (stats.current_streak_holder === discordId ? stats.current_streak_count : 0);

  const [playerA, playerB] = await Promise.all([
    resolvePlayerCardData(guild, rivalship.player_a, { streak: streakFor(rivalship.player_a), pointsBonus: opts.pointsBonusA || 0 }),
    resolvePlayerCardData(guild, rivalship.player_b, { streak: streakFor(rivalship.player_b), pointsBonus: opts.pointsBonusB || 0 }),
  ]);

  const gif = await renderRivalVsGif({ playerA, playerB });
  return { files: [new AttachmentBuilder(gif, { name: "rival-vs.gif" })] };
}

/**
 * Persistent Rivals panel (2026-09-16) - a posted, pinned embed in whatever
 * channel an owner points /panel-setup at (panel key "rivals"), so players
 * can find "My Rivals"/"Challenge a Rival" by clicking instead of needing
 * to already know the /rival command exists. Same find-or-repost-by-
 * stored-id pattern as utils/gamesPanel.js's deployGamesPanel.
 */
function buildRivalPanelView() {
  const embed = infoEmbed("⚔️ Rivals", "Challenge another player to a persistent 1v1 rivalry - every match tracked, head-to-head, forever.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rival:panel_list").setLabel("My Rivals").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rival:panel_challenge").setLabel("Challenge a Rival").setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

async function deployRivalPanel(channel) {
  const payload = buildRivalPanelView();
  const meta = db.getGuildMeta(channel.guild.id);
  if (meta?.rival_panel_message_id) {
    try {
      const existing = await channel.messages.fetch(meta.rival_panel_message_id);
      await existing.edit(payload);
      if (!existing.pinned) await existing.pin().catch(() => {});
      return existing;
    } catch {
      // message was deleted - fall through and repost
    }
  }
  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  db.upsertGuildMeta(channel.guild.id, { rival_panel_channel_id: channel.id, rival_panel_message_id: message.id });
  return message;
}

/** Handles rival:accept:<id> / rival:decline:<id> / rival:remove:<id> / the panel's panel_list/panel_challenge/panel_pick actions - every ownership-sensitive action is checked inside its own function above, so a click from anyone other than the intended recipient/relationship member fails with a clear reason rather than silently succeeding. */
async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];

  // Panel entry points - reply ephemeral (only the clicker sees it) rather
  // than update(), which would otherwise overwrite the shared pinned panel
  // message for everyone, same convention every other panel here uses.
  if (action === "panel_list") {
    await interaction.reply({ ...buildRivalListView(interaction.guildId, interaction.user.id), ephemeral: true });
    return;
  }
  if (action === "panel_challenge") {
    await interaction.reply({
      embeds: [infoEmbed("⚔️ Challenge a Rival", "Pick who you want to challenge.")],
      components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("rival:panel_pick").setPlaceholder("Choose a player…"))],
      ephemeral: true,
    });
    return;
  }
  if (action === "panel_pick") {
    const targetId = interaction.values[0];
    if (targetId === interaction.user.id) {
      await interaction.update({ embeds: [dangerEmbed("Not Allowed", "You can't rival yourself.")], components: [] });
      return;
    }
    const target = await interaction.client.users.fetch(targetId).catch(() => null);
    if (target?.bot) {
      await interaction.update({ embeds: [dangerEmbed("Not Allowed", "You can't rival a bot.")], components: [] });
      return;
    }
    const result = sendRivalRequest(interaction.guildId, interaction.user.id, targetId);
    if (!result.ok) {
      await interaction.update({ embeds: [dangerEmbed("Can't Send Request", result.reason)], components: [] });
      return;
    }
    if (result.reactivated) {
      await interaction.update({ embeds: [successEmbed("Rivalry Reactivated", `You and <@${targetId}> are Rivals again - your old head-to-head record is still intact.`)], components: [] });
      return;
    }
    const view = buildRivalRequestView(result.rivalship, interaction.user.username);
    await interaction.channel.send({ content: `<@${targetId}>`, ...view });
    await interaction.update({ embeds: [successEmbed("Request Sent", `Sent a Rival request to <@${targetId}>.`)], components: [] });
    return;
  }

  const rivalshipId = Number(parts[2]);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === "accept") {
    const result = acceptRivalRequest(guildId, rivalshipId, userId);
    if (!result.ok) {
      await interaction.reply({ embeds: [dangerEmbed("Can't Accept", result.reason)], ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    const card = await buildRivalVsCardAttachment(interaction.guild, result.rivalship);
    await interaction.editReply({
      embeds: [successEmbed("⚔️ Rivalry Accepted", `<@${result.rivalship.player_a}> and <@${result.rivalship.player_b}> are now Rivals!`)],
      files: card.files,
      components: [],
    });
    return;
  }
  if (action === "decline") {
    const result = declineRivalRequest(guildId, rivalshipId, userId);
    if (!result.ok) {
      await interaction.reply({ embeds: [dangerEmbed("Can't Decline", result.reason)], ephemeral: true });
      return;
    }
    await interaction.update({ embeds: [dangerEmbed("Request Declined", "This Rival request was declined.")], components: [] });
    return;
  }
  if (action === "remove") {
    const result = removeRival(guildId, rivalshipId, userId);
    if (!result.ok) {
      await interaction.reply({ embeds: [dangerEmbed("Can't Remove", result.reason)], ephemeral: true });
      return;
    }
    await interaction.update({ embeds: [successEmbed("Rival Removed", "This Rival relationship has ended - history is kept.")], components: [] });
    return;
  }
}

module.exports = {
  sendRivalRequest,
  acceptRivalRequest,
  declineRivalRequest,
  removeRival,
  listRivals,
  recordChallengeResult,
  buildRivalRequestView,
  buildRivalListView,
  buildRivalProfileView,
  buildRivalVsCardAttachment,
  otherSide,
  handleComponent,
  buildRivalPanelView,
  deployRivalPanel,
};

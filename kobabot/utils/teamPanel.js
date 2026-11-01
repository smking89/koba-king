"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require("discord.js");
const db = require("../database/db");
const DEFAULTS = require("../config/defaults");
const { hasLeadershipClearance, hasAdminClearance, getRequesterMembership } = require("./teamAuth");
const { nextRank, prevRank, allowedRanks, rankById } = require("../config/ranks");
const { getEffectiveRank } = require("./rankOverrides");
const { syncMemberRankRole, syncMemberFireteamRole } = require("./systemRoles");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { logAdminAction } = require("./adminFeed");
const { infoEmbed, successEmbed, dangerEmbed, warningEmbed } = require("./embeds");

const E9_TIER = rankById("E9").tier;

function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("teampanel:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

// A recruit invite is a social ask, not a time-critical one (unlike LFG's
// 1h window) - 24h gives someone a real chance to see the DM and respond.
const TEAM_INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function inviteAcceptRow(inviteId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`teampanel:invite_accept:${inviteId}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`teampanel:invite_decline:${inviteId}`).setLabel("❌ Decline").setStyle(ButtonStyle.Danger)
  );
}

/**
 * Shared by /team-invite and the Team Panel's own "Invite" button - neither
 * adds the target straight to the roster anymore. Creates a pending
 * team_invites row and DMs the target an Accept/Decline pair; only
 * db.addMember() (in handleInviteResponse below) actually seats them, and
 * only once they click Accept themselves. Returns a result object the
 * caller uses to word its own reply - callers differ (slash command vs.
 * component) but all have an interaction to reply/editReply on.
 */
async function sendTeamInvite(interaction, team, targetUser) {
  const existingPending = db.getPendingTeamInvite(interaction.guildId, targetUser.id);
  if (existingPending) return { ok: false, reason: "already_pending" };

  const invite = db.createTeamInvite(interaction.guildId, team.team_name, interaction.user.id, targetUser.id, "E1", Date.now() + TEAM_INVITE_EXPIRY_MS);

  const embed = infoEmbed(
    "🪖 Team Invite",
    `**${interaction.user.username}** invited you to join **${team.team_name}** in **${interaction.guild.name}** as **E1 - Recruit**.\n\nThis invite expires in 24 hours.`
  );

  try {
    await targetUser.send({ embeds: [embed], components: [inviteAcceptRow(invite.id)] });
    db.markTeamInviteDelivered(invite.id);
    return { ok: true, dmFailed: false };
  } catch {
    // Leave delivered_at null - runTeamInviteWebDeliveryTick below will keep
    // retrying the DM (e.g. they had DMs off at invite time but open them
    // later) until it succeeds or the invite expires, instead of this being
    // a dead end the inviter has to notice and manually redo.
    return { ok: true, dmFailed: true };
  }
}

/**
 * Delivers (or re-delivers) one invite's Accept/Decline DM purely from its
 * row + a live client - no interaction object needed, since this runs from
 * the background tick, not a slash command. Mirrors utils/lfgPanel.js's
 * deliverLfgPost in shape/error-reason style.
 */
async function deliverTeamInviteDM(client, invite) {
  const guild = client.guilds.cache.get(invite.guild_id) ?? (await client.guilds.fetch(invite.guild_id).catch(() => null));
  if (!guild) return { delivered: false, reason: "guild_unavailable" };

  const invitee = await client.users.fetch(invite.invitee_id).catch(() => null);
  if (!invitee) return { delivered: false, reason: "invitee_unavailable" };

  const inviter = await client.users.fetch(invite.inviter_id).catch(() => null);
  const embed = infoEmbed(
    "🪖 Team Invite",
    `**${inviter ? inviter.tag : "Someone"}** invited you to join **${invite.team_name}** in **${guild.name}** as **E1 - Recruit**.\n\nThis invite expires in 24 hours.`
  );

  try {
    await invitee.send({ embeds: [embed], components: [inviteAcceptRow(invite.id)] });
    return { delivered: true };
  } catch {
    return { delivered: false, reason: "dm_failed" };
  }
}

/** Background-loop tick: delivers any team_invites row whose DM hasn't gone out yet - in practice this only ever catches website-created invites (POST /dashboard/api/team/invite) and rare failed-DM retries from the Discord path above. Cheap DB scan, safe to run often. */
async function runTeamInviteWebDeliveryTick(client) {
  for (const invite of db.listPendingTeamInviteDeliveries()) {
    const result = await deliverTeamInviteDM(client, invite).catch((err) => {
      console.error(`[KOBA Bot] Team invite delivery failed for invite ${invite.id}:`, err);
      return { delivered: false };
    });
    if (result.delivered) db.markTeamInviteDelivered(invite.id);
  }
}

/**
 * Background-loop tick: the Discord-role counterpart to
 * runTeamInviteWebDeliveryTick above - admin/dashboard.js's /api/team
 * promote/demote/fireteam routes update this member's rank_id/fireteam_role
 * columns instantly (that's the real source of truth), but only this
 * process has a live Discord client to push the matching role change, so a
 * website-side action just queues a sync request here instead of leaving
 * Discord's role permanently stale.
 */
async function runPendingRankSyncTick(client) {
  for (const job of db.listPendingRankSyncs()) {
    try {
      const guild = client.guilds.cache.get(job.guild_id) ?? (await client.guilds.fetch(job.guild_id).catch(() => null));
      const member = db.getMember(job.guild_id, job.discord_id);
      if (guild && member) {
        await syncMemberRankRole(guild, job.discord_id, member.rank_id);
        if (member.fireteam_role) await syncMemberFireteamRole(guild, job.discord_id, member.fireteam_role);
      }
    } catch (err) {
      console.error(`[KOBA Bot] Rank sync failed for ${job.discord_id} in ${job.guild_id}:`, err);
    }
    db.clearRankSync(job.id);
  }
}

/** Accept/Decline button clicked on the invite DM - guildId comes from the invite row itself, never interaction.guildId (that's null in a DM). */
async function handleInviteResponse(interaction, inviteId, accepted) {
  await interaction.deferUpdate();

  const invite = db.getTeamInvite(inviteId);
  if (!invite || invite.status !== "pending") {
    await interaction.editReply({ embeds: [dangerEmbed("No Longer Valid", "This invite has already been responded to, or no longer exists.")], components: [] });
    return;
  }
  if (invite.invitee_id !== interaction.user.id) {
    await interaction.editReply({ content: "This invite isn't addressed to you.", embeds: [], components: [] });
    return;
  }
  if (Date.now() > invite.expires_at) {
    db.setTeamInviteStatus(inviteId, "expired");
    await interaction.editReply({ embeds: [dangerEmbed("Invite Expired", "This invite expired - ask them to send you a new one.")], components: [] });
    return;
  }

  const guild = await interaction.client.guilds.fetch(invite.guild_id).catch(() => null);
  const guildName = guild?.name || "that server";

  if (!accepted) {
    db.setTeamInviteStatus(inviteId, "declined");
    await interaction.editReply({ embeds: [dangerEmbed("Invite Declined", `You declined the invite to **${invite.team_name}**.`)], components: [] });
    const inviter = await interaction.client.users.fetch(invite.inviter_id).catch(() => null);
    if (inviter) await inviter.send({ embeds: [dangerEmbed("Invite Declined", `**${interaction.user.username}** declined your invite to **${invite.team_name}** in **${guildName}**.`)] }).catch(() => {});
    return;
  }

  // Re-check roster state at accept time, not just at invite time - either
  // could have changed in the 24h window (they joined elsewhere, the team
  // filled up, the team was disbanded).
  const existing = db.getMember(invite.guild_id, interaction.user.id);
  if (existing) {
    db.setTeamInviteStatus(inviteId, "declined");
    await interaction.editReply({ embeds: [dangerEmbed("Already Rostered", `You're already on **${existing.team_name}** in **${guildName}**.`)], components: [] });
    return;
  }
  const team = db.getTeam(invite.guild_id, invite.team_name);
  if (!team) {
    db.setTeamInviteStatus(inviteId, "declined");
    await interaction.editReply({ embeds: [dangerEmbed("Team Gone", `**${invite.team_name}** no longer exists.`)], components: [] });
    return;
  }
  const roster = db.listTeamMembers(invite.guild_id, invite.team_name);
  if (roster.length >= team.max_team_size) {
    db.setTeamInviteStatus(inviteId, "declined");
    await interaction.editReply({ embeds: [dangerEmbed("Roster Full", `**${invite.team_name}** is already at its max size of ${team.max_team_size}.`)], components: [] });
    return;
  }

  db.addMember(invite.guild_id, interaction.user.id, invite.team_name, invite.rank_id);
  db.setTeamInviteStatus(inviteId, "accepted");
  await interaction.editReply({ embeds: [successEmbed("Welcome Aboard", `You've joined **${invite.team_name}** in **${guildName}** as **E1 - Recruit**.`)], components: [] });

  const inviter = await interaction.client.users.fetch(invite.inviter_id).catch(() => null);
  if (inviter) await inviter.send({ embeds: [successEmbed("Invite Accepted", `**${interaction.user.username}** accepted your invite to **${invite.team_name}** in **${guildName}**.`)] }).catch(() => {});
}

function buildHub(interaction) {
  const requester = getRequesterMembership(interaction);

  if (!requester) {
    return {
      embeds: [infoEmbed("🪖 Team Panel", "You aren't on a team yet.")],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("teampanel:create").setLabel("➕ Create Team").setStyle(ButtonStyle.Success))],
    };
  }

  const team = db.getTeam(interaction.guildId, requester.team_name);
  const roster = db.listTeamMembers(interaction.guildId, requester.team_name);
  const effective = getEffectiveRank(interaction.guildId, requester.team_name, requester.rank_id);

  const embed = infoEmbed(
    "🪖 Team Panel",
    `**Team:** ${requester.team_name}\n**Your Rank:** ${requester.rank_id} - ${effective.name}\n**Roster:** ${roster.length}/${team.max_team_size}`
  );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("teampanel:invite").setLabel("➕ Invite").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("teampanel:kick").setLabel("🗑️ Kick").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("teampanel:promote").setLabel("⬆️ Promote").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("teampanel:demote").setLabel("⬇️ Demote").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("teampanel:trade_materials").setLabel("🔄 Trade Materials").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("teampanel:disband").setLabel("💥 Disband Team").setStyle(ButtonStyle.Danger)
    ),
  ];

  return { embeds: [embed], components: rows };
}

/** Only the team's own Sergeant Major (E9) - or a Discord admin - can move materials out of the team pool, same clearance bar as Disband. */
function isOwnerOrAdmin(interaction, requester) {
  const rank = requester ? rankById(requester.rank_id) : null;
  return (rank && rank.tier >= E9_TIER) || hasAdminClearance(interaction);
}

function userSelectStep(customId, placeholder, title) {
  return {
    embeds: [infoEmbed(title, "Pick a member.")],
    components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)), backRow()],
  };
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  // Entry point from the persistent, shared #team-management channel panel -
  // reply ephemeral (only the clicker sees it) rather than update(), which
  // would otherwise overwrite the shared pinned panel message for everyone.
  if (id === "teampanel:open") {
    await interaction.reply({ ...buildHub(interaction), ephemeral: true });
    return;
  }

  if (id === "teampanel:back") {
    await interaction.update(buildHub(interaction));
    return;
  }

  if (id === "teampanel:create") {
    const modal = new ModalBuilder().setCustomId("teampanel:create_modal").setTitle("Create A Team");
    const nameInput = new TextInputBuilder().setCustomId("team_name").setLabel("Exact team/clan name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
    const sizeInput = new TextInputBuilder()
      .setCustomId("max_team_size")
      .setLabel(`Max roster size (blank = ${DEFAULTS.default_max_team_size})`.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(4);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(sizeInput));
    await interaction.showModal(modal);
    return;
  }

  if (id === "teampanel:invite") {
    const requester = getRequesterMembership(interaction);
    if (!hasLeadershipClearance(interaction, requester)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher to invite members.")], ephemeral: true });
      return;
    }
    await interaction.update(userSelectStep("teampanel:invite_pick", "Who to invite", "Invite A Member"));
    return;
  }

  if (id === "teampanel:invite_pick") {
    await interaction.deferUpdate();
    const requester = getRequesterMembership(interaction);
    const targetId = interaction.values[0];

    const existing = db.getMember(interaction.guildId, targetId);
    if (existing) {
      await interaction.editReply({ embeds: [dangerEmbed("Already Rostered", `<@${targetId}> is already on **${existing.team_name}**.`)], components: [backRow()] });
      return;
    }
    const team = db.getTeam(interaction.guildId, requester.team_name);
    const roster = db.listTeamMembers(interaction.guildId, requester.team_name);
    if (roster.length >= team.max_team_size) {
      await interaction.editReply({ embeds: [dangerEmbed("Roster Full", `**${team.team_name}** is already at its max size of ${team.max_team_size}.`)], components: [backRow()] });
      return;
    }

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      await interaction.editReply({ embeds: [dangerEmbed("User Not Found", "Couldn't resolve that user.")], components: [backRow()] });
      return;
    }
    const result = await sendTeamInvite(interaction, team, targetUser);
    if (!result.ok) {
      await interaction.editReply({ embeds: [dangerEmbed("Already Invited", `<@${targetId}> already has a pending invite to this server.`)], components: [backRow()] });
      return;
    }
    await interaction.editReply({
      embeds: [
        result.dmFailed
          ? dangerEmbed("Couldn't DM Them", `The invite was created, but <@${targetId}> has DMs disabled - ask them to enable DMs from server members and try again.`)
          : successEmbed("Invite Sent", `<@${targetId}> has been DMed an invite to **${team.team_name}** - waiting for them to respond.`),
      ],
      components: [backRow()],
    });
    return;
  }

  if (id.startsWith("teampanel:invite_accept:") || id.startsWith("teampanel:invite_decline:")) {
    const [, action, inviteIdRaw] = id.split(":");
    await handleInviteResponse(interaction, Number(inviteIdRaw), action === "invite_accept");
    return;
  }

  if (id === "teampanel:kick") {
    const requester = getRequesterMembership(interaction);
    if (!hasLeadershipClearance(interaction, requester)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher to kick members.")], ephemeral: true });
      return;
    }
    await interaction.update(userSelectStep("teampanel:kick_pick", "Who to kick", "Kick A Member"));
    return;
  }

  if (id === "teampanel:kick_pick") {
    await interaction.deferUpdate();
    const requester = getRequesterMembership(interaction);
    const targetId = interaction.values[0];
    const targetMember = db.getMember(interaction.guildId, targetId);

    if (!targetMember || targetMember.team_name !== requester.team_name) {
      await interaction.editReply({ embeds: [dangerEmbed("Not On Your Team", `<@${targetId}> isn't registered on **${requester.team_name}**.`)], components: [backRow()] });
      return;
    }
    if (targetId === interaction.user.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Can't Kick Yourself", "Have another leader remove you, or use Disband to disband the whole team.")], components: [backRow()] });
      return;
    }
    db.removeMember(interaction.guildId, targetId);
    await interaction.editReply({ embeds: [successEmbed("Removed", `<@${targetId}> has been dropped from **${requester.team_name}**'s roster.`)], components: [backRow()] });
    return;
  }

  if (id === "teampanel:promote" || id === "teampanel:demote") {
    const requester = getRequesterMembership(interaction);
    if (!hasLeadershipClearance(interaction, requester)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", `You need Corporal (Fireteam Leader) clearance or higher to ${id === "teampanel:promote" ? "promote" : "demote"} members.`)], ephemeral: true });
      return;
    }
    await interaction.update(userSelectStep(`teampanel:${id === "teampanel:promote" ? "promote" : "demote"}_pick`, "Who", id === "teampanel:promote" ? "Promote A Member" : "Demote A Member"));
    return;
  }

  if (id === "teampanel:promote_pick" || id === "teampanel:demote_pick") {
    await interaction.deferUpdate();
    const isPromote = id === "teampanel:promote_pick";
    const requester = getRequesterMembership(interaction);
    const targetId = interaction.values[0];
    const targetMember = db.getMember(interaction.guildId, targetId);

    if (!targetMember || targetMember.team_name !== requester.team_name) {
      await interaction.editReply({ embeds: [dangerEmbed("Not On Your Team", `<@${targetId}> isn't registered on **${requester.team_name}**.`)], components: [backRow()] });
      return;
    }

    const changed = isPromote ? nextRank(targetMember.rank_id) : prevRank(targetMember.rank_id);
    if (!changed) {
      await interaction.editReply({ embeds: [warningEmbed(isPromote ? "Top Rank Reached" : "Lowest Rank Reached", `<@${targetId}> is already at ${isPromote ? "the highest rank tier" : "E1 - Recruit"}.`)], components: [backRow()] });
      return;
    }

    if (isPromote) {
      const team = db.getTeam(interaction.guildId, requester.team_name);
      const allowed = allowedRanks(team.max_team_size).map((r) => r.id);
      if (!allowed.includes(changed.id)) {
        const effective = getEffectiveRank(interaction.guildId, requester.team_name, changed.id);
        await interaction.editReply({
          embeds: [warningEmbed("Rank Locked By Roster Size", `**${changed.id} - ${effective.name}** requires a larger max roster than **${team.team_name}**'s current cap of ${team.max_team_size}.`)],
          components: [backRow()],
        });
        return;
      }
    }

    db.setMemberRank(interaction.guildId, targetId, changed.id);
    await syncMemberRankRole(interaction.guild, targetId, changed.id);
    const effective = getEffectiveRank(interaction.guildId, requester.team_name, changed.id);
    const embed = successEmbed(isPromote ? "Promoted" : "Demoted", `<@${targetId}> is now **${changed.id} - ${effective.name}**.`);
    if (effective.badgeUrl) embed.setThumbnail(effective.badgeUrl);
    await interaction.editReply({ embeds: [embed], components: [backRow()] });
    return;
  }

  if (id === "teampanel:disband") {
    const requester = getRequesterMembership(interaction);
    const requesterRank = requester ? rankById(requester.rank_id) : null;
    const isTopRank = requesterRank && requesterRank.tier >= E9_TIER;

    if (!requester) {
      await interaction.reply({ embeds: [dangerEmbed("Not On A Team", "You aren't registered to a team.")], ephemeral: true });
      return;
    }
    if (!isTopRank && !hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "Only the team's Sergeant Major (E9) or a Discord admin can disband a team.")], ephemeral: true });
      return;
    }

    const roster = db.listTeamMembers(interaction.guildId, requester.team_name);
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("teampanel:disband_confirm").setLabel(`Yes, disband ${requester.team_name}`).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("teampanel:back").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [
        warningEmbed(
          "This Deletes The Team",
          `Disbanding **${requester.team_name}** permanently removes all **${roster.length}** roster member(s), cancels any active crafting queue, and clears stockpiled materials. This cannot be undone.`
        ),
      ],
      components: [confirmRow],
    });
    return;
  }

  if (id === "teampanel:disband_confirm") {
    const requester = getRequesterMembership(interaction);
    if (!requester) {
      await interaction.update({ embeds: [dangerEmbed("Already Gone", "That team no longer exists.")], components: [] });
      return;
    }
    db.deleteTeam(interaction.guildId, requester.team_name);
    await interaction.update({ embeds: [successEmbed("Team Disbanded", `**${requester.team_name}** has been permanently disbanded.`)], components: [] });
    return;
  }

  if (id === "teampanel:trade_materials") {
    const requester = getRequesterMembership(interaction);
    if (!isOwnerOrAdmin(interaction, requester)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "Only your team's Sergeant Major (E9) or a Discord admin can trade materials to another team.")], ephemeral: true });
      return;
    }
    const otherTeams = db.listTeams(interaction.guildId).filter((t) => t.team_name !== requester.team_name);
    if (!otherTeams.length) {
      await interaction.update({ embeds: [infoEmbed("No Other Teams", "There's no other team on this server to trade with yet.")], components: [backRow()] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("teampanel:trade_pick_team")
      .setPlaceholder("Choose the receiving team")
      .addOptions(otherTeams.slice(0, 25).map((t) => ({ label: t.team_name.slice(0, 100), value: t.team_name })));
    await interaction.update({ embeds: [infoEmbed("Trade Materials", "Pick which team receives materials from yours.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "teampanel:trade_pick_team") {
    const targetTeam = interaction.values[0];
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`teampanel:trade_pick_material:${targetTeam}`)
      .setPlaceholder("Choose the material")
      .addOptions(MATERIAL_FIELDS.map((f) => ({ label: MATERIAL_LABELS[f], value: f })));
    await interaction.update({ embeds: [infoEmbed("Trade Materials", `Sending to **${targetTeam}** - pick the material.`)], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id.startsWith("teampanel:trade_pick_material:")) {
    const targetTeam = id.split(":")[2];
    const material = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`teampanel:trade_qty_modal:${targetTeam}:${material}`).setTitle(`Send ${MATERIAL_LABELS[material]}`.slice(0, 45));
    const qtyInput = new TextInputBuilder().setCustomId("qty").setLabel("How many?").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
    modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
    await interaction.showModal(modal);
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId.startsWith("teampanel:trade_qty_modal:")) {
    await interaction.deferUpdate();
    const [, , targetTeam, material] = interaction.customId.split(":");
    const qty = parseInt(interaction.fields.getTextInputValue("qty"), 10);

    if (!Number.isInteger(qty) || qty < 1) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Quantity", "Enter a whole number, 1 or more.")], components: [backRow()] });
      return;
    }

    const requester = getRequesterMembership(interaction);
    if (!isOwnerOrAdmin(interaction, requester)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "Only your team's Sergeant Major (E9) or a Discord admin can trade materials.")], components: [backRow()] });
      return;
    }

    const sourceTeam = db.getTeam(interaction.guildId, requester.team_name);
    if ((sourceTeam[material] || 0) < qty) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Enough Stock", `**${requester.team_name}** only has **${sourceTeam[material] || 0}** ${MATERIAL_LABELS[material]}.`)], components: [backRow()] });
      return;
    }
    if (!db.getTeam(interaction.guildId, targetTeam)) {
      await interaction.editReply({ embeds: [dangerEmbed("Team Gone", `**${targetTeam}** no longer exists.`)], components: [backRow()] });
      return;
    }

    db.adjustTeamMaterials(interaction.guildId, requester.team_name, { [material]: -qty });
    db.adjustTeamMaterials(interaction.guildId, targetTeam, { [material]: qty });

    await logAdminAction(interaction.guild, {
      title: "Materials Traded",
      description: `**Material:** ${MATERIAL_LABELS[material]} ×${qty}\n**From:** ${requester.team_name}\n**To:** ${targetTeam}\n**By:** ${interaction.user.username}`,
    });
    await interaction.editReply({ embeds: [successEmbed("Materials Sent", `Sent **${qty}x ${MATERIAL_LABELS[material]}** from **${requester.team_name}** to **${targetTeam}**.`)], components: [backRow()] });
    return;
  }

  if (interaction.customId !== "teampanel:create_modal") return;

  await interaction.deferUpdate();
  const teamName = interaction.fields.getTextInputValue("team_name").trim();
  const sizeRaw = interaction.fields.getTextInputValue("max_team_size").trim();
  const maxTeamSize = sizeRaw ? parseInt(sizeRaw, 10) : DEFAULTS.default_max_team_size;

  if (sizeRaw && (!Number.isInteger(maxTeamSize) || maxTeamSize < 4)) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Size", "Max roster size must be a whole number, 4 or more.")], components: [backRow()] });
    return;
  }
  if (db.getTeam(interaction.guildId, teamName)) {
    await interaction.editReply({ embeds: [dangerEmbed("Team Exists", `A team named **${teamName}** already exists.`)], components: [backRow()] });
    return;
  }
  if (db.getMember(interaction.guildId, interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Rostered", "You're already on a team.")], components: [backRow()] });
    return;
  }

  db.createTeam(interaction.guildId, teamName, maxTeamSize);
  const founderRank = maxTeamSize >= 72 ? "E9" : maxTeamSize >= 36 ? "E6" : maxTeamSize >= 12 ? "E5" : "E4-CPL";
  db.addMember(interaction.guildId, interaction.user.id, teamName, founderRank);

  await interaction.editReply({ embeds: [successEmbed("Team Created", `**${teamName}** is live with a max roster of **${maxTeamSize}**.\nYou've been registered as **${founderRank}**.`)], components: [backRow()] });
}

module.exports = { buildHub, handleComponent, handleModal, sendTeamInvite, handleInviteResponse, runTeamInviteWebDeliveryTick, runPendingRankSyncTick };

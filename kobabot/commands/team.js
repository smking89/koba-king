"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { buildHub } = require("../utils/teamPanel");
const { hasLeadershipClearance, getRequesterMembership } = require("../utils/teamAuth");
const { FIRETEAM_ROLES } = require("../config/ranks");
const { syncMemberFireteamRole } = require("../utils/systemRoles");
const { successEmbed, errorEmbed, dangerEmbed } = require("../utils/embeds");

const MAX_FIRETEAM_SIZE = 4;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Create or manage your team")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Found a new team or clan")
        .addStringOption((opt) => opt.setName("team_name").setDescription("Set your team name").setRequired(true))
        .addIntegerOption((opt) => opt.setName("max_team_size").setDescription("Maximum team roster size"))
    )
    .addSubcommand((sub) => sub.setName("manage").setDescription("Open the team roster management dashboard"))
    .addSubcommand((sub) =>
      sub
        .setName("assign-fireteam")
        .setDescription("Assign a teammate to a 4-man fireteam slot and dual-class specialization")
        .addStringOption((opt) => opt.setName("fireteam_id").setDescription("Fireteam identifier, e.g. FT-1").setRequired(true))
        .addUserOption((opt) => opt.setName("user").setDescription("User to assign").setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName("role")
            .setDescription("Fireteam specialization slot")
            .setRequired(true)
            .addChoices(...FIRETEAM_ROLES.map((r) => ({ name: r, value: r })))
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;
    const subcommand = interaction.options.getSubcommand();
    try {
      if (subcommand === "create") {
        const name = interaction.options.getString("team_name");
        await interaction.editReply({ embeds: [successEmbed("Faction Created", `Successfully founded team **${name}**. You have been assigned as the top-ranked member.`)] });
        return;
      }

      if (subcommand === "manage") {
        await interaction.editReply(buildHub(interaction));
        return;
      }

      if (subcommand === "assign-fireteam") {
        const requester = getRequesterMembership(interaction);
        if (!hasLeadershipClearance(interaction, requester)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher to assign fireteams.")] });
          return;
        }

        const fireteamId = interaction.options.getString("fireteam_id", true).trim();
        const targetUser = interaction.options.getUser("user", true);
        const role = interaction.options.getString("role", true);

        const targetMember = db.getMember(interaction.guildId, targetUser.id);
        if (!targetMember || targetMember.team_name !== requester.team_name) {
          await interaction.editReply({ embeds: [dangerEmbed("Not On Your Team", `**${targetUser.username}** isn't registered on **${requester.team_name}**.`)] });
          return;
        }

        const currentOccupants = db
          .listTeamMembers(interaction.guildId, requester.team_name)
          .filter((m) => m.fireteam_id === fireteamId);

        const roleHolder = currentOccupants.find((m) => m.fireteam_role === role && m.discord_id !== targetUser.id);
        if (roleHolder) {
          await interaction.editReply({
            embeds: [dangerEmbed("Slot Occupied", `**${role}** on \`${fireteamId}\` is already filled by <@${roleHolder.discord_id}>. Reassign them first.`)],
          });
          return;
        }

        const alreadyInThisFireteam = currentOccupants.some((m) => m.discord_id === targetUser.id);
        if (!alreadyInThisFireteam && currentOccupants.length >= MAX_FIRETEAM_SIZE) {
          await interaction.editReply({ embeds: [dangerEmbed("Fireteam Full", `\`${fireteamId}\` already has its ${MAX_FIRETEAM_SIZE} slots filled.`)] });
          return;
        }

        db.assignFireteamSlot(interaction.guildId, fireteamId, requester.team_name, targetUser.id, role);
        await syncMemberFireteamRole(interaction.guild, targetUser.id, role);

        await interaction.editReply({
          embeds: [successEmbed("Fireteam Assigned", `**${targetUser.username}** is now the **${role}** on fireteam \`${fireteamId}\`.`)],
        });
        return;
      }
    } catch (error) {
      console.error(`Error executing /team ${subcommand}:`, error);
      await interaction.editReply({ embeds: [errorEmbed("Team Action Failed", `Failed to complete processing for the team ${subcommand} utility.`)] });
    }
  },
};

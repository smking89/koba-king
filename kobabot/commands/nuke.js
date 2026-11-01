"use strict";
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Purge and delete bot-created channels, categories, and selected role profiles")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName("target_roles")
         .setDescription("Select which role structures to purge from the server directory")
         .setRequired(true)
         .addChoices(
           { name: "Wipe All Roles (Owner, Admin, Mod, Player, and Kits)", value: "all" },
           { name: "Wipe Management Roles Only (Owner, Admin, Mod)", value: "staff" },
           { name: "Wipe Base Tier Roles Only (Player and Kit Tiers)", value: "player_kits" },
           { name: "Channels & Categories Only (Leave Roles Untouched)", value: "none" }
         )
    ),

  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      const denyEmbed = new EmbedBuilder()
        .setTitle("Action Restricted")
        .setDescription("You need administrator permissions or server ownership to use this feature.")
        .setColor(0xD32F2F);
      return interaction.reply({ embeds: [denyEmbed], ephemeral: true });
    }

    const mode = interaction.options.getString("target_roles");
    let displayTarget = "Channels & Categories Only";
    if (mode === "all") displayTarget = "All Bot-Created Roles & Structural Channels";
    if (mode === "staff") displayTarget = "Management Tiers (Owner, Admin, Mod) & Channels";
    if (mode === "player_kits") displayTarget = "Player Base Tiers, Kit Ranks, & Channels";

    const warningEmbed = new EmbedBuilder()
      .setTitle("⚠️ Structural Purge Warning")
      .setDescription("You are about to execute a destructive server removal macro. This operation will permanently delete your active category channels and your selected role arrays.\n\n" +
                   "**Target Deletion Profile:** " + displayTarget + "\n\n" +
                   "To execute this targeted deletion process, click the red button below to authorize the purge.")
      .setColor(0xD32F2F)
      .setFooter({ text: "⚠️ This action is final and cannot be reverted." });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("nuke:purge:" + mode).setLabel("🔴 Confirm Deletion Purge").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("nuke:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [warningEmbed], components: [actionRow], ephemeral: true });
  }
};

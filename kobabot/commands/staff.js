"use strict";

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { buildApplyPanel } = require("../utils/staffApplications");
const { successEmbed, dangerEmbed, errorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Post the staff application Apply Now panel - configure positions first with /config-staff")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("post").setDescription("Post the Apply Now panel in this channel")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    try {
      if (interaction.channel.type !== ChannelType.GuildText) {
        await interaction.editReply({ embeds: [dangerEmbed("Wrong Channel Type", "Run this in a normal text channel.")] });
        return;
      }
      await interaction.channel.send(buildApplyPanel(interaction.guildId));
      await interaction.editReply({ embeds: [successEmbed("Posted", "The Apply Now panel was posted here. Configure positions with `/config-staff`.")] });
    } catch (error) {
      console.error("Error executing /staff post:", error);
      await interaction.editReply({ embeds: [errorEmbed("Recruitment Fault", "Failed to post the Apply Now panel - please try again.")] });
    }
  },
};

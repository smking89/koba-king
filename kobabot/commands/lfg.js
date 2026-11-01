"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { createLfgPostFromInteraction } = require("../utils/lfgPanel");
const { resolveManagedChannel } = require("../utils/provisioning");
const { dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lfg")
    .setDescription("Create a Looking-for-Group post")
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName("activity").setDescription("Specify the target objective or monument task").setRequired(true).setMaxLength(300))
    .addIntegerOption((opt) => opt.setName("spots").setDescription("Number of open slots in your squad").setMinValue(1).setMaxValue(50)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const channel = await resolveManagedChannel(interaction.guild, "createLfg");
    if (channel && interaction.channelId !== channel.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong Channel", `Please use \`/lfg\` in ${channel}.`)] });
      return;
    }

    const activity = interaction.options.getString("activity", true).trim();
    const spots = interaction.options.getInteger("spots") || 4;
    await createLfgPostFromInteraction(interaction, activity, spots);
  },
};

"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { createLfgPostFromInteraction } = require("../utils/lfgPanel");
const { resolveManagedChannel } = require("../utils/provisioning");
const { dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("create-lfg")
    .setDescription("Post a looking-for-group request")
    .addStringOption((opt) => opt.setName("description").setDescription("What are you looking for? (e.g. \"Raiding tonight, need 2 more\")").setRequired(true).setMaxLength(300))
    .addIntegerOption((opt) => opt.setName("players_needed").setDescription("How many players do you need?").setRequired(true).setMinValue(1).setMaxValue(50)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const channel = await resolveManagedChannel(interaction.guild, "createLfg");
    if (channel && interaction.channelId !== channel.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong Channel", `Please use \`/create-lfg\` in ${channel}.`)] });
      return;
    }

    const description = interaction.options.getString("description", true).trim();
    const playersNeeded = interaction.options.getInteger("players_needed", true);
    await createLfgPostFromInteraction(interaction, description, playersNeeded);
  },
};

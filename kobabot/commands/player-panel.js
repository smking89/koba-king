"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { buildHub } = require("../utils/playerPanel");

module.exports = {
  data: new SlashCommandBuilder().setName("player-panel").setDescription("Claim your kits from one panel"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;
    await interaction.editReply(buildHub(interaction.guildId, interaction.member));
  },
};

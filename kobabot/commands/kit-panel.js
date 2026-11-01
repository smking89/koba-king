"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { buildHub } = require("../utils/kitPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kit-panel")
    .setDescription("Register kits and manage deliveries from one panel"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;
    await interaction.editReply(buildHub(interaction.guildId));
  },
};

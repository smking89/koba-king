"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildHub } = require("../utils/shopPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop-panel")
    .setDescription("[Restricted] Configure shops, currencies, products, and sales")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildHub(interaction.guildId));
  },
};

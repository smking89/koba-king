"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { hasAdminClearance } = require("../utils/teamAuth");
const { MATERIAL_FIELDS, MATERIAL_LABELS, MATERIAL_EMOJI } = require("../config/materials");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  // Previously developer-only (free-minting materials undermines the
  // economy if abused) - opened up to each server's own BoomBot Admins
  // 2026-09-04 per explicit request: a server owner can already get the
  // same effect another way (a short self-favoring zone event, held
  // uncontested), so restricting this specific command didn't actually
  // prevent the abuse, just removed a legitimate admin convenience.
  data: new SlashCommandBuilder()
    .setName("give-material")
    .setDescription("[Restricted] Manually distribute raw crafting components to a team")
    .addStringOption((opt) => opt.setName("team").setDescription("Exact team/clan name").setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName("material")
        .setDescription("Material type")
        .setRequired(true)
        .addChoices(...MATERIAL_FIELDS.map((f) => ({ name: MATERIAL_LABELS[f], value: f })))
    )
    .addIntegerOption((opt) => opt.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    if (!hasAdminClearance(interaction)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot Admins.")] });
      return;
    }

    const teamName = interaction.options.getString("team", true).trim();
    const material = interaction.options.getString("material", true);
    const amount = interaction.options.getInteger("amount", true);

    const team = db.getTeam(interaction.guildId, teamName);
    if (!team) {
      await interaction.editReply({ embeds: [dangerEmbed("Unknown Team", `No team named **${teamName}** is registered.`)] });
      return;
    }

    const updated = db.adjustTeamMaterials(interaction.guildId, teamName, { [material]: amount });

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Materials Distributed",
          `Gave **${teamName}** +${amount} ${MATERIAL_EMOJI[material] || ""} ${MATERIAL_LABELS[material]}.\nNew total: **${updated[material]}**.`
        ),
      ],
    });
  },
};

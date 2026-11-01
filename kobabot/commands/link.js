"use strict";

/**
 * Split into subcommands (2026-10-29) to add the ASTRO web-link path
 * alongside the existing WebRCON-verified gamertag check - `/link gamertag`
 * is byte-for-byte the same real logic this command always had (see
 * utils/linkPanel.js's handleLinkStart); `/link web` is new (see that
 * file's handleWebLinkStart).
 */

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { handleLinkStart, handleWebLinkStart, PLATFORM_CHOICES } = require("../utils/linkPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your account")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("gamertag")
        .setDescription("Link your Xbox Gamertag or PlayStation Online ID (must be online on this server right now)")
        .addStringOption((opt) =>
          opt.setName("platform").setDescription("Your platform").setRequired(true).addChoices(...PLATFORM_CHOICES)
        )
        .addStringOption((opt) =>
          opt.setName("gamertag").setDescription("Your exact Gamertag/Online ID - must be online on this server right now").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("web").setDescription("Connect your account through ASTRO (KOBA's shared identity layer)")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const sub = interaction.options.getSubcommand();
    if (sub === "web") {
      await handleWebLinkStart(interaction);
      return;
    }

    const platform = interaction.options.getString("platform", true);
    const gamertag = interaction.options.getString("gamertag", true);
    await handleLinkStart(interaction, platform, gamertag);
  },
};

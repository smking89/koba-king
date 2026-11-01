"use strict";

/**
 * FIXED (2026-10-12) - same class of bug as commands/link.js's header: this
 * was a cosmetic-only stub that replied with a canned success embed without
 * actually clearing members.gamertag, role grants, etc. Delegates to the
 * real, already-built utils/linkPanel.js's performUnlink (same logic the
 * #link-gamertag panel's "Unlink" button already runs) instead of
 * duplicating it.
 */

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { performUnlink } = require("../utils/linkPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your Gamertag/Online ID from your Discord account")
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;
    await performUnlink(interaction);
  },
};

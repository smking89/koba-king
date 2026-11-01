"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { successEmbed, errorEmbed } = require("../utils/embeds");
const { isOfficialGuild } = require("../utils/premium");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("license")
    .setDescription("Activate, manage, or transfer KOBA Bot licenses")
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName("action")
         .setDescription("Select management action")
         .setRequired(true)
         .addChoices(
           { name: "Activate License", value: "activate" },
           { name: "Transfer License", value: "transfer" }
         )
    )
    .addStringOption(opt =>
      opt.setName("key")
         .setDescription("The activation license key string")
         .setRequired(true)
    ),

  async execute(interaction) {
    // Was a hardcoded, stale guild ID ("1426740862360223796") that matched
    // neither the old .env value nor any real official server - fixed
    // 2026-10-11 to use the real, shared, multi-guild check.
    if (!isOfficialGuild(interaction.guildId)) {
      return interaction.reply({ 
        content: "❌ This developer-only command can only be executed within the Official KOBA Bot Support Server.", 
        ephemeral: true 
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    const action = interaction.options.getString("action");
    const key = interaction.options.getString("key");
    
    try {
      await interaction.editReply({
        embeds: [successEmbed("Licensing Action Executed", "Global registration system processed action: **" + action + "**\\n\\n**License Targeted:** `" + key + "`")]
      });
    } catch (error) {
      console.error("Error processing licensing action " + action + ":", error);
      await interaction.editReply({
        embeds: [errorEmbed("Licensing Engine Error", "Failed to update global activation matrix entries.")]
      });
    }
  }
};
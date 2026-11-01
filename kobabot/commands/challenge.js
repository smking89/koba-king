"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed, errorEmbed } = require("../utils/embeds");
const db = require("../database/db");
const challengeEngine = require("../utils/challengeEngine");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("challenge")
    .setDescription("Send a 1v1 wagered challenge")
    .setDMPermission(false)
    .addUserOption((opt) => opt.setName("opponent").setDescription("Select the target player to wager against").setRequired(true))
    .addIntegerOption((opt) => opt.setName("wager").setDescription("Amount of coins to stake on the outcome").setRequired(true).setMinValue(1))
    .addIntegerOption((opt) =>
      opt
        .setName("kills")
        .setDescription("First to this many real kills on the other player wins (default 5)")
        .addChoices({ name: "3 - Skirmish", value: 3 }, { name: "5 - Vendetta", value: 5 }, { name: "10 - Execution", value: 10 })
    )
    .addStringOption((opt) => opt.setName("currency").setDescription("Which currency to stake (see /shop-panel) - defaults to the first configured currency")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const guildId = interaction.guildId;
    const opponent = interaction.options.getUser("opponent", true);
    const stake = interaction.options.getInteger("wager", true);
    const killTarget = interaction.options.getInteger("kills") ?? 5;
    const currencyName = interaction.options.getString("currency");

    try {
      const currencies = db.listCurrencies(guildId);
      const currency = currencyName ? currencies.find((c) => c.name.toLowerCase() === currencyName.toLowerCase()) : currencies[0];
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("No Currency Configured", currencyName ? `Couldn't find a currency named "${currencyName}" - check \`/shop-panel\` for the exact name.` : "This server has no currency configured yet - see `/shop-panel`.")] });
        return;
      }

      const rivalship = db.getRivalship(guildId, interaction.user.id, opponent.id);
      const rivalshipId = rivalship?.status === "active" ? rivalship.id : null;

      const result = challengeEngine.createChallenge(guildId, interaction.user.id, opponent.id, currency.id, stake, rivalshipId, killTarget);
      if (!result.ok) {
        await interaction.editReply({ embeds: [dangerEmbed("Can't Send Challenge", result.reason)] });
        return;
      }

      const view = challengeEngine.buildChallengeSentView(guildId, result.challenge);
      await interaction.channel.send({ content: `<@${opponent.id}>`, ...view }).catch(() => {});
      await interaction.editReply({ embeds: [successEmbed("Challenge Sent", `Sent a Challenge to ${opponent} for **${stake} ${currency.emoji || ""} ${currency.name}** each.`.replace(/\s+/g, " ").trim())] });
    } catch (error) {
      console.error("Error executing /challenge:", error);
      await interaction.editReply({ embeds: [errorEmbed("Matchmaker Interrupted", "Failed to send the challenge - please try again.")] });
    }
  },
};

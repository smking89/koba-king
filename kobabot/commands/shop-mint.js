"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { requirePlan } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop-mint")
    .setDescription("[Restricted] Currency Minting - per-wallet balance cap, or mint/burn a currency's total supply")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the max wallet/savings balance one account can hold (not total supply - see /shop-mint supply)")
        .addStringOption((opt) => opt.setName("currency").setDescription("Which currency (see /shop-panel)").setRequired(true))
        .addNumberOption((opt) => opt.setName("max_balance").setDescription("Per-wallet ceiling - leave blank/0 to remove the cap").setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub
        .setName("supply")
        .setDescription("Mint (raise) or burn (lower) this currency's total supply ceiling across all rewards")
        .addStringOption((opt) => opt.setName("currency").setDescription("Which currency (see /shop-panel)").setRequired(true))
        .addNumberOption((opt) => opt.setName("max_supply").setDescription("Total supply ceiling - leave blank/0 to uncap. Can't burn below what's already circulating.").setMinValue(0))
    )
    .addSubcommand((sub) => sub.setName("view").setDescription("Show every currency's wallet cap, supply ceiling, and circulating supply")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    // Minting (currency wallet caps + supply mint/burn) is a Pro/Max feature (per website/src/components/PlanGrid.jsx)
    if (!(await requirePlan(interaction, "pro", "Currency Minting"))) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const currencies = db.listCurrencies(guildId);
      if (!currencies.length) {
        await interaction.editReply({ embeds: [infoEmbed("Currency Caps", "No currencies configured yet - see `/shop-panel`.")] });
        return;
      }
      const lines = currencies.map((c) => {
        const walletCap = c.max_wallet_balance !== null && c.max_wallet_balance !== undefined ? `capped at ${c.max_wallet_balance}` : "uncapped";
        const supplyCap = c.max_supply !== null && c.max_supply !== undefined ? `${c.circulating_supply} / ${c.max_supply}` : `${c.circulating_supply} / uncapped`;
        return `**${c.name}**\nWallet cap: ${walletCap}\nSupply: ${supplyCap}`;
      });
      await interaction.editReply({ embeds: [infoEmbed("Currency Caps", lines.join("\n\n"))] });
      return;
    }

    const currencyName = interaction.options.getString("currency", true).trim();
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency) {
      await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)] });
      return;
    }

    if (sub === "supply") {
      const requestedMaxSupply = interaction.options.getNumber("max_supply");
      const updated = db.setCurrencyMaxSupply(guildId, currency.id, requestedMaxSupply || null);
      if (!updated) {
        await interaction.editReply({ embeds: [dangerEmbed("Failed", "Couldn't update that currency's supply ceiling.")] });
        return;
      }

      if (updated.max_supply === null || updated.max_supply === undefined) {
        await interaction.editReply({
          embeds: [successEmbed("Supply Uncapped", `**${currency.name}** has no supply ceiling anymore.\nCirculating: **${updated.circulating_supply}**.`)],
        });
        return;
      }

      // requestedMaxSupply was clamped up to circulating_supply if the admin tried to burn below it.
      const wasClamped = requestedMaxSupply !== null && requestedMaxSupply !== undefined && requestedMaxSupply > 0 && requestedMaxSupply < updated.max_supply;
      const clampNote = wasClamped
        ? `\n⚠️ You asked for **${requestedMaxSupply}**, but that's below the **${updated.circulating_supply}** already circulating - clamped up to that instead.`
        : "";

      await interaction.editReply({
        embeds: [
          successEmbed(
            "Supply Ceiling Updated",
            `**${currency.name}**'s total supply ceiling is now **${updated.max_supply}**.\nCirculating: **${updated.circulating_supply}**.${clampNote}`
          ),
        ],
      });
      return;
    }

    const maxBalance = interaction.options.getNumber("max_balance");
    db.setCurrencyMaxBalance(guildId, currency.id, maxBalance || null);

    await interaction.editReply({
      embeds: [successEmbed("Wallet Cap Updated", maxBalance ? `**${currency.name}** wallets and savings can now never exceed **${maxBalance}**.` : `**${currency.name}** is now uncapped.`)],
    });
  },
};

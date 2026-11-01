"use strict";

/**
 * Bounties (2026-10-18) - place a currency reward on a gamertag's head,
 * paid out in full to whoever lands the next valid PvP kill on them (see
 * utils/killfeedEngine.js's computePvpResult, which checks
 * db.getOpenBountiesOnTarget() on every PvP kill). Currency is escrowed
 * (deducted from the placer immediately) rather than just promised, so a
 * placer can never place more than they can cover - same reasoning as
 * every other escrow-style spend in this codebase (marketplace listings,
 * auctions).
 */

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bounty")
    .setDescription("Place a currency bounty on a player's head")
    .addSubcommand((sub) =>
      sub
        .setName("place")
        .setDescription("Put a bounty on a gamertag - paid to whoever kills them next in PvP")
        .addStringOption((opt) => opt.setName("gamertag").setDescription("Target's exact gamertag").setRequired(true))
        .addStringOption((opt) => opt.setName("currency").setDescription("Which currency (see /shop-panel)").setRequired(true))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("Bounty amount").setRequired(true).setMinValue(1))
        .addIntegerOption((opt) => opt.setName("expires_hours").setDescription("Auto-expire and refund after this many hours (blank = never expires)").setMinValue(1))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Show every open bounty on this server"))
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel a bounty you placed and get refunded")
        .addIntegerOption((opt) => opt.setName("id").setDescription("Bounty ID (see /bounty list)").setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "place") {
      const gamertag = interaction.options.getString("gamertag", true).trim();
      const currencyName = interaction.options.getString("currency", true).trim();
      const amount = interaction.options.getInteger("amount", true);
      const expiresHours = interaction.options.getInteger("expires_hours");

      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}**. Check \`/shop-panel\`.`)] });
        return;
      }

      const wallet = db.getWallet(guildId, interaction.user.id, currency.id);
      if (wallet.balance < amount) {
        await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `You have **${wallet.balance}** ${currency.name}, need **${amount}**.`)] });
        return;
      }

      db.adjustWallet(guildId, interaction.user.id, currency.id, -amount);
      const bounty = db.createBounty(guildId, {
        targetGamertag: gamertag,
        placedBy: interaction.user.id,
        currencyId: currency.id,
        amount,
        expiresAt: expiresHours ? Date.now() + expiresHours * 60 * 60 * 1000 : null,
      });

      await interaction.editReply({
        embeds: [successEmbed("Bounty Placed", `**#${bounty.id}** - **${amount}** ${currency.emoji || currency.name} on **${gamertag}**'s head.${expiresHours ? ` Expires in ${expiresHours}h.` : ""}\nPays out automatically to whoever lands the next valid PvP kill on them.`)],
      });
      return;
    }

    if (sub === "list") {
      const bounties = db.listOpenBounties(guildId);
      if (!bounties.length) {
        await interaction.editReply({ embeds: [infoEmbed("No Open Bounties", "There are no active bounties right now. Place one with `/bounty place`.")] });
        return;
      }
      const lines = bounties.map((b) => {
        const currency = db.getCurrency(guildId, b.currency_id);
        return `**#${b.id}** **${b.target_gamertag}** - **${b.amount}** ${currency?.emoji || currency?.name || ""}`;
      });
      await interaction.editReply({ embeds: [infoEmbed("💀 Open Bounties", lines.join("\n"))] });
      return;
    }

    if (sub === "cancel") {
      const id = interaction.options.getInteger("id", true);
      const bounty = db.getBounty(guildId, id);
      if (!bounty || bounty.status !== "open") {
        await interaction.editReply({ embeds: [dangerEmbed("Not Found", `No open bounty **#${id}**.`)] });
        return;
      }
      if (bounty.placed_by !== interaction.user.id) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Yours", "You can only cancel a bounty you placed yourself.")] });
        return;
      }
      db.cancelBounty(guildId, id);
      db.adjustWallet(guildId, interaction.user.id, bounty.currency_id, bounty.amount);
      await interaction.editReply({ embeds: [successEmbed("Bounty Cancelled", `**#${id}** cancelled and refunded.`)] });
      return;
    }
  },
};

"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePlan } = require("../utils/premium");
const { getRequesterMembership } = require("../utils/teamAuth");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

const MATERIAL_CHOICES = MATERIAL_FIELDS.map((f) => ({ name: MATERIAL_LABELS[f] || f, value: f }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("marketplace")
    .setDescription("Buy and sell materials with other players")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List materials from your team's stockpile for sale")
        .addStringOption((opt) => opt.setName("currency").setDescription("Which currency to sell for").setRequired(true))
        .addStringOption((opt) => opt.setName("material").setDescription("Which material").setRequired(true).addChoices(...MATERIAL_CHOICES))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("How many to sell").setRequired(true).setMinValue(1))
        .addNumberOption((opt) => opt.setName("price").setDescription("Your asking price (must fall within the admin-set range)").setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub
        .setName("browse")
        .setDescription("Browse active listings")
        .addStringOption((opt) => opt.setName("material").setDescription("Filter to one material").addChoices(...MATERIAL_CHOICES))
    )
    .addSubcommand((sub) => sub.setName("buy").setDescription("Buy a listing").addIntegerOption((opt) => opt.setName("id").setDescription("Listing ID").setRequired(true)))
    .addSubcommand((sub) => sub.setName("mine").setDescription("Show your own active listings"))
    .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel your own listing (refunds materials to your team)").addIntegerOption((opt) => opt.setName("id").setDescription("Listing ID").setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    // Marketplace is a Pro/Max feature (per website/src/components/PlanGrid.jsx)
    if (!(await requirePlan(interaction, "pro", "The Marketplace"))) return;

    const guildId = interaction.guildId;
    const requester = getRequesterMembership(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === "browse") {
      const material = interaction.options.getString("material");
      const listings = db.listActiveListings(guildId, material);
      if (!listings.length) {
        await interaction.editReply({ embeds: [infoEmbed("Marketplace", "No active listings right now.")] });
        return;
      }
      const lines = listings.slice(0, 25).map((l) => {
        const currency = db.getCurrency(guildId, l.currency_id);
        return `**#${l.id}** ${l.amount}x ${MATERIAL_LABELS[l.material_field] || l.material_field} - **${l.price}** ${currency?.emoji || currency?.name || ""} (seller: ${l.seller_team})`;
      });
      await interaction.editReply({ embeds: [infoEmbed("Marketplace Listings", lines.join("\n"))] });
      return;
    }

    if (sub === "mine") {
      if (!requester) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")] });
        return;
      }
      const listings = db.listSellerListings(guildId, interaction.user.id);
      if (!listings.length) {
        await interaction.editReply({ embeds: [infoEmbed("Your Listings", "You have no active listings.")] });
        return;
      }
      const lines = listings.map((l) => `**#${l.id}** ${l.amount}x ${MATERIAL_LABELS[l.material_field] || l.material_field} for **${l.price}**`);
      await interaction.editReply({ embeds: [infoEmbed("Your Listings", lines.join("\n"))] });
      return;
    }

    if (sub === "list") {
      if (!requester) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")] });
        return;
      }

      const currencyName = interaction.options.getString("currency", true).trim();
      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}**.`)] });
        return;
      }
      if (currency.marketplace_min_price === null || currency.marketplace_max_price === null) {
        await interaction.editReply({ embeds: [dangerEmbed("Marketplace Closed", `**${currency.name}** doesn't have marketplace price bounds set yet - ask an admin to run \`/marketplace-config bounds\`.`)] });
        return;
      }

      const price = interaction.options.getNumber("price", true);
      if (price < currency.marketplace_min_price || price > currency.marketplace_max_price) {
        await interaction.editReply({ embeds: [dangerEmbed("Price Out Of Range", `Price must be between **${currency.marketplace_min_price}** and **${currency.marketplace_max_price}** for **${currency.name}**.`)] });
        return;
      }

      const material = interaction.options.getString("material", true);
      const amount = interaction.options.getInteger("amount", true);

      try {
        const listing = db.createListing(guildId, { sellerDiscordId: interaction.user.id, sellerTeam: requester.team_name, currencyId: currency.id, materialField: material, amount, price });
        await interaction.editReply({ embeds: [successEmbed("Listed", `Listed **${amount}x ${MATERIAL_LABELS[material]}** for **${price} ${currency.name}** (listing #${listing.id}). Materials were taken from **${requester.team_name}**'s stockpile now.`)] });
      } catch (err) {
        if (err.message === "insufficient_materials") {
          await interaction.editReply({ embeds: [dangerEmbed("Not Enough Materials", `**${requester.team_name}** doesn't have **${amount}x ${MATERIAL_LABELS[material]}** to list.`)] });
        } else {
          throw err;
        }
      }
      return;
    }

    if (sub === "buy") {
      if (!requester) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")] });
        return;
      }

      const id = interaction.options.getInteger("id", true);
      const listing = db.getListing(guildId, id);
      if (!listing || listing.status !== "active") {
        await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No active listing with that ID.")] });
        return;
      }
      if (listing.seller_discord_id === interaction.user.id) {
        await interaction.editReply({ embeds: [dangerEmbed("Can't Buy Your Own Listing", "Cancel it instead with `/marketplace cancel`.")] });
        return;
      }

      const wallet = db.getWallet(guildId, interaction.user.id, listing.currency_id);
      if (wallet.balance < listing.price) {
        await interaction.editReply({ embeds: [dangerEmbed("Insufficient Balance", `You need **${listing.price}** but only have **${wallet.balance}**.`)] });
        return;
      }

      db.buyListing(guildId, id, interaction.user.id, requester.team_name);
      await interaction.editReply({ embeds: [successEmbed("Purchased", `Bought **${listing.amount}x ${MATERIAL_LABELS[listing.material_field]}** for **${listing.price}** - credited to **${requester.team_name}**'s stockpile.`)] });
      return;
    }

    if (sub === "cancel") {
      const id = interaction.options.getInteger("id", true);
      const listing = db.getListing(guildId, id);
      if (!listing || listing.status !== "active") {
        await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No active listing with that ID.")] });
        return;
      }
      if (listing.seller_discord_id !== interaction.user.id) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Yours", "You can only cancel your own listings.")] });
        return;
      }

      db.cancelListing(guildId, id);
      await interaction.editReply({ embeds: [successEmbed("Listing Cancelled", `**${listing.amount}x ${MATERIAL_LABELS[listing.material_field]}** was refunded to **${listing.seller_team}**'s stockpile.`)] });
      return;
    }
  },
};

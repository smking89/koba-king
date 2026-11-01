"use strict";

/**
 * Full interactive Marketplace hub - replaces the old "Browse Listings"
 * button that just dumped a flat read-only text list and told you to type
 * `/marketplace buy id:<#>` yourself. Now: Browse (select a listing -> Buy
 * button), My Listings (select -> Cancel button), and List An Item (a
 * currency -> material -> amount/price wizard, mirroring the select-then-
 * modal pattern used everywhere else in this project since modals can't
 * contain select menus).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { getRequesterMembership } = require("./teamAuth");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");

function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("marketplace:hub").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

function buildHub() {
  const embed = infoEmbed("🏷️ Marketplace", "Buy and sell materials with other players.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("marketplace:browse_list").setLabel("📋 Browse Listings").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("marketplace:mine").setLabel("🏷️ My Listings").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("marketplace:list_open").setLabel("➕ List An Item").setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

function listingSelectMenu(guildId, customId, listings) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Choose a listing")
    .addOptions(
      listings.slice(0, 25).map((l) => {
        const currency = db.getCurrency(guildId, l.currency_id);
        return {
          label: `#${l.id} - ${l.amount}x ${MATERIAL_LABELS[l.material_field] || l.material_field}`.slice(0, 100),
          value: String(l.id),
          description: `${l.price} ${currency?.name || ""} - seller: ${l.seller_team}`.slice(0, 100),
        };
      })
    );
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  // "marketplace:browse" is the #marketplace channel panel's original entry
  // button customId, kept as-is so an already-posted/pinned panel keeps
  // working - it now opens the full hub instead of a flat listing dump.
  if (interaction.isButton() && (id === "marketplace:browse" || id === "marketplace:hub")) {
    const payload = buildHub();
    if (id === "marketplace:browse") await interaction.reply({ ...payload, ephemeral: true });
    else await interaction.update(payload);
    return;
  }

  if (interaction.isButton() && id === "marketplace:browse_list") {
    const listings = db.listActiveListings(interaction.guildId);
    if (!listings.length) {
      await interaction.update({ embeds: [infoEmbed("Marketplace", "No active listings right now.")], components: [backRow()] });
      return;
    }
    const menu = listingSelectMenu(interaction.guildId, "marketplace:view_select", listings);
    await interaction.update({ embeds: [infoEmbed("Browse Listings", "Pick a listing to view and buy.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (interaction.isStringSelectMenu() && id === "marketplace:view_select") {
    const listingId = Number(interaction.values[0]);
    const listing = db.getListing(interaction.guildId, listingId);
    if (!listing || listing.status !== "active") {
      await interaction.update({ embeds: [dangerEmbed("Gone", "That listing isn't active anymore.")], components: [backRow()] });
      return;
    }
    const currency = db.getCurrency(interaction.guildId, listing.currency_id);
    const isOwn = listing.seller_discord_id === interaction.user.id;
    const embed = infoEmbed(
      `Listing #${listing.id}`,
      `**${listing.amount}x ${MATERIAL_LABELS[listing.material_field] || listing.material_field}**\n**Price:** ${listing.price} ${currency?.emoji || currency?.name || ""}\n**Seller:** ${listing.seller_team}${isOwn ? "\n\n*(This is your own listing - cancel it from My Listings instead.)*" : ""}`
    );
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`marketplace:buy:${listing.id}`).setLabel("💰 Buy").setStyle(ButtonStyle.Success).setDisabled(isOwn));
    await interaction.update({ embeds: [embed], components: [row, backRow()] });
    return;
  }

  if (interaction.isButton() && id.startsWith("marketplace:buy:")) {
    const listingId = Number(id.split(":")[2]);
    await interaction.deferUpdate();

    const requester = getRequesterMembership(interaction);
    if (!requester) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")], components: [backRow()] });
      return;
    }
    const listing = db.getListing(interaction.guildId, listingId);
    if (!listing || listing.status !== "active") {
      await interaction.editReply({ embeds: [dangerEmbed("Gone", "That listing isn't active anymore.")], components: [backRow()] });
      return;
    }
    if (listing.seller_discord_id === interaction.user.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Can't Buy Your Own Listing", "Cancel it instead from My Listings.")], components: [backRow()] });
      return;
    }
    const wallet = db.getWallet(interaction.guildId, interaction.user.id, listing.currency_id);
    if (wallet.balance < listing.price) {
      await interaction.editReply({ embeds: [dangerEmbed("Insufficient Balance", `You need **${listing.price}** but only have **${wallet.balance}**.`)], components: [backRow()] });
      return;
    }

    db.buyListing(interaction.guildId, listingId, interaction.user.id, requester.team_name);
    await interaction.editReply({
      embeds: [successEmbed("Purchased", `Bought **${listing.amount}x ${MATERIAL_LABELS[listing.material_field]}** for **${listing.price}** - credited to **${requester.team_name}**'s stockpile.`)],
      components: [backRow()],
    });
    return;
  }

  if (interaction.isButton() && id === "marketplace:mine") {
    await interaction.deferUpdate();
    const listings = db.listSellerListings(interaction.guildId, interaction.user.id);
    if (!listings.length) {
      await interaction.editReply({ embeds: [infoEmbed("Your Listings", "You have no active listings.")], components: [backRow()] });
      return;
    }
    const menu = listingSelectMenu(interaction.guildId, "marketplace:cancel_select", listings);
    await interaction.editReply({ embeds: [infoEmbed("Your Listings", "Pick one to cancel - materials are refunded to your team's stockpile.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (interaction.isStringSelectMenu() && id === "marketplace:cancel_select") {
    const listingId = Number(interaction.values[0]);
    const listing = db.getListing(interaction.guildId, listingId);
    if (!listing || listing.status !== "active" || listing.seller_discord_id !== interaction.user.id) {
      await interaction.update({ embeds: [dangerEmbed("Not Found", "That listing isn't yours or isn't active anymore.")], components: [backRow()] });
      return;
    }
    db.cancelListing(interaction.guildId, listingId);
    await interaction.update({
      embeds: [successEmbed("Listing Cancelled", `**${listing.amount}x ${MATERIAL_LABELS[listing.material_field]}** was refunded to **${listing.seller_team}**'s stockpile.`)],
      components: [backRow()],
    });
    return;
  }

  if (interaction.isButton() && id === "marketplace:list_open") {
    const requester = getRequesterMembership(interaction);
    if (!requester) {
      await interaction.update({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")], components: [backRow()] });
      return;
    }
    const currencies = db.listCurrencies(interaction.guildId).filter((c) => c.marketplace_min_price !== null && c.marketplace_max_price !== null);
    if (!currencies.length) {
      await interaction.update({ embeds: [dangerEmbed("Marketplace Closed", "No currency has marketplace price bounds set yet - ask an admin to run `/marketplace-config bounds`.")], components: [backRow()] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("marketplace:list_currency_select")
      .setPlaceholder("Choose a currency to sell for")
      .addOptions(currencies.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id), description: `Price range ${c.marketplace_min_price}-${c.marketplace_max_price}`.slice(0, 100) })));
    await interaction.update({ embeds: [infoEmbed("List An Item", "Pick which currency to sell for.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (interaction.isStringSelectMenu() && id === "marketplace:list_currency_select") {
    const currencyId = interaction.values[0];
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`marketplace:list_material_select:${currencyId}`)
      .setPlaceholder("Choose a material")
      .addOptions(MATERIAL_FIELDS.slice(0, 25).map((f) => ({ label: (MATERIAL_LABELS[f] || f).slice(0, 100), value: f })));
    await interaction.update({ embeds: [infoEmbed("List An Item", "Pick which material to sell.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (interaction.isStringSelectMenu() && id.startsWith("marketplace:list_material_select:")) {
    const currencyId = id.split(":")[2];
    const material = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`marketplace:list_modal:${currencyId}:${material}`).setTitle(`List ${(MATERIAL_LABELS[material] || material)}`.slice(0, 45));
    const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Amount to sell").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
    const priceInput = new TextInputBuilder().setCustomId("price").setLabel("Asking price").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
    modal.addComponents(new ActionRowBuilder().addComponents(amountInput), new ActionRowBuilder().addComponents(priceInput));
    await interaction.showModal(modal);
    return;
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;
  if (!id.startsWith("marketplace:list_modal:")) return;

  await interaction.deferUpdate();
  const [, , currencyId, material] = id.split(":");
  const amount = parseInt(interaction.fields.getTextInputValue("amount").trim(), 10);
  const price = Number(interaction.fields.getTextInputValue("price").trim());

  if (!Number.isFinite(amount) || amount < 1) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Amount", "Enter a whole number of at least 1.")], components: [backRow()] });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Price", "Enter a valid number.")], components: [backRow()] });
    return;
  }

  const currency = db.getCurrency(interaction.guildId, Number(currencyId));
  if (!currency) {
    await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", "That currency no longer exists.")], components: [backRow()] });
    return;
  }
  if (price < currency.marketplace_min_price || price > currency.marketplace_max_price) {
    await interaction.editReply({
      embeds: [dangerEmbed("Price Out Of Range", `Price must be between **${currency.marketplace_min_price}** and **${currency.marketplace_max_price}** for **${currency.name}**.`)],
      components: [backRow()],
    });
    return;
  }

  const requester = getRequesterMembership(interaction);
  if (!requester) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")], components: [backRow()] });
    return;
  }

  try {
    const listing = db.createListing(interaction.guildId, { sellerDiscordId: interaction.user.id, sellerTeam: requester.team_name, currencyId: currency.id, materialField: material, amount, price });
    await interaction.editReply({
      embeds: [successEmbed("Listed", `Listed **${amount}x ${MATERIAL_LABELS[material]}** for **${price} ${currency.name}** (listing #${listing.id}). Materials were taken from your team's stockpile now.`)],
      components: [backRow()],
    });
  } catch (err) {
    if (err.message === "insufficient_materials") {
      await interaction.editReply({ embeds: [dangerEmbed("Not Enough Materials", `Your team doesn't have **${amount}x ${MATERIAL_LABELS[material]}** to list.`)], components: [backRow()] });
    } else {
      throw err;
    }
  }
}

module.exports = { handleComponent, handleModal };

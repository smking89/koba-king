"use strict";

/**
 * The Scrap Merchant - see database/schema.sql's header comment on
 * scrap_merchant_settings for the full concept. Not a wager game: players
 * accumulate junk items as bonus drops from Lootbox/The Defuse Wire/The
 * Grid Minefield payouts (see rollBonusDrop, called from each of those
 * games' own win points), then sell them here for coins whenever they
 * want - one item at a time, a custom amount, or their whole inventory in
 * one shot.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");

function fmtAmount(settings, amount) {
  const label = settings?.currency_name || "coins";
  return `${amount} ${settings?.currency_emoji || ""} ${label}`.replace(/\s+/g, " ").trim();
}

/** Fixed items pay their set price every time; random items roll an independent price per unit (not once for the whole stack), so selling 10 of one still feels like the merchant haggling on each individually. */
function rollUnitPrice(item) {
  if (item.price_mode === "random") {
    const min = Math.min(item.min_price, item.max_price);
    const max = Math.max(item.min_price, item.max_price);
    return Math.round(min + Math.random() * (max - min));
  }
  return item.fixed_price;
}

/**
 * Called from a winning payout point in Lootbox/The Defuse Wire/The Grid
 * Minefield. Rolls drop_chance_pct; on a hit, picks one enabled item
 * weighted by drop_weight and adds it to the player's inventory, UNLESS
 * they're already at max_inventory_items (silently skipped - the player
 * still keeps their normal game payout regardless of this roll).
 * Returns the dropped item row (with an extra `awarded` quantity of 1) or
 * null if nothing dropped/was configured/was skipped for being at cap.
 */
function rollBonusDrop(guildId, discordId) {
  const settings = db.getScrapMerchantSettings(guildId);
  if (!settings) return null;

  if (Math.random() * 100 >= settings.drop_chance_pct) return null;

  const items = db.listScrapItems(guildId, { enabledOnly: true });
  if (!items.length) return null;

  const totalWeight = items.reduce((sum, i) => sum + Math.max(1, i.drop_weight), 0);
  let roll = Math.random() * totalWeight;
  let picked = items[items.length - 1];
  for (const item of items) {
    roll -= Math.max(1, item.drop_weight);
    if (roll <= 0) {
      picked = item;
      break;
    }
  }

  const currentTotal = db.getScrapInventoryTotal(guildId, discordId);
  if (currentTotal >= settings.max_inventory_items) return null;

  db.addScrapItem(guildId, discordId, picked.id, 1);
  return picked;
}

function inventoryRows(inventory) {
  if (!inventory.length) return [];
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("scrapmerchant:item_pick")
      .setPlaceholder("Sell a specific item...")
      .addOptions(
        inventory.slice(0, 25).map((row) => ({
          label: `${row.name} (x${row.quantity})`,
          value: String(row.item_id),
          emoji: row.emoji || undefined,
        }))
      )
  );
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("scrapmerchant:sell_all").setLabel("💰 Sell All").setStyle(ButtonStyle.Success)
  );
  return [selectRow, actionRow];
}

function buildInventoryView(guildId, discordId, settings) {
  const inventory = db.listPlayerScrapInventory(guildId, discordId);
  if (!inventory.length) {
    return {
      embeds: [infoEmbed("🧰 The Scrap Merchant", "Your junk inventory is empty. Winning a round of Lootbox, The Defuse Wire, or The Grid Minefield has a chance to drop scrap for you to sell here.")],
      components: [],
    };
  }

  const lines = inventory.map((row) => {
    const priceNote = row.price_mode === "random" ? `~${row.min_price}-${row.max_price}` : `${row.fixed_price}`;
    return `${row.emoji || "🔩"} **${row.name}** x${row.quantity} — ${priceNote} ${settings?.currency_emoji || ""} each`.replace(/\s+/g, " ").trim();
  });

  return {
    embeds: [infoEmbed("🧰 The Scrap Merchant", `Sell your scrap for ${settings?.currency_name || "coins"}.\n\n${lines.join("\n")}`)],
    components: inventoryRows(inventory),
  };
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup) - Scrap Merchant has no bet/mode step, it just opens straight to the player's inventory. */
async function showInventory(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getScrapMerchantSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [dangerEmbed("Not Set Up", "The Scrap Merchant hasn't been configured yet - ask staff to set a currency via the Games Panel's Configure button.")],
      components: [backRow],
    });
    return;
  }

  const view = buildInventoryView(guildId, interaction.user.id, settings);
  await interaction.update(view);
}

function itemDetailRow(itemId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrapmerchant:sell_qty:${itemId}:1`).setLabel("Sell 1").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`scrapmerchant:sell_qty:${itemId}:all`).setLabel("Sell All Of This").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`scrapmerchant:sell_custom:${itemId}`).setLabel("Custom Amount").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("scrapmerchant:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
  );
}

function buildCustomQtyModal(itemId) {
  const modal = new ModalBuilder().setCustomId(`scrapmerchant:sell_custom_modal:${itemId}`).setTitle("Sell How Many?");
  const qtyInput = new TextInputBuilder().setCustomId("quantity").setLabel("Quantity to sell").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
  modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
  return modal;
}

/** Sells up to `quantity` of one item type - clamps to whatever's actually held (see db.removeScrapItem). Returns { soldQty, totalPayout, itemName } or null if the player doesn't hold any. */
function sellItem(guildId, discordId, itemId, quantity) {
  const item = db.getScrapItem(guildId, itemId);
  if (!item) return null;
  const held = db.getPlayerScrapItemQuantity(guildId, discordId, itemId);
  if (held <= 0) return null;

  const soldQty = db.removeScrapItem(guildId, discordId, itemId, quantity);
  let totalPayout = 0;
  for (let i = 0; i < soldQty; i++) totalPayout += rollUnitPrice(item);

  const settings = db.getScrapMerchantSettings(guildId);
  if (settings?.currency_id) totalPayout = db.grantFromSupply(guildId, settings.currency_id, discordId, totalPayout).granted;

  return { soldQty, totalPayout, itemName: item.name };
}

/** Sells the player's entire inventory in one shot. Returns { totalPayout, lines } where lines is a per-item summary for the result embed. */
function sellAllItems(guildId, discordId) {
  const inventory = db.listPlayerScrapInventory(guildId, discordId);
  const settings = db.getScrapMerchantSettings(guildId);
  let totalPayout = 0;
  const lines = [];

  for (const row of inventory) {
    let itemPayout = 0;
    for (let i = 0; i < row.quantity; i++) itemPayout += rollUnitPrice(row);
    totalPayout += itemPayout;
    lines.push(`${row.emoji || "🔩"} ${row.name} x${row.quantity} — ${itemPayout} ${settings?.currency_emoji || ""}`.replace(/\s+/g, " ").trim());
  }

  db.clearScrapInventory(guildId, discordId);
  if (settings?.currency_id && totalPayout > 0) totalPayout = db.grantFromSupply(guildId, settings.currency_id, discordId, totalPayout).granted;

  return { totalPayout, lines };
}

async function handleComponent(interaction) {
  const guildId = interaction.guildId;
  const settings = db.getScrapMerchantSettings(guildId);
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "back") {
    await interaction.update(buildInventoryView(guildId, interaction.user.id, settings));
    return;
  }

  if (interaction.isStringSelectMenu() && action === "item_pick") {
    const itemId = Number(interaction.values[0]);
    const item = db.getScrapItem(guildId, itemId);
    const qty = db.getPlayerScrapItemQuantity(guildId, interaction.user.id, itemId);
    if (!item || qty <= 0) {
      await interaction.update(buildInventoryView(guildId, interaction.user.id, settings));
      return;
    }
    const priceNote = item.price_mode === "random" ? `~${item.min_price}-${item.max_price}` : `${item.fixed_price}`;
    await interaction.update({
      embeds: [infoEmbed(`${item.emoji || "🔩"} ${item.name}`, `You have **${qty}** of these.\nSells for ${priceNote} ${settings?.currency_emoji || ""} each.`)],
      components: [itemDetailRow(itemId)],
    });
    return;
  }

  if (action === "sell_all") {
    const result = sellAllItems(guildId, interaction.user.id);
    if (!result.lines.length) {
      await interaction.update(buildInventoryView(guildId, interaction.user.id, settings));
      return;
    }
    const embed = successEmbed("💰 Sold Everything", `${result.lines.join("\n")}\n\n**Total: ${fmtAmount(settings, result.totalPayout)}**`);
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("scrapmerchant:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  if (action === "sell_qty") {
    const itemId = Number(parts[2]);
    const qtyPart = parts[3];
    const held = db.getPlayerScrapItemQuantity(guildId, interaction.user.id, itemId);
    const quantity = qtyPart === "all" ? held : Number(qtyPart);
    const result = sellItem(guildId, interaction.user.id, itemId, quantity);
    if (!result) {
      await interaction.update(buildInventoryView(guildId, interaction.user.id, settings));
      return;
    }
    const embed = successEmbed("💰 Sold", `Sold **${result.soldQty}x ${result.itemName}** for **${fmtAmount(settings, result.totalPayout)}**.`);
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("scrapmerchant:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  if (action === "sell_custom") {
    const itemId = Number(parts[2]);
    await interaction.showModal(buildCustomQtyModal(itemId));
    return;
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  if (action !== "sell_custom_modal") return;

  const guildId = interaction.guildId;
  const itemId = Number(parts[2]);
  const quantity = Number(interaction.fields.getTextInputValue("quantity"));

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    await interaction.reply({ embeds: [dangerEmbed("Invalid Quantity", "Enter a whole positive number.")], ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  const settings = db.getScrapMerchantSettings(guildId);
  const result = sellItem(guildId, interaction.user.id, itemId, quantity);
  if (!result) {
    await interaction.editReply(buildInventoryView(guildId, interaction.user.id, settings));
    return;
  }
  const embed = successEmbed("💰 Sold", `Sold **${result.soldQty}x ${result.itemName}** for **${fmtAmount(settings, result.totalPayout)}**.`);
  const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("scrapmerchant:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
  await interaction.editReply({ embeds: [embed], components: [backRow] });
}

module.exports = {
  rollBonusDrop,
  showInventory,
  handleComponent,
  handleModal,
  sellItem,
  sellAllItems,
};

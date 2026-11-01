"use strict";

/**
 * The Ticket Jackpot (Games Panel -> Play -> "The Ticket Jackpot", see
 * config/games.js's "jackpot" entry) - a SHARED, progressive, per-guild pot
 * every player buys into via one of 3 fixed ticket tiers (Base/Elite/VIP).
 * Unlike every other wager game in this codebase, there's no win/lose per
 * purchase - buying a ticket just grows the shared pot and your own odds in
 * it (ticket_count / total_tickets), resolved in one weighted draw the
 * instant the pot reaches the admin's ceiling. "No max wager limit" (the
 * spec's own wording) means there's deliberately no per-purchase amount
 * cap here, unlike every other game's min/max bet range - only the total
 * POOL has a ceiling.
 *
 * Draw mechanics (not fully specified by the source spec beyond "dynamically
 * recalculated win percentages" and "freeze entry the moment the pool hits
 * the ceiling") - this implementation's own design decision: a weighted
 * random draw WITHOUT replacement, one winner per place in
 * jackpot_settings.prize_splits (CSV of %, e.g. "70,20,10" = 1st/2nd/3rd),
 * each place paid that % of the final pool. Fewer unique entrants than
 * prize places just means the remaining places have nobody left to draw -
 * their % is simply not paid out (never double-pays the same winner twice).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { publishGameCompleted } = require("./gameEvents");
const { requirePlan } = require("./premium");

const GAME_KEY = "jackpot";
const TIERS = ["base", "elite", "vip"];

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

/** Parses "base_price,elite_price,vip_price"-style CSV configured via jackpotSettingsModal - used here for prize_splits only (the 3 ticket prices/emojis each have their own dedicated column). */
function parsePrizeSplits(csv) {
  return (csv || "70,20,10")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function tierInfo(settings, tier) {
  if (tier === "base") return { price: settings.base_price, emoji: settings.base_emoji, label: "Base Ticket" };
  if (tier === "elite") return { price: settings.elite_price, emoji: settings.elite_emoji, label: "Elite Ticket" };
  return { price: settings.vip_price, emoji: settings.vip_emoji, label: "VIP Ticket" };
}

function buyRow(frozen) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("jackpot:buy:base").setLabel("Buy Base Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary).setDisabled(frozen),
    new ButtonBuilder().setCustomId("jackpot:buy:elite").setLabel("Buy Elite Ticket").setEmoji("🎟️").setStyle(ButtonStyle.Success).setDisabled(frozen),
    new ButtonBuilder().setCustomId("jackpot:buy:vip").setLabel("Buy VIP Ticket").setEmoji("💎").setStyle(ButtonStyle.Danger).setDisabled(frozen)
  );
  return row;
}

/** Live-updating progressive embed - pool status, entry counters, and THIS player's own dynamically recalculated win percentage (ticket_count / total_tickets), per the spec's exact wording. */
function buildJackpotView(guildId, discordId, settings, pot) {
  const currency = currencyFor(guildId, settings.currency_id);
  const entrants = db.listJackpotEntrants(guildId);
  const myTickets = entrants.find((e) => e.discord_id === discordId)?.tickets || 0;
  const myOdds = pot.total_tickets > 0 ? Math.round((myTickets / pot.total_tickets) * 10000) / 100 : 0;
  const frozen = pot.status === "frozen" || pot.pool_amount >= settings.max_pool_ceiling;
  const pct = Math.min(100, Math.round((pot.pool_amount / settings.max_pool_ceiling) * 100));

  const lines = [
    `**Pool:** ${fmtAmount(currency, pot.pool_amount)} / ${fmtAmount(currency, settings.max_pool_ceiling)} (**${pct}%**)`,
    `**Total Tickets Sold:** ${pot.total_tickets}`,
    `**Entrants:** ${entrants.length}`,
    `**Your Tickets:** ${myTickets} (**${myOdds}%** win chance)`,
    "",
    `${tierInfo(settings, "base").emoji} Base Ticket - **${fmtAmount(currency, settings.base_price)}**`,
    `${tierInfo(settings, "elite").emoji} Elite Ticket - **${fmtAmount(currency, settings.elite_price)}**`,
    `${tierInfo(settings, "vip").emoji} VIP Ticket - **${fmtAmount(currency, settings.vip_price)}**`,
  ];
  if (frozen) lines.push("", "🧊 **Entry is frozen** - the pot has hit its ceiling and is being drawn right now. Check back in a moment for a fresh pot.");

  const embed = (frozen ? dangerEmbed : infoEmbed)("🎰 The Ticket Jackpot", lines.join("\n"));
  return { embeds: [embed], components: [buyRow(frozen)] };
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup). Pro+ feature (2026-10-11 tier update). */
async function startOrResume(interaction, server) {
  if (!(await requirePlan(interaction, "pro", "The Ticket Jackpot"))) return;
  const guildId = interaction.guildId;
  const settings = db.getJackpotSettings(guildId);
  if (!settings?.currency_id) {
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [dangerEmbed("Not Set Up", "The Ticket Jackpot hasn't been configured yet - ask staff to set it up via the Games Panel's Configure button.")], components: [backRow] });
    return;
  }
  const pot = db.getOrOpenJackpot(guildId);
  await interaction.update(buildJackpotView(guildId, interaction.user.id, settings, pot));
}

/** Weighted draw without replacement - mirrors the "no safe default exists, so an explicit decision" convention this codebase documents elsewhere (e.g. gamesPanel.js's Quick Setup header) rather than silently picking an arbitrary tie-break. */
function drawWinners(entrants, placeCount) {
  const pool = entrants.map((e) => ({ discordId: e.discord_id, tickets: e.tickets }));
  const winners = [];
  for (let place = 0; place < placeCount && pool.length > 0; place++) {
    const total = pool.reduce((sum, e) => sum + e.tickets, 0);
    let roll = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].tickets;
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    winners.push(pool[idx].discordId);
    pool.splice(idx, 1);
  }
  return winners;
}

/** Resolves the pot the instant it's frozen - draws winners, pays out prize_splits %, reopens a fresh pot at 0. Returns the result lines for the triggering buyer's own view. */
function resolveJackpot(guildId, settings) {
  const entrants = db.listJackpotEntrants(guildId);
  const pot = db.getJackpot(guildId);
  const splits = parsePrizeSplits(settings.prize_splits);
  const currency = currencyFor(guildId, settings.currency_id);
  const winners = drawWinners(entrants, splits.length);

  const lines = [];
  winners.forEach((discordId, i) => {
    const share = Math.round(pot.pool_amount * (splits[i] / 100) * 100) / 100;
    db.grantFromSupply(guildId, settings.currency_id, discordId, share);
    publishGameCompleted({ guildId, discordId, gameKey: GAME_KEY, won: true, wager: 0, payout: share, sourceId: `jackpot:${guildId}:${pot.started_at}:${i}` });
    lines.push(`🏆 **Place ${i + 1}:** <@${discordId}> wins **${fmtAmount(currency, share)}**!`);
  });
  if (!winners.length) lines.push("The pot hit its ceiling but nobody bought a ticket - no winners this round.");

  db.closeJackpotAndReopen(guildId);
  return lines;
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "refresh") {
    const settings = db.getJackpotSettings(guildId);
    if (!settings?.currency_id) {
      await interaction.update({ embeds: [dangerEmbed("Not Set Up", "The Ticket Jackpot isn't configured anymore.")], components: [] });
      return;
    }
    await interaction.update(buildJackpotView(guildId, interaction.user.id, settings, db.getOrOpenJackpot(guildId)));
    return;
  }
  if (action === "buy") {
    const tier = parts[2];
    const settings = db.getJackpotSettings(guildId);
    if (!settings?.currency_id) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "The Ticket Jackpot isn't configured anymore.")], ephemeral: true });
      return;
    }
    const pot = db.getOrOpenJackpot(guildId);
    if (pot.status === "frozen" || pot.pool_amount >= settings.max_pool_ceiling) {
      await interaction.update(buildJackpotView(guildId, interaction.user.id, settings, pot));
      return;
    }

    const modal = new ModalBuilder().setCustomId(`jackpot:buy_modal:${tier}`).setTitle(`${tierInfo(settings, tier).label}s`);
    const qtyInput = new TextInputBuilder()
      .setCustomId("quantity")
      .setLabel(`How many ${tierInfo(settings, tier).label}(s)? (${fmtAmount(currencyFor(guildId, settings.currency_id), tierInfo(settings, tier).price)} each)`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue("1");
    modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
    await interaction.showModal(modal);
    return;
  }
}

// NOTE: the admin Configure modals built above (ticketsModal/poolModal) use
// the "gamespanel:cfg_jackpot_*" customId prefix, not "jackpot:" - like
// every sibling game's admin modal (see e.g. utils/vaultHeist.js's
// rewardsModal/combatModal), the field-reading/db-write logic for those
// lives in utils/gamesPanel.js's handleModal (which is what that customId
// prefix actually dispatches to), NOT here. Only this game's PLAYER-facing
// "jackpot:buy_modal:*" modal is handled in this file.
async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  if (action !== "buy_modal") return;
  const tier = parts[2];
  const guildId = interaction.guildId;
  const quantity = Math.floor(Number(interaction.fields.getTextInputValue("quantity")));

  if (!Number.isFinite(quantity) || quantity <= 0) {
    await interaction.reply({ embeds: [dangerEmbed("Invalid Quantity", "Enter a positive whole number of tickets.")], ephemeral: true });
    return;
  }
  await interaction.deferUpdate();

  const settings = db.getJackpotSettings(guildId);
  if (!settings?.currency_id) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "The Ticket Jackpot isn't configured anymore.")], components: [] });
    return;
  }
  const pot = db.getOrOpenJackpot(guildId);
  if (pot.status === "frozen" || pot.pool_amount >= settings.max_pool_ceiling) {
    await interaction.editReply(buildJackpotView(guildId, interaction.user.id, settings, pot));
    return;
  }

  const { price, label } = tierInfo(settings, tier);
  const cost = Math.round(price * quantity * 100) / 100;
  const currency = currencyFor(guildId, settings.currency_id);
  const wallet = db.getWallet(guildId, interaction.user.id, settings.currency_id);
  if (wallet.balance < cost) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `${quantity}x ${label} costs **${fmtAmount(currency, cost)}** - you only have **${wallet.balance}**.`)], components: [] });
    return;
  }

  db.adjustWallet(guildId, interaction.user.id, settings.currency_id, -cost);
  const updatedPot = db.buyJackpotTickets(guildId, interaction.user.id, tier, quantity, cost);

  const resultLines = [`You bought **${quantity}x ${label}** for **${fmtAmount(currency, cost)}**.`];

  if (updatedPot.pool_amount >= settings.max_pool_ceiling) {
    db.setJackpotStatus(guildId, "frozen");
    resultLines.push("", "🧊 **The pot just hit its ceiling - drawing winners now!**", ...resolveJackpot(guildId, settings));
    await interaction.editReply({ embeds: [successEmbed("🎰 The Ticket Jackpot", resultLines.join("\n"))], components: [] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed("🎰 Ticket Purchased", resultLines.join("\n"))],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("jackpot:refresh").setLabel("🔄 View Pot").setStyle(ButtonStyle.Secondary))],
  });
}

// ---------------------------------------------------------------------------
// Configure flow helpers (called from utils/gamesPanel.js) - Doc 2's
// "Admin Configuration Flow: clicking Configure -> Jackpot launches a Modal
// to receive: Custom Tier Emojis (CSV), Max Pool Ceiling Cap (integer),
// Ticket Base Prices (CSV), Prize Split Vectors (CSV)" - split across 2
// modals here (currency+prices+emojis, then ceiling+splits) since Discord
// hard-caps a modal at 5 text inputs and this needs 7 fields total, same
// "split across steps when a single modal can't fit everything" convention
// as utils/vaultHeist.js's rewardsModal/combatModal split.
// ---------------------------------------------------------------------------

function adminMenu(guildId) {
  const settings = db.getJackpotSettings(guildId);
  const status = settings?.currency_id
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name || "not set"}**\n` +
      `${settings.base_emoji} Base: **${settings.base_price}** | ${settings.elite_emoji} Elite: **${settings.elite_price}** | ${settings.vip_emoji} VIP: **${settings.vip_price}**\n` +
      `Max pool ceiling: **${settings.max_pool_ceiling}**\nPrize splits: **${settings.prize_splits}%**`
    : "_Not set up yet - set a currency and ticket prices below before players can buy in._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_jackpot_set_tickets").setLabel("Set Currency & Tickets").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_jackpot_set_pool").setLabel("Set Pool Ceiling & Splits").setStyle(ButtonStyle.Secondary));
  const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_back_to_game_select").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
  return { embeds: [infoEmbed("Configure: The Ticket Jackpot", status)], components: [row1, row2, row3] };
}

function ticketsModal(guildId) {
  const settings = db.getJackpotSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_jackpot_tickets_modal").setTitle("Currency & Ticket Tiers");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings?.currency_name) currencyInput.setValue(settings.currency_name);
  const pricesInput = new TextInputBuilder().setCustomId("prices").setLabel("Base,Elite,VIP ticket prices (CSV)").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${settings?.base_price ?? 10},${settings?.elite_price ?? 50},${settings?.vip_price ?? 200}`);
  const emojisInput = new TextInputBuilder().setCustomId("emojis").setLabel("Base,Elite,VIP tier emojis (CSV)").setStyle(TextInputStyle.Short).setRequired(true).setValue(`${settings?.base_emoji ?? "🎫"},${settings?.elite_emoji ?? "🎟️"},${settings?.vip_emoji ?? "💎"}`);
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(pricesInput), new ActionRowBuilder().addComponents(emojisInput));
  return modal;
}

function poolModal(guildId) {
  const settings = db.getJackpotSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_jackpot_pool_modal").setTitle("Pool Ceiling & Prize Splits");
  const ceilingInput = new TextInputBuilder().setCustomId("ceiling").setLabel("Max Pool Ceiling (integer)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.max_pool_ceiling ?? 10000));
  const splitsInput = new TextInputBuilder()
    .setCustomId("splits")
    .setLabel("Prize split % per place (CSV, e.g. 70,20,10)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(settings?.prize_splits ?? "70,20,10");
  modal.addComponents(new ActionRowBuilder().addComponents(ceilingInput), new ActionRowBuilder().addComponents(splitsInput));
  return modal;
}

module.exports = { startOrResume, handleComponent, handleModal, buildJackpotView, adminMenu, ticketsModal, poolModal };

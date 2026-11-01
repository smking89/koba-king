"use strict";

/**
 * Treasure Slots - a 3-reel slot game, single-spin resolution (no
 * persisted run, unlike Grid Minefield/Tower Climb's cash-out-anytime
 * state machine - see schema.sql's treasure_slots_settings header). Reel
 * odds/payout table are fixed code (config/treasureSlots.js), not
 * admin-configurable.
 *
 * Payout is reward CREATION (the house has no wallet to debit), so a win
 * routes through db.grantFromSupply (supply-cap aware), matching this
 * codebase's established mint-vs-transfer convention - the wager debit
 * itself is a plain adjustWallet (moving the player's own existing coins
 * out, not creating anything).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { spin } = require("../config/treasureSlots");
const { renderSlotResult } = require("./treasureSlotsImage");
const { listBetOptions, buildCurrencyPickRow } = require("./gameWagerCurrency");
const { publishGameCompleted } = require("./gameEvents");
const { rollBonusDrop } = require("./scrapMerchant");

const GAME_KEY = "treasure_slots";

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("treasureslots:play_again").setLabel("🔁 Spin Again").setStyle(ButtonStyle.Primary));
}

function buildWagerModal(option) {
  const modal = new ModalBuilder().setCustomId(`treasureslots:wager_modal:${option.currencyId}`).setTitle("Place Your Bet");
  const rangeLabel = `Wager (Min ${option.minBet} - Max ${option.maxBet})`;
  const wagerInput = new TextInputBuilder()
    .setCustomId("wager")
    .setLabel(rangeLabel.length <= 45 ? rangeLabel : "How much to wager?")
    .setPlaceholder(`${option.minBet}-${option.maxBet} ${option.emoji || ""} ${option.name}`.replace(/\s+/g, " ").trim())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(12);
  modal.addComponents(new ActionRowBuilder().addComponents(wagerInput));
  return modal;
}

async function beginWager(interaction, guildId, server) {
  const settings = db.getTreasureSlotsSettings(guildId);
  const options = listBetOptions(guildId, GAME_KEY, settings);
  if (options.length > 1) {
    await interaction.update({
      embeds: [infoEmbed("Treasure Slots", "Which currency do you want to wager?")],
      components: [buildCurrencyPickRow(`treasureslots:currency_pick:${server}`, options), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))],
    });
    return;
  }
  await interaction.showModal(buildWagerModal(options[0]));
}

/** Play-flow entry point (utils/gamesPanel.js's startGameSetup). No active-run concept to resume - every spin fully resolves within its own interaction. */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getTreasureSlotsSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [dangerEmbed("Not Set Up", "Treasure Slots hasn't been configured yet - ask staff to set a currency and bet range via the Games Panel's Configure button.")], components: [backRow] });
    return;
  }
  await beginWager(interaction, guildId, server);
}

/** Validates the wager, charges it, spins, pays out a win via grantFromSupply, and returns the response payload. Shared by the modal submit and the Play Again button. */
async function resolveSpin(interaction, currencyId, wager) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const settings = db.getTreasureSlotsSettings(guildId);
  const currency = currencyFor(guildId, currencyId);

  if (!Number.isFinite(wager) || wager <= 0) return { error: "Enter a positive wager amount." };
  if (wager < settings.min_bet || wager > settings.max_bet) {
    return { error: `Treasure Slots only accepts wagers between **${settings.min_bet}** and **${settings.max_bet}**.` };
  }
  const wallet = db.getWallet(guildId, userId, currencyId);
  if (wallet.balance < wager) {
    return { error: `You're trying to wager **${fmtAmount(currency, wager)}** but only have **${fmtAmount(currency, wallet.balance)}**.` };
  }

  db.adjustWallet(guildId, userId, currencyId, -wager);

  const { reels, multiplier, matchedSymbol } = spin();
  const isJackpot = matchedSymbol?.key === "jackpot" && multiplier === matchedSymbol.threeMultiplier;
  const rawPayout = Math.round(wager * multiplier * 100) / 100;
  const granted = rawPayout > 0 ? db.grantFromSupply(guildId, currencyId, userId, rawPayout).granted : 0;

  publishGameCompleted({ guildId, discordId: userId, gameKey: GAME_KEY, won: granted > 0, wager, payout: granted, sourceId: `treasure_slots:${guildId}:${userId}:${Date.now()}:${Math.random()}` });

  const image = await renderSlotResult({ reels, multiplier, isJackpot });
  const attachment = new AttachmentBuilder(image, { name: "slots.png" });

  const scrapDrop = multiplier > 0 ? rollBonusDrop(guildId, userId) : null;
  const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";
  const clampedNote = rawPayout > 0 && granted < rawPayout ? `\n\n⚠️ This currency's supply ceiling capped your payout to **${fmtAmount(currency, granted)}** (would have been ${fmtAmount(currency, rawPayout)}).` : "";

  const resultLine =
    granted > 0
      ? `${matchedSymbol.label} ${multiplier === matchedSymbol.threeMultiplier ? "x3" : "x2"} - you won **${fmtAmount(currency, granted)}**!${scrapNote}${clampedNote}`
      : `No match - you lost your **${fmtAmount(currency, wager)}** wager. Better luck next spin!`;

  const embed = (granted > 0 ? successEmbed("Treasure Slots", resultLine) : infoEmbed("Treasure Slots", resultLine)).setImage("attachment://slots.png");
  return { embeds: [embed], files: [attachment], components: [playAgainRow()], currencyId };
}

async function handleModal(interaction) {
  const [, action, currencyIdRaw] = interaction.customId.split(":");
  if (action !== "wager_modal") return;
  await interaction.deferReply();
  const wager = Number(interaction.fields.getTextInputValue("wager").trim());
  const result = await resolveSpin(interaction, Number(currencyIdRaw), wager);
  if (result.error) {
    await interaction.editReply({ embeds: [dangerEmbed("Can't Spin", result.error)] });
    return;
  }
  await interaction.editReply({ embeds: result.embeds, files: result.files, components: result.components });
}

async function handleComponent(interaction) {
  const [, action] = interaction.customId.split(":");

  if (action === "currency_pick") {
    const currencyId = Number(interaction.values[0]);
    const settings = db.getTreasureSlotsSettings(interaction.guildId);
    const options = listBetOptions(interaction.guildId, GAME_KEY, settings);
    const option = options.find((o) => o.currencyId === currencyId);
    await interaction.showModal(buildWagerModal(option));
    return;
  }

  if (action === "play_again") {
    const guildId = interaction.guildId;
    const settings = db.getTreasureSlotsSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "Treasure Slots hasn't been configured yet.")], ephemeral: true });
      return;
    }
    const options = listBetOptions(guildId, GAME_KEY, settings);
    await interaction.showModal(buildWagerModal(options[0]));
    return;
  }
}

module.exports = { startOrResume, handleComponent, handleModal, buildWagerModal };

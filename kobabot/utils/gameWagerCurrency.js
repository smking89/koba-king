"use strict";

/**
 * Shared multi-currency wager support for Defuse Wire / Grid Minefield /
 * Tower Climb (added 2026-09-19, per explicit user request: players should
 * see a dropdown of every currency an admin set up for a game, not always
 * whichever single one the game's own *_settings row hardcodes). Each
 * game's original *_settings row (defuse_wire_settings etc.) stays exactly
 * as-is and is always "the primary currency" (option #1, backward
 * compatible with every existing single-currency guild) - this module adds
 * ADDITIONAL currency+range pairs on top, stored in game_currency_bets.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");

/** Every currency a player could bet in for this game - the primary settings row (if configured) plus any additional game_currency_bets rows. */
function listBetOptions(guildId, gameKey, primarySettings) {
  const options = [];
  if (primarySettings) {
    options.push({
      currencyId: primarySettings.currency_id,
      name: primarySettings.currency_name,
      emoji: primarySettings.currency_emoji,
      minBet: primarySettings.min_bet,
      maxBet: primarySettings.max_bet,
      isPrimary: true,
    });
  }
  for (const row of db.listGameCurrencyBets(guildId, gameKey)) {
    if (options.some((o) => o.currencyId === row.currency_id)) continue; // primary re-added as an "extra" - keep the primary version
    options.push({ currencyId: row.currency_id, name: row.currency_name, emoji: row.currency_emoji, minBet: row.min_bet, maxBet: row.max_bet, isPrimary: false });
  }
  return options;
}

/** Player-facing currency picker, shown only when 2+ currencies are configured - a single-currency guild skips straight to the wager modal exactly as before. */
function buildCurrencyPickRow(customIdPrefix, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customIdPrefix)
    .setPlaceholder("Which currency?")
    .addOptions(options.slice(0, 25).map((o) => ({ label: `${o.emoji || ""} ${o.name}`.trim(), description: `Bet ${o.minBet}-${o.maxBet}`, value: String(o.currencyId) })));
  return new ActionRowBuilder().addComponents(menu);
}

/** Admin-facing "Manage Currencies" view for a game - lists every configured currency + range, with Add/Remove controls. `backCustomId` returns to that game's own admin menu. */
function manageCurrenciesView(guildId, gameKey, gameLabel, primarySettings, backCustomId) {
  const options = listBetOptions(guildId, gameKey, primarySettings);
  const lines = options.length
    ? options.map((o) => `${o.isPrimary ? "⭐ " : ""}**${o.emoji || ""} ${o.name}** - ${o.minBet} to ${o.maxBet}`)
    : ["_No currencies configured yet - set the primary one via \"Set Bet & Currency\" first._"];
  const embed = infoEmbed(`${gameLabel} - Currencies`, `${lines.join("\n")}\n\n⭐ = primary currency (set via Set Bet & Currency).`);

  const rows = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamecurrency:add:${gameKey}`).setLabel("➕ Add Currency").setStyle(ButtonStyle.Success))];
  const removable = options.filter((o) => !o.isPrimary);
  if (removable.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`gamecurrency:remove_select:${gameKey}`)
          .setPlaceholder("Remove a currency")
          .addOptions(removable.slice(0, 25).map((o) => ({ label: `${o.emoji || ""} ${o.name}`.trim(), value: String(o.currencyId) })))
      )
    );
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(backCustomId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components: rows };
}

/** Currency select shown when adding a new one - excludes whatever's already configured. */
function addCurrencySelectView(guildId, gameKey, backCustomId) {
  const existing = new Set(listBetOptions(guildId, gameKey, null).map((o) => o.currencyId));
  const currencies = db.listCurrencies(guildId).filter((c) => !existing.has(c.id));
  if (!currencies.length) {
    return { embeds: [dangerEmbed("No More Currencies", "Every configured currency is already added, or none exist yet - create one via /shop-panel first.")], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(backCustomId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))] };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`gamecurrency:add_select:${gameKey}`)
    .setPlaceholder("Which currency?")
    .addOptions(currencies.slice(0, 25).map((c) => ({ label: `${c.emoji || ""} ${c.name}`.trim(), value: String(c.id) })));
  return { embeds: [infoEmbed("Add Currency", "Pick a currency, then set its bet range.")], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(backCustomId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))] };
}

function addCurrencyRangeModal(gameKey, currencyId) {
  const modal = new ModalBuilder().setCustomId(`gamecurrency:add_modal:${gameKey}:${currencyId}`).setTitle("Set Bet Range");
  const minInput = new TextInputBuilder().setCustomId("min").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12);
  const maxInput = new TextInputBuilder().setCustomId("max").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12);
  modal.addComponents(new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

/** Registry of the 3 wager games this module supports - kept here (not in utils/gamesPanel.js) to avoid a circular require, since gamesPanel.js requires THIS module for the player-facing picker. */
const GAME_REGISTRY = {
  defuse_wire: { label: "The Defuse Wire", getSettings: db.getDefuseWireSettings },
  grid_minefield: { label: "The Grid Minefield", getSettings: db.getGridMinefieldSettings },
  tower_climb: { label: "Tower Climb", getSettings: db.getTowerClimbSettings },
};

function backCustomId(gameKey) {
  return `gamespanel:cfg_reopen:${gameKey}`;
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const gameKey = parts[2];
  const guildId = interaction.guildId;
  const game = GAME_REGISTRY[gameKey];
  if (!game) return;

  if (action === "manage") {
    await interaction.update(manageCurrenciesView(guildId, gameKey, game.label, game.getSettings(guildId), backCustomId(gameKey)));
    return;
  }
  if (action === "add") {
    await interaction.update(addCurrencySelectView(guildId, gameKey, `gamecurrency:manage:${gameKey}`));
    return;
  }
  if (action === "add_select") {
    await interaction.showModal(addCurrencyRangeModal(gameKey, Number(interaction.values[0])));
    return;
  }
  if (action === "remove_select") {
    db.removeGameCurrencyBet(guildId, gameKey, Number(interaction.values[0]));
    await interaction.update(manageCurrenciesView(guildId, gameKey, game.label, game.getSettings(guildId), backCustomId(gameKey)));
    return;
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const gameKey = parts[2];
  const currencyId = Number(parts[3]);
  const guildId = interaction.guildId;
  const game = GAME_REGISTRY[gameKey];
  if (!game) return;

  if (action === "add_modal") {
    await interaction.deferUpdate();
    const min = Number(interaction.fields.getTextInputValue("min"));
    const max = Number(interaction.fields.getTextInputValue("max"));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Range", "Enter a valid min/max (min ≤ max, both ≥ 0).")], components: [] });
      return;
    }
    db.setGameCurrencyBet(guildId, gameKey, currencyId, min, max);
    await interaction.editReply(manageCurrenciesView(guildId, gameKey, game.label, game.getSettings(guildId), backCustomId(gameKey)));
    return;
  }
}

module.exports = { listBetOptions, buildCurrencyPickRow, manageCurrenciesView, addCurrencySelectView, addCurrencyRangeModal, handleComponent, handleModal, GAME_REGISTRY };

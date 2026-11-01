"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { rollBonusDrop } = require("./scrapMerchant");
const { publishGameCompleted } = require("./gameEvents");
const { listBetOptions, buildCurrencyPickRow } = require("./gameWagerCurrency");

const GAME_KEY = "grid_minefield";

// Fixed grid rules - see schema.sql's header comment on grid_minefield_settings
// for why these aren't admin-configurable (keeps the actual odds/house-edge
// consistent and not misconfigurable into something unfair).
const GRID_SIZE = 16; // 4x4
const GRID_COLS = 4;
const TRAP_COUNT = 3;
const STAR_MULTIPLIER = 1.25;

/** Fisher-Yates shuffle of TRAP_COUNT traps among GRID_SIZE cells - a fresh layout every run, never reused. */
function rollCellStates() {
  const cells = Array.from({ length: GRID_SIZE }, (_, i) => (i < TRAP_COUNT ? "trap" : "star"));
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

/** Resolves the real currency a specific run is using - NOT always the guild's primary configured currency, now that multi-currency wagers exist (see utils/gameWagerCurrency.js). */
function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

/** Grid buttons - GRID_SIZE/GRID_COLS rows of cell buttons, plus one final row with Cash Out. Revealed cells render disabled with a star; everything else is still a live, unrevealed button. Bomb-revealing (loss) is handled by buildRevealedGrid instead. */
function buildGridRows(runId, revealed) {
  const revealedSet = new Set(revealed);
  const rows = [];
  for (let r = 0; r < GRID_SIZE / GRID_COLS; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      const isRevealed = revealedSet.has(i);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gridmine:cell:${runId}:${i}`)
          .setLabel(isRevealed ? "⭐" : "❓")
          .setStyle(isRevealed ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(isRevealed)
      );
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gridmine:cashout:${runId}`).setLabel("💰 Cash Out").setStyle(ButtonStyle.Success)));
  return rows;
}

/** Full end-of-run reveal (hit a trap) - every cell shown, disabled, traps/stars marked for real. */
function buildRevealedGrid(runId, cellStates, revealed) {
  const revealedSet = new Set(revealed);
  const rows = [];
  for (let r = 0; r < GRID_SIZE / GRID_COLS; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      const isTrap = cellStates[i] === "trap";
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gridmine:revealed:${runId}:${i}`)
          .setLabel(isTrap ? "💥" : revealedSet.has(i) ? "⭐" : "🌟")
          .setStyle(isTrap ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(true)
      );
    }
    rows.push(row);
  }
  return rows;
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gridmine:play_again").setLabel("🔁 Play Again").setStyle(ButtonStyle.Primary));
}

function buildRoundView(run, currency) {
  const revealed = JSON.parse(run.revealed);
  const embed = infoEmbed(
    "🎰 The Grid Minefield",
    `Pool: **${fmtAmount(currency, run.pool)}**\nStars revealed: **${revealed.length}** / ${GRID_SIZE - TRAP_COUNT}\n\nReveal a cell - most are safe stars, 3 are hidden traps. Cash out any time.`
  );
  return { embeds: [embed], components: buildGridRows(run.id, revealed) };
}

/** Same fix and reasoning as utils/defuseWire.js's buildWagerModal - shows the actual min/max instead of leaving it a guessing game. `option` is one entry from utils/gameWagerCurrency.js's listBetOptions (added 2026-09-19 for multi-currency support). */
function buildWagerModal(option) {
  const modal = new ModalBuilder().setCustomId(`gridmine:wager_modal:${option.currencyId}`).setTitle("Place Your Bet");
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

/** Shows the currency picker (2+ currencies configured) or jumps straight to the wager modal (exactly 1, same as every guild before multi-currency existed). */
async function beginWager(interaction, guildId, server) {
  const settings = db.getGridMinefieldSettings(guildId);
  const options = listBetOptions(guildId, GAME_KEY, settings);
  if (options.length > 1) {
    await interaction.update({
      embeds: [infoEmbed("The Grid Minefield", "Which currency do you want to wager?")],
      components: [buildCurrencyPickRow(`gridmine:currency_pick:${server}`, options), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))],
    });
    return;
  }
  await interaction.showModal(buildWagerModal(options[0]));
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup) - resumes an in-progress run if one exists, otherwise shows the currency picker/wager modal. Same reasoning as utils/defuseWire.js's startOrResume. */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getGridMinefieldSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [dangerEmbed("Not Set Up", "The Grid Minefield hasn't been configured yet - ask staff to set a currency and bet range via the Games Panel's Configure button.")],
      components: [backRow],
    });
    return;
  }

  const activeRun = db.getActiveGridMinefieldRun(guildId, interaction.user.id);
  if (activeRun) {
    await interaction.update(buildRoundView(activeRun, currencyFor(guildId, activeRun.currency_id)));
    return;
  }

  await beginWager(interaction, guildId, server);
}

async function handleWagerModal(interaction) {
  const guildId = interaction.guildId;
  const currencyId = Number(interaction.customId.split(":")[2]);
  const wager = Number(interaction.fields.getTextInputValue("wager"));
  if (!Number.isFinite(wager) || wager <= 0) {
    await interaction.reply({ embeds: [dangerEmbed("Invalid Wager", "Enter a positive number.")], ephemeral: true });
    return;
  }

  // Ephemeral - only the player sees their own run/win/loss, matching the other games.
  await interaction.deferReply({ ephemeral: true });

  const settings = db.getGridMinefieldSettings(guildId);
  if (!settings) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "The Grid Minefield hasn't been configured yet.")] });
    return;
  }
  const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
  if (!option) {
    await interaction.editReply({ embeds: [dangerEmbed("Currency No Longer Available", "That currency isn't configured for The Grid Minefield anymore - try again.")] });
    return;
  }
  if (wager < option.minBet || wager > option.maxBet) {
    await interaction.editReply({ embeds: [dangerEmbed("Bet Out Of Range", `The Grid Minefield only accepts wagers between **${option.minBet}** and **${option.maxBet}** in ${option.name}.`)] });
    return;
  }
  if (db.getActiveGridMinefieldRun(guildId, interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Running", "You already have an active Grid Minefield run - finish that one first.")] });
    return;
  }

  const currency = { name: option.name, emoji: option.emoji };
  const wallet = db.getWallet(guildId, interaction.user.id, currencyId);
  if (wallet.balance < wager) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `You're trying to wager **${fmtAmount(currency, wager)}** but only have **${wallet.balance}**.`)] });
    return;
  }

  db.adjustWallet(guildId, interaction.user.id, currencyId, -wager);
  const runId = db.createGridMinefieldRun(guildId, interaction.user.id, currencyId, wager, rollCellStates());
  const run = db.getGridMinefieldRun(guildId, runId);

  await interaction.editReply(buildRoundView(run, currency));
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "play_again") {
    const settings = db.getGridMinefieldSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "The Grid Minefield isn't configured anymore - ask staff to set it back up.")], ephemeral: true });
      return;
    }
    const options = listBetOptions(guildId, GAME_KEY, settings);
    if (options.length > 1) {
      await interaction.update({
        embeds: [infoEmbed("The Grid Minefield", "Which currency do you want to wager?")],
        components: [buildCurrencyPickRow("gridmine:currency_pick", options)],
      });
      return;
    }
    await interaction.showModal(buildWagerModal(options[0]));
    return;
  }
  if (action === "currency_pick") {
    const currencyId = Number(interaction.values[0]);
    const settings = db.getGridMinefieldSettings(guildId);
    const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
    if (!option) {
      await interaction.update({ embeds: [dangerEmbed("Not Available", "That currency isn't configured anymore.")], components: [] });
      return;
    }
    await interaction.showModal(buildWagerModal(option));
    return;
  }
  if (action === "revealed") {
    // Disabled buttons on the final post-loss grid - nothing to do, but Discord still requires an ack if one ever slips through (e.g. a stale client).
    await interaction.deferUpdate().catch(() => {});
    return;
  }

  const runId = Number(parts[2]);
  const run = db.getGridMinefieldRun(guildId, runId);
  if (!run || run.status !== "active") {
    await interaction.reply({ embeds: [dangerEmbed("Run Over", "This Grid Minefield run isn't active anymore.")], ephemeral: true });
    return;
  }
  if (run.discord_id !== interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Yours", "This isn't your grid to clear.")], ephemeral: true });
    return;
  }
  const currency = currencyFor(guildId, run.currency_id);

  if (action === "cell") {
    const cellIndex = Number(parts[3]);
    const cellStates = JSON.parse(run.cell_states);
    const revealed = JSON.parse(run.revealed);

    if (revealed.includes(cellIndex)) {
      await interaction.reply({ embeds: [dangerEmbed("Already Revealed", "That cell's already been cleared.")], ephemeral: true });
      return;
    }

    if (cellStates[cellIndex] === "trap") {
      db.closeGridMinefieldRun(runId, "exploded");
      publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "grid_minefield", won: false, wager: run.wager, payout: 0, sourceId: `grid_minefield_run:${runId}` });
      const embed = dangerEmbed("💥 BOOM!", `That cell was a trap - you lost everything.\n\nLost: **${fmtAmount(currency, run.pool)}**`);
      await interaction.update({ embeds: [embed], components: [...buildRevealedGrid(runId, cellStates, revealed), playAgainRow()] });
      return;
    }

    const newRevealed = [...revealed, cellIndex];
    const newPool = run.pool * STAR_MULTIPLIER;
    db.revealGridMinefieldCell(runId, newPool, newRevealed);

    if (newRevealed.length === GRID_SIZE - TRAP_COUNT) {
      // Every star found - nothing left to reveal, auto-cash-out rather than leaving an empty grid with only a Cash Out button.
      db.grantFromSupply(guildId, run.currency_id, interaction.user.id, newPool);
      db.closeGridMinefieldRun(runId, "cashed_out");
      publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "grid_minefield", won: true, wager: run.wager, payout: newPool, sourceId: `grid_minefield_run:${runId}` });
      const embed = successEmbed("🌟 Cleared The Whole Grid!", `Every star found - you walked away with **${fmtAmount(currency, newPool)}**.`);
      await interaction.update({ embeds: [embed], components: [playAgainRow()] });
      return;
    }

    const updatedRun = { ...run, pool: newPool, revealed: JSON.stringify(newRevealed) };
    await interaction.update(buildRoundView(updatedRun, currency));
    return;
  }

  if (action === "cashout") {
    db.grantFromSupply(guildId, run.currency_id, interaction.user.id, run.pool);
    db.closeGridMinefieldRun(runId, "cashed_out");
    publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "grid_minefield", won: true, wager: run.wager, payout: run.pool, sourceId: `grid_minefield_run:${runId}` });
    const revealed = JSON.parse(run.revealed);

    // The Scrap Merchant - cashing out counts as a win, same as every other
    // game's payout point (see utils/scrapMerchant.js's rollBonusDrop).
    const scrapDrop = rollBonusDrop(guildId, interaction.user.id);
    const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";

    const embed = successEmbed("💰 Cashed Out!", `You walked away with **${fmtAmount(currency, run.pool)}** after finding **${revealed.length}** star(s).${scrapNote}`);
    await interaction.update({ embeds: [embed], components: [playAgainRow()] });
    return;
  }
}

async function handleModal(interaction) {
  const action = interaction.customId.split(":")[1];
  if (action === "wager_modal") return handleWagerModal(interaction);
}

module.exports = { startOrResume, handleComponent, handleModal, buildWagerModal };

"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { rollBonusDrop } = require("./scrapMerchant");
const { publishGameCompleted } = require("./gameEvents");
const { listBetOptions, buildCurrencyPickRow } = require("./gameWagerCurrency");

const MULTIPLIER = 2;
const GAME_KEY = "defuse_wire";

// Fixed wire slots - 2 safe, 1 multiplier, 1 bomb - see schema.sql's header
// comment on defuse_wire_settings for why this ratio isn't admin-configurable.
const WIRE_STYLES = [
  { label: "Red Wire", emoji: "🔴", style: ButtonStyle.Danger },
  { label: "Blue Wire", emoji: "🔵", style: ButtonStyle.Primary },
  { label: "Green Wire", emoji: "🟢", style: ButtonStyle.Success },
  { label: "Yellow Wire", emoji: "🟡", style: ButtonStyle.Secondary },
];

/** Fisher-Yates shuffle of the fixed 4-outcome set - a fresh roll every round, never reused. */
function rollWireOutcomes() {
  const outcomes = ["safe", "safe", "multiplier", "bomb"];
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  return outcomes;
}

function wireRow(runId) {
  return new ActionRowBuilder().addComponents(
    WIRE_STYLES.map((w, i) => new ButtonBuilder().setCustomId(`defusewire:wire:${runId}:${i}`).setLabel(w.label).setEmoji(w.emoji).setStyle(w.style))
  );
}

function cashoutRow(runId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`defusewire:cashout:${runId}`).setLabel("💰 Cash Out").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`defusewire:continue:${runId}`).setLabel("✂️ Cut Another Wire").setStyle(ButtonStyle.Danger)
  );
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("defusewire:play_again").setLabel("🔁 Play Again").setStyle(ButtonStyle.Primary));
}

/** Resolves the real currency a specific run is using - NOT always the guild's primary configured currency, now that multi-currency wagers exist (see utils/gameWagerCurrency.js). */
function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${amount} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

/** Live round view for an active run - shared by "start a new run" and "resume after restart". */
function buildRoundView(run, currency) {
  const embed = infoEmbed(
    `💣 The Defuse Wire — Round ${run.rounds_survived + 1}`,
    `Pool: **${fmtAmount(currency, run.pool)}**\n\nCut a wire. 2 are safe, 1 doubles your pool, 1 detonates the bomb.`
  );
  return { embeds: [embed], components: [wireRow(run.id)] };
}

/**
 * FIXED (2026-09-07): the modal used to just ask "How much to wager?" with
 * no indication of the actual allowed range - a player had no way to know
 * the min/max short of guessing and hitting the "Bet Out Of Range" error.
 * Both the label (always visible) and placeholder (currency context) now
 * show it. Label capped at Discord's 45-char field limit - falls back to
 * the old plain label in the (unlikely) case a huge min/max blows past it.
 *
 * `option` is one entry from utils/gameWagerCurrency.js's listBetOptions
 * (added 2026-09-19 for multi-currency support) - its currencyId is
 * threaded through the modal's customId so handleWagerModal knows exactly
 * which currency/range this specific bet was placed against.
 */
function buildWagerModal(option) {
  const modal = new ModalBuilder().setCustomId(`defusewire:wager_modal:${option.currencyId}`).setTitle("Place Your Bet");
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
  const settings = db.getDefuseWireSettings(guildId);
  const options = listBetOptions(guildId, GAME_KEY, settings);
  if (options.length > 1) {
    await interaction.update({
      embeds: [infoEmbed("The Defuse Wire", "Which currency do you want to wager?")],
      components: [buildCurrencyPickRow(`defusewire:currency_pick:${server}`, options), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))],
    });
    return;
  }
  await interaction.showModal(buildWagerModal(options[0]));
}

/**
 * Play-flow entry point (called from utils/gamesPanel.js's startGameSetup)
 * - resumes an in-progress run if one exists (see schema.sql's header on
 * defuse_wire_runs for why a bot restart can't strand it), otherwise shows
 * the currency picker/wager modal. Returns null when it already replied via
 * showModal (can't also interaction.update() the same interaction).
 * @param {string} server - threaded through only so the "Not Set Up" dead
 * end (below) can offer a way back to the game-select step instead of
 * leaving the player stuck on a message with no buttons at all.
 */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getDefuseWireSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [dangerEmbed("Not Set Up", "The Defuse Wire hasn't been configured yet - ask staff to set a currency and bet range via the Games Panel's Configure button.")],
      components: [backRow],
    });
    return;
  }

  const activeRun = db.getActiveDefuseRun(guildId, interaction.user.id);
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

  // Ephemeral - only the player sees their own round/win/loss, matching Lootbox.
  await interaction.deferReply({ ephemeral: true });

  const settings = db.getDefuseWireSettings(guildId);
  if (!settings) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "The Defuse Wire hasn't been configured yet.")] });
    return;
  }
  const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
  if (!option) {
    await interaction.editReply({ embeds: [dangerEmbed("Currency No Longer Available", "That currency isn't configured for The Defuse Wire anymore - try again.")] });
    return;
  }
  if (wager < option.minBet || wager > option.maxBet) {
    await interaction.editReply({ embeds: [dangerEmbed("Bet Out Of Range", `The Defuse Wire only accepts wagers between **${option.minBet}** and **${option.maxBet}** in ${option.name}.`)] });
    return;
  }
  // Re-check for a race (e.g. double-submitted modal) rather than trusting the client not to have one already.
  if (db.getActiveDefuseRun(guildId, interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Running", "You already have an active Defuse Wire run - finish that one first.")] });
    return;
  }

  const currency = { name: option.name, emoji: option.emoji };
  const wallet = db.getWallet(guildId, interaction.user.id, currencyId);
  if (wallet.balance < wager) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `You're trying to wager **${fmtAmount(currency, wager)}** but only have **${wallet.balance}**.`)] });
    return;
  }

  db.adjustWallet(guildId, interaction.user.id, currencyId, -wager);
  const runId = db.createDefuseRun(guildId, interaction.user.id, currencyId, wager, rollWireOutcomes());
  const run = db.getDefuseRun(guildId, runId);

  await interaction.editReply(buildRoundView(run, currency));
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "play_again") {
    const settings = db.getDefuseWireSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "The Defuse Wire isn't configured anymore - ask staff to set it back up.")], ephemeral: true });
      return;
    }
    const options = listBetOptions(guildId, GAME_KEY, settings);
    if (options.length > 1) {
      await interaction.update({
        embeds: [infoEmbed("The Defuse Wire", "Which currency do you want to wager?")],
        components: [buildCurrencyPickRow("defusewire:currency_pick", options)],
      });
      return;
    }
    await interaction.showModal(buildWagerModal(options[0]));
    return;
  }

  if (action === "currency_pick") {
    const currencyId = Number(interaction.values[0]);
    const settings = db.getDefuseWireSettings(guildId);
    const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
    if (!option) {
      await interaction.update({ embeds: [dangerEmbed("Not Available", "That currency isn't configured anymore.")], components: [] });
      return;
    }
    await interaction.showModal(buildWagerModal(option));
    return;
  }

  const runId = Number(parts[2]);
  const run = db.getDefuseRun(guildId, runId);
  if (!run || run.status !== "active") {
    await interaction.reply({ embeds: [dangerEmbed("Run Over", "This Defuse Wire run isn't active anymore.")], ephemeral: true });
    return;
  }
  if (run.discord_id !== interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Yours", "This isn't your bomb to defuse.")], ephemeral: true });
    return;
  }
  const currency = currencyFor(guildId, run.currency_id);

  if (action === "wire") {
    const wireIndex = Number(parts[3]);
    const outcomes = JSON.parse(run.wire_outcomes);
    const outcome = outcomes[wireIndex];

    if (outcome === "bomb") {
      db.closeDefuseRun(runId, "exploded");
      publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "defuse_wire", won: false, wager: run.wager, payout: 0, sourceId: `defuse_wire_run:${runId}` });
      const embed = dangerEmbed("💥 BOOM!", `You cut the wrong wire and lost everything.\n\nLost: **${fmtAmount(currency, run.pool)}**`);
      await interaction.update({ embeds: [embed], components: [playAgainRow()] });
      return;
    }

    const newPool = outcome === "multiplier" ? run.pool * MULTIPLIER : run.pool;
    const nextRound = run.rounds_survived + 1;
    // Roll the NEXT round's outcomes now (not shown until Continue is
    // pressed) but don't advance rounds_survived until they actually choose
    // to continue - Cash Out should credit the round they just survived.
    db.advanceDefuseRun(runId, { pool: newPool, roundsSurvived: run.rounds_survived, wireOutcomes: rollWireOutcomes() });

    const title = outcome === "multiplier" ? "⚡ Multiplier!" : "✅ Safe!";
    const body =
      outcome === "multiplier"
        ? `The wire was clean AND doubled your pool.\n\nPool: **${fmtAmount(currency, newPool)}** (was ${run.pool})`
        : `The wire was clean.\n\nPool: **${fmtAmount(currency, newPool)}**`;
    const embed = successEmbed(title, `${body}\n\nCash out now, or cut into round ${nextRound + 1}?`);
    await interaction.update({ embeds: [embed], components: [cashoutRow(runId)] });
    return;
  }

  if (action === "cashout") {
    db.grantFromSupply(guildId, run.currency_id, interaction.user.id, run.pool);
    db.closeDefuseRun(runId, "cashed_out");
    publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "defuse_wire", won: true, wager: run.wager, payout: run.pool, sourceId: `defuse_wire_run:${runId}` });

    // The Scrap Merchant - cashing out counts as a win, same as every other
    // game's payout point (see utils/scrapMerchant.js's rollBonusDrop).
    const scrapDrop = rollBonusDrop(guildId, interaction.user.id);
    const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";

    const embed = successEmbed("💰 Cashed Out!", `You walked away with **${fmtAmount(currency, run.pool)}** after ${run.rounds_survived + 1} round(s).${scrapNote}`);
    await interaction.update({ embeds: [embed], components: [playAgainRow()] });
    return;
  }

  if (action === "continue") {
    const nextRun = { ...run, rounds_survived: run.rounds_survived + 1 };
    db.advanceDefuseRun(runId, { pool: run.pool, roundsSurvived: nextRun.rounds_survived, wireOutcomes: JSON.parse(run.wire_outcomes) });
    await interaction.update(buildRoundView(nextRun, currency));
    return;
  }
}

async function handleModal(interaction) {
  const action = interaction.customId.split(":")[1];
  if (action === "wager_modal") return handleWagerModal(interaction);
}

module.exports = { startOrResume, handleComponent, handleModal, buildWagerModal };

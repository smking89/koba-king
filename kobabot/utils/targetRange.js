"use strict";

/**
 * The Target Range - solo reaction/skill wager game (Games Panel -> Play,
 * see config/games.js's "target_range" entry, modes: ["solo"]). Entry fee
 * is charged up front (like every other wager game's db.adjustWallet at
 * creation time), then a grid of buttons shuffles on a periodic interval
 * (same "recursive setTimeout chain tied to one ephemeral interaction's
 * edit window" design as utils/recyclerRoulette.js - see that file's header
 * for why this can't meaningfully survive a bot restart, and why that's an
 * acceptable Discord-imposed boundary rather than a bug). A cell click is
 * its own SEPARATE interaction on the same ephemeral message as the
 * shuffle loop's own edits - both just call interaction.update()/editReply()
 * on the same message id, so whichever happens to land last simply wins;
 * since every edit always re-renders the run's current DB state (never a
 * stale diff), this is harmless last-write-wins, not a correctness bug.
 *
 * Leaderboard sync reuses the EXISTING standings-leaderboard image system
 * (utils/categoryLeaderboards.js's runStandingsLeaderboardImageTick) rather
 * than building a parallel leaderboard - target_range_scores (best-ever
 * score per player) is read there via db.getTargetRangeLeaderboard, same
 * "Most X" live-standings pattern as Richest/Most Clan Members.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { publishGameCompleted } = require("./gameEvents");

const GAME_KEY = "target_range";
const MAX_MULTIPLIER = 4;

/** runId -> { handle } - only populated while a round's shuffle loop is actually running, same convention as utils/recyclerRoulette.js's activeLoops. */
const activeLoops = new Map();

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

/** "minScore:payout,minScore:payout" -> [{minScore, payout}], sorted highest minScore first so the first qualifying tier (score >= minScore) found IS the best one. */
function parseLootTable(csv) {
  return (csv || "0:0")
    .split(",")
    .map((pair) => {
      const [minScore, payout] = pair.split(":").map((n) => Number(n.trim()));
      return { minScore, payout };
    })
    .filter((t) => Number.isFinite(t.minScore) && Number.isFinite(t.payout))
    .sort((a, b) => b.minScore - a.minScore);
}

function resolvePayout(lootTable, score) {
  const tier = lootTable.find((t) => score >= t.minScore);
  return tier?.payout ?? 0;
}

function startButtonRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("targetrange:start").setLabel("🎯 Start Training").setStyle(ButtonStyle.Success));
}

function entryView(settings) {
  const currency = currencyFor(settings.guild_id, settings.currency_id);
  const embed = infoEmbed(
    "🎯 The Target Range",
    `Entry fee: **${fmtAmount(currency, settings.entry_fee)}**\nGrid: **${settings.grid_size}x${settings.grid_size}**\nRound length: **${settings.round_seconds}s**\n\nHit the 🎯 before it moves - build a streak multiplier (x2 → x3 → x4) for bigger scores. Missing resets your streak and costs a point.`
  );
  return { embeds: [embed], components: [startButtonRow()] };
}

function gridRows(run) {
  const n = run.grid_size;
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < n; c++) {
      const idx = r * n + c;
      const isTarget = idx === run.target_index;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`targetrange:cell:${run.id}:${idx}`)
          .setLabel(isTarget ? "🎯" : "⬜")
          .setStyle(isTarget ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  return rows;
}

function roundView(run) {
  const secondsLeft = Math.max(0, Math.round((run.round_ends_at - Date.now()) / 1000));
  const embed = infoEmbed("🎯 Target Range", `Score: **${run.score}** | Streak: **x${run.multiplier}** | Time left: **${secondsLeft}s**`);
  return { embeds: [embed], components: gridRows(run) };
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("targetrange:play_again").setLabel("🔁 Play Again").setStyle(ButtonStyle.Primary));
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup). */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getTargetRangeSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [dangerEmbed("Not Set Up", "The Target Range hasn't been configured yet - ask staff to set it up via the Games Panel's Configure button.")], components: [backRow] });
    return;
  }

  const run = db.getActiveTargetRangeRun(guildId, interaction.user.id);
  if (run) {
    if (!activeLoops.has(run.id) || run.round_ends_at <= Date.now()) {
      // No live loop (bot restart) or the round clock already expired with nobody around to finalize it - refund rather than strand the entry fee.
      const currency = currencyFor(guildId, run.currency_id);
      db.adjustWallet(guildId, interaction.user.id, run.currency_id, run.entry_fee);
      db.closeTargetRangeRun(run.id);
      await interaction.update({ embeds: [dangerEmbed("Round Interrupted", `A restart interrupted your last round - your **${fmtAmount(currency, run.entry_fee)}** entry fee was refunded.`)], components: [playAgainRow()] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Still Running", "Your Target Range round is still in progress.")], components: [] });
    return;
  }

  await interaction.update({ ...entryView({ ...settings, guild_id: guildId }) });
}

/** The periodic shuffle loop - every shuffle_interval_ms, re-randomizes target_index (never repeating the same cell twice in a row) and re-renders the grid, until round_ends_at is reached, at which point it finalizes payout + leaderboard sync. */
function runLoop(interaction, run) {
  function scheduleTick() {
    const handle = setTimeout(async () => {
      const current = db.getTargetRangeRun(run.id);
      if (!current || current.status !== "active") {
        activeLoops.delete(run.id);
        return;
      }

      if (Date.now() >= current.round_ends_at) {
        activeLoops.delete(run.id);
        await finalizeRun(interaction, current);
        return;
      }

      const n = current.grid_size;
      let nextIndex = Math.floor(Math.random() * n * n);
      if (n * n > 1) while (nextIndex === current.target_index) nextIndex = Math.floor(Math.random() * n * n);
      db.updateTargetRangeRun(current.id, { score: current.score, multiplier: current.multiplier, targetIndex: nextIndex });
      await interaction.editReply(roundView({ ...current, target_index: nextIndex })).catch(() => {});
      scheduleTick();
    }, run.shuffleIntervalMs);
    activeLoops.set(run.id, { handle });
  }
  scheduleTick();
}

async function finalizeRun(interaction, run) {
  db.closeTargetRangeRun(run.id);
  db.recordTargetRangeScore(run.guild_id, run.discord_id, run.score);
  publishGameCompleted({ guildId: run.guild_id, discordId: run.discord_id, gameKey: GAME_KEY, won: run.score > 0, wager: run.entry_fee, payout: null, sourceId: `target_range_run:${run.id}` });

  const settings = db.getTargetRangeSettings(run.guild_id);
  const lootTable = parseLootTable(settings?.loot_table);
  const payout = resolvePayout(lootTable, run.score);
  if (payout > 0) db.grantFromSupply(run.guild_id, run.currency_id, run.discord_id, payout);

  const currency = currencyFor(run.guild_id, run.currency_id);
  const embed = successEmbed("🎯 Training Complete", `Final Score: **${run.score}**\nPayout: **${fmtAmount(currency, payout)}**`);
  await interaction.editReply({ embeds: [embed], components: [playAgainRow()] }).catch(() => {});
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "play_again") {
    const settings = db.getTargetRangeSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "The Target Range isn't configured anymore.")], ephemeral: true });
      return;
    }
    await interaction.update(entryView({ ...settings, guild_id: guildId }));
    return;
  }

  if (action === "start") {
    const settings = db.getTargetRangeSettings(guildId);
    if (!settings) {
      await interaction.update({ embeds: [dangerEmbed("Not Set Up", "The Target Range isn't configured anymore.")], components: [] });
      return;
    }
    if (db.getActiveTargetRangeRun(guildId, interaction.user.id)) {
      await interaction.update({ embeds: [dangerEmbed("Already Running", "You already have an active round.")], components: [] });
      return;
    }
    const currency = currencyFor(guildId, settings.currency_id);
    const wallet = db.getWallet(guildId, interaction.user.id, settings.currency_id);
    if (wallet.balance < settings.entry_fee) {
      await interaction.update({ embeds: [dangerEmbed("Insufficient Funds", `Entry costs **${fmtAmount(currency, settings.entry_fee)}** - you only have **${wallet.balance}**.`)], components: [] });
      return;
    }
    db.adjustWallet(guildId, interaction.user.id, settings.currency_id, -settings.entry_fee);
    const roundEndsAt = Date.now() + settings.round_seconds * 1000;
    const runId = db.createTargetRangeRun(guildId, interaction.user.id, settings.currency_id, settings.entry_fee, settings.grid_size, roundEndsAt);
    const run = db.getTargetRangeRun(runId);
    await interaction.update(roundView(run));
    runLoop(interaction, { ...run, shuffleIntervalMs: settings.shuffle_interval_ms });
    return;
  }

  if (action === "cell") {
    const runId = Number(parts[2]);
    const clickedIndex = Number(parts[3]);
    const run = db.getTargetRangeRun(runId);
    if (!run || run.status !== "active" || run.discord_id !== interaction.user.id) {
      await interaction.reply({ embeds: [dangerEmbed("Round Over", "This round isn't active anymore.")], ephemeral: true });
      return;
    }
    if (Date.now() >= run.round_ends_at) {
      await interaction.update({ embeds: [infoEmbed("Time's Up", "Finalizing your round...")], components: [] });
      return;
    }

    let { score, multiplier, target_index: targetIndex } = run;
    if (clickedIndex === targetIndex) {
      score += multiplier;
      multiplier = Math.min(MAX_MULTIPLIER, multiplier + 1);
      const n = run.grid_size;
      let nextIndex = Math.floor(Math.random() * n * n);
      if (n * n > 1) while (nextIndex === targetIndex) nextIndex = Math.floor(Math.random() * n * n);
      targetIndex = nextIndex;
    } else {
      score -= 1;
      multiplier = 1;
    }
    db.updateTargetRangeRun(runId, { score, multiplier, targetIndex });
    await interaction.update(roundView({ ...run, score, multiplier, target_index: targetIndex }));
    return;
  }
}

module.exports = { startOrResume, handleComponent };

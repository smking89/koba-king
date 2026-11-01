"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { rollBonusDrop } = require("./scrapMerchant");
const { publishGameCompleted } = require("./gameEvents");
const { listBetOptions, buildCurrencyPickRow } = require("./gameWagerCurrency");

const GAME_KEY = "tower_climb";

/**
 * Fixed floor progression - see schema.sql's header comment on
 * tower_climb_settings for why this isn't admin-configurable (same reasoning
 * as Defuse Wire's wire ratio and Grid Minefield's trap count: keeps the
 * actual odds/house-edge consistent and not misconfigurable into something
 * unfair or -- just as bad -- into a guaranteed player profit).
 *
 * risk[i] is the chance of falling on floor i+1, GIVEN the player already
 * survived every floor before it. multiplier[i] is what the pool becomes
 * (wager * multiplier[i]) if the player has survived through floor i+1 and
 * chooses to cash out right now.
 *
 * House-edge derivation (rule: "document the expected value of the default
 * configuration" - don't just eyeball a progression table): for floor k,
 * let S_k = the cumulative probability of having survived every floor up to
 * and including k. The "fair" (breakeven) multiplier at floor k is 1/S_k -
 * cashing out there would have an expected value of exactly 1x the wager if
 * you played the same run infinitely many times. Multiplying every fair
 * value by 0.96 bakes in a flat 4% house edge at EVERY floor, so there's no
 * "correct" floor to always cash out at that beats the house - cashing out
 * at floor 1 or floor 10 both have the same -4% expected value. Computed
 * once and hardcoded below (see the pruning-cycle's economic-balance
 * requirement in the Tower Climb spec, section 28).
 */
const FLOOR_RISK = [0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.27, 0.32, 0.4];
const FLOOR_MULTIPLIER = [1.01, 1.1, 1.22, 1.39, 1.63, 1.99, 2.55, 3.49, 5.14, 8.57];
const MAX_FLOOR = FLOOR_RISK.length;

/** Resolves the real currency a specific run is using - NOT always the guild's primary configured currency, now that multi-currency wagers exist (see utils/gameWagerCurrency.js). */
function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function climbRow(runId, canCashOut) {
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`towerclimb:climb:${runId}`).setLabel("🧗 Climb").setStyle(ButtonStyle.Primary));
  if (canCashOut) {
    row.addComponents(new ButtonBuilder().setCustomId(`towerclimb:cashout:${runId}`).setLabel("💰 Cash Out").setStyle(ButtonStyle.Success));
  }
  return row;
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("towerclimb:play_again").setLabel("🔁 Play Again").setStyle(ButtonStyle.Primary));
}

/**
 * Live round view for an active run - shared by "start a new run" and
 * "resume after restart" (same reasoning as Defuse Wire/Grid Minefield: a
 * charged wager is a real DB row, never in-memory state, so a bot restart
 * can't strand it).
 */
function buildRoundView(run, currency) {
  const floor = run.current_floor;
  const nextFloor = floor + 1;
  const nextRisk = Math.round(FLOOR_RISK[floor] * 100); // floor is 0-indexed into the array for "the next floor to attempt"

  if (floor === 0) {
    const embed = infoEmbed(
      "🏗️ Tower Climb",
      `Entry: **${fmtAmount(currency, run.wager)}**\n\nFloor 1\nFailure Chance: **${nextRisk}%**\nPotential Payout: **${fmtAmount(currency, run.wager * FLOOR_MULTIPLIER[0])}**\n\nClimb to attempt Floor 1.`
    );
    return { embeds: [embed], components: [climbRow(run.id, false)] };
  }

  const body = [
    `Current Floor: **${floor}**`,
    `Current Multiplier: **${FLOOR_MULTIPLIER[floor - 1]}x**`,
    `Current Payout: **${fmtAmount(currency, run.pool)}**`,
  ];
  if (nextFloor <= MAX_FLOOR) {
    body.push(`Failure Chance (Floor ${nextFloor}): **${nextRisk}%**`, `Potential Next Payout: **${fmtAmount(currency, run.wager * FLOOR_MULTIPLIER[nextFloor - 1])}**`);
  } else {
    body.push("You've reached the top of the tower - nowhere left to climb. Cash out to take your reward.");
  }
  const embed = infoEmbed("🏗️ Tower Climb", `${body.join("\n")}\n\nWhat do you want to do?`);
  return { embeds: [embed], components: [climbRow(run.id, true)] };
}

/**
 * FIXED-STYLE (same as Defuse Wire/Grid Minefield's buildWagerModal): shows
 * the actual min/max instead of leaving it a guessing game. `option` is one
 * entry from utils/gameWagerCurrency.js's listBetOptions (added 2026-09-19
 * for multi-currency support).
 */
function buildWagerModal(option) {
  const modal = new ModalBuilder().setCustomId(`towerclimb:wager_modal:${option.currencyId}`).setTitle("Place Your Bet");
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
  const settings = db.getTowerClimbSettings(guildId);
  const options = listBetOptions(guildId, GAME_KEY, settings);
  if (options.length > 1) {
    await interaction.update({
      embeds: [infoEmbed("Tower Climb", "Which currency do you want to wager?")],
      components: [buildCurrencyPickRow(`towerclimb:currency_pick:${server}`, options), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary))],
    });
    return;
  }
  await interaction.showModal(buildWagerModal(options[0]));
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup) - resumes an in-progress run if one exists, otherwise shows the currency picker/wager modal. Same pattern as Defuse Wire/Grid Minefield's startOrResume. */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getTowerClimbSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [dangerEmbed("Not Set Up", "Tower Climb hasn't been configured yet - ask staff to set a currency and bet range via the Games Panel's Configure button.")],
      components: [backRow],
    });
    return;
  }

  const activeRun = db.getActiveTowerClimbRun(guildId, interaction.user.id);
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

  const settings = db.getTowerClimbSettings(guildId);
  if (!settings) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "Tower Climb hasn't been configured yet.")] });
    return;
  }
  const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
  if (!option) {
    await interaction.editReply({ embeds: [dangerEmbed("Currency No Longer Available", "That currency isn't configured for Tower Climb anymore - try again.")] });
    return;
  }
  if (wager < option.minBet || wager > option.maxBet) {
    await interaction.editReply({ embeds: [dangerEmbed("Bet Out Of Range", `Tower Climb only accepts wagers between **${option.minBet}** and **${option.maxBet}** in ${option.name}.`)] });
    return;
  }
  // Re-check for a race (e.g. double-submitted modal) rather than trusting the client not to have one already.
  if (db.getActiveTowerClimbRun(guildId, interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Running", "You already have an active Tower Climb run - finish that one first.")] });
    return;
  }

  const currency = { name: option.name, emoji: option.emoji };
  const wallet = db.getWallet(guildId, interaction.user.id, currencyId);
  if (wallet.balance < wager) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `You're trying to wager **${fmtAmount(currency, wager)}** but only have **${wallet.balance}**.`)] });
    return;
  }

  db.adjustWallet(guildId, interaction.user.id, currencyId, -wager);
  const runId = db.createTowerClimbRun(guildId, interaction.user.id, currencyId, wager);
  const run = db.getTowerClimbRun(guildId, runId);

  await interaction.editReply(buildRoundView(run, currency));
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "play_again") {
    const settings = db.getTowerClimbSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "Tower Climb isn't configured anymore - ask staff to set it back up.")], ephemeral: true });
      return;
    }
    const options = listBetOptions(guildId, GAME_KEY, settings);
    if (options.length > 1) {
      await interaction.update({
        embeds: [infoEmbed("Tower Climb", "Which currency do you want to wager?")],
        components: [buildCurrencyPickRow("towerclimb:currency_pick", options)],
      });
      return;
    }
    await interaction.showModal(buildWagerModal(options[0]));
    return;
  }
  if (action === "currency_pick") {
    const currencyId = Number(interaction.values[0]);
    const settings = db.getTowerClimbSettings(guildId);
    const option = listBetOptions(guildId, GAME_KEY, settings).find((o) => o.currencyId === currencyId);
    if (!option) {
      await interaction.update({ embeds: [dangerEmbed("Not Available", "That currency isn't configured anymore.")], components: [] });
      return;
    }
    await interaction.showModal(buildWagerModal(option));
    return;
  }

  const runId = Number(parts[2]);
  const run = db.getTowerClimbRun(guildId, runId);
  if (!run || run.status !== "active") {
    await interaction.reply({ embeds: [dangerEmbed("Run Over", "This Tower Climb run isn't active anymore.")], ephemeral: true });
    return;
  }
  // Session ownership check (spec section 12) - only the player who started
  // this run can act on it, matching every other game's identical check.
  if (run.discord_id !== interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Yours", "This Tower Climb run belongs to another player.")], ephemeral: true });
    return;
  }
  const currency = currencyFor(guildId, run.currency_id);

  if (action === "climb") {
    const nextFloor = run.current_floor + 1;
    if (nextFloor > MAX_FLOOR) {
      // Nothing left to climb - the only valid action from here is cashing out. Re-render rather than silently no-op'ing a stale button.
      await interaction.update(buildRoundView(run, currency));
      return;
    }

    // Server-side RNG only (spec section 8) - decided the instant the button
    // is clicked, using Math.random() same as every sibling game's roll
    // (Fisher-Yates shuffles in Defuse Wire/Grid Minefield use the same
    // source) - never trusts anything from the client.
    const fell = Math.random() < FLOOR_RISK[nextFloor - 1];

    if (fell) {
      db.closeTowerClimbRun(runId, "failed");
      publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "tower_climb", won: false, wager: run.wager, payout: 0, sourceId: `tower_climb_run:${runId}` });
      // run.pool already equals run.wager at floor 0 (set that way by
      // createTowerClimbRun) and the floor-survived value otherwise - no
      // special-casing needed here.
      const embed = dangerEmbed(
        "💥 TOWER COLLAPSED",
        `You reached Floor ${nextFloor}.\n\nYour current reward was:\n**${fmtAmount(currency, run.pool)}**\n\nYou did not cash out.\nWager lost.`
      );
      await interaction.update({ embeds: [embed], components: [playAgainRow()] });
      return;
    }

    const newPool = run.wager * FLOOR_MULTIPLIER[nextFloor - 1];
    db.advanceTowerClimbRun(runId, { pool: newPool, floor: nextFloor });

    if (nextFloor === MAX_FLOOR) {
      // Top of the tower - nothing left to climb, but per spec section 9 the
      // player still explicitly chooses to Cash Out rather than being
      // auto-cashed (unlike Grid Minefield's "cleared every star" case,
      // which has no further decision to make at all).
      const updatedRun = { ...run, pool: newPool, current_floor: nextFloor };
      await interaction.update(buildRoundView(updatedRun, currency));
      return;
    }

    const updatedRun = { ...run, pool: newPool, current_floor: nextFloor };
    await interaction.update(buildRoundView(updatedRun, currency));
    return;
  }

  if (action === "cashout") {
    if (run.current_floor === 0) {
      // Shouldn't be reachable (climbRow only shows Cash Out once floor >= 1) - guard anyway against a stale/replayed button.
      await interaction.reply({ embeds: [dangerEmbed("Nothing To Cash Out", "Climb at least one floor before cashing out.")], ephemeral: true });
      return;
    }

    db.grantFromSupply(guildId, run.currency_id, interaction.user.id, run.pool);
    db.closeTowerClimbRun(runId, "cashed_out");
    publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: "tower_climb", won: true, wager: run.wager, payout: run.pool, sourceId: `tower_climb_run:${runId}` });

    // The Scrap Merchant - cashing out counts as a win, same as every other
    // game's payout point (see utils/scrapMerchant.js's rollBonusDrop).
    const scrapDrop = rollBonusDrop(guildId, interaction.user.id);
    const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";

    const profit = Math.round((run.pool - run.wager) * 100) / 100;
    const embed = successEmbed(
      "🏆 TOWER CLIMB COMPLETE",
      `You reached Floor ${run.current_floor}.\n\nEntry:\n**${fmtAmount(currency, run.wager)}**\nPayout:\n**${fmtAmount(currency, run.pool)}**\nProfit:\n**${fmtAmount(currency, profit)}**${scrapNote}`
    );
    await interaction.update({ embeds: [embed], components: [playAgainRow()] });
    return;
  }
}

async function handleModal(interaction) {
  const action = interaction.customId.split(":")[1];
  if (action === "wager_modal") return handleWagerModal(interaction);
}

module.exports = { startOrResume, handleComponent, handleModal, buildWagerModal, FLOOR_RISK, FLOOR_MULTIPLIER, MAX_FLOOR };

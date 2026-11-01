"use strict";

/**
 * The Recycler Roulette - solo high-stakes wager game (Games Panel -> Play,
 * see config/games.js's "recycler_roulette" entry, modes: ["solo"]). Same
 * "a charged wager is a real DB row, never in-memory state" principle as
 * Defuse Wire/Grid Minefield/Tower Climb, EXCEPT for the actual loading-bar
 * loop itself: that part genuinely can't survive a bot restart the way a
 * button-driven game can, because it's an active setTimeout chain editing
 * ONE specific interaction's ephemeral reply - Discord's own ~15-minute
 * interaction-token validity window is the real ceiling here, not a design
 * choice this codebase could paper over. recycler_roulette_runs exists so
 * the WAGER is never silently lost even if the process dies mid-loop: if
 * startOrResume finds an 'active' run with no matching entry in this file's
 * in-memory `activeLoops` Map (i.e. the loop that was driving it is gone -
 * either a restart, or the tier was never actually started), it refunds the
 * wager and closes the run rather than leaving it stuck forever. A run
 * that's merely sitting at the tier-select step (tier still 'pending', no
 * loop ever started) resumes there for free - nothing was lost yet.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { rollBonusDrop } = require("./scrapMerchant");
const { publishGameCompleted } = require("./gameEvents");

const GAME_KEY = "recycler_roulette";
const TICK_MS = 1800;
const TOTAL_TICKS = 5;
const PULL_EARLY_REDUCED_FRACTION = 0.5; // guaranteed profit fraction if the player bails early - half the tier's eventual profit, locked in now instead of risked

const TIERS = {
  safe: { label: "Safe Grind", failPct: 5, multiplier: 1.2 },
  hazard: { label: "Hazardous Run", failPct: 25, multiplier: 2.0 },
  launch: { label: "Launch Site Yield", failPct: 60, multiplier: 5.0 },
};

/** runId -> { timeoutHandle, tick, guildId, discordId } - only populated once "Start Recycler" is actually pressed; see this file's header for why a run sitting at tier-select has no entry here. */
const activeLoops = new Map();

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function progressBar(tick, total) {
  const filled = Math.round((tick / total) * 20);
  return "█".repeat(filled) + "░".repeat(Math.max(0, 20 - filled));
}

function tierSelectRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("recyclerroulette:tier:safe").setLabel("Safe Grind (5% fail, 1.2x)").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("recyclerroulette:tier:hazard").setLabel("Hazardous Run (25% fail, 2.0x)").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("recyclerroulette:tier:launch").setLabel("Launch Site Yield (60% fail, 5.0x)").setStyle(ButtonStyle.Danger)
  );
}

function startRow(runId) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`recyclerroulette:start:${runId}`).setLabel("♻️ Start Recycler").setStyle(ButtonStyle.Success));
}

function loopRow(runId, canPullEarly) {
  const row = new ActionRowBuilder();
  if (canPullEarly) row.addComponents(new ButtonBuilder().setCustomId(`recyclerroulette:pull:${runId}`).setLabel("Pull Early").setEmoji("⏏️").setStyle(ButtonStyle.Secondary));
  return row;
}

function playAgainRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("recyclerroulette:play_again").setLabel("🔁 Play Again").setStyle(ButtonStyle.Primary));
}

function buildWagerModal(settings) {
  const modal = new ModalBuilder().setCustomId("recyclerroulette:wager_modal").setTitle("Place Your Bet");
  const rangeLabel = `Wager (Min ${settings.min_bet} - Max ${settings.max_bet})`;
  const wagerInput = new TextInputBuilder()
    .setCustomId("wager")
    .setLabel(rangeLabel.length <= 45 ? rangeLabel : "How much to wager?")
    .setPlaceholder(`${settings.min_bet}-${settings.max_bet} ${settings.currency_emoji || ""} ${settings.currency_name}`.replace(/\s+/g, " ").trim())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(12);
  modal.addComponents(new ActionRowBuilder().addComponents(wagerInput));
  return modal;
}

function tierSelectView(run, currency) {
  const embed = infoEmbed("♻️ The Recycler Roulette", `Entry: **${fmtAmount(currency, run.wager)}**\n\nPick a risk tier:`);
  return { embeds: [embed], components: [tierSelectRow()] };
}

function startView(run, currency) {
  const tier = TIERS[run.tier];
  const embed = infoEmbed("♻️ The Recycler Roulette", `Entry: **${fmtAmount(currency, run.wager)}**\nTier: **${tier.label}** (${tier.failPct}% fail, ${tier.multiplier}x return)\n\nPress Start when you're ready.`);
  return { embeds: [embed], components: [startRow(run.id)] };
}

/** Play-flow entry point (called from utils/gamesPanel.js's startGameSetup). */
async function startOrResume(interaction, server) {
  const guildId = interaction.guildId;
  const settings = db.getRecyclerRouletteSettings(guildId);
  if (!settings) {
    const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:play_back_games:${server}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
    await interaction.update({ embeds: [dangerEmbed("Not Set Up", "The Recycler Roulette hasn't been configured yet - ask staff to set it up via the Games Panel's Configure button.")], components: [backRow] });
    return;
  }

  const run = db.getActiveRecyclerRun(guildId, interaction.user.id);
  if (run) {
    const currency = currencyFor(guildId, run.currency_id);
    if (run.tier === "pending") {
      await interaction.update(tierSelectView(run, currency));
      return;
    }
    if (!activeLoops.has(run.id)) {
      // No live loop is driving this run (bot restart, or the loop already finished and crashed before closing it out) - refund rather than strand the wager, per this file's header.
      db.adjustWallet(guildId, interaction.user.id, run.currency_id, run.wager);
      db.closeRecyclerRun(run.id, "lost");
      await interaction.update({ embeds: [dangerEmbed("Recycler Jammed", `A restart interrupted your last run - your **${fmtAmount(currency, run.wager)}** wager was refunded.`)], components: [playAgainRow()] });
      return;
    }
    // A live loop IS driving it (shouldn't normally be reachable - the loop already owns this interaction) - just acknowledge.
    await interaction.update({ embeds: [infoEmbed("Still Running", "Your Recycler run is still in progress.")], components: [] });
    return;
  }

  await interaction.showModal(buildWagerModal(settings));
}

async function handleWagerModal(interaction) {
  const guildId = interaction.guildId;
  const wager = Number(interaction.fields.getTextInputValue("wager"));
  if (!Number.isFinite(wager) || wager <= 0) {
    await interaction.reply({ embeds: [dangerEmbed("Invalid Wager", "Enter a positive number.")], ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const settings = db.getRecyclerRouletteSettings(guildId);
  if (!settings) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "The Recycler Roulette hasn't been configured yet.")] });
    return;
  }
  if (wager < settings.min_bet || wager > settings.max_bet) {
    await interaction.editReply({ embeds: [dangerEmbed("Bet Out Of Range", `Only wagers between **${settings.min_bet}** and **${settings.max_bet}** are accepted.`)] });
    return;
  }
  if (db.getActiveRecyclerRun(guildId, interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Running", "You already have an active Recycler run - finish that one first.")] });
    return;
  }
  const currency = { name: settings.currency_name, emoji: settings.currency_emoji };
  const wallet = db.getWallet(guildId, interaction.user.id, settings.currency_id);
  if (wallet.balance < wager) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Funds", `You're trying to wager **${fmtAmount(currency, wager)}** but only have **${wallet.balance}**.`)] });
    return;
  }

  db.adjustWallet(guildId, interaction.user.id, settings.currency_id, -wager);
  const runId = db.createRecyclerRun(guildId, interaction.user.id, settings.currency_id, wager);
  const run = db.getRecyclerRun(runId);
  await interaction.editReply(tierSelectView(run, currency));
}

/** The actual loading-bar loop - recursive setTimeout (not setInterval) so a Pull Early/completion can cleanly stop it mid-chain without a stray extra tick firing. */
function runLoop(interaction, run, currency) {
  const tier = TIERS[run.tier];
  const state = { tick: 0 };

  function scheduleTick() {
    const handle = setTimeout(async () => {
      state.tick++;
      const current = db.getRecyclerRun(run.id);
      if (!current || current.status !== "active") {
        activeLoops.delete(run.id);
        return;
      }

      if (state.tick >= TOTAL_TICKS) {
        activeLoops.delete(run.id);
        const failed = Math.random() * 100 < tier.failPct;
        if (failed) {
          db.closeRecyclerRun(run.id, "lost");
          publishGameCompleted({ guildId: run.guild_id, discordId: run.discord_id, gameKey: GAME_KEY, won: false, wager: run.wager, payout: 0, sourceId: `recycler_run:${run.id}` });
          await interaction.editReply({
            embeds: [dangerEmbed("[ COMPONENT CRUSHED ]", "The recycler jammed - you lost everything.")],
            components: [playAgainRow()],
          }).catch(() => {});
          return;
        }
        const payout = Math.round(run.wager * tier.multiplier * 100) / 100;
        db.grantFromSupply(run.guild_id, run.currency_id, run.discord_id, payout);
        db.closeRecyclerRun(run.id, "won");
        publishGameCompleted({ guildId: run.guild_id, discordId: run.discord_id, gameKey: GAME_KEY, won: true, wager: run.wager, payout, sourceId: `recycler_run:${run.id}` });
        const scrapDrop = rollBonusDrop(run.guild_id, run.discord_id);
        const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";
        await interaction.editReply({
          embeds: [successEmbed("♻️ RECYCLE COMPLETE", `Tier: **${tier.label}**\nPayout: **${fmtAmount(currency, payout)}**${scrapNote}`)],
          components: [playAgainRow()],
        }).catch(() => {});
        return;
      }

      const canPullEarly = state.tick >= 1 && state.tick < TOTAL_TICKS - 1;
      const embed = infoEmbed("♻️ Recycling...", `Tier: **${tier.label}**\n\`${progressBar(state.tick, TOTAL_TICKS)}\` **${Math.round((state.tick / TOTAL_TICKS) * 100)}%**`);
      await interaction.editReply({ embeds: [embed], components: [loopRow(run.id, canPullEarly)] }).catch(() => {});
      scheduleTick();
    }, TICK_MS);
    activeLoops.set(run.id, { handle, tick: state.tick });
  }

  scheduleTick();
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "play_again") {
    const settings = db.getRecyclerRouletteSettings(guildId);
    if (!settings) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "The Recycler Roulette isn't configured anymore.")], ephemeral: true });
      return;
    }
    await interaction.showModal(buildWagerModal(settings));
    return;
  }

  if (action === "tier") {
    const tier = parts[2];
    const run = db.getActiveRecyclerRun(guildId, interaction.user.id);
    if (!run || run.tier !== "pending") {
      await interaction.update({ embeds: [dangerEmbed("Run Over", "This run isn't waiting on a tier pick anymore.")], components: [] });
      return;
    }
    db.setRecyclerRunTier(run.id, tier);
    const updated = db.getRecyclerRun(run.id);
    await interaction.update(startView(updated, currencyFor(guildId, run.currency_id)));
    return;
  }

  const runId = Number(parts[2]);
  const run = db.getRecyclerRun(runId);
  if (!run || run.status !== "active" || run.discord_id !== interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Yours Or Over", "This Recycler run isn't active or doesn't belong to you.")], ephemeral: true });
    return;
  }
  const currency = currencyFor(guildId, run.currency_id);

  if (action === "start") {
    if (run.tier === "pending" || activeLoops.has(run.id)) {
      await interaction.update({ embeds: [dangerEmbed("Can't Start", "This run already started, or hasn't picked a tier yet.")], components: [] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("♻️ Recycling...", "Starting up...")], components: [] });
    runLoop(interaction, run, currency);
    return;
  }

  if (action === "pull") {
    const loop = activeLoops.get(run.id);
    if (!loop) {
      await interaction.reply({ embeds: [dangerEmbed("Too Late", "The run already finished.")], ephemeral: true });
      return;
    }
    clearTimeout(loop.handle);
    activeLoops.delete(run.id);
    const tier = TIERS[run.tier];
    const fullProfit = run.wager * (tier.multiplier - 1);
    const payout = Math.round((run.wager + fullProfit * PULL_EARLY_REDUCED_FRACTION) * 100) / 100;
    db.grantFromSupply(guildId, run.currency_id, interaction.user.id, payout);
    db.closeRecyclerRun(run.id, "pulled");
    publishGameCompleted({ guildId, discordId: interaction.user.id, gameKey: GAME_KEY, won: true, wager: run.wager, payout, sourceId: `recycler_run:${run.id}` });
    await interaction.update({
      embeds: [successEmbed("⏏️ Pulled Early", `You bailed before the recycler finished.\nGuaranteed payout: **${fmtAmount(currency, payout)}**`)],
      components: [playAgainRow()],
    });
    return;
  }
}

async function handleModal(interaction) {
  const action = interaction.customId.split(":")[1];
  if (action === "wager_modal") return handleWagerModal(interaction);
}

module.exports = { startOrResume, handleComponent, handleModal };

"use strict";

/**
 * Cargo Ship Heist - ambient multiplayer/PvP event (Games Panel's Configure
 * flow only, NOT a player-picked wager - see config/games.js's
 * "cargo_ship_heist" entry, modes: [], configureOnly: true). Same family as
 * utils/vaultHeist.js/utils/bradleyAmbush.js (periodic/admin-triggered
 * spawn, a shared embed, button-driven contribution), but the 10-round
 * state machine itself is ticked from utils/backgroundLoops.js on a wall-
 * clock cadence (runCargoShipHeistTick), NOT resolved inline off a button
 * click like Vault Heist/Bradley Ambush - each round's control-%
 * snapshot has to land every `round_seconds` regardless of whether anyone
 * clicks anything that round (spec: "Every 30 seconds the bot updates a
 * live embed").
 *
 * XP payout pool (CARGO_HEIST_XP_POOL below) is this implementation's own
 * design decision - the spec says "scaled distribution of XP/prestige via
 * the EXISTING progression system" but names no actual pool size, and
 * utils/progression.js's awardXp() takes a flat already-computed amount,
 * not a percentage - same "no safe default exists, make an explicit
 * decision and document it" convention this codebase already uses
 * elsewhere (e.g. utils/gamesPanel.js's Quick Setup header comment).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { getRcon } = require("../rcon/manager");
const { awardXp } = require("./progression");

const ACTION_COOLDOWN_NOTE = "You've already acted this round - wait for the next one.";
const CARGO_HEIST_XP_POOL = 1000; // see this file's header - a fixed total, split proportionally by each entrant's control_duration share

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function deckBar(pct) {
  const filled = Math.round((pct / 100) * 20);
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, 20 - filled));
}

/** Clan tag (if rostered) prefixed for display only - see schema.sql's cargo_ship_heist_entrants header on why this is a live lookup, not a point-in-time snapshot like combatEvents.js's Clan War attribution. */
function displayName(guild, discordId) {
  const member = db.getMember(guild.id, discordId);
  const team = member?.team_name ? db.getTeam(guild.id, member.team_name) : null;
  const tag = team?.clan_tag ? `[${team.clan_tag}] ` : "";
  return `${tag}<@${discordId}>`;
}

function lobbyRow(heistId) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cargoheist:join:${heistId}`).setLabel("Board Ship").setEmoji("🚢").setStyle(ButtonStyle.Success));
}

function lobbyView(heist, settings) {
  const currency = currencyFor(heist.guild_id, settings.currency_id);
  const entrants = db.listCargoShipHeistEntrants(heist.id);
  const embed = infoEmbed(
    "🚢 Cargo Ship Heist - Boarding",
    `A Cargo Ship is entering the grid! Pay **${fmtAmount(currency, settings.entry_fee)}** to board before boarding closes <t:${Math.floor(heist.lobby_ends_at / 1000)}:R>.\n\n**Boarded:** ${entrants.length}`
  );
  return { embeds: [embed], components: [lobbyRow(heist.id)] };
}

function combatRow(heistId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cargoheist:defend:${heistId}`).setLabel("Defend Area").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cargoheist:flank:${heistId}`).setLabel("Flank Deck").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`cargoheist:smoke:${heistId}`).setLabel("Throw Smoke Grenade").setEmoji("💨").setStyle(ButtonStyle.Secondary)
  );
}

function combatView(guild, heist, settings) {
  const entrants = db.listCargoShipHeistEntrants(heist.id);
  const lines = entrants.map((e) => `${displayName(guild, e.discord_id)} - \`${deckBar(e.control_pct)}\` **${Math.round(e.control_pct * 100) / 100}%** (total: ${Math.round(e.control_duration * 100) / 100})`);
  const embed = infoEmbed(
    `🚢 Cargo Ship Heist - Round ${heist.current_round}/${settings.rounds_total}`,
    `**Main Deck Control:**\n${lines.join("\n") || "_Nobody boarded._"}\n\nNext round <t:${Math.floor(heist.round_ends_at / 1000)}:R>.`
  );
  return { embeds: [embed], components: [combatRow(heist.id)] };
}

/** Periodic auto-spawn (interval_hours > 0 only) - called from utils/backgroundLoops.js, same shape as utils/vaultHeist.js's runVaultSpawnTick. Manual "Trigger Now" calls triggerHeist directly. */
async function runCargoShipHeistSpawnTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = db.getCargoShipHeistSettings(guild.id);
    if (!settings?.channel_id || !settings?.currency_id || !settings.interval_hours) continue;
    if (db.getActiveCargoShipHeist(guild.id)) continue;

    const intervalMs = settings.interval_hours * 60 * 60 * 1000;
    if (settings.last_spawned_at && Date.now() - settings.last_spawned_at < intervalMs) continue;

    await triggerHeist(guild, settings).catch((err) => console.error(`[KOBA Bot] Cargo Ship Heist auto-spawn failed for guild ${guild.id}:`, err));
  }
}

async function triggerHeist(guild, settings) {
  const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
  if (!channel) throw new Error("Configured channel no longer exists.");

  const lobbyEndsAt = Date.now() + settings.lobby_minutes * 60 * 1000;
  const heistId = db.createCargoShipHeist(guild.id, settings.channel_id, lobbyEndsAt);
  db.markCargoShipHeistSpawned(guild.id, Date.now());
  const heist = db.getCargoShipHeist(heistId);

  try {
    const rcon = await getRcon(guild.id);
    await rcon.say(`A Cargo Ship is entering the grid! Board it in Discord before boarding closes in ${settings.lobby_minutes} minute(s)!`);
  } catch (err) {
    console.warn(`[KOBA Bot] Cargo Ship Heist RCON broadcast failed for guild ${guild.id} (lobby still opened in Discord):`, err.message);
  }

  const message = await channel.send(lobbyView(heist, settings)).catch(() => null);
  if (message) db.setCargoShipHeistMessageId(heistId, message.id);
  return heist;
}

/** Round/phase state machine - called every heartbeat from utils/backgroundLoops.js. Transitions lobby->combat when boarding closes, advances one round every round_seconds, and resolves the grand prize + XP split once rounds_total is reached. */
async function runCargoShipHeistTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const heist = db.getActiveCargoShipHeist(guild.id);
    if (!heist) continue;
    const settings = db.getCargoShipHeistSettings(guild.id);
    if (!settings) continue;
    const channel = await guild.channels.fetch(heist.channel_id).catch(() => null);

    if (heist.phase === "lobby" && Date.now() >= heist.lobby_ends_at) {
      const entrants = db.listCargoShipHeistEntrants(heist.id);
      if (!entrants.length) {
        if (channel && heist.message_id) {
          const message = await channel.messages.fetch(heist.message_id).catch(() => null);
          if (message) await message.edit({ embeds: [dangerEmbed("🚢 Heist Cancelled", "Nobody boarded - the Cargo Ship moved on.")], components: [] }).catch(() => {});
        }
        db.closeCargoShipHeist(heist.id);
        continue;
      }
      const roundEndsAt = Date.now() + settings.round_seconds * 1000;
      db.startCargoShipHeistCombat(heist.id, roundEndsAt);
      const updated = db.getCargoShipHeist(heist.id);
      if (channel && heist.message_id) {
        const message = await channel.messages.fetch(heist.message_id).catch(() => null);
        if (message) await message.edit(combatView(guild, updated, settings)).catch(() => {});
      }
      continue;
    }

    if (heist.phase === "combat" && Date.now() >= heist.round_ends_at) {
      db.accumulateCargoShipControlDuration(heist.id);

      if (heist.current_round >= settings.rounds_total) {
        await resolveHeist(guild, heist, settings, channel);
        continue;
      }

      const nextRound = heist.current_round + 1;
      const roundEndsAt = Date.now() + settings.round_seconds * 1000;
      db.setCargoShipHeistRound(heist.id, nextRound, roundEndsAt);
      const updated = db.getCargoShipHeist(heist.id);
      if (channel && heist.message_id) {
        const message = await channel.messages.fetch(heist.message_id).catch(() => null);
        if (message) await message.edit(combatView(guild, updated, settings)).catch(() => {});
      }
    }
  }
}

async function resolveHeist(guild, heist, settings, channel) {
  const entrants = db.listCargoShipHeistEntrants(heist.id).slice().sort((a, b) => b.control_duration - a.control_duration);
  const totalControlDuration = entrants.reduce((sum, e) => sum + e.control_duration, 0);
  const winner = entrants[0];
  const lines = [];

  if (winner) {
    db.grantFromSupply(guild.id, settings.currency_id, winner.discord_id, settings.grand_prize_amount);
    lines.push(`🏆 **Winner:** ${displayName(guild, winner.discord_id)} - **${Math.round(winner.control_duration * 100) / 100}** total control, wins **${fmtAmount(currencyFor(guild.id, settings.currency_id), settings.grand_prize_amount)}**!`);
  }

  for (const entrant of entrants) {
    if (totalControlDuration <= 0) continue;
    const share = Math.round((entrant.control_duration / totalControlDuration) * CARGO_HEIST_XP_POOL);
    if (share <= 0) continue;
    awardXp(guild.id, entrant.discord_id, share, "cargo_ship_heist", `cargo_ship_heist:${heist.id}`);
    if (entrant.discord_id !== winner?.discord_id) lines.push(`${displayName(guild, entrant.discord_id)} - **${Math.round(entrant.control_duration * 100) / 100}** total control, **+${share} XP**`);
  }

  const embed = successEmbed("🚢 Cargo Ship Heist Over", lines.length ? lines.join("\n") : "The heist ended with no meaningful control held by anyone.");
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  if (channel && heist.message_id) {
    const message = await channel.messages.fetch(heist.message_id).catch(() => null);
    if (message) await message.edit({ components: [] }).catch(() => {});
  }
  db.closeCargoShipHeist(heist.id);
}

function targetSelectRow(heistId, entrants, selfId) {
  const others = entrants.filter((e) => e.discord_id !== selfId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cargoheist:smoke_target:${heistId}`)
    .setPlaceholder("Who do you want to smoke?")
    .addOptions(others.slice(0, 25).map((e) => ({ label: `Entrant ${e.discord_id}`, value: e.discord_id })));
  return new ActionRowBuilder().addComponents(menu);
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;
  const heistId = Number(parts[2]);
  const heist = db.getCargoShipHeist(heistId);
  if (!heist || heist.guild_id !== guildId || heist.phase === "resolved") {
    await interaction.reply({ embeds: [dangerEmbed("Gone", "This heist isn't active anymore.")], ephemeral: true });
    return;
  }
  const settings = db.getCargoShipHeistSettings(guildId);

  if (action === "join") {
    if (heist.phase !== "lobby") {
      await interaction.reply({ embeds: [dangerEmbed("Boarding Closed", "This heist's boarding window is over.")], ephemeral: true });
      return;
    }
    if (db.getCargoShipHeistEntrant(heist.id, interaction.user.id)) {
      await interaction.reply({ embeds: [infoEmbed("Already Boarded", "You're already on the ship.")], ephemeral: true });
      return;
    }
    const currency = currencyFor(guildId, settings.currency_id);
    const wallet = db.getWallet(guildId, interaction.user.id, settings.currency_id);
    if (settings.entry_fee > 0 && wallet.balance < settings.entry_fee) {
      await interaction.reply({ embeds: [dangerEmbed("Insufficient Funds", `Boarding costs **${fmtAmount(currency, settings.entry_fee)}** - you only have **${wallet.balance}**.`)], ephemeral: true });
      return;
    }
    if (settings.entry_fee > 0) db.adjustWallet(guildId, interaction.user.id, settings.currency_id, -settings.entry_fee);
    db.joinCargoShipHeist(heist.id, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed("Boarded!", `You paid **${fmtAmount(currency, settings.entry_fee)}** to board - good luck.`)], ephemeral: true });

    const channel = await interaction.guild.channels.fetch(heist.channel_id).catch(() => null);
    if (channel && heist.message_id) {
      const message = await channel.messages.fetch(heist.message_id).catch(() => null);
      if (message) await message.edit(lobbyView(heist, settings)).catch(() => {});
    }
    return;
  }

  // Combat actions below.
  if (heist.phase !== "combat") {
    await interaction.reply({ embeds: [dangerEmbed("Not In Combat", "This heist isn't in its combat phase.")], ephemeral: true });
    return;
  }
  const entrant = db.getCargoShipHeistEntrant(heist.id, interaction.user.id);
  if (!entrant) {
    await interaction.reply({ embeds: [dangerEmbed("Not Boarded", "You never boarded this ship.")], ephemeral: true });
    return;
  }
  if (entrant.smoke_blocked_until > Date.now()) {
    await interaction.reply({ embeds: [dangerEmbed("Blinded", `You're smoked out <t:${Math.floor(entrant.smoke_blocked_until / 1000)}:R>.`)], ephemeral: true });
    return;
  }

  if (action === "smoke") {
    if (entrant.acted_round === heist.current_round) {
      await interaction.reply({ embeds: [dangerEmbed("Already Acted", ACTION_COOLDOWN_NOTE)], ephemeral: true });
      return;
    }
    const entrants = db.listCargoShipHeistEntrants(heist.id);
    await interaction.reply({ embeds: [infoEmbed("Throw Smoke Grenade", "Pick a target:")], components: [targetSelectRow(heist.id, entrants, interaction.user.id)], ephemeral: true });
    return;
  }

  if (action === "smoke_target") {
    const targetId = interaction.values[0];
    const current = db.getCargoShipHeist(heist.id);
    if (!current || current.phase !== "combat") {
      await interaction.update({ embeds: [dangerEmbed("Round Over", "That round already ended.")], components: [] });
      return;
    }
    const freshEntrant = db.getCargoShipHeistEntrant(heist.id, interaction.user.id);
    if (freshEntrant.acted_round === current.current_round) {
      await interaction.update({ embeds: [dangerEmbed("Already Acted", ACTION_COOLDOWN_NOTE)], components: [] });
      return;
    }
    db.setCargoShipSmokeBlocked(heist.id, targetId, Date.now() + settings.smoke_block_seconds * 1000);
    db.setCargoShipActed(heist.id, interaction.user.id, current.current_round);
    await interaction.update({ embeds: [successEmbed("💨 Smoked!", `<@${targetId}> is blinded for **${settings.smoke_block_seconds}s**.`)], components: [] });
    return;
  }

  if (entrant.acted_round === heist.current_round) {
    await interaction.reply({ embeds: [dangerEmbed("Already Acted", ACTION_COOLDOWN_NOTE)], ephemeral: true });
    return;
  }

  if (action === "defend") {
    db.setCargoShipDefending(heist.id, interaction.user.id, heist.current_round);
    await interaction.reply({ embeds: [successEmbed("🛡️ Defending", "You're braced - Flank Deck against you is halved this round.")], ephemeral: true });
    return;
  }

  if (action === "flank") {
    const result = db.flankCargoShipLeader(heist.id, interaction.user.id, settings.flank_steal_pct, heist.current_round);
    db.setCargoShipActed(heist.id, interaction.user.id, heist.current_round);
    if (!result) {
      await interaction.reply({ embeds: [infoEmbed("Already Leading", "You're already holding the most control - nothing to flank.")], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [successEmbed("⚔️ Flanked!", `You stole **${Math.round(result.stolen * 100) / 100}%** control from the leader.`)], ephemeral: true });
    return;
  }
}

// ---------------------------------------------------------------------------
// Configure flow helpers (called from utils/gamesPanel.js)
// ---------------------------------------------------------------------------

function adminMenu(guildId) {
  const settings = db.getCargoShipHeistSettings(guildId);
  const active = db.getActiveCargoShipHeist(guildId);
  const status = settings?.channel_id
    ? `Channel: <#${settings.channel_id}>\nCurrency: **${settings.currency_emoji || ""} ${settings.currency_name || "not set"}**\nEntry fee: **${settings.entry_fee}**\n` +
      `Lobby: **${settings.lobby_minutes}min**, Rounds: **${settings.rounds_total}** x **${settings.round_seconds}s**\n` +
      `Flank steal: **${settings.flank_steal_pct}%**, Smoke block: **${settings.smoke_block_seconds}s**\nGrand prize: **${settings.grand_prize_amount}**\n` +
      `Auto-spawn: **${settings.interval_hours > 0 ? `every ${settings.interval_hours}h` : "off - manual trigger only"}**` +
      (active ? `\n\n🚢 **A heist is currently active** (phase: ${active.phase}).` : "")
    : "_Not set up yet - set a channel, currency, and rewards below before this can be triggered._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_cargo_set_channel").setLabel("Set Channel").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_cargo_set_rewards").setLabel("Set Fees & Timing").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gamespanel:cfg_cargo_set_combat").setLabel("Set Combat").setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_cargo_trigger").setLabel("🚢 Trigger Now").setStyle(ButtonStyle.Danger).setDisabled(!settings?.channel_id || !settings?.currency_id || Boolean(active)),
    new ButtonBuilder().setCustomId("gamespanel:cfg_back_to_game_select").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: Cargo Ship Heist", status)], components: [row1, row2, row3] };
}

function channelSelectRow() {
  return new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("gamespanel:cfg_cargo_channel_select").setPlaceholder("Which channel should heists post in?").addChannelTypes(ChannelType.GuildText));
}

function rewardsModal(guildId) {
  const settings = db.getCargoShipHeistSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_cargo_rewards_modal").setTitle("Fees & Timing");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings?.currency_name) currencyInput.setValue(settings.currency_name);
  const feeInput = new TextInputBuilder().setCustomId("entry_fee").setLabel("Entry fee per boarder").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.entry_fee ?? 100));
  const lobbyInput = new TextInputBuilder().setCustomId("lobby_minutes").setLabel("Boarding window (minutes)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.lobby_minutes ?? 5));
  const prizeInput = new TextInputBuilder().setCustomId("grand_prize").setLabel("Grand prize amount").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.grand_prize_amount ?? 5000));
  const intervalInput = new TextInputBuilder().setCustomId("interval_hours").setLabel("Auto-spawn every N hours (0 = manual only)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.interval_hours ?? 0));
  modal.addComponents(
    new ActionRowBuilder().addComponents(currencyInput),
    new ActionRowBuilder().addComponents(feeInput),
    new ActionRowBuilder().addComponents(lobbyInput),
    new ActionRowBuilder().addComponents(prizeInput),
    new ActionRowBuilder().addComponents(intervalInput)
  );
  return modal;
}

function combatModal(guildId) {
  const settings = db.getCargoShipHeistSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_cargo_combat_modal").setTitle("Combat Settings");
  const roundSecInput = new TextInputBuilder().setCustomId("round_seconds").setLabel("Seconds per round").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.round_seconds ?? 30));
  const roundsInput = new TextInputBuilder().setCustomId("rounds_total").setLabel("Total rounds").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.rounds_total ?? 10));
  const flankInput = new TextInputBuilder().setCustomId("flank_steal_pct").setLabel("Flank Deck steal % per use").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.flank_steal_pct ?? 5));
  const smokeInput = new TextInputBuilder().setCustomId("smoke_block_seconds").setLabel("Smoke Grenade blind duration (seconds)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.smoke_block_seconds ?? 15));
  modal.addComponents(
    new ActionRowBuilder().addComponents(roundSecInput),
    new ActionRowBuilder().addComponents(roundsInput),
    new ActionRowBuilder().addComponents(flankInput),
    new ActionRowBuilder().addComponents(smokeInput)
  );
  return modal;
}

module.exports = {
  handleComponent,
  runCargoShipHeistSpawnTick,
  runCargoShipHeistTick,
  triggerHeist,
  adminMenu,
  channelSelectRow,
  rewardsModal,
  combatModal,
};

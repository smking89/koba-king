"use strict";

/**
 * The Bradley APC Ambush - ambient co-op event (Games Panel's Configure flow
 * only, NOT a player-picked wager from Play - see config/games.js's
 * "bradley_ambush" entry, modes: [], configureOnly: true). Same overall
 * shape as utils/vaultHeist.js (periodic/admin-triggered spawn, a shared
 * embed with a live state bar, button-driven contribution tracking, a
 * resolution function run inline off a button click) but with TWO phases
 * instead of one:
 *   1. Check-in (checkin_minutes) - players stake entry_fee to [Join Raid].
 *   2. Combat (combat_minutes) - joined players fight the Bradley's shared
 *      HP pool down with 3 cooldown-gated buttons, one of which (Shrapnel
 *      Charge) sets a timed server-wide armor-crack debuff that scales up
 *      the other two buttons' damage while it's active.
 *
 * RCON verification (per this task's explicit instruction): `bradley.
 * quickrespawn` IS a real, officially-documented RCE server variable (see
 * docs/RUST_CONSOLE_RCON_REFERENCE.md's "world/events" section, confirmed
 * fetched from the official GitBook docs) - but that section lists it as a
 * plain comma-separated "key commands" reference with NO per-command
 * Entry-Point icon (📟/🎮) the way the file's fully-tabulated sections carry,
 * unlike its neighbor `bradley.enabled` which IS explicitly flagged 🌌. This
 * implementation sends it over the same WebRCON `rcon.send()` path every
 * other RCON write in this codebase uses and best-effort swallows a failure
 * (`.catch()`) exactly like utils/shopDelivery.js's kit cleanup - if it
 * turns out to be console(🎮)-only on the live server, this call simply
 * no-ops instead of throwing, and the in-Discord loot payout below (which
 * does NOT depend on it) still completes normally. Flagged clearly in this
 * session's report; a live /rcon test against the real server is the only
 * way to fully confirm WebRCON reachability.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { getRcon } = require("../rcon/manager");
const { deliverReward } = require("./rewardDelivery");

const BAR_LENGTH = 20;

function healthBar(current, max) {
  const filled = Math.round((current / max) * BAR_LENGTH);
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, BAR_LENGTH - filled));
}

function currencyFor(guildId, currencyId) {
  return db.getCurrency(guildId, currencyId) || { name: "coins", emoji: "" };
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function checkinView(ambush, settings) {
  const currency = currencyFor(ambush.guild_id, settings.currency_id);
  const participants = db.listBradleyAmbushParticipants(ambush.id);
  const embed = infoEmbed(
    "🚁 The Bradley APC Ambush - Check-In",
    `A Bradley APC is inbound! Stake **${fmtAmount(currency, settings.entry_fee)}** to join the raid before check-in closes <t:${Math.floor(ambush.checkin_ends_at / 1000)}:R>.\n\n` +
      `**Raiders checked in:** ${participants.length}`
  );
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bradleyambush:join:${ambush.id}`).setLabel("Join Raid").setEmoji("🪖").setStyle(ButtonStyle.Success));
  return { embeds: [embed], components: [row] };
}

function combatRow(ambush) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bradleyambush:shrapnel:${ambush.id}`).setLabel("Shrapnel Charge").setEmoji("💥").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bradleyambush:hvrocket:${ambush.id}`).setLabel("HV Rocket").setEmoji("🚀").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bradleyambush:c4:${ambush.id}`).setLabel("Plant C4").setEmoji("🧨").setStyle(ButtonStyle.Danger)
  );
}

function combatView(ambush) {
  const pct = Math.round((ambush.current_hp / ambush.max_hp) * 100);
  const armorActive = ambush.armor_cracked_until > Date.now();
  const embed = infoEmbed(
    "🚁 The Bradley APC Ambush - Combat",
    `\`${healthBar(ambush.current_hp, ambush.max_hp)}\` **${pct}%**\n` +
      `**${ambush.current_hp} / ${ambush.max_hp}** HP remaining\n` +
      `${armorActive ? `🔓 **Armor Cracked!** (1.5x damage until <t:${Math.floor(ambush.armor_cracked_until / 1000)}:R>)\n` : ""}` +
      `Ends <t:${Math.floor(ambush.combat_ends_at / 1000)}:R> if the Bradley survives that long.`
  );
  return { embeds: [embed], components: [combatRow(ambush)] };
}

/** Spawns a fresh check-in if one's due (periodic auto-spawn, interval_hours > 0 only) - called from utils/backgroundLoops.js, same shape as utils/vaultHeist.js's runVaultSpawnTick. Manual "Trigger Now" (Configure button) calls triggerAmbush directly instead. */
async function runBradleyAmbushSpawnTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = db.getBradleyAmbushSettings(guild.id);
    if (!settings?.channel_id || !settings?.currency_id || !settings.interval_hours) continue;
    if (db.getActiveBradleyAmbush(guild.id)) continue;

    const intervalMs = settings.interval_hours * 60 * 60 * 1000;
    if (settings.last_spawned_at && Date.now() - settings.last_spawned_at < intervalMs) continue;

    await triggerAmbush(guild, settings).catch((err) => console.error(`[KOBA Bot] Bradley Ambush auto-spawn failed for guild ${guild.id}:`, err));
  }
}

/** Checks every active ambush's phase deadlines - closes out an under-attended check-in, flips an elapsed check-in into combat, and resolves (no payout) a combat phase that timed out without the Bradley dying. Called every heartbeat from utils/backgroundLoops.js. */
async function runBradleyAmbushTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const ambush = db.getActiveBradleyAmbush(guild.id);
    if (!ambush) continue;
    const settings = db.getBradleyAmbushSettings(guild.id);
    if (!settings) continue;

    if (ambush.phase === "checkin" && Date.now() >= ambush.checkin_ends_at) {
      const participants = db.listBradleyAmbushParticipants(ambush.id);
      const channel = await guild.channels.fetch(ambush.channel_id).catch(() => null);
      if (!participants.length) {
        if (channel && ambush.message_id) {
          const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
          if (message) await message.edit({ embeds: [dangerEmbed("🚁 Raid Cancelled", "Nobody checked in - the Bradley moved on.")], components: [] }).catch(() => {});
        }
        db.closeBradleyAmbush(ambush.id);
        continue;
      }
      const combatEndsAt = Date.now() + settings.combat_minutes * 60 * 1000;
      db.startBradleyAmbushCombat(ambush.id, combatEndsAt);
      const updated = db.getBradleyAmbush(ambush.id);
      if (channel && ambush.message_id) {
        const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
        if (message) await message.edit(combatView(updated)).catch(() => {});
      }
      continue;
    }

    if (ambush.phase === "combat" && Date.now() >= ambush.combat_ends_at) {
      // Countdown expired - spec section: "the pool is eaten (no payout)".
      const channel = await guild.channels.fetch(ambush.channel_id).catch(() => null);
      if (channel && ambush.message_id) {
        const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
        if (message) await message.edit({ embeds: [dangerEmbed("🚁 Raid Failed", "Time ran out before the Bradley went down - every staked entry fee is eaten. No payout this time.")], components: [] }).catch(() => {});
      }
      db.closeBradleyAmbush(ambush.id);
    }
  }
}

/** Opens a fresh check-in window and fires the real in-game RCON broadcast (global.say via rcon.say, same helper utils/backgroundLoops.js's ad-broadcast tick already uses) telling the server the Discord arcade is open. */
async function triggerAmbush(guild, settings) {
  const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
  if (!channel) throw new Error("Configured channel no longer exists.");

  const checkinEndsAt = Date.now() + settings.checkin_minutes * 60 * 1000;
  const ambushId = db.createBradleyAmbush(guild.id, settings.channel_id, settings.max_hp, checkinEndsAt);
  db.markBradleyAmbushSpawned(guild.id, Date.now());
  const ambush = db.getBradleyAmbush(ambushId);

  try {
    const rcon = await getRcon(guild.id);
    await rcon.say(`A Bradley APC is inbound! Join the raid in Discord - check-in closes in ${settings.checkin_minutes} minute(s)!`);
  } catch (err) {
    console.warn(`[KOBA Bot] Bradley Ambush RCON broadcast failed for guild ${guild.id} (check-in still opened in Discord):`, err.message);
  }

  const message = await channel.send(checkinView(ambush, settings)).catch(() => null);
  if (message) db.setBradleyAmbushMessageId(ambushId, message.id);
  return ambush;
}

/** Per-participant damage-% loot split + MVP bonus - called the instant HP hits 0. Reuses utils/rewardDelivery.js's generic deliverReward (kit add/givetoplayer/delete under the hood, see that file's header) for the optional kit, and db.adjustWallet for every currency payout, matching utils/vaultHeist.js's resolveVaultCracked split-by-damage pattern. */
async function resolveAmbushCracked(guild, ambush, settings) {
  const contributors = db.listBradleyAmbushDamage(ambush.id);
  const totalDamage = contributors.reduce((sum, c) => sum + c.damage, 0);
  const lines = [];

  // A. In-game spawn - real RCON trigger. Best-effort: see this file's header on bradley.quickrespawn's entry-point ambiguity.
  try {
    const rcon = await getRcon(guild.id);
    await rcon.send("bradley.quickrespawn");
  } catch (err) {
    console.warn(`[KOBA Bot] bradley.quickrespawn send failed for guild ${guild.id} (loot payout still proceeds):`, err.message);
  }

  if (totalDamage > 0) {
    const poolAmount = settings.entry_fee * db.listBradleyAmbushParticipants(ambush.id).length;
    for (const c of contributors) {
      const share = Math.round((c.damage / totalDamage) * poolAmount * 100) / 100;
      if (share > 0) db.grantFromSupply(guild.id, settings.currency_id, c.discord_id, share);
      let kitNote = "";
      if (settings.loot_kit_name) {
        const result = await deliverReward(guild, c.discord_id, { rewardType: "kit", rewardRef: settings.loot_kit_name, amount: 1 }).catch((err) => ({ delivered: false, note: err.message }));
        kitNote = result.delivered ? ` + kit **${settings.loot_kit_name}**` : ` (kit not delivered: ${result.note || "unknown error"})`;
      }
      lines.push(`<@${c.discord_id}> - **${c.damage}** dmg → **${share} ${settings.currency_emoji || ""} ${settings.currency_name}**${kitNote}`);
    }
    const topDamager = contributors[0];
    if (settings.mvp_bonus_amount > 0) {
      db.grantFromSupply(guild.id, settings.currency_id, topDamager.discord_id, settings.mvp_bonus_amount);
      lines.push(`\n🏆 MVP: <@${topDamager.discord_id}> gets a bonus **${fmtAmount(currencyFor(guild.id, settings.currency_id), settings.mvp_bonus_amount)}**!`);
    }
  }

  const embed = successEmbed("💥 Bradley Down!", contributors.length ? lines.join("\n") : "The Bradley went down, but nobody dealt any damage - no rewards this time.");
  const channel = await guild.channels.fetch(ambush.channel_id).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});

  db.closeBradleyAmbush(ambush.id);
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;
  const ambushId = Number(parts[2]);
  const ambush = db.getBradleyAmbush(ambushId);
  if (!ambush || ambush.guild_id !== guildId || ambush.phase === "resolved") {
    await interaction.reply({ embeds: [dangerEmbed("Gone", "This raid isn't active anymore.")], ephemeral: true });
    return;
  }
  const settings = db.getBradleyAmbushSettings(guildId);

  if (action === "join") {
    if (ambush.phase !== "checkin") {
      await interaction.reply({ embeds: [dangerEmbed("Check-In Closed", "This raid's check-in window is over.")], ephemeral: true });
      return;
    }
    const existing = db.listBradleyAmbushParticipants(ambush.id).find((p) => p.discord_id === interaction.user.id);
    if (existing) {
      await interaction.reply({ embeds: [infoEmbed("Already In", "You're already checked in for this raid.")], ephemeral: true });
      return;
    }
    const currency = currencyFor(guildId, settings.currency_id);
    const wallet = db.getWallet(guildId, interaction.user.id, settings.currency_id);
    if (settings.entry_fee > 0 && wallet.balance < settings.entry_fee) {
      await interaction.reply({ embeds: [dangerEmbed("Insufficient Funds", `Joining costs **${fmtAmount(currency, settings.entry_fee)}** - you only have **${wallet.balance}**.`)], ephemeral: true });
      return;
    }
    if (settings.entry_fee > 0) db.adjustWallet(guildId, interaction.user.id, settings.currency_id, -settings.entry_fee);
    db.joinBradleyAmbush(ambush.id, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed("Joined!", `You staked **${fmtAmount(currency, settings.entry_fee)}** - good luck out there.`)], ephemeral: true });

    const channel = await interaction.guild.channels.fetch(ambush.channel_id).catch(() => null);
    if (channel && ambush.message_id) {
      const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
      if (message) await message.edit(checkinView(ambush, settings)).catch(() => {});
    }
    return;
  }

  // Combat actions below - shared cooldown across all 3 buttons.
  if (ambush.phase !== "combat") {
    await interaction.reply({ embeds: [dangerEmbed("Not In Combat", "This raid isn't in its combat phase.")], ephemeral: true });
    return;
  }
  const cooldown = db.getBradleyAmbushCooldown(ambush.id, interaction.user.id);
  const cooldownMs = settings.action_cooldown_seconds * 1000;
  if (cooldown?.last_action_at && Date.now() - cooldown.last_action_at < cooldownMs) {
    const readyAt = Math.floor((cooldown.last_action_at + cooldownMs) / 1000);
    await interaction.reply({ embeds: [dangerEmbed("On Cooldown", `You can act again <t:${readyAt}:R>.`)], ephemeral: true });
    return;
  }

  const armorActive = ambush.armor_cracked_until > Date.now();
  let damage;
  let note;
  if (action === "shrapnel") {
    damage = 30;
    db.setBradleyAmbushArmorCracked(ambush.id, Date.now() + settings.armor_crack_seconds * 1000);
    note = `Armor cracked! **1.5x damage server-wide** for the next **${settings.armor_crack_seconds}s**.`;
  } else if (action === "hvrocket") {
    damage = armorActive ? 225 : 150;
    note = armorActive ? "Armor-cracked bonus applied!" : null;
  } else if (action === "c4") {
    damage = armorActive ? 525 : 350;
    note = armorActive ? "Armor-cracked bonus applied!" : null;
  } else {
    return;
  }

  db.recordBradleyAmbushDamage(ambush.id, interaction.user.id, damage, Date.now());
  const newHp = db.damageBradleyAmbush(ambush.id, damage);
  await interaction.reply({ embeds: [successEmbed("Hit!", `You dealt **${damage}** damage.${note ? `\n${note}` : ""}`)], ephemeral: true });

  const updated = db.getBradleyAmbush(ambush.id);
  const channel = await interaction.guild.channels.fetch(ambush.channel_id).catch(() => null);
  if (newHp <= 0) {
    if (channel && ambush.message_id) {
      const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
      if (message) await message.edit({ embeds: [successEmbed("🔓 Bradley Down!", "Calculating rewards...")], components: [] }).catch(() => {});
    }
    await resolveAmbushCracked(interaction.guild, updated, settings);
    return;
  }

  if (channel && ambush.message_id) {
    const message = await channel.messages.fetch(ambush.message_id).catch(() => null);
    if (message) await message.edit(combatView(updated)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Configure flow helpers (called from utils/gamesPanel.js)
// ---------------------------------------------------------------------------

function adminMenu(guildId) {
  const settings = db.getBradleyAmbushSettings(guildId);
  const active = db.getActiveBradleyAmbush(guildId);
  const status = settings?.channel_id
    ? `Channel: <#${settings.channel_id}>\nCurrency: **${settings.currency_emoji || ""} ${settings.currency_name || "not set"}**\nEntry fee: **${settings.entry_fee}**\n` +
      `Check-in: **${settings.checkin_minutes}min**, Combat: **${settings.combat_minutes}min**\nMax HP: **${settings.max_hp}**, Cooldown: **${settings.action_cooldown_seconds}s**, Armor debuff: **${settings.armor_crack_seconds}s**\n` +
      `Loot kit: **${settings.loot_kit_name || "none set"}**, MVP bonus: **${settings.mvp_bonus_amount}**\nAuto-spawn: **${settings.interval_hours > 0 ? `every ${settings.interval_hours}h` : "off - manual trigger only"}**` +
      (active ? `\n\n🚁 **A raid is currently active** (phase: ${active.phase}).` : "")
    : "_Not set up yet - set a channel, currency, and rewards below before this can be triggered._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_bradley_set_channel").setLabel("Set Channel").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_bradley_set_rewards").setLabel("Set Fees & Timing").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gamespanel:cfg_bradley_set_combat").setLabel("Set Combat").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gamespanel:cfg_bradley_set_loot").setLabel("Set Loot Kit").setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_bradley_trigger").setLabel("🚁 Trigger Now").setStyle(ButtonStyle.Danger).setDisabled(!settings?.channel_id || !settings?.currency_id || Boolean(active)),
    new ButtonBuilder().setCustomId("gamespanel:cfg_back_to_game_select").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: The Bradley APC Ambush", status)], components: [row1, row2, row3] };
}

function channelSelectRow() {
  return new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("gamespanel:cfg_bradley_channel_select").setPlaceholder("Which channel should raids post in?").addChannelTypes(ChannelType.GuildText));
}

function rewardsModal(guildId) {
  const settings = db.getBradleyAmbushSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_bradley_rewards_modal").setTitle("Fees & Timing");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings?.currency_name) currencyInput.setValue(settings.currency_name);
  const feeInput = new TextInputBuilder().setCustomId("entry_fee").setLabel("Entry fee per raider").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.entry_fee ?? 0));
  const checkinInput = new TextInputBuilder().setCustomId("checkin_minutes").setLabel("Check-in window (minutes)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.checkin_minutes ?? 3));
  const combatInput = new TextInputBuilder().setCustomId("combat_minutes").setLabel("Combat time limit (minutes)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.combat_minutes ?? 15));
  const intervalInput = new TextInputBuilder().setCustomId("interval_hours").setLabel("Auto-spawn every N hours (0 = manual only)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.interval_hours ?? 0));
  modal.addComponents(
    new ActionRowBuilder().addComponents(currencyInput),
    new ActionRowBuilder().addComponents(feeInput),
    new ActionRowBuilder().addComponents(checkinInput),
    new ActionRowBuilder().addComponents(combatInput),
    new ActionRowBuilder().addComponents(intervalInput)
  );
  return modal;
}

function combatModal(guildId) {
  const settings = db.getBradleyAmbushSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_bradley_combat_modal").setTitle("Combat Settings");
  const hpInput = new TextInputBuilder().setCustomId("max_hp").setLabel("Bradley max HP").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.max_hp ?? 1000));
  const cooldownInput = new TextInputBuilder().setCustomId("cooldown_seconds").setLabel("Cooldown per player (seconds)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.action_cooldown_seconds ?? 5));
  const armorInput = new TextInputBuilder().setCustomId("armor_seconds").setLabel("Armor-crack debuff duration (seconds)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.armor_crack_seconds ?? 45));
  const mvpInput = new TextInputBuilder().setCustomId("mvp_bonus").setLabel("MVP (top damager) bonus").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.mvp_bonus_amount ?? 500));
  modal.addComponents(
    new ActionRowBuilder().addComponents(hpInput),
    new ActionRowBuilder().addComponents(cooldownInput),
    new ActionRowBuilder().addComponents(armorInput),
    new ActionRowBuilder().addComponents(mvpInput)
  );
  return modal;
}

function lootKitSelectRow(guildId) {
  const kits = db.listKits(guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_bradley_loot_select")
    .setPlaceholder(kits.length ? "Which kit?" : "No kits registered - see /kit-panel");
  if (kits.length) menu.addOptions(kits.slice(0, 25).map((k) => ({ label: k.display_name.slice(0, 100), value: k.display_name.slice(0, 100) })));
  else menu.addOptions({ label: "none", value: "__none__" }).setDisabled(true);
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  handleComponent,
  runBradleyAmbushSpawnTick,
  runBradleyAmbushTick,
  triggerAmbush,
  adminMenu,
  channelSelectRow,
  rewardsModal,
  combatModal,
  lootKitSelectRow,
};

"use strict";

/**
 * The Co-op Vault Heist - unlike Lootbox/The Defuse Wire/The Grid Minefield,
 * this is NOT a per-player wager game a player picks from the Games Panel's
 * Play button. It's a periodic ambient server event: every `interval_hours`
 * (see vault_heist_settings), kobabot drops a "Locked Vault" post in a
 * configured channel with a shared HP pool. ANYONE can attack it for free
 * (no wager) via the Breach/Hack/C4 buttons on that post directly - there's
 * deliberately no "choose this game from a menu" step, since the whole
 * point is a shared, opportunistic, channel-wide event rather than a solo
 * silo. Configuration still goes through the Games Panel's Configure flow
 * (see utils/gamesPanel.js's cfg_game_select handling of "vault_heist"),
 * it's just excluded from the Play flow's game list - see config/games.js's
 * `configureOnly` flag.
 *
 * Each of the 3 attack buttons does the same thing (random damage in
 * min_damage-max_damage, one shared cooldown across all three so cycling
 * between them can't bypass it) - they're flavor-only, not mechanically
 * different, matching the original "​/breach, /hack, or /c4" pitch's spirit
 * without needing three separately-tuned mechanics.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed, baseEmbed, COLORS } = require("./embeds");

const ATTACKS = [
  { key: "breach", label: "Breach", emoji: "🔨" },
  { key: "hack", label: "Hack", emoji: "💻" },
  { key: "c4", label: "C4", emoji: "💣" },
];
const BAR_LENGTH = 20;

function healthBar(current, max) {
  const filled = Math.round((current / max) * BAR_LENGTH);
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, BAR_LENGTH - filled));
}

function attackRow(vaultId) {
  return new ActionRowBuilder().addComponents(
    ATTACKS.map((a) => new ButtonBuilder().setCustomId(`vaultheist:attack:${vaultId}:${a.key}`).setLabel(a.label).setEmoji(a.emoji).setStyle(ButtonStyle.Danger))
  );
}

function buildVaultEmbed(vault) {
  const pct = Math.round((vault.current_hp / vault.max_hp) * 100);
  const embed = baseEmbed(COLORS.danger)
    .setTitle("🔒 Locked Vault")
    .setDescription(
      `\`${healthBar(vault.current_hp, vault.max_hp)}\` **${pct}%**\n` +
        `**${vault.current_hp} / ${vault.max_hp}** HP remaining\n\n` +
        `Attack it with the buttons below - everyone who deals damage gets a share of the reward once it cracks, and whoever deals the most gets a bonus.`
    );
  return { embeds: [embed], components: [attackRow(vault.id)] };
}

/** Spawns a fresh vault in a guild's configured channel if it's due (interval elapsed, no vault currently active) - called from utils/backgroundLoops.js. */
async function runVaultSpawnTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = db.getVaultHeistSettings(guild.id);
    if (!settings?.channel_id || !settings?.currency_id) continue; // not configured yet
    if (db.getActiveVault(guild.id)) continue; // one at a time

    const intervalMs = settings.interval_hours * 60 * 60 * 1000;
    if (settings.last_spawned_at && Date.now() - settings.last_spawned_at < intervalMs) continue;

    const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
    if (!channel) continue;

    const vaultId = db.createVault(guild.id, settings.channel_id, settings.target_hp);
    db.markVaultSpawned(guild.id, Date.now());
    const vault = db.getVault(vaultId);
    const message = await channel.send(buildVaultEmbed(vault)).catch(() => null);
    if (message) db.setVaultMessageId(vaultId, message.id);
  }
}

/** Vault cracked - splits reward_pool_amount proportionally by damage dealt, plus a flat top_damager_bonus to whoever dealt the most, then closes it out. Best-effort per recipient (an unresolvable member is skipped, not fatal to the others). */
async function resolveVaultCracked(guild, vault, settings) {
  const contributors = db.listVaultDamage(vault.id);
  const totalDamage = contributors.reduce((sum, c) => sum + c.damage, 0);
  const lines = [];

  if (totalDamage > 0) {
    for (const c of contributors) {
      const share = Math.round((c.damage / totalDamage) * settings.reward_pool_amount * 100) / 100;
      if (share > 0) db.grantFromSupply(guild.id, settings.currency_id, c.discord_id, share);
      lines.push(`<@${c.discord_id}> - **${c.damage}** dmg → **${share} ${settings.currency_emoji || ""} ${settings.currency_name}**`);
    }
    const topDamager = contributors[0];
    if (settings.top_damager_bonus > 0) {
      db.grantFromSupply(guild.id, settings.currency_id, topDamager.discord_id, settings.top_damager_bonus);
      lines.push(`\n🏆 Top Damager: <@${topDamager.discord_id}> gets a bonus **${settings.top_damager_bonus} ${settings.currency_emoji || ""} ${settings.currency_name}**!`);
    }
  }

  const embed = successEmbed("💥 Vault Cracked!", contributors.length ? lines.join("\n") : "The vault cracked, but nobody dealt any damage - no rewards this time.");
  const channel = await guild.channels.fetch(vault.channel_id).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});

  db.closeVault(vault.id);
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "attack") {
    const vaultId = Number(parts[2]);
    const vault = db.getVault(vaultId);
    if (!vault || vault.guild_id !== guildId) {
      await interaction.reply({ embeds: [dangerEmbed("Gone", "This vault isn't active anymore.")], ephemeral: true });
      return;
    }

    const settings = db.getVaultHeistSettings(guildId);
    const cooldown = db.getVaultPlayerCooldown(vaultId, interaction.user.id);
    const cooldownMs = (settings?.cooldown_seconds ?? 30) * 1000;
    if (cooldown?.last_action_at && Date.now() - cooldown.last_action_at < cooldownMs) {
      const readyAt = Math.floor((cooldown.last_action_at + cooldownMs) / 1000);
      await interaction.reply({ embeds: [dangerEmbed("On Cooldown", `You can attack again <t:${readyAt}:R>.`)], ephemeral: true });
      return;
    }

    const minDamage = settings?.min_damage ?? 50;
    const maxDamage = settings?.max_damage ?? 200;
    const damage = minDamage + Math.floor(Math.random() * (maxDamage - minDamage + 1));
    db.recordVaultDamage(vaultId, interaction.user.id, damage, Date.now());
    const newHp = db.damageVault(vaultId, damage);

    await interaction.reply({ embeds: [successEmbed("Hit!", `You dealt **${damage}** damage to the vault.`)], ephemeral: true });

    const updatedVault = db.getVault(vaultId);
    if (newHp <= 0) {
      // Cracked - swap the live post to a static "cracked" state (no more attack buttons) before paying out, so a straggling click can't sneak in after resolution starts.
      const channel = await interaction.guild.channels.fetch(vault.channel_id).catch(() => null);
      if (channel && vault.message_id) {
        const message = await channel.messages.fetch(vault.message_id).catch(() => null);
        if (message) await message.edit({ embeds: [successEmbed("🔓 Vault Cracked!", "Calculating rewards...")], components: [] }).catch(() => {});
      }
      await resolveVaultCracked(interaction.guild, updatedVault, settings);
      return;
    }

    // Still standing - update the live post with the new HP bar.
    const channel = await interaction.guild.channels.fetch(vault.channel_id).catch(() => null);
    if (channel && vault.message_id) {
      const message = await channel.messages.fetch(vault.message_id).catch(() => null);
      if (message) await message.edit(buildVaultEmbed(updatedVault)).catch(() => {});
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Configure flow helpers (called from utils/gamesPanel.js)
// ---------------------------------------------------------------------------

function adminMenu(guildId) {
  const settings = db.getVaultHeistSettings(guildId);
  const status = settings?.channel_id
    ? `Channel: <#${settings.channel_id}>\nCurrency: **${settings.currency_emoji || ""} ${settings.currency_name || "not set"}**\nEvery **${settings.interval_hours}h**, target **${settings.target_hp} HP**\nReward pool **${settings.reward_pool_amount}**, top damager bonus **${settings.top_damager_bonus}**\nCooldown **${settings.cooldown_seconds}s**, damage **${settings.min_damage}-${settings.max_damage}** per hit`
    : "_Not set up yet - set a channel, currency, and rewards below before vaults start spawning._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_vault_set_channel").setLabel("Set Channel").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_vault_set_rewards").setLabel("Set Rewards & Timing").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gamespanel:cfg_vault_set_combat").setLabel("Set Combat").setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_back_to_game_select").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
  return { embeds: [infoEmbed("Configure: The Co-op Vault Heist", status)], components: [row1, row2, row3] };
}

function channelSelectRow() {
  return new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("gamespanel:cfg_vault_channel_select").setPlaceholder("Which channel should vaults post in?").addChannelTypes(ChannelType.GuildText));
}

function rewardsModal(guildId) {
  const settings = db.getVaultHeistSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_vault_rewards_modal").setTitle("Rewards & Timing");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings?.currency_name) currencyInput.setValue(settings.currency_name);
  const intervalInput = new TextInputBuilder().setCustomId("interval_hours").setLabel("Hours between vaults").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.interval_hours ?? 4));
  const targetHpInput = new TextInputBuilder().setCustomId("target_hp").setLabel("Target HP").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.target_hp ?? 5000));
  const poolInput = new TextInputBuilder().setCustomId("reward_pool").setLabel("Total reward pool (split by damage)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.reward_pool_amount ?? 1000));
  const bonusInput = new TextInputBuilder().setCustomId("top_bonus").setLabel("Top Damager bonus").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.top_damager_bonus ?? 200));
  modal.addComponents(
    new ActionRowBuilder().addComponents(currencyInput),
    new ActionRowBuilder().addComponents(intervalInput),
    new ActionRowBuilder().addComponents(targetHpInput),
    new ActionRowBuilder().addComponents(poolInput),
    new ActionRowBuilder().addComponents(bonusInput)
  );
  return modal;
}

function combatModal(guildId) {
  const settings = db.getVaultHeistSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_vault_combat_modal").setTitle("Combat Settings");
  const cooldownInput = new TextInputBuilder().setCustomId("cooldown_seconds").setLabel("Cooldown per player (seconds)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.cooldown_seconds ?? 30));
  const minInput = new TextInputBuilder().setCustomId("min_damage").setLabel("Minimum damage per hit").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.min_damage ?? 50));
  const maxInput = new TextInputBuilder().setCustomId("max_damage").setLabel("Maximum damage per hit").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.max_damage ?? 200));
  modal.addComponents(new ActionRowBuilder().addComponents(cooldownInput), new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

module.exports = { handleComponent, runVaultSpawnTick, adminMenu, channelSelectRow, rewardsModal, combatModal };

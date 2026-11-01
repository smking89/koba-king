"use strict";

/**
 * Recurring gift drops (daily/weekly/monthly/yearly) - reuses the exact
 * same calendar-aligned period boundaries as the referral leaderboard
 * (utils/referralLeaderboard.js's currentPeriodStart) so "daily" etc. mean
 * the same thing everywhere in the bot. Each period boundary crossed posts
 * a fresh claimable drop into the gifts channel, deleting the previous
 * period's message first (same pattern as the leaderboard image refresh).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { grantReferralReward } = require("./referralRewards");
const { currentPeriodStart, PERIODS } = require("./referralLeaderboard");
const { infoEmbed, successEmbed, dangerEmbed, warningEmbed } = require("./embeds");

function rolloverKey(giftType) {
  return `gift_rollover_${giftType}`;
}

function messageKey(giftType) {
  return `gift_message_${giftType}`;
}

function describeReward(config) {
  if (config.reward_type === "kit") return `kit **${config.kit_name}**`;
  if (config.reward_type === "role") return `role <@&${config.role_id}>`;
  return config.coin_min_amount === config.coin_max_amount ? `**${config.coin_min_amount}** coins` : `a random **${config.coin_min_amount}-${config.coin_max_amount}** coins`;
}

/**
 * FIXED (2026-09-07): a "coins" gift with no coin_currency_id (stale data
 * from before /gift-config validated this at creation time, or a currency
 * that was deleted from /shop-panel after the gift was configured - there's
 * no foreign key/cascade wiring these together) used to still post a
 * "Claim" button that crashed the moment anyone clicked it (adjustWallet's
 * NOT NULL constraint on shop_wallets.currency_id). Confirmed live.
 */
function isMisconfigured(config) {
  return config.reward_type === "coins" && !config.coin_currency_id;
}

async function postGiftDrop(guild, giftType, config, periodStart) {
  if (isMisconfigured(config)) {
    console.warn(`[KOBA Bot] Skipping ${giftType} gift drop for guild ${guild.id} - reward_type is "coins" but no currency is configured. Re-run /gift-config set with a valid currency.`);
    return;
  }

  const meta = db.getGuildMeta(guild.id);
  if (!meta?.gifts_channel_id) return;
  const channel = await guild.channels.fetch(meta.gifts_channel_id).catch(() => null);
  if (!channel) return;

  // Delete the previous period's drop message, same "delete then post fresh"
  // pattern as the leaderboard image refresh - a stale claim button from
  // last period should never still be clickable.
  const oldMessageId = db.getConfig(guild.id, messageKey(giftType));
  if (oldMessageId) {
    const old = await channel.messages.fetch(oldMessageId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const label = `${giftType[0].toUpperCase()}${giftType.slice(1)}`;
  const embed = infoEmbed(`🎁 ${label} Gift`, config.message_text || `Claim this ${giftType} gift - ${describeReward(config)}!`);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gift:claim:${giftType}:${periodStart}`).setLabel("🎁 Claim").setStyle(ButtonStyle.Success));

  const message = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (message) db.setConfig(guild.id, messageKey(giftType), message.id);
}

/** Checks every guild/recurring-gift-type combo for a crossed boundary and posts the new drop. */
async function runGiftSchedulerTick(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const giftType of PERIODS) {
      const config = db.getGiftConfig(guild.id, giftType);
      if (!config?.enabled) continue;

      const key = rolloverKey(giftType);
      const storedStart = db.getConfig(guild.id, key);
      const nowStart = currentPeriodStart(giftType);

      if (storedStart == null) {
        db.setConfig(guild.id, key, nowStart);
        await postGiftDrop(guild, giftType, config, nowStart).catch((err) => console.error(`[KOBA Bot] Gift drop post failed for guild ${guild.id} (${giftType}):`, err));
        continue;
      }

      if (nowStart > storedStart) {
        db.setConfig(guild.id, key, nowStart);
        await postGiftDrop(guild, giftType, config, nowStart).catch((err) => console.error(`[KOBA Bot] Gift drop post failed for guild ${guild.id} (${giftType}):`, err));
      }
    }
  }
}

async function handleComponent(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("gift:claim:")) return;

  await interaction.deferReply({ ephemeral: true });

  const [, , giftType, periodStartRaw] = interaction.customId.split(":");
  const periodStart = Number(periodStartRaw);
  const config = db.getGiftConfig(interaction.guildId, giftType);

  if (!config?.enabled) {
    await interaction.editReply({ embeds: [dangerEmbed("Gift Unavailable", "This gift isn't configured anymore.")] });
    return;
  }
  if (currentPeriodStart(giftType) !== periodStart) {
    await interaction.editReply({ embeds: [warningEmbed("Gift Expired", "This drop is from a previous period - check for a newer one.")] });
    return;
  }
  if (db.hasClaimedGift(interaction.guildId, giftType, periodStart, interaction.user.id)) {
    await interaction.editReply({ embeds: [warningEmbed("Already Claimed", "You already claimed this period's gift.")] });
    return;
  }
  // See postGiftDrop's isMisconfigured header - a defensive backstop in case
  // an older claim button (posted before this guard existed) is still live.
  if (isMisconfigured(config)) {
    await interaction.editReply({ embeds: [dangerEmbed("Gift Misconfigured", "This gift's currency was removed - ask an admin to re-run `/gift-config set` with a valid currency.")] });
    return;
  }

  const lines = ["🎁 Gift claimed!"];

  if (config.reward_type === "coins") {
    const amount = config.coin_min_amount === config.coin_max_amount ? config.coin_min_amount : config.coin_min_amount + Math.random() * (config.coin_max_amount - config.coin_min_amount);
    const rounded = Math.round(amount * 100) / 100;
    const { granted } = db.grantFromSupply(interaction.guildId, config.coin_currency_id, interaction.user.id, rounded);
    const newBalance = db.getWallet(interaction.guildId, interaction.user.id, config.coin_currency_id).balance;
    const currency = db.getCurrency(interaction.guildId, config.coin_currency_id);
    lines.push(`**${granted} ${currency?.emoji || currency?.name || "coins"}** credited. New balance: **${newBalance}**.`);
  } else {
    const result = await grantReferralReward(interaction.guild, interaction.user.id, {
      kit: config.reward_type === "kit" ? config.kit_name : undefined,
      roleId: config.reward_type === "role" ? config.role_id : undefined,
      roleTempHours: config.role_temp_hours,
    });
    if (config.reward_type === "kit") lines.push(result.kitDelivered ? `Kit **${config.kit_name}** delivered.` : `Kit delivery failed: ${result.kitError}`);
    if (config.reward_type === "role") lines.push(result.roleGranted ? `Role <@&${config.role_id}> granted${config.role_temp_hours ? ` for ${config.role_temp_hours}h` : ""}.` : `Role grant failed: ${result.roleError}`);
  }

  db.recordGiftClaim(interaction.guildId, giftType, periodStart, interaction.user.id);

  await interaction.editReply({ embeds: [successEmbed("Gift Claimed", lines.join("\n"))] });
}

module.exports = { runGiftSchedulerTick, handleComponent };

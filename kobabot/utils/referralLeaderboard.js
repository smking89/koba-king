"use strict";

/**
 * Period-based leaderboard payouts. Boundaries are calendar-aligned (UTC) -
 * daily resets at midnight UTC, weekly on Monday UTC, monthly on the 1st,
 * yearly on Jan 1st - not "N hours after the last check", so payouts land
 * on predictable, human-legible boundaries.
 *
 * Rollover state (the start of the period currently in progress) is stored
 * per guild/period via the existing generic guild_config store, so a bot
 * restart doesn't lose track of what's already been paid out.
 */

const db = require("../database/db");
const { grantReferralReward } = require("./referralRewards");
const { successEmbed, infoEmbed } = require("./embeds");
const { renderLeaderboardImage } = require("./leaderboardImage");
const { AttachmentBuilder } = require("discord.js");

const PERIODS = ["hourly", "daily", "weekly", "monthly", "yearly"];
const LEADERBOARD_IMAGE_TOP_N = 10;

function currentPeriodStart(period, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (period) {
    case "hourly":
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours());
    case "daily":
      return d.getTime();
    case "weekly": {
      const day = d.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - diffToMonday);
      return d.getTime();
    }
    case "monthly":
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    case "yearly":
      return Date.UTC(now.getUTCFullYear(), 0, 1);
    default:
      return d.getTime();
  }
}

function rolloverConfigKey(period) {
  return `referral_rollover_${period}`;
}

async function payOutPeriod(client, guild, period, since, until) {
  const rewards = db.listLeaderboardRewards(guild.id, period);
  if (!rewards.length) return; // nothing configured for this period - nothing to pay out

  const leaderboard = db.getReferralLeaderboard(guild.id, since, until, rewards.length);
  if (!leaderboard.length) return; // nobody referred anyone this period

  const meta = db.getGuildMeta(guild.id);
  const channel = meta?.panel_channel_id ? await guild.channels.fetch(meta.panel_channel_id).catch(() => null) : null;
  const lines = [];

  for (const reward of rewards) {
    const entry = leaderboard[reward.place - 1];
    if (!entry) continue;

    const grantArgs = {
      kit: reward.reward_type === "kit" ? reward.kit_name : undefined,
      roleId: reward.reward_type === "role" ? reward.role_id : undefined,
      roleTempHours: reward.role_temp_hours,
    };
    const result = await grantReferralReward(guild, entry.referrer_id, grantArgs);
    const rewardLabel = reward.reward_type === "kit" ? `kit **${reward.kit_name}**` : `role <@&${reward.role_id}>`;
    lines.push(`**#${reward.place}** <@${entry.referrer_id}> - ${entry.referrals} referral(s) - ${rewardLabel}${result.kitError || result.roleError ? ` (${result.kitError || result.roleError})` : ""}`);
  }

  if (channel && lines.length) {
    await channel
      .send({ embeds: [successEmbed(`${period[0].toUpperCase()}${period.slice(1)} Referral Leaderboard`, lines.join("\n"))] })
      .catch(() => {});
  }
}

/** Checks every guild/period combo for a crossed boundary and pays out the just-completed period. */
async function runLeaderboardRolloverTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.provisioned_at) continue;

    for (const period of PERIODS) {
      const key = rolloverConfigKey(period);
      const storedStart = db.getConfig(guild.id, key);
      const nowStart = currentPeriodStart(period);

      if (storedStart == null) {
        db.setConfig(guild.id, key, nowStart); // first time seeing this guild/period - just record the boundary, nothing to pay out yet
        continue;
      }

      if (nowStart > storedStart) {
        await payOutPeriod(client, guild, period, storedStart, nowStart).catch((err) =>
          console.error(`[KOBA Bot] Referral leaderboard payout failed for guild ${guild.id} (${period}):`, err)
        );
        db.setConfig(guild.id, key, nowStart);
      }
    }
  }
}

async function resolveDisplayName(guild, userId) {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached.displayName;
  const fetched = await guild.members.fetch(userId).catch(() => null);
  return fetched ? fetched.displayName : `Unknown (${userId})`;
}

/**
 * Refreshes the all-time referral leaderboard image in the guild's
 * leaderboard channel - literally deletes the previous message and posts a
 * fresh one each cycle (Discord doesn't support swapping a message's
 * attachment in place), matching the reference implementation's behavior.
 */
async function runReferralLeaderboardImageTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.leaderboard_channel_id) continue;

    const channel = await guild.channels.fetch(meta.leaderboard_channel_id).catch(() => null);
    if (!channel) continue;

    const rows = db.getReferralLeaderboard(guild.id, 0, Date.now(), LEADERBOARD_IMAGE_TOP_N);
    const entries = [];
    for (let i = 0; i < rows.length; i++) {
      const name = await resolveDisplayName(guild, rows[i].referrer_id);
      entries.push({ rank: i + 1, name, value: `${rows[i].referrals} referral${rows[i].referrals === 1 ? "" : "s"}` });
    }

    let imageBuffer;
    try {
      imageBuffer = await renderLeaderboardImage({ title: "Referral Leaderboard", subtitle: "All-Time · Top Referrers", entries });
    } catch (err) {
      console.error(`[KOBA Bot] Leaderboard image render failed for guild ${guild.id}:`, err);
      continue;
    }

    // Edit in place on refresh - reposting+repinning a fresh message every
    // tick left stale "X pinned a message" system notifications behind
    // forever, since deleting the old pinned message doesn't remove those.
    const attachment = new AttachmentBuilder(imageBuffer, { name: "referral-leaderboard.png" });
    const embed = infoEmbed("Referral Leaderboard", "Refreshes automatically - invite people with `/referral generate` to climb the ranks.").setImage(
      "attachment://referral-leaderboard.png"
    );

    const existingMessage = meta.referral_leaderboard_message_id ? await channel.messages.fetch(meta.referral_leaderboard_message_id).catch(() => null) : null;
    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed], files: [attachment] }).catch(() => {});
    } else {
      const newMessage = await channel.send({ embeds: [embed], files: [attachment] }).catch(() => null);
      if (newMessage) {
        db.upsertGuildMeta(guild.id, { referral_leaderboard_message_id: newMessage.id });
        await newMessage.pin().catch(() => {});
      }
    }
  }
}

module.exports = { runLeaderboardRolloverTick, runReferralLeaderboardImageTick, currentPeriodStart, resolveDisplayName, PERIODS };

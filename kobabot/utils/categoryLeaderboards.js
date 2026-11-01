"use strict";

/**
 * Clan Wars / Event Wins leaderboards - same calendar-aligned period
 * boundaries as the referral leaderboard (currentPeriodStart, reused
 * directly), but a separate rollover/reward table (leaderboard_rewards) so
 * the existing, already-working referral system isn't touched.
 *
 * Both categories resolve to a TEAM name (wars.winner / zone_events.winner_team)
 * - the reward goes to that team's top-ranked (E9) member.
 *
 * RESTORED (2026-10-18): pvp/pve were removed 2026-09-10 alongside the
 * killfeed display feature itself (no data source left once the display
 * was pulled). The display was already rebuilt 2026-10-12
 * (utils/killfeedDisplay.js) on the real pvp_kills table, and
 * utils/killfeedEngine.js now writes real event_type-classified rows every
 * kill - so the data source is real again. These resolve to a player
 * Gamertag (killer_gamertag), not a team - normalizeEntry()'s player-based
 * branch below was already written anticipating this, never removed.
 */

const { AttachmentBuilder } = require("discord.js");
const db = require("../database/db");
const { grantReferralReward } = require("./referralRewards");
const { renderLeaderboardImage } = require("./leaderboardImage");
const { successEmbed, infoEmbed } = require("./embeds");
const { rankById } = require("../config/ranks");

const CATEGORIES = {
  pvp: { label: "PvP Kills", isTeamBased: false, query: db.getPvpKillLeaderboard, countLabel: "kill" },
  pve: { label: "PvE Kills", isTeamBased: false, query: db.getPveKillLeaderboard, countLabel: "kill" },
};

// Calendar-aligned (UTC) period boundaries - daily resets at midnight UTC,
// weekly on Monday UTC, monthly on the 1st, yearly on Jan 1st - not "N
// hours after the last check", so payouts land on predictable boundaries.
const PERIODS = ["hourly", "daily", "weekly", "monthly", "yearly"];
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

function rolloverKey(category, period) {
  return `leaderboard_rollover_${category}_${period}`;
}

/** Team-based rows come back as {team_name, wins}; player-based as {killer_gamertag, kills} - normalized to one shape here. */
function normalizeEntry(row, isTeamBased) {
  return isTeamBased ? { identity: row.team_name, count: row.wins } : { identity: row.killer_gamertag, count: row.kills };
}

/** Resolves a leaderboard entry's identity (team name or Gamertag) to a Discord user id to actually grant the reward to. */
function resolveRecipient(guild, identity, isTeamBased) {
  if (isTeamBased) {
    const roster = db.listTeamMembers(guild.id, identity);
    const topRanked = roster
      .map((m) => ({ member: m, tier: rankById(m.rank_id)?.tier ?? 0 }))
      .sort((a, b) => b.tier - a.tier)[0];
    return topRanked?.member.discord_id || null;
  }
  const member = db.getMemberByGamertag(guild.id, identity);
  return member?.discord_id || null;
}

async function payOutCategoryPeriod(guild, categoryKey, period, since, until) {
  const category = CATEGORIES[categoryKey];
  const rewards = db.listGenericLeaderboardRewards(guild.id, categoryKey, period);
  if (!rewards.length) return;

  const rows = category.query(guild.id, since, until, rewards.length);
  if (!rows.length) return;

  const meta = db.getGuildMeta(guild.id);
  const channelId = meta?.leaderboard_channel_id || meta?.announcement_channel_id || meta?.panel_channel_id;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  const lines = [];

  for (const reward of rewards) {
    const row = rows[reward.place - 1];
    if (!row) continue;
    const entry = normalizeEntry(row, category.isTeamBased);
    const recipientId = resolveRecipient(guild, entry.identity, category.isTeamBased);
    if (!recipientId) {
      lines.push(`**#${reward.place}** ${entry.identity} - ${entry.count} ${category.countLabel}(s) - reward couldn't be delivered (no linked Discord account found)`);
      continue;
    }

    const result = await grantReferralReward(guild, recipientId, {
      kit: reward.reward_type === "kit" ? reward.kit_name : undefined,
      roleId: reward.reward_type === "role" ? reward.role_id : undefined,
      roleTempHours: reward.role_temp_hours,
    });
    const rewardLabel = reward.reward_type === "kit" ? `kit **${reward.kit_name}**` : `role <@&${reward.role_id}>`;
    lines.push(`**#${reward.place}** ${entry.identity} (<@${recipientId}>) - ${entry.count} ${category.countLabel}(s) - ${rewardLabel}${result.kitError || result.roleError ? ` (${result.kitError || result.roleError})` : ""}`);
  }

  if (channel && lines.length) {
    await channel.send({ embeds: [successEmbed(`${period[0].toUpperCase()}${period.slice(1)} ${category.label} Leaderboard`, lines.join("\n"))] }).catch(() => {});
  }
}

/** Checks every guild/category/period combo for a crossed boundary and pays out the just-completed period. */
async function runCategoryLeaderboardTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.provisioned_at) continue;

    for (const categoryKey of Object.keys(CATEGORIES)) {
      for (const period of PERIODS) {
        const key = rolloverKey(categoryKey, period);
        const storedStart = db.getConfig(guild.id, key);
        const nowStart = currentPeriodStart(period);

        if (storedStart == null) {
          db.setConfig(guild.id, key, nowStart);
          continue;
        }

        if (nowStart > storedStart) {
          await payOutCategoryPeriod(guild, categoryKey, period, storedStart, nowStart).catch((err) =>
            console.error(`[KOBA Bot] Leaderboard payout failed for guild ${guild.id} (${categoryKey}/${period}):`, err)
          );
          db.setConfig(guild.id, key, nowStart);
        }
      }
    }
  }
}

/**
 * Refreshes a live-standings image per category (Clan Wars/Event Wins),
 * all posted to the same leaderboard_channel_id referral's image
 * already uses - since an admin can now have several running at once, the
 * title rendered ON the image itself (see utils/leaderboardImage.js) is
 * what actually distinguishes them, not which channel/message they're in.
 * Separate from runCategoryLeaderboardTick above (that one's payouts only).
 */
async function runCategoryLeaderboardImageTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const meta = db.getGuildMeta(guild.id);
    if (!meta?.leaderboard_channel_id) continue;
    const channel = await guild.channels.fetch(meta.leaderboard_channel_id).catch(() => null);
    if (!channel) continue;

    for (const [key, category] of Object.entries(CATEGORIES)) {
      const rows = category.query(guild.id, 0, Date.now(), 10);
      const entries = rows.map((r, i) => {
        const count = r.wins ?? r.kills ?? 0;
        return { rank: i + 1, name: r.team_name || r.killer_gamertag || "Unknown", value: `${count} ${category.countLabel}${count === 1 ? "" : "s"}` };
      });

      let imageBuffer;
      try {
        imageBuffer = await renderLeaderboardImage({ title: `${category.label} Leaderboard`, subtitle: "All-Time · Top Standings", entries });
      } catch (err) {
        console.error(`[KOBA Bot] Category leaderboard image render failed for guild ${guild.id} (${key}):`, err);
        continue;
      }

      // Edit the same message in place on refresh, rather than delete+repost
      // - reposting meant calling .pin() every single tick, and unlike the
      // message itself (which did get cleaned up), Discord's "X pinned a
      // message" system notification does NOT get removed when the pinned
      // message is later deleted, so it piled up in the channel forever.
      const messageIdKey = `category_leaderboard_message_${key}`;
      const existingId = db.getConfig(guild.id, messageIdKey);
      const attachment = new AttachmentBuilder(imageBuffer, { name: `${key}-leaderboard.png` });
      const embed = infoEmbed(`${category.label} Leaderboard`, "Refreshes automatically.").setImage(`attachment://${key}-leaderboard.png`);

      const existingMessage = existingId ? await channel.messages.fetch(existingId).catch(() => null) : null;
      if (existingMessage) {
        await existingMessage.edit({ embeds: [embed], files: [attachment] }).catch(() => {});
      } else {
        const newMessage = await channel.send({ embeds: [embed], files: [attachment] }).catch(() => null);
        if (newMessage) {
          db.setConfig(guild.id, messageIdKey, newMessage.id);
          await newMessage.pin().catch(() => {});
        }
      }
    }
  }
}

module.exports = { runCategoryLeaderboardTick, runCategoryLeaderboardImageTick, CATEGORIES };

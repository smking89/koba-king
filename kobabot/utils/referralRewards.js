"use strict";

/**
 * Shared reward-granting logic used by both the welcome gift (on code
 * redemption) and the leaderboard payouts (period rollover) - a "reward"
 * is always either a kit (delivered over RCON to a linked Gamertag) or a
 * Discord role (optionally temporary, tracked in temp_role_grants for a
 * background tick to remove later).
 */

const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { logAdminAction } = require("./adminFeed");

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {{ kit?: string, roleId?: string, roleTempHours?: number }} reward
 * @returns {Promise<{ kitDelivered: boolean, kitError?: string, roleGranted: boolean, roleError?: string }>}
 */
async function grantReferralReward(guild, userId, reward) {
  const result = { kitDelivered: false, roleGranted: false };

  if (reward.kit) {
    const member = db.getMember(guild.id, userId);
    if (!member?.gamertag) {
      result.kitError = "No linked Gamertag on file - kit couldn't be auto-delivered.";
    } else {
      try {
        const rcon = await getRcon(guild.id);
        // Confirmed against RCE's official Kit Management docs (2026-09-01):
        // https://rust-console-edition.gitbook.io/community-servers/feature-guides/kit-management
        await rcon.send(`kit givetoplayer "${reward.kit}" "${member.gamertag}"`);
        result.kitDelivered = true;
        await logAdminAction(guild, {
          title: "Referral Reward Delivered",
          description: `**Item/Kit:** ${reward.kit} ×1\n**To:** ${member.gamertag} (<@${userId}>)\n**Source:** referral reward (auto)`,
        });
      } catch (err) {
        result.kitError = `RCON delivery failed: ${err.message}`;
      }
    }
  }

  if (reward.roleId) {
    try {
      const guildMember = await guild.members.fetch(userId);
      await guildMember.roles.add(reward.roleId, "KOBA Bot referral reward");
      result.roleGranted = true;
      if (reward.roleTempHours) {
        db.addTempRoleGrant(guild.id, userId, reward.roleId, Date.now() + reward.roleTempHours * 60 * 60 * 1000);
      }
    } catch (err) {
      result.roleError = `Role grant failed: ${err.message}`;
    }
  }

  return result;
}

/** Background tick: removes any role whose temporary grant has expired. */
async function runTempRoleExpiryTick(client) {
  const due = db.listDueTempRoleGrants();
  for (const grant of due) {
    const guild = client.guilds.cache.get(grant.guild_id);
    if (guild) {
      try {
        const member = await guild.members.fetch(grant.user_id);
        await member.roles.remove(grant.role_id, "KOBA Bot temporary reward expired");
      } catch {
        // member left, role already gone, or permissions changed - nothing more to do
      }
    }
    db.removeTempRoleGrant(grant.id);
  }
}

module.exports = { grantReferralReward, runTempRoleExpiryTick };

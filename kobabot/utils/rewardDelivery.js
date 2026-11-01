"use strict";

const db = require("../database/db");
const { deliverCart } = require("./shopDelivery");
const { resolveInternalKitName } = require("./kitRegistry");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist, findOnlinePlayerId } = require("../rcon/parsers");

/**
 * FIXED (2026-09-06): item/kit delivery used to send `kit givetoplayer`
 * over RCON with no check that the target was actually connected - RCE
 * accepts the command either way (no error thrown for an offline target),
 * so a claim attempt while offline was reported as delivered even though
 * nothing was actually given to anyone. Confirmed live: a lootbox Claim
 * button said "claimed" for a player who wasn't even in the server.
 * Any failure to verify (RCON unreachable, parse error) is treated as
 * "not online" - fail safe, never silently report success on a guess.
 */
async function isPlayerOnline(guildId, serverName, gamertag) {
  try {
    const rcon = await getRcon(guildId, serverName);
    const players = parsePlayerlist(await rcon.send("players"));
    return Boolean(findOnlinePlayerId(players, gamertag));
  } catch {
    return false;
  }
}

/**
 * Single delivery path for anything sold/won through the Shop, Auctions, or
 * (materials only) the Marketplace - one switch keyed on reward_type so all
 * three systems stay consistent instead of each hand-rolling its own
 * item/kit/role/material logic.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {{ rewardType: 'item'|'role'|'temp_role'|'kit'|'material', rewardRef: string, amount: number }} reward
 * @param {string} [serverName] - which linked Cluster map's RCON to use (see database/guild_servers via /add-server) - undefined/null uses the guild's single default connection. Irrelevant for role/temp_role/material (no RCON involved).
 * @returns {Promise<{ delivered: boolean, note?: string }>}
 */
async function deliverReward(guild, discordId, reward, serverName) {
  const { rewardType, rewardRef, amount } = reward;

  if (rewardType === "role" || rewardType === "temp_role") {
    try {
      const role = await guild.roles.fetch(rewardRef).catch(() => null);
      if (!role) return { delivered: false, note: "That role no longer exists." };
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) return { delivered: false, note: "Winner is no longer in the server." };
      await member.roles.add(role);
      // temp_role's `amount` is hours-until-expiry, not a quantity - reuses
      // the same temp_role_grants table + background tick as referral
      // rewards (see utils/referralRewards.js's runTempRoleExpiryTick).
      if (rewardType === "temp_role" && amount > 0) {
        db.addTempRoleGrant(guild.id, discordId, rewardRef, Date.now() + amount * 60 * 60 * 1000);
      }
      return { delivered: true };
    } catch (err) {
      return { delivered: false, note: `Role grant failed: ${err.message}` };
    }
  }

  // item/kit/material all require a linked Gamertag - roles are the only
  // reward type that's Discord-side only.
  const member = db.getMember(guild.id, discordId);
  if (!member?.gamertag) return { delivered: false, note: "Winner hasn't linked a Gamertag with /link yet." };

  if (rewardType === "material") {
    if (!member.team_name) return { delivered: false, note: "Winner isn't rostered to a team - materials need a team to credit." };
    db.adjustTeamMaterials(guild.id, member.team_name, { [rewardRef]: amount });
    return { delivered: true };
  }

  if (rewardType === "kit" || rewardType === "item") {
    if (!(await isPlayerOnline(guild.id, serverName, member.gamertag))) {
      return { delivered: false, note: "You need to be online in-game to claim this - come back when you're connected and press Claim again." };
    }
  }

  if (rewardType === "kit") {
    try {
      const internalKitName = resolveInternalKitName(guild.id, rewardRef) || rewardRef;
      const rcon = await getRcon(guild.id, serverName);
      await rcon.send(`kit givetoplayer "${internalKitName}" "${member.gamertag}"`);
      return { delivered: true };
    } catch (err) {
      return { delivered: false, note: `RCON delivery failed: ${err.message}` };
    }
  }

  // rewardType === "item" - raw Rust item, delivered via the shop's
  // throwaway-kit mechanism (see utils/shopDelivery.js).
  try {
    await deliverCart(guild.id, member.gamertag, [{ itemShortName: rewardRef, amount }], serverName);
    return { delivered: true };
  } catch (err) {
    return { delivered: false, note: `RCON delivery failed: ${err.message}` };
  }
}

module.exports = { deliverReward };

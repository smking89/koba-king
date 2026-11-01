"use strict";

/**
 * Real Basic/Pro/Max feature gating - see config/planTiers.js for the
 * actual limits. Reuses database/db.js's existing licensing/ownership
 * resolution (getGuildOwnerDiscordId + getGuildPlan, the same authoritative
 * lookup the Server Rivalry system uses) rather than inventing a second
 * "who owns this guild" mechanism.
 */

const db = require("../database/db");
const { getPlanLimits } = require("../config/planTiers");
const { dangerEmbed } = require("./embeds");

function getGuildPlanLimits(guildId) {
  const ownerId = db.getGuildOwnerDiscordId(guildId);
  const plan = ownerId ? db.getGuildPlan(ownerId, guildId) : "basic";
  return { plan, limits: getPlanLimits(plan) };
}

const UPGRADE_NOTE = "Upgrade at https://kobabot.tip4serv.com to unlock this.";

/**
 * Checks a boolean feature flag (marketplace/auctions/clanWars/etc.) -
 * replies with a friendly upsell (not a bare permission error) and returns
 * false if the guild's plan doesn't include it. Callers should return
 * immediately when this returns false.
 */
async function requireFeature(interaction, featureKey, featureLabel) {
  const { limits } = getGuildPlanLimits(interaction.guildId);
  if (limits[featureKey]) return true;
  await interaction.reply({
    embeds: [dangerEmbed("Pro Feature", `**${featureLabel}** isn't available on your current plan. ${UPGRADE_NOTE}`)],
    ephemeral: true,
  });
  return false;
}

/**
 * Checks a numeric cap (maxKits/maxShops/maxCurrencies/maxLinkedServers) -
 * `currentCount` is whatever the caller already has registered; a plan with
 * Infinity for this key always passes. Same "friendly upsell, caller
 * returns immediately on false" contract as requireFeature.
 */
async function requireUnderCap(interaction, capKey, capLabel, currentCount) {
  const { limits } = getGuildPlanLimits(interaction.guildId);
  const max = limits[capKey];
  if (currentCount < max) return true;
  await interaction.reply({
    embeds: [dangerEmbed("Plan Limit Reached", `Your current plan allows up to **${max} ${capLabel}** - you already have ${currentCount}. ${UPGRADE_NOTE}`)],
    ephemeral: true,
  });
  return false;
}

module.exports = { getGuildPlanLimits, requireFeature, requireUnderCap };

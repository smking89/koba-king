"use strict";

const db = require("../database/db");
const { premiumRequiredEmbed, premiumElsewhereEmbed, planRequiredEmbed, planElsewhereEmbed, basicLimitEmbed } = require("./embeds");

/**
 * Command Tier gate: licensing is per-server, but bound to the GUILD
 * OWNER's Discord account rather than a fixed guild id - a subscription
 * authorizes exactly one guild at a time (active_guild_id), auto-claimed
 * on first use, movable later with /transfer. Call this at the top of
 * every feature entry point (button/select/modal handler, slash command,
 * or guildCreate) that should be blocked for unauthorized guilds.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<boolean>} true if this specific guild is authorized
 */
async function isGuildOwnerPremium(guild) {
  return db.isGuildAuthorized(guild.ownerId, guild.id);
}

/** True if the owner has an active subscription, just not authorizing this guild. */
async function isGuildOwnerPremiumElsewhere(guild) {
  return db.isPremiumElsewhere(guild.ownerId, guild.id);
}

/**
 * FIXED (2026-09-19): this used to hard-require an actual paid
 * license/subscription (isGuildAuthorized) to pass ANY of the 40+ command/
 * handler entry points that call it - meaning a guild that never bought
 * Pro/Max (i.e. every "KOBA Bot Basic - Free Forever" guild, the plan
 * website/src/components/PlanGrid.jsx explicitly sells with no checkout at
 * all) failed this gate on literally everything, every time. requirePlan
 * (below) is the actual mechanism meant to reserve Pro/Max-only features
 * (marketplace, auctions, multi-currency, clan wars, etc. per the pricing
 * page) but was never wired into any of those specific features yet - so
 * until that per-feature gating is built out, this just confirms the
 * interaction happened in a real guild. Free/Basic access for everyone,
 * same as advertised.
 */
async function requirePremiumOwner(interaction) {
  return !!interaction.guild;
}

/** List of Discord user IDs allowed to run restricted admin commands (env-configured). */
function isBotOwner(discordId) {
  const ids = (process.env.BOT_OWNER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(discordId);
}

/** All Discord server IDs the owner treats as "official" (dev-only commands, platform-wide ban gating, etc.) - comma-separated, env-configured. There are 3 as of 2026-10-11: koba, koba.games, and KOBAbot. */
function officialGuildIds() {
  return (process.env.OFFICIAL_GUILD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The ONE canonical official server for single-guild public-facing display
 * purposes (public stats tick, the auto-refreshed invite link, the
 * directory hub) - distinct from officialGuildIds()'s full membership set,
 * since those 3 displays can only show one server's data at a time.
 * Defaults to OFFICIAL_FLAGSHIP_GUILD_ID if set, else the first entry in
 * OFFICIAL_GUILD_IDS. 2026-10-11 default picked as koba.games (matches the
 * actual koba.games domain used throughout every KOBA spec doc) - this is
 * a judgment call, not confirmed by the user; override via
 * OFFICIAL_FLAGSHIP_GUILD_ID in .env if wrong.
 */
function flagshipGuildId() {
  return process.env.OFFICIAL_FLAGSHIP_GUILD_ID || officialGuildIds()[0] || null;
}

/** Is this guild one of the official ones? (membership check, not "the" single flagship guild - see officialGuildIds() callers vs. the single-guild display use sites noted in utils/globalStatus.js etc.) */
function isOfficialGuild(guildId) {
  if (!guildId) return false;
  return officialGuildIds().includes(guildId);
}

/**
 * 'basic' | 'pro' | 'max' for this guild - checks manual multi-license
 * grants first, then the legacy single-license Stripe subscription (see
 * database/db.js's getActiveLicenseForGuild). Not yet wired into any
 * feature gate - existing commands still use requirePremiumOwner
 * unchanged; this (and requirePlan below) are the new primitives being
 * migrated to feature-by-feature per the Basic/Pro/Max pricing model.
 */
async function getGuildPlan(guild) {
  return db.getGuildPlan(guild.ownerId, guild.id);
}

/**
 * Guard requiring at least `minPlan` ('pro' or 'max' - 'basic' always
 * passes, there's nothing to gate on the free tier). Pro and Max share one
 * feature set (Max is just annual billing, per explicit user
 * clarification) so 'pro' is really the only minPlan any caller needs -
 * 'max' is kept for symmetry/future use, and currently behaves the same.
 * `featureLabel` (e.g. "Marketplace") is worked into the lock embed so the
 * denial reads correctly no matter which feature triggered it. Same reply
 * contract as requirePremiumOwner - `if (!(await requirePlan(interaction, "pro", "Marketplace"))) return;`
 */
async function requirePlan(interaction, minPlan, featureLabel = "This feature") {
  if (minPlan === "basic") return true;
  if (!interaction.guild) return false;

  const plan = await getGuildPlan(interaction.guild);
  const ok = minPlan === "max" ? plan === "max" : plan === "pro" || plan === "max";
  if (!ok) {
    const elsewhere = await isGuildOwnerPremiumElsewhere(interaction.guild);
    const embed = elsewhere ? planElsewhereEmbed(featureLabel) : planRequiredEmbed(featureLabel);
    const payload = { embeds: [embed], ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
  return ok;
}

/**
 * Guard for Basic-tier COUNT limits (3 kits, 1 shop, 1 currency - see
 * website/src/components/PlanGrid.jsx's Basic feature list). Pro/Max
 * always pass (unlimited); Basic passes only while currentCount is still
 * under limit. Distinct from requirePlan - this isn't "do you have the
 * feature at all," it's "have you hit your free quota for a feature Basic
 * DOES include some of." Same reply contract as requirePlan.
 */
async function requireWithinBasicLimit(interaction, currentCount, limit, featureLabel) {
  if (!interaction.guild) return false;
  const plan = await getGuildPlan(interaction.guild);
  if (plan !== "basic") return true;
  if (currentCount < limit) return true;

  const payload = { embeds: [basicLimitEmbed(featureLabel, limit)], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
  return false;
}

module.exports = { isGuildOwnerPremium, isGuildOwnerPremiumElsewhere, requirePremiumOwner, isBotOwner, officialGuildIds, isOfficialGuild, flagshipGuildId, getGuildPlan, requirePlan, requireWithinBasicLimit };

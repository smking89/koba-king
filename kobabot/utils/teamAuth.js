"use strict";

const { PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { rankById } = require("../config/ranks");
const { isBotOwner } = require("./premium");
const { ROLE_NAMES } = require("./provisioning");

const LEADERSHIP_MIN_TIER = rankById("E4-CPL").tier; // Corporal (Fireteam Leader) and up count as "leadership clearance"

/**
 * Checks, in order: guild_meta's admin-configured role ID (set via
 * /set roles, works with ANY existing Discord role), then the one real
 * admin role name (ROLE_NAMES.admin, "🤖 KOBA Bot Admin" - config/
 * roleColors.js's SYSTEM_ROLE_COLORS.admin and every template's "admin"
 * role key all resolve to this exact same name now, so there's only ever
 * one admin role to check for, not several differently-named ones).
 */
function hasRole(interaction, configuredRoleId, fallbackNames) {
  if (configuredRoleId && interaction.member.roles.cache.has(configuredRoleId)) return true;
  const names = Array.isArray(fallbackNames) ? fallbackNames : [fallbackNames];
  return interaction.member.roles.cache.some((r) => names.includes(r.name));
}

/**
 * Feature 3 leadership clearance check: a requester qualifies if they are
 * either Corporal-or-above in the KOBA Bot rank registry for their own team,
 * hold the configured/auto-created "Staff" role, or have Manage Server
 * permission (covers the Discord-side "Admin / Legacy Architect" rank,
 * which has no in-game rank tier of its own).
 */
function hasLeadershipClearance(interaction, member) {
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const meta = db.getGuildMeta(interaction.guildId);
  if (hasRole(interaction, meta?.staff_role_id, ROLE_NAMES.admin)) return true;
  if (!member) return false;
  const rank = rankById(member.rank_id);
  return !!rank && rank.tier >= LEADERSHIP_MIN_TIER;
}

/** Resolves the requester's own team membership row, or null if unregistered. */
function getRequesterMembership(interaction) {
  return db.getMember(interaction.guildId, interaction.user.id);
}

/**
 * Feature 2/6 clearance check: crafting and detonation are gated behind
 * Corporal-or-above rank clearance - was previously ALSO gated behind a
 * separately-designated "Faction Leader" Discord role, but that's gone
 * (2026-09-07, per user request) now that ranks themselves have real
 * Discord roles (see config/roleColors.js's RANK_ROLE_COLORS/
 * utils/systemRoles.js's syncMemberRankRole) - the E4_Corporal role IS the
 * Fireteam Leader signal now, so this is just an alias for the same
 * rank-tier check hasLeadershipClearance already does.
 */
function hasFactionLeaderClearance(interaction, member) {
  return hasLeadershipClearance(interaction, member);
}

/**
 * Feature 7 clearance check: the config/override admin commands
 * (/set-config, /give-material) are
 * restricted to the bot's own owner allowlist, Manage Server permission,
 * or the configured/auto-created "Staff" role - NOT general Faction
 * Leader/rank clearance, since these tools can bypass game balance entirely.
 */
function hasAdminClearance(interaction) {
  if (isBotOwner(interaction.user.id)) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const meta = db.getGuildMeta(interaction.guildId);
  if (hasRole(interaction, meta?.staff_role_id, ROLE_NAMES.admin)) return true;
  return false;
}

module.exports = {
  hasLeadershipClearance,
  hasFactionLeaderClearance,
  hasAdminClearance,
  getRequesterMembership,
  LEADERSHIP_MIN_TIER,
};

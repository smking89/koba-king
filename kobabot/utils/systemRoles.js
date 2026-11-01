"use strict";

/**
 * KOBA Bot-managed role system (2026-09-07) - see config/roleColors.js for
 * the full palette this provisions/syncs against. All lookups are by NAME
 * (same idempotent pattern as utils/provisioning.js's ensureRole/ROLE_NAMES)
 * rather than a stored ID table, since these roles are meant to be
 * recognizable/manageable by an owner directly in Discord's own role list
 * too, not just bot-internal bookkeeping.
 *
 * Every sync function here is deliberately best-effort (swallows Discord
 * API errors) - a role-sync hiccup should never block the underlying
 * rank/link/fireteam DB write it's attached to.
 */

const db = require("../database/db");
const { SYSTEM_ROLE_COLORS, RANK_ROLE_COLORS, KIT_ROLE_COLORS, FIRETEAM_ROLE_COLORS } = require("../config/roleColors");
const { COLORS: TEMPLATE_COLORS } = require("../config/templates");
const { withTimeout } = require("./withTimeout");
const { isOfficialGuild } = require("./premium");

/** Matches config/templates.js's STANDARD_TEMPLATE roles array exactly (name + key) - these 3 are created during template provisioning, not here, since they also need channel-permission wiring (restrictedTo) that only provisionTemplate() does. This map just lets the plan-sync functions below find them by name. */
const PLAN_ROLE_NAMES = { basic: "🥉 KOBA Bot Basic", pro: "🥈 KOBA Bot Pro", max: "🥇 KOBA Bot Max" };

/**
 * Idempotent: finds an existing role by name, creates it if missing,
 * recolors it if the palette's color has drifted from what's live.
 *
 * FIXED (2026-09-16): this went through guild.roles.create()/role.edit()
 * directly with only a rejection .catch() - no protection against a call
 * that never settles at all (the exact live incident that hung
 * /template setup's provisioning.js siblings until a shared withTimeout()
 * helper got added there). This function is a DIFFERENT code path
 * (/setup-system-roles, ensurePlanRoles) that never got the same fix,
 * which is why that command could still hang on "thinking..." even after
 * provisioning.js's calls were protected.
 */
async function ensureRoleByName(guild, name, color) {
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await withTimeout(guild.roles.create({ name, color, reason: "KOBA Bot system role provisioning" }), `create role "${name}"`).catch((err) => {
      console.error(`[KOBA Bot] Couldn't create role "${name}" in ${guild.name}:`, err.message);
      return null;
    });
  } else if (role.color !== color) {
    role = await withTimeout(role.edit({ color, reason: "KOBA Bot system role provisioning (recolor)" }), `recolor role "${name}"`).catch(() => role);
  }
  return role;
}

/**
 * Creates (or recolors) every role in the full KOBA Bot palette - system,
 * rank, kit-tier, and fireteam - on one guild. Safe to re-run any time
 * (/setup-system-roles). Returns the list of role names touched.
 *
 * Kit-tier roles (VIP/FreeKit/EliteKit1-44 - 46 roles) are opt-in per
 * explicit product decision ("templates before they are applied, server
 * owner chooses if it wants to generate kit roles") - guild_meta's
 * kit_roles_enabled defaults to 1 (existing guilds keep what they already
 * had; nothing is retroactively deleted here, only skipped going forward)
 * and is set explicitly by /template setup's confirmation step below.
 */
async function ensureAllSystemRoles(guild) {
  const touched = [];
  for (const { name, color } of Object.values(SYSTEM_ROLE_COLORS)) {
    if (await ensureRoleByName(guild, name, color)) touched.push(name);
  }
  for (const { name, color } of Object.values(RANK_ROLE_COLORS)) {
    if (await ensureRoleByName(guild, name, color)) touched.push(name);
  }
  const meta = db.getGuildMeta(guild.id);
  if (meta?.kit_roles_enabled !== 0) {
    for (const [name, color] of Object.entries(KIT_ROLE_COLORS)) {
      if (await ensureRoleByName(guild, name, color)) touched.push(name);
    }
  }
  for (const { name, color } of Object.values(FIRETEAM_ROLE_COLORS)) {
    if (await ensureRoleByName(guild, name, color)) touched.push(name);
  }
  return touched;
}

/**
 * Swaps a member's rank-tier Discord role to match their real rank_id
 * (promotion/demotion) - removes every OTHER rank role they hold first, so
 * ranks never accumulate (a Sergeant shouldn't still visibly hold Recruit).
 * `rankId` is a config/ranks.js RANKS[].id (e.g. "E4-CPL") - a rankId with
 * no matching color-palette entry is a no-op (nothing to remove/add).
 */
async function syncMemberRankRole(guild, discordId, rankId) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const target = RANK_ROLE_COLORS[rankId];
  const rankRoleNames = new Set(Object.values(RANK_ROLE_COLORS).map((r) => r.name));
  const toRemove = member.roles.cache.filter((r) => rankRoleNames.has(r.name) && r.name !== target?.name);
  for (const role of toRemove.values()) await withTimeout(member.roles.remove(role), `remove rank role "${role.name}"`).catch(() => {});

  if (!target) return;
  const role = guild.roles.cache.find((r) => r.name === target.name);
  if (role && !member.roles.cache.has(role.id)) await withTimeout(member.roles.add(role), `add rank role "${target.name}"`).catch(() => {});
}

/** Toggles the Linked/Unlinked system roles - grants one, revokes the other. */
async function syncLinkedRole(guild, discordId, linked) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const linkedRole = guild.roles.cache.find((r) => r.name === SYSTEM_ROLE_COLORS.linked.name);
  const unlinkedRole = guild.roles.cache.find((r) => r.name === SYSTEM_ROLE_COLORS.unlinked.name);
  const [grantRole, revokeRole] = linked ? [linkedRole, unlinkedRole] : [unlinkedRole, linkedRole];

  if (grantRole && !member.roles.cache.has(grantRole.id)) await withTimeout(member.roles.add(grantRole), `add role "${grantRole.name}"`).catch(() => {});
  if (revokeRole && member.roles.cache.has(revokeRole.id)) await withTimeout(member.roles.remove(revokeRole), `remove role "${revokeRole.name}"`).catch(() => {});
}

/**
 * Swaps a member's fireteam-slot Discord role (Leader/Quartermaster/
 * Engineer/Vanguard) to match their assigned db `fireteam_role` - same
 * remove-others-first pattern as syncMemberRankRole, since a player can
 * only hold one dual-class specialization at a time.
 */
async function syncMemberFireteamRole(guild, discordId, fireteamRoleKey) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const target = FIRETEAM_ROLE_COLORS[fireteamRoleKey];
  const fireteamRoleNames = new Set(Object.values(FIRETEAM_ROLE_COLORS).map((r) => r.name));
  const toRemove = member.roles.cache.filter((r) => fireteamRoleNames.has(r.name) && r.name !== target?.name);
  for (const role of toRemove.values()) await withTimeout(member.roles.remove(role), `remove fireteam role "${role.name}"`).catch(() => {});

  if (!target) return;
  const role = guild.roles.cache.find((r) => r.name === target.name);
  if (role && !member.roles.cache.has(role.id)) await withTimeout(member.roles.add(role), `add fireteam role "${target.name}"`).catch(() => {});
}

/**
 * Creates (or recolors) the 3 subscription-plan roles (🥉 Basic/🥈 Pro/
 * 🥇 Max) if they don't already exist yet from /setup-template - lets
 * /setup-system-roles create the full role set even on a guild that
 * hasn't run a template yet. Safe to re-run; matches config/templates.js's
 * STANDARD_TEMPLATE roles array exactly (same names/colors) so it never
 * creates a duplicate if that template IS later applied.
 */
async function ensurePlanRoles(guild) {
  const touched = [];
  // FIXED (2026-09-19): Basic/Pro/Max all only ever mean anything on the
  // official KOBA Bot server itself (identifying real subscribers there) -
  // explicit user request to stop creating any of the 3 on customer guilds,
  // not just Pro/Max as before. Same restriction as
  // utils/provisioning.js's provisionTemplate.
  if (!isOfficialGuild(guild.id)) return touched;
  if (await ensureRoleByName(guild, PLAN_ROLE_NAMES.basic, TEMPLATE_COLORS.basic)) touched.push(PLAN_ROLE_NAMES.basic);
  if (await ensureRoleByName(guild, PLAN_ROLE_NAMES.pro, TEMPLATE_COLORS.pro)) touched.push(PLAN_ROLE_NAMES.pro);
  if (await ensureRoleByName(guild, PLAN_ROLE_NAMES.max, TEMPLATE_COLORS.max)) touched.push(PLAN_ROLE_NAMES.max);
  return touched;
}

/**
 * Swaps the GUILD OWNER's subscription-tier role (🥉 Basic / 🥈 Pro / 🥇 Max)
 * to match their real plan - `plan` is whatever db.getGuildPlan()/
 * utils/premium.js's getGuildPlan() returns ("basic"|"pro"|"max"). Only
 * ever touches the guild owner, never any other member - these 3 roles
 * represent "who owns/pays for this specific server", not a player-facing
 * status. Called right after /setup-system-roles and on a recurring
 * background tick (utils/backgroundLoops.js) so a plan change from ANY
 * source (manual /manage-licenses grant, a claimed license, or a Tip4Serv
 * webhook - none of which have a live Discord client of their own to push
 * a role update immediately) gets picked up within one tick's delay.
 */
async function syncGuildOwnerPlanRole(guild, plan) {
  if (!isOfficialGuild(guild.id)) return;
  const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (!owner) return;

  const target = PLAN_ROLE_NAMES[plan];
  const planRoleNames = new Set(Object.values(PLAN_ROLE_NAMES));
  const toRemove = owner.roles.cache.filter((r) => planRoleNames.has(r.name) && r.name !== target);
  for (const role of toRemove.values()) await withTimeout(owner.roles.remove(role), `remove plan role "${role.name}"`).catch(() => {});

  if (!target) return;
  const role = guild.roles.cache.find((r) => r.name === target);
  if (role && !owner.roles.cache.has(role.id)) await withTimeout(owner.roles.add(role), `add plan role "${target}"`).catch(() => {});
}

module.exports = {
  ensureAllSystemRoles,
  ensurePlanRoles,
  syncMemberRankRole,
  syncLinkedRole,
  syncMemberFireteamRole,
  syncGuildOwnerPlanRole,
  PLAN_ROLE_NAMES,
};

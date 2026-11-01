"use strict";

/**
 * Full KOBA Bot-managed Discord role palette (added 2026-09-07, per user
 * request to expand the role system beyond the old single "KOBA Bot Admin"/
 * "Faction Leader" pair). Every role in here gets auto-created (idempotent,
 * by name) via utils/systemRoles.js's ensureAllSystemRoles() - colors are
 * hex ints (0xRRGGBB), same format discord.js's role.color/roles.create
 * already expect everywhere else in this codebase.
 *
 * UPDATED (2026-10-12) - reconciled byte-for-byte against the authoritative
 * "Master Role Hierarchy & Color System" spec. SYSTEM_ROLE_COLORS' names
 * AND colors were replaced outright (Owner/Co-Owner/Admin/Mod -> KOBA CEO/
 * DEV/KOBA Admin/KOBA Moderator - "Co-Owner" has no equivalent in the new
 * spec and was dropped; Linked/Unlinked colors were already correct and
 * are unchanged) and 5 genuinely new identity roles were added (Clan
 * Leader, Xbox Player, PlayStation Player, Steam Player as 3 separate
 * hardware-identity roles, and Platform Client - the "KOBAbot / KOBA Plus
 * System Instances" role, replacing the old generic "bot" self-role entry
 * since the new spec gives that exact concept a real name/color).
 * RANK_ROLE_COLORS and FIRETEAM_ROLE_COLORS were checked hex-for-hex
 * against the spec's Military Component Ranks / Fireteam Command Tier
 * tables and already matched exactly - left untouched. KIT_ROLE_COLORS'
 * EliteKit1-40 already matched the spec's Elite Kit Privilege Tiers
 * exactly - EliteKit41-44 were added to complete the real 44-kit list (the
 * spec's VIP entry already matched this file's existing VIP; FreeKit/
 * FreeKit2 aren't part of the new spec at all and were left as-is - they're
 * a pre-existing, unrelated preset kit tier this task wasn't asked to
 * remove).
 *
 * Five groups:
 *  - SYSTEM: Master Role Hierarchy status/identity roles (KOBA CEO/DEV/
 *    KOBA Admin/KOBA Moderator, Linked/Unlinked, Clan Leader, the 3
 *    platform-identity roles, and Platform Client).
 *  - RANK: one role per config/ranks.js RANKS entry, keyed by that same
 *    rank `id` so utils/systemRoles.js's syncMemberRankRole() can look one
 *    up directly off member.rank_id with no separate mapping table.
 *  - KIT: one role per named kit tier (VIP/FreeKit/FreeKit2/EliteKit1-44) -
 *    these are fixed PRESET tier names, not each guild's own arbitrary
 *    kit_registry display_name - an admin picks which tier a real
 *    registered kit corresponds to when wiring up auto-grant (Phase 2,
 *    not built yet as of this file's creation).
 *  - FIRETEAM: one role per config/ranks.js FIRETEAM_ROLES slot ("Leader"
 *    is keyed here as "FireteamLeader" to match the user-specified name).
 */

const SYSTEM_ROLE_COLORS = {
  owner: { name: "KOBA CEO", color: 0x7cff4f },
  dev: { name: "DEV", color: 0xa855f7 },
  // FIXED (2026-10-12, per the authoritative Master Role Hierarchy spec):
  // renamed/recolored from "🤖 BoomBot Admin" (#00CC66) - note this is a
  // DIFFERENT role concept from utils/provisioning.js's ROLE_NAMES.admin /
  // config/templates.js's "admin" role key ("🤖 KOBA Bot Admin", the
  // generic per-customer-guild bot-moderator role every template
  // provisions) - those are untouched by this spec, which targets the
  // Master Role Hierarchy specifically.
  admin: { name: "KOBA Admin", color: 0xff4f67 },
  mod: { name: "KOBA Moderator", color: 0xffc857 },
  linked: { name: "Linked", color: 0x00ff00 },
  unlinked: { name: "Unlinked", color: 0xff0000 },
  clanLeader: { name: "Clan Leader", color: 0x43d9ff },
  xboxPlayer: { name: "Xbox Player", color: 0x107c10 },
  playstationPlayer: { name: "PlayStation Player", color: 0x003087 },
  steamPlayer: { name: "Steam Player", color: 0x171a21 },
  // Replaces the old generic "bot": { name: "BOOMbot", color: 0x2c3e50 }
  // self-role entry - the new spec names this exact concept "Platform
  // Client" ("KOBAbot / KOBA Plus System Instances").
  platformClient: { name: "Platform Client", color: 0x8d97a6 },
};

/** Keyed by config/ranks.js's RANKS[].id - see that file for the id<->tier<->name mapping this must stay in sync with. Verified 2026-10-12 against the spec's Military Component Ranks table - every hex already matched exactly, no changes needed. */
const RANK_ROLE_COLORS = {
  E1: { name: "E1_Recruit", color: 0x7f8c8d },
  E2: { name: "E2_Private", color: 0x95a5a6 },
  E3: { name: "E3_PrivateFirstClass", color: 0xbdc3c7 },
  "E4-SPEC": { name: "E4_Specialist", color: 0x1abc9c },
  "E4-CPL": { name: "E4_Corporal", color: 0x16a085 },
  E5: { name: "E5_Sergeant", color: 0x27ae60 },
  E6: { name: "E6_StaffSergeant", color: 0x2ecc71 },
  E7: { name: "E7_SergeantFirstClass", color: 0x3498db },
  E8: { name: "E8_FirstSergeant", color: 0x2980b9 },
  E9: { name: "E9_SergeantMajor", color: 0x8e44ad },
};

/** Verified 2026-10-12 against the spec's Elite Kit Privilege Tiers table - EliteKit1-40 already matched exactly; EliteKit41-44 added to complete the real 44-kit list. VIP already matched the spec's top-level VIP entry (#FFD700). FreeKit/FreeKit2 aren't in the new spec - left as-is (pre-existing, unrelated tiers). */
const KIT_ROLE_COLORS = {
  VIP: 0xffd700,
  FreeKit: 0x2ecc71,
  FreeKit2: 0x27ae60,
  EliteKit1: 0xb22222,
  EliteKit2: 0x228b22,
  EliteKit3: 0x4169e1,
  EliteKit4: 0xff00ff,
  EliteKit5: 0x00ff7f,
  EliteKit6: 0xffa500,
  EliteKit7: 0x8b0000,
  EliteKit8: 0x00ff00,
  EliteKit9: 0x0000ff,
  EliteKit10: 0xff69b4,
  EliteKit11: 0xa52a2a,
  EliteKit12: 0x00ffff,
  EliteKit13: 0xff4500,
  EliteKit14: 0x6a5acd,
  EliteKit15: 0xffff00,
  EliteKit16: 0x2e8b57,
  EliteKit17: 0x8b008b,
  EliteKit18: 0x20b2aa,
  EliteKit19: 0xd2691e,
  EliteKit20: 0xf08080,
  EliteKit21: 0x4682b4,
  EliteKit22: 0xee82ee,
  EliteKit23: 0xdc143c,
  EliteKit24: 0x008080,
  EliteKit25: 0xda70d6,
  EliteKit26: 0x7fff00,
  EliteKit27: 0xff8c00,
  EliteKit28: 0x9932cc,
  EliteKit29: 0x3cb371,
  EliteKit30: 0x6495ed,
  EliteKit31: 0xff1493,
  EliteKit32: 0xcd5c5c,
  EliteKit33: 0x40e0d0,
  EliteKit34: 0xba55d3,
  EliteKit35: 0xadff2f,
  EliteKit36: 0x1e90ff,
  EliteKit37: 0xff6347,
  EliteKit38: 0x8a2be2,
  EliteKit39: 0x7cfc00,
  EliteKit40: 0x00ced1,
  EliteKit41: 0xff7f50,
  EliteKit42: 0x9370db,
  EliteKit43: 0x32cd32,
  EliteKit44: 0x00bfff,
};

/** Keyed by config/ranks.js's FIRETEAM_ROLES entries ("Leader" -> "FireteamLeader" per the user-specified role name). Verified 2026-10-12 against the spec's Fireteam Command Tier Stations table - already matched exactly, no changes needed. */
const FIRETEAM_ROLE_COLORS = {
  Leader: { name: "FireteamLeader", color: 0xd35400 },
  Quartermaster: { name: "Quartermaster", color: 0xc0392b },
  Engineer: { name: "Engineer", color: 0x9b59b6 },
  Vanguard: { name: "Vanguard", color: 0xe74c3c },
};

module.exports = { SYSTEM_ROLE_COLORS, RANK_ROLE_COLORS, KIT_ROLE_COLORS, FIRETEAM_ROLE_COLORS };

"use strict";

/**
 * Full server-template layouts for /setup-template and /download-template.
 * Distinct from utils/provisioning.js's minimal auto-provisioning on join
 * (roles/channels/category needed for the bot to function at all) - these
 * are optional, larger structures an admin opts into for a fully-organized
 * community server.
 *
 * Emoji + bold-unicode category names are used throughout (Discord-side
 * only) per explicit decision - the emoji-free rule stays in force ONLY
 * for RCON broadcasts sent into the actual Rust game chat, which really
 * can't render them; that's a hard client limitation, not a style choice.
 * Colors match KOBA Bot's own lime/teal branding rather than an unrelated
 * neon palette.
 *
 * Role/channel `key`s are stable identifiers used to find-or-create by
 * name safely (idempotent, same pattern as utils/provisioning.js).
 */

const { SYSTEM_ROLE_COLORS } = require("./roleColors");

/**
 * Helpers for the 4 Master-Role-Hierarchy-spec templates added 2026-10-12
 * (koba-bot-dev-hq / koba-games-hq / multi-cluster-megahub /
 * single-server-isolated). Built directly off config/roleColors.js's
 * canonical SYSTEM_ROLE_COLORS/KIT_ROLE_COLORS (the same source
 * utils/systemRoles.js's ensureAllSystemRoles() uses) rather than
 * hardcoding role names/colors a second time here - a channel restricted
 * to, say, "KOBA Admin" always resolves (by name, idempotently) to the
 * exact same role ensureAllSystemRoles already created/maintains, instead
 * of risking a second, differently-colored "KOBA Admin"-ish role.
 */
function sysRoleDef(key) {
  const def = SYSTEM_ROLE_COLORS[key];
  return { key, name: def.name, color: def.color };
}

const COLORS = {
  admin: 0x93ff1d, // lime - brand accent
  owner: 0xffd700, // gold - status marker, distinct from brand
  mod: 0x1afb9d, // teal - brand accent
  factionLeader: 0xff9900,
  platform: 0x5865f2,
  member: 0x8b8fa8,
  // Was 0x1afb9d - identical to COLORS.mod, so Premium Owner and Mod
  // rendered as the same color in the member list. Gold instead, matching
  // the "owner" status color used elsewhere (distinct template, no clash).
  // FIXED (2026-09-07): the single "💎 Premium Owner" role was replaced
  // with 3 real subscription-plan tiers (basic/pro/max, matching the
  // existing db.getGuildPlan()/utils/premium.js values exactly) - see
  // utils/systemRoles.js's syncGuildOwnerPlanRole for the auto-sync.
  basic: 0x95a5a6, // silver-grey - the free/unauthorized-but-provisioned tier
  pro: 0x3498db, // blue
  max: 0xffd700, // gold - same color the old single premiumOwner role used
};

/**
 * Strips emoji (and the stray variation-selector/ZWJ characters some of them
 * leave behind, plus the double-dash/space gaps that leaves in channel
 * names) from a template name string - used to derive KOBABOT_MINIMAL_TEMPLATE
 * below. \p{Extended_Pictographic} covers the actual emoji glyphs; VS16
 * (️) and ZWJ (‍) are separate invisible modifier characters that
 * ride along with some emoji (e.g. 🛡️) and don't match that property on
 * their own, so they're stripped explicitly too.
 */
function stripEmoji(str) {
  return str
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[️‍]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * koba.games HQ (rebuilt 2026-10-29, per explicit product decision to run
 * on exactly one server going forward) - the real koba.games community
 * server: account linking, the PvP/PvE leaderboard, support, and staff
 * coordination. Replaces the old 3-template split (botadmin/koba-bot-dev-hq/
 * koba-games-hq) entirely now that there's only one surviving guild and it
 * needs to do everything itself - no more separate internal-ops-only or
 * B2B-licensing layouts. officialGuildOnly stays set (this is still KOBA's
 * own guild specifically, not a generic customer layout).
 */
const KOBA_GAMES_HQ_TEMPLATE = {
  key: "koba-games-hq",
  label: "koba.games HQ",
  description: "The real koba.games community server - account linking, PvP/PvE leaderboard, support, and staff coordination.",
  officialGuildOnly: true,
  roles: [
    sysRoleDef("owner"),
    sysRoleDef("admin"),
    sysRoleDef("mod"),
    sysRoleDef("linked"),
    sysRoleDef("unlinked"),
    sysRoleDef("xboxPlayer"),
    sysRoleDef("playstationPlayer"),
    sysRoleDef("steamPlayer"),
  ],
  categories: [
    {
      name: "📜 INFO",
      channels: [
        { key: "welcome", name: "welcome", type: "text", readOnly: true },
        { key: "rules", name: "rules", type: "text", readOnly: true },
        { key: "announcements", name: "announcements", type: "text", readOnly: true },
      ],
    },
    {
      name: "🔗 GET STARTED",
      channels: [{ key: "linkGamertag", name: "link-account", type: "text", readOnly: true }],
    },
    {
      name: "🏆 LEADERBOARD",
      channels: [{ key: "leaderboard", name: "leaderboard", type: "text", readOnly: true }],
    },
    {
      name: "💬 COMMUNITY",
      channels: [{ key: "chat", name: "general-chat", type: "text" }],
    },
    {
      name: "🛡️ STAFF",
      channels: [
        { key: "staffChat", name: "staff-chat", type: "text", restrictedTo: ["owner", "admin", "mod"] },
        { key: "adminFeed", name: "admin-feed", type: "text", readOnly: true, restrictedTo: ["owner", "admin", "mod"] },
        { key: "staffApps", name: "staff-applications", type: "text", restrictedTo: ["owner", "admin"] },
      ],
    },
  ],
};

const TEMPLATES = {
  "koba-games-hq": KOBA_GAMES_HQ_TEMPLATE,
};

/**
 * Welcome content auto-posted into template-provisioned channels, keyed by
 * the same channel `key`s used above (shared across both templates - the
 * channel purposes are identical even though the surrounding layout
 * differs). Posted once per channel by provisionTemplate() in
 * utils/provisioning.js, which skips channels that already have a message
 * so re-running /setup-template never reposts/duplicates this.
 */
const CHANNEL_CONTENT = {
  welcome: {
    title: "Welcome to koba.games",
    description: "Glad you're here. Run `/link` to connect your Xbox or PlayStation account, then check out #leaderboard to see where you stand.",
  },
  rules: {
    title: "Rules",
    description: "Be respectful. No harassment, hate speech, or spam. Staff decisions are final - open a ticket in #support if you want to appeal one.",
  },
  leaderboard: {
    title: "Leaderboard",
    description: "PvP and PvE kill leaderboards refresh automatically here.",
  },
  linkGamertag: {
    title: "Link Your Gamertag",
    description:
      "Click **Link Account** below - KOBA Bot will DM you a one-time link. Open it, sign in with this same Discord account, then enter your platform and exact Gamertag/PSN there. Your platform role gets applied automatically once that's done.\n\n" +
      "Already linked and need to switch accounts or platforms? Click **Unlink** first, then link again.\n\n" +
      "(You can also run `/link` from anywhere instead of using the button.)",
  },
  announcements: {
    title: "Announcements",
    description: "Server-wide announcements post here.",
  },
  adminFeed: {
    title: "Admin Feed",
    description: "Audit trail of staff/admin activity - each entry includes who ran it and what happened.",
  },
  staffApps: {
    title: "Staff Applications",
    description: "Submitted applications post here for review - each shows the applicant's answers, with **Accept**/**Reject** buttons.\n\nTo open applications to members, run `/staff-config post` in whichever public channel you want the **Apply Now** button to live.",
  },
  staffChat: {
    title: "Staff Chat",
    description: "Coordination space for leadership and moderators - not visible to regular members.",
  },
  // Short intro embeds for the persistent panel button itself - the full
  // reference text below (ownerGuide/staffCommands) is what actually shows
  // up in the ephemeral reply once someone clicks the button (see
  // utils/staffPanel.js's handleComponent).
  staffPanel: {
    title: "🛡️ Owner & Admin Panel",
    description: "Click below for the full command reference.",
  },
  modPanel: {
    title: "🔰 Mod Panel",
    description: "Click below for the day-to-day mod/staff command reference.",
  },
  ownerGuide: {
    title: "Owner & Admin Command Reference",
    description:
      "**Setup**\n`/template setup` - apply the server layout · `/template repair` - re-sync every panel/leaderboard without redoing setup · `/template download` - export the layout as text · `/template wizard` - guided role setup · `/template roles` - create/recolor managed roles · `/template wipe` - announce a fresh Rust server wipe\n\n" +
      "**Live Configuration**\n`/server connection set` - connect your own Rust server's RCON · `/set message-style set` - color/size/text of every in-game broadcast\n\n" +
      "**Moderation**\n`/mod` - ban/kick/warn and other moderation actions\n\n" +
      "**Staff**\n`/staff-config` - open staff positions on this server · `/staff-post` - recruit across the whole KOBA Bot network\n\n" +
      "**Danger Zone**\n`/nuke` - permanently deletes every channel, category, and role in this server. Owner-only, requires double confirmation, no undo.",
  },
  staffCommands: {
    title: "Mod & Staff Command Reference",
    description:
      "**Moderation**\n`/mod` - ban/kick/warn and other day-to-day moderation actions\n\n" +
      "**Tickets**\nEvery ticket channel has **Close Ticket**/**Archive Ticket** buttons - closing moves it to 🔒 CLOSED TICKETS (read-only for the opener), archiving moves it to 📁 ARCHIVED TICKETS (staff-only from there).\n\n" +
      "**Staff Applications**\nApplications for THIS server post to #staff-applications (`/staff-config`) - cross-network recruiting for other servers happens via `/staff-post`.\n\n" +
      "Full owner-level reference lives in the Owner & Admin Panel.",
  },
};

module.exports = { TEMPLATES, CHANNEL_CONTENT, COLORS, stripEmoji };

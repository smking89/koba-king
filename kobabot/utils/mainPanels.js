"use strict";

/**
 * Main role-based navigation hubs (added 2026-09-08, per user request to cut
 * down the 80+ separate slash commands' worth of channel/category clutter
 * into 4 discoverable entry points - Owner/Admin/Mod/Player). Existing
 * slash commands are UNCHANGED and still work exactly as before (explicit
 * user decision - these hubs are a navigation layer on top, not a
 * replacement); each hub is a single select menu (Discord caps select
 * menus at 25 options, comfortably fits every category here without
 * needing a second navigation layer).
 *
 * Two kinds of entries:
 *  - "call-through": the feature already has its own real panel
 *    (buildHub-style) with a CONFIRMED simple call signature - selecting it
 *    replies with that panel's actual live view, same as running its own
 *    command/button today.
 *  - "tip": everything else (mostly one-off /x-config admin commands with
 *    no dedicated panel UI yet) - selecting it replies with a short embed
 *    naming the exact slash command(s) that cover it. Still a real
 *    navigability win (one place to discover "which of 82 commands do I
 *    need" instead of scrolling the command list) without risking a half-
 *    tested reimplementation of every single config command's UI in one
 *    pass - those can graduate to real call-through panels incrementally.
 *
 * Permission tiers (checked before showing each hub, not per-entry - if you
 * can open the hub at all, everything in it is meant for you):
 *  - Owner: bot owner allowlist, actual Discord guild owner, Manage Server
 *    permission, or the KOBA Bot Owner system role (see config/roleColors.js).
 *  - Admin: everything Owner has, plus utils/teamAuth.js's existing
 *    hasAdminClearance (staff_role_id / 🤖 KOBA Bot Admin role).
 *  - Mod: everything Admin has, plus the 🔰 KOBA Bot Mod system role.
 *  - Player: no gate - anyone can open it.
 */

const { ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { baseEmbed, infoEmbed, successEmbed, dangerEmbed, COLORS } = require("./embeds");
const { isBotOwner, requirePremiumOwner } = require("./premium");
const challengeEngine = require("./challengeEngine");
const { hasLeadershipClearance, getRequesterMembership, hasAdminClearance } = require("./teamAuth");
const { FIRETEAM_ROLES } = require("../config/ranks");
const { syncMemberFireteamRole } = require("./systemRoles");
const { SYSTEM_ROLE_COLORS } = require("../config/roleColors");

const teamPanel = require("./teamPanel");
const playerPanel = require("./playerPanel");
const shopPlayerPanel = require("./shopPlayerPanel");
const gamesPanel = require("./gamesPanel");
const kitPanel = require("./kitPanel");
const linkPanel = require("./linkPanel");
const lfgPanel = require("./lfgPanel");
const referralPanel = require("./referralPanel");
const directoryPanel = require("./directoryPanel");
const rivalSystem = require("./rivalSystem");
const progression = require("./progression");
const { BUTTON_PANELS } = require("./provisioning");

/** Checked-role-id-first, fixed-name-fallback - same pattern as utils/teamAuth.js's hasRole, now shared by Owner/Mod tier too (previously only Admin/staff_role_id had a configurable override; /setup-wizard's Roles step configures all three the same way now). */
function hasSystemRole(interaction, roleName, configuredRoleId) {
  if (configuredRoleId && interaction.member.roles.cache.has(configuredRoleId)) return true;
  return interaction.member.roles.cache.some((r) => r.name === roleName);
}

function isOwnerTier(interaction) {
  if (isBotOwner(interaction.user.id)) return true;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const meta = db.getGuildMeta(interaction.guildId);
  return hasSystemRole(interaction, SYSTEM_ROLE_COLORS.owner.name, meta?.owner_role_id);
}

function isAdminTier(interaction) {
  if (isOwnerTier(interaction)) return true;
  return hasAdminClearance(interaction);
}

function isModTier(interaction) {
  if (isAdminTier(interaction)) return true;
  const meta = db.getGuildMeta(interaction.guildId);
  return hasSystemRole(interaction, SYSTEM_ROLE_COLORS.mod.name, meta?.mod_role_id);
}

/** A short "here's the command(s) that cover this" reply - the fallback for every entry that doesn't have a dedicated panel view yet (see file header). */
function tipEmbed(title, lines) {
  return { embeds: [infoEmbed(title, lines.map((l) => `\`${l.cmd}\` - ${l.desc}`).join("\n"))], ephemeral: true };
}

// ---------------------------------------------------------------------------
// PLAYER PANEL
// ---------------------------------------------------------------------------

const PLAYER_OPTIONS = [
  { value: "team", label: "My Team", emoji: "⚔️", description: "Create/join a team, invites, ranks" },
  { value: "kits", label: "Kits, Home & Trade", emoji: "🎒", description: "Claim kits, set/TP home, check inventory, trade with teammates" },
  { value: "shop", label: "Shop", emoji: "🛒", description: "Buy items with your coins" },
  { value: "games", label: "Games", emoji: "🎮", description: "Play/wager games" },
  { value: "link", label: "Link Gamertag", emoji: "🔗", description: "Connect your Xbox/PlayStation account" },
  { value: "lfg", label: "Looking For Group", emoji: "📝", description: "Post or browse LFG requests" },
  { value: "referral", label: "Referrals", emoji: "🎟️", description: "Your referral code and rewards" },
  { value: "marketplace", label: "Marketplace", emoji: "🤝", description: "Player-to-player trading" },
  { value: "auctions", label: "Auctions", emoji: "🔨", description: "Bid on auctioned items" },
  { value: "directory", label: "Server Directory", emoji: "🗺️", description: "Browse public server listings" },
  { value: "progression", label: "My Progression", emoji: "⭐", description: "XP, Level, Prestige, and badges" },
  { value: "rival", label: "My Rivals", emoji: "⚔️", description: "Head-to-head records with your Rivals" },
  { value: "challenge", label: "Challenge A Player", emoji: "🎯", description: "Send a wagered 1v1 Challenge" },
  { value: "help", label: "Commands & Help", emoji: "❓", description: "Full command list, FAQ" },
];

function buildPlayerHub() {
  const embed = baseEmbed(COLORS.brand)
    .setTitle("🎮 Player Panel")
    .setDescription("Pick what you want to do - each option opens its own panel.");
  const select = new StringSelectMenuBuilder()
    .setCustomId("mainpanel:player")
    .setPlaceholder("Choose an option...")
    .addOptions(PLAYER_OPTIONS);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

async function handlePlayerSelection(interaction, value) {
  const guildId = interaction.guildId;
  const member = db.getMember(guildId, interaction.user.id);

  switch (value) {
    case "team":
      return interaction.reply({ ...teamPanel.buildHub(interaction), ephemeral: true });
    case "kits":
      return interaction.reply({ ...playerPanel.buildHub(guildId, member), ephemeral: true });
    case "shop":
      return interaction.reply({ ...shopPlayerPanel.buildHub(guildId, member), ephemeral: true });
    case "games":
      return interaction.reply({ ...gamesPanel.buildHub(), ephemeral: true });
    case "link":
      // Real call-through - same "Link Account"/"Unlink" buttons the
      // #link-gamertag channel panel shows, wired to the SAME globally-
      // registered "link" componentHandler, so clicking either here works
      // identically to clicking them there.
      return interaction.reply({ embeds: [infoEmbed("🔗 Link Gamertag", "Connect your Xbox/PlayStation account, or unlink your current one.")], components: BUTTON_PANELS.linkGamertag(), ephemeral: true });
    case "lfg":
      return interaction.reply({ embeds: [infoEmbed("📝 Looking For Group", "Post a request to this server's LFG feed.")], components: BUTTON_PANELS.createLfg(), ephemeral: true });
    case "referral":
      return interaction.reply({
        embeds: [infoEmbed("🎟️ Referrals", "Redeem a code someone shared with you, or create your own to share.")],
        components: BUTTON_PANELS.referralClaim(),
        ephemeral: true,
      });
    case "marketplace":
      return interaction.reply({ embeds: [infoEmbed("🤝 Marketplace", "Browse and post player-to-player material trades.")], components: BUTTON_PANELS.marketplace(), ephemeral: true });
    case "auctions":
      return interaction.reply({ embeds: [infoEmbed("🔨 Auctions", "Browse active auctions and place bids.")], components: BUTTON_PANELS.auctions(), ephemeral: true });
    case "directory":
      // Guild-independent (queries every listed server across KOBA Bot, not
      // just this guild's own) - same view /directory search and the
      // official hub's pinned sort menu both already render.
      return interaction.reply({ ...directoryPanel.buildFilterPanel(), ephemeral: true });
    case "progression":
      return interaction.reply({ ...progression.buildProgressionView(guildId, interaction.user.id, interaction.user.username), ephemeral: true });
    case "rival": {
      const view = rivalSystem.buildRivalListView(guildId, interaction.user.id);
      view.embeds[0]?.setFooter?.({ text: "Send a new Rival request with /server rival add" });
      return interaction.reply({ ...view, ephemeral: true });
    }
    case "challenge": {
      // Real call-through, not a tip - picking a target user needs an
      // actual component (Discord select menus can't be "typed"), so this
      // is a short 2-step flow: UserSelect here, then a modal (currency +
      // stake) once they pick someone. See handleComponent/handleModal
      // below for the rest of the chain - same challengeEngine.createChallenge
      // call /challenge itself makes.
      const userSelect = new UserSelectMenuBuilder().setCustomId("mainpanel:challenge_pick_user").setPlaceholder("Who do you want to challenge?");
      return interaction.reply({
        embeds: [infoEmbed("🎯 Challenge A Player", "Pick who you want to send a wagered 1v1 Challenge to.")],
        components: [new ActionRowBuilder().addComponents(userSelect)],
        ephemeral: true,
      });
    }
    case "help":
      return interaction.reply(tipEmbed("❓ Commands & Help", [
        { cmd: "/commands", desc: "Full command list" },
        { cmd: "/frank-faq", desc: "Frequently asked questions" },
        { cmd: "/support", desc: "Open a support ticket" },
      ]));
    default:
      return interaction.reply({ embeds: [dangerEmbed("Unknown Option", "That option isn't recognized.")], ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// MOD PANEL
// ---------------------------------------------------------------------------

const MOD_OPTIONS = [
  { value: "bans", label: "Bans", emoji: "🔨", description: "Global and per-server bans/unbans" },
  { value: "users", label: "User Management", emoji: "👤", description: "Activate users, reset cooldowns/queues" },
  { value: "fireteam", label: "Fireteam Assignment", emoji: "🎯", description: "Assign a player to a fireteam role" },
  { value: "staffposts", label: "Staff Posts & Recruitment", emoji: "📋", description: "Post staff announcements, manage applications" },
  { value: "nuke", label: "Nuke (Danger Zone)", emoji: "☢️", description: "Bulk-clear entities/items - use with caution" },
];

function buildModHub() {
  const embed = baseEmbed(COLORS.danger).setTitle("🔰 Mod Panel").setDescription("Moderation tools - pick a category.");
  const select = new StringSelectMenuBuilder().setCustomId("mainpanel:mod").setPlaceholder("Choose a category...").addOptions(MOD_OPTIONS);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

async function handleModSelection(interaction, value) {
  switch (value) {
    case "bans":
      return interaction.reply(tipEmbed("🔨 Bans", [
        { cmd: "/ban server", desc: "Ban someone from this server only" },
        { cmd: "/unban server", desc: "Lift a per-server ban" },
        { cmd: "/ban global", desc: "Platform-wide BOOMid ban (bot owner only)" },
        { cmd: "/unban global", desc: "Lift a platform-wide ban (bot owner only)" },
      ]));
    case "users":
      return interaction.reply(tipEmbed("👤 User Management", [
        { cmd: "/activate-user", desc: "Manually activate a user" },
        { cmd: "/give-material", desc: "Grant materials directly" },
      ]));
    case "fireteam": {
      // Real call-through, not a tip - same Corporal-or-higher clearance
      // check and slot rules as /assign-fireteam, just reached via a
      // UserSelect + modal instead of typed command options (Discord
      // select menus can't render inside a modal, so the target user is
      // picked here and the fireteam ID + role are collected via modal
      // text fields in handleFireteamModal below).
      const requester = getRequesterMembership(interaction);
      if (!hasLeadershipClearance(interaction, requester)) {
        return interaction.reply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher to assign fireteams.")], ephemeral: true });
      }
      const userSelect = new UserSelectMenuBuilder().setCustomId("mainpanel:fireteam_pick_user").setPlaceholder("Who do you want to assign?");
      return interaction.reply({
        embeds: [infoEmbed("🎯 Fireteam Assignment", "Pick a teammate to assign to a fireteam slot.")],
        components: [new ActionRowBuilder().addComponents(userSelect)],
        ephemeral: true,
      });
    }
    case "staffposts":
      return interaction.reply(tipEmbed("📋 Staff Posts & Recruitment", [{ cmd: "/staff-post", desc: "Post a staff announcement or recruitment message" }]));
    case "nuke":
      return interaction.reply(tipEmbed("☢️ Nuke (Danger Zone)", [{ cmd: "/nuke", desc: "Bulk-clear - irreversible, confirm you know what this does before running it" }]));
    default:
      return interaction.reply({ embeds: [dangerEmbed("Unknown Option", "That option isn't recognized.")], ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// ADMIN PANEL
// ---------------------------------------------------------------------------

const ADMIN_OPTIONS = [
  { value: "messaging", label: "Messaging & Templates", emoji: "✉️", description: "Message styles, feeds, ads" },
  { value: "economy", label: "Economy", emoji: "💰", description: "Coin-earn rules, gift schedules" },
  { value: "trading", label: "Marketplace & Auctions Config", emoji: "🛒", description: "Configure trading/auction rules" },
  { value: "events", label: "Events", emoji: "🎉", description: "Create/configure events, declare war" },
  { value: "leaderboards", label: "Leaderboards & Referrals Config", emoji: "🏆", description: "Leaderboard categories, referral rewards" },
  { value: "roletrading", label: "Role Trading", emoji: "🔁", description: "Configure tradeable role rules" },
  { value: "kits", label: "Kit Management", emoji: "🎒", description: "Create/edit kits, cooldowns, deliveries" },
  { value: "lfgscope", label: "LFG Scope", emoji: "📝", description: "Configure who sees this server's LFG feed" },
  { value: "servers", label: "Linked Servers", emoji: "🗺️", description: "Connect/manage this guild's linked Rust server(s)" },
];

function buildAdminHub() {
  const embed = baseEmbed(COLORS.brand).setTitle("⚙️ Admin Panel").setDescription("Day-to-day configuration - pick a category.");
  const select = new StringSelectMenuBuilder().setCustomId("mainpanel:admin").setPlaceholder("Choose a category...").addOptions(ADMIN_OPTIONS);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

async function handleAdminSelection(interaction, value) {
  switch (value) {
    case "messaging":
      return interaction.reply(tipEmbed("✉️ Messaging & Templates", [
        { cmd: "/set message-style set", desc: "Edit message templates per category" },
        { cmd: "/message-feed", desc: "Add pooled random messages per category" },
        { cmd: "/ad-message-config", desc: "Configure the recurring ad message (bot owner only)" },
        { cmd: "/auto-message-config", desc: "Schedule recurring announcements" },
      ]));
    case "economy":
      return interaction.reply(tipEmbed("💰 Economy", [
        { cmd: "/coin-earn-config", desc: "Configure passive coin-earning rules" },
        { cmd: "/gift-config", desc: "Configure scheduled gift drops" },
      ]));
    case "trading":
      return interaction.reply(tipEmbed("🛒 Marketplace & Auctions Config", [
        { cmd: "/marketplace-config", desc: "Configure marketplace rules" },
        { cmd: "/auction-config", desc: "Configure auction rules" },
      ]));
    case "events":
      return interaction.reply(tipEmbed("🎉 Events", [
        { cmd: "/create-event-wizard", desc: "Deploy a one-off timed zone event, guided step by step" },
        { cmd: "/event-config announcements", desc: "Configure event announcement styling" },
        { cmd: "/event-config auto", desc: "Schedule recurring auto-fire events" },
        { cmd: "/declare-war", desc: "Declare a clan war" },
      ]));
    case "leaderboards":
      return interaction.reply(tipEmbed("🏆 Leaderboards & Referrals Config", [
        { cmd: "/leaderboard-config", desc: "Configure leaderboard categories/rewards" },
        { cmd: "/referral-config", desc: "Configure referral rewards" },
      ]));
    case "roletrading":
      return interaction.reply(tipEmbed("🔁 Role Trading", [{ cmd: "/role-trade-config", desc: "Configure which roles can be traded and at what rate" }]));
    case "kits":
      return interaction.reply({ ...kitPanel.buildHub(interaction.guildId), ephemeral: true });
    case "lfgscope":
      return interaction.reply(tipEmbed("📝 LFG Scope", [{ cmd: "/set lfg-scope", desc: "Configure which other servers can see this one's LFG posts" }]));
    case "servers":
      return interaction.reply(tipEmbed("🗺️ Linked Servers", [{ cmd: "/server connection set", desc: "Connect (or reconnect) this guild's Rust server(s) via WebRCON" }]));
    default:
      return interaction.reply({ embeds: [dangerEmbed("Unknown Option", "That option isn't recognized.")], ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// OWNER PANEL
// ---------------------------------------------------------------------------

const OWNER_OPTIONS = [
  { value: "setup", label: "Setup Wizard", emoji: "🧙", description: "First-time / guided server setup" },
  { value: "templates", label: "Templates", emoji: "📄", description: "Save/load/download channel-category templates" },
  { value: "servers", label: "Linked Servers & Backups", emoji: "🗺️", description: "Connect Rust server(s), server backups/restore" },
  { value: "panels", label: "Panel Deployment", emoji: "📌", description: "Post or move any KOBA Bot panel to a channel" },
  { value: "roles", label: "Roles Setup", emoji: "🎭", description: "Configure staff/system roles" },
  { value: "directorysetup", label: "Directory Listing Setup", emoji: "🗂️", description: "List this server on the public directory" },
  { value: "billing", label: "License & Billing", emoji: "💳", description: "Manage licenses, transfer access" },
  { value: "globalconfig", label: "Global Config", emoji: "⚙️", description: "Announcement channels, staff channel config" },
];

function buildOwnerHub() {
  const embed = baseEmbed(COLORS.warning).setTitle("🏛️ Owner Panel").setDescription("Setup, infrastructure, and billing - pick a category.");
  const select = new StringSelectMenuBuilder().setCustomId("mainpanel:owner").setPlaceholder("Choose a category...").addOptions(OWNER_OPTIONS);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

async function handleOwnerSelection(interaction, value) {
  switch (value) {
    case "setup": {
      // Call-through, not a tip - opens the real interactive wizard
      // directly (same view /template wizard's own command shows, since
      // the standalone /setup-wizard command was consolidated into
      // /template 2026-10-13), matching the "call-through" convention this
      // file's header describes for any feature with an existing real
      // panel, per explicit user request ("it should show the panel not
      // the commands").
      const { buildStep } = require("./setupWizardPanel");
      return interaction.reply({ ...buildStep(interaction, "roles"), ephemeral: true });
    }
    case "templates":
      return interaction.reply(tipEmbed("📄 Templates", [
        { cmd: "/template setup", desc: "Apply a channel/category template" },
        { cmd: "/template save", desc: "Save the current setup as a reusable template" },
        { cmd: "/template mine", desc: "List/apply/delete your saved templates" },
        { cmd: "/template download", desc: "Export a template's outline as text" },
      ]));
    case "servers":
      return interaction.reply(tipEmbed("🗺️ Linked Servers & Backups", [
        { cmd: "/server connection set", desc: "Connect (or reconnect) this guild's Rust server(s) via WebRCON" },
        { cmd: "/server-backup backup", desc: "Export roles/channels/config as a restorable file" },
        { cmd: "/server-backup restore", desc: "Restore a backup file" },
      ]));
    case "panels":
      return interaction.reply(tipEmbed("📌 Panel Deployment", [
        { cmd: "/template panels", desc: "Post or move any KOBA Bot panel to a channel" },
        { cmd: "/template repair", desc: "Re-post a panel that got deleted/broken" },
      ]));
    case "roles":
      return interaction.reply(tipEmbed("🎭 Roles Setup", [
        { cmd: "/set roles", desc: "Point KOBA Bot at your own existing Discord roles" },
        { cmd: "/template roles", desc: "Auto-create KOBA Bot's full managed role set" },
      ]));
    case "directorysetup":
      return interaction.reply(tipEmbed("🗂️ Directory Listing Setup", [{ cmd: "/directory-setup", desc: "List (or edit your listing on) the public server directory" }]));
    case "billing":
      return interaction.reply(tipEmbed("💳 License & Billing", [
        { cmd: "/manage-licenses", desc: "View/manage your KOBA Bot licenses" },
        { cmd: "/transfer", desc: "Move your license to a different server" },
      ]));
    case "globalconfig":
      return interaction.reply(tipEmbed("⚙️ Global Config", [
        { cmd: "/set-config", desc: "Low-level config override (advanced)" },
        { cmd: "/set announcement-channel", desc: "Set where a specific announcement type posts" },
        { cmd: "/staff-config", desc: "Configure your staff/mod channel" },
      ]));
    default:
      return interaction.reply({ embeds: [dangerEmbed("Unknown Option", "That option isn't recognized.")], ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// ROUTING
// ---------------------------------------------------------------------------

/** customId shape: "mainpanel:<tier>" (the select menu itself) - the chosen value tells us which sub-entry within that tier was picked. */
/** Step 2 of the "Challenge A Player" flow (see handlePlayerSelection's "challenge" case) - the UserSelect submission opens the currency/stake modal. */
async function handleChallengeUserSelect(interaction) {
  const target = interaction.users.first();
  if (target.bot || target.id === interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Allowed", target.bot ? "You can't challenge a bot." : "You can't challenge yourself.")], ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId(`mainpanel:challenge_modal:${target.id}`).setTitle("Send Challenge");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  const stakeInput = new TextInputBuilder().setCustomId("stake").setLabel("Stake amount (each side)").setStyle(TextInputStyle.Short).setRequired(true);
  const killsInput = new TextInputBuilder().setCustomId("kills").setLabel("Kill target: 3, 5, or 10 (blank = 5)").setStyle(TextInputStyle.Short).setRequired(false);
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(stakeInput), new ActionRowBuilder().addComponents(killsInput));
  await interaction.showModal(modal);
}

/** Step 2 of the "Fireteam Assignment" flow (see handleModSelection's "fireteam" case) - the UserSelect submission opens the fireteam ID/role modal. */
async function handleFireteamUserSelect(interaction) {
  const target = interaction.users.first();
  const requester = getRequesterMembership(interaction);
  const targetMember = db.getMember(interaction.guildId, target.id);
  if (!targetMember || !requester || targetMember.team_name !== requester.team_name) {
    await interaction.reply({ embeds: [dangerEmbed("Not On Your Team", `**${target.username}** isn't registered on **${requester?.team_name || "your team"}**.`)], ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId(`mainpanel:fireteam_modal:${target.id}`).setTitle("Assign Fireteam");
  const fireteamIdInput = new TextInputBuilder().setCustomId("fireteam_id").setLabel("Fireteam ID (e.g. FT-1)").setStyle(TextInputStyle.Short).setRequired(true);
  const roleInput = new TextInputBuilder()
    .setCustomId("role")
    .setLabel(`Role (${FIRETEAM_ROLES.join(", ")})`.slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(fireteamIdInput), new ActionRowBuilder().addComponents(roleInput));
  await interaction.showModal(modal);
}

async function handleComponent(interaction) {
  if (interaction.isUserSelectMenu() && interaction.customId === "mainpanel:challenge_pick_user") {
    await handleChallengeUserSelect(interaction);
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId === "mainpanel:fireteam_pick_user") {
    await handleFireteamUserSelect(interaction);
    return;
  }

  if (!interaction.isStringSelectMenu()) return;
  const [, tier] = interaction.customId.split(":");
  const value = interaction.values[0];

  const gates = { owner: isOwnerTier, admin: isAdminTier, mod: isModTier, player: () => true };
  const gate = gates[tier];
  if (!gate || !gate(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Access Denied", "You don't have permission to use this panel.")], ephemeral: true }).catch(() => {});
    return;
  }

  const handlers = { owner: handleOwnerSelection, admin: handleAdminSelection, mod: handleModSelection, player: handlePlayerSelection };
  await handlers[tier](interaction, value);
}

const MAX_FIRETEAM_SIZE = 4;

/** Step 3 of the Fireteam Assignment flow - same slot-occupied/fireteam-full rules as /assign-fireteam. */
async function handleFireteamModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requirePremiumOwner(interaction))) return;

  const targetId = interaction.customId.split(":")[2];
  const requester = getRequesterMembership(interaction);
  if (!hasLeadershipClearance(interaction, requester)) {
    await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher to assign fireteams.")] });
    return;
  }

  const fireteamId = interaction.fields.getTextInputValue("fireteam_id").trim();
  const role = interaction.fields.getTextInputValue("role").trim();
  if (!FIRETEAM_ROLES.some((r) => r.toLowerCase() === role.toLowerCase())) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Role", `Role must be exactly one of: ${FIRETEAM_ROLES.join(", ")}.`)] });
    return;
  }
  const matchedRole = FIRETEAM_ROLES.find((r) => r.toLowerCase() === role.toLowerCase());

  const targetMember = db.getMember(interaction.guildId, targetId);
  if (!targetMember || targetMember.team_name !== requester.team_name) {
    await interaction.editReply({ embeds: [dangerEmbed("Not On Your Team", `<@${targetId}> isn't registered on **${requester.team_name}**.`)] });
    return;
  }

  const currentOccupants = db.listTeamMembers(interaction.guildId, requester.team_name).filter((m) => m.fireteam_id === fireteamId);
  const roleHolder = currentOccupants.find((m) => m.fireteam_role === matchedRole && m.discord_id !== targetId);
  if (roleHolder) {
    await interaction.editReply({ embeds: [dangerEmbed("Slot Occupied", `**${matchedRole}** on \`${fireteamId}\` is already filled by <@${roleHolder.discord_id}>. Reassign them first.`)] });
    return;
  }
  const alreadyInThisFireteam = currentOccupants.some((m) => m.discord_id === targetId);
  if (!alreadyInThisFireteam && currentOccupants.length >= MAX_FIRETEAM_SIZE) {
    await interaction.editReply({ embeds: [dangerEmbed("Fireteam Full", `\`${fireteamId}\` already has its ${MAX_FIRETEAM_SIZE} slots filled.`)] });
    return;
  }

  db.assignFireteamSlot(interaction.guildId, fireteamId, requester.team_name, targetId, matchedRole);
  await syncMemberFireteamRole(interaction.guild, targetId, matchedRole);

  await interaction.editReply({ embeds: [successEmbed("Fireteam Assigned", `<@${targetId}> is now the **${matchedRole}** on fireteam \`${fireteamId}\`.`)] });
}

/** Step 3 - the modal submission actually sends the Challenge, same challengeEngine.createChallenge call /challenge itself makes. */
async function handleChallengeModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requirePremiumOwner(interaction))) return;

  const targetId = interaction.customId.split(":")[2];
  const guildId = interaction.guildId;
  const currencyName = interaction.fields.getTextInputValue("currency").trim();
  const stake = Number(interaction.fields.getTextInputValue("stake").trim());
  const killsRaw = interaction.fields.getTextInputValue("kills").trim();
  const killTarget = killsRaw ? Number(killsRaw) : 5;

  const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
  if (!currency) {
    await interaction.editReply({ embeds: [dangerEmbed("Unknown Currency", `Couldn't find a currency named "${currencyName}" - check \`/shop-panel\` for the exact name.`)] });
    return;
  }
  if (!Number.isFinite(stake) || stake <= 0) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Stake", "Enter a positive number.")] });
    return;
  }
  if (!challengeEngine.VALID_KILL_TARGETS.includes(killTarget)) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Kill Target", `Kill target must be one of: ${challengeEngine.VALID_KILL_TARGETS.join(", ")} (or leave blank for 5).`)] });
    return;
  }

  const rivalship = db.getRivalship(guildId, interaction.user.id, targetId);
  const rivalshipId = rivalship?.status === "active" ? rivalship.id : null;

  const result = challengeEngine.createChallenge(guildId, interaction.user.id, targetId, currency.id, stake, rivalshipId, killTarget);
  if (!result.ok) {
    await interaction.editReply({ embeds: [dangerEmbed("Can't Send Challenge", result.reason)] });
    return;
  }

  const view = challengeEngine.buildChallengeSentView(guildId, result.challenge);
  await interaction.channel.send({ content: `<@${targetId}>`, ...view }).catch(() => {});
  await interaction.editReply({ embeds: [successEmbed("Challenge Sent", `Sent a Challenge to <@${targetId}> for **${stake} ${currency.emoji || ""} ${currency.name}** each.`.replace(/\s+/g, " ").trim())] });
}

async function handleModal(interaction) {
  if (interaction.customId.startsWith("mainpanel:challenge_modal:")) {
    await handleChallengeModal(interaction);
    return;
  }
  if (interaction.customId.startsWith("mainpanel:fireteam_modal:")) {
    await handleFireteamModal(interaction);
    return;
  }
}

/** Posts one of the 4 hubs to a channel (used by /panel-setup) - no live-refresh needed (unlike e.g. the Games Panel's live stats), so this is a plain post rather than the edit-in-place-if-it-still-exists pattern other deployers use. Pinned so it stays visible above ordinary chat. */
function makeDeployer(buildFn) {
  return async function deploy(channel) {
    const message = await channel.send(buildFn());
    await message.pin().catch(() => {});
    return message;
  };
}

module.exports = {
  buildOwnerHub,
  buildAdminHub,
  buildModHub,
  buildPlayerHub,
  handleComponent,
  handleModal,
  isOwnerTier,
  isAdminTier,
  isModTier,
  deployOwnerPanel: makeDeployer(buildOwnerHub),
  deployAdminPanel: makeDeployer(buildAdminHub),
  deployModPanel: makeDeployer(buildModHub),
  deployPlayerPanel: makeDeployer(buildPlayerHub),
};

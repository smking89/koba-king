"use strict";

const { PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { CHANNEL_CONTENT, stripEmoji } = require("../config/templates");
const { infoEmbed } = require("./embeds");
const { seedDefaultFaq } = require("./frank");
const { buildOwnerAdminHub, buildModHub } = require("./staffPanel");
const { ensureAllSystemRoles, ensurePlanRoles } = require("./systemRoles");
const { isOfficialGuild } = require("./premium");

const ROLE_NAMES = {
  admin: "🤖 KOBA Bot Admin",
  factionLeader: "⚔️ Faction Leader",
};

const { withTimeout } = require("./withTimeout");

// FIXED (2026-10-15): this literally decoded to "BOOMBOT OPERATIONS" (the
// pre-rebrand name) despite reading as "KOBABOT" at a glance - the bold-
// unicode codepoints were never actually updated when every comment/
// channel-name/site string around it was rebranded. Confirmed live: guilds
// were getting a category that spelled BOOMBOT under the hood. Also now
// resolved by stored ID (see ensureCategory below) instead of by-name-only,
// so a future rename like this one renames the existing category in place
// instead of leaving an orphaned duplicate behind forever - the exact
// failure mode this bug caused (a guild owner manually renamed their
// category to fix the branding by eye, next provisioning pass couldn't
// find "BOOMBOT OPERATIONS" anymore and created a second category).
const CATEGORY_NAME = "💣 𝗞𝗢𝗕𝗔𝗕𝗢𝗧 𝗢𝗣𝗘𝗥𝗔𝗧𝗜𝗢𝗡𝗦";
const CHANNEL_NAMES = {
  panel: "💥-kobabot-panel",
  warLogs: "💥-war-room-logs",
  support: "🎫-create-a-ticket",
  welcome: "👋-welcome-leave",
};

// These base "Feature 1" entities (created on join, before any /setup-template
// choice exists) used to hardcode emoji names no matter what - so a guild on
// the emoji-free KOBABOT Minimal template still got an emoji category/roles/
// channels here. Now provisionGuild() picks between these and the plain set
// below based on the guild's last-applied template (guild_meta.template_key,
// set by /setup-template) - see resolveOrEnsureChannel()'s ID-based rename so
// switching templates renames these in place instead of leaving an orphaned
// duplicate with the old name lying around.
const CATEGORY_NAME_MINIMAL = stripEmoji(CATEGORY_NAME);
const CHANNEL_NAMES_MINIMAL = Object.fromEntries(Object.entries(CHANNEL_NAMES).map(([key, name]) => [key, stripEmoji(name)]));
const ROLE_NAMES_MINIMAL = Object.fromEntries(Object.entries(ROLE_NAMES).map(([key, name]) => [key, stripEmoji(name)]));

/** Template channel `key` -> guild_meta column, for channels Feature 10 renames periodically. */
const STAT_CHANNEL_META_FIELDS = {
  playerCount: "player_count_channel_id",
  statsServers: "stats_servers_channel_id",
  statsOwners: "stats_owners_channel_id",
  statsPlayers: "stats_players_channel_id",
  // Bot Health monitoring (utils/botHealthAlerts.js) - consolidated
  // (2026-10-15) from 3 separate channels into this single automated-dump
  // channel, matching config/templates.js's current "📡-dev-logs" def -
  // heartbeat, RCON alerts, and error alerts all post here now.
  devLogs: "dev_logs_channel_id",
  leaderboard: "leaderboard_channel_id",
  lfgFeed: "lfg_feed_channel_id",
  linkGamertag: "link_gamertag_channel_id",
  referralClaim: "referral_claim_channel_id",
  createLfg: "create_lfg_channel_id",
  announcements: "announcement_channel_id",
  eventsFeed: "events_channel_id",
  adminFeed: "admin_feed_channel_id",
  claimKit: "claim_kit_channel_id",
  trade: "trade_channel_id",
  gifts: "gifts_channel_id",
  staffApps: "staff_apps_channel_id",
  shop: "shop_channel_id",
  marketplace: "marketplace_channel_id",
  auctions: "auction_channel_id", // reuses the existing column /auction-config channel also writes to
  kitPanelStaff: "kit_panel_staff_channel_id",
  globalPlayerCount: "global_player_count_channel_id",
  serversHub: "servers_hub_channel_id",
  staffPanel: "staff_panel_channel_id",
  modPanel: "mod_panel_channel_id",
  // Added 2026-09-10 - see BUTTON_PANELS' matching comment above.
  ownerPanel: "owner_panel_channel_id",
  adminPanel: "admin_panel_channel_id",
  modPanelNew: "mod_panel_new_channel_id",
  playerPanelNew: "player_panel_new_channel_id",
  // Added 2026-09-17, per explicit user request - Rivals used to be
  // /panel-setup-only (no template channel of its own, unlike every other
  // panel here). Reuses the exact guild_meta column utils/rivalSystem.js's
  // deployRivalPanel already reads/writes, so a template-provisioned
  // channel and a later manual /panel-setup move both stay in sync with
  // the same stored id.
  rivals: "rival_panel_channel_id",
};

/**
 * config/templates.js's buildClusterServerCategory() generates per-map
 * channelDefs with dynamic keys like `playerCount_${serverName}` -
 * STAT_CHANNEL_META_FIELDS above can't cover these (it's a fixed
 * key->guild_meta-column map, and there's one of these channels per linked
 * map, not per guild), so they need their own routing into the
 * `guild_servers` table's per-map columns instead. Bug fixed 2026-09-04:
 * this wiring never existed before, so a Cluster guild's per-map "local"
 * player-count channel was created but never actually received anything -
 * db.setGuildServerChannel existed but nothing ever called it.
 */
const DYNAMIC_SERVER_CHANNEL_PREFIXES = {
  playerCount_: (guildId, serverName, channelId) => db.setGuildServerChannel(guildId, serverName, channelId),
};

/**
 * Persistent button panels posted (once) into specific bot-managed channels
 * so commands like /link, /referral, /create-lfg can be used by clicking
 * instead of typing. Keyed the same as STAT_CHANNEL_META_FIELDS/CHANNEL_CONTENT.
 * The customId namespace (before the first ":") routes to the matching
 * entry in client.componentHandlers, same convention as everywhere else.
 */
const BUTTON_PANELS = {
  linkGamertag: () => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("link:open").setLabel("Link Account").setStyle(ButtonStyle.Primary).setEmoji("🔗"),
      new ButtonBuilder().setCustomId("link:unlink").setLabel("Unlink").setStyle(ButtonStyle.Secondary)
    ),
  ],
  referralClaim: () => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("referral:open").setLabel("Redeem Code").setStyle(ButtonStyle.Success).setEmoji("🎟️"),
      new ButtonBuilder().setCustomId("referral:create").setLabel("Create Code").setStyle(ButtonStyle.Primary).setEmoji("✨")
    ),
  ],
  createLfg: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("lfg:open").setLabel("Create LFG Post").setStyle(ButtonStyle.Success).setEmoji("📝"))],
  // FIXED (2026-09-10, product pruning pass): claimKit used to post its own
  // "Claim Kit" self-claim button (customId playerpanel:claim) - removed
  // along with that generic Rust kit-distribution mechanic. claimKit is
  // still the PRIMARY channelDef this shared channel is created under (see
  // config/templates.js's sharesChannelWith), so it stays in CHANNEL_CONTENT
  // as a plain intro message with no button - "trade" (posted into the same
  // physical channel right after) still provides the real "My Items" button.
  trade: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("playerpanel:items").setLabel("My Items").setStyle(ButtonStyle.Primary).setEmoji("📦"))],
  shop: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("shop:open").setLabel("Open Shop").setStyle(ButtonStyle.Success).setEmoji("🛒"))],
  auctions: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("auction:browse").setLabel("Browse Auctions").setStyle(ButtonStyle.Success).setEmoji("🔨"))],
  marketplace: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("marketplace:browse").setLabel("Browse Listings").setStyle(ButtonStyle.Success).setEmoji("🤝"))],
  kitPanelStaff: () => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("kitpanel:open").setLabel("Open Kit Panel").setStyle(ButtonStyle.Success).setEmoji("🎒"))],
  // These two reuse the exact same button-builders the persistent
  // 🛡️-staff-panel / 🔰-mod-panel channels use elsewhere (utils/staffPanel.js's
  // buildOwnerAdminHub/buildModHub) - only `.components` is used here since
  // postWelcomeContentOnce builds its own embed from CHANNEL_CONTENT.
  staffPanel: () => buildOwnerAdminHub().components,
  modPanel: () => buildModHub().components,
};

/**
 * Fixed channel-name lookup for self-healing bot-managed channels whose id
 * isn't saved to guild_meta yet (e.g. a server provisioned before this
 * specific field existed) - looks the channel up by its known template
 * name and persists it, so a feature shipped after a server's last
 * /setup-template run still works without forcing a re-run.
 */
const MANAGED_CHANNEL_NAMES = {
  // FIXED (2026-09-17): linkGamertag/referralClaim/createLfg all merge into
  // ONE physical channel (config/templates.js - "🔗-quick-links" in every
  // template, whichever of the three is that template's designated
  // "primary"/non-shared key) - these three fallback names were stale
  // pre-merge names that no longer exist as real channels, so if a guild's
  // stored channel ID ever went stale (e.g. after a wipe), the by-name
  // self-heal could never find it again and would just skip repairing it.
  linkGamertag: "🔗-quick-links",
  referralClaim: "🔗-quick-links",
  createLfg: "🔗-quick-links",
  lfgFeed: "⚔️-lfg-feed",
  announcements: "📢-announcements",
  eventsFeed: "🎉-events",
  adminFeed: "❗-admin-feed",
  claimKit: "🎁-claim-kit",
  trade: "🔁-trade",
  gifts: "🎉-gifts",
  staffApps: "📋-staff-applications",
  shop: "🛒-shop",
  marketplace: "🤝-marketplace",
  auctions: "🔨-auctions",
  kitPanelStaff: "🎒-kit-panel",
  staffPanel: "🛡️-staff-panel",
  modPanel: "🔰-mod-panel",
  // Added 2026-09-10 - see BUTTON_PANELS' matching comment above.
  ownerPanel: "🏛️-owner-panel",
  adminPanel: "⚙️-admin-panel",
  modPanelNew: "🔰-mod-panel-hub",
  playerPanelNew: "🧭-player-panel",
  // Rivals has no BUTTON_PANELS entry of its own (see repairManagedPanels'
  // matching comment below) but still needs a by-name fallback like every
  // other managed panel channel, so a stale/missing rival_panel_channel_id
  // (e.g. after a /template wipe+rebuild) can still self-heal instead of
  // only ever working off whatever id happened to already be saved.
  rivals: "⚔️-rivals",
};

/** Resolves a bot-managed channel by guild_meta field, self-healing (and persisting) a by-name lookup if it was never saved. */
async function resolveManagedChannel(guild, key) {
  const metaField = STAT_CHANNEL_META_FIELDS[key];
  const meta = db.getGuildMeta(guild.id);
  const savedId = metaField && meta?.[metaField];
  if (savedId) {
    const channel = await guild.channels.fetch(savedId).catch(() => null);
    if (channel) return channel;
  }

  const name = MANAGED_CHANNEL_NAMES[key];
  if (!name) return null;
  const channel = guild.channels.cache.find((c) => c.name === name) || null;
  if (channel && metaField) db.upsertGuildMeta(guild.id, { [metaField]: channel.id });
  return channel;
}

/**
 * Repairs every button-panel channel BUTTON_PANELS knows about, standalone
 * from provisionTemplate - doesn't need to know which template (or none)
 * was originally applied, since it works entirely off self-healing
 * by-name lookups. Safe to run any time (/panel-repair, or automatically
 * after /setup-template) since postWelcomeContentOnce is itself idempotent
 * and now diffs+repairs a stale button set instead of just skip-if-exists.
 * Returns the list of channel keys it actually found and touched.
 */
async function repairManagedPanels(guild) {
  const touched = [];
  for (const key of Object.keys(BUTTON_PANELS)) {
    const channel = await resolveManagedChannel(guild, key);
    if (!channel) continue;
    let content = CHANNEL_CONTENT[key];
    if (!content) continue;
    if (typeof content === "function") content = content(guild.id);
    await postWelcomeContentOnce(channel, content, BUTTON_PANELS[key](), key);
    touched.push(key);
  }

  return touched;
}

/**
 * Feature (2026-09-07): /panel-setup's generic mover for any BUTTON_PANELS
 * key - persists the new channel into guild_meta (so future self-healing
 * lookups/`/panel-repair` point here from now on) then reposts via the same
 * postWelcomeContentOnce() used everywhere else. Moving is "free" because
 * postWelcomeContentOnce already only trusts a stored message ID if it
 * actually resolves IN THE GIVEN CHANNEL - pointing it at a different
 * channel than where that ID lives makes the fetch fail, falls through, and
 * posts fresh there (the old message is simply left behind, unpinned only
 * in the sense that Discord won't unpin it either - a minor known rough
 * edge, not cleaned up automatically).
 */
async function movePanel(guild, key, newChannel) {
  const metaField = STAT_CHANNEL_META_FIELDS[key];
  if (metaField) db.upsertGuildMeta(guild.id, { [metaField]: newChannel.id });
  let content = CHANNEL_CONTENT[key];
  if (typeof content === "function") content = content(guild.id);
  const buildComponents = BUTTON_PANELS[key];
  await postWelcomeContentOnce(newChannel, content, buildComponents ? buildComponents() : [], key);
}

/**
 * Idempotent: finds an existing role by name or creates it.
 * `opts` is either a permissions array (legacy call sites) or
 * `{ permissions, color }` for the fuller template roles.
 */
async function ensureRole(guild, name, opts = []) {
  const { permissions = [], color } = Array.isArray(opts) ? { permissions: opts } : opts;
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await withTimeout(
      guild.roles.create({
        name,
        permissions,
        color,
        reason: "KOBA Bot automated provisioning",
      }),
      `create role "${name}"`
    );
  } else {
    // Same self-healing pattern as ensureChannel's permission re-sync below -
    // a role created once (e.g. by base provisionGuild()) never picked up a
    // color/permission change from a later /setup-template run otherwise.
    const patch = {};
    if (color !== undefined && role.color !== color) patch.color = color;
    if (permissions.length && !role.permissions.has(permissions)) patch.permissions = permissions;
    if (Object.keys(patch).length) role = await withTimeout(role.edit({ ...patch, reason: "KOBA Bot automated provisioning" }), `edit role "${name}"`).catch(() => role);
  }
  return role;
}

/**
 * Idempotent: resolves by stored ID first (renaming in place if the name
 * has drifted, e.g. a template rebrand), falling back to a by-name lookup/
 * create only when there's no stored ID yet (first-ever provisioning) -
 * same two-tier contract as resolveOrEnsureChannel below, and for the same
 * reason: a by-name-only lookup can never recover from either a code-side
 * rename or a guild owner manually renaming the category, and silently
 * creates a duplicate instead (see CATEGORY_NAME's header comment for the
 * real incident this caused).
 */
async function ensureCategory(guild, name, storedId) {
  if (storedId) {
    const existing = await guild.channels.fetch(storedId).catch(() => null);
    if (existing && existing.type === ChannelType.GuildCategory) {
      if (existing.name !== name) await existing.setName(name, "KOBA Bot automated provisioning (category rename)").catch(() => {});
      return existing;
    }
  }
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (!category) {
    category = await withTimeout(
      guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        reason: "KOBA Bot automated provisioning",
      }),
      `create category "${name}"`
    );
  }
  return category;
}

/**
 * Idempotent: finds an existing text channel by name under a category or
 * creates it. Also re-syncs permission overwrites on an already-existing
 * channel (not just at creation time) - otherwise a channel created before
 * a permissions change shipped stays stuck with its old (possibly wrong)
 * permissions forever, since re-running /setup or /setup-template alone
 * wouldn't touch it.
 */
async function ensureChannel(guild, name, parentId, overwrites) {
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === name && c.parentId === parentId
  );
  if (!channel) {
    channel = await withTimeout(
      guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: parentId,
        permissionOverwrites: overwrites,
        reason: "KOBA Bot automated provisioning",
      }),
      `create channel "${name}"`
    );
  } else if (overwrites) {
    await withTimeout(channel.permissionOverwrites.set(overwrites, "KOBA Bot automated provisioning (permission sync)"), `sync overwrites "${name}"`).catch(() => {});
  }
  return channel;
}

/**
 * Same idempotency contract as ensureChannel, but checks a stored guild_meta
 * ID first and renames in place if the desired name has drifted (e.g. the
 * admin switched /setup-template from Standard to KOBABOT Minimal) - falls
 * back to ensureChannel's by-name lookup/create only when there's no stored
 * ID yet (first-ever provisioning). Without this, a name change here would
 * silently create a brand new duplicate channel instead of renaming the
 * original, since ensureChannel only ever matches by exact current name.
 */
async function resolveOrEnsureChannel(guild, storedId, name, parentId, overwrites) {
  if (storedId) {
    const existing = await guild.channels.fetch(storedId).catch(() => null);
    if (existing) {
      if (existing.name !== name) await existing.setName(name, "KOBA Bot automated provisioning (template rename)").catch(() => {});
      if (overwrites) await existing.permissionOverwrites.set(overwrites, "KOBA Bot automated provisioning (permission sync)").catch(() => {});
      return existing;
    }
  }
  return ensureChannel(guild, name, parentId, overwrites);
}

/**
 * Feature 1: Automated Server Provisioning & Setup On Join.
 * Safe to re-run - every create step checks for an existing entity by name first.
 * Returns the created/found channel references so callers can deploy the
 * dashboard message (Feature 2) into the panel channel right after.
 */
async function provisionGuild(guild) {
  const meta = db.getGuildMeta(guild.id);
  // guild_meta.template_key is set by /setup-template - a guild that has
  // never run it (or is mid-join, before any template choice exists) just
  // gets the original emoji-on Standard-style naming here, same as always.
  const minimal = meta?.template_key === "minimal";
  const roleNames = minimal ? ROLE_NAMES_MINIMAL : ROLE_NAMES;
  const categoryName = minimal ? CATEGORY_NAME_MINIMAL : CATEGORY_NAME;
  const channelNames = minimal ? CHANNEL_NAMES_MINIMAL : CHANNEL_NAMES;

  const adminRole = await ensureRole(guild, roleNames.admin, [PermissionFlagsBits.ManageGuild]);
  const factionLeaderRole = await ensureRole(guild, roleNames.factionLeader);

  const category = await ensureCategory(guild, categoryName, meta?.operations_category_id);

  const everyoneId = guild.roles.everyone.id;

  const panelChannel = await resolveOrEnsureChannel(guild, meta?.panel_channel_id, channelNames.panel, category.id, [
    { id: everyoneId, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
    { id: adminRole.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
  ]);

  const warLogsChannel = await resolveOrEnsureChannel(guild, meta?.logs_channel_id, channelNames.warLogs, category.id, [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
  ]);

  const supportChannel = await resolveOrEnsureChannel(guild, meta?.support_channel_id, channelNames.support, category.id, [
    { id: everyoneId, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
    { id: adminRole.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
  ]);

  const welcomeChannel = await resolveOrEnsureChannel(guild, meta?.welcome_channel_id, channelNames.welcome, category.id, [
    { id: everyoneId, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
  ]);

  db.upsertGuildMeta(guild.id, {
    operations_category_id: category.id,
    panel_channel_id: panelChannel.id,
    logs_channel_id: warLogsChannel.id,
    support_channel_id: supportChannel.id,
    welcome_channel_id: welcomeChannel.id,
    // Frank watches the support channel by default - staff can point him
    // elsewhere any time with /set announcement-channel target:Frank.
    frank_channel_id: supportChannel.id,
    provisioned_at: Date.now(),
  });
  seedDefaultFaq(guild.id, guild.client.user.id);

  // FIXED (2026-09-14): the E1-E9 rank roles (config/roleColors.js's
  // RANK_ROLE_COLORS) were only ever created by the separate, manual
  // /setup-system-roles command - /template setup (and every other
  // provisioning entry point that calls this shared tail) never created
  // them. syncMemberRankRole() only LOOKS UP a rank role by name and
  // silently no-ops if it's missing (it never creates one), so a
  // promote/demote on a server that never happened to run
  // /setup-system-roles separately did nothing visible - the role plainly
  // didn't exist yet. Both calls are idempotent (find-or-create, matching
  // the same convention as ensureRole above), so running them on every
  // provisionGuild() call (template setup, template mine apply, backup
  // restore, plain /setup, and any future entry point) is safe to repeat
  // and makes rank/plan roles self-healing instead of a manual extra step.
  await ensureAllSystemRoles(guild).catch((err) => console.error(`[KOBA Bot] ensureAllSystemRoles failed during provisioning for ${guild.id}:`, err.message));
  await ensurePlanRoles(guild).catch((err) => console.error(`[KOBA Bot] ensurePlanRoles failed during provisioning for ${guild.id}:`, err.message));

  return { adminRole, factionLeaderRole, category, panelChannel, warLogsChannel, supportChannel, welcomeChannel };
}

/**
 * Feature 2: Optional full server-template provisioning (/setup-template),
 * on top of the always-on minimal provisioning above. Idempotent by name,
 * same as everything else here - safe to re-run if the admin adds more
 * template pieces later or reruns after a partial failure.
 */
async function provisionTemplate(guild, template, extraCategories = []) {
  console.log(`[KOBA Bot] provisionTemplate starting for guild ${guild.id}: template="${template.key}", ${template.roles.length} role(s), ${template.categories.length + extraCategories.length} categor${template.categories.length + extraCategories.length === 1 ? "y" : "ies"}`);
  // extraCategories: dynamically-built categories (e.g. one per map server
  // for CLUSTER_TEMPLATE, built by buildClusterServerCategory()) - not part
  // of the template's own static `categories` array since the server names
  // aren't known until the admin provides them.
  const roleByKey = {};
  for (const roleDef of template.roles) {
    // Pro/Max are KOBA Bot's own subscription-plan status roles (see
    // config/templates.js's COLORS.pro/max header comment) - they only mean
    // anything on the official KOBA Bot server itself (identifying real
    // subscribers there), not on a customer's own community server, so
    // they're skipped entirely everywhere else per explicit product
    // decision. Basic (and every other role) still provisions normally.
    // FIXED (2026-09-19): Basic/Pro/Max all only ever mean anything on the
    // official KOBA Bot server itself (identifying real subscribers there,
    // per website/src/components/PlanGrid.jsx's plan tiers) - explicit user
    // request to stop creating any of the 3 on customer guilds, not just
    // Pro/Max as before.
    if (["basic", "pro", "max"].includes(roleDef.key) && !isOfficialGuild(guild.id)) continue;
    try {
      roleByKey[roleDef.key] = await ensureRole(guild, roleDef.name, { color: roleDef.color });
    } catch (err) {
      console.error(`[KOBA Bot] Provisioning failed for role "${roleDef.name}":`, err.message);
    }
  }

  const everyoneId = guild.roles.everyone.id;
  const createdChannels = [];
  // Populated as each channelDef resolves, so a later channelDef in the same
  // (or a later) category can point `sharesChannelWith: "<key>"` at it and
  // reuse the same physical channel instead of getting its own - see
  // config/templates.js's header comment for why (fewer channels/categories,
  // easier navigation, per explicit request). Order matters: a channelDef's
  // `sharesChannelWith` target must appear earlier in template.categories.
  const channelByKey = {};
  // A CHANNEL_CONTENT entry can be a function of guildId instead of a plain
  // {title, description} object (config/templates.js's howToPlay, which
  // needs OTHER channels' real ids for its "post in <#channel>" mentions -
  // channels a later category in this same run might not have created yet).
  // Posting those is deferred until every category/channel below has
  // resolved, so the function always sees the complete, final guild_meta
  // state instead of whatever partial state existed mid-loop.
  const deferredContent = [];

  for (const categoryDef of [...template.categories, ...extraCategories]) {
    console.log(`[KOBA Bot] provisionTemplate: ensuring category "${categoryDef.name}" (${categoryDef.channels.length} channel(s))`);
    // FIXED (2026-09-16): unlike the per-channel loop below (which already
    // had this same resilience, see its own comment), ensureCategory()
    // itself was NOT wrapped - a rate limit or transient error creating
    // even the FIRST category (very plausible right after /template
    // setup's own wipe just burned through a whole server's worth of
    // delete calls) threw uncaught, silently killing the entire loop
    // before a single channel or category got created, while the earlier
    // (separate) role loop above had already completed successfully -
    // exactly "roles came back but no channels/categories did" reports.
    let category;
    try {
      category = await ensureCategory(guild, categoryDef.name);
    } catch (err) {
      console.error(`[KOBA Bot] Provisioning failed for category "${categoryDef.name}":`, err.message);
      continue;
    }

    for (const channelDef of categoryDef.channels) {
      // One channel failing (Discord rate limit, a transient permission
      // hiccup, etc.) must not abort the whole run - previously an uncaught
      // throw here killed provisionTemplate entirely, silently skipping
      // every channel/category still queued after it (this is why entire
      // categories - Player Hub, admin-feed, even plain leaderboard - could
      // go missing after a /nuke + re-run: nuke deletes ~everything, so a
      // fresh template run recreates dozens of channels in one loop, and
      // Discord's channel-creation rate limit is exactly the kind of thing
      // that trips mid-loop).
      try {
        let channel;

        if (channelDef.sharesChannelWith) {
          channel = channelByKey[channelDef.sharesChannelWith];
          if (!channel) throw new Error(`sharesChannelWith target "${channelDef.sharesChannelWith}" hasn't been created yet - check template ordering`);
        } else {
          const overwrites = [];

          // restrictedTo and readOnly stack rather than being mutually exclusive -
          // a channel can be both "only these roles can even see it" AND "even
          // they can't post in it" (e.g. an owner-only guide channel).
          if (channelDef.restrictedTo?.length) {
            overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
            for (const roleKey of channelDef.restrictedTo) {
              const role = roleByKey[roleKey];
              if (!role) continue;
              const allow = [PermissionFlagsBits.ViewChannel];
              if (!channelDef.readOnly) allow.push(PermissionFlagsBits.SendMessages);
              overwrites.push({ id: role.id, allow });
            }
          } else if (channelDef.readOnly) {
            overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
          } else if (channelDef.locked) {
            // Stat-display voice channels: visible, but nobody can actually join/talk in them.
            overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.Connect] });
          }

          // Stat voice channels get their live name overwritten by Feature 10
          // (e.g. "🌍 42 | ⏰ 3") almost immediately after
          // creation, so a name-based re-lookup on a second /setup-template
          // run would never match the template's base name again and would
          // silently create a duplicate channel every time. Check the stored
          // ID first for anything STAT_CHANNEL_META_FIELDS tracks, same as
          // resolveManagedChannel does for button-panel channels.
          const existingMetaField = STAT_CHANNEL_META_FIELDS[channelDef.key];
          const existingId = existingMetaField && db.getGuildMeta(guild.id)?.[existingMetaField];
          channel = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
          if (!channel) {
            channel =
              channelDef.type === "voice"
                ? await ensureVoiceChannel(guild, channelDef.name, category.id, overwrites)
                : channelDef.type === "forum"
                ? await ensureForumChannel(guild, channelDef.name, category.id, overwrites)
                : await ensureChannel(guild, channelDef.name, category.id, overwrites);
          }
        }

        channelByKey[channelDef.key] = channel;
        createdChannels.push(channel);

        {
          const content = CHANNEL_CONTENT[channelDef.key];
          const buildComponents = BUTTON_PANELS[channelDef.key];
          if (content && channel.isTextBased?.()) {
            if (typeof content === "function") {
              deferredContent.push({ channel, key: channelDef.key });
            } else {
              await postWelcomeContentOnce(channel, content, buildComponents?.(), channelDef.key);
            }
          }
        }

        // Certain voice channels get their name overwritten periodically by
        // Feature 10 (Global Status) - it looks them up by ID (stored here at
        // creation time), never by name, since the name itself is what keeps
        // changing every tick.
        const metaField = STAT_CHANNEL_META_FIELDS[channelDef.key];
        if (metaField) db.upsertGuildMeta(guild.id, { [metaField]: channel.id });

        for (const [prefix, setter] of Object.entries(DYNAMIC_SERVER_CHANNEL_PREFIXES)) {
          if (!channelDef.key.startsWith(prefix)) continue;
          setter(guild.id, channelDef.key.slice(prefix.length), channel.id);
          break;
        }
      } catch (err) {
        console.error(`[KOBA Bot] Provisioning failed for channel "${channelDef.name}" (category "${categoryDef.name}"):`, err.message);
      }
    }
  }

  for (const { channel, key } of deferredContent) {
    try {
      const resolved = CHANNEL_CONTENT[key](guild.id);
      await postWelcomeContentOnce(channel, resolved, BUTTON_PANELS[key]?.(), key);
    } catch (err) {
      console.error(`[KOBA Bot] Deferred content post failed for "${key}":`, err.message);
    }
  }

  console.log(`[KOBA Bot] provisionTemplate finished for guild ${guild.id}: ${createdChannels.length} channel(s) resolved.`);
  return { roleByKey, createdChannels };
}

/** Flat, sorted list of every button/select customId in a component-row set - works on both freshly-built ActionRowBuilder rows and real fetched-message ActionRow components, so it can compare "what we want" against "what's actually posted." */
function customIdsOf(rows) {
  return rows
    .flatMap((row) => (row.toJSON ? row.toJSON().components : row.components).map((c) => c.custom_id || c.customId))
    .sort()
    .join(",");
}

/**
 * Posts a channel's welcome/guide embed exactly once. Takes an optional
 * `key` - REQUIRED whenever more than one channelDef can land in the same
 * physical channel (see `sharesChannelWith` in config/templates.js), since
 * multiple merged-channel welcome messages/panels now live side by side in
 * one channel and "does this channel have any message yet" (lastMessageId)
 * or "does this channel have any bot message with components" would false-
 * positive on a SIBLING key's post/panel instead of this key's own - each
 * key's own message id is tracked separately via db.getConfig/setConfig
 * (`panel_msg:<key>`) once `key` is supplied.
 * Falls back to the old channel-wide checks when `key` isn't given, for the
 * (still common) case of a channel that only ever holds one thing.
 */
async function postWelcomeContentOnce(channel, { title, description }, components, key) {
  const configKey = key ? `panel_msg:${key}` : null;
  const savedId = configKey ? db.getConfig(channel.guild.id, configKey) : null;

  if (components?.length) {
    // Button panels must self-heal into channels that already have the old
    // text-only welcome message (e.g. this button shipped after the channel
    // already existed) - AND must self-heal a panel whose button set has
    // gone stale (e.g. a new button added to BUTTON_PANELS after the panel
    // was already posted) by editing it in place, not just checking "does a
    // panel exist at all" and stopping there.
    let existingPanel = savedId ? await withTimeout(channel.messages.fetch(savedId), `fetch panel message in #${channel.name}`).catch(() => null) : null;
    if (!existingPanel && !configKey) {
      const recent = await withTimeout(channel.messages.fetch({ limit: 10 }), `fetch recent messages in #${channel.name}`).catch(() => null);
      existingPanel = recent?.find((m) => m.author?.id === channel.client.user.id && m.components?.length);
    }
    if (existingPanel) {
      if (!existingPanel.pinned) await withTimeout(existingPanel.pin(), `pin panel in #${channel.name}`).catch(() => {}); // backfill pin for panels posted before this existed
      if (customIdsOf(existingPanel.components) !== customIdsOf(components)) {
        await withTimeout(existingPanel.edit({ embeds: [infoEmbed(title, description)], components }), `edit panel in #${channel.name}`).catch((err) => console.error(`[KOBA Bot] Panel refresh failed for #${channel.name}:`, err));
      }
      return;
    }
    const sent = await withTimeout(channel.send({ embeds: [infoEmbed(title, description)], components }), `send panel in #${channel.name}`).catch((err) => {
      console.error(`[KOBA Bot] Panel post failed for #${channel.name}:`, err);
      return null;
    });
    if (sent) {
      await withTimeout(sent.pin(), `pin panel in #${channel.name}`).catch((err) => console.error(`[KOBA Bot] Pinning panel failed for #${channel.name}:`, err.message));
      if (configKey) db.setConfig(channel.guild.id, configKey, sent.id);
    }
    return;
  }

  if (configKey) {
    if (savedId && (await withTimeout(channel.messages.fetch(savedId), `fetch welcome message in #${channel.name}`).catch(() => null))) return;
    const sent = await withTimeout(channel.send({ embeds: [infoEmbed(title, description)] }), `send welcome message in #${channel.name}`).catch((err) => {
      console.error(`[KOBA Bot] Welcome post failed for #${channel.name}:`, err);
      return null;
    });
    if (sent) db.setConfig(channel.guild.id, configKey, sent.id);
    return;
  }
  if (channel.lastMessageId) return;
  await withTimeout(channel.send({ embeds: [infoEmbed(title, description)] }), `send welcome message in #${channel.name}`).catch((err) => console.error(`[KOBA Bot] Welcome post failed for #${channel.name}:`, err));
}

/** Idempotent: finds an existing voice channel by name under a category or creates it. */
/** Forum channel (added 2026-09-19, per explicit user request for an official-guild feedback/feature-request forum) - same idempotent-by-name-and-parent lookup as ensureChannel/ensureVoiceChannel. */
async function ensureForumChannel(guild, name, parentId, overwrites) {
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildForum && c.name === name && c.parentId === parentId
  );
  if (!channel) {
    channel = await withTimeout(
      guild.channels.create({
        name,
        type: ChannelType.GuildForum,
        parent: parentId,
        permissionOverwrites: overwrites,
        reason: "KOBA Bot template provisioning",
      }),
      `create forum channel "${name}"`
    );
  } else if (overwrites) {
    await withTimeout(channel.permissionOverwrites.set(overwrites, "KOBA Bot template provisioning (permission sync)"), `sync overwrites "${name}"`).catch(() => {});
  }
  return channel;
}

async function ensureVoiceChannel(guild, name, parentId, overwrites) {
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === name && c.parentId === parentId
  );
  if (!channel) {
    channel = await withTimeout(
      guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: parentId,
        permissionOverwrites: overwrites,
        reason: "KOBA Bot template provisioning",
      }),
      `create voice channel "${name}"`
    );
  } else if (overwrites) {
    await withTimeout(channel.permissionOverwrites.set(overwrites, "KOBA Bot template provisioning (permission sync)"), `sync overwrites "${name}"`).catch(() => {});
  }
  return channel;
}

module.exports = { provisionGuild, provisionTemplate, resolveManagedChannel, repairManagedPanels, movePanel, ROLE_NAMES, CATEGORY_NAME, CHANNEL_NAMES, BUTTON_PANELS };

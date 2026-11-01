"use strict";

/**
 * /link is fully in-Discord now (2026-09-16 rework) - no website step. A
 * player picks their platform (Xbox/PlayStation) and types their exact
 * Gamertag/Online ID, and the bot proves it's really theirs by checking
 * that Gamertag is CURRENTLY ONLINE on this server via WebRCON (`players`)
 * instead of the old website OAuth-session-must-match-a-DMed-token scheme.
 * This is a real, live check against the actual Rust server - if the name
 * isn't in the current player list, the link is refused, so a player has
 * to actually be logged into the server to link it.
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("./premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("./embeds");
const { getRcon } = require("../rcon/manager");
const { parsePlayerlist } = require("../rcon/parsers");

/**
 * FIXED (2026-09-07): utils/systemRoles.js manages LIVE Discord guild roles
 * (guild.roles.cache, real role creation) - lazy-required so a module that
 * never actually needs it (there is none anymore now that the website has
 * no involvement, but keeping the lazy pattern costs nothing and matches
 * the rest of this file's require style).
 */
function getSyncLinkedRole() {
  return require("./systemRoles").syncLinkedRole;
}

const PLATFORM_ROLE_NAMES = { xbox: "🎮 Xbox", playstation: "🎮 PlayStation" };
const PLATFORM_LABELS = { xbox: "Xbox", playstation: "PlayStation" };
const PLATFORM_CHOICES = [
  { name: "Xbox", value: "xbox" },
  { name: "PlayStation", value: "playstation" },
];

/** True if `gamertag` is currently in this guild's server's live player list (WebRCON `players`). Case-insensitive, exact match - this is the actual proof-of-ownership check. */
async function isGamertagOnline(guildId, gamertag) {
  const rcon = await getRcon(guildId);
  const players = parsePlayerlist(await rcon.send("players"));
  const target = gamertag.trim().toLowerCase();
  return players.some((p) => p.gamertag && p.gamertag.trim().toLowerCase() === target);
}

/**
 * The actual validation + save, called once WebRCON presence has already
 * confirmed this Gamertag is really being played by whoever is running
 * /link right now. No more username/tags/account-type collection - those
 * were only ever consumed by the now-removed website account pages
 * (Dashboard/Settings/Messages); the roster gamertag + global BOOMid
 * platform link is the only part anything else in the bot still reads.
 */
function completeGamertagLink(guildId, discordId, platform, gamertag) {
  // FIXED (2026-10-29, private-bot simplification): this used to require an
  // existing team roster row (created by the now-removed /team create) and
  // dead-ended every new player with "run /team manage" - a command that no
  // longer exists. Teams are gone, so /link now provisions a bare member
  // row itself (db.addMember's own ON CONFLICT upsert makes this safe to
  // call even if a row already exists).
  db.addMember(guildId, discordId, "Unassigned");

  const trimmed = (gamertag || "").trim();
  if (!trimmed) return { outcome: "invalid_gamertag" };

  const existingOwner = db.getMemberByGamertag(guildId, trimmed);
  if (existingOwner && existingOwner.discord_id !== discordId) {
    return { outcome: "already_linked_guild", teamName: existingOwner.team_name };
  }

  const linkResult = db.upsertBoomIdentityLink(discordId, platform, trimmed);
  if (linkResult.outcome === "banned") return { outcome: "banned" };
  if (linkResult.outcome === "platform_id_taken") return { outcome: "already_linked_global" };

  db.setMemberGamertag(guildId, discordId, trimmed);
  db.queueRoleGrant(guildId, discordId, platform);

  return { outcome: "ok", gamertag: trimmed, platform, boomId: linkResult.boomId };
}

const LINK_ERROR_MESSAGES = {
  invalid_gamertag: "Enter your exact Gamertag or Online ID.",
  already_linked_guild: (result) => `That Gamertag is already linked to another Discord account on ${result.teamName || "another team"}.`,
  banned: "This account (or that Gamertag/Online ID) is banned from KOBA Bot platform-wide and can't link anywhere.",
  already_linked_global: "That Gamertag/Online ID is already linked to a different Discord account elsewhere on KOBA Bot.",
};

/**
 * Shared by the `/link start` slash command and the #link-gamertag panel's
 * modal submission - `interaction` must already be deferred (ephemeral).
 */
async function handleLinkStart(interaction, platform, gamertag) {
  const trimmed = (gamertag || "").trim();
  if (!trimmed) {
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Link", LINK_ERROR_MESSAGES.invalid_gamertag)] });
    return;
  }

  let online;
  try {
    online = await isGamertagOnline(interaction.guildId, trimmed);
  } catch (err) {
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Reach The Server", `Couldn't check the server's live player list: ${err.message}. Try again in a moment.`)] });
    return;
  }
  if (!online) {
    await interaction.editReply({
      embeds: [
        dangerEmbed(
          "Not Found Online",
          `**${trimmed}** isn't showing up in this server's live player list right now. Make sure you're logged into Rust on THIS server, then run \`/link\` again.`
        ),
      ],
    });
    return;
  }

  const result = completeGamertagLink(interaction.guildId, interaction.user.id, platform, trimmed);
  if (result.outcome !== "ok") {
    const msg = LINK_ERROR_MESSAGES[result.outcome];
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Link", typeof msg === "function" ? msg(result) : msg || "Something went wrong - try again.")] });
    return;
  }

  const label = PLATFORM_LABELS[platform] || platform;
  await interaction.editReply({
    embeds: [successEmbed("Linked!", `**${result.gamertag}** (${label}) is now linked to your Discord account.\n\nYour KOBA Bot ID: \`${result.boomId}\`\nUse \`/link existing\` to link additional servers instantly without repeating this check.`)],
  });

  try {
    if (interaction.guild) await getSyncLinkedRole()(interaction.guild, interaction.user.id, true);
  } catch (err) {
    console.error("[KOBA Bot] /link role sync failed:", err.message);
  }
}

/**
 * ASTRO web-link (2026-10-29) - ASTRO is the shared identity/wallet layer
 * behind Bleek, koba.games, SnagChat, and KOBAbot (one User/AccountWallet/
 * UserConnection set, read by every product). ASTRO has no live endpoint
 * yet, so this generates a real one-time token (same link_tokens table/
 * 10-minute expiry the old pre-RCON linking scheme used) and a real URL,
 * but there's nothing live on the other end to complete it until ASTRO
 * ships its own /link callback. ASTRO_BASE_URL is env-configurable so
 * nothing here needs to change once it's deployed for real.
 */
function buildAstroLinkUrl(token) {
  const base = (process.env.ASTRO_BASE_URL || "https://astrocan.io").replace(/\/+$/, "");
  return `${base}/link?token=${token}`;
}

async function handleWebLinkStart(interaction) {
  const token = db.createLinkToken(interaction.guildId, interaction.user.id);
  const url = buildAstroLinkUrl(token);
  await interaction.editReply({
    embeds: [infoEmbed("Connect Your Account", "Click below to connect your Discord account through ASTRO - KOBA's shared identity layer. This link expires in 10 minutes.")],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Connect via ASTRO").setStyle(ButtonStyle.Link).setURL(url))],
  });
}

/**
 * The "I already have a KOBA Bot ID" shortcut - for a player who's already
 * completed the WebRCON-verified link once (in another guild, or previously
 * in this one) and just wants to attach that same proven identity to THIS
 * guild's roster without repeating the online check. The only thing
 * standing in for "proof" here is that boom_id itself is private (shown
 * only to its owner) AND is cross-checked against the CALLER's own
 * discord_id, so knowing someone else's boom_id alone isn't enough to
 * claim their identity.
 */
function completeExistingLinkShortcut(guildId, discordId, boomId, platform) {
  // See completeGamertagLink's matching comment - teams are gone, so this
  // provisions a bare member row itself instead of requiring one to
  // already exist from the now-removed team system.
  db.addMember(guildId, discordId, "Unassigned");

  const identity = db.getBoomIdentity((boomId || "").trim());
  if (!identity) return { outcome: "not_found" };
  if (identity.discord_id !== discordId) return { outcome: "not_yours" };
  if (identity.is_banned) return { outcome: "banned" };
  if (!identity.platform_id) return { outcome: "no_gamertag" };
  if (identity.platform !== platform) return { outcome: "platform_mismatch", actualPlatform: identity.platform };

  const existingOwner = db.getMemberByGamertag(guildId, identity.platform_id);
  if (existingOwner && existingOwner.discord_id !== discordId) {
    return { outcome: "already_linked_guild", teamName: existingOwner.team_name };
  }

  db.setMemberGamertag(guildId, discordId, identity.platform_id);
  db.queueRoleGrant(guildId, discordId, platform);

  return { outcome: "ok", gamertag: identity.platform_id, platform, boomId: identity.boom_id };
}

const EXISTING_SHORTCUT_ERRORS = {
  not_found: "That KOBA Bot ID doesn't exist - double check what you were sent when you first linked, or run `/link start` instead.",
  not_yours: "That KOBA Bot ID isn't tied to this Discord account - run `/link start` instead if this is your first time linking.",
  banned: "This account is banned from KOBA Bot platform-wide and can't link anywhere.",
  no_gamertag: "That KOBA Bot ID doesn't have a Gamertag/PSN linked yet - use `/link start` instead.",
  already_linked_guild: "That Gamertag is already linked to another Discord account on this server.",
};

/**
 * `/link existing` handler - see completeExistingLinkShortcut's header for
 * what this does and why it's safe to skip the online check entirely.
 * `interaction` must already be deferred (ephemeral).
 */
async function handleExistingLinkShortcut(interaction, boomId, platform) {
  const result = completeExistingLinkShortcut(interaction.guildId, interaction.user.id, boomId, platform);

  if (result.outcome === "platform_mismatch") {
    const label = PLATFORM_LABELS[result.actualPlatform] || result.actualPlatform;
    await interaction.editReply({ embeds: [dangerEmbed("Wrong Console", `That KOBA Bot ID is registered as **${label}** - run \`/link existing\` again and pick that instead.`)] });
    return;
  }
  if (result.outcome !== "ok") {
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Link", EXISTING_SHORTCUT_ERRORS[result.outcome] || "Something went wrong - try again.")] });
    return;
  }

  await interaction.editReply({ embeds: [successEmbed("Linked!", `**${result.gamertag}** is now linked on this server too. Your platform role will apply within a minute or so.`)] });
  await getSyncLinkedRole()(interaction.guild, interaction.user.id, true);
}

/** Shared by /unlink and the "Unlink" panel button. `interaction` must already be deferred (ephemeral). */
async function performUnlink(interaction) {
  const identity = db.getBoomIdentityByDiscordId(interaction.user.id);
  if (identity?.is_banned) {
    await interaction.editReply({ embeds: [dangerEmbed("Account Banned", "A banned account can't unlink - this is deliberate, so a ban can't be evaded by unlinking and relinking a new Gamertag.")] });
    return;
  }

  const member = db.getMember(interaction.guildId, interaction.user.id);
  if (!member || !member.gamertag) {
    await interaction.editReply({ embeds: [dangerEmbed("Nothing Linked", "You don't have a Gamertag linked yet.")] });
    return;
  }

  const oldGamertag = member.gamertag;
  db.setMemberGamertag(interaction.guildId, interaction.user.id, null);

  try {
    const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
    for (const roleName of Object.values(PLATFORM_ROLE_NAMES)) {
      const role = guild?.roles.cache.find((r) => r.name === roleName);
      if (role && interaction.member.roles.cache.has(role.id)) await interaction.member.roles.remove(role);
    }
    if (guild) await getSyncLinkedRole()(guild, interaction.user.id, false);
  } catch (err) {
    console.warn("[KOBA Bot] /unlink role removal failed:", err.message);
  }

  await interaction.editReply({ embeds: [successEmbed("Account Unlinked", `**${oldGamertag}** has been unlinked from your Discord account.`)] });
}

function buildGamertagModal(platform) {
  const modal = new ModalBuilder().setCustomId(`link:gamertag_modal:${platform}`).setTitle(`Link ${PLATFORM_LABELS[platform] || platform}`);
  const gamertagInput = new TextInputBuilder()
    .setCustomId("gamertag")
    .setLabel("Your exact Gamertag or Online ID")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(64)
    .setRequired(true)
    .setPlaceholder("Must be online on this server right now");
  modal.addComponents(new ActionRowBuilder().addComponents(gamertagInput));
  return modal;
}

function buildPlatformSelect() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("link:platform_select")
    .setPlaceholder("Choose your platform…")
    .addOptions(PLATFORM_CHOICES.map((c) => ({ label: c.name, value: c.value })));
  return new ActionRowBuilder().addComponents(select);
}

/** Button clicks / select choices in the #link-gamertag panel: "link:open" starts the platform-select step, "link:platform_select" opens the gamertag modal, "link:unlink" runs immediately. */
async function handleComponent(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === "link:platform_select") {
    const platform = interaction.values[0];
    await interaction.showModal(buildGamertagModal(platform));
    return;
  }

  if (!interaction.isButton()) return;
  const action = interaction.customId.split(":")[1];

  if (action === "open") {
    if (!(await requirePremiumOwner(interaction))) return;
    await interaction.reply({
      embeds: [infoEmbed("🔗 Link Your Gamertag", "Pick your platform below, then you'll be asked for your exact Gamertag/Online ID. Make sure you're currently online on this server - that's how we confirm it's really you.")],
      components: [buildPlatformSelect()],
      ephemeral: true,
    });
    return;
  }

  if (action === "unlink") {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;
    await performUnlink(interaction);
    return;
  }
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith("link:gamertag_modal:")) return;
  const platform = interaction.customId.split(":")[2];
  await interaction.deferReply({ ephemeral: true });
  await handleLinkStart(interaction, platform, interaction.fields.getTextInputValue("gamertag"));
}

/**
 * Background tick: applies any role grant queued above as a safety net in
 * case the direct getSyncLinkedRole() call right after linking hit a
 * transient error (rate limit, guild cache miss, etc.) - same idempotent
 * queue /link existing already used before this rework, just no longer the
 * ONLY way a grant gets applied (both link paths now try to apply it live
 * first, immediately, since everything runs in this one bot process).
 */
async function runPendingRoleGrantsTick(client) {
  for (const grant of db.listPendingRoleGrants()) {
    try {
      const guild = client.guilds.cache.get(grant.guild_id) ?? (await client.guilds.fetch(grant.guild_id).catch(() => null));
      const roleName = PLATFORM_ROLE_NAMES[grant.platform];
      const role = roleName ? guild?.roles.cache.find((r) => r.name === roleName) : null;
      if (guild) {
        const member = await guild.members.fetch(grant.discord_id).catch(() => null);
        if (member && role) await member.roles.add(role).catch(() => {});
        if (member) await getSyncLinkedRole()(guild, grant.discord_id, true);
      }
      db.clearRoleGrant(grant.id);
    } catch (err) {
      console.error(`[KOBA Bot] Pending role grant ${grant.id} failed:`, err.message);
      // Leave it queued - a transient hiccup shouldn't silently drop the grant; it'll retry next tick.
    }
  }
}

module.exports = {
  handleLinkStart,
  handleWebLinkStart,
  completeGamertagLink,
  completeExistingLinkShortcut,
  handleExistingLinkShortcut,
  performUnlink,
  handleComponent,
  handleModal,
  runPendingRoleGrantsTick,
  isGamertagOnline,
  PLATFORM_ROLE_NAMES,
  PLATFORM_LABELS,
  PLATFORM_CHOICES,
};

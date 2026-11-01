"use strict";

/**
 * Games Hub (/games-panel deploys it, also auto-deployed to #games during
 * provisioning - see utils/provisioning.js) - a persistent panel with two
 * buttons: Play (everyone) and Configure (staff only, permission-checked at
 * click time rather than hidden, since a non-admin clicking it should get a
 * clear denial rather than a mysteriously missing button).
 *
 * Play walks a player through: which linked server/map (only asked if the
 * guild actually has more than one linked via /add-server) -> which game
 * (config/games.js's registry) -> which mode (only asked if that game
 * supports more than one) -> game-specific setup.
 *
 * Configure walks staff through: which game -> which box -> a menu of
 * settings for that box (bet range/win rate, reward pool, loss-box flag,
 * announce channel, claim delay/message) - entirely button/dropdown driven,
 * no slash commands or typed shortnames anywhere. Reward pickers use
 * Discord's real dropdown components: RoleSelectMenuBuilder for roles,
 * ChannelSelectMenuBuilder for the announce channel, StringSelectMenuBuilder
 * for the small fixed material list and for kits (both short, known lists);
 * Rust items are the one case with too many entries (1200+) for a single
 * dropdown, so that path is a search-modal narrowing down to a dropdown of
 * matches instead of one giant list.
 *
 * In-progress "add reward" state is tracked in an in-memory Map (not the
 * DB) keyed by guildId:userId - short-lived, single-admin-at-a-time flow,
 * cleared on completion. This avoids needing to encode reward-type/
 * reward-ref into customIds (which would risk collisions with characters
 * like ":" that might appear in a kit's display name).
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { GAMES_REGISTRY, getGame } = require("../config/games");
const { LOOTBOX_TYPES, REWARD_TYPE_CHOICES } = require("../config/lootboxes");
const { getItemByShortName, searchItems } = require("../config/rustItems");
const { MATERIAL_FIELDS, MATERIAL_LABELS, MATERIAL_ICONS, MATERIAL_EMOJI } = require("../config/materials");
const { rollLootbox } = require("./lootboxPanel");
const defuseWire = require("./defuseWire");
const gridMinefield = require("./gridMinefield");
const towerClimb = require("./towerClimb");
const vaultHeist = require("./vaultHeist");
const scrapMerchant = require("./scrapMerchant");
const ticketJackpot = require("./ticketJackpot");
const bradleyAmbush = require("./bradleyAmbush");
const recyclerRoulette = require("./recyclerRoulette");
const targetRange = require("./targetRange");
const treasureSlots = require("./treasureSlots");
const cargoShipHeist = require("./cargoShipHeist");
const coordEventsPanel = require("./coordEventsPanel");
const path = require("path");

const DEFAULT_SERVER_VALUE = "__default__";
const draftState = new Map(); // "guildId:userId" -> { boxKey, rewardType, rewardRef, displayName, imageUrl }

function draftKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Quick Setup (2026-09-06) - "auto-configure bets/rewards with one button"
 * for server owners who don't want to walk the full per-box Configure flow.
 * Auto-fills bet ranges/currency for every game (safe - just numbers), and
 * offers to seed Lootbox reward pools with kits/roles/items/materials the
 * ADMIN explicitly picks here first - deliberately NOT a guess-and-fill on
 * roles or raw Rust items (no safe default exists for "which role/item
 * belongs in a reward pool"), per explicit decision to make this a short
 * picker instead of fully automatic for those two reward types.
 * NEVER overwrites a game/box that's already configured (existing
 * settings) or already has rewards - Quick Setup only fills in gaps, it
 * doesn't reset anything an admin already set up manually.
 */
const quickSetupDraft = new Map(); // draftKey -> { kits: bool, items: bool, materials: bool }

function getQuickSetupDraft(guildId, userId) {
  const key = draftKey(guildId, userId);
  if (!quickSetupDraft.has(key)) quickSetupDraft.set(key, { kits: true, items: true, materials: true });
  return quickSetupDraft.get(key);
}

function toggleButton(customId, label, on, disabled) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(`${on ? "✅" : "⬜"} ${label}`)
    .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(disabled);
}

/**
 * REDESIGNED (2026-09-06) per explicit feedback: the original version made
 * admins hand-pick individual kits/roles/items via select menus + a modal -
 * "easy setup" should mean toggles, not a shopping list. Roles are still
 * left out entirely (no safe "registered roles" catalog exists to draw
 * from, unlike kits/items below), everything else is now just an ON/OFF
 * switch pulling from what the guild ALREADY has registered:
 *  - Kits: every kit_registry entry (from /kit-panel)
 *  - Shop Items: every raw-item shop_products entry (from /shop-panel) -
 *    reused as the "known good items" pool instead of guessing shortnames
 *  - Materials: the fixed 4-entry crafting materials list, always available
 */
function quickSetupView(guildId, userId) {
  const draft = getQuickSetupDraft(guildId, userId);
  const kitCount = db.listKits(guildId).length;
  const itemCount = db.listAllItemProducts(guildId).length;

  const embed = infoEmbed(
    "⚡ Quick Setup",
    "One press sets bet ranges + currency for Lootbox, The Defuse Wire, The Grid Minefield, Tower Climb, and The Recycler Roulette, picks a loss box if none is set, and fills every Lootbox tier with rewards - scaled from the easiest/cheapest box (common rewards, high win rate) to the hardest/priciest (same rewards, low win rate). Never overwrites anything already configured.\n\n" +
      `**Registered Kits:** ${kitCount ? `${kitCount} found` : "none registered yet - see /kit-panel"}\n` +
      `**Shop Items:** ${itemCount ? `${itemCount} found` : "none in your Shop yet - see /shop-panel"}\n` +
      `**Crafting Materials:** always available (${MATERIAL_FIELDS.length} fixed types)\n\n` +
      "_Scrap Merchant, Jackpot, Target Range, Bradley Ambush, Cargo Ship Heist, and The Co-op Vault Heist each need their own item catalog or loot table - set those up in **Configure** instead._"
  );

  const toggleRow = new ActionRowBuilder().addComponents(
    toggleButton("gamespanel:qs_toggle_kits", "Kits", draft.kits, kitCount === 0),
    toggleButton("gamespanel:qs_toggle_items", "Shop Items", draft.items, itemCount === 0),
    toggleButton("gamespanel:qs_toggle_materials", "Materials", draft.materials, false)
  );
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:qs_confirm").setLabel("Auto-Configure").setEmoji("⚡").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [toggleRow, actionRow, backRow("gamespanel:back_to_hub")] };
}

const QUICK_SETUP_DEFAULT_CURRENCY_NAME = "Coins";
const QUICK_SETUP_DEFAULT_CURRENCY_EMOJI = "🪙";
const QUICK_SETUP_REWARD_WEIGHT = 10;
const QUICK_SETUP_MAX_WIN_RATE = 70; // easiest/cheapest tier
const QUICK_SETUP_MIN_WIN_RATE = 15; // hardest/priciest tier
// "Black Lucky Box" - the obvious thematic "bad luck" pick, and what real
// customers have independently chosen on their own servers anyway.
const QUICK_SETUP_DEFAULT_LOSS_BOX_KEY = "black";

/**
 * The actual auto-configure - only ever ADDS missing settings/rewards, never
 * touches anything already configured. Returns a summary of what changed,
 * for the confirmation embed.
 */
function applyQuickSetup(guildId, userId) {
  const draft = getQuickSetupDraft(guildId, userId);
  const changes = [];

  let currency = db.listCurrencies(guildId)[0];
  if (!currency) {
    currency = db.createCurrency(guildId, QUICK_SETUP_DEFAULT_CURRENCY_NAME, QUICK_SETUP_DEFAULT_CURRENCY_EMOJI);
    changes.push(`Created default currency **${QUICK_SETUP_DEFAULT_CURRENCY_EMOJI} ${QUICK_SETUP_DEFAULT_CURRENCY_NAME}**.`);
  }

  if (!db.getGuildMeta(guildId)?.lootbox_loss_box_key) {
    db.upsertGuildMeta(guildId, { lootbox_loss_box_key: QUICK_SETUP_DEFAULT_LOSS_BOX_KEY });
    const lossLabel = LOOTBOX_TYPES.find((b) => b.key === QUICK_SETUP_DEFAULT_LOSS_BOX_KEY)?.label || QUICK_SETUP_DEFAULT_LOSS_BOX_KEY;
    changes.push(`Set **${lossLabel}** as the loss box (shows whenever any roll loses).`);
  }

  const rewardEntries = [];
  if (draft.kits) for (const kit of db.listKits(guildId)) rewardEntries.push({ rewardType: "kit", rewardRef: kit.display_name, displayName: kit.display_name });
  if (draft.items) for (const item of db.listAllItemProducts(guildId)) rewardEntries.push({ rewardType: "item", rewardRef: item.item_short_name, displayName: item.display_name });
  if (draft.materials) for (const material of MATERIAL_FIELDS) rewardEntries.push({ rewardType: "material", rewardRef: material, displayName: MATERIAL_LABELS[material] });

  // Easiest (cheapest suggestedCost) -> hardest (priciest) - win rate
  // descends linearly across tiers, since that's the one lever players
  // actually feel; reward CONTENTS stay identical across every tier (the
  // bot has no reliable way to rank an arbitrary kit/item's rarity to
  // justify giving different tiers different pools).
  const orderedBoxes = [...LOOTBOX_TYPES].sort((a, b) => (a.suggestedCost || 0) - (b.suggestedCost || 0));
  let boxesConfigured = 0;
  let boxesSeeded = 0;
  orderedBoxes.forEach((box, i) => {
    const winRate =
      orderedBoxes.length > 1
        ? Math.round(QUICK_SETUP_MAX_WIN_RATE - ((QUICK_SETUP_MAX_WIN_RATE - QUICK_SETUP_MIN_WIN_RATE) * i) / (orderedBoxes.length - 1))
        : QUICK_SETUP_MAX_WIN_RATE;
    if (!db.getLootboxSettings(guildId, box.key)) {
      const cost = box.suggestedCost || 100;
      db.setLootboxSettings(guildId, box.key, currency.id, Math.max(1, Math.round(cost * 0.5)), Math.round(cost * 2), winRate);
      boxesConfigured++;
    }
    if (rewardEntries.length && db.listLootboxRewards(guildId, box.key).length === 0) {
      for (const entry of rewardEntries) db.addLootboxReward(guildId, box.key, { ...entry, amount: 1, weight: QUICK_SETUP_REWARD_WEIGHT });
      boxesSeeded++;
    }
  });
  if (boxesConfigured) changes.push(`Set bet range + win rate (**${QUICK_SETUP_MAX_WIN_RATE}%** easiest → **${QUICK_SETUP_MIN_WIN_RATE}%** hardest) for **${boxesConfigured}** lootbox tier(s) that had no settings yet.`);
  if (boxesSeeded) changes.push(`Seeded **${boxesSeeded}** lootbox tier(s) with **${rewardEntries.length}** reward(s) each (had empty reward pools).`);
  if (!rewardEntries.length) changes.push("No kits/items/materials were toggled on (or none exist yet) - reward pools were left empty.");

  if (!db.getDefuseWireSettings(guildId)) {
    db.setDefuseWireSettings(guildId, currency.id, 10, 500);
    changes.push("Set The Defuse Wire's bet range to **10-500**.");
  }
  if (!db.getGridMinefieldSettings(guildId)) {
    db.setGridMinefieldSettings(guildId, currency.id, 10, 500);
    changes.push("Set The Grid Minefield's bet range to **10-500**.");
  }
  if (!db.getTowerClimbSettings(guildId)) {
    db.setTowerClimbSettings(guildId, currency.id, 10, 500);
    changes.push("Set Tower Climb's bet range to **10-500**.");
  }
  // Same currency+bet-range shape as the 3 games above - was simply missed
  // when Quick Setup was first built, not deliberately excluded.
  if (!db.getRecyclerRouletteSettings(guildId)) {
    db.setRecyclerRouletteSettings(guildId, currency.id, 10, 500);
    changes.push("Set The Recycler Roulette's bet range to **10-500**.");
  }

  // Scrap Merchant, Jackpot, Target Range, Bradley Ambush, Cargo Ship Heist,
  // and The Co-op Vault Heist are deliberately NOT auto-filled here - each
  // needs an item catalog, loot table, or multi-field setup with no safe
  // guessed default, same reasoning Quick Setup already uses for role
  // rewards. Left for Configure.
  changes.push("Scrap Merchant, Jackpot, Target Range, Bradley Ambush, Cargo Ship Heist, and The Co-op Vault Heist need their own setup in **Configure** - no safe one-click default exists for their item catalogs/loot tables.");

  return { changes, currency };
}

/**
 * Reset (2026-09-07) - "server owner chooses per game or all, clears every
 * reward/config for the chosen game(s) back to unconfigured". Two-step
 * confirm (select -> confirm/cancel) since this is destructive and
 * irreversible, same pattern as /manage-licenses' revoke flow.
 */
const RESET_TARGETS = [
  { key: "lootbox", label: "Lootbox", reset: (guildId) => db.resetLootboxConfig(guildId) },
  { key: "defuse_wire", label: "The Defuse Wire", reset: (guildId) => db.resetDefuseWireConfig(guildId) },
  { key: "grid_minefield", label: "The Grid Minefield", reset: (guildId) => db.resetGridMinefieldConfig(guildId) },
  { key: "tower_climb", label: "Tower Climb", reset: (guildId) => db.resetTowerClimbConfig(guildId) },
  { key: "vault_heist", label: "The Co-op Vault Heist", reset: (guildId) => db.resetVaultHeistConfig(guildId) },
  { key: "scrap_merchant", label: "The Scrap Merchant", reset: (guildId) => db.resetScrapMerchantConfig(guildId) },
  { key: "jackpot", label: "The Ticket Jackpot", reset: (guildId) => db.resetJackpotConfig(guildId) },
  { key: "recycler_roulette", label: "The Recycler Roulette", reset: (guildId) => db.resetRecyclerRouletteConfig(guildId) },
  { key: "target_range", label: "The Target Range", reset: (guildId) => db.resetTargetRangeConfig(guildId) },
  { key: "bradley_ambush", label: "The Bradley APC Ambush", reset: (guildId) => db.resetBradleyAmbushConfig(guildId) },
  { key: "cargo_ship_heist", label: "Cargo Ship Heist", reset: (guildId) => db.resetCargoShipHeistConfig(guildId) },
  { key: "all", label: "ALL Games", reset: (guildId) => RESET_TARGETS.filter((t) => t.key !== "all").forEach((t) => t.reset(guildId)) },
];

function resetSelectView() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:reset_select")
    .setPlaceholder("Which game's config do you want to wipe?")
    .addOptions(RESET_TARGETS.map((t) => ({ label: t.label, value: t.key })));
  return {
    embeds: [dangerEmbed("Reset Game Config", "Pick a game to wipe its settings + reward pools back to unconfigured. This can't be undone - you'll confirm on the next step.")],
    components: [new ActionRowBuilder().addComponents(menu), backRow("gamespanel:back_to_hub")],
  };
}

function resetConfirmView(targetKey) {
  const target = RESET_TARGETS.find((t) => t.key === targetKey);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gamespanel:reset_confirm:${targetKey}`).setLabel(`Yes, Wipe ${target.label}`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("gamespanel:reset_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [dangerEmbed("Are You Sure?", `This permanently deletes **${target.label}**'s bet ranges, win rates, and every reward it had configured. Players' actual items/coins already won are NOT touched.`)],
    components: [row],
  };
}

/** Configure is restricted to the actual server owner or Administrator permission - tighter than "Manage Server" (which a mod role could plausibly also have), per explicit decision that only true admins/the owner should be able to reconfigure games. */
function requireManageGuild(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function backRow(customId, label = "⬅️ Back") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary));
}

// ---------------------------------------------------------------------------
// Hub + deploy
// ---------------------------------------------------------------------------

function buildHub() {
  const embed = infoEmbed(
    "🎮 Games",
    "Press **Play** to wager coins on a game. Staff can press **Configure** to set up games, **Quick Setup** to auto-configure bets/rewards in one step, or **Reset** to wipe a game's config and start over."
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:play").setLabel("Play").setEmoji("🎮").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gamespanel:configure").setLabel("Configure").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gamespanel:quick_setup").setLabel("Quick Setup").setEmoji("⚡").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gamespanel:reset_menu").setLabel("Reset").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  // Per-guild access control (2026-09-19, explicit user request) - separate
  // row/flow from Configure (bet/currency settings) since it applies
  // uniformly to every game, including ones with no dedicated Configure
  // menu at all (Lootbox).
  const accessRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:access").setLabel("Game Access (Enable/Role)").setEmoji("🔐").setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [row, accessRow] };
}

/** Posts (or re-edits) the persistent Games Panel, same idempotent-by-stored-message-id pattern as utils/tickets.js's deployTicketPanel. */
async function deployGamesPanel(channel) {
  const payload = buildHub();
  const meta = db.getGuildMeta(channel.guild.id);
  if (meta?.games_panel_message_id) {
    try {
      const existing = await channel.messages.fetch(meta.games_panel_message_id);
      await existing.edit(payload);
      if (!existing.pinned) await existing.pin().catch(() => {});
      return existing;
    } catch {
      // message was deleted - fall through and repost
    }
  }
  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  db.upsertGuildMeta(channel.guild.id, { games_panel_channel_id: channel.id, games_panel_message_id: message.id });
  return message;
}

// ---------------------------------------------------------------------------
// Play flow
// ---------------------------------------------------------------------------

function serverSelectRow(guildId) {
  const servers = db.listGuildServers(guildId);
  const options = [{ label: "Default connection", value: DEFAULT_SERVER_VALUE }, ...servers.map((s) => ({ label: s.server_name, value: s.server_name }))];
  const menu = new StringSelectMenuBuilder().setCustomId("gamespanel:server_select").setPlaceholder("Which server?").addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

/** `includeConfigureOnly` lets the Configure flow's dropdown list ambient/event games (e.g. The Co-op Vault Heist) that players don't "pick" from the Play flow - that call passes true; every Play-flow call leaves it false. */
function gameSelectRow(customId, includeConfigureOnly = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Which game?")
    .addOptions(
      GAMES_REGISTRY.filter((g) => g.enabled && (includeConfigureOnly || !g.configureOnly)).map((g) => ({ label: g.label, description: g.description.slice(0, 100), value: g.key, emoji: g.emoji || undefined }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

/** Re-render of the "choose a game" step - shared by the initial Play flow entry AND used as the target for Back buttons on every step past it, so there's always a way back instead of a dead-end menu. */
function gameSelectView(server) {
  return {
    embeds: [infoEmbed("Games", "Choose a game:")],
    components: [gameSelectRow(`gamespanel:game_select:${server}`), backRow("gamespanel:back_to_hub")],
  };
}

/** True if this member is allowed to play this game right now - both the game_settings enable toggle AND the optional role requirement must pass. Code-level GAMES_REGISTRY.enabled is checked separately by callers (it's a bot-wide kill switch, not a per-guild setting). */
function memberCanPlay(guildId, member, gameKey) {
  const settings = db.getGameSettings(guildId, gameKey);
  if (!settings.enabled) return false;
  if (settings.required_role_id && !member.roles.cache.has(settings.required_role_id)) return false;
  return true;
}

/**
 * Play flow step, added 2026-09-19 per explicit user request: "users click
 * play then they need to choose single player or multiplayer then choose
 * the game." No entry in config/games.js's GAMES_REGISTRY lists
 * "multiplayer" in its `modes` (every wager game here is solo; the
 * configureOnly ambient events like vault_heist are admin-triggered, not
 * player-picked), so picking Multiplayer today always shows an empty list
 * from THIS menu - not a bug, just means no registry game fills that slot
 * yet. Real 1v1 player-vs-player play already exists outside this panel
 * via /challenge (utils/challengeEngine.js) - filteredGameSelectView's
 * empty-multiplayer message points players there instead of leaving them
 * at a dead end.
 */
function modeFirstSelectView(server) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gamespanel:play_mode:${server}:solo`).setLabel("Solo").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gamespanel:play_mode:${server}:multiplayer`).setLabel("Multiplayer").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [infoEmbed("Games", "Solo or multiplayer?")], components: [row, backRow("gamespanel:back_to_hub")] };
}

/** Game list filtered by: supports the chosen mode, code-level enabled, guild-level enabled, and the player's role (if one's required) - "only the correct games show for that role" per explicit user request. */
function filteredGameSelectView(server, mode, member) {
  const guildId = member.guild.id;
  const options = GAMES_REGISTRY.filter((g) => g.enabled && !g.configureOnly && g.modes.includes(mode) && memberCanPlay(guildId, member, g.key)).map((g) => ({
    label: g.label,
    description: g.description.slice(0, 100),
    value: g.key,
    emoji: g.emoji || undefined,
  }));
  if (!options.length) {
    return {
      embeds: [infoEmbed("Games", mode === "multiplayer" ? "No multiplayer games are in this menu yet - but you can send a real 1v1 wagered duel right now with `/challenge`." : "No games are available to you right now.")],
      components: [backRow(`gamespanel:play_back_mode:${server}`)],
    };
  }
  const menu = new StringSelectMenuBuilder().setCustomId(`gamespanel:game_select:${server}`).setPlaceholder("Which game?").addOptions(options);
  return { embeds: [infoEmbed("Games", "Choose a game:")], components: [new ActionRowBuilder().addComponents(menu), backRow(`gamespanel:play_back_mode:${server}`)] };
}

// ---------------------------------------------------------------------------
// Per-guild Game Access (enable/disable + role requirement) - see
// schema.sql's game_settings header. Separate from the per-game Configure
// menus (bet ranges/currency) since it's the same 2 controls for every
// game uniformly, including ones with no Configure menu of their own.
// ---------------------------------------------------------------------------

function accessGameSelectView() {
  return {
    embeds: [infoEmbed("Game Access", "Pick a game to enable/disable it or require a role to play it.")],
    components: [gameSelectRow("gamespanel:access_game_select", true), backRow("gamespanel:back_to_hub")],
  };
}

function accessEditorView(guildId, gameKey) {
  const game = getGame(gameKey);
  const settings = db.getGameSettings(guildId, gameKey);
  const embed = infoEmbed(
    `Access: ${game.label}`,
    `**Status:** ${settings.enabled ? "🟢 Enabled" : "🔴 Disabled"}\n**Role Requirement:** ${settings.required_role_id ? `<@&${settings.required_role_id}>` : "Everyone"}`
  );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gamespanel:access_toggle:${gameKey}`).setLabel(settings.enabled ? "Disable" : "Enable").setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`gamespanel:access_role:${gameKey}`).setPlaceholder("Role Requirement (optional)"));
  return { embeds: [embed], components: [row1, row2, backRow("gamespanel:access")] };
}

function modeSelectRow(server, gameKey, modes) {
  const buttons = modes.map((m) => new ButtonBuilder().setCustomId(`gamespanel:mode_pick:${server}:${gameKey}:${m}`).setLabel(m === "solo" ? "Solo" : "Multiplayer").setStyle(ButtonStyle.Primary));
  return new ActionRowBuilder().addComponents(buttons);
}

async function startGameSetup(interaction, server, gameKey) {
  const game = getGame(gameKey);
  if (!game) {
    await interaction.update({ embeds: [dangerEmbed("Unknown Game", "That game isn't available.")], components: [] });
    return;
  }

  if (game.modes.length > 1) {
    await interaction.update({ embeds: [infoEmbed(game.label, "Choose a mode:")], components: [modeSelectRow(server, gameKey, game.modes), backRow(`gamespanel:play_back_games:${server}`)] });
    return;
  }

  if (gameKey === "defuse_wire") {
    await defuseWire.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "grid_minefield") {
    await gridMinefield.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "tower_climb") {
    await towerClimb.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "scrap_merchant") {
    await scrapMerchant.showInventory(interaction, server);
    return;
  }

  if (gameKey === "jackpot") {
    await ticketJackpot.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "recycler_roulette") {
    await recyclerRoulette.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "target_range") {
    await targetRange.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "treasure_slots") {
    await treasureSlots.startOrResume(interaction, server);
    return;
  }

  if (gameKey === "lootbox") {
    const guildId = interaction.guildId;
    const lossBoxKey = db.getGuildMeta(guildId)?.lootbox_loss_box_key || null;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`gamespanel:lootbox_box:${server}`)
      .setPlaceholder("Which box?")
      .addOptions(LOOTBOX_TYPES.filter((b) => b.key !== lossBoxKey).map((b) => ({ label: b.label, value: b.key })));
    await interaction.update({
      embeds: [infoEmbed("Lootbox", "Choose a box:")],
      components: [new ActionRowBuilder().addComponents(menu), backRow(`gamespanel:play_back_games:${server}`)],
    });
    return;
  }

  await interaction.update({ embeds: [dangerEmbed("Not Implemented", `${game.label} doesn't have a setup flow yet.`)], components: [] });
}

// ---------------------------------------------------------------------------
// Configure flow
// ---------------------------------------------------------------------------

/** One game, one setting to configure - unlike Lootbox's per-box reward pool, the wire ratio/multiplier are fixed game rules (see schema.sql), so there's nothing else here yet. */
function defuseWireAdminMenu(guildId) {
  const settings = db.getDefuseWireSettings(guildId);
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name}**\nBet range: **${settings.min_bet} - ${settings.max_bet}**`
    : "_Not set up yet - players can't play until this is configured._";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_dw_set_bet").setLabel("Set Bet & Currency").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gamecurrency:manage:defuse_wire").setLabel("🪙 Manage Currencies").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: The Defuse Wire", status)], components: [row, backRow("gamespanel:cfg_back_to_game_select")] };
}

function defuseWireSetBetModal(guildId) {
  const settings = db.getDefuseWireSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_dw_set_bet_modal").setTitle("Set Bet Range & Currency");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) currencyInput.setValue(settings.currency_name);
  const minInput = new TextInputBuilder().setCustomId("min_bet").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) minInput.setValue(String(settings.min_bet));
  const maxInput = new TextInputBuilder().setCustomId("max_bet").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) maxInput.setValue(String(settings.max_bet));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

/** Same shape as defuseWireAdminMenu - one game, one setting (currency/bet range), fixed grid/trap/multiplier rules not admin-configurable. */
function gridMinefieldAdminMenu(guildId) {
  const settings = db.getGridMinefieldSettings(guildId);
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name}**\nBet range: **${settings.min_bet} - ${settings.max_bet}**`
    : "_Not set up yet - players can't play until this is configured._";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_gm_set_bet").setLabel("Set Bet & Currency").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gamecurrency:manage:grid_minefield").setLabel("🪙 Manage Currencies").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: The Grid Minefield", status)], components: [row, backRow("gamespanel:cfg_back_to_game_select")] };
}

function gridMinefieldSetBetModal(guildId) {
  const settings = db.getGridMinefieldSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_gm_set_bet_modal").setTitle("Set Bet Range & Currency");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) currencyInput.setValue(settings.currency_name);
  const minInput = new TextInputBuilder().setCustomId("min_bet").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) minInput.setValue(String(settings.min_bet));
  const maxInput = new TextInputBuilder().setCustomId("max_bet").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) maxInput.setValue(String(settings.max_bet));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

/** Same shape as defuseWireAdminMenu/gridMinefieldAdminMenu - one game, one setting (currency/bet range), fixed floor risk/multiplier progression not admin-configurable (see utils/towerClimb.js's FLOOR_RISK/FLOOR_MULTIPLIER comment). */
function towerClimbAdminMenu(guildId) {
  const settings = db.getTowerClimbSettings(guildId);
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name}**\nBet range: **${settings.min_bet} - ${settings.max_bet}**`
    : "_Not set up yet - players can't play until this is configured._";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_tc_set_bet").setLabel("Set Bet & Currency").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gamecurrency:manage:tower_climb").setLabel("🪙 Manage Currencies").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: Tower Climb", status)], components: [row, backRow("gamespanel:cfg_back_to_game_select")] };
}

function towerClimbSetBetModal(guildId) {
  const settings = db.getTowerClimbSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_tc_set_bet_modal").setTitle("Set Bet Range & Currency");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) currencyInput.setValue(settings.currency_name);
  const minInput = new TextInputBuilder().setCustomId("min_bet").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) minInput.setValue(String(settings.min_bet));
  const maxInput = new TextInputBuilder().setCustomId("max_bet").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) maxInput.setValue(String(settings.max_bet));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

/** Same shape as defuseWireAdminMenu - one game, one setting (currency/bet range), fixed tier odds/multipliers not admin-configurable (same "keep the house edge consistent" reasoning as Tower Climb's FLOOR_RISK/FLOOR_MULTIPLIER). */
function recyclerRouletteAdminMenu(guildId) {
  const settings = db.getRecyclerRouletteSettings(guildId);
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name}**\nBet range: **${settings.min_bet} - ${settings.max_bet}**`
    : "_Not set up yet - players can't play until this is configured._";
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_rr_set_bet").setLabel("Set Bet & Currency").setStyle(ButtonStyle.Primary));
  return { embeds: [infoEmbed("Configure: The Recycler Roulette", status)], components: [row, backRow("gamespanel:cfg_back_to_game_select")] };
}

function recyclerRouletteSetBetModal(guildId) {
  const settings = db.getRecyclerRouletteSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_rr_set_bet_modal").setTitle("Set Bet Range & Currency");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) currencyInput.setValue(settings.currency_name);
  const minInput = new TextInputBuilder().setCustomId("min_bet").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) minInput.setValue(String(settings.min_bet));
  const maxInput = new TextInputBuilder().setCustomId("max_bet").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings) maxInput.setValue(String(settings.max_bet));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
  return modal;
}

/** Split across 2 modals (currency+fee+grid, then round timing+loot table) - Discord's 5-text-input modal cap can't fit all 6 Target Range settings in one, same reasoning as utils/vaultHeist.js's rewardsModal/combatModal split. */
function targetRangeAdminMenu(guildId) {
  const settings = db.getTargetRangeSettings(guildId);
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name}**\nEntry fee: **${settings.entry_fee}**\nGrid: **${settings.grid_size}x${settings.grid_size}**\n` +
      `Shuffle every **${settings.shuffle_interval_ms}ms**, round **${settings.round_seconds}s**\nLoot table: **${settings.loot_table}**`
    : "_Not set up yet - players can't play until this is configured._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_tr_set_entry").setLabel("Set Entry & Grid").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_tr_set_round").setLabel("Set Round & Loot").setStyle(ButtonStyle.Secondary));
  return { embeds: [infoEmbed("Configure: The Target Range", status)], components: [row1, row2, backRow("gamespanel:cfg_back_to_game_select")] };
}

function targetRangeEntryModal(guildId) {
  const settings = db.getTargetRangeSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_tr_entry_modal").setTitle("Entry & Grid");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  if (settings?.currency_name) currencyInput.setValue(settings.currency_name);
  const feeInput = new TextInputBuilder().setCustomId("entry_fee").setLabel("Entry fee").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.entry_fee ?? 20));
  const gridInput = new TextInputBuilder().setCustomId("grid_size").setLabel("Grid size (3 or 4)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.grid_size ?? 3));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(feeInput), new ActionRowBuilder().addComponents(gridInput));
  return modal;
}

function targetRangeRoundModal(guildId) {
  const settings = db.getTargetRangeSettings(guildId);
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_tr_round_modal").setTitle("Round Timing & Loot Table");
  const shuffleInput = new TextInputBuilder().setCustomId("shuffle_ms").setLabel("Shuffle interval (ms)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.shuffle_interval_ms ?? 1500));
  const roundInput = new TextInputBuilder().setCustomId("round_seconds").setLabel("Round length (seconds)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(settings?.round_seconds ?? 30));
  const lootInput = new TextInputBuilder()
    .setCustomId("loot_table")
    .setLabel("minScore:payout CSV (e.g. 0:0,10:50,25:150)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setValue(settings?.loot_table ?? "0:0,10:50,25:150,50:400");
  modal.addComponents(new ActionRowBuilder().addComponents(shuffleInput), new ActionRowBuilder().addComponents(roundInput), new ActionRowBuilder().addComponents(lootInput));
  return modal;
}

/** Unlike the wager games, Scrap Merchant has a small item catalog on top of the single currency/rate settings - the settings half mirrors defuseWireAdminMenu, the catalog half mirrors boxAdminMenu's Add/Remove/List reward buttons. */
function scrapMerchantAdminMenu(guildId) {
  const settings = db.getScrapMerchantSettings(guildId);
  const itemCount = db.listScrapItems(guildId).length;
  const status = settings
    ? `Currency: **${settings.currency_emoji || ""} ${settings.currency_name || "_not set_"}**\nDrop chance: **${settings.drop_chance_pct}%** per win\nMax inventory: **${settings.max_inventory_items}** items\nCatalog: **${itemCount}** item type(s)`
    : `_Not set up yet - players can't sell until this is configured._\nCatalog: **${itemCount}** item type(s)`;
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_scrap_set_settings").setLabel("Set Currency & Rates").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_scrap_add_item").setLabel("Add Item").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gamespanel:cfg_scrap_remove_item").setLabel("Remove Item").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("gamespanel:cfg_scrap_list_items").setLabel("List Items").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed("Configure: The Scrap Merchant", status)], components: [row1, row2, backRow("gamespanel:cfg_back_to_game_select")] };
}

/** Currency picker for Scrap Merchant settings - a dropdown of this guild's actual configured currencies (see /shop-panel) instead of free-typing a name that has to match exactly. */
function scrapCurrencySelectRow(guildId) {
  const currencies = db.listCurrencies(guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_scrap_currency_select")
    .setPlaceholder("Which currency?")
    .addOptions(currencies.slice(0, 25).map((c) => ({ label: c.name, value: String(c.id), emoji: c.emoji || undefined })));
  return new ActionRowBuilder().addComponents(menu);
}

/** Second step of Set Currency & Rates, after a currency's been picked via the dropdown above - just the two numeric settings left. currencyId is threaded through the customId since modals can't carry extra state themselves. */
function scrapMerchantRatesModal(guildId, currencyId) {
  const settings = db.getScrapMerchantSettings(guildId);
  const modal = new ModalBuilder().setCustomId(`gamespanel:cfg_scrap_rates_modal:${currencyId}`).setTitle("Scrap Merchant Rates");
  const dropInput = new TextInputBuilder().setCustomId("drop_chance").setLabel("Drop chance % per game win").setStyle(TextInputStyle.Short).setRequired(true);
  dropInput.setValue(String(settings?.drop_chance_pct ?? 10));
  const capInput = new TextInputBuilder().setCustomId("max_inventory").setLabel("Max items a player can hold").setStyle(TextInputStyle.Short).setRequired(true);
  capInput.setValue(String(settings?.max_inventory_items ?? 50));
  modal.addComponents(new ActionRowBuilder().addComponents(dropInput), new ActionRowBuilder().addComponents(capInput));
  return modal;
}

/** What kind of item is this - a real Rust item (searched, same catalog Lootbox rewards use) or one of the small fixed set of crafting materials. Mirrors rewardTypeSelectRow's item/material split. */
function scrapItemTypeSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_scrap_item_type")
    .setPlaceholder("What kind of item?")
    .addOptions(
      { label: "Rust item", value: "item" },
      { label: "Crafting material", value: "material" }
    );
  return new ActionRowBuilder().addComponents(menu);
}

function scrapMaterialSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_scrap_pick_material")
    .setPlaceholder("Which material?")
    .addOptions(Object.entries(MATERIAL_LABELS).map(([value, label]) => ({ label, value, emoji: MATERIAL_EMOJI[value] || undefined })));
  return new ActionRowBuilder().addComponents(menu);
}

function scrapItemSearchModal() {
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_scrap_item_search_modal").setTitle("Search Rust Items");
  const queryInput = new TextInputBuilder().setCustomId("query").setLabel("Item name").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(queryInput));
  return modal;
}

/** Final step, after the item/material's already picked via dropdown/search - just price and drop weight left, name/emoji come pre-filled from the selection (still editable, in case the auto-picked emoji/name isn't quite right). */
function scrapItemDetailsModal(defaults) {
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_scrap_item_details_modal").setTitle("Scrap Item Details");
  const nameInput = new TextInputBuilder().setCustomId("name").setLabel("Name shown to players").setStyle(TextInputStyle.Short).setRequired(true).setValue(defaults.displayName.slice(0, 100));
  const emojiInput = new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setRequired(false);
  if (defaults.emoji) emojiInput.setValue(defaults.emoji);
  const priceInput = new TextInputBuilder().setCustomId("price").setLabel("Price - a number, or min-max (e.g. 10-30)").setStyle(TextInputStyle.Short).setRequired(true);
  const weightInput = new TextInputBuilder().setCustomId("weight").setLabel("Drop weight (higher = more common)").setStyle(TextInputStyle.Short).setRequired(true).setValue("1");
  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(emojiInput),
    new ActionRowBuilder().addComponents(priceInput),
    new ActionRowBuilder().addComponents(weightInput)
  );
  return modal;
}

function boxAdminMenu(boxKey) {
  const boxLabel = LOOTBOX_TYPES.find((b) => b.key === boxKey)?.label || boxKey;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gamespanel:cfg_set_bet:${boxKey}`).setLabel("Set Bet").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gamespanel:cfg_add_reward:${boxKey}`).setLabel("Add Reward").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gamespanel:cfg_remove_reward:${boxKey}`).setLabel("Remove Reward").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`gamespanel:cfg_list:${boxKey}`).setLabel("List Rewards").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gamespanel:cfg_set_loss:${boxKey}`).setLabel("Set As Loss Box").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gamespanel:cfg_set_channel:${boxKey}`).setLabel("Set Announce Channel").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gamespanel:cfg_set_claim:${boxKey}`).setLabel("Set Claim Settings").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [infoEmbed(`Configure: ${boxLabel}`, "Pick a setting to change.")], components: [row1, row2, backRow("gamespanel:cfg_back_to_box_select")] };
}

/** Re-render of Configure's "choose a game" step - shared by the initial Configure button click AND every per-game admin menu's Back button, so there's never a configure dead-end either. */
function configureGameSelectView() {
  return { embeds: [infoEmbed("Configure Games", "Choose a game:")], components: [gameSelectRow("gamespanel:cfg_game_select", true), backRow("gamespanel:back_to_hub")] };
}

/** Re-render of Lootbox's "choose a box" step - the Back target for boxAdminMenu. */
function lootboxBoxSelectView() {
  const menu = new StringSelectMenuBuilder().setCustomId("gamespanel:cfg_box_select").setPlaceholder("Which box?").addOptions(LOOTBOX_TYPES.map((b) => ({ label: b.label, value: b.key })));
  return { embeds: [infoEmbed("Lootbox", "Choose a box to configure:")], components: [new ActionRowBuilder().addComponents(menu), backRow("gamespanel:cfg_back_to_game_select")] };
}

function rewardTypeSelectRow(boxKey) {
  const menu = new StringSelectMenuBuilder().setCustomId(`gamespanel:cfg_reward_type:${boxKey}`).setPlaceholder("What kind of reward?").addOptions(REWARD_TYPE_CHOICES.map((c) => ({ label: c.name, value: c.value })));
  return new ActionRowBuilder().addComponents(menu);
}

/** Fills in display_name/image_url from known item/material data - same logic the old slash command used, kept here since the panel flow needs it too. */
function resolveDisplay(rewardType, rewardRef, guild) {
  if (rewardType === "item") {
    const item = getItemByShortName(rewardRef);
    return { displayName: item?.name || rewardRef, imageUrl: item?.image || null };
  }
  if (rewardType === "material") {
    const icon = MATERIAL_ICONS[rewardRef];
    return { displayName: MATERIAL_LABELS[rewardRef] || rewardRef, imageUrl: icon ? path.join(__dirname, "..", "assets", "icons", icon) : null };
  }
  if (rewardType === "role" || rewardType === "temp_role") {
    const role = guild.roles.cache.get(rewardRef);
    return { displayName: role ? `@${role.name}` : rewardRef, imageUrl: null };
  }
  return { displayName: rewardRef, imageUrl: null };
}

function rewardDetailsModal(boxKey, defaults) {
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_reward_details_modal").setTitle("Reward Details");
  const nameInput = new TextInputBuilder().setCustomId("display_name").setLabel("Name shown to players").setStyle(TextInputStyle.Short).setRequired(true).setValue(defaults.displayName.slice(0, 100));
  const weightInput = new TextInputBuilder().setCustomId("weight").setLabel("Odds weight (higher = more common)").setStyle(TextInputStyle.Short).setRequired(true).setValue("1");
  const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Quantity (or temp role hours)").setStyle(TextInputStyle.Short).setRequired(true).setValue("1");
  const imageInput = new TextInputBuilder()
    .setCustomId("image_url")
    .setLabel("Image URL (leave blank for auto/none)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  if (defaults.imageUrl && /^https?:\/\//i.test(defaults.imageUrl)) imageInput.setValue(defaults.imageUrl.slice(0, 4000));
  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(weightInput),
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(imageInput)
  );
  return modal;
}

function setBetModal(boxKey) {
  const modal = new ModalBuilder().setCustomId(`gamespanel:cfg_set_bet_modal:${boxKey}`).setTitle("Set Bet Range & Win Rate");
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  const minInput = new TextInputBuilder().setCustomId("min_bet").setLabel("Minimum bet").setStyle(TextInputStyle.Short).setRequired(true);
  const maxInput = new TextInputBuilder().setCustomId("max_bet").setLabel("Maximum bet").setStyle(TextInputStyle.Short).setRequired(true);
  const winRateInput = new TextInputBuilder().setCustomId("win_rate").setLabel("Win rate % (0-100)").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(currencyInput),
    new ActionRowBuilder().addComponents(minInput),
    new ActionRowBuilder().addComponents(maxInput),
    new ActionRowBuilder().addComponents(winRateInput)
  );
  return modal;
}

function setClaimModal() {
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_set_claim_modal").setTitle("Claim Delay & Message (applies to all boxes)");
  const delayInput = new TextInputBuilder().setCustomId("delay_sec").setLabel("Delay before delivery lands (seconds)").setStyle(TextInputStyle.Short).setRequired(true);
  const messageInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("In-game message (use {gamertag})")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(delayInput), new ActionRowBuilder().addComponents(messageInput));
  return modal;
}

function itemSearchModal(boxKey) {
  const modal = new ModalBuilder().setCustomId(`gamespanel:cfg_item_search_modal:${boxKey}`).setTitle("Search Rust Items");
  const queryInput = new TextInputBuilder().setCustomId("query").setLabel("Item name (partial is fine)").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(queryInput));
  return modal;
}

/** Maps a game key to its admin Configure menu view, or null for a game with no dedicated menu (Lootbox uses lootboxBoxSelectView instead). Shared by cfg_game_select and cfg_reopen (the latter used as the "Back" target from utils/gameWagerCurrency.js's currency-management screens). */
function gameAdminMenuFor(gameKey, guildId) {
  if (gameKey === "defuse_wire") return defuseWireAdminMenu(guildId);
  if (gameKey === "grid_minefield") return gridMinefieldAdminMenu(guildId);
  if (gameKey === "tower_climb") return towerClimbAdminMenu(guildId);
  if (gameKey === "vault_heist") return vaultHeist.adminMenu(guildId);
  if (gameKey === "scrap_merchant") return scrapMerchantAdminMenu(guildId);
  if (gameKey === "jackpot") return ticketJackpot.adminMenu(guildId);
  if (gameKey === "bradley_ambush") return bradleyAmbush.adminMenu(guildId);
  if (gameKey === "cargo_ship_heist") return cargoShipHeist.adminMenu(guildId);
  if (gameKey === "recycler_roulette") return recyclerRouletteAdminMenu(guildId);
  if (gameKey === "target_range") return targetRangeAdminMenu(guildId);
  if (gameKey === "coord_events") return coordEventsPanel.adminMenu(guildId);
  return null;
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  // ---- Coordinate-Spawned Events (Pyramid/Bridge/House) ----
  // Owns its own multi-step trigger flow/draft state - delegated wholesale
  // rather than inlined, same reasoning as utils/bradleyAmbush.js/
  // utils/vaultHeist.js owning their own multi-step flows.
  if (action.startsWith("cfg_coord")) {
    await coordEventsPanel.handleConfigureAction(interaction, action, parts);
    return;
  }

  // ---- Play flow ----
  // The Games Panel itself (buildHub()) is a persistent PUBLIC pinned
  // message everyone shares - clicking Play must never interaction.update()
  // that message (it would rewrite the shared panel for the whole channel
  // and every clicking player would stomp on each other's game picks).
  // Instead this starts a brand new ephemeral reply, and every step further
  // into the flow (server_select, game_select, mode_pick, etc.) safely
  // interaction.update()s THAT private reply, never the shared panel.
  if (action === "play") {
    const servers = db.listGuildServers(guildId);
    if (servers.length === 0) {
      await interaction.reply({ ...modeFirstSelectView(DEFAULT_SERVER_VALUE), ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [infoEmbed("Games", "Choose a server:")], components: [serverSelectRow(guildId), backRow("gamespanel:back_to_hub")], ephemeral: true });
    return;
  }
  if (action === "play_mode") {
    const server = parts[2];
    const mode = parts[3];
    await interaction.update(filteredGameSelectView(server, mode, interaction.member));
    return;
  }
  if (action === "play_back_mode") {
    await interaction.update(modeFirstSelectView(parts[2]));
    return;
  }
  if (action === "back_to_hub") {
    await interaction.update(buildHub());
    return;
  }
  if (action === "access") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Not Allowed", "Only the server owner or Administrators can change game access.")], ephemeral: true });
      return;
    }
    await interaction.update(accessGameSelectView());
    return;
  }
  if (action === "access_game_select") {
    await interaction.update(accessEditorView(guildId, interaction.values[0]));
    return;
  }
  if (action === "access_toggle") {
    const gameKey = parts[2];
    const settings = db.getGameSettings(guildId, gameKey);
    db.setGameEnabled(guildId, gameKey, !settings.enabled);
    await interaction.update(accessEditorView(guildId, gameKey));
    return;
  }
  if (action === "access_role") {
    const gameKey = parts[2];
    db.setGameRequiredRole(guildId, gameKey, interaction.values[0] || null);
    await interaction.update(accessEditorView(guildId, gameKey));
    return;
  }
  if (action === "server_select") {
    const server = interaction.values[0];
    await interaction.update(modeFirstSelectView(server));
    return;
  }
  // Back button from any step past game-select (mode pick, box pick, etc.) - re-renders the same game-select view rather than leaving a dead end.
  if (action === "play_back_games") {
    const server = parts[2];
    await interaction.update(gameSelectView(server));
    return;
  }
  if (action === "game_select") {
    const server = parts[2];
    await startGameSetup(interaction, server, interaction.values[0]);
    return;
  }
  if (action === "mode_pick") {
    await interaction.update({ embeds: [dangerEmbed("Not Available Yet", "This mode isn't implemented yet - check back soon.")], components: [backRow(`gamespanel:play_back_games:${parts[2]}`)] });
    return;
  }
  if (action === "lootbox_box") {
    const server = parts[2];
    const boxKey = interaction.values[0];
    // FIXED (2026-09-07): same reasoning as utils/defuseWire.js/gridMinefield.js's
    // buildWagerModal - showing the actual min/max instead of leaving it a
    // guessing game. Label capped at Discord's 45-char field limit.
    const settings = db.getLootboxSettings(guildId, boxKey);
    const modal = new ModalBuilder().setCustomId(`gamespanel:lootbox_wager_modal:${server}:${boxKey}`).setTitle("Place Your Bet");
    const rangeLabel = settings ? `Wager (Min ${settings.min_bet} - Max ${settings.max_bet})` : "How much to wager?";
    const wagerInput = new TextInputBuilder()
      .setCustomId("wager")
      .setLabel(rangeLabel.length <= 45 ? rangeLabel : "How much to wager?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(12);
    if (settings) wagerInput.setPlaceholder(`${settings.min_bet}-${settings.max_bet} ${settings.currency_emoji || ""} ${settings.currency_name}`.replace(/\s+/g, " ").trim());
    modal.addComponents(new ActionRowBuilder().addComponents(wagerInput));
    await interaction.showModal(modal);
    return;
  }

  // ---- Quick Setup flow ----
  if (action === "quick_setup") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Not Allowed", "Only the server owner or Administrators can auto-configure games.")], ephemeral: true });
      return;
    }
    await interaction.reply({ ...quickSetupView(guildId, interaction.user.id), ephemeral: true });
    return;
  }
  if (action === "qs_toggle_kits") {
    const draft = getQuickSetupDraft(guildId, interaction.user.id);
    draft.kits = !draft.kits;
    await interaction.update(quickSetupView(guildId, interaction.user.id));
    return;
  }
  if (action === "qs_toggle_items") {
    const draft = getQuickSetupDraft(guildId, interaction.user.id);
    draft.items = !draft.items;
    await interaction.update(quickSetupView(guildId, interaction.user.id));
    return;
  }
  if (action === "qs_toggle_materials") {
    const draft = getQuickSetupDraft(guildId, interaction.user.id);
    draft.materials = !draft.materials;
    await interaction.update(quickSetupView(guildId, interaction.user.id));
    return;
  }
  if (action === "qs_confirm") {
    await interaction.deferUpdate();
    const { changes, currency } = applyQuickSetup(guildId, interaction.user.id);
    const body = changes.length
      ? changes.map((c) => `• ${c}`).join("\n")
      : `Everything was already configured - nothing to change. Currency in use: **${currency.emoji || ""} ${currency.name}**.`;
    await interaction.editReply({ embeds: [successEmbed("Quick Setup Complete", body)], components: [backRow("gamespanel:back_to_hub")] });
    return;
  }

  // ---- Reset flow ----
  // "reset_menu" is ONLY the public hub button - a fresh ephemeral reply,
  // same "never interaction.update() the shared panel" rule as configure/
  // quick_setup above. "reset_cancel" (below) is the private confirm
  // screen's own Cancel button, which correctly DOES update that ephemeral
  // message instead.
  if (action === "reset_menu") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Not Allowed", "Only the server owner or Administrators can reset games.")], ephemeral: true });
      return;
    }
    await interaction.reply({ ...resetSelectView(), ephemeral: true });
    return;
  }
  if (action === "reset_select") {
    await interaction.update(resetConfirmView(interaction.values[0]));
    return;
  }
  if (action === "reset_cancel") {
    await interaction.update(resetSelectView());
    return;
  }
  if (action === "reset_confirm") {
    const targetKey = parts[2];
    const target = RESET_TARGETS.find((t) => t.key === targetKey);
    if (!target) {
      await interaction.update({ embeds: [dangerEmbed("Not Found", "That reset option no longer exists.")], components: [backRow("gamespanel:back_to_hub")] });
      return;
    }
    await interaction.deferUpdate();
    target.reset(guildId);
    await interaction.editReply({ embeds: [successEmbed("Reset Complete", `**${target.label}**'s config was wiped. Run **Quick Setup** or **Configure** to set it up again.`)], components: [backRow("gamespanel:back_to_hub")] });
    return;
  }

  // ---- Configure flow ----
  if (action === "configure") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Not Allowed", "Only the server owner or Administrators can configure games.")], ephemeral: true });
      return;
    }
    await interaction.reply({ ...configureGameSelectView(), ephemeral: true });
    return;
  }
  if (action === "cfg_back_to_game_select") {
    await interaction.update(configureGameSelectView());
    return;
  }
  if (action === "cfg_back_to_box_select") {
    await interaction.update(lootboxBoxSelectView());
    return;
  }
  if (action === "cfg_reopen") {
    const view = gameAdminMenuFor(parts[2], guildId);
    if (view) await interaction.update(view);
    return;
  }
  if (action === "cfg_game_select") {
    const gameKey = interaction.values[0];
    const view = gameAdminMenuFor(gameKey, guildId);
    if (view) {
      await interaction.update(view);
      return;
    }
    if (gameKey !== "lootbox") {
      await interaction.update({ embeds: [dangerEmbed("Not Implemented", "That game doesn't have a configure flow yet.")], components: [] });
      return;
    }
    await interaction.update(lootboxBoxSelectView());
    return;
  }
  if (action === "cfg_dw_set_bet") {
    await interaction.showModal(defuseWireSetBetModal(guildId));
    return;
  }
  if (action === "cfg_gm_set_bet") {
    await interaction.showModal(gridMinefieldSetBetModal(guildId));
    return;
  }
  if (action === "cfg_gm_back") {
    await interaction.update(gridMinefieldAdminMenu(guildId));
    return;
  }
  if (action === "cfg_tc_set_bet") {
    await interaction.showModal(towerClimbSetBetModal(guildId));
    return;
  }
  if (action === "cfg_tc_back") {
    await interaction.update(towerClimbAdminMenu(guildId));
    return;
  }
  if (action === "cfg_dw_back") {
    await interaction.update(defuseWireAdminMenu(guildId));
    return;
  }
  if (action === "cfg_vault_set_channel") {
    await interaction.update({ embeds: [infoEmbed("Vault Channel", "Pick which channel vaults should spawn in:")], components: [vaultHeist.channelSelectRow(), backRow("gamespanel:cfg_vault_back")] });
    return;
  }
  if (action === "cfg_vault_channel_select") {
    const channelId = interaction.values[0];
    db.upsertVaultHeistSettings(guildId, { channel_id: channelId });
    await interaction.update({ embeds: [successEmbed("Channel Set", `Vaults will now spawn in <#${channelId}>.`)], components: [backRow("gamespanel:cfg_vault_back")] });
    return;
  }
  if (action === "cfg_vault_set_rewards") {
    await interaction.showModal(vaultHeist.rewardsModal(guildId));
    return;
  }
  if (action === "cfg_vault_set_combat") {
    await interaction.showModal(vaultHeist.combatModal(guildId));
    return;
  }
  if (action === "cfg_vault_back") {
    await interaction.update(vaultHeist.adminMenu(guildId));
    return;
  }

  // ---- The Ticket Jackpot ----
  if (action === "cfg_jackpot_set_tickets") {
    await interaction.showModal(ticketJackpot.ticketsModal(guildId));
    return;
  }
  if (action === "cfg_jackpot_set_pool") {
    await interaction.showModal(ticketJackpot.poolModal(guildId));
    return;
  }

  // ---- The Recycler Roulette ----
  if (action === "cfg_rr_set_bet") {
    await interaction.showModal(recyclerRouletteSetBetModal(guildId));
    return;
  }

  // ---- The Target Range ----
  if (action === "cfg_tr_set_entry") {
    await interaction.showModal(targetRangeEntryModal(guildId));
    return;
  }
  if (action === "cfg_tr_set_round") {
    await interaction.showModal(targetRangeRoundModal(guildId));
    return;
  }

  // ---- The Bradley APC Ambush ----
  if (action === "cfg_bradley_set_channel") {
    await interaction.update({ embeds: [infoEmbed("Ambush Channel", "Pick which channel raids should post in:")], components: [bradleyAmbush.channelSelectRow(), backRow("gamespanel:cfg_reopen:bradley_ambush")] });
    return;
  }
  if (action === "cfg_bradley_channel_select") {
    const channelId = interaction.values[0];
    db.upsertBradleyAmbushSettings(guildId, { channel_id: channelId });
    await interaction.update({ embeds: [successEmbed("Channel Set", `Raids will now post in <#${channelId}>.`)], components: [backRow("gamespanel:cfg_reopen:bradley_ambush")] });
    return;
  }
  if (action === "cfg_bradley_set_rewards") {
    await interaction.showModal(bradleyAmbush.rewardsModal(guildId));
    return;
  }
  if (action === "cfg_bradley_set_combat") {
    await interaction.showModal(bradleyAmbush.combatModal(guildId));
    return;
  }
  if (action === "cfg_bradley_set_loot") {
    await interaction.update({ embeds: [infoEmbed("Loot Kit", "Pick a kit to deliver to every raider who dealt damage (leave unset for currency-only payouts):")], components: [bradleyAmbush.lootKitSelectRow(guildId), backRow("gamespanel:cfg_reopen:bradley_ambush")] });
    return;
  }
  if (action === "cfg_bradley_loot_select") {
    const kitName = interaction.values[0];
    db.upsertBradleyAmbushSettings(guildId, { loot_kit_name: kitName === "__none__" ? null : kitName });
    await interaction.update(bradleyAmbush.adminMenu(guildId));
    return;
  }
  if (action === "cfg_bradley_trigger") {
    const settings = db.getBradleyAmbushSettings(guildId);
    if (!settings?.channel_id || !settings?.currency_id) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "Set a channel and currency first.")], ephemeral: true });
      return;
    }
    if (db.getActiveBradleyAmbush(guildId)) {
      await interaction.reply({ embeds: [dangerEmbed("Already Active", "A raid is already in progress.")], ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    await bradleyAmbush.triggerAmbush(interaction.guild, settings).catch((err) => console.error(`[KOBA Bot] Manual Bradley Ambush trigger failed for guild ${guildId}:`, err));
    await interaction.editReply(bradleyAmbush.adminMenu(guildId));
    return;
  }

  // ---- Cargo Ship Heist ----
  if (action === "cfg_cargo_set_channel") {
    await interaction.update({ embeds: [infoEmbed("Heist Channel", "Pick which channel heists should post in:")], components: [cargoShipHeist.channelSelectRow(), backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
    return;
  }
  if (action === "cfg_cargo_channel_select") {
    const channelId = interaction.values[0];
    db.upsertCargoShipHeistSettings(guildId, { channel_id: channelId });
    await interaction.update({ embeds: [successEmbed("Channel Set", `Heists will now post in <#${channelId}>.`)], components: [backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
    return;
  }
  if (action === "cfg_cargo_set_rewards") {
    await interaction.showModal(cargoShipHeist.rewardsModal(guildId));
    return;
  }
  if (action === "cfg_cargo_set_combat") {
    await interaction.showModal(cargoShipHeist.combatModal(guildId));
    return;
  }
  if (action === "cfg_cargo_trigger") {
    if (!(await requirePlan(interaction, "pro", "Cargo Ship Heist"))) return;
    const settings = db.getCargoShipHeistSettings(guildId);
    if (!settings?.channel_id || !settings?.currency_id) {
      await interaction.reply({ embeds: [dangerEmbed("Not Set Up", "Set a channel and currency first.")], ephemeral: true });
      return;
    }
    if (db.getActiveCargoShipHeist(guildId)) {
      await interaction.reply({ embeds: [dangerEmbed("Already Active", "A heist is already in progress.")], ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    await cargoShipHeist.triggerHeist(interaction.guild, settings).catch((err) => console.error(`[KOBA Bot] Manual Cargo Ship Heist trigger failed for guild ${guildId}:`, err));
    await interaction.editReply(cargoShipHeist.adminMenu(guildId));
    return;
  }

  if (action === "cfg_scrap_set_settings") {
    const currencies = db.listCurrencies(guildId);
    if (!currencies.length) {
      await interaction.update({ embeds: [dangerEmbed("No Currencies", "This server has no currencies yet - create one via /shop-panel first.")], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Scrap Merchant Settings", "Which currency should the merchant pay in?")], components: [scrapCurrencySelectRow(guildId)] });
    return;
  }
  if (action === "cfg_scrap_currency_select") {
    const currencyId = interaction.values[0];
    await interaction.showModal(scrapMerchantRatesModal(guildId, currencyId));
    return;
  }
  if (action === "cfg_scrap_add_item") {
    await interaction.update({ embeds: [infoEmbed("Add Scrap Item", "What kind of item?")], components: [scrapItemTypeSelectRow()] });
    return;
  }
  if (action === "cfg_scrap_item_type") {
    const itemType = interaction.values[0];
    if (itemType === "material") {
      await interaction.update({ embeds: [infoEmbed("Add Scrap Item", "Pick a material:")], components: [scrapMaterialSelectRow()] });
      return;
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_scrap_item_search").setLabel("🔍 Search Items").setStyle(ButtonStyle.Primary));
    await interaction.update({ embeds: [infoEmbed("Add Scrap Item", "Search for a Rust item:")], components: [row] });
    return;
  }
  if (action === "cfg_scrap_item_search") {
    await interaction.showModal(scrapItemSearchModal());
    return;
  }
  if (action === "cfg_scrap_pick_material") {
    const materialKey = interaction.values[0];
    await interaction.showModal(scrapItemDetailsModal({ displayName: MATERIAL_LABELS[materialKey] || materialKey, emoji: MATERIAL_EMOJI[materialKey] || "" }));
    return;
  }
  if (action === "cfg_scrap_pick_item") {
    const shortName = interaction.values[0];
    const item = getItemByShortName(shortName);
    await interaction.showModal(scrapItemDetailsModal({ displayName: item?.name || shortName, emoji: "" }));
    return;
  }
  if (action === "cfg_scrap_list_items") {
    const items = db.listScrapItems(guildId);
    const lines = items.length
      ? items
          .map((i) => {
            const priceNote = i.price_mode === "random" ? `${i.min_price}-${i.max_price}` : `${i.fixed_price}`;
            return `${i.emoji || "🔩"} **${i.name}** — ${priceNote} (weight ${i.drop_weight})${i.enabled ? "" : " _(disabled)_"}`;
          })
          .join("\n")
      : "_No items yet - use Add Item._";
    await interaction.update({ embeds: [infoEmbed("Scrap Item Catalog", lines)], components: [backRow("gamespanel:cfg_scrap_back")] });
    return;
  }
  if (action === "cfg_scrap_remove_item") {
    const items = db.listScrapItems(guildId);
    if (!items.length) {
      await interaction.update({ embeds: [dangerEmbed("Nothing To Remove", "The catalog has no items yet.")], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("gamespanel:cfg_scrap_remove_item_select")
      .setPlaceholder("Which item to remove?")
      .addOptions(items.slice(0, 25).map((i) => ({ label: i.name.slice(0, 100), value: String(i.id) })));
    await interaction.update({ embeds: [infoEmbed("Remove Item", "Pick one to remove - this also clears it from every player's inventory.")], components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }
  if (action === "cfg_scrap_remove_item_select") {
    const id = Number(interaction.values[0]);
    db.deleteScrapItem(guildId, id);
    await interaction.update({ embeds: [successEmbed("Removed", "Item removed from the catalog and every player's inventory.")], components: [backRow("gamespanel:cfg_scrap_back")] });
    return;
  }
  if (action === "cfg_scrap_back") {
    await interaction.update(scrapMerchantAdminMenu(guildId));
    return;
  }
  if (action === "cfg_box_select") {
    await interaction.update(boxAdminMenu(interaction.values[0]));
    return;
  }
  if (action === "cfg_set_bet") {
    await interaction.showModal(setBetModal(parts[2]));
    return;
  }
  if (action === "cfg_set_claim") {
    await interaction.showModal(setClaimModal());
    return;
  }
  if (action === "cfg_set_loss") {
    const boxKey = parts[2];
    db.upsertGuildMeta(guildId, { lootbox_loss_box_key: boxKey });
    const boxLabel = LOOTBOX_TYPES.find((b) => b.key === boxKey)?.label || boxKey;
    await interaction.update({ embeds: [successEmbed("Loss Box Set", `**${boxLabel}** now shows whenever any box roll loses.`)], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
    return;
  }
  if (action === "cfg_box_select_direct") {
    await interaction.update(boxAdminMenu(parts[2]));
    return;
  }
  if (action === "cfg_set_channel") {
    const boxKey = parts[2];
    const menu = new ChannelSelectMenuBuilder().setCustomId(`gamespanel:cfg_set_channel_select:${boxKey}`).setPlaceholder("Which channel? (applies to all boxes)").addChannelTypes(ChannelType.GuildText);
    await interaction.update({ embeds: [infoEmbed("Announce Channel", "Pick where lootbox rolls get announced:")], components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }
  if (action === "cfg_set_channel_select") {
    const boxKey = parts[2];
    const channel = interaction.channels.first();
    db.upsertGuildMeta(guildId, { lootbox_channel_id: channel.id });
    await interaction.update({ embeds: [successEmbed("Channel Set", `Rolls will now also post in ${channel}.`)], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
    return;
  }
  if (action === "cfg_list") {
    const boxKey = parts[2];
    const rewards = db.listLootboxRewards(guildId, boxKey);
    const settings = db.getLootboxSettings(guildId, boxKey);
    const settingsLine = settings
      ? `**Bet:** ${settings.min_bet}-${settings.max_bet} ${settings.currency_emoji || ""} ${settings.currency_name} · **Win rate:** ${settings.win_rate}%\n\n`
      : "**Not set up yet** - use Set Bet.\n\n";
    const lines = rewards.length
      ? rewards.map((r) => `• ${r.display_name} (weight ${r.weight})`).join("\n")
      : "_No rewards yet._";
    await interaction.update({ embeds: [infoEmbed("Reward Pool", settingsLine + lines)], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
    return;
  }
  if (action === "cfg_remove_reward") {
    const boxKey = parts[2];
    const rewards = db.listLootboxRewards(guildId, boxKey);
    if (!rewards.length) {
      await interaction.update({ embeds: [dangerEmbed("Nothing To Remove", "This box has no rewards yet.")], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`gamespanel:cfg_remove_reward_select:${boxKey}`)
      .setPlaceholder("Which reward to remove?")
      .addOptions(rewards.slice(0, 25).map((r) => ({ label: r.display_name.slice(0, 100), value: String(r.id) })));
    await interaction.update({ embeds: [infoEmbed("Remove Reward", "Pick one to remove:")], components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }
  if (action === "cfg_remove_reward_select") {
    const boxKey = parts[2];
    const id = Number(interaction.values[0]);
    db.removeLootboxReward(guildId, id);
    await interaction.update({ embeds: [successEmbed("Removed", "Reward removed from the pool.")], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
    return;
  }
  if (action === "cfg_add_reward") {
    await interaction.update({ embeds: [infoEmbed("Add Reward", "What kind of reward?")], components: [rewardTypeSelectRow(parts[2])] });
    return;
  }
  if (action === "cfg_reward_type") {
    const boxKey = parts[2];
    const rewardType = interaction.values[0];
    draftState.set(draftKey(guildId, interaction.user.id), { boxKey, rewardType });

    if (rewardType === "material") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("gamespanel:cfg_pick_material")
        .setPlaceholder("Which material?")
        .addOptions(Object.entries(MATERIAL_LABELS).map(([value, label]) => ({ label, value })));
      await interaction.update({ embeds: [infoEmbed("Add Reward", "Pick a material:")], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }
    if (rewardType === "role" || rewardType === "temp_role") {
      const menu = new RoleSelectMenuBuilder().setCustomId("gamespanel:cfg_pick_role").setPlaceholder("Pick a role");
      await interaction.update({ embeds: [infoEmbed("Add Reward", "Pick a role:")], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }
    if (rewardType === "kit") {
      const kits = db.listKits(guildId);
      if (!kits.length) {
        await interaction.update({ embeds: [dangerEmbed("No Kits", "This server has no registered kits yet - set some up with /kit-panel first.")], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
        return;
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId("gamespanel:cfg_pick_kit")
        .setPlaceholder("Which kit?")
        .addOptions(kits.slice(0, 25).map((k) => ({ label: k.display_name.slice(0, 100), value: k.display_name.slice(0, 100) })));
      await interaction.update({ embeds: [infoEmbed("Add Reward", "Pick a kit:")], components: [new ActionRowBuilder().addComponents(menu)] });
      return;
    }
    // item - too many to list directly, search first
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gamespanel:cfg_item_search:${boxKey}`).setLabel("🔍 Search Items").setStyle(ButtonStyle.Primary));
    await interaction.update({ embeds: [infoEmbed("Add Reward", "Search for a Rust item:")], components: [row] });
    return;
  }
  if (action === "cfg_item_search") {
    await interaction.showModal(itemSearchModal(parts[2]));
    return;
  }
  if (action === "cfg_pick_material") {
    const key = draftKey(guildId, interaction.user.id);
    const draft = draftState.get(key);
    if (!draft) return;
    draft.rewardRef = interaction.values[0];
    const { displayName, imageUrl } = resolveDisplay("material", draft.rewardRef, interaction.guild);
    draft.displayName = displayName;
    draft.imageUrl = imageUrl;
    await interaction.showModal(rewardDetailsModal(draft.boxKey, { displayName, imageUrl }));
    return;
  }
  if (action === "cfg_pick_role") {
    const key = draftKey(guildId, interaction.user.id);
    const draft = draftState.get(key);
    if (!draft) return;
    draft.rewardRef = interaction.values[0];
    const { displayName, imageUrl } = resolveDisplay(draft.rewardType, draft.rewardRef, interaction.guild);
    draft.displayName = displayName;
    draft.imageUrl = imageUrl;
    await interaction.showModal(rewardDetailsModal(draft.boxKey, { displayName, imageUrl }));
    return;
  }
  if (action === "cfg_pick_kit") {
    const key = draftKey(guildId, interaction.user.id);
    const draft = draftState.get(key);
    if (!draft) return;
    draft.rewardRef = interaction.values[0];
    draft.displayName = draft.rewardRef;
    draft.imageUrl = null;
    await interaction.showModal(rewardDetailsModal(draft.boxKey, { displayName: draft.displayName, imageUrl: null }));
    return;
  }
  if (action === "cfg_pick_item") {
    const key = draftKey(guildId, interaction.user.id);
    const draft = draftState.get(key);
    if (!draft) return;
    draft.rewardRef = interaction.values[0];
    const { displayName, imageUrl } = resolveDisplay("item", draft.rewardRef, interaction.guild);
    draft.displayName = displayName;
    draft.imageUrl = imageUrl;
    await interaction.showModal(rewardDetailsModal(draft.boxKey, { displayName, imageUrl }));
    return;
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "cfg_dw_set_bet_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const minBet = Number(interaction.fields.getTextInputValue("min_bet"));
    const maxBet = Number(interaction.fields.getTextInputValue("max_bet"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet > maxBet) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_dw_back")] });
      return;
    }
    db.setDefuseWireSettings(guildId, currency.id, minBet, maxBet);
    await interaction.editReply({ embeds: [successEmbed("Bet Settings Updated", `Bet **${minBet}-${maxBet} ${currency.emoji || ""} ${currency.name}**.`)], components: [backRow("gamespanel:cfg_dw_back")] });
    return;
  }

  if (action === "cfg_gm_set_bet_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const minBet = Number(interaction.fields.getTextInputValue("min_bet"));
    const maxBet = Number(interaction.fields.getTextInputValue("max_bet"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet > maxBet) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_gm_back")] });
      return;
    }
    db.setGridMinefieldSettings(guildId, currency.id, minBet, maxBet);
    await interaction.editReply({ embeds: [successEmbed("Bet Settings Updated", `Bet **${minBet}-${maxBet} ${currency.emoji || ""} ${currency.name}**.`)], components: [backRow("gamespanel:cfg_gm_back")] });
    return;
  }

  if (action === "cfg_tc_set_bet_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const minBet = Number(interaction.fields.getTextInputValue("min_bet"));
    const maxBet = Number(interaction.fields.getTextInputValue("max_bet"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet > maxBet) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_tc_back")] });
      return;
    }
    db.setTowerClimbSettings(guildId, currency.id, minBet, maxBet);
    await interaction.editReply({ embeds: [successEmbed("Bet Settings Updated", `Bet **${minBet}-${maxBet} ${currency.emoji || ""} ${currency.name}**.`)], components: [backRow("gamespanel:cfg_tc_back")] });
    return;
  }

  if (action === "cfg_vault_rewards_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const intervalHours = Number(interaction.fields.getTextInputValue("interval_hours"));
    const targetHp = Number(interaction.fields.getTextInputValue("target_hp"));
    const rewardPool = Number(interaction.fields.getTextInputValue("reward_pool"));
    const topBonus = Number(interaction.fields.getTextInputValue("top_bonus"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || ![intervalHours, targetHp, rewardPool, topBonus].every(Number.isFinite) || intervalHours <= 0 || targetHp <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_vault_back")] });
      return;
    }
    db.upsertVaultHeistSettings(guildId, {
      currency_id: currency.id,
      interval_hours: intervalHours,
      target_hp: targetHp,
      reward_pool_amount: rewardPool,
      top_damager_bonus: topBonus,
    });
    await interaction.editReply({ embeds: [successEmbed("Rewards & Timing Updated", `Every **${intervalHours}h**, target **${targetHp} HP**, pool **${rewardPool} ${currency.emoji || ""} ${currency.name}**, top damager bonus **${topBonus}**.`)], components: [backRow("gamespanel:cfg_vault_back")] });
    return;
  }

  if (action === "cfg_vault_combat_modal") {
    await interaction.deferUpdate();
    const cooldownSeconds = Number(interaction.fields.getTextInputValue("cooldown_seconds"));
    const minDamage = Number(interaction.fields.getTextInputValue("min_damage"));
    const maxDamage = Number(interaction.fields.getTextInputValue("max_damage"));
    if (![cooldownSeconds, minDamage, maxDamage].every(Number.isFinite) || cooldownSeconds < 0 || minDamage <= 0 || minDamage > maxDamage) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the numbers make sense (min ≤ max, cooldown ≥ 0).")], components: [backRow("gamespanel:cfg_vault_back")] });
      return;
    }
    db.upsertVaultHeistSettings(guildId, { cooldown_seconds: cooldownSeconds, min_damage: minDamage, max_damage: maxDamage });
    await interaction.editReply({ embeds: [successEmbed("Combat Settings Updated", `Cooldown **${cooldownSeconds}s**, damage **${minDamage}-${maxDamage}** per hit.`)], components: [backRow("gamespanel:cfg_vault_back")] });
    return;
  }

  // ---- The Ticket Jackpot ----
  if (action === "cfg_jackpot_tickets_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    const prices = interaction.fields.getTextInputValue("prices").split(",").map((s) => Number(s.trim()));
    const emojis = interaction.fields.getTextInputValue("emojis").split(",").map((s) => s.trim());
    if (!currency || prices.length !== 3 || !prices.every((p) => Number.isFinite(p) && p > 0) || emojis.length !== 3) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and both CSVs have exactly 3 values.")], components: [backRow("gamespanel:cfg_reopen:jackpot")] });
      return;
    }
    db.upsertJackpotSettings(guildId, { currency_id: currency.id, base_price: prices[0], elite_price: prices[1], vip_price: prices[2], base_emoji: emojis[0], elite_emoji: emojis[1], vip_emoji: emojis[2] });
    await interaction.editReply({ embeds: [successEmbed("Tickets Updated", "Currency and ticket tiers saved.")], components: [backRow("gamespanel:cfg_reopen:jackpot")] });
    return;
  }
  if (action === "cfg_jackpot_pool_modal") {
    await interaction.deferUpdate();
    const ceiling = Number(interaction.fields.getTextInputValue("ceiling"));
    const splitsRaw = interaction.fields.getTextInputValue("splits");
    const splits = splitsRaw.split(",").map((s) => Number(s.trim()));
    if (!Number.isFinite(ceiling) || ceiling <= 0 || !splits.length || !splits.every((s) => Number.isFinite(s) && s > 0)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Ceiling must be a positive number and splits must be a CSV of positive percentages.")], components: [backRow("gamespanel:cfg_reopen:jackpot")] });
      return;
    }
    db.upsertJackpotSettings(guildId, { max_pool_ceiling: ceiling, prize_splits: splitsRaw.trim() });
    await interaction.editReply({ embeds: [successEmbed("Pool Settings Updated", `Ceiling **${ceiling}**, splits **${splitsRaw}%**.`)], components: [backRow("gamespanel:cfg_reopen:jackpot")] });
    return;
  }

  // ---- The Recycler Roulette ----
  if (action === "cfg_rr_set_bet_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const minBet = Number(interaction.fields.getTextInputValue("min_bet"));
    const maxBet = Number(interaction.fields.getTextInputValue("max_bet"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet > maxBet) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_reopen:recycler_roulette")] });
      return;
    }
    db.setRecyclerRouletteSettings(guildId, currency.id, minBet, maxBet);
    await interaction.editReply({ embeds: [successEmbed("Bet Settings Updated", `Bet **${minBet}-${maxBet} ${currency.emoji || ""} ${currency.name}**.`)], components: [backRow("gamespanel:cfg_reopen:recycler_roulette")] });
    return;
  }

  // ---- The Target Range ----
  if (action === "cfg_tr_entry_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    const entryFee = Number(interaction.fields.getTextInputValue("entry_fee"));
    const gridSize = Number(interaction.fields.getTextInputValue("grid_size"));
    if (!currency || !Number.isFinite(entryFee) || entryFee < 0 || ![3, 4].includes(gridSize)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel), entry fee is ≥ 0, and grid size is 3 or 4.")], components: [backRow("gamespanel:cfg_reopen:target_range")] });
      return;
    }
    db.upsertTargetRangeSettings(guildId, { currency_id: currency.id, entry_fee: entryFee, grid_size: gridSize });
    await interaction.editReply({ embeds: [successEmbed("Entry & Grid Updated", `Entry fee **${entryFee}**, grid **${gridSize}x${gridSize}**.`)], components: [backRow("gamespanel:cfg_reopen:target_range")] });
    return;
  }
  if (action === "cfg_tr_round_modal") {
    await interaction.deferUpdate();
    const shuffleMs = Number(interaction.fields.getTextInputValue("shuffle_ms"));
    const roundSeconds = Number(interaction.fields.getTextInputValue("round_seconds"));
    const lootTable = interaction.fields.getTextInputValue("loot_table").trim();
    const validLoot = lootTable.split(",").every((pair) => /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(pair.trim()));
    if (!Number.isFinite(shuffleMs) || shuffleMs < 200 || !Number.isFinite(roundSeconds) || roundSeconds <= 0 || !validLoot) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check shuffle interval (≥200ms), round length (>0s), and the loot table is a valid \"minScore:payout\" CSV.")], components: [backRow("gamespanel:cfg_reopen:target_range")] });
      return;
    }
    db.upsertTargetRangeSettings(guildId, { shuffle_interval_ms: shuffleMs, round_seconds: roundSeconds, loot_table: lootTable });
    await interaction.editReply({ embeds: [successEmbed("Round & Loot Updated", `Shuffle every **${shuffleMs}ms**, round **${roundSeconds}s**.`)], components: [backRow("gamespanel:cfg_reopen:target_range")] });
    return;
  }

  // ---- The Bradley APC Ambush ----
  if (action === "cfg_bradley_rewards_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    const entryFee = Number(interaction.fields.getTextInputValue("entry_fee"));
    const checkinMinutes = Number(interaction.fields.getTextInputValue("checkin_minutes"));
    const combatMinutes = Number(interaction.fields.getTextInputValue("combat_minutes"));
    const intervalHours = Number(interaction.fields.getTextInputValue("interval_hours"));
    if (!currency || ![entryFee, checkinMinutes, combatMinutes, intervalHours].every(Number.isFinite) || entryFee < 0 || checkinMinutes <= 0 || combatMinutes <= 0 || intervalHours < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_reopen:bradley_ambush")] });
      return;
    }
    db.upsertBradleyAmbushSettings(guildId, { currency_id: currency.id, entry_fee: entryFee, checkin_minutes: checkinMinutes, combat_minutes: combatMinutes, interval_hours: intervalHours });
    await interaction.editReply({ embeds: [successEmbed("Fees & Timing Updated", `Entry fee **${entryFee}**, check-in **${checkinMinutes}min**, combat **${combatMinutes}min**.`)], components: [backRow("gamespanel:cfg_reopen:bradley_ambush")] });
    return;
  }
  if (action === "cfg_bradley_combat_modal") {
    await interaction.deferUpdate();
    const maxHp = Number(interaction.fields.getTextInputValue("max_hp"));
    const cooldownSeconds = Number(interaction.fields.getTextInputValue("cooldown_seconds"));
    const armorSeconds = Number(interaction.fields.getTextInputValue("armor_seconds"));
    const mvpBonus = Number(interaction.fields.getTextInputValue("mvp_bonus"));
    if (![maxHp, cooldownSeconds, armorSeconds, mvpBonus].every(Number.isFinite) || maxHp <= 0 || cooldownSeconds < 0 || armorSeconds < 0 || mvpBonus < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the numbers make sense (all ≥ 0, max HP > 0).")], components: [backRow("gamespanel:cfg_reopen:bradley_ambush")] });
      return;
    }
    db.upsertBradleyAmbushSettings(guildId, { max_hp: maxHp, action_cooldown_seconds: cooldownSeconds, armor_crack_seconds: armorSeconds, mvp_bonus_amount: mvpBonus });
    await interaction.editReply({ embeds: [successEmbed("Combat Settings Updated", `Max HP **${maxHp}**, cooldown **${cooldownSeconds}s**, armor debuff **${armorSeconds}s**, MVP bonus **${mvpBonus}**.`)], components: [backRow("gamespanel:cfg_reopen:bradley_ambush")] });
    return;
  }

  // ---- Cargo Ship Heist ----
  if (action === "cfg_cargo_rewards_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    const entryFee = Number(interaction.fields.getTextInputValue("entry_fee"));
    const lobbyMinutes = Number(interaction.fields.getTextInputValue("lobby_minutes"));
    const grandPrize = Number(interaction.fields.getTextInputValue("grand_prize"));
    const intervalHours = Number(interaction.fields.getTextInputValue("interval_hours"));
    if (!currency || ![entryFee, lobbyMinutes, grandPrize, intervalHours].every(Number.isFinite) || entryFee < 0 || lobbyMinutes <= 0 || grandPrize < 0 || intervalHours < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
      return;
    }
    db.upsertCargoShipHeistSettings(guildId, { currency_id: currency.id, entry_fee: entryFee, lobby_minutes: lobbyMinutes, grand_prize_amount: grandPrize, interval_hours: intervalHours });
    await interaction.editReply({ embeds: [successEmbed("Fees & Timing Updated", `Entry fee **${entryFee}**, lobby **${lobbyMinutes}min**, grand prize **${grandPrize}**.`)], components: [backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
    return;
  }
  if (action === "cfg_cargo_combat_modal") {
    await interaction.deferUpdate();
    const roundSeconds = Number(interaction.fields.getTextInputValue("round_seconds"));
    const roundsTotal = Number(interaction.fields.getTextInputValue("rounds_total"));
    const flankStealPct = Number(interaction.fields.getTextInputValue("flank_steal_pct"));
    const smokeBlockSeconds = Number(interaction.fields.getTextInputValue("smoke_block_seconds"));
    if (![roundSeconds, roundsTotal, flankStealPct, smokeBlockSeconds].every(Number.isFinite) || roundSeconds <= 0 || roundsTotal <= 0 || flankStealPct <= 0 || smokeBlockSeconds < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the numbers make sense (all > 0 except smoke duration which may be 0).")], components: [backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
      return;
    }
    db.upsertCargoShipHeistSettings(guildId, { round_seconds: roundSeconds, rounds_total: roundsTotal, flank_steal_pct: flankStealPct, smoke_block_seconds: smokeBlockSeconds });
    await interaction.editReply({ embeds: [successEmbed("Combat Settings Updated", `**${roundsTotal}** rounds x **${roundSeconds}s**, flank steal **${flankStealPct}%**, smoke block **${smokeBlockSeconds}s**.`)], components: [backRow("gamespanel:cfg_reopen:cargo_ship_heist")] });
    return;
  }

  if (action === "cfg_scrap_rates_modal") {
    await interaction.deferUpdate();
    const currencyId = Number(parts[2]);
    const dropChance = Number(interaction.fields.getTextInputValue("drop_chance"));
    const maxInventory = Number(interaction.fields.getTextInputValue("max_inventory"));
    const currency = db.listCurrencies(guildId).find((c) => c.id === currencyId);
    if (!currency || !Number.isFinite(dropChance) || dropChance < 0 || dropChance > 100 || !Number.isInteger(maxInventory) || maxInventory <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check drop chance is 0-100 and max inventory is a positive whole number.")], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    db.upsertScrapMerchantSettings(guildId, { currency_id: currency.id, drop_chance_pct: dropChance, max_inventory_items: maxInventory });
    await interaction.editReply({ embeds: [successEmbed("Settings Updated", `Currency **${currency.emoji || ""} ${currency.name}**, drop chance **${dropChance}%**, max inventory **${maxInventory}**.`)], components: [backRow("gamespanel:cfg_scrap_back")] });
    return;
  }

  if (action === "cfg_scrap_item_search_modal") {
    await interaction.deferUpdate();
    const query = interaction.fields.getTextInputValue("query").trim();
    const results = searchItems(query, 25);
    if (!results.length) {
      await interaction.editReply({ embeds: [dangerEmbed("No Matches", `Nothing found for "${query}" - try a different search.`)], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("gamespanel:cfg_scrap_pick_item")
      .setPlaceholder("Which item?")
      .addOptions(results.map((i) => ({ label: i.name.slice(0, 100), description: i.shortName.slice(0, 100), value: i.shortName })));
    await interaction.editReply({ embeds: [infoEmbed("Add Scrap Item", `${results.length} match(es) - pick one:`)], components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }

  if (action === "cfg_scrap_item_details_modal") {
    await interaction.deferUpdate();
    const name = interaction.fields.getTextInputValue("name").trim();
    const emoji = interaction.fields.getTextInputValue("emoji").trim();
    const priceRaw = interaction.fields.getTextInputValue("price").trim();
    const weight = Number(interaction.fields.getTextInputValue("weight"));

    let fields;
    const rangeMatch = priceRaw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      fields = { name, emoji: emoji || null, price_mode: "random", min_price: Number(rangeMatch[1]), max_price: Number(rangeMatch[2]), drop_weight: weight };
    } else if (Number.isFinite(Number(priceRaw))) {
      fields = { name, emoji: emoji || null, price_mode: "fixed", fixed_price: Number(priceRaw), drop_weight: weight };
    } else {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Price", "Enter a single number (e.g. 5) or a range (e.g. 10-30).")], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    if (!name || !Number.isFinite(weight) || weight <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Name is required and drop weight must be a positive number.")], components: [backRow("gamespanel:cfg_scrap_back")] });
      return;
    }
    db.createScrapItem(guildId, fields);
    await interaction.editReply({ embeds: [successEmbed("Item Added", `**${emoji || "🔩"} ${name}** added to the catalog.`)], components: [backRow("gamespanel:cfg_scrap_back")] });
    return;
  }

  if (action === "lootbox_wager_modal") {
    const server = parts[2];
    const boxKey = parts[3];
    const wager = Number(interaction.fields.getTextInputValue("wager"));
    if (!Number.isFinite(wager) || wager <= 0) {
      await interaction.reply({ embeds: [dangerEmbed("Invalid Wager", "Enter a positive number.")], ephemeral: true });
      return;
    }
    // Ephemeral - only the player who wagered sees their own win/lose
    // result; utils/lootboxPanel.js's announceRoll() separately posts a
    // brief public notice to the configured games channel, so the server
    // still sees big wins without every roll's full image being public.
    await interaction.deferReply({ ephemeral: true });
    const result = await rollLootbox({
      guild: interaction.guild,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      boxKey,
      wager,
      serverName: server === DEFAULT_SERVER_VALUE ? undefined : server,
    });
    if (result.error) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", result.error)] });
      return;
    }
    await interaction.editReply(result);
    return;
  }

  if (action === "cfg_set_bet_modal") {
    await interaction.deferUpdate();
    const boxKey = parts[2];
    const currencyName = interaction.fields.getTextInputValue("currency").trim();
    const minBet = Number(interaction.fields.getTextInputValue("min_bet"));
    const maxBet = Number(interaction.fields.getTextInputValue("max_bet"));
    const winRate = Number(interaction.fields.getTextInputValue("win_rate"));
    const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
    if (!currency || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || !Number.isFinite(winRate) || minBet > maxBet) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Check the currency name exists (see /shop-panel) and the numbers make sense.")], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
      return;
    }
    db.setLootboxSettings(guildId, boxKey, currency.id, minBet, maxBet, Math.max(0, Math.min(100, winRate)));
    await interaction.editReply({ embeds: [successEmbed("Bet Settings Updated", `Bet **${minBet}-${maxBet} ${currency.emoji || ""} ${currency.name}**, **${winRate}%** win rate.`)], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
    return;
  }

  if (action === "cfg_set_claim_modal") {
    await interaction.deferUpdate();
    const delaySec = Number(interaction.fields.getTextInputValue("delay_sec"));
    const message = interaction.fields.getTextInputValue("message").trim();
    if (!Number.isFinite(delaySec) || delaySec < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Delay must be a number ≥ 0.")], components: [] });
      return;
    }
    db.setConfig(guildId, "lootbox_claim_delay_sec", delaySec);
    db.setConfig(guildId, "lootbox_claim_message", message);
    await interaction.editReply({ embeds: [successEmbed("Claim Settings Updated", `**Delay:** ${delaySec}s\n**Message:** ${message}`)], components: [] });
    return;
  }

  if (action === "cfg_item_search_modal") {
    await interaction.deferUpdate();
    const boxKey = parts[2];
    const query = interaction.fields.getTextInputValue("query").trim();
    const results = searchItems(query, 25);
    if (!results.length) {
      await interaction.editReply({ embeds: [dangerEmbed("No Matches", `Nothing found for "${query}" - try a different search.`)], components: [backRow(`gamespanel:cfg_box_select_direct:${boxKey}`)] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("gamespanel:cfg_pick_item")
      .setPlaceholder("Which item?")
      .addOptions(results.map((i) => ({ label: i.name.slice(0, 100), description: i.shortName.slice(0, 100), value: i.shortName })));
    await interaction.editReply({ embeds: [infoEmbed("Add Reward", `${results.length} match(es) - pick one:`)], components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }

  if (action === "cfg_reward_details_modal") {
    await interaction.deferUpdate();
    const key = draftKey(guildId, interaction.user.id);
    const draft = draftState.get(key);
    if (!draft) {
      await interaction.editReply({ embeds: [dangerEmbed("Expired", "That flow expired - start again with Add Reward.")], components: [] });
      return;
    }
    const displayName = interaction.fields.getTextInputValue("display_name").trim() || draft.displayName;
    const weight = Math.max(1, Math.round(Number(interaction.fields.getTextInputValue("weight")) || 1));
    const amount = Number(interaction.fields.getTextInputValue("amount")) || 1;
    const imageUrlInput = interaction.fields.getTextInputValue("image_url").trim();

    const id = db.addLootboxReward(guildId, draft.boxKey, {
      rewardType: draft.rewardType,
      rewardRef: draft.rewardRef,
      amount,
      weight,
      displayName,
      imageUrl: imageUrlInput || draft.imageUrl,
    });
    draftState.delete(key);

    await interaction.editReply({
      embeds: [successEmbed("Reward Added", `**#${id}** ${displayName} added (weight ${weight}${amount !== 1 ? `, amount ${amount}` : ""}).`)],
      components: [backRow(`gamespanel:cfg_box_select_direct:${draft.boxKey}`)],
    });
  }
}

module.exports = { buildHub, deployGamesPanel, handleComponent, handleModal };

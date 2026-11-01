"use strict";

/**
 * Dynamic Adaptive Kit Engine - Admin Configuration Panel (/autokit-config).
 * Deliberately its own dedicated panel, separate from utils/kitPanel.js's
 * simpler kit_registry hub - per the user's own blueprint, the Admin Config
 * Panel and the Player Control Panel must stay structurally isolated (no
 * settings/timers/hex fields ever leak into the player-facing side, see
 * utils/kitPanel.js's Vehicle Delivery / Remote QuickChat additions).
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const db = require("../database/db");
const { hasAdminClearance } = require("./teamAuth");
const { isValidHex } = require("./messageStyle");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const roleColorsConfig = require("../config/roleColors");
const KIT_ROLE_COLORS = roleColorsConfig.KOBABOT_KIT_COLORS || {};
const { QUICK_CHAT_TRIGGERS, TELEPORT_TRIGGER_IDS, NON_TELEPORT_TRIGGER_IDS } = require("../config/quickChatTriggers");
const { ALL_VEHICLE_SHORTNAMES, FUEL_VEHICLE_SHORTNAMES } = require("../config/vehicleShortnames");

/** "Teleport North" from "d11_quick_chat_teleport_north", "Teleport Home" from "d11_quick_chat_teleport_home" - reuses the same plain-English labels already in QUICK_CHAT_TRIGGERS. */
const TELEPORT_LABELS = Object.fromEntries(TELEPORT_TRIGGER_IDS.map((id) => [id, QUICK_CHAT_TRIGGERS[id]]));
/** Vehicle picker options are keyed by SHORTNAME (the value actually needed for entity.spawn), inverted from ALL_VEHICLE_SHORTNAMES's label->shortname shape. */
const VEHICLE_SHORTNAME_IDS = Object.values(ALL_VEHICLE_SHORTNAMES);
const VEHICLE_LABELS = Object.fromEntries(Object.entries(ALL_VEHICLE_SHORTNAMES).map(([label, shortname]) => [shortname, label]));

/**
 * Chat Trigger options (added 2026-09-19, per explicit user correction:
 * "chat trigger needs to also be a dropdown menu with plain text not the
 * quickchat strings") - the STORED quickchat_id is always the real
 * d11_quick_chat_* id (what the game itself broadcasts), the dropdown
 * shows the plain-English label from config/quickChatTriggers.js. 44
 * entries exceeds Discord's 25-option limit, paginated same as Kit Profile.
 */

/**
 * Kit Profile options (added 2026-09-19, per explicit user correction: "new
 * kit engine binding needs to be dropdown ... thats why the roles freekit,
 * freekit2, vip, elitekit1-elitekit40") - sourced from the SAME
 * KIT_ROLE_COLORS list every kit-tier Discord role is generated from
 * (config/roleColors.js), not free-typed. 43 entries exceeds Discord's
 * 25-option select limit, so this paginates 25 per page rather than
 * dropping any.
 */
const KIT_PROFILE_KEYS = Object.keys(KIT_ROLE_COLORS);
const KIT_PROFILE_PAGE_SIZE = 25;

/**
 * Builds a paginated select + Prev/Next/Cancel nav row for a fixed option
 * list (Kit Profile or Chat Trigger). `selectAction`/`pageAction` are plain
 * action-name segments (no embedded ":") so customId parsing
 * (`interaction.customId.split(":")`) always lands cleanly regardless of
 * how many extra context segments (e.g. an in-progress binding's id, or a
 * just-picked kit key) get appended after them.
 */
function paginatedPickerView(allIds, allLabels, { selectAction, pageAction, extraSegments = [], page, placeholder, backCustomId }) {
  const pageSize = KIT_PROFILE_PAGE_SIZE;
  const maxPage = Math.ceil(allIds.length / pageSize) - 1;
  const start = page * pageSize;
  const pageIds = allIds.slice(start, start + pageSize);
  const extra = extraSegments.length ? `:${extraSegments.join(":")}` : "";

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${selectAction}${extra}`)
    .setPlaceholder(`${placeholder} (page ${page + 1}/${maxPage + 1})`)
    .addOptions(pageIds.map((id) => ({ label: allLabels[id], value: id })));
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${pageAction}${extra}:${page - 1}`).setLabel("⬅️ Prev Page").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`${pageAction}${extra}:${page + 1}`).setLabel("Next Page ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
    new ButtonBuilder().setCustomId(backCustomId).setLabel("✖️ Cancel").setStyle(ButtonStyle.Danger)
  );
  return [new ActionRowBuilder().addComponents(menu), navRow];
}

const KIT_PROFILE_LABELS = Object.fromEntries(KIT_PROFILE_KEYS.map((k) => [k, k]));

function requireAdmin(interaction) {
  return hasAdminClearance(interaction);
}

function backRow(customId = "autokit:list") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

function triggerLabel(quickchatId) {
  return QUICK_CHAT_TRIGGERS[quickchatId] || quickchatId;
}

function summaryLine(m) {
  const flags = [m.enabled ? "🟢" : "🔴", m.required_role_id ? "🔒" : null].filter(Boolean).join(" ");
  return `${flags} **${triggerLabel(m.quickchat_id)}** → ${m.display_name || m.kit_name} \`(${m.kit_name})\``;
}

function buildList(guildId) {
  const mappings = db.listAutokitMappings(guildId);
  const embed = infoEmbed(
    "🔌 Dynamic Adaptive Kit Engine",
    mappings.length
      ? `**${mappings.length}** trigger binding(s) configured:\n\n${mappings.map(summaryLine).join("\n")}`
      : "No trigger bindings yet - press **New Binding** to bind a chat trigger (e.g. \"/claim freekit\") to a kit."
  );
  const components = [];
  if (mappings.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("autokit:pick_edit")
          .setPlaceholder("Select a binding to edit")
          .addOptions(mappings.slice(0, 25).map((m) => ({ label: triggerLabel(m.quickchat_id).slice(0, 100), description: `${m.display_name || m.kit_name}`.slice(0, 100), value: String(m.id) })))
      )
    );
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("autokit:new").setLabel("➕ New Binding").setStyle(ButtonStyle.Success),
      // Reopens the Kit Management Hub - kitpanel.js's OWN handler, routed
      // correctly regardless of which entry point (kitpanel's "Kit Engine"
      // button, or /autokit-config directly) got us here, since customId
      // routing is prefix-based, not message-origin-based.
      new ButtonBuilder().setCustomId("kitpanel:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components };
}

/** Step 0 of New Binding - what kind of thing is this trigger delivering? Kit/Vehicle/Teleport each take a different path from here. */
function newBindingTypeSelectView() {
  return {
    embeds: [infoEmbed("New Kit Engine Binding", "What should this quick-chat trigger deliver?")],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("autokit:new_type:kit").setLabel("🎒 Kit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("autokit:new_type:vehicle").setLabel("🚗 Vehicle").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("autokit:new_type:teleport").setLabel("🧭 Teleport").setStyle(ButtonStyle.Primary)
      ),
      backRow("autokit:list"),
    ],
  };
}

/** "Elite Kit 5" from "EliteKit5", "VIP" stays "VIP", "Free Kit 2" from "FreeKit2" - readable display name auto-derived from a KIT_ROLE_COLORS key. */
function humanizeKitKey(key) {
  if (key === "VIP") return "VIP";
  return key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
}

function newBindingKitSelectView(page = 0) {
  return {
    embeds: [infoEmbed("New Kit Engine Binding (1/2)", "Pick a kit profile - the display name auto-fills from it (editable afterward).")],
    components: paginatedPickerView(KIT_PROFILE_KEYS, KIT_PROFILE_LABELS, {
      selectAction: "autokit:new_kit_select",
      pageAction: "autokit:new_kit_select_page",
      page,
      placeholder: "Choose a kit profile",
      backCustomId: "autokit:list",
    }),
  };
}

function newBindingTriggerSelectView(kitKey, page = 0) {
  return {
    embeds: [infoEmbed("New Kit Engine Binding (2/3)", `Kit profile: **${kitKey}**\n\nNow pick which quick-chat trigger delivers it.`)],
    components: paginatedPickerView(NON_TELEPORT_TRIGGER_IDS, QUICK_CHAT_TRIGGERS, {
      selectAction: "autokit:new_trigger_select",
      pageAction: "autokit:new_trigger_select_page",
      extraSegments: [kitKey],
      page,
      placeholder: "Choose a chat trigger",
      backCustomId: "autokit:new",
    }),
  };
}

/**
 * Step 3/3 - Direct vs Combo (added 2026-09-20, per the user's own KaosBot
 * reference image: kit tiers 23-44 require the player to send "Out of
 * Ammo" immediately before the real trigger, not the trigger alone - the
 * autokit_mappings.mode column already existed for exactly this ('direct'
 * | 'combo') but was never wired into either this admin panel or the
 * engine's detection logic until now.
 */
function newBindingModeSelectView(kitKey, triggerId) {
  const encodedKey = encodeURIComponent(kitKey);
  return {
    embeds: [
      infoEmbed(
        "New Kit Engine Binding (3/3)",
        `Kit profile: **${kitKey}**\nTrigger: **${QUICK_CHAT_TRIGGERS[triggerId]}**\n\n**Direct** - the trigger alone delivers it.\n**Combo** - the player must send "Out of Ammo" immediately before the trigger (per the reference mapping's tier 23-44 behavior).`
      ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`autokit:new_mode_select:${encodedKey}:${triggerId}:direct`).setLabel("Direct").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`autokit:new_mode_select:${encodedKey}:${triggerId}:combo`).setLabel("Combo (after Out of Ammo)").setStyle(ButtonStyle.Secondary)
      ),
      backRow(`autokit:new_trigger_select:${encodedKey}:0`),
    ],
  };
}

// ---------------------------------------------------------------------------
// Vehicle bindings (2026-09-19, per explicit user request) - same trigger
// dropdown as Kit, admin also picks a vehicle from
// config/vehicleShortnames.js and, if it actually burns fuel, how much Low
// Grade Fuel to add to the PLAYER's inventory alongside it (delivered the
// same confirmed `kit add`/`kit givetoplayer` way as every shop item -
// utils/shopDelivery.js - not into the vehicle's tank directly, which has
// no confirmed RCON mechanism).
// ---------------------------------------------------------------------------

function newVehicleSelectView() {
  return {
    embeds: [infoEmbed("New Kit Engine Binding - Vehicle (1/2)", "Pick a vehicle to make claimable via a quick-chat trigger.")],
    components: paginatedPickerView(VEHICLE_SHORTNAME_IDS, VEHICLE_LABELS, {
      selectAction: "autokit:new_vehicle_select",
      pageAction: "autokit:new_vehicle_select_page",
      page: 0,
      placeholder: "Choose a vehicle",
      backCustomId: "autokit:new",
    }),
  };
}

function newVehicleTriggerSelectView(shortname, page = 0) {
  return {
    embeds: [infoEmbed("New Kit Engine Binding - Vehicle (2/2)", `Vehicle: **${VEHICLE_LABELS[shortname]}**\n\nNow pick which quick-chat trigger delivers it.`)],
    components: paginatedPickerView(NON_TELEPORT_TRIGGER_IDS, QUICK_CHAT_TRIGGERS, {
      selectAction: "autokit:new_vehicle_trigger_select",
      pageAction: "autokit:new_vehicle_trigger_select_page",
      extraSegments: [encodeURIComponent(shortname)],
      page,
      placeholder: "Choose a chat trigger",
      backCustomId: "autokit:new_type:vehicle",
    }),
  };
}

function fuelAmountModal(shortname, triggerId) {
  const modal = new ModalBuilder().setCustomId(`autokit:vehicle_fuel_modal:${encodeURIComponent(shortname)}:${triggerId}`).setTitle("Low Grade Fuel Amount");
  const input = new TextInputBuilder().setCustomId("value").setLabel("How much Low Grade Fuel to give (0 = none)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue("0");
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

// ---------------------------------------------------------------------------
// Teleport bindings (2026-09-19, per explicit user request) - the 9
// compass/home quick-chat triggers, each with its own admin-set fixed
// destination coordinate - except Home, which is per-PLAYER (captured via
// their own "Set Home" button in the Player Panel, see utils/playerPanel.js)
// rather than one shared admin coordinate.
// ---------------------------------------------------------------------------

function newTeleportSelectView() {
  return {
    embeds: [infoEmbed("New Kit Engine Binding - Teleport", "Pick which teleport trigger to configure.")],
    components: paginatedPickerView(TELEPORT_TRIGGER_IDS, TELEPORT_LABELS, {
      selectAction: "autokit:new_teleport_select",
      pageAction: "autokit:new_teleport_select_page",
      page: 0,
      placeholder: "Choose a teleport trigger",
      backCustomId: "autokit:new",
    }),
  };
}

/** "d11_quick_chat_teleport_north_east" -> "north_east" - matches teleport_waypoints.direction's key convention. */
function directionFromTriggerId(triggerId) {
  return triggerId.replace("d11_quick_chat_teleport_", "");
}

function teleportCoordsModal(triggerId, current) {
  const modal = new ModalBuilder().setCustomId(`autokit:teleport_coords_modal:${triggerId}`).setTitle("Teleport Destination");
  const x = new TextInputBuilder().setCustomId("x").setLabel("X coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  const y = new TextInputBuilder().setCustomId("y").setLabel("Y coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  const z = new TextInputBuilder().setCustomId("z").setLabel("Z coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  if (current) {
    x.setValue(String(current.x));
    y.setValue(String(current.y));
    z.setValue(String(current.z));
  }
  modal.addComponents(new ActionRowBuilder().addComponents(x), new ActionRowBuilder().addComponents(y), new ActionRowBuilder().addComponents(z));
  return modal;
}

function changeKitProfileView(bindingId, page = 0) {
  return {
    embeds: [infoEmbed("Change Kit Profile", "Pick a new kit profile for this binding - its display name updates to match; the trigger stays as-is.")],
    components: paginatedPickerView(KIT_PROFILE_KEYS, KIT_PROFILE_LABELS, {
      selectAction: "autokit:change_kit_select",
      pageAction: "autokit:change_kit_select_page",
      extraSegments: [bindingId],
      page,
      placeholder: "Choose a kit profile",
      backCustomId: `autokit:edit:${bindingId}`,
    }),
  };
}

function changeTriggerView(bindingId, page = 0) {
  return {
    embeds: [infoEmbed("Change Chat Trigger", "Pick a new quick-chat trigger for this binding.")],
    components: paginatedPickerView(NON_TELEPORT_TRIGGER_IDS, QUICK_CHAT_TRIGGERS, {
      selectAction: "autokit:change_trigger_select",
      pageAction: "autokit:change_trigger_select_page",
      extraSegments: [bindingId],
      page,
      placeholder: "Choose a chat trigger",
      backCustomId: `autokit:edit:${bindingId}`,
    }),
  };
}

function changeVehicleView(bindingId, page = 0) {
  return {
    embeds: [infoEmbed("Change Vehicle", "Pick a different vehicle for this binding - its display name and fuel setting reset to match.")],
    components: paginatedPickerView(VEHICLE_SHORTNAME_IDS, VEHICLE_LABELS, {
      selectAction: "autokit:change_vehicle_select",
      pageAction: "autokit:change_vehicle_select_page",
      extraSegments: [bindingId],
      page,
      placeholder: "Choose a vehicle",
      backCustomId: `autokit:edit:${bindingId}`,
    }),
  };
}

function serverRoutingRow(guildId, mapping) {
  const servers = db.listGuildServers(guildId);
  const currentScope = mapping.server_scope ? JSON.parse(mapping.server_scope) : [];
  const options = [
    { label: "Default Connection", value: "__default__", default: currentScope.includes("__default__") },
    ...servers.map((s) => ({ label: s.server_name, value: s.server_name, default: currentScope.includes(s.server_name) })),
  ].slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`autokit:server_scope:${mapping.id}`)
    .setPlaceholder("Server routing (none selected = every server)")
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildEditor(guildId, id) {
  const m = db.getAutokitMapping(guildId, id);
  if (!m) return { embeds: [dangerEmbed("Not Found", "That binding no longer exists.")], components: [backRow()] };

  const type = m.binding_type || "kit";
  const scope = m.server_scope ? JSON.parse(m.server_scope) : [];
  const typeSpecificLine =
    type === "vehicle"
      ? `**Vehicle:** ${m.display_name} · **Fuel:** ${m.fuel_amount || 0} Low Grade Fuel\n`
      : type === "teleport"
      ? m.quickchat_id === "d11_quick_chat_teleport_home"
        ? "**Destination:** the player's own saved Home (set via Player Panel)\n"
        : (() => {
            const wp = db.getTeleportWaypoint(guildId, m.kit_name);
            return wp ? `**Destination:** ${wp.x}, ${wp.y}, ${wp.z}\n` : "**Destination:** _not set_\n";
          })()
      : `**Kit:** \`${m.kit_name}\` (${m.display_name || "no display name"})\n**Mode:** ${m.mode === "combo" ? 'Combo (needs "Out of Ammo" first)' : "Direct"}\n`;
  const embed = infoEmbed(
    `🔌 Editing: ${triggerLabel(m.quickchat_id)}`,
    `**Type:** ${type === "vehicle" ? "🚗 Vehicle" : type === "teleport" ? "🧭 Teleport" : "🎒 Kit"}\n` +
      typeSpecificLine +
      `${type !== "teleport" ? `**Color:** ${m.color_hex || "_default_"}\n**Delivery Delay:** ${m.delivery_delay_seconds}s\n` : ""}` +
      `**Cooldown:** ${m.cooldown_minutes}m\n` +
      `**Claim Message:** ${m.claim_message_enabled ? "On" : "Off"} · **Cooldown Notice:** ${m.cooldown_notice_enabled ? "On" : "Off"}\n` +
      `**Role Requirement:** ${m.required_role_id ? `<@&${m.required_role_id}>` : "Everyone"}\n` +
      `**Server Routing:** ${scope.length ? scope.join(", ") : "Every linked server"}\n` +
      `**Status:** ${m.enabled ? "🟢 Enabled" : "🔴 Disabled"}`
  );

  const row1Buttons = [];
  if (type === "kit") {
    row1Buttons.push(
      new ButtonBuilder().setCustomId(`autokit:change_kit:${id}`).setLabel("🎒 Change Kit Profile").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`autokit:set_trigger:${id}`).setLabel("💬 Change Trigger").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`autokit:set_color:${id}`).setLabel("🎨 Set Color Hex").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`autokit:set_delay:${id}`).setLabel("⏱️ Delivery Delay").setStyle(ButtonStyle.Secondary)
    );
  } else if (type === "vehicle") {
    row1Buttons.push(
      new ButtonBuilder().setCustomId(`autokit:change_vehicle:${id}`).setLabel("🚗 Change Vehicle").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`autokit:set_trigger:${id}`).setLabel("💬 Change Trigger").setStyle(ButtonStyle.Secondary)
    );
    if (FUEL_VEHICLE_SHORTNAMES.has(m.kit_name)) row1Buttons.push(new ButtonBuilder().setCustomId(`autokit:set_fuel:${id}`).setLabel("⛽ Set Fuel Amount").setStyle(ButtonStyle.Secondary));
  } else {
    if (m.quickchat_id !== "d11_quick_chat_teleport_home") {
      row1Buttons.push(new ButtonBuilder().setCustomId(`autokit:set_teleport_coords:${id}`).setLabel("🧭 Set Destination").setStyle(ButtonStyle.Secondary));
    }
  }
  row1Buttons.push(new ButtonBuilder().setCustomId(`autokit:set_cooldown:${id}`).setLabel("🔁 Cooldown Duration").setStyle(ButtonStyle.Secondary));
  const row1 = new ActionRowBuilder().addComponents(row1Buttons.slice(0, 5));
  const row2 = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`autokit:set_role:${id}`).setPlaceholder("Role Requirement (optional)"));
  const row3 = serverRoutingRow(guildId, m);
  const row4Buttons = [
    new ButtonBuilder().setCustomId(`autokit:toggle_claim:${id}`).setLabel(`Claim Message: ${m.claim_message_enabled ? "ON" : "OFF"}`).setStyle(m.claim_message_enabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`autokit:toggle_cooldown_notice:${id}`).setLabel(`Cooldown Notice: ${m.cooldown_notice_enabled ? "ON" : "OFF"}`).setStyle(m.cooldown_notice_enabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`autokit:toggle_enabled:${id}`).setLabel(`Status: ${m.enabled ? "ENABLED" : "DISABLED"}`).setStyle(m.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
  ];
  if (type === "kit") {
    row4Buttons.push(
      new ButtonBuilder().setCustomId(`autokit:toggle_mode:${id}`).setLabel(m.mode === "combo" ? "Mode: COMBO" : "Mode: DIRECT").setStyle(m.mode === "combo" ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }
  const row4 = new ActionRowBuilder().addComponents(row4Buttons);
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`autokit:delete:${id}`).setLabel("🗑️ Delete Binding").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("autokit:list").setLabel("⬅️ Back To List").setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

function numberModal(customId, title, label, currentValue) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder().setCustomId("value").setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
  if (currentValue !== undefined && currentValue !== null) input.setValue(String(currentValue));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleComponent(interaction) {
  if (!requireAdmin(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
    return;
  }

  const parts = interaction.customId.split(":");
  const action = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;
  const guildId = interaction.guildId;

  if (action === "list") {
    await interaction.update(buildList(guildId));
    return;
  }

  // ---- New Binding: step 0 (type), then type-specific steps ----
  if (action === "new") {
    await interaction.update(newBindingTypeSelectView());
    return;
  }

  if (action === "new_type") {
    const type = parts[2];
    if (type === "kit") await interaction.update(newBindingKitSelectView(0));
    else if (type === "vehicle") await interaction.update(newVehicleSelectView());
    else if (type === "teleport") await interaction.update(newTeleportSelectView());
    return;
  }

  // -- Vehicle path --
  if (action === "new_vehicle_select_page") {
    await interaction.update(newVehicleSelectView());
    return;
  }

  if (action === "new_vehicle_select") {
    const shortname = interaction.values[0];
    await interaction.update(newVehicleTriggerSelectView(shortname, 0));
    return;
  }

  if (action === "new_vehicle_trigger_select_page") {
    const shortname = decodeURIComponent(parts[2]);
    const page = Number(parts[3]);
    await interaction.update(newVehicleTriggerSelectView(shortname, page));
    return;
  }

  if (action === "new_vehicle_trigger_select") {
    const shortname = decodeURIComponent(parts[2]);
    const triggerId = interaction.values[0];
    if (FUEL_VEHICLE_SHORTNAMES.has(shortname)) {
      await interaction.showModal(fuelAmountModal(shortname, triggerId));
    } else {
      const created = db.createAutokitMapping(guildId, triggerId, { bindingType: "vehicle", kitName: shortname, displayName: VEHICLE_LABELS[shortname], fuelAmount: 0 });
      await interaction.update(buildEditor(guildId, created.id));
    }
    return;
  }

  // -- Teleport path --
  if (action === "new_teleport_select_page") {
    await interaction.update(newTeleportSelectView());
    return;
  }

  if (action === "new_teleport_select") {
    const triggerId = interaction.values[0];
    if (triggerId === "d11_quick_chat_teleport_home") {
      // Home has no admin-set coordinate - it reads the PLAYER's own saved
      // player_homes row live at trigger time instead (see utils/playerPanel.js's
      // "Set Home" button).
      const created = db.createAutokitMapping(guildId, triggerId, { bindingType: "teleport", kitName: "home", displayName: "Teleport Home" });
      await interaction.update(buildEditor(guildId, created.id));
    } else {
      await interaction.showModal(teleportCoordsModal(triggerId));
    }
    return;
  }

  if (action === "new_kit_select_page") {
    await interaction.update(newBindingKitSelectView(Number(parts[2])));
    return;
  }

  if (action === "new_kit_select") {
    const kitKey = interaction.values[0];
    await interaction.update(newBindingTriggerSelectView(kitKey, 0));
    return;
  }

  if (action === "new_trigger_select_page") {
    const kitKey = parts[2];
    const page = Number(parts[3]);
    await interaction.update(newBindingTriggerSelectView(kitKey, page));
    return;
  }

  if (action === "new_trigger_select") {
    const kitKey = parts[2];
    const triggerId = interaction.values[0];
    await interaction.update(newBindingModeSelectView(kitKey, triggerId));
    return;
  }

  if (action === "new_mode_select") {
    const kitKey = decodeURIComponent(parts[2]);
    const triggerId = parts[3];
    const mode = parts[4];
    const created = db.createAutokitMapping(guildId, triggerId, { kitName: kitKey.toLowerCase(), displayName: humanizeKitKey(kitKey), mode });
    await interaction.update(buildEditor(guildId, created.id));
    return;
  }

  // ---- Editor: change kit profile / change trigger (re-uses the same pickers) ----
  if (action === "change_kit") {
    await interaction.update(changeKitProfileView(id, 0));
    return;
  }

  if (action === "change_kit_select_page") {
    const bindingId = Number(parts[2]);
    const page = Number(parts[3]);
    await interaction.update(changeKitProfileView(bindingId, page));
    return;
  }

  if (action === "change_kit_select") {
    const bindingId = Number(parts[2]);
    const key = interaction.values[0];
    db.updateAutokitMapping(guildId, bindingId, { kitName: key.toLowerCase(), displayName: humanizeKitKey(key) });
    await interaction.update(buildEditor(guildId, bindingId));
    return;
  }

  if (action === "set_trigger") {
    await interaction.update(changeTriggerView(id, 0));
    return;
  }

  if (action === "change_trigger_select_page") {
    const bindingId = Number(parts[2]);
    const page = Number(parts[3]);
    await interaction.update(changeTriggerView(bindingId, page));
    return;
  }

  if (action === "change_trigger_select") {
    const bindingId = Number(parts[2]);
    const triggerId = interaction.values[0];
    db.updateAutokitMapping(guildId, bindingId, { trigger: triggerId });
    await interaction.update(buildEditor(guildId, bindingId));
    return;
  }

  if (action === "pick_edit") {
    await interaction.update(buildEditor(guildId, Number(interaction.values[0])));
    return;
  }

  if (action === "edit") {
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "set_color") {
    const m = db.getAutokitMapping(guildId, id);
    await interaction.showModal(numberModal(`autokit:set_color_modal:${id}`, "Set Color Hex", "6-character hex, e.g. FF5733", m?.color_hex?.replace("#", "")));
    return;
  }

  if (action === "set_delay") {
    const m = db.getAutokitMapping(guildId, id);
    await interaction.showModal(numberModal(`autokit:set_delay_modal:${id}`, "Delivery Delay", "Seconds to wait before delivery (0 = instant)", m?.delivery_delay_seconds));
    return;
  }

  if (action === "set_cooldown") {
    const m = db.getAutokitMapping(guildId, id);
    await interaction.showModal(numberModal(`autokit:set_cooldown_modal:${id}`, "Cooldown Duration", "Minutes between uses (0 = no cooldown)", m?.cooldown_minutes));
    return;
  }

  if (action === "change_vehicle") {
    await interaction.update(changeVehicleView(id, 0));
    return;
  }

  if (action === "change_vehicle_select_page") {
    const bindingId = Number(parts[2]);
    const page = Number(parts[3]);
    await interaction.update(changeVehicleView(bindingId, page));
    return;
  }

  if (action === "change_vehicle_select") {
    const bindingId = Number(parts[2]);
    const shortname = interaction.values[0];
    db.updateAutokitMapping(guildId, bindingId, { kitName: shortname, displayName: VEHICLE_LABELS[shortname], fuelAmount: 0 });
    await interaction.update(buildEditor(guildId, bindingId));
    return;
  }

  if (action === "set_fuel") {
    const m = db.getAutokitMapping(guildId, id);
    await interaction.showModal(numberModal(`autokit:set_fuel_modal:${id}`, "Low Grade Fuel Amount", "How much Low Grade Fuel to give (0 = none)", m?.fuel_amount));
    return;
  }

  if (action === "set_teleport_coords") {
    const m = db.getAutokitMapping(guildId, id);
    const current = db.getTeleportWaypoint(guildId, m.kit_name);
    await interaction.showModal(teleportCoordsModal(`edit:${id}`, current));
    return;
  }

  if (action === "set_role") {
    const roleId = interaction.values[0] || null;
    db.updateAutokitMapping(guildId, id, { requiredRoleId: roleId });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "server_scope") {
    db.updateAutokitMapping(guildId, id, { serverScope: JSON.stringify(interaction.values) });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "toggle_claim") {
    const m = db.getAutokitMapping(guildId, id);
    db.updateAutokitMapping(guildId, id, { claimMessageEnabled: m.claim_message_enabled ? 0 : 1 });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "toggle_cooldown_notice") {
    const m = db.getAutokitMapping(guildId, id);
    db.updateAutokitMapping(guildId, id, { cooldownNoticeEnabled: m.cooldown_notice_enabled ? 0 : 1 });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "toggle_enabled") {
    const m = db.getAutokitMapping(guildId, id);
    db.updateAutokitMapping(guildId, id, { enabled: m.enabled ? 0 : 1 });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "toggle_mode") {
    const m = db.getAutokitMapping(guildId, id);
    db.updateAutokitMapping(guildId, id, { mode: m.mode === "combo" ? "direct" : "combo" });
    await interaction.update(buildEditor(guildId, id));
    return;
  }

  if (action === "delete") {
    db.deleteAutokitMapping(guildId, id);
    await interaction.update({ embeds: [successEmbed("Binding Deleted", "That trigger binding was removed.")], components: [backRow()] });
    return;
  }
}

async function handleModal(interaction) {
  if (!requireAdmin(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
    return;
  }

  const parts = interaction.customId.split(":");
  const action = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;
  const guildId = interaction.guildId;

  if (action === "vehicle_fuel_modal") {
    await interaction.deferUpdate();
    const shortname = decodeURIComponent(parts[2]);
    const triggerId = parts[3];
    const fuel = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(fuel) || fuel < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number.")], components: [backRow("autokit:list")] });
      return;
    }
    const created = db.createAutokitMapping(guildId, triggerId, { bindingType: "vehicle", kitName: shortname, displayName: VEHICLE_LABELS[shortname], fuelAmount: Math.round(fuel) });
    await interaction.editReply(buildEditor(guildId, created.id));
    return;
  }

  if (action === "teleport_coords_modal") {
    await interaction.deferUpdate();
    const x = Number(interaction.fields.getTextInputValue("x"));
    const y = Number(interaction.fields.getTextInputValue("y"));
    const z = Number(interaction.fields.getTextInputValue("z"));
    if (![x, y, z].every(Number.isFinite)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Coordinates", "X/Y/Z must all be numbers.")], components: [backRow("autokit:list")] });
      return;
    }
    if (parts[2] === "edit") {
      // Editing an existing binding's destination, not creating a new one.
      const bindingId = Number(parts[3]);
      const binding = db.getAutokitMapping(guildId, bindingId);
      db.setTeleportWaypoint(guildId, binding.kit_name, x, y, z);
      await interaction.editReply(buildEditor(guildId, bindingId));
      return;
    }
    const triggerId = parts[2];
    db.setTeleportWaypoint(guildId, directionFromTriggerId(triggerId), x, y, z);
    const created = db.createAutokitMapping(guildId, triggerId, { bindingType: "teleport", kitName: directionFromTriggerId(triggerId), displayName: TELEPORT_LABELS[triggerId] });
    await interaction.editReply(buildEditor(guildId, created.id));
    return;
  }

  if (action === "set_fuel_modal") {
    await interaction.deferUpdate();
    const fuel = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(fuel) || fuel < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number.")], components: [backRow(`autokit:edit:${id}`)] });
      return;
    }
    db.updateAutokitMapping(guildId, id, { fuelAmount: Math.round(fuel) });
    await interaction.editReply(buildEditor(guildId, id));
    return;
  }

  if (action === "set_color_modal") {
    await interaction.deferUpdate();
    const raw = interaction.fields.getTextInputValue("value").trim().replace(/^#/, "");
    const hex = `#${raw}`;
    if (!isValidHex(hex)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex", "Enter exactly 6 hex characters, e.g. FF5733."), ], components: [backRow(`autokit:edit:${id}`)] });
      return;
    }
    db.updateAutokitMapping(guildId, id, { colorHex: hex });
    await interaction.editReply(buildEditor(guildId, id));
    return;
  }

  if (action === "set_delay_modal") {
    await interaction.deferUpdate();
    const seconds = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(seconds) || seconds < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number of seconds.")], components: [backRow(`autokit:edit:${id}`)] });
      return;
    }
    db.updateAutokitMapping(guildId, id, { deliveryDelaySeconds: Math.round(seconds) });
    await interaction.editReply(buildEditor(guildId, id));
    return;
  }

  if (action === "set_cooldown_modal") {
    await interaction.deferUpdate();
    const minutes = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(minutes) || minutes < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number of minutes.")], components: [backRow(`autokit:edit:${id}`)] });
      return;
    }
    db.updateAutokitMapping(guildId, id, { cooldownMinutes: Math.round(minutes) });
    await interaction.editReply(buildEditor(guildId, id));
    return;
  }
}

module.exports = { buildList, handleComponent, handleModal };

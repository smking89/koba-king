"use strict";

/**
 * Coordinate-Spawned Item Events (Pyramid/Bridge/House) - KOBABOT_FULL_ROADMAP.md
 * Phase 5. Admin-triggerable mini-event: spawns a cluster of loot-crate-type
 * entities in a named geometric shape at a chosen map coordinate, for
 * players to rush. The actual offset math and RCON loop live in
 * utils/shapeSpawnEvents.js - this file is the Games Panel Configure-flow
 * surface (utils/gamesPanel.js), moved here (2026-10-12) from a standalone
 * /coordevent slash command per the established convention that admin-
 * triggered ambient events live behind Games Panel's Configure menu (same
 * "configureOnly" shape as vault_heist/bradley_ambush/cargo_ship_heist in
 * config/games.js), not their own top-level command.
 *
 * Reuses database/db.js's addEntitySpawnLocation/listEntitySpawnLocations/
 * removeEntitySpawnLocation (schema.sql's entity_spawn_locations table) for
 * saved-location CRUD, and gates the actual trigger on the "pro" plan tier,
 * matching Cargo Ship Heist's gamesPanel.js cfg_cargo_trigger gate (the
 * closest existing ambient/admin-triggered event feature) - only the
 * trigger action is gated, not browsing/managing saved locations, same
 * pattern as Cargo Ship Heist's own Configure menu.
 *
 * No dedicated announce-channel setting (unlike Bradley/Cargo/Vault) - that
 * would need a new settings table, which is schema work beyond this pass's
 * scope (same deferral reasoning /wipe's header gives for scheduling). The
 * announcement instead posts to whichever channel the admin has the Games
 * Panel's Configure flow open in, matching the deleted /coordevent
 * command's own behavior (it posted to `interaction.channel`, i.e.
 * wherever the command was run).
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePrintPos } = require("../rcon/parsers");
const { requirePlan } = require("./premium");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { SHAPE_NAMES, SHAPE_EVENT_ENTITIES, isValidShapeEntity, displayNameForEntity, spawnShapeEvent } = require("./shapeSpawnEvents");

// "shape picked, waiting for a location/coordinate source" - short-lived,
// single-admin-at-a-time, same in-memory Map convention as gamesPanel.js's
// own draftState/quickSetupDraft (not worth a DB table for a mid-flow pick).
const triggerDraft = new Map(); // "guildId:userId" -> { shape, center? }

function draftKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function entityOptions() {
  return Object.entries(SHAPE_EVENT_ENTITIES).map(([name, value]) => ({ label: name, value }));
}

function backRow(customId, label = "⬅️ Back") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary));
}

// ---------------------------------------------------------------------------
// Top-level admin menu (gamesPanel.js's gameAdminMenuFor("coord_events", ...))
// ---------------------------------------------------------------------------

function adminMenu(guildId) {
  const locations = db.listEntitySpawnLocations(guildId);
  const status = locations.length
    ? `**${locations.length}** saved location(s):\n` + locations.slice(0, 10).map((loc) => `• **${loc.label}** - \`${loc.x}, ${loc.y}, ${loc.z}\` (${displayNameForEntity(loc.entity_key)})`).join("\n")
    : "_No saved locations yet - save one below, or capture your live position when triggering an event._";
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_coord_manage_locations").setLabel("📍 Manage Locations").setStyle(ButtonStyle.Primary));
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gamespanel:cfg_coord_trigger_start").setLabel("🗺️ Trigger Event").setStyle(ButtonStyle.Danger));
  return { embeds: [infoEmbed("Configure: Coordinate-Spawned Events", status)], components: [row1, row2, backRow("gamespanel:cfg_back_to_game_select")] };
}

// ---------------------------------------------------------------------------
// Manage Locations
// ---------------------------------------------------------------------------

function locationsMenu(guildId) {
  const locations = db.listEntitySpawnLocations(guildId);
  const lines = locations.length
    ? locations.map((loc) => `**${loc.label}** - \`${loc.x}, ${loc.y}, ${loc.z}\` (${displayNameForEntity(loc.entity_key)})`).join("\n")
    : "_No saved locations yet._";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gamespanel:cfg_coord_add_location").setLabel("Add Location").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gamespanel:cfg_coord_remove_location").setLabel("Remove Location").setStyle(ButtonStyle.Danger).setDisabled(!locations.length)
  );
  return { embeds: [infoEmbed("📍 Saved Locations", lines)], components: [row, backRow("gamespanel:cfg_coord_back")] };
}

function addLocationEntitySelectRow() {
  const menu = new StringSelectMenuBuilder().setCustomId("gamespanel:cfg_coord_addloc_entity_select").setPlaceholder("Default loot-crate entity for this location").addOptions(entityOptions());
  return new ActionRowBuilder().addComponents(menu);
}

function addLocationModal(entityKey) {
  const modal = new ModalBuilder().setCustomId(`gamespanel:cfg_coord_addloc_modal:${entityKey}`).setTitle("Save Location");
  const labelInput = new TextInputBuilder().setCustomId("label").setLabel("Name for this location").setStyle(TextInputStyle.Short).setRequired(true);
  const xInput = new TextInputBuilder().setCustomId("x").setLabel("X coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  const yInput = new TextInputBuilder().setCustomId("y").setLabel("Y coordinate / height").setStyle(TextInputStyle.Short).setRequired(true);
  const zInput = new TextInputBuilder().setCustomId("z").setLabel("Z coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(labelInput),
    new ActionRowBuilder().addComponents(xInput),
    new ActionRowBuilder().addComponents(yInput),
    new ActionRowBuilder().addComponents(zInput)
  );
  return modal;
}

function removeLocationSelectRow(guildId) {
  const locations = db.listEntitySpawnLocations(guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_coord_removeloc_select")
    .setPlaceholder("Which location to remove?")
    .addOptions(locations.slice(0, 25).map((loc) => ({ label: loc.label.slice(0, 100), value: String(loc.id) })));
  return new ActionRowBuilder().addComponents(menu);
}

// ---------------------------------------------------------------------------
// Trigger flow
// ---------------------------------------------------------------------------

function shapeSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("gamespanel:cfg_coord_shape_select")
    .setPlaceholder("Which geometric shape?")
    .addOptions(SHAPE_NAMES.map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: s })));
  return new ActionRowBuilder().addComponents(menu);
}

function sourceSelectView(guildId, shape) {
  const locations = db.listEntitySpawnLocations(guildId);
  const components = [];
  if (locations.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("gamespanel:cfg_coord_trigger_location_select")
      .setPlaceholder("Use a saved location")
      .addOptions(locations.slice(0, 25).map((loc) => ({ label: loc.label.slice(0, 100), description: `${loc.x}, ${loc.y}, ${loc.z}`.slice(0, 100), value: String(loc.id) })));
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("gamespanel:cfg_coord_trigger_capture").setLabel("📍 Capture My Position").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("gamespanel:cfg_coord_trigger_manual").setLabel("⌨️ Manual Coordinates").setStyle(ButtonStyle.Secondary)
    )
  );
  components.push(backRow("gamespanel:cfg_coord_back"));
  return {
    embeds: [infoEmbed(`🗺️ ${shape[0].toUpperCase()}${shape.slice(1)} Event`, "Pick a saved location, capture your own live in-game position, or enter coordinates manually.")],
    components,
  };
}

function captureEntitySelectRow() {
  const menu = new StringSelectMenuBuilder().setCustomId("gamespanel:cfg_coord_trigger_capture_entity_select").setPlaceholder("Which loot-crate entity to spawn?").addOptions(entityOptions());
  return new ActionRowBuilder().addComponents(menu);
}

function manualCoordsModal() {
  const modal = new ModalBuilder().setCustomId("gamespanel:cfg_coord_trigger_manual_modal").setTitle("Manual Coordinates");
  const xInput = new TextInputBuilder().setCustomId("x").setLabel("X coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  const yInput = new TextInputBuilder().setCustomId("y").setLabel("Y coordinate / height").setStyle(TextInputStyle.Short).setRequired(true);
  const zInput = new TextInputBuilder().setCustomId("z").setLabel("Z coordinate").setStyle(TextInputStyle.Short).setRequired(true);
  const entityInput = new TextInputBuilder()
    .setCustomId("entity")
    .setLabel("Entity shortname (see Manage Locations)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(xInput),
    new ActionRowBuilder().addComponents(yInput),
    new ActionRowBuilder().addComponents(zInput),
    new ActionRowBuilder().addComponents(entityInput)
  );
  return modal;
}

/** Fires the actual spawn + both announcements (Discord + in-game), same shape as the deleted /coordevent trigger subcommand. */
async function runTrigger(interaction, shape, entityKey, center) {
  const guildId = interaction.guildId;
  const result = await spawnShapeEvent(guildId, { shape, entityKey, center });
  const entityName = displayNameForEntity(entityKey);

  const announcement = successEmbed(
    `🗺️ ${shape[0].toUpperCase()}${shape.slice(1)} Event`,
    `A **${shape}** of **${entityName}** crates has spawned at \`${center.x}, ${center.y}, ${center.z}\`!\n` +
      `**${result.spawned}/${result.attempted}** entities placed${result.failures.length ? ` (${result.failures.length} failed - see server logs)` : ""}.\n\n` +
      `Head to those coordinates to rush it before someone else does.`
  );
  const channel = interaction.channel;
  if (channel) await channel.send({ embeds: [announcement] }).catch(() => {});

  try {
    const rcon = await getRcon(guildId);
    await rcon.say(`A ${shape} of ${entityName} crates just spawned at ${center.x}, ${center.y}, ${center.z} - go get it!`);
  } catch (err) {
    console.warn(`[KOBA Bot] Coordinate Event RCON broadcast failed for guild ${guildId}:`, err.message);
  }

  triggerDraft.delete(draftKey(guildId, interaction.user.id));
  await interaction.editReply({ embeds: [successEmbed("Event Triggered", `**${result.spawned}/${result.attempted}** entities spawned - announcement posted.`)], components: [backRow("gamespanel:cfg_coord_back")] });
}

/** Handles every "cfg_coord_*" action from utils/gamesPanel.js's handleComponent - kept in this module rather than inlined there since the trigger flow has several steps/draft state of its own, same reasoning as utils/bradleyAmbush.js/utils/vaultHeist.js owning their own multi-step flows. */
async function handleConfigureAction(interaction, action, parts) {
  const guildId = interaction.guildId;
  const key = draftKey(guildId, interaction.user.id);

  if (action === "cfg_coord_back") {
    await interaction.update(adminMenu(guildId));
    return;
  }

  if (action === "cfg_coord_manage_locations") {
    await interaction.update(locationsMenu(guildId));
    return;
  }

  if (action === "cfg_coord_add_location") {
    await interaction.update({ embeds: [infoEmbed("Add Location", "Pick a default loot-crate entity for this location:")], components: [addLocationEntitySelectRow(), backRow("gamespanel:cfg_coord_manage_locations")] });
    return;
  }

  if (action === "cfg_coord_addloc_entity_select") {
    await interaction.showModal(addLocationModal(interaction.values[0]));
    return;
  }

  if (action === "cfg_coord_addloc_modal") {
    const entityKey = parts[2];
    const label = interaction.fields.getTextInputValue("label").trim();
    const x = Number(interaction.fields.getTextInputValue("x"));
    const y = Number(interaction.fields.getTextInputValue("y"));
    const z = Number(interaction.fields.getTextInputValue("z"));
    if (!label || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      await interaction.reply({ embeds: [dangerEmbed("Invalid Input", "Provide a name and 3 numeric coordinates.")], ephemeral: true });
      return;
    }
    const existing = db.listEntitySpawnLocations(guildId).find((loc) => loc.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      await interaction.reply({ embeds: [dangerEmbed("Already Exists", `A location named **${label}** already exists - remove it first if you want to replace it.`)], ephemeral: true });
      return;
    }
    db.addEntitySpawnLocation(guildId, { label, entityKey, x, y, z, createdBy: interaction.user.id });
    await interaction.reply({ embeds: [successEmbed("📍 Location Saved", `**${label}** saved at \`${x}, ${y}, ${z}\` (default entity: **${displayNameForEntity(entityKey)}**).`)], ephemeral: true });
    return;
  }

  if (action === "cfg_coord_remove_location") {
    await interaction.update({ embeds: [infoEmbed("Remove Location", "Pick one to remove:")], components: [removeLocationSelectRow(guildId), backRow("gamespanel:cfg_coord_manage_locations")] });
    return;
  }

  if (action === "cfg_coord_removeloc_select") {
    db.removeEntitySpawnLocation(guildId, Number(interaction.values[0]));
    await interaction.update(locationsMenu(guildId));
    return;
  }

  if (action === "cfg_coord_trigger_start") {
    if (!(await requirePlan(interaction, "pro", "Coordinate-Spawned Item Events"))) return;
    await interaction.update({ embeds: [infoEmbed("🗺️ Trigger Event", "Which geometric shape?")], components: [shapeSelectRow(), backRow("gamespanel:cfg_coord_back")] });
    return;
  }

  if (action === "cfg_coord_shape_select") {
    const shape = interaction.values[0];
    triggerDraft.set(key, { shape });
    await interaction.update(sourceSelectView(guildId, shape));
    return;
  }

  if (action === "cfg_coord_trigger_location_select") {
    const draft = triggerDraft.get(key);
    if (!draft) {
      await interaction.update({ embeds: [dangerEmbed("Timed Out", "Start again - pick a shape first.")], components: [backRow("gamespanel:cfg_coord_back")] });
      return;
    }
    const location = db.getEntitySpawnLocation(guildId, Number(interaction.values[0]));
    if (!location) {
      await interaction.update({ embeds: [dangerEmbed("Not Found", "That saved location no longer exists.")], components: [backRow("gamespanel:cfg_coord_back")] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Triggering...", "Spawning the event now.")], components: [] });
    await runTrigger(interaction, draft.shape, location.entity_key, { x: location.x, y: location.y, z: location.z }).catch(async (err) => {
      await interaction.editReply({ embeds: [dangerEmbed("Trigger Failed", err.message || "Something went wrong.")], components: [backRow("gamespanel:cfg_coord_back")] });
    });
    return;
  }

  if (action === "cfg_coord_trigger_capture") {
    const draft = triggerDraft.get(key);
    if (!draft) {
      await interaction.update({ embeds: [dangerEmbed("Timed Out", "Start again - pick a shape first.")], components: [backRow("gamespanel:cfg_coord_back")] });
      return;
    }
    const member = db.getMember(guildId, interaction.user.id);
    if (!member?.gamertag) {
      await interaction.update({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows which in-game character to capture, or use Manual Coordinates instead.")], components: [backRow("gamespanel:cfg_coord_back")] });
      return;
    }
    await interaction.deferUpdate();
    try {
      const rcon = await getRcon(guildId);
      const pos = parsePrintPos(await rcon.send(`server.printpos "${member.gamertag}"`));
      if (!pos) {
        await interaction.editReply({ embeds: [dangerEmbed("Couldn't Locate You", "You need to be online and in-game to capture your position this way - or use Manual Coordinates.")], components: [backRow("gamespanel:cfg_coord_back")] });
        return;
      }
      triggerDraft.set(key, { ...draft, center: pos });
      await interaction.editReply({ embeds: [infoEmbed("Position Captured", `Captured \`${pos.x}, ${pos.y}, ${pos.z}\` - which loot-crate entity to spawn?`)], components: [captureEntitySelectRow(), backRow("gamespanel:cfg_coord_back")] });
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("RCON Unreachable", `Couldn't reach the Rust server: ${err.message}`)], components: [backRow("gamespanel:cfg_coord_back")] });
    }
    return;
  }

  if (action === "cfg_coord_trigger_capture_entity_select") {
    const draft = triggerDraft.get(key);
    if (!draft?.center) {
      await interaction.update({ embeds: [dangerEmbed("Timed Out", "Start again - pick a shape first.")], components: [backRow("gamespanel:cfg_coord_back")] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Triggering...", "Spawning the event now.")], components: [] });
    await runTrigger(interaction, draft.shape, interaction.values[0], draft.center).catch(async (err) => {
      await interaction.editReply({ embeds: [dangerEmbed("Trigger Failed", err.message || "Something went wrong.")], components: [backRow("gamespanel:cfg_coord_back")] });
    });
    return;
  }

  if (action === "cfg_coord_trigger_manual") {
    await interaction.showModal(manualCoordsModal());
    return;
  }

  if (action === "cfg_coord_trigger_manual_modal") {
    const draft = triggerDraft.get(key);
    if (!draft) {
      await interaction.reply({ embeds: [dangerEmbed("Timed Out", "Start again - pick a shape first.")], ephemeral: true });
      return;
    }
    const x = Number(interaction.fields.getTextInputValue("x"));
    const y = Number(interaction.fields.getTextInputValue("y"));
    const z = Number(interaction.fields.getTextInputValue("z"));
    const entityKey = interaction.fields.getTextInputValue("entity").trim();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      await interaction.reply({ embeds: [dangerEmbed("Invalid Coordinates", "X, Y, and Z must all be numbers.")], ephemeral: true });
      return;
    }
    if (!isValidShapeEntity(entityKey)) {
      await interaction.reply({ embeds: [dangerEmbed("Unknown Entity", `"${entityKey}" isn't a confirmed loot-crate shortname for shape events.`)], ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await runTrigger(interaction, draft.shape, entityKey, { x, y, z }).catch(async (err) => {
      await interaction.editReply({ embeds: [dangerEmbed("Trigger Failed", err.message || "Something went wrong.")], components: [backRow("gamespanel:cfg_coord_back")] });
    });
    return;
  }
}

module.exports = { adminMenu, handleConfigureAction };

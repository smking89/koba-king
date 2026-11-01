"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { deployZoneEvent } = require("../utils/eventCreation");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { infoEmbed, dangerEmbed, successEmbed } = require("../utils/embeds");
const db = require("../database/db");

const DEFAULT_BOX_SIZE = { x: 225, y: 150, z: 150 }; // matches RCE's own official example size
const DEFAULT_RADIUS = 50;

function newDraft() {
  return {
    eventName: null,
    zoneName: null,
    centerX: null,
    centerY: null,
    centerZ: null,
    shape: "Box",
    boxSize: { ...DEFAULT_BOX_SIZE },
    radius: DEFAULT_RADIUS,
    rotation: 0,
    durationMinutes: 10,
    rewardMaterial: null,
    rewardQty: 1,
    pvp: true,
    npc: true,
    radiationDamage: 0,
    buildingDamage: false,
    allowBuilding: false,
    showArea: true,
    chatMessages: false,
    colorHex: null,
    enterMessage: null,
    leaveMessage: null,
    ingameMessage: null,
    discordMessage: null,
    // Added 2026-09-10 (bug fix pass) - which linked Multi-Server Cluster map
    // (/add-server) this event's zone gets created on/resolved against. null
    // = the guild's single default connection. FIXED: events used to always
    // use the default connection regardless of which map an admin actually
    // meant, so a Cluster guild's zone events silently created/resolved on
    // the wrong server (or failed if no default connection was ever linked).
    serverName: null,
  };
}

function onOff(bool) {
  return bool ? "On" : "Off";
}

function buildDraftEmbed(draft) {
  const sizeText = draft.shape === "Box" ? `(${draft.boxSize.x},${draft.boxSize.y},${draft.boxSize.z})` : `radius ${draft.radius}`;
  const posText = draft.centerX !== null ? `(${draft.centerX}, ${draft.centerY}, ${draft.centerZ})` : "Not captured";
  const rewardText = draft.rewardMaterial ? `${draft.rewardQty}x ${MATERIAL_LABELS[draft.rewardMaterial]}` : "Not set";

  return infoEmbed(
    "Create Event - Draft",
    [
      `**Event**: ${draft.eventName || "Not set"}  ·  **Zone**: ${draft.zoneName || "Not set"}  ·  **Map**: ${draft.serverName || "Default server"}`,
      `**Position**: ${posText}  ·  **Shape**: ${draft.shape}  ·  **Rotation**: ${draft.shape === "Box" ? draft.rotation : "0 (forced)"}`,
      `**Size**: ${sizeText}  ·  **Duration**: ${draft.durationMinutes} min  ·  **Reward**: ${rewardText}`,
      "",
      `**Combat**  PvP: ${onOff(draft.pvp)}  ·  PvE (NPC dmg): ${onOff(draft.npc)}  ·  Radiation: ${draft.radiationDamage}/tick`,
      `**Building**  Damage: ${onOff(draft.buildingDamage)}  ·  Allowed: ${onOff(draft.allowBuilding)}`,
      `**Other**  Show Area: ${onOff(draft.showArea)}  ·  Chat Messages: ${onOff(draft.chatMessages)}  ·  Color: ${draft.colorHex || "default"}`,
      `**Zone Enter Message**: ${draft.enterMessage || "Not set"} *(shown when a player walks into the zone)*`,
      `**Zone Leave Message**: ${draft.leaveMessage || "Not set"} *(shown when a player walks out)*`,
      `**In-Game Msg**: ${draft.ingameMessage || "Default (auto-generated)"} *(global.say broadcast when the event starts)*`,
      `**Discord Msg**: ${draft.discordMessage || "Default (auto-generated)"} *(the announcement embed's description)*`,
    ].join("\n")
  );
}

function toggleStyle(bool) {
  return bool ? ButtonStyle.Success : ButtonStyle.Danger;
}

function buildDraftRows(draft, servers) {
  // Discord caps a message at 5 action rows, and this wizard already uses
  // every one of them - the Map picker (added 2026-09-10, only relevant to
  // guilds with more than one linked Cluster server) piggybacks on the
  // existing shape button/flow (see "ev:shape" below) rather than claiming a
  // 6th row that doesn't exist. Single-server guilds never see any mention
  // of it, same as before this was added.
  const shapeMapLabel = servers.length > 1 ? `Map: ${draft.serverName || "Default"} / ${draft.shape}` : "Sphere / Box";

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ev:event_name").setLabel("Event Name").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:zone_name").setLabel("Zone Name").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:position").setLabel("Position").setStyle(draft.centerX !== null ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:shape").setLabel(shapeMapLabel).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:size").setLabel("Size").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ev:rotation").setLabel("Rotation").setStyle(ButtonStyle.Secondary).setDisabled(draft.shape !== "Box"),
      new ButtonBuilder().setCustomId("ev:duration").setLabel("Duration").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:reward").setLabel("Reward").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:pvp").setLabel(`Allow PvP: ${onOff(draft.pvp)}`).setStyle(toggleStyle(draft.pvp)),
      new ButtonBuilder().setCustomId("ev:npc").setLabel(`Allow PvE: ${onOff(draft.npc)}`).setStyle(toggleStyle(draft.npc))
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ev:radiation").setLabel("Radiation").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:building_dmg").setLabel(`Building Dmg: ${onOff(draft.buildingDamage)}`).setStyle(toggleStyle(draft.buildingDamage)),
      new ButtonBuilder().setCustomId("ev:allow_building").setLabel(`Allow Building: ${onOff(draft.allowBuilding)}`).setStyle(toggleStyle(draft.allowBuilding)),
      new ButtonBuilder().setCustomId("ev:show_area").setLabel(`Show Area: ${onOff(draft.showArea)}`).setStyle(toggleStyle(draft.showArea)),
      new ButtonBuilder().setCustomId("ev:color").setLabel("Color").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ev:chat_msg").setLabel(`Chat Msg: ${onOff(draft.chatMessages)}`).setStyle(toggleStyle(draft.chatMessages)),
      new ButtonBuilder().setCustomId("ev:enter_message").setLabel("Zone Enter Msg").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:leave_message").setLabel("Zone Leave Msg").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:ingame_message").setLabel("In-Game Msg").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ev:discord_message").setLabel("Discord Msg").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ev:create").setLabel("Create Event").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ev:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function textModal(customId, title, label, { style = TextInputStyle.Short, required = true, maxLength = 100, value } = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  const input = new TextInputBuilder().setCustomId("value").setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setMaxLength(maxLength);
  if (value !== undefined && value !== null) input.setValue(String(value));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function awaitModalValue(comp, customId, title, label, opts) {
  await comp.showModal(textModal(customId, title, label, opts));
  const submit = await comp.awaitModalSubmit({ filter: (i) => i.customId === customId && i.user.id === comp.user.id, time: 120_000 }).catch(() => null);
  if (!submit) return null;
  const value = submit.fields.getTextInputValue("value").trim();
  await submit.deferUpdate();
  return value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("create-event-wizard")
    .setDescription("[Restricted] Build a zone event step by step with buttons instead of one long command")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const servers = db.listGuildServers(interaction.guildId);
    let draft = newDraft();
    const reply = await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });

    while (true) {
      let comp;
      try {
        comp = await reply.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 10 * 60 * 1000 });
      } catch {
        await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in 10 minutes - run `/create-event-wizard` again.")], components: [] });
        return;
      }

      const id = comp.customId;

      if (id === "ev:cancel") {
        await comp.update({ embeds: [dangerEmbed("Cancelled", "No event was created.")], components: [] });
        return;
      }

      if (id === "ev:event_name") {
        const value = await awaitModalValue(comp, "ev:event_name_modal", "Event Name", "Public event title", { maxLength: 100, value: draft.eventName });
        if (value) draft.eventName = value;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:zone_name") {
        const value = await awaitModalValue(comp, "ev:zone_name_modal", "Zone Name", "Internal/map name of the zone", { maxLength: 60, value: draft.zoneName });
        if (value) draft.zoneName = value;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:position") {
        // Not RCON-auto-captured - confirmed (2026-09-01) this server's
        // global.playerlist response has no position field at all, and
        // none of RCE's documented Player/Self/Tools commands expose a way
        // to query a specific player's live coordinates via RCON. Manual
        // entry is the only reliable option here.
        const value = await awaitModalValue(comp, "ev:position_modal", "Zone Position", "X,Y,Z - read these off your F1 console", {
          maxLength: 40,
          value: draft.centerX !== null ? `${draft.centerX},${draft.centerY},${draft.centerZ}` : undefined,
        });
        const parts = value?.split(",").map((n) => Number(n.trim()));
        if (parts?.length === 3 && parts.every(Number.isFinite)) {
          [draft.centerX, draft.centerY, draft.centerZ] = parts;
        } else if (value !== null) {
          await interaction.followUp({ embeds: [dangerEmbed("Invalid Position", "Enter three numbers separated by commas, e.g. `500,35,90`.")], ephemeral: true });
        }
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:shape") {
        // Added 2026-09-10: for a guild with more than one linked Cluster
        // server, this same button first asks which map before the usual
        // Sphere/Box choice - see buildDraftRows' header comment for why
        // this piggybacks on the shape button instead of getting its own row.
        // Every interaction (comp, then mapSelect) is acknowledged/updated
        // AT MOST ONCE each - a select menu that times out falls back to
        // interaction.editReply (the still-open webhook token) rather than
        // re-using an interaction that's already been acked, which Discord
        // would reject.
        const shapeMenuRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ev:shape_select")
            .setPlaceholder("Choose Sphere or Box")
            .addOptions(
              { label: "Box", description: "Uses size X,Y,Z and supports rotation", value: "Box" },
              { label: "Sphere", description: "Uses a radius and forces rotation to 0", value: "Sphere" }
            )
        );

        if (servers.length > 1) {
          const mapMenu = new StringSelectMenuBuilder()
            .setCustomId("ev:map_select")
            .setPlaceholder("Choose which linked map")
            .addOptions(servers.map((s) => ({ label: s.server_name, value: s.server_name, default: s.server_name === draft.serverName })));
          await comp.update({ embeds: [buildDraftEmbed(draft)], components: [new ActionRowBuilder().addComponents(mapMenu)] });
          const mapSelect = await reply
            .awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (i) => i.customId === "ev:map_select" && i.user.id === interaction.user.id, time: 60_000 })
            .catch(() => null);
          if (mapSelect) {
            draft.serverName = mapSelect.values[0];
            await mapSelect.update({ embeds: [buildDraftEmbed(draft)], components: [shapeMenuRow] });
          } else {
            await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: [shapeMenuRow] });
          }
        } else {
          await comp.update({ embeds: [buildDraftEmbed(draft)], components: [shapeMenuRow] });
        }

        const select = await reply
          .awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (i) => i.customId === "ev:shape_select" && i.user.id === interaction.user.id, time: 60_000 })
          .catch(() => null);
        if (select) {
          draft.shape = select.values[0];
          await select.deferUpdate();
        }
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:size") {
        if (draft.shape === "Box") {
          const value = await awaitModalValue(comp, "ev:size_modal", "Zone Size", "Size (X,Y,Z)", { maxLength: 30, value: `${draft.boxSize.x},${draft.boxSize.y},${draft.boxSize.z}` });
          const parts = value?.split(",").map((n) => Number(n.trim()));
          if (parts?.length === 3 && parts.every(Number.isFinite)) draft.boxSize = { x: parts[0], y: parts[1], z: parts[2] };
        } else {
          const value = await awaitModalValue(comp, "ev:radius_modal", "Zone Radius", "Radius (meters)", { maxLength: 10, value: draft.radius });
          const n = Number(value);
          if (Number.isFinite(n) && n > 0) draft.radius = n;
        }
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:rotation") {
        const value = await awaitModalValue(comp, "ev:rotation_modal", "Zone Rotation", "Rotation in degrees (Yaw)", { maxLength: 10, value: draft.rotation });
        const n = Number(value);
        if (Number.isFinite(n)) draft.rotation = n;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:duration") {
        const value = await awaitModalValue(comp, "ev:duration_modal", "Event Duration", "Minutes until a winner is declared", { maxLength: 5, value: draft.durationMinutes });
        const n = parseInt(value, 10);
        if (Number.isInteger(n) && n > 0) draft.durationMinutes = n;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:reward") {
        const menu = new StringSelectMenuBuilder()
          .setCustomId("ev:reward_select")
          .setPlaceholder("Choose the reward material")
          .addOptions(MATERIAL_FIELDS.map((f) => ({ label: MATERIAL_LABELS[f], value: f })));
        await comp.update({ embeds: [buildDraftEmbed(draft)], components: [new ActionRowBuilder().addComponents(menu)] });
        const select = await reply
          .awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (i) => i.customId === "ev:reward_select" && i.user.id === interaction.user.id, time: 60_000 })
          .catch(() => null);
        if (select) {
          draft.rewardMaterial = select.values[0];
          await select.showModal(textModal("ev:reward_qty_modal", "Reward Quantity", "How many?", { maxLength: 5, value: draft.rewardQty }));
          const qtySubmit = await select.awaitModalSubmit({ filter: (i) => i.customId === "ev:reward_qty_modal" && i.user.id === interaction.user.id, time: 60_000 }).catch(() => null);
          if (qtySubmit) {
            const n = parseInt(qtySubmit.fields.getTextInputValue("value"), 10);
            if (Number.isInteger(n) && n > 0) draft.rewardQty = n;
            await qtySubmit.deferUpdate();
          }
        }
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:pvp" || id === "ev:npc" || id === "ev:building_dmg" || id === "ev:allow_building" || id === "ev:show_area" || id === "ev:chat_msg") {
        await comp.deferUpdate();
        const field = { "ev:pvp": "pvp", "ev:npc": "npc", "ev:building_dmg": "buildingDamage", "ev:allow_building": "allowBuilding", "ev:show_area": "showArea", "ev:chat_msg": "chatMessages" }[id];
        draft[field] = !draft[field];
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:radiation") {
        const value = await awaitModalValue(comp, "ev:radiation_modal", "Radiation Damage", "Damage per server tick (0 = none)", { maxLength: 5, value: draft.radiationDamage });
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) draft.radiationDamage = n;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:color") {
        const value = await awaitModalValue(comp, "ev:color_modal", "Zone/Announcement Color", "Hex color, e.g. #93ff1d", { maxLength: 7, value: draft.colorHex, required: false });
        if (value !== null) draft.colorHex = value || null;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:enter_message" || id === "ev:leave_message") {
        const field = id === "ev:enter_message" ? "enterMessage" : "leaveMessage";
        const value = await awaitModalValue(comp, `ev:${field}_modal`, id === "ev:enter_message" ? "Enter Message" : "Leave Message", "Message shown to players", {
          style: TextInputStyle.Paragraph,
          maxLength: 150,
          required: false,
          value: draft[field],
        });
        if (value !== null) draft[field] = value || null;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:ingame_message" || id === "ev:discord_message") {
        const field = id === "ev:ingame_message" ? "ingameMessage" : "discordMessage";
        const value = await awaitModalValue(comp, `ev:${field}_modal`, id === "ev:ingame_message" ? "In-Game Message" : "Discord Message", id === "ev:ingame_message" ? "Broadcast text when the event starts" : "The announcement embed's description", {
          style: TextInputStyle.Paragraph,
          maxLength: id === "ev:ingame_message" ? 200 : 500,
          required: false,
          value: draft[field],
        });
        if (value !== null) draft[field] = value || null;
        await interaction.editReply({ embeds: [buildDraftEmbed(draft)], components: buildDraftRows(draft, servers) });
        continue;
      }

      if (id === "ev:create") {
        const missing = [];
        if (!draft.eventName) missing.push("Event Name");
        if (!draft.zoneName) missing.push("Zone Name");
        if (draft.centerX === null) missing.push("Position");
        if (!draft.rewardMaterial) missing.push("Reward");
        if (missing.length) {
          await comp.reply({ embeds: [dangerEmbed("Missing Fields", `Set these before creating: ${missing.join(", ")}.`)], ephemeral: true });
          continue;
        }

        await comp.deferUpdate();
        const result = await deployZoneEvent(interaction.guild, {
          eventName: draft.eventName,
          zoneName: draft.zoneName,
          centerX: draft.centerX,
          centerY: draft.centerY,
          centerZ: draft.centerZ,
          shape: draft.shape,
          boxSize: draft.boxSize,
          radius: draft.radius,
          rotation: draft.rotation,
          durationMinutes: draft.durationMinutes,
          rewardMaterial: draft.rewardMaterial,
          rewardQty: draft.rewardQty,
          pvp: draft.pvp ? 1 : 0,
          npc: draft.npc ? 1 : 0,
          radiationDamage: draft.radiationDamage,
          buildingDamage: draft.buildingDamage ? 1 : 0,
          allowBuilding: draft.allowBuilding ? 1 : 0,
          showArea: draft.showArea,
          chatMessages: draft.chatMessages,
          colorHex: draft.colorHex,
          enterMessage: draft.enterMessage,
          leaveMessage: draft.leaveMessage,
          ingameMessage: draft.ingameMessage,
          discordMessage: draft.discordMessage,
          createdBy: interaction.user.id,
          serverName: draft.serverName,
        });

        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "Run `/setup` first so BoomBot has a channel to announce this in.")], components: [] });
          return;
        }

        await interaction.editReply({
          embeds: [successEmbed("Event Created", `**${draft.eventName}** is live at **${draft.zoneName}** for ${draft.durationMinutes} minute(s). Announced in ${result.channel || "the panel channel"}.`)],
          components: [],
        });
        return;
      }
    }
  },
};

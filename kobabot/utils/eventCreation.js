"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { MATERIAL_LABELS, MATERIAL_EMOJI } = require("../config/materials");
const { formatStyledMessage } = require("../utils/messageStyle");
const { successEmbed, infoEmbed } = require("./embeds");

const DEFAULT_INGAME_MESSAGE = (eventName, zoneName, minutes) =>
  `[EVENT] ${eventName} has started at ${zoneName}! Last team standing in ${minutes} minutes wins the drop.`;

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

/**
 * Shared by /create-event (manual) and the auto-event scheduler
 * (utils/autoEvents.js) - one place for the actual DB record + RCON zone
 * creation + announcements, so both paths can't drift apart.
 *
 * Confirmed against RCE's official Custom Zones docs (2026-09-01):
 * https://rust-console-edition.gitbook.io/community-servers/feature-guides/custom-zones
 * Creating the zone alone isn't enough to make it visible - "showarea" has
 * to be turned on separately via zones.editcustomzone, which is also where
 * color gets set (createcustomzone itself takes no color param).
 * pvp=1/npc=0/radiation=0/buildingdamage=0/building=0 are first-pass
 * defaults for a "last team standing" drop zone - adjust per event type.
 */
async function deployZoneEvent(guild, params) {
  const {
    eventName,
    zoneName,
    centerX,
    centerY,
    centerZ,
    radius,
    durationMinutes,
    rewardMaterial,
    rewardQty = 1,
    colorHex,
    ingameMessage,
    discordMessage,
    createdBy,
    // Which linked Multi-Server Cluster map (see database/guild_servers) this
    // event's zone should be created on and later resolved against - undefined
    // = the guild's single default connection, unchanged from before this was
    // added. FIXED (2026-09-10): previously always used the default
    // connection regardless of this, so a Cluster guild's per-map events
    // silently created/resolved against the wrong server (or failed outright
    // if that guild never linked a default connection at all).
    serverName,
    // Richer zone options - all optional, defaulting to /create-event's
    // original plain-Sphere behavior so that command's existing call site
    // (and the auto-event scheduler) keep working unchanged. The wizard
    // (/create-event-wizard) passes these explicitly.
    shape = "Sphere", // "Sphere" | "Box"
    boxSize, // {x,y,z} - required when shape is "Box", ignored for Sphere
    rotation = 0,
    pvp = 1,
    npc = 0,
    radiationDamage = 0,
    buildingDamage = 0,
    allowBuilding = 0,
    showArea = true,
    zoneColorRgb, // {r,g,b} - independent of colorHex, which only styles the Discord embed/chat text
    chatMessages = false,
    enterMessage,
    leaveMessage,
  } = params;

  const resolvedIngameMessage = ingameMessage || DEFAULT_INGAME_MESSAGE(eventName, zoneName, durationMinutes);
  const resolvedDiscordMessage =
    discordMessage ||
    `**${zoneName}** is live for the next **${durationMinutes} minute(s)**. Hold the zone when the timer hits zero to win **${rewardQty}x ${MATERIAL_LABELS[rewardMaterial]}** ${MATERIAL_EMOJI[rewardMaterial] || ""}.`;

  const meta = db.getGuildMeta(guild.id);
  const announcementChannelId = meta?.events_channel_id || meta?.announcement_channel_id || meta?.panel_channel_id;
  if (!announcementChannelId) return { ok: false, error: "not_set_up" };

  const event = db.createZoneEvent(guild.id, {
    eventName,
    zoneName,
    centerX,
    centerZ,
    radius,
    colorHex,
    rewardMaterial,
    rewardQty,
    ingameMessage: resolvedIngameMessage,
    discordMessage: resolvedDiscordMessage,
    createdBy,
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    shape,
    boxX: shape === "Box" ? boxSize?.x ?? null : null,
    boxY: shape === "Box" ? boxSize?.y ?? null : null,
    boxZ: shape === "Box" ? boxSize?.z ?? null : null,
    rotation: shape === "Box" ? rotation : 0,
    serverName: serverName || null,
  });

  // Best-effort in-game zone + broadcast - a server being offline shouldn't
  // block the event from existing, just means players won't see it live.
  try {
    const rcon = await getRcon(guild.id, serverName);
    const sizeParam = shape === "Box" ? `(${boxSize.x},${boxSize.y},${boxSize.z})` : radius;
    const effectiveRotation = shape === "Sphere" ? 0 : rotation; // Sphere forces rotation to 0 per RCE's own docs
    await rcon.send(
      `zones.createcustomzone "${zoneName}" (${centerX},${centerY},${centerZ}) ${effectiveRotation} ${shape} ${sizeParam} ${pvp} ${npc} ${radiationDamage} ${buildingDamage} ${allowBuilding}`
    );
    // Setting-name tokens are unquoted per every documented example
    // (docs/RUST_CONSOLE_RCON_REFERENCE.md: `zones.editcustomzone "Test"
    // showarea 1`, `...color (255,0,255)`) - quoting them was a bug
    // (2026-10-11 fix); only the zone name and free-text message values
    // stay quoted.
    if (showArea) await rcon.send(`zones.editcustomzone "${zoneName}" showarea 1`);
    if (chatMessages) await rcon.send(`zones.editcustomzone "${zoneName}" showchatmessage 1`);
    if (enterMessage) await rcon.send(`zones.editcustomzone "${zoneName}" entermessage "${enterMessage.replace(/"/g, "'")}"`);
    if (leaveMessage) await rcon.send(`zones.editcustomzone "${zoneName}" leavemessage "${leaveMessage.replace(/"/g, "'")}"`);

    const rgb = zoneColorRgb || (colorHex && /^#([0-9a-f]{6})$/i.test(colorHex) ? hexToRgb(colorHex) : null);
    if (rgb) await rcon.send(`zones.editcustomzone "${zoneName}" color (${rgb.r},${rgb.g},${rgb.b})`);

    await rcon.say(formatStyledMessage(guild.id, "event", { message: resolvedIngameMessage }));
  } catch (err) {
    console.warn(`[KOBA Bot] Zone/broadcast failed for event "${eventName}" in guild ${guild.id}:`, err.message);
  }

  const announceEmbed = colorHex ? successEmbed(`Event: ${eventName}`, resolvedDiscordMessage) : infoEmbed(`Event: ${eventName}`, resolvedDiscordMessage);
  if (colorHex) {
    const parsed = parseInt(colorHex.replace("#", ""), 16);
    if (Number.isFinite(parsed)) announceEmbed.setColor(parsed);
  }
  announceEmbed.addFields(
    { name: "Location", value: `${zoneName} (${centerX}, ${centerZ})`, inline: true },
    { name: "Reward", value: `${rewardQty}x ${MATERIAL_LABELS[rewardMaterial]}`, inline: true },
    { name: "Joined", value: "0", inline: true },
    { name: "⚠️ Eligibility", value: "You must be linked (`/link`) and on a team to receive the reward." }
  );

  const joinEmoji = db.getConfig(guild.id, "event_join_emoji") || "🎯";
  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`eventjoin:join:${event.id}`).setLabel("Join Event").setEmoji(joinEmoji).setStyle(ButtonStyle.Success)
  );

  const channel = await guild.channels.fetch(announcementChannelId).catch(() => null);
  if (channel) await channel.send({ embeds: [announceEmbed], components: [joinRow] }).catch(() => {});

  return { ok: true, channel };
}

module.exports = { deployZoneEvent };

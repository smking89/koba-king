"use strict";

const db = require("../database/db");
const { MATERIAL_LABELS } = require("../config/materials");
const { infoEmbed, dangerEmbed } = require("./embeds");

/** "🎯 Join Event" button on a zone-event announcement - records intent (headcount, visible on the announcement) and DMs-back an ephemeral location/reward reminder rather than any real RCON teleport/queue action, since Rust zone events are physical - players just need to walk there. */
async function handleComponent(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("eventjoin:join:")) return;

  const eventId = Number(interaction.customId.split(":")[2]);
  const event = db.getZoneEvent(eventId);
  if (!event || event.status !== "active") {
    await interaction.reply({ embeds: [dangerEmbed("Event Ended", "This event isn't active anymore.")], ephemeral: true });
    return;
  }

  const joined = db.addEventJoin(eventId, interaction.user.id);

  // Update the visible "Joined" count on the original announcement.
  const message = interaction.message;
  const embed = message.embeds[0];
  if (embed) {
    const fields = embed.fields.map((f) => (f.name === "Joined" ? { ...f, value: String(joined.length) } : f));
    await interaction.update({ embeds: [{ ...embed.toJSON(), fields }] }).catch(() => {});
  } else {
    await interaction.deferUpdate().catch(() => {});
  }

  await interaction.followUp({
    embeds: [
      infoEmbed(
        "You're In!",
        `**${event.event_name}** at **${event.zone_name}** (${event.center_x}, ${event.center_z})\nReward: **${event.reward_qty}x ${MATERIAL_LABELS[event.reward_material] || event.reward_material}**\n\nHead there in-game before the timer runs out.`
      ),
    ],
    ephemeral: true,
  });
}

module.exports = { handleComponent };

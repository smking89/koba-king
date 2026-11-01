"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const db = require("../database/db");
const { CATEGORY_LABELS } = require("./messageStyle");
const { successEmbed } = require("./embeds");

/** Truncates a message-feed entry's text to Discord's 100-char select-option label limit. */
function truncateLabel(text) {
  return text.length > 97 ? text.slice(0, 97) + "..." : text;
}

/** Builds the "pick one to delete" dropdown for /message-feed delete - category and target are embedded in the customId (not per-option) since every option shares one select menu. */
function buildDeleteSelect(category, entries, target = "ingame") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`messagefeed:delete_select:${category}:${target}`)
    .setPlaceholder("Choose a message to delete")
    .addOptions(entries.slice(0, 25).map((e) => ({ label: truncateLabel(e.message_text), value: String(e.id) })));
  return new ActionRowBuilder().addComponents(menu);
}

/** Handles the delete-select dropdown pick - the only interactive component /message-feed uses. */
async function handleComponent(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const parts = interaction.customId.split(":");
  if (parts[1] !== "delete_select") return;

  await interaction.deferUpdate();
  const category = parts[2];
  // FIXED (2026-09-07): older customIds (posted before the in-game/Discord
  // split) have no 4th segment - default to "ingame" so a stale dropdown
  // from before this update still deletes from the right (only) pool that
  // existed at the time.
  const target = parts[3] || "ingame";
  const id = Number(interaction.values[0]);
  db.removeMessageStylePoolEntry(interaction.guildId, id);

  const remaining = db.listMessageStylePoolEntries(interaction.guildId, category, target);
  const label = `${CATEGORY_LABELS[category] || category} (${target === "discord" ? "Discord" : "In-Game"})`;
  await interaction.editReply({
    embeds: [successEmbed("Message Deleted", `Removed from **${label}**'s pool - **${remaining.length}** message(s) left.`)],
    components: remaining.length ? [buildDeleteSelect(category, remaining, target)] : [],
  });
}

module.exports = { buildDeleteSelect, handleComponent };

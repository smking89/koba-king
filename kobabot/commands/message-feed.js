"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { CATEGORY_LABELS } = require("../utils/messageStyle");
const { buildDeleteSelect } = require("../utils/messageFeedPanel");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

/**
 * Rotating message-feed pool per category (2026-09-07) - matches Veretech's
 * (a competitor bot) documented /feeds add|list|delete model: up to 25
 * custom messages per category, one shown at random each occurrence,
 * layered ON TOP of /set message-style's single color/size/message_template
 * (which still controls the color/size, and stays the fallback whenever
 * this pool is empty for a category - see utils/messageStyle.js's
 * formatStyledMessage). "ad" is excluded for the same reason /set message-style
 * excludes it - that's BoomBot's own brand attribution, not per-server.
 */
const ADMIN_CATEGORIES = Object.fromEntries(Object.entries(CATEGORY_LABELS).filter(([key]) => key !== "ad"));
const CATEGORY_CHOICES = Object.entries(ADMIN_CATEGORIES).map(([value, name]) => ({ name, value }));

// Same in-game/Discord split as /set message-style - see that command's
// TARGET_CHOICES comment for why. Each pool is entirely separate per target.
const TARGET_CHOICES = [
  { name: "In-Game (rcon chat)", value: "ingame" },
  { name: "Discord (embed)", value: "discord" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("message-feed")
    .setDescription("[Restricted] Add multiple rotating messages per category - one shows at random each time")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a message to a category's random-rotation pool (max 25)")
        .addStringOption((opt) => opt.setName("category").setDescription("Which kind of message").setRequired(true).addChoices(...CATEGORY_CHOICES))
        // Same 500-char limit as /set message-style's message option, for the
        // same reason - see that command's comment.
        .addStringOption((opt) => opt.setName("message").setDescription("Placeholders vary by category (e.g. {player}, {kit})").setRequired(true).setMaxLength(500))
        .addStringOption((opt) => opt.setName("target").setDescription("In-game chat or Discord embed - defaults to In-Game").addChoices(...TARGET_CHOICES))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Show every message currently in a category's pool")
        .addStringOption((opt) => opt.setName("category").setDescription("Which kind of message").setRequired(true).addChoices(...CATEGORY_CHOICES))
        .addStringOption((opt) => opt.setName("target").setDescription("In-game chat or Discord embed - defaults to In-Game").addChoices(...TARGET_CHOICES))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Pick a message to remove from a category's pool")
        .addStringOption((opt) => opt.setName("category").setDescription("Which kind of message").setRequired(true).addChoices(...CATEGORY_CHOICES))
        .addStringOption((opt) => opt.setName("target").setDescription("In-game chat or Discord embed - defaults to In-Game").addChoices(...TARGET_CHOICES))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const category = interaction.options.getString("category", true);
    const target = interaction.options.getString("target") || "ingame";
    const targetLabel = target === "discord" ? "Discord" : "In-Game";

    if (!ADMIN_CATEGORIES[category]) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Editable Here", "That category isn't configurable via /message-feed.")] });
      return;
    }
    const label = `${CATEGORY_LABELS[category]} (${targetLabel})`;

    if (sub === "add") {
      const message = interaction.options.getString("message", true).trim();
      const result = db.addMessageStylePoolEntry(guildId, category, message, target);
      if (!result.ok) {
        await interaction.editReply({
          embeds: [dangerEmbed("Pool Full", `**${label}** already has the max **${db.MESSAGE_FEED_POOL_LIMIT}** messages - delete one first with \`/message-feed delete\`.`)],
        });
        return;
      }
      const count = db.countMessageStylePoolEntries(guildId, category, target);
      await interaction.editReply({
        embeds: [successEmbed("Message Added", `Added to **${label}**'s pool (**${count}/${db.MESSAGE_FEED_POOL_LIMIT}**) - one message shows at random each time. The single \`/set message-style\` message for this category/target won't be used anymore while this pool has entries.`)],
      });
      return;
    }

    if (sub === "list") {
      const entries = db.listMessageStylePoolEntries(guildId, category, target);
      if (!entries.length) {
        await interaction.editReply({
          embeds: [infoEmbed(`${label} - Pool Empty`, "No custom messages yet - falling back to \`/set message-style\`'s single message (or the built-in default). Add one with `/message-feed add`.")],
        });
        return;
      }
      // Truncate each entry's preview - up to 25 entries at the new 500-char
      // message limit could otherwise blow past Discord's 4096-char embed
      // description cap and fail to send at all. /message-feed delete's
      // dropdown already shows the untruncated pick via its own labels, so
      // nothing here is actually hidden, just not repeated at full length.
      const lines = entries.map((e, i) => `**${i + 1}.** ${e.message_text.length > 120 ? e.message_text.slice(0, 120) + "..." : e.message_text}`);
      await interaction.editReply({ embeds: [infoEmbed(`${label} - Pool (${entries.length}/${db.MESSAGE_FEED_POOL_LIMIT})`, lines.join("\n"))] });
      return;
    }

    // sub === "delete"
    const entries = db.listMessageStylePoolEntries(guildId, category, target);
    if (!entries.length) {
      await interaction.editReply({ embeds: [infoEmbed(`${label} - Pool Empty`, "Nothing to delete.")] });
      return;
    }
    await interaction.editReply({
      embeds: [infoEmbed(`Delete From ${label}`, "Pick a message below to remove it from the rotation.")],
      components: [buildDeleteSelect(category, entries, target)],
    });
  },
};

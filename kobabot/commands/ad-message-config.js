"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { isBotOwner } = require("../utils/premium");
const { CATEGORY_DEFAULTS, isValidHex, isValidSize, getGlobalAdOverride, setGlobalAdOverride, colorize } = require("../utils/messageStyle");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

/**
 * Controls the ONE global "POWERED BY BOOMbot" recurring ad message (every
 * 15 min, every server) - see utils/messageStyle.js's getGlobalAdOverride.
 * Deliberately separate from /set message-style, and deliberately not
 * per-guild: this is brand attribution, not a per-server customization, so
 * individual server admins can't touch it (removed from /set message-style's
 * editable categories in the same change that added this command) - only
 * the bot owner, in the official server, controls it.
 */
module.exports = {
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("ad-message-config")
    .setDescription("[Dev Only] Set the global recurring in-game ad message, color, and size")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Update the global ad message - any field left blank keeps its current value")
        .addStringOption((opt) => opt.setName("message").setDescription("The ad text, e.g. \"POWERED BY BOOMbot\"").setMaxLength(200))
        .addStringOption((opt) => opt.setName("hex").setDescription("e.g. #00FF00").setMaxLength(7))
        .addIntegerOption((opt) => opt.setName("size").setDescription("In-game text size, 8-72").setMinValue(8).setMaxValue(72))
    )
    .addSubcommand((sub) => sub.setName("view").setDescription("Show the current global ad message"))
    .addSubcommand((sub) => sub.setName("reset").setDescription("Clear the override and go back to the built-in default")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isBotOwner(interaction.user.id)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot developers.")] });
      return;
    }
    if (!process.env.OFFICIAL_GUILD_ID || interaction.guild?.id !== process.env.OFFICIAL_GUILD_ID) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "/ad-message-config only works in the official BoomBot Discord server.")] });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const override = getGlobalAdOverride();
      if (!override) {
        await interaction.editReply({ embeds: [infoEmbed("Global Ad Message", `No override set - using the built-in default: "${CATEGORY_DEFAULTS.ad}"`)] });
        return;
      }
      const preview = colorize(override.message || CATEGORY_DEFAULTS.ad, isValidHex(override.colorHex) ? override.colorHex : "#00FF00", override.sizePt);
      await interaction.editReply({
        embeds: [
          infoEmbed(
            "Global Ad Message",
            `**Message:** ${override.message || CATEGORY_DEFAULTS.ad}\n**Color:** \`${override.colorHex || "#00FF00 (default)"}\`\n**Size:** \`${override.sizePt ? override.sizePt + "pt" : "default"}\`\n\n**Raw sent to RCON:** \`${preview}\``
          ),
        ],
      });
      return;
    }

    if (sub === "reset") {
      setGlobalAdOverride({ message: null, colorHex: null, sizePt: null });
      await interaction.editReply({ embeds: [successEmbed("Reset", `Back to the built-in default: "${CATEGORY_DEFAULTS.ad}"`)] });
      return;
    }

    const message = interaction.options.getString("message")?.trim();
    const hex = interaction.options.getString("hex")?.trim();
    const size = interaction.options.getInteger("size");

    if (!message && !hex && size === null) {
      await interaction.editReply({ embeds: [dangerEmbed("Nothing To Set", "Provide a message, a hex color, a size, or any combination.")] });
      return;
    }
    if (hex && !isValidHex(hex)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "Use a 6-digit hex color like `#00FF00`.")] });
      return;
    }
    if (size !== null && !isValidSize(size)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Size", "Size must be a whole number between 8 and 72.")] });
      return;
    }

    const existing = getGlobalAdOverride() || {};
    setGlobalAdOverride({
      message: message || existing.message || null,
      colorHex: hex || existing.colorHex || null,
      sizePt: size !== null ? size : existing.sizePt ?? null,
    });

    await interaction.editReply({
      embeds: [successEmbed("Global Ad Message Updated", "Every server running BoomBot will use this ad text on its next 15-minute broadcast.")],
    });
  },
};

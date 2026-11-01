"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { isBotOwner } = require("../utils/premium");
const { infoEmbed, errorEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Show only the commands you can use")
    .setDMPermission(false),

  async execute(interaction) {
    try {
      // Same null-guild-right-after-restart gotcha fixed elsewhere in this
      // codebase (commands/template.js, etc.) - interaction.guild can be
      // null in that window, so .ownerId on it directly used to crash this
      // command outright.
      const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
      const isOwner = guild ? interaction.user.id === guild.ownerId : false;
      const isAdmin = interaction.memberPermissions?.has("Administrator") || false;
      const isBotDev = isBotOwner(interaction.user.id);

      let description = "Here are the tools currently available for your account level.\n\n**👥 Player Commands**\n`/link`, `/unlink`, `/official-leaderboard`, `/support`\n\n";

      if (isAdmin || isOwner || isBotDev) {
        description +=
          "**🛡️ Staff & Moderator Tools**\n`/config-staff`, `/template`, `/mod`, `/server`, `/staff`, `/staff-post`\n\n";
      }

      if (isOwner || isBotDev) {
        description += "**👑 Server Owner Access**\n`/nuke`\n\n";
      }

      await interaction.reply({ embeds: [infoEmbed("Your Command Directory", description)], ephemeral: true });
    } catch (error) {
      console.error("Error executing /commands:", error);
      await interaction.reply({ embeds: [errorEmbed("Command Directory Error", error.message || "Something went wrong while trying to generate the help directory menu.")], ephemeral: true });
    }
  },
};
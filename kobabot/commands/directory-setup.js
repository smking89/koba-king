"use strict";

const { SlashCommandBuilder, ChannelType } = require("discord.js");
const db = require("../database/db");
const { isBotOwner } = require("../utils/premium");
const { buildFilterPanel } = require("../utils/directoryPanel");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  // Bot-owner + official-server-only at runtime already, made structurally
  // invisible everywhere else too - see events/ready.js's autoDeployCommands.
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("directory-setup")
    .setDescription("[Dev Only] One-time setup for the cross-server BoomBot Directory hub")
    .addChannelOption((opt) => opt.setName("directory_channel").setDescription("Where server cards post (#rust-console-directory)").setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addChannelOption((opt) => opt.setName("reviews_channel").setDescription("Where verified reviews post (#server-reviews)").setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addChannelOption((opt) => opt.setName("staff_channel").setDescription("Staff recruitment channel (#staff-recruitment)").setRequired(true).addChannelTypes(ChannelType.GuildText)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isBotOwner(interaction.user.id)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot administrators.")] });
      return;
    }
    if (!process.env.OFFICIAL_GUILD_ID || interaction.guildId !== process.env.OFFICIAL_GUILD_ID) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "/directory-setup only works in the official BoomBot Discord server - the Directory is a single shared hub, not something every server gets its own copy of.")] });
      return;
    }

    const directoryChannel = interaction.options.getChannel("directory_channel", true);
    const reviewsChannel = interaction.options.getChannel("reviews_channel", true);
    const staffChannel = interaction.options.getChannel("staff_channel", true);

    db.setConfig(interaction.guildId, "directory_channel_id", directoryChannel.id);
    db.setConfig(interaction.guildId, "reviews_channel_id", reviewsChannel.id);
    db.setConfig(interaction.guildId, "staff_recruitment_channel_id", staffChannel.id);

    const panelMessage = await directoryChannel.send(buildFilterPanel()).catch(() => null);
    if (panelMessage) {
      await panelMessage.pin().catch(() => {});
      db.setConfig(interaction.guildId, "directory_panel_message_id", panelMessage.id);
    }

    await interaction.editReply({
      embeds: [successEmbed("Directory Configured", `Cards will post in ${directoryChannel}, reviews in ${reviewsChannel}, staff recruitment in ${staffChannel}.${panelMessage ? " Filter panel posted and pinned." : " (Filter panel post failed - check the bot's permissions in that channel.)"}`)],
    });
  },
};

"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { provisionGuild } = require("../utils/provisioning");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("[Restricted] Move your BoomBot subscription from another server to this one - no new payment")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Deliberately not gated behind requirePremiumOwner - the whole point of
  // this command is to unlock a server that's currently locked.
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // interaction.guild can be null right after the bot restarts (guild
    // objects populate into the cache progressively) even for a genuine
    // in-server command - a fresh fetch resolves that without falsely
    // telling someone they're in a DM when they aren't.
    const guild = interaction.guildId ? interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null)) : null;
    if (!guild) {
      await interaction.editReply({ embeds: [dangerEmbed("Server Only", "/transfer only works inside a Discord server, not in DMs.")] });
      return;
    }

    if (guild.ownerId !== interaction.user.id) {
      await interaction.editReply({
        embeds: [dangerEmbed("Owner Only", "Only this server's owner can transfer a subscription here.")],
      });
      return;
    }

    const record = db.getPremiumRecord(interaction.user.id);
    if (!record || record.expires_at <= Date.now()) {
      await interaction.editReply({
        embeds: [dangerEmbed("No Active Subscription", "Your account doesn't have an active BoomBot subscription to transfer. Subscribe first, then run `/transfer` wherever you want it active.")],
      });
      return;
    }

    if (record.active_guild_id === interaction.guildId) {
      await interaction.editReply({
        embeds: [successEmbed("Already Active Here", "Your subscription already authorizes this server.")],
      });
      return;
    }

    const { previousGuildId } = db.transferGuildLicense(interaction.user.id, interaction.guildId);
    const { panelChannel } = await provisionGuild(guild);

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Subscription Transferred",
          `Your BoomBot subscription now authorizes **this server**.${previousGuildId ? " Your previous server is locked until you `/transfer` it back or subscribe again for it separately." : ""}\n\nOperations are live in ${panelChannel}.`
        ),
      ],
    });
  },
};

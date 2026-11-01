"use strict";

/**
 * [Dev Only] Manages the install approval gate (see database/schema.sql's
 * approved_guilds header, events/guildCreate.js's enforcement) - lets the
 * bot owner approve/revoke/list which Discord servers are allowed to have
 * KOBA Bot installed. Built 2026-10-13 per explicit owner request: a
 * Discord OAuth invite link is inherently shareable, so the real gate has
 * to be enforced server-side on join, not just by hiding the link.
 */

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { isBotOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("approve-guild")
    .setDescription("[Dev Only] Approve, revoke, or list which servers may install KOBA Bot")
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Allow a server to install/keep KOBA Bot")
        .addStringOption((opt) => opt.setName("guild_id").setDescription("The Discord server ID to approve").setRequired(true))
        .addStringOption((opt) => opt.setName("note").setDescription("Optional note (e.g. who requested it)"))
    )
    .addSubcommand((sub) => sub.setName("revoke").setDescription("Remove a server's approval (does not kick it out automatically)").addStringOption((opt) => opt.setName("guild_id").setDescription("The Discord server ID to revoke").setRequired(true)))
    .addSubcommand((sub) => sub.setName("list").setDescription("Show every approved server")),

  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to the bot owner.")], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === "approve") {
      const guildId = interaction.options.getString("guild_id", true).trim();
      const note = interaction.options.getString("note");
      db.approveGuild(guildId, interaction.user.id, note);
      await interaction.editReply({ embeds: [successEmbed("Server Approved", `Guild \`${guildId}\` can now install/keep KOBA Bot.${note ? `\n\n_${note}_` : ""}`)] });
      return;
    }

    if (sub === "revoke") {
      const guildId = interaction.options.getString("guild_id", true).trim();
      db.revokeGuildApproval(guildId);
      await interaction.editReply({ embeds: [successEmbed("Approval Revoked", `Guild \`${guildId}\` is no longer approved - it won't be auto-kicked, but if it rejoins (or the bot restarts and re-checks), it'll be removed.`)] });
      return;
    }

    // sub === "list"
    const guilds = db.listApprovedGuilds();
    if (!guilds.length) {
      await interaction.editReply({ embeds: [infoEmbed("Approved Servers", "None yet - every non-official server will be auto-removed on join until approved.")] });
      return;
    }
    const lines = guilds.map((g) => `\`${g.guild_id}\` - approved <t:${Math.floor(g.approved_at / 1000)}:R> by <@${g.approved_by}>${g.note ? ` - _${g.note}_` : ""}`);
    await interaction.editReply({ embeds: [infoEmbed("Approved Servers", lines.join("\n"))] });
  },
};

"use strict";

/**
 * Consolidated 2026-10-13 (command cleanup pass) - was four standalone
 * commands (/add-server, /directory, /server-rivalry, /rival), folded under
 * one /server command with subcommand groups since they're all "manage this
 * connected Rust server" surfaces.
 *
 * TRIMMED (private-bot simplification pass) - the rivalry/rival/directory
 * subcommand groups (server-to-server rivalries, 1v1 player rivals, and the
 * cross-server directory) were all part of the multi-tenant SaaS feature
 * set and have been removed along with utils/serverRivalry.js,
 * utils/rivalSystem.js, and utils/directoryPanel.js. This command is now
 * just the RCON connection management it started as.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { testRconConnection, invalidateRcon } = require("../rcon/manager");
const { requirePlan } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

/** Shared ManageGuild check - see the file header for why this is manual rather than Discord's own setDefaultMemberPermissions. */
function hasManageGuild(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Manage connected Rust servers")
    .setDMPermission(false)
    .addSubcommandGroup((group) =>
      group
        .setName("connection")
        .setDescription("[Restricted] Connect this Discord server (or one of its Cluster maps) to a Rust server's WebRCON")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Save (and live-test) a Rust server's WebRCON credentials")
            .addStringOption((opt) =>
              opt
                .setName("platform")
                .setDescription("Which platform/game is this server?")
                .setRequired(true)
                .addChoices(
                  { name: "Rust - Console Edition (Xbox/PlayStation)", value: "rust_console" },
                  { name: "Rust - PC (Coming Soon)", value: "rust_pc" }
                )
            )
            .addStringOption((opt) => opt.setName("host").setDescription("Server IP or hostname (no ws:// prefix)").setRequired(true))
            .addIntegerOption((opt) => opt.setName("port").setDescription("WebRCON port").setRequired(true).setMinValue(1).setMaxValue(65535))
            .addStringOption((opt) => opt.setName("password").setDescription("WebRCON password").setRequired(true))
            .addStringOption((opt) => opt.setName("map").setDescription("Cluster map/server name (exact) - leave blank to set this server's single default connection"))
        )
        .addSubcommand((sub) =>
          sub
            .setName("status")
            .setDescription("Show what's linked - the default connection, or every linked Cluster map")
            .addStringOption((opt) => opt.setName("map").setDescription("Check one specific map instead of everything"))
        )
        .addSubcommand((sub) =>
          sub
            .setName("unlink")
            .setDescription("Remove a linked RCON connection")
            .addStringOption((opt) => opt.setName("map").setDescription("Cluster map/server name - leave blank to unlink the default connection"))
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;

    // add-server.js relied on Discord's own setDefaultMemberPermissions(ManageGuild) - replicated manually here (see file header).
    if (!hasManageGuild(interaction)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This requires Manage Server permission.")] });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const mapName = interaction.options.getString("map")?.trim() || null;

    if (sub === "status") {
      if (mapName) {
        const server = db.getGuildServer(guildId, mapName);
        if (server) {
          await interaction.editReply({ embeds: [successEmbed("Map Linked", `**${mapName}** is connected to **${server.rcon_host}:${server.rcon_port}**.`)] });
        } else {
          await interaction.editReply({ embeds: [dangerEmbed("Map Not Linked", `**${mapName}** doesn't have its own linked RCON - it's using this server's default connection. Run \`/server connection set map:${mapName}\` to give it its own.`)] });
        }
        return;
      }

      const meta = db.getGuildMeta(guildId);
      const servers = db.listGuildServers(guildId);
      const lines = [meta?.rcon_host ? `**Default:** ${meta.rcon_host}:${meta.rcon_port}` : "**Default:** not linked (using the shared env-var connection)"];
      for (const s of servers) lines.push(`**${s.server_name}:** ${s.rcon_host}:${s.rcon_port}`);
      await interaction.editReply({ embeds: [infoEmbed("Linked Servers", lines.join("\n"))] });
      return;
    }

    if (sub === "unlink") {
      if (mapName) {
        const server = db.getGuildServer(guildId, mapName);
        if (!server) {
          await interaction.editReply({ embeds: [dangerEmbed("Nothing Linked", `**${mapName}** doesn't have its own linked RCON to remove.`)] });
          return;
        }
        db.deleteGuildServer(guildId, mapName);
        invalidateRcon(guildId, mapName);
        await interaction.editReply({ embeds: [successEmbed("Map Unlinked", `**${mapName}**'s RCON link was removed - it now falls back to this server's default connection.`)] });
        return;
      }

      const meta = db.getGuildMeta(guildId);
      if (!meta?.rcon_host) {
        await interaction.editReply({ embeds: [dangerEmbed("Nothing Linked", "This server doesn't have its own linked RCON to remove.")] });
        return;
      }
      db.upsertGuildMeta(guildId, { rcon_host: null, rcon_port: null, rcon_password: null });
      invalidateRcon(guildId);
      await interaction.editReply({ embeds: [successEmbed("Server Unlinked", "This server's default RCON link was removed - it now falls back to the shared default connection.")] });
      return;
    }

    // sub === "set"
    // Cluster maps (multiple linked Rust servers under one Discord guild)
    // are Multi-Server Management, a Pro/Max feature (per
    // website/src/components/PlanGrid.jsx) - the single default connection
    // (mapName blank) stays free, every plan needs at least that to
    // function at all.
    if (mapName && !(await requirePlan(interaction, "pro", "Multi-Server Management"))) return;

    const platform = interaction.options.getString("platform", true);
    if (platform !== "rust_console") {
      // PC Rust's RCON/command surface genuinely differs from Rust Console
      // Edition's (every parser/command in this codebase - rcon/parsers.js,
      // the whole rcon/ folder - is RCE-specific, confirmed repeatedly
      // against real RCE server captures) - rejected here BEFORE touching
      // any credentials, rather than silently trying to connect with the
      // wrong assumptions and producing confusing garbage data downstream.
      await interaction.editReply({
        embeds: [dangerEmbed("Coming Soon", "PC Rust support isn't built yet - KOBA Bot currently only supports Rust Console Edition (Xbox/PlayStation). Select that platform once you're ready to connect this server.")],
      });
      return;
    }

    const host = interaction.options.getString("host", true).trim();
    const port = interaction.options.getInteger("port", true);
    const password = interaction.options.getString("password", true);

    const test = await testRconConnection({ host, port, password });
    if (!test.ok) {
      await interaction.editReply({ embeds: [dangerEmbed("Connection Failed", `Couldn't connect to **${host}:${port}** with those credentials.\n\n\`${test.error}\`\n\nDouble-check the host, port, and password, then try again - nothing was saved.`)] });
      return;
    }

    if (mapName) {
      db.upsertGuildServer(guildId, mapName, { rconHost: host, rconPort: port, rconPassword: password });
      invalidateRcon(guildId, mapName);
      await interaction.editReply({ embeds: [successEmbed("Map Linked", `Connected and saved - **${mapName}** now uses **${host}:${port}** for its own RCON features and telemetry.`)] });
      return;
    }

    db.upsertGuildMeta(guildId, { rcon_host: host, rcon_port: port, rcon_password: password });
    invalidateRcon(guildId);
    await interaction.editReply({ embeds: [successEmbed("Server Linked", `Connected and saved - this server now uses **${host}:${port}** for every RCON feature.`)] });
    return;
  },
};

"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const db = require("../database/db");
const { getRcon, testRconConnection, invalidateRcon } = require("../rcon/manager");
const { parseServerInfo } = require("../rcon/parsers");
const { baseEmbed, successEmbed, dangerEmbed, COLORS } = require("./embeds");

/** One line per linked server (the guild's default connection, plus every Cluster map in guild_servers), with live status if available. */
async function buildStatusLines(guild) {
  const meta = db.getGuildMeta(guild.id);
  const servers = db.listGuildServers(guild.id);
  const lines = [];

  const entries = [{ name: "Default", host: meta?.rcon_host, port: meta?.rcon_port }, ...servers.map((s) => ({ name: s.server_name, host: s.rcon_host, port: s.rcon_port }))];

  for (const entry of entries) {
    if (!entry.host) {
      if (entry.name === "Default") continue; // no default configured - not worth a row
      lines.push(`🔴 **${entry.name}** - not linked`);
      continue;
    }
    try {
      const rcon = await getRcon(guild.id, entry.name === "Default" ? undefined : entry.name);
      const info = parseServerInfo(await rcon.sendJson("serverinfo"));
      lines.push(`🟢 **${entry.name}** - ${entry.host}:${entry.port} - ${info.players}/${info.maxPlayers} players, ${info.queued} queued`);
    } catch {
      lines.push(`🔴 **${entry.name}** - ${entry.host}:${entry.port} - offline or unreachable`);
    }
  }

  return lines.length ? lines : ["No servers linked yet - click **Add Server** below."];
}

async function buildServersHubPanel(guild) {
  const lines = await buildStatusLines(guild);
  const embed = baseEmbed(COLORS.brand).setTitle("🗺️ Linked Servers").setDescription(lines.join("\n"));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("servershub:add_open").setLabel("Add Server").setStyle(ButtonStyle.Success).setEmoji("➕"),
    new ButtonBuilder().setCustomId("servershub:remove_open").setLabel("Remove Server").setStyle(ButtonStyle.Danger).setEmoji("🗑️")
  );
  return { embeds: [embed], components: [row] };
}

/** Posts (once) or refreshes-in-place the Servers Hub panel - called by the telemetry tick to keep status current, and after any add/remove. */
async function refreshServersHubPanel(guild) {
  const meta = db.getGuildMeta(guild.id);
  if (!meta?.servers_hub_channel_id) return;
  const channel = await guild.channels.fetch(meta.servers_hub_channel_id).catch(() => null);
  if (!channel) return;

  const payload = await buildServersHubPanel(guild);

  if (meta.servers_hub_message_id) {
    const existing = await channel.messages.fetch(meta.servers_hub_message_id).catch(() => null);
    if (existing) {
      await existing.edit(payload).catch(() => {});
      return;
    }
  }

  const message = await channel.send(payload).catch(() => null);
  if (message) {
    db.upsertGuildMeta(guild.id, { servers_hub_message_id: message.id });
    await message.pin().catch(() => {});
  }
}

function buildAddModal() {
  const modal = new ModalBuilder().setCustomId("servershub:add_modal").setTitle("Add A Server");
  const nameInput = new TextInputBuilder().setCustomId("server_name").setLabel("Server name (e.g. Alpha, Main Map)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50);
  const hostInput = new TextInputBuilder().setCustomId("host").setLabel("Server IP or hostname").setStyle(TextInputStyle.Short).setRequired(true);
  const portInput = new TextInputBuilder().setCustomId("port").setLabel("WebRCON port").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5);
  const passwordInput = new TextInputBuilder().setCustomId("password").setLabel("WebRCON password").setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(hostInput),
    new ActionRowBuilder().addComponents(portInput),
    new ActionRowBuilder().addComponents(passwordInput)
  );
  return modal;
}

async function handleComponent(interaction) {
  const [, action] = interaction.customId.split(":");

  if (action === "add_open") {
    if (!interaction.member.permissions.has("ManageGuild")) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This requires Manage Server permission.")], ephemeral: true });
      return;
    }
    await interaction.showModal(buildAddModal());
    return;
  }

  if (action === "remove_open") {
    if (!interaction.member.permissions.has("ManageGuild")) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This requires Manage Server permission.")], ephemeral: true });
      return;
    }
    const servers = db.listGuildServers(interaction.guildId);
    if (!servers.length) {
      await interaction.reply({ embeds: [dangerEmbed("Nothing To Remove", "No Cluster map servers are linked (the Default connection isn't removed here - use `/server connection unlink`).")], ephemeral: true });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("servershub:remove_select")
      .setPlaceholder("Choose a server to unlink")
      .addOptions(servers.slice(0, 25).map((s) => ({ label: s.server_name, value: s.server_name, description: `${s.rcon_host}:${s.rcon_port}` })));
    await interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    return;
  }

  if (action === "remove_select") {
    await interaction.deferUpdate();
    const serverName = interaction.values[0];
    db.deleteGuildServer(interaction.guildId, serverName);
    invalidateRcon(interaction.guildId, serverName);
    await refreshServersHubPanel(interaction.guild);
    await interaction.editReply({ embeds: [successEmbed("Server Removed", `**${serverName}** was unlinked.`)], components: [] });
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== "servershub:add_modal") return;
  await interaction.deferReply({ ephemeral: true });

  const serverName = interaction.fields.getTextInputValue("server_name").trim();
  const host = interaction.fields.getTextInputValue("host").trim();
  const port = parseInt(interaction.fields.getTextInputValue("port").trim(), 10);
  const password = interaction.fields.getTextInputValue("password").trim();

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Port", "Port must be a whole number between 1 and 65535.")] });
    return;
  }

  const test = await testRconConnection({ host, port, password });
  if (!test.ok) {
    await interaction.editReply({ embeds: [dangerEmbed("Connection Failed", `Couldn't connect to **${host}:${port}**.\n\n\`${test.error}\`\n\nNothing was saved.`)] });
    return;
  }

  db.upsertGuildServer(interaction.guildId, serverName, { rconHost: host, rconPort: port, rconPassword: password });
  invalidateRcon(interaction.guildId, serverName);
  await refreshServersHubPanel(interaction.guild);

  await interaction.editReply({ embeds: [successEmbed("Server Added", `**${serverName}** is connected and saved.`)] });
}

module.exports = { buildServersHubPanel, refreshServersHubPanel, handleComponent, handleModal };

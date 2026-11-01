"use strict";

const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { baseEmbed, successEmbed, infoEmbed, dangerEmbed, COLORS } = require("./embeds");
const { postTicketChecklist } = require("./frank");
const { withTimeout } = require("./withTimeout");

const STAGE_CATEGORY_NAMES = {
  open: "🎫 OPEN TICKETS",
  closed: "🔒 CLOSED TICKETS",
  archived: "📁 ARCHIVED TICKETS",
};

const TICKET_REASONS = [
  { value: "bug", label: "🐛 Bug Report", description: "Something's broken or not working as expected" },
  { value: "billing", label: "💳 Billing", description: "Subscription, payment, or access questions" },
  { value: "setup", label: "🛠️ Setup Help", description: "Help configuring roles, channels, or a template" },
  { value: "report", label: "🚫 Report a Player", description: "Report rule-breaking or abusive behavior" },
  { value: "other", label: "❓ Other", description: "Anything else" },
];
const REASON_LABELS = Object.fromEntries(TICKET_REASONS.map((r) => [r.value, r.label]));

async function ensureTicketsCategory(guild, stage = "open") {
  const name = STAGE_CATEGORY_NAMES[stage];
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);
  if (!category) {
    category = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "KOBA Bot ticket system" });
  }
  return category;
}

/** "Open Ticket" button - shows the reason dropdown first, no channel created yet. */
function buildReasonPrompt() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("kobabot:ticket_reason")
    .setPlaceholder("What's this about?")
    .addOptions(TICKET_REASONS.map((r) => ({ label: r.label, value: r.value, description: r.description })));
  return { embeds: [infoEmbed("Open a Ticket", "Pick a category, then describe your issue.")], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true };
}

/**
 * Creates a real private ticket channel under 🎫 OPEN TICKETS - this IS the
 * ticket. The DB row (support_tickets) is just a pointer to it (channel_id)
 * so both Discord and the admin web dashboard read/write the same live
 * conversation instead of keeping two copies that can drift out of sync.
 * Only the opener + "KOBA Bot Admin" role can see it while open; closing/
 * archiving tightens that further (see closeTicketChannel/archiveTicketChannel).
 */
async function createTicketChannel(guild, user, reasonValue, message, platform = null, game = null) {
  const category = await ensureTicketsCategory(guild, "open");
  const adminRole = guild.roles.cache.find((r) => r.name === "KOBA Bot Admin");
  const subject = REASON_LABELS[reasonValue] || reasonValue || "Support request";

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (adminRole) {
    overwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channelName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Support ticket opened by ${user.tag}`,
  });

  const ticketId = db.createTicket(guild.id, user.id, subject, message, channel.id, platform, game);

  const embed = baseEmbed(COLORS.info)
    .setTitle(`Ticket #${ticketId}: ${subject}`)
    .setDescription(message)
    .addFields({ name: "Opened by", value: `<@${user.id}>`, inline: true }, { name: "Status", value: "Open", inline: true });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`kobabot:close_ticket:${ticketId}`).setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [closeRow] });
  await postTicketChecklist(channel, reasonValue);

  return { channel, ticketId };
}

/**
 * Closes a ticket: moves it to 🔒 CLOSED TICKETS (never deletes - history
 * stays readable), strips the opener's ability to post further (read-only
 * for them from here), and adds an Archive button for staff.
 */
async function closeTicketChannel(channel, ticket, closedByUserId) {
  db.updateTicket(ticket.id, { status: "closed", closedAt: Date.now() });

  const closedCategory = await ensureTicketsCategory(channel.guild, "closed");
  await channel.setParent(closedCategory.id, { lockPermissions: false }).catch(() => {});
  await channel.permissionOverwrites.edit(ticket.discord_id, { SendMessages: false }).catch(() => {});

  const archiveRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`kobabot:archive_ticket:${ticket.id}`).setLabel("Archive Ticket").setStyle(ButtonStyle.Secondary)
  );

  await channel
    .send({ embeds: [successEmbed("Ticket Closed", `Closed by <@${closedByUserId}>. The opener can still read this channel but can't post further - staff can archive it below when done.`)], components: [archiveRow] })
    .catch(() => {});
}

/** Archives a closed ticket: moves it to 📁 ARCHIVED TICKETS and removes the opener's visibility entirely - from here it's staff-only history, until it's auto-deleted (see runTicketArchiveExpiryTick). */
async function archiveTicketChannel(channel, ticket, archivedByUserId) {
  const archivedAt = Date.now();
  db.updateTicket(ticket.id, { status: "archived", archivedAt });

  const archivedCategory = await ensureTicketsCategory(channel.guild, "archived");
  await channel.setParent(archivedCategory.id, { lockPermissions: false }).catch(() => {});
  await channel.permissionOverwrites.edit(ticket.discord_id, { ViewChannel: false }).catch(() => {});

  const minutes = db.getConfig(channel.guild.id, "ticket_archive_delete_minutes");
  const deleteNote = minutes > 0 ? ` This channel auto-deletes in ${minutes} minute${minutes === 1 ? "" : "s"}.` : "";
  await channel.send({ embeds: [successEmbed("Ticket Archived", `Archived by <@${archivedByUserId}> - staff-only from here.${deleteNote}`)], components: [] }).catch(() => {});
}

/**
 * Permanently deletes archived ticket channels once their admin-configured
 * grace period (default 60 min, /set-config ticket_archive_delete_minutes,
 * 0 = disabled) has elapsed since they were archived. Ticket rows are kept
 * (status flips to 'deleted') for history/audit purposes - only the live
 * Discord channel goes away.
 */
async function runTicketArchiveExpiryTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const minutes = db.getConfig(guild.id, "ticket_archive_delete_minutes");
    if (!minutes || minutes <= 0) continue;

    const cutoff = Date.now() - minutes * 60 * 1000;
    for (const ticket of db.listExpiredArchivedTickets(guild.id, cutoff)) {
      db.updateTicket(ticket.id, { status: "deleted" });
      if (!ticket.channel_id) continue;
      const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
      if (channel) await channel.delete("KOBA Bot auto-delete: archived ticket grace period elapsed").catch(() => {});
    }
  }
}

/** Posts (or re-edits) the permanent "Open a Ticket" panel in the support channel. */
async function deployTicketPanel(supportChannel) {
  const embed = baseEmbed(COLORS.brand)
    .setTitle("Need Help?")
    .setDescription("Click below to open a private ticket with the KOBA Bot team - billing, bugs, or setup help.");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("kobabot:open_ticket").setLabel("Open Ticket").setStyle(ButtonStyle.Primary)
  );

  const meta = db.getGuildMeta(supportChannel.guild.id);
  if (meta?.ticket_panel_message_id) {
    try {
      const existing = await withTimeout(supportChannel.messages.fetch(meta.ticket_panel_message_id), "fetch ticket panel message");
      await withTimeout(existing.edit({ embeds: [embed], components: [row] }), "edit ticket panel message");
      if (!existing.pinned) await withTimeout(existing.pin(), "pin ticket panel message").catch(() => {});
      return existing;
    } catch {
      // message was deleted (or the fetch/edit timed out) - fall through and repost
    }
  }

  const message = await withTimeout(supportChannel.send({ embeds: [embed], components: [row] }), "send ticket panel message");
  await withTimeout(message.pin(), "pin ticket panel message").catch((err) => console.error("[KOBA Bot] Pinning ticket panel failed:", err.message));
  db.upsertGuildMeta(supportChannel.guild.id, { ticket_panel_message_id: message.id, support_channel_id: supportChannel.id });
  return message;
}

// ---------------------------------------------------------------------------
// Router entry points (registered against client.componentHandlers/
// modalHandlers under the "kobabot" customId prefix in index.js) - moved
// here 2026-09-19 from utils/kobabotPanel.js when the Detonation/War Room
// feature it also housed was removed. Ticket buttons are on a PERSISTENT
// pinned panel (deployTicketPanel above), so they need this real dispatcher
// registration, unlike e.g. nuke.js/server-backup.js's "kobabot:"-prefixed
// buttons, which are self-contained via their own temporary
// awaitMessageComponent collectors and never reach this router at all.
// ---------------------------------------------------------------------------

async function handleOpenTicket(interaction) {
  await interaction.reply(buildReasonPrompt());
}

async function handleTicketReasonSelect(interaction) {
  const reasonValue = interaction.values[0];
  const modal = new ModalBuilder().setCustomId(`kobabot:ticket_modal:${reasonValue}`).setTitle("Describe Your Issue");
  const messageInput = new TextInputBuilder().setCustomId("message").setLabel("What's going on?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
  await interaction.showModal(modal);
}

async function handleTicketModal(interaction, reasonValue) {
  await interaction.deferReply({ ephemeral: true });
  const message = interaction.fields.getTextInputValue("message").trim();
  try {
    const { channel } = await createTicketChannel(interaction.guild, interaction.user, reasonValue, message);
    await interaction.editReply({ embeds: [successEmbed("Ticket Opened", `Your ticket is ready: ${channel}`)] });
  } catch (err) {
    console.error("[KOBA Bot] Failed to open ticket channel:", err.message);
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Open Ticket", "KOBA Bot may be missing permission to create channels here. Try `/support` instead, or contact a server admin.")] });
  }
}

async function handleCloseTicket(interaction, ticketId) {
  const ticket = db.getTicket(parseInt(ticketId, 10));
  if (!ticket) {
    await interaction.reply({ embeds: [dangerEmbed("Ticket Not Found", "This ticket record no longer exists.")], ephemeral: true });
    return;
  }
  await interaction.deferReply();
  await closeTicketChannel(interaction.channel, ticket, interaction.user.id);
}

async function handleArchiveTicket(interaction, ticketId) {
  const ticket = db.getTicket(parseInt(ticketId, 10));
  if (!ticket) {
    await interaction.reply({ embeds: [dangerEmbed("Ticket Not Found", "This ticket record no longer exists.")], ephemeral: true });
    return;
  }
  await interaction.deferReply();
  await archiveTicketChannel(interaction.channel, ticket, interaction.user.id);
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];

  switch (action) {
    case "open_ticket":
      return handleOpenTicket(interaction);
    case "ticket_reason":
      return handleTicketReasonSelect(interaction);
    case "close_ticket":
      return handleCloseTicket(interaction, parts[2]);
    case "archive_ticket":
      return handleArchiveTicket(interaction, parts[2]);
    default:
      return null;
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  if (parts[1] === "ticket_modal") return handleTicketModal(interaction, parts[2]);
  return null;
}

module.exports = {
  createTicketChannel,
  closeTicketChannel,
  archiveTicketChannel,
  runTicketArchiveExpiryTick,
  deployTicketPanel,
  ensureTicketsCategory,
  buildReasonPrompt,
  handleComponent,
  handleModal,
  TICKET_REASONS,
  REASON_LABELS,
  STAGE_CATEGORY_NAMES,
};

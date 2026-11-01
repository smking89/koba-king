"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { flagshipGuildId: hubGuildId } = require("./premium");
const { baseEmbed, successEmbed, dangerEmbed, COLORS } = require("./embeds");

function buildListingCard(guild, listing) {
  const server = db.getDirectoryServer(listing.guild_id);
  const embed = baseEmbed(listing.status === "open" ? COLORS.brand : COLORS.warning)
    .setTitle(`${listing.status === "open" ? "🤝" : "[ CLOSED ]"} ${listing.position_name}`)
    .setDescription(listing.description)
    .addFields(
      { name: "Server", value: server ? server.title : guild?.name || "Unknown server", inline: true },
      ...(listing.requirements ? [{ name: "Requirements", value: listing.requirements, inline: false }] : [])
    )
    .setFooter({ text: `Posted by a server owner in the KOBA Bot network` });

  if (listing.status !== "open") return { embeds: [embed], components: [] };

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`staffrecruit:apply_open:${listing.id}`).setLabel("Apply").setStyle(ButtonStyle.Primary).setEmoji("📝"));
  return { embeds: [embed], components: [row] };
}

async function postListing(client, listing) {
  const hubId = hubGuildId();
  if (!hubId) return null;
  const hub = await client.guilds.fetch(hubId).catch(() => null);
  if (!hub) return null;
  const channelId = db.getConfig(hubId, "staff_recruitment_channel_id");
  if (!channelId) return null;
  const channel = await hub.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const message = await channel.send(buildListingCard(null, listing)).catch(() => null);
  if (message) db.setStaffListingMessage(listing.id, channel.id, message.id);
  return message;
}

async function refreshListingCard(client, listing) {
  if (!listing.channel_id || !listing.message_id) return;
  const hub = await client.guilds.fetch(hubGuildId()).catch(() => null);
  const channel = hub ? await hub.channels.fetch(listing.channel_id).catch(() => null) : null;
  const message = channel ? await channel.messages.fetch(listing.message_id).catch(() => null) : null;
  if (message) await message.edit(buildListingCard(null, listing)).catch(() => {});
}

async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  const [, action, idRaw] = interaction.customId.split(":");
  const listingId = Number(idRaw);

  if (action === "apply_open") {
    const listing = db.getStaffListing(listingId);
    if (!listing || listing.status !== "open") {
      await interaction.reply({ embeds: [dangerEmbed("Closed", "This listing is no longer open.")], ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`staffrecruit:apply_modal:${listingId}`).setTitle(`Apply: ${listing.position_name}`.slice(0, 45));
    const experienceInput = new TextInputBuilder()
      .setCustomId("experience")
      .setLabel("Your staff/moderation experience")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(500)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(experienceInput));
    await interaction.showModal(modal);
    return;
  }
}

async function handleModal(interaction) {
  const [, action, idRaw] = interaction.customId.split(":");
  if (action !== "apply_modal") return;
  const listingId = Number(idRaw);

  await interaction.deferReply({ ephemeral: true });

  const listing = db.getStaffListing(listingId);
  if (!listing || listing.status !== "open") {
    await interaction.editReply({ embeds: [dangerEmbed("Closed", "This listing is no longer open.")] });
    return;
  }

  const experience = interaction.fields.getTextInputValue("experience").trim();
  db.submitStaffApplication(listingId, interaction.user.id, experience);

  // Notify the poster by DM, including a lightweight cross-server activity
  // signal ("Cross-Community Staff Verification") - how many other KOBA Bot
  // servers this applicant has ever been rostered on, not a trust score,
  // just visibility the poster wouldn't otherwise have.
  try {
    const poster = await interaction.client.users.fetch(listing.posted_by).catch(() => null);
    const guildCount = db.countLinkedGuilds(interaction.user.id);
    const embed = baseEmbed(COLORS.brand)
      .setTitle(`New Applicant: ${listing.position_name}`)
      .setDescription(experience)
      .addFields(
        { name: "Applicant", value: interaction.user.tag, inline: true },
        { name: "Network Activity", value: `Rostered on ${guildCount} KOBA Bot server${guildCount === 1 ? "" : "s"}`, inline: true }
      );
    await poster?.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.warn("[KOBA Bot] Staff application notify failed:", err.message);
  }

  await interaction.editReply({ embeds: [successEmbed("Application Submitted", "The server owner has been notified.")] });
}

module.exports = { buildListingCard, postListing, refreshListingCard, handleComponent, handleModal };

"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { infoEmbed } = require("./embeds");
const { CHANNEL_CONTENT } = require("../config/templates");

/**
 * Owner/Admin and Mod "panels" - replace the old always-visible wall-of-text
 * reference channels (👑-owner-guide, 🛡️-staff-commands) with a single
 * pinned button that opens the same reference content on demand (ephemeral,
 * only the clicker sees it). Content itself is unchanged - still sourced
 * from config/templates.js's CHANNEL_CONTENT so there's exactly one place
 * that text lives. The channel's own permission overwrites (restrictedTo in
 * the template) are still what actually gates who can see/click this at
 * all - the role checks below are just a friendly message, not the real
 * security boundary.
 *
 * Deployed via utils/provisioning.js's normal BUTTON_PANELS/CHANNEL_CONTENT
 * + postWelcomeContentOnce pipeline (see the "playerHub"/"staffPanel"/
 * "modPanel" keys there), not a standalone deploy function here - that
 * keeps message-id tracking in one place instead of two systems fighting
 * over who posted the panel.
 */
function buildOwnerAdminHub() {
  const embed = infoEmbed("🛡️ Owner & Admin Panel", "Click below for the full command reference - setup, RCON, economy, events, and the danger zone.");
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("staffpanel:owner_guide").setLabel("📖 Owner & Admin Guide").setStyle(ButtonStyle.Primary));
  return { embeds: [embed], components: [row] };
}

function buildModHub() {
  const embed = infoEmbed("🔰 Mod Panel", "Click below for the day-to-day mod/staff command reference.");
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("staffpanel:mod_guide").setLabel("📖 Mod & Staff Guide").setStyle(ButtonStyle.Primary));
  return { embeds: [embed], components: [row] };
}

async function handleComponent(interaction) {
  const action = interaction.customId.split(":")[1];

  if (action === "owner_guide") {
    const content = CHANNEL_CONTENT.ownerGuide;
    await interaction.reply({ embeds: [infoEmbed(content.title, content.description)], ephemeral: true });
    return;
  }

  if (action === "mod_guide") {
    const content = CHANNEL_CONTENT.staffCommands;
    await interaction.reply({ embeds: [infoEmbed(content.title, content.description)], ephemeral: true });
    return;
  }
}

module.exports = { buildOwnerAdminHub, buildModHub, handleComponent };

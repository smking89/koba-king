"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { requirePlan } = require("../utils/premium");
const { flagshipGuildId: hubGuildId } = require("../utils/premium");
const { postListing, refreshListingCard } = require("../utils/staffRecruitment");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff-post")
    .setDescription("[Restricted] Post an open staff position to the cross-server BoomBot Staff Recruitment hub")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Post a new listing")
        .addStringOption((opt) => opt.setName("position").setDescription("e.g. Moderator, Admin").setRequired(true).setMaxLength(50))
        .addStringOption((opt) => opt.setName("description").setDescription("What the role involves").setRequired(true).setMaxLength(500))
        .addStringOption((opt) => opt.setName("requirements").setDescription("Experience/availability you're looking for").setMaxLength(500))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Show your server's open listings"))
    .addSubcommand((sub) => sub.setName("close").setDescription("Close one of your listings").addIntegerOption((opt) => opt.setName("id").setDescription("Listing ID").setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This requires Manage Server permission.")] });
      return;
    }
    // Staff Recruitment Network is a Pro/Max feature (per website/src/components/PlanGrid.jsx)
    if (!(await requirePlan(interaction, "pro", "The Staff Recruitment Network"))) return;

    if (!hubGuildId()) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Set Up", "The Staff Recruitment hub hasn't been configured yet - ask a BoomBot admin to run `/directory-setup`.")] });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "list") {
      const listings = db.listOpenStaffListingsForGuild(guildId);
      if (!listings.length) {
        await interaction.editReply({ embeds: [infoEmbed("Your Listings", "No open listings.")] });
        return;
      }
      const lines = listings.map((l) => {
        const applicants = db.listStaffApplications(l.id).length;
        return `**#${l.id} - ${l.position_name}** - ${applicants} applicant${applicants === 1 ? "" : "s"}`;
      });
      await interaction.editReply({ embeds: [infoEmbed("Your Listings", lines.join("\n"))] });
      return;
    }

    if (sub === "close") {
      const id = interaction.options.getInteger("id", true);
      const listing = db.getStaffListing(id);
      if (!listing || listing.guild_id !== guildId) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No listing with that ID from this server.")] });
        return;
      }
      db.closeStaffListing(id);
      await refreshListingCard(interaction.client, db.getStaffListing(id));
      await interaction.editReply({ embeds: [successEmbed("Closed", `**${listing.position_name}** is no longer accepting applicants.`)] });
      return;
    }

    // sub === "create"
    const listing = db.createStaffListing(guildId, {
      postedBy: interaction.user.id,
      positionName: interaction.options.getString("position", true).trim(),
      description: interaction.options.getString("description", true).trim(),
      requirements: interaction.options.getString("requirements")?.trim(),
    });

    const message = await postListing(interaction.client, listing);
    await interaction.editReply({
      embeds: [successEmbed("Listing Posted", message ? `**${listing.position_name}** (#${listing.id}) is now live in the Staff Recruitment hub. You'll get a DM for every applicant.` : "Listing saved, but posting to the hub channel failed - check it still exists.")],
    });
  },
};

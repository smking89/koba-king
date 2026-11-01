"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { isBotOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

/**
 * Manually grants/revokes the REAL KABOOM Pro subscription (database/schema.sql's
 * kaboom_pro_subscriptions - profile theme/banner/nameplate cosmetics +
 * server directory card cosmetics, checked by db.isKaboomProActive
 * everywhere on the website). Bot-owner only, for support/testing/manual
 * grants when a Tip4Serv purchase doesn't apply.
 *
 * FIXED (2026-09-15): this used to grant/revoke a completely different,
 * older, unrelated system - a simple binary "💥 KABOOM" Discord role
 * (db.grantKaboomMembership/kaboom_members table) with no expiry and no
 * connection whatsoever to the real KABOOM Pro subscription the website
 * actually checks. Granting it here did nothing visible on the website -
 * confirmed via direct report (granted via this command, /perks still
 * showed the upsell). Now calls the real db.setKaboomProExpiry, with a
 * required duration choice (including Lifetime, represented as a expiry
 * 100 years out rather than a schema change, since kaboom_pro_subscriptions.expires_at
 * is NOT NULL by design - every other subscription table in this codebase
 * uses the same "far-future timestamp" convention for a lifetime grant).
 */
const DURATION_CHOICES = [
  { name: "1 Day", value: "1" },
  { name: "7 Days", value: "7" },
  { name: "30 Days", value: "30" },
  { name: "90 Days", value: "90" },
  { name: "365 Days", value: "365" },
  { name: "Lifetime", value: "lifetime" },
];
const LIFETIME_MS = 100 * 365 * 24 * 60 * 60 * 1000;

module.exports = {
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("kaboom-membership")
    .setDescription("[Dev Only] Grant or revoke a Discord user's KABOOM Pro subscription")
    .addSubcommand((sub) =>
      sub
        .setName("grant")
        .setDescription("Grant KABOOM Pro")
        .addUserOption((opt) => opt.setName("user").setDescription("Who gets it").setRequired(true))
        .addStringOption((opt) => opt.setName("duration").setDescription("How long").setRequired(true).addChoices(...DURATION_CHOICES))
    )
    .addSubcommand((sub) =>
      sub
        .setName("revoke")
        .setDescription("Revoke KABOOM Pro")
        .addUserOption((opt) => opt.setName("user").setDescription("Whose subscription to revoke").setRequired(true))
    ),

  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot administrators.")], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser("user", true);

    if (sub === "grant") {
      const duration = interaction.options.getString("duration", true);
      const expiresAt = duration === "lifetime" ? Date.now() + LIFETIME_MS : Date.now() + Number(duration) * 24 * 60 * 60 * 1000;
      db.setKaboomProExpiry(targetUser.id, expiresAt, interaction.user.id);
      const label = duration === "lifetime" ? "lifetime" : `${duration} day(s)`;
      await interaction.editReply({
        embeds: [successEmbed("KABOOM Pro Granted", `**${targetUser.tag}** now has KABOOM Pro (${label}) - visible immediately on the website (/perks, profile card, server directory card if they own one).`)],
      });
      return;
    }

    // revoke - expire it immediately rather than deleting the row, so the
    // subscription history (granted_by, original expiry) stays intact.
    db.setKaboomProExpiry(targetUser.id, Date.now() - 1, interaction.user.id);
    await interaction.editReply({
      embeds: [successEmbed("KABOOM Pro Revoked", `**${targetUser.tag}** no longer has KABOOM Pro.`)],
    });
  },
};

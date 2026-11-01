"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { infoEmbed } = require("../utils/embeds");
const { currentPeriodStart, PERIODS } = require("../utils/referralLeaderboard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("referral-leaderboard")
    .setDescription("View the current referral standings.")
    .addStringOption((opt) =>
      opt
        .setName("period")
        .setDescription("Which period to show (default: all-time)")
        .addChoices(...PERIODS.map((p) => ({ name: p, value: p })), { name: "all-time", value: "all" })
    ),

  async execute(interaction) {
    const period = interaction.options.getString("period") || "all";
    const since = period === "all" ? 0 : currentPeriodStart(period);
    const leaderboard = db.getReferralLeaderboard(interaction.guildId, since, Date.now(), 10);

    if (!leaderboard.length) {
      await interaction.reply({ embeds: [infoEmbed("Referral Leaderboard", "No referrals recorded yet for this period.")], ephemeral: true });
      return;
    }

    const lines = leaderboard.map((row, i) => `**#${i + 1}** <@${row.referrer_id}> - ${row.referrals} referral(s)`);
    await interaction.reply({
      embeds: [infoEmbed(`Referral Leaderboard${period === "all" ? " (All-Time)" : ` (${period[0].toUpperCase()}${period.slice(1)})`}`, lines.join("\n"))],
      ephemeral: true,
    });
  },
};

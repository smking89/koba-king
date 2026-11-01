"use strict";

const { SlashCommandBuilder } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const db = require("../database/db");
const { infoEmbed, dangerEmbed } = require("../utils/embeds");

/**
 * The Official BOOMbot Guild leaderboards (spec sections 25-28) - a
 * distinct concept from a normal server's own leaderboards: these are
 * scoped specifically to process.env.OFFICIAL_GUILD_ID (the same "official
 * guild" concept already used by /activate-user, /ban, /manage-licenses,
 * /directory-setup - not new infrastructure), NOT to "global platform
 * statistics" (spec section 26 explicitly warns against confusing the two
 * - global stats live in database/db.js's official-stats count query, a
 * different thing entirely).
 *
 * Only categories with a REAL backing table are exposed (spec section 25:
 * "only expose metrics that actually exist in the repository") - "Total
 * Winnings"/"Highest Payout"/"Game Win Rate" would need a running-total
 * column that doesn't exist anywhere yet, so those are left out rather
 * than fabricated.
 */
const CATEGORIES = {
  players: { label: "🏆 Top Players", query: db.getTopByProgression, format: (r) => `Prestige ${r.prestige} · Level ${r.level}` },
  xp: { label: "⭐ Lifetime XP", query: db.getTopByLifetimeXp, format: (r) => `${r.lifetime_xp.toLocaleString()} XP` },
  rivals: { label: "⚔️ Rival Wins", query: db.getTopRivalWins, format: (r) => `${r.wins} win(s)` },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("official-leaderboard")
    .setDescription("[Official BOOMbot Guild only] View the official BOOMbot competitive leaderboards")
    .addStringOption((opt) =>
      opt
        .setName("category")
        .setDescription("Which leaderboard")
        .setRequired(true)
        .addChoices({ name: "Top Players", value: "players" }, { name: "Lifetime XP", value: "xp" }, { name: "Rival Wins", value: "rivals" })
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    if (!process.env.OFFICIAL_GUILD_ID || interaction.guildId !== process.env.OFFICIAL_GUILD_ID) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "This command only works in the official BOOMbot server.")] });
      return;
    }

    const key = interaction.options.getString("category", true);
    const category = CATEGORIES[key];
    const rows = category.query(process.env.OFFICIAL_GUILD_ID, 10);
    if (!rows.length) {
      await interaction.editReply({ embeds: [infoEmbed(category.label, "No entries yet.")] });
      return;
    }
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> - ${category.format(r)}`).join("\n");
    await interaction.editReply({ embeds: [infoEmbed(category.label, lines)] });
  },
};

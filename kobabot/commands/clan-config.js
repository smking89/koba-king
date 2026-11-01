"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { hasFactionLeaderClearance, getRequesterMembership } = require("../utils/teamAuth");
const { RANKS } = require("../config/ranks");
const { listEffectiveRanks } = require("../utils/rankOverrides");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

const RANK_CHOICES = RANKS.map((r) => ({ name: `${r.id} - ${r.name}`, value: r.id }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clan-config")
    .setDescription("Configure your team's clan tag, rules, and rank names/badges")
    .addSubcommand((sub) => sub.setName("view").setDescription("Show your team's current clan tag, rules, and rank overrides"))
    .addSubcommand((sub) =>
      sub
        .setName("tag")
        .setDescription("Set your team's clan tag (display-only prefix)")
        .addStringOption((opt) => opt.setName("value").setDescription("e.g. KOBA - leave blank to clear it").setMaxLength(10))
    )
    .addSubcommand((sub) =>
      sub
        .setName("rules")
        .setDescription("Set your team's clan rules text")
        .addStringOption((opt) => opt.setName("text").setDescription("Leave blank to clear it").setMaxLength(1000))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("rank")
        .setDescription("Rename or rebadge a rank tier for your team")
        .addSubcommand((sub) =>
          sub
            .setName("rename")
            .setDescription("Give a rank tier a custom display name")
            .addStringOption((opt) => opt.setName("rank").setDescription("Which rank tier").setRequired(true).addChoices(...RANK_CHOICES))
            .addStringOption((opt) => opt.setName("name").setDescription("Custom name - leave blank to reset to default").setMaxLength(50))
        )
        .addSubcommand((sub) =>
          sub
            .setName("badge")
            .setDescription("Give a rank tier a custom badge image")
            .addStringOption((opt) => opt.setName("rank").setDescription("Which rank tier").setRequired(true).addChoices(...RANK_CHOICES))
            .addStringOption((opt) => opt.setName("image_url").setDescription("Direct image URL - leave blank to remove the badge"))
        )
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Reset one rank (or every rank) back to the default clan template")
            .addStringOption((opt) => opt.setName("rank").setDescription("Which rank tier - leave blank to reset ALL ranks").addChoices(...RANK_CHOICES))
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const requester = getRequesterMembership(interaction);
    if (!hasFactionLeaderClearance(interaction, requester)) {
      await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Faction Leader clearance (or Corporal+ rank) to configure your clan.")] });
      return;
    }
    if (!requester) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")] });
      return;
    }

    const guildId = interaction.guildId;
    const teamName = requester.team_name;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === "view") {
      const team = db.getTeam(guildId, teamName);
      const ranks = listEffectiveRanks(guildId, teamName);
      const overriddenLines = ranks.filter((r) => r.isCustomName || r.isCustomBadge).map((r) => `**${r.id}** - ${r.name}${r.isCustomBadge ? " 🖼️" : ""}`);

      await interaction.editReply({
        embeds: [
          infoEmbed(
            `${teamName} - Clan Config`,
            `**Clan Tag:** ${team.clan_tag || "*(not set)*"}\n**Clan Rules:** ${team.clan_rules || "*(not set)*"}\n\n` +
              (overriddenLines.length ? `**Rank Overrides:**\n${overriddenLines.join("\n")}` : "**Rank Overrides:** *(none - using the default clan template)*")
          ),
        ],
      });
      return;
    }

    if (!group && sub === "tag") {
      const value = interaction.options.getString("value")?.trim() || null;
      db.updateTeamFields(guildId, teamName, { clan_tag: value });
      await interaction.editReply({ embeds: [successEmbed("Clan Tag Updated", value ? `**${teamName}**'s clan tag is now **${value}**.` : `**${teamName}**'s clan tag has been cleared.`)] });
      return;
    }

    if (!group && sub === "rules") {
      const text = interaction.options.getString("text")?.trim() || null;
      db.updateTeamFields(guildId, teamName, { clan_rules: text });
      await interaction.editReply({ embeds: [successEmbed("Clan Rules Updated", text ? `**${teamName}**'s clan rules have been updated.` : `**${teamName}**'s clan rules have been cleared.`)] });
      return;
    }

    if (group === "rank" && sub === "rename") {
      const rankId = interaction.options.getString("rank", true);
      const name = interaction.options.getString("name")?.trim() || undefined;
      db.setRankOverride(guildId, teamName, rankId, { customName: name === undefined ? null : name });
      await interaction.editReply({ embeds: [successEmbed("Rank Renamed", name ? `**${rankId}** is now displayed as **${name}** for **${teamName}**.` : `**${rankId}**'s custom name was cleared - back to the default.`)] });
      return;
    }

    if (group === "rank" && sub === "badge") {
      const rankId = interaction.options.getString("rank", true);
      const imageUrl = interaction.options.getString("image_url")?.trim() || null;
      db.setRankOverride(guildId, teamName, rankId, { badgeUrl: imageUrl });
      const embed = successEmbed("Rank Badge Updated", imageUrl ? `**${rankId}** now has a custom badge for **${teamName}**.` : `**${rankId}**'s custom badge was removed.`);
      if (imageUrl) embed.setThumbnail(imageUrl);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (group === "rank" && sub === "reset") {
      const rankId = interaction.options.getString("rank");
      if (rankId) {
        db.clearRankOverride(guildId, teamName, rankId);
        await interaction.editReply({ embeds: [successEmbed("Rank Reset", `**${rankId}** is back to the default clan template.`)] });
      } else {
        db.clearAllRankOverrides(guildId, teamName);
        await interaction.editReply({ embeds: [successEmbed("All Ranks Reset", `Every rank for **${teamName}** is back to the default clan template.`)] });
      }
      return;
    }
  },
};

"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("frank-faq")
    .setDescription("[Restricted] Manage Frank's keyword-triggered FAQ answers")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Teach Frank a new keyword -> answer")
        .addStringOption((opt) => opt.setName("keywords").setDescription("Comma-separated trigger words/phrases (e.g. \"kit, kits, claim kit\")").setRequired(true))
        .addStringOption((opt) => opt.setName("answer").setDescription("What Frank should reply with").setRequired(true))
        .addStringOption((opt) => opt.setName("link").setDescription("Optional link to include (a channel link, guide, etc.)"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove one of Frank's FAQ entries")
        .addIntegerOption((opt) => opt.setName("id").setDescription("Entry ID - see /frank-faq list").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List every FAQ entry Frank knows in this server")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const keywords = interaction.options.getString("keywords", true).trim();
      const answer = interaction.options.getString("answer", true).trim();
      const link = interaction.options.getString("link")?.trim() || null;
      const id = db.addFrankFaq(guildId, keywords, answer, link, interaction.user.id);
      await interaction.editReply({ embeds: [successEmbed("FAQ Entry Added", `**#${id}** - triggers on: ${keywords}\n\nMake sure Frank's channel is set (\`/set announcement-channel target:Frank (FAQ helper)\`) if you haven't already.`)] });
      return;
    }

    if (sub === "remove") {
      const id = interaction.options.getInteger("id", true);
      const removed = db.removeFrankFaq(guildId, id);
      if (!removed) {
        await interaction.editReply({ embeds: [dangerEmbed("Not Found", `No FAQ entry **#${id}** in this server - check \`/frank-faq list\`.`)] });
        return;
      }
      await interaction.editReply({ embeds: [successEmbed("FAQ Entry Removed", `**#${id}** was deleted.`)] });
      return;
    }

    // sub === "list"
    const entries = db.listFrankFaq(guildId);
    if (!entries.length) {
      await interaction.editReply({ embeds: [infoEmbed("No FAQ Entries Yet", "Add one with `/frank-faq add`.")] });
      return;
    }
    const lines = entries.map((e) => `**#${e.id}** \`${e.keywords}\`\n> ${e.answer.length > 100 ? e.answer.slice(0, 100) + "…" : e.answer}`);
    await interaction.editReply({ embeds: [infoEmbed(`Frank's FAQ (${entries.length})`, lines.join("\n\n"))] });
  },
};

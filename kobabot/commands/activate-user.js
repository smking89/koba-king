"use strict";

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { isBotOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed } = require("../utils/embeds");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COUNT = 25; // sane ceiling - anything bigger is almost certainly a typo, not a real bulk grant

module.exports = {
  // Bot-owner + official-server-only at runtime already, made structurally
  // invisible everywhere else too - see events/ready.js's autoDeployCommands.
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("activate-user")
    .setDescription("[Dev Only] Grant a Discord account one or more BoomBot license(s) - Pro or Max, timed or lifetime")
    .addUserOption((opt) => opt.setName("user").setDescription("The Discord user to grant license(s) to").setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName("plan")
        .setDescription("Which plan to grant")
        .setRequired(true)
        .addChoices({ name: "Pro", value: "pro" }, { name: "Max", value: "max" })
    )
    .addIntegerOption((opt) =>
      opt
        .setName("duration_days")
        .setDescription("Days until it expires - omit for a lifetime grant that never expires")
        .setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription(`How many independent licenses to grant at once (default 1, e.g. 5 for "5 servers") - max ${MAX_COUNT}`)
        .setMinValue(1)
        .setMaxValue(MAX_COUNT)
    )
    .addStringOption((opt) => opt.setName("note").setDescription("Optional label for these licenses, e.g. \"5-pack for KOBA network\"").setMaxLength(200)),

  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({
        embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot administrators.")],
        ephemeral: true,
      });
      return;
    }

    // Restricted to the official BoomBot server specifically - even the bot
    // owner shouldn't be able to grant licenses from inside a customer's
    // server, which would otherwise be an easy way to bypass billing there.
    if (!process.env.OFFICIAL_GUILD_ID || interaction.guild?.id !== process.env.OFFICIAL_GUILD_ID) {
      await interaction.reply({
        embeds: [dangerEmbed("Wrong Server", "/activate-user only works in the official BoomBot Discord server.")],
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const plan = interaction.options.getString("plan", true);
    const durationDays = interaction.options.getInteger("duration_days");
    const count = interaction.options.getInteger("count") ?? 1;
    const note = interaction.options.getString("note");
    const expiresAt = durationDays ? Date.now() + durationDays * DAY_MS : null;

    db.grantLicenses(targetUser.id, { plan, expiresAt, grantedBy: interaction.user.id, note, count });

    const planLabel = plan === "max" ? "Max" : "Pro";
    const expiryLine = expiresAt ? `until <t:${Math.floor(expiresAt / 1000)}:F>` : "**for life** (never expires)";
    const countLine = count > 1 ? `**${count}** independent ${planLabel} licenses` : `one ${planLabel} license`;

    await interaction.reply({
      embeds: [
        successEmbed(
          "License(s) Granted",
          `**${targetUser.tag}** (\`${targetUser.id}\`) was granted ${countLine}, ${expiryLine}.${note ? `\n**Note:** ${note}` : ""}\n\nEach license auto-claims to whichever server they use it on first - if they already own ${count > 1 ? "servers" : "a server"} BoomBot is in, it unlocks automatically on their next interaction there.`
        ),
      ],
      ephemeral: true,
    });
  },
};

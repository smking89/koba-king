"use strict";

/**
 * Killfeed display + reward config (2026-10-18). Separate command rather
 * than folded into /config-misc or /config-economy - those are already
 * near Discord's 8000-byte per-command size cap (see commands/config.js's
 * 2026-10-13 split history), and this needed its own 3+ option subcommand.
 */

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("killfeed-config")
    .setDescription("[Restricted] Configure the killfeed display channel and currency rewards")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Configure the killfeed - leave an option blank to leave it unchanged")
        .addChannelOption((opt) => opt.setName("channel").setDescription("Where PvP/PvE kills get posted").addChannelTypes(ChannelType.GuildText))
        .addBooleanOption((opt) => opt.setName("ingame_broadcast").setDescription("Also broadcast kills in-game via global.say"))
        .addStringOption((opt) => opt.setName("currency").setDescription("Which currency kill rewards pay out in (see /shop-panel)"))
        .addNumberOption((opt) => opt.setName("pvp_amount").setDescription("Coins per PvP kill (before diminishing-returns/shutdown bonuses)").setMinValue(0))
        .addNumberOption((opt) => opt.setName("pve_amount").setDescription("Coins per PvE (NPC) kill").setMinValue(0))
        .addNumberOption((opt) => opt.setName("shutdown_bonus_per_streak").setDescription("Extra coins per streak-point ended, once a Shutdown tier (3+ streak) is hit").setMinValue(0))
        .addNumberOption((opt) => opt.setName("nemesis_bonus").setDescription("Flat bonus coins on a Nemesis kill or Nemesis Down").setMinValue(0))
    )
    .addSubcommand((sub) => sub.setName("view").setDescription("Show the current killfeed config"))
    .addSubcommand((sub) => sub.setName("disable").setDescription("Stop posting the killfeed (unsets the channel)")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "disable") {
      db.upsertGuildMeta(guildId, { kill_feed_channel_id: null });
      await interaction.editReply({ embeds: [successEmbed("Killfeed Disabled", "No channel configured - kills will no longer be posted.")] });
      return;
    }

    if (sub === "view") {
      const meta = db.getGuildMeta(guildId);
      const currencyId = db.getConfig(guildId, "killfeed_coins_currency_id");
      const currency = currencyId ? db.getCurrency(guildId, currencyId) : null;
      await interaction.editReply({
        embeds: [
          infoEmbed(
            "Killfeed Config",
            [
              `**Channel:** ${meta?.kill_feed_channel_id ? `<#${meta.kill_feed_channel_id}>` : "_Not set (killfeed disabled)_"}`,
              `**In-game broadcast:** ${db.getConfig(guildId, "killfeed_ingame_enabled") ? "On" : "Off"}`,
              `**Reward currency:** ${currency ? `${currency.emoji || ""} ${currency.name}` : "_Not set_"}`,
              `**PvP kill reward:** ${Number(db.getConfig(guildId, "killfeed_coins_pvp_amount")) || 0}`,
              `**PvE kill reward:** ${Number(db.getConfig(guildId, "killfeed_coins_pve_amount")) || 0}`,
              `**Shutdown bonus/streak-point:** ${Number(db.getConfig(guildId, "killfeed_coins_shutdown_bonus")) || 0}`,
              `**Nemesis bonus:** ${Number(db.getConfig(guildId, "killfeed_coins_nemesis_bonus")) || 0}`,
            ].join("\n")
          ),
        ],
      });
      return;
    }

    // set
    const channel = interaction.options.getChannel("channel");
    const ingame = interaction.options.getBoolean("ingame_broadcast");
    const currencyName = interaction.options.getString("currency")?.trim();
    const pvpAmount = interaction.options.getNumber("pvp_amount");
    const pveAmount = interaction.options.getNumber("pve_amount");
    const shutdownBonus = interaction.options.getNumber("shutdown_bonus_per_streak");
    const nemesisBonus = interaction.options.getNumber("nemesis_bonus");

    if (currencyName) {
      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}**. Check \`/shop-panel\`.`)] });
        return;
      }
      db.setConfig(guildId, "killfeed_coins_currency_id", currency.id);
    }

    if (channel) db.upsertGuildMeta(guildId, { kill_feed_channel_id: channel.id });
    if (ingame !== null) db.setConfig(guildId, "killfeed_ingame_enabled", ingame);
    if (pvpAmount !== null) db.setConfig(guildId, "killfeed_coins_pvp_amount", pvpAmount);
    if (pveAmount !== null) db.setConfig(guildId, "killfeed_coins_pve_amount", pveAmount);
    if (shutdownBonus !== null) db.setConfig(guildId, "killfeed_coins_shutdown_bonus", shutdownBonus);
    if (nemesisBonus !== null) db.setConfig(guildId, "killfeed_coins_nemesis_bonus", nemesisBonus);

    await interaction.editReply({ embeds: [successEmbed("Killfeed Config Updated", "Run `/killfeed-config view` to see the current settings.")] });
  },
};

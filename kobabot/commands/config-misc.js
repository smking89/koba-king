"use strict";

/**
 * Split out of the original /config (2026-10-13) - that single command's
 * 14 subcommand groups exceeded Discord's 8000-byte per-command size cap.
 * This file holds the remaining groups: autokit (Dynamic Adaptive Kit
 * Engine admin panel), leaderboard (Clan Wars/PvP/PvE/Event Wins reward
 * config), orp (Offline Raid Protection zone appearance defaults),
 * coin-earn (playtime coin earning). Business logic/DB calls are byte-
 * identical to the original /config - only which file/command they live
 * under moved.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { buildList } = require("../utils/autoKitAdminPanel");
const { hasAdminClearance } = require("../utils/teamAuth");
const { CATEGORIES } = require("../utils/categoryLeaderboards");
const { isValidHex } = require("../utils/messageStyle");
const { successEmbed, dangerEmbed, infoEmbed, errorEmbed } = require("../utils/embeds");
const { LEADERBOARD_PERIOD_CHOICES, LEADERBOARD_REWARD_TYPE_CHOICES } = require("../utils/configHelpers");

const LEADERBOARD_CATEGORY_CHOICES = Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.label, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config-misc")
    .setDescription("[Restricted] Configure auto-kits, leaderboards, ORP appearance, and playtime coins")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("autokit")
        .setDescription("Configure the Dynamic Adaptive Kit Engine - bind chat triggers to kits")
        .addSubcommand((sub) => sub.setName("manage").setDescription("Open the Dynamic Adaptive Kit Engine admin panel"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("leaderboard")
        .setDescription("Configure Clan Wars / PvP / PvE / Event Wins leaderboard rewards")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set the reward for a place on a category/period leaderboard")
            .addStringOption((opt) => opt.setName("category").setDescription("Which leaderboard").setRequired(true).addChoices(...LEADERBOARD_CATEGORY_CHOICES))
            .addStringOption((opt) => opt.setName("period").setDescription("Which time period").setRequired(true).addChoices(...LEADERBOARD_PERIOD_CHOICES))
            .addIntegerOption((opt) => opt.setName("place").setDescription("1st, 2nd, 3rd, etc.").setRequired(true).setMinValue(1).setMaxValue(10))
            .addStringOption((opt) => opt.setName("reward_type").setDescription("Kit or role").setRequired(true).addChoices(...LEADERBOARD_REWARD_TYPE_CHOICES))
            .addStringOption((opt) => opt.setName("kit_name").setDescription("Exact internal kit name (required if reward_type is Kit)"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role to grant (required if reward_type is Role)"))
            .addIntegerOption((opt) => opt.setName("role_temp_hours").setDescription("Auto-remove the role after this many hours (blank = permanent)").setMinValue(1))
        )
        .addSubcommand((sub) =>
          sub
            .setName("view")
            .setDescription("Show configured rewards for a category/period")
            .addStringOption((opt) => opt.setName("category").setDescription("Which leaderboard").setRequired(true).addChoices(...LEADERBOARD_CATEGORY_CHOICES))
            .addStringOption((opt) => opt.setName("period").setDescription("Which time period").setRequired(true).addChoices(...LEADERBOARD_PERIOD_CHOICES))
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("coin-earn")
        .setDescription("Configure coins earned for active playtime, with an anti-AFK-farm kick")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Configure playtime coin earning")
            .addStringOption((opt) => opt.setName("currency").setDescription("Which currency (see /shop-panel)").setRequired(true))
            .addNumberOption((opt) => opt.setName("amount").setDescription("Coins earned per interval").setRequired(true).setMinValue(0.01))
            .addIntegerOption((opt) => opt.setName("interval_minutes").setDescription("How often coins are earned, in minutes").setRequired(true).setMinValue(1))
            .addIntegerOption((opt) => opt.setName("afk_kick_minutes").setDescription("Kick players whose position hasn't moved for this long - blank/0 disables the kick"))
        )
        .addSubcommand((sub) => sub.setName("view").setDescription("Show the current playtime coin config"))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Turn off playtime coin earning"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("orp")
        .setDescription("Configure this server's ORP (Offline Raid Protection) zone appearance defaults")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Update ORP zone appearance defaults - leave an option blank to leave it unchanged")
            .addStringOption((opt) =>
              opt
                .setName("shape")
                .setDescription("Zone shape used for new/re-registered ORP zones (default Sphere)")
                .addChoices({ name: "Sphere", value: "Sphere" }, { name: "Box", value: "Box" })
            )
            .addStringOption((opt) => opt.setName("online_color").setDescription("Hex color while the team is online, e.g. #00FF00 (default #00FF00)"))
            .addStringOption((opt) => opt.setName("protected_color").setDescription("Hex color while the team is offline/protected, e.g. #FF0000 (default #FF0000)"))
            .addStringOption((opt) => opt.setName("enter_message").setDescription("Chat message shown when a player enters an ORP zone").setMaxLength(300))
            .addStringOption((opt) => opt.setName("leave_message").setDescription("Chat message shown when a player leaves an ORP zone").setMaxLength(300))
        )
        .addSubcommand((sub) => sub.setName("view").setDescription("Show this server's current ORP appearance config"))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();

    if (group === "autokit") {
      if (!(await requirePremiumOwner(interaction))) return;
      if (!hasAdminClearance(interaction)) {
        await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")] });
        return;
      }
      await interaction.editReply(buildList(interaction.guildId));
      return;
    }

    if (group === "leaderboard") {
      const category = interaction.options.getString("category", true);
      const period = interaction.options.getString("period", true);

      if (sub === "set") {
        const place = interaction.options.getInteger("place", true);
        const rewardType = interaction.options.getString("reward_type", true);
        const kitName = interaction.options.getString("kit_name")?.trim();
        const role = interaction.options.getRole("role");
        const roleTempHours = interaction.options.getInteger("role_temp_hours");

        if (rewardType === "kit" && !kitName) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Kit Name", "reward_type Kit requires kit_name.")] });
          return;
        }
        if (rewardType === "role" && !role) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Role", "reward_type Role requires role.")] });
          return;
        }

        db.setGenericLeaderboardReward(guildId, category, period, place, {
          rewardType,
          kitName: rewardType === "kit" ? kitName : null,
          roleId: rewardType === "role" ? role.id : null,
          roleTempHours: roleTempHours ?? null,
        });

        await interaction.editReply({
          embeds: [successEmbed("Reward Set", `**${CATEGORIES[category].label}** #${place} (${period}) now grants ${rewardType === "kit" ? `kit **${kitName}**` : `role ${role}`}.`)],
        });
        return;
      }

      if (sub === "view") {
        const rewards = db.listGenericLeaderboardRewards(guildId, category, period);
        if (!rewards.length) {
          await interaction.editReply({ embeds: [infoEmbed("Leaderboard Rewards", "None configured for this category/period yet.")] });
          return;
        }
        const lines = rewards.map((r) => `**#${r.place}**: ${r.reward_type === "kit" ? `kit **${r.kit_name}**` : `role <@&${r.role_id}>${r.role_temp_hours ? ` (${r.role_temp_hours}h)` : ""}`}`);
        await interaction.editReply({ embeds: [infoEmbed(`${CATEGORIES[category].label} - ${period}`, lines.join("\n"))] });
        return;
      }
      return;
    }

    if (group === "coin-earn") {
      if (sub === "view") {
        const enabled = db.getConfig(guildId, "playtime_coins_enabled");
        if (!enabled) {
          await interaction.editReply({ embeds: [infoEmbed("Playtime Coins", "Disabled.")] });
          return;
        }
        const currencyId = db.getConfig(guildId, "playtime_coins_currency_id");
        const currency = db.getCurrency(guildId, currencyId);
        const amount = db.getConfig(guildId, "playtime_coins_amount");
        const interval = db.getConfig(guildId, "playtime_coins_interval_minutes");
        const kickMinutes = db.getConfig(guildId, "playtime_afk_kick_minutes");
        await interaction.editReply({
          embeds: [infoEmbed("Playtime Coins", `🟢 Enabled - **${amount} ${currency?.name || "coins"}** every **${interval} min** of active play.\nAFK kick: ${kickMinutes ? `after **${kickMinutes} min** of no movement` : "disabled"}.`)],
        });
        return;
      }

      if (sub === "disable") {
        db.setConfig(guildId, "playtime_coins_enabled", false);
        await interaction.editReply({ embeds: [successEmbed("Disabled", "Playtime coin earning turned off.")] });
        return;
      }

      // sub === "set"
      const currencyName = interaction.options.getString("currency", true).trim();
      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)] });
        return;
      }

      const amount = interaction.options.getNumber("amount", true);
      const intervalMinutes = interaction.options.getInteger("interval_minutes", true);
      const afkKickMinutes = interaction.options.getInteger("afk_kick_minutes") || null;

      db.setConfig(guildId, "playtime_coins_enabled", true);
      db.setConfig(guildId, "playtime_coins_currency_id", currency.id);
      db.setConfig(guildId, "playtime_coins_amount", amount);
      db.setConfig(guildId, "playtime_coins_interval_minutes", intervalMinutes);
      db.setConfig(guildId, "playtime_afk_kick_minutes", afkKickMinutes);

      await interaction.editReply({
        embeds: [successEmbed("Playtime Coins Configured", `Players now earn **${amount} ${currency.name}** every **${intervalMinutes} min** of active play.${afkKickMinutes ? ` Players AFK for **${afkKickMinutes} min** get kicked and skip that award.` : ""}`)],
      });
      return;
    }

    if (group === "orp") {
      if (!(await requirePremiumOwner(interaction))) return;

      try {
        if (sub === "view") {
          const meta = db.getGuildMeta(guildId);
          await interaction.editReply({
            embeds: [
              successEmbed(
                "ORP Configuration",
                `**Shape:** \`${meta?.orp_shape || "Sphere"}\`\n**Online Color:** \`${meta?.orp_online_color || "#00FF00"}\`\n**Protected Color:** \`${meta?.orp_protected_color || "#FF0000"}\`\n**Enter Message:** ${meta?.orp_enter_message || "_(default)_"}\n**Leave Message:** ${meta?.orp_leave_message || "_(default)_"}`
              ),
            ],
          });
          return;
        }

        if (sub === "set") {
          const shape = interaction.options.getString("shape");
          const onlineColor = interaction.options.getString("online_color")?.trim();
          const protectedColor = interaction.options.getString("protected_color")?.trim();
          const enterMessage = interaction.options.getString("enter_message");
          const leaveMessage = interaction.options.getString("leave_message");

          if (onlineColor && !isValidHex(onlineColor)) {
            await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "`online_color` must be a 6-digit hex color like `#00FF00`.")] });
            return;
          }
          if (protectedColor && !isValidHex(protectedColor)) {
            await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "`protected_color` must be a 6-digit hex color like `#FF0000`.")] });
            return;
          }

          if (shape == null && !onlineColor && !protectedColor && enterMessage == null && leaveMessage == null) {
            await interaction.editReply({ embeds: [dangerEmbed("Nothing To Update", "Provide at least one option to change, or use `/config-misc orp view` to see the current config.")] });
            return;
          }

          const updates = {};
          if (shape != null) updates.orp_shape = shape;
          if (onlineColor) updates.orp_online_color = onlineColor;
          if (protectedColor) updates.orp_protected_color = protectedColor;
          if (enterMessage != null) updates.orp_enter_message = enterMessage;
          if (leaveMessage != null) updates.orp_leave_message = leaveMessage;
          db.upsertGuildMeta(guildId, updates);

          await interaction.editReply({
            embeds: [successEmbed("ORP Configuration Updated", "This server's ORP zone appearance defaults have been saved - colors/messages apply on the next register or background-tick state flip; shape applies on next register.")],
          });
          return;
        }
      } catch (error) {
        console.error(`Error executing /config-misc orp ${sub}:`, error);
        await interaction.editReply({ embeds: [errorEmbed("ORP Config Error", error.message || "Failed to save that ORP configuration change.")] });
      }
      return;
    }
  },
};

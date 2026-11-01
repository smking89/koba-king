"use strict";

/**
 * Split out of the original /config (2026-10-13) - that single command's
 * 14 subcommand groups exceeded Discord's 8000-byte per-command size cap.
 * This file holds the event/gift-themed groups: event (zone-event
 * announcements/auto-fire scheduling), gift (welcome + recurring drops).
 * Business logic/DB calls are byte-identical to the original /config -
 * only which file/command they live under moved.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { requirePremiumOwner } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");
const { GIFT_TYPE_CHOICES, GIFT_REWARD_TYPE_CHOICES } = require("../utils/configHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config-events")
    .setDescription("[Restricted] Configure zone events and recurring gifts")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("event")
        .setDescription("Configure zone event announcements and auto-fire scheduling")
        .addSubcommand((sub) =>
          sub
            .setName("set-join-emoji")
            .setDescription('Set the emoji shown on the "Join Event" button')
            .addStringOption((opt) => opt.setName("emoji").setDescription("An emoji (e.g. 🎯) - leave blank to reset to the default").setMaxLength(8))
        )
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Create or update a named auto-event config")
            .addStringOption((opt) => opt.setName("config_name").setDescription("Unique name for this scheduled config, e.g. Cargo Drop").setRequired(true))
            .addStringOption((opt) => opt.setName("event_name").setDescription('Public event title (e.g. "Cargo Ship Component Drop")').setRequired(true))
            .addStringOption((opt) => opt.setName("zone_name").setDescription("Internal/map name of the zone").setRequired(true))
            .addNumberOption((opt) => opt.setName("center_x").setDescription("Zone center X map coordinate").setRequired(true))
            .addNumberOption((opt) => opt.setName("center_y").setDescription("Zone center Y (height) map coordinate").setRequired(true))
            .addNumberOption((opt) => opt.setName("center_z").setDescription("Zone center Z map coordinate").setRequired(true))
            .addNumberOption((opt) => opt.setName("radius").setDescription("Zone radius/size in meters").setRequired(true).setMinValue(1))
            .addIntegerOption((opt) => opt.setName("duration_minutes").setDescription("How long each fired event runs before resolving").setRequired(true).setMinValue(1))
            .addStringOption((opt) =>
              opt
                .setName("reward_material")
                .setDescription("The bomb component awarded to the winner")
                .setRequired(true)
                .addChoices(...MATERIAL_FIELDS.map((f) => ({ name: MATERIAL_LABELS[f], value: f })))
            )
            .addIntegerOption((opt) => opt.setName("min_players").setDescription("Minimum players online required for this to fire (0 = no minimum)").setRequired(true).setMinValue(0))
            .addIntegerOption((opt) => opt.setName("interval_minutes").setDescription("Minimum minutes between firings").setRequired(true).setMinValue(1))
            .addIntegerOption((opt) => opt.setName("reward_qty").setDescription("How many of that component to award (default 1)").setMinValue(1))
            .addStringOption((opt) => opt.setName("color_hex").setDescription("Accent color for the Discord announcement, e.g. #93ff1d"))
            .addStringOption((opt) => opt.setName("ingame_message").setDescription("Custom in-game broadcast text (default provided)"))
            .addStringOption((opt) => opt.setName("discord_message").setDescription("Custom Discord announcement description (default provided)"))
        )
        .addSubcommand((sub) => sub.setName("remove").setDescription("Delete an auto-event config").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
        .addSubcommand((sub) => sub.setName("list").setDescription("Show every auto-event config and its next-eligible status"))
        .addSubcommand((sub) => sub.setName("enable").setDescription("Turn a config back on").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Pause a config without deleting it").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("gift")
        .setDescription("Configure the welcome gift and recurring hourly/daily/weekly/monthly/yearly drops")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Create or update a gift")
            .addStringOption((opt) => opt.setName("gift_type").setDescription("Which gift").setRequired(true).addChoices(...GIFT_TYPE_CHOICES))
            .addStringOption((opt) => opt.setName("reward_type").setDescription("Kit, role, or coins").setRequired(true).addChoices(...GIFT_REWARD_TYPE_CHOICES))
            .addStringOption((opt) => opt.setName("kit_name").setDescription("Exact internal kit name (required if reward_type is Kit) - see /kit-panel"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role to grant (required if reward_type is Role)"))
            .addIntegerOption((opt) => opt.setName("role_temp_hours").setDescription("Auto-remove the role after this many hours (blank = permanent)").setMinValue(1))
            .addStringOption((opt) => opt.setName("currency").setDescription("Required if reward_type is Coins - see /shop-panel"))
            .addNumberOption((opt) => opt.setName("coin_amount").setDescription("Fixed coin amount (required if reward_type is Coins and you're not using a range)").setMinValue(0.01))
            .addNumberOption((opt) => opt.setName("coin_min").setDescription("Min coins - bot picks random amount in [min, max] instead of a fixed amount").setMinValue(0.01))
            .addNumberOption((opt) => opt.setName("coin_max").setDescription("Max coins - required if coin_min is set").setMinValue(0.01))
            .addStringOption((opt) => opt.setName("message").setDescription("Custom announcement text - leave blank for a default").setMaxLength(300))
        )
        .addSubcommand((sub) => sub.setName("view").setDescription("Show every configured gift"))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Turn off a gift without deleting its config").addStringOption((opt) => opt.setName("gift_type").setDescription("Which gift").setRequired(true).addChoices(...GIFT_TYPE_CHOICES)))
        .addSubcommand((sub) => sub.setName("enable").setDescription("Turn a gift back on").addStringOption((opt) => opt.setName("gift_type").setDescription("Which gift").setRequired(true).addChoices(...GIFT_TYPE_CHOICES)))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();

    if (group === "event") {
      if (!(await requirePremiumOwner(interaction))) return;

      if (sub === "set-join-emoji") {
        const emoji = interaction.options.getString("emoji")?.trim();
        db.setConfig(guildId, "event_join_emoji", emoji || "🎯");
        await interaction.editReply({ embeds: [successEmbed("Join Emoji Updated", `New zone events will show **${emoji || "🎯"}** on the Join Event button.`)] });
        return;
      }

      if (sub === "add") {
        const configName = interaction.options.getString("config_name", true).trim();
        db.createAutoEvent(guildId, {
          configName,
          eventName: interaction.options.getString("event_name", true),
          zoneName: interaction.options.getString("zone_name", true),
          centerX: interaction.options.getNumber("center_x", true),
          centerY: interaction.options.getNumber("center_y", true),
          centerZ: interaction.options.getNumber("center_z", true),
          radius: interaction.options.getNumber("radius", true),
          durationMinutes: interaction.options.getInteger("duration_minutes", true),
          rewardMaterial: interaction.options.getString("reward_material", true),
          rewardQty: interaction.options.getInteger("reward_qty") ?? 1,
          colorHex: interaction.options.getString("color_hex"),
          ingameMessage: interaction.options.getString("ingame_message"),
          discordMessage: interaction.options.getString("discord_message"),
          minPlayers: interaction.options.getInteger("min_players", true),
          intervalMinutes: interaction.options.getInteger("interval_minutes", true),
          createdBy: interaction.user.id,
        });
        await interaction.editReply({
          embeds: [successEmbed("Auto-Event Saved", `**${configName}** will fire automatically once **${interaction.options.getInteger("min_players", true)}+** players are online and at least **${interaction.options.getInteger("interval_minutes", true)} minute(s)** have passed since it last fired.`)],
        });
        return;
      }

      if (sub === "remove") {
        const configName = interaction.options.getString("config_name", true).trim();
        db.deleteAutoEvent(guildId, configName);
        await interaction.editReply({ embeds: [successEmbed("Auto-Event Removed", `**${configName}** was deleted.`)] });
        return;
      }

      if (sub === "enable" || sub === "disable") {
        const configName = interaction.options.getString("config_name", true).trim();
        const config = db.getAutoEvent(guildId, configName);
        if (!config) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Found", `No auto-event config named **${configName}**.`)] });
          return;
        }
        db.setAutoEventEnabled(guildId, configName, sub === "enable");
        await interaction.editReply({ embeds: [successEmbed(sub === "enable" ? "Enabled" : "Disabled", `**${configName}** is now ${sub === "enable" ? "🟢 enabled" : "🔴 disabled"}.`)] });
        return;
      }

      if (sub === "list") {
        const configs = db.listAutoEvents(guildId);
        if (!configs.length) {
          await interaction.editReply({ embeds: [infoEmbed("Auto-Event Configs", "None configured yet - use `/config-events event add`.")] });
          return;
        }

        const lines = configs.map((c) => {
          const status = c.enabled ? "🟢" : "🔴";
          const lastFired = c.last_triggered_at ? `<t:${Math.floor(c.last_triggered_at / 1000)}:R>` : "never";
          const nextEligible = c.last_triggered_at ? `<t:${Math.floor((c.last_triggered_at + c.interval_minutes * 60000) / 1000)}:R>` : "now";
          return `${status} **${c.config_name}** - "${c.event_name}" at ${c.zone_name}\n> Needs **${c.min_players}+** players, every **${c.interval_minutes}min**. Last fired: ${lastFired}. Next eligible: ${nextEligible}.`;
        });

        await interaction.editReply({ embeds: [infoEmbed("Auto-Event Configs", lines.join("\n\n"))] });
        return;
      }
      return;
    }

    if (group === "gift") {
      if (sub === "set") {
        const giftType = interaction.options.getString("gift_type", true);
        const rewardType = interaction.options.getString("reward_type", true);
        const kitName = interaction.options.getString("kit_name")?.trim();
        const role = interaction.options.getRole("role");
        const roleTempHours = interaction.options.getInteger("role_temp_hours");
        const message = interaction.options.getString("message")?.trim();

        if (rewardType === "kit" && !kitName) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Kit Name", "reward_type Kit requires kit_name.")] });
          return;
        }
        if (rewardType === "role" && !role) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Role", "reward_type Role requires role.")] });
          return;
        }

        let coinCurrencyId = null;
        let coinMinAmount = null;
        let coinMaxAmount = null;
        if (rewardType === "coins") {
          const currencyName = interaction.options.getString("currency")?.trim();
          if (!currencyName) {
            await interaction.editReply({ embeds: [dangerEmbed("Missing Currency", "reward_type Coins requires currency.")] });
            return;
          }
          const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
          if (!currency) {
            await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)] });
            return;
          }
          const fixed = interaction.options.getNumber("coin_amount");
          const min = interaction.options.getNumber("coin_min");
          const max = interaction.options.getNumber("coin_max");
          if (fixed) {
            coinMinAmount = fixed;
            coinMaxAmount = fixed;
          } else if (min && max) {
            if (min > max) {
              await interaction.editReply({ embeds: [dangerEmbed("Invalid Range", "coin_min can't be higher than coin_max.")] });
              return;
            }
            coinMinAmount = min;
            coinMaxAmount = max;
          } else {
            await interaction.editReply({ embeds: [dangerEmbed("Missing Amount", "reward_type Coins needs either coin_amount, or both coin_min and coin_max.")] });
            return;
          }
          coinCurrencyId = currency.id;
        }

        db.setGiftConfig(guildId, giftType, {
          rewardType,
          kitName: rewardType === "kit" ? kitName : null,
          roleId: rewardType === "role" ? role.id : null,
          roleTempHours: roleTempHours ?? null,
          coinCurrencyId,
          coinMinAmount,
          coinMaxAmount,
          messageText: message || null,
        });

        const rewardDesc = rewardType === "kit" ? `kit **${kitName}**` : rewardType === "role" ? `role ${role}` : coinMinAmount === coinMaxAmount ? `**${coinMinAmount}** coins` : `**${coinMinAmount}-${coinMaxAmount}** random coins`;
        const note =
          giftType === "welcome" && rewardType === "kit"
            ? "\n\n⚠️ Kit welcome gifts require the new member to already be team-rostered and linked (`/link`) - most brand-new members won't be yet, so a **role** or **coins** reward usually works better for a join-instant welcome gift."
            : "";
        await interaction.editReply({ embeds: [successEmbed("Gift Configured", `**${giftType}** now grants ${rewardDesc}.${note}`)] });
        return;
      }

      if (sub === "enable" || sub === "disable") {
        const giftType = interaction.options.getString("gift_type", true);
        const config = db.getGiftConfig(guildId, giftType);
        if (!config) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Configured", `**${giftType}** hasn't been set up yet - use \`/config-events gift set\` first.`)] });
          return;
        }
        db.setGiftEnabled(guildId, giftType, sub === "enable");
        await interaction.editReply({ embeds: [successEmbed(sub === "enable" ? "Enabled" : "Disabled", `**${giftType}** gift is now ${sub === "enable" ? "🟢 enabled" : "🔴 disabled"}.`)] });
        return;
      }

      if (sub === "view") {
        const configs = db.listGiftConfigs(guildId);
        if (!configs.length) {
          await interaction.editReply({ embeds: [infoEmbed("Gifts", "None configured yet - use `/config-events gift set`.")] });
          return;
        }
        const lines = configs.map((c) => {
          const status = c.enabled ? "🟢" : "🔴";
          let reward;
          if (c.reward_type === "kit") reward = `kit **${c.kit_name}**`;
          else if (c.reward_type === "role") reward = `role <@&${c.role_id}>${c.role_temp_hours ? ` (${c.role_temp_hours}h)` : ""}`;
          else {
            const currency = db.getCurrency(guildId, c.coin_currency_id);
            reward = c.coin_min_amount === c.coin_max_amount ? `**${c.coin_min_amount}** ${currency?.name || "coins"}` : `**${c.coin_min_amount}-${c.coin_max_amount}** ${currency?.name || "coins"} (random)`;
          }
          return `${status} **${c.gift_type}** - ${reward}`;
        });
        await interaction.editReply({ embeds: [infoEmbed("Gifts", lines.join("\n"))] });
        return;
      }
      return;
    }
  },
};

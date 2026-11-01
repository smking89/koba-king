"use strict";

/**
 * Split out of the original /config (2026-10-13) - that single command's
 * 14 subcommand groups exceeded Discord's 8000-byte per-command size cap.
 * This file holds the economy-themed groups: auction, marketplace,
 * referral, role-trade, trade. Business logic/DB calls are byte-identical
 * to the original /config - only which file/command they live under moved.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const db = require("../database/db");
const { postAuction, rewardLabel } = require("../utils/auctionPanel");
const { requirePlan, requirePremiumOwner } = require("../utils/premium");
const { buildHub } = require("../utils/tradeConfigPanel");
const { PERIODS } = require("../utils/referralLeaderboard");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");
const { AUCTION_REWARD_TYPE_CHOICES, AUCTION_MATERIAL_CHOICES, checkKitExists } = require("../utils/configHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config-economy")
    .setDescription("[Restricted] Configure auctions, marketplace, referrals, and tradeable roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("auction")
        .setDescription("Create and manage auctions")
        .addSubcommand((sub) => sub.setName("channel").setDescription("Set the channel where auction listings are posted").addChannelOption((opt) => opt.setName("channel").setDescription("Auction channel").setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("List a new auction")
            .addStringOption((opt) => opt.setName("currency").setDescription("Which currency (see /shop-panel)").setRequired(true))
            .addStringOption((opt) => opt.setName("reward_type").setDescription("What's being auctioned").setRequired(true).addChoices(...AUCTION_REWARD_TYPE_CHOICES))
            .addNumberOption((opt) => opt.setName("starting_bid").setDescription("Minimum opening bid").setRequired(true).setMinValue(0))
            .addIntegerOption((opt) => opt.setName("duration_hours").setDescription("How long the auction runs, in hours").setRequired(true).setMinValue(1).setMaxValue(168))
            .addStringOption((opt) => opt.setName("item_short_name").setDescription("Required if reward_type is Item - exact Rust short name"))
            .addStringOption((opt) => opt.setName("kit_name").setDescription("Required if reward_type is Kit - see /kit-panel"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Required if reward_type is Role"))
            .addStringOption((opt) => opt.setName("material").setDescription("Required if reward_type is Material").addChoices(...AUCTION_MATERIAL_CHOICES))
            .addIntegerOption((opt) => opt.setName("amount").setDescription("Quantity (items/materials only) - default 1").setMinValue(1))
            .addNumberOption((opt) => opt.setName("buy_now_price").setDescription("Optional instant-buy price"))
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("Show every active auction"))
        .addSubcommand((sub) => sub.setName("cancel").setDescription("Cancel an active auction (refunds the current bidder, if any)").addIntegerOption((opt) => opt.setName("id").setDescription("Auction ID").setRequired(true)))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("marketplace")
        .setDescription("Set the player-to-player marketplace's price bounds per currency")
        .addSubcommand((sub) =>
          sub
            .setName("bounds")
            .setDescription("Set the min/max price players can list at - required before the marketplace opens for this currency")
            .addStringOption((opt) => opt.setName("currency").setDescription("Which currency").setRequired(true))
            .addNumberOption((opt) => opt.setName("min_price").setDescription("Minimum listing price").setRequired(true).setMinValue(0))
            .addNumberOption((opt) => opt.setName("max_price").setDescription("Maximum listing price").setRequired(true).setMinValue(0))
        )
        .addSubcommand((sub) => sub.setName("view").setDescription("Show every currency's marketplace bounds"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("referral")
        .setDescription("Configure referral rewards - welcome gifts and leaderboard payouts.")
        .addSubcommand((sub) =>
          sub
            .setName("welcome-gift")
            .setDescription("Set what a player receives when they redeem any valid referral code.")
            .addStringOption((opt) => opt.setName("kit").setDescription("Kit name to deliver over RCON (leave blank for none)"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Discord role to grant (leave blank for none)"))
            .addIntegerOption((opt) => opt.setName("role_temp_hours").setDescription("Hours before the role is automatically removed (leave blank for permanent)").setMinValue(1))
        )
        .addSubcommand((sub) =>
          sub
            .setName("leaderboard-reward")
            .setDescription("Set the 1st/2nd/3rd place reward for a leaderboard period.")
            .addStringOption((opt) => opt.setName("period").setDescription("Which period this reward applies to").setRequired(true).addChoices(...PERIODS.map((p) => ({ name: p, value: p }))))
            .addIntegerOption((opt) => opt.setName("place").setDescription("1st, 2nd, or 3rd place").setRequired(true).addChoices({ name: "1st", value: 1 }, { name: "2nd", value: 2 }, { name: "3rd", value: 3 }))
            .addStringOption((opt) => opt.setName("kit").setDescription("Kit name to deliver over RCON (use this OR role, not both)"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Discord role to grant (use this OR kit, not both)"))
            .addIntegerOption((opt) => opt.setName("role_temp_hours").setDescription("Hours before the role is automatically removed (leave blank for permanent)").setMinValue(1))
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("role-trade")
        .setDescription("Choose which roles players are allowed to give away via /player-panel")
        .addSubcommand((sub) => sub.setName("add").setDescription("Allow a role to be traded").addRoleOption((opt) => opt.setName("role").setDescription("Which role").setRequired(true)))
        .addSubcommand((sub) => sub.setName("remove").setDescription("Disallow a role from being traded").addRoleOption((opt) => opt.setName("role").setDescription("Which role").setRequired(true)))
        .addSubcommand((sub) => sub.setName("list").setDescription("Show every tradeable role"))
    )
    .addSubcommandGroup((group) => group.setName("trade").setDescription("Set what tradeable roles/kits cost the recipient in a player-to-player trade").addSubcommand((sub) => sub.setName("manage").setDescription("Open the player-to-player trade cost configuration panel"))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();

    if (group === "auction") {
      // Auctions are a Pro/Max feature (per website/src/components/PlanGrid.jsx)
      if (!(await requirePlan(interaction, "pro", "The Auction System"))) return;

      if (sub === "channel") {
        const channel = interaction.options.getChannel("channel", true);
        db.upsertGuildMeta(guildId, { auction_channel_id: channel.id });
        await interaction.editReply({ embeds: [successEmbed("Auction Channel Set", `New auctions will post in ${channel}.`)] });
        return;
      }

      if (sub === "list") {
        const auctions = db.listActiveAuctions(guildId);
        if (!auctions.length) {
          await interaction.editReply({ embeds: [infoEmbed("Active Auctions", "None right now.")] });
          return;
        }
        const lines = auctions.map((a) => `**#${a.id}** ${rewardLabel(interaction.guild, a.reward_type, a.reward_ref, a.amount)} - current bid **${a.current_bid || a.starting_bid}** - ends <t:${Math.floor(a.ends_at / 1000)}:R>`);
        await interaction.editReply({ embeds: [infoEmbed("Active Auctions", lines.join("\n"))] });
        return;
      }

      if (sub === "cancel") {
        const id = interaction.options.getInteger("id", true);
        const auction = db.getAuction(guildId, id);
        if (!auction || auction.status !== "active") {
          await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No active auction with that ID.")] });
          return;
        }
        if (auction.current_bidder) db.adjustWallet(guildId, auction.current_bidder, auction.currency_id, auction.current_bid);
        db.setAuctionStatus(id, "cancelled");
        await interaction.editReply({ embeds: [successEmbed("Auction Cancelled", auction.current_bidder ? "The current bidder has been refunded." : "No bids were placed.")] });
        return;
      }

      // sub === "create"
      const currencyName = interaction.options.getString("currency", true).trim();
      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)] });
        return;
      }

      const meta = db.getGuildMeta(guildId);
      if (!meta?.auction_channel_id) {
        await interaction.editReply({ embeds: [dangerEmbed("No Auction Channel", "Set one first with `/config-economy auction channel`.")] });
        return;
      }

      const rewardType = interaction.options.getString("reward_type", true);
      const amount = interaction.options.getInteger("amount") || 1;
      let rewardRef;

      if (rewardType === "item") rewardRef = interaction.options.getString("item_short_name");
      else if (rewardType === "kit") rewardRef = interaction.options.getString("kit_name");
      else if (rewardType === "role") rewardRef = interaction.options.getRole("role")?.id;
      else if (rewardType === "material") rewardRef = interaction.options.getString("material");

      if (!rewardRef) {
        await interaction.editReply({ embeds: [dangerEmbed("Missing Reward Detail", `reward_type **${rewardType}** requires its matching option (item_short_name/kit_name/role/material).`)] });
        return;
      }

      const auction = db.createAuction(guildId, {
        currencyId: currency.id,
        rewardType,
        rewardRef,
        amount,
        startingBid: interaction.options.getNumber("starting_bid", true),
        buyNowPrice: interaction.options.getNumber("buy_now_price"),
        createdBy: interaction.user.id,
        durationMs: interaction.options.getInteger("duration_hours", true) * 60 * 60 * 1000,
      });

      const message = await postAuction(interaction.guild, auction);
      await interaction.editReply({
        embeds: [successEmbed("Auction Created", message ? `Auction #${auction.id} posted in <#${meta.auction_channel_id}>.` : `Auction #${auction.id} created, but posting to the auction channel failed - check the channel still exists.`)],
      });
      return;
    }

    if (group === "marketplace") {
      // Marketplace is a Pro/Max feature (per website/src/components/PlanGrid.jsx)
      if (!(await requirePlan(interaction, "pro", "The Marketplace"))) return;

      if (sub === "view") {
        const currencies = db.listCurrencies(guildId);
        if (!currencies.length) {
          await interaction.editReply({ embeds: [infoEmbed("Marketplace Bounds", "No currencies configured yet - see `/shop-panel`.")] });
          return;
        }
        const lines = currencies.map((c) => `**${c.name}**: ${c.marketplace_min_price !== null && c.marketplace_max_price !== null ? `${c.marketplace_min_price} - ${c.marketplace_max_price}` : "Marketplace closed (no bounds set)"}`);
        await interaction.editReply({ embeds: [infoEmbed("Marketplace Bounds", lines.join("\n"))] });
        return;
      }

      // sub === "bounds"
      const currencyName = interaction.options.getString("currency", true).trim();
      const currency = db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === currencyName.toLowerCase());
      if (!currency) {
        await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)] });
        return;
      }

      const min = interaction.options.getNumber("min_price", true);
      const max = interaction.options.getNumber("max_price", true);
      if (min > max) {
        await interaction.editReply({ embeds: [dangerEmbed("Invalid Range", "min_price can't be higher than max_price.")] });
        return;
      }

      db.setCurrencyMarketplaceBounds(guildId, currency.id, min, max);
      await interaction.editReply({ embeds: [successEmbed("Marketplace Bounds Set", `**${currency.name}** listings must now be priced between **${min}** and **${max}**.`)] });
      return;
    }

    if (group === "referral") {
      if (sub === "welcome-gift") {
        const kit = interaction.options.getString("kit");
        const role = interaction.options.getRole("role");
        const tempHours = interaction.options.getInteger("role_temp_hours");

        if (!kit && !role) {
          await interaction.editReply({ embeds: [dangerEmbed("Nothing To Set", "Provide a kit, a role, or both.")] });
          return;
        }

        let warning = "";
        if (kit) {
          const check = await checkKitExists(guildId, kit);
          if (check.checked && !check.exists) warning = `\n\nHeads up: **${kit}** wasn't found in this server's kit list - double check the spelling.`;
        }

        db.setReferralWelcomeGift(guildId, { welcomeKit: kit, welcomeRoleId: role?.id, welcomeRoleTempHours: tempHours });
        await interaction.editReply({
          embeds: [successEmbed("Welcome Gift Updated", `Redeeming a code now grants: ${[kit && `kit **${kit}**`, role && `role ${role}${tempHours ? ` (${tempHours}h)` : ""}`].filter(Boolean).join(" and ")}.${warning}`)],
        });
        return;
      }

      if (sub === "leaderboard-reward") {
        const period = interaction.options.getString("period", true);
        const place = interaction.options.getInteger("place", true);
        const kit = interaction.options.getString("kit");
        const role = interaction.options.getRole("role");
        const tempHours = interaction.options.getInteger("role_temp_hours");

        if (!kit && !role) {
          await interaction.editReply({ embeds: [dangerEmbed("Nothing To Set", "Provide a kit or a role for this place.")] });
          return;
        }
        if (kit && role) {
          await interaction.editReply({ embeds: [dangerEmbed("Pick One", "A reward is either a kit or a role, not both.")] });
          return;
        }

        let warning = "";
        if (kit) {
          const check = await checkKitExists(guildId, kit);
          if (check.checked && !check.exists) warning = `\n\nHeads up: **${kit}** wasn't found in this server's kit list - double check the spelling.`;
        }

        db.setLeaderboardReward(guildId, period, place, {
          rewardType: kit ? "kit" : "role",
          kitName: kit,
          roleId: role?.id,
          roleTempHours: tempHours,
        });

        await interaction.editReply({
          embeds: [successEmbed("Leaderboard Reward Set", `**${period}** place **#${place}** now awards: ${kit ? `kit **${kit}**` : `role ${role}${tempHours ? ` (${tempHours}h)` : ""}`}.${warning}`)],
        });
        return;
      }
      return;
    }

    if (group === "role-trade") {
      if (sub === "add") {
        const role = interaction.options.getRole("role", true);
        if (role.id === guildId || role.managed || role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Allow This Role", "@everyone, bot-managed integration roles, and any role with Administrator/Manage Server can never be tradable.")] });
          return;
        }
        db.addTradeableRole(guildId, role.id);
        await interaction.editReply({ embeds: [successEmbed("Role Tradable", `${role} can now be given away via \`/player-panel\`.`)] });
        return;
      }

      if (sub === "remove") {
        const role = interaction.options.getRole("role", true);
        db.removeTradeableRole(guildId, role.id);
        await interaction.editReply({ embeds: [successEmbed("Role No Longer Tradable", `${role} can no longer be given away.`)] });
        return;
      }

      if (sub === "list") {
        const ids = db.getTradeableRoleIds(guildId);
        if (!ids.length) {
          await interaction.editReply({ embeds: [infoEmbed("Tradeable Roles", "None yet - nothing is tradable by default. Use `/config-economy role-trade add`.")] });
          return;
        }
        await interaction.editReply({ embeds: [infoEmbed("Tradeable Roles", ids.map((id) => `<@&${id}>`).join("\n"))] });
        return;
      }
      return;
    }

    if (group === "trade") {
      if (!(await requirePremiumOwner(interaction))) return;
      await interaction.editReply(buildHub(interaction.guild));
      return;
    }
  },
};

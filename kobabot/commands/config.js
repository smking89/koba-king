"use strict";

/**
 * Consolidated 2026-10-13 - replaces 14 separate top-level "*-config"
 * staff commands (auction, event, gift, autokit, coin-earn, leaderboard,
 * marketplace, referral, role-trade, trade, staff, auto-message, session,
 * orp) with ONE /config command using a subcommand group per feature.
 * Business logic/DB calls are unchanged - only the command-definition and
 * dispatch layer moved here.
 *
 * /clan-config and /ad-message-config were deliberately NOT folded in
 * here even though they matched the "*-config" naming pattern: both have
 * a fundamentally different permission model than the rest (no
 * setDefaultMemberPermissions(ManageGuild) - clan-config is a player/team-
 * leader command gated by rank clearance, ad-message-config is a global
 * bot-owner-only dev command gated by isBotOwner). Folding either one
 * under this ManageGuild-gated command would either lock out the
 * non-staff users who legitimately run it (clan leaders) or misrepresent
 * a global dev tool as a per-guild staff setting - so they stay standalone.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { CronExpressionParser } = require("cron-parser");
const db = require("../database/db");
const { MATERIAL_FIELDS, MATERIAL_LABELS } = require("../config/materials");
const { postAuction, rewardLabel } = require("../utils/auctionPanel");
const { requirePlan, requirePremiumOwner } = require("../utils/premium");
const { buildList } = require("../utils/autoKitAdminPanel");
const { buildHub } = require("../utils/tradeConfigPanel");
const { buildApplyPanel } = require("../utils/staffApplications");
const { hasAdminClearance } = require("../utils/teamAuth");
const { CATEGORIES } = require("../utils/categoryLeaderboards");
const { PERIODS } = require("../utils/referralLeaderboard");
const { getRcon } = require("../rcon/manager");
const { isValidHex, isValidSize } = require("../utils/messageStyle");
const sessionManager = require("../utils/sessionManager");
const { successEmbed, dangerEmbed, infoEmbed, errorEmbed } = require("../utils/embeds");

const AUCTION_REWARD_TYPE_CHOICES = [
  { name: "Item (raw Rust item)", value: "item" },
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
  { name: "Material", value: "material" },
];
const AUCTION_MATERIAL_CHOICES = MATERIAL_FIELDS.map((f) => ({ name: MATERIAL_LABELS[f] || f, value: f }));

const GIFT_TYPE_CHOICES = [
  { name: "Welcome (new Discord member)", value: "welcome" },
  { name: "Hourly", value: "hourly" },
  { name: "Daily", value: "daily" },
  { name: "Weekly", value: "weekly" },
  { name: "Monthly", value: "monthly" },
  { name: "Yearly", value: "yearly" },
];
const GIFT_REWARD_TYPE_CHOICES = [
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
  { name: "Coins", value: "coins" },
];

const LEADERBOARD_CATEGORY_CHOICES = Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.label, value }));
const LEADERBOARD_PERIOD_CHOICES = [
  { name: "Daily", value: "daily" },
  { name: "Weekly", value: "weekly" },
  { name: "Monthly", value: "monthly" },
  { name: "Yearly", value: "yearly" },
];
const LEADERBOARD_REWARD_TYPE_CHOICES = [
  { name: "Kit", value: "kit" },
  { name: "Role", value: "role" },
];

/**
 * Best-effort kit existence check via RCON. Doesn't block saving if RCON is
 * offline or the server's `kit list` output format doesn't match what we
 * expect - it's a helpful warning, not a hard requirement, since an admin
 * should be able to configure this before their server is even connected.
 */
async function checkKitExists(guildId, kitName) {
  try {
    const rcon = await getRcon(guildId);
    const raw = await rcon.send("kit list");
    if (!raw.toLowerCase().includes(kitName.toLowerCase())) {
      return { checked: true, exists: false };
    }
    return { checked: true, exists: true };
  } catch {
    return { checked: false };
  }
}

/** Parses "MM/DD/YYYY HH:mm" (matching the spec's own admin-flow example format) in the server's local time - returns null (not a throw) on anything unparseable, so the command can show a clean error instead of a stack trace. */
function parseDateTime(value) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function nextAutoMessageFireDescription(config) {
  const since = config.last_sent_at || config.created_at;
  if (config.schedule_type === "cron") {
    try {
      const next = CronExpressionParser.parse(config.cron_expression, { currentDate: new Date(since) }).next().toDate();
      return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
    } catch {
      return "invalid cron expression";
    }
  }
  return `<t:${Math.floor((since + config.interval_seconds * 1000) / 1000)}:R>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("[Restricted] Configure shop, kits, gifts, events, games, leaderboards, referrals, messages, etc.")
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
    )
    .addSubcommandGroup((group) =>
      group
        .setName("autokit")
        .setDescription("Configure the Dynamic Adaptive Kit Engine - bind chat triggers to kits")
        .addSubcommand((sub) => sub.setName("manage").setDescription("Open the Dynamic Adaptive Kit Engine admin panel"))
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
    .addSubcommandGroup((group) =>
      group
        .setName("trade")
        .setDescription("Set what tradeable roles/kits cost the recipient in a player-to-player trade")
        .addSubcommand((sub) => sub.setName("manage").setDescription("Open the player-to-player trade cost configuration panel"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("staff")
        .setDescription("Configure staff application positions and post the Apply panel")
        .addSubcommand((sub) =>
          sub
            .setName("position")
            .setDescription("Create or update a staff position's application form")
            .addStringOption((opt) => opt.setName("name").setDescription("Position name, e.g. Admin, Mod, Promoter").setRequired(true))
            .addStringOption((opt) => opt.setName("question1").setDescription("Interview question 1").setRequired(true))
            .addStringOption((opt) => opt.setName("question2").setDescription("Interview question 2"))
            .addStringOption((opt) => opt.setName("question3").setDescription("Interview question 3"))
            .addStringOption((opt) => opt.setName("question4").setDescription("Interview question 4"))
            .addBooleanOption((opt) => opt.setName("require_social").setDescription("Require the applicant's social links? (counts toward the 5-field form limit)"))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role to grant automatically if accepted (optional)"))
        )
        .addSubcommand((sub) => sub.setName("remove").setDescription("Delete a position").addStringOption((opt) => opt.setName("name").setDescription("Which position").setRequired(true)))
        .addSubcommand((sub) => sub.setName("list").setDescription("Show every configured position"))
        .addSubcommand((sub) => sub.setName("enable").setDescription("Reopen a position for applications").addStringOption((opt) => opt.setName("name").setDescription("Which position").setRequired(true)))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Stop taking applications for a position").addStringOption((opt) => opt.setName("name").setDescription("Which position").setRequired(true)))
        .addSubcommand((sub) => sub.setName("post").setDescription("Post the Apply Now panel in this channel"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("auto-message")
        .setDescription("Configure recurring in-game broadcasts on their own schedule")
        .addSubcommand((sub) =>
          sub
            .setName("add-interval")
            .setDescription("Create/update a recurring message on a simple minutes/seconds interval")
            .addStringOption((opt) => opt.setName("config_name").setDescription("Unique name for this message, e.g. Rules Reminder").setRequired(true))
            .addStringOption((opt) => opt.setName("message").setDescription("The in-game text to broadcast").setRequired(true).setMaxLength(200))
            .addIntegerOption((opt) => opt.setName("minutes").setDescription("Minutes between broadcasts (combined with seconds)").setMinValue(0))
            .addIntegerOption((opt) => opt.setName("seconds").setDescription("Seconds between broadcasts (combined with minutes)").setMinValue(0).setMaxValue(59))
            .addStringOption((opt) => opt.setName("color_hex").setDescription("e.g. #00FF00 - default green"))
            .addIntegerOption((opt) => opt.setName("size").setDescription("In-game text size, 8-72").setMinValue(8).setMaxValue(72))
        )
        .addSubcommand((sub) =>
          sub
            .setName("add-cron")
            .setDescription("Create/update a recurring message on a cron schedule")
            .addStringOption((opt) => opt.setName("config_name").setDescription("Unique name for this message, e.g. Nightly Restart Warning").setRequired(true))
            .addStringOption((opt) => opt.setName("message").setDescription("The in-game text to broadcast").setRequired(true).setMaxLength(200))
            .addStringOption((opt) => opt.setName("cron_expression").setDescription("Standard 5-field cron, e.g. \"0 */2 * * *\" for every 2 hours").setRequired(true))
            .addStringOption((opt) => opt.setName("color_hex").setDescription("e.g. #00FF00 - default green"))
            .addIntegerOption((opt) => opt.setName("size").setDescription("In-game text size, 8-72").setMinValue(8).setMaxValue(72))
        )
        .addSubcommand((sub) => sub.setName("remove").setDescription("Delete an auto-message config").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
        .addSubcommand((sub) => sub.setName("list").setDescription("Show every auto-message config and when it next fires"))
        .addSubcommand((sub) => sub.setName("enable").setDescription("Turn a config back on").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
        .addSubcommand((sub) => sub.setName("disable").setDescription("Pause a config without deleting it").addStringOption((opt) => opt.setName("config_name").setDescription("Which config").setRequired(true)))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("session")
        .setDescription("Create/start/end BOOMbot Sessions (temporary competitive periods)")
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("Create a new Session")
            .addStringOption((opt) => opt.setName("name").setDescription('e.g. "September Wipe"').setRequired(true))
            .addStringOption((opt) => opt.setName("start").setDescription("MM/DD/YYYY HH:mm - leave blank to start manually").setRequired(false))
            .addStringOption((opt) => opt.setName("end").setDescription("MM/DD/YYYY HH:mm - leave blank to end manually").setRequired(false))
        )
        .addSubcommand((sub) => sub.setName("start").setDescription("Manually start a scheduled Session").addIntegerOption((opt) => opt.setName("session_id").setDescription("Session ID").setRequired(true)))
        .addSubcommand((sub) => sub.setName("end").setDescription("Manually end the active Session").addIntegerOption((opt) => opt.setName("session_id").setDescription("Session ID").setRequired(true)))
        .addSubcommand((sub) => sub.setName("status").setDescription("Show the current Session's leaderboard"))
        .addSubcommand((sub) => sub.setName("history").setDescription("Show past Sessions"))
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
        await interaction.editReply({ embeds: [dangerEmbed("No Auction Channel", "Set one first with `/config auction channel`.")] });
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
          await interaction.editReply({ embeds: [infoEmbed("Auto-Event Configs", "None configured yet - use `/config event add`.")] });
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
          await interaction.editReply({ embeds: [dangerEmbed("Not Configured", `**${giftType}** hasn't been set up yet - use \`/config gift set\` first.`)] });
          return;
        }
        db.setGiftEnabled(guildId, giftType, sub === "enable");
        await interaction.editReply({ embeds: [successEmbed(sub === "enable" ? "Enabled" : "Disabled", `**${giftType}** gift is now ${sub === "enable" ? "🟢 enabled" : "🔴 disabled"}.`)] });
        return;
      }

      if (sub === "view") {
        const configs = db.listGiftConfigs(guildId);
        if (!configs.length) {
          await interaction.editReply({ embeds: [infoEmbed("Gifts", "None configured yet - use `/config gift set`.")] });
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

    if (group === "autokit") {
      if (!(await requirePremiumOwner(interaction))) return;
      if (!hasAdminClearance(interaction)) {
        await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This is restricted to BoomBot Admins.")] });
        return;
      }
      await interaction.editReply(buildList(interaction.guildId));
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
          await interaction.editReply({ embeds: [infoEmbed("Tradeable Roles", "None yet - nothing is tradable by default. Use `/config role-trade add`.")] });
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

    if (group === "staff") {
      if (sub === "position") {
        const name = interaction.options.getString("name", true).trim();
        const questions = [interaction.options.getString("question1", true), interaction.options.getString("question2"), interaction.options.getString("question3"), interaction.options.getString("question4")].filter(Boolean);
        const requireSocial = interaction.options.getBoolean("require_social") ?? false;
        const role = interaction.options.getRole("role");

        const totalFields = questions.length + (requireSocial ? 1 : 0);
        if (totalFields > 5) {
          await interaction.editReply({ embeds: [dangerEmbed("Too Many Fields", `Discord modals cap at 5 fields total. You have ${questions.length} question(s)${requireSocial ? " + social links" : ""} = ${totalFields}. Drop one.`)] });
          return;
        }

        db.setStaffPosition(guildId, name, { roleId: role?.id, questions, requireSocial });
        await interaction.editReply({
          embeds: [successEmbed("Position Configured", `**${name}** now has ${questions.length} question(s)${requireSocial ? " + required social links" : ""}${role ? `, grants ${role} on accept` : ""}.`)],
        });
        return;
      }

      if (sub === "remove") {
        const name = interaction.options.getString("name", true).trim();
        db.deleteStaffPosition(guildId, name);
        await interaction.editReply({ embeds: [successEmbed("Position Removed", `**${name}** was deleted.`)] });
        return;
      }

      if (sub === "enable" || sub === "disable") {
        const name = interaction.options.getString("name", true).trim();
        if (!db.getStaffPosition(guildId, name)) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Found", `No position named **${name}**.`)] });
          return;
        }
        db.setStaffPositionEnabled(guildId, name, sub === "enable");
        await interaction.editReply({ embeds: [successEmbed(sub === "enable" ? "Reopened" : "Closed", `**${name}** is now ${sub === "enable" ? "🟢 open" : "🔴 closed"} for applications.`)] });
        return;
      }

      if (sub === "list") {
        const positions = db.listStaffPositions(guildId);
        if (!positions.length) {
          await interaction.editReply({ embeds: [infoEmbed("Staff Positions", "None configured yet - use `/config staff position`.")] });
          return;
        }
        const lines = positions.map((p) => `${p.enabled ? "🟢" : "🔴"} **${p.position_name}** - ${p.questions.length} question(s)${p.require_social ? " + social" : ""}${p.role_id ? `, grants <@&${p.role_id}>` : ""}`);
        await interaction.editReply({ embeds: [infoEmbed("Staff Positions", lines.join("\n"))] });
        return;
      }

      if (sub === "post") {
        if (interaction.channel.type !== ChannelType.GuildText) {
          await interaction.editReply({ embeds: [dangerEmbed("Wrong Channel Type", "Run this in a normal text channel.")] });
          return;
        }
        await interaction.channel.send(buildApplyPanel(guildId));
        await interaction.editReply({ embeds: [successEmbed("Posted", "The Apply Now panel was posted here.")] });
        return;
      }
      return;
    }

    if (group === "auto-message") {
      if (!(await requirePremiumOwner(interaction))) return;

      if (sub === "add-interval" || sub === "add-cron") {
        const configName = interaction.options.getString("config_name", true).trim();
        const message = interaction.options.getString("message", true);
        const colorHex = interaction.options.getString("color_hex")?.trim() || null;
        const size = interaction.options.getInteger("size");

        if (colorHex && !isValidHex(colorHex)) {
          await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "Use a 6-digit hex color like `#00FF00`.")] });
          return;
        }
        if (size !== null && !isValidSize(size)) {
          await interaction.editReply({ embeds: [dangerEmbed("Invalid Size", "Size must be a whole number between 8 and 72.")] });
          return;
        }

        if (sub === "add-interval") {
          const minutes = interaction.options.getInteger("minutes") ?? 0;
          const seconds = interaction.options.getInteger("seconds") ?? 0;
          const totalSeconds = minutes * 60 + seconds;
          if (totalSeconds < 1) {
            await interaction.editReply({ embeds: [dangerEmbed("No Interval Set", "Provide minutes, seconds, or both - total must be at least 1 second.")] });
            return;
          }
          db.createAutoMessage(guildId, {
            configName,
            messageText: message,
            colorHex,
            sizePt: size,
            scheduleType: "interval",
            intervalSeconds: totalSeconds,
            createdBy: interaction.user.id,
          });
          await interaction.editReply({ embeds: [successEmbed("Auto-Message Saved", `**${configName}** will broadcast every **${minutes}m ${seconds}s**.`)] });
          return;
        }

        const cronExpression = interaction.options.getString("cron_expression", true).trim();
        try {
          CronExpressionParser.parse(cronExpression);
        } catch (err) {
          await interaction.editReply({ embeds: [dangerEmbed("Invalid Cron Expression", `Couldn't parse \`${cronExpression}\`: ${err.message}`)] });
          return;
        }
        db.createAutoMessage(guildId, {
          configName,
          messageText: message,
          colorHex,
          sizePt: size,
          scheduleType: "cron",
          cronExpression,
          createdBy: interaction.user.id,
        });
        await interaction.editReply({ embeds: [successEmbed("Auto-Message Saved", `**${configName}** will broadcast on schedule \`${cronExpression}\`.`)] });
        return;
      }

      if (sub === "remove") {
        const configName = interaction.options.getString("config_name", true).trim();
        db.deleteAutoMessage(guildId, configName);
        await interaction.editReply({ embeds: [successEmbed("Auto-Message Removed", `**${configName}** was deleted.`)] });
        return;
      }

      if (sub === "enable" || sub === "disable") {
        const configName = interaction.options.getString("config_name", true).trim();
        const config = db.getAutoMessage(guildId, configName);
        if (!config) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Found", `No auto-message config named **${configName}**.`)] });
          return;
        }
        db.setAutoMessageEnabled(guildId, configName, sub === "enable");
        await interaction.editReply({ embeds: [successEmbed(sub === "enable" ? "Enabled" : "Disabled", `**${configName}** is now ${sub === "enable" ? "🟢 enabled" : "🔴 disabled"}.`)] });
        return;
      }

      if (sub === "list") {
        const configs = db.listAutoMessages(guildId);
        if (!configs.length) {
          await interaction.editReply({ embeds: [infoEmbed("Auto-Message Configs", "None configured yet - use `/config auto-message add-interval` or `add-cron`.")] });
          return;
        }

        const lines = configs.map((c) => {
          const status = c.enabled ? "🟢" : "🔴";
          const schedule = c.schedule_type === "cron" ? `cron \`${c.cron_expression}\`` : `every ${c.interval_seconds}s`;
          return `${status} **${c.config_name}** (${schedule})\n> "${c.message_text}"\n> Next: ${nextAutoMessageFireDescription(c)}`;
        });

        await interaction.editReply({ embeds: [infoEmbed("Auto-Message Configs", lines.join("\n\n"))] });
        return;
      }
      return;
    }

    if (group === "session") {
      if (!(await requirePremiumOwner(interaction))) return;

      if (sub === "create") {
        const name = interaction.options.getString("name", true).trim();
        const startRaw = interaction.options.getString("start");
        const endRaw = interaction.options.getString("end");
        const startsAt = startRaw ? parseDateTime(startRaw) : null;
        const endsAt = endRaw ? parseDateTime(endRaw) : null;
        if ((startRaw && startsAt === null) || (endRaw && endsAt === null)) {
          await interaction.editReply({ embeds: [dangerEmbed("Invalid Date", "Use the format MM/DD/YYYY HH:mm, e.g. 09/15/2026 18:00.")] });
          return;
        }
        const result = sessionManager.createSession(guildId, name, startsAt, endsAt);
        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Create Session", result.reason)] });
          return;
        }
        await interaction.editReply({
          embeds: [
            successEmbed(
              "Session Created",
              `**${name}** created as Session #${result.session.id}.${startsAt ? "" : " No start time set - use `/config session start` when ready."}`
            ),
          ],
        });
        return;
      }

      if (sub === "start") {
        const sessionId = interaction.options.getInteger("session_id", true);
        const result = sessionManager.startSession(guildId, sessionId);
        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Start Session", result.reason)] });
          return;
        }
        await interaction.editReply({ embeds: [successEmbed("Session Started", `**${result.session.name}** (#${result.session.id}) is now active.`)] });
        return;
      }

      if (sub === "end") {
        const sessionId = interaction.options.getInteger("session_id", true);
        const result = sessionManager.endSession(guildId, sessionId);
        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't End Session", result.reason)] });
          return;
        }
        await interaction.editReply({ embeds: [successEmbed("Session Ended", `**${result.session.name}** (#${result.session.id}) has ended - final standings are preserved in Session History.`)] });
        return;
      }

      if (sub === "status") {
        await interaction.editReply(sessionManager.buildSessionStatusView(guildId));
        return;
      }

      if (sub === "history") {
        await interaction.editReply(sessionManager.buildSessionHistoryView(guildId));
        return;
      }
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
            await interaction.editReply({ embeds: [dangerEmbed("Nothing To Update", "Provide at least one option to change, or use `/config orp view` to see the current config.")] });
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
        console.error(`Error executing /config orp ${sub}:`, error);
        await interaction.editReply({ embeds: [errorEmbed("ORP Config Error", error.message || "Failed to save that ORP configuration change.")] });
      }
      return;
    }
  },
};

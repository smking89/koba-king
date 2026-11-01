"use strict";

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner, isBotOwner } = require("../utils/premium");
const { hasAdminClearance } = require("../utils/teamAuth");
const { CATEGORY_DEFAULTS, CATEGORY_DEFAULTS_DISCORD, CATEGORY_LABELS, isValidHex, isValidSize } = require("../utils/messageStyle");
const { SCALAR_CONFIG_KEYS } = require("../config/adminSettings");
const { successEmbed, dangerEmbed, warningEmbed, infoEmbed } = require("../utils/embeds");

const ANNOUNCEMENT_TARGET_CHOICES = [
  { name: "General Announcements", value: "announcement_channel_id" },
  { name: "Events Feed", value: "events_channel_id" },
  { name: "Admin Feed", value: "admin_feed_channel_id" },
  { name: "Staff Applications", value: "staff_apps_channel_id" },
  { name: "Frank (FAQ helper)", value: "frank_channel_id" },
];

/**
 * Bot-owner, official-guild-only (same restriction convention as
 * /activate-user, /ban, /manage-licenses) - lets the price shown on the
 * public pricing page (website/src/components/PlanGrid.jsx, fetched live
 * via /api/site-settings) be changed from Discord with no redeploy.
 *
 * IMPORTANT: this is DISPLAY TEXT only. It does not touch the real
 * Tip4Serv product price - that must be changed separately on Tip4Serv's
 * own dashboard, or a customer will see one price here and get charged a
 * different one at checkout. The command's own reply says so every time,
 * rather than leaving that as a trap for later.
 */
const PLAN_FIELDS = {
  pro: { main: "pro_price_main", suffix: "pro_price_suffix" },
  max: { main: "max_price_main", suffix: "max_price_suffix", note: "max_price_note" },
};

// "ad" ("POWERED BY BOOMbot") is BoomBot's own brand attribution, not a
// per-server customization - excluded here so individual server admins
// can't mute/rewrite it. Controlled globally instead via
// /ad-message-config (bot owner, official server only).
const STYLE_ADMIN_CATEGORIES = Object.fromEntries(Object.entries(CATEGORY_LABELS).filter(([key]) => key !== "ad"));
const STYLE_CATEGORY_CHOICES = Object.entries(STYLE_ADMIN_CATEGORIES).map(([value, name]) => ({ name, value }));

// FIXED (2026-09-07): in-game (rcon.say) and Discord embeds are separate
// rendering paths - Rust's chat only understands <color>/<b>/<br> tags (no
// emoji), Discord only understands markdown + emoji. Sharing one template
// between them is exactly how "in-game shows stars" happened. "target" picks
// which one this set message-style call is reading or writing; defaults to
// In-Game so every existing admin workflow is unchanged.
const STYLE_TARGET_CHOICES = [
  { name: "In-Game (rcon chat)", value: "ingame" },
  { name: "Discord (embed)", value: "discord" },
];

// Owner/Mod added 2026-09-17 - previously only Staff/Admin had a
// configurable override (see utils/mainPanels.js's isOwnerTier/isModTier),
// leaving Owner/Mod stuck matching a fixed role name with no way to point
// them at an existing role instead.
const ROLE_JOB_META_FIELDS = {
  owner: "owner_role_id",
  staff: "staff_role_id",
  mod: "mod_role_id",
};
const ROLE_JOB_CHOICES = [
  { name: "Owner (full access - defaults to the actual server owner)", value: "owner" },
  { name: "Staff / BoomBot Admin (config commands, roster management)", value: "staff" },
  { name: "Moderator (day-to-day mod tools)", value: "mod" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Quickly change simple settings (pricing, channel, message style, roles, LFG scope)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("pricing")
        .setDescription("[Bot Owner] Update the displayed price on the pricing page")
        .addStringOption((opt) => opt.setName("plan").setDescription("Which plan").setRequired(true).addChoices({ name: "Pro", value: "pro" }, { name: "Max", value: "max" }))
        .addStringOption((opt) => opt.setName("price").setDescription("Main price, e.g. $9.85").setRequired(true))
        .addStringOption((opt) => opt.setName("suffix").setDescription("Suffix text, e.g. /month per server").setRequired(true))
        .addStringOption((opt) => opt.setName("note").setDescription("Max only - small note under the price, e.g. \"~17% savings vs. paying monthly\""))
    )
    .addSubcommand((sub) =>
      sub
        .setName("announcement-channel")
        .setDescription("Point announcements or the events feed at a specific channel")
        .addStringOption((opt) => opt.setName("target").setDescription("Which announcement type to redirect").setRequired(true).addChoices(...ANNOUNCEMENT_TARGET_CHOICES))
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to use - leave blank to reset back to the default")
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("message-style")
        .setDescription("Set the color/size/text for BoomBot's automated in-game or Discord messages")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a category's default color, text size, and/or message text")
            .addStringOption((opt) => opt.setName("category").setDescription("Which kind of message").setRequired(true).addChoices(...STYLE_CATEGORY_CHOICES))
            .addStringOption((opt) => opt.setName("target").setDescription("In-game chat or Discord embed - defaults to In-Game").addChoices(...STYLE_TARGET_CHOICES))
            .addStringOption((opt) => opt.setName("hex").setDescription("e.g. #00FF00 - leave blank to keep current").setMaxLength(7))
            .addIntegerOption((opt) => opt.setName("size").setDescription("Text size, 8-72 (In-Game only - Discord ignores this, leave blank to keep current)").setMinValue(8).setMaxValue(72))
            // FIXED (2026-09-07): 200 was too tight for a real rich-text killfeed
            // message - our OWN default killfeed template (color/bold/br tags
            // included) is 238 characters, already over that limit, meaning an
            // admin couldn't even re-type our own default, let alone anything
            // richer. 500 gives real headroom for color-tag-heavy messages.
            .addStringOption((opt) => opt.setName("message").setDescription("Placeholders vary by category (e.g. {player}, {kit}) - leave blank to keep current").setMaxLength(500))
        )
        .addSubcommand((sub) =>
          sub
            .setName("view")
            .setDescription("Show every category's current color/size/message")
            .addStringOption((opt) => opt.setName("target").setDescription("In-game chat or Discord embed - defaults to In-Game").addChoices(...STYLE_TARGET_CHOICES))
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("roles")
        .setDescription("Designate which Discord role fills a BoomBot staff job")
        .addStringOption((opt) => opt.setName("job").setDescription("Which BoomBot job").setRequired(true).addChoices(...ROLE_JOB_CHOICES))
        .addRoleOption((opt) => opt.setName("role").setDescription("The Discord role that fills it").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("lfg-scope")
        .setDescription("Choose whether this server's LFG posts stay local or mirror to other global servers")
        .addStringOption((opt) =>
          opt
            .setName("scope")
            .setDescription("guild = posts only shown here. global = posts mirror to every other server also set to global.")
            .setRequired(true)
            .addChoices({ name: "This server only", value: "guild" }, { name: "Global (mirror across servers)", value: "global" })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("[Restricted] Dynamically change a KOBA Bot setting - takes effect immediately, no restart")
        .addStringOption((opt) =>
          opt
            .setName("setting")
            .setDescription("Setting to change")
            .setRequired(true)
            .addChoices(...SCALAR_CONFIG_KEYS.map((k) => ({ name: k, value: k })))
        )
        .addIntegerOption((opt) => opt.setName("value").setDescription("New value").setRequired(true).setMinValue(0))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === "message-style") {
      await executeMessageStyle(interaction, sub);
      return;
    }

    if (sub === "pricing") {
      await executePricing(interaction);
      return;
    }
    if (sub === "announcement-channel") {
      await executeAnnouncementChannel(interaction);
      return;
    }
    if (sub === "roles") {
      await executeRoles(interaction);
      return;
    }
    if (sub === "lfg-scope") {
      await executeLfgScope(interaction);
      return;
    }
    if (sub === "config") {
      await executeConfig(interaction);
      return;
    }
  },
};

async function executePricing(interaction) {
  if (!isBotOwner(interaction.user.id)) {
    await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This is restricted to the BoomBot owner.")] });
    return;
  }
  if (!process.env.OFFICIAL_GUILD_ID || interaction.guild?.id !== process.env.OFFICIAL_GUILD_ID) {
    await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "This command only works in the official BoomBot server.")] });
    return;
  }

  const plan = interaction.options.getString("plan", true);
  const price = interaction.options.getString("price", true).trim();
  const suffix = interaction.options.getString("suffix", true).trim();
  const note = interaction.options.getString("note")?.trim();
  const fields = PLAN_FIELDS[plan];

  db.setSiteSetting(fields.main, price);
  db.setSiteSetting(fields.suffix, suffix);
  if (fields.note) {
    if (note !== undefined) db.setSiteSetting(fields.note, note);
  } else if (note !== undefined) {
    await interaction.editReply({ embeds: [infoEmbed("Note Ignored", "The `note` option only applies to Max - saved the price/suffix, ignored the note.")] });
  }

  await interaction.editReply({
    embeds: [
      successEmbed("Pricing Updated", `**BOOMbot ${plan === "pro" ? "Pro" : "Max"}** now shows **${price}${suffix}**${note && fields.note ? ` (${note})` : ""} on the pricing page - live immediately, no redeploy needed.`),
      warningEmbed("Reminder", "This only changed the DISPLAYED price. Update the real Tip4Serv product price separately, or customers will be charged a different amount than what they see here."),
    ],
  });
}

async function executeAnnouncementChannel(interaction) {
  const target = interaction.options.getString("target", true);
  const channel = interaction.options.getChannel("channel");
  const label = ANNOUNCEMENT_TARGET_CHOICES.find((t) => t.value === target)?.name || target;

  db.upsertGuildMeta(interaction.guildId, { [target]: channel?.id || null });

  const resetText =
    target === "admin_feed_channel_id"
      ? `**${label}** was cleared - audit logging (kit deliveries, /rcon usage) stops until a channel is set again.`
      : target === "staff_apps_channel_id"
        ? `**${label}** was cleared - submitted applications have nowhere to post until a channel is set again.`
        : target === "frank_channel_id"
          ? `**${label}** was cleared - Frank stops watching for FAQ keyword matches until a channel is set again.`
          : `**${label}** was reset - it'll fall back to Events Feed → General Announcements → the main panel channel, whichever is set first.`;

  await interaction.editReply({
    embeds: [successEmbed("Announcement Channel Updated", channel ? `**${label}** will now post in ${channel}.` : resetText)],
  });
}

async function executeMessageStyle(interaction, sub) {
  const guildId = interaction.guildId;
  const target = interaction.options.getString("target") || "ingame";
  const defaults = target === "discord" ? CATEGORY_DEFAULTS_DISCORD : CATEGORY_DEFAULTS;
  const targetLabel = target === "discord" ? "Discord" : "In-Game";

  if (sub === "view") {
    const styles = db.listMessageStyles(guildId).filter((s) => s.target === target);
    const styleByCategory = new Map(styles.map((s) => [s.category, s]));
    const lines = Object.keys(STYLE_ADMIN_CATEGORIES).map((category) => {
      const style = styleByCategory.get(category);
      const color = style?.color_hex || "#00FF00 (default)";
      const size = target === "discord" ? "n/a (Discord)" : style?.size_pt ? `${style.size_pt}pt` : "default";
      const template = style?.message_template || `${defaults[category]} (default)`;
      return `**${CATEGORY_LABELS[category]}**\nColor: \`${color}\` · Size: \`${size}\` · Message: \`${template}\``;
    });
    await interaction.editReply({ embeds: [infoEmbed(`Message Styles - ${targetLabel}`, lines.join("\n\n"))] });
    return;
  }

  const category = interaction.options.getString("category", true);
  const hex = interaction.options.getString("hex")?.trim();
  const size = interaction.options.getInteger("size");
  const message = interaction.options.getString("message")?.trim();

  // Defense in depth - "ad" isn't in STYLE_CATEGORY_CHOICES so the picker
  // shouldn't offer it, but a stale cached command definition on
  // someone's Discord client could theoretically still submit it.
  if (!STYLE_ADMIN_CATEGORIES[category]) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Editable Here", "That category isn't configurable via /set message-style.")] });
    return;
  }

  if (!hex && size === null && !message) {
    await interaction.editReply({ embeds: [dangerEmbed("Nothing To Set", "Provide a hex color, a size, a message, or any combination.")] });
    return;
  }
  if (hex && !isValidHex(hex)) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "Use a 6-digit hex color like `#00FF00`.")] });
    return;
  }
  if (size !== null && !isValidSize(size)) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Size", "Size must be a whole number between 8 and 72.")] });
    return;
  }

  db.setMessageStyle(guildId, category, { colorHex: hex, template: message, sizePt: size }, target);
  await interaction.editReply({
    embeds: [
      successEmbed(
        "Message Style Updated",
        `**${CATEGORY_LABELS[category]}** (${targetLabel}) ${[hex && `color is now **${hex}**`, size !== null && `size is now **${size}pt**`, message && `message is now: "${message}"`].filter(Boolean).join(", ")}.`
      ),
    ],
  });
}

async function executeRoles(interaction) {
  const job = interaction.options.getString("job", true);
  const role = interaction.options.getRole("role", true);
  const metaField = ROLE_JOB_META_FIELDS[job];
  const jobLabel = ROLE_JOB_CHOICES.find((c) => c.value === job)?.name || job;

  db.upsertGuildMeta(interaction.guildId, { [metaField]: role.id });

  await interaction.editReply({
    embeds: [successEmbed("Role Assigned", `**${jobLabel}** is now ${role} - anyone holding that role gets this job's clearance immediately, no bot restart needed.`)],
  });
}

async function executeConfig(interaction) {
  if (!(await requirePremiumOwner(interaction))) return;
  if (!hasAdminClearance(interaction)) {
    await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to KOBA Bot Admins.")] });
    return;
  }

  const setting = interaction.options.getString("setting", true);
  const value = interaction.options.getInteger("value", true);

  if (!SCALAR_CONFIG_KEYS.includes(setting)) {
    await interaction.editReply({ embeds: [dangerEmbed("Unknown Setting", `Valid settings: ${SCALAR_CONFIG_KEYS.join(", ")}`)] });
    return;
  }

  db.setConfig(interaction.guildId, setting, value);
  await interaction.editReply({
    embeds: [successEmbed("Config Updated", `**${setting}** is now **${value}**. This takes effect immediately.`)],
  });
}

async function executeLfgScope(interaction) {
  if (!(await requirePremiumOwner(interaction))) return;

  const scope = interaction.options.getString("scope", true);
  db.setLfgScope(interaction.guildId, scope);

  const description =
    scope === "global"
      ? "New `/create-lfg` posts made in this server will now also mirror into every other server that's also set to **Global** (as long as they have an LFG feed channel configured via `/template setup`)."
      : "New `/create-lfg` posts made in this server will now only appear here - they won't mirror anywhere else.";

  await interaction.editReply({ embeds: [successEmbed("LFG Scope Updated", description)] });
}

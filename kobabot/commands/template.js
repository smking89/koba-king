"use strict";

/**
 * Consolidated 2026-09-08 (command cleanup pass) - was four separate
 * commands (/setup-template, /save-template, /my-templates,
 * /download-template) covering two related-but-distinct "template"
 * concepts: KOBA Bot's built-in registry templates (Standard/Cluster/
 * Minimal/BotAdmin, plus the 4 Master-Role-Hierarchy-spec layouts added
 * 2026-10-12 - see config/templates.js's TEMPLATES) and a user's own SAVED
 * custom templates (a snapshot of an existing server's structure - see
 * database/db.js's *CustomTemplate functions). Merged under one /template
 * command with subcommands (setup/save/mine/download) rather than four
 * similarly-named top-level commands. Each subcommand's body below is
 * otherwise byte-for-byte what its standalone command did - this is a pure
 * namespace consolidation, not a logic rewrite.
 *
 * RESTORED (2026-10-12) - this file had been overwritten (in an
 * uncommitted working-tree edit, never merged) by a much cruder, 76-line
 * parallel implementation that hardcoded its own old-named role list
 * (Owner/Co-Owner/Admin/Mod/BIZ/Player/XBOX/PSN) and its own inline
 * EliteKit1-40 color array, completely disconnected from config/
 * templates.js's TEMPLATES/CHANNEL_CONTENT and from utils/provisioning.js's
 * provisionTemplate - a destructive full wipe-and-rebuild with no
 * find-or-create idempotency, no saved-template support, and no
 * /template download. That version is gone; this is the real command
 * again, with the one genuinely-unrelated fix the crude version had
 * picked up (a null `interaction.guild` right after a bot restart,
 * resolved via a fresh REST fetch instead of crashing) folded back in.
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
} = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner, isOfficialGuild, getGuildPlan } = require("../utils/premium");
const { provisionGuild, provisionTemplate, repairManagedPanels, movePanel } = require("../utils/provisioning");
const { deployTicketPanel } = require("../utils/tickets");
const { runCategoryLeaderboardImageTick } = require("../utils/categoryLeaderboards");
const { TEMPLATES, CHANNEL_CONTENT } = require("../config/templates");
const { snapshotStructure, restoreStructure } = require("../utils/serverStructure");
const { successEmbed, infoEmbed, dangerEmbed, warningEmbed, errorEmbed } = require("../utils/embeds");
const { wipeGuild } = require("../utils/serverWipe");
const { getRcon } = require("../rcon/manager");
const { formatStyledMessage } = require("../utils/messageStyle");
const { ensureAllSystemRoles, ensurePlanRoles, syncGuildOwnerPlanRole } = require("../utils/systemRoles");
const { buildStep, isWizardAuthorized } = require("../utils/setupWizardPanel");

const MAX_TEMPLATES_PER_OWNER = 10;

// ---------------------------------------------------------------------------
// /template setup (was /setup-template) - apply a built-in registry template
// ---------------------------------------------------------------------------

async function handleSetup(interaction) {
  // BOT_ADMIN_TEMPLATE (config/templates.js) is for KOBA Bot's own official
  // guilds only - it has no player-facing content at all (no player count,
  // no queue, no LFG - not a customer Rust server layout) and would make
  // no sense applied anywhere else, per explicit product decision. Same
  // officialGuildOnly gate also covers the 4 Master-Role-Hierarchy layouts
  // added 2026-10-12 (koba-bot-dev-hq / koba-games-hq are KOBA's own
  // servers; the two multi/single Rust-cluster layouts are customer-facing
  // and intentionally NOT officialGuildOnly).
  const availableTemplates = Object.values(TEMPLATES).filter((t) => !t.officialGuildOnly || isOfficialGuild(interaction.guildId));
  const menu = new StringSelectMenuBuilder()
    .setCustomId("boombot:setup_template_select")
    .setPlaceholder("Choose a server template")
    .addOptions(
      availableTemplates.map((t) => ({
        label: t.label,
        description: t.description.slice(0, 100),
        value: t.key,
      }))
    );

  const reply = await interaction.editReply({
    embeds: [infoEmbed("Choose A Template", "This adds roles, categories, and channels on top of what KOBA Bot already set up - existing channels with the same name are left untouched, nothing is duplicated.")],
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  let selection;
  try {
    selection = await reply.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 60_000,
    });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No template selected in time - run /template setup again.")], components: [] });
    return;
  }

  const template = TEMPLATES[selection.values[0]];

  // Defensive re-check (the select menu above already excludes this option
  // outside the official guilds) - a stale/cached menu shouldn't be enough
  // to apply an official-guild-only template somewhere else.
  if (template.officialGuildOnly && !isOfficialGuild(interaction.guildId)) {
    await selection.update({ embeds: [dangerEmbed("Not Available Here", `**${template.label}** can only be applied on one of KOBA Bot's official guilds.`)], components: [] });
    return;
  }

  await selection.deferUpdate();

  // A template can't be laid out cleanly on top of a differently-shaped
  // old one (leftover categories/roles from a previous template would
  // just sit there orphaned), so switching wipes the server first - same
  // two-step confirmation as /nuke, since this is just as destructive.
  // Temp reward roles (see database/schema.sql's temp_role_grants) are the
  // one exception - a player mid-reward shouldn't lose it just because an
  // admin reorganized the server.
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:setup_template_wipe_step1").setLabel("I understand - continue").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:setup_template_wipe_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await interaction.editReply({
    embeds: [
      warningEmbed(
        "This Deletes Everything First",
        `Applying **${template.label}** first deletes **every channel, category, and role** in this server (except @everyone, Discord-managed roles, and any temporary reward role a player is currently holding) so it can be rebuilt fresh. This cannot be undone.`
      ),
    ],
    components: [confirmRow],
  });

  let wipeStep1;
  try {
    wipeStep1 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  if (wipeStep1.customId === "boombot:setup_template_wipe_cancel") {
    await wipeStep1.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  const finalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:setup_template_wipe_confirm").setLabel("Yes, delete and rebuild").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:setup_template_wipe_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await wipeStep1.update({
    embeds: [dangerEmbed("Final Confirmation", "Last chance - click below to permanently delete the current server structure and rebuild it, or Cancel to back out.")],
    components: [finalRow],
  });

  let wipeStep2;
  try {
    wipeStep2 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  if (wipeStep2.customId === "boombot:setup_template_wipe_cancel") {
    await wipeStep2.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  // Per explicit product decision - ask before applying, not bury it as a
  // separate setting afterward. Kit-tier roles (VIP/FreeKit/FreeKit2/
  // EliteKit1-44 - 47 roles) are a lot of role-list clutter for a server
  // that doesn't plan to use per-tier kit auto-grant at all.
  const kitRolesRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:setup_template_kitroles_yes").setLabel("Yes, create Kit tier roles").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("boombot:setup_template_kitroles_no").setLabel("No, skip them").setStyle(ButtonStyle.Secondary)
  );
  await wipeStep2.update({
    embeds: [infoEmbed("Kit Tier Roles", "Generate the preset Kit-tier roles (VIP, FreeKit, FreeKit2, EliteKit1-44)? These back the per-tier kit auto-grant system - skip them if you don't plan to use it. You can change this later with `/setup-system-roles`.")],
    components: [kitRolesRow],
  });

  let kitRolesStep;
  try {
    kitRolesStep = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  const generateKitRoles = kitRolesStep.customId === "boombot:setup_template_kitroles_yes";

  await kitRolesStep.update({ embeds: [warningEmbed("Wiping...", "Deleting the current server structure - this may take a moment for larger servers.")], components: [] });

  const skipRoleIds = new Set(db.listActiveTempRoleIds(interaction.guild.id));
  await wipeGuild(interaction.guild, { skipRoleIds, reason: "KOBA Bot /template setup (template switch)" });

  // Brief pause before rebuilding - a full-server wipe just burned through
  // a delete call per channel/category/role in a row, which can leave
  // Discord's per-guild rate limit bucket for this route saturated right
  // when the rebuild immediately tries to fire a create call per entity
  // right after. Cheap insurance on top of the cache/resilience fixes
  // above, not a replacement for them.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Best-effort: if this command was run in a channel that just got
  // deleted along with everything else, Discord can't deliver the interim
  // edit to it (Unknown Message) - not a real failure, just move on to
  // rebuilding, same as /nuke treats this.
  await interaction.editReply({ embeds: [infoEmbed("Rebuilding...", `Applying **${template.label}** now.`)], components: [] }).catch(() => {});

  // Remember the chosen template AND kit-roles choice so provisionGuild()
  // below (and every future /panel-repair, ownership transfer, etc.) keeps
  // using them instead of reverting to defaults on the next call.
  db.upsertGuildMeta(interaction.guild.id, { template_key: template.key, kit_roles_enabled: generateKitRoles ? 1 : 0 });

  const { createdChannels } = await provisionTemplate(interaction.guild, template, []);
  const totalCategories = template.categories.length;

  // Applying a template only creates roles/channels - the base panels
  // (tickets) and every self-healing button panel still need an explicit
  // pass to actually get posted/pinned, same as /panel-repair.
  const { supportChannel } = await provisionGuild(interaction.guild);
  await deployTicketPanel(supportChannel);
  await repairManagedPanels(interaction.guild);
  await runCategoryLeaderboardImageTick(interaction.client).catch((err) => console.error("[KOBA Bot] template setup category leaderboard refresh failed:", err));

  await interaction
    .editReply({
      embeds: [successEmbed("Template Applied", `**${template.label}** is live - ${createdChannels.length} channel(s) provisioned across ${totalCategories} categor${totalCategories === 1 ? "y" : "ies"}. All panels and leaderboards have been generated and pinned.`)],
      components: [],
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// /template save (was /save-template) - snapshot the current server
// ---------------------------------------------------------------------------

async function handleSave(interaction) {
  const existing = db.listCustomTemplates(interaction.user.id);
  if (existing.length >= MAX_TEMPLATES_PER_OWNER) {
    await interaction.reply({
      embeds: [dangerEmbed("Template Limit Reached", `You already have ${MAX_TEMPLATES_PER_OWNER} saved templates - delete one with \`/template mine\` first.`)],
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder().setCustomId("boombot:save_template_modal").setTitle("Save Template");
  const nameInput = new TextInputBuilder()
    .setCustomId("template_name")
    .setLabel("Template name")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(60)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);

  let modalSubmit;
  try {
    modalSubmit = await interaction.awaitModalSubmit({ filter: (i) => i.user.id === interaction.user.id && i.customId === "boombot:save_template_modal", time: 120_000 });
  } catch {
    return; // modal timed out/dismissed - nothing to do
  }

  const name = modalSubmit.fields.getTextInputValue("template_name").trim();
  if (!name) {
    await modalSubmit.reply({ embeds: [dangerEmbed("No Name Given", "Run `/template save` again and enter a name.")], ephemeral: true });
    return;
  }

  await modalSubmit.deferReply({ ephemeral: true });
  const data = snapshotStructure(interaction.guild);
  db.saveCustomTemplate(interaction.user.id, name, data);

  const channelCount = data.categories.reduce((n, c) => n + c.channels.length, 0) + data.uncategorizedChannels.length;
  await modalSubmit.editReply({
    embeds: [
      successEmbed(
        "Template Saved",
        `**${name}** saved to your account - **${data.roles.length}** role(s), **${data.categories.length}** categor${data.categories.length === 1 ? "y" : "ies"}, **${channelCount}** channel(s). Apply it here or on any server you own with \`/template mine\`.`
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// /template mine (was /my-templates) - apply or delete a saved template
// ---------------------------------------------------------------------------

function templatePickerRow(templates) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("boombot:my_template_select")
    .setPlaceholder("Choose a saved template")
    .addOptions(templates.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), description: new Date(t.created_at).toLocaleDateString(), value: t.name })));
  return new ActionRowBuilder().addComponents(menu);
}

function templateActionRow(name) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`boombot:my_template_apply:${name}`).setLabel("✅ Apply Here").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`boombot:my_template_delete:${name}`).setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:my_template_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
}

async function handleMine(interaction) {
  const templates = db.listCustomTemplates(interaction.user.id);
  if (!templates.length) {
    await interaction.editReply({ embeds: [infoEmbed("No Saved Templates", "Use `/template save` on a server you own to save one first.")] });
    return;
  }

  const reply = await interaction.editReply({
    embeds: [infoEmbed("Your Templates", "Choose one to apply here or delete.")],
    components: [templatePickerRow(templates)],
  });

  let selection;
  try {
    selection = await reply.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (i) => i.user.id === interaction.user.id, time: 60_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No template selected in time - run `/template mine` again.")], components: [] });
    return;
  }

  const name = selection.values[0];
  await selection.update({ embeds: [infoEmbed(name, "Apply this template to the current server, or delete it from your account.")], components: [templateActionRow(name)] });

  let action;
  try {
    action = await reply.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 60_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }

  if (action.customId === "boombot:my_template_cancel") {
    await action.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  if (action.customId.startsWith("boombot:my_template_delete:")) {
    db.deleteCustomTemplate(interaction.user.id, name);
    await action.update({ embeds: [successEmbed("Deleted", `**${name}** was removed from your account.`)], components: [] });
    return;
  }

  // Apply - same destructive two-step confirmation as /template setup and
  // /server-backup restore (this deletes the current server structure first).
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:my_template_apply_step1").setLabel("I understand - continue").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:my_template_apply_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await action.update({
    embeds: [
      warningEmbed(
        "This Deletes Everything First",
        `Applying **${name}** first deletes **every channel, category, and role** in this server (except @everyone, Discord-managed roles, and any temporary reward role a player is currently holding) so it can be rebuilt fresh. This cannot be undone.`
      ),
    ],
    components: [confirmRow],
  });

  let step1;
  try {
    step1 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  if (step1.customId === "boombot:my_template_apply_cancel") {
    await step1.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  const finalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:my_template_apply_confirm").setLabel("Yes, delete and rebuild").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:my_template_apply_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await step1.update({
    embeds: [dangerEmbed("Final Confirmation", "Last chance - click below to permanently delete the current server structure and apply the template, or Cancel to back out.")],
    components: [finalRow],
  });

  let step2;
  try {
    step2 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  if (step2.customId === "boombot:my_template_apply_cancel") {
    await step2.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  await step2.update({ embeds: [warningEmbed("Wiping...", "Deleting the current server structure - this may take a moment for larger servers.")], components: [] });

  const template = db.getCustomTemplate(interaction.user.id, name);
  if (!template) {
    await interaction.editReply({ embeds: [dangerEmbed("Template Gone", "This template no longer exists - nothing was changed.")], components: [] }).catch(() => {});
    return;
  }

  const skipRoleIds = new Set(db.listActiveTempRoleIds(interaction.guild.id));
  await wipeGuild(interaction.guild, { skipRoleIds, reason: "KOBA Bot /template mine apply" });

  await interaction.editReply({ embeds: [infoEmbed("Rebuilding...", `Applying **${name}** now.`)], components: [] }).catch(() => {});

  const summary = await restoreStructure(interaction.guild, template.data);

  // Same tail as /template setup - re-attach KOBA Bot's own required panels
  // by name (this template has none of its own, being a plain structure
  // snapshot, so this is the only thing that puts the tickets/kit-panel/etc.
  // back).
  const { supportChannel } = await provisionGuild(interaction.guild);
  await deployTicketPanel(supportChannel);
  await repairManagedPanels(interaction.guild);

  const skippedNote = summary.skipped.overwrites + summary.skipped.roles + summary.skipped.channels;

  await interaction
    .editReply({
      embeds: [
        successEmbed(
          "Template Applied",
          `**${summary.rolesCreated}** role(s), **${summary.categoriesCreated}** categor${summary.categoriesCreated === 1 ? "y" : "ies"}, and **${summary.channelsCreated}** channel(s) rebuilt.${skippedNote ? `\n\n${skippedNote} item(s) couldn't be fully restored (usually a permission reference the template didn't include).` : ""}`
        ),
      ],
      components: [],
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// /template download (was /download-template) - export a built-in
// template's outline as text
// ---------------------------------------------------------------------------

/** Renders a template's structure as a clean, human-readable text outline. */
function renderTemplateText(template) {
  const lines = [`KOBA Bot ${template.label}`, "=".repeat(40), "", template.description, "", "ROLES", "-".repeat(40)];
  for (const role of template.roles) lines.push(`- ${role.name}`);

  // Several channelDefs deliberately share one physical channel (see
  // `sharesChannelWith` in this template - fewer channels/categories, easier
  // navigation) - collect what else rides along with each primary key so
  // the export reads as "one real channel, several things posted in it"
  // instead of listing sharing channelDefs as if they were separate channels.
  const sharedWith = {};
  for (const category of template.categories) {
    for (const channel of category.channels) {
      if (!channel.sharesChannelWith) continue;
      (sharedWith[channel.sharesChannelWith] ||= []).push(CHANNEL_CONTENT[channel.key]?.title || channel.key);
    }
  }

  lines.push("", "CATEGORIES & CHANNELS", "-".repeat(40));
  for (const category of template.categories) {
    lines.push("", category.name);
    for (const channel of category.channels) {
      if (channel.sharesChannelWith) continue; // printed as part of its primary channel's line instead
      const kind = channel.type === "voice" ? "voice" : channel.type === "forum" ? "forum" : "text";
      const access = channel.restrictedTo?.length
        ? `restricted: ${channel.restrictedTo.join(", ")}`
        : channel.readOnly
        ? "read-only"
        : "open";
      const extras = sharedWith[channel.key]?.length ? ` [also: ${sharedWith[channel.key].join(", ")}]` : "";
      lines.push(`  #${channel.name} (${kind}, ${access})${extras}`);
    }
  }

  return lines.join("\n");
}

async function handleDownload(interaction) {
  const template = TEMPLATES[interaction.options.getString("layout", true)];
  const text = renderTemplateText(template);
  const file = new AttachmentBuilder(Buffer.from(text, "utf8"), { name: `KOBABot_${template.key.toUpperCase()}_Template.txt` });
  await interaction.reply({ files: [file], ephemeral: true });
}

// ---------------------------------------------------------------------------
// /template wipe (was /wipe run) - announces a fresh Rust server wipe to
// Discord and in-game. Distinct from /template setup/mine (both tear down
// DISCORD structure) - this is for when the actual RUST SERVER wipes,
// triggered manually here. No plan-tier gating - gated on Administrator
// permission instead of requirePremiumOwner (the bar the old standalone
// /wipe command used), checked explicitly below since Discord's
// per-command setDefaultMemberPermissions can't vary by subcommand.
// ---------------------------------------------------------------------------

async function announceWipeInGame(guildId, message) {
  try {
    const rcon = await getRcon(guildId);
    await rcon.say(formatStyledMessage(guildId, "event", { message }));
    return true;
  } catch (err) {
    console.warn("[KOBA Bot] /template wipe in-game broadcast failed:", err.message);
    return false;
  }
}

async function handleWipe(interaction) {
  const guildId = interaction.guildId;
  const channelOverride = interaction.options.getChannel("channel");

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("boombot:wipe_confirm").setLabel("Yes, post the announcement").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("boombot:wipe_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  const reply = await interaction.editReply({
    embeds: [dangerEmbed("Announce A Fresh Wipe?", "This posts a **Fresh Wipe!** announcement to Discord and in-game.")],
    components: [confirmRow],
  });

  let step1;
  try {
    step1 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
  } catch {
    await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
    return;
  }
  if (step1.customId === "boombot:wipe_cancel") {
    await step1.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
    return;
  }

  await step1.update({ content: "⏳ Posting wipe announcement...", embeds: [], components: [] });

  try {
    const meta = db.getGuildMeta(guildId);
    const channel = channelOverride || (meta?.announcement_channel_id ? await interaction.guild.channels.fetch(meta.announcement_channel_id).catch(() => null) : null);
    const broadcastEmbed = successEmbed("🆕 Fresh Wipe!", "The server has wiped - everyone starts fresh. Good luck out there!");
    let discordPosted = false;
    if (channel) {
      await channel.send({ embeds: [broadcastEmbed] }).catch(() => {});
      discordPosted = true;
    }
    const ingamePosted = await announceWipeInGame(guildId, "[ FRESH WIPE ] The server has wiped - everyone starts fresh. Good luck out there!");

    const summary = [
      `${discordPosted ? "✅" : "⚠️"} Discord announcement${discordPosted ? " posted" : " skipped (no announcement channel configured)"}`,
      `${ingamePosted ? "✅" : "⚠️"} In-game broadcast${ingamePosted ? " sent" : " failed (server unreachable - see logs)"}`,
    ];

    await interaction.editReply({ content: null, embeds: [successEmbed("Wipe Announced", summary.join("\n"))], components: [] });
  } catch (error) {
    console.error("Error executing /template wipe:", error);
    await interaction.editReply({ content: null, embeds: [errorEmbed("Wipe Failed", "Something went wrong partway through - check the logs before running this again.")], components: [] });
  }
}

// ---------------------------------------------------------------------------
// /template repair (was /panel-repair) - ensure every panel/leaderboard
// exists and is pinned without a full re-setup. Byte-for-byte what the
// standalone command did.
// ---------------------------------------------------------------------------

const REPAIR_PANEL_LABELS = {
  linkGamertag: "🔗 Link Gamertag panel",
};

async function handleRepair(interaction) {
  const lines = [];

  // provisionGuild() is a dependency chain (each channel needs the role/
  // category resolved just before it), unlike provisionTemplate()'s flat
  // per-item loop - a step failing partway through (e.g. Discord
  // throttling role/channel creation on this guild) can't sensibly
  // "skip and continue" the way an independent list can, so this wraps
  // the whole repair attempt instead and reports the real error rather
  // than falling through to the generic "Something Went Wrong" handler.
  try {
    const { supportChannel } = await provisionGuild(interaction.guild);
    await deployTicketPanel(supportChannel);
    lines.push(`✅ Ticket panel (${supportChannel})`);
  } catch (err) {
    await interaction.editReply({ embeds: [dangerEmbed("Repair Failed", `Couldn't repair the base panels: ${err.message}`)] });
    return;
  }

  try {
    const touched = await repairManagedPanels(interaction.guild);
    for (const key of touched) lines.push(`✅ ${REPAIR_PANEL_LABELS[key] || key}`);
  } catch (err) {
    lines.push(`⚠️ Couldn't repair the button panels: ${err.message}`);
  }

  await runCategoryLeaderboardImageTick(interaction.client).catch((err) => console.error("[KOBA Bot] /template repair category leaderboard refresh failed:", err));
  lines.push("✅ Leaderboards (if a leaderboard channel is configured)");

  await interaction.editReply({ embeds: [successEmbed("Panels Repaired", lines.join("\n"))] });
}

// ---------------------------------------------------------------------------
// /template roles (was /setup-system-roles) - create/recolor every
// KOBA-Bot-managed role on this server. Byte-for-byte what the standalone
// command did.
// ---------------------------------------------------------------------------

async function handleRoles(interaction) {
  try {
    const kitRoles = interaction.options.getBoolean("kit_roles");
    if (kitRoles !== null) db.upsertGuildMeta(interaction.guild.id, { kit_roles_enabled: kitRoles ? 1 : 0 });
    const touched = await ensureAllSystemRoles(interaction.guild);
    touched.push(...(await ensurePlanRoles(interaction.guild)));
    const plan = await getGuildPlan(interaction.guild);
    await syncGuildOwnerPlanRole(interaction.guild, plan);
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Roles Ready",
          `Created/verified **${touched.length}** KOBA Bot-managed roles - re-run this any time to pick up a palette change.\nThis server's owner is now on the **${plan}** tier role.`
        ),
      ],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [dangerEmbed("Failed", `Couldn't set up roles: ${err.message}`)] });
  }
}

// ---------------------------------------------------------------------------
// /template panels (was /panel-setup) - post or move any KOBA Bot panel to
// a channel. Byte-for-byte what the standalone command did.
// ---------------------------------------------------------------------------

/**
 * Consolidates every "post/move a persistent panel" command into one place
 * (originally 2026-09-07, per user request to cut down the command list) -
 * previously only /games-panel let an owner pick a channel; every other
 * panel (link, referral, LFG, kit claim, trade, shop, auctions,
 * marketplace, staff/mod hubs, the ticket panel) only ever landed wherever
 * /template setup's fixed template put it, with no way to relocate one
 * without touching Discord channel settings by hand.
 *
 * NOTE: this deliberately does NOT fold in /kit-panel, /shop-panel,
 * /team-panel, or /player-panel - those are ephemeral personal/admin hubs
 * you run directly (no channel concept, nothing gets "posted" anywhere)
 * rather than public persistent panels, so a channel picker doesn't apply
 * to them. Their public-facing equivalents ARE covered here
 * (kitPanelStaff/teamManagement post a button that opens the same hub;
 * trade posts player-panel.js's exact "My Items" button).
 */
const PANEL_SPECIAL_DEPLOYERS = {
  ticket: deployTicketPanel,
};

const PANEL_CHOICES = [
  { name: "🎫 Ticket Panel (open a ticket)", value: "ticket" },
  { name: "🔗 Link Gamertag", value: "linkGamertag" },
  { name: "🛡️ Staff Panel (owner/admin - command reference)", value: "staffPanel" },
  { name: "🔰 Mod Panel (command reference)", value: "modPanel" },
];

/** Shared deploy logic - used by this subcommand directly, and by the wizard's Panel Placement step (utils/setupWizardPanel.js) so the two don't duplicate this list/dispatch and risk drifting out of sync with it. */
async function deployPanel(guild, key, channel) {
  if (PANEL_SPECIAL_DEPLOYERS[key]) {
    await PANEL_SPECIAL_DEPLOYERS[key](channel);
  } else {
    await movePanel(guild, key, channel);
  }
}

async function handlePanels(interaction) {
  const key = interaction.options.getString("panel", true);
  const channel = interaction.options.getChannel("channel", true);
  const label = PANEL_CHOICES.find((c) => c.value === key)?.name || key;

  try {
    await deployPanel(interaction.guild, key, channel);
    await interaction.editReply({ embeds: [successEmbed("Panel Posted", `**${label}** is now live in ${channel}.`)] });
  } catch (err) {
    await interaction.editReply({ embeds: [dangerEmbed("Failed", `Couldn't post the panel: ${err.message}`)] });
  }
}

// ---------------------------------------------------------------------------
// /template wizard (was /setup-wizard) - step-by-step walkthrough of KOBA
// Bot's major feature configuration. Byte-for-byte what the standalone
// command did, including its own owner/Administrator gate instead of
// requirePremiumOwner (see utils/setupWizardPanel.js's header for why this
// one isn't on the command's declarative default_member_permissions).
// ---------------------------------------------------------------------------

async function handleWizard(interaction) {
  if (!isWizardAuthorized(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Owner/Admin Only", "Only the server owner or an Administrator can run the setup wizard.")], ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply(buildStep(interaction));
}

// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName("template")
    .setDescription("[Restricted] Set up, save, apply, or export a KOBA Bot server layout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("setup").setDescription("Provision a full server layout on top of the base KOBA Bot setup - pick a built-in template"))
    .addSubcommand((sub) => sub.setName("save").setDescription("Save this server's current roles/categories/channels as a reusable template"))
    .addSubcommand((sub) => sub.setName("mine").setDescription("Apply or delete a server layout you saved with /template save"))
    .addSubcommand((sub) =>
      sub
        .setName("download")
        .setDescription("Download a text outline of a KOBA Bot server template")
        .addStringOption((opt) =>
          opt
            .setName("layout")
            .setDescription("Which template to export")
            .setRequired(true)
            .addChoices(...Object.values(TEMPLATES).map((t) => ({ name: t.label, value: t.key })))
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("wipe")
        .setDescription("[Administrator] Announce a fresh Rust server wipe to Discord and in-game")
        .addChannelOption((opt) => opt.setName("channel").setDescription("Override which channel gets the Fresh Wipe broadcast").addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((sub) => sub.setName("repair").setDescription("Ensure every KOBA Bot panel/leaderboard exists and is pinned without a full re-setup"))
    .addSubcommand((sub) =>
      sub
        .setName("roles")
        .setDescription("Create/recolor every KOBA Bot-managed role on this server")
        .addBooleanOption((opt) => opt.setName("kit_roles").setDescription("Generate the 43 preset Kit-tier roles? Leave unset to keep your current choice."))
    )
    .addSubcommand((sub) =>
      sub
        .setName("panels")
        .setDescription("Post or move any KOBA Bot panel to a channel")
        .addStringOption((opt) => opt.setName("panel").setDescription("Which panel").setRequired(true).addChoices(...PANEL_CHOICES))
        .addChannelOption((opt) => opt.setName("channel").setDescription("Where to post it").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((sub) => sub.setName("wizard").setDescription("Step-by-step walkthrough to configure KOBA Bot's major features on this server")),

  async execute(interaction) {
    // interaction.guild can be null right after the bot restarts (guild
    // objects populate into the cache progressively, not all at once) -
    // fall back to a fresh REST fetch instead of crashing on a null guild
    // further down (same pattern utils/playerPanel.js, utils/linkPanel.js,
    // /nuke, etc. already use). Re-assigning interaction.guild itself
    // (discord.js's Interaction#guild is a plain getter backed by
        // interaction.guildId - it isn't writable) isn't possible, so every
    // guild access below keeps using interaction.guild/interaction.guildId
    // directly - this check only exists to fail fast with a clean message
    // instead of letting a later `interaction.guild.id` throw.
    const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
    if (!guild) {
      await interaction.reply({ content: "❌ Couldn't load this server's data - try again in a moment.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // /template download doesn't gate on requirePremiumOwner - matches
    // /download-template's original behavior (a plain text outline of a
    // built-in template isn't sensitive, no reason to restrict it).
    if (sub === "download") {
      await handleDownload(interaction);
      return;
    }

    if (sub === "save") {
      if (!(await requirePremiumOwner(interaction))) return;
      await handleSave(interaction);
      return;
    }

    // /template wipe isn't plan-gated (see handleWipe's header) - its own
    // bar is Administrator permission, same as the standalone /wipe
    // command it replaced, checked here instead of requirePremiumOwner.
    if (sub === "wipe") {
      await interaction.deferReply({ ephemeral: true });
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Administrator permission to run the wipe-day workflow.")] });
        return;
      }
      await handleWipe(interaction);
      return;
    }

    // /template wizard isn't gated on requirePremiumOwner either - matches
    // the standalone /setup-wizard command it replaced, which deliberately
    // left this command visible to everyone and enforced owner/Administrator
    // access in-handler instead (see handleWizard's header / isWizardAuthorized).
    if (sub === "wizard") {
      await handleWizard(interaction);
      return;
    }

    // /template roles isn't gated on requirePremiumOwner either - matches
    // the standalone /setup-system-roles command it replaced, which only
    // ever checked the command's own Manage Server default permission.
    if (sub === "roles") {
      await interaction.deferReply({ ephemeral: true });
      await handleRoles(interaction);
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    if (sub === "setup") {
      await handleSetup(interaction);
      return;
    }

    if (sub === "mine") {
      await handleMine(interaction);
      return;
    }

    if (sub === "repair") {
      await handleRepair(interaction);
      return;
    }

    // sub === "panels"
    await handlePanels(interaction);
  },
};

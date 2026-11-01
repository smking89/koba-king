"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { ensureAllSystemRoles, ensurePlanRoles, syncGuildOwnerPlanRole } = require("./systemRoles");
const { getGuildPlan } = require("./premium");

/**
 * /template wizard - a guided walkthrough of KOBA Bot's role setup for a
 * server owner setting up (or re-checking) their server. Deliberately
 * separate from /template setup, which provisions server STRUCTURE
 * (roles/channels/categories) - this wizard assumes that already happened
 * and only touches role configuration.
 *
 * TRIMMED (private-bot simplification pass) - the old Kits/Games/Panels
 * steps covered cut feature areas (and the Panels step's own deployPanel
 * was already a non-functional stub, not wired to anything real) - this is
 * now just the one real step, Roles.
 */

function isWizardAuthorized(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

const STEPS = ["roles"];

function buildRolesStep(interaction) {
  const meta = db.getGuildMeta(interaction.guildId);
  const ownerRole = meta?.owner_role_id ? interaction.guild.roles.cache.get(meta.owner_role_id) : null;
  const staffRole = meta?.staff_role_id ? interaction.guild.roles.cache.get(meta.staff_role_id) : null;
  const modRole = meta?.mod_role_id ? interaction.guild.roles.cache.get(meta.mod_role_id) : null;
  const embed = infoEmbed(
    "Roles & Staff Clearance",
    `**Owner role:** ${ownerRole ? ownerRole.toString() : "🔴 not set (falls back to 🤖 KOBA Bot Owner / actual server owner)"}\n` +
      `**Admin/Staff role:** ${staffRole ? staffRole.toString() : "🔴 not set (falls back to 🤖 KOBA Bot Admin)"}\n` +
      `**Moderator role:** ${modRole ? modRole.toString() : "🔴 not set (falls back to 🔰 KOBA Bot Mod)"}\n\n` +
      "Pick which Discord role gets each clearance tier below (optional - each already works with its default KOBA Bot-managed role if you skip it), or press **Sync KOBA Bot Roles** to create/recolor every rank and plan role this server needs (safe to press repeatedly - only touches roles that need it)."
  );
  const ownerSelect = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("setupwizard:owner_role").setPlaceholder("Choose the Owner role"));
  const staffSelect = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("setupwizard:staff_role").setPlaceholder("Choose the Admin/Staff role"));
  const modSelect = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("setupwizard:mod_role").setPlaceholder("Choose the Moderator role"));
  const syncRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setupwizard:sync_roles").setLabel("🔄 Sync KOBA Bot Roles").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("setupwizard:close").setLabel("✖️ Close").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [ownerSelect, staffSelect, modSelect, syncRow] };
}

function buildStep(interaction) {
  return buildRolesStep(interaction);
}

async function handleComponent(interaction) {
  if (!isWizardAuthorized(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Owner/Admin Only", "Only the server owner or an Administrator can use the setup wizard.")], ephemeral: true });
    return;
  }

  const action = interaction.customId.split(":")[1];

  if (action === "close") {
    await interaction.update({ embeds: [successEmbed("Setup Wizard Closed", "Run `/template wizard` again anytime to revisit this.")], components: [] });
    return;
  }
  if (action === "owner_role") {
    db.upsertGuildMeta(interaction.guildId, { owner_role_id: interaction.values[0] });
    await interaction.update(buildStep(interaction));
    return;
  }
  if (action === "staff_role") {
    db.upsertGuildMeta(interaction.guildId, { staff_role_id: interaction.values[0] });
    await interaction.update(buildStep(interaction));
    return;
  }
  if (action === "mod_role") {
    db.upsertGuildMeta(interaction.guildId, { mod_role_id: interaction.values[0] });
    await interaction.update(buildStep(interaction));
    return;
  }
  if (action === "sync_roles") {
    await interaction.deferUpdate();
    await ensureAllSystemRoles(interaction.guild);
    await ensurePlanRoles(interaction.guild);
    const plan = await getGuildPlan(interaction.guild);
    await syncGuildOwnerPlanRole(interaction.guild, plan);
    await interaction.editReply(buildStep(interaction));
    return;
  }
}

module.exports = { STEPS, buildStep, handleComponent, isWizardAuthorized };

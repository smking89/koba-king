"use strict";

/**
 * Free-form custom role builder - distinct from utils/systemRoles.js's
 * ensureAllSystemRoles(), which only provisions the bot's own fixed
 * name/color palette (config/roleColors.js). This command lets an admin
 * create/edit/delete/assign an arbitrary role with a name and color of
 * their own choosing, for anything outside that fixed catalog (e.g. a
 * one-off event role, a custom clan role).
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePremiumOwner } = require("../utils/premium");
const { successEmbed, errorEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");
const { withTimeout } = require("../utils/withTimeout");
const db = require("../database/db");

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function parseColor(input) {
  if (!input) return null;
  const match = input.trim().match(HEX_PATTERN);
  if (!match) return undefined; // undefined = invalid, distinct from null = "not provided"
  return parseInt(match[0].replace("#", ""), 16);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role-create")
    .setDescription("Create and manage custom Discord roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new custom role")
        .addStringOption((opt) => opt.setName("name").setDescription("Role name").setRequired(true).setMaxLength(100))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color, e.g. #5865F2 (default: no color)"))
        .addBooleanOption((opt) => opt.setName("hoist").setDescription("Show members with this role separately in the member list"))
        .addBooleanOption((opt) => opt.setName("mentionable").setDescription("Allow anyone to @mention this role"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Rename/recolor an existing custom role")
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to edit").setRequired(true))
        .addStringOption((opt) => opt.setName("name").setDescription("New name"))
        .addStringOption((opt) => opt.setName("color").setDescription("New hex color, e.g. #5865F2"))
        .addBooleanOption((opt) => opt.setName("hoist").setDescription("Show members with this role separately in the member list"))
        .addBooleanOption((opt) => opt.setName("mentionable").setDescription("Allow anyone to @mention this role"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a custom role")
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to delete").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("assign")
        .setDescription("Give a role to a member - optionally temporary")
        .addUserOption((opt) => opt.setName("member").setDescription("Member to give the role to").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to assign").setRequired(true))
        .addNumberOption((opt) => opt.setName("duration_hours").setDescription("Auto-remove after this many hours (leave blank for a permanent grant)").setMinValue(1 / 60))
    )
    .addSubcommand((sub) =>
      sub
        .setName("unassign")
        .setDescription("Remove a role from a member")
        .addUserOption((opt) => opt.setName("member").setDescription("Member to remove the role from").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove").setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();
    const botTopRole = guild.members.me?.roles.highest;

    try {
      if (sub === "create") {
        const name = interaction.options.getString("name", true).trim();
        const colorInput = interaction.options.getString("color");
        const color = parseColor(colorInput);
        if (color === undefined) {
          await interaction.editReply({ embeds: [errorEmbed("Invalid Color", `\`${colorInput}\` isn't a valid hex color. Use a format like \`#5865F2\`.`)] });
          return;
        }

        const role = await withTimeout(
          guild.roles.create({
            name,
            color: color ?? undefined,
            hoist: interaction.options.getBoolean("hoist") ?? false,
            mentionable: interaction.options.getBoolean("mentionable") ?? false,
            reason: `Custom role created via /role-create by ${interaction.user.tag}`,
          }),
          `create role "${name}"`
        );
        await interaction.editReply({ embeds: [successEmbed("Role Created", `Created ${role}.`)] });
        return;
      }

      if (sub === "edit") {
        const role = interaction.options.getRole("role", true);
        if (botTopRole && role.position >= botTopRole.position) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Edit That Role", "This role is positioned above (or equal to) the bot's own highest role - Discord won't let the bot touch it. Move the bot's role above it first.")] });
          return;
        }

        const name = interaction.options.getString("name");
        const colorInput = interaction.options.getString("color");
        const color = parseColor(colorInput);
        if (colorInput && color === undefined) {
          await interaction.editReply({ embeds: [errorEmbed("Invalid Color", `\`${colorInput}\` isn't a valid hex color. Use a format like \`#5865F2\`.`)] });
          return;
        }
        const hoist = interaction.options.getBoolean("hoist");
        const mentionable = interaction.options.getBoolean("mentionable");

        const edits = {};
        if (name) edits.name = name.trim();
        if (colorInput) edits.color = color;
        if (hoist !== null) edits.hoist = hoist;
        if (mentionable !== null) edits.mentionable = mentionable;

        if (Object.keys(edits).length === 0) {
          await interaction.editReply({ embeds: [infoEmbed("Nothing To Change", "Provide at least one of name/color/hoist/mentionable.")] });
          return;
        }

        edits.reason = `Custom role edited via /role-create by ${interaction.user.tag}`;
        const updated = await withTimeout(role.edit(edits), `edit role "${role.name}"`);
        await interaction.editReply({ embeds: [successEmbed("Role Updated", `Updated ${updated}.`)] });
        return;
      }

      if (sub === "delete") {
        const role = interaction.options.getRole("role", true);
        if (botTopRole && role.position >= botTopRole.position) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Delete That Role", "This role is positioned above (or equal to) the bot's own highest role - Discord won't let the bot touch it. Move the bot's role above it first.")] });
          return;
        }
        const roleName = role.name;
        await withTimeout(role.delete(`Custom role deleted via /role-create by ${interaction.user.tag}`), `delete role "${roleName}"`);
        await interaction.editReply({ embeds: [successEmbed("Role Deleted", `Deleted **${roleName}**.`)] });
        return;
      }

      if (sub === "assign" || sub === "unassign") {
        const targetUser = interaction.options.getUser("member", true);
        const role = interaction.options.getRole("role", true);
        if (botTopRole && role.position >= botTopRole.position) {
          await interaction.editReply({ embeds: [dangerEmbed("Can't Manage That Role", "This role is positioned above (or equal to) the bot's own highest role - Discord won't let the bot touch it. Move the bot's role above it first.")] });
          return;
        }
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
          await interaction.editReply({ embeds: [errorEmbed("Member Not Found", "That user isn't in this server.")] });
          return;
        }

        if (sub === "assign") {
          const durationHours = interaction.options.getNumber("duration_hours");
          if (member.roles.cache.has(role.id)) {
            await interaction.editReply({ embeds: [infoEmbed("Already Assigned", `${member} already has ${role}.`)] });
            return;
          }
          await withTimeout(member.roles.add(role, `/role-create assign by ${interaction.user.tag}`), `assign role "${role.name}"`);

          if (durationHours) {
            // Reuses the same temp_role_grants table/background tick as utils/referralRewards.js's
            // reward roles (see utils/backgroundLoops.js's TEMP_ROLE_EXPIRY_INTERVAL_MS, 60s) - no
            // new expiry machinery needed, this just feeds it from a second call site.
            const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;
            db.addTempRoleGrant(guild.id, targetUser.id, role.id, expiresAt);
            const expiryText = `<t:${Math.floor(expiresAt / 1000)}:R>`;
            await interaction.editReply({ embeds: [successEmbed("Temporary Role Assigned", `Gave ${role} to ${member} - expires ${expiryText}.`)] });
          } else {
            await interaction.editReply({ embeds: [successEmbed("Role Assigned", `Gave ${role} to ${member}.`)] });
          }
        } else {
          if (!member.roles.cache.has(role.id)) {
            await interaction.editReply({ embeds: [infoEmbed("Not Assigned", `${member} doesn't have ${role}.`)] });
            return;
          }
          await withTimeout(member.roles.remove(role, `/role-create unassign by ${interaction.user.tag}`), `remove role "${role.name}"`);
          // Clears any pending temp-role expiry for this grant so the background tick doesn't
          // try to remove a role that's already gone (harmless no-op either way, but keeps
          // temp_role_grants from accumulating stale rows for manually-unassigned roles).
          const pendingGrant = db.getTempRoleGrant(guild.id, targetUser.id, role.id);
          if (pendingGrant) db.removeTempRoleGrant(pendingGrant.id);
          await interaction.editReply({ embeds: [successEmbed("Role Removed", `Removed ${role} from ${member}.`)] });
        }
        return;
      }
    } catch (error) {
      console.error(`Error executing /role-create ${sub}:`, error);
      await interaction.editReply({ embeds: [errorEmbed("Role System Error", `Failed to ${sub} the role - ${error.message || "unknown error"}.`)] });
    }
  },
};

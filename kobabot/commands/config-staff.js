"use strict";

/**
 * Split out of the original /config (2026-10-13) - that single command's
 * 14 subcommand groups exceeded Discord's 8000-byte per-command size cap.
 * This file holds the staff/content-scheduling groups: staff (application
 * positions), auto-message (recurring in-game broadcasts), session
 * (temporary competitive periods). Business logic/DB calls are byte-
 * identical to the original /config - only which file/command they live
 * under moved.
 */

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { buildApplyPanel } = require("../utils/staffApplications");
const { isValidHex, isValidSize } = require("../utils/messageStyle");
const sessionManager = require("../utils/sessionManager");
const { CronExpressionParser } = require("cron-parser");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");
const { parseDateTime, nextAutoMessageFireDescription } = require("../utils/configHelpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config-staff")
    .setDescription("[Restricted] Configure staff applications, recurring broadcasts, and Sessions")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
        .setDescription("Create/start/end KOBA Bot Sessions (temporary competitive periods)")
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
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();

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
          await interaction.editReply({ embeds: [infoEmbed("Staff Positions", "None configured yet - use `/config-staff staff position`.")] });
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
          await interaction.editReply({ embeds: [infoEmbed("Auto-Message Configs", "None configured yet - use `/config-staff auto-message add-interval` or `add-cron`.")] });
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
              `**${name}** created as Session #${result.session.id}.${startsAt ? "" : " No start time set - use `/config-staff session start` when ready."}`
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
  },
};

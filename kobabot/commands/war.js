"use strict";

/**
 * Logic restored 2026-10-11 from the pre-consolidation commands/
 * declare-war.js (deleted during the 2026-09-08 command cleanup pass
 * that merged it into /war, but the real DB/RCON logic never got
 * ported over - this file was a cosmetic-only stub that never touched
 * the database or sent anything to the Rust server). Behavior is
 * otherwise byte-for-byte what the old standalone command did: declares
 * are tracked per-team in the database, broadcast in-game via a real
 * RCON `say`, and logged to the guild's configured logs channel.
 */

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { requirePlan } = require("../utils/premium");
const { hasFactionLeaderClearance, getRequesterMembership } = require("../utils/teamAuth");
const { formatStyledMessage } = require("../utils/messageStyle");
const { successEmbed, errorEmbed, dangerEmbed, infoEmbed, warningEmbed } = require("../utils/embeds");
const { recordClanWarWin } = require("../utils/serverRivalry");

async function announceInGame(guildId, message) {
  try {
    const rcon = await getRcon(guildId);
    await rcon.say(formatStyledMessage(guildId, "event", { message }));
  } catch (err) {
    console.warn("[KOBA Bot] /war in-game broadcast failed:", err.message);
  }
}

async function postToLogs(interaction, embed) {
  const meta = db.getGuildMeta(interaction.guildId);
  if (!meta?.logs_channel_id) return;
  const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  if (!guild) return;
  const channel = await guild.channels.fetch(meta.logs_channel_id).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("war")
    .setDescription("Declare or end a war with another team")
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName("declare").setDescription("Formally declare a state of war on a rival faction")
      .addStringOption(opt => opt.setName("target_team").setDescription("Name of the rival team").setRequired(true)))
    .addSubcommand(sub => sub.setName("end").setDescription("End your team's current war")
      .addStringOption(opt => opt.setName("winner").setDescription("Which team won - leave blank for no declared winner")))
    .addSubcommand(sub => sub.setName("status").setDescription("Show your team's current war, if any"))
    .addSubcommand(sub => sub.setName("history").setDescription("Show your team's past wars")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const requester = getRequesterMembership(interaction);
    if (!requester) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")] });
      return;
    }

    const guildId = interaction.guildId;
    const teamName = requester.team_name;
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "status") {
        const war = db.getActiveWarForTeam(guildId, teamName);
        if (!war) {
          await interaction.editReply({ embeds: [infoEmbed("No Active War", `**${teamName}** isn't currently at war with anyone.`)] });
          return;
        }
        const opponent = war.team_a === teamName ? war.team_b : war.team_a;
        await interaction.editReply({ embeds: [infoEmbed("Active War", `**${teamName}** is at war with **${opponent}** (declared <t:${Math.floor(war.declared_at / 1000)}:R>).`)] });
        return;
      }

      if (subcommand === "history") {
        const wars = db.listWarHistory(guildId, teamName);
        if (!wars.length) {
          await interaction.editReply({ embeds: [infoEmbed("War History", `**${teamName}** has no war history yet.`)] });
          return;
        }
        const lines = wars.map((w) => {
          const opponent = w.team_a === teamName ? w.team_b : w.team_a;
          const outcome = w.status === "active" ? "🔴 Active" : w.winner ? `🏆 Won by ${w.winner}` : "⚪ Ended (no declared winner)";
          return `vs **${opponent}** - ${outcome} · <t:${Math.floor(w.declared_at / 1000)}:d>`;
        });
        await interaction.editReply({ embeds: [infoEmbed("War History", lines.join("\n"))] });
        return;
      }

      if (!hasFactionLeaderClearance(interaction, requester)) {
        await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Faction Leader clearance (or Corporal+ rank) to declare or end wars.")] });
        return;
      }

      // Clan Wars is a Pro/Max feature (per website/src/components/PlanGrid.jsx)
      // - status/history above stay free so an existing war is still visible.
      if (!(await requirePlan(interaction, "pro", "Clan Wars"))) return;

      if (subcommand === "declare") {
        const opponentName = interaction.options.getString("target_team", true).trim();

        const opponentTeam = db.getTeam(guildId, opponentName);
        if (!opponentTeam) {
          await interaction.editReply({ embeds: [dangerEmbed("Team Not Found", `No team named **${opponentName}** exists on this server.`)] });
          return;
        }

        const existing = db.getActiveWarForTeam(guildId, teamName);
        if (existing) {
          const currentOpponent = existing.team_a === teamName ? existing.team_b : existing.team_a;
          await interaction.editReply({ embeds: [warningEmbed("Already At War", `**${teamName}** is already at war with **${currentOpponent}** - end that war first with \`/war end\`.`)] });
          return;
        }

        const opponentActive = db.getActiveWarForTeam(guildId, opponentName);
        if (opponentActive) {
          await interaction.editReply({ embeds: [warningEmbed("Opponent Already At War", `**${opponentName}** is already at war with another team.`)] });
          return;
        }

        const war = db.declareWar(guildId, teamName, opponentName, interaction.user.id);
        const announcement = `[ WAR DECLARED ] ${teamName} has declared war on ${opponentName}!`;
        await announceInGame(guildId, announcement);
        await postToLogs(interaction, successEmbed("War Declared", `**${teamName}** declared war on **${opponentName}**, called by **${interaction.user.username}**.`));

        await interaction.editReply({ embeds: [successEmbed("⚠️ Declaration of War", `**${teamName}** is now at war with **${opponentName}**. War ID: ${war.id}`)] });
        return;
      }

      if (subcommand === "end") {
        const war = db.getActiveWarForTeam(guildId, teamName);
        if (!war) {
          await interaction.editReply({ embeds: [dangerEmbed("No Active War", `**${teamName}** isn't currently at war with anyone.`)] });
          return;
        }

        const opponent = war.team_a === teamName ? war.team_b : war.team_a;
        const winnerInput = interaction.options.getString("winner")?.trim() || null;
        if (winnerInput && winnerInput !== teamName && winnerInput !== opponent) {
          await interaction.editReply({ embeds: [dangerEmbed("Invalid Winner", `Winner must be either **${teamName}** or **${opponent}**.`)] });
          return;
        }

        db.endWar(war.id, winnerInput);
        recordClanWarWin(guildId, war.id, winnerInput);
        const announcement = winnerInput ? `[ WAR ENDED ] The war between ${teamName} and ${opponent} is over - ${winnerInput} wins!` : `[ WAR ENDED ] The war between ${teamName} and ${opponent} has ended.`;
        await announceInGame(guildId, announcement);
        await postToLogs(interaction, successEmbed("War Ended", `**${teamName}** vs **${opponent}** ended, called by **${interaction.user.username}**.${winnerInput ? ` Winner: **${winnerInput}**.` : ""}`));

        await interaction.editReply({ embeds: [successEmbed("🕊️ War Ended", `The war between **${teamName}** and **${opponent}** has ended.${winnerInput ? ` **${winnerInput}** wins!` : ""}`)] });
        return;
      }
    } catch (error) {
      console.error(`Error executing /war ${subcommand}:`, error);
      await interaction.editReply({ embeds: [errorEmbed("War Command Failure", "Failed to transition team rivalry states.")] });
    }
  },
};

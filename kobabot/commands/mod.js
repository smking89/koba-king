"use strict";

/**
 * ban/unban logic restored 2026-10-11 from the pre-consolidation
 * commands/ban.js + commands/unban.js (deleted during the 2026-09-08
 * command cleanup pass that merged them into /mod, but the real
 * DB-backed logic never got ported over - this file was a cosmetic-only
 * stub with no RCON or database calls at all). Gating/behavior per
 * subcommand is otherwise byte-for-byte what the old standalone
 * commands did: "server" scope = per-guild bot-use lockout + best-effort
 * Discord ban, gated on hasAdminClearance; "platform" scope = BOOMid-wide
 * lockout across every guild, gated on isBotOwner + isOfficialGuild (any of
 * the 3 official servers, per OFFICIAL_GUILD_IDS - 2026-10-11).
 * Neither scope calls RCON - KOBA Bot's ban system blocks bot/Discord
 * access, it does not kick/ban from the live Rust server.
 *
 * jail/jail-release/jail-status/jail-set-location folded in 2026-10-12 from
 * the standalone commands/jail.js (deleted - this codebase doesn't add new
 * top-level commands for moderation actions, they go on /mod alongside
 * ban/unban). Unlike /mod ban, these actually touch the live Rust server:
 * jail-set-location saves a single admin-configured jail coordinate per
 * guild (captured live from the admin's own in-game position via
 * `server.printpos` if they're online and linked, or typed in manually as
 * x/y/z), jail teleports a gamertag there via `global.teleportpos` and
 * records a sentence, and utils/jailSystem.js's background tick
 * (utils/backgroundLoops.js) keeps them pinned there until jail-release or
 * the optional duration runs out. Gating: hasAdminClearance only (same bar
 * as ban/unban) - no requirePlan check, matching commands/jail.js's own
 * header note that config/planTiers.js documents Basic as already shipping
 * full core/Rust-integration functionality with Pro/Max feature-identical
 * to it, so there's no tier to lock this behind. Logic is otherwise
 * byte-for-byte what commands/jail.js did - this is a pure command-surface
 * move, not a rewrite.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePrintPos } = require("../rcon/parsers");
const { hasAdminClearance } = require("../utils/teamAuth");
const { isBotOwner, isOfficialGuild } = require("../utils/premium");
const { successEmbed, dangerEmbed, infoEmbed } = require("../utils/embeds");

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
    .setName("mod")
    .setDescription("Staff moderation tools")
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName("ban").setDescription("Ban a user (server or platform-wide)")
      .addStringOption(opt => opt.setName("reason").setDescription("Reason for the ban").setRequired(true))
      .addUserOption(opt => opt.setName("target").setDescription("Select user to ban (server scope: required; platform scope: optional if gamertag/boom_id given)"))
      .addBooleanOption(opt => opt.setName("platform").setDescription("[Bot Owner, official server only] Apply ban platform-wide across every KOBA Bot server"))
      .addStringOption(opt => opt.setName("gamertag").setDescription("[Platform scope only] Their linked Xbox Gamertag / PSN Online ID"))
      .addStringOption(opt => opt.setName("boom_id").setDescription("[Platform scope only] Their KOBA ID directly, if already known")))
    .addSubcommand(sub => sub.setName("unban").setDescription("Unban a user")
      .addStringOption(opt => opt.setName("userid").setDescription("Discord User ID to unban (per-server; or platform scope with a linked account)"))
      .addBooleanOption(opt => opt.setName("platform").setDescription("[Bot Owner, official server only] Reverse a platform-wide ban instead of a per-server one"))
      .addStringOption(opt => opt.setName("boom_id").setDescription("[Platform scope only] The KOBA ID to unban directly (works even without a linked Discord account)")))
    .addSubcommand((sub) =>
      sub
        .setName("jail")
        .setDescription("Jail a player at the configured jail coordinate")
        .addStringOption((opt) => opt.setName("gamertag").setDescription("The player's in-game gamertag").setRequired(true))
        .addIntegerOption((opt) => opt.setName("duration_minutes").setDescription("Sentence length in minutes - leave blank for indefinite (release manually)").setMinValue(1))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the jailing"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("jail-release")
        .setDescription("Release a jailed player early")
        .addStringOption((opt) => opt.setName("gamertag").setDescription("The player's in-game gamertag").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("jail-status").setDescription("List everyone currently jailed in this server"))
    .addSubcommand((sub) =>
      sub
        .setName("jail-set-location")
        .setDescription("Configure this server's jail coordinate")
        .addNumberOption((opt) => opt.setName("x").setDescription("X coordinate (leave all 3 blank to capture your own live position instead)"))
        .addNumberOption((opt) => opt.setName("y").setDescription("Y coordinate / height"))
        .addNumberOption((opt) => opt.setName("z").setDescription("Z coordinate"))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    const platform = interaction.options.getBoolean("platform") || false;

    try {
      if (subcommand === "ban") {
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason", true);

        if (platform) {
          if (!isBotOwner(interaction.user.id)) {
            await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "Only the bot owner can issue a platform-wide ban.")] });
            return;
          }
          if (!isOfficialGuild(interaction.guildId)) {
            await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "Platform-wide bans only work in the official KOBA Bot server.")] });
            return;
          }

          const gamertag = interaction.options.getString("gamertag");
          const boomIdInput = interaction.options.getString("boom_id");

          if (!target && !gamertag && !boomIdInput) {
            await interaction.editReply({ embeds: [dangerEmbed("Missing Target", "Provide at least one of: target, gamertag, or boom_id.")] });
            return;
          }

          // A gamertag/boom_id lookup can only ever find an identity that
          // already exists; a Discord user can always be banned pre-emptively
          // even if they've never linked anything, so a future link attempt
          // from that account is blocked too.
          let identity = null;
          if (boomIdInput) identity = db.getBoomIdentity(boomIdInput.trim());
          else if (gamertag) identity = db.getBoomIdentityByPlatformId(gamertag.trim());
          else if (target) identity = db.getOrCreateBoomIdentityByDiscordId(target.id);

          if (!identity) {
            await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No KOBA ID matches that - they may have never linked a Gamertag on any server.")] });
            return;
          }

          db.setBoomIdentityBanned(identity.boom_id, true, reason, interaction.user.id);

          let bannedFromCount = 0;
          let failedCount = 0;
          if (identity.discord_id) {
            for (const guild of interaction.client.guilds.cache.values()) {
              try {
                await guild.members.ban(identity.discord_id, { reason: `[KOBA Bot Global Ban] ${reason}` });
                bannedFromCount++;
              } catch {
                failedCount++;
              }
            }
            for (const membership of db.listMembershipsByDiscordId(identity.discord_id)) {
              db.removeMember(membership.guild_id, identity.discord_id);
            }
          }

          const discordNote = identity.discord_id
            ? `Banned from **${bannedFromCount}** server(s)${failedCount ? ` (failed on ${failedCount} - likely missing Ban Members permission there)` : ""}.`
            : "No linked Discord account yet - only the KOBA ID itself is banned for now; it'll block any future /link attempt.";

          await interaction.editReply({
            embeds: [successEmbed(
              "Platform Ban Applied",
              `**KOBA ID:** \`${identity.boom_id}\`\n**Reason:** ${reason}\n\n${discordNote} They can no longer use any KOBA Bot command, panel, or link a new account anywhere.`
            )],
          });
          return;
        }

        // Per-server ban
        if (!target) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Target", "The `target` option is required for a per-server ban.")] });
          return;
        }
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to ban someone from this server.")] });
          return;
        }

        db.banFromGuild(interaction.guildId, target.id, reason, interaction.user.id);
        db.removeMember(interaction.guildId, target.id);

        let discordBanned = false;
        try {
          await interaction.guild.members.ban(target.id, { reason: `[KOBA Bot Server Ban] ${reason}` });
          discordBanned = true;
        } catch {
          // Missing Ban Members permission, or already gone - the guild_bans row + interactionCreate.js's gate still blocks bot use either way.
        }

        await interaction.editReply({
          embeds: [successEmbed(
            "Banned From This Server",
            `**${target.username}** can no longer use KOBA Bot in this server${discordBanned ? " and has been removed from it" : " (Discord ban failed - check the bot's Ban Members permission here)"}. This has no effect on any other KOBA Bot server.\n**Reason:** ${reason}`
          )],
        });
        return;
      }

      if (subcommand === "unban") {
        const userIdInput = interaction.options.getString("userid")?.trim() || null;
        const boomIdInput = interaction.options.getString("boom_id")?.trim() || null;

        if (platform) {
          if (!isBotOwner(interaction.user.id)) {
            await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "Only the bot owner can reverse a platform-wide ban.")] });
            return;
          }
          if (!isOfficialGuild(interaction.guildId)) {
            await interaction.editReply({ embeds: [dangerEmbed("Wrong Server", "Platform-wide unbans only work in the official KOBA Bot server.")] });
            return;
          }
          if (!userIdInput && !boomIdInput) {
            await interaction.editReply({ embeds: [dangerEmbed("Missing Target", "Provide at least one of: userid or boom_id.")] });
            return;
          }

          const identity = boomIdInput ? db.getBoomIdentity(boomIdInput) : db.getBoomIdentityByDiscordId(userIdInput);
          if (!identity) {
            await interaction.editReply({ embeds: [dangerEmbed("Not Found", "No KOBA ID matches that.")] });
            return;
          }
          if (!identity.is_banned) {
            await interaction.editReply({ embeds: [dangerEmbed("Not Banned", "That account isn't currently platform-banned.")] });
            return;
          }

          db.setBoomIdentityBanned(identity.boom_id, false);

          let unbannedCount = 0;
          if (identity.discord_id) {
            for (const guild of interaction.client.guilds.cache.values()) {
              try {
                await guild.members.unban(identity.discord_id, "KOBA Bot Global Unban");
                unbannedCount++;
              } catch {
                // Not banned in that particular guild, or bot lacks permission - not fatal, keep going.
              }
            }
          }

          await interaction.editReply({
            embeds: [successEmbed("Platform Ban Reversed", `**KOBA ID:** \`${identity.boom_id}\`\n\n${identity.discord_id ? `Unbanned from **${unbannedCount}** server(s). They can use KOBA Bot and link accounts again.` : "No linked Discord account - the KOBA ID itself is no longer banned, so a future /link attempt will succeed."}`)],
          });
          return;
        }

        // Per-server unban
        if (!userIdInput) {
          await interaction.editReply({ embeds: [dangerEmbed("Missing Target", "The `userid` option is required for a per-server unban.")] });
          return;
        }
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to unban someone in this server.")] });
          return;
        }
        if (!db.isGuildBanned(interaction.guildId, userIdInput)) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Banned", "That Discord ID isn't banned in this server.")] });
          return;
        }

        db.unbanFromGuild(interaction.guildId, userIdInput);
        let discordUnbanned = false;
        try {
          await interaction.guild.members.unban(userIdInput, "KOBA Bot Server Unban");
          discordUnbanned = true;
        } catch {
          // Not Discord-banned (only ever had the bot-side ban), or bot lacks permission - not fatal.
        }

        await interaction.editReply({
          embeds: [successEmbed("Server Ban Reversed", `<@${userIdInput}> can use KOBA Bot in this server again${discordUnbanned ? " and has been unbanned from Discord too" : ""}.`)],
        });
        return;
      }

      if (subcommand === "jail-set-location") {
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to use the jail system.")] });
          return;
        }

        const x = interaction.options.getNumber("x");
        const y = interaction.options.getNumber("y");
        const z = interaction.options.getNumber("z");
        const guildId = interaction.guildId;

        let coords;
        if (x !== null || y !== null || z !== null) {
          if (x === null || y === null || z === null) {
            await interaction.editReply({ embeds: [dangerEmbed("Incomplete Coordinates", "Provide all 3 of `x`, `y`, and `z`, or leave all 3 blank to capture your own live in-game position instead.")] });
            return;
          }
          coords = { x, y, z };
        } else {
          // No coordinates given - capture the admin's own live position,
          // same mechanism/UX as utils/playerPanel.js's "Set Home" button.
          const member = db.getMember(guildId, interaction.user.id);
          if (!member?.gamertag) {
            await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows which in-game character to capture, or provide `x`/`y`/`z` manually.")] });
            return;
          }
          try {
            const rcon = await getRcon(guildId);
            const pos = parsePrintPos(await rcon.send(`server.printpos "${member.gamertag}"`));
            if (!pos) {
              await interaction.editReply({ embeds: [dangerEmbed("Couldn't Locate You", "You need to be online and in-game to capture your position this way - or provide `x`/`y`/`z` manually.")] });
              return;
            }
            coords = pos;
          } catch (err) {
            await interaction.editReply({ embeds: [dangerEmbed("RCON Unreachable", `Couldn't reach the Rust server: ${err.message}. Provide \`x\`/\`y\`/\`z\` manually instead.`)] });
            return;
          }
        }

        db.upsertGuildMeta(guildId, { jail_x: coords.x, jail_y: coords.y, jail_z: coords.z, jail_set_at: Date.now() });
        await interaction.editReply({ embeds: [successEmbed("📍 Jail Location Set", `This server's jail coordinate is now \`${coords.x}, ${coords.y}, ${coords.z}\`. Use \`/mod jail\` to send someone there.`)] });
        return;
      }

      if (subcommand === "jail") {
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to use the jail system.")] });
          return;
        }

        const guildId = interaction.guildId;
        const meta = db.getGuildMeta(guildId);
        if (meta?.jail_x == null) {
          await interaction.editReply({ embeds: [dangerEmbed("No Jail Location Set", "Run `/mod jail-set-location` first.")] });
          return;
        }

        const gamertag = interaction.options.getString("gamertag", true).trim();
        const durationMinutes = interaction.options.getInteger("duration_minutes");
        const reason = interaction.options.getString("reason");

        if (db.getActiveJailSentence(guildId, gamertag)) {
          await interaction.editReply({ embeds: [dangerEmbed("Already Jailed", `**${gamertag}** already has an active jail sentence - use \`/mod jail-release\` first if you want to replace it.`)] });
          return;
        }

        let rcon;
        try {
          rcon = await getRcon(guildId);
        } catch (err) {
          await interaction.editReply({ embeds: [dangerEmbed("RCON Unreachable", `Couldn't reach the Rust server: ${err.message}`)] });
          return;
        }

        // Best-effort - a player's original position (for release to
        // optionally return them to it) is a nice-to-have, not a blocker if
        // they're offline or can't be located right now.
        let original = null;
        try {
          original = parsePrintPos(await rcon.send(`server.printpos "${gamertag}"`));
        } catch {
          // couldn't locate - fine, sentence just won't have an original position to return to
        }

        await rcon.send(`global.teleportpos (${meta.jail_x},${meta.jail_y},${meta.jail_z}) "${gamertag}"`);

        db.createJailSentence(guildId, {
          gamertag,
          jailX: meta.jail_x,
          jailY: meta.jail_y,
          jailZ: meta.jail_z,
          originalX: original?.x,
          originalY: original?.y,
          originalZ: original?.z,
          durationMs: durationMinutes ? durationMinutes * 60 * 1000 : null,
          jailedBy: interaction.user.id,
        });

        const durationText = durationMinutes ? `**${durationMinutes}** minute(s)` : "**indefinite** (until manually released)";
        const embed = successEmbed(
          "🔒 Player Jailed",
          `**${gamertag}** has been teleported to the jail coordinate.\n**Duration:** ${durationText}${reason ? `\n**Reason:** ${reason}` : ""}\n**Jailed by:** <@${interaction.user.id}>`
        );
        await interaction.editReply({ embeds: [embed] });
        await postToLogs(interaction, embed).catch((err) => console.error("[KOBA Bot] /mod jail log post failed:", err));
        return;
      }

      if (subcommand === "jail-release") {
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to use the jail system.")] });
          return;
        }

        const guildId = interaction.guildId;
        const gamertag = interaction.options.getString("gamertag", true).trim();
        const sentence = db.getActiveJailSentence(guildId, gamertag);
        if (!sentence) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Jailed", `**${gamertag}** doesn't have an active jail sentence.`)] });
          return;
        }

        db.releaseJailSentence(sentence.id, interaction.user.id);

        if (sentence.original_x != null) {
          try {
            const rcon = await getRcon(guildId);
            await rcon.send(`global.teleportpos (${sentence.original_x},${sentence.original_y},${sentence.original_z}) "${gamertag}"`);
          } catch (err) {
            console.warn(`[KOBA Bot] /mod jail-release teleport-back failed for ${gamertag} (guild=${guildId}):`, err.message);
          }
        }

        const embed = successEmbed(
          "🔓 Player Released",
          `**${gamertag}** has been released from jail${sentence.original_x != null ? " and returned to their original position" : ""}.\n**Released by:** <@${interaction.user.id}>`
        );
        await interaction.editReply({ embeds: [embed] });
        await postToLogs(interaction, embed).catch((err) => console.error("[KOBA Bot] /mod jail-release log post failed:", err));
        return;
      }

      if (subcommand === "jail-status") {
        if (!hasAdminClearance(interaction)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need KOBA Bot Admin clearance to use the jail system.")] });
          return;
        }

        const active = db.listActiveJailSentences(interaction.guildId);
        if (!active.length) {
          await interaction.editReply({ embeds: [infoEmbed("No Active Sentences", "Nobody is currently jailed in this server.")] });
          return;
        }
        const lines = active.map((s) => {
          const ends = s.duration_ms ? `<t:${Math.floor((s.started_at + s.duration_ms) / 1000)}:R>` : "indefinite";
          return `**${s.gamertag}** - jailed <t:${Math.floor(s.started_at / 1000)}:R> by <@${s.jailed_by}>, releases ${ends}`;
        });
        await interaction.editReply({ embeds: [infoEmbed("🔒 Active Jail Sentences", lines.join("\n"))] });
        return;
      }
    } catch (error) {
      console.error("Error executing moderation tools:", error);
      await interaction.editReply({ content: "❌ Failed to process the requested account safety adjustment." });
    }
  },
};

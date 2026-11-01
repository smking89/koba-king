"use strict";

/**
 * Consolidated 2026-09-08 (command cleanup pass) - was two separate
 * commands, /server-backup (export) and /server-restore (import) - merged
 * under one command with backup/restore subcommands since they only ever
 * make sense as a pair. Logic per subcommand is byte-for-byte what each
 * standalone command did.
 */

const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { buildFullBackup, restoreFullBackup } = require("../utils/fullBackup");
const { provisionGuild, repairManagedPanels } = require("../utils/provisioning");
const { deployTicketPanel } = require("../utils/tickets");
const { runReferralLeaderboardImageTick } = require("../utils/referralLeaderboard");
const { runCategoryLeaderboardImageTick, runStandingsLeaderboardImageTick } = require("../utils/categoryLeaderboards");
const { wipeGuild } = require("../utils/serverWipe");
const { successEmbed, infoEmbed, dangerEmbed, warningEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("server-backup")
    .setDescription("[Restricted] Export or restore this server's roles/channels/categories plus every BoomBot setting")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("backup").setDescription("Export roles/channels/categories plus every BoomBot setting as a restorable JSON file"))
    .addSubcommand((sub) =>
      sub
        .setName("restore")
        .setDescription("Restore a backup file - rebuilds this server's structure and BoomBot config")
        .addAttachmentOption((opt) => opt.setName("file").setDescription("The .json file from /server-backup backup").setRequired(true))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const sub = interaction.options.getSubcommand();

    if (sub === "backup") {
      const backup = buildFullBackup(interaction.guild);
      const json = JSON.stringify(backup, null, 2);
      const file = new AttachmentBuilder(Buffer.from(json, "utf8"), { name: `BoomBot_Backup_${interaction.guildId}_${Date.now()}.json` });

      const channelCount = backup.structure.categories.reduce((n, c) => n + c.channels.length, 0) + backup.structure.uncategorizedChannels.length;

      await interaction.editReply({
        content: `Full backup: **${backup.structure.roles.length}** role(s), **${backup.structure.categories.length}** categor${backup.structure.categories.length === 1 ? "y" : "ies"}, **${channelCount}** channel(s), **${backup.guildServers.length}** linked map(s), plus kits, currencies, and every game's settings/rewards. This does **not** include player wallets, kill/claim history, or active game runs - a restore starts everyone fresh, same as a new server. Use \`/server-backup restore\` to bring this back (here, or on a different server you own).`,
        files: [file],
      });
      return;
    }

    // sub === "restore"
    const attachment = interaction.options.getAttachment("file", true);
    if (!attachment.name.endsWith(".json")) {
      await interaction.editReply({ embeds: [dangerEmbed("Wrong File Type", "Upload the `.json` file `/server-backup backup` gave you.")] });
      return;
    }

    let backup;
    try {
      const res = await fetch(attachment.url);
      backup = await res.json();
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Couldn't Read File", `That file isn't valid JSON: ${err.message}`)] });
      return;
    }

    if (!backup || typeof backup !== "object" || !backup.structure || !backup.configTables) {
      await interaction.editReply({ embeds: [dangerEmbed("Not A BoomBot Backup", "That file doesn't look like a `/server-backup backup` export.")] });
      return;
    }

    // Same two-step destructive confirmation as /setup-template - a restore
    // deletes everything currently in the server before rebuilding, same
    // temp-reward-role exception (a player mid-reward shouldn't lose it
    // just because an admin restored an old backup).
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("boombot:server_restore_step1").setLabel("I understand - continue").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("boombot:server_restore_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );
    const reply = await interaction.editReply({
      embeds: [
        warningEmbed(
          "This Deletes Everything First",
          `Restoring **${backup.guildName || "this backup"}** (exported ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : "unknown date"}) first deletes **every channel, category, and role** in this server (except @everyone, Discord-managed roles, and any temporary reward role a player is currently holding), then rebuilds from the backup. Player wallets, kill/claim history, and active game runs are NOT touched by this - only structure and configuration. This cannot be undone.`
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
    if (step1.customId === "boombot:server_restore_cancel") {
      await step1.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
      return;
    }

    const finalRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("boombot:server_restore_confirm").setLabel("Yes, delete and restore").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("boombot:server_restore_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );
    await step1.update({
      embeds: [dangerEmbed("Final Confirmation", "Last chance - click below to permanently delete the current server structure and restore the backup, or Cancel to back out.")],
      components: [finalRow],
    });

    let step2;
    try {
      step2 = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
    } catch {
      await interaction.editReply({ embeds: [dangerEmbed("Timed Out", "No response in time - nothing was changed.")], components: [] });
      return;
    }
    if (step2.customId === "boombot:server_restore_cancel") {
      await step2.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
      return;
    }

    await step2.update({ embeds: [warningEmbed("Wiping...", "Deleting the current server structure - this may take a moment for larger servers.")], components: [] });

    const skipRoleIds = new Set(db.listActiveTempRoleIds(interaction.guild.id));
    await wipeGuild(interaction.guild, { skipRoleIds, reason: "BoomBot /server-backup restore" });

    await interaction.editReply({ embeds: [infoEmbed("Restoring...", "Rebuilding roles, channels, and BoomBot configuration from the backup.")], components: [] }).catch(() => {});

    const { structureSummary, configSummary } = await restoreFullBackup(interaction.guild, backup);

    // Same tail as /setup-template - re-attach BoomBot's own required panels
    // (tickets, kit-panel, games-panel, etc.) by name, then refresh every
    // leaderboard image so nothing looks stale post-restore.
    const { supportChannel } = await provisionGuild(interaction.guild);
    await deployTicketPanel(supportChannel);
    await repairManagedPanels(interaction.guild);
    await runReferralLeaderboardImageTick(interaction.client).catch((err) => console.error("[BoomBot] server-backup restore leaderboard refresh failed:", err));
    await runCategoryLeaderboardImageTick(interaction.client).catch((err) => console.error("[BoomBot] server-backup restore category leaderboard refresh failed:", err));
    await runStandingsLeaderboardImageTick(interaction.client).catch((err) => console.error("[BoomBot] server-backup restore standings leaderboard refresh failed:", err));

    const skippedNote = structureSummary.skipped.overwrites + structureSummary.skipped.roles + structureSummary.skipped.channels + configSummary.skipped;

    await interaction
      .editReply({
        embeds: [
          successEmbed(
            "Backup Restored",
            `**${structureSummary.rolesCreated}** role(s), **${structureSummary.categoriesCreated}** categor${structureSummary.categoriesCreated === 1 ? "y" : "ies"}, and **${structureSummary.channelsCreated}** channel(s) rebuilt. **${configSummary.restored}** config row(s) restored.${skippedNote ? `\n\n${skippedNote} item(s) couldn't be fully restored (usually a channel/role reference or currency the backup didn't include) - worth a quick check of your settings.` : ""}`
          ),
        ],
        components: [],
      })
      .catch(() => {});
  },
};

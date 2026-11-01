"use strict";

/**
 * Full config backup/restore (/server-backup, /server-restore) - combines
 * utils/serverStructure.js's roles/categories/channels snapshot with every
 * KOBA Bot configuration table (kits, currencies, all 4 games' settings/
 * rewards, autokit mappings, gift/leaderboard reward configs, referral
 * config, shop catalog, message styles), genuine guild_config entries
 * (bomb recipes, cooldowns, playtime coin settings, etc.), and every
 * linked Multi-Server Cluster map (added 2026-09-10 - server names + RCON
 * credentials, see db.dumpGuildServers).
 *
 * Deliberately CONFIG ONLY - no player wallets/savings/kit-claim history/
 * active game runs/referral codes&claims/tickets/sales. A restore starts
 * everyone at zero, same as a brand new server would - see /server-backup's
 * own command description for the explicit scope decision. Snapshotted by
 * VALUE, not by Discord id, so this survives any amount of renaming/
 * reordering/adding channels between backup and restore - only channel/role
 * NAMES matter, never their live ids (see serverStructure.js).
 */

const db = require("../database/db");
const { snapshotStructure, restoreStructure } = require("./serverStructure");

// FIXED (2026-09-10): bumped from 1 - added guildServers (Multi-Server
// Cluster map names + RCON credentials, previously silently dropped by
// every backup taken before this). Old version-1 backups still restore
// fine (guildServers is read as `|| []`, an empty list is a no-op), just
// without their cluster map links - nothing about the bump enforces or
// blocks anything, it's informational only.
const BACKUP_VERSION = 2;

function buildFullBackup(guild) {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    templateKey: db.getGuildMeta(guild.id)?.template_key || null,
    structure: snapshotStructure(guild),
    configTables: db.dumpConfigTables(guild.id),
    guildConfig: db.dumpGuildConfig(guild.id),
    guildServers: db.dumpGuildServers(guild.id),
  };
}

/**
 * Restores a buildFullBackup() snapshot into `guild`. Does NOT wipe the
 * guild first - callers that want a truly clean rebuild (recommended,
 * same as /setup-template) are responsible for that, so this function stays
 * usable for a "restore onto whatever's already here" case too if ever
 * needed. Returns a combined summary for the confirmation embed.
 */
async function restoreFullBackup(guild, backup) {
  const structureSummary = await restoreStructure(guild, backup.structure || {});
  const configSummary = db.restoreConfigTables(guild.id, backup.configTables || {});
  db.restoreGuildConfig(guild.id, backup.guildConfig || []);
  db.restoreGuildServers(guild.id, backup.guildServers || []);

  if (backup.templateKey) db.upsertGuildMeta(guild.id, { template_key: backup.templateKey });

  return { structureSummary, configSummary };
}

module.exports = { BACKUP_VERSION, buildFullBackup, restoreFullBackup };

"use strict";

/**
 * Plain role/category/channel structure snapshot + restore - shared by
 * /server-backup+/server-restore (full config backup) and /save-template+
 * /my-templates (owner-saved reusable layouts, see database/schema.sql's
 * custom_templates header). Deliberately separate from config/templates.js's
 * TEMPLATES schema and utils/provisioning.js's provisionTemplate() - those
 * are KOBA Bot's own rich, managed-panel-injecting layouts (fixed `key`s tied
 * to specific bot features like the dashboard panel).
 * A structure snapshot here is just "whatever roles/categories/channels
 * (with permission overwrites) actually exist" - no special content
 * injection, safe to build from an arbitrary hand-built server.
 */

const { ChannelType, PermissionsBitField } = require("discord.js");

const CHANNEL_TYPE_TO_DISCORD = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};
const DISCORD_TO_CHANNEL_TYPE = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildVoice]: "voice",
  [ChannelType.GuildCategory]: "category",
  [ChannelType.GuildAnnouncement]: "announcement",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildStageVoice]: "stage",
};

/**
 * Snapshots one channel's permission overwrites, including the target
 * role's NAME (not just its id) - required for restore, since a recreated
 * role gets a brand new id and the only stable link back to it is its name.
 * Member-targeted overwrites (targetType "member") can't be name-resolved
 * the same way (a specific person, not a reusable role) - kept in the
 * snapshot for reference but silently skipped on restore.
 */
function snapshotOverwrites(channel) {
  return channel.permissionOverwrites.cache.map((ow) => {
    const isRole = ow.type === 0;
    const role = isRole ? channel.guild.roles.cache.get(ow.id) : null;
    return {
      targetType: isRole ? "role" : "member",
      targetName: isRole ? role?.name ?? null : null,
      targetIsEveryone: isRole && ow.id === channel.guild.id,
      allow: ow.allow.toArray(),
      deny: ow.deny.toArray(),
    };
  });
}

/** Builds a plain { roles, categories, uncategorizedChannels } snapshot of a guild's current structure. */
function snapshotStructure(guild) {
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed) // skip @everyone and Discord-managed integration roles - nothing to restore there anyway
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      name: r.name,
      color: r.hexColor,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.toArray(),
      position: r.position,
    }));

  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map((category) => ({
      name: category.name,
      overwrites: snapshotOverwrites(category),
      channels: guild.channels.cache
        .filter((c) => c.parentId === category.id)
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          name: c.name,
          type: DISCORD_TO_CHANNEL_TYPE[c.type] || "text",
          topic: c.topic || null,
          overwrites: snapshotOverwrites(c),
        })),
    }));

  const uncategorizedChannels = guild.channels.cache
    .filter((c) => c.type !== ChannelType.GuildCategory && !c.parentId)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      name: c.name,
      type: DISCORD_TO_CHANNEL_TYPE[c.type] || "text",
      topic: c.topic || null,
      overwrites: snapshotOverwrites(c),
    }));

  return { roles, categories, uncategorizedChannels };
}

/**
 * Resolves a snapshot's overwrites entries into real Discord.js
 * PermissionOverwriteOptions, using a name -> newly-created-role map built
 * earlier in the same restore run. Entries that can't be resolved (a member
 * overwrite, or a role whose name isn't in this snapshot's role list) are
 * dropped - counted in `skipped` so the restore summary can mention it.
 */
function resolveOverwrites(entries, roleByName, everyoneId, skipped) {
  const resolved = [];
  for (const ow of entries || []) {
    let id;
    if (ow.targetIsEveryone) id = everyoneId;
    else if (ow.targetType === "role" && ow.targetName) id = roleByName.get(ow.targetName)?.id;
    if (!id) {
      skipped.overwrites++;
      continue;
    }
    resolved.push({ id, allow: ow.allow || [], deny: ow.deny || [] });
  }
  return resolved;
}

/**
 * Recreates roles/categories/channels from a structure snapshot into
 * `guild`. Purely additive/idempotent by name (same find-or-create
 * convention as utils/provisioning.js) - callers that need a truly clean
 * slate (e.g. /server-restore, /my-templates apply) are responsible for
 * wiping first, same as /setup-template already does.
 */
async function restoreStructure(guild, snapshot) {
  const summary = { rolesCreated: 0, categoriesCreated: 0, channelsCreated: 0, skipped: { overwrites: 0, roles: 0, channels: 0 } };
  const everyoneId = guild.roles.everyone.id;
  const roleByName = new Map();

  for (const roleDef of snapshot.roles || []) {
    try {
      let role = guild.roles.cache.find((r) => r.name === roleDef.name && !r.managed);
      if (!role) {
        role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color,
          hoist: Boolean(roleDef.hoist),
          mentionable: Boolean(roleDef.mentionable),
          permissions: new PermissionsBitField(roleDef.permissions || []),
          reason: "KOBA Bot template/backup restore",
        });
        summary.rolesCreated++;
      }
      roleByName.set(roleDef.name, role);
    } catch (err) {
      console.error(`[KOBA Bot] Structure restore: role "${roleDef.name}" failed:`, err.message);
      summary.skipped.roles++;
    }
  }

  for (const categoryDef of snapshot.categories || []) {
    try {
      let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === categoryDef.name);
      if (!category) {
        category = await guild.channels.create({
          name: categoryDef.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolveOverwrites(categoryDef.overwrites, roleByName, everyoneId, summary.skipped),
          reason: "KOBA Bot template/backup restore",
        });
        summary.categoriesCreated++;
      }

      for (const channelDef of categoryDef.channels || []) {
        try {
          let channel = guild.channels.cache.find(
            (c) => c.type === CHANNEL_TYPE_TO_DISCORD[channelDef.type] && c.name === channelDef.name && c.parentId === category.id
          );
          if (!channel) {
            await guild.channels.create({
              name: channelDef.name,
              type: CHANNEL_TYPE_TO_DISCORD[channelDef.type] ?? ChannelType.GuildText,
              parent: category.id,
              topic: channelDef.topic || undefined,
              permissionOverwrites: resolveOverwrites(channelDef.overwrites, roleByName, everyoneId, summary.skipped),
              reason: "KOBA Bot template/backup restore",
            });
            summary.channelsCreated++;
          }
        } catch (err) {
          console.error(`[KOBA Bot] Structure restore: channel "${channelDef.name}" failed:`, err.message);
          summary.skipped.channels++;
        }
      }
    } catch (err) {
      console.error(`[KOBA Bot] Structure restore: category "${categoryDef.name}" failed:`, err.message);
      summary.skipped.channels += (categoryDef.channels || []).length;
    }
  }

  for (const channelDef of snapshot.uncategorizedChannels || []) {
    try {
      let channel = guild.channels.cache.find(
        (c) => c.type === CHANNEL_TYPE_TO_DISCORD[channelDef.type] && c.name === channelDef.name && !c.parentId
      );
      if (!channel) {
        await guild.channels.create({
          name: channelDef.name,
          type: CHANNEL_TYPE_TO_DISCORD[channelDef.type] ?? ChannelType.GuildText,
          topic: channelDef.topic || undefined,
          permissionOverwrites: resolveOverwrites(channelDef.overwrites, roleByName, everyoneId, summary.skipped),
          reason: "KOBA Bot template/backup restore",
        });
        summary.channelsCreated++;
      }
    } catch (err) {
      console.error(`[KOBA Bot] Structure restore: channel "${channelDef.name}" failed:`, err.message);
      summary.skipped.channels++;
    }
  }

  return summary;
}

module.exports = { snapshotStructure, restoreStructure };

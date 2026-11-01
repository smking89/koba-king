"use strict";

/**
 * Shared "delete everything" logic behind both /nuke and /setup-template's
 * pre-switch wipe (a fresh template can't be laid out cleanly on top of a
 * differently-structured old one, so switching templates wipes first) -
 * extracted here so the two commands can't silently drift out of sync on
 * deletion order/skip rules.
 *
 * `skipRoleIds` lets a caller preserve specific roles beyond the two that
 * are always safe from deletion (@everyone, and anything Discord itself
 * manages like bot integration/boost roles - the API refuses those anyway).
 * /setup-template passes every role with a still-active temp_role_grants
 * row so a player mid-reward doesn't lose it just because an admin reorganized
 * the server.
 */

const { ChannelType } = require("discord.js");

async function wipeGuild(guild, { skipRoleIds = new Set(), reason = "KOBA Bot server wipe" } = {}) {
  let channelsDeleted = 0;
  let rolesDeleted = 0;
  const errors = [];

  // Non-category channels first, then categories - a channel whose parent
  // category is still in the cache can otherwise error on some setups.
  const channels = [...guild.channels.cache.values()];
  for (const channel of channels.filter((c) => c.type !== ChannelType.GuildCategory)) {
    try {
      await channel.delete(reason);
      // FIXED (2026-09-16): discord.js only removes a deleted channel from
      // guild.channels.cache once the CHANNEL_DELETE gateway event round-
      // trips back - awaiting delete() itself just confirms the REST call
      // succeeded, not that the cache is updated yet. A caller that
      // immediately re-provisions right after wipeGuild() (exactly what
      // /template setup does) was checking that same stale cache via
      // ensureChannel/ensureCategory's by-name lookup, "finding" the
      // channel that was just deleted, and skipping recreation entirely -
      // this is why a template apply deleted everything but rebuilt
      // nothing. Deleting from the cache ourselves, right here, closes
      // that race instead of relying on the gateway event's timing.
      guild.channels.cache.delete(channel.id);
      channelsDeleted++;
    } catch (err) {
      errors.push(`#${channel.name}: ${err.message}`);
    }
  }
  for (const channel of channels.filter((c) => c.type === ChannelType.GuildCategory)) {
    try {
      await channel.delete(reason);
      guild.channels.cache.delete(channel.id);
      channelsDeleted++;
    } catch (err) {
      errors.push(`${channel.name}: ${err.message}`);
    }
  }

  const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed && !skipRoleIds.has(r.id));
  for (const role of roles) {
    try {
      await role.delete(reason);
      // Same cache race as channels above - see that comment.
      guild.roles.cache.delete(role.id);
      rolesDeleted++;
    } catch (err) {
      errors.push(`@${role.name}: ${err.message}`);
    }
  }

  return { channelsDeleted, rolesDeleted, errors };
}

module.exports = { wipeGuild };

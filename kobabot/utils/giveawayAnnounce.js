"use strict";

/**
 * Posts the real Discord announcement for a giveaway whose winner was
 * already drawn and recorded by admin/giveawaysAdmin.js's "Draw Winner"
 * button (a separate Node process - admin/server.js - that shares this
 * same SQLite file but has no live discord.js Client of its own). Polled
 * from utils/backgroundLoops.js, same bridge pattern vault_heist/
 * bradley_ambush/cargo_ship_heist already use for their own spawn ticks.
 */

const db = require("../database/db");
const { successEmbed } = require("./embeds");

async function runGiveawayAnnounceTick(client) {
  const pending = db.listGiveawaysNeedingAnnouncement();
  for (const giveaway of pending) {
    try {
      await announceOne(client, giveaway);
    } catch (err) {
      console.error(`[KOBA Bot] Giveaway announcement failed for "${giveaway.title}" (id=${giveaway.id}):`, err.message);
      // Deliberately NOT marked announced on failure - next tick retries
      // (e.g. the bot wasn't in that guild yet, or the channel was deleted
      // since being configured). An admin can see the unposted state on
      // the giveaway's edit page either way.
    }
  }
}

async function announceOne(client, giveaway) {
  const winner = db.getGiveawayWinnerEntry(giveaway.id);
  if (!winner) return; // shouldn't happen (query already filters on winner_entry_id NOT NULL), but don't crash if it does

  const guild = client.guilds.cache.get(giveaway.announce_guild_id) || (await client.guilds.fetch(giveaway.announce_guild_id).catch(() => null));
  if (!guild) throw new Error(`bot isn't in guild ${giveaway.announce_guild_id}`);
  const channel = await guild.channels.fetch(giveaway.announce_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased?.()) throw new Error(`channel ${giveaway.announce_channel_id} not found or not text-based`);

  const entryCount = db.countGiveawayEntries(giveaway.id);
  const embed = successEmbed(
    `🏆 Winner: ${giveaway.title}`,
    `**${winner.gamertag}** just won **${giveaway.prize_title || giveaway.title}**` +
      (giveaway.prize_value ? ` (${giveaway.prize_value})` : "") +
      `!\n\nDrawn at random from **${entryCount}** real entr${entryCount === 1 ? "y" : "ies"}, weighted by completed bonus tasks. Thanks to everyone who entered - more giveaways are coming.`
  ).setColor(0xFFD700);

  await channel.send({ embeds: [embed] });
  db.markGiveawayAnnounced(giveaway.id);
  console.log(`[KOBA Bot] Announced giveaway winner "${winner.gamertag}" for "${giveaway.title}" in #${channel.name}.`);
}

module.exports = { runGiveawayAnnounceTick };

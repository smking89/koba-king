"use strict";

/**
 * Admin Feed catch-all for raw item spawns - unlike kit deliveries (which
 * are already logged at their exact source in kitPanel.js/referralRewards.js),
 * a single item given via the server's own native admin console/GUI, or any
 * RCON tool other than this bot, never passes through our code at all. This
 * listens at the WebRCON broadcast level instead, so it catches an item
 * spawn regardless of what actually issued the command.
 *
 * Confirmed against a real captured broadcast (2026-09-01):
 *   "[ServerVar] giving Zero0None0 1 x Hazmat Suit"
 * Deliberately does NOT match the kit-give line format
 * ("[ServerVar] SERVER giving <player> kit <name>") - that's already logged
 * at its source, and double-logging would be worse than missing it here.
 */

const { onGuildBroadcast } = require("../rcon/manager");
const { logAdminAction } = require("./adminFeed");

let discordClient = null;
function setClient(client) {
  discordClient = client;
}

const ITEM_GIVE_PATTERN = /\[ServerVar\]\s+giving\s+(\S+)\s+(\d+)\s+x\s+(.+)/i;

async function handleBroadcast(guildId, rawMessage) {
  const text = typeof rawMessage === "string" ? rawMessage : rawMessage?.Message || rawMessage?.message;
  if (!text) return;

  const match = text.match(ITEM_GIVE_PATTERN);
  if (!match) return;

  const [, gamertag, qty, itemName] = match;
  if (!discordClient) return;
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  await logAdminAction(guild, {
    title: "Item Spawned (server console)",
    description: `**Item:** ${itemName.trim()} ×${qty}\n**To:** ${gamertag}\n**Source:** not through KOBA Bot - caught from server broadcast`,
  });
}

onGuildBroadcast(handleBroadcast);

module.exports = { setClient };

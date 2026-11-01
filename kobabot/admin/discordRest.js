"use strict";

/**
 * Minimal Discord REST client for the admin web process. This process is
 * separate from the running bot (index.js) - it has no gateway connection
 * and no in-memory channel cache - so ticket replies/history have to go
 * through plain REST calls using the same bot token, not discord.js.
 */
const API_BASE = "https://discord.com/api/v10";

function isConfigured() {
  return !!process.env.DISCORD_TOKEN;
}

async function discordFetch(path, options = {}) {
  if (!isConfigured()) throw new Error("DISCORD_TOKEN is not set");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Oldest-first message history for a channel, for the ticket detail view. */
async function listChannelMessages(channelId, limit = 50) {
  const messages = await discordFetch(`/channels/${channelId}/messages?limit=${limit}`);
  return messages.reverse();
}

/** Posts a reply into a ticket channel, clearly marked as coming from the web dashboard. */
async function sendChannelMessage(channelId, content) {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

async function deleteChannel(channelId) {
  return discordFetch(`/channels/${channelId}`, { method: "DELETE" });
}

module.exports = { isConfigured, listChannelMessages, sendChannelMessage, deleteChannel };

"use strict";

const db = require("../database/db");
const { flagshipGuildId } = require("./premium");

const SETTING_KEY = "discord_invite_url";
// Seed fallback - the invite the user originally gave us. Only ever used
// until the first successful auto-refresh below replaces it in
// site_settings with a bot-created permanent one; kept here so the site
// never shows a broken/missing link even before that first tick runs.
const FALLBACK_INVITE_URL = "https://discord.gg/hAqvqHKD5";

/**
 * Keeps the public site's "Join our Discord" link pointed at a real,
 * currently-valid invite - Discord invite links can and do expire (or get
 * revoked, or point at a since-deleted channel), so a hardcoded link in
 * site copy silently rots. Instead this creates a genuinely permanent
 * invite (max_age: 0 = never expires, max_uses: 0 = unlimited) on the
 * official server the first time it runs, stores it in site_settings, and
 * re-validates it periodically (see utils/backgroundLoops.js) - if it's
 * ever gone invalid for any reason, a fresh one is minted automatically
 * with no manual intervention needed.
 */
async function refreshDiscordInviteTick(client) {
  const officialGuildId = flagshipGuildId();
  if (!officialGuildId) return; // nothing to refresh against without a known official server

  const guild = client.guilds.cache.get(officialGuildId) || (await client.guilds.fetch(officialGuildId).catch(() => null));
  if (!guild) return;

  const currentUrl = db.getSiteSetting(SETTING_KEY, null);
  const currentCode = currentUrl ? currentUrl.split("/").pop() : null;

  if (currentCode) {
    try {
      const invites = await guild.invites.fetch();
      const stillValid = invites.some((inv) => inv.code === currentCode);
      if (stillValid) return; // nothing to do - existing invite is still good
    } catch (err) {
      console.warn("[KOBA Bot] Couldn't verify existing Discord invite, will mint a new one:", err.message);
    }
  }

  // Need a real channel we can actually create an invite from - prefer the
  // guild's configured system channel, fall back to the first text channel
  // the bot has CreateInstantInvite permission in.
  const me = guild.members.me;
  let channel = guild.systemChannel;
  if (!channel || !channel.permissionsFor(me)?.has("CreateInstantInvite")) {
    channel = guild.channels.cache.find((c) => c.isTextBased?.() && c.permissionsFor(me)?.has("CreateInstantInvite"));
  }
  if (!channel) {
    console.warn("[KOBA Bot] Couldn't refresh Discord invite - no channel with CreateInstantInvite permission found on the official server.");
    return;
  }

  try {
    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: "Auto-refreshed public site invite link" });
    db.setSiteSetting(SETTING_KEY, `https://discord.gg/${invite.code}`);
    console.log(`[KOBA Bot] Refreshed public site Discord invite: https://discord.gg/${invite.code}`);
  } catch (err) {
    console.error("[KOBA Bot] Failed to create a new Discord invite:", err.message);
  }
}

module.exports = { refreshDiscordInviteTick, FALLBACK_INVITE_URL, SETTING_KEY };

"use strict";

/**
 * Dynamic Adaptive Kit Engine (added 2026-09-19, per the user's own detailed
 * blueprint spec). Watches the WebRCON broadcast stream for a player using
 * an admin-bound quick-chat wheel option (a real d11_quick_chat_* id,
 * confirmed directly from the user - see config/quickChatTriggers.js) and
 * auto-delivers the bound kit via the same `kit givetoplayer` RCON command
 * every other kit-delivery path in this codebase already uses
 * (utils/playerPanel.js, utils/rewardDelivery.js, utils/shopDelivery.js) -
 * no "delivery confirmation" log line is waited for, since none of those
 * existing paths wait for one either (they just fire the command and treat
 * it as done).
 *
 * UNCONFIRMED PATTERN WARNING: unlike rcon/combatParser.js's kill/join
 * regexes (each validated against a real captured console log before being
 * written), CHAT_LINE_PATTERN below has NOT been confirmed against a real
 * WebRCON broadcast sample - no earlier feature in this codebase has ever
 * needed to parse a raw player chat/quick-chat line, so there is no prior
 * confirmed capture to reuse. It's a best-effort guess covering the two
 * plausible ways a quick-chat use could actually appear in the broadcast
 * feed: the raw id verbatim (matchesTrigger checks this first), or its
 * localized plain-English phrase (checked second) - whichever the real
 * server turns out to send. Needs a live test; if triggers aren't firing,
 * capture a real quick-chat broadcast line and adjust CHAT_LINE_PATTERN
 * and/or matchesTrigger to match it.
 */
const db = require("../database/db");
const { onGuildBroadcast, getRcon } = require("../rcon/manager");
const { parsePrintPos } = require("../rcon/parsers");
const { colorize, renderTemplate, isValidHex } = require("./messageStyle");
const { QUICK_CHAT_TRIGGERS } = require("../config/quickChatTriggers");

let discordClient = null;
/** Called once from events/ready.js, same convention as utils/spawnFeed.js's setClient - needed here to fetch a guild member's live roles for the Role Requirement check, from a broadcast handler with no interaction to hang off. */
function setClient(client) {
  discordClient = client;
}

// UNCONFIRMED - see file header. Covers both a "[Chat]" line and a generic
// "Name: text" line, since it's unknown which (if either) format a
// quick-chat wheel selection actually arrives as.
const CHAT_LINE_PATTERN = /^(?:\[Chat\]\s*)?"?([^":]+?)"?\s*:\s*(.+)$/;

const OUT_OF_AMMO_ID = "d11_quick_chat_out_of_ammo";

/**
 * Combo mode (added 2026-09-20, per the user's own KaosBot reference image):
 * kit tiers 23-44 require "Out of Ammo" sent immediately before the real
 * trigger, not the trigger alone. Tracked in-memory (not the DB) since this
 * is a short-lived, few-second signal, not something that needs to survive
 * a restart - a bot restart mid-combo just means the player re-sends both
 * quickchats, no real loss.
 */
const COMBO_WINDOW_MS = 8000;
const lastOutOfAmmoAt = new Map(); // `${guildId}:${gamertag}` (lowercased) -> timestamp

function outOfAmmoKey(guildId, gamertag) {
  return `${guildId}:${gamertag.toLowerCase()}`;
}

function isOutOfAmmoTrigger(chatText) {
  const text = chatText.trim().toLowerCase();
  return text === OUT_OF_AMMO_ID || text === QUICK_CHAT_TRIGGERS[OUT_OF_AMMO_ID].toLowerCase();
}

function matchesTrigger(mapping, chatText) {
  const text = chatText.trim().toLowerCase();
  const id = String(mapping.quickchat_id || "").trim().toLowerCase();
  if (text === id) return true;
  const label = QUICK_CHAT_TRIGGERS[mapping.quickchat_id];
  return !!label && text === label.trim().toLowerCase();
}

/** Server-scope filter - server_scope is a JSON array of guild_servers.server_name values; empty/NULL = every linked server (including the guild's single default connection, serverName undefined). */
function scopeAllows(mapping, serverName) {
  if (!mapping.server_scope) return true;
  let scope;
  try {
    scope = JSON.parse(mapping.server_scope);
  } catch {
    return true; // malformed scope - fail open rather than silently blocking every delivery
  }
  if (!Array.isArray(scope) || !scope.length) return true;
  return scope.includes(serverName || null) || (serverName === undefined && scope.includes("__default__"));
}

/** True if the player (resolved via their linked Discord account) has the required role - no requirement set always passes. */
async function meetsRoleRequirement(guildId, mapping, gamertag) {
  if (!mapping.required_role_id) return true;
  const member = db.getMemberByGamertag(guildId, gamertag);
  if (!member?.discord_id) return false; // unlinked player can't hold a role requirement it doesn't have
  if (!discordClient) return false; // setClient() hasn't run yet (very early boot) - fail closed on a role-gated kit rather than deliver unchecked
  try {
    const guild = discordClient.guilds.cache.get(guildId) || (await discordClient.guilds.fetch(guildId).catch(() => null));
    if (!guild) return false;
    const discordMember = await guild.members.fetch(member.discord_id).catch(() => null);
    return discordMember ? discordMember.roles.cache.has(mapping.required_role_id) : false;
  } catch (err) {
    console.error("[KOBA Bot] Kit Engine role check failed:", err.message);
    return false;
  }
}

function buildMessage(mapping, template, vars) {
  const color = isValidHex(mapping.color_hex) ? mapping.color_hex : "#00FF00";
  return colorize(renderTemplate(template, vars), color);
}

async function deliverKit(guildId, mapping, gamertag, serverName) {
  const vars = { player: gamertag, kit: mapping.display_name || mapping.kit_name };
  try {
    const rcon = await getRcon(guildId, serverName);
    await rcon.send(`kit givetoplayer "${mapping.kit_name}" "${gamertag}"`);
    db.setAutokitCooldown(guildId, mapping.id, gamertag);
    // Also records into kit_claims (keyed by internal_kit_name, not this
    // binding's id) - the SAME table utils/playerPanel.js's Discord "Claim A
    // Kit" drawer checks/writes, so a player can't claim the same kit
    // in-game via quickchat and then immediately again via Discord (or vice
    // versa) to bypass the cooldown. Added 2026-09-20 per explicit user
    // report of exactly this double-claim.
    db.recordKitClaim(guildId, gamertag, mapping.kit_name, "autokit");
    if (mapping.claim_message_enabled) {
      await rcon.say(buildMessage(mapping, "{kit} delivered to {player}!", vars)).catch(() => {});
    }
  } catch (err) {
    console.error(`[KOBA Bot] Kit Engine delivery failed (guild=${guildId}, kit=${mapping.kit_name}, player=${gamertag}):`, err.message);
  }
}

/**
 * Vehicle binding delivery (2026-09-19) - spawns at the player's own LIVE
 * position (server.printpos, the same confirmed mechanism
 * utils/zoneEvents.js / utils/playerPanel.js's Vehicle Delivery drawer
 * already use), then hands over any configured Low Grade Fuel via the same
 * confirmed `kit add`/`kit givetoplayer`/`kit delete` throwaway-kit pattern
 * utils/shopDelivery.js uses for every shop item - into the PLAYER's
 * inventory, not the vehicle's tank directly (no confirmed RCON mechanism
 * exists in this codebase for the latter).
 */
async function deliverVehicle(guildId, mapping, gamertag, serverName) {
  const vars = { player: gamertag, kit: mapping.display_name || mapping.kit_name };
  try {
    const rcon = await getRcon(guildId, serverName);
    const pos = parsePrintPos(await rcon.send(`server.printpos "${gamertag}"`));
    if (!pos) {
      console.error(`[KOBA Bot] Kit Engine vehicle delivery failed (guild=${guildId}, player=${gamertag}): couldn't locate player position`);
      return;
    }
    // entity.spawn is in-game-console-only with no position argument (per
    // docs/RUST_CONSOLE_RCON_REFERENCE.md); entity.spawnatpos is the
    // documented RCON-capable coordinate-spawn command (2026-10-11 fix).
    await rcon.send(`entity.spawnatpos "${mapping.kit_name}" "${pos.x},${pos.y},${pos.z}"`);
    if (mapping.fuel_amount > 0) {
      const kitName = `autokit_fuel_${gamertag.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
      await rcon.send(`kit add "${kitName}" "lowgradefuel" ${mapping.fuel_amount} 1 Main`);
      await rcon.send(`kit givetoplayer "${kitName}" "${gamertag}"`);
      await rcon.send(`kit delete "${kitName}"`).catch(() => {});
    }
    db.setAutokitCooldown(guildId, mapping.id, gamertag);
    if (mapping.claim_message_enabled) {
      await rcon.say(buildMessage(mapping, "{kit} delivered to {player}!", vars)).catch(() => {});
    }
  } catch (err) {
    console.error(`[KOBA Bot] Kit Engine vehicle delivery failed (guild=${guildId}, vehicle=${mapping.kit_name}, player=${gamertag}):`, err.message);
  }
}

/**
 * Teleport binding delivery (2026-09-19) - `global.teleportpos` is the same
 * confirmed RCON command utils/bombEffects.js's Black Hole Bomb already
 * uses for a real player teleport. Home (no admin-set coordinate) reads the
 * player's own saved player_homes row instead - see utils/playerPanel.js's
 * "Set Home" button, which captures it the same server.printpos way.
 */
async function deliverTeleport(guildId, mapping, gamertag, serverName) {
  const vars = { player: gamertag, kit: mapping.display_name || "Teleport" };
  try {
    let dest;
    if (mapping.quickchat_id === "d11_quick_chat_teleport_home") {
      const member = db.getMemberByGamertag(guildId, gamertag);
      const home = member?.discord_id ? db.getPlayerHome(guildId, member.discord_id) : null;
      if (!home) {
        const rcon = await getRcon(guildId, serverName);
        await rcon.say(buildMessage(mapping, "{player}, you haven't set a Home yet - use the Player Panel's Set Home button first.", vars)).catch(() => {});
        return;
      }
      dest = home;
    } else {
      // kit_name holds the compass direction key (north.."north_west") for
      // a teleport binding - see utils/autoKitAdminPanel.js's
      // directionFromTriggerId. Destination lives in teleport_waypoints,
      // not on the binding itself, so admins can update it without
      // recreating the binding.
      dest = db.getTeleportWaypoint(guildId, mapping.kit_name);
      if (!dest) {
        console.error(`[KOBA Bot] Kit Engine teleport failed (guild=${guildId}): no waypoint set for direction "${mapping.kit_name}"`);
        return;
      }
    }

    const rcon = await getRcon(guildId, serverName);
    // Docs give only the abstract signature `(x,y,z) "player ID"` for this
    // command, matching every other coordinate-triple command's confirmed
    // parenthesized form (e.g. zones.createcustomzone) - switched from bare
    // space-separated numbers to match (2026-10-11, lower-confidence than
    // the other RCON fixes this pass - worth a live-server check).
    await rcon.send(`global.teleportpos (${dest.x},${dest.y},${dest.z}) "${gamertag}"`);
    db.setAutokitCooldown(guildId, mapping.id, gamertag);
    if (mapping.claim_message_enabled) {
      await rcon.say(buildMessage(mapping, "{player} teleported.", vars)).catch(() => {});
    }
  } catch (err) {
    console.error(`[KOBA Bot] Kit Engine teleport failed (guild=${guildId}, player=${gamertag}):`, err.message);
  }
}

function deliverBinding(guildId, mapping, gamertag, serverName) {
  if (mapping.binding_type === "vehicle") return deliverVehicle(guildId, mapping, gamertag, serverName);
  if (mapping.binding_type === "teleport") return deliverTeleport(guildId, mapping, gamertag, serverName);
  return deliverKit(guildId, mapping, gamertag, serverName);
}

/**
 * For 'kit' bindings, also checks the kit_claims record for this exact
 * internal kit name (shared with utils/playerPanel.js's Discord "Claim A
 * Kit" drawer) and returns whichever cooldown is LONGER remaining - so a
 * kit claimed a minute ago via Discord still blocks an immediate in-game
 * quickchat claim of the same kit, and vice versa. Vehicle/teleport
 * bindings have no Discord-side equivalent to cross-check, so they just
 * use their own autokit_cooldowns record.
 */
function remainingCooldownMs(guildId, mapping, gamertag) {
  const ownMs = db.getAutokitCooldownRemainingMs(guildId, mapping.id, gamertag, mapping.cooldown_minutes);
  if (mapping.binding_type !== "vehicle" && mapping.binding_type !== "teleport" && mapping.cooldown_minutes) {
    const record = db.getKitClaimRecord(guildId, gamertag, mapping.kit_name);
    if (record) {
      const sharedMs = mapping.cooldown_minutes * 60 * 1000 - (Date.now() - record.claimed_at);
      return Math.max(ownMs, sharedMs);
    }
  }
  return ownMs;
}

async function handleTriggerMatch(guildId, mapping, gamertag, serverName) {
  if (!mapping.enabled) return;
  if (!scopeAllows(mapping, serverName)) return;
  if (!(await meetsRoleRequirement(guildId, mapping, gamertag))) return;

  const remainingMs = remainingCooldownMs(guildId, mapping, gamertag);
  if (remainingMs > 0) {
    if (mapping.cooldown_notice_enabled) {
      const minutesLeft = Math.ceil(remainingMs / 60000);
      try {
        const rcon = await getRcon(guildId, serverName);
        await rcon.say(buildMessage(mapping, `{player}, {kit} is still on cooldown (${minutesLeft}m left).`, { player: gamertag, kit: mapping.display_name || mapping.kit_name })).catch(() => {});
      } catch {
        // connection issue - nothing more to do, don't deliver either
      }
    }
    return;
  }

  if (mapping.delivery_delay_seconds > 0) {
    setTimeout(() => deliverBinding(guildId, mapping, gamertag, serverName), mapping.delivery_delay_seconds * 1000);
  } else {
    await deliverBinding(guildId, mapping, gamertag, serverName);
  }
}

async function handleBroadcast(guildId, rawMessage, serverName) {
  const text = typeof rawMessage === "string" ? rawMessage : rawMessage?.Message || rawMessage?.message;
  if (!text) return;

  const match = text.trim().match(CHAT_LINE_PATTERN);
  if (!match) return;
  const [, gamertag, chatText] = match;

  if (isOutOfAmmoTrigger(chatText)) {
    lastOutOfAmmoAt.set(outOfAmmoKey(guildId, gamertag), Date.now());
    return; // "Out of Ammo" is a combo PRIMER, never a delivery trigger on its own
  }

  const mappings = db.listAutokitMappings(guildId);
  const comboReady = Date.now() - (lastOutOfAmmoAt.get(outOfAmmoKey(guildId, gamertag)) || 0) <= COMBO_WINDOW_MS;

  // Combo bindings checked FIRST when the player just primed with "Out of
  // Ammo" - per the reference mapping, the SAME wheel trigger can be bound
  // once as a direct (tier 1-22) kit and once as a combo (tier 23-44) kit,
  // and which one actually fires depends on whether Out of Ammo preceded
  // it, not on binding order.
  const candidates = comboReady
    ? [...mappings.filter((m) => m.mode === "combo"), ...mappings.filter((m) => m.mode !== "combo")]
    : mappings.filter((m) => m.mode !== "combo");

  for (const mapping of candidates) {
    if (matchesTrigger(mapping, chatText)) {
      if (mapping.mode === "combo") lastOutOfAmmoAt.delete(outOfAmmoKey(guildId, gamertag)); // consumed - can't chain into a second combo delivery off one "Out of Ammo"
      await handleTriggerMatch(guildId, mapping, gamertag, serverName);
      return; // first matching binding wins
    }
  }
}

onGuildBroadcast(handleBroadcast);

module.exports = { handleBroadcast, setClient, deliverVehicle, remainingCooldownMs, CHAT_LINE_PATTERN };

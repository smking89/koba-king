"use strict";

/**
 * Killfeed embed builder - pure rendering, no posting. Re-added 2026-10-12
 * as a self-posting consumer; split 2026-10-18 so utils/killfeedEngine.js
 * (combo buffer, anti-farm, rivalry, bounty, Elo, currency rewards) can own
 * the actual Discord/RCON output and build ONE enriched embed per kill
 * instead of this module and the engine both posting separately. The
 * DISPLAY feature was originally removed 2026-09-10 because it "kept
 * getting built wrong" (see rcon/combatParser.js's header) - specifically,
 * numeric platform-id placeholders leaking into the posted message instead
 * of a real gamertag. The underlying pipeline (utils/combatEvents.js) was
 * rebuilt properly afterward with an honest resolvePlayerName() that never
 * fabricates a name, so this module only has to render what that pipeline
 * already guarantees - it does NOT re-implement identity resolution.
 *
 * UNRESOLVED HANDLING: utils/combatEvents.js stores killer_gamertag/
 * victim_gamertag as the bare numeric id string when resolvePlayerName()
 * couldn't resolve it - there's no separate "unresolved" column on
 * pvp_kills (stored columns are what resolvePlayerName() decided, not a
 * flag on top of it). Re-checking looksLikePlatformId() here (the exact
 * same check resolvePlayerName() itself uses) at render time is therefore
 * equivalent to "the event marked it unresolved", not a separate guess -
 * a bare numeric id is NEVER shown in the posted embed, it always renders
 * as "Unknown Player" instead (per the Helios research finding - a soft
 * fallback beats showing a raw id).
 */

const { infoEmbed } = require("./embeds");
const { looksLikePlatformId, isNpcName } = require("../rcon/combatParser");

/** Never a bare numeric placeholder id, never fabricated - NPC/environment names render as-is (they aren't a gamertag at all, nothing to resolve). */
function displayName(gamertag) {
  if (!gamertag) return "Unknown Player";
  if (looksLikePlatformId(gamertag)) return "Unknown Player";
  return gamertag;
}

/**
 * PVP_KILL/PVE_KILL only - FALL/RADIATION/SUICIDE/UNKNOWN_DEATH are
 * self-deaths or unclassifiable noise with no real "kill" to announce, per
 * utils/combatEvents.js's classifyEvent() (spec section 11: UNKNOWN_DEATH
 * may be stored for diagnostics but isn't a real event to broadcast).
 */
function buildKillfeedEmbed(event) {
  const killerLabel = displayName(event.killer_gamertag);
  const victimLabel = displayName(event.victim_gamertag);

  if (event.event_type === "PVP_KILL") {
    const warNote = event.clan_war_id ? " ⚔️ _Clan War kill_" : "";
    return infoEmbed("💀 PvP Kill", `**${killerLabel}** killed **${victimLabel}**${warNote}`);
  }

  // PVE_KILL - direction matters for the wording (a player killed BY an NPC
  // reads very differently from a player killing an NPC), same either-
  // direction logic classifyEvent() itself used to call this PVE_KILL at all.
  if (isNpcName(event.killer_gamertag)) {
    return infoEmbed("🩸 PvE Death", `**${victimLabel}** was killed by **${event.killer_gamertag}**`);
  }
  return infoEmbed("🏹 PvE Kill", `**${killerLabel}** killed **${event.victim_gamertag}**`);
}

module.exports = { buildKillfeedEmbed, displayName };

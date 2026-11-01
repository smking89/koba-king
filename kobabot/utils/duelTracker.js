"use strict";

/**
 * Real win/loss detection for Challenges (utils/challengeEngine.js) -
 * replaces that module's old coin-flip settlement. Subscribes to the same
 * real PvP kill event stream killfeedEngine.js already uses
 * (utils/combatEvents.js's onCombatEvent) and watches for kills between the
 * two gamertags snapshotted on a live duel (challenge_duels table, created
 * at Accept time). First side to land `kill_target` real kills on the
 * other wins - no RNG, no manual reporting.
 *
 * A kill only counts for a duel if BOTH the killer and victim gamertag
 * match that duel's two sides - a duelist getting killed by a third,
 * unrelated player doesn't count against them, and killing someone other
 * than their duel opponent doesn't advance their count either.
 *
 * IDENTITY MATCHING - gamertag, lowercased, is the only option: Rust
 * Console Edition's WebRCON returns "NA" for the numeric id column on
 * every real capture (see utils/combatEvents.js's own header, already
 * researched) - there is no stable SteamID64/XUID in the kill log to match
 * on instead, on this platform. What IS fixable is case: a cosmetic
 * rename (Xbox/PSN display names are player-editable) could otherwise
 * silently break a duel's matching mid-fight, so every comparison here
 * lowercases both sides first.
 *
 * SERVER LOCKING - guild_servers supports multiple Rust servers under one
 * Discord guild, so `event.guild_id` alone doesn't pin down which physical
 * server a kill happened on. A duel locks to whichever server its first
 * matching kill came from (challenge_duels.server_name, see schema.sql's
 * comment on that column) and ignores same-guild kills from any other
 * server after that - otherwise a losing player could hop to a different
 * server this same guild tracks and have unrelated kills there counted.
 */

const db = require("../database/db");
const { onCombatEvent } = require("./combatEvents");

function normalizeGamertag(name) {
  return (name || "").trim().toLowerCase();
}

let discordClient = null;
function setClient(client) {
  discordClient = client;
}

async function postResult(guildId, challenge, embed) {
  if (!discordClient || !challenge.channel_id) return;
  try {
    const channel = await discordClient.channels.fetch(challenge.channel_id).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error(`[KOBA Bot] Duel result post failed for guild ${guildId}:`, err.message);
  }
}

function handleCombatEvent(event) {
  if (event.event_type !== "PVP_KILL") return;
  const guildId = event.guild_id;
  const killer = normalizeGamertag(event.killer_gamertag);
  const victim = normalizeGamertag(event.victim_gamertag);
  if (!killer || !victim) return;
  const eventServerName = event.server_name || null;

  for (const duel of db.listActiveChallengeDuels(guildId)) {
    const challengerGamertag = normalizeGamertag(duel.challenger_gamertag);
    const opponentGamertag = normalizeGamertag(duel.opponent_gamertag);

    let side = null;
    if (killer === challengerGamertag && victim === opponentGamertag) side = "challenger";
    else if (killer === opponentGamertag && victim === challengerGamertag) side = "opponent";
    if (!side) continue;

    // Lock to the first server this duel actually sees action on; a kill
    // from a different server this same guild tracks never counts once locked.
    const duelAfterBind = duel.server_name ? duel : db.bindChallengeDuelServer(duel.id, eventServerName);
    if (duelAfterBind.server_name && duelAfterBind.server_name !== eventServerName) continue;

    const updated = db.incrementDuelKills(duel.id, side);
    const reached = side === "challenger" ? updated.challenger_kills >= updated.kill_target : updated.opponent_kills >= updated.kill_target;
    if (!reached) continue;

    db.deleteChallengeDuel(duel.id);
    const challenge = db.getChallenge(guildId, duel.challenge_id);
    if (!challenge) continue;

    // Lazy require - challengeEngine doesn't require this file, but keeping
    // this the one lazy side matches this codebase's established convention
    // for breaking a two-module call cycle (see utils/linkPanel.js's
    // getSyncLinkedRole()).
    const challengeEngine = require("./challengeEngine");
    const winnerId = side === "challenger" ? challenge.challenger_id : challenge.opponent_id;
    const settled = challengeEngine.settleChallenge(guildId, duel.challenge_id, winnerId);
    postResult(guildId, settled, challengeEngine.buildChallengeResultView(guildId, settled).embeds[0]);
  }
}

onCombatEvent(handleCombatEvent);

/** Background sweep (utils/backgroundLoops.js) - a duel that never reached its kill_target in time gets force-resolved: more kills wins outright, an exact tie refunds both stakes. See challengeEngine.forfeitChallengeDuel. */
async function runDuelExpiryTick() {
  const challengeEngine = require("./challengeEngine");
  for (const duel of db.listExpiredChallengeDuels()) {
    db.deleteChallengeDuel(duel.id);
    const settled = challengeEngine.forfeitChallengeDuel(duel.guild_id, duel.challenge_id, duel.challenger_kills, duel.opponent_kills);
    if (!settled) continue;
    const embed = settled.status === "FORFEITED" ? challengeEngine.buildChallengeForfeitedView(duel.guild_id, settled).embeds[0] : challengeEngine.buildChallengeResultView(duel.guild_id, settled).embeds[0];
    await postResult(duel.guild_id, settled, embed);
  }
}

module.exports = { setClient, runDuelExpiryTick };

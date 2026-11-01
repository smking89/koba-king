"use strict";

/**
 * Killfeed Engine - combo buffering, anti-farm diminishing returns,
 * nemesis/rivalry, bounty payouts, Elo rating, and currency rewards on top
 * of the real Combat Event Pipeline (utils/combatEvents.js). Owns all
 * actual Discord/RCON output for kills now; utils/killfeedDisplay.js is
 * just the pure embed-builder this calls into (see that file's 2026-10-18
 * header for why the split happened - one post per kill, not two).
 *
 * Deliberately does NOT reproduce the "KOBAbot Killfeed Engine" document
 * reviewed 2026-10-18 (Python/Redis/Postgres stack, a
 * "[Kill] A killed B with Weapon at Dm" log format, a
 * "[Damage] Gamertag[id] damaged wall[id] with rocket_basic[id] at (x,y,z)"
 * raid-alarm regex) - none of that is real on this server. This is built
 * against the REAL confirmed log format (rcon/combatParser.js:
 * "{victim} was killed by {killer}", optionally "(causeTag)" - no weapon,
 * no distance, ever) and the REAL stack (SQLite, no Redis - the combo
 * buffer below is a plain in-process Map/setTimeout, which is all a single
 * bot process needs; there's no second process this state would need to be
 * shared with).
 *
 * ANTI-FARM / NEMESIS - the fabricated document's anti-farm design relies
 * on a "return damage" signal (victim fired back or didn't) that doesn't
 * exist anywhere in this server's data (no damage events, see raid-alert
 * research). Rather than fabricate one, this reuses the real
 * pvp_rivalries.consecutive_kills counter for BOTH purposes at once: it's
 * already exactly "how many unanswered kills has attacker landed on victim
 * in a row", which is simultaneously the anti-farm diminishing-returns
 * input and the nemesis-threshold input - one real counter, not two, one
 * real and one invented.
 *
 * ELO - standard symmetric Elo (winner's gain == loser's loss). The
 * reviewed document proposed an asymmetric "victim only loses half the
 * killer's gain" variant, which breaks the zero-sum property and inflates
 * ratings server-wide over time - not implemented.
 */

const db = require("../database/db");
const { baseEmbed, COLORS } = require("./embeds");
const { buildKillfeedEmbed, displayName } = require("./killfeedDisplay");
const { onCombatEvent } = require("./combatEvents");
const { isNpcName } = require("../rcon/combatParser");
const { formatStyledMessage } = require("./messageStyle");
const { getRcon } = require("../rcon/manager");
const { estimateDistance } = require("./combatPositionTracker");

let discordClient = null;
function setClient(client) {
  discordClient = client;
}

// ---------------------------------------------------------------------------
// Combo buffer - groups kills by the same killer landed within COMBO_WINDOW_MS
// into one embed/one broadcast instead of spamming one per kill. Purely a
// DISPLAY grouping - every kill's own calculation (anti-farm, rivalry,
// bounty, Elo, streak, reward) already ran and already hit the database
// the moment its combat event was received, same instant as every other
// onCombatEvent consumer (utils/progression.js's XP award, etc.) - nothing
// about scoring is delayed by this buffer, only the Discord/RCON message is.
// ---------------------------------------------------------------------------
const COMBO_WINDOW_MS = 500;
const comboBuffers = new Map(); // `${guildId}:${killerGamertag}` -> { results: [], timer }

function comboLabel(count) {
  if (count >= 5) return "ACE";
  if (count === 4) return "QUAD KILL";
  if (count === 3) return "TRIPLE KILL";
  if (count === 2) return "DOUBLE KILL";
  return null;
}

function queueForDisplay(guildId, killerGamertag, result) {
  const key = `${guildId}:${killerGamertag || "none"}`;
  let buf = comboBuffers.get(key);
  if (!buf) {
    buf = { results: [] };
    comboBuffers.set(key, buf);
  }
  buf.results.push(result);
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    comboBuffers.delete(key);
    flushComboGroup(guildId, killerGamertag, buf.results).catch((err) => console.error("[KOBA Bot] Killfeed combo flush failed:", err.message));
  }, COMBO_WINDOW_MS);
}

// ---------------------------------------------------------------------------
// Anti-farm + Nemesis (shared counter - see header)
// ---------------------------------------------------------------------------

// 100% / 50% / 25% / 0% on the 1st/2nd/3rd/4th+ unanswered kill of the same
// victim by the same attacker - matches the diminishing-returns LADDER the
// reviewed document described, just driven by a real counter instead of a
// fabricated "return damage" check.
const FARM_MULTIPLIERS = [1, 0.5, 0.25, 0];
function farmMultiplierFor(consecutiveKills) {
  const idx = Math.min(consecutiveKills - 1, FARM_MULTIPLIERS.length - 1);
  return FARM_MULTIPLIERS[idx];
}

// ---------------------------------------------------------------------------
// Elo
// ---------------------------------------------------------------------------

const ELO_K_FACTOR = 32;
function computeEloDelta(killerRating, victimRating) {
  const expected = 1 / (1 + Math.pow(10, (victimRating - killerRating) / 400));
  return Math.round(ELO_K_FACTOR * (1 - expected));
}

// ---------------------------------------------------------------------------
// Currency reward config (per-guild, set via direct DB config keys - no
// command currently exposes this; amount 0/unset simply means "no payout
// configured", so this quietly no-ops).
// ---------------------------------------------------------------------------

function getRewardConfig(guildId) {
  return {
    currencyId: db.getConfig(guildId, "killfeed_coins_currency_id"),
    pvpAmount: Number(db.getConfig(guildId, "killfeed_coins_pvp_amount")) || 0,
    pveAmount: Number(db.getConfig(guildId, "killfeed_coins_pve_amount")) || 0,
    shutdownBonusPerStreak: Number(db.getConfig(guildId, "killfeed_coins_shutdown_bonus")) || 0,
    nemesisBonus: Number(db.getConfig(guildId, "killfeed_coins_nemesis_bonus")) || 0,
    ingameEnabled: !!db.getConfig(guildId, "killfeed_ingame_enabled"),
  };
}

/** Kill/shutdown/nemesis reward payout - this is reward CREATION (no counterparty is debited), so it's gated through grantFromSupply/max_supply like every other reward-creation path. Returns the amount actually credited (may be less than requested if the currency's supply cap was hit). */
function payout(guildId, killerGamertag, amount) {
  if (!amount || amount <= 0 || !killerGamertag) return 0;
  const member = db.getMemberByGamertag(guildId, killerGamertag);
  if (!member?.discord_id) return 0; // not rostered/linked - can't credit a wallet with no Discord id, same limitation every other gamertag->wallet reward in this codebase already has
  const cfg = getRewardConfig(guildId);
  if (!cfg.currencyId) return 0;
  return db.grantFromSupply(guildId, cfg.currencyId, member.discord_id, Math.round(amount)).granted;
}

/** Bounty claim payout - this is NOT reward creation, it's releasing money the placer already escrowed (commands/bounty.js debits the placer the exact same `amount` up front), so it goes straight through adjustWallet rather than grantFromSupply/the supply cap. */
function payoutBountyClaim(guildId, killerGamertag, amount) {
  if (!amount || amount <= 0 || !killerGamertag) return 0;
  const member = db.getMemberByGamertag(guildId, killerGamertag);
  if (!member?.discord_id) return 0;
  const cfg = getRewardConfig(guildId);
  if (!cfg.currencyId) return 0;
  db.adjustWallet(guildId, member.discord_id, cfg.currencyId, Math.round(amount));
  return Math.round(amount);
}

// ---------------------------------------------------------------------------
// Per-kill calculation - runs synchronously (DB writes happen immediately,
// never deferred by the combo buffer) the moment a PVP_KILL/PVE_KILL event
// is published.
// ---------------------------------------------------------------------------

function computePveResult(event) {
  const cfg = getRewardConfig(event.guild_id);
  const killerIsNpc = isNpcName(event.killer_gamertag);
  const coinsAwarded = killerIsNpc ? 0 : payout(event.guild_id, event.killer_gamertag, cfg.pveAmount);
  return { event, tier: null, nemesisDown: false, bountyClaims: [], eloDelta: 0, coinsAwarded, currencyId: cfg.currencyId };
}

function computePvpResult(event) {
  const guildId = event.guild_id;
  const killerGamertag = event.killer_gamertag;
  const victimGamertag = event.victim_gamertag;
  const cfg = getRewardConfig(guildId);

  // Nemesis/rivalry + shared anti-farm counter.
  const priorNemesisRow = db.clearRivalry(guildId, victimGamertag, killerGamertag); // victim just answered back on THEIR attacker, if any - breaks that pair's streak regardless
  const nemesisDown = !!priorNemesisRow?.is_nemesis;
  const rivalryRow = db.bumpRivalry(guildId, killerGamertag, victimGamertag);
  const farmMultiplier = farmMultiplierFor(rivalryRow.consecutive_kills);
  const isNemesisNow = !!rivalryRow.is_nemesis;

  // Elo - standard symmetric update, both ratings read BEFORE either is written.
  const killerRating = db.getEloRating(guildId, killerGamertag);
  const victimRating = db.getEloRating(guildId, victimGamertag);
  const eloDelta = computeEloDelta(killerRating, victimRating);
  db.setEloRating(guildId, killerGamertag, killerRating + eloDelta);
  db.setEloRating(guildId, victimGamertag, victimRating - eloDelta);

  // Bounty - every OPEN bounty on the victim pays out in full to the killer; a valid PvP kill is a valid claim regardless of farm-damping (the bounty was posted on a real player, not inflated by repeat-kill math).
  const bountyClaims = [];
  for (const bounty of db.getOpenBountiesOnTarget(guildId, victimGamertag)) {
    db.claimBounty(guildId, bounty.id, killerGamertag);
    const credited = payoutBountyClaim(guildId, killerGamertag, bounty.amount);
    bountyClaims.push({ ...bounty, credited });
  }

  // Shutdown tier - based on the victim's streak snapshot BEFORE their death reset it (utils/combatEvents.js attaches this).
  const victimStreak = event.victim_streak_before_death || 0;
  let tier = null;
  if (victimStreak >= 10) tier = "LEGEND";
  else if (victimStreak >= 7) tier = "KING SLAYER";
  else if (victimStreak >= 5) tier = "MEGA SHUTDOWN";
  else if (victimStreak >= 3) tier = "SHUTDOWN";

  let coinsAwarded = Math.round(cfg.pvpAmount * farmMultiplier);
  if (tier) coinsAwarded += Math.round(victimStreak * cfg.shutdownBonusPerStreak);
  if (isNemesisNow || nemesisDown) coinsAwarded += cfg.nemesisBonus;
  const credited = payout(guildId, killerGamertag, coinsAwarded);

  // Real distance from cached positions (utils/combatPositionTracker.js) -
  // null if either side has no fresh enough position polled recently.
  // Never a random/fabricated number - see that module's header.
  const distanceMeters = estimateDistance(guildId, killerGamertag, victimGamertag);

  return {
    event,
    tier,
    victimStreak,
    nemesisDown,
    isNemesisNow,
    farmMultiplier,
    bountyClaims,
    eloDelta,
    killerRatingAfter: killerRating + eloDelta,
    coinsAwarded: credited,
    currencyId: cfg.currencyId,
    distanceMeters,
  };
}

// ---------------------------------------------------------------------------
// Rendering - one embed per combo group (a group of 1 is just a normal kill).
// ---------------------------------------------------------------------------

function currencyLabel(guildId, currencyId, amount) {
  if (!amount) return null;
  const currency = currencyId ? db.getCurrency(guildId, currencyId) : null;
  return `+${amount} ${currency?.emoji || currency?.name || "coins"}`;
}

function buildComboEmbed(guildId, killerGamertag, results) {
  const count = results.length;
  const label = comboLabel(count);
  const killer = displayName(killerGamertag);

  if (count === 1 && !label) {
    // Ordinary single kill - defer to killfeedDisplay's plain embed, then append whatever extras this kill actually earned.
    const embed = buildKillfeedEmbed(results[0].event);
    return appendExtras(guildId, embed, results[0]);
  }

  const victims = results.map((r) => displayName(r.event.victim_gamertag)).join(", ");
  const embed = baseEmbed(COLORS.gold).setTitle(`💥 ${label || `${count}x KILL`}`).setDescription(`**${killer}** is on a **${label || `${count}-kill`}** streak! Overtook: ${victims}`);
  for (const result of results) appendExtras(guildId, embed, result, true);
  return embed;
}

function appendExtras(guildId, embed, result, inline = false) {
  const fields = [];
  // Estimated, never exact - labeled honestly (see combatPositionTracker.js's header for why this can't be a precise measured distance on RCE).
  if (result.distanceMeters !== undefined && result.distanceMeters !== null) fields.push({ name: "📏 Distance (est.)", value: `~${result.distanceMeters}m`, inline });
  if (result.tier) fields.push({ name: "🩸 Shutdown", value: `**${result.tier}** - ended a ${result.victimStreak}-kill streak`, inline });
  if (result.nemesisDown) fields.push({ name: "💜 Nemesis Down!", value: `**${displayName(result.event.victim_gamertag)}** finally answered their nemesis.`, inline });
  else if (result.isNemesisNow) fields.push({ name: "⚠️ Nemesis", value: `**${displayName(result.event.killer_gamertag)}** is now **${displayName(result.event.victim_gamertag)}**'s nemesis.`, inline });
  if (result.farmMultiplier !== undefined && result.farmMultiplier < 1 && result.farmMultiplier > 0) fields.push({ name: "📉 Diminishing Returns", value: `${Math.round(result.farmMultiplier * 100)}% reward (repeat kill)`, inline });
  for (const claim of result.bountyClaims || []) fields.push({ name: "🏆 Bounty Claimed", value: `${claim.amount} coins`, inline });
  const coinLabel = currencyLabel(guildId, result.currencyId, result.coinsAwarded);
  if (coinLabel) fields.push({ name: "💰 Reward", value: coinLabel, inline });
  if (fields.length) embed.addFields(fields);
  return embed;
}

async function postEmbed(guildId, embed) {
  if (!discordClient) return;
  const meta = db.getGuildMeta(guildId);
  if (!meta?.kill_feed_channel_id) return; // no channel configured - best-effort, never an error
  try {
    const guild = discordClient.guilds.cache.get(guildId) ?? (await discordClient.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;
    const channel = await guild.channels.fetch(meta.kill_feed_channel_id).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error(`[KOBA Bot] Killfeed post failed for guild ${guildId}:`, err.message);
  }
}

async function announceInGame(guildId, text) {
  const cfg = getRewardConfig(guildId);
  if (!cfg.ingameEnabled) return;
  try {
    const rcon = await getRcon(guildId);
    await rcon.say(formatStyledMessage(guildId, "killfeed", { message: text }));
  } catch (err) {
    console.warn("[KOBA Bot] Killfeed in-game broadcast failed:", err.message);
  }
}

async function flushComboGroup(guildId, killerGamertag, results) {
  const embed = buildComboEmbed(guildId, killerGamertag, results);
  await postEmbed(guildId, embed);

  const count = results.length;
  const label = comboLabel(count);
  if (label) {
    await announceInGame(guildId, `${displayName(killerGamertag)} is on a ${label}!`);
  } else {
    const r = results[0];
    const tag = r.tier ? ` [${r.tier}]` : "";
    await announceInGame(guildId, `${displayName(r.event.killer_gamertag)} killed ${displayName(r.event.victim_gamertag)}${tag}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function handleCombatEvent(event) {
  if (event.event_type === "PVP_KILL") {
    const result = computePvpResult(event);
    queueForDisplay(event.guild_id, event.killer_gamertag, result);
  } else if (event.event_type === "PVE_KILL") {
    const result = computePveResult(event);
    queueForDisplay(event.guild_id, event.killer_gamertag || `pve:${event.id}`, result);
  }
  // FALL/RADIATION/SUICIDE/UNKNOWN_DEATH - nothing to calculate or announce, same as killfeedDisplay.js's original scope.
}

onCombatEvent(handleCombatEvent);

/** Background sweep (see utils/backgroundLoops.js) - refunds every bounty past its expires_at back to whoever placed it, then flips status. */
async function runBountyExpiryTick() {
  for (const bounty of db.listExpiredOpenBounties()) {
    db.adjustWallet(bounty.guild_id, bounty.placed_by, bounty.currency_id, bounty.amount);
    db.expireBounty(bounty.guild_id, bounty.id);
  }
}

module.exports = { setClient, runBountyExpiryTick };

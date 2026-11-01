"use strict";

/**
 * Challenge Engine - direct 1v1 wagered Challenges between two players
 * (spec: "COMPLETE RIVAL, CHALLENGE & COMPETITIVE RIVALRY SYSTEM", sections
 * 11-30, 52-55).
 *
 * RESOLUTION MODEL (REBUILT - was a coin-flip): this used to settle with
 * Math.random() the instant a Challenge was accepted, documented at the time
 * as a deliberate stopgap because no real PvP "who won" signal existed
 * anywhere in the codebase. One now does -
 * utils/combatEvents.js/killfeedEngine.js already parse real live PvP kills
 * off WebRCON (killer gamertag, victim gamertag) for the killfeed/bounty/Elo
 * features. utils/duelTracker.js subscribes to that same event stream: once
 * accepted, a Challenge starts a live kill-count race (first to `kill_target`
 * real kills ON THE OTHER PLAYER wins) instead of settling immediately -
 * see acceptChallenge below and challenge_duels in schema.sql. A Challenge
 * can only be accepted once both players have a linked Gamertag, since
 * there's otherwise no name to match kills against.
 *
 * FEES - the pruning-era spec referenced "configurable marketplace/auction
 * fees" as an existing feature; inspection found no such fee/treasury
 * system anywhere in the actual codebase to reuse. Challenges are
 * therefore fee-free (fee_amount always 0) rather than this module
 * inventing a new treasury/fee architecture on its own initiative.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const rivalSystem = require("./rivalSystem");
const { entitlementsFor, todayKey } = require("../config/playerPlans");

const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // spec example: "Expires: 10 minutes" - window to ACCEPT, not the duel itself
const DUEL_TIMEOUT_MS = 30 * 60 * 1000; // once accepted/live, how long the two players have to actually fight it out in-game before utils/duelTracker.js force-resolves it

// Internal event bus - same onX/publishX shape as utils/combatEvents.js and
// utils/gameEvents.js. utils/progression.js subscribes here to award
// XP/Points for a Challenge win without this module needing to know
// progression exists (spec: "Challenge outcomes may award XP... do not
// create a duplicate Challenge engine" - the flip side of that is this
// engine shouldn't hard-code XP amounts either).
const settledConsumers = [];
function onChallengeSettled(handler) {
  settledConsumers.push(handler);
}
function publishChallengeSettled(event) {
  for (const handler of settledConsumers) {
    Promise.resolve()
      .then(() => handler(event))
      .catch((err) => console.error("[KOBA Bot] Challenge-settled consumer failed:", err));
  }
}

function fmtAmount(currency, amount) {
  return `${Math.round(amount * 100) / 100} ${currency.emoji || ""} ${currency.name}`.replace(/\s+/g, " ").trim();
}

function challengeRow(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`challenge:accept:${challengeId}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`challenge:decline:${challengeId}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
  );
}

/**
 * Creates an OPEN Challenge (spec section 13/23 - Challenge Builder/Review,
 * simplified to one command call). Validates the challenger's own balance
 * up front (a courtesy check, not the authoritative one - see acceptChallenge
 * for why the REAL balance check happens again at acceptance time).
 */
const VALID_KILL_TARGETS = [3, 5, 10];

/**
 * Basic/Pro/Max Challenge-creation limits (config/playerPlans.js,
 * challengesCreatedPerDay/maxActiveCreatedChallenges) - count-based only.
 * The spec's per-Challenge STAKE cap (100/250/1,000) is denominated in a
 * global "KOBA Coins" currency that doesn't exist yet - Challenges here
 * stake whatever per-guild currency the admin configured, which has no
 * consistent value across guilds, so enforcing a flat number against it
 * would be meaningless (one guild's "100" could be a different guild's
 * "100,000"). Deliberately not enforced until a real global currency
 * exists to measure it against.
 */
function checkPlanLimits(challengerId) {
  const entitlements = entitlementsFor(db.getPlayerPlan(challengerId));

  const createdToday = db.getDailyUsage(challengerId, todayKey(), "challenges_created");
  if (createdToday >= entitlements.challengesCreatedPerDay) {
    return { ok: false, reason: `You've hit your plan's limit of **${entitlements.challengesCreatedPerDay}** Challenges created today.` };
  }
  const activeCount = db.countActiveCreatedChallenges(challengerId);
  if (activeCount >= entitlements.maxActiveCreatedChallenges) {
    return { ok: false, reason: `You already have **${entitlements.maxActiveCreatedChallenges}** active Challenges open - wait for one to resolve first.` };
  }
  return { ok: true };
}

function createChallenge(guildId, challengerId, opponentId, currencyId, stakeAmount, rivalshipId, killTarget = 5) {
  if (challengerId === opponentId) return { ok: false, reason: "You can't challenge yourself." };
  if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) return { ok: false, reason: "Stake must be a positive number." };
  if (!VALID_KILL_TARGETS.includes(killTarget)) return { ok: false, reason: `Kill target must be one of: ${VALID_KILL_TARGETS.join(", ")}.` };

  const planCheck = checkPlanLimits(challengerId);
  if (!planCheck.ok) return planCheck;

  const wallet = db.getWallet(guildId, challengerId, currencyId);
  if (wallet.balance < stakeAmount) return { ok: false, reason: `You don't have **${stakeAmount}** to stake.` };

  const challenge = db.createChallenge(guildId, challengerId, opponentId, currencyId, stakeAmount, Date.now() + CHALLENGE_EXPIRY_MS, rivalshipId || null, killTarget);
  db.incrementDailyUsage(challengerId, todayKey(), "challenges_created");
  return { ok: true, challenge };
}

/**
 * Acceptance is where the REAL money moves (spec section 26, Escrow).
 * Ordering matters here (spec section 54/55 - concurrency, the expiration
 * race): the atomic OPEN -> ACCEPTED transition is attempted FIRST, before
 * any wallet is touched - if another caller already moved this challenge
 * out of OPEN (it expired, was declined, or was already accepted), this
 * fails cleanly with zero money ever touched. Only once this call has
 * exclusively WON the transition does it deduct both wallets - since
 * better-sqlite3 is synchronous and Node is single-threaded, nothing else
 * can interleave between "we won the transition" and "we deduct both
 * wallets" within this same function call, so there's no window for a
 * double-accept to double-escrow.
 */
function acceptChallenge(guildId, challengeId, acceptingUserId, channelId) {
  const challenge = db.getChallenge(guildId, challengeId);
  if (!challenge) return { ok: false, reason: "That Challenge doesn't exist." };
  if (challenge.opponent_id !== acceptingUserId) return { ok: false, reason: "This Challenge isn't yours to accept." };
  if (Date.now() >= challenge.expires_at) {
    db.tryTransitionChallenge(challengeId, "OPEN", "EXPIRED");
    return { ok: false, reason: "This Challenge already expired." };
  }

  // A live duel tracks real kills by Gamertag (utils/duelTracker.js) - without
  // both players linked there's no name to match kills against, so this is
  // checked BEFORE the transition/escrow below (unlike the balance checks,
  // which cancel/fail an already-attempted transition, there's nothing to
  // unwind here since nothing has happened yet).
  const challengerMember = db.getMember(guildId, challenge.challenger_id);
  const opponentMember = db.getMember(guildId, challenge.opponent_id);
  if (!challengerMember?.gamertag) return { ok: false, reason: `<@${challenge.challenger_id}> needs to \`/link\` a Gamertag before this Challenge can be accepted.` };
  if (!opponentMember?.gamertag) return { ok: false, reason: "Link your Gamertag with `/link` first - a live duel is tracked by real in-game kills." };

  const currency = db.getCurrency(guildId, challenge.currency_id);
  const challengerWallet = db.getWallet(guildId, challenge.challenger_id, challenge.currency_id);
  const opponentWallet = db.getWallet(guildId, challenge.opponent_id, challenge.currency_id);
  if (challengerWallet.balance < challenge.stake_amount) {
    db.tryTransitionChallenge(challengeId, "OPEN", "CANCELLED");
    return { ok: false, reason: "The challenger no longer has enough to cover their stake - Challenge cancelled." };
  }
  if (opponentWallet.balance < challenge.stake_amount) {
    return { ok: false, reason: `You need **${fmtAmount(currency, challenge.stake_amount)}** to accept this Challenge.` };
  }

  const won = db.tryTransitionChallenge(challengeId, "OPEN", "ACCEPTED", { accepted_at: Date.now(), channel_id: channelId || null });
  if (!won) return { ok: false, reason: "This Challenge is no longer open (already accepted, expired, or cancelled)." };

  // Escrow - both sides committed atomically, only now that the transition is exclusively ours.
  db.adjustWallet(guildId, challenge.challenger_id, challenge.currency_id, -challenge.stake_amount);
  db.adjustWallet(guildId, challenge.opponent_id, challenge.currency_id, -challenge.stake_amount);

  const duel = db.createChallengeDuel(guildId, challengeId, challengerMember.gamertag, opponentMember.gamertag, challenge.kill_target, Date.now() + DUEL_TIMEOUT_MS);
  return { ok: true, challenge: db.getChallenge(guildId, challengeId), duel };
}

function declineChallenge(guildId, challengeId, decliningUserId) {
  const challenge = db.getChallenge(guildId, challengeId);
  if (!challenge) return { ok: false, reason: "That Challenge doesn't exist." };
  if (challenge.opponent_id !== decliningUserId) return { ok: false, reason: "This Challenge isn't yours to decline." };
  const won = db.tryTransitionChallenge(challengeId, "OPEN", "DECLINED");
  if (!won) return { ok: false, reason: "This Challenge is no longer open." };
  return { ok: true };
}

/**
 * Resolves and pays out an ACCEPTED Challenge once a real winner is known -
 * called by utils/duelTracker.js the instant one side reaches its duel's
 * kill_target, never on acceptance itself anymore (see this file's header).
 * `winnerId` must be challenge.challenger_id or opponent_id - no RNG branch
 * exists here at all now. The ACCEPTED -> SETTLED transition is itself
 * atomic/idempotent (spec section 28: "if settlement is attempted twice:
 * first SUCCESS, second NO-OP") - guarded the same way as the
 * OPEN->ACCEPTED transition above, so a duplicate kill event racing the
 * same threshold twice can never pay out twice.
 */
function settleChallenge(guildId, challengeId, winnerId) {
  const challenge = db.getChallenge(guildId, challengeId);
  if (!challenge) return null;
  // First line of defense against a double settlement (the kill-target
  // trigger in utils/duelTracker.js and the 30-minute timeout tick in
  // backgroundLoops.js both ultimately call in here) - bail immediately on
  // anything already past ACCEPTED rather than recomputing a payout for a
  // challenge that's already SETTLED/FORFEITED. The real, airtight guard is
  // still `tryTransitionChallenge`'s atomic `WHERE status = 'ACCEPTED'`
  // update right below (better-sqlite3 is synchronous and this whole
  // process is single-threaded, so there's no window for two callers to
  // both pass that check) - this early check is cheap insurance on top,
  // not a replacement for it.
  if (challenge.status !== "ACCEPTED") return challenge;
  if (winnerId !== challenge.challenger_id && winnerId !== challenge.opponent_id) {
    throw new Error(`settleChallenge: winnerId ${winnerId} is neither party of challenge ${challengeId}`);
  }
  const pot = challenge.stake_amount * 2;

  const won = db.tryTransitionChallenge(challengeId, "ACCEPTED", "SETTLED", { settled_at: Date.now(), winner_id: winnerId });
  if (!won) return db.getChallenge(guildId, challengeId); // already settled - no-op, never pays twice

  db.adjustWallet(guildId, winnerId, challenge.currency_id, pot);
  const loserId = winnerId === challenge.challenger_id ? challenge.opponent_id : challenge.challenger_id;

  if (challenge.rivalship_id) {
    rivalSystem.recordChallengeResult(challenge.rivalship_id, {
      guildId,
      challengeId,
      currencyId: challenge.currency_id,
      stakeAmount: challenge.stake_amount,
      potAmount: pot,
      feeAmount: 0,
      winnerId,
      loserId,
    });
  }

  const settled = db.getChallenge(guildId, challengeId);
  publishChallengeSettled({ guildId, challengeId, winnerId, loserId, stakeAmount: challenge.stake_amount, potAmount: pot });
  return settled;
}

/**
 * The duel timed out (utils/duelTracker.js, DUEL_TIMEOUT_MS) before either
 * side reached kill_target. Whoever has more kills wins outright (a 4-2
 * lead at the buzzer is still a real result); an exact tie (including 0-0 -
 * nobody fought) refunds both stakes rather than flipping a coin, since
 * that's exactly the fake-result problem this whole rebuild removed.
 */
function forfeitChallengeDuel(guildId, challengeId, challengerKills, opponentKills) {
  const challenge = db.getChallenge(guildId, challengeId);
  if (!challenge) return null;
  // Same early-exit as settleChallenge's header comment - a duel that
  // already settled via the kill-target path before this timeout tick got
  // around to it is a no-op here, not a second payout attempt.
  if (challenge.status !== "ACCEPTED") return challenge;

  if (challengerKills === opponentKills) {
    const won = db.tryTransitionChallenge(challengeId, "ACCEPTED", "FORFEITED", { settled_at: Date.now() });
    if (!won) return db.getChallenge(guildId, challengeId);
    db.adjustWallet(guildId, challenge.challenger_id, challenge.currency_id, challenge.stake_amount);
    db.adjustWallet(guildId, challenge.opponent_id, challenge.currency_id, challenge.stake_amount);
    return db.getChallenge(guildId, challengeId);
  }

  const winnerId = challengerKills > opponentKills ? challenge.challenger_id : challenge.opponent_id;
  return settleChallenge(guildId, challengeId, winnerId);
}

/** Background sweep (utils/backgroundLoops.js) - expired OPEN challenges never had any money escrowed (see acceptChallenge's ordering), so expiring one is a pure status flip, nothing to refund. */
function runChallengeExpiryTick() {
  for (const challenge of db.listExpiredOpenChallenges()) {
    db.tryTransitionChallenge(challenge.id, "OPEN", "EXPIRED");
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function buildChallengeSentView(guildId, challenge) {
  const currency = db.getCurrency(guildId, challenge.currency_id);
  const embed = infoEmbed(
    "⚔️ Challenge Sent",
    `<@${challenge.challenger_id}> has challenged <@${challenge.opponent_id}>!\n\nStake: **${fmtAmount(currency, challenge.stake_amount)}** each\nPot: **${fmtAmount(currency, challenge.stake_amount * 2)}**\nFirst to **${challenge.kill_target} kills** on the other wins.\nExpires in 10 minutes.`
  );
  return { embeds: [embed], components: [challengeRow(challenge.id)] };
}

/** Shown right after Accept - the duel is now LIVE and tracked by real in-game kills, not settled yet. */
function buildDuelStartedView(guildId, challenge, duel) {
  const currency = db.getCurrency(guildId, challenge.currency_id);
  const embed = successEmbed(
    "🎯 Duel Live",
    `<@${challenge.challenger_id}> vs <@${challenge.opponent_id}> - first to **${duel.kill_target} kills** on the other wins the **${fmtAmount(currency, challenge.stake_amount * 2)}** pot.\n\nTracked live by real kills (\`${duel.challenger_gamertag}\` vs \`${duel.opponent_gamertag}\`) - no need to report the result, it settles automatically.`
  );
  return { embeds: [embed], components: [] };
}

function buildChallengeResultView(guildId, challenge) {
  const currency = db.getCurrency(guildId, challenge.currency_id);
  const loserId = challenge.winner_id === challenge.challenger_id ? challenge.opponent_id : challenge.challenger_id;
  const embed = successEmbed(
    "🏆 Challenge Settled",
    `<@${challenge.winner_id}> defeated <@${loserId}>!\n\nPot: **${fmtAmount(currency, challenge.stake_amount * 2)}**\nWinner receives the full pot.`
  );
  return { embeds: [embed] };
}

/** The duel timed out tied (including 0-0) - stakes refunded, nobody's a "winner". */
function buildChallengeForfeitedView(guildId, challenge) {
  const currency = db.getCurrency(guildId, challenge.currency_id);
  const embed = infoEmbed(
    "⏱️ Duel Timed Out",
    `Neither <@${challenge.challenger_id}> nor <@${challenge.opponent_id}> reached the kill target in time, tied - both stakes (**${fmtAmount(currency, challenge.stake_amount)}** each) were refunded.`
  );
  return { embeds: [embed] };
}

/** Handles challenge:accept:<id> / challenge:decline:<id> - only the challenged opponent can act on either button (checked inside acceptChallenge/declineChallenge above). */
async function handleComponent(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const challengeId = Number(parts[2]);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (action === "accept") {
    const result = acceptChallenge(guildId, challengeId, userId, interaction.channelId);
    if (!result.ok) {
      await interaction.reply({ embeds: [dangerEmbed("Can't Accept", result.reason)], ephemeral: true });
      return;
    }
    await interaction.update(buildDuelStartedView(guildId, result.challenge, result.duel));
    return;
  }
  if (action === "decline") {
    const result = declineChallenge(guildId, challengeId, userId);
    if (!result.ok) {
      await interaction.reply({ embeds: [dangerEmbed("Can't Decline", result.reason)], ephemeral: true });
      return;
    }
    await interaction.update({ embeds: [dangerEmbed("Challenge Declined", "This Challenge was declined - no money changed hands.")], components: [] });
    return;
  }
}

module.exports = {
  createChallenge,
  acceptChallenge,
  declineChallenge,
  settleChallenge,
  forfeitChallengeDuel,
  runChallengeExpiryTick,
  buildChallengeSentView,
  buildDuelStartedView,
  buildChallengeResultView,
  buildChallengeForfeitedView,
  handleComponent,
  onChallengeSettled,
  CHALLENGE_EXPIRY_MS,
  VALID_KILL_TARGETS,
};

"use strict";

/**
 * JSON API for Koba-rivals (the standalone swipe-matching React app,
 * github.com/smking89/Koba-rivals) - a separate frontend, likely hosted on
 * its own origin, that needs real KOBA data instead of its own seeded mock
 * arrays (src/data/players.ts, src/data/servers.ts). Rust Console Edition
 * only for now - this bot (and therefore boom_identities/directory_servers)
 * has no data for any other game Koba-rivals' UI lists.
 *
 * AUTH HANDOFF - Koba-rivals can't read this app's HttpOnly koba_player
 * cookie (different origin, and SameSite=Lax wouldn't ride along on a
 * cross-origin fetch anyway even if it weren't HttpOnly). So login is a
 * one-time-code handoff instead of a shared cookie:
 *   1. Koba-rivals' "Sign in" button does a normal top-level navigation to
 *      GET /auth/discord?returnTo=/rivals/handoff - a real page navigation,
 *      so the koba_player cookie DOES get set on this origin after the
 *      existing Discord OAuth flow completes (admin/discordAuth.js,
 *      unchanged).
 *   2. GET /rivals/handoff (below, requires that now-set cookie) mints a
 *      single-use, 2-minute exchange code and redirects (another top-level
 *      navigation) to RIVALS_APP_URL/auth/callback?code=... .
 *   3. Koba-rivals' callback page POSTs that code to
 *      /api/rivals/exchange (ordinary cross-origin fetch, no cookie
 *      involved - the code itself is the one-time credential) and gets
 *      back a long-lived signed bearer token, which it stores itself and
 *      sends as `Authorization: Bearer <token>` on every call after that.
 *
 * The exchange-code cache is a plain in-memory Map, same convention as
 * (and NOT shared with) utils/linkPanel.js-style short-lived caches
 * elsewhere in this codebase - safe here because this is one long-running
 * Node process, not a multi-instance serverless deploy.
 */

const express = require("express");
const crypto = require("crypto");
const db = require("../database/db");
const { requirePlayerAuth, readPlayerSession, signPlayerToken, verifyPlayerToken, COOKIE_NAME } = require("./playerAuth");
const { progressionRankForLevel, prestigeTier } = require("../config/progressionRanks");
const { scoreTierFor } = require("../config/kobaScoreTiers");
const { entitlementsFor, todayKey } = require("../config/playerPlans");
const { subBadgeForTenure } = require("../config/subBadges");
const { computeServerAchievementScore, serverAchievementTierForScore } = require("../config/serverAchievements");

const router = express.Router();

// Minimal hand-rolled CORS, scoped to just this router - Koba-rivals is a
// cross-origin SPA and the /api/rivals/* routes carry no cookie (the
// bearer token is read from the Authorization header, not a cookie), so
// this never needs Access-Control-Allow-Credentials - only one explicit
// origin is ever allowed, read from the same RIVALS_APP_URL config as the
// login handoff redirect, never reflected from the request's own Origin.
router.use((req, res, next) => {
  const allowed = (process.env.RIVALS_APP_URL || "").trim().replace(/\/+$/, "");
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const EXCHANGE_CODE_TTL_MS = 2 * 60 * 1000;
const exchangeCodes = new Map(); // code -> { session, expiresAt }

function sweepExchangeCodes() {
  const now = Date.now();
  for (const [code, entry] of exchangeCodes) {
    if (entry.expiresAt < now) exchangeCodes.delete(code);
  }
}

/** Only ever used as a redirect target after the one-time-code handoff - RIVALS_APP_URL is operator-configured (.env), never taken from the request, so this can't become an open redirect. */
function rivalsAppUrl() {
  const base = (process.env.RIVALS_APP_URL || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("RIVALS_APP_URL must be set in .env before the Koba-rivals login handoff can work.");
  return base;
}

/** GET /rivals/handoff - reuses the existing player-dashboard cookie auth (just set by the Discord OAuth redirect) to mint a one-time code, then bounces to Koba-rivals' own callback page with it. */
router.get("/rivals/handoff", requirePlayerAuth, (req, res) => {
  sweepExchangeCodes();
  const code = crypto.randomBytes(24).toString("base64url");
  exchangeCodes.set(code, { session: req.player, expiresAt: Date.now() + EXCHANGE_CODE_TTL_MS });

  let target;
  try {
    target = `${rivalsAppUrl()}/auth/callback?code=${encodeURIComponent(code)}`;
  } catch (err) {
    res.status(500).send(err.message);
    return;
  }
  res.redirect(target);
});

/** Express middleware for every /api/rivals/* data route below - accepts either the cross-origin bearer token OR the same-origin cookie (the latter mostly useful for local testing against this API directly). */
function requireRivalsAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const session = verifyPlayerToken(authHeader.slice("Bearer ".length).trim());
    if (!session) return res.status(401).json({ error: "invalid_or_expired_token" });
    req.player = session;
    return next();
  }
  const session = readPlayerSession(req);
  if (!session) return res.status(401).json({ error: "not_signed_in" });
  req.player = session;
  return next();
}

router.post("/api/rivals/exchange", express.json(), (req, res) => {
  sweepExchangeCodes();
  const code = req.body?.code;
  const entry = code ? exchangeCodes.get(code) : null;
  if (!entry || entry.expiresAt < Date.now()) return res.status(404).json({ error: "code_not_found_or_expired" });
  exchangeCodes.delete(code); // one-time - a replay of the same code always misses from here on

  const token = signPlayerToken(entry.session);
  res.json({ token, kobaid: entry.session.kobaid, discordId: entry.session.discordId, username: entry.session.username, avatar: entry.session.avatar });
});

/**
 * Builds the rank/score block shared by /me and /players - `score` is the
 * real GLOBAL KOBA Score (utils/kobaScore.js, Challenge-outcome-driven,
 * keyed by discord_id - no cross-guild ambiguity, unlike the old per-guild
 * kill Elo this used to report). `streak`/`level`/`prestige`/`rank` still
 * carry the cross-guild-MAX stopgap caveat (see db.getBestKnownPvpStreak/
 * getBestKnownProgression headers) until those become unified too.
 */
function progressionBlock(discordId, gamertag) {
  const kobaScore = db.getKobaScore(discordId);
  const progression = db.getBestKnownProgression(discordId);
  const rank = progressionRankForLevel(progression.level);
  const prestige = prestigeTier(progression.prestige);
  const scoreTier = scoreTierFor(kobaScore.rating);
  const subBadge = subBadgeForTenure(db.getSubscriptionTenureMonths(discordId));
  return {
    score: Math.round(kobaScore.rating),
    scoreTier: scoreTier.name,
    wins: kobaScore.wins,
    losses: kobaScore.losses,
    streak: gamertag ? db.getBestKnownPvpStreak(gamertag) : 0,
    level: progression.level,
    rankName: rank.name,
    rankBadgeUrl: rank.badgeUrl,
    prestige: progression.prestige,
    prestigeName: prestige?.name || null,
    prestigeBadgeUrl: prestige?.badgeUrl || null,
    subBadgeName: subBadge?.name || null,
    subBadgeUrl: subBadge?.badgeUrl || null,
  };
}

/** Basic/Pro/Max entitlements + today's real (server-side) usage against them - config/playerPlans.js's header explains why this is a separate system from the guild-owner plan. */
function planBlock(discordId) {
  const plan = db.getPlayerPlan(discordId);
  const entitlements = entitlementsFor(plan);
  const day = todayKey();
  return {
    plan,
    entitlements,
    usage: {
      swipesToday: db.getDailyUsage(discordId, day, "swipes"),
      challengesCreatedToday: db.getDailyUsage(discordId, day, "challenges_created"),
      activeCreatedChallenges: db.countActiveCreatedChallenges(discordId),
    },
  };
}

/** Merges the web-dashboard identity (player_accounts, via the session) with the Discord-bot identity (boom_identities, via discordId) - the two separate identity tables this whole codebase runs on (see schema.sql's player_accounts/boom_identities headers). Either half can be missing: a player who signed in without ever running /link has no boom identity yet. */
router.get("/api/rivals/me", requireRivalsAuth, (req, res) => {
  const identity = req.player.discordId ? db.getBoomIdentityByDiscordId(req.player.discordId) : null;
  const gamertag = identity?.platform_id || null;
  res.json({
    kobaid: req.player.kobaid,
    discordId: req.player.discordId,
    username: req.player.username,
    avatar: req.player.avatar,
    gamertag,
    platform: identity?.platform || null,
    tags: identity ? JSON.parse(identity.tags || "[]") : [],
    linked: Boolean(gamertag),
    ...progressionBlock(req.player.discordId, gamertag),
    ...planBlock(req.player.discordId),
  });
});

/**
 * Server-side swipe counter (Basic's 20/day cap, config/playerPlans.js) -
 * Koba-rivals calls this once per swipe. Enforced here, not trusted from
 * the client, specifically so the cap can't be bypassed by clearing
 * localStorage (the client-side decisions/swipes count this app already
 * tracks for its own UI state).
 */
router.post("/api/rivals/swipe", requireRivalsAuth, (req, res) => {
  const entitlements = entitlementsFor(db.getPlayerPlan(req.player.discordId));
  const day = todayKey();
  const used = db.getDailyUsage(req.player.discordId, day, "swipes");
  if (entitlements.dailySwipeLimit !== null && used >= entitlements.dailySwipeLimit) {
    return res.status(403).json({ error: "swipe_limit_reached", limit: entitlements.dailySwipeLimit });
  }
  const newCount = db.incrementDailyUsage(req.player.discordId, day, "swipes");
  res.json({ ok: true, swipesToday: newCount, limit: entitlements.dailySwipeLimit });
});

/** The swipe deck's real player pool - see db.listSwipeablePlayers's header for the exact filter. */
router.get("/api/rivals/players", requireRivalsAuth, (req, res) => {
  const rows = db.listSwipeablePlayers(req.player.discordId, 50);
  res.json({
    data: rows.map((row) => ({
      id: row.boom_id,
      username: row.username || row.platform_id,
      gamertag: row.platform_id,
      platform: row.platform,
      tags: JSON.parse(row.tags || "[]"),
      ...progressionBlock(row.discord_id, row.platform_id),
    })),
  });
});

/** Real, admin-registered Rust Console Edition servers (/directory-setup) - not a game-connect IP (Rust Console Edition has no typed server-connect command; players join through the in-game server browser), so `invite` is a Discord invite, the actual way to find/join one of these communities. */
router.get("/api/rivals/servers", requireRivalsAuth, (_req, res) => {
  const rows = db.listDirectoryServers();
  res.json({
    data: rows.map((row) => {
      const score = computeServerAchievementScore({
        eventsHosted: row.events_hosted_count,
        eventsCompleted: row.events_completed_count,
        followers: db.getDirectoryFollowerCount(row.guild_id),
      });
      const achievementTier = serverAchievementTierForScore(score);
      return {
        id: String(row.id),
        name: row.title,
        invite: row.invite_url,
        tags: row.tags,
        players: row.player_count,
        maxPlayers: row.max_players,
        queued: row.queued,
        active: Boolean(row.telemetry_at && Date.now() - row.telemetry_at < 10 * 60 * 1000),
        achievementScore: score,
        achievementTierName: achievementTier.name,
        achievementBadgeUrl: achievementTier.badgeUrl,
      };
    }),
  });
});

module.exports = { router, COOKIE_NAME };

"use strict";

/**
 * Session cookie for the player-facing web dashboard - deliberately
 * separate from admin/auth.js's bb_admin staff-session namespace (different
 * trust/role model: this cookie just proves "this browser is Discord user
 * X", no role/permission concept at all). Same HMAC-signed-cookie pattern,
 * duplicated rather than shared so admin and player sessions can never be
 * confused for one another by a cookie-name collision.
 */

const crypto = require("crypto");
const { parseCookies } = require("./auth");

const COOKIE_NAME = "koba_player";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret() {
  if (!process.env.ADMIN_SESSION_SECRET) {
    throw new Error("ADMIN_SESSION_SECRET must be set in .env before player login can work.");
  }
  // Distinct HMAC key derived from the same base secret (not reused
  // verbatim) so a leaked player-session signature can't be replayed
  // against the staff-session verifier or vice versa.
  return crypto.createHash("sha256").update(process.env.ADMIN_SESSION_SECRET + ":player").digest();
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expectedMac = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  if (mac.length !== expectedMac.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// kobaid is the one real identity now (database/schema.sql's player_accounts
// header) - a session can come from Discord OAuth or email/password, so
// discordId is carried for convenience (gamertag-link features key off it)
// but is nullable: an email-only account has no discordId until they link
// one. Never trust discordId alone to mean "this is who the player is" -
// kobaid is the field every other player-facing lookup should use.
function createPlayerSessionCookie({ kobaid, discordId, username, avatar }) {
  const token = sign({ exp: Date.now() + SESSION_TTL_MS, kobaid, discordId: discordId || null, username, avatar: avatar || null });
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearPlayerSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Same signed payload/verification as the cookie above, but as a plain
 * bearer token string - for a cross-origin client (e.g. Koba-rivals,
 * hosted on its own domain) that can't read this app's HttpOnly cookie at
 * all. Minted once via the /rivals/handoff one-time-code exchange
 * (admin/rivalsApi.js), then sent as `Authorization: Bearer <token>` on
 * every request after that - same TTL as the cookie.
 */
function signPlayerToken({ kobaid, discordId, username, avatar }) {
  return sign({ exp: Date.now() + SESSION_TTL_MS, kobaid, discordId: discordId || null, username, avatar: avatar || null });
}

/** Verifies a bearer token minted by signPlayerToken - same shape requirePlayerAuth attaches to req.player, or null if invalid/expired. */
function verifyPlayerToken(token) {
  const session = verify(token);
  return session ? { kobaid: session.kobaid, discordId: session.discordId, username: session.username, avatar: session.avatar } : null;
}

/** Express middleware: redirects to /auth/login unless a valid player session cookie is present. Also enforces the required-onboarding gate (interests/games/platforms) before anything else in the dashboard is reachable, regardless of which login method was used. Attaches req.player. */
function requirePlayerAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = verify(cookies[COOKIE_NAME]);
  if (!session) {
    res.redirect("/auth/login?returnTo=" + encodeURIComponent(req.originalUrl));
    return;
  }
  req.player = { kobaid: session.kobaid, discordId: session.discordId, username: session.username, avatar: session.avatar };

  // Lazy require to avoid a circular require at module-load time (db.js has
  // no dependency on this file, so this is only a style/ordering concern,
  // not a real cycle - kept lazy anyway to match how this file avoids
  // importing db.js at the top for every other function here).
  const db = require("../database/db");
  if (!db.isPlayerOnboardingComplete(session.kobaid) && req.path !== "/onboarding") {
    res.redirect("/auth/onboarding?returnTo=" + encodeURIComponent(req.originalUrl));
    return;
  }
  next();
}

/** Non-redirecting version for routes that render differently when logged out instead of forcing a login (e.g. a public page with an optional account widget). Does NOT enforce the onboarding gate - callers that need that should use requirePlayerAuth instead. */
function readPlayerSession(req) {
  const cookies = parseCookies(req);
  const session = verify(cookies[COOKIE_NAME]);
  return session ? { kobaid: session.kobaid, discordId: session.discordId, username: session.username, avatar: session.avatar } : null;
}

module.exports = {
  COOKIE_NAME,
  createPlayerSessionCookie,
  clearPlayerSessionCookie,
  requirePlayerAuth,
  readPlayerSession,
  signPlayerToken,
  verifyPlayerToken,
};

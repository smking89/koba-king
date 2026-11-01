"use strict";

const crypto = require("crypto");

const COOKIE_NAME = "bb_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
  // ADMIN_SESSION_SECRET should be a long random string in .env. Falling
  // back to a hash of the password means sessions are still per-deployment
  // unique, but you should set a real secret before exposing this publicly.
  return process.env.ADMIN_SESSION_SECRET || crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD || "").digest("hex");
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

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((pair) => {
      const idx = pair.indexOf("=");
      return [pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim())];
    })
  );
}

/**
 * `staffUser` is the row from db.authenticateStaffUser() - only
 * id/username/role are put in the cookie payload (never the password hash).
 */
function createSessionCookie(staffUser) {
  const token = sign({
    exp: Date.now() + SESSION_TTL_MS,
    userId: staffUser.id,
    username: staffUser.username,
    role: staffUser.role,
  });
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Express middleware: redirects to /admin/login unless a valid session cookie is present. Attaches req.staffUser. */
function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = verify(cookies[COOKIE_NAME]);
  if (!session) {
    res.redirect("/admin/login");
    return;
  }
  req.staffUser = { id: session.userId, username: session.username, role: session.role };
  next();
}

/**
 * Express middleware factory: 403s unless the logged-in staff user's role
 * is in `allowedRoles`. Must run after requireAuth (needs req.staffUser).
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.staffUser || !allowedRoles.includes(req.staffUser.role)) {
      res.status(403).send("You don't have permission to view this page.");
      return;
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, parseCookies, createSessionCookie, clearSessionCookie, COOKIE_NAME };

"use strict";

/**
 * Email/password login for the player web dashboard (2026-10-15) - the
 * second of two ways into the same player_accounts/KOBAid system Discord
 * OAuth uses (see admin/discordAuth.js, database/schema.sql's
 * player_accounts header). GET/POST /auth/register, GET/POST /auth/login,
 * GET/POST /auth/onboarding (the required interests/games/platforms step -
 * enforced for BOTH login methods by admin/playerAuth.js's
 * requirePlayerAuth, not just this one).
 *
 * No email-sending infrastructure exists in this codebase yet (confirmed
 * earlier this session) - registration does NOT claim to send a
 * verification email, since it wouldn't actually arrive. Real email
 * verification is separate, not-yet-built work.
 */

const express = require("express");
const db = require("../database/db");
const { escapeHtml } = require("./layout");
const { createPlayerSessionCookie, readPlayerSession } = require("./playerAuth");
const { renderAppShell, renderSiteFooter, SITE_STYLES } = require("./site");
const { readSiteSettings } = require("./siteSettingsSchema");

const router = express.Router();

// Rust Console Edition is the only real game this bot supports today -
// listed honestly as one option rather than padding the list with games
// that aren't actually integrated. More get added here if/when they are.
const GAME_OPTIONS = [{ value: "rust", label: "Rust (Console Edition)" }];

const PLATFORM_OPTIONS = [
  { value: "console", label: "Console" },
  { value: "pc", label: "PC" },
  { value: "mobile", label: "Mobile" },
  { value: "web", label: "Web" },
];

// First-draft content list, not pulled from any existing product catalog -
// flagged to the user as adjustable, not a fixed/final taxonomy.
const INTEREST_OPTIONS = [
  { value: "pvp", label: "PvP" },
  { value: "pve", label: "PvE" },
  { value: "building", label: "Building" },
  { value: "raiding", label: "Raiding" },
  { value: "trading", label: "Trading" },
  { value: "clan-wars", label: "Clan Wars" },
  { value: "events", label: "Events" },
  { value: "roleplay", label: "Roleplay" },
  { value: "farming", label: "Farming" },
  { value: "competitive", label: "Leaderboards / Competitive" },
  { value: "solo", label: "Solo Play" },
  { value: "squads", label: "Teamwork / Squads" },
];

const MIN_INTERESTS = 4;

function safeReturnTo(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const AUTH_PAGE_STYLES = `
  .auth-wrap { max-width: 420px; margin: 0 auto; padding: var(--space-8) var(--space-4) var(--space-10); }
  .auth-card { background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-6); }
  .auth-card h1 { font-size: 20px; margin: 0 0 var(--space-5); }
  .auth-field { margin-bottom: var(--space-4); }
  .auth-field label { display: block; font-size: 13px; color: var(--ink-dim); margin-bottom: 6px; }
  .auth-field input { width: 100%; background: var(--bg-panel-raised); border: 1px solid var(--line); color: var(--ink); padding: 10px 12px; font-size: 14px; border-radius: var(--radius-sm); }
  .auth-field input:focus { outline: none; border-color: var(--magenta); }
  .auth-error { color: var(--danger); font-size: 13px; margin-bottom: var(--space-4); }
  .auth-divider { display: flex; align-items: center; gap: 12px; margin: var(--space-5) 0; color: var(--ink-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .auth-switch { text-align: center; margin-top: var(--space-5); font-size: 13.5px; color: var(--ink-dim); }
  .auth-switch a { color: var(--magenta); text-decoration: none; }

  .onboard-section { margin-bottom: var(--space-6); }
  .onboard-section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim); margin-bottom: 4px; }
  .onboard-section .hint { font-size: 12.5px; color: var(--ink-dim); margin-bottom: var(--space-3); }
  .chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip-option { position: relative; }
  .chip-option input { position: absolute; opacity: 0; pointer-events: none; }
  .chip-option label { display: inline-flex; align-items: center; padding: 8px 16px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; color: var(--ink-dim); cursor: pointer; transition: all .15s ease; }
  .chip-option input:checked + label { background: var(--magenta); border-color: var(--magenta); color: #fff; }
`;

function renderAuthPage({ title, body, settings }) {
  const discordInviteUrl = escapeHtml(settings.discord_invite_url || "");
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — KOBA</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${SITE_STYLES}${AUTH_PAGE_STYLES}</style>
</head>
<body class="app-shell">
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs><linearGradient id="tab-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" class="grad-stop-1" /><stop offset="100%" class="grad-stop-2" /></linearGradient></defs>
</svg>
${renderAppShell({ active: "home" })}
<main class="auth-wrap">
  ${body}
</main>
${renderSiteFooter({ activeTab: "home", discordInviteUrl })}
</body>
</html>`;
}

router.get("/login", (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo);
  const error = req.query.error ? escapeHtml(req.query.error) : null;
  const body = `
    <div class="auth-card">
      <h1>Log In</h1>
      ${error ? `<div class="auth-error">${error}</div>` : ""}
      <a class="btn btn-primary" style="width:100%; margin-bottom: 4px;" href="/auth/discord?returnTo=${encodeURIComponent(returnTo)}">Continue with Discord</a>
      <div class="auth-divider">or</div>
      <form method="post" action="/auth/login">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
        <div class="auth-field"><label>Email</label><input type="email" name="email" required autocomplete="email" /></div>
        <div class="auth-field"><label>Password</label><input type="password" name="password" required autocomplete="current-password" /></div>
        <button class="btn btn-ghost" style="width:100%;" type="submit">Log In with Email</button>
      </form>
      <div class="auth-switch">Don't have an account? <a href="/auth/register?returnTo=${encodeURIComponent(returnTo)}">Register</a></div>
    </div>
  `;
  res.send(renderAuthPage({ title: "Log In", body, settings: readSiteSettings(db) }));
});

router.post("/login", express.urlencoded({ extended: false }), (req, res) => {
  const returnTo = safeReturnTo(req.body.returnTo);
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");

  const account = db.authenticatePlayerEmail(email, password);
  if (!account) {
    res.redirect(`/auth/login?error=${encodeURIComponent("Incorrect email or password.")}&returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  res.setHeader("Set-Cookie", createPlayerSessionCookie({ kobaid: account.kobaid, discordId: account.discord_id, username: account.username }));
  res.redirect(db.isPlayerOnboardingComplete(account.kobaid) ? returnTo : `/auth/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
});

router.get("/register", (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo);
  const error = req.query.error ? escapeHtml(req.query.error) : null;
  const body = `
    <div class="auth-card">
      <h1>Create Your Account</h1>
      ${error ? `<div class="auth-error">${error}</div>` : ""}
      <a class="btn btn-primary" style="width:100%; margin-bottom: 4px;" href="/auth/discord?returnTo=${encodeURIComponent(returnTo)}">Continue with Discord</a>
      <div class="auth-divider">or</div>
      <form method="post" action="/auth/register">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
        <div class="auth-field"><label>Display Name</label><input type="text" name="username" required maxlength="32" autocomplete="nickname" /></div>
        <div class="auth-field"><label>Email</label><input type="email" name="email" required autocomplete="email" /></div>
        <div class="auth-field"><label>Password</label><input type="password" name="password" required minlength="8" autocomplete="new-password" /></div>
        <div class="auth-field"><label>Confirm Password</label><input type="password" name="confirmPassword" required minlength="8" autocomplete="new-password" /></div>
        <button class="btn btn-ghost" style="width:100%;" type="submit">Register with Email</button>
      </form>
      <div class="auth-switch">Already have an account? <a href="/auth/login?returnTo=${encodeURIComponent(returnTo)}">Log In</a></div>
    </div>
  `;
  res.send(renderAuthPage({ title: "Register", body, settings: readSiteSettings(db) }));
});

router.post("/register", express.urlencoded({ extended: false }), (req, res) => {
  const returnTo = safeReturnTo(req.body.returnTo);
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const fail = (msg) => res.redirect(`/auth/register?error=${encodeURIComponent(msg)}&returnTo=${encodeURIComponent(returnTo)}`);

  if (!username || username.length > 32) return fail("Display name is required (max 32 characters).");
  if (!isValidEmail(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  if (password !== confirmPassword) return fail("Passwords don't match.");
  if (db.getPlayerAccountByEmail(email)) return fail("An account with that email already exists - log in instead.");

  const account = db.createPlayerAccountWithEmail(email, password, username);
  res.setHeader("Set-Cookie", createPlayerSessionCookie({ kobaid: account.kobaid, username: account.username }));
  res.redirect(`/auth/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
});

router.get("/onboarding", (req, res) => {
  const session = readPlayerSession(req);
  if (!session) {
    res.redirect("/auth/login");
    return;
  }
  const returnTo = safeReturnTo(req.query.returnTo);
  const error = req.query.error ? escapeHtml(req.query.error) : null;

  const chips = (options, name) =>
    options
      .map(
        (o, i) =>
          `<div class="chip-option"><input type="checkbox" id="${name}-${i}" name="${name}" value="${escapeHtml(o.value)}" /><label for="${name}-${i}">${escapeHtml(o.label)}</label></div>`
      )
      .join("");

  const body = `
    <div class="auth-card">
      <h1>Finish Setting Up Your Account</h1>
      ${error ? `<div class="auth-error">${error}</div>` : ""}
      <form method="post" action="/auth/onboarding">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
        <div class="onboard-section">
          <h2>Platform</h2>
          <div class="hint">Pick at least 1.</div>
          <div class="chip-grid">${chips(PLATFORM_OPTIONS, "platforms")}</div>
        </div>
        <div class="onboard-section">
          <h2>Games</h2>
          <div class="hint">Pick at least 1.</div>
          <div class="chip-grid">${chips(GAME_OPTIONS, "games")}</div>
        </div>
        <div class="onboard-section">
          <h2>Interests</h2>
          <div class="hint">Pick at least ${MIN_INTERESTS}.</div>
          <div class="chip-grid">${chips(INTEREST_OPTIONS, "interests")}</div>
        </div>
        <button class="btn btn-primary" style="width:100%;" type="submit">Finish Setup</button>
      </form>
    </div>
  `;
  res.send(renderAuthPage({ title: "Finish Setup", body, settings: readSiteSettings(db) }));
});

router.post("/onboarding", express.urlencoded({ extended: false }), (req, res) => {
  const session = readPlayerSession(req);
  if (!session) {
    res.redirect("/auth/login");
    return;
  }
  const returnTo = safeReturnTo(req.body.returnTo);
  const fail = (msg) => res.redirect(`/auth/onboarding?error=${encodeURIComponent(msg)}&returnTo=${encodeURIComponent(returnTo)}`);

  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const platformValues = new Set(PLATFORM_OPTIONS.map((o) => o.value));
  const gameValues = new Set(GAME_OPTIONS.map((o) => o.value));
  const interestValues = new Set(INTEREST_OPTIONS.map((o) => o.value));

  const platforms = toArray(req.body.platforms).filter((v) => platformValues.has(v));
  const games = toArray(req.body.games).filter((v) => gameValues.has(v));
  const interests = toArray(req.body.interests).filter((v) => interestValues.has(v));

  if (platforms.length < 1) return fail("Pick at least 1 platform.");
  if (games.length < 1) return fail("Pick at least 1 game.");
  if (interests.length < MIN_INTERESTS) return fail(`Pick at least ${MIN_INTERESTS} interests.`);

  db.setPlayerOnboarding(session.kobaid, { interests, games, platforms });
  res.redirect(returnTo);
});

module.exports = router;

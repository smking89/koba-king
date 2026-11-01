"use strict";

/**
 * Discord OAuth2 login for the player web dashboard - GET /auth/discord
 * starts the flow, GET /auth/discord/callback finishes it. Separate from
 * admin/auth.js's staff login entirely (see admin/playerAuth.js's header).
 * Requires DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET in .env (already used
 * for the bot itself, so DISCORD_CLIENT_ID likely already existed) and the
 * exact redirect URI below registered in the Developer Portal under
 * OAuth2 -> Redirects.
 */

const crypto = require("crypto");
const express = require("express");
const db = require("../database/db");
const { parseCookies } = require("./auth");
const { createPlayerSessionCookie } = require("./playerAuth");

const router = express.Router();

const REDIRECT_URI = "https://koba.games/auth/discord/callback";
const STATE_COOKIE = "koba_oauth_state";

function requireOAuthEnv(res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    res.status(500).send("Discord login isn't configured yet (missing DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET).");
    return false;
  }
  return true;
}

/** Only ever used as an internal redirect target after login - never sent back to Discord or rendered raw, so an open-redirect via a crafted returnTo can't escape this site. */
function safeReturnTo(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

router.get("/discord", (req, res) => {
  if (!requireOAuthEnv(res)) return;

  const state = crypto.randomBytes(16).toString("hex");
  const returnTo = safeReturnTo(req.query.returnTo);

  // State carries the post-login destination too, so the callback doesn't
  // need a second cookie - HMAC isn't needed here since this value never
  // grants anything by itself, it's only compared byte-for-byte against
  // what Discord echoes back (standard OAuth CSRF-state pattern).
  res.setHeader("Set-Cookie", `${STATE_COOKIE}=${encodeURIComponent(state + "|" + returnTo)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);

  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
});

router.get("/discord/callback", async (req, res) => {
  if (!requireOAuthEnv(res)) return;

  const cookies = parseCookies(req);
  const stored = cookies[STATE_COOKIE] || "";
  const [storedState, returnTo] = stored.split("|");
  res.setHeader("Set-Cookie", `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);

  if (!req.query.code || !req.query.state || req.query.state !== storedState) {
    res.status(400).send("Login failed - the request expired or was tampered with. Go back and try again.");
    return;
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      console.error("[KOBA Bot] Discord OAuth token exchange failed:", tokenRes.status, await tokenRes.text());
      res.status(502).send("Discord login failed - couldn't exchange the code for a token. Try again.");
      return;
    }
    const tokenData = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      console.error("[KOBA Bot] Discord OAuth /users/@me failed:", userRes.status, await userRes.text());
      res.status(502).send("Discord login failed - couldn't fetch your account. Try again.");
      return;
    }
    const discordUser = await userRes.json();

    db.upsertKnownUser(discordUser.id, discordUser.username);
    // Registering (or logging in) with Discord goes through the exact same
    // player_accounts/KOBAid system as email/password - a Discord login is
    // NOT exempt from the required-onboarding gate (requirePlayerAuth
    // enforces this on the next request regardless of login method), per
    // direct instruction.
    const { account } = db.findOrCreatePlayerAccountByDiscord(discordUser.id, discordUser.username);
    res.setHeader("Set-Cookie", [
      `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      createPlayerSessionCookie({ kobaid: account.kobaid, discordId: discordUser.id, username: discordUser.username, avatar: discordUser.avatar }),
    ]);
    res.redirect(safeReturnTo(returnTo));
  } catch (err) {
    console.error("[KOBA Bot] Discord OAuth callback error:", err);
    res.status(500).send("Something went wrong logging you in. Try again.");
  }
});

router.post("/logout", (req, res) => {
  const { clearPlayerSessionCookie } = require("./playerAuth");
  res.setHeader("Set-Cookie", clearPlayerSessionCookie());
  res.redirect("/");
});

module.exports = router;

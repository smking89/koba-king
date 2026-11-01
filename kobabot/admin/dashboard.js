"use strict";

/**
 * Everything under /dashboard used to be a full Discord-OAuth player/
 * server-owner web account (login, an account dashboard, settings, server
 * management, onboarding, team/shop/marketplace/referral/LFG mirrors, a
 * Messages inbox). None of it saw real use - every one of those features
 * already exists in Discord itself - so the whole login system was removed
 * (2026-09-16) along with every page/route that depended on it. What's
 * left here is just the one thing that never needed a login: submitting a
 * support ticket from the website, which lands in the exact same staff
 * queue (admin/tickets.js) as a Discord-side /support ticket, identified by
 * a Discord user ID the submitter types in rather than a session.
 */

const express = require("express");
const db = require("../database/db");
const { escapeHtml } = require("./layout");
const { requirePlayerAuth, clearPlayerSessionCookie } = require("./playerAuth");
const { getLevelInfo } = require("../utils/progression");
const { listRivals, otherSide } = require("../utils/rivalSystem");
const { renderAppShell, renderSiteFooter, SITE_STYLES } = require("./site");
const { readSiteSettings } = require("./siteSettingsSchema");

const router = express.Router();

// Progression/rivals/session-leaderboard are all per-guild in this
// codebase (see utils/rivalSystem.js, utils/progression.js) but this web
// dashboard only knows a Discord ID, no guild context - defaults to the
// flagship guild, same "pick the one official guild" pattern already used
// elsewhere (see events/ready.js's officialGuildIds()).
const FLAGSHIP_GUILD_ID = process.env.OFFICIAL_FLAGSHIP_GUILD_ID;

// Simple stroke-icon glyphs (no emoji anywhere in the dashboard UI, per
// direct product direction) - same 24x24/currentColor language as the nav
// icons in admin/site.js, just inlined here since these are dashboard-only.
function svgIcon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
const ICON = {
  controller: svgIcon(`<rect x="2.5" y="8" width="19" height="9" rx="4.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="13.5" r="1" fill="currentColor" stroke="none"/>`),
  flame: svgIcon(`<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1.5 1 2 3 2 4.5a5 5 0 0 1-10 0C7 10 9 7 12 2Z"/>`),
  bolt: svgIcon(`<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>`),
  sword: svgIcon(`<path d="M5 19 19 5M19 5h-4V3h6v6h-2V5Z" fill="currentColor"/><path d="M5 19 2 20l1-3"/>`),
  skull: svgIcon(`<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.3 5.2.4.5.7 1 .7 1.6V18h8v-1.2c0-.6.3-1.1.7-1.6C17.8 14 19 12.5 19 10a7 7 0 0 0-7-7Z"/><circle cx="9.3" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><path d="M10 21h4M9.5 18v2M14.5 18v2"/>`),
  chart: svgIcon(`<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`),
  clock: svgIcon(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`),
  crossedSwords: svgIcon(`<path d="M3 3l14 14M14 20l6-6M18 18l3 3M21 3L7 17M4 14l6 6M3 21l3-3"/>`),
};

/** Categorized stat pod (2026-10-15 visual overhaul) - colored dot indicates category: crimson for high-action metrics (Kills, K/D), muted gray for standard ones (Deaths, Playtime), per direct design spec. */
function statPod(icon, label, value, tone) {
  return `<div class="dash-pod">
    <span class="dash-pod-dot ${tone}"></span>
    <span class="dash-pod-icon">${icon}</span>
    <span class="dash-pod-label">${escapeHtml(label)}</span>
    <span class="dash-pod-value">${escapeHtml(String(value))}</span>
  </div>`;
}

/** Real "time ago" for the Recent Activity row - no fabricated session data, just actual pvp_kills rows. */
function timeAgo(ms) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Real logged-in dashboard (2026-10-15). Every stat here is backed by a
 * real table/query - nothing invented. Deliberately does NOT show a
 * "KOBA Score"/Elo (doesn't exist anywhere in this codebase), a Win Rate %
 * (the DB's win_rate column is an unrelated gambling-game setting, not a
 * PvP stat), or quest-style "Active Challenges" (the real /challenge
 * system is a 1v1 wagered duel between two specific players, not a
 * browsable quest board) - see the mockup-vs-real audit this page was
 * built from for the full breakdown.
 */
router.get("/", requirePlayerAuth, (req, res) => {
  const { kobaid, discordId, username } = req.player;
  const gamertag = db.getAnyLinkedGamertag(discordId);
  const avatarLetter = (username || "?").charAt(0).toUpperCase();

  const profileCard = `
    <div class="dash-profile">
      <div class="dash-avatar">${escapeHtml(avatarLetter)}</div>
      <div class="dash-profile-id">
        <div class="dash-profile-name">${escapeHtml(username)}</div>
        <div class="dash-profile-tag dim">${escapeHtml(kobaid)}</div>
        ${gamertag ? `<div class="dash-profile-tag">${ICON.controller} ${escapeHtml(gamertag)}</div>` : `<div class="dash-profile-tag dim">No gamertag linked</div>`}
      </div>
      <form method="post" action="/auth/logout"><button type="submit" class="btn ghost small">Log Out</button></form>
    </div>
  `;

  if (!gamertag || !FLAGSHIP_GUILD_ID) {
    const body = `
      ${profileCard}
      <div class="panel dash-fade" style="animation-delay:.15s;"><p style="margin:0;">No gamertag linked yet - run <code>/link</code> in Discord on a server you're rostered on to see your kills, playtime, and rank here.</p></div>
    `;
    res.send(renderDashboardPage({ body }));
    return;
  }

  // 2026-10-15 visual overhaul: asymmetric 70/30 layout (left = level/XP +
  // Recent Activity, right = categorized stat pods + Your Rival),
  // glassmorphism panels, a real-data badge grid (unlocked in color, every
  // OTHER badge this guild has defined shown locked/greyed - not invented,
  // db.getServerBadges() is the guild's actual configured badge catalog).
  const pvp = db.getPvpStatsForGamertag(FLAGSHIP_GUILD_ID, gamertag);
  const kd = pvp.deaths > 0 ? (pvp.kills / pvp.deaths).toFixed(2) : pvp.kills.toString();
  const minutes = db.getDirectoryPlaytime(FLAGSHIP_GUILD_ID, gamertag);
  const hours = (minutes / 60).toFixed(1);

  const progression = db.getPlayerProgression(FLAGSHIP_GUILD_ID, discordId);
  const levelInfo = getLevelInfo(FLAGSHIP_GUILD_ID, progression.xp);
  const earnedBadges = db.listPlayerBadges(FLAGSHIP_GUILD_ID, discordId);
  const allBadges = db.getServerBadges(FLAGSHIP_GUILD_ID);
  const earnedIds = new Set(earnedBadges.map((b) => b.id));
  const recentEvents = db.getRecentPvpEventsForGamertag(FLAGSHIP_GUILD_ID, gamertag, 6);

  const activeSession = db.getActiveSession(FLAGSHIP_GUILD_ID);
  const rank = activeSession ? db.getSessionRank(FLAGSHIP_GUILD_ID, activeSession.id, discordId) : null;

  const xpPct = levelInfo.atMaxLevel ? 100 : Math.round((levelInfo.xpIntoLevel / levelInfo.xpForNextLevel) * 100);

  const heroGlass = `
    <div class="dash-glass dash-hero-glass dash-fade" style="animation-delay:.1s;">
      <div class="dash-hero-ring" style="--ring-pct:${xpPct}%;">
        <div class="dash-hero-ring-inner">
          <div class="dash-hero-ring-value">${hours}h</div>
          <div class="dash-hero-ring-label">Hours Played</div>
        </div>
      </div>
      <div class="dash-hero-info">
        ${progression.prestige > 0 ? `<div class="dash-hero-prestige">${ICON.flame} Prestige ${progression.prestige}</div>` : ""}
        <div class="dash-hero-level">Level ${levelInfo.level}${levelInfo.atMaxLevel ? " (MAX)" : ""}</div>
        ${rank ? `<div class="dash-hero-rank">${ICON.bolt} Session Rank #${rank}</div>` : ""}
        <div class="dash-xpbar"><div class="dash-xpbar-fill" style="--target-width:${xpPct}%;"></div></div>
        <div class="dash-hero-xp">${levelInfo.atMaxLevel ? "Max level reached" : `${levelInfo.xpIntoLevel.toLocaleString()} / ${levelInfo.xpForNextLevel.toLocaleString()} XP to next level`} · Lifetime XP ${progression.lifetime_xp.toLocaleString()}</div>
      </div>
    </div>
  `;

  const recentSection = `
    <div class="dash-recent dash-fade" style="animation-delay:.2s;">
      <h2 class="dash-section-title">Recent Activity</h2>
      ${
        recentEvents.length
          ? `<div class="dash-recent-row">${recentEvents
              .map((ev) => {
                const won = ev.killer_gamertag === gamertag;
                const opponent = won ? ev.victim_gamertag : ev.killer_gamertag;
                return `<div class="dash-recent-tile ${won ? "win" : "loss"}">
                  <span class="dash-recent-icon">${won ? ICON.sword : ICON.skull}</span>
                  <div class="dash-recent-text">
                    <div class="dash-recent-title">${won ? "Eliminated" : "Killed by"} ${escapeHtml(opponent || "Unknown")}</div>
                    <div class="dash-recent-meta">${escapeHtml(ev.weapon || "Unknown weapon")} · ${timeAgo(ev.killed_at)}</div>
                  </div>
                </div>`;
              })
              .join("")}</div>`
          : `<div class="dash-recent-empty">No recent PvP activity logged yet.</div>`
      }
    </div>
  `;

  const statPods = `
    <div class="dash-glass dash-pods dash-fade" style="animation-delay:.15s;">
      ${statPod(ICON.sword, "Kills", pvp.kills, "crimson")}
      ${statPod(ICON.chart, "K/D", kd, "crimson")}
      ${statPod(ICON.skull, "Deaths", pvp.deaths, "muted")}
      ${statPod(ICON.clock, "Playtime", `${hours}h`, "muted")}
    </div>
  `;

  let rivalCompact = "";
  const rivalships = listRivals(FLAGSHIP_GUILD_ID, discordId);
  if (rivalships.length) {
    const rivalship = rivalships[0];
    const stats = db.getRivalshipStats(rivalship.id);
    const isA = rivalship.player_a === discordId;
    const myWins = isA ? stats.wins_a : stats.wins_b;
    const theirWins = isA ? stats.wins_b : stats.wins_a;
    const opponentId = otherSide(rivalship, discordId);
    const opponentName = db.getKnownUsername(opponentId) || `Unknown (${opponentId})`;
    const totalGames = myWins + theirWins || 1;
    const myPct = Math.round((myWins / totalGames) * 100);
    rivalCompact = `
      <div class="dash-glass dash-rival-compact dash-fade" style="animation-delay:.25s;">
        <h2 class="dash-section-title dash-section-title-icon">${ICON.crossedSwords} Your Rival</h2>
        <div class="dash-vs">
          <div class="dash-vs-side"><div class="dash-vs-name">You</div><div class="dash-vs-score">${myWins}</div></div>
          <div class="dash-vs-mid">VS</div>
          <div class="dash-vs-side"><div class="dash-vs-name">${escapeHtml(opponentName)}</div><div class="dash-vs-score">${theirWins}</div></div>
        </div>
        <div class="dash-vs-bar"><div class="dash-vs-bar-fill" style="--target-width:${myPct}%;"></div></div>
      </div>
    `;
  }

  const badgesPanel = allBadges.length
    ? `
      <div class="dash-glass dash-badges-panel dash-fade" style="animation-delay:.3s;">
        <h2 class="dash-section-title">Achievements & Badges</h2>
        <div class="dash-badge-grid">
          ${allBadges
            .map((b) => {
              const unlocked = earnedIds.has(b.id);
              return `<div class="dash-badge-card ${unlocked ? "unlocked" : "locked"}">
                <div class="dash-badge-card-name">${escapeHtml(b.name)}</div>
                ${unlocked ? "" : `<div class="dash-badge-card-lock">Locked</div>`}
              </div>`;
            })
            .join("")}
        </div>
      </div>
    `
    : "";

  const body = `
    ${profileCard}
    <div class="dash-grid">
      <div class="dash-col-main">
        ${heroGlass}
        ${recentSection}
      </div>
      <div class="dash-col-side">
        ${statPods}
        ${rivalCompact}
      </div>
    </div>
    ${badgesPanel}
  `;
  res.send(renderDashboardPage({ body }));
});

const TICKET_PLATFORMS = ["console", "pc"];
const TICKET_GAMES = ["rust", "ark", "dayz", "minecraft"];

/**
 * Support ticket JSON API - website/src/pages/Support.jsx. A website-
 * submitted ticket takes the exact same "no guild context" fallback path
 * commands/support.js already uses when /support is run in a DM (a
 * metadata-only row, guild_id/channel_id both null) - this Express process
 * has no live Discord client to create a real ticket channel the way
 * running /support inside a server does. Staff still see and respond to
 * every ticket the same way (admin/tickets.js) regardless of which path
 * created it. No login anymore to attribute a ticket to a discord_id, so
 * the submitter types their own Discord user ID in the form instead - the
 * same "right-click -> Copy User ID" pattern used elsewhere in this
 * codebase whenever a Discord ID needs to be entered manually.
 */
router.post("/api/support/tickets", express.json(), (req, res) => {
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const platform = String(req.body?.platform || "");
  const game = String(req.body?.game || "");
  const discordId = String(req.body?.discord_id || "").trim();

  if (!/^\d{15,25}$/.test(discordId)) {
    res.status(400).json({ error: "Enter your Discord user ID (right-click your name in Discord -> Copy User ID)." });
    return;
  }
  if (!subject || subject.length > 100) {
    res.status(400).json({ error: "Subject must be 1-100 characters." });
    return;
  }
  if (!message || message.length > 1000) {
    res.status(400).json({ error: "Message must be 1-1000 characters." });
    return;
  }
  if (!TICKET_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: "Pick a platform." });
    return;
  }
  if (!TICKET_GAMES.includes(game)) {
    res.status(400).json({ error: "Pick a game." });
    return;
  }
  const ticketId = db.createTicket(null, discordId, subject, message, null, platform, game);
  res.json({ ok: true, ticketId });
});

// Page chrome for /dashboard (2026-10-15 rebuild) - now the real app shell
// (SITE_STYLES/renderAppShell/renderSiteFooter from ./site) instead of a
// bare unstyled wrapper, so a logged-in dashboard visually matches the rest
// of the live site (same bg-pattern, top tabs, bottom nav) instead of
// looking like a leftover admin-console page. Component CSS below is
// dashboard-specific and layers on top of SITE_STYLES.
const DASH_STYLES = `
  .dash-wrap { max-width: 1040px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-10); }
  @keyframes dashFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  .dash-fade { animation: dashFadeUp .6s cubic-bezier(.2,.7,.3,1) both; }
  @media (prefers-reduced-motion: reduce) { .dash-fade, .dash-pod, .dash-badge-card, .dash-recent-tile { animation: none !important; } }

  .dash-profile {
    display: flex; align-items: center; gap: var(--space-4);
    background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5); margin-bottom: var(--space-4);
    animation: dashFadeUp .5s cubic-bezier(.2,.7,.3,1) both;
  }
  .dash-avatar {
    width: 48px; height: 48px; border-radius: 50%; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--magenta), var(--danger));
    font-family: var(--font-display); font-size: 20px; color: #0a0a0a;
  }
  .dash-profile-id { flex: 1; min-width: 0; }
  .dash-profile-name { font-weight: 700; font-size: 16px; }
  .dash-profile-tag { color: var(--ink-dim); font-size: 13px; margin-top: 2px; }
  .dash-profile-tag.dim { opacity: .7; }
  .dash-profile-tag svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 2px; }

  /* Asymmetric 70/30 layout - left (main) gets the level/XP ring + Recent
     Activity, right (side) gets compact stat pods + Your Rival. Stacks to
     one column on narrow viewports instead of squeezing a 30%-wide column
     unreadably thin. */
  .dash-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-4); margin-bottom: var(--space-4); }
  @media (min-width: 860px) {
    .dash-grid { grid-template-columns: 7fr 3fr; align-items: start; }
  }
  .dash-col-main, .dash-col-side { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }

  /* Glassmorphism base - semi-transparent dark fill + blur, used by every
     card in the new layout (hero, pods, rival, badges). */
  .dash-glass {
    background: rgba(255,255,255,0.03);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
  }

  .dash-hero-glass { display: flex; align-items: center; gap: var(--space-5); flex-wrap: wrap; }
  .dash-hero-info { flex: 1; min-width: 200px; }
  .dash-hero-prestige { display: flex; align-items: center; gap: 5px; color: var(--gold); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .dash-hero-prestige svg, .dash-hero-rank svg { width: 13px; height: 13px; flex: none; }
  .dash-hero-level { font-family: var(--font-display); text-transform: uppercase; font-size: clamp(22px, 4vw, 30px); color: var(--ink); }
  .dash-hero-rank { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; color: var(--gold); font-weight: 700; font-size: 12px; background: color-mix(in srgb, var(--gold) 14%, transparent); border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent); border-radius: 999px; padding: 5px 12px; white-space: nowrap; }
  .dash-hero-xp { color: var(--ink-dim); font-size: 12px; margin-top: 10px; }

  /* Circular progress ring (conic-gradient) showing level-progress (the
     one real 0-100% value available) with lifetime hours played as the
     number in the center - "glowing stat ring" per direct design spec,
     without fabricating a fake denominator for hours played itself (no
     such target exists in this product). */
  .dash-hero-ring {
    --ring-pct: 0%;
    width: 112px; height: 112px; border-radius: 50%; flex: none;
    background: conic-gradient(var(--magenta) var(--ring-pct), rgba(255,255,255,0.08) 0);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 24px color-mix(in srgb, var(--magenta) 35%, transparent);
    animation: dashRingGlow 1.2s .3s cubic-bezier(.2,.8,.3,1) both;
  }
  @keyframes dashRingGlow { from { --ring-pct: 0%; } }
  .dash-hero-ring-inner {
    width: 90px; height: 90px; border-radius: 50%; background: #0c0c10;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .dash-hero-ring-value { font-family: var(--font-display); font-size: 18px; color: var(--ink); }
  .dash-hero-ring-label { font-size: 9px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

  .dash-xpbar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; margin-top: 16px; }
  .dash-xpbar-fill {
    height: 100%; border-radius: 999px; width: 0;
    background: linear-gradient(90deg, var(--gold), var(--magenta));
    animation: dashGrowWidth 1.1s .4s cubic-bezier(.2,.8,.3,1) both;
  }
  @keyframes dashGrowWidth { to { width: var(--target-width); } }

  .dash-section-title { margin: 0 0 14px; font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-dim); }
  .dash-section-title-icon { display: flex; align-items: center; gap: 8px; }
  .dash-section-title-icon svg { width: 16px; height: 16px; flex: none; }

  /* Recent Activity - horizontal rounded tiles, real pvp_kills rows. */
  .dash-recent-row { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: 4px; }
  .dash-recent-tile {
    flex: 0 0 auto; min-width: 200px; display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-lg);
    padding: 12px 14px; animation: dashFadeUp .4s cubic-bezier(.2,.7,.3,1) both;
  }
  .dash-recent-icon { flex: none; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .dash-recent-icon svg { width: 15px; height: 15px; }
  .dash-recent-tile.win .dash-recent-icon { background: color-mix(in srgb, var(--magenta) 20%, transparent); color: var(--magenta); }
  .dash-recent-tile.loss .dash-recent-icon { background: rgba(255,255,255,0.06); color: var(--ink-dim); }
  .dash-recent-title { font-size: 13px; font-weight: 600; white-space: nowrap; }
  .dash-recent-meta { font-size: 11px; color: var(--ink-dim); margin-top: 2px; }
  .dash-recent-empty { color: var(--ink-dim); font-size: 13px; }

  /* Categorized stat pods - crimson dot for high-action metrics, muted
     gray for standard ones, per direct design spec. */
  .dash-pods { display: flex; flex-direction: column; gap: 10px; }
  .dash-pod { display: flex; align-items: center; gap: 10px; padding: 8px 4px; animation: dashFadeUp .4s cubic-bezier(.2,.7,.3,1) both; }
  .dash-pod-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .dash-pod-dot.crimson { background: var(--magenta); box-shadow: 0 0 8px color-mix(in srgb, var(--magenta) 70%, transparent); }
  .dash-pod-dot.muted { background: var(--ink-dim); }
  .dash-pod-icon { color: var(--ink-dim); flex: none; }
  .dash-pod-icon svg { width: 15px; height: 15px; }
  .dash-pod-label { flex: 1; font-size: 12.5px; color: var(--ink-dim); }
  .dash-pod-value { font-family: var(--font-display); font-size: 15px; color: var(--ink); }

  .dash-vs { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .dash-vs-side { flex: 1; text-align: center; }
  .dash-vs-name { font-size: 13px; color: var(--ink-dim); margin-bottom: 6px; }
  .dash-vs-score { font-family: var(--font-display); font-size: 32px; }
  .dash-vs-mid { font-family: var(--font-display); color: var(--ink-dim); font-size: 13px; }
  .dash-vs-bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.06); margin-top: 16px; overflow: hidden; position: relative; }
  .dash-vs-bar-fill { position: absolute; inset: 0; width: 0; background: var(--magenta); animation: dashGrowWidth 1s .5s cubic-bezier(.2,.8,.3,1) both; }

  /* Achievements & Badges grid - unlocked (earned) badges in full color,
     every OTHER badge this guild has configured shown locked/greyed, so
     the panel reflects the real catalog (db.getServerBadges) rather than
     only ever showing what's already earned. */
  .dash-badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .dash-badge-card {
    border-radius: var(--radius-md); padding: 14px 12px; text-align: center;
    border: 1px solid rgba(255,255,255,0.05);
    animation: dashFadeUp .4s cubic-bezier(.2,.7,.3,1) both;
    transition: transform .15s ease;
  }
  .dash-badge-card.unlocked {
    background: linear-gradient(160deg, color-mix(in srgb, var(--gold) 18%, rgba(255,255,255,0.03)), rgba(255,255,255,0.03));
    border-color: color-mix(in srgb, var(--gold) 35%, transparent);
  }
  .dash-badge-card.unlocked:hover { transform: translateY(-3px); }
  .dash-badge-card.unlocked .dash-badge-card-name { color: var(--ink); font-weight: 700; }
  .dash-badge-card.locked { opacity: .4; filter: grayscale(1); }
  .dash-badge-card-name { font-size: 13px; color: var(--ink-dim); }
  .dash-badge-card-lock { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-dim); margin-top: 4px; }
`;

function renderDashboardPage({ body }) {
  const settings = readSiteSettings(db);
  const shopUrl = (settings.tip4serv_shop_url || "").trim();
  const subscribeHref = shopUrl ? escapeHtml(shopUrl) : "/#pricing";
  const subscribeAttrs = shopUrl ? ' target="_blank" rel="noopener noreferrer"' : "";
  const discordInviteUrl = escapeHtml(settings.discord_invite_url || "");

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dashboard — KOBA</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${SITE_STYLES}${DASH_STYLES}</style>
</head>
<body class="app-shell">
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs><linearGradient id="tab-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" class="grad-stop-1" /><stop offset="100%" class="grad-stop-2" /></linearGradient></defs>
</svg>
${renderAppShell({ active: "groups", subscribeHref, subscribeAttrs })}
<main class="dash-wrap">
  ${body}
</main>
${renderSiteFooter({ activeTab: "groups", discordInviteUrl })}
</body>
</html>`;
}

// FIXED (2026-09-08): module.exports here is the router itself (a callable
// Express Router, not an object) - every existing caller does
// `app.use("/dashboard", require("./dashboard"))` expecting exactly that, so
// wrapping it in `{ router, pageShell, ... }` would break every one of them.
// Attaching renderDashboardPage as a property ON the router function
// instead lets any future file reuse this same page chrome without
// duplicating it, while `require("./dashboard")` used directly as a router
// still works exactly as before.
router.renderDashboardPage = renderDashboardPage;

module.exports = router;

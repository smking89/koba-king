"use strict";

const { escapeHtml, PLAYER_THEME_CSS } = require("./layout");
const { APP_SHELL_CSS } = require("./theme");

/** Pulls a YouTube video ID out of any common URL shape the admin might paste. */
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [/youtu\.be\/([a-zA-Z0-9_-]{11})/, /[?&]v=([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return match[1];
  }
  return null;
}

// Homepage Section 1 platform ticker (2026-10-15) - same outline-icon
// language as admin/site.js's renderAppShell ICONS set, 24x24/currentColor.
const PLATFORM_ICONS = {
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>`,
  controller: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="8" width="19" height="9" rx="4.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="13.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M11 18.5h2"/></svg>`,
  browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 8.5h18"/><circle cx="6" cy="6.3" r=".5" fill="currentColor" stroke="none"/></svg>`,
};
const PLATFORM_LABELS = { monitor: "PC", controller: "Console", phone: "Mobile", browser: "Web" };

/** Section-specific CSS for the rebuilt homepage (renderPublicSite) - layered on top of SITE_STYLES, same pattern as admin/dashboard.js's DASH_STYLES. */
const HOME_STYLES = `
  .home-hero { padding: 100px 0 70px; text-align: center; }
  .home-h1 { font-family: var(--font-display); text-transform: uppercase; font-weight: 900; font-size: clamp(36px, 7vw, 64px); margin: 18px 0 20px; letter-spacing: -0.015em; }
  .home-lede { max-width: 56ch; margin: 0 auto 30px; font-size: 17.5px; color: var(--ink-dim); }
  .home-hero .ctas { justify-content: center; margin-bottom: 48px; }

  .platform-ticker { display: flex; justify-content: center; gap: 36px; flex-wrap: wrap; }
  .platform-icon { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #5A5A65; cursor: default; transition: color .15s ease; outline: none; }
  .platform-icon svg { width: 30px; height: 30px; transition: transform .15s cubic-bezier(.34,1.56,.64,1); }
  .platform-icon:hover, .platform-icon:focus-visible { color: var(--ink); }
  .platform-icon:hover svg, .platform-icon:focus-visible svg { transform: scale(1.1); }
  .platform-label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0; transform: translateY(-4px); transition: opacity .15s ease, transform .15s ease; }
  .platform-icon:hover .platform-label, .platform-icon:focus-visible .platform-label { opacity: 1; transform: translateY(0); }

  .platform-toggle { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 36px; }
  .platform-tab { font-family: var(--font-body); font-weight: 700; font-size: 13.5px; padding: 10px 20px; background: var(--bg-panel); border: 1px solid var(--line); color: var(--ink-dim); cursor: pointer; transition: background .15s ease, color .15s ease; }
  .platform-tab.active { background: var(--magenta); color: #06110a; border-color: transparent; }

  .server-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
  .server-grid-empty { color: var(--ink-dim); padding: 30px 0; grid-column: 1 / -1; text-align: center; }
  .server-card { background: var(--bg-panel); border: 1px solid var(--line); padding: 22px; display: flex; flex-direction: column; gap: 14px; }
  .server-card-head { display: flex; align-items: center; gap: 10px; }
  .server-card-head h3 { font-size: 16px; font-weight: 800; }
  .server-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-dim); flex: none; }
  .server-status-dot.live { background: var(--safe); animation: dotBreathe 2.2s ease-in-out infinite; }
  @keyframes dotBreathe { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  .server-capacity { position: relative; }
  .server-capacity-track { height: 5px; border-radius: 999px; background: var(--bg-panel-raised); overflow: hidden; }
  .server-capacity-fill { height: 100%; background: var(--magenta); width: 0; transition: width .6s cubic-bezier(.2,.8,.3,1); }
  .server-capacity-count { font-family: var(--font-mono); font-size: 12px; color: var(--ink-dim); margin-top: 6px; display: block; }
  .server-card-actions { display: flex; gap: 8px; opacity: 0; transform: translateY(4px); transition: opacity .15s ease, transform .15s ease; }
  .server-card:hover .server-card-actions, .server-card:focus-within .server-card-actions { opacity: 1; transform: translateY(0); }
  .btn.small { padding: 7px 14px; font-size: 12.5px; }

  .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .analytics-card {
    position: relative; overflow: hidden;
    background: linear-gradient(160deg, #1F1F24, #151518);
    border: 1px solid var(--line); padding: 30px 26px;
    transition: transform .2s cubic-bezier(.2,.8,.3,1), border-color .2s ease, box-shadow .2s ease;
  }
  .analytics-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--magenta); transform: scaleX(0); transform-origin: left; transition: transform .25s ease; }
  .analytics-card:hover { transform: translateY(-6px); border-color: color-mix(in srgb, var(--magenta) 40%, var(--line)); box-shadow: 0 24px 48px -24px rgba(0,0,0,0.7), 0 0 0 1px color-mix(in srgb, var(--magenta) 15%, transparent); }
  .analytics-card:hover::before { transform: scaleX(1); }
  .analytics-card .idx { font-family: var(--font-mono); font-size: 12px; color: var(--ink-dim); letter-spacing: 0.1em; margin-bottom: 14px; display: block; }
  .analytics-card h3 { font-size: 17.5px; font-weight: 800; margin-bottom: 10px; }
  .analytics-card p { color: var(--ink-dim); font-size: 14.5px; line-height: 1.55; }

  .stats-ticker { padding: 56px 0; background: var(--bg-panel); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .stats-ticker-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 24px; text-align: center; }
  .ticker-num { font-family: var(--font-display); font-size: clamp(28px, 4vw, 42px); color: var(--ink); transition: transform .15s cubic-bezier(.175,.885,.32,1.275); }
  .ticker-label { font-family: var(--font-mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-dim); margin-top: 8px; }
`;

/**
 * RESTORED (2026-09-08): missing from this file entirely (see the longer
 * note further down, at renderPublicSite) - reconstructed verbatim from
 * site.js.orig_backup, the last known-good copy. Feature 3's slash
 * commands, grouped for the public command index. Kept in sync manually
 * with commands/*.js - descriptions are paraphrased for site copy rather
 * than pulled verbatim from setDescription().
 */
const COMMAND_GROUPS = [
  {
    title: "Team & Roster",
    commands: [
      ["/team-create", "Found a new team and become its founding leader.", "everyone"],
      ["/team-panel", "Manage your whole roster - invite, kick, promote, demote - from one panel.", "leader"],
      ["/team-invite", "Add a user to your team as an E1 Recruit.", "leader"],
      ["/team-promote", "Move a teammate up exactly one rank tier.", "leader"],
      ["/team-demote", "Move a teammate down exactly one rank tier.", "leader"],
      ["/team-kick", "Remove a user from your team's roster permanently.", "leader"],
      ["/assign-fireteam", "Assign a teammate to a 4-man fireteam role.", "leader"],
      ["/clan-config", "Set your clan tag, rules, and rename/rebadge ranks.", "leader"],
      ["/declare-war", "Formally declare (or end) a war between two teams.", "leader"],
      ["/link", "Link your Xbox Gamertag or PlayStation ID.", "everyone"],
    ],
  },
  {
    title: "LFG & Matchmaking",
    commands: [
      ["/create-lfg", "Post a looking-for-group request with its own temporary group chat.", "everyone"],
      ["/set lfg-scope", "Keep LFG posts local, or mirror them across every other server set to global.", "admin"],
    ],
  },
  {
    title: "Economy - Shop, Marketplace & Auctions",
    commands: [
      ["/shop", "Browse shops, manage your cart, wallet, and savings.", "everyone"],
      ["/marketplace", "Buy and sell your team's materials with other players.", "everyone"],
      ["/auction-config", "List an item, kit, role, or material for bidding.", "admin"],
      ["/shop-panel", "Configure shops, currencies, products, and sales.", "admin"],
      ["/shop-mint", "Mint currency directly into a player's wallet.", "admin"],
      ["/marketplace-config", "Set the marketplace's per-currency price bounds.", "admin"],
    ],
  },
  {
    title: "Kits",
    commands: [
      ["/kit-panel", "Register kits, customize messages, give kits, reset cooldowns.", "admin"],
      ["/player-panel", "Check your wallet, vault, kit tokens, tradeable roles, and unclaimed game wins - all from one panel.", "everyone"],
    ],
  },
  {
    title: "Games",
    commands: [
      ["/games-panel", "Post the persistent Games Panel in a channel - play (and, for admins, configure) every registered game from buttons and dropdowns, no typed commands or shortnames.", "admin"],
    ],
  },
  {
    title: "Events",
    commands: [
      ["/create-event-wizard", "Walk through creating a zone event step by step.", "admin"],
      ["/auto-event-config", "Schedule zone events to fire automatically on an interval or player-count condition.", "admin"],
      ["/event-config", "Set the emoji shown on a zone event's \"Join Event\" button.", "admin"],
    ],
  },
  {
    title: "Cross-Server Network",
    commands: [
      ["/directory", "List your server in (or search) the official KOBA Bot Directory.", "admin"],
      ["/staff-post", "Recruit moderators/admins across the whole KOBA Bot network.", "admin"],
    ],
  },
  {
    title: "Base & Support",
    commands: [
      ["/support", "Open a private ticket, staged through Open, Closed, and Archived - archived tickets auto-delete after an admin-set grace period.", "everyone"],
      ["/referral-code", "Generate a code to share - lasts 20 minutes, single use.", "everyone"],
      ["/frank-faq", "Teach Frank (the server's built-in FAQ helper) new keyword-triggered answers.", "admin"],
    ],
  },
  {
    title: "Admin & Configuration",
    commands: [
      ["/template setup", "Apply a full server layout - every panel and leaderboard included.", "admin"],
      ["/template download", "Download a text outline of a server layout before applying it.", "admin"],
      ["/template repair", "Re-sync every panel/leaderboard without redoing setup.", "admin"],
      ["/link-server", "Connect your own Rust server's WebRCON - per map, for Clusters.", "admin"],
      ["/set message-style", "Set the color, size, and text of every in-game broadcast.", "admin"],
      ["/set-config", "Change a live setting - cooldowns, intervals, roster caps, ticket auto-delete timing.", "admin"],
      ["/server-backup", "Export every role, category, and channel as a JSON snapshot.", "admin"],
    ],
  },
];

/** The full CSS block shared by every page using the site chrome (homepage, /servers, /lfg) - exported so those pages can include it verbatim rather than risk drifting out of sync with a hand-copied subset. Unused rules for elements a given page doesn't have are harmless. */
const SITE_STYLES = `
  ${PLAYER_THEME_CSS}
  ${APP_SHELL_CSS}
  /* Base reset/link/heading/code/selection rules now live in ./theme.js's
     BASE_CSS (part of PLAYER_THEME_CSS above) - only this site's own
     page-specific chrome follows. */
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  .hazard { height: 2px; background: linear-gradient(90deg, transparent, var(--magenta), var(--cyan), transparent); opacity: 0.6; }

  /* Header/nav/drawer/tabbar chrome now comes from ./theme.js's
     APP_SHELL_CSS (fixed top bar + top tabs, fixed 5-icon bottom nav) -
     see renderAppShell above. Only the brand wordmark (also used standalone
     in the footer) and the socials link style are genuinely page-specific
     and stay here. */
  .wordmark { display: flex; align-items: center; gap: 2px; font-family: var(--font-display); font-weight: 900; font-size: 20px; letter-spacing: -0.02em; text-transform: uppercase; text-decoration: none; white-space: nowrap; color: var(--ink); }
  .wordmark .b1 { color: var(--ink); }
  .wordmark .b2 { background-image: linear-gradient(90deg, var(--magenta), var(--cyan)); background-repeat: no-repeat; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--magenta) 45%, transparent)); }
  .wordmark-icon { height: 28px; width: auto; margin-right: 8px; display: block; flex-shrink: 0; }
  /* Static logo placement (2026-10-15, reverted from an animated GIF) -
     desktop shows the full wordmark image, mobile/tablet shows the compact
     mascot only (same "mascot for small screens, full wordmark for large"
     rule already applied to the favicon/apple-touch-icon earlier this
     session). */
  .wordmark-full { height: 32px; width: auto; display: block; flex-shrink: 0; }
  .wordmark-mascot { height: 32px; width: auto; display: none; flex-shrink: 0; }
  @media (max-width: 640px) {
    .wordmark-full { display: none; }
    .wordmark-mascot { display: block; }
  }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  /* Discord icon lives in the footer's Socials column. --ink (not
     --ink-dim) per explicit request that it read as a full-brightness
     white icon, not a dimmed secondary one. */
  .social-link { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; font-size: 14px; transition: color .15s ease, filter .15s ease; }
  .social-link:hover, .social-link:focus-visible { color: var(--cyan); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--cyan) 55%, transparent)); }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font-body); font-weight: 700; font-size: 14.5px; letter-spacing: 0.01em; padding: 12px 22px; text-decoration: none; cursor: pointer; border: 1.5px solid transparent; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); transition: box-shadow .15s ease, transform .1s ease, border-color .15s ease, color .15s ease; }
  .btn:active { transform: translateY(1px); }
  .btn-primary { background: var(--magenta); color: #fff; box-shadow: 0 0 30px color-mix(in srgb, var(--magenta) 35%, transparent); }
  .btn-primary:hover { background: color-mix(in srgb, var(--magenta) 85%, white); box-shadow: 0 0 40px color-mix(in srgb, var(--magenta) 55%, transparent); transform: translateY(-1px); }
  .btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
  .btn-ghost:hover { border-color: var(--cyan); color: var(--cyan); box-shadow: 0 0 18px color-mix(in srgb, var(--cyan) 30%, transparent); }
  .btn:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
  /* Sized down for the fixed top bar, which is only 64px tall - the
     regular .btn padding is too tall to fit inside it without the bar
     growing. */
  .btn.compact { padding: 8px 16px; font-size: 13px; }

  /* .eyebrow is shared (./theme.js COMPONENT_CSS) - identical rule, no need to repeat it here. */

  .hero { position: relative; padding: 92px 0 100px; overflow: hidden; }
  .hero::before { content: ""; position: absolute; inset: 0; background-image: repeating-linear-gradient(180deg, color-mix(in srgb, var(--ink) 4%, transparent) 0 1px, transparent 1px 3px); opacity: 0.4; pointer-events: none; mix-blend-mode: overlay; }
  /* min-width: 0 overrides CSS Grid's default min-width: auto on grid
     items - without it, a child's intrinsic content width (e.g. the HUD
     mockup's button row) can force this whole track wider than the
     viewport and push content off-screen on mobile instead of wrapping. */
  .hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; }
  .hero-grid > * { min-width: 0; }
  @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } }
  .hero h1 { font-family: var(--font-display); font-weight: 900; text-transform: uppercase; font-size: clamp(32px, 5vw, 56px); line-height: 1.02; letter-spacing: -0.015em; margin: 18px 0 22px; color: var(--ink); }
  .hero h1 .grad, .hero h1 .accent { background-repeat: no-repeat; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
  /* Fades from the heading's own ink color (not a hardcoded #fff) into
     cyan, so the gradient's start point stays legible against the page
     background in both dark and light mode instead of nearly vanishing
     as near-white-on-near-white in light mode. */
  .hero h1 .grad { background-image: linear-gradient(90deg, var(--ink) 40%, var(--cyan)); }
  .hero h1 .accent { background-image: linear-gradient(90deg, var(--magenta), var(--cyan)); }
  .hero p.lede { max-width: 54ch; font-size: 17.5px; color: var(--ink-dim); margin-bottom: 30px; }
  .hero .ctas { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 22px; }
  .hero .microcopy { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-dim); }

  /* Minimal editorial stat strip - borderless, serif numerals, thin
     dividers between columns instead of boxed tiles. Styled to match the
     clean "big number, quiet label" look of other RCE bot sites, but the
     numbers themselves stay real KOBA Bot data - never a competitor's. */
  .livestats { padding: 60px 0 50px; border-bottom: 1px solid var(--line); }
  .stat-grid { display: flex; flex-wrap: wrap; justify-content: center; }
  .stat-tile { padding: 12px 44px; text-align: center; border-left: 1px solid var(--line); }
  .stat-tile:first-child { border-left: none; }
  @media (max-width: 700px) {
    .stat-tile { width: 50%; border-left: none; border-top: 1px solid var(--line); padding: 20px; }
    .stat-tile:nth-child(-n+2) { border-top: none; }
  }
  .stat-num { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: clamp(30px, 4vw, 44px); color: var(--ink); letter-spacing: -0.01em; }
  .stat-tile.muted .stat-num { color: var(--ink-dim); }
  .stat-label { font-family: var(--font-mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); margin-top: 8px; }
  .stat-soon { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cyan); margin-top: 4px; }

  /* Sub-threshold replacement for the live counters above (see
     LIVE_STATS_THRESHOLD) - functional specs instead of live scale, so the
     section never reads as an empty "0+" placeholder in the early stage. */
  .spec-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px 34px; }
  .spec-chip { font-family: var(--font-mono); font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-dim); white-space: nowrap; }
  .spec-chip strong { font-family: var(--font-display); font-size: 16px; letter-spacing: 0.01em; color: var(--ink); margin-right: 7px; }

  /* Deployment Sequence scroll-timeline ("How it works" section). */
  .deploy-timeline { position: relative; max-width: 640px; margin: 0 auto; padding-left: 34px; }
  .deploy-timeline::before { content: ''; position: absolute; top: 20px; left: 20px; bottom: 40px; width: 2px; background: var(--line); z-index: 1; }
  .deploy-step { position: relative; margin-bottom: 44px; padding-left: 30px; }
  .deploy-step:last-child { margin-bottom: 0; }
  .deploy-badge {
    position: absolute; left: -34px; top: 0; width: 42px; height: 42px; border-radius: 50%;
    background: var(--bg-panel); border: 2px solid var(--line); color: var(--ink-dim);
    font-family: var(--font-mono); font-weight: 700; font-size: 0.95rem;
    display: flex; align-items: center; justify-content: center; z-index: 2;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  }
  .deploy-content { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
  .deploy-content h3 { font-family: var(--font-display); font-size: 1.02rem; text-transform: uppercase; letter-spacing: 0.02em; color: var(--ink); margin-bottom: 8px; transition: color 0.2s ease; }
  .deploy-content p { font-size: 0.92rem; color: var(--ink-dim); line-height: 1.55; }
  .deploy-step.deploy-complete .deploy-badge { background: var(--magenta); color: #06120a; border-color: var(--magenta); box-shadow: 0 0 18px color-mix(in srgb, var(--magenta) 55%, transparent); }
  .deploy-step.deploy-complete .deploy-content { border-color: color-mix(in srgb, var(--magenta) 45%, transparent); box-shadow: 0 4px 20px rgba(0,0,0,0.35); }
  .deploy-step.deploy-complete .deploy-content h3 { color: var(--magenta); }
  .deploy-cta { max-width: 640px; margin: 36px auto 0; text-align: center; }
  @media (prefers-reduced-motion: reduce) {
    .deploy-badge, .deploy-content, .deploy-content h3 { transition: none; }
  }

  .hud { background: var(--bg-panel-raised); border: 1px solid var(--line); clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cyan) 18%, transparent), 0 30px 70px -30px rgba(0,0,0,0.6), 0 0 60px -20px color-mix(in srgb, var(--magenta) 30%, transparent); max-width: 622px; margin: 0 auto; }
  .hud-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--line); font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-dim); letter-spacing: 0.06em; text-transform: uppercase; }
  .hud-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--safe); display: inline-block; margin-right: 6px; box-shadow: 0 0 10px color-mix(in srgb, var(--safe) 80%, transparent); }
  /* Real screenshot, not a stretched fake mockup - max-width above caps it
     at the source image's native width (622px) so it's never upscaled
     past its actual resolution, which is what caused visible blur before. */
  .hud-shot { width: 100%; display: block; }

  section { padding: 84px 0; scroll-margin-top: 90px; }
  .section-head { max-width: 62ch; margin-bottom: 44px; }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .section-head, .hud, .briefing, .arsenal, .ladder, .embed-frame, .pricing-grid { animation: fadeInUp 0.7s cubic-bezier(.2,.7,.3,1) both; }
  }
  .section-head h2 { font-family: var(--font-display); text-transform: uppercase; font-weight: 900; font-size: clamp(26px, 3.6vw, 38px); letter-spacing: -0.01em; margin-top: 14px; }
  .section-head p { color: var(--ink-dim); font-size: 16px; margin-top: 14px; max-width: 58ch; }

  .briefing { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; background: var(--line); border: 1px solid var(--line); }
  @media (max-width: 780px) { .briefing { grid-template-columns: 1fr; } }
  .briefing > div { background: var(--bg-panel); padding: 30px 32px; }
  .briefing h3 { font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 16px; }
  .briefing .fact h3 { color: var(--danger); }
  .briefing .solution h3 { color: var(--safe); }
  .briefing ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .briefing li { font-size: 15px; padding-left: 20px; position: relative; color: var(--ink); }
  .briefing .fact li::before { content: "—"; position: absolute; left: 0; color: var(--danger); }
  .briefing .solution li::before { content: "—"; position: absolute; left: 0; color: var(--safe); }

  .ops { display: grid; gap: 2px; background: var(--line); border: 1px solid var(--line); }
  .op { background: var(--bg-panel); display: grid; grid-template-columns: 84px 1fr; gap: 22px; padding: 26px 28px; align-items: start; transition: background .15s ease; }
  .op:hover { background: var(--bg-panel-raised); }
  @media (max-width: 640px) { .op { grid-template-columns: 56px 1fr; padding: 20px; } }
  .op .idx { font-family: var(--font-mono); font-size: 13px; color: var(--ink-dim); }
  .op .idx b { display: block; font-size: 30px; color: var(--magenta); font-weight: 700; line-height: 1; margin-bottom: 4px; text-shadow: 0 0 16px color-mix(in srgb, var(--magenta) 45%, transparent); }
  .op h3 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
  .op p { color: var(--ink-dim); font-size: 15px; max-width: 62ch; }

  /* Horizontal scroll-carousel of system cards: snap-scroll
     row with prev/next arrows that nudge scrollLeft via inline JS (no
     framework needed for something this small). */
  .carousel-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 44px; gap: 20px; }
  .carousel-arrows { display: flex; gap: 10px; flex-shrink: 0; }
  .carousel-arrow { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--bg-panel); border: 1px solid var(--line); color: var(--ink); cursor: pointer; font-size: 16px; transition: border-color .15s ease, color .15s ease; }
  .carousel-arrow:hover { border-color: var(--cyan); color: var(--cyan); }
  @media (max-width: 760px) { .carousel-arrows { display: none; } } /* touch scroll/swipe handles this natively on mobile - the buttons are just redundant clutter there */
  .carousel-track { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 4px; margin: 0 -28px; padding-left: 28px; padding-right: 28px; }
  .carousel-track::-webkit-scrollbar { display: none; }
  .carousel-card { scroll-snap-align: start; flex: 0 0 auto; width: min(320px, 82vw); background: var(--bg-panel); border: 1px solid var(--line); padding: 26px 24px; display: flex; flex-direction: column; gap: 14px; transition: border-color .15s ease, background .15s ease; }
  .carousel-card:hover { border-color: var(--cyan); background: var(--bg-panel-raised); }
  .carousel-card .idx { font-family: var(--font-mono); font-size: 30px; font-weight: 700; color: var(--magenta); text-shadow: 0 0 16px color-mix(in srgb, var(--magenta) 45%, transparent); line-height: 1; }
  .carousel-card h3 { font-size: 17px; font-weight: 800; }
  .carousel-card p { color: var(--ink-dim); font-size: 14.5px; }
  .carousel-card .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 6px; }
  .carousel-card .tags span { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 9px; border: 1px solid var(--line); color: var(--ink-dim); }

  .arsenal { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 2px; background: var(--line); border: 1px solid var(--line); }
  .bomb { background: var(--bg-panel); padding: 24px 22px; display: flex; flex-direction: column; gap: 10px; position: relative; transition: background .15s ease; }
  .bomb .code { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; color: var(--ink-dim); text-transform: uppercase; }
  .bomb .icon { width: 88px; height: 88px; object-fit: contain; filter: drop-shadow(0 0 14px color-mix(in srgb, currentColor 45%, transparent)); }
  .bomb h3 { font-size: 17px; font-weight: 800; }
  .bomb p { font-size: 14px; color: var(--ink-dim); }
  .bomb .tag { align-self: flex-start; margin-top: auto; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 9px; border: 1px solid currentColor; }
  /* color set on the card itself (not just .tag/h3) so currentColor in the
     hover/click pulse below picks up each payload's own accent color. */
  .bomb.danger { color: var(--danger); }
  .bomb.amber { color: var(--amber); }
  .bomb.cyan { color: var(--cyan); }
  .bomb.violet { color: var(--violet); }
  .bomb.gold { color: var(--gold); }
  .bomb.cyan h3 { text-shadow: 0 0 10px color-mix(in srgb, var(--cyan) 40%, transparent); }
  .bomb.violet h3 { text-shadow: 0 0 10px color-mix(in srgb, var(--violet) 40%, transparent); }
  .bomb h3, .bomb p { color: var(--ink-dim); } /* body text stays neutral; only .tag/h3-via-currentColor is tinted */
  .bomb h3 { color: currentColor; }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes bombPulse {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 55%, transparent), 0 0 0 0 color-mix(in srgb, currentColor 25%, transparent); }
      50% { box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 0%, transparent), 0 0 26px 4px color-mix(in srgb, currentColor 35%, transparent); }
    }
    .bomb:hover, .bomb:focus-within { background: var(--bg-panel-raised); animation: bombPulse 1.3s ease-in-out infinite; }
  }
  .bomb:active { transform: scale(0.97); transition: transform .1s ease; }

  .ladder { display: grid; gap: 0; border-left: 2px solid var(--line); margin-left: 6px; }
  .rank { position: relative; padding: 16px 0 16px 28px; display: grid; grid-template-columns: 100px 1fr auto; gap: 16px; align-items: center; border-bottom: 1px solid var(--line); }
  .rank:last-child { border-bottom: none; }
  .rank::before { content: ""; position: absolute; left: -7px; top: 22px; width: 12px; height: 12px; background: var(--bg); border: 2px solid var(--magenta); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); box-shadow: 0 0 10px color-mix(in srgb, var(--magenta) 55%, transparent); }
  .rank .id { font-family: var(--font-mono); font-weight: 700; color: var(--cyan); font-size: 13.5px; }
  .rank .name { font-size: 15px; }
  .rank .name b { font-weight: 700; }
  .rank .scope { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-dim); white-space: nowrap; }
  @media (max-width: 640px) { .rank { grid-template-columns: 76px 1fr; } .rank .scope { grid-column: 2; } }

  .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: stretch; }
  @media (max-width: 860px) { .pricing-grid { grid-template-columns: 1fr; } }
  .price-card { background: var(--bg-panel-raised); border: 1px solid var(--line); padding: 30px; clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px)); box-shadow: 0 0 50px -24px color-mix(in srgb, var(--magenta) 45%, transparent); }
  .price-card .plan-label { font-family: var(--font-mono); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--cyan); }
  .price-card .price { font-family: var(--font-display); font-size: 34px; font-weight: 900; margin-top: 8px; text-transform: uppercase; }
  .price-card .price small { display: block; font-family: var(--font-body); font-size: 13.5px; font-weight: 600; color: var(--ink-dim); text-transform: none; margin-top: 6px; }
  .price-card ul { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 10px; }
  .price-card li { font-size: 14.5px; padding-left: 22px; position: relative; }
  .price-card li::before { content: "—"; position: absolute; left: 0; color: var(--safe); font-weight: 700; }
  .note { font-size: 12.5px; color: var(--ink-dim); }

  .forcards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
  .forcard { border: 1px solid var(--line); padding: 22px; background: var(--bg-panel); transition: border-color .15s ease; }
  .forcard:hover { border-color: var(--cyan); }
  .forcard .num { font-family: var(--font-mono); color: var(--magenta); font-size: 12px; letter-spacing: 0.08em; }
  .forcard h3 { font-size: 16px; margin: 8px 0; font-weight: 800; }
  .forcard p { font-size: 14px; color: var(--ink-dim); }

  .faq { display: grid; gap: 2px; background: var(--line); border: 1px solid var(--line); }
  .faq details { background: var(--bg-panel); }
  .faq summary { cursor: pointer; list-style: none; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 15.5px; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: "+"; font-family: var(--font-mono); color: var(--magenta); font-size: 18px; margin-left: 16px; }
  .faq details[open] summary::after { content: "–"; }
  .faq .a { padding: 0 24px 22px; color: var(--ink-dim); font-size: 14.5px; max-width: 68ch; }

  /* ---------- Real screenshots ---------- */
  .screens { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 22px; }
  .shot-card { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: 0 20px 50px -30px rgba(0,0,0,0.6); }
  /* max-width: 100% + width/height: auto (not width: 100%) - these are
     small real Discord-embed crops (400-620px native), so stretching them
     to fill a wider card was upscaling and blurring them. This lets them
     shrink for small viewports but never grow past their real resolution. */
  .shot-card img { max-width: 100%; width: auto; height: auto; display: block; margin: 0 auto; }
  .shot-card .discord-caption { padding: 14px 16px; margin: 0; text-align: left; }

  /* ---------- Interactive Discord embed showcase (tabbed, CSS-only - no JS on this site) ---------- */
  .embed-radio { position: absolute; opacity: 0; pointer-events: none; }
  .embed-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .embed-tab { display: inline-flex; align-items: center; padding: 9px 16px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--ink-dim); cursor: pointer; user-select: none; transition: color 0.15s, border-color 0.15s, background 0.15s; background: var(--bg-panel); }
  .embed-tab:hover { color: var(--ink); border-color: var(--cyan); }
  .embed-frame { position: relative; max-width: 640px; }
  .embed-panel { display: none; }
  .embed-panel .shot-card { margin: 0; }
  #et0:checked ~ .embed-tabs label[for="et0"],
  #et1:checked ~ .embed-tabs label[for="et1"],
  #et2:checked ~ .embed-tabs label[for="et2"],
  #et3:checked ~ .embed-tabs label[for="et3"] { color: #06110a; background: linear-gradient(90deg, var(--magenta), var(--cyan)); border-color: transparent; }
  #et0:checked ~ .embed-frame #panel0,
  #et1:checked ~ .embed-frame #panel1,
  #et2:checked ~ .embed-frame #panel2,
  #et3:checked ~ .embed-frame #panel3 { display: block; }

  /* ---------- Mobile-first command accordion (native <details>, replaces the old wide table) ---------- */
  .cmdaccordion { border: 1px solid var(--line); border-radius: 10px; background: var(--bg-panel); margin-bottom: 14px; overflow: hidden; }
  .cmdaccordion summary { list-style: none; cursor: pointer; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--cyan); font-weight: 700; }
  .cmdaccordion summary::-webkit-details-marker { display: none; }
  .cmdaccordion summary::after { content: "+"; font-size: 18px; color: var(--ink-dim); }
  .cmdaccordion[open] summary::after { content: "–"; }
  .cmdcards { padding: 4px 20px 18px; display: grid; gap: 10px; }
  .cmdcard { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; background: var(--bg-raised, var(--bg)); }
  .cmdcard-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .cmdcard-head code { font-family: var(--font-mono); font-weight: 700; color: var(--ink); font-size: 14px; }
  .cmdcard p { margin: 0; color: var(--ink-dim); font-size: 13.5px; }
  .cmdcard .access { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 9px; border: 1px solid currentColor; white-space: nowrap; }
  .cmdcard .access.everyone { color: var(--safe); }
  .cmdcard .access.leader { color: var(--cyan); }
  .cmdcard .access.admin { color: var(--danger); }

  /* ---------- Discord UI mockups ---------- */
  .discord-frame { background: #313338; border-radius: 10px; overflow: hidden; border: 1px solid #1e1f22; box-shadow: 0 20px 50px -30px rgba(0,0,0,0.6); }
  .discord-frame-bar { background: #2b2d31; padding: 10px 16px; font-size: 12.5px; color: #949ba4; font-family: var(--font-mono); border-bottom: 1px solid #1e1f22; }
  .discord-msg { display: flex; gap: 14px; padding: 18px; }
  .discord-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--magenta), var(--cyan)); flex-shrink: 0; }
  .discord-body { flex: 1; min-width: 0; }
  .discord-name-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .discord-name { font-weight: 700; color: #f2f3f5; font-size: 15px; }
  .discord-tag { background: #5865f2; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
  .discord-time { color: #949ba4; font-size: 12px; }
  .discord-embed { border-left: 4px solid var(--magenta); background: #2b2d31; border-radius: 4px; padding: 14px 16px; max-width: 520px; }
  .discord-embed.cyan { border-left-color: var(--cyan); }
  .discord-embed.safe { border-left-color: var(--lime); }
  .discord-embed-title { color: #f2f3f5; font-weight: 700; font-size: 14.5px; margin-bottom: 8px; }
  .discord-embed-desc { color: #dbdee1; font-size: 13.5px; line-height: 1.5; margin-bottom: 12px; }
  .discord-embed-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 4px; }
  .discord-field-name { color: #949ba4; font-size: 10.5px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 3px; }
  .discord-field-value { color: #dbdee1; font-size: 13px; }
  .discord-buttons { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .discord-btn { background: #4e5058; color: #fff; font-size: 13px; font-weight: 600; padding: 7px 16px; border-radius: 5px; }
  .discord-btn.primary { background: #5865f2; }
  .discord-btn.danger { background: #da373c; }
  .discord-caption { text-align: center; color: var(--ink-dim); font-size: 13px; margin-top: 10px; }

  /* ---------- command index ---------- */
  .cmdgroup { margin-bottom: 4px; }
  .cmdgroup h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--cyan); margin-bottom: 12px; font-weight: 700; }
  .cmdtable { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  .cmdtable td { padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
  .cmdtable td:first-child { font-family: var(--font-mono); color: var(--ink); white-space: nowrap; font-weight: 600; }
  .cmdtable td:last-child { color: var(--ink-dim); }
  .cmdtable .access { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 9px; border: 1px solid currentColor; white-space: nowrap; }
  .cmdtable .access.everyone { color: var(--safe); }
  .cmdtable .access.leader { color: var(--cyan); }
  .cmdtable .access.admin { color: var(--danger); }

  /* ---------- video embed ---------- */
  .video-wrap { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 10px; border: 1px solid var(--line); background: var(--bg-panel); }
  .video-wrap iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }

  .finalcta { position: relative; padding: 78px 0; text-align: left; overflow: hidden; background: linear-gradient(120deg, color-mix(in srgb, var(--magenta) 22%, var(--bg-panel)), color-mix(in srgb, var(--cyan) 16%, var(--bg-panel))); clip-path: polygon(0 22px, 100% 0, 100% 100%, 0 100%); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .finalcta h2 { font-family: var(--font-display); text-transform: uppercase; font-weight: 900; font-size: clamp(26px, 4vw, 42px); margin-bottom: 18px; }
  .finalcta p { max-width: 56ch; color: var(--ink-dim); margin-bottom: 26px; font-size: 16px; }

  footer.site { padding: 70px 0 0; position: relative; overflow: hidden; border-top: 1px solid var(--line); }
  .footgrid { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 40px; padding-bottom: 50px; }
  @media (max-width: 780px) { .footgrid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .footgrid { grid-template-columns: 1fr; } }
  .footcol h4 { font-family: var(--font-mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); margin-bottom: 16px; }
  .footcol { display: flex; flex-direction: column; gap: 11px; }
  .footcol a { text-decoration: none; color: var(--ink); font-size: 14px; }
  .footcol a:hover { color: var(--cyan); }
  .footcol p { color: var(--ink-dim); font-size: 14px; max-width: 34ch; }
  .footwatermark { text-align: center; font-family: var(--font-display); font-weight: 900; text-transform: uppercase; font-size: clamp(60px, 14vw, 180px); line-height: 1; letter-spacing: -0.02em; color: color-mix(in srgb, var(--ink) 6%, transparent); user-select: none; pointer-events: none; margin: 0 -28px; overflow: hidden; white-space: nowrap; }
  .footbar { border-top: 1px solid var(--line); padding: 20px 0 26px; display: flex; justify-content: center; text-align: center; flex-wrap: wrap; gap: 10px; }
  .footlinks { display: flex; gap: 22px; font-size: 13.5px; color: var(--ink-dim); }
  .footlinks a { text-decoration: none; }
  .footlinks a:hover { color: var(--cyan); }
  .footnote { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-dim); margin-top: 18px; }
`;

/** In-page anchor links (#briefing etc) only resolve on the homepage itself - elsewhere they need to navigate back to "/" first. */
function anchorHref(hash, activeTab) {
  return activeTab === "home" ? hash : "/" + hash;
}

/**
 * REPLACED (2026-09-09): this used to build a marketing-site header + an
 * off-canvas hamburger drawer + a separate bottom tab bar - three different
 * nav surfaces for one product. Per direct product direction ("come up
 * with a brand new layout, not the one I already have... needs to be a web
 * app layout, easy to navigate... 5 bottom nav icons, top tabs, don't use
 * any scroll sidebar"), the whole player-facing site is now one persistent
 * app shell: a fixed top bar (logo + a top tab strip for the section-level
 * destinations) and a fixed 5-icon bottom nav, both always on screen at
 * every viewport width - not a marketing scroller with an app bolted on
 * underneath. Every page using this (home, /servers, /lfg, /leaderboard)
 * passes the same `active` value both bars read to highlight the current
 * destination.
 *
 * Home is reached via the logo (not a tab) - same as the reference layout.
 * Top tabs are the 4 section destinations (Groups, Servers, LFG,
 * Leaderboard); "Groups" points at /dashboard, where team/roster
 * management actually lives today - not a new, separate page. Bottom nav
 * mirrors Home/Groups/Servers/LFG plus Profile (also /dashboard) rather
 * than repeating Leaderboard, since a 5-icon strip needs Home and Profile
 * to be reachable one tap away and something has to give.
 */
// subscribeHref/subscribeAttrs are no longer used (the "Subscribe" CTA was
// removed - KOBA Bot is free now) but call sites across admin/*.js still
// pass them; kept in the destructure so none of those call sites need
// touching, just silently unused.
function renderAppShell({ active, subscribeHref, subscribeAttrs }) {
  const tab = (href, label) => `<a href="${href}" class="${active === label.toLowerCase() ? "active" : ""}">${label}</a>`;
  const top = `<header class="app-topbar">
  <a class="wordmark" href="/">
    <img class="wordmark-full" src="/brand/koba-wordmark-final.png" alt="KOBA" />
    <img class="wordmark-mascot" src="/brand/koba-mascot-square.png" alt="KOBA" />
  </a>
  <nav class="app-tabs" aria-label="Sections">
    ${tab("/leaderboard", "Leaderboard")}
  </nav>
  <div class="app-topbar-cta">
    <a class="btn btn-ghost compact" href="/auth/login">Log In</a>
    <a class="btn btn-primary compact" href="/auth/register">Get Started</a>
  </div>
</header>`;

  // Instagram-style two-state icon set (2026-10-15) - a thin outline for
  // the inactive state, a solid-fill version swapped in for the active
  // tab, same pattern as Instagram/most native tab bars. Redrawn from the
  // reference icon set at ~/Desktop/koba icons/ (Home, Community, Servers,
  // LFG, Profile) rather than using those PNGs directly, since the active/
  // inactive swap needs two real geometries driven by currentColor, not a
  // static raster asset.
  const ICONS = {
    home: {
      outline: `<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9.5"/>`,
      filled: `<path d="M12 3.3 3.3 11.2A1 1 0 0 0 3 12v8a1 1 0 0 0 1 1h5v-7h6v7h5a1 1 0 0 0 1-1v-8a1 1 0 0 0-.3-.8L12 3.3Z"/>`,
    },
    groups: {
      outline: `<circle cx="9" cy="8.3" r="3"/><circle cx="16.2" cy="9.3" r="2.3"/><path d="M3.3 20c.6-3.6 3-5.6 5.7-5.6s5.1 2 5.7 5.6"/><path d="M14.7 15c2 .4 3.4 2 3.9 4.6"/>`,
      filled: `<circle cx="9" cy="8.3" r="3.2"/><circle cx="16.3" cy="9.5" r="2.4"/><path d="M3 20.3c.5-3.9 3.1-6 6-6s5.5 2.1 6 6Z"/><path d="M14.5 14.6c2.2.3 3.9 2 4.5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    },
    servers: {
      outline: `<rect x="4" y="4" width="16" height="5" rx="1.3"/><rect x="4" y="10.5" width="16" height="5" rx="1.3"/><rect x="4" y="17" width="16" height="3" rx="1.1"/><circle cx="7.2" cy="6.5" r=".6" fill="currentColor" stroke="none"/><circle cx="7.2" cy="13" r=".6" fill="currentColor" stroke="none"/>`,
      filled: `<rect x="4" y="4" width="16" height="5" rx="1.3"/><rect x="4" y="10.5" width="16" height="5" rx="1.3"/><rect x="4" y="17" width="16" height="3" rx="1.1"/>`,
    },
    lfg: {
      outline: `<path d="M3 3l14 14M14 20l6-6M18 18l3 3M21 3L7 17M4 14l6 6M3 21l3-3"/>`,
      filled: `<rect x="11" y="2" width="2.2" height="20" rx="1.1" transform="rotate(45 12 12)"/><rect x="11" y="2" width="2.2" height="20" rx="1.1" transform="rotate(-45 12 12)"/>`,
    },
    profile: {
      outline: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.7-4.3 4-6.5 7.5-6.5s6.8 2.2 7.5 6.5"/>`,
      filled: `<circle cx="12" cy="8" r="4.2"/><path d="M4.3 21c.6-4.7 4-7.2 7.7-7.2s7.1 2.5 7.7 7.2Z"/>`,
    },
  };
  const navIcon = (href, name, label) => {
    const isActive = active === name;
    const variant = ICONS[name][isActive ? "filled" : "outline"];
    const svgAttrs = isActive
      ? `fill="currentColor" stroke="none"`
      : `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    return `<a href="${href}" class="${isActive ? "tab-active" : ""}" aria-label="${label}">
    <svg viewBox="0 0 24 24" ${svgAttrs} aria-hidden="true">${variant}</svg>
    <span>${label}</span>
  </a>`;
  };
  const bottom = `<nav class="app-bottomnav" aria-label="Primary">
  ${navIcon("/", "home", "Home")}
  ${navIcon("/dashboard", "groups", "Groups")}
  ${navIcon("/servers", "servers", "Servers")}
  ${navIcon("/lfg", "lfg", "LFG")}
  ${navIcon("/dashboard", "profile", "Profile")}
</nav>`;

  return top + bottom;
}

/**
 * RESTORED (2026-09-08): renderPublicSite (the homepage renderer actually
 * called by admin/server.js's `GET /`) and renderSiteFooter (called below,
 * once, for that same homepage) had both gone missing from this file -
 * renderNavChrome's own closing brace had been lost too, so everything from
 * its "let tabbar_ = ..." down through the final `</html>` had silently
 * become unreachable dead code glued onto the end of renderNavChrome's body
 * (including a `return renderNavChrome(...)` that recursed into itself).
 * `require("./site")` - and therefore the whole app - could not even load.
 * This restores the real function boundary above and reconstructs
 * renderPublicSite's opening (settings -> subscribeHref/headline/OG-tag
 * derivation, matching admin/siteSettingsSchema.js's field names) from the
 * last known-good copy of this file (site.js.orig_backup, predating the
 * mobile-nav/drawer work) - everything from the hero section down is the
 * current, already-correct markup/CSS, untouched.
 *
 * `settings` is the object produced by siteSettingsSchema.js's
 * readSiteSettings(db) - see that file for the editable fields and their
 * defaults.
 */
// Below this many linked servers, the live 0+/1+ counters read as empty
// rather than early-stage - a feature-highlight banner runs instead until
// real scale kicks in, then this section switches to the live counters
// automatically (no manual toggle, no redeploy - just crosses the threshold
// on whatever the next stats push reports).
const LIVE_STATS_THRESHOLD = 5;

/**
 * REBUILT (2026-10-15) - full rewrite per direct product spec (4 sections:
 * Hero, Live Directory Search, Open Algorithm Analytics, Live Stats
 * Ticker). The old version (pricing-grid, "Subscribe" CTAs, a YouTube demo
 * slot, an E1-E9 rank ladder) doesn't match current product direction -
 * KOBA Bot is free now (see utils/premium.js's paywall-removal pass), so
 * every subscribe/pricing reference is gone. Two things explicitly deferred
 * per direct instruction rather than faked: the hero's looping video
 * preview (no real footage exists yet) and a Section 5 cosmetics/skins
 * marketplace (no such system exists anywhere in this codebase - the real
 * shop/marketplace is in-game kit purchases via wallet currency, nothing
 * like a rarity-tiered skin market). Section 4's ticker shows 4 REAL
 * numbers from db.productWideStats() (servers/players/kills/playerHours) -
 * the spec's original "Wipes Today"/"Achievements Logged" have no backing
 * query anywhere, so kills/playerHours were substituted instead of invented.
 * Section 2's live server grid is populated client-side from the existing
 * real GET /api/servers endpoint (admin/server.js) rather than duplicating
 * that ranking/filtering logic server-side a second time here.
 */
function renderPublicSite(settings, liveStats = { servers: 0, owners: 0, players: 0, kills: 0, playerHours: 0 }) {
  // Auto-refreshed by utils/discordInvite.js (bot process) - see
  // admin/siteSettingsSchema.js's readSiteSettings for the fallback chain.
  // Never hardcode a Discord invite link directly in this file - Discord
  // invites can expire/get revoked, so the link shown here always comes
  // through that self-healing settings value instead.
  const discordInviteUrl = escapeHtml(settings.discord_invite_url);

  // Link-preview card (Discord/Twitter/etc. unfurl) - og:image needs an
  // absolute URL (relative paths don't unfurl reliably across platforms).
  const siteUrl = "https://koba.games";
  const ogTitle = "KOBA — Beat Your Rivals";
  const ogDescription = "Connect your profiles and track your KD, climb the ranks across console, PC, mobile, and web games.";

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${ogTitle}</title>
<meta name="description" content="${ogDescription}" />
<link rel="canonical" href="${siteUrl}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="KOBA" />
<meta property="og:url" content="${siteUrl}/" />
<meta property="og:title" content="${ogTitle}" />
<meta property="og:description" content="${ogDescription}" />
<meta property="og:image" content="${siteUrl}/brand/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${ogTitle}" />
<meta name="twitter:description" content="${ogDescription}" />
<meta name="twitter:image" content="${siteUrl}/brand/og-image.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<link rel="icon" type="image/png" sizes="64x64" href="/brand/favicon-64.png?v=3" />
<link rel="apple-touch-icon" sizes="180x180" href="/brand/favicon-180.png?v=3" />
<style>${SITE_STYLES}${HOME_STYLES}</style>
</head>
<body class="app-shell">
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="tab-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" class="grad-stop-1" />
      <stop offset="100%" class="grad-stop-2" />
    </linearGradient>
  </defs>
</svg>
${renderAppShell({ active: "home", subscribeHref: "#directory", subscribeAttrs: "" })}

<main id="top">
  <section class="home-hero">
    <div class="wrap">
      <span class="eyebrow">Cross-Platform Rival Tracking</span>
      <h1 class="home-h1">Beat Your Rivals!</h1>
      <p class="home-lede">Connect your profiles, and track your KD, climb the ranks across console, PC, mobile, and web games.</p>
      <div class="ctas">
        <a class="btn btn-primary" href="#directory">Explore Hub</a>
        <a class="btn btn-ghost" href="/dashboard">Link Profiles</a>
      </div>
      <div class="platform-ticker">
        ${["monitor", "controller", "phone", "browser"]
          .map(
            (p) => `<div class="platform-icon" tabindex="0">
          ${PLATFORM_ICONS[p]}
          <span class="platform-label">${PLATFORM_LABELS[p]}</span>
        </div>`
          )
          .join("")}
      </div>
    </div>
  </section>

  <section id="directory">
    <div class="wrap">
      <div class="section-head">
        <span class="eyebrow">Live Directory</span>
        <h2>Find a Server</h2>
      </div>
      <div class="platform-toggle" role="tablist" aria-label="Filter by platform">
        ${["all", "console", "pc", "mobile", "web"]
          .map((p, i) => `<button type="button" class="platform-tab${i === 0 ? " active" : ""}" data-platform="${p}">${p === "all" ? "All Games" : p[0].toUpperCase() + p.slice(1)}</button>`)
          .join("")}
      </div>
      <div class="server-grid" id="server-grid">
        <div class="server-grid-empty">Loading live servers…</div>
      </div>
    </div>
  </section>

  <div class="hazard"></div>

  <section id="analytics">
    <div class="wrap">
      <div class="section-head">
        <span class="eyebrow">Open Algorithm</span>
        <h2>The Features Other Platforms Keep Hidden Behind a Paywall.</h2>
      </div>
      <div class="analytics-grid">
        <div class="analytics-card">
          <span class="idx">01</span>
          <h3>Real-Time Activity Tracking</h3>
          <p>Player queues, live lobby populations, and server uptime statistics naturally decide platform exposure - no pay-to-rank placements, ever.</p>
        </div>
        <div class="analytics-card">
          <span class="idx">02</span>
          <h3>Stay Connected</h3>
          <p>Filter servers by Game and Platform to find your exact environment before you ever connect.</p>
        </div>
        <div class="analytics-card">
          <span class="idx">03</span>
          <h3>Staying Legit</h3>
          <p>Open community reviews and verified checkmarks - granted by staff review, not purchased - keep scores honest and prevent manipulation.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="stats-ticker" id="stats-ticker">
    <div class="wrap">
      ${
        liveStats.servers >= LIVE_STATS_THRESHOLD
          ? `<div class="stats-ticker-grid">
        <div class="ticker-stat"><div class="ticker-num" data-count="${liveStats.servers}">0</div><div class="ticker-label">Verified Servers</div></div>
        <div class="ticker-stat"><div class="ticker-num" data-count="${liveStats.players}">0</div><div class="ticker-label">Tracked Players</div></div>
        <div class="ticker-stat"><div class="ticker-num" data-count="${liveStats.kills}">0</div><div class="ticker-label">PvP Kills Logged</div></div>
        <div class="ticker-stat"><div class="ticker-num" data-count="${liveStats.playerHours}">0</div><div class="ticker-label">Hours Played</div></div>
      </div>`
          : `<div class="spec-chips">
        <span class="spec-chip"><strong>Free</strong>No paywall, ever</span>
        <span class="spec-chip"><strong>Live</strong>Real-time directory</span>
        <span class="spec-chip"><strong>Open</strong>No pay-to-rank</span>
        <span class="spec-chip"><strong>Cross-Platform</strong>Console, PC, mobile, web</span>
      </div>`
      }
    </div>
  </section>
</main>

${renderSiteFooter({ activeTab: "home", discordInviteUrl })}
<script>
  // Section 2: platform toggle + live server grid, fed from the real
  // GET /api/servers endpoint (same data the /servers page uses) - fetched
  // once, filtered client-side on tab click so switching platforms never
  // re-hits the network.
  (function () {
    var grid = document.getElementById("server-grid");
    var tabs = document.querySelectorAll(".platform-tab");
    if (!grid || !tabs.length) return;

    var allServers = [];
    var activePlatform = "all";

    function escapeHtml(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function render() {
      var list = activePlatform === "all" ? allServers : allServers.filter(function (s) {
        return (s.platforms || []).indexOf(activePlatform) !== -1;
      });
      if (!list.length) {
        grid.innerHTML = '<div class="server-grid-empty">No live servers for this platform yet.</div>';
        return;
      }
      grid.innerHTML = list.slice(0, 3).map(function (s) {
        var pct = s.maxPlayers ? Math.min(100, Math.round((s.playerCount / s.maxPlayers) * 100)) : 0;
        var count = s.isLive ? (s.playerCount != null ? s.playerCount : "?") + "/" + (s.maxPlayers != null ? s.maxPlayers : "?") : "Offline";
        return '<div class="server-card">' +
          '<div class="server-card-head"><span class="server-status-dot' + (s.isLive ? " live" : "") + '"></span><h3>' + escapeHtml(s.title) + "</h3></div>" +
          '<div class="server-capacity"><div class="server-capacity-track"><div class="server-capacity-fill" style="width:' + pct + '%"></div></div><span class="server-capacity-count">' + escapeHtml(count) + "</span></div>" +
          '<div class="server-card-actions">' +
            (s.serverCode ? '<button type="button" class="btn btn-ghost small" data-copy="' + escapeHtml(s.serverCode) + '">Copy IP</button>' : "") +
            (s.socials && s.socials.discord ? '<a class="btn btn-ghost small" href="' + escapeHtml(s.socials.discord) + '" target="_blank" rel="noopener noreferrer">Join Discord</a>' : "") +
          "</div>" +
        "</div>";
      }).join("");

      grid.querySelectorAll("[data-copy]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          navigator.clipboard && navigator.clipboard.writeText(btn.getAttribute("data-copy"));
          var original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = original; }, 1200);
        });
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        activePlatform = tab.getAttribute("data-platform");
        render();
      });
    });

    fetch("/api/servers")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        allServers = data.servers || [];
        render();
      })
      .catch(function () {
        grid.innerHTML = '<div class="server-grid-empty">Couldn\\'t load live servers right now.</div>';
      });
  })();

  // Section 4: count-up ticker, triggered once when it scrolls into view.
  (function () {
    var ticker = document.getElementById("stats-ticker");
    if (!ticker || !window.IntersectionObserver) return;
    var nums = ticker.querySelectorAll(".ticker-num");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function countUp(el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      if (reduced || target === 0) {
        el.textContent = target.toLocaleString();
        return;
      }
      var start = performance.now();
      var duration = 900;
      function tick(now) {
        var progress = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target).toLocaleString();
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          nums.forEach(countUp);
          observer.disconnect();
        }
      });
    }, { threshold: 0.4 });
    observer.observe(ticker);
  })();
</script>
</body>
</html>`;
}

/** Shared footer - same on every page using the site chrome. `activeTab` isn't used by the markup itself today but is accepted for parity with renderAppShell's call signature in case a future footer variant needs it. */
function renderSiteFooter({ activeTab, discordInviteUrl }) {
  return `<footer class="site">
  <div class="wrap footgrid">
    <div class="footcol">
      <a class="wordmark" href="#top" style="margin-bottom: 14px;">
        <img class="wordmark-full" src="/brand/koba-wordmark-final.png" alt="KOBA" />
        <img class="wordmark-mascot" src="/brand/koba-mascot-square.png" alt="KOBA" />
      </a>
      <p style="margin-top: 6px;">Support: run <code>/support</code> in Discord</p>
      <a href="${discordInviteUrl}" target="_blank" rel="noopener noreferrer" style="margin-top: 4px;">Join our Discord →</a>
    </div>
    <div class="footcol">
      <h4>Product</h4>
      <a href="#directory">Server Directory</a>
      <a href="#analytics">Analytics</a>
      <a href="/app-store">KOBA App Store</a>
      <a href="/developer-portal">KOBA Developer Portal</a>
    </div>
    <div class="footcol">
      <h4>Legal</h4>
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
    </div>
    <div class="footcol">
      <h4>Socials</h4>
      <a class="social-link" href="${discordInviteUrl}" target="_blank" rel="noopener noreferrer" aria-label="Join the KOBA Discord">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
        <span>Discord</span>
      </a>
    </div>
  </div>
  <div class="footwatermark">KOBA</div>
  <div class="wrap footbar">
    <span class="footnote" style="margin-top:0;">© ${new Date().getFullYear()} KOBA GAMES. All rights reserved.</span>
  </div>
</footer>`;
}

module.exports = { renderPublicSite, SITE_STYLES, renderAppShell, renderSiteFooter };

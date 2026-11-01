"use strict";

/**
 * Single source of truth for KOBA Bot's web theme - tokens, base reset, and
 * shared components used across the staff admin console AND every
 * player/public-facing surface (site.js, dashboard.js, billing.js,
 * tickets.js, legal.js, serversDirectory.js, linkVerify.js, messages.js).
 *
 * HISTORY: before this file existed, admin/layout.js's `STYLES` (admin
 * console) and `PLAYER_THEME_CSS` (a first, partial consolidation attempt
 * covering only :root tokens + body for player-facing pages) were two
 * separate, slightly-different palettes, and six more files each hand-rolled
 * their own copy of cards/buttons/panels/fields/pills/tables on top of
 * whichever tokens they happened to import (or didn't). Different files used
 * different border-radius values (4px/6px/8px/10px/14px for the same kind of
 * element), different shadow depths, different spacing units, and one
 * (billing.js/legal.js) didn't share tokens with anything else at all.
 *
 * This file is that one consolidation, done completely: ONE :root token set
 * (colors, spacing scale, radius scale, shadow scale, fonts) with light/dark
 * via `@media (prefers-color-scheme)` AND `[data-theme]` overrides, used by
 * literally every page shell in admin/*.js, plus the actual shared component
 * CSS (buttons, cards, panels, fields, pills, tables, pagehead/eyebrow,
 * empty states) so those stop being hand-copied too. Every consumer still
 * layers page-specific CSS on top for its own genuinely unique parts (the
 * public site's hero/marketing sections, the admin sidebar shell, giveaway
 * pages' sponsor-driven color overrides, etc) - this file only owns what's
 * actually shared.
 *
 * REBRANDED (2026-09-08): the lime-to-teal accent read as a generic SaaS
 * green, not a Rust Console Edition clan-wars/explosives product for a
 * gaming audience - swapped for "Blast Orange" -> "Reactor Blue"
 * (--magenta/--cyan below), a heat-to-cold detonation-flash pairing that
 * actually matches "KOBA Bot" and reads as gaming/military-HUD rather than
 * productivity-SaaS. `--magenta`/`--cyan` keep their (now doubly
 * inaccurate) names on purpose - a mass find/replace across every gradient
 * rule that already references them isn't worth the risk for a rename.
 * `--safe` (online/positive status) is now its own real green instead of
 * reusing the brand accent, since the accent itself is no longer green.
 */

// ---------------------------------------------------------------------------
// TOKENS - the one :root palette + scales every surface (admin console AND
// player/public pages) now reads from. Dark is the default (this is a
// dark-first brand); light mode follows the visitor's OS preference via
// `@media (prefers-color-scheme: light)`, with `[data-theme="light"/"dark"]`
// attribute overrides kept ready for a future manual toggle (unused today,
// harmless to ship - matches the pattern the old PLAYER_THEME_CSS already
// established).
// ---------------------------------------------------------------------------
const TOKENS_CSS = `
:root {
  /* ---- Color: dark (default) ---- */
  --bg: #07070d;
  --bg-panel: #0d0d18;
  --bg-panel-raised: #12121e;
  --bg-raised: #12121e; /* compat alias, some older component CSS reads --bg-raised instead of --bg-panel-raised */
  --line: #22223a;
  --ink: #eef0f8;
  --ink-dim: #8b8fa8;

  /* Brand accent (2026-10-15, 3rd repoint): Red/Black/White - replaced the
     orange-to-gold fire gradient per direct product direction. --cyan now
     carries the theme's own near-white (dark mode) / near-black (light
     mode) tone instead of a hue, so the --magenta/--cyan gradient pairing
     used everywhere (buttons, active-tab underlines, focus rings) reads as
     "red fading into the page's own black/white" in both themes
     automatically, rather than needing a separate light/dark gradient
     rule. Kept under the --magenta/--cyan names so every existing
     gradient/hover/focus rule that already references them picks up the
     new palette without a rewrite. --lime still points at --safe's green,
     unrelated to this change. */
  --magenta: #e8291c;
  --cyan: #ffffff;
  --lime: #35d67a;
  --danger: #ff3b5c;
  --amber: #ffb020;
  --warn: #ffb020;
  --safe: #35d67a;
  --violet: #b388ff;
  --gold: #ffd76a;

  /* ---- Compat aliases ---- some already-shipped component CSS was written
     against these shorter names before this token set existed. Custom
     property references resolve live, not at parse time, so these only
     need to exist once here - they follow --bg-panel/--ink-dim/etc through
     every light/dark override below automatically. */
  --panel: var(--bg-panel);
  --panel-raised: var(--bg-panel-raised);
  --dim: var(--ink-dim);

  /* ---- Type ---- */
  --font-display: "Arial Black", "Helvetica Neue", Arial, sans-serif;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace;

  /* ---- Spacing scale (fluid: shrinks slightly on small viewports via
     clamp so dense admin panels don't feel cramped on mobile without
     needing a separate mobile-only spacing pass everywhere). ---- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: clamp(10px, 2.6vw, 12px);
  --space-4: clamp(12px, 3.2vw, 16px);
  --space-5: clamp(16px, 3.6vw, 20px);
  --space-6: clamp(18px, 4.2vw, 24px);
  --space-8: clamp(24px, 5.4vw, 32px);
  --space-10: clamp(28px, 6.4vw, 40px);

  /* ---- Radius scale (one system replaces the old 4/6/8/10/14px per-file
     grab-bag) ---- */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 999px;

  /* ---- Shadow scale ---- */
  --shadow-sm: 0 4px 14px -8px rgba(0, 0, 0, 0.55);
  --shadow-md: 0 10px 28px -18px rgba(0, 0, 0, 0.65);
  --shadow-lg: 0 20px 50px -24px rgba(0, 0, 0, 0.7);

  /* ---- Touch target minimum (WCAG 2.1 AA / 2.5.5, and Apple HIG/Material
     agree at ~44px) - referenced by interactive elements below instead of
     each one guessing its own min-height. ---- */
  --touch-target: 44px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #eef0f5;
    --bg-panel: #f8f9fc;
    --bg-panel-raised: #ffffff;
    --bg-raised: #ffffff;
    --line: #d9dce6;
    --ink: #12141c;
    --ink-dim: #565f75;
    /* Red at full dark-mode saturation fails WCAG AA text contrast on a
       light background (#e8291c on white is ~3.6:1, under the 4.5:1
       body-text minimum) - darkened here to clear AA (#b01810 on white ≈
       5.6:1) while keeping the same hue. --cyan flips from near-white to
       near-black for light mode - same "the gradient fades into whichever
       end of the black/white spectrum this theme's background is" logic
       as dark mode, just inverted, and black-on-white has no contrast
       problem the way white-on-white would. */
    --magenta: #b01810;
    --cyan: #1a1a1a;
    --lime: #1f8a4d;
    --danger: #c22a41;
    --amber: #8a5a00;
    --warn: #8a5a00;
    --safe: #1f8a4d;
    --violet: #6a3df0;
    --gold: #9c6d00;
  }
}
:root[data-theme="light"] {
  --bg: #eef0f5; --bg-panel: #f8f9fc; --bg-panel-raised: #ffffff; --bg-raised: #ffffff;
  --line: #d9dce6; --ink: #12141c; --ink-dim: #565f75;
  --magenta: #b01810; --cyan: #1a1a1a; --lime: #1f8a4d; --danger: #c22a41; --amber: #8a5a00; --warn: #8a5a00; --safe: #1f8a4d; --violet: #6a3df0; --gold: #9c6d00;
}
:root[data-theme="dark"] {
  --bg: #07070d; --bg-panel: #0d0d18; --bg-panel-raised: #12121e; --bg-raised: #12121e;
  --line: #22223a; --ink: #eef0f8; --ink-dim: #8b8fa8;
  --magenta: #e8291c; --cyan: #ffffff; --lime: #35d67a; --danger: #ff3b5c; --amber: #ffb020; --warn: #ffb020; --safe: #35d67a; --violet: #b388ff; --gold: #ffd76a;
}
`;

// ---------------------------------------------------------------------------
// BASE - reset + body chrome shared by every page (the ambient radial-glow
// background, scrollbar hiding, base link/heading/table rules). Extracted
// verbatim from the old PLAYER_THEME_CSS's body rules so nothing visually
// shifts on pages that already had it, now also used by the admin console
// (which previously had its own, slightly different gradient/scrollbar
// handling) so both surfaces share one ambient look.
// ---------------------------------------------------------------------------
const BASE_CSS = `
* { box-sizing: border-box; }
html, body { overflow-x: hidden; width: 100%; max-width: 100vw; }
html { -webkit-text-size-adjust: 100%; scrollbar-width: none; }
::-webkit-scrollbar { display: none; width: 0; height: 0; }
body {
  margin: 0;
  /* Solid black, no ambient gradient wash (2026-10-15, per direct product
     direction - "the background should be black no gradients, just use
     gradients for things like buttons, and active icons/active tabs").
     Gradients stay scoped to specific components (CTA buttons, XP bars,
     active nav-tab indicators) rather than painted across the whole page. */
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.55;
}
a { color: inherit; text-decoration: none; }
h1, h2, h3 { margin: 0; text-wrap: balance; }
p { margin: 0; }
code { font-family: var(--font-mono); background: color-mix(in srgb, var(--cyan) 12%, transparent); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
::selection { background: var(--magenta); color: #06110a; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 10px 14px; font-size: 13.5px; border-bottom: 1px solid var(--line); }
th { color: var(--ink-dim); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
`;

// ---------------------------------------------------------------------------
// COMPONENTS - the shared component vocabulary: buttons, cards, panels,
// pills/badges, form fields, tables, the pagehead/eyebrow heading pattern,
// and empty states. Every rule below is written against the tokens above so
// a future palette tweak (or a real light/dark toggle) never needs a second
// pass through every consumer file.
// ---------------------------------------------------------------------------
const COMPONENT_CSS = `
/* ---------- Buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: var(--touch-target);
  background: var(--magenta); color: #fff;
  border: none; border-radius: var(--radius-md); padding: 10px 20px; font-weight: 700; font-size: 14px;
  font-family: var(--font-body); cursor: pointer; text-decoration: none;
  box-shadow: 0 4px 16px -6px color-mix(in srgb, var(--magenta) 55%, transparent);
  transition: box-shadow .15s ease, transform .1s ease, border-color .15s ease, color .15s ease;
}
.btn:hover { box-shadow: 0 6px 22px -4px color-mix(in srgb, var(--cyan) 55%, transparent); transform: translateY(-1px); }
.btn:active { transform: translateY(1px); }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); box-shadow: none; }
.btn.ghost:hover { border-color: var(--cyan); color: var(--cyan); box-shadow: none; transform: none; }
.btn.small { min-height: 34px; padding: 6px 14px; font-size: 12.5px; border-radius: var(--radius-sm); }
.btn.full { width: 100%; }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; box-shadow: none; transform: none; }

/* ---------- Cards ---------- */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: var(--space-4); margin-bottom: var(--space-8); }
.card {
  background: var(--bg-panel-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: color-mix(in srgb, var(--cyan) 35%, var(--line)); }
.card .icon-badge {
  width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;
  font-size: 18px; margin-bottom: var(--space-4);
}
.card .icon-badge.magenta { background: color-mix(in srgb, var(--magenta) 18%, transparent); color: var(--magenta); }
.card .icon-badge.cyan { background: color-mix(in srgb, var(--cyan) 18%, transparent); color: var(--cyan); }
.card .icon-badge.safe { background: color-mix(in srgb, var(--safe) 18%, transparent); color: var(--safe); }
.card .icon-badge.warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.card .label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-dim); }
.card .value { font-family: var(--font-mono); font-size: clamp(22px, 4vw, 28px); font-weight: 700; margin-top: var(--space-2); }
.card .sub { font-size: 12px; color: var(--ink-dim); margin-top: var(--space-1); }
.card .card-title { font-weight: 700; margin-bottom: var(--space-1); }
.card .card-sub { font-size: 12.5px; color: var(--ink-dim); margin-bottom: var(--space-2); }
.card .card-sub.dim { font-style: italic; }

/* ---------- Panels ---------- */
.panel { background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-6); margin-bottom: var(--space-6); box-shadow: var(--shadow-md); }
.panel h2 { font-size: 16px; font-weight: 800; margin-bottom: var(--space-4); text-transform: uppercase; letter-spacing: 0.04em; }

/* ---------- Pills / badges ---------- */
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 10px; border-radius: var(--radius-full); background: color-mix(in srgb, currentColor 14%, transparent);
  color: var(--cyan);
}
.pill.open { color: var(--warn); }
.pill.pending { color: var(--cyan); }
.pill.closed { color: var(--safe); }
.pill.active { color: var(--safe); }
.pill.left { color: var(--ink-dim); }
.pill.locked { color: var(--danger); }

/* ---------- Forms ---------- */
.field { display: grid; gap: var(--space-2); margin-bottom: var(--space-4); }
.field label { font-size: 12.5px; font-weight: 600; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.field input, .field select, .field textarea {
  background: var(--bg-panel-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: var(--ink);
  padding: 10px 12px;
  min-height: var(--touch-target);
  font-family: var(--font-body);
  font-size: 14px;
  width: 100%;
}
.field textarea { min-height: 90px; height: auto; resize: vertical; }
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none; border-color: var(--cyan); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cyan) 22%, transparent);
}
.formrow { display: flex; gap: var(--space-4); flex-wrap: wrap; }
.formrow .field { flex: 1; min-width: 160px; }

/* ---------- Tables ----------
   Responsive strategy: horizontal scroll on narrow viewports rather than a
   markup-level stacked/card rewrite, since these tables are populated by
   business logic in each route file that this refactor must not touch.
   .tablewrap scrolls its own overflow with visible momentum + a subtle
   edge fade so it reads as "more to scroll", not a layout bug; the table
   itself never forces the page wider than the viewport. */
.tablewrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  background-image:
    linear-gradient(to right, var(--bg-panel), transparent 24px),
    linear-gradient(to left, var(--bg-panel), transparent 24px);
  background-position: left, right;
  background-repeat: no-repeat;
  background-size: 24px 100%;
  background-attachment: local, local;
}
.tablewrap table { min-width: 480px; }
.tablewrap tr { cursor: default; }
.tablewrap tr[onclick] { cursor: pointer; }
.tablewrap tr[onclick]:hover { background: color-mix(in srgb, var(--cyan) 6%, transparent); }

/* ---------- Page heading pattern ---------- */
.pagehead { margin-bottom: var(--space-8); }
.pagehead .eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cyan);
}
.pagehead h1 { font-family: var(--font-display); text-transform: uppercase; font-weight: 900; font-size: clamp(22px, 4.2vw, 28px); margin-top: var(--space-2); }
.eyebrow { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--cyan); }
.eyebrow::before { content: ""; width: 8px; height: 8px; background: var(--cyan); display: inline-block; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); box-shadow: 0 0 10px color-mix(in srgb, var(--cyan) 80%, transparent); flex-shrink: 0; }

/* ---------- Misc ---------- */
.empty { color: var(--ink-dim); font-size: 14px; padding: var(--space-8) var(--space-4); text-align: center; }
.note { font-size: 12.5px; color: var(--ink-dim); margin-top: var(--space-3); }
.statusline { font-size: 14px; margin-bottom: var(--space-4); }
.statusline.good { color: var(--cyan); }
.statusline.bad { color: var(--danger); }
`;

// ---------------------------------------------------------------------------
// ADMIN SHELL - the staff console's sidebar/topbar chrome (admin/layout.js).
// Below --admin-collapse (900px, matching the common SaaS-dashboard
// slide-out-drawer breakpoint) the fixed 220px sidebar becomes an off-canvas
// drawer opened by a hamburger button in a slim mobile topbar, mirroring the
// same drawer/backdrop/Escape-to-close pattern admin/site.js already uses
// for the public nav (one interaction pattern for "off-canvas nav" across
// the whole product, not two).
// ---------------------------------------------------------------------------
const ADMIN_SHELL_CSS = `
body.admin-shell { display: flex; min-height: 100vh; }

.admin-mobile-topbar {
  display: none;
  position: sticky; top: 0; z-index: 40;
  align-items: center; justify-content: space-between;
  padding: 12px var(--space-4);
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.admin-mobile-topbar .brand-word { font-family: var(--font-display); font-weight: 900; text-transform: uppercase; font-size: 16px; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
.admin-hamburger {
  display: flex; align-items: center; justify-content: center;
  width: var(--touch-target); height: var(--touch-target); flex-shrink: 0;
  background: none; border: 1px solid var(--line); border-radius: var(--radius-md);
  color: var(--ink); cursor: pointer;
}
.admin-hamburger:hover, .admin-hamburger:focus-visible { color: var(--cyan); border-color: var(--cyan); }
.admin-hamburger svg { width: 20px; height: 20px; }

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--line);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  font-family: var(--font-display);
  font-weight: 900;
  text-transform: uppercase;
  font-size: 19px;
  letter-spacing: -0.01em;
  padding: 6px 10px 16px;
  display: flex; align-items: center; gap: 8px;
}
.brand-text { display: flex; flex-direction: column; }
.brand-word { display: flex; align-items: center; gap: 1px; line-height: 1; }
.brand-word .b1 { color: var(--ink); }
.brand-word .b2 { background-image: linear-gradient(90deg, var(--magenta), var(--cyan)); background-repeat: no-repeat; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.brand img { height: 30px; width: auto; display: block; flex-shrink: 0; }
.brand .tag { font-size: 11px; color: var(--ink-dim); font-weight: 600; letter-spacing: 0.08em; margin-top: 6px; }
.navlink {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--touch-target);
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  border-radius: var(--radius-md);
  transition: background .15s ease, color .15s ease;
}
.navlink .ic { color: var(--ink-dim); width: 16px; text-align: center; }
.navlink:hover { color: var(--ink); background: var(--bg-panel-raised); }
.navlink.active {
  color: #06110a;
  background: linear-gradient(90deg, var(--magenta), var(--cyan));
  box-shadow: 0 4px 16px -4px color-mix(in srgb, var(--magenta) 55%, transparent);
}
.navlink.active .ic { color: #06110a; }
.sidebar form { margin-top: auto; }
.logout {
  width: 100%;
  min-height: var(--touch-target);
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-dim);
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.logout:hover { color: var(--danger); border-color: var(--danger); }

.main { flex: 1; min-width: 0; padding: 0 var(--space-10) var(--space-10); }
.topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-5) 0 var(--space-2); margin-bottom: var(--space-2);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
}
.topbar .back {
  display: flex; align-items: center; gap: 6px;
  color: var(--ink-dim); font-size: 13px; font-weight: 600;
  transition: color .15s ease;
}
.topbar .back:hover { color: var(--cyan); }
.topbar .who {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-panel); border-radius: var(--radius-full); padding: 6px 14px 6px 6px;
  box-shadow: var(--shadow-sm);
}
.topbar .who span { font-size: 13px; font-weight: 700; color: var(--ink); }

/* ---------- Mobile drawer (<900px): sidebar leaves flow entirely and
   becomes an off-canvas panel, matching admin/site.js's public-nav drawer
   interaction (open via hamburger, close via ×/backdrop/Escape). ---------- */
@media (max-width: 900px) {
  .admin-mobile-topbar { display: flex; }
  .main { padding: 0 var(--space-4) var(--space-8); }
  .topbar { padding-top: var(--space-4); }

  .sidebar {
    position: fixed; top: 0; right: 0; bottom: 0; left: auto; height: 100%;
    width: min(300px, 86vw);
    border-right: none; border-left: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform .25s ease;
    z-index: 91;
    padding-top: max(22px, env(safe-area-inset-top));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  body.admin-drawer-open .sidebar { transform: translateX(0); }
  body.admin-drawer-open { overflow: hidden; }

  .admin-drawer-backdrop {
    position: fixed; inset: 0; z-index: 90;
    background: color-mix(in srgb, var(--bg) 65%, transparent);
    backdrop-filter: blur(4px);
    opacity: 0; pointer-events: none; transition: opacity .2s ease;
  }
  body.admin-drawer-open .admin-drawer-backdrop { opacity: 1; pointer-events: auto; }

  .sidebar .brand { display: none; } /* wordmark already shown in the mobile topbar strip */
}
@media (prefers-reduced-motion: reduce) {
  .sidebar, .admin-drawer-backdrop { transition: none; }
}
`;

// ---------------------------------------------------------------------------
// APP SHELL (2026-09-09) - the player/public-facing surface's entire nav
// model, replacing the old marketing-site header + off-canvas hamburger
// drawer + bottom tab bar (three separate nav surfaces, only one of which
// worked without JS). Per direct product direction: no sidebar anywhere on
// this surface, a persistent TOP TAB STRIP (the section-level destinations:
// Groups/Servers/LFG/Leaderboard - Home is reached via the logo, same as
// the reference mockup), and a persistent 5-ICON BOTTOM NAV (Home, Groups,
// Servers, LFG, Profile) that's visible at every viewport width, not just
// mobile - this product IS the bottom-nav app shell now, everywhere, not a
// marketing page with an app bolted on underneath it. Both bars are always
// on screen (position: fixed), so every page reserves body padding equal
// to their heights instead of content sliding underneath them.
// ---------------------------------------------------------------------------
const APP_SHELL_CSS = `
:root { --topbar-h: 64px; --bottomnav-h: 64px; }
body.app-shell {
  padding-top: var(--topbar-h);
  padding-bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom));
}

.app-topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  height: var(--topbar-h);
  display: flex; align-items: center; gap: var(--space-6);
  padding: 0 var(--space-5);
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}
.app-topbar .wordmark { flex-shrink: 0; }
.app-tabs {
  display: flex; align-items: center; gap: var(--space-6);
  overflow-x: auto; scrollbar-width: none; flex: 1; min-width: 0; height: 100%;
}
.app-tabs::-webkit-scrollbar { display: none; }
.app-tabs a {
  flex-shrink: 0;
  display: flex; align-items: center; height: 100%;
  font-size: 14px; font-weight: 700; color: var(--ink-dim);
  text-decoration: none; white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: color .15s ease, border-color .15s ease;
}
.app-tabs a:hover, .app-tabs a:focus-visible { color: var(--ink); }
.app-tabs a.active { color: var(--ink); border-bottom-color: var(--ink); }
.app-topbar-cta { flex-shrink: 0; display: flex; align-items: center; gap: var(--space-3); }
.app-topbar-cta .btn-label-short { display: none; }
@media (max-width: 640px) {
  .app-topbar-cta .btn-label-full { display: none; }
  .app-topbar-cta .btn-label-short { display: inline; }
  .app-topbar { padding: 0 var(--space-3); gap: var(--space-3); }
}

.app-bottomnav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  height: var(--bottomnav-h);
  padding-bottom: env(safe-area-inset-bottom);
  display: flex; align-items: stretch; justify-content: space-around;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--line);
}
.app-bottomnav a, .app-bottomnav button {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  min-width: var(--touch-target); min-height: var(--touch-target);
  background: none; border: none; color: var(--ink-dim); cursor: pointer;
  font-family: var(--font-body); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
}
.app-bottomnav svg { width: 22px; height: 22px; }
.app-bottomnav svg * { stroke: currentColor; transition: stroke .15s ease; }
.app-bottomnav a:hover, .app-bottomnav a:focus-visible,
.app-bottomnav button:hover, .app-bottomnav button:focus-visible { color: var(--ink); }
.app-bottomnav a:focus-visible, .app-bottomnav button:focus-visible { outline: 2px solid var(--ink); outline-offset: -4px; }
.app-bottomnav a.tab-active { color: var(--ink); }
`;

/** Inline (no build step, so plain vanilla JS) drawer open/close wiring for the admin console's mobile nav - mirrors admin/site.js's public drawer script one-for-one so the whole product has exactly one off-canvas-nav interaction pattern. */
const ADMIN_DRAWER_SCRIPT = `
<script>
(function () {
  var body = document.body;
  var backdrop = document.getElementById("admin-drawer-backdrop");
  var openBtn = document.getElementById("admin-menu-toggle");
  var sidebar = document.querySelector(".sidebar");
  if (!backdrop || !openBtn || !sidebar) return;
  function openDrawer() { body.classList.add("admin-drawer-open"); openBtn.setAttribute("aria-expanded", "true"); }
  function closeDrawer() { body.classList.remove("admin-drawer-open"); openBtn.setAttribute("aria-expanded", "false"); }
  openBtn.addEventListener("click", function () {
    body.classList.contains("admin-drawer-open") ? closeDrawer() : openDrawer();
  });
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  sidebar.querySelectorAll("a, button").forEach(function (el) { el.addEventListener("click", closeDrawer); });
})();
</script>
`;

/** Full page-shell CSS (tokens + base + components) - what every page shell string-concats before its own page-specific rules. */
const PAGE_CSS = `${TOKENS_CSS}\n${BASE_CSS}\n${COMPONENT_CSS}`;

/**
 * PLAYER_THEME_CSS - kept as the exact export name/shape every existing
 * consumer (site.js, dashboard.js, linkVerify.js) already requires from
 * "./layout" so nothing else needs to change its require path. It now
 * resolves to the full shared token+base+component set rather than just
 * tokens+body, since those files' own PAGE_STYLES/SITE_STYLES no longer
 * duplicate `.btn`/`.card`/`.panel`/`.pill`/`.field` locally.
 */
const PLAYER_THEME_CSS = PAGE_CSS;

module.exports = {
  TOKENS_CSS,
  BASE_CSS,
  COMPONENT_CSS,
  ADMIN_SHELL_CSS,
  ADMIN_DRAWER_SCRIPT,
  APP_SHELL_CSS,
  PAGE_CSS,
  PLAYER_THEME_CSS,
};

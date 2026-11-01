"use strict";

const { PAGE_CSS, ADMIN_SHELL_CSS, ADMIN_DRAWER_SCRIPT, PLAYER_THEME_CSS } = require("./theme");

// `roles` gates which staff roles see each link - undefined roles means
// "everyone logged in" (used for the always-visible items like the live
// site link). Superadmin: everything. Admin: day-to-day operator work,
// nothing billing/access-sensitive. Moderator: tickets/support only.
const NAV = [
  { href: "/admin", label: "Overview", icon: "⌂", roles: ["superadmin", "admin"] },
  { href: "/admin/installs", label: "Installs", icon: "⊞", roles: ["superadmin", "admin"] },
  { href: "/admin/sales", label: "Sales", icon: "✦", roles: ["superadmin", "admin"] },
  { href: "/admin/access", label: "Access Tokens", icon: "⚿", roles: ["superadmin"] },
  { href: "/admin/tip4serv", label: "Tip4Serv", icon: "⌬", roles: ["superadmin"] },
  { href: "/admin/tickets", label: "Tickets", icon: "✉", roles: ["superadmin", "admin", "moderator"] },
  { href: "/admin/giveaways", label: "Giveaways", icon: "⚑", roles: ["superadmin", "admin"] },
  { href: "/admin/settings", label: "Site Settings", icon: "⚙", roles: ["superadmin", "admin"] },
  { href: "/admin/staff", label: "Staff Accounts", icon: "⚉", roles: ["superadmin"] },
  { href: "/admin/boom-flags", label: "BOOMid Flags", icon: "⚠", roles: ["superadmin"] },
  { href: "/admin/directory-servers", label: "Directory Listings", icon: "🎮", roles: ["superadmin"] },
  { href: "/", label: "View Live Site ↗", icon: "⇗" },
];

const ROLE_LABELS = { superadmin: "SuperAdmin", admin: "Admin", moderator: "Moderator" };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtMoney(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
}

function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Admin console page-specific CSS layered on top of the shared PAGE_CSS +
// ADMIN_SHELL_CSS from ./theme (tokens, base reset, .btn/.card/.panel/
// .pill/.field/.pagehead components, sidebar/topbar shell + mobile drawer
// collapse). Nothing here duplicates a shared rule anymore - see the "FIXED
// (2026-09-08)" note further down for the history of why this used to be a
// large, fully self-contained stylesheet.
const STYLES = `${PAGE_CSS}\n${ADMIN_SHELL_CSS}`;

function renderLayout({ title, activeHref, body, staffUser }) {
  const role = staffUser?.role;
  const visibleNav = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — KOBA Bot Admin</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${STYLES}</style>
</head>
<body class="admin-shell">
  <div class="admin-mobile-topbar">
    <a class="brand-word" href="/admin"><img src="/brand/icon-mark.png" alt="" style="height:22px;" /><span class="b1">KOBA</span><span class="b2"> Bot</span></a>
    <button type="button" class="admin-hamburger" id="admin-menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="admin-sidebar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>
  <div class="admin-drawer-backdrop" id="admin-drawer-backdrop"></div>
  <aside class="sidebar" id="admin-sidebar">
    <div class="brand">
      <img src="/brand/icon-mark.png" alt="" />
      <div class="brand-text">
        <div class="brand-word"><span class="b1">KOBA</span><span class="b2"> Bot</span></div>
        <span class="tag">ADMIN</span>
      </div>
    </div>
    ${visibleNav.map((n) => `<a class="navlink ${n.href === activeHref ? "active" : ""}" href="${n.href}"><span class="ic">${n.icon}</span>${n.label}</a>`).join("\n")}
    <form method="post" action="/admin/logout"><button class="logout" type="submit">Log out</button></form>
  </aside>
  <main class="main">
    <div class="topbar">
      ${activeHref !== "/admin" ? `<a class="back" href="/admin">← Overview</a>` : `<span></span>`}
      <div class="who"><span>${escapeHtml(staffUser?.username || "Operator")}${role ? ` <span class="tag">${escapeHtml(ROLE_LABELS[role] || role)}</span>` : ""}</span></div>
    </div>
    ${body}
  </main>
  ${ADMIN_DRAWER_SCRIPT}
</body>
</html>`;
}

/**
 * FIXED (2026-09-08): every PLAYER-FACING page shell (admin/site.js's
 * public pages, admin/dashboard.js's /dashboard pages, admin/linkVerify.js's
 * /link page) used to hand-roll its own copy of a `:root` palette + body
 * background - site.js had the real, complete version (light/dark media
 * query, explicit [data-theme] overrides, the ambient radial-gradient glow);
 * dashboard.js and linkVerify.js had only a flat, ALWAYS-DARK subset with no
 * light-mode handling at all, AND hardcoded `data-theme="dark"` on their own
 * <html> tag - so a visitor in light mode (OS-level, most browsers' default)
 * saw a light homepage/servers-directory, then hit a jarring flip to solid
 * black the moment they navigated to /dashboard or clicked a /link
 * verification DM.
 *
 * SUPERSEDED (2026-09-08, same day): that first fix only unified `:root`
 * tokens + body - every consumer still hand-rolled its own `.btn`/`.card`/
 * `.panel`/`.pill`/`.field` on top, each with a different border-radius/
 * shadow/spacing value, and admin/layout.js's own internal-staff-console
 * `STYLES` was a completely separate, third copy of the same idea with yet
 * another palette. `PLAYER_THEME_CSS` is now just a re-export of
 * ./theme.js's `PAGE_CSS` (tokens + base reset + the full shared component
 * set) - the same one admin/layout.js's own `STYLES` also builds on - so
 * there is exactly one design system for both the staff admin console and
 * every player/public surface, not three. Every page shell should still
 * embed this string directly (nothing about the require path changed), and
 * should NOT set data-theme on <html> itself (this lets
 * @media (prefers-color-scheme) do its job; the [data-theme="light"/"dark"]
 * selectors in ./theme.js are for a future manual toggle, unused today but
 * harmless to keep ready).
 */

module.exports = { renderLayout, escapeHtml, fmtMoney, fmtDate, PLAYER_THEME_CSS };

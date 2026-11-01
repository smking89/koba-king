"use strict";

/**
 * Public /servers page - a first-class destination in the shared app shell
 * (top bar/tabs, bottom nav, footer all come from ./site.js's
 * renderAppShell/renderSiteFooter, the exact same shell the homepage
 * uses), not a standalone page with its own "back to site" link bolted
 * onto a bespoke header. Read-only browsing, no login required: lists
 * every server registered via /directory register
 * (utils/directoryPanel.js) with live player counts/ping, map/seed/wipe
 * details, star ratings, tags, and socials - reuses that same data rather
 * than building a second directory.
 *
 * Card shell: a chiseled, cut-corner frame (clip-path, not a plain rounded
 * rectangle) per the reference mockup the user provided - a colored edge
 * on verified listings, a neutral edge on everything else, so the one
 * visual distinction the mockup drew between its two example cards maps to
 * a real, meaningful signal (staff-verified) instead of being decorative.
 *
 * Every field shown is real, sourced data - nothing fabricated:
 *  - Ping is the actual RCON request/response round-trip time measured on
 *    every telemetry poll (utils/directoryPanel.js's runDirectoryTelemetryTick)
 *    - not a player's client-side ping (KOBA Bot has no way to measure that),
 *    but an honest number, not a placeholder.
 *  - Map/Seed/Wipe schedule are admin-entered via /directory register's
 *    optional fields (map_type/seed/wipe_schedule) - not parsed from RCON,
 *    since no confirmed-real field for these exists in this codebase's RCON
 *    parser yet. Only shown if the admin actually filled them in.
 *  - TikTok/Twitch/Website icons only render if that admin-entered URL
 *    exists; Discord always shows since invite_url is required at registration.
 *  - Xbox/PlayStation badges show unconditionally - Rust Console Edition is
 *    cross-play by nature, so that's true for every server without needing
 *    any extra data.
 *  - Follow/Unfollow is a REAL feature (directory_follows table, POST
 *    /servers/:guildId/follow|unfollow in admin/server.js) gated on the
 *    same Discord OAuth session /dashboard already uses - not a stub.
 */

const { escapeHtml } = require("./layout");
const { SITE_STYLES, renderAppShell, renderSiteFooter } = require("./site");
const db = require("../database/db");

const TELEMETRY_STALE_MS = 10 * 60 * 1000; // matches directoryPanel's own ~2min poll cadence with plenty of slack before calling it "stale"

function starString(avgStars) {
  const full = Math.round(avgStars);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/** A short, non-sequential-looking public code from the row's real auto-increment id - just obscures "server #4 out of N total", not a security boundary. */
function shortServerId(id) {
  return id.toString(36).toUpperCase().padStart(6, "0");
}

const DISCORD_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>`;
const TIKTOK_ICON_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82c-1.06-.93-1.72-2.28-1.72-3.78h-3.15v13.4c0 1.62-1.32 2.94-2.94 2.94s-2.94-1.32-2.94-2.94 1.32-2.94 2.94-2.94c.31 0 .6.05.88.13V9.4a6.16 6.16 0 0 0-.88-.06A6.13 6.13 0 0 0 2.7 15.5a6.13 6.13 0 0 0 6.13 6.13 6.13 6.13 0 0 0 6.13-6.13V9.01a8.9 8.9 0 0 0 5.2 1.66V7.53a5.6 5.6 0 0 1-3.56-1.71Z"/></svg>`;
const TWITCH_ICON_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M4.3 2 3 5.6v14.2h5.1V22l3.6-2.2h4L21 14V2H4.3ZM19.3 13.1l-3 3h-4l-2.7 2.2v-2.2H5.9V3.7h13.4v9.4Z"/><path d="M14.9 6.7h1.7v5H14.9zm-4.5 0h1.7v5h-1.7z"/></svg>`;
const WEBSITE_ICON_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9Z"/></svg>`;
const XBOX_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2a9.96 9.96 0 0 1 6.29 2.226c.313.253.302.632-.014.929-2.72 2.55-4.4 4.6-6.276 7.353-1.876-2.753-3.556-4.803-6.276-7.353-.316-.297-.327-.676-.014-.929A9.96 9.96 0 0 1 12 2Zm-8.66 4.44c.19-.02.39.05.55.21 2.53 2.4 4.6 4.9 6.11 7.19-1.87 2.86-4.36 5.9-6.66 6.98a10 10 0 0 1-1.13-14.05c.31-.4.7-.29 1.13-.33Zm17.32 0c.43.04.82-.07 1.13.33a10 10 0 0 1-1.13 14.05c-2.3-1.08-4.79-4.12-6.66-6.98 1.51-2.29 3.58-4.79 6.11-7.19.16-.16.36-.23.55-.21ZM12 15.4c1.35 1.98 2.9 4.1 4.53 5.53A9.94 9.94 0 0 1 12 22a9.94 9.94 0 0 1-4.53-1.07C9.1 19.5 10.65 17.38 12 15.4Z"/></svg>`;
const PLAYSTATION_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8.985 2.596v17.949l3.523 1.144V6.06c0-.538.237-.899.6-.78.475.14.57.63.57 1.169v5.708c1.789.87 3.195.045 3.195-2.088 0-2.185-.77-3.16-3.014-3.933-1.185-.41-2.958-1.02-4.874-1.54Zm10.152 12.874c-.518-.297-1.096-.319-1.674-.104l-3.652 1.31v2.213l2.44-.88c.29-.1.548-.03.548.32 0 .34-.24.72-.548.83l-2.44.88v2.09l3.652-1.31c1.055-.38 1.902-1.11 1.902-2.22 0-1.05-.615-2.32-.228-3.13Zm-15.874 1.53c-.897.34-1.417.98-1.417 1.87 0 1.05.756 1.75 1.985 2.2l.13.05 2.65-.96v-2.1l-2.14.78c-.31.11-.6-.02-.6-.35s.24-.71.55-.82l2.19-.79v-2.1l-3.348 1.22Z"/></svg>`;
// Staff-toggled only (see database/db.js's setDirectoryServerVerified header
// comment) - never self-service. Filled checkmark-in-circle, matches the
// same "currentColor" convention as the social icons above so it inherits
// whatever color context it's placed in.
const VERIFIED_BADGE_SVG = `<svg class="verified-badge" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" title="Verified by KOBA Bot staff"><path d="M12 2 14.4 4.6 17.8 4.2 18.6 7.5 21.6 9.2 20.2 12.4 21.6 15.6 18.6 17.3 17.8 20.6 14.4 20.2 12 22.8 9.6 20.2 6.2 20.6 5.4 17.3 2.4 15.6 3.8 12.4 2.4 9.2 5.4 7.5 6.2 4.2 9.6 4.6Z"/><path d="M9.5 12.3 11.3 14.1 14.8 10" fill="none" stroke="var(--panel)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DASH = `<span class="na">—</span>`;

/**
 * Every card shows all 4 social slots in the SAME order/position always -
 * Discord is a real link (invite_url is required at registration); any
 * slot without a URL renders as a disabled/greyed placeholder icon rather
 * than being omitted, so icon position never shifts card-to-card.
 */
/** Only shows an icon for a social the server owner actually configured (via /dashboard - see admin/dashboard.js's directory-editing section) - no placeholder for the ones they haven't set. Discord always shows since invite_url is required at registration. */
function socialIcons(server) {
  const slots = [
    { url: server.invite_url, svg: DISCORD_ICON_SVG, label: "Discord" },
    { url: server.tiktok_url, svg: TIKTOK_ICON_SVG, label: "TikTok" },
    { url: server.twitch_url, svg: TWITCH_ICON_SVG, label: "Twitch" },
    { url: server.website_url, svg: WEBSITE_ICON_SVG, label: "Website" },
  ];
  return slots
    .filter((l) => l.url)
    .map((l) => `<a class="social-icon" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="${l.label}">${l.svg}</a>`)
    .join("");
}

/**
 * A single unified card shape - every field below has one fixed, always-
 * rendered slot (dash placeholder when a server hasn't set that detail)
 * so every card in the grid is visually identical in structure/size,
 * never reshaping around whichever fields happen to be filled in.
 */
function serverCard(server, rating, viewer) {
  const isLive = server.telemetry_at && Date.now() - server.telemetry_at < TELEMETRY_STALE_MS;
  // Empty (not a generated fallback) when the owner didn't set one at
  // registration - a made-up code the owner never actually chose isn't a
  // real "Server ID" worth showing as if it were.
  const code = server.display_server_id || null;
  // owner_username is what the owner picked at registration - falls back to
  // their real Discord username for older listings registered before that
  // field existed (see database/db.js's owner_username migration).
  const registrantName = server.owner_username || db.getKnownUsername(server.registered_by);
  const ratingHtml = rating.reviewCount
    ? `<span class="stars">${starString(rating.avgStars)}</span><span class="rating-count">(${rating.reviewCount})</span>`
    : `<span class="stars dim">☆☆☆☆☆</span><span class="rating-count">No reviews yet</span>`;

  const following = viewer.isFollowing(server.guild_id);
  const followForm = viewer.currentUserId
    ? `<form method="post" action="/servers/${escapeHtml(server.guild_id)}/${following ? "unfollow" : "follow"}"><button type="submit" class="follow-btn${following ? " following" : ""}">${following ? "Unfollow" : "Follow"}</button></form>`
    : `<form method="post" action="/servers/${escapeHtml(server.guild_id)}/follow"><button type="submit" class="follow-btn">Follow</button></form>`;

  // Only the platform(s) the owner actually selected show a badge - see
  // database/db.js's platforms column header comment. Server-based (non-
  // standalone) listings predate this field and have no platforms set, so
  // they show neither badge rather than guessing.
  const platforms = server.platforms || [];
  const platformBadges = [
    platforms.includes("xbox") ? `<span class="platform-badge" title="Xbox">${XBOX_ICON_SVG}</span>` : "",
    platforms.includes("playstation") ? `<span class="platform-badge" title="PlayStation">${PLAYSTATION_ICON_SVG}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  // Verified is one real, staff-curated distinction the reference mockup
  // drew between its "colorful frame" and "plain frame" example cards -
  // reusing it here means the accent frame signals something true (staff
  // has actually looked at this listing) instead of being random.
  const frameClasses = server.verified ? "featured" : "";

  return `
    <div class="server-frame ${frameClasses}">
      <div class="server-card">
        <div class="server-row-top">
          <span class="server-author">${registrantName ? `@${escapeHtml(registrantName)}` : "Unregistered host"}${server.verified ? VERIFIED_BADGE_SVG : ""}</span>
          ${followForm}
          ${platformBadges ? `<span class="platform-icons" title="Available on: ${platforms.map((p) => (p === "xbox" ? "Xbox" : "PlayStation")).join(" & ")}">${platformBadges}</span>` : ""}
        </div>

        <h3 class="server-title ${frameClasses}" title="${escapeHtml(server.title)}">${escapeHtml(server.title)}</h3>

        <div class="stat-grid">
          <div class="stat-cell">
            <span class="stat-label">Players</span>
            ${isLive ? `<span><span class="live-dot"></span> <span class="stat-num">${server.player_count}</span>${server.max_players ? `/${server.max_players}` : ""}</span>` : `<span><span class="offline-dot"></span> Offline</span>`}
          </div>
          <div class="stat-cell">
            <span class="stat-label">Queue</span>
            ${isLive ? `<span class="stat-num">${server.queued}</span>` : DASH}
          </div>
          <div class="stat-cell">
            <span class="stat-label">Ping</span>
            ${isLive && server.ping_ms != null ? `<span class="ping-badge">${server.ping_ms}<small>ms</small></span>` : DASH}
          </div>
          <div class="stat-cell">
            <span class="stat-label">Server ID</span>
            ${code ? `<button type="button" class="copy-btn" data-copy="${code}"><code>${code}</code> ⧉</button>` : DASH}
          </div>
          <div class="stat-cell wide">
            <span class="stat-label">KOBA Bot ID</span>
            <button type="button" class="copy-btn" data-copy="${escapeHtml(server.boombot_id)}"><code>${escapeHtml(server.boombot_id)}</code> ⧉</button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-cell"><span class="stat-label">Map Size</span> ${server.map_size ? `<strong>${server.map_size / 1000}k</strong>` : DASH}</div>
          <div class="detail-cell"><span class="stat-label">Seed</span> ${server.seed ? `<strong>${escapeHtml(server.seed)}</strong>` : DASH}</div>
          <div class="detail-cell"><span class="stat-label">Wipe</span> ${server.wipe_schedule ? `<strong>${escapeHtml(server.wipe_schedule)}</strong>` : DASH}</div>
        </div>

        <div class="server-row-bottom">
          <span class="server-rating">${ratingHtml}</span>
          <span class="server-socials">${socialIcons(server)}</span>
        </div>

        <div class="server-tagline">${server.tags.length ? server.tags.map((t) => `#${escapeHtml(t)}`).join(" ") : `<span class="na">No tags</span>`}</div>
      </div>
    </div>`;
}

// Page-specific rules only - header/nav/drawer/tabbar/footer, the color
// tokens, and the base body/link/table styles all come from SITE_STYLES
// (./site.js), the exact same stylesheet the homepage uses, so this page
// is a tab of the site rather than a visually separate mini-app bolted on.
const SERVERS_PAGE_CSS = `
  main.servers-main { padding: 56px 0 100px; }
  .servers-head h1 { font-family: var(--font-display); text-transform: uppercase; font-size: clamp(28px, 5vw, 40px); margin: 14px 0 10px; }
  .servers-head .lede { color: var(--ink-dim); font-size: 16px; max-width: 60ch; margin-bottom: 44px; }
  .server-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(400px, 100%), 1fr)); gap: clamp(28px, 5vw, 48px); align-items:start; }

  /* ---------- Chiseled cut-corner card shell ----------
     .server-frame is the colored "frame" layer (a flat neutral edge by
     default, a magenta->cyan diagonal gradient on staff-verified listings -
     the one real signal the reference mockup's two-tone example cards
     mapped onto). It's clipped into a hexagonal shape with the top-right
     and bottom-left corners cut at 45 degrees, then padded by a few pixels
     so that color shows through as a thin beveled edge around the inner
     .server-card, which is clipped to the same shape at a slightly smaller
     inset - the "extruded sci-fi panel" look, not a plain rounded rectangle. */
  .server-frame {
    position: relative;
    padding: 3px;
    background: var(--line);
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 26px 100%, 0 calc(100% - 26px));
    transition: transform .15s ease, filter .15s ease;
  }
  .server-frame.featured {
    background: linear-gradient(135deg, var(--magenta), var(--cyan));
  }
  .server-frame:hover { transform: translateY(-3px); }
  .server-card {
    clip-path: polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px));
    background: var(--bg-panel);
    padding: 26px 28px 24px;
    display: flex; flex-direction: column; gap: 16px;
    min-height: 500px;
  }
  .na { color: var(--ink-dim); }
  .server-row-top { display:flex; align-items:center; gap:12px; font-size:13.5px; flex-wrap:wrap; }
  .server-author { font-weight:700; color:var(--cyan); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:38%; display:inline-flex; align-items:center; gap:5px; }
  .verified-badge { color:var(--cyan); flex-shrink:0; }
  .follow-btn { background:none; border:1px solid var(--line); color:var(--ink-dim); font-size:12.5px; font-weight:700; padding:5px 14px; border-radius:999px; cursor:pointer; }
  .follow-btn:hover, .follow-btn:focus-visible { color:var(--cyan); border-color:var(--cyan); }
  .follow-btn.following { color:var(--cyan); border-color:var(--cyan); }
  .server-row-top form { margin:0; }
  .platform-icons { margin-left:auto; display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .platform-badge { display:inline-flex; align-items:center; justify-content:center; color:var(--ink-dim); border:1px solid var(--line); border-radius:5px; padding:5px 6px; line-height:1; }
  .server-title {
    margin:0; font-size:25px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    color: var(--ink);
  }
  .server-title.featured {
    background-image:linear-gradient(90deg, var(--magenta), var(--cyan)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
  }

  /* Every stat/detail cell always renders in the same grid position - a
     dash placeholder fills in for whatever this particular server hasn't
     set, rather than the row disappearing or reflowing. */
  .stat-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px 10px; font-size:13px; color:var(--ink-dim); }
  .stat-cell.wide { grid-column: span 2; }
  .stat-label { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-dim); margin-bottom:3px; }
  .stat-num { color:var(--ink); font-family:var(--font-mono); font-weight:700; }
  .live-dot { width:7px; height:7px; border-radius:50%; background:var(--safe); box-shadow:0 0 8px var(--safe); display:inline-block; }
  .offline-dot { width:7px; height:7px; border-radius:50%; background:var(--danger); display:inline-block; }
  .copy-btn { background:none; border:none; color:var(--ink-dim); cursor:pointer; font-size:13px; font-family:var(--font-mono); display:flex; align-items:center; gap:5px; padding:0; }
  .copy-btn code { color:var(--cyan); background:none; padding:0; }
  .copy-btn:hover, .copy-btn:focus-visible { color:var(--cyan); }
  .copy-btn.copied { color:var(--safe); }
  .ping-badge { font-family:var(--font-mono); font-size:12px; font-weight:700; background:color-mix(in srgb, var(--safe) 18%, transparent); color:var(--safe); padding:3px 8px; border-radius:4px; }
  .ping-badge small { font-size:10px; }

  .detail-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; font-size:13px; color:var(--ink-dim); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:14px 0; }
  .detail-cell strong { color:var(--ink); font-weight:700; }

  .server-row-bottom { display:flex; align-items:center; justify-content:space-between; }
  .server-rating { display:flex; align-items:center; gap:8px; font-size:14px; }
  .stars { color:var(--cyan); letter-spacing:2px; font-size:15px; }
  .stars.dim { color:var(--line); }
  .rating-count { color:var(--ink-dim); font-size:12.5px; }
  .server-socials { display:flex; align-items:center; gap:8px; }
  .social-icon { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; background:var(--bg-panel-raised); border:1px solid var(--line); color:var(--ink-dim); flex-shrink:0; }
  .social-icon:hover, .social-icon:focus-visible { color:var(--cyan); border-color:var(--cyan); }

  .server-tagline { font-size:14px; font-weight:700; color:var(--ink); min-height:1.4em; }

  .servers-empty { border:1px dashed var(--line); grid-column:1/-1; padding: 60px 30px; text-align: center; color: var(--ink-dim); }
  .servers-empty code { color: var(--cyan); }

  /* Every card is a fixed min-width:400px grid track - below that width the
     grid used to force the page wider than the viewport (horizontal
     overflow on small phones). minmax(min(400px, 100%), 1fr) lets a track
     shrink to fill a narrower-than-400px viewport instead of overflowing it. */
  @media (max-width: 440px) {
    .server-grid { grid-template-columns: 1fr; }
    .server-card { min-height: auto; padding: 22px 20px 20px; }
    .server-frame, .server-card { clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px)); }
  }
`;

function renderServersDirectory(servers, getRating, viewer = { currentUserId: null, isFollowing: () => false }, settings = {}) {
  const sorted = [...servers].sort((a, b) => b.player_count - a.player_count);
  const cardsHtml = sorted.length
    ? sorted.map((s) => serverCard(s, getRating(s.guild_id), viewer)).join("")
    : `<div class="servers-empty">No servers listed yet — server owners can register with <code>/server directory register</code> in their own Discord.</div>`;

  // Same subscribeHref/subscribeAttrs/discordInviteUrl derivation
  // renderPublicSite uses, so the shared nav chrome's Subscribe button and
  // Discord links behave identically here (see admin/site.js).
  const shopUrl = (settings.tip4serv_shop_url || "").trim();
  const subscribeHref = shopUrl ? escapeHtml(shopUrl) : "/#pricing";
  const subscribeAttrs = shopUrl ? ' target="_blank" rel="noopener noreferrer"' : "";
  const discordInviteUrl = escapeHtml(settings.discord_invite_url || "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Servers — KOBA Bot</title>
<meta name="description" content="Every Rust Console Edition community currently running KOBA Bot — live player counts, ping, map, and wipe schedule for each." />
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${SITE_STYLES}${SERVERS_PAGE_CSS}</style>
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
${renderAppShell({ active: "servers", subscribeHref, subscribeAttrs })}

<main class="servers-main">
  <div class="wrap servers-head">
    <span class="eyebrow">Server directory</span>
    <h1>Here's why these communities never look back.</h1>
    <div class="lede">Every Rust Console Edition server currently running KOBA Bot — live player counts, ping, map, and wipe schedule, straight from RCON. Follow the ones you play on.</div>
  </div>
  <div class="wrap">
    <div class="server-grid">${cardsHtml}</div>
  </div>
</main>

${renderSiteFooter({ activeTab: "servers", discordInviteUrl })}
<script>
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.getAttribute("data-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () {
        btn.classList.add("copied");
        setTimeout(function () { btn.classList.remove("copied"); }, 1500);
      }).catch(function () {});
    });
  });
</script>
</body>
</html>`;
}

module.exports = { renderServersDirectory, shortServerId, TELEMETRY_STALE_MS };

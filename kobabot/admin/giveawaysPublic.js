"use strict";

const express = require("express");
const db = require("../database/db");
const { escapeHtml } = require("./layout");
const { requireAuth } = require("./auth");

const router = express.Router();
// Body parsing is handled globally in admin/server.js (express.urlencoded()) -
// do not add a second parser instance here, it would try to re-consume an
// already-drained request stream and silently produce an empty req.body.

/**
 * Giveaways are a standalone white-label promo product, not a KOBA Bot
 * feature - every visual is driven by the giveaway row's own brand_name/
 * logo_url/color_* columns rather than KOBA Bot's identity, so an admin can
 * run a giveaway for any sponsor without it reading as an official KOBA Bot
 * page. Colors are admin-supplied free text (hex values) - validated
 * loosely and falls back to the same defaults the schema uses if empty.
 */
function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{3,8}$/.test(value || "") ? value : fallback;
}

function renderStyles(g) {
  const bg = safeColor(g.color_bg, "#07070d");
  const cyan = safeColor(g.color_cyan, "#00f0ff");
  const magenta = safeColor(g.color_magenta, "#ff2ec4");
  const lime = safeColor(g.color_lime, "#c6ff3d");

  return `
  :root{ --bg:${bg}; --bg-2:#0d0d18; --card:#12121e; --cyan:${cyan}; --magenta:${magenta}; --lime:${lime}; --ink:#eef0f8; --muted:#8b8fa8; --line:#22223a; }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    background:var(--bg); color:var(--ink); font-family:"Rajdhani",Arial,sans-serif;
    font-size:1.05rem; line-height:1.5; overflow-x:hidden;
    background-image:
      radial-gradient(900px 600px at 15% 10%, color-mix(in srgb, var(--magenta) 16%, transparent), transparent 60%),
      radial-gradient(1000px 700px at 85% 15%, color-mix(in srgb, var(--cyan) 13%, transparent), transparent 60%),
      radial-gradient(1300px 850px at 50% 100%, color-mix(in srgb, var(--lime) 8%, transparent), transparent 60%);
    background-attachment: fixed;
  }
  h1,h2,h3,.display{font-family:"Orbitron",Arial,sans-serif}
  a{color:inherit;text-decoration:none}
  .container{max-width:1080px;margin:0 auto;padding:0 22px}

  .preview-banner{position:sticky;top:0;z-index:100;background:#000;color:var(--lime);text-align:center;font-weight:800;font-size:.8rem;padding:7px;letter-spacing:.05em;font-family:"Orbitron",Arial,sans-serif;}

  .fomo-bar{background:var(--magenta);color:#0a0a0a;text-align:center;font-weight:700;font-size:.85rem;letter-spacing:.03em;padding:9px 12px;text-transform:uppercase}

  header{padding:22px 0}
  .nav{display:flex;justify-content:space-between;align-items:center}
  .brand{font-family:"Orbitron",Arial,sans-serif;font-weight:900;font-size:1.2rem;text-transform:uppercase;color:#fff}
  .brand img{height:60px;width:auto;max-width:220px;object-fit:contain;display:block}
  .nav-cta{background:linear-gradient(90deg,var(--cyan),var(--magenta));color:#050508;font-family:"Orbitron",Arial,sans-serif;font-weight:800;font-size:.8rem;letter-spacing:.03em;padding:11px 20px;border-radius:2px;text-transform:uppercase;
    clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}

  .hero{padding:50px 0 20px;text-align:center}
  .kicker{display:inline-flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--lime) 10%, transparent);border:1px solid color-mix(in srgb, var(--lime) 40%, transparent);color:var(--lime);
    font-weight:700;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;padding:7px 16px;border-radius:999px;margin-bottom:20px}
  .kicker .dot{width:7px;height:7px;border-radius:50%;background:var(--lime);box-shadow:0 0 8px var(--lime);animation:pulse 1.4s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  .value-badge{display:inline-flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--lime) 8%, transparent);border:1px solid var(--lime);color:var(--lime);font-weight:800;
    font-size:.85rem;padding:8px 16px;border-radius:6px;margin-bottom:20px;font-family:"Orbitron",Arial,sans-serif}
  h1{font-weight:900;font-size:2.9rem;line-height:1.12;letter-spacing:-.01em;max-width:20ch;margin:0 auto 20px;color:#fff}
  h1 .grad,h1 .accent{background-repeat:no-repeat;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  h1 .grad{background-image:linear-gradient(90deg,#fff 40%,var(--cyan))}
  h1 .accent{background-image:linear-gradient(90deg,var(--magenta),var(--cyan))}
  .sub{color:var(--muted);max-width:52ch;margin:0 auto 30px;font-size:1.15rem}

  .countdown{display:flex;justify-content:center;gap:12px;margin-bottom:28px;flex-wrap:wrap}
  .countdown.ended .cd-num{color:var(--muted);text-shadow:none}
  .cd-box{background:var(--card);border:1px solid var(--line);border-radius:8px;width:84px;padding:14px 0;text-align:center}
  .cd-num{font-family:"Orbitron",Arial,sans-serif;font-weight:800;font-size:1.9rem;color:#fff;text-shadow:0 0 16px color-mix(in srgb, var(--cyan) 50%, transparent)}
  .cd-label{font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:4px}
  .ended-banner{display:none;color:var(--magenta);font-weight:700;margin-bottom:20px}
  .ended-banner.show{display:block}

  .hero-cta{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-bottom:12px}
  .btn{font-family:"Orbitron",Arial,sans-serif;font-weight:800;font-size:.9rem;letter-spacing:.02em;padding:15px 30px;text-transform:uppercase;border-radius:2px;display:inline-block;border:none;cursor:pointer}
  .btn-primary{background:linear-gradient(90deg,var(--magenta),var(--cyan));color:#050508;box-shadow:0 0 28px color-mix(in srgb, var(--magenta) 35%, transparent);
    clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
  .btn-primary:hover{box-shadow:0 0 38px color-mix(in srgb, var(--cyan) 50%, transparent)}
  .microcopy{color:var(--muted);font-size:.85rem}

  section{padding:50px 0}
  .prize-card{background:linear-gradient(180deg,var(--card),#0a0a14);border:1px solid var(--line);border-radius:14px;padding:34px;
    display:grid;grid-template-columns:1.1fr .9fr;gap:30px;align-items:center;position:relative;overflow:hidden}
  .prize-card::after{content:"";position:absolute;top:-60px;right:-60px;width:220px;height:220px;border-radius:50%;
    background:radial-gradient(circle,color-mix(in srgb, var(--cyan) 22%, transparent),transparent 70%)}
  .prize-tag{display:inline-block;background:var(--magenta);color:#050508;font-family:"Orbitron",Arial,sans-serif;font-weight:800;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;padding:5px 12px;border-radius:2px;margin-bottom:14px}
  .prize-card h3{font-size:1.6rem;color:#fff;margin-bottom:14px}
  .prize-list{list-style:none}
  .prize-list li{display:flex;gap:10px;color:var(--muted);font-size:.98rem;margin-bottom:10px}
  .prize-list li::before{content:"—";color:var(--lime)}
  .prize-value{background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:24px;text-align:center}
  .prize-value .amt{font-family:"Orbitron",Arial,sans-serif;font-weight:900;font-size:2.2rem;color:var(--lime);text-shadow:0 0 20px color-mix(in srgb, var(--lime) 45%, transparent)}
  .prize-value .lbl{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;margin-top:6px}
  .prize-value hr{border:none;border-top:1px solid var(--line);margin:16px 0}
  .prize-value .stat{display:flex;justify-content:space-between;font-size:.9rem;color:var(--muted);margin-bottom:8px}
  .prize-value .stat b{color:#fff}

  .section-head{text-align:center;max-width:600px;margin:0 auto 36px}
  .section-head .eyebrow{color:var(--cyan);font-weight:700;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase}
  .section-head h2{font-size:1.9rem;font-weight:800;margin-top:10px;color:#fff}
  .section-head p{color:var(--muted);margin-top:10px}

  .task-list{display:flex;flex-direction:column;gap:14px}
  .task{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:flex;align-items:center;gap:16px;transition:border-color .15s ease}
  .task:hover{border-color:var(--cyan)}
  .task.done{border-color:var(--lime);background:color-mix(in srgb, var(--lime) 5%, transparent)}
  .task-check{width:26px;height:26px;border-radius:6px;border:2px solid var(--line);flex-shrink:0;display:flex;align-items:center;justify-content:center;
    cursor:pointer;font-weight:800;color:var(--lime);background:none}
  .task.done .task-check{border-color:var(--lime);background:color-mix(in srgb, var(--lime) 18%, transparent)}
  .task-body{flex:1;cursor:pointer;min-width:0}
  .t-title{font-weight:700;color:#fff;font-size:1.02rem}
  .t-sub{color:var(--muted);font-size:.86rem;margin-top:2px}
  .task-pts{font-family:"Orbitron",Arial,sans-serif;font-weight:800;font-size:.85rem;color:var(--magenta);white-space:nowrap}
  .task-go{font-size:.8rem;font-weight:700;color:var(--cyan);border:1px solid var(--cyan);padding:8px 12px;border-radius:4px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
  .task-go:hover{background:var(--cyan);color:#050508}
  .task{flex-direction:column;align-items:stretch}
  .task-row{display:flex;align-items:center;gap:16px}
  .task-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .task-handle{background:var(--bg-2);border:1px solid var(--line);border-radius:4px;padding:8px 10px;color:#fff;font-family:"Rajdhani",Arial,sans-serif;font-size:.85rem;width:150px}
  .task-handle:focus{outline:none;border-color:var(--cyan)}
  .task-hint{font-size:.76rem;color:var(--lime);padding-left:42px}

  .entries-meter{margin:28px auto 0;max-width:480px;background:var(--card);border:1px solid var(--line);border-radius:999px;
    padding:14px 22px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 12px 30px rgba(0,0,0,.35)}
  .entries-meter span{color:var(--muted);font-size:.87rem}
  .entries-meter b{font-family:"Orbitron",Arial,sans-serif;color:var(--lime);font-size:1.2rem}

  .entry-form{max-width:460px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
  .entry-form input{background:var(--bg-2);border:1px solid var(--line);border-radius:6px;padding:13px 14px;color:#fff;font-family:"Rajdhani",Arial,sans-serif;font-size:1.05rem}
  .entry-form input:focus{outline:none;border-color:var(--cyan)}
  .final-cta{background:linear-gradient(135deg,#150019,#001318);border:1px solid var(--line);border-radius:16px;padding:48px 30px;text-align:center}
  .final-cta h2{font-size:1.9rem;color:#fff;margin-bottom:12px}
  .final-cta p{color:var(--muted);margin-bottom:24px}
  .fine{font-size:.78rem;color:var(--muted);text-align:center}

  footer{border-top:1px solid var(--line);padding:28px 0;text-align:center;color:var(--muted);font-size:.82rem}

  .video-wrap{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:14px;border:1px solid var(--line);background:var(--card);max-width:800px;margin:0 auto}
  .video-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
  .media-gallery{display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;max-width:900px;margin:0 auto}
  .media-gallery img{width:100%;display:block;border-radius:10px;border:1px solid var(--line);object-fit:cover;aspect-ratio:1.3;background:var(--card)}

  @media (max-width:760px){
    h1{font-size:2.1rem}
    .prize-card{grid-template-columns:1fr}
    .cd-box{width:66px;padding:12px 0}
    .cd-num{font-size:1.4rem}
  }
`;
}

function renderCountdownScript(endTimestamp) {
  return `<script>
    const target = ${endTimestamp};
    function tick() {
      const dist = Math.max(target - Date.now(), 0);
      const d = Math.floor(dist/86400000), h = Math.floor(dist/3600000)%24, m = Math.floor(dist/60000)%60, s = Math.floor(dist/1000)%60;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2,'0'); };
      set('cd-d', d); set('cd-h', h); set('cd-m', m); set('cd-s', s);
      if (dist <= 0) { clearInterval(timer); const b = document.getElementById('ended-banner'); if (b) b.style.display = 'block'; }
    }
    const timer = setInterval(tick, 1000); tick();
  </script>`;
}

function renderTaskScript() {
  return `<script>
    let myEntries = 0;
    document.querySelectorAll('.task').forEach((el) => {
      const pts = parseInt(el.dataset.pts, 10) || 0;
      const check = el.querySelector('.task-check');
      const body = el.querySelector('.task-body');
      const input = el.querySelector('input[name="task"]');
      function toggle() {
        const done = el.classList.toggle('done');
        check.textContent = done ? '\\u2713' : '';
        input.disabled = !done;
        myEntries += done ? pts : -pts;
        document.getElementById('my-entries').textContent = myEntries;
      }
      check.addEventListener('click', toggle);
      body.addEventListener('click', toggle);
    });
  </script>`;
}

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

/** Guesses the platform from a task's link URL so the "Go" button and username box can be labeled/iconed correctly - no separate platform field needed in the task data model. */
function detectPlatform(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("discord.")) return { label: "Discord", icon: "💬" };
  if (u.includes("twitter.com") || u.includes("x.com")) return { label: "X", icon: "𝕏" };
  if (u.includes("youtube.com") || u.includes("youtu.be")) return { label: "YouTube", icon: "▶" };
  if (u.includes("instagram.com")) return { label: "Instagram", icon: "📷" };
  if (u.includes("tiktok.com")) return { label: "TikTok", icon: "♪" };
  if (u.includes("twitch.tv")) return { label: "Twitch", icon: "🎮" };
  return { label: "", icon: "" };
}

function renderBrandMark(g) {
  if (g.logo_url) return `<img src="${escapeHtml(g.logo_url)}" alt="${escapeHtml(g.brand_name)}" />`;
  return escapeHtml(g.brand_name || "Giveaways");
}

function renderFooterText(g) {
  const template = g.footer_text || "© {year} {brand}. All rights reserved.";
  return escapeHtml(template.replace(/{brand}/g, g.brand_name || "Giveaways").replace(/{year}/g, String(new Date().getFullYear())));
}

function renderGiveawayPage(giveaway, { isPreview = false } = {}) {
  const tasks = JSON.parse(giveaway.tasks || "[]");
  const prizeItems = JSON.parse(giveaway.prize_items || "[]");
  const mediaUrls = JSON.parse(giveaway.media_urls || "[]").slice(0, 3);
  const youtubeId = extractYouTubeId(giveaway.youtube_url);
  const entryCount = db.countGiveawayEntries(giveaway.id);

  const headlineWords = giveaway.title.trim().split(/\s+/);
  const headlineAccentWord = headlineWords.pop() || "";
  const headlineMain = escapeHtml(headlineWords.join(" "));
  const headlineAccent = escapeHtml(headlineAccentWord);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(giveaway.title)} — ${escapeHtml(giveaway.brand_name || "Giveaway")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>${renderStyles(giveaway)}</style></head>
<body>
${isPreview ? `<div class="preview-banner">PREVIEW MODE — draft, not live. Status: ${escapeHtml(giveaway.status)}</div>` : ""}
<div class="fomo-bar">${escapeHtml(giveaway.fomo_text || "Entries close the instant the timer hits zero — no extensions, no exceptions.")}</div>

<header><div class="container nav">
  <span class="brand">${renderBrandMark(giveaway)}</span>
  <a class="nav-cta" href="#entry-form">Enter Now</a>
</div></header>

<section class="hero">
  <div class="container">
    <span class="kicker"><span class="dot"></span> ${escapeHtml(giveaway.kicker)}</span><br/>
    ${giveaway.prize_value ? `<div class="value-badge">Total Prize Value: ${escapeHtml(giveaway.prize_value)}</div><br/>` : ""}
    <h1><span class="grad">${headlineMain}</span> <span class="accent">${headlineAccent}</span></h1>
    ${giveaway.subheadline ? `<p class="sub">${escapeHtml(giveaway.subheadline)}</p>` : ""}
    <div id="ended-banner" class="ended-banner">Entries are closed — winner will be announced in Discord.</div>
    <div class="countdown" id="countdown">
      <div class="cd-box"><div class="cd-num" id="cd-d">00</div><div class="cd-label">Days</div></div>
      <div class="cd-box"><div class="cd-num" id="cd-h">00</div><div class="cd-label">Hours</div></div>
      <div class="cd-box"><div class="cd-num" id="cd-m">00</div><div class="cd-label">Mins</div></div>
      <div class="cd-box"><div class="cd-num" id="cd-s">00</div><div class="cd-label">Secs</div></div>
    </div>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#entry-form">Lock In My Entry →</a>
    </div>
    <p class="microcopy">Free to enter · Takes under 60 seconds · No purchase necessary</p>
  </div>
</section>

${
  giveaway.prize_title
    ? `<section><div class="container"><div class="prize-card">
        <div>
          <span class="prize-tag">Grand Prize</span>
          <h3>${escapeHtml(giveaway.prize_title)}</h3>
          <ul class="prize-list">${prizeItems.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>
        <div class="prize-value">
          <div class="amt">${escapeHtml(giveaway.prize_value || "—")}</div>
          <div class="lbl">Total Prize Value</div>
          <hr>
          <div class="stat"><span>Entries so far</span><b>${entryCount.toLocaleString()}</b></div>
          <div class="stat"><span>Winner announced</span><b>Live on stream</b></div>
          <div class="stat"><span>Cost to enter</span><b>$0</b></div>
        </div>
      </div></div></section>`
    : ""
}

${
  youtubeId
    ? `<section><div class="container">
        <div class="video-wrap">
          <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(youtubeId)}" title="Giveaway video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>
      </div></section>`
    : ""
}

${
  mediaUrls.length
    ? `<section><div class="container">
        <div class="media-gallery">
          ${mediaUrls.map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`).join("")}
        </div>
      </div></section>`
    : ""
}

<section id="tasks">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Stack Your Odds</span>
      <h2>Boost Your Entries</h2>
      <p>Base entry gets you in. Every task below stacks on top.</p>
    </div>
    ${
      tasks.length
        ? `<form id="entry-form-tasks">
            <div class="task-list">
              ${tasks
                .map((t, i) => {
                  const platform = detectPlatform(t.url);
                  return `<div class="task" data-pts="${t.points}">
                    <div class="task-row">
                      <div class="task-check" role="checkbox" aria-checked="false" tabindex="0"></div>
                      <div class="task-body">
                        <div class="t-title">${escapeHtml(t.title)}</div>
                        <div class="t-sub">${escapeHtml(t.subtitle)}</div>
                      </div>
                      ${
                        t.url
                          ? `<div class="task-actions">
                              <input type="text" class="task-handle" placeholder="Your ${escapeHtml(platform.label ? platform.label + " " : "")}username" />
                              <a class="task-go" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">${platform.icon} Go</a>
                            </div>`
                          : ""
                      }
                      <input type="checkbox" name="task" value="${i}" disabled style="display:none" />
                      <div class="task-pts">+${t.points}</div>
                    </div>
                    ${t.url ? `<div class="task-hint">Already follow? Just enter it - no need to click Go.</div>` : ""}
                  </div>`;
                })
                .join("")}
            </div>
          </form>
          <div class="entries-meter"><span>Your total entries</span><b id="my-entries">0</b></div>`
        : ""
    }
  </div>
</section>

<section id="entry-form">
  <div class="container">
    <div class="final-cta">
      <h2>Lock In Your Entry Before The Timer Runs Out</h2>
      <p>Takes under 60 seconds. No purchase, no catch — just don't wait until the last minute.</p>
      <form class="entry-form" method="post" action="/giveaways/${escapeHtml(giveaway.slug)}/enter">
        <input type="text" name="gamertag" placeholder="Gamertag / Username" required />
        <input type="email" name="email" placeholder="Email address" required />
        <div id="hidden-tasks"></div>
        <button class="btn btn-primary" type="submit" style="width:100%">Enter The Giveaway →</button>
        <p class="fine">By entering you agree to receive giveaway updates. No purchase necessary.</p>
      </form>
    </div>
  </div>
</section>

<footer>${renderFooterText(giveaway)}</footer>

${renderCountdownScript(giveaway.end_timestamp)}
${tasks.length ? renderTaskScript() : ""}
<script>
  // Copy checked task indexes into the real entry form as hidden inputs before submit,
  // since the task checklist and the entry form are two separate <form> elements above.
  document.querySelector('.entry-form')?.addEventListener('submit', () => {
    const container = document.getElementById('hidden-tasks');
    document.querySelectorAll('input[name="task"]:checked').forEach((cb) => {
      const hidden = document.createElement('input');
      hidden.type = 'hidden'; hidden.name = 'task'; hidden.value = cb.value;
      container.appendChild(hidden);
    });
  });
</script>
</body></html>`;
}

router.get("/:slug", (req, res) => {
  const giveaway = db.getGiveawayBySlug(req.params.slug);
  if (!giveaway || giveaway.status !== "published") return res.status(404).send("Giveaway not found");
  res.send(renderGiveawayPage(giveaway));
});

/** Admin-only live preview - renders the current draft/published state regardless of status. */
router.get("/:slug/preview", requireAuth, (req, res) => {
  const giveaway = db.getGiveawayBySlug(req.params.slug);
  if (!giveaway) return res.status(404).send("Giveaway not found");
  res.send(renderGiveawayPage(giveaway, { isPreview: true }));
});

router.post("/:slug/enter", (req, res) => {
  const giveaway = db.getGiveawayBySlug(req.params.slug);
  if (!giveaway || giveaway.status !== "published") return res.status(404).send("Giveaway not found");

  const gamertag = (req.body.gamertag || "").trim();
  const email = (req.body.email || "").trim();
  if (!gamertag || !email) return res.status(400).send("Gamertag and email are required");

  const tasks = JSON.parse(giveaway.tasks || "[]");
  const claimedRaw = req.body.task;
  const claimed = (Array.isArray(claimedRaw) ? claimedRaw : claimedRaw ? [claimedRaw] : [])
    .map((v) => parseInt(v, 10))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < tasks.length);

  const totalEntries = 1 + claimed.reduce((sum, i) => sum + (tasks[i]?.points || 0), 0);
  db.createGiveawayEntry(giveaway.id, gamertag, email, claimed, totalEntries);

  res.redirect(`/giveaways/${giveaway.slug}?submitted=1`);
});

module.exports = router;

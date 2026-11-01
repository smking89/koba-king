"use strict";

const express = require("express");
const db = require("../database/db");
const { renderLayout, escapeHtml, fmtDate } = require("./layout");

const router = express.Router();

function slugify(title) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `giveaway-${Date.now()}`
  );
}

/** "Title | Subtitle | Points | URL (optional)" per line -> [{title, subtitle, points, url}] */
function parseTasksInput(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, subtitle, points, url] = line.split("|").map((s) => (s ?? "").trim());
      return { title: title || "Bonus task", subtitle: subtitle || "", points: parseInt(points, 10) || 1, url: url || "" };
    });
}

function tasksToInput(tasks) {
  return tasks.map((t) => `${t.title} | ${t.subtitle} | ${t.points} | ${t.url || ""}`).join("\n");
}

function parseListInput(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

router.get("/", (req, res) => {
  const giveaways = db.listGiveaways();
  const body = `
    <div class="pagehead"><span class="eyebrow">Promotions</span><h1>Giveaways</h1></div>
    <div class="panel" style="display:flex; justify-content:space-between; align-items:center;">
      <p class="note" style="margin:0;">Draft, publish, and track entries for community giveaways.</p>
      <a class="btn" href="/admin/giveaways/new">+ New Giveaway</a>
    </div>
    <div class="panel">
      ${
        giveaways.length
          ? `<div class="tablewrap"><table>
              <thead><tr><th>Title</th><th>Status</th><th>Ends</th><th>Entries</th><th>Actions</th></tr></thead>
              <tbody>
                ${giveaways
                  .map(
                    (g) => `<tr>
                      <td>${escapeHtml(g.title)}<div class="note">/giveaways/${escapeHtml(g.slug)}</div></td>
                      <td><span class="pill ${g.status === "published" ? "active" : g.status === "ended" ? "left" : "pending"}">${g.status}</span></td>
                      <td>${fmtDate(g.end_timestamp)}</td>
                      <td class="mono">${db.countGiveawayEntries(g.id)}</td>
                      <td style="display:flex; gap:8px; flex-wrap:wrap;">
                        <a class="btn ghost small" href="/admin/giveaways/${g.id}">Edit</a>
                        <a class="btn ghost small" href="/giveaways/${escapeHtml(g.slug)}/preview" target="_blank">Preview</a>
                        <a class="btn ghost small" href="/admin/giveaways/${g.id}/entries">Entries</a>
                        <form method="post" action="/admin/giveaways/${g.id}/${g.status === "published" ? "unpublish" : "publish"}">
                          <button class="btn small" type="submit">${g.status === "published" ? "Unpublish" : "Publish"}</button>
                        </form>
                      </td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`
          : `<div class="empty">No giveaways yet - create one to get started.</div>`
      }
    </div>
  `;
  res.send(renderLayout({ title: "Giveaways", activeHref: "/admin/giveaways", body, staffUser: req.staffUser }));
});

function giveawayForm(giveaway) {
  const g = giveaway || {
    title: "",
    kicker: "Live Giveaway",
    subheadline: "",
    prize_title: "",
    prize_value: "",
    prize_items: "[]",
    tasks: "[]",
    end_timestamp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    brand_name: "Giveaways",
    logo_url: "",
    color_bg: "#07070d",
    color_cyan: "#00f0ff",
    color_magenta: "#ff2ec4",
    color_lime: "#c6ff3d",
    fomo_text: "Entries close the instant the timer hits zero — no extensions, no exceptions.",
    footer_text: "© {year} {brand}. All rights reserved.",
    youtube_url: "",
    media_urls: "[]",
    announce_guild_id: "",
    announce_channel_id: "",
  };
  const prizeItems = JSON.parse(g.prize_items || "[]");
  const tasks = JSON.parse(g.tasks || "[]");
  const mediaUrls = JSON.parse(g.media_urls || "[]");
  const endLocal = new Date(g.end_timestamp - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return `
    <div class="field"><label>Title</label><input type="text" name="title" value="${escapeHtml(g.title)}" required /></div>
    <div class="formrow">
      <div class="field"><label>Kicker</label><input type="text" name="kicker" value="${escapeHtml(g.kicker)}" /></div>
      <div class="field"><label>Ends At</label><input type="datetime-local" name="end_local" value="${endLocal}" required /></div>
    </div>
    <div class="field"><label>Subheadline</label><textarea name="subheadline">${escapeHtml(g.subheadline)}</textarea></div>
    <div class="formrow">
      <div class="field"><label>Prize Title</label><input type="text" name="prize_title" value="${escapeHtml(g.prize_title)}" /></div>
      <div class="field"><label>Prize Value</label><input type="text" name="prize_value" value="${escapeHtml(g.prize_value)}" placeholder="$3,200+" /></div>
    </div>
    <div class="field"><label>Prize bullets (one per line)</label><textarea name="prize_items">${escapeHtml(prizeItems.join("\n"))}</textarea></div>
    <div class="field">
      <label>Bonus entry tasks - each line needs all 4 parts in this exact order: Title | Subtitle | Points | Link. Leave the link blank but keep its pipe, e.g. "Title | Subtitle | 5 |". The number in the 3rd slot is what shows as the +N badge - don't put it in the 2nd slot or every task will show +1.</label>
      <textarea name="tasks" placeholder="Follow on Twitch | Live raffle draw happens on stream | 5 | https://twitch.tv/yourname">${escapeHtml(tasksToInput(tasks))}</textarea>
    </div>
    <div class="field"><label>Demo video (paste a YouTube link - leave blank to hide)</label><input type="text" name="youtube_url" value="${escapeHtml(g.youtube_url)}" placeholder="https://youtube.com/watch?v=..." /></div>
    <div class="field"><label>Extra images / GIFs (one URL per line, up to 3 - host them anywhere, e.g. imgbb.com, and paste the direct image link)</label><textarea name="media_urls" placeholder="https://i.ibb.co/.../screenshot.png">${escapeHtml(mediaUrls.join("\n"))}</textarea></div>

    <h2 style="font-size:15px; margin: 26px 0 14px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.06em;">Branding (this giveaway's own identity - independent of KOBA Bot)</h2>
    <div class="formrow">
      <div class="field"><label>Brand / Sponsor Name</label><input type="text" name="brand_name" value="${escapeHtml(g.brand_name)}" placeholder="Giveaways" /></div>
      <div class="field"><label>Logo Image URL (optional - blank shows the name as text)</label><input type="text" name="logo_url" value="${escapeHtml(g.logo_url)}" placeholder="https://..." /></div>
    </div>
    <div class="formrow">
      <div class="field"><label>Background</label><input type="text" name="color_bg" value="${escapeHtml(g.color_bg)}" /></div>
      <div class="field"><label>Cyan Accent</label><input type="text" name="color_cyan" value="${escapeHtml(g.color_cyan)}" /></div>
      <div class="field"><label>Magenta Accent</label><input type="text" name="color_magenta" value="${escapeHtml(g.color_magenta)}" /></div>
      <div class="field"><label>Lime Accent</label><input type="text" name="color_lime" value="${escapeHtml(g.color_lime)}" /></div>
    </div>
    <div class="field"><label>FOMO bar text</label><input type="text" name="fomo_text" value="${escapeHtml(g.fomo_text)}" /></div>
    <div class="field"><label>Footer text (use {brand} and {year})</label><input type="text" name="footer_text" value="${escapeHtml(g.footer_text)}" /></div>

    <h2 style="font-size:15px; margin: 26px 0 14px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.06em;">Winner Announcement (Discord)</h2>
    <p class="note" style="margin-bottom:14px;">Where KOBA Bot posts the winner once you click "Draw Winner" below. Leave blank to skip auto-posting - you can still see the winner here either way.</p>
    <div class="formrow">
      <div class="field"><label>Discord Server ID</label><input type="text" name="announce_guild_id" value="${escapeHtml(g.announce_guild_id)}" placeholder="e.g. 1558726581982335019" /></div>
      <div class="field"><label>Channel ID</label><input type="text" name="announce_channel_id" value="${escapeHtml(g.announce_channel_id)}" placeholder="e.g. 1234567890123456789" /></div>
    </div>
  `;
}

router.get("/new", (req, res) => {
  const body = `
    <div class="pagehead"><span class="eyebrow">New Giveaway</span><h1>Create Giveaway</h1></div>
    <div class="panel"><form method="post" action="/admin/giveaways">${giveawayForm()}<button class="btn" type="submit">Create Draft</button></form></div>
  `;
  res.send(renderLayout({ title: "New Giveaway", activeHref: "/admin/giveaways", body, staffUser: req.staffUser }));
});

router.post("/", (req, res) => {
  const { title, kicker, subheadline, prize_title, prize_value, prize_items, tasks, end_local, brand_name, logo_url, color_bg, color_cyan, color_magenta, color_lime, fomo_text, footer_text, youtube_url, media_urls, announce_guild_id, announce_channel_id } = req.body;
  if (!title?.trim() || !end_local) return res.status(400).send("Title and end date are required");

  let slug = slugify(title);
  while (db.getGiveawayBySlug(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const id = db.createGiveaway({
    slug,
    title: title.trim(),
    kicker: kicker?.trim() || "Live Giveaway",
    subheadline: subheadline?.trim() || "",
    prize_title: prize_title?.trim() || "",
    prize_value: prize_value?.trim() || "",
    prize_items: JSON.stringify(parseListInput(prize_items)),
    tasks: JSON.stringify(parseTasksInput(tasks)),
    end_timestamp: new Date(end_local).getTime(),
    brand_name: brand_name?.trim() || "Giveaways",
    logo_url: logo_url?.trim() || "",
    color_bg: color_bg?.trim() || "#07070d",
    color_cyan: color_cyan?.trim() || "#00f0ff",
    color_magenta: color_magenta?.trim() || "#ff2ec4",
    color_lime: color_lime?.trim() || "#c6ff3d",
    fomo_text: fomo_text?.trim() || "Entries close the instant the timer hits zero — no extensions, no exceptions.",
    footer_text: footer_text?.trim() || "© {year} {brand}. All rights reserved.",
    youtube_url: youtube_url?.trim() || "",
    media_urls: JSON.stringify(parseListInput(media_urls).slice(0, 3)),
    announce_guild_id: announce_guild_id?.trim() || "",
    announce_channel_id: announce_channel_id?.trim() || "",
  });

  res.redirect(`/admin/giveaways/${id}`);
});

router.get("/:id", (req, res) => {
  const giveaway = db.getGiveaway(parseInt(req.params.id, 10));
  if (!giveaway) return res.status(404).send("Giveaway not found");
  const winnerEntry = db.getGiveawayWinnerEntry(giveaway.id);
  const entryCount = db.countGiveawayEntries(giveaway.id);

  const winnerPanel = winnerEntry
    ? `<div class="panel" style="border-color:var(--lime);">
        <h2>🏆 Winner Drawn</h2>
        <p class="note" style="margin:10px 0;">
          <b style="color:var(--ink);">${escapeHtml(winnerEntry.gamertag)}</b> (${escapeHtml(winnerEntry.email)}) -
          drawn ${fmtDate(giveaway.drawn_at)} out of ${entryCount} entrant(s), weighted by their ${winnerEntry.total_entries} total entries.
        </p>
        <p class="note">
          Discord announcement: ${
            !giveaway.announce_guild_id || !giveaway.announce_channel_id
              ? "not configured (set a Server ID + Channel ID above and save, then re-draw or wait for the next bot poll tick - it only posts for giveaways with both fields set)."
              : giveaway.announced_at
                ? `posted ${fmtDate(giveaway.announced_at)}.`
                : "configured, waiting for the bot's next poll tick (runs automatically, usually within a minute)."
          }
        </p>
      </div>`
    : `<div class="panel">
        <h2>Winner Draw</h2>
        <p class="desc">
          Weighted random draw across all ${entryCount} real entr${entryCount === 1 ? "y" : "ies"} - someone with more
          completed bonus tasks has proportionally better odds, same as the FAQ promises players. Irreversible: this ends
          the giveaway and locks in the winner.
        </p>
        <form method="post" action="/admin/giveaways/${giveaway.id}/draw" onsubmit="return confirm('Draw a winner now? This ends the giveaway and cannot be undone.');">
          <button class="btn" type="submit" ${entryCount ? "" : "disabled"}>${entryCount ? "🎲 Draw Winner" : "No entries yet"}</button>
        </form>
      </div>`;

  const body = `
    <div class="pagehead"><span class="eyebrow">Editing</span><h1>${escapeHtml(giveaway.title)}</h1></div>
    <div class="panel">
      <p class="note" style="margin-bottom:16px;">
        Public URL: <a href="/giveaways/${escapeHtml(giveaway.slug)}" style="color:var(--cyan);">/giveaways/${escapeHtml(giveaway.slug)}</a>
        (live once published) · <a href="/giveaways/${escapeHtml(giveaway.slug)}/preview" style="color:var(--cyan);" target="_blank">Live preview</a>
        (works anytime, draft or published) · Status: <span class="pill ${giveaway.status === "published" ? "active" : "pending"}">${giveaway.status}</span>
      </p>
      <form method="post" action="/admin/giveaways/${giveaway.id}">
        ${giveawayForm(giveaway)}
        <button class="btn" type="submit">Save Changes</button>
      </form>
    </div>
    ${winnerPanel}
    <div class="panel" style="display:flex; gap:10px;">
      <form method="post" action="/admin/giveaways/${giveaway.id}/${giveaway.status === "published" ? "unpublish" : "publish"}">
        <button class="btn" type="submit">${giveaway.status === "published" ? "Unpublish" : "Publish Live"}</button>
      </form>
      <a class="btn ghost" href="/admin/giveaways/${giveaway.id}/entries">View Entries (${entryCount})</a>
      <form method="post" action="/admin/giveaways/${giveaway.id}/delete" onsubmit="return confirm('Delete this giveaway and all its entries permanently?');">
        <button class="btn ghost" type="submit" style="color:var(--danger); border-color:var(--danger);">Delete</button>
      </form>
    </div>
  `;
  res.send(renderLayout({ title: giveaway.title, activeHref: "/admin/giveaways", body, staffUser: req.staffUser }));
});

router.post("/:id/draw", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const giveaway = db.getGiveaway(id);
  if (!giveaway) return res.status(404).send("Giveaway not found");
  if (giveaway.winner_entry_id) return res.redirect(`/admin/giveaways/${id}`); // already drawn - don't re-roll
  db.drawGiveawayWinner(id);
  res.redirect(`/admin/giveaways/${id}`);
});

router.post("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, kicker, subheadline, prize_title, prize_value, prize_items, tasks, end_local, brand_name, logo_url, color_bg, color_cyan, color_magenta, color_lime, fomo_text, footer_text, youtube_url, media_urls } = req.body;
  db.updateGiveaway(id, {
    title: title?.trim(),
    kicker: kicker?.trim(),
    subheadline: subheadline?.trim() || "",
    prize_title: prize_title?.trim() || "",
    prize_value: prize_value?.trim() || "",
    prize_items: JSON.stringify(parseListInput(prize_items)),
    tasks: JSON.stringify(parseTasksInput(tasks)),
    end_timestamp: new Date(end_local).getTime(),
    brand_name: brand_name?.trim() || "Giveaways",
    logo_url: logo_url?.trim() || "",
    color_bg: color_bg?.trim() || "#07070d",
    color_cyan: color_cyan?.trim() || "#00f0ff",
    color_magenta: color_magenta?.trim() || "#ff2ec4",
    color_lime: color_lime?.trim() || "#c6ff3d",
    fomo_text: fomo_text?.trim() || "Entries close the instant the timer hits zero — no extensions, no exceptions.",
    footer_text: footer_text?.trim() || "© {year} {brand}. All rights reserved.",
    youtube_url: youtube_url?.trim() || "",
    media_urls: JSON.stringify(parseListInput(media_urls).slice(0, 3)),
  });
  res.redirect(`/admin/giveaways/${id}`);
});

router.post("/:id/publish", (req, res) => {
  db.updateGiveaway(parseInt(req.params.id, 10), { status: "published" });
  res.redirect("/admin/giveaways");
});

router.post("/:id/unpublish", (req, res) => {
  db.updateGiveaway(parseInt(req.params.id, 10), { status: "draft" });
  res.redirect("/admin/giveaways");
});

router.post("/:id/delete", (req, res) => {
  db.deleteGiveaway(parseInt(req.params.id, 10));
  res.redirect("/admin/giveaways");
});

router.get("/:id/entries", (req, res) => {
  const giveaway = db.getGiveaway(parseInt(req.params.id, 10));
  if (!giveaway) return res.status(404).send("Giveaway not found");
  const entries = db.listGiveawayEntries(giveaway.id);

  const body = `
    <div class="pagehead"><span class="eyebrow">${escapeHtml(giveaway.title)}</span><h1>Entries (${entries.length})</h1></div>
    <div class="panel">
      ${
        entries.length
          ? `<div class="tablewrap"><table>
              <thead><tr><th>Gamertag</th><th>Email</th><th>Entries</th><th>Tasks Claimed</th><th>Submitted</th></tr></thead>
              <tbody>
                ${entries
                  .map((e) => {
                    const claimed = JSON.parse(e.completed_tasks || "[]");
                    const taskDefs = JSON.parse(giveaway.tasks || "[]");
                    const names = claimed.map((i) => taskDefs[i]?.title).filter(Boolean).join(", ") || "—";
                    return `<tr>
                      <td>${escapeHtml(e.gamertag)}</td>
                      <td>${escapeHtml(e.email)}</td>
                      <td class="mono">${e.total_entries}</td>
                      <td>${escapeHtml(names)}</td>
                      <td>${fmtDate(e.created_at)}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table></div>`
          : `<div class="empty">No entries yet.</div>`
      }
    </div>
  `;
  res.send(renderLayout({ title: `${giveaway.title} Entries`, activeHref: "/admin/giveaways", body, staffUser: req.staffUser }));
});

module.exports = router;

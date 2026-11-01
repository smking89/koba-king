"use strict";

const express = require("express");
const db = require("../database/db");
const { renderLayout, escapeHtml, fmtDate } = require("./layout");
const discordRest = require("./discordRest");

const router = express.Router();

const PLATFORM_LABELS = { console: "Console", pc: "PC" };
const GAME_LABELS = { rust: "Rust", ark: "ARK", dayz: "DayZ", minecraft: "Minecraft" };

function renderTicketsTable(rows, full = false) {
  if (!rows.length) return `<div class="empty">No tickets yet.</div>`;
  return `<div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Subject</th><th>From</th><th>Platform/Game</th><th>Opened</th><th>Status</th></tr></thead>
    <tbody>
      ${rows
        .map((t) => {
          const username = db.getKnownUsername(t.discord_id);
          const platformGame = t.platform || t.game ? `${PLATFORM_LABELS[t.platform] || "—"} / ${GAME_LABELS[t.game] || "—"}` : "—";
          return `<tr onclick="location.href='/admin/tickets/${t.id}'" style="cursor:pointer;">
            <td class="mono">${t.id}</td>
            <td>${escapeHtml(t.subject)}${full ? `<div class="note">${escapeHtml(t.message)}</div>` : ""}</td>
            <td class="mono">${username ? escapeHtml(username) : escapeHtml(t.discord_id)}</td>
            <td>${escapeHtml(platformGame)}</td>
            <td>${fmtDate(t.created_at)}</td>
            <td><span class="pill ${t.status}">${t.status}</span></td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table></div>`;
}

router.get("/", (req, res) => {
  const status = ["open", "pending", "closed"].includes(req.query.status) ? req.query.status : null;
  const tickets = db.listTickets(status);
  const body = `
    <div class="pagehead"><span class="eyebrow">Support</span><h1>Tickets</h1></div>
    <div class="panel" style="display:flex;gap:10px;">
      <a class="btn ghost small" href="/admin/tickets">All</a>
      <a class="btn ghost small" href="/admin/tickets?status=open">Open</a>
      <a class="btn ghost small" href="/admin/tickets?status=pending">Pending</a>
      <a class="btn ghost small" href="/admin/tickets?status=closed">Closed</a>
    </div>
    <div class="panel">${renderTicketsTable(tickets, true)}</div>
  `;
  res.send(renderLayout({ title: "Tickets", activeHref: "/admin/tickets", body, staffUser: req.staffUser }));
});

router.get("/:id", async (req, res) => {
  const ticket = db.getTicket(parseInt(req.params.id, 10));
  if (!ticket) return res.status(404).send("Ticket not found");

  const username = db.getKnownUsername(ticket.discord_id);
  let conversationHtml;

  if (!ticket.channel_id) {
    conversationHtml = `<div class="empty">This ticket was opened without a Discord server context (e.g. via DM), so there's no live channel to show - the original message is above.</div>`;
  } else if (!discordRest.isConfigured()) {
    conversationHtml = `<div class="empty">DISCORD_TOKEN isn't set in .env - the admin dashboard needs it to read/send messages in the ticket channel.</div>`;
  } else {
    try {
      const messages = await discordRest.listChannelMessages(ticket.channel_id, 50);
      conversationHtml = messages.length
        ? `<div class="tickets-thread">${messages
            .map(
              (m) => `<div class="tmsg">
                <div class="tmsg-head"><span class="tmsg-author">${escapeHtml(m.author?.username || "unknown")}</span><span class="tmsg-time">${fmtDate(Date.parse(m.timestamp))}</span></div>
                <div class="tmsg-body">${escapeHtml(m.content || "(embed or attachment)")}</div>
              </div>`
            )
            .join("")}</div>`
        : `<div class="empty">No messages yet in this ticket's channel.</div>`;
    } catch (err) {
      conversationHtml = `<div class="empty">Couldn't load the live channel (it may have already been closed/deleted): ${escapeHtml(err.message)}</div>`;
    }
  }

  const body = `
    <div class="pagehead"><span class="eyebrow">Ticket #${ticket.id}</span><h1>${escapeHtml(ticket.subject)}</h1></div>
    <div class="panel">
      <p class="note" style="margin-bottom:10px;">
        From <b style="color:var(--ink);">${username ? escapeHtml(username) : escapeHtml(ticket.discord_id)}</b> ·
        Opened ${fmtDate(ticket.created_at)} · Status <span class="pill ${ticket.status}">${ticket.status}</span>
        ${ticket.platform || ticket.game ? ` · ${escapeHtml(PLATFORM_LABELS[ticket.platform] || "—")} / ${escapeHtml(GAME_LABELS[ticket.game] || "—")}` : ""}
        ${ticket.channel_id ? ` · Discord channel ID <span class="mono">${escapeHtml(ticket.channel_id)}</span>` : ""}
      </p>
      <p>${escapeHtml(ticket.message)}</p>
    </div>

    <div class="panel">
      <h2>Conversation (live from Discord)</h2>
      <style>
        .tickets-thread { display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; margin-bottom: 18px; }
        .tmsg { background: var(--bg-raised); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
        .tmsg-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-dim); margin-bottom: 4px; }
        .tmsg-author { font-weight: 700; color: var(--ink); }
        .tmsg-body { font-size: 14px; white-space: pre-wrap; }
      </style>
      ${conversationHtml}
      ${
        ticket.channel_id && ticket.status !== "closed"
          ? `<form method="post" action="/admin/tickets/${ticket.id}/reply">
              <div class="field"><label>Reply (posts into the Discord ticket channel)</label><textarea name="content" required placeholder="Type your reply..."></textarea></div>
              <button class="btn" type="submit">Send Reply</button>
            </form>`
          : ""
      }
    </div>

    <div class="panel" style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end;">
      <form method="post" action="/admin/tickets/${ticket.id}/status" style="display:flex; gap:8px; align-items:flex-end;">
        <div class="field" style="margin-bottom:0;"><label>Status</label>
          <select name="status">
            <option value="open" ${ticket.status === "open" ? "selected" : ""}>Open</option>
            <option value="pending" ${ticket.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="closed" ${ticket.status === "closed" ? "selected" : ""}>Closed</option>
          </select>
        </div>
        <button class="btn ghost small" type="submit">Update Status</button>
      </form>
      ${
        ticket.channel_id && ticket.status !== "closed"
          ? `<form method="post" action="/admin/tickets/${ticket.id}/close" onsubmit="return confirm('Close this ticket and delete its Discord channel?');">
              <button class="btn small" type="submit" style="background:var(--danger);">Close &amp; Delete Channel</button>
            </form>`
          : ""
      }
      <a class="btn ghost small" href="/admin/tickets">← Back to all tickets</a>
    </div>
  `;
  res.send(renderLayout({ title: `Ticket #${ticket.id}`, activeHref: "/admin/tickets", body, staffUser: req.staffUser }));
});

router.post("/:id/reply", async (req, res) => {
  const ticket = db.getTicket(parseInt(req.params.id, 10));
  if (!ticket || !ticket.channel_id) return res.status(400).send("This ticket has no live channel to reply to.");

  const content = (req.body.content || "").trim();
  if (!content) return res.redirect(`/admin/tickets/${ticket.id}`);

  try {
    await discordRest.sendChannelMessage(ticket.channel_id, `**[Staff via dashboard]:** ${content}`);
    db.updateTicket(ticket.id, { status: "pending" });
  } catch (err) {
    console.error("[KOBA Bot Admin] Failed to send ticket reply:", err.message);
  }
  res.redirect(`/admin/tickets/${ticket.id}`);
});

router.post("/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.updateTicket(id, { status: req.body.status });
  res.redirect(`/admin/tickets/${id}`);
});

router.post("/:id/close", async (req, res) => {
  const ticket = db.getTicket(parseInt(req.params.id, 10));
  if (!ticket) return res.status(404).send("Ticket not found");

  if (ticket.channel_id) {
    try {
      await discordRest.sendChannelMessage(ticket.channel_id, "**This ticket has been closed from the admin dashboard.**");
      await discordRest.deleteChannel(ticket.channel_id);
    } catch (err) {
      console.error("[KOBA Bot Admin] Failed to close ticket channel:", err.message);
    }
  }
  db.updateTicket(ticket.id, { status: "closed", closedAt: Date.now() });
  res.redirect("/admin/tickets");
});

module.exports = { router, renderTicketsTable };

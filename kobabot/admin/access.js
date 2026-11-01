"use strict";

const express = require("express");
const db = require("../database/db");
const { renderLayout, escapeHtml, fmtDate } = require("./layout");

const router = express.Router();

const TRIAL_VALUE_KEY = "trial_duration_value";
const TRIAL_UNIT_KEY = "trial_duration_unit"; // "hours" | "days"

const ERROR_MESSAGES = {
  not_found:
    "KOBA Bot doesn't recognize that username yet. It can only resolve usernames it's actually seen - have that person run any command (like /support) or add KOBA Bot to a server they own, then try again.",
  missing: "Enter a Discord username.",
};

function getTrialConfig() {
  const value = parseInt(db.getSiteSetting(TRIAL_VALUE_KEY, "48"), 10) || 48;
  const unit = db.getSiteSetting(TRIAL_UNIT_KEY, "hours") === "days" ? "days" : "hours";
  return { value, unit };
}

function trialDurationMs({ value, unit }) {
  const hourMs = 60 * 60 * 1000;
  return unit === "days" ? value * 24 * hourMs : value * hourMs;
}

/** Resolves a submitted username to a Discord ID via the bot's own observation cache, or null. */
function resolveUsername(raw) {
  const username = (raw || "").trim().replace(/^@/, "");
  if (!username) return { error: "missing" };
  const discordId = db.findUserIdByUsername(username);
  if (!discordId) return { error: "not_found" };
  return { discordId };
}

router.get("/", (req, res) => {
  const trial = getTrialConfig();
  const users = db.listPremiumUsers();
  const now = Date.now();
  const error = ERROR_MESSAGES[req.query.error];

  const body = `
    <div class="pagehead"><span class="eyebrow">Superadmin</span><h1>Access Tokens</h1></div>
    ${error ? `<div class="panel" style="border-color:var(--danger);"><p style="color:var(--danger);margin:0;">${escapeHtml(error)}</p></div>` : ""}

    <div class="panel">
      <h2>Grant access</h2>
      <p class="note" style="margin-bottom:16px;">Targets people by Discord username - KOBA Bot has to have seen that username at least once (any command, or owning a server it's in) before it can be looked up here.</p>
      <form method="post" action="/admin/access/grant">
        <div class="formrow">
          <div class="field"><label>Discord Username</label><input type="text" name="username" required placeholder="e.g. rustyreaper" /></div>
          <div class="field"><label>Duration (days)</label><input type="number" name="days" min="1" value="30" required /></div>
        </div>
        <button class="btn" type="submit">Grant Access</button>
      </form>
    </div>

    <div class="panel">
      <h2>Free trial</h2>
      <p class="note" style="margin-bottom:16px;">Configure how long a trial lasts, then issue one to any known Discord username so they can try KOBA Bot before subscribing.</p>
      <form method="post" action="/admin/access/trial-config" style="margin-bottom:22px;">
        <div class="formrow">
          <div class="field"><label>Trial length</label><input type="number" name="value" min="1" value="${trial.value}" required /></div>
          <div class="field"><label>Unit</label>
            <select name="unit">
              <option value="hours" ${trial.unit === "hours" ? "selected" : ""}>Hours</option>
              <option value="days" ${trial.unit === "days" ? "selected" : ""}>Days</option>
            </select>
          </div>
        </div>
        <button class="btn ghost small" type="submit">Save Trial Length</button>
      </form>
      <form method="post" action="/admin/access/trial-grant">
        <div class="field"><label>Discord Username</label><input type="text" name="username" required placeholder="e.g. rustyreaper" /></div>
        <button class="btn" type="submit">Start ${trial.value} ${trial.unit} Trial</button>
      </form>
    </div>

    <div class="panel">
      <h2>All tokens</h2>
      ${
        users.length
          ? `<div class="tablewrap"><table>
              <thead><tr><th>Username</th><th>Discord ID</th><th>Status</th><th>Expires</th><th>Active Server</th><th>Granted By</th><th>Revoke</th></tr></thead>
              <tbody>
                ${users
                  .map((u) => {
                    const active = u.expires_at > now;
                    const username = db.getKnownUsername(u.discord_id);
                    return `<tr>
                      <td>${username ? escapeHtml(username) : `<span class="note">unknown</span>`}</td>
                      <td class="mono">${escapeHtml(u.discord_id)}</td>
                      <td><span class="pill ${active ? "active" : "left"}">${active ? "Active" : "Expired"}</span></td>
                      <td>${fmtDate(u.expires_at)}</td>
                      <td class="mono">${u.active_guild_id ? escapeHtml(u.active_guild_id) : "— unclaimed —"}</td>
                      <td class="mono">${escapeHtml(u.activated_by || "—")}</td>
                      <td>
                        ${
                          active
                            ? `<form method="post" action="/admin/access/${encodeURIComponent(u.discord_id)}/revoke" onsubmit="return confirm('Revoke access for this account? This locks any server their license currently authorizes.');">
                                <button class="btn small" type="submit" style="background:var(--danger);">Revoke</button>
                              </form>`
                            : "—"
                        }
                      </td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table></div>`
          : `<div class="empty">No access tokens issued yet.</div>`
      }
    </div>
  `;
  res.send(renderLayout({ title: "Access Tokens", activeHref: "/admin/access", body, staffUser: req.staffUser }));
});

router.post("/grant", (req, res) => {
  const { discordId, error } = resolveUsername(req.body.username);
  if (error) return res.redirect(`/admin/access?error=${error}`);

  const numDays = parseInt(req.body.days, 10);
  if (!Number.isFinite(numDays) || numDays < 1) return res.status(400).send("Invalid duration");

  db.setPremiumUser(discordId, Date.now() + numDays * 24 * 60 * 60 * 1000, "superadmin");
  res.redirect("/admin/access");
});

router.post("/trial-config", (req, res) => {
  const value = parseInt(req.body.value, 10);
  const unit = req.body.unit === "days" ? "days" : "hours";
  if (Number.isFinite(value) && value > 0) {
    db.setSiteSetting(TRIAL_VALUE_KEY, String(value));
    db.setSiteSetting(TRIAL_UNIT_KEY, unit);
  }
  res.redirect("/admin/access");
});

router.post("/trial-grant", (req, res) => {
  const { discordId, error } = resolveUsername(req.body.username);
  if (error) return res.redirect(`/admin/access?error=${error}`);

  const trial = getTrialConfig();
  db.setPremiumUser(discordId, Date.now() + trialDurationMs(trial), "trial");
  res.redirect("/admin/access");
});

router.post("/:discordId/revoke", (req, res) => {
  db.revokePremiumUser(req.params.discordId);
  res.redirect("/admin/access");
});

module.exports = router;

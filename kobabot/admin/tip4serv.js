"use strict";

const express = require("express");
const db = require("../database/db");
const { renderLayout, escapeHtml, fmtDate } = require("./layout");

/**
 * Tip4Serv billing. Replaces Stripe (see admin/billing.js, left in place
 * but unused). Tip4Serv is a donation/shop platform for game servers, not a
 * recurring-billing API - purchases are one-time, so the model here is
 * "buy a package -> get N days of access", not a subscription with a
 * portal. Confirmed webhook payload shape (docs.tip4serv.com):
 *
 *   {
 *     "event": "payment.success",              // also: payment.refunded, subscription.*
 *     "data": {
 *       "transaction_id": "...",
 *       "amount": { "total_paid": 12, "currency": "EUR" },
 *       "user": { "discord_id": "...", "discord_username": "..." },
 *       "basket": [ { "id": 183, "name": "Gold Sword", "price": 10, "quantity": 1 } ]
 *     }
 *   }
 *
 * Tip4Serv's public docs don't cover the exact signature/secret header for
 * verifying a webhook is genuinely from them (only the payload shape is
 * documented). Until that's confirmed from your Tip4Serv dashboard's
 * webhook settings, this verifies via a shared secret appended to the
 * webhook URL itself as ?secret=... - set TIP4SERV_WEBHOOK_SECRET to a long
 * random string, and configure that exact URL (with the query string) as
 * the callback URL in Tip4Serv. If Tip4Serv instead signs requests with a
 * header, tell me the header name and I'll switch this to verify that way.
 */

const router = express.Router();
const adminRouter = express.Router();

function packageDurationLabel(days) {
  if (!days) return "Not configured";
  return `${days} day${days === 1 ? "" : "s"}`;
}

adminRouter.get("/", (req, res) => {
  const packages = db.listTip4servPackages();
  const configured = !!process.env.TIP4SERV_WEBHOOK_SECRET;

  const body = `
    <div class="pagehead"><span class="eyebrow">Billing</span><h1>Tip4Serv</h1></div>

    ${
      !configured
        ? `<div class="panel" style="border-color:var(--danger);"><p style="color:var(--danger);margin:0;">TIP4SERV_WEBHOOK_SECRET isn't set - the webhook endpoint will reject every incoming request until it is. Add it to your environment variables, then set the same value in the Tip4Serv callback URL as ?secret=...</p></div>`
        : ""
    }

    <div class="panel">
      <h2>Webhook URL</h2>
      <p class="note" style="margin-bottom:10px;">Paste this into Tip4Serv's callback/webhook URL field for each product (Store settings, per-product webhook config):</p>
      <p class="mono" style="word-break:break-all;background:var(--bg-raised);padding:10px 14px;border-radius:8px;">${req.protocol}://${req.get("host")}/tip4serv/webhook?secret=YOUR_SECRET_HERE</p>
    </div>

    <div class="panel">
      <h2>Package durations</h2>
      <p class="note" style="margin-bottom:16px;">Every Tip4Serv package (basket item) that's ever triggered a webhook shows up here automatically. Set how many days of access each one grants - purchases stack on top of remaining time rather than resetting it.</p>
      ${
        packages.length
          ? `<div class="tablewrap"><table>
              <thead><tr><th>Package</th><th>Item ID</th><th>Days granted</th><th>Last seen</th><th></th></tr></thead>
              <tbody>
                ${packages
                  .map(
                    (p) => `<tr>
                      <td>${escapeHtml(p.item_name || "(unnamed)")}</td>
                      <td class="mono">${escapeHtml(p.item_id)}</td>
                      <td><span class="pill ${p.days ? "active" : "left"}">${packageDurationLabel(p.days)}</span></td>
                      <td>${fmtDate(p.updated_at)}</td>
                      <td>
                        <form method="post" action="/admin/tip4serv/${encodeURIComponent(p.item_id)}/days" style="display:flex;gap:8px;">
                          <input type="number" name="days" min="0" value="${p.days}" style="width:90px;" />
                          <button class="btn ghost small" type="submit">Save</button>
                        </form>
                      </td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`
          : `<div class="empty">No Tip4Serv packages seen yet - they'll appear here the first time someone completes a purchase.</div>`
      }
    </div>
  `;
  res.send(renderLayout({ title: "Tip4Serv", activeHref: "/admin/tip4serv", body, staffUser: req.staffUser }));
});

adminRouter.post("/:itemId/days", (req, res) => {
  const days = parseInt(req.body.days, 10);
  if (Number.isFinite(days) && days >= 0) {
    db.setTip4servPackageDays(req.params.itemId, days);
  }
  res.redirect("/admin/tip4serv");
});

/**
 * Public webhook. Mounted with express.json() directly (not the app-wide
 * urlencoded parser) since Tip4Serv posts JSON.
 */
router.post("/tip4serv/webhook", express.json(), (req, res) => {
  if (!process.env.TIP4SERV_WEBHOOK_SECRET || req.query.secret !== process.env.TIP4SERV_WEBHOOK_SECRET) {
    res.status(401).send("Invalid or missing secret");
    return;
  }

  const { event, data } = req.body || {};
  if (!event || !data) {
    res.status(400).send("Malformed payload");
    return;
  }

  try {
    const discordId = data.user?.discord_id;
    const basket = Array.isArray(data.basket) ? data.basket : [];

    // Register every basket item so the admin can see and configure it,
    // regardless of event type.
    for (const item of basket) {
      if (item?.id != null) db.upsertTip4servPackageSeen(item.id, item.name);
    }

    function daysByGrantType(grantType) {
      return basket.reduce((sum, item) => {
        if (item?.id == null) return sum;
        const pkg = db.listTip4servPackages().find((p) => p.item_id === String(item.id));
        if (!pkg || (pkg.grant_type || "server_license") !== grantType) return sum;
        return sum + pkg.days * (item.quantity || 1);
      }, 0);
    }

    if (event === "payment.success" || event === "subscription.created" || event === "subscription.renewed") {
      if (!discordId) {
        console.warn("[KOBA Bot Tip4Serv] Payment webhook with no discord_id on the order - can't grant access:", data.transaction_id);
      } else {
        const serverLicenseDays = daysByGrantType("server_license");

        if (serverLicenseDays > 0) {
          const expiresAt = db.extendPremiumUser(discordId, serverLicenseDays, "tip4serv");
          console.log(`[KOBA Bot Tip4Serv] Granted ${serverLicenseDays} day(s) server license to ${discordId}, now expires ${new Date(expiresAt).toISOString()}`);
        }
        if (serverLicenseDays > 0) {
          const amountCents = Math.round((data.amount?.total_paid || 0) * 100);
          db.recordSale(discordId, amountCents, (data.amount?.currency || "USD").toUpperCase(), "tip4serv", `Tip4Serv ${data.transaction_id || ""}`.trim(), "tip4serv");
        } else {
          console.warn("[KOBA Bot Tip4Serv] Payment received but no package in the basket has a configured duration yet - visit /admin/tip4serv to set one:", basket.map((b) => b.id));
        }
      }
    } else if (event === "payment.refunded" || event === "subscription.expired") {
      if (discordId) {
        // Only revoke if the refunded/expired basket actually covered a
        // server license.
        const hadServerLicense = basket.some((item) => {
          const pkg = db.listTip4servPackages().find((p) => p.item_id === String(item?.id));
          return pkg && (pkg.grant_type || "server_license") === "server_license";
        });
        if (hadServerLicense || !basket.length) db.setPremiumUser(discordId, Date.now(), "tip4serv");
      }
    }
    // payment.refused and any other event types: nothing to do.
  } catch (err) {
    console.error("[KOBA Bot Tip4Serv] Error handling webhook:", err.message);
  }

  res.json({ received: true });
});

module.exports = { router, adminRouter };

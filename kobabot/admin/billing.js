"use strict";

const express = require("express");
const db = require("../database/db");
const { getStripe } = require("./stripeClient");
const { PLAYER_THEME_CSS } = require("./theme");

const router = express.Router();

// Page-specific chrome only - tokens/base/.field-input styling/.btn all come
// from ./theme.js's PLAYER_THEME_CSS now (this used to be a fully
// standalone stylesheet with its own hardcoded hex palette, sharing nothing
// with any other page in the app).
const PAGE_STYLES = `
  ${PLAYER_THEME_CSS}
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; padding: var(--space-5); }
  .box { width: 380px; max-width: 100%; background:var(--bg-panel); border:1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-8); box-shadow: var(--shadow-md); }
  .brand { margin-bottom: var(--space-2); }
  .brand img { height: 52px; width: auto; display: block; max-width: 100%; }
  .sub { font-size:12.5px; color:var(--ink-dim); margin-bottom: var(--space-6); letter-spacing:0.04em; text-transform:uppercase; font-family: var(--font-mono);}
  p.copy { color: var(--ink-dim); font-size: 14px; margin-bottom: var(--space-5); line-height: 1.5; }
  input { width:100%; background:var(--bg-panel-raised); border:1px solid var(--line); border-radius: var(--radius-md); color:var(--ink); padding:11px 12px; font-size:14px; margin-bottom: var(--space-4); min-height: var(--touch-target); font-family: var(--font-body); }
  input:focus { outline:none; border-color:var(--cyan); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cyan) 22%, transparent); }
  .btn { display:block; width:100%; box-sizing:border-box; text-align:center; }
  .err { color: var(--danger); font-size:13px; margin-bottom: var(--space-4); }
  a.back { display:inline-block; margin-top: var(--space-4); color: var(--ink-dim); font-size: 13px; }
`;

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — KOBA Bot</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${PAGE_STYLES}</style></head>
<body><div class="box">${body}</div></body></html>`;
}

router.get("/subscribe", (req, res) => {
  const error = req.query.error;
  res.send(
    page(
      "Subscribe",
      `<div class="brand"><img src="/brand/icon-mark.png" alt="KOBA Bot" /></div>
      <div class="sub">Command Tier Subscription</div>
      <p class="copy">Enter the Discord User ID of the account that owns your server. That account's subscription unlocks KOBA Bot on any server it owns.</p>
      ${error ? `<div class="err">${error === "config" ? "Billing isn't configured yet - contact support." : "Something went wrong. Please try again."}</div>` : ""}
      <form method="post" action="/subscribe/checkout">
        <input type="text" name="discord_id" placeholder="Your Discord User ID" required pattern="[0-9]{15,25}" />
        <button class="btn" type="submit">Continue to Checkout</button>
      </form>
      <a class="back" href="/">← Back to KOBA Bot</a>`
    )
  );
});

/**
 * Resolves the Stripe Price to charge. STRIPE_PRICE_LOOKUP_KEY takes
 * priority when set - it looks the live price up by a human-readable key
 * (e.g. "kobabot_monthly") instead of a raw price_... ID, matching Stripe's
 * own recommended pattern so the price can change in the Dashboard without
 * ever touching .env. Falls back to STRIPE_PRICE_ID for a simpler setup.
 */
async function resolvePriceId(stripe) {
  if (process.env.STRIPE_PRICE_LOOKUP_KEY) {
    const prices = await stripe.prices.list({ lookup_keys: [process.env.STRIPE_PRICE_LOOKUP_KEY], active: true, limit: 1 });
    if (prices.data[0]) return prices.data[0].id;
  }
  return process.env.STRIPE_PRICE_ID || null;
}

router.post("/subscribe/checkout", async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !(process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRICE_LOOKUP_KEY)) {
    res.redirect("/subscribe?error=config");
    return;
  }

  const discordId = (req.body.discord_id || "").trim();
  if (!/^[0-9]{15,25}$/.test(discordId)) {
    res.redirect("/subscribe?error=1");
    return;
  }

  try {
    const priceId = await resolvePriceId(stripe);
    if (!priceId) {
      res.redirect("/subscribe?error=config");
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe/cancel`,
      metadata: { discord_id: discordId },
      subscription_data: { metadata: { discord_id: discordId } },
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error("[KOBA Bot Billing] Checkout session creation failed:", err.message);
    res.redirect("/subscribe?error=1");
  }
});

router.get("/subscribe/success", (req, res) => {
  res.send(
    page(
      "Subscribed",
      `<div class="brand"><img src="/brand/icon-mark.png" alt="KOBA Bot" /></div>
      <div class="sub">Payment Received</div>
      <p class="copy">Your subscription is active. Invite KOBA Bot to your server (or run <code>/setup</code> if it's already there) and it unlocks automatically - no waiting on a ticket.</p>
      <a class="btn" href="/">Back to KOBA Bot</a>`
    )
  );
});

router.get("/subscribe/cancel", (req, res) => {
  res.send(
    page(
      "Checkout Cancelled",
      `<div class="brand"><img src="/brand/icon-mark.png" alt="KOBA Bot" /></div>
      <div class="sub">No Charge Made</div>
      <p class="copy">Checkout was cancelled - nothing was charged. You can try again anytime.</p>
      <a class="btn" href="/subscribe">Try Again</a>`
    )
  );
});

/**
 * Self-service subscription management via Stripe's hosted Customer Portal -
 * lets a subscriber update payment method, view invoices, or cancel without
 * ever needing to file a support ticket for it.
 */
router.get("/subscribe/manage", (req, res) => {
  const error = req.query.error;
  res.send(
    page(
      "Manage Subscription",
      `<div class="brand"><img src="/brand/icon-mark.png" alt="KOBA Bot" /></div>
      <div class="sub">Manage Your Subscription</div>
      <p class="copy">Enter the Discord User ID you subscribed with to update payment details, view invoices, or cancel.</p>
      ${error ? `<div class="err">${error === "config" ? "Billing isn't configured yet - contact support." : "No subscription found for that account."}</div>` : ""}
      <form method="post" action="/subscribe/manage">
        <input type="text" name="discord_id" placeholder="Your Discord User ID" required pattern="[0-9]{15,25}" />
        <button class="btn" type="submit">Open Billing Portal</button>
      </form>
      <a class="back" href="/">← Back to KOBA Bot</a>`
    )
  );
});

router.post("/subscribe/manage", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    res.redirect("/subscribe/manage?error=config");
    return;
  }

  const discordId = (req.body.discord_id || "").trim();
  const customerId = db.getStripeCustomerIdByDiscordId(discordId);
  if (!customerId) {
    res.redirect("/subscribe/manage?error=notfound");
    return;
  }

  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/`,
    });
    res.redirect(303, portalSession.url);
  } catch (err) {
    console.error("[KOBA Bot Billing] Portal session creation failed:", err.message);
    res.redirect("/subscribe/manage?error=notfound");
  }
});

/**
 * Stripe webhook. Mounted with its own express.raw() body parser so the
 * signature verification below sees the exact raw bytes Stripe signed -
 * the global express.urlencoded() parser earlier in server.js skips this
 * request because its content-type (application/json) doesn't match, so
 * the raw body stream reaches this handler untouched.
 */
router.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).send("Billing not configured");
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[KOBA Bot Billing] Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const discordId = session.metadata?.discord_id;
        if (discordId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          db.setPremiumUser(discordId, subscription.current_period_end * 1000, "stripe");
          db.upsertStripeCustomer(discordId, session.customer, session.subscription);
          db.recordSale(discordId, session.amount_total ?? 0, (session.currency || "usd").toUpperCase(), "subscription", `Stripe checkout ${session.id}`, "stripe");
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
          const discordId = db.getDiscordIdByStripeCustomerId(invoice.customer);
          if (discordId) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            db.setPremiumUser(discordId, subscription.current_period_end * 1000, "stripe");
            db.recordSale(discordId, invoice.amount_paid ?? 0, (invoice.currency || "usd").toUpperCase(), "renewal", `Stripe invoice ${invoice.id}`, "stripe");
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const discordId = db.getDiscordIdByStripeCustomerId(subscription.customer);
        // MVP revocation model: lock immediately on cancellation/non-payment
        // rather than waiting out any remaining period - simplest to reason
        // about, document if you'd rather let it ride to period end instead.
        if (discordId) db.setPremiumUser(discordId, Date.now(), "stripe");
        break;
      }
      default:
        break; // unhandled event types are fine to ignore
    }
  } catch (err) {
    console.error(`[KOBA Bot Billing] Error handling ${event.type}:`, err.message);
  }

  res.json({ received: true });
});

module.exports = router;

"use strict";

let client = null;

/** Lazily constructs the Stripe SDK client. Returns null if not configured, so
 * callers can show a "billing isn't set up yet" message instead of crashing. */
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) client = require("stripe")(process.env.STRIPE_SECRET_KEY);
  return client;
}

module.exports = { getStripe };

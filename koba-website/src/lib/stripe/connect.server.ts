/**
 * Stripe Connect account linking - real payouts for shop sellers (once
 * re-enabled), business/sponsor accounts, and reward fulfillment. Uses
 * Stripe's hosted Connect Express onboarding (an Account Link redirect) -
 * neither this code nor the browser ever sees a card number; that's
 * entirely on Stripe's side of the redirect.
 *
 * STRIPE_SECRET_KEY is read from the environment only (never hardcoded, no
 * .env file - same convention as DATABASE_URL in src/lib/db.ts). Without a
 * real key configured (true in this sandbox/dev environment), every
 * function here throws a clear "not configured" error rather than silently
 * no-op'ing or faking success.
 */

// Dynamically imported inside functions below, not at module scope - same
// reasoning as src/lib/pulse/anticheat.server.ts: avoids pulling in
// src/lib/db.ts's eager PGLite bootstrap (Vite-only import.meta.glob) just
// by importing this file, and avoids constructing the Stripe client (which
// throws without a key) at import time.
type DbModule = typeof import("../db.ts");
let dbModulePromise: Promise<DbModule> | null = null;
function loadDb(): Promise<DbModule> {
  dbModulePromise ??= import("../db.ts");
  return dbModulePromise;
}

let stripeClientPromise: Promise<import("stripe").default> | null = null;
async function loadStripe(): Promise<import("stripe").default> {
  if (!stripeClientPromise) {
    const key = typeof process !== "undefined" ? process.env.STRIPE_SECRET_KEY : undefined;
    if (!key || !key.trim()) {
      throw new Error("Stripe is not configured (STRIPE_SECRET_KEY is unset) - connect it on the deploy platform, not in source.");
    }
    stripeClientPromise = import("stripe").then((mod) => new mod.default(key, { apiVersion: "2026-09-30.endive" }));
  }
  return stripeClientPromise;
}

export interface ConnectStatus {
  connected: boolean;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
}

/** Current linking status for a player, straight from our own stored columns - no live Stripe call needed just to render Settings. */
export async function getConnectStatus(playerId: string): Promise<ConnectStatus> {
  const { getSql } = await loadDb();
  const sql = await getSql();
  const rows = await sql<{ stripe_account_id: string | null; stripe_details_submitted: boolean; stripe_charges_enabled: boolean }>`
    select stripe_account_id, stripe_details_submitted, stripe_charges_enabled
    from players where id = ${playerId}
  `;
  const row = rows[0];
  if (!row) throw new Error(`Unknown player: ${playerId}`);
  return {
    connected: !!row.stripe_account_id,
    accountId: row.stripe_account_id,
    detailsSubmitted: row.stripe_details_submitted,
    chargesEnabled: row.stripe_charges_enabled,
  };
}

/**
 * Creates (or reuses) this player's Connect Express account, then returns a
 * fresh onboarding Account Link URL to redirect the browser to. Account
 * Links expire quickly (a few minutes) by design, so callers should request
 * one right before redirecting, not cache it.
 */
export async function createOnboardingLink(input: {
  playerId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ url: string }> {
  const stripe = await loadStripe();
  const { getSql } = await loadDb();
  const sql = await getSql();

  const rows = await sql<{ stripe_account_id: string | null; handle: string }>`
    select stripe_account_id, handle from players where id = ${input.playerId}
  `;
  const row = rows[0];
  if (!row) throw new Error(`Unknown player: ${input.playerId}`);

  let accountId = row.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { koba_player_id: input.playerId, koba_handle: row.handle },
    });
    accountId = account.id;
    await sql`update players set stripe_account_id = ${accountId} where id = ${input.playerId}`;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: input.returnUrl,
    refresh_url: input.refreshUrl,
  });
  return { url: link.url };
}

/**
 * Re-syncs our stored status columns from Stripe's own account object -
 * call this on the return-from-onboarding redirect, since Stripe doesn't
 * push a webhook into this sandbox and the local columns would otherwise
 * stay stale. Uses Stripe's own details_submitted/charges_enabled fields
 * rather than inventing separate status logic.
 */
export async function refreshConnectStatus(playerId: string): Promise<ConnectStatus> {
  const stripe = await loadStripe();
  const { getSql } = await loadDb();
  const sql = await getSql();

  const rows = await sql<{ stripe_account_id: string | null }>`
    select stripe_account_id from players where id = ${playerId}
  `;
  const accountId = rows[0]?.stripe_account_id;
  if (!accountId) return { connected: false, accountId: null, detailsSubmitted: false, chargesEnabled: false };

  const account = await stripe.accounts.retrieve(accountId);
  const detailsSubmitted = !!account.details_submitted;
  const chargesEnabled = !!account.charges_enabled;
  await sql`
    update players
    set stripe_details_submitted = ${detailsSubmitted}, stripe_charges_enabled = ${chargesEnabled}
    where id = ${playerId}
  `;
  return { connected: true, accountId, detailsSubmitted, chargesEnabled };
}

/** Unlinks the stored account id - does NOT delete the Stripe Connect account itself (the player can re-onboard the same or a different one later). */
export async function disconnect(playerId: string): Promise<void> {
  const { getSql } = await loadDb();
  const sql = await getSql();
  await sql`
    update players
    set stripe_account_id = null, stripe_details_submitted = false, stripe_charges_enabled = false
    where id = ${playerId}
  `;
}

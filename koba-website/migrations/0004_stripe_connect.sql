-- Stripe Connect account linking (2026-10-19), for real payouts - sellers
-- once the shop is re-enabled, business/sponsor accounts, reward
-- fulfillment. Separate columns from players.account_links (that jsonb map
-- is linked GAME identities, e.g. "rust:mara" - a different concept from a
-- linked payment-processor account, so it gets its own typed columns
-- instead of being folded into that map).
alter table players add column if not exists stripe_account_id text;
alter table players add column if not exists stripe_details_submitted boolean not null default false;
alter table players add column if not exists stripe_charges_enabled boolean not null default false;

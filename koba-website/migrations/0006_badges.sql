-- Cross-platform identity links on the existing real identity table (players.id
-- is already the permanent KOBAid - the real auth user id from migrations/0005_auth.sql,
-- see src/lib/profile/profile.server.ts). One row per linked platform, enforced unique.
alter table players add column if not exists discord_id text unique;
alter table players add column if not exists steam_id text unique;
alter table players add column if not exists xbox_xuid text unique;
alter table players add column if not exists psn_id text unique;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'game_type') then
    create type game_type as enum ('RUST_PC', 'RUST_CONSOLE', 'DAYZ', 'ARK', 'MINECRAFT', 'PALWORLD');
  end if;
end $$;

-- WebRCON connection config on the existing real servers table (business-owned,
-- explicit game_type set at setup time so players never pick a game manually).
alter table servers add column if not exists game_type game_type;
alter table servers add column if not exists webrcon_host text;
alter table servers add column if not exists webrcon_port integer;
alter table servers add column if not exists webrcon_password text;

-- Master registry of every possible badge. Only EARNED badges get a player_badges
-- row - the unearned/locked state is computed by diffing against this table, never
-- stored, per the "don't store locked rows" rule.
create table if not exists badge_registry (
  badge_id text primary key,
  game_type game_type,
  platform_internal_name text,
  display_name text not null,
  description text not null,
  tier text not null,
  icon_url text,
  created_at timestamptz not null default now()
);

create table if not exists player_badges (
  koba_id text not null references players (id) on delete cascade,
  badge_id text not null references badge_registry (badge_id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (koba_id, badge_id)
);
create index if not exists player_badges_koba_id_idx on player_badges (koba_id);

insert into badge_registry (badge_id, display_name, description, tier) values
  ('first-contact', 'First Contact', 'Generate your KOBAid by completing your registration profile.', 'silver'),
  ('linked-up', 'Linked Up', 'Link your Discord profile directly to your global KOBA profile.', 'silver'),
  ('server-hopper', 'Server Hopper', 'Connect to your first server on KOBA.', 'silver'),
  ('world-traveler', 'World Traveler', 'Play on 3 different community servers using your connected account.', 'bronze'),
  ('deep-roots', 'Deep Roots', 'Log a cumulative total of 50 hours of verified game time across KOBA.', 'bronze'),
  ('first-blood', 'First Blood', 'Secure your first 50 combat kills tracked on the live KOBA feed.', 'bronze'),
  ('market-trader', 'Market Trader', 'Complete your first buy, sell, or successful bid transaction inside the KOBAbot marketplace.', 'bronze'),
  ('trailblazer', 'Trailblazer', 'Form or join a clan.', 'bronze'),
  ('pinnacle', 'Pinnacle', 'Successfully unlock 100% of all official platform or KOBA badges for any single game title you play.', 'gold'),
  ('dominant-streak', 'Dominant Streak', 'Maintain a verified positive kill-to-death ratio across 10 consecutive gaming sessions.', 'gold'),
  ('relic-collector', 'Relic Collector', 'Acquire or trade a certified 1-of-1 ''Relic'' tier custom skin or game asset item code.', 'gold'),
  ('apex-legend', 'Apex Legend', 'Secure a top 10 position on any global competitive server leaderboard.', 'gold')
on conflict (badge_id) do nothing;

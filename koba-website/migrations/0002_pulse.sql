-- KOBA Pulse catalog schema: players, per-game KOBA scores, server telemetry,
-- discovery items, and the boost ledger. Rows come from real sign-ups and
-- connector ingest only - this migration seeds no demo catalog.

create table if not exists players (
  id text primary key,
  handle text not null,
  display_name text not null,
  region text not null,
  clan_id text,
  friends jsonb not null default '[]'::jsonb,
  rivals jsonb not null default '[]'::jsonb,
  plays jsonb not null default '[]'::jsonb,
  games jsonb not null default '{}'::jsonb,
  vector double precision[] not null,
  score double precision not null,
  astro boolean not null default false,
  line text not null default '',
  activity_index double precision not null default 40,
  boost_credits integer not null default 1,
  account_links jsonb not null default '{}'::jsonb,
  ordinal integer not null default 0
);

create table if not exists koba_scores (
  player_id text not null references players (id),
  game_id text not null,
  normalized_score double precision not null,
  confidence_low double precision not null,
  confidence_high double precision not null,
  activity_index double precision not null,
  primary key (player_id, game_id)
);

create table if not exists servers (
  id text primary key,
  title text not null,
  detail text not null,
  meta text not null,
  game_id text,
  region text,
  anchors jsonb not null default '[]'::jsonb,
  clan_id text,
  vector double precision[] not null,
  freshness_min double precision not null,
  heat double precision not null,
  skill_center double precision,
  verified boolean not null,
  boost_eligible boolean not null,
  compliance text not null,
  compliance_note text not null,
  fraud_probability double precision not null,
  concurrent_players integer not null default 0,
  peak_players integer not null default 0,
  peak_tracking boolean not null default false,
  sample_count integer not null default 48,
  ordinal integer not null default 0
);

create table if not exists discovery_items (
  id text primary key,
  kind text not null,
  title text not null,
  detail text not null,
  meta text not null,
  game_id text,
  region text,
  anchors jsonb not null default '[]'::jsonb,
  clan_id text,
  vector double precision[] not null,
  freshness_min double precision not null,
  heat double precision not null,
  skill_center double precision,
  verified boolean not null,
  boost_eligible boolean not null,
  compliance text not null,
  compliance_note text not null,
  fraud_probability double precision not null,
  sponsor jsonb,
  ordinal integer not null default 0
);

create table if not exists boost_ledger (
  id text primary key,
  item_id text not null,
  actor_id text not null,
  portal text not null,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  multiplier double precision not null default 3,
  credits_remaining integer not null,
  wallet_owner_id text not null,
  campaign_id text,
  status text not null default 'active'
);

create index if not exists boost_ledger_active_idx on boost_ledger (item_id, status, ends_at);
create index if not exists boost_ledger_actor_idx on boost_ledger (actor_id, status);

create table if not exists ranker_config (
  id text primary key,
  weights jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into ranker_config (id, weights, updated_by) values (
  'global',
  '{"join_server":1.2,"join_lfg":1.15,"open_profile":0.7,"challenge":1,"follow_clan":0.85,"engage_sponsor":0.28}'::jsonb,
  'seed'
)
on conflict (id) do nothing;

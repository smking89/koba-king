-- Anti-cheat guardrail (2026-10-19). KOBA Pulse's catalog (0002) had no
-- verified-result history at all - koba_scores holds the current aggregate,
-- not the per-match events that produced it. This adds the minimal event
-- log needed to compute a rolling baseline per player/metric, plus a
-- review queue. Flagging NEVER auto-penalizes a score or ranking - a
-- flagged row just sits here for a human to look at (see the "an
-- integration submits evidence, KOBA decides" rule) - nothing in this
-- schema or the functions that use it writes to players.score or
-- koba_scores on its own.

create table if not exists player_results (
  id bigserial primary key,
  player_id text not null references players (id),
  game_id text not null,
  metric text not null,               -- e.g. 'kills_per_match' - game-specific, not enumerated here
  value double precision not null,
  recorded_at timestamptz not null default now()
);
create index if not exists player_results_rolling_idx
  on player_results (player_id, game_id, metric, recorded_at desc);

create table if not exists flagged_results (
  id bigserial primary key,
  result_id bigint not null references player_results (id),
  player_id text not null references players (id),
  z_score double precision not null,
  baseline_mean double precision not null,
  baseline_stddev double precision not null,
  sample_size integer not null,
  status text not null default 'pending',   -- 'pending' | 'reviewed_ok' | 'reviewed_confirmed'
  flagged_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
create index if not exists flagged_results_status_idx on flagged_results (status, flagged_at);

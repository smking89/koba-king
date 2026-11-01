-- Real DM schema. One thread per unordered pair of players (the unique index
-- on least/greatest collapses a,b and b,a into the same row regardless of
-- who opened it first), messages append-only under it.
create table if not exists direct_threads (
  id text primary key,
  player_a text not null references players (id) on delete cascade,
  player_b text not null references players (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists direct_threads_pair_idx
  on direct_threads (least(player_a, player_b), greatest(player_a, player_b));

create table if not exists direct_messages (
  id text primary key,
  thread_id text not null references direct_threads (id) on delete cascade,
  author_id text not null references players (id) on delete cascade,
  text text not null default '',
  sticker text,
  pack_title text,
  kind text not null default 'text',
  payload text,
  at timestamptz not null default now()
);
create index if not exists direct_messages_thread_idx on direct_messages (thread_id, at);

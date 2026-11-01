-- Real friends/social graph. Previously `follows`/`blocked`/`followPolicy`
-- lived only in client Zustand state (src/site/ui.ts) - reset on every
-- reload, same class of bug fixed for handle/region in 0012.

create table if not exists follows (
  follower_id text not null references players (id) on delete cascade,
  followee_id text not null references players (id) on delete cascade,
  is_favorite boolean not null default false,
  alias text,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create table if not exists blocks (
  blocker_id text not null references players (id) on delete cascade,
  blocked_id text not null references players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists friend_tags (
  id text primary key,
  owner_id text not null references players (id) on delete cascade,
  label text not null,
  ordinal integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists friend_tag_members (
  tag_id text not null references friend_tags (id) on delete cascade,
  player_id text not null references players (id) on delete cascade,
  primary key (tag_id, player_id)
);

-- Who can send friend requests / group invites / DMs - enforced in
-- social.server.ts and messages.server.ts, not just displayed.
alter table players add column if not exists friend_request_policy text not null default 'everyone';
alter table players add column if not exists group_invite_policy text not null default 'everyone';
alter table players add column if not exists dm_policy text not null default 'everyone';

-- Simple REAL presence: a user-set status plus a heartbeat timestamp the
-- client pings on an interval while the app is open. Deliberately not "rich
-- presence" (no live match/lobby state exists anywhere in this app yet) -
-- faking that text would be exactly the hardcoded-data problem this project
-- has been removing. "Online"/"Away" only renders when the heartbeat is
-- recent; otherwise the UI falls back to "Offline - last seen <time>".
alter table players add column if not exists presence_status text not null default 'online';
alter table players add column if not exists last_seen_at timestamptz;

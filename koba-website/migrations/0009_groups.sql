-- Flat group chats (no Discord-style channels/categories) with a fixed role
-- tier (owner > admin > mod > member) instead of arbitrary custom roles.
create table if not exists groups (
  id text primary key,
  name text not null,
  tag text not null,
  owner_id text not null references players (id) on delete cascade,
  visibility text not null default 'public',
  invite_code text unique,
  avatar_url text,
  banner_url text,
  created_at timestamptz not null default now()
);
create index if not exists groups_invite_code_idx on groups (invite_code);

create table if not exists group_members (
  group_id text not null references groups (id) on delete cascade,
  player_id text not null references players (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

create table if not exists group_messages (
  id text primary key,
  group_id text not null references groups (id) on delete cascade,
  author_id text not null references players (id) on delete cascade,
  text text not null,
  at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on group_messages (group_id, at);

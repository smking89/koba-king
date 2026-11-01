-- Owner-defined clan ranks. `group_members.role` stays the coarse owner/member
-- switch (the owner is never demotable); the clan's own hierarchy lives here so
-- an owner can create ranks, describe them, give each a badge and a permission
-- set, and move members between them.
create table if not exists group_ranks (
  id text primary key,
  group_id text not null references groups (id) on delete cascade,
  name text not null,
  description text not null default '',
  icon text not null default 'shield',
  position integer not null default 10,
  permissions text not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists group_ranks_group_idx on group_ranks (group_id, position desc);

alter table group_members add column if not exists rank_id text references group_ranks (id) on delete set null;

-- Every player can carry a profile banner beside their avatar. Both columns hold
-- a data URL (jpeg/png/gif) uploaded from the profile editor.
alter table players add column if not exists banner_url text;

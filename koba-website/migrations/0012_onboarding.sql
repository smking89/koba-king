-- A short, memorable public tag ("KOBA ID") separate from the internal
-- players.id (which stays the real auth user id - too many FKs to change).
-- Format: K + 4 chars, guaranteed at least one letter/number/symbol across
-- the whole tag - generated once per player in ensurePlayerProfile.
alter table players add column if not exists koba_tag text unique;

-- New accounts need to pick a real handle + region before entering the app
-- (sign-in alone no longer auto-assigns a permanent "steam123..." handle or
-- a default 'NA' region). Existing rows are grandfathered in as onboarded.
alter table players add column if not exists onboarded boolean not null default true;

-- Real avatar from the sign-in provider (Google/X/Steam/Xbox all return one
-- via Better Auth's own "user".image) - was captured into auth's user table
-- but never copied onto the players row the rest of the app actually reads.
alter table players add column if not exists avatar_url text;

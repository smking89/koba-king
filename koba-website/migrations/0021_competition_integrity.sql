-- Competition integrity.
--
-- Two facts decide whether an identity may appear on a board or receive a
-- score update. Both are read server-side only - never taken from the request.
--
--   staff_role  Internal KOBA seat (src/site/roles.ts PLATFORM_ROLES).
--               'player' and 'business' are ordinary accounts; anything with a
--               rank above 0 is staff and is excluded from every board, score
--               and ranking the site renders.
--
--   ingame_role The permission the connector last reported for this identity on
--               the game server: 'none', 'moderator', 'admin' or 'owner'. A
--               holder can award themselves anything in-game, so before KOBA
--               moves a score or recomputes a board, this must be 'none'.
--
-- Both default to the value that keeps an ordinary account eligible, so this
-- migration changes no existing row's behaviour.

alter table players add column if not exists staff_role text not null default 'player';
alter table players add column if not exists ingame_role text not null default 'none';

alter table players drop constraint if exists players_staff_role_known;
alter table players add constraint players_staff_role_known
  check (staff_role in ('player', 'business', 'trainee', 'support', 'mod', 'admin', 'super'));

alter table players drop constraint if exists players_ingame_role_known;
alter table players add constraint players_ingame_role_known
  check (ingame_role in ('none', 'moderator', 'admin', 'owner'));

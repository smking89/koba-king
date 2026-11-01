-- Existing rows already met these conditions before badges were awarded at the
-- action (see awardEarnedBadges in src/lib/badges/badges.server.ts). Grant them
-- silently here so those players do not get a late "just earned" celebration
-- for something they did weeks ago. New awards still fire instantly from the
-- action that earns them.
insert into player_badges (koba_id, badge_id)
select p.id, 'first-contact'
from players p
where p.onboarded
on conflict (koba_id, badge_id) do nothing;

insert into player_badges (koba_id, badge_id)
select p.id, 'linked-up'
from players p
where p.steam_id is not null
   or p.xbox_xuid is not null
   or p.psn_id is not null
   or p.discord_id is not null
   or exists (
     select 1 from "account" a
     where a."userId" = p.id and a."providerId" in ('steam', 'xbox', 'discord')
   )
on conflict (koba_id, badge_id) do nothing;

insert into player_badges (koba_id, badge_id)
select distinct m.player_id, 'trailblazer'
from group_members m
on conflict (koba_id, badge_id) do nothing;

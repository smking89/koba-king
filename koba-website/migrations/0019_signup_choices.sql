-- What the account is for, where the player plays, and which hashtags they
-- follow. Collected during account creation (the onboarding gate) so a new
-- profile is usable the moment it enters the app; existing rows default to a
-- player account on both platforms with no interests picked.
alter table players add column if not exists account_type text not null default 'player';
alter table players add column if not exists platform text not null default 'both';
alter table players add column if not exists interests jsonb not null default '[]'::jsonb;

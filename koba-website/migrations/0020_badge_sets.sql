-- The badge collection becomes one set per account type. Players earn the
-- competitive tracks (rivalry, competition, legend); businesses earn the trade
-- tracks (merchant, operator, patron). `audience` is what keeps the two apart -
-- the profile grid only ever loads the set that matches players.account_type,
-- and nothing on the client can ask for the other one.
--
-- The old 12-badge registry is removed outright: its ids and copy were a
-- different collection, and earned rows cascade with it (player_badges has
-- `on delete cascade`). Only earned rows ever existed, so nothing is lost that
-- the new set does not re-earn from real signals.
alter table badge_registry add column if not exists audience text not null default 'player';
alter table badge_registry add column if not exists track text;
alter table badge_registry add column if not exists rung integer;

delete from badge_registry;

insert into badge_registry (badge_id, audience, track, rung, display_name, description, tier) values
  -- Rivalry: settles scores against the people ahead of you.
  ('rivalry-1', 'player', 'rivalry', 1, 'Grudge', 'Beat 1 rival.', 'bronze'),
  ('rivalry-2', 'player', 'rivalry', 2, 'Rival Hunter', 'Beat 5 rivals.', 'bronze'),
  ('rivalry-3', 'player', 'rivalry', 3, 'Nemesis', 'Beat 15 rivals.', 'silver'),
  ('rivalry-4', 'player', 'rivalry', 4, 'Rival Breaker', 'Beat 40 rivals.', 'gold'),
  ('rivalry-5', 'player', 'rivalry', 5, 'Rival King', 'Beat 100 rivals.', 'gold'),

  -- Competition: events, brackets and finishes.
  ('competition-1', 'player', 'competition', 1, 'Entered', 'Play 1 competition.', 'bronze'),
  ('competition-2', 'player', 'competition', 2, 'Deep Run', 'Finish top 8 of a competition.', 'bronze'),
  ('competition-3', 'player', 'competition', 3, 'Podium', 'Finish top 3 of a competition.', 'silver'),
  ('competition-4', 'player', 'competition', 4, 'Champion', 'Win a competition.', 'gold'),
  ('competition-5', 'player', 'competition', 5, 'Dynasty', 'Win 3 competitions.', 'gold'),

  -- Legend: how much confirmed play is on the account.
  ('legend-1', 'player', 'legend', 1, 'Season Regular', '10 resolved results on record.', 'bronze'),
  ('legend-2', 'player', 'legend', 2, 'Grinder', '50 resolved results on record.', 'bronze'),
  ('legend-3', 'player', 'legend', 3, 'Standard-bearer', '100 resolved results on record.', 'silver'),
  ('legend-4', 'player', 'legend', 4, 'Legend', '250 resolved results on record.', 'gold'),
  ('legend-5', 'player', 'legend', 5, 'Immortal', '500 resolved results on record.', 'gold'),

  -- Merchant: selling through the KOBA shop.
  ('merchant-1', 'business', 'merchant', 1, 'Open', 'Business account live on KOBA.', 'bronze'),
  ('merchant-2', 'business', 'merchant', 2, 'Sold', 'Complete your first order.', 'bronze'),
  ('merchant-3', 'business', 'merchant', 3, 'Trusted', '10 orders with no refund dispute.', 'silver'),
  ('merchant-4', 'business', 'merchant', 4, 'Renowned', '50 orders and 25 reviews at 4.5+.', 'gold'),
  ('merchant-5', 'business', 'merchant', 5, 'Landmark', '100 orders, 50 reviews, 90 days listed.', 'gold'),

  -- Operator: the servers a business keeps online.
  ('operator-1', 'business', 'operator', 1, 'Claimed', 'Link a server to the business.', 'bronze'),
  ('operator-2', 'business', 'operator', 2, 'Online', '7 straight days of reported uptime.', 'bronze'),
  ('operator-3', 'business', 'operator', 3, 'Populated', '50 players online at once.', 'silver'),
  ('operator-4', 'business', 'operator', 4, 'Season', 'A full season of results from your server.', 'gold'),
  ('operator-5', 'business', 'operator', 5, 'Network', '3 live servers or 250 peak players.', 'gold'),

  -- Patron: what the business puts back into the community.
  ('patron-1', 'business', 'patron', 1, 'Sponsor', 'Promote a listing for the first time.', 'bronze'),
  ('patron-2', 'business', 'patron', 2, 'Host', 'Host a competition with confirmed results.', 'bronze'),
  ('patron-3', 'business', 'patron', 3, 'Regular', 'Host 3 competitions in 90 days.', 'silver'),
  ('patron-4', 'business', 'patron', 4, 'Backer', 'Fund a player reward pool.', 'gold'),
  ('patron-5', 'business', 'patron', 5, 'Pillar', '12 months live, 10 events and verified.', 'gold');

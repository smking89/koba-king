-- The KOBA flame badge set carries its own names on the artwork. Rename the
-- registry rows to match so a badge never reads differently from its plate.
-- Badge ids stay stable (player_badges references them).
update badge_registry set display_name = 'Welcome' where badge_id = 'first-contact';
update badge_registry set display_name = 'Connected' where badge_id = 'linked-up';
update badge_registry set display_name = 'Server Hopper' where badge_id = 'server-hopper';
update badge_registry set display_name = 'Explorer' where badge_id = 'world-traveler';
update badge_registry set display_name = 'Dedicated' where badge_id = 'deep-roots';
update badge_registry set display_name = 'First Strike' where badge_id = 'first-blood';
update badge_registry set display_name = 'Connector' where badge_id = 'market-trader';
update badge_registry set display_name = 'Squad Up' where badge_id = 'trailblazer';
update badge_registry set display_name = 'Completionist' where badge_id = 'pinnacle';
update badge_registry set display_name = 'Rampage' where badge_id = 'dominant-streak';
update badge_registry set display_name = 'Icon' where badge_id = 'relic-collector';
update badge_registry set display_name = 'Champion' where badge_id = 'apex-legend';

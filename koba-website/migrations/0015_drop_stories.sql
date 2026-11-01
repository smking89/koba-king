-- Stories were removed: nothing in the app reads or writes them any more.
-- Deployed databases still carry the old table, so drop it here.
drop table if exists stories;

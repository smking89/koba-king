-- Remove the fictional demo catalog that earlier migrations seeded.
--
-- 0002_pulse.sql no longer inserts these rows, but databases that already
-- applied it still hold them. This migration deletes only the known demo ids:
-- real players get auth-provider ids, so they are never touched. Related
-- result/badge/ledger rows go first so the players delete is safe on every
-- backend (PGLite enforces the same foreign keys as Postgres).

delete from flagged_results
where player_id in (
  'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
  'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
);

delete from player_results
where player_id in (
  'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
  'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
);

delete from player_badges
where koba_id in (
  'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
  'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
);

delete from koba_scores
where player_id in (
  'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
  'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
);

delete from boost_ledger
where id = 'led-reno-salt-closed'
  or actor_id in (
    'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
    'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
  );

delete from players
where id in (
  'mara', 'harrow', 'dex', 'sao', 'ysolde', 'kael', 'nora', 'lark', 'pike',
  'moss', 'vex', 'imi', 'june', 'brim', 'reno', 'odel', 'sibley', 'newt'
);

delete from servers
where id in (
  'srv-iron-rust', 'srv-dayz-eu', 'srv-north-squad', 'srv-dust-cs2',
  'srv-val-sea', 'srv-ark-na', 'srv-pal-na', 'srv-rust-na', 'srv-r6-eu',
  'srv-tf2-na', 'srv-hll-eu', 'srv-conan-eu', 'srv-7d-na', 'srv-lol-eu',
  'srv-ghost-rust', 'srv-cold'
);

delete from discovery_items
where id in (
  'lfg-harbor', 'lfg-cs2', 'lfg-val', 'lfg-ark', 'lfg-squad', 'lfg-dayz',
  'prof-dex', 'prof-ysolde', 'prof-nora', 'post-wipe', 'post-rank',
  'ch-rig', 'ch-clans', 'ch-dust', 'clan-north', 'clan-iron', 'clan-salt',
  'list-skin', 'camp-glass', 'camp-harbor', 'camp-night', 'camp-farm'
);

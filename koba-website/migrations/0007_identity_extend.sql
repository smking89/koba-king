-- Extends the real players table (migrations/0002_pulse.sql, migrations/0006_badges.sql)
-- with the moderation/session fields the main site's Identity shape needs
-- (src/platform/engine.ts) that Pulse's own schema never carried, since Pulse
-- was built for a different consumer. See the data-migration plan, Phase 1.
alter table players add column if not exists warnings integer not null default 0;
alter table players add column if not exists strikes integer not null default 0;
alter table players add column if not exists status text not null default 'clear';
alter table players add column if not exists homes jsonb not null default '[]'::jsonb;
alter table players add column if not exists coins integer not null default 0;
alter table players add column if not exists claimed boolean not null default true;

-- No demo-row insert here: migrations/0002_pulse.sql already seeds a real
-- roster (mara/harrow/dex/ysolde/...) - that's the Phase 7 "demo roster as
-- real DB rows" content, already in place before this migration.

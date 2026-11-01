"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const DEFAULTS = require("../config/defaults");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "kobabot.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

// Lightweight migration: CREATE TABLE IF NOT EXISTS above won't retroactively
// add new columns to a giveaways table created before branding fields
// existed. ALTER TABLE ADD COLUMN is safe to attempt repeatedly - it just
// throws "duplicate column" on every run after the first, which we ignore.
const GIVEAWAY_MIGRATION_COLUMNS = [
  "brand_name TEXT NOT NULL DEFAULT 'Giveaways'",
  "logo_url TEXT NOT NULL DEFAULT ''",
  "color_bg TEXT NOT NULL DEFAULT '#07070d'",
  "color_cyan TEXT NOT NULL DEFAULT '#00f0ff'",
  "color_magenta TEXT NOT NULL DEFAULT '#ff2ec4'",
  "color_lime TEXT NOT NULL DEFAULT '#c6ff3d'",
  "fomo_text TEXT NOT NULL DEFAULT 'Entries close the instant the timer hits zero — no extensions, no exceptions.'",
  "footer_text TEXT NOT NULL DEFAULT '© {year} {brand}. All rights reserved.'",
  "youtube_url TEXT NOT NULL DEFAULT ''",
  "media_urls TEXT NOT NULL DEFAULT '[]'",
  // Winner draw + Discord announcement (2026-10-12) - the admin process
  // (admin/server.js) picks and records the winner here; the bot process
  // (index.js, a separate Node process sharing this same SQLite file) polls
  // for drawn-but-not-yet-announced giveaways via utils/backgroundLoops.js
  // and posts the real Discord embed, same bridge pattern vault_heist/
  // cargo_ship_heist already use for their own spawn ticks.
  "winner_entry_id INTEGER",
  "drawn_at INTEGER",
  "announced_at INTEGER",
  "announce_guild_id TEXT NOT NULL DEFAULT ''",
  "announce_channel_id TEXT NOT NULL DEFAULT ''",
];
for (const columnDef of GIVEAWAY_MIGRATION_COLUMNS) {
  try {
    db.exec(`ALTER TABLE giveaways ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  db.exec(`ALTER TABLE premium_users ADD COLUMN active_guild_id TEXT`);
} catch {
  // already exists - fine
}
try {
  // 'pro' | 'max' - both unlock identical features, this only distinguishes
  // billing/display. Every existing row predates the tiered pricing model
  // and was paying for what's now called Pro, so the DEFAULT here
  // (explicit decision, not a guess) keeps every current subscriber's
  // access unchanged.
  db.exec(`ALTER TABLE premium_users ADD COLUMN plan TEXT NOT NULL DEFAULT 'pro'`);
} catch {
  // already exists - fine
}
for (const columnDef of ["channel_id TEXT", "closed_at INTEGER", "archived_at INTEGER"]) {
  try {
    db.exec(`ALTER TABLE support_tickets ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
for (const columnDef of [
  "support_channel_id TEXT",
  "ticket_panel_message_id TEXT",
  "player_count_channel_id TEXT",
  "stats_servers_channel_id TEXT",
  "stats_owners_channel_id TEXT",
  "stats_players_channel_id TEXT",
  "welcome_channel_id TEXT",
  "leaderboard_channel_id TEXT",
  "referral_leaderboard_message_id TEXT",
  "lfg_feed_channel_id TEXT",
  "link_gamertag_channel_id TEXT",
  "referral_claim_channel_id TEXT",
  "create_lfg_channel_id TEXT",
  "kill_feed_channel_id TEXT",
  "lfg_scope TEXT",
  "rcon_host TEXT",
  "rcon_port INTEGER",
  "rcon_password TEXT",
  "autokit_enabled INTEGER NOT NULL DEFAULT 0",
  "announcement_channel_id TEXT",
  "events_channel_id TEXT",
  "admin_feed_channel_id TEXT",
  "claim_kit_channel_id TEXT",
  "trade_channel_id TEXT",
  "gifts_channel_id TEXT",
  "staff_apps_channel_id TEXT",
  "tp_home_enabled INTEGER NOT NULL DEFAULT 0",
  "tp_home_role_id TEXT",
  "auction_channel_id TEXT",
  "shop_channel_id TEXT",
  "marketplace_channel_id TEXT",
  "kit_panel_staff_channel_id TEXT",
  "global_player_count_channel_id TEXT",
  "servers_hub_channel_id TEXT",
  "servers_hub_message_id TEXT",
  "frank_channel_id TEXT",
  "lootbox_channel_id TEXT",
  "lootbox_loss_box_key TEXT",
  "games_panel_channel_id TEXT",
  "games_panel_message_id TEXT",
  "staff_panel_channel_id TEXT",
  "mod_panel_channel_id TEXT",
  "template_key TEXT",
  "combat_lock_enabled INTEGER NOT NULL DEFAULT 0",
  "combat_lock_seconds INTEGER NOT NULL DEFAULT 30",
  // Added 2026-09-07 for /role-setup: lets an owner point the bot's "Staff"
  // permission check at ANY existing Discord role instead of requiring one
  // with that exact bot-created name - see utils/teamAuth.js. (There's no
  // separate faction_leader_role_id - that job was replaced by the rank
  // system itself, see role-setup.js's header comment.)
  "staff_role_id TEXT",
  // Added 2026-09-07: optional per-kill-type channel override - if unset,
  // utils/killFeed.js falls back to the existing single kill_feed_channel_id
  // (fully backward compatible - a guild that never splits these keeps
  // posting every kill to the one channel exactly as before).
  "kill_feed_pvp_channel_id TEXT",
  "kill_feed_pve_channel_id TEXT",
  // Added 2026-09-10 - each role tier's own dedicated navigation-hub channel
  // (config/templates.js's ownerPanel/adminPanel/modPanelNew/playerPanelNew
  // channelDefs, see utils/provisioning.js's matching STAT_CHANNEL_META_FIELDS
  // comment), per explicit user request that each tier get its own category.
  "owner_panel_channel_id TEXT",
  "admin_panel_channel_id TEXT",
  "mod_panel_new_channel_id TEXT",
  "player_panel_new_channel_id TEXT",
  // Added 2026-09-16 - the new Rivals persistent panel (utils/rivalSystem.js's
  // deployRivalPanel), same find-or-repost-by-stored-id pattern as
  // games_panel_channel_id/games_panel_message_id above.
  "rival_panel_channel_id TEXT",
  "rival_panel_message_id TEXT",
  // Added 2026-09-16, per explicit product decision - server owners choose
  // whether to generate the 46 Kit-tier roles (VIP/FreeKit/EliteKit1-44)
  // when applying a template, instead of always getting them. Defaults to
  // 1 (on) so every EXISTING guild that already has these roles keeps
  // them maintained exactly as before - this only changes what a FUTURE
  // /template setup run asks and does. See utils/systemRoles.js's
  // ensureAllSystemRoles.
  "kit_roles_enabled INTEGER NOT NULL DEFAULT 1",
  // Added 2026-09-17 - staff_role_id already let an owner point the Admin
  // clearance check at any existing Discord role (see utils/teamAuth.js);
  // Owner and Mod tier only ever matched a FIXED role name
  // (config/roleColors.js's SYSTEM_ROLE_COLORS.owner/mod) with no override,
  // unlike Admin - /setup-wizard's Roles step now configures all three the
  // same way. See utils/mainPanels.js's isOwnerTier/isModTier.
  "owner_role_id TEXT",
  "mod_role_id TEXT",
]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}

// Same story for lfg_posts/lfg_broadcasts created before 1h auto-expiry and
// per-guild group-chat threads existed - nullable here even though fresh
// installs get NOT NULL via schema.sql, since existing rows have no value
// to backfill (they just won't be picked up by the expiry tick, which is fine).
try {
  db.exec(`ALTER TABLE lfg_posts ADD COLUMN expires_at INTEGER`);
} catch {
  // already exists - fine
}
try {
  // In-game text size for /message-style categories - Unity rich-text
  // convention (same family as <color>), unconfirmed whether RCE's chat
  // renders it (same honesty caveat as colorize() in utils/messageStyle.js).
  db.exec(`ALTER TABLE message_styles ADD COLUMN size_pt INTEGER`);
} catch {
  // already exists - fine
}

// FIXED (2026-09-07): message_styles' original PRIMARY KEY was just
// (guild_id, category) - one row per category, full stop. Too narrow now
// that in-game (rcon.say, <color>/<b> tags) and Discord (embed markdown,
// emoji) need their OWN separate template per category - reported live as
// "in-game shows stars" once emoji started leaking into a shared template.
// SQLite can't ALTER a PRIMARY KEY, so rebuild the table once here. Every
// pre-existing row becomes target='ingame' (that's what it always meant
// before this column existed); 'discord' is a new, purely additive target.
if (!db.prepare(`PRAGMA table_info(message_styles)`).all().some((c) => c.name === "target")) {
  db.exec(`
    CREATE TABLE message_styles_new (
      guild_id         TEXT NOT NULL,
      category         TEXT NOT NULL,
      target           TEXT NOT NULL DEFAULT 'ingame',
      color_hex        TEXT NOT NULL DEFAULT '#00FF00',
      message_template TEXT,
      size_pt          INTEGER,
      PRIMARY KEY (guild_id, category, target)
    );
    INSERT INTO message_styles_new (guild_id, category, target, color_hex, message_template, size_pt)
      SELECT guild_id, category, 'ingame', color_hex, message_template, size_pt FROM message_styles;
    DROP TABLE message_styles;
    ALTER TABLE message_styles_new RENAME TO message_styles;
  `);
}
for (const columnDef of ["claimable INTEGER NOT NULL DEFAULT 0", "claim_cooldown_minutes INTEGER", "required_role_id TEXT", "trade_value REAL", "trade_currency_id INTEGER"]) {
  try {
    db.exec(`ALTER TABLE kit_registry ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Dynamic Adaptive Kit Engine (2026-09-19) - see schema.sql's autokit_mappings
// header for why quickchat_id now holds a free-text chat trigger.
for (const columnDef of [
  "color_hex TEXT",
  "delivery_delay_seconds INTEGER NOT NULL DEFAULT 0",
  "cooldown_minutes INTEGER NOT NULL DEFAULT 0",
  "claim_message_enabled INTEGER NOT NULL DEFAULT 1",
  "cooldown_notice_enabled INTEGER NOT NULL DEFAULT 1",
  "required_role_id TEXT",
  "server_scope TEXT",
  "enabled INTEGER NOT NULL DEFAULT 1",
  // Vehicle/Teleport bindings (2026-09-19) - same engine, same trigger
  // dropdown, same per-binding role requirement/server routing/cooldown
  // fields above; binding_type picks which delivery path
  // utils/autoKitEngine.js takes. For 'vehicle', kit_name holds the
  // vehicle's shortname (config/vehicleShortnames.js) instead of a Rust
  // kit name. For 'teleport', the destination lives in the pre-existing
  // teleport_waypoints/player_homes tables (see their schema.sql headers -
  // this REVIVES that orphaned 2026-09-10-pruned feature rather than
  // re-inventing per-binding coordinate columns) - kit_name holds the
  // compass direction key ("north".."north_west", or "home").
  "binding_type TEXT NOT NULL DEFAULT 'kit'",
  "fuel_amount INTEGER",
]) {
  try {
    db.exec(`ALTER TABLE autokit_mappings ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  // autokit_mappings itself is unused since AutoKit Quickchat was removed
  // (2026-09-10 product pruning pass) - migration left in place per the
  // "don't destroy existing schema/data" rule, harmless either way.
  db.exec(`ALTER TABLE autokit_mappings ADD COLUMN display_name TEXT`);
} catch {
  // already exists - fine
}
try {
  // See database/schema.sql's auctions header - tracks whether a sold
  // auction's reward has actually been delivered yet, so a failed delivery
  // (player offline, etc.) can show a Retry Delivery button instead of
  // silently reporting the purchase as successful with no way to retry.
  db.exec(`ALTER TABLE auctions ADD COLUMN delivered_at INTEGER`);
} catch {
  // already exists - fine
}
for (const columnDef of ["coin_currency_id INTEGER", "coin_min_amount REAL", "coin_max_amount REAL"]) {
  try {
    db.exec(`ALTER TABLE gift_configs ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  // TP Home cooldown tracking - added after player_homes already shipped.
  db.exec(`ALTER TABLE player_homes ADD COLUMN last_tp_at INTEGER`);
} catch {
  // already exists - fine
}
// Combat Event Pipeline (2026-09-13) - extends the pre-existing pvp_kills
// table (shipped for the now-removed killfeed feature, orphaned since -
// zero writers before this) into the new immutable CombatEvent store,
// instead of creating a parallel table, per the pipeline spec's own
// "reuse existing schemas" rule. event_type replaces the old bare is_pvp
// boolean with the full PVP_KILL/PVE_KILL/SUICIDE/FALL/RADIATION/
// UNKNOWN_DEATH enum (is_pvp is kept too, simple derived flag, for any
// existing reader that only cares about that). killer_team_name/
// victim_team_name are a POINT-IN-TIME snapshot of members.team_name at
// the moment of the kill (see utils/combatEvents.js's header for why this
// must never be re-derived from a player's CURRENT team later).
// event_fingerprint + its unique index (below) is what makes ingestion
// idempotent across WebRCON reconnects/bot restarts.
for (const columnDef of [
  "event_type TEXT",
  "killer_team_name TEXT",
  "victim_team_name TEXT",
  "clan_war_id INTEGER",
  "distance REAL",
  "raw_message TEXT",
  "parser_version TEXT",
  "source TEXT NOT NULL DEFAULT 'WEBRCON'",
  "server_name TEXT",
  "event_fingerprint TEXT",
]) {
  try {
    db.exec(`ALTER TABLE pvp_kills ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Partial unique index (NULL fingerprints - i.e. every pre-migration row -
// are excluded from the uniqueness check entirely, so this can never
// collide with old data) - the actual idempotency enforcement mechanism.
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_kills_fingerprint ON pvp_kills (guild_id, event_fingerprint) WHERE event_fingerprint IS NOT NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pvp_kills_guild_time ON pvp_kills (guild_id, killed_at)`);
// Progression System (utils/progression.js) - the XP-per-level curve is
// configurable per guild ("do not hard-code the XP curve") rather than a
// dedicated config table, matching every other simple per-guild scalar
// setting already stored in guild_meta. Unset (NULL) is treated as the
// documented defaults by getXpCurveConfig() below, not by a DB default
// value, so a guild that never touches this gets sane behavior without an
// explicit row.
for (const columnDef of ["xp_curve_base REAL", "xp_curve_growth REAL", "xp_max_level INTEGER", "xp_max_prestige INTEGER"]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Per-source XP/Points award amounts (spec section 4/7: "point values
// should be configurable... do not hard-code these values") - same
// unset-falls-back-to-a-documented-default pattern as the curve fields
// above, read via getXpSourceAmount/getPointsSourceAmount below.
for (const columnDef of [
  "xp_per_game_completion REAL",
  "xp_per_game_win REAL",
  "xp_per_pvp_kill REAL",
  "xp_per_pve_kill REAL",
  "xp_per_challenge_win REAL",
  "points_per_game_completion REAL",
  "points_per_game_win REAL",
  "points_per_pvp_kill REAL",
  "points_per_pve_kill REAL",
  "points_per_challenge_win REAL",
]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Server Rivalry scoring config (spec section 19: "the exact scoring rules
// must be explicit and configurable") - same pattern as the XP/Points
// source amounts above.
for (const columnDef of ["server_rivalry_game_win_points REAL", "server_rivalry_challenge_win_points REAL", "server_rivalry_clan_war_win_points REAL"]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Prison/Jail (Category 6, Phase 2) - single admin-configured jail
// coordinate per guild, see schema.sql's guild_meta header. Same
// unset-is-fine, ALTER-is-safe-to-rerun pattern as every other guild_meta
// column added after that table already shipped.
for (const columnDef of ["jail_x REAL", "jail_y REAL", "jail_z REAL", "jail_set_at INTEGER"]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Base Operations category ID-tracking (2026-10-15) - see schema.sql's
// guild_meta header comment and utils/provisioning.js's CATEGORY_NAME
// comment for why this exists (fixes a real BOOMBOT-branding/duplicate-
// category bug caused by by-name-only category resolution).
try {
  db.exec(`ALTER TABLE guild_meta ADD COLUMN operations_category_id TEXT`);
} catch {
  // already exists - fine
}
// Bot Health monitoring (utils/botHealthAlerts.js) - channel-ID tracking
// for the 3 BOT_ADMIN_TEMPLATE channels that were provisioned but never
// actually wired to anything until now. Kept even though these 3 are no
// longer written to (consolidated into dev_logs_channel_id below,
// 2026-10-15) - dropping SQLite columns is riskier than just leaving them
// unused, and nothing reads them anymore either.
for (const columnDef of ["bot_status_logs_channel_id TEXT", "rcon_health_channel_id TEXT", "error_alerts_channel_id TEXT", "dev_logs_channel_id TEXT"]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// ORP ("ZORP"-style Offline Raid Protection) per-guild admin-configured
// defaults, set via /orp configure - see schema.sql's guild_meta header.
for (const columnDef of ["orp_shape TEXT", "orp_online_color TEXT", "orp_protected_color TEXT", "orp_enter_message TEXT", "orp_leave_message TEXT"]) {
  try {
    db.exec(`ALTER TABLE guild_meta ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// ORP zone shape/box-size snapshot - see schema.sql's orp_zones header.
for (const columnDef of ["shape TEXT NOT NULL DEFAULT 'Sphere'", "box_width REAL", "box_height REAL", "box_length REAL"]) {
  try {
    db.exec(`ALTER TABLE orp_zones ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  // grant_type - see database/schema.sql's comment on tip4serv_packages.
  db.exec(`ALTER TABLE tip4serv_packages ADD COLUMN grant_type TEXT NOT NULL DEFAULT 'server_license'`);
} catch {
  // already exists - fine
}
try {
  // delivered_at - see listPendingTeamInviteDeliveries's header comment.
  db.exec(`ALTER TABLE team_invites ADD COLUMN delivered_at INTEGER`);
} catch {
  // already exists - fine
}
try {
  // pending_rank_syncs - see database/schema.sql's comment on the table.
  db.exec(`CREATE TABLE IF NOT EXISTS pending_rank_syncs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
} catch {
  // already exists - fine
}
try {
  // platform/game - see database/schema.sql's comment on support_tickets.
  db.exec(`ALTER TABLE support_tickets ADD COLUMN platform TEXT`);
} catch {
  // already exists - fine
}
try {
  db.exec(`ALTER TABLE support_tickets ADD COLUMN game TEXT`);
} catch {
  // already exists - fine
}
try {
  // activity_log - see database/schema.sql's comment on the table.
  db.exec(`CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_log_guild ON activity_log(guild_id, created_at DESC)`);
} catch {
  // already exists - fine
}
// Directory listing detail fields - admin-provided (map_type/seed/
// wipe_schedule/tiktok_url/twitch_url/website_url, all set via /directory
// register) plus one bot-measured field (ping_ms - the actual RCON
// request/response round-trip time recorded on every telemetry poll, see
// utils/directoryPanel.js's runDirectoryTelemetryTick - NOT a player's
// client-side ping, which KOBA Bot has no way to measure, but a real,
// honest number rather than a fabricated one).
for (const columnDef of ["map_type TEXT", "seed TEXT", "wipe_schedule TEXT", "tiktok_url TEXT", "twitch_url TEXT", "website_url TEXT", "ping_ms INTEGER"]) {
  try {
    db.exec(`ALTER TABLE directory_servers ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Standalone directory listings - a server can be listed WITHOUT ever
// installing/licensing KOBA Bot at all, just a WebRCON host/port/password
// entered on the website (see admin/dashboard.js's directory-listing
// section) - directory_servers.guild_id stays NOT NULL/UNIQUE (avoiding an
// SQLite full-table-rebuild just to relax that), so a standalone row gets a
// synthetic "web:<uuid>" value there instead of a real Discord guild ID;
// nothing downstream (syncServerCard, buildServerCard) ever tries to fetch
// guild_id as a real Discord guild, so this is safe. rcon_password is
// AES-256-GCM encrypted at rest (utils/secretCrypto.js) since this is the
// one RCON credential in the whole product submitted by the public with no
// other trust boundary (every other RCON credential is guild-owner-entered
// via a Discord slash command already gated behind requirePremiumOwner).
// boombot_id is a distinct, permanent public identifier assigned to EVERY
// listing (guild-linked or standalone) at creation - separate from both
// the row's own auto-increment `id` (shown as the shorter "Server ID" on
// the card) and from guild_id (which a standalone listing doesn't
// meaningfully have).
for (const columnDef of ["owner_discord_id TEXT", "rcon_host TEXT", "rcon_port INTEGER", "rcon_password_encrypted TEXT", "boombot_id TEXT"]) {
  try {
    db.exec(`ALTER TABLE directory_servers ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// map_size is the map's world size in-game (e.g. 3500 = "3.5k") - a fixed
// dropdown of RCE's actual supported sizes (1000-4500), separate from
// map_type (the map's TYPE/name - Procedural, a custom map's name, etc,
// see commands/directory.js's map_type option). Console is capped at 4.5k
// unlike PC Rust, which allows much larger custom sizes.
try {
  db.exec(`ALTER TABLE directory_servers ADD COLUMN map_size INTEGER`);
} catch {
  // already exists - fine
}
// display_server_id - an OPTIONAL owner-entered value (their real in-game/
// platform-assigned server ID players might already know it by), shown on
// the card INSTEAD OF the auto-generated base36 code when set. Distinct
// from both `id` (internal row id, the fallback display) and `boombot_id`
// (KOBA Bot's own permanent identifier) - this is purely a display override.
// platforms - which platform(s) the server is on (Xbox/PlayStation, or
// both) - owner-selected via checkboxes, JSON array same convention as
// `tags`. Only the platform(s) actually chosen render as a badge on the
// card - RCE is cross-play capable, but that doesn't mean every server
// enables both.
for (const columnDef of ["display_server_id TEXT", "platforms TEXT"]) {
  try {
    db.exec(`ALTER TABLE directory_servers ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// owner_username - a custom display name the owner picks at registration
// time, shown on the card instead of their raw Discord username (which is
// what showed there before this - see db.getKnownUsername's previous use
// in admin/serversDirectory.js). verified is staff-toggled only (see the
// new /admin/directory-servers page) - never self-service, hence no field
// for it in either registration form.
for (const columnDef of ["owner_username TEXT", "verified INTEGER NOT NULL DEFAULT 0"]) {
  try {
    db.exec(`ALTER TABLE directory_servers ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// Backfill boombot_id for any row that predates this column (every
// pre-existing guild-registered listing) - new rows get one assigned at
// insert time in upsertDirectoryServer/createStandaloneDirectoryServer
// instead.
for (const row of db.prepare(`SELECT id FROM directory_servers WHERE boombot_id IS NULL`).all()) {
  db.prepare(`UPDATE directory_servers SET boombot_id = ? WHERE id = ?`).run(`srv_${crypto.randomBytes(4).toString("hex")}`, row.id);
}
// Server Achievements (config/serverAchievements.js) - events_hosted_count
// increments on utils/sessionManager.js's createSession, events_completed_count
// on endSession succeeding, both only when the Session's guild_id matches a
// directory_servers row (see incrementDirectoryServerEventsHosted/Completed
// below). Follower count is NOT stored here - it's COUNT(*) FROM
// directory_follows, already a real live table, so no redundant counter for it.
for (const columnDef of ["events_hosted_count INTEGER NOT NULL DEFAULT 0", "events_completed_count INTEGER NOT NULL DEFAULT 0"]) {
  try {
    db.exec(`ALTER TABLE directory_servers ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  // Per-map local kill feed (Multi-Server Cluster - one linked map's own
  // 💀-killfeed channel, distinct from guild_meta.kill_feed_channel_id's
  // guild-wide "every linked map combined" feed) - see utils/killFeed.js.
  db.exec(`ALTER TABLE guild_servers ADD COLUMN kill_feed_channel_id TEXT`);
} catch {
  // already exists - fine
}
try {
  db.exec(`ALTER TABLE zone_events ADD COLUMN joined_user_ids TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // already exists - fine
}
// FIXED (2026-09-10): /create-event-wizard's Box shape (its own X/Y/Z size +
// rotation) was never actually persisted - resolution always fell back to a
// circle win-check against center_x/center_z/radius alone. shape defaults to
// 'Sphere' so pre-existing rows keep resolving exactly as before. server_name
// lets an event resolve against the specific linked Cluster map it was
// created on, instead of always the guild's single default connection.
for (const columnDef of ["shape TEXT NOT NULL DEFAULT 'Sphere'", "box_x REAL", "box_y REAL", "box_z REAL", "rotation REAL NOT NULL DEFAULT 0", "server_name TEXT"]) {
  try {
    db.exec(`ALTER TABLE zone_events ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  db.exec(`ALTER TABLE lfg_broadcasts ADD COLUMN thread_id TEXT`);
} catch {
  // already exists - fine
}
try {
  // 'item'|'role'|'kit'|'material' - existing rows default to 'item' so the
  // admin shop's original raw-Rust-item products keep working unchanged.
  db.exec(`ALTER TABLE shop_products ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'item'`);
} catch {
  // already exists - fine
}
for (const columnDef of ["marketplace_min_price REAL", "marketplace_max_price REAL", "max_wallet_balance REAL"]) {
  try {
    // NULL bounds = marketplace disabled for this currency until an admin
    // sets both via /marketplace-config - a safe default, not "unlimited".
    // max_wallet_balance NULL likewise means uncapped, set via /shop-mint.
    db.exec(`ALTER TABLE shop_currencies ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
// /link overhaul (2026-09-06) - see schema.sql's boom_identities header for
// what each of these means; all nullable, existing identities are simply
// unset until whoever holds them re-links and fills them in.
for (const columnDef of ["account_type TEXT", "username TEXT", "tags TEXT", "kick_url TEXT", "twitch_url TEXT", "tiktok_url TEXT", "instagram_url TEXT"]) {
  try {
    db.exec(`ALTER TABLE boom_identities ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}
try {
  db.exec(`ALTER TABLE teams ADD COLUMN embed_color TEXT`);
} catch {
  // already exists - fine
}
try {
  // Clan tag - added after teams already shipped, used by /clan-config and
  // the Rival VS card.
  db.exec(`ALTER TABLE teams ADD COLUMN clan_tag TEXT`);
} catch {
  // already exists - fine
}
for (const columnDef of [
  // Real kill-tracking (utils/duelTracker.js) replacing the old coin-flip
  // settlement - kill_target is read at Accept time to seed a challenge_duels
  // row; channel_id is where the eventual result gets posted, since a live
  // duel can resolve long after the Accept interaction is gone.
  "kill_target INTEGER NOT NULL DEFAULT 5",
  "channel_id TEXT",
]) {
  try {
    db.exec(`ALTER TABLE challenges ADD COLUMN ${columnDef}`);
  } catch {
    // already exists - fine
  }
}

// ---------------------------------------------------------------------------
// Known users - username -> ID cache, populated by the bot's own
// interactions since only the bot (not the admin web server) can ever see
// what a Discord username actually is.
// ---------------------------------------------------------------------------

function upsertKnownUser(discordId, username) {
  if (!username) return;
  db.prepare(
    `INSERT INTO known_users (discord_id, username, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at`
  ).run(discordId, username, Date.now());
}

/** Case-insensitive exact match, since Discord's current username system is unique and lowercase-normalized. */
function findUserIdByUsername(username) {
  const row = db.prepare(`SELECT discord_id FROM known_users WHERE LOWER(username) = LOWER(?)`).get((username || "").trim());
  return row ? row.discord_id : null;
}

function getKnownUsername(discordId) {
  const row = db.prepare(`SELECT username FROM known_users WHERE discord_id = ?`).get(discordId);
  return row ? row.username : null;
}

// ---------------------------------------------------------------------------
// Premium (Command Tier model) - keyed by Discord USER id, never guild id.
// ---------------------------------------------------------------------------

/**
 * Grants/extends access. BUG FIX (2026-09-02): a fresh grant to a
 * discordId whose PREVIOUS record had already expired used to leave that
 * old record's active_guild_id in place untouched - so re-granting access
 * (e.g. issuing a free trial to someone whose earlier test access lapsed)
 * silently kept them locked to whatever guild that old, expired stint was
 * bound to, showing "Access Active On Another Server" instead of unlocking
 * the new one, with no way out except running /transfer first. Only an
 * ACTIVE (non-expired) record's active_guild_id is preserved now (a
 * legitimate top-up shouldn't rip access away from a currently-running
 * guild) - anything expired gets a clean slate to auto-claim wherever it's
 * used next, same as a brand-new subscriber.
 */
function setPremiumUser(discordId, expiresAt, activatedBy) {
  const existing = getPremiumRecord(discordId);
  const keepGuildBinding = existing && existing.expires_at > Date.now();
  db.prepare(
    `INSERT INTO premium_users (discord_id, expires_at, activated_by, created_at)
     VALUES (@discordId, @expiresAt, @activatedBy, @now)
     ON CONFLICT(discord_id) DO UPDATE SET expires_at = @expiresAt, activated_by = @activatedBy${keepGuildBinding ? "" : ", active_guild_id = NULL"}`
  ).run({ discordId, expiresAt, activatedBy, now: Date.now() });
}

/**
 * Purchase-driven grant: adds `days` on top of whatever time is already
 * remaining (rather than overwriting it like setPremiumUser does for
 * superadmin/trial grants) - buying another 30 days with 10 days left
 * should leave 40, not reset to 30. Stacks from "now" if the license is
 * already expired/unclaimed.
 */
function extendPremiumUser(discordId, days, activatedBy) {
  const record = getPremiumRecord(discordId);
  const base = record && record.expires_at > Date.now() ? record.expires_at : Date.now();
  const expiresAt = base + days * 24 * 60 * 60 * 1000;
  setPremiumUser(discordId, expiresAt, activatedBy);
  return expiresAt;
}

/** Superadmin revoke: expires the token immediately and frees the server slot it was authorizing. */
function revokePremiumUser(discordId) {
  db.prepare(`UPDATE premium_users SET expires_at = ?, active_guild_id = NULL WHERE discord_id = ?`).run(Date.now(), discordId);
}

function listPremiumUsers() {
  return db.prepare(`SELECT * FROM premium_users ORDER BY expires_at DESC`).all();
}

function isPremiumUser(discordId) {
  const row = db.prepare(`SELECT expires_at FROM premium_users WHERE discord_id = ?`).get(discordId);
  if (!row) return false;
  return row.expires_at > Date.now();
}

function getPremiumRecord(discordId) {
  return db.prepare(`SELECT * FROM premium_users WHERE discord_id = ?`).get(discordId) || null;
}

// ---------------------------------------------------------------------------
// Manual multi-license grants (/activate-user, admin dashboard) - see
// database/schema.sql's manual_license_grants header. Independent of, and
// checked ALONGSIDE, the single-license premium_users (Stripe subscription)
// model below - a guild is authorized if EITHER source has a valid license
// claimed by (or claimable for) it.
// ---------------------------------------------------------------------------

/** count=1 (default) grants one license; pass a higher count to grant several INDEPENDENT licenses in one call (e.g. "5 Pro tokens for 5 servers"). expiresAt null = lifetime. Returns the new licenses' ids. */
function grantLicenses(discordId, { plan = "pro", expiresAt = null, grantedBy, note = null, count = 1 } = {}) {
  const now = Date.now();
  const ids = [];
  const stmt = db.prepare(
    `INSERT INTO manual_license_grants (discord_id, plan, expires_at, granted_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < count; i++) {
    ids.push(stmt.run(discordId, plan, expiresAt, grantedBy, note, now).lastInsertRowid);
  }
  return ids;
}

/** Every non-revoked grant for a subscriber, expired or not (admin-facing list view - see them all, not just currently-valid ones). */
function listLicenseGrants(discordId) {
  return db.prepare(`SELECT * FROM manual_license_grants WHERE discord_id = ? AND revoked_at IS NULL ORDER BY created_at ASC`).all(discordId);
}

function revokeLicenseGrant(id) {
  return db.prepare(`UPDATE manual_license_grants SET revoked_at = ?, active_guild_id = NULL WHERE id = ?`).run(Date.now(), id).changes > 0;
}

function activeLicenseGrants(discordId) {
  const now = Date.now();
  return db.prepare(`SELECT * FROM manual_license_grants WHERE discord_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at ASC`).all(discordId, now);
}

/**
 * The single source of truth for "does this guild have access, and to what
 * plan" - checks manual grants FIRST (an admin-granted token), then falls
 * back to the legacy single-license premium_users (Stripe subscription).
 * Auto-claims an unclaimed grant/subscription to this guild on first use,
 * same convention as the original single-license model - a brand new
 * license needs no manual step, moving one to a DIFFERENT guild later still
 * requires /transfer (subscriptions) or a revoke+regrant (manual grants).
 * Returns null if not authorized, otherwise { source, plan, grantId? }.
 */
function getActiveLicenseForGuild(discordId, guildId) {
  const grants = activeLicenseGrants(discordId);
  let claimed = grants.find((g) => g.active_guild_id === guildId);
  if (!claimed) claimed = grants.find((g) => !g.active_guild_id);
  if (claimed) {
    if (!claimed.active_guild_id) db.prepare(`UPDATE manual_license_grants SET active_guild_id = ? WHERE id = ?`).run(guildId, claimed.id);
    return { source: "grant", plan: claimed.plan, grantId: claimed.id };
  }

  const record = getPremiumRecord(discordId);
  if (record && record.expires_at > Date.now()) {
    if (!record.active_guild_id) {
      db.prepare(`UPDATE premium_users SET active_guild_id = ? WHERE discord_id = ?`).run(guildId, discordId);
      return { source: "subscription", plan: record.plan || "pro" };
    }
    if (record.active_guild_id === guildId) return { source: "subscription", plan: record.plan || "pro" };
  }

  return null;
}

/**
 * A license (either kind) is per-server: it authorizes exactly one guild at
 * a time, not every guild the subscriber owns. The first guild a fresh
 * license touches auto-claims it (no manual step needed for a brand-new
 * grant/subscription) - see getActiveLicenseForGuild for the actual claim
 * logic shared with getGuildPlan below.
 */
function isGuildAuthorized(discordId, guildId) {
  return getActiveLicenseForGuild(discordId, guildId) !== null;
}

/** 'basic' if unauthorized, otherwise whichever plan ('pro' | 'max') the authorizing license/subscription is tagged with. */
function getGuildPlan(discordId, guildId) {
  return getActiveLicenseForGuild(discordId, guildId)?.plan || "basic";
}

/** True if the subscriber has a VALID license/subscription somewhere, but none of them authorize this specific guild (all already claimed elsewhere, or the one subscription is bound to a different guild). Used only to pick a friendlier error message - never a security check. */
function isPremiumElsewhere(discordId, guildId) {
  if (isGuildAuthorized(discordId, guildId)) return false;
  if (activeLicenseGrants(discordId).length) return true;
  const record = getPremiumRecord(discordId);
  return !!record && record.expires_at > Date.now() && !!record.active_guild_id && record.active_guild_id !== guildId;
}

/** /transfer - moves an existing license to a new guild the same subscriber owns. Requires an active (non-expired) subscription. */
function transferGuildLicense(discordId, newGuildId) {
  const record = getPremiumRecord(discordId);
  if (!record || record.expires_at <= Date.now()) return { ok: false, reason: "not_premium" };
  db.prepare(`UPDATE premium_users SET active_guild_id = ? WHERE discord_id = ?`).run(newGuildId, discordId);
  return { ok: true, previousGuildId: record.active_guild_id };
}

/**
 * The authoritative "who owns this server" lookup for Server Rivalry
 * (utils/serverRivalry.js) - deliberately NOT Discord's own guild.ownerId
 * (a real KOBA Bot subscriber legitimately runs multiple Discord servers
 * under one licensing account, which is exactly the same-owner conflict
 * the spec requires catching). A guild is "claimed" by whichever
 * subscription or manual license grant currently has it as its
 * active_guild_id - checks the subscription table first, then manual
 * grants, same precedence /manage-licenses already uses elsewhere. Returns
 * null for an unclaimed/unlicensed guild (which is NOT eligible for Server
 * Rivalry at all - see requireEligibleServer in serverRivalry.js).
 */
function getGuildOwnerDiscordId(guildId) {
  const sub = db.prepare(`SELECT discord_id FROM premium_users WHERE active_guild_id = ? AND expires_at > ?`).get(guildId, Date.now());
  if (sub) return sub.discord_id;
  const grant = db.prepare(`SELECT discord_id FROM manual_license_grants WHERE active_guild_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).get(guildId, Date.now());
  return grant?.discord_id || null;
}

// ---------------------------------------------------------------------------
// Guild config (Feature 7 - /set-config overrides, per guild, layered over defaults)
// ---------------------------------------------------------------------------

function getConfig(guildId, setting) {
  const row = db.prepare(`SELECT value FROM guild_config WHERE guild_id = ? AND setting = ?`).get(guildId, setting);
  if (row) return JSON.parse(row.value);
  return DEFAULTS[setting] ?? null;
}

function setConfig(guildId, setting, value) {
  db.prepare(
    `INSERT INTO guild_config (guild_id, setting, value, updated_at)
     VALUES (@guildId, @setting, @value, @now)
     ON CONFLICT(guild_id, setting) DO UPDATE SET value = @value, updated_at = @now`
  ).run({ guildId, setting, value: JSON.stringify(value), now: Date.now() });
}

// ---------------------------------------------------------------------------
// Guild meta (provisioning bookkeeping - Feature 1)
// ---------------------------------------------------------------------------

function getGuildMeta(guildId) {
  return db.prepare(`SELECT * FROM guild_meta WHERE guild_id = ?`).get(guildId) || null;
}

const GUILD_META_FIELDS = [
  "panel_message_id",
  "panel_channel_id",
  "announcement_channel_id",
  "events_channel_id",
  "admin_feed_channel_id",
  "claim_kit_channel_id",
  "trade_channel_id",
  "gifts_channel_id",
  "staff_apps_channel_id",
  "logs_channel_id",
  "team_mgmt_channel_id",
  "support_channel_id",
  "ticket_panel_message_id",
  "player_count_channel_id",
  "stats_servers_channel_id",
  "stats_owners_channel_id",
  "stats_players_channel_id",
  "welcome_channel_id",
  "leaderboard_channel_id",
  "referral_leaderboard_message_id",
  "lfg_feed_channel_id",
  "link_gamertag_channel_id",
  "referral_claim_channel_id",
  "create_lfg_channel_id",
  "kill_feed_channel_id",
  "lfg_scope",
  "rcon_host",
  "rcon_port",
  "rcon_password",
  "auction_channel_id",
  "shop_channel_id",
  "marketplace_channel_id",
  "kit_panel_staff_channel_id",
  "global_player_count_channel_id",
  "servers_hub_channel_id",
  "servers_hub_message_id",
  "frank_channel_id",
  "lootbox_channel_id",
  "lootbox_loss_box_key",
  "games_panel_channel_id",
  "games_panel_message_id",
  "staff_panel_channel_id",
  "mod_panel_channel_id",
  "owner_panel_channel_id",
  "admin_panel_channel_id",
  "mod_panel_new_channel_id",
  "player_panel_new_channel_id",
  "rival_panel_channel_id",
  "rival_panel_message_id",
  "kit_roles_enabled",
  "owner_role_id",
  "mod_role_id",
  "provisioned_at",
  "template_key",
  "staff_role_id",
  "xp_curve_base",
  "xp_curve_growth",
  "xp_max_level",
  "xp_max_prestige",
  "xp_per_game_completion",
  "xp_per_game_win",
  "xp_per_pvp_kill",
  "xp_per_pve_kill",
  "xp_per_challenge_win",
  "points_per_game_completion",
  "points_per_game_win",
  "points_per_pvp_kill",
  "points_per_pve_kill",
  "points_per_challenge_win",
  "server_rivalry_game_win_points",
  "server_rivalry_challenge_win_points",
  "server_rivalry_clan_war_win_points",
  "jail_x",
  "jail_y",
  "jail_z",
  "jail_set_at",
  "operations_category_id",
  "bot_status_logs_channel_id",
  "rcon_health_channel_id",
  "error_alerts_channel_id",
  "dev_logs_channel_id",
  "orp_shape",
  "orp_online_color",
  "orp_protected_color",
  "orp_enter_message",
  "orp_leave_message",
];

function upsertGuildMeta(guildId, fields) {
  const existing = getGuildMeta(guildId);
  const source = existing ? { ...existing, ...fields } : fields;
  const values = { guildId };
  for (const f of GUILD_META_FIELDS) {
    // NOT NULL columns need an explicit fallback here - most upsertGuildMeta()
    // calls across the codebase only ever pass ONE field at a time (e.g. a
    // single channel id during provisioning), so on a brand new guild's very
    // first call (existing is null, source is just that one field) anything
    // without a fallback here would insert an explicit NULL and violate its
    // NOT NULL constraint, crashing that guild's entire provisioning.
    if (f === "provisioned_at") values[f] = source.provisioned_at ?? Date.now();
    else values[f] = source[f] ?? null;
  }

  if (!existing) {
    db.prepare(
      `INSERT INTO guild_meta (guild_id, ${GUILD_META_FIELDS.join(", ")})
       VALUES (@guildId, ${GUILD_META_FIELDS.map((f) => `@${f}`).join(", ")})`
    ).run(values);
  } else {
    db.prepare(
      `UPDATE guild_meta SET ${GUILD_META_FIELDS.map((f) => `${f}=@${f}`).join(", ")} WHERE guild_id=@guildId`
    ).run(values);
  }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function getTeam(guildId, teamName) {
  return db.prepare(`SELECT * FROM teams WHERE guild_id = ? AND team_name = ?`).get(guildId, teamName) || null;
}

function listTeams(guildId) {
  return db.prepare(`SELECT * FROM teams WHERE guild_id = ?`).all(guildId);
}

function createTeam(guildId, teamName, maxTeamSize = DEFAULTS.default_max_team_size) {
  db.prepare(
    `INSERT INTO teams (team_name, guild_id, max_team_size, created_at) VALUES (?, ?, ?, ?)`
  ).run(teamName, guildId, maxTeamSize, Date.now());
  return getTeam(guildId, teamName);
}

function updateTeamFields(guildId, teamName, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE teams SET ${setClause} WHERE guild_id = @guild_id AND team_name = @team_name`).run({
    ...fields,
    guild_id: guildId,
    team_name: teamName,
  });
}

function adjustTeamMaterials(guildId, teamName, deltas) {
  // deltas: { sulfur_cores: -3, emp_capacitors: 1, ... } - additive, can be negative
  const team = getTeam(guildId, teamName);
  if (!team) return null;
  const fields = {};
  for (const [key, delta] of Object.entries(deltas)) {
    fields[key] = Math.max(0, (team[key] || 0) + delta);
  }
  updateTeamFields(guildId, teamName, fields);
  return getTeam(guildId, teamName);
}

/**
 * Permanently deletes a team and every row keyed to it (roster, fireteams,
 * crafting queue, rank name/badge overrides) - the team's Discord side
 * (roles/channels) is untouched, only KOBA Bot's own roster data goes away.
 */
const deleteTeamTxn = db.transaction((guildId, teamName) => {
  db.prepare(`DELETE FROM members WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
  db.prepare(`DELETE FROM fireteams WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
  db.prepare(`DELETE FROM crafting_queue WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
  db.prepare(`DELETE FROM rank_overrides WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
  db.prepare(`DELETE FROM teams WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
});

function deleteTeam(guildId, teamName) {
  deleteTeamTxn(guildId, teamName);
}

// ---------------------------------------------------------------------------
// Rank overrides (Clan Config) - per-team rename/badge on top of the
// built-in registry (config/ranks.js). Absence of a row means "use default".
// ---------------------------------------------------------------------------

function getRankOverride(guildId, teamName, rankId) {
  return db.prepare(`SELECT * FROM rank_overrides WHERE guild_id = ? AND team_name = ? AND rank_id = ?`).get(guildId, teamName, rankId) || null;
}

function listRankOverrides(guildId, teamName) {
  return db.prepare(`SELECT * FROM rank_overrides WHERE guild_id = ? AND team_name = ?`).all(guildId, teamName);
}

function setRankOverride(guildId, teamName, rankId, { customName, badgeUrl } = {}) {
  const existing = getRankOverride(guildId, teamName, rankId);
  const nextCustomName = customName !== undefined ? customName : existing?.custom_name ?? null;
  const nextBadgeUrl = badgeUrl !== undefined ? badgeUrl : existing?.badge_url ?? null;

  if (!nextCustomName && !nextBadgeUrl) {
    // Nothing left to override - same as a reset, keep the table tidy.
    db.prepare(`DELETE FROM rank_overrides WHERE guild_id = ? AND team_name = ? AND rank_id = ?`).run(guildId, teamName, rankId);
    return null;
  }

  db.prepare(
    `INSERT INTO rank_overrides (guild_id, team_name, rank_id, custom_name, badge_url) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, team_name, rank_id) DO UPDATE SET custom_name = excluded.custom_name, badge_url = excluded.badge_url`
  ).run(guildId, teamName, rankId, nextCustomName, nextBadgeUrl);
  return getRankOverride(guildId, teamName, rankId);
}

function clearRankOverride(guildId, teamName, rankId) {
  db.prepare(`DELETE FROM rank_overrides WHERE guild_id = ? AND team_name = ? AND rank_id = ?`).run(guildId, teamName, rankId);
}

/** Full "reset to default clan template" - wipes every rank override for a team. */
function clearAllRankOverrides(guildId, teamName) {
  db.prepare(`DELETE FROM rank_overrides WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
}

// ---------------------------------------------------------------------------
// Members / ranks / fireteams
// ---------------------------------------------------------------------------

function getMember(guildId, discordId) {
  return db.prepare(`SELECT * FROM members WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId) || null;
}

/** Player web dashboard - every team roster this Discord account is on, across every guild, newest guild_name joined in for display. */
function listMembershipsByDiscordId(discordId) {
  return db
    .prepare(
      `SELECT m.*, g.guild_name
       FROM members m
       LEFT JOIN guild_installs g ON g.guild_id = m.guild_id
       WHERE m.discord_id = ?
       ORDER BY m.joined_at DESC`
    )
    .all(discordId);
}

/**
 * Open LFG posts a web dashboard user should see: their own posts always
 * (even before the bot's delivery tick has run - see listPendingLfgDeliveries),
 * plus anything originating in or mirrored into any guild they belong to.
 * Deliberately NOT a global "every LFG post on the whole product" feed -
 * an LFG post is scoped to the communities it's actually visible in, same
 * as it is on the Discord side.
 */
function listVisibleLfgPostsForUser(discordId, guildIds) {
  if (!guildIds.length) {
    return db
      .prepare(`SELECT p.*, g.guild_name FROM lfg_posts p LEFT JOIN guild_installs g ON g.guild_id = p.guild_id WHERE p.status = 'open' AND p.user_id = ? ORDER BY p.created_at DESC`)
      .all(discordId);
  }
  const placeholders = guildIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT DISTINCT p.*, g.guild_name
       FROM lfg_posts p
       LEFT JOIN guild_installs g ON g.guild_id = p.guild_id
       WHERE p.status = 'open'
       AND (
         p.user_id = ?
         OR p.guild_id IN (${placeholders})
         OR p.id IN (SELECT lfg_post_id FROM lfg_broadcasts WHERE guild_id IN (${placeholders}))
       )
       ORDER BY p.created_at DESC`
    )
    .all(discordId, ...guildIds, ...guildIds);
}

function listTeamMembers(guildId, teamName) {
  return db.prepare(`SELECT * FROM members WHERE guild_id = ? AND team_name = ?`).all(guildId, teamName);
}

/** Looks up a rank-registry member by their linked Gamertag, regardless of which team they're on. */
function getMemberByGamertag(guildId, gamertag) {
  return db.prepare(`SELECT * FROM members WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag) || null;
}

/**
 * Cross-guild lookup (the Directory is the one feature that needs it) - a
 * player's /link is normally scoped to one guild's team roster, but a
 * Directory reviewer isn't necessarily rostered on the server they're
 * reviewing. This just needs *a* gamertag they've linked anywhere, since
 * playtime is tracked by gamertag string, not by roster membership.
 */
function getAnyLinkedGamertag(discordId) {
  return db.prepare(`SELECT gamertag FROM members WHERE discord_id = ? AND gamertag IS NOT NULL LIMIT 1`).get(discordId)?.gamertag || null;
}

/** Sets or clears (null) a rostered member's linked Xbox Gamertag / PSN ID. Requires the member row to already exist (they must be on a team). */
function setMemberGamertag(guildId, discordId, gamertag) {
  db.prepare(`UPDATE members SET gamertag = ? WHERE guild_id = ? AND discord_id = ?`).run(gamertag, guildId, discordId);
}

function addMember(guildId, discordId, teamName, rankId = "E1") {
  db.prepare(
    `INSERT INTO members (discord_id, guild_id, team_name, rank_id, joined_at)
     VALUES (@discordId, @guildId, @teamName, @rankId, @now)
     ON CONFLICT(guild_id, discord_id) DO UPDATE SET team_name = @teamName, rank_id = @rankId`
  ).run({ discordId, guildId, teamName, rankId, now: Date.now() });
  return getMember(guildId, discordId);
}

function setMemberRank(guildId, discordId, rankId) {
  db.prepare(`UPDATE members SET rank_id = ? WHERE guild_id = ? AND discord_id = ?`).run(rankId, guildId, discordId);
}

function removeMember(guildId, discordId) {
  db.prepare(`DELETE FROM members WHERE guild_id = ? AND discord_id = ?`).run(guildId, discordId);
}

// ---------------------------------------------------------------------------
// BOOMid - global identity + platform-wide/per-guild bans (see
// database/schema.sql's header comment on boom_identities for the full
// design rationale - ban-evasion resistance via platform-ID uniqueness,
// not just Discord account uniqueness).
// ---------------------------------------------------------------------------

function getBoomIdentityByDiscordId(discordId) {
  return db.prepare(`SELECT * FROM boom_identities WHERE discord_id = ?`).get(discordId) || null;
}

function getBoomIdentityByPlatformId(platformId) {
  return db.prepare(`SELECT * FROM boom_identities WHERE platform_id = ?`).get(platformId) || null;
}

function getBoomIdentity(boomId) {
  return db.prepare(`SELECT * FROM boom_identities WHERE boom_id = ?`).get(boomId) || null;
}

/**
 * Koba-rivals swipe deck pool (admin/rivalsApi.js) - every real, linked,
 * non-banned player identity except the viewer themselves. A real
 * Gamertag/Online ID (platform_id) is required - there's nothing to swipe
 * on or duel against for an identity that never finished /link. Excludes
 * account_type = 'business' (those are server-owner identities, not
 * swipeable rivals). Capped at `limit` and ordered by newest first so a
 * growing table doesn't get selected in one giant unordered scan every
 * request - good enough for now, not meant to be the final pagination
 * story.
 */
function listSwipeablePlayers(excludeDiscordId, limit = 50) {
  return db
    .prepare(
      `SELECT boom_id, discord_id, platform, platform_id, username, tags, created_at
       FROM boom_identities
       WHERE is_banned = 0 AND platform_id IS NOT NULL AND (account_type IS NULL OR account_type != 'business') AND discord_id != ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(excludeDiscordId || "", limit);
}

/** Case-insensitive exact-username lookup, added 2026-09-08 for the website's Messages "search by KOBA Bot ID or username" flow - returns the full identity row (unlike isUsernameAvailable, which only ever needed a boolean). Null if no identity has that username. */
function getBoomIdentityByUsername(username) {
  const trimmed = (username || "").trim();
  if (!trimmed) return null;
  return db.prepare(`SELECT * FROM boom_identities WHERE LOWER(username) = LOWER(?)`).get(trimmed) || null;
}

// FIXED (2026-09-07): every boom_id used to be `boom_` + a full UUID
// regardless of account type - the website's /link form never actually
// distinguished Player vs Business IDs at the format level (the schema
// comment called account_type "cosmetic label only"). Per user request:
// each account type now gets its own short, easy-to-read/type/DM'able ID -
// "PLR-XXXXXXXX" or "BIZ-XXXXXXXX", 8 chars from a charset with the
// visually-confusable 0/O/1/I/L removed (this ID gets manually copy-pasted
// and DMed, unlike an internal-only UUID).
const BOOM_ID_PREFIXES = { player: "PLR", business: "BIZ" };
const BOOM_ID_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateBoomId(accountType) {
  const prefix = BOOM_ID_PREFIXES[accountType] || "PLR";
  let id;
  do {
    let suffix = "";
    for (let i = 0; i < 8; i++) suffix += BOOM_ID_CHARSET[crypto.randomInt(BOOM_ID_CHARSET.length)];
    id = `${prefix}-${suffix}`;
  } while (getBoomIdentity(id));
  return id;
}

/** Case-insensitive uniqueness check for the website's /link form username field - `excludeBoomId` lets an identity re-check its OWN already-saved username as still "available" (editing without changing it shouldn't report a collision with itself). */
function isUsernameAvailable(username, excludeBoomId) {
  const trimmed = (username || "").trim();
  if (!trimmed) return false;
  const row = db.prepare(`SELECT boom_id FROM boom_identities WHERE LOWER(username) = LOWER(?)`).get(trimmed);
  if (!row) return true;
  return row.boom_id === excludeBoomId;
}

/**
 * The actual anti-ban-evasion check, run from utils/linkPanel.js's
 * performLink before any gamertag gets saved. Three outcomes:
 *  - "banned": either this Discord account, or the platform_id being
 *    linked, already belongs to a banned identity - refuse the link entirely.
 *  - "platform_id_taken": the platform_id belongs to a DIFFERENT (not
 *    banned) Discord account already - same "already linked to someone
 *    else" refusal the old per-guild-only check gave, just enforced
 *    globally now instead of per-guild.
 *  - "ok": creates a fresh boom_id if this Discord account has never had
 *    one, or reuses/updates its existing one (covers switching platforms
 *    under the same Discord account).
 */
function upsertBoomIdentityLink(discordId, platform, platformId, accountType) {
  const byDiscord = getBoomIdentityByDiscordId(discordId);
  if (byDiscord?.is_banned) return { outcome: "banned", boomId: byDiscord.boom_id };

  const byPlatform = getBoomIdentityByPlatformId(platformId);
  if (byPlatform) {
    if (byPlatform.is_banned) return { outcome: "banned", boomId: byPlatform.boom_id };
    if (byPlatform.discord_id && byPlatform.discord_id !== discordId) return { outcome: "platform_id_taken", boomId: byPlatform.boom_id };
  }

  if (byDiscord) {
    db.prepare(`UPDATE boom_identities SET platform = ?, platform_id = ? WHERE boom_id = ?`).run(platform, platformId, byDiscord.boom_id);
    return { outcome: "ok", boomId: byDiscord.boom_id };
  }

  const boomId = generateBoomId(accountType);
  db.prepare(`INSERT INTO boom_identities (boom_id, discord_id, platform, platform_id, created_at) VALUES (?, ?, ?, ?, ?)`).run(boomId, discordId, platform, platformId, Date.now());
  return { outcome: "ok", boomId };
}

/**
 * Profile fields collected on the website's /link form (account type,
 * display username, playstyle tags) - separate from upsertBoomIdentityLink
 * itself since these carry no anti-ban-evasion logic, just cosmetic/display
 * data. Called right after a successful upsertBoomIdentityLink, same
 * request. `tags` is stored JSON-encoded; pass an array in, get an array
 * back out (see getBoomIdentity callers - none currently need to parse this
 * themselves elsewhere, but keep the array-in/array-out contract if that
 * changes).
 */
function setBoomIdentityProfile(boomId, { accountType, username, tags, kickUrl, twitchUrl, tiktokUrl, instagramUrl } = {}) {
  const existing = getBoomIdentity(boomId);
  db.prepare(
    `UPDATE boom_identities SET account_type = ?, username = ?, tags = ?, kick_url = ?, twitch_url = ?, tiktok_url = ?, instagram_url = ? WHERE boom_id = ?`
  ).run(
    accountType || null,
    username || null,
    Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null,
    kickUrl !== undefined ? kickUrl || null : existing?.kick_url ?? null,
    twitchUrl !== undefined ? twitchUrl || null : existing?.twitch_url ?? null,
    tiktokUrl !== undefined ? tiktokUrl || null : existing?.tiktok_url ?? null,
    instagramUrl !== undefined ? instagramUrl || null : existing?.instagram_url ?? null,
    boomId
  );
}

/** True once a Discord account has a real, complete BOOMid identity - username, a platform link, and >=4 playstyle tags. Used to gate the website's onboarding wizard (website/src/RequireAuth.jsx). */
function isOnboardingComplete(discordId) {
  const identity = getBoomIdentityByDiscordId(discordId);
  if (!identity || !identity.username || !identity.platform || !identity.platform_id) return false;
  let tags = [];
  try {
    tags = JSON.parse(identity.tags || "[]");
  } catch {
    tags = [];
  }
  return tags.length >= 4;
}

const WEB_MIN_TAGS = 4;
const WEB_ACCOUNT_TYPES = ["player", "business"];
const WEB_PLATFORMS = ["xbox", "playstation", "steam"];

/**
 * Website-only registration completion (2026-09-15) - completeLinkSubmission
 * in utils/linkPanel.js is built assuming the registrant is already
 * rostered on a team in a specific guild (db.getMember(guildId, ...)),
 * which doesn't fit a brand-new website visitor who just did Discord OAuth
 * and has no guild context at all. Same validation (username uniqueness,
 * >=4 tags, one required platform link, ban/duplicate checks via
 * upsertBoomIdentityLink) minus the guild/roster dependency - if they
 * later join a server and run /link there, it recognizes the existing
 * identity via upsertBoomIdentityLink's own "byDiscord" branch instead of
 * creating a second one.
 */
function completeWebRegistration(discordId, { platform, platformId, username, tags, accountType, kickUrl, twitchUrl, tiktokUrl, instagramUrl }) {
  if (!WEB_PLATFORMS.includes(platform)) return { outcome: "invalid_platform" };
  const trimmedPlatformId = (platformId || "").trim();
  if (!trimmedPlatformId) return { outcome: "invalid_platform_id" };

  const trimmedAccountType = (accountType || "").trim().toLowerCase();
  if (!WEB_ACCOUNT_TYPES.includes(trimmedAccountType)) return { outcome: "invalid_account_type" };

  const trimmedUsername = (username || "").trim();
  if (!trimmedUsername) return { outcome: "invalid_username" };

  const cleanTags = (tags || []).map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean);
  if (cleanTags.length < WEB_MIN_TAGS) return { outcome: "invalid_tags" };

  const existingIdentity = getBoomIdentityByDiscordId(discordId);
  if (!isUsernameAvailable(trimmedUsername, existingIdentity?.boom_id)) return { outcome: "username_taken" };

  const linkResult = upsertBoomIdentityLink(discordId, platform, trimmedPlatformId, trimmedAccountType);
  if (linkResult.outcome === "banned") return { outcome: "banned" };
  if (linkResult.outcome === "platform_id_taken") return { outcome: "already_linked_global" };

  setBoomIdentityProfile(linkResult.boomId, {
    accountType: trimmedAccountType,
    username: trimmedUsername,
    tags: cleanTags,
    kickUrl,
    twitchUrl,
    tiktokUrl,
    instagramUrl,
  });

  return { outcome: "ok", boomId: linkResult.boomId };
}

/** Creates a bare identity (discord_id only, no platform linked yet) if one doesn't already exist - lets /ban global target someone who's never run /link, so a ban still blocks any FUTURE link attempt from that Discord account. */
function getOrCreateBoomIdentityByDiscordId(discordId) {
  const existing = getBoomIdentityByDiscordId(discordId);
  if (existing) return existing;
  const boomId = `boom_${crypto.randomUUID()}`;
  db.prepare(`INSERT INTO boom_identities (boom_id, discord_id, created_at) VALUES (?, ?, ?)`).run(boomId, discordId, Date.now());
  return getBoomIdentity(boomId);
}

/** Platform-wide ban/unban - see commands/ban.js's "global" subcommand. Does NOT touch guild_bans (a separate, per-server mechanism). */
function setBoomIdentityBanned(boomId, banned, reason, bannedBy) {
  db.prepare(`UPDATE boom_identities SET is_banned = ?, ban_reason = ?, banned_by = ?, banned_at = ? WHERE boom_id = ?`).run(
    banned ? 1 : 0,
    banned ? reason : null,
    banned ? bannedBy : null,
    banned ? Date.now() : null,
    boomId
  );
}

function logBoomIdentityAccess(boomId, ipAddress) {
  db.prepare(`INSERT INTO boom_identity_access_log (boom_id, ip_address, occurred_at) VALUES (?, ?, ?)`).run(boomId, ipAddress || null, Date.now());
}

/** Has this IP ever been logged against a currently-banned identity (and not this same one)? Best-effort ban-evasion signal for staff review - see admin/dashboard.js's OAuth callback. */
function findBannedIdentityByAccessIp(ipAddress, excludingBoomId) {
  if (!ipAddress) return null;
  return db
    .prepare(
      `SELECT DISTINCT i.* FROM boom_identity_access_log l
       JOIN boom_identities i ON i.boom_id = l.boom_id
       WHERE l.ip_address = ? AND i.is_banned = 1 AND i.boom_id != ?
       LIMIT 1`
    )
    .get(ipAddress, excludingBoomId || "");
}

function flagSuspiciousIp(boomId, matchedBoomId, ipAddress) {
  db.prepare(`INSERT INTO boom_ip_flags (boom_id, matched_boom_id, ip_address, flagged_at) VALUES (?, ?, ?, ?)`).run(boomId, matchedBoomId, ipAddress, Date.now());
}

/** Newest first, joined against both identities' discord_id so /admin/boom-flags can show something more useful than a bare BOOMid. */
function listBoomIpFlags(limit = 50) {
  return db
    .prepare(
      `SELECT f.*, a.discord_id AS discord_id, b.discord_id AS matched_discord_id
       FROM boom_ip_flags f
       LEFT JOIN boom_identities a ON a.boom_id = f.boom_id
       LEFT JOIN boom_identities b ON b.boom_id = f.matched_boom_id
       ORDER BY f.flagged_at DESC
       LIMIT ?`
    )
    .all(limit);
}

// ---------------------------------------------------------------------------
// Website Messages (added 2026-09-08) - see database/schema.sql's
// dm_conversations/dm_messages header for the design rationale (boom_id-
// keyed, not discord_id-keyed).
// ---------------------------------------------------------------------------

/** Deterministic conversation id for a pair of boom_ids - sorted so either participant's own boom_id can be passed first and still resolve to the same row. */
function conversationIdFor(boomIdA, boomIdB) {
  return [boomIdA, boomIdB].sort().join("::");
}

/** Finds an existing DM conversation between two boom_ids, or creates one. Refuses a self-conversation (same boom_id twice) - callers should already guard this, but it's cheap insurance against a malformed request creating a nonsensical row. */
function findOrCreateDmConversation(boomIdA, boomIdB) {
  if (!boomIdA || !boomIdB || boomIdA === boomIdB) return null;
  const id = conversationIdFor(boomIdA, boomIdB);
  const existing = db.prepare(`SELECT * FROM dm_conversations WHERE id = ?`).get(id);
  if (existing) return existing;
  const [a, b] = [boomIdA, boomIdB].sort();
  db.prepare(`INSERT INTO dm_conversations (id, boom_id_a, boom_id_b, created_at) VALUES (?, ?, ?, ?)`).run(id, a, b, Date.now());
  return db.prepare(`SELECT * FROM dm_conversations WHERE id = ?`).get(id);
}

/** One conversation row, or null if this boom_id isn't actually a participant - callers use this as the authorization check before showing a thread (see admin/messages.js). */
function getDmConversationFor(conversationId, boomId) {
  const row = db.prepare(`SELECT * FROM dm_conversations WHERE id = ?`).get(conversationId);
  if (!row || (row.boom_id_a !== boomId && row.boom_id_b !== boomId)) return null;
  return row;
}

/** The OTHER participant's boom_id in a conversation, given one side's own boom_id. */
function otherParticipant(conversation, boomId) {
  return conversation.boom_id_a === boomId ? conversation.boom_id_b : conversation.boom_id_a;
}

/**
 * Inbox list for one boom_id - newest activity first, joined against the
 * other participant's identity (for their display name) and an unread
 * count (messages the OTHER side sent, after this reader's last
 * markDmConversationRead call, i.e. read_at IS NULL on THEIR messages).
 */
function listDmConversations(boomId) {
  return db
    .prepare(
      `SELECT
         c.id, c.created_at, c.last_message_at,
         CASE WHEN c.boom_id_a = ? THEN c.boom_id_b ELSE c.boom_id_a END AS other_boom_id,
         i.username AS other_username,
         (SELECT body FROM dm_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
         (SELECT sender_boom_id FROM dm_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_sender,
         (SELECT COUNT(*) FROM dm_messages WHERE conversation_id = c.id AND sender_boom_id != ? AND read_at IS NULL) AS unread_count
       FROM dm_conversations c
       LEFT JOIN boom_identities i ON i.boom_id = (CASE WHEN c.boom_id_a = ? THEN c.boom_id_b ELSE c.boom_id_a END)
       WHERE c.boom_id_a = ? OR c.boom_id_b = ?
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(boomId, boomId, boomId, boomId, boomId);
}

/** Total unread conversation count for one boom_id - powers the Messages tab-bar badge. Counts CONVERSATIONS with at least one unread message, not raw message count, matching how most inbox badges read. */
function countUnreadDmConversations(boomId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT c.id FROM dm_conversations c
         WHERE (c.boom_id_a = ? OR c.boom_id_b = ?)
           AND EXISTS (SELECT 1 FROM dm_messages m WHERE m.conversation_id = c.id AND m.sender_boom_id != ? AND m.read_at IS NULL)
       )`
    )
    .get(boomId, boomId, boomId).c;
}

/** Messages in a conversation, oldest first - `afterId` (default 0) returns only messages newer than that id, which is what the polling endpoint uses to fetch just what's new since the client's last-seen message. */
function listDmMessages(conversationId, afterId = 0) {
  return db.prepare(`SELECT * FROM dm_messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC`).all(conversationId, afterId);
}

/** Appends a message and bumps the conversation's last_message_at (used for inbox sort order) - caller must have already verified senderBoomId is actually a participant (see getDmConversationFor). */
function sendDmMessage(conversationId, senderBoomId, body) {
  const now = Date.now();
  const result = db.prepare(`INSERT INTO dm_messages (conversation_id, sender_boom_id, body, created_at) VALUES (?, ?, ?, ?)`).run(conversationId, senderBoomId, body, now);
  db.prepare(`UPDATE dm_conversations SET last_message_at = ? WHERE id = ?`).run(now, conversationId);
  return db.prepare(`SELECT * FROM dm_messages WHERE id = ?`).get(result.lastInsertRowid);
}

/** Marks every message the OTHER participant sent in this conversation as read, as of now - see schema.sql's dm_messages header for why this is per-conversation, not per-message. */
function markDmConversationRead(conversationId, readerBoomId) {
  db.prepare(`UPDATE dm_messages SET read_at = ? WHERE conversation_id = ? AND sender_boom_id != ? AND read_at IS NULL`).run(Date.now(), conversationId, readerBoomId);
}

function banFromGuild(guildId, discordId, reason, bannedBy) {
  db.prepare(
    `INSERT INTO guild_bans (guild_id, discord_id, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id) DO UPDATE SET reason = excluded.reason, banned_by = excluded.banned_by, banned_at = excluded.banned_at`
  ).run(guildId, discordId, reason || null, bannedBy, Date.now());
}

function unbanFromGuild(guildId, discordId) {
  db.prepare(`DELETE FROM guild_bans WHERE guild_id = ? AND discord_id = ?`).run(guildId, discordId);
}

function isGuildBanned(guildId, discordId) {
  return !!db.prepare(`SELECT 1 FROM guild_bans WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId);
}

function listGuildBans(guildId) {
  return db.prepare(`SELECT * FROM guild_bans WHERE guild_id = ? ORDER BY banned_at DESC`).all(guildId);
}

// ---------------------------------------------------------------------------
// Link verification tokens + pending role grants (see utils/linkPanel.js's
// sendLinkVerificationDm / runPendingRoleGrantsTick)
// ---------------------------------------------------------------------------

const LINK_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // short-lived - this is a one-time verification link, not a standing session

function createLinkToken(guildId, discordId) {
  const token = crypto.randomUUID();
  db.prepare(`INSERT INTO link_tokens (token, guild_id, discord_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).run(token, guildId, discordId, Date.now(), Date.now() + LINK_TOKEN_EXPIRY_MS);
  return token;
}

function getLinkToken(token) {
  return db.prepare(`SELECT * FROM link_tokens WHERE token = ?`).get(token) || null;
}

function markLinkTokenUsed(token) {
  db.prepare(`UPDATE link_tokens SET used_at = ? WHERE token = ?`).run(Date.now(), token);
}

function queueRoleGrant(guildId, discordId, platform) {
  db.prepare(`INSERT INTO pending_role_grants (guild_id, discord_id, platform, created_at) VALUES (?, ?, ?, ?)`).run(guildId, discordId, platform, Date.now());
}

function listPendingRoleGrants() {
  return db.prepare(`SELECT * FROM pending_role_grants ORDER BY created_at ASC`).all();
}

function clearRoleGrant(id) {
  db.prepare(`DELETE FROM pending_role_grants WHERE id = ?`).run(id);
}

/** See database/schema.sql's comment on activity_log - the real backing data for the website ServerDashboard's activity console (admin/dashboard.js's /api/server-dashboard). */
function logActivity(guildId, title, description) {
  db.prepare(`INSERT INTO activity_log (guild_id, title, description, created_at) VALUES (?, ?, ?, ?)`).run(guildId, title, description || null, Date.now());
}

function listRecentActivity(guildId, limit = 50) {
  return db.prepare(`SELECT * FROM activity_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`).all(guildId, limit);
}

/** See database/schema.sql's comment on pending_rank_syncs / utils/teamPanel.js's runPendingRankSyncTick. */
function queueRankSync(guildId, discordId) {
  db.prepare(`INSERT INTO pending_rank_syncs (guild_id, discord_id, created_at) VALUES (?, ?, ?)`).run(guildId, discordId, Date.now());
}

function listPendingRankSyncs() {
  return db.prepare(`SELECT * FROM pending_rank_syncs ORDER BY created_at ASC`).all();
}

function clearRankSync(id) {
  db.prepare(`DELETE FROM pending_rank_syncs WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Team invites (accept/decline via DM - see utils/teamPanel.js's sendTeamInvite)
// ---------------------------------------------------------------------------

/** `deliveredAt` stays null for a freshly-created invite regardless of caller - the DM is a separate step (see utils/teamPanel.js's sendTeamInvite/deliverTeamInviteDM), marked via markTeamInviteDelivered only once it actually sends. */
function createTeamInvite(guildId, teamName, inviterId, inviteeId, rankId, expiresAt) {
  const info = db
    .prepare(`INSERT INTO team_invites (guild_id, team_name, inviter_id, invitee_id, rank_id, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .run(guildId, teamName, inviterId, inviteeId, rankId, Date.now(), expiresAt);
  return getTeamInvite(info.lastInsertRowid);
}

function getTeamInvite(id) {
  return db.prepare(`SELECT * FROM team_invites WHERE id = ?`).get(id) || null;
}

/** The invitee's own currently-open invite for this guild, if any - blocks a second invite from going out while one's already pending. */
function getPendingTeamInvite(guildId, inviteeId) {
  return db.prepare(`SELECT * FROM team_invites WHERE guild_id = ? AND invitee_id = ? AND status = 'pending'`).get(guildId, inviteeId) || null;
}

function setTeamInviteStatus(id, status) {
  db.prepare(`UPDATE team_invites SET status = ? WHERE id = ?`).run(status, id);
}

function markTeamInviteDelivered(id) {
  db.prepare(`UPDATE team_invites SET delivered_at = ? WHERE id = ?`).run(Date.now(), id);
}

/**
 * Background-loop tick fodder (utils/teamPanel.js's runTeamInviteWebDeliveryTick)
 * - same architecture as listPendingLfgDeliveries: the website process (no
 * live Discord client) can create the invite row via POST
 * /dashboard/api/team/invite, but only the bot process can actually DM the
 * invitee, so it picks up anything still undelivered here. Also catches a
 * Discord-side invite whose initial inline DM attempt failed (invitee had
 * DMs off) - the tick just keeps retrying that one too, bounded by
 * expires_at so it stops trying once the invite goes stale.
 */
function listPendingTeamInviteDeliveries() {
  return db.prepare(`SELECT * FROM team_invites WHERE status = 'pending' AND delivered_at IS NULL AND expires_at > ?`).all(Date.now());
}

function assignFireteamSlot(guildId, fireteamId, teamName, discordId, role) {
  db.prepare(
    `INSERT INTO fireteams (guild_id, fireteam_id, team_name, created_at)
     VALUES (@guildId, @fireteamId, @teamName, @now)
     ON CONFLICT(guild_id, fireteam_id) DO NOTHING`
  ).run({ guildId, fireteamId, teamName, now: Date.now() });
  db.prepare(`UPDATE members SET fireteam_id = ?, fireteam_role = ? WHERE guild_id = ? AND discord_id = ?`).run(
    fireteamId,
    role,
    guildId,
    discordId
  );
}

// ---------------------------------------------------------------------------
// Crafting queue (Feature 5)
// ---------------------------------------------------------------------------

function getQueueEntry(guildId, teamName) {
  return db.prepare(`SELECT * FROM crafting_queue WHERE guild_id = ? AND team_name = ?`).get(guildId, teamName) || null;
}

function pushToQueue(guildId, teamName, bombType, buildTimeMs) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO crafting_queue (guild_id, team_name, bomb_type, started_at, finishes_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(guildId, teamName, bombType, now, now + buildTimeMs);
}

function clearQueue(guildId, teamName) {
  db.prepare(`DELETE FROM crafting_queue WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
}

function listDueQueueEntries() {
  return db.prepare(`SELECT * FROM crafting_queue WHERE finishes_at <= ?`).all(Date.now());
}

// ---------------------------------------------------------------------------
// Zone Events & Component Economy
// ---------------------------------------------------------------------------

function createZoneEvent(guildId, fields) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO zone_events (guild_id, event_name, zone_name, center_x, center_z, radius, color_hex, reward_material, reward_qty, ingame_message, discord_message, status, created_by, created_at, ends_at, shape, box_x, box_y, box_z, rotation, server_name)
       VALUES (@guildId, @eventName, @zoneName, @centerX, @centerZ, @radius, @colorHex, @rewardMaterial, @rewardQty, @ingameMessage, @discordMessage, 'active', @createdBy, @now, @endsAt, @shape, @boxX, @boxY, @boxZ, @rotation, @serverName)`
    )
    .run({
      guildId,
      now,
      shape: "Sphere",
      boxX: null,
      boxY: null,
      boxZ: null,
      rotation: 0,
      serverName: null,
      ...fields,
    });
  return getZoneEvent(info.lastInsertRowid);
}

function getZoneEvent(id) {
  return db.prepare(`SELECT * FROM zone_events WHERE id = ?`).get(id) || null;
}

/** Adds a Discord user id to an event's "joined" list (dedup'd) - read-modify-write since this is a rarely-contended, low-volume click, not a hot path. */
function addEventJoin(eventId, userId) {
  const event = getZoneEvent(eventId);
  if (!event) return [];
  const joined = new Set(JSON.parse(event.joined_user_ids || "[]"));
  joined.add(userId);
  const list = [...joined];
  db.prepare(`UPDATE zone_events SET joined_user_ids = ? WHERE id = ?`).run(JSON.stringify(list), eventId);
  return list;
}

function listActiveZoneEvents(guildId) {
  return db.prepare(`SELECT * FROM zone_events WHERE guild_id = ? AND status = 'active'`).all(guildId);
}

function listDueZoneEvents() {
  return db.prepare(`SELECT * FROM zone_events WHERE status = 'active' AND ends_at <= ?`).all(Date.now());
}

function resolveZoneEvent(id, winnerTeam) {
  db.prepare(`UPDATE zone_events SET status = 'completed', winner_team = ? WHERE id = ?`).run(winnerTeam, id);
}

function cancelZoneEvent(id) {
  db.prepare(`UPDATE zone_events SET status = 'cancelled' WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Referral Reward Engine
// ---------------------------------------------------------------------------

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O/1/I/L - easy to read aloud
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_CODE_TTL_MS = 20 * 60 * 1000; // 20 minutes

function generateReferralCode() {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
  return code;
}

/** Creates a fresh, guaranteed-unique code for this referrer. Single-use by default. */
function createReferralCode(guildId, createdBy, maxUses = 1) {
  let code;
  do {
    code = generateReferralCode();
  } while (db.prepare(`SELECT 1 FROM referral_codes WHERE code = ?`).get(code));

  const now = Date.now();
  db.prepare(
    `INSERT INTO referral_codes (code, guild_id, created_by, max_uses, uses, expires_at, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run(code, guildId, createdBy, maxUses, now + REFERRAL_CODE_TTL_MS, now);
  return getReferralCode(code);
}

function getReferralCode(code) {
  return db.prepare(`SELECT * FROM referral_codes WHERE code = ?`).get(code.toUpperCase()) || null;
}

/** Redeems a code: validates freshness/use-count, records the claim, bumps the use counter. Returns the claim row, or null if invalid. */
function redeemReferralCode(code, claimedBy) {
  const record = getReferralCode(code);
  if (!record) return { error: "not_found" };
  if (record.expires_at <= Date.now()) return { error: "expired" };
  if (record.uses >= record.max_uses) return { error: "exhausted" };
  if (record.created_by === claimedBy) return { error: "self_referral" };

  const now = Date.now();
  db.prepare(`UPDATE referral_codes SET uses = uses + 1 WHERE code = ?`).run(record.code);
  db.prepare(
    `INSERT INTO referral_claims (code, guild_id, referrer_id, claimed_by, claimed_at) VALUES (?, ?, ?, ?, ?)`
  ).run(record.code, record.guild_id, record.created_by, claimedBy, now);
  return { ok: true, referrerId: record.created_by };
}

function getReferralConfig(guildId) {
  return db.prepare(`SELECT * FROM referral_config WHERE guild_id = ?`).get(guildId) || null;
}

function setReferralWelcomeGift(guildId, { welcomeKit, welcomeRoleId, welcomeRoleTempHours }) {
  db.prepare(
    `INSERT INTO referral_config (guild_id, welcome_kit, welcome_role_id, welcome_role_temp_hours)
     VALUES (@guildId, @welcomeKit, @welcomeRoleId, @welcomeRoleTempHours)
     ON CONFLICT(guild_id) DO UPDATE SET welcome_kit=@welcomeKit, welcome_role_id=@welcomeRoleId, welcome_role_temp_hours=@welcomeRoleTempHours`
  ).run({ guildId, welcomeKit: welcomeKit ?? null, welcomeRoleId: welcomeRoleId ?? null, welcomeRoleTempHours: welcomeRoleTempHours ?? null });
}

function setLeaderboardReward(guildId, period, place, { rewardType, kitName, roleId, roleTempHours }) {
  db.prepare(
    `INSERT INTO referral_leaderboard_rewards (guild_id, period, place, reward_type, kit_name, role_id, role_temp_hours)
     VALUES (@guildId, @period, @place, @rewardType, @kitName, @roleId, @roleTempHours)
     ON CONFLICT(guild_id, period, place) DO UPDATE SET reward_type=@rewardType, kit_name=@kitName, role_id=@roleId, role_temp_hours=@roleTempHours`
  ).run({ guildId, period, place, rewardType, kitName: kitName ?? null, roleId: roleId ?? null, roleTempHours: roleTempHours ?? null });
}

function listLeaderboardRewards(guildId, period) {
  return db.prepare(`SELECT * FROM referral_leaderboard_rewards WHERE guild_id = ? AND period = ? ORDER BY place`).all(guildId, period);
}

/** Referral counts within [since, until), highest first. */
function getReferralLeaderboard(guildId, since, until = Date.now(), limit = 10) {
  return db
    .prepare(
      `SELECT referrer_id, COUNT(*) AS referrals FROM referral_claims
       WHERE guild_id = ? AND claimed_at >= ? AND claimed_at < ?
       GROUP BY referrer_id ORDER BY referrals DESC LIMIT ?`
    )
    .all(guildId, since, until, limit);
}

/** Player web dashboard - all-time referral counts for this Discord account, grouped per guild they've referred people into. */
function getReferralStatsByDiscordId(discordId) {
  const perGuild = db
    .prepare(
      `SELECT rc.guild_id, g.guild_name, COUNT(*) AS referrals
       FROM referral_claims rc
       LEFT JOIN guild_installs g ON g.guild_id = rc.guild_id
       WHERE rc.referrer_id = ?
       GROUP BY rc.guild_id ORDER BY referrals DESC`
    )
    .all(discordId);
  const total = perGuild.reduce((sum, r) => sum + r.referrals, 0);
  return { total, perGuild };
}

function addTempRoleGrant(guildId, userId, roleId, expiresAt) {
  db.prepare(
    `INSERT INTO temp_role_grants (guild_id, user_id, role_id, granted_at, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).run(guildId, userId, roleId, Date.now(), expiresAt);
}

function listDueTempRoleGrants() {
  return db.prepare(`SELECT * FROM temp_role_grants WHERE expires_at <= ?`).all(Date.now());
}

function removeTempRoleGrant(id) {
  db.prepare(`DELETE FROM temp_role_grants WHERE id = ?`).run(id);
}

/** Distinct role IDs with at least one still-active (not-yet-expired) grant in this guild - used by /setup-template's pre-switch wipe to leave temporary reward roles alone rather than deleting a role out from under someone who's still holding it. */
function listActiveTempRoleIds(guildId) {
  return db.prepare(`SELECT DISTINCT role_id FROM temp_role_grants WHERE guild_id = ? AND expires_at > ?`).all(guildId, Date.now()).map((r) => r.role_id);
}

/** Looks up an active (not-yet-expired) temp grant for a specific user+role - used by /player-panel's role trade to know whether there's a remaining expiry to carry over. */
function getTempRoleGrant(guildId, userId, roleId) {
  return db.prepare(`SELECT * FROM temp_role_grants WHERE guild_id = ? AND user_id = ? AND role_id = ? AND expires_at > ?`).get(guildId, userId, roleId, Date.now()) || null;
}

/** Moves a temp role grant to a new holder, keeping the same expires_at - "if the cooldown timer is still going it respects it" rather than resetting the clock for whoever receives the role. */
function transferTempRoleGrant(guildId, fromUserId, toUserId, roleId) {
  db.prepare(`UPDATE temp_role_grants SET user_id = ? WHERE guild_id = ? AND user_id = ? AND role_id = ?`).run(toUserId, guildId, fromUserId, roleId);
}

// ---------------------------------------------------------------------------
// Gifts (/gift-config) - welcome + recurring daily/weekly/monthly/yearly drops.
// ---------------------------------------------------------------------------

function setGiftConfig(guildId, giftType, fields) {
  db.prepare(
    `INSERT INTO gift_configs (guild_id, gift_type, reward_type, kit_name, role_id, role_temp_hours, coin_currency_id, coin_min_amount, coin_max_amount, message_text, enabled)
     VALUES (@guildId, @giftType, @rewardType, @kitName, @roleId, @roleTempHours, @coinCurrencyId, @coinMinAmount, @coinMaxAmount, @messageText, 1)
     ON CONFLICT(guild_id, gift_type) DO UPDATE SET
       reward_type = excluded.reward_type, kit_name = excluded.kit_name, role_id = excluded.role_id,
       role_temp_hours = excluded.role_temp_hours, coin_currency_id = excluded.coin_currency_id,
       coin_min_amount = excluded.coin_min_amount, coin_max_amount = excluded.coin_max_amount,
       message_text = excluded.message_text, enabled = 1`
  ).run({ guildId, giftType, kitName: null, roleId: null, roleTempHours: null, coinCurrencyId: null, coinMinAmount: null, coinMaxAmount: null, messageText: null, ...fields });
}

function getGiftConfig(guildId, giftType) {
  return db.prepare(`SELECT * FROM gift_configs WHERE guild_id = ? AND gift_type = ?`).get(guildId, giftType) || null;
}

function listGiftConfigs(guildId) {
  return db.prepare(`SELECT * FROM gift_configs WHERE guild_id = ? ORDER BY gift_type ASC`).all(guildId);
}

function setGiftEnabled(guildId, giftType, enabled) {
  db.prepare(`UPDATE gift_configs SET enabled = ? WHERE guild_id = ? AND gift_type = ?`).run(enabled ? 1 : 0, guildId, giftType);
}

function hasClaimedGift(guildId, giftType, periodStart, userId) {
  return !!db.prepare(`SELECT 1 FROM gift_claims WHERE guild_id = ? AND gift_type = ? AND period_start = ? AND user_id = ?`).get(guildId, giftType, periodStart, userId);
}

function recordGiftClaim(guildId, giftType, periodStart, userId) {
  db.prepare(`INSERT OR IGNORE INTO gift_claims (guild_id, gift_type, period_start, user_id, claimed_at) VALUES (?, ?, ?, ?, ?)`).run(guildId, giftType, periodStart, userId, Date.now());
}

/**
 * Explicit allowlist of Discord roles players are allowed to give away via
 * /player-panel - empty by default, so nothing (Owner/Admin/Mod/Xbox/
 * PlayStation/anything else) is tradable until an admin opts a specific
 * role in. Stored via the generic guild_config store (a plain JSON array),
 * no dedicated table needed for something this small.
 */
function getTradeableRoleIds(guildId) {
  const row = db.prepare(`SELECT value FROM guild_config WHERE guild_id = ? AND setting = 'tradeable_role_ids'`).get(guildId);
  return row ? JSON.parse(row.value) : [];
}

function addTradeableRole(guildId, roleId) {
  const ids = new Set(getTradeableRoleIds(guildId));
  ids.add(roleId);
  setConfig(guildId, "tradeable_role_ids", [...ids]);
}

function removeTradeableRole(guildId, roleId) {
  const ids = getTradeableRoleIds(guildId).filter((id) => id !== roleId);
  setConfig(guildId, "tradeable_role_ids", ids);
}

/** War wins per team within [since, until), highest first. */
function getClanWarLeaderboard(guildId, since, until = Date.now(), limit = 10) {
  return db
    .prepare(
      `SELECT winner AS team_name, COUNT(*) AS wins FROM wars
       WHERE guild_id = ? AND status = 'ended' AND winner IS NOT NULL AND ended_at >= ? AND ended_at < ?
       GROUP BY winner ORDER BY wins DESC LIMIT ?`
    )
    .all(guildId, since, until, limit);
}

/** Zone-event wins per team within [since, until), highest first. */
function getEventWinLeaderboard(guildId, since, until = Date.now(), limit = 10) {
  return db
    .prepare(
      `SELECT winner_team AS team_name, COUNT(*) AS wins FROM zone_events
       WHERE guild_id = ? AND status = 'completed' AND winner_team IS NOT NULL AND ends_at >= ? AND ends_at < ?
       GROUP BY winner_team ORDER BY wins DESC LIMIT ?`
    )
    .all(guildId, since, until, limit);
}

/** PvP kills per gamertag within [since, until), highest first - restored 2026-10-18 alongside utils/killfeedEngine.js (see that file's header for why the old removal reasoning no longer blocks this). Same {killer_gamertag, kills} shape categoryLeaderboards.js's normalizeEntry() already expects. */
function getPvpKillLeaderboard(guildId, since, until = Date.now(), limit = 10) {
  return db
    .prepare(
      `SELECT killer_gamertag, COUNT(*) AS kills FROM pvp_kills
       WHERE guild_id = ? AND event_type = 'PVP_KILL' AND killer_gamertag IS NOT NULL AND killed_at >= ? AND killed_at < ?
       GROUP BY killer_gamertag ORDER BY kills DESC LIMIT ?`
    )
    .all(guildId, since, until, limit);
}

/** PvE kills (player killed an NPC) per gamertag within [since, until), highest first. */
function getPveKillLeaderboard(guildId, since, until = Date.now(), limit = 10) {
  return db
    .prepare(
      `SELECT killer_gamertag, COUNT(*) AS kills FROM pvp_kills
       WHERE guild_id = ? AND event_type = 'PVE_KILL' AND killer_gamertag IS NOT NULL AND killed_at >= ? AND killed_at < ?
       GROUP BY killer_gamertag ORDER BY kills DESC LIMIT ?`
    )
    .all(guildId, since, until, limit);
}

// ---------------------------------------------------------------------------
// Combat Event Pipeline (utils/combatEvents.js, rcon/combatParser.js)
// ---------------------------------------------------------------------------

/** Backfills a raw numeric platform/net id -> gamertag pairing from a "has entered the game" join line. Last-write-wins (a gamertag can rotate which platform id it's currently associated with across sessions). */
function upsertPlatformId(guildId, platformId, gamertag) {
  db.prepare(
    `INSERT INTO player_platform_ids (guild_id, platform_id, gamertag, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, platform_id) DO UPDATE SET gamertag = excluded.gamertag, updated_at = excluded.updated_at`
  ).run(guildId, platformId, gamertag, Date.now());
}

/** Resolves a raw numeric platform id seen in a kill line back to the real gamertag it was last paired with on join - null if never seen (falls back to showing the bare id honestly, never guessed). */
function getGamertagByPlatformId(guildId, platformId) {
  return db.prepare(`SELECT gamertag FROM player_platform_ids WHERE guild_id = ? AND platform_id = ?`).get(guildId, platformId)?.gamertag || null;
}

/**
 * Inserts one immutable CombatEvent row. Idempotent via the partial unique
 * index on (guild_id, event_fingerprint) - see database/schema.sql's
 * comment on pvp_kills. Returns { inserted: true, id } on a genuinely new
 * event, or { inserted: false, id: null } when the fingerprint already
 * exists (a WebRCON reconnect/duplicate packet/restart replay) - callers
 * MUST skip all downstream processing (streaks, clan war stats, event bus
 * publication) when inserted is false, or a duplicate would double-count.
 */
function insertCombatEvent(event) {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO pvp_kills
         (guild_id, killer_gamertag, victim_gamertag, weapon, is_pvp, killed_at,
          event_type, killer_team_name, victim_team_name, clan_war_id, distance,
          raw_message, parser_version, source, server_name, event_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.guildId,
      event.killerGamertag || null,
      event.victimGamertag || null,
      event.weapon || null,
      event.eventType === "PVP_KILL" ? 1 : 0,
      event.killedAt,
      event.eventType,
      event.killerTeamName || null,
      event.victimTeamName || null,
      event.clanWarId || null,
      event.distance ?? null,
      event.rawMessage,
      event.parserVersion,
      event.source || "WEBRCON",
      event.serverName || null,
      event.eventFingerprint
    );
  return { inserted: info.changes > 0, id: info.changes > 0 ? info.lastInsertRowid : null };
}

function getCombatEvent(guildId, id) {
  return db.prepare(`SELECT * FROM pvp_kills WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

/** Player web dashboard - lifetime PvP kills/deaths for one linked gamertag. is_pvp = 1 excludes PvE/suicide/fall/radiation deaths from both sides, matching the is_pvp semantics documented on the pvp_kills table itself. */
function getPvpStatsForGamertag(guildId, gamertag) {
  const kills = db.prepare(`SELECT COUNT(*) AS n FROM pvp_kills WHERE guild_id = ? AND killer_gamertag = ? AND is_pvp = 1`).get(guildId, gamertag).n;
  const deaths = db.prepare(`SELECT COUNT(*) AS n FROM pvp_kills WHERE guild_id = ? AND victim_gamertag = ? AND is_pvp = 1`).get(guildId, gamertag).n;
  return { kills, deaths };
}

/** Player web dashboard "Recent Activity" row - this gamertag's last few PvP events (as killer or victim), newest first. Real combat-log rows, not synthesized "session" data (no session-tracking feature exists). */
function getRecentPvpEventsForGamertag(guildId, gamertag, limit = 6) {
  return db
    .prepare(
      `SELECT * FROM pvp_kills WHERE guild_id = ? AND is_pvp = 1 AND (killer_gamertag = ? OR victim_gamertag = ?) ORDER BY killed_at DESC LIMIT ?`
    )
    .all(guildId, gamertag, gamertag, limit);
}

function getPvpStreak(guildId, gamertag) {
  return db.prepare(`SELECT * FROM pvp_streaks WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag) || { guild_id: guildId, gamertag, current_streak: 0, best_streak: 0 };
}

/** A confirmed PvP or PvE kill by this gamertag - bumps current_streak and best_streak (never decreases). */
function bumpKillStreak(guildId, gamertag) {
  db.prepare(
    `INSERT INTO pvp_streaks (guild_id, gamertag, current_streak, best_streak) VALUES (?, ?, 1, 1)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET
       current_streak = current_streak + 1,
       best_streak = MAX(best_streak, current_streak + 1)`
  ).run(guildId, gamertag);
  return getPvpStreak(guildId, gamertag);
}

/** A confirmed player death (victim side of any kill event) - resets current_streak to 0, leaves best_streak untouched. */
function resetKillStreak(guildId, gamertag) {
  db.prepare(
    `INSERT INTO pvp_streaks (guild_id, gamertag, current_streak, best_streak) VALUES (?, ?, 0, 0)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET current_streak = 0`
  ).run(guildId, gamertag);
}

// ---------------------------------------------------------------------------
// Nemesis/Rivalry tracking (utils/killfeedEngine.js) - see pvp_rivalries'
// schema.sql header for the row-lifecycle rules (why a broken streak
// deletes the row instead of resetting it to 0).
// ---------------------------------------------------------------------------

const NEMESIS_THRESHOLD = 3;

/** Attacker landed another unanswered kill on victim - bumps the streak and flags is_nemesis once NEMESIS_THRESHOLD is reached. Returns the updated row. */
function bumpRivalry(guildId, attackerGamertag, victimGamertag) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO pvp_rivalries (guild_id, attacker_gamertag, victim_gamertag, consecutive_kills, is_nemesis, updated_at)
     VALUES (?, ?, ?, 1, 0, ?)
     ON CONFLICT(guild_id, attacker_gamertag, victim_gamertag) DO UPDATE SET
       consecutive_kills = consecutive_kills + 1,
       updated_at = excluded.updated_at`
  ).run(guildId, attackerGamertag, victimGamertag, now);
  const row = db.prepare(`SELECT * FROM pvp_rivalries WHERE guild_id = ? AND attacker_gamertag = ? AND victim_gamertag = ?`).get(guildId, attackerGamertag, victimGamertag);
  if (row && row.consecutive_kills >= NEMESIS_THRESHOLD && !row.is_nemesis) {
    db.prepare(`UPDATE pvp_rivalries SET is_nemesis = 1 WHERE guild_id = ? AND attacker_gamertag = ? AND victim_gamertag = ?`).run(guildId, attackerGamertag, victimGamertag);
    row.is_nemesis = 1;
  }
  return row;
}

/** Victim just killed their attacker back - if attacker was flagged as victim's nemesis, this is a "NEMESIS DOWN" moment (the caller checks the returned row's is_nemesis BEFORE this deletes it). Always clears the reverse-direction row (the streak is broken either way). */
function clearRivalry(guildId, attackerGamertag, victimGamertag) {
  const row = db.prepare(`SELECT * FROM pvp_rivalries WHERE guild_id = ? AND attacker_gamertag = ? AND victim_gamertag = ?`).get(guildId, attackerGamertag, victimGamertag) || null;
  db.prepare(`DELETE FROM pvp_rivalries WHERE guild_id = ? AND attacker_gamertag = ? AND victim_gamertag = ?`).run(guildId, attackerGamertag, victimGamertag);
  return row;
}

// ---------------------------------------------------------------------------
// Elo-style rating (utils/killfeedEngine.js)
// ---------------------------------------------------------------------------

const ELO_DEFAULT_RATING = 1000;

function getEloRating(guildId, gamertag) {
  return db.prepare(`SELECT rating FROM pvp_elo WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag)?.rating ?? ELO_DEFAULT_RATING;
}

function setEloRating(guildId, gamertag, rating) {
  db.prepare(
    `INSERT INTO pvp_elo (guild_id, gamertag, rating) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET rating = excluded.rating`
  ).run(guildId, gamertag, rating);
}

/**
 * Koba-rivals (admin/rivalsApi.js) needs ONE score/streak per gamertag, but
 * Elo and streaks are tracked per-guild (one number per linked Rust
 * server) - there is no unified global rating yet (see the ranking
 * recommendation given alongside this). Stopgap, not a redesign: reports
 * the highest real rating/streak this gamertag has on ANY guild it's
 * been active on, rather than fabricating a blended number. Null fields
 * (never played anywhere tracked) read as the honest defaults.
 */
function getBestKnownEloRating(gamertag) {
  const row = db.prepare(`SELECT MAX(rating) AS rating FROM pvp_elo WHERE gamertag = ?`).get(gamertag);
  return row?.rating ?? ELO_DEFAULT_RATING;
}

function getBestKnownPvpStreak(gamertag) {
  const row = db.prepare(`SELECT MAX(current_streak) AS streak FROM pvp_streaks WHERE gamertag = ?`).get(gamertag);
  return row?.streak ?? 0;
}

function getEloLeaderboard(guildId, limit = 10) {
  return db.prepare(`SELECT gamertag, rating FROM pvp_elo WHERE guild_id = ? ORDER BY rating DESC LIMIT ?`).all(guildId, limit);
}

// ---------------------------------------------------------------------------
// KOBA Score (utils/kobaScore.js) - global, Challenge-outcome-driven rating.
// See schema.sql's koba_scores header for how this differs from pvp_elo above.
// ---------------------------------------------------------------------------

function getKobaScore(discordId) {
  return db.prepare(`SELECT * FROM koba_scores WHERE discord_id = ?`).get(discordId) || { discord_id: discordId, rating: ELO_DEFAULT_RATING, wins: 0, losses: 0, updated_at: null };
}

/** Applies a settled Challenge's result to both players' global KOBA Score in one go - `ratingDelta` is the winner's gain (computed by utils/kobaScore.js, same symmetric Elo convention as pvp_elo: loser's rating drops by the exact same amount). */
function applyKobaScoreResult(winnerId, loserId, winnerRatingBefore, loserRatingBefore, ratingDelta) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO koba_scores (discord_id, rating, wins, losses, updated_at) VALUES (?, ?, 1, 0, ?)
     ON CONFLICT(discord_id) DO UPDATE SET rating = ?, wins = wins + 1, updated_at = ?`
  ).run(winnerId, winnerRatingBefore + ratingDelta, now, winnerRatingBefore + ratingDelta, now);
  db.prepare(
    `INSERT INTO koba_scores (discord_id, rating, wins, losses, updated_at) VALUES (?, ?, 0, 1, ?)
     ON CONFLICT(discord_id) DO UPDATE SET rating = ?, losses = losses + 1, updated_at = ?`
  ).run(loserId, loserRatingBefore - ratingDelta, now, loserRatingBefore - ratingDelta, now);
}

/** Global leaderboard - no guild_id to scope by, this is the one cross-server ranking. */
function getKobaScoreLeaderboard(limit = 10) {
  return db.prepare(`SELECT discord_id, rating, wins, losses FROM koba_scores ORDER BY rating DESC LIMIT ?`).all(limit);
}

// ---------------------------------------------------------------------------
// Player-level Basic/Pro/Max plan (config/playerPlans.js) - see
// schema.sql's player_subscriptions header for how this differs from
// utils/premium.js's guild-owner plan.
// ---------------------------------------------------------------------------

/** 'basic' for a row that's missing, expired, or never set - the honest free default, never trusts a client-sent plan. */
function getPlayerPlan(discordId) {
  const row = db.prepare(`SELECT * FROM player_subscriptions WHERE discord_id = ?`).get(discordId);
  if (!row) return "basic";
  if (row.expires_at && row.expires_at < Date.now()) return "basic";
  return row.plan;
}

/** Admin grant - no payment flow wired to this yet (see schema.sql's comment). `expiresAt` null = doesn't expire. Sets first_subscribed_at exactly once, the first time this discord_id ever holds a paid plan - never overwritten on a later change, so config/subBadges.js's tenure badges track real total membership time. */
function setPlayerPlan(discordId, plan, expiresAt = null) {
  const now = Date.now();
  const existing = db.prepare(`SELECT first_subscribed_at FROM player_subscriptions WHERE discord_id = ?`).get(discordId);
  const firstSubscribedAt = plan !== "basic" ? existing?.first_subscribed_at ?? now : existing?.first_subscribed_at ?? null;
  db.prepare(
    `INSERT INTO player_subscriptions (discord_id, plan, expires_at, updated_at, first_subscribed_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at, updated_at = excluded.updated_at, first_subscribed_at = COALESCE(player_subscriptions.first_subscribed_at, excluded.first_subscribed_at)`
  ).run(discordId, plan, expiresAt, now, firstSubscribedAt);
}

/** Real months since this discord_id first became a paying (Pro/Max) member - 0 for a Basic player who's never subscribed, never a fabricated number. Backs config/subBadges.js's shield tenure badges. */
function getSubscriptionTenureMonths(discordId) {
  const row = db.prepare(`SELECT first_subscribed_at FROM player_subscriptions WHERE discord_id = ?`).get(discordId);
  if (!row?.first_subscribed_at) return 0;
  const msPerMonth = 30 * 24 * 60 * 60 * 1000; // same 30-day convention as every other "month" calculation in this codebase (no calendar-month edge cases to chase)
  return Math.floor((Date.now() - row.first_subscribed_at) / msPerMonth);
}

/** Today's count for one of player_daily_usage's counters ('swipes' | 'challenges_created') - 0 for a day/counter with no row yet. */
function getDailyUsage(discordId, dayKey, counter) {
  return db.prepare(`SELECT count FROM player_daily_usage WHERE discord_id = ? AND day_key = ? AND counter = ?`).get(discordId, dayKey, counter)?.count ?? 0;
}

/** Increments today's counter and returns the new count - the actual server-side enforcement point (never trust a client-reported count). */
function incrementDailyUsage(discordId, dayKey, counter) {
  db.prepare(
    `INSERT INTO player_daily_usage (discord_id, day_key, counter, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(discord_id, day_key, counter) DO UPDATE SET count = count + 1`
  ).run(discordId, dayKey, counter);
  return getDailyUsage(discordId, dayKey, counter);
}

/** How many Challenges this discord_id currently has open as the CHALLENGER (OPEN or ACCEPTED/live-duel) - backs config/playerPlans.js's maxActiveCreatedChallenges. Cross-guild on purpose, same "one global entitlement" principle as koba_scores. */
function countActiveCreatedChallenges(discordId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM challenges WHERE challenger_id = ? AND status IN ('OPEN', 'ACCEPTED')`).get(discordId).n;
}

// ---------------------------------------------------------------------------
// Bounties (/bounty place|list|cancel) - see bounties' schema.sql header for
// the status-transition rules.
// ---------------------------------------------------------------------------

function createBounty(guildId, { targetGamertag, placedBy, currencyId, amount, expiresAt }) {
  const info = db
    .prepare(
      `INSERT INTO bounties (guild_id, target_gamertag, placed_by, currency_id, amount, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(guildId, targetGamertag, placedBy, currencyId, amount, Date.now(), expiresAt || null);
  return db.prepare(`SELECT * FROM bounties WHERE id = ?`).get(info.lastInsertRowid);
}

/** Every OPEN bounty currently posted on this gamertag (there can be more than one, stacked from different placers - all pay out to whoever lands the kill). */
function getOpenBountiesOnTarget(guildId, targetGamertag) {
  return db.prepare(`SELECT * FROM bounties WHERE guild_id = ? AND target_gamertag = ? AND status = 'open'`).all(guildId, targetGamertag);
}

function listOpenBounties(guildId, limit = 25) {
  return db.prepare(`SELECT * FROM bounties WHERE guild_id = ? AND status = 'open' ORDER BY amount DESC LIMIT ?`).all(guildId, limit);
}

function getBounty(guildId, id) {
  return db.prepare(`SELECT * FROM bounties WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function claimBounty(guildId, id, claimedByGamertag) {
  db.prepare(`UPDATE bounties SET status = 'claimed', claimed_by_gamertag = ?, claimed_at = ? WHERE guild_id = ? AND id = ? AND status = 'open'`).run(claimedByGamertag, Date.now(), guildId, id);
}

function cancelBounty(guildId, id) {
  db.prepare(`UPDATE bounties SET status = 'cancelled' WHERE guild_id = ? AND id = ? AND status = 'open'`).run(guildId, id);
}

/** Background sweep (see utils/backgroundLoops.js) - global across every guild, same convention as listDueJailSentences. Refunds are handled by the caller BEFORE this flips status, same convention as cancelBounty (DB write here is just the status transition, never the money movement). */
function listExpiredOpenBounties() {
  return db.prepare(`SELECT * FROM bounties WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= ?`).all(Date.now());
}

function expireBounty(guildId, id) {
  db.prepare(`UPDATE bounties SET status = 'expired' WHERE guild_id = ? AND id = ? AND status = 'open'`).run(guildId, id);
}

/** Team roster sizes, highest first - continuous standing, no time window (there's no "period" a roster count resets on). */
function getClanSizeLeaderboard(guildId, limit = 10) {
  return db.prepare(`SELECT team_name, COUNT(*) AS member_count FROM members WHERE guild_id = ? GROUP BY team_name ORDER BY member_count DESC LIMIT ?`).all(guildId, limit);
}

/** Wallet balances for one currency, highest first - continuous standing, same reasoning as getClanSizeLeaderboard. */
function getRichestLeaderboard(guildId, currencyId, limit = 10) {
  return db.prepare(`SELECT discord_id, balance FROM shop_wallets WHERE guild_id = ? AND currency_id = ? ORDER BY balance DESC LIMIT ?`).all(guildId, currencyId, limit);
}

/**
 * Total Playtime leaderboard - reuses directory_playtime (Cross-Server
 * Directory's "Verified Reviews" accrual table, see utils/directoryPanel.js's
 * runDirectoryPlaytimeTick), the only table in this codebase that actually
 * stores a cumulative minutes-played total per gamertag. playtime_tracking
 * (the /coin-earn-config table) only stores last-known position/timestamp
 * for AFK detection - it has no running total, so it can't back this board.
 * Continuous standing (minutes never reset), same reasoning as
 * getClanSizeLeaderboard above. Rows are keyed by gamertag, not discord_id,
 * same resolution need as the PvP categories elsewhere in this file.
 */
function getPlaytimeLeaderboard(guildId, limit = 10) {
  return db.prepare(`SELECT gamertag, minutes FROM directory_playtime WHERE guild_id = ? ORDER BY minutes DESC LIMIT ?`).all(guildId, limit);
}

function setGenericLeaderboardReward(guildId, category, period, place, { rewardType, kitName, roleId, roleTempHours }) {
  db.prepare(
    `INSERT INTO leaderboard_rewards (guild_id, category, period, place, reward_type, kit_name, role_id, role_temp_hours)
     VALUES (@guildId, @category, @period, @place, @rewardType, @kitName, @roleId, @roleTempHours)
     ON CONFLICT(guild_id, category, period, place) DO UPDATE SET reward_type=@rewardType, kit_name=@kitName, role_id=@roleId, role_temp_hours=@roleTempHours`
  ).run({ guildId, category, period, place, rewardType, kitName: kitName ?? null, roleId: roleId ?? null, roleTempHours: roleTempHours ?? null });
}

function listGenericLeaderboardRewards(guildId, category, period) {
  return db.prepare(`SELECT * FROM leaderboard_rewards WHERE guild_id = ? AND category = ? AND period = ? ORDER BY place`).all(guildId, category, period);
}

// ---------------------------------------------------------------------------
// Staff applications (/staff-config)
// ---------------------------------------------------------------------------

function setStaffPosition(guildId, positionName, { roleId, questions, requireSocial }) {
  db.prepare(
    `INSERT INTO staff_positions (guild_id, position_name, role_id, questions, require_social, enabled)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(guild_id, position_name) DO UPDATE SET role_id = excluded.role_id, questions = excluded.questions, require_social = excluded.require_social, enabled = 1`
  ).run(guildId, positionName, roleId ?? null, JSON.stringify(questions), requireSocial ? 1 : 0);
}

function getStaffPosition(guildId, positionName) {
  const row = db.prepare(`SELECT * FROM staff_positions WHERE guild_id = ? AND position_name = ?`).get(guildId, positionName);
  return row ? { ...row, questions: JSON.parse(row.questions) } : null;
}

function listStaffPositions(guildId) {
  return db.prepare(`SELECT * FROM staff_positions WHERE guild_id = ? ORDER BY position_name ASC`).all(guildId).map((row) => ({ ...row, questions: JSON.parse(row.questions) }));
}

function listEnabledStaffPositions(guildId) {
  return listStaffPositions(guildId).filter((p) => p.enabled);
}

function deleteStaffPosition(guildId, positionName) {
  db.prepare(`DELETE FROM staff_positions WHERE guild_id = ? AND position_name = ?`).run(guildId, positionName);
}

function setStaffPositionEnabled(guildId, positionName, enabled) {
  db.prepare(`UPDATE staff_positions SET enabled = ? WHERE guild_id = ? AND position_name = ?`).run(enabled ? 1 : 0, guildId, positionName);
}

function createStaffApplication(guildId, positionName, applicantId, answers, socialLinks) {
  const info = db
    .prepare(`INSERT INTO staff_applications (guild_id, position_name, applicant_id, answers, social_links, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
    .run(guildId, positionName, applicantId, JSON.stringify(answers), socialLinks || null, Date.now());
  return getStaffApplication(info.lastInsertRowid);
}

function getStaffApplication(id) {
  const row = db.prepare(`SELECT * FROM staff_applications WHERE id = ?`).get(id);
  return row ? { ...row, answers: JSON.parse(row.answers) } : null;
}

function setStaffApplicationStatus(id, status, reviewedBy) {
  db.prepare(`UPDATE staff_applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`).run(status, reviewedBy, Date.now(), id);
}

/** Has this user already got a pending application for this position? Blocks duplicate spam-applying while one's still open. */
function hasPendingApplication(guildId, positionName, applicantId) {
  return !!db.prepare(`SELECT 1 FROM staff_applications WHERE guild_id = ? AND position_name = ? AND applicant_id = ? AND status = 'pending'`).get(guildId, positionName, applicantId);
}

// ---------------------------------------------------------------------------
// Rising Tides event - waypoints, event state, per-player elimination tracking.
// ---------------------------------------------------------------------------

function addTideWaypoint(guildId, name, tier, x, y, z) {
  db.prepare(`INSERT INTO tide_waypoints (guild_id, name, tier, x, y, z, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(guildId, name, tier, x, y, z, Date.now());
}

function removeTideWaypoint(guildId, name) {
  db.prepare(`DELETE FROM tide_waypoints WHERE guild_id = ? AND name = ?`).run(guildId, name);
}

function listTideWaypoints(guildId, tier) {
  return tier
    ? db.prepare(`SELECT * FROM tide_waypoints WHERE guild_id = ? AND tier = ? ORDER BY name ASC`).all(guildId, tier)
    : db.prepare(`SELECT * FROM tide_waypoints WHERE guild_id = ? ORDER BY tier ASC, name ASC`).all(guildId);
}

function getRisingTidesEvent(guildId) {
  return db.prepare(`SELECT * FROM rising_tides_events WHERE guild_id = ?`).get(guildId) || null;
}

function upsertRisingTidesEvent(guildId, fields) {
  const existing = getRisingTidesEvent(guildId);
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO rising_tides_events (guild_id, status, started_at, ends_at, peak_water_height, step_interval_ms, step_increment, current_water_height, last_step_at, hardcore_enabled, crates_enabled, crate_interval_ms, last_crate_at)
     VALUES (@guildId, @status, @started_at, @ends_at, @peak_water_height, @step_interval_ms, @step_increment, @current_water_height, @last_step_at, @hardcore_enabled, @crates_enabled, @crate_interval_ms, @last_crate_at)
     ON CONFLICT(guild_id) DO UPDATE SET
       status=@status, started_at=@started_at, ends_at=@ends_at, peak_water_height=@peak_water_height, step_interval_ms=@step_interval_ms,
       step_increment=@step_increment, current_water_height=@current_water_height, last_step_at=@last_step_at, hardcore_enabled=@hardcore_enabled,
       crates_enabled=@crates_enabled, crate_interval_ms=@crate_interval_ms, last_crate_at=@last_crate_at`
  ).run({
    guildId,
    status: "inactive",
    started_at: null,
    ends_at: null,
    peak_water_height: null,
    step_interval_ms: null,
    step_increment: null,
    current_water_height: 0,
    last_step_at: null,
    hardcore_enabled: 0,
    crates_enabled: 0,
    crate_interval_ms: null,
    last_crate_at: null,
    ...merged,
  });
  return getRisingTidesEvent(guildId);
}

function registerTidePlayer(guildId, gamertag, discordId) {
  db.prepare(
    `INSERT INTO rising_tides_players (guild_id, gamertag, discord_id, eliminated, registered_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET discord_id = excluded.discord_id`
  ).run(guildId, gamertag, discordId || null, Date.now());
}

function getTidePlayer(guildId, gamertag) {
  return db.prepare(`SELECT * FROM rising_tides_players WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag) || null;
}

function eliminateTidePlayer(guildId, gamertag) {
  db.prepare(`UPDATE rising_tides_players SET eliminated = 1, eliminated_at = ? WHERE guild_id = ? AND gamertag = ?`).run(Date.now(), guildId, gamertag);
}

function listTidePlayers(guildId) {
  return db.prepare(`SELECT * FROM rising_tides_players WHERE guild_id = ?`).all(guildId);
}

function listTideSurvivors(guildId) {
  return db.prepare(`SELECT * FROM rising_tides_players WHERE guild_id = ? AND eliminated = 0`).all(guildId);
}

function clearTidePlayers(guildId) {
  db.prepare(`DELETE FROM rising_tides_players WHERE guild_id = ?`).run(guildId);
}

// ---------------------------------------------------------------------------
// Lucky crate loot tables + survivor-count tier progression (/luckycrates-config)
// ---------------------------------------------------------------------------

function addCrateLootItem(guildId, tier, shortname) {
  db.prepare(`INSERT OR IGNORE INTO crate_loot_items (guild_id, tier, shortname) VALUES (?, ?, ?)`).run(guildId, tier, shortname);
}

function removeCrateLootItem(guildId, tier, shortname) {
  db.prepare(`DELETE FROM crate_loot_items WHERE guild_id = ? AND tier = ? AND shortname = ?`).run(guildId, tier, shortname);
}

function listCrateLootItems(guildId, tier) {
  return db.prepare(`SELECT shortname FROM crate_loot_items WHERE guild_id = ? AND tier = ?`).all(guildId, tier).map((r) => r.shortname);
}

function listCrateTiers(guildId) {
  return db.prepare(`SELECT DISTINCT tier FROM crate_loot_items WHERE guild_id = ?`).all(guildId).map((r) => r.tier);
}

function setCrateTierThreshold(guildId, tier, maxSurvivors) {
  db.prepare(
    `INSERT INTO crate_tier_thresholds (guild_id, tier, max_survivors) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, tier) DO UPDATE SET max_survivors = excluded.max_survivors`
  ).run(guildId, tier, maxSurvivors);
}

function listCrateTierThresholds(guildId) {
  return db.prepare(`SELECT * FROM crate_tier_thresholds WHERE guild_id = ? ORDER BY max_survivors ASC`).all(guildId);
}

/** Picks the most-exclusive (lowest max_survivors) threshold the current survivor count qualifies for - the "endgame" tier wins once few enough players remain. Falls back to the tier with the highest max_survivors (the "everyone" tier) if none match, or null if no tiers are configured at all. */
function getActiveTierForSurvivorCount(guildId, survivorCount) {
  const thresholds = listCrateTierThresholds(guildId);
  if (!thresholds.length) return null;
  const qualifying = thresholds.filter((t) => survivorCount <= t.max_survivors);
  if (qualifying.length) return qualifying[0].tier; // sorted ascending, so [0] is the most exclusive match
  return thresholds[thresholds.length - 1].tier; // survivor count above every threshold - use the loosest/earliest tier
}

// ---------------------------------------------------------------------------
// Ship Battle event
// ---------------------------------------------------------------------------

function getShipBattleEvent(guildId) {
  return db.prepare(`SELECT * FROM ship_battle_events WHERE guild_id = ?`).get(guildId) || null;
}

function upsertShipBattleEvent(guildId, fields) {
  const existing = getShipBattleEvent(guildId);
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO ship_battle_events (guild_id, status, min_team, max_team, total_rounds, current_round, lives_per_player, prize_type, prize_value, peak_water_height, step_interval_ms, step_increment, current_water_height, last_step_at, created_at)
     VALUES (@guildId, @status, @min_team, @max_team, @total_rounds, @current_round, @lives_per_player, @prize_type, @prize_value, @peak_water_height, @step_interval_ms, @step_increment, @current_water_height, @last_step_at, @created_at)
     ON CONFLICT(guild_id) DO UPDATE SET
       status=@status, min_team=@min_team, max_team=@max_team, total_rounds=@total_rounds, current_round=@current_round,
       lives_per_player=@lives_per_player, prize_type=@prize_type, prize_value=@prize_value, peak_water_height=@peak_water_height,
       step_interval_ms=@step_interval_ms, step_increment=@step_increment, current_water_height=@current_water_height,
       last_step_at=@last_step_at, created_at=@created_at`
  ).run({
    guildId,
    status: "inactive",
    min_team: null,
    max_team: null,
    total_rounds: null,
    current_round: 1,
    lives_per_player: null,
    prize_type: null,
    prize_value: null,
    peak_water_height: null,
    step_interval_ms: null,
    step_increment: null,
    current_water_height: 0,
    last_step_at: null,
    created_at: Date.now(),
    ...merged,
  });
  return getShipBattleEvent(guildId);
}

function registerShipBattlePlayer(guildId, gamertag, discordId, teamName, lives) {
  db.prepare(
    `INSERT INTO ship_battle_players (guild_id, gamertag, discord_id, team_name, lives, eliminated) VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET discord_id = excluded.discord_id, team_name = excluded.team_name, lives = excluded.lives, eliminated = 0`
  ).run(guildId, gamertag, discordId || null, teamName || null, lives);
}

function getShipBattlePlayer(guildId, gamertag) {
  return db.prepare(`SELECT * FROM ship_battle_players WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag) || null;
}

function decrementShipBattleLife(guildId, gamertag) {
  db.prepare(`UPDATE ship_battle_players SET lives = MAX(0, lives - 1) WHERE guild_id = ? AND gamertag = ?`).run(guildId, gamertag);
  const player = getShipBattlePlayer(guildId, gamertag);
  if (player && player.lives <= 0 && !player.eliminated) {
    db.prepare(`UPDATE ship_battle_players SET eliminated = 1 WHERE guild_id = ? AND gamertag = ?`).run(guildId, gamertag);
  }
  return player;
}

function listShipBattlePlayers(guildId) {
  return db.prepare(`SELECT * FROM ship_battle_players WHERE guild_id = ?`).all(guildId);
}

function listShipBattleSurvivingTeams(guildId) {
  const rows = db.prepare(`SELECT DISTINCT team_name FROM ship_battle_players WHERE guild_id = ? AND eliminated = 0 AND team_name IS NOT NULL`).all(guildId);
  return rows.map((r) => r.team_name);
}

function clearShipBattlePlayers(guildId) {
  db.prepare(`DELETE FROM ship_battle_players WHERE guild_id = ?`).run(guildId);
}

function addBoatWaypoint(guildId, name, x, y, z) {
  db.prepare(`INSERT INTO boat_waypoints (guild_id, name, x, y, z, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(guildId, name, x, y, z, Date.now());
}

function removeBoatWaypoint(guildId, name) {
  db.prepare(`DELETE FROM boat_waypoints WHERE guild_id = ? AND name = ?`).run(guildId, name);
}

function listBoatWaypoints(guildId) {
  return db.prepare(`SELECT * FROM boat_waypoints WHERE guild_id = ? ORDER BY name ASC`).all(guildId);
}

// ---------------------------------------------------------------------------
// Shop system - currencies, shops, categories, products, sales, wallets,
// savings, carts, purchase log. See schema.sql's shop_* block header for the
// delivery-mechanism rationale (throwaway kit, no raw give-item command).
// ---------------------------------------------------------------------------

function createCurrency(guildId, name, emoji) {
  const info = db.prepare(`INSERT INTO shop_currencies (guild_id, name, emoji, savings_interest_pct, created_at) VALUES (?, ?, ?, 1.0, ?)`).run(guildId, name, emoji || null, Date.now());
  return getCurrency(guildId, info.lastInsertRowid);
}

function listCurrencies(guildId) {
  return db.prepare(`SELECT * FROM shop_currencies WHERE guild_id = ? ORDER BY name ASC`).all(guildId);
}

function getCurrency(guildId, id) {
  return db.prepare(`SELECT * FROM shop_currencies WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function setCurrencyInterestRate(guildId, id, pct) {
  db.prepare(`UPDATE shop_currencies SET savings_interest_pct = ? WHERE guild_id = ? AND id = ?`).run(pct, guildId, id);
}

/** Both bounds NULL (the default) means the Marketplace is closed for this currency until an admin sets both via /marketplace-config. */
function setCurrencyMarketplaceBounds(guildId, id, minPrice, maxPrice) {
  db.prepare(`UPDATE shop_currencies SET marketplace_min_price = ?, marketplace_max_price = ? WHERE guild_id = ? AND id = ?`).run(minPrice, maxPrice, guildId, id);
}

/** NULL (the default) means uncapped - every wallet/savings balance in this currency is clamped to this ceiling by clampToWalletCap() the moment it's set. */
function setCurrencyMaxBalance(guildId, id, maxBalance) {
  db.prepare(`UPDATE shop_currencies SET max_wallet_balance = ? WHERE guild_id = ? AND id = ?`).run(maxBalance, guildId, id);
}

/**
 * /currency-mint ceiling for total circulating_supply (see schema.sql's
 * shop_currencies block header). Falsy (null/0/blank) means uncapped, same
 * convention as setCurrencyMaxBalance above. A burn (lowering max_supply)
 * can never go below the currency's current circulating_supply - that would
 * mean promising to destroy coins already sitting in real wallets, which
 * this feature deliberately does not do - so it's clamped up to
 * circulating_supply instead of rejected outright. Returns the currency row
 * after the update so the caller (commands/shop-mint.js) can report back
 * exactly what was actually set, including when it got clamped.
 */
function setCurrencyMaxSupply(guildId, id, newMaxSupply) {
  const currency = getCurrency(guildId, id);
  if (!currency) return null;
  let next = newMaxSupply === null || newMaxSupply === undefined || newMaxSupply === 0 || newMaxSupply === "" ? null : newMaxSupply;
  if (next !== null && next < currency.circulating_supply) next = currency.circulating_supply;
  db.prepare(`UPDATE shop_currencies SET max_supply = ? WHERE guild_id = ? AND id = ?`).run(next, guildId, id);
  return getCurrency(guildId, id);
}

function deleteCurrency(guildId, id) {
  db.prepare(`DELETE FROM shop_currencies WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function createShop(guildId, name, currencyId) {
  const info = db.prepare(`INSERT INTO shops (guild_id, name, enabled, required_role_ids, currency_id, created_at) VALUES (?, ?, 1, '[]', ?, ?)`).run(guildId, name, currencyId, Date.now());
  return getShop(guildId, info.lastInsertRowid);
}

/**
 * BUG FIX (2026-09-02): used to return raw rows with required_role_ids
 * still as a JSON string, unlike getShop() (which parses it) - the player
 * Shop panel's shopsVisibleTo() assumed it was already an array and called
 * .some() on it, which throws on a string every single time, masked by the
 * global interaction error handler as "[ DENIED ] Something Went Wrong".
 * Parsed here now so every caller gets the same real array, consistently.
 */
function listShops(guildId) {
  return db.prepare(`SELECT * FROM shops WHERE guild_id = ? ORDER BY name ASC`).all(guildId).map((row) => ({ ...row, required_role_ids: JSON.parse(row.required_role_ids || "[]") }));
}

function getShop(guildId, id) {
  const row = db.prepare(`SELECT * FROM shops WHERE guild_id = ? AND id = ?`).get(guildId, id);
  if (!row) return null;
  return { ...row, required_role_ids: JSON.parse(row.required_role_ids || "[]") };
}

function updateShop(guildId, id, fields) {
  const existing = getShop(guildId, id);
  if (!existing) return null;
  const merged = { ...existing, ...fields };
  db.prepare(`UPDATE shops SET name = ?, enabled = ?, required_role_ids = ?, currency_id = ? WHERE guild_id = ? AND id = ?`).run(
    merged.name,
    merged.enabled ? 1 : 0,
    JSON.stringify(merged.required_role_ids || []),
    merged.currency_id,
    guildId,
    id
  );
  return getShop(guildId, id);
}

function deleteShop(guildId, id) {
  const categoryIds = db.prepare(`SELECT id FROM shop_categories WHERE guild_id = ? AND shop_id = ?`).all(guildId, id).map((r) => r.id);
  for (const categoryId of categoryIds) deleteCategory(guildId, categoryId);
  db.prepare(`DELETE FROM shop_sales WHERE guild_id = ? AND shop_id = ?`).run(guildId, id);
  db.prepare(`DELETE FROM shops WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function createCategory(guildId, shopId, name) {
  const info = db.prepare(`INSERT INTO shop_categories (guild_id, shop_id, name, sort_order) VALUES (?, ?, ?, 0)`).run(guildId, shopId, name);
  return getCategory(guildId, info.lastInsertRowid);
}

function listCategories(guildId, shopId) {
  return db.prepare(`SELECT * FROM shop_categories WHERE guild_id = ? AND shop_id = ? ORDER BY sort_order ASC, name ASC`).all(guildId, shopId);
}

function getCategory(guildId, id) {
  return db.prepare(`SELECT * FROM shop_categories WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function deleteCategory(guildId, id) {
  const productIds = db.prepare(`SELECT id FROM shop_products WHERE guild_id = ? AND category_id = ?`).all(guildId, id).map((r) => r.id);
  for (const productId of productIds) deleteProduct(guildId, productId);
  db.prepare(`DELETE FROM shop_sales WHERE guild_id = ? AND category_id = ?`).run(guildId, id);
  db.prepare(`DELETE FROM shop_categories WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function createProduct(guildId, shopId, categoryId, { displayName, itemShortName, amountPerUnit, price, imageUrl }) {
  const info = db
    .prepare(
      `INSERT INTO shop_products (guild_id, shop_id, category_id, display_name, item_short_name, amount_per_unit, price, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, shopId, categoryId, displayName, itemShortName, amountPerUnit || 1, price, imageUrl || null, Date.now());
  return getProduct(guildId, info.lastInsertRowid);
}

function listProducts(guildId, categoryId) {
  return db.prepare(`SELECT * FROM shop_products WHERE guild_id = ? AND category_id = ? ORDER BY display_name ASC`).all(guildId, categoryId);
}

function listProductsForShop(guildId, shopId) {
  return db.prepare(`SELECT * FROM shop_products WHERE guild_id = ? AND shop_id = ? ORDER BY display_name ASC`).all(guildId, shopId);
}

/** Every raw-item product across every shop/category in the guild - used by Quick Setup (utils/gamesPanel.js) as the "already-registered Rust items" pool, same idea as reusing kit_registry for kits instead of guessing shortnames. */
function listAllItemProducts(guildId) {
  return db.prepare(`SELECT * FROM shop_products WHERE guild_id = ? AND reward_type = 'item' ORDER BY display_name ASC`).all(guildId);
}

function getProduct(guildId, id) {
  return db.prepare(`SELECT * FROM shop_products WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function updateProduct(guildId, id, fields) {
  const existing = getProduct(guildId, id);
  if (!existing) return null;
  const merged = { ...existing, ...fields };
  db.prepare(`UPDATE shop_products SET display_name = ?, item_short_name = ?, amount_per_unit = ?, price = ?, image_url = ? WHERE guild_id = ? AND id = ?`).run(
    merged.display_name,
    merged.item_short_name,
    merged.amount_per_unit,
    merged.price,
    merged.image_url,
    guildId,
    id
  );
  return getProduct(guildId, id);
}

function deleteProduct(guildId, id) {
  db.prepare(`DELETE FROM shop_sales WHERE guild_id = ? AND product_id = ?`).run(guildId, id);
  db.prepare(`DELETE FROM shop_cart_items WHERE guild_id = ? AND product_id = ?`).run(guildId, id);
  db.prepare(`DELETE FROM shop_products WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function createSale(guildId, shopId, { categoryId, productId, percentOff, startsAt, endsAt }) {
  db.prepare(
    `INSERT INTO shop_sales (guild_id, shop_id, category_id, product_id, percent_off, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, shopId, categoryId || null, productId || null, percentOff, startsAt, endsAt);
}

function listActiveSales(guildId, shopId) {
  const now = Date.now();
  return db.prepare(`SELECT * FROM shop_sales WHERE guild_id = ? AND shop_id = ? AND starts_at <= ? AND ends_at >= ?`).all(guildId, shopId, now, now);
}

function deleteSale(guildId, id) {
  db.prepare(`DELETE FROM shop_sales WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

/** Best (largest) active discount applying to a product, checked by product_id first, then its category_id. Returns { price, percentOff } - percentOff is 0 if nothing applies. */
function getEffectivePrice(guildId, product) {
  const sales = listActiveSales(guildId, product.shop_id);
  const applicable = sales.filter((s) => s.product_id === product.id || s.category_id === product.category_id);
  const percentOff = applicable.reduce((max, s) => Math.max(max, s.percent_off), 0);
  const price = Math.round(product.price * (1 - percentOff / 100) * 100) / 100;
  return { price, percentOff };
}

function getWallet(guildId, discordId, currencyId) {
  return db.prepare(`SELECT * FROM shop_wallets WHERE guild_id = ? AND discord_id = ? AND currency_id = ?`).get(guildId, discordId, currencyId) || { balance: 0 };
}

function listWallets(guildId, discordId) {
  return db.prepare(`SELECT * FROM shop_wallets WHERE guild_id = ? AND discord_id = ?`).all(guildId, discordId);
}

/** Player web dashboard - every non-zero wallet balance this Discord account holds, across every guild, with currency name/emoji and guild_name joined in for display. */
function listWalletsByDiscordId(discordId) {
  return db
    .prepare(
      `SELECT w.*, c.name AS currency_name, c.emoji AS currency_emoji, g.guild_name
       FROM shop_wallets w
       JOIN shop_currencies c ON c.id = w.currency_id AND c.guild_id = w.guild_id
       LEFT JOIN guild_installs g ON g.guild_id = w.guild_id
       WHERE w.discord_id = ? AND w.balance > 0
       ORDER BY w.balance DESC`
    )
    .all(discordId);
}

/** Positive delta credits, negative debits - clamps at 0, never goes negative (checkout should verify affordability BEFORE calling this). */
/** Clamps a balance to [0, currency.max_wallet_balance] - the cap set via /shop-mint, NULL = uncapped. Shared by wallet + savings so both respect the same ceiling. */
function clampToWalletCap(guildId, currencyId, amount) {
  const currency = getCurrency(guildId, currencyId);
  const cap = currency?.max_wallet_balance;
  return cap !== null && cap !== undefined ? Math.min(amount, cap) : amount;
}

/**
 * Server-wipe wallet reset (see commands/wipe.js) - a real Rust-server wipe
 * day, not /nuke's Discord-structure wipe. Clears both wallets and savings
 * (shop_savings) for the whole guild - leaving savings untouched would let
 * players dodge a wipe just by having parked coins there. Deletes rows
 * outright rather than UPDATE...SET balance=0, same convention as every
 * other per-guild reset in this file (resetLootboxConfig etc.) - a missing
 * row already reads as a 0 balance via getWallet's fallback.
 */
function resetAllWallets(guildId) {
  db.prepare(`DELETE FROM shop_wallets WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM shop_savings WHERE guild_id = ?`).run(guildId);
}

function adjustWallet(guildId, discordId, currencyId, delta) {
  const current = getWallet(guildId, discordId, currencyId).balance;
  const next = clampToWalletCap(guildId, currencyId, Math.max(0, current + delta));
  db.prepare(
    `INSERT INTO shop_wallets (guild_id, discord_id, currency_id, balance) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id, currency_id) DO UPDATE SET balance = excluded.balance`
  ).run(guildId, discordId, currencyId, next);
  return next;
}

/**
 * The gatekeeping wrapper every reward-creation path (lootbox wins, kill
 * rewards, bounty payouts, game payouts, referral rewards, admin /give,
 * etc.) must call instead of adjustWallet directly - see schema.sql's
 * shop_currencies block header. Plain transfers of EXISTING money (p2p
 * sends, shop purchases, auction refunds, trade payments, wager pots) are
 * NOT reward creation and should keep calling adjustWallet directly.
 *
 * If max_supply is null (uncapped), grants the full amount and still bumps
 * circulating_supply by the full amount - it's a running total of
 * everything ever granted, capped or not. If max_supply is set, clamps the
 * grantable amount to whatever headroom is left (max_supply -
 * circulating_supply, floored at 0) so circulating_supply can never be
 * pushed past the ceiling. Returns { granted, requested } so callers can
 * tell players/admins when a payout was cut short by the supply cap.
 */
function grantFromSupply(guildId, currencyId, discordId, amount) {
  const currency = getCurrency(guildId, currencyId);
  const requested = amount;
  if (!currency) {
    adjustWallet(guildId, discordId, currencyId, amount);
    return { granted: amount, requested };
  }
  let granted = amount;
  if (currency.max_supply !== null && currency.max_supply !== undefined) {
    const headroom = Math.max(0, currency.max_supply - currency.circulating_supply);
    granted = Math.min(amount, headroom);
  }
  if (granted > 0) adjustWallet(guildId, discordId, currencyId, granted);
  db.prepare(`UPDATE shop_currencies SET circulating_supply = circulating_supply + ? WHERE guild_id = ? AND id = ?`).run(granted, guildId, currencyId);
  return { granted, requested };
}

function getSavings(guildId, discordId, currencyId) {
  return db.prepare(`SELECT * FROM shop_savings WHERE guild_id = ? AND discord_id = ? AND currency_id = ?`).get(guildId, discordId, currencyId) || { balance: 0, last_accrued_at: Date.now() };
}

function listSavings(guildId, discordId) {
  return db.prepare(`SELECT * FROM shop_savings WHERE guild_id = ? AND discord_id = ?`).all(guildId, discordId);
}

function adjustSavings(guildId, discordId, currencyId, delta) {
  const current = getSavings(guildId, discordId, currencyId).balance;
  const next = clampToWalletCap(guildId, currencyId, Math.max(0, current + delta));
  db.prepare(
    `INSERT INTO shop_savings (guild_id, discord_id, currency_id, balance, last_accrued_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id, currency_id) DO UPDATE SET balance = excluded.balance`
  ).run(guildId, discordId, currencyId, next, Date.now());
  return next;
}

/** All savings rows across all guilds/players due for accrual - called from the background tick, not per-guild, since interest is a slow (daily-scale) process. */
function listAllSavingsAccounts() {
  return db.prepare(`SELECT * FROM shop_savings WHERE balance > 0`).all();
}

function accrueSavingsInterest(row, ratePct, now) {
  const elapsedDays = (now - row.last_accrued_at) / (24 * 60 * 60 * 1000);
  const interest = row.balance * (ratePct / 100) * elapsedDays;
  const next = row.balance + interest;
  db.prepare(`UPDATE shop_savings SET balance = ?, last_accrued_at = ? WHERE guild_id = ? AND discord_id = ? AND currency_id = ?`).run(next, now, row.guild_id, row.discord_id, row.currency_id);
  return interest;
}

function getCartItems(guildId, discordId) {
  return db.prepare(`SELECT * FROM shop_cart_items WHERE guild_id = ? AND discord_id = ?`).all(guildId, discordId);
}

function setCartQuantity(guildId, discordId, productId, quantity) {
  if (quantity <= 0) {
    db.prepare(`DELETE FROM shop_cart_items WHERE guild_id = ? AND discord_id = ? AND product_id = ?`).run(guildId, discordId, productId);
    return;
  }
  db.prepare(
    `INSERT INTO shop_cart_items (guild_id, discord_id, product_id, quantity) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id, product_id) DO UPDATE SET quantity = excluded.quantity`
  ).run(guildId, discordId, productId, quantity);
}

function clearCart(guildId, discordId) {
  db.prepare(`DELETE FROM shop_cart_items WHERE guild_id = ? AND discord_id = ?`).run(guildId, discordId);
}

function recordPurchase(guildId, discordId, gamertag, shopId, summary, totalPrice, currencyId) {
  db.prepare(
    `INSERT INTO shop_purchases (guild_id, discord_id, gamertag, shop_id, summary, total_price, currency_id, purchased_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, discordId, gamertag, shopId, summary, totalPrice, currencyId, Date.now());
}

// ---------------------------------------------------------------------------
// Auctions (/auction-config)
// ---------------------------------------------------------------------------

function createAuction(guildId, { currencyId, rewardType, rewardRef, amount, startingBid, buyNowPrice, createdBy, durationMs }) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO auctions (guild_id, currency_id, reward_type, reward_ref, amount, starting_bid, buy_now_price, status, created_by, created_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(guildId, currencyId, rewardType, rewardRef, amount || 1, startingBid, buyNowPrice || null, createdBy, now, now + durationMs);
  return getAuction(guildId, info.lastInsertRowid);
}

function getAuction(guildId, id) {
  return db.prepare(`SELECT * FROM auctions WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function setAuctionMessage(guildId, id, channelId, messageId) {
  db.prepare(`UPDATE auctions SET channel_id = ?, message_id = ? WHERE guild_id = ? AND id = ?`).run(channelId, messageId, guildId, id);
}

function listActiveAuctions(guildId) {
  return db.prepare(`SELECT * FROM auctions WHERE guild_id = ? AND status = 'active' ORDER BY ends_at ASC`).all(guildId);
}

function listDueAuctions() {
  return db.prepare(`SELECT * FROM auctions WHERE status = 'active' AND ends_at <= ?`).all(Date.now());
}

function setAuctionStatus(id, status) {
  db.prepare(`UPDATE auctions SET status = ? WHERE id = ?`).run(status, id);
}

/**
 * Places a bid transactionally: refunds the previous high bidder's escrowed
 * wallet balance, debits the new bidder, and records both the new high bid
 * and a row in auction_bids for history. Caller must already have verified
 * the bidder can afford it and the bid beats the current one.
 */
const placeBidTxn = db.transaction((guildId, auctionId, discordId, amount, currencyId) => {
  const auction = db.prepare(`SELECT * FROM auctions WHERE guild_id = ? AND id = ?`).get(guildId, auctionId);
  if (auction.current_bidder) adjustWallet(guildId, auction.current_bidder, currencyId, auction.current_bid); // refund the outbid player
  adjustWallet(guildId, discordId, currencyId, -amount);
  db.prepare(`UPDATE auctions SET current_bid = ?, current_bidder = ? WHERE id = ?`).run(amount, discordId, auctionId);
  db.prepare(`INSERT INTO auction_bids (auction_id, discord_id, amount, placed_at) VALUES (?, ?, ?, ?)`).run(auctionId, discordId, amount, Date.now());
});

function placeBid(guildId, auctionId, discordId, amount, currencyId) {
  placeBidTxn(guildId, auctionId, discordId, amount, currencyId);
  return getAuction(guildId, auctionId);
}

/** Buy Now: same escrow-refund dance as a bid, then immediately closes the auction as sold. */
const buyNowTxn = db.transaction((guildId, auctionId, discordId, price, currencyId) => {
  const auction = db.prepare(`SELECT * FROM auctions WHERE guild_id = ? AND id = ?`).get(guildId, auctionId);
  if (auction.current_bidder) adjustWallet(guildId, auction.current_bidder, currencyId, auction.current_bid);
  adjustWallet(guildId, discordId, currencyId, -price);
  db.prepare(`UPDATE auctions SET current_bid = ?, current_bidder = ?, status = 'sold' WHERE id = ?`).run(price, discordId, auctionId);
  db.prepare(`INSERT INTO auction_bids (auction_id, discord_id, amount, placed_at) VALUES (?, ?, ?, ?)`).run(auctionId, discordId, price, Date.now());
});

function buyNowAuction(guildId, auctionId, discordId, price, currencyId) {
  buyNowTxn(guildId, auctionId, discordId, price, currencyId);
  return getAuction(guildId, auctionId);
}

/** Marks a sold auction's reward as actually delivered - see schema.sql's auctions header for why this exists (NULL = still owed, shows a Retry Delivery button). */
function markAuctionDelivered(id) {
  db.prepare(`UPDATE auctions SET delivered_at = ? WHERE id = ?`).run(Date.now(), id);
}

// ---------------------------------------------------------------------------
// Marketplace (/marketplace) - player-listed materials only, see schema.sql
// ---------------------------------------------------------------------------

/** Escrows the materials out of the seller's team stockpile FIRST (throws if they don't have enough), then creates the listing - the whole point being a listing can never outlive materials the team no longer has. */
const createListingTxn = db.transaction((guildId, { sellerDiscordId, sellerTeam, currencyId, materialField, amount, price }) => {
  const team = getTeam(guildId, sellerTeam);
  if (!team || (team[materialField] || 0) < amount) throw new Error("insufficient_materials");
  adjustTeamMaterials(guildId, sellerTeam, { [materialField]: -amount });
  const info = db
    .prepare(
      `INSERT INTO marketplace_listings (guild_id, seller_discord_id, seller_team, currency_id, material_field, amount, price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    )
    .run(guildId, sellerDiscordId, sellerTeam, currencyId, materialField, amount, price, Date.now());
  return info.lastInsertRowid;
});

function createListing(guildId, args) {
  const id = createListingTxn(guildId, args);
  return getListing(guildId, id);
}

function getListing(guildId, id) {
  return db.prepare(`SELECT * FROM marketplace_listings WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function listActiveListings(guildId, materialField) {
  if (materialField) return db.prepare(`SELECT * FROM marketplace_listings WHERE guild_id = ? AND status = 'active' AND material_field = ? ORDER BY price ASC`).all(guildId, materialField);
  return db.prepare(`SELECT * FROM marketplace_listings WHERE guild_id = ? AND status = 'active' ORDER BY created_at DESC`).all(guildId);
}

function listSellerListings(guildId, sellerDiscordId) {
  return db.prepare(`SELECT * FROM marketplace_listings WHERE guild_id = ? AND seller_discord_id = ? AND status = 'active' ORDER BY created_at DESC`).all(guildId, sellerDiscordId);
}

/** Buyer pays the seller and receives the escrowed materials into their own team's stockpile; seller never gets the materials back (they were already spent from their team when listed). */
const buyListingTxn = db.transaction((guildId, listingId, buyerDiscordId, buyerTeam) => {
  const listing = db.prepare(`SELECT * FROM marketplace_listings WHERE guild_id = ? AND id = ?`).get(guildId, listingId);
  adjustWallet(guildId, buyerDiscordId, listing.currency_id, -listing.price);
  adjustWallet(guildId, listing.seller_discord_id, listing.currency_id, listing.price);
  adjustTeamMaterials(guildId, buyerTeam, { [listing.material_field]: listing.amount });
  db.prepare(`UPDATE marketplace_listings SET status = 'sold', buyer_discord_id = ?, sold_at = ? WHERE id = ?`).run(buyerDiscordId, Date.now(), listingId);
});

function buyListing(guildId, listingId, buyerDiscordId, buyerTeam) {
  buyListingTxn(guildId, listingId, buyerDiscordId, buyerTeam);
  return getListing(guildId, listingId);
}

/** Cancels a listing and refunds the escrowed materials back to the seller's team (only meaningful if that team still exists). */
function cancelListing(guildId, listingId) {
  const listing = getListing(guildId, listingId);
  if (!listing || listing.status !== "active") return null;
  adjustTeamMaterials(guildId, listing.seller_team, { [listing.material_field]: listing.amount });
  db.prepare(`UPDATE marketplace_listings SET status = 'cancelled' WHERE id = ?`).run(listingId);
  return getListing(guildId, listingId);
}

// ---------------------------------------------------------------------------
// Server Directory (/directory) - the one cross-guild feature; see
// schema.sql's directory_* header for why guild_id here means "the
// registering server," never the hub.
// ---------------------------------------------------------------------------

/**
 * EVERY field here is optional and preserved from the existing row when
 * omitted - the web dashboard's directory-editing form (admin/dashboard.js,
 * for a guild the logged-in user owns) only ever submits the social/detail
 * fields, relying entirely on title/inviteUrl/tags/registeredBy surviving
 * untouched from the original /directory register call. "Omitted" means
 * either `undefined` (a caller that never set the key at all) OR `null`
 * (what interaction.options.getString() returns for a Discord option the
 * admin didn't fill in this time) - both read as "leave it alone." A
 * brand-new server (no existing row) MUST supply title/inviteUrl itself
 * (there's nothing to fall back to) - that's what /directory register
 * always does.
 */
function generateKobabotId() {
  return `srv_${crypto.randomBytes(4).toString("hex")}`;
}

function upsertDirectoryServer(guildId, fields) {
  const existing = getDirectoryServer(guildId);
  const pick = (key, column) => (fields[key] != null ? fields[key] : existing?.[column] ?? null);
  const values = {
    guildId,
    title: pick("title", "title"),
    inviteUrl: pick("inviteUrl", "invite_url"),
    tags: fields.tags !== undefined ? JSON.stringify(fields.tags) : existing?.tags ? JSON.stringify(existing.tags) : "[]",
    registeredBy: pick("registeredBy", "registered_by"),
    createdAt: existing?.created_at || Date.now(),
    kobabotId: existing?.boombot_id || generateKobabotId(),
    mapType: pick("mapType", "map_type"),
    mapSize: pick("mapSize", "map_size"),
    seed: pick("seed", "seed"),
    wipeSchedule: pick("wipeSchedule", "wipe_schedule"),
    tiktokUrl: pick("tiktokUrl", "tiktok_url"),
    twitchUrl: pick("twitchUrl", "twitch_url"),
    websiteUrl: pick("websiteUrl", "website_url"),
    displayServerId: pick("displayServerId", "display_server_id"),
    platforms: fields.platforms !== undefined ? JSON.stringify(fields.platforms) : existing?.platforms ? JSON.stringify(existing.platforms) : "[]",
    ownerUsername: pick("ownerUsername", "owner_username"),
  };
  db.prepare(
    `INSERT INTO directory_servers (guild_id, title, invite_url, tags, registered_by, created_at, boombot_id, map_type, map_size, seed, wipe_schedule, tiktok_url, twitch_url, website_url, display_server_id, platforms, owner_username)
     VALUES (@guildId, @title, @inviteUrl, @tags, @registeredBy, @createdAt, @kobabotId, @mapType, @mapSize, @seed, @wipeSchedule, @tiktokUrl, @twitchUrl, @websiteUrl, @displayServerId, @platforms, @ownerUsername)
     ON CONFLICT(guild_id) DO UPDATE SET
       title = excluded.title, invite_url = excluded.invite_url, tags = excluded.tags,
       map_type = excluded.map_type, map_size = excluded.map_size, seed = excluded.seed, wipe_schedule = excluded.wipe_schedule,
       tiktok_url = excluded.tiktok_url, twitch_url = excluded.twitch_url, website_url = excluded.website_url,
       display_server_id = excluded.display_server_id, platforms = excluded.platforms, owner_username = excluded.owner_username`
  ).run(values);
  return getDirectoryServer(guildId);
}

/** platforms is nullable on rows created before the column existed - JSON.parse(null) throws, so this defaults those to an empty array same as a fresh row that never set any. */
function parsePlatforms(row) {
  return row.platforms ? JSON.parse(row.platforms) : [];
}

function getDirectoryServer(guildId) {
  const row = db.prepare(`SELECT * FROM directory_servers WHERE guild_id = ?`).get(guildId);
  return row ? { ...row, tags: JSON.parse(row.tags), platforms: parsePlatforms(row) } : null;
}

/**
 * A directory listing with NO KOBA Bot license/Discord guild at all - the
 * owner just needs a BOOMid (their Discord OAuth login on the dashboard)
 * and their Rust server's WebRCON host/port/password, entered on
 * kobabot.store. guild_id still can't be NULL (UNIQUE column, would need a
 * full SQLite table rebuild to relax that) so a synthetic "web:<kobabotId>"
 * value goes there instead - nothing downstream ever treats it as a real
 * Discord guild (see utils/directoryPanel.js's syncServerCard, which only
 * ever fetches the HUB guild, never server.guild_id).
 */
function createStandaloneDirectoryServer({
  ownerDiscordId,
  title,
  inviteUrl,
  tags,
  rconHost,
  rconPort,
  rconPasswordEncrypted,
  mapType,
  mapSize,
  seed,
  wipeSchedule,
  tiktokUrl,
  twitchUrl,
  websiteUrl,
  displayServerId,
  platforms,
  ownerUsername,
}) {
  const kobabotId = generateKobabotId();
  const guildId = `web:${kobabotId}`;
  db.prepare(
    `INSERT INTO directory_servers (guild_id, title, invite_url, tags, registered_by, created_at, boombot_id, owner_discord_id, rcon_host, rcon_port, rcon_password_encrypted, map_type, map_size, seed, wipe_schedule, tiktok_url, twitch_url, website_url, display_server_id, platforms, owner_username)
     VALUES (@guildId, @title, @inviteUrl, @tags, @registeredBy, @createdAt, @kobabotId, @ownerDiscordId, @rconHost, @rconPort, @rconPasswordEncrypted, @mapType, @mapSize, @seed, @wipeSchedule, @tiktokUrl, @twitchUrl, @websiteUrl, @displayServerId, @platforms, @ownerUsername)`
  ).run({
    guildId,
    title,
    inviteUrl,
    tags: JSON.stringify(tags || []),
    registeredBy: ownerDiscordId,
    createdAt: Date.now(),
    kobabotId,
    ownerDiscordId,
    rconHost,
    rconPort,
    rconPasswordEncrypted,
    mapType: mapType ?? null,
    mapSize: mapSize ?? null,
    seed: seed ?? null,
    wipeSchedule: wipeSchedule ?? null,
    tiktokUrl: tiktokUrl ?? null,
    twitchUrl: twitchUrl ?? null,
    websiteUrl: websiteUrl ?? null,
    displayServerId: displayServerId ?? null,
    platforms: JSON.stringify(platforms || []),
    ownerUsername: ownerUsername ?? null,
  });
  return getDirectoryServer(guildId);
}

/** Edits an EXISTING standalone listing (looked up by its own synthetic guild_id) - every field optional/preserved-on-omit, same semantics as upsertDirectoryServer. Callers (admin/dashboard.js) only ever reach this for listings the logged-in user actually owns. */
function updateStandaloneDirectoryServer(guildId, fields) {
  const existing = getDirectoryServer(guildId);
  if (!existing) return null;
  const pick = (key, column) => (fields[key] != null ? fields[key] : existing[column] ?? null);
  db.prepare(
    `UPDATE directory_servers SET
       title = @title, invite_url = @inviteUrl, tags = @tags,
       rcon_host = @rconHost, rcon_port = @rconPort, rcon_password_encrypted = @rconPasswordEncrypted,
       map_type = @mapType, map_size = @mapSize, seed = @seed, wipe_schedule = @wipeSchedule,
       tiktok_url = @tiktokUrl, twitch_url = @twitchUrl, website_url = @websiteUrl,
       display_server_id = @displayServerId, platforms = @platforms, owner_username = @ownerUsername
     WHERE guild_id = @guildId`
  ).run({
    guildId,
    title: pick("title", "title"),
    inviteUrl: pick("inviteUrl", "invite_url"),
    tags: fields.tags !== undefined ? JSON.stringify(fields.tags) : JSON.stringify(existing.tags),
    rconHost: pick("rconHost", "rcon_host"),
    rconPort: pick("rconPort", "rcon_port"),
    rconPasswordEncrypted: pick("rconPasswordEncrypted", "rcon_password_encrypted"),
    mapType: pick("mapType", "map_type"),
    mapSize: pick("mapSize", "map_size"),
    seed: pick("seed", "seed"),
    wipeSchedule: pick("wipeSchedule", "wipe_schedule"),
    tiktokUrl: pick("tiktokUrl", "tiktok_url"),
    twitchUrl: pick("twitchUrl", "twitch_url"),
    websiteUrl: pick("websiteUrl", "website_url"),
    displayServerId: pick("displayServerId", "display_server_id"),
    platforms: fields.platforms !== undefined ? JSON.stringify(fields.platforms) : JSON.stringify(existing.platforms),
    ownerUsername: pick("ownerUsername", "owner_username"),
  });
  return getDirectoryServer(guildId);
}

/** Staff-only toggle (see admin/directoryStaff.js) - never self-service, no owner-facing route sets this. */
function setDirectoryServerVerified(guildId, verified) {
  db.prepare(`UPDATE directory_servers SET verified = ? WHERE guild_id = ?`).run(verified ? 1 : 0, guildId);
  return getDirectoryServer(guildId);
}

/** Every listing a dashboard user can manage - standalone ones they registered directly, plus any guild-based listing for a KOBA Bot server they own. */
function listDirectoryServersOwnedBy(discordId) {
  return db
    .prepare(
      `SELECT * FROM directory_servers
       WHERE owner_discord_id = ?
          OR guild_id IN (SELECT guild_id FROM guild_installs WHERE owner_id = ?)`
    )
    .all(discordId, discordId)
    .map((row) => ({ ...row, tags: JSON.parse(row.tags), platforms: parsePlatforms(row) }));
}

function getDirectoryServerById(id) {
  const row = db.prepare(`SELECT * FROM directory_servers WHERE id = ?`).get(id);
  return row ? { ...row, tags: JSON.parse(row.tags), platforms: parsePlatforms(row) } : null;
}

function listDirectoryServers() {
  return db.prepare(`SELECT * FROM directory_servers`).all().map((row) => ({ ...row, tags: JSON.parse(row.tags), platforms: parsePlatforms(row) }));
}

function setDirectoryServerMessage(guildId, channelId, messageId) {
  db.prepare(`UPDATE directory_servers SET channel_id = ?, message_id = ? WHERE guild_id = ?`).run(channelId, messageId, guildId);
}

/** pingMs is the RCON request/response round-trip time measured by the caller (see utils/directoryPanel.js's runDirectoryTelemetryTick) - optional since a caller mid-transition (older code not yet passing it) shouldn't crash; just leaves the last known value in place. */
function updateDirectoryTelemetry(guildId, playerCount, maxPlayers, queued, pingMs) {
  if (pingMs === undefined) {
    db.prepare(`UPDATE directory_servers SET player_count = ?, max_players = ?, queued = ?, telemetry_at = ? WHERE guild_id = ?`).run(playerCount, maxPlayers, queued, Date.now(), guildId);
  } else {
    db.prepare(`UPDATE directory_servers SET player_count = ?, max_players = ?, queued = ?, telemetry_at = ?, ping_ms = ? WHERE guild_id = ?`).run(playerCount, maxPlayers, queued, Date.now(), pingMs, guildId);
  }
}

function followDirectoryServer(guildId, discordId) {
  db.prepare(`INSERT INTO directory_follows (guild_id, discord_id, followed_at) VALUES (?, ?, ?) ON CONFLICT(guild_id, discord_id) DO NOTHING`).run(guildId, discordId, Date.now());
}

function unfollowDirectoryServer(guildId, discordId) {
  db.prepare(`DELETE FROM directory_follows WHERE guild_id = ? AND discord_id = ?`).run(guildId, discordId);
}

function isFollowingDirectoryServer(guildId, discordId) {
  return !!db.prepare(`SELECT 1 FROM directory_follows WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId);
}

function getDirectoryFollowerCount(guildId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM directory_follows WHERE guild_id = ?`).get(guildId).n;
}

/** Called from utils/sessionManager.js's createSession - counts toward config/serverAchievements.js's score regardless of whether the Session ever starts/ends (a server DOING the work of scheduling an event is itself the signal). No-op if this guild isn't a registered directory listing. */
function incrementDirectoryServerEventsHosted(guildId) {
  db.prepare(`UPDATE directory_servers SET events_hosted_count = events_hosted_count + 1 WHERE guild_id = ?`).run(guildId);
}

/** Called from utils/sessionManager.js's endSession, only after it actually transitions a Session to 'ended' (never on a no-op/already-ended call). */
function incrementDirectoryServerEventsCompleted(guildId) {
  db.prepare(`UPDATE directory_servers SET events_completed_count = events_completed_count + 1 WHERE guild_id = ?`).run(guildId);
}

function removeDirectoryServer(guildId) {
  db.prepare(`DELETE FROM directory_servers WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM directory_reviews WHERE target_guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM directory_playtime WHERE guild_id = ?`).run(guildId);
}

/** AVG(stars)/COUNT(*) computed live so a review edit/removal is instantly reflected, never a stored-and-stale number. */
function getDirectoryRating(guildId) {
  const row = db.prepare(`SELECT AVG(stars) AS avg_stars, COUNT(*) AS review_count FROM directory_reviews WHERE target_guild_id = ?`).get(guildId);
  return { avgStars: row.avg_stars || 0, reviewCount: row.review_count || 0 };
}

function getDirectoryReview(targetGuildId, reviewerDiscordId) {
  return db.prepare(`SELECT * FROM directory_reviews WHERE target_guild_id = ? AND reviewer_discord_id = ?`).get(targetGuildId, reviewerDiscordId) || null;
}

function upsertDirectoryReview(targetGuildId, reviewerDiscordId, stars, reviewText) {
  db.prepare(
    `INSERT INTO directory_reviews (target_guild_id, reviewer_discord_id, stars, review_text, posted_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(target_guild_id, reviewer_discord_id) DO UPDATE SET stars = excluded.stars, review_text = excluded.review_text, posted_at = excluded.posted_at`
  ).run(targetGuildId, reviewerDiscordId, stars, reviewText, Date.now());
  return getDirectoryReview(targetGuildId, reviewerDiscordId);
}

function setDirectoryReviewMessage(targetGuildId, reviewerDiscordId, messageId) {
  db.prepare(`UPDATE directory_reviews SET message_id = ? WHERE target_guild_id = ? AND reviewer_discord_id = ?`).run(messageId, targetGuildId, reviewerDiscordId);
}

function getDirectoryPlaytime(guildId, gamertag) {
  return db.prepare(`SELECT * FROM directory_playtime WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag)?.minutes || 0;
}

function addDirectoryPlaytime(guildId, gamertag, minutesDelta) {
  db.prepare(
    `INSERT INTO directory_playtime (guild_id, gamertag, minutes, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET minutes = minutes + excluded.minutes, last_seen_at = excluded.last_seen_at`
  ).run(guildId, gamertag, minutesDelta, Date.now());
}

/** Rough "network activity" proxy for Staff Recruitment reputation - how many different KOBA Bot servers this Discord user has ever been rostered on. Not a trust score, just a visibility signal for the poster to judge by. */
function countLinkedGuilds(discordId) {
  return db.prepare(`SELECT COUNT(DISTINCT guild_id) AS n FROM members WHERE discord_id = ?`).get(discordId).n;
}

// ---------------------------------------------------------------------------
// Staff Recruitment Hub (/staff-post) - cross-server, see schema.sql's
// staff_listings header for why this is a separate system from the
// existing per-guild staff_positions/staff_applications.
// ---------------------------------------------------------------------------

function createStaffListing(guildId, { postedBy, positionName, description, requirements }) {
  const info = db
    .prepare(`INSERT INTO staff_listings (guild_id, posted_by, position_name, description, requirements, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)`)
    .run(guildId, postedBy, positionName, description, requirements || "", Date.now());
  return getStaffListing(info.lastInsertRowid);
}

function getStaffListing(id) {
  return db.prepare(`SELECT * FROM staff_listings WHERE id = ?`).get(id) || null;
}

function setStaffListingMessage(id, channelId, messageId) {
  db.prepare(`UPDATE staff_listings SET channel_id = ?, message_id = ? WHERE id = ?`).run(channelId, messageId, id);
}

function listOpenStaffListingsForGuild(guildId) {
  return db.prepare(`SELECT * FROM staff_listings WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC`).all(guildId);
}

function closeStaffListing(id) {
  db.prepare(`UPDATE staff_listings SET status = 'closed' WHERE id = ?`).run(id);
}

function submitStaffApplication(listingId, applicantDiscordId, experience) {
  db.prepare(
    `INSERT INTO staff_network_applications (listing_id, applicant_discord_id, experience, submitted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(listing_id, applicant_discord_id) DO UPDATE SET experience = excluded.experience, submitted_at = excluded.submitted_at`
  ).run(listingId, applicantDiscordId, experience, Date.now());
}

function listStaffApplications(listingId) {
  return db.prepare(`SELECT * FROM staff_network_applications WHERE listing_id = ? ORDER BY submitted_at DESC`).all(listingId);
}

// ---------------------------------------------------------------------------
// Per-map RCON connections (Multi-Server Cluster guilds) - see schema.sql's
// guild_servers header for how this layers on top of the single guild-wide
// default connection instead of replacing it.
// ---------------------------------------------------------------------------

function upsertGuildServer(guildId, serverName, { rconHost, rconPort, rconPassword }) {
  db.prepare(
    `INSERT INTO guild_servers (guild_id, server_name, rcon_host, rcon_port, rcon_password, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, server_name) DO UPDATE SET rcon_host = excluded.rcon_host, rcon_port = excluded.rcon_port, rcon_password = excluded.rcon_password`
  ).run(guildId, serverName, rconHost, rconPort, rconPassword, Date.now());
  return getGuildServer(guildId, serverName);
}

function getGuildServer(guildId, serverName) {
  return db.prepare(`SELECT * FROM guild_servers WHERE guild_id = ? AND server_name = ?`).get(guildId, serverName) || null;
}

function listGuildServers(guildId) {
  return db.prepare(`SELECT * FROM guild_servers WHERE guild_id = ?`).all(guildId);
}

function deleteGuildServer(guildId, serverName) {
  db.prepare(`DELETE FROM guild_servers WHERE guild_id = ? AND server_name = ?`).run(guildId, serverName);
}

function setGuildServerChannel(guildId, serverName, channelId) {
  db.prepare(`UPDATE guild_servers SET player_count_channel_id = ? WHERE guild_id = ? AND server_name = ?`).run(channelId, guildId, serverName);
}

// ---------------------------------------------------------------------------
// Playtime coin-earning tracking (/coin-earn-config)
// ---------------------------------------------------------------------------

function getPlaytimeTracking(guildId, gamertag) {
  return db.prepare(`SELECT * FROM playtime_tracking WHERE guild_id = ? AND gamertag = ?`).get(guildId, gamertag) || null;
}

function upsertPlaytimeTracking(guildId, gamertag, fields) {
  const existing = getPlaytimeTracking(guildId, gamertag);
  const merged = { last_x: null, last_z: null, last_moved_at: null, last_coin_award_at: null, ...existing, ...fields };
  db.prepare(
    `INSERT INTO playtime_tracking (guild_id, gamertag, last_x, last_z, last_moved_at, last_coin_award_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, gamertag) DO UPDATE SET last_x = excluded.last_x, last_z = excluded.last_z, last_moved_at = excluded.last_moved_at, last_coin_award_at = excluded.last_coin_award_at`
  ).run(guildId, gamertag, merged.last_x, merged.last_z, merged.last_moved_at, merged.last_coin_award_at);
}

// ---------------------------------------------------------------------------
// Message styling (/message-style)
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGE_COLOR = "#00FF00";

/** target: 'ingame' (rcon.say, <color>/<b> tags) or 'discord' (embed text, markdown/emoji) - see the PK-rebuild comment above for why these are separate rows now. */
function getMessageStyle(guildId, category, target = "ingame") {
  return (
    db.prepare(`SELECT * FROM message_styles WHERE guild_id = ? AND category = ? AND target = ?`).get(guildId, category, target) || {
      guild_id: guildId,
      category,
      target,
      color_hex: DEFAULT_MESSAGE_COLOR,
      message_template: null,
      size_pt: null,
    }
  );
}

function setMessageStyle(guildId, category, { colorHex, template, sizePt } = {}, target = "ingame") {
  const existing = db.prepare(`SELECT * FROM message_styles WHERE guild_id = ? AND category = ? AND target = ?`).get(guildId, category, target);
  const nextColor = colorHex !== undefined ? colorHex : existing?.color_hex ?? DEFAULT_MESSAGE_COLOR;
  const nextTemplate = template !== undefined ? template : existing?.message_template ?? null;
  const nextSize = sizePt !== undefined ? sizePt : existing?.size_pt ?? null;

  db.prepare(
    `INSERT INTO message_styles (guild_id, category, target, color_hex, message_template, size_pt) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, category, target) DO UPDATE SET color_hex = excluded.color_hex, message_template = excluded.message_template, size_pt = excluded.size_pt`
  ).run(guildId, category, target, nextColor, nextTemplate, nextSize);
}

/** Every category's style row for a guild, both targets - callers filter by .target themselves (see /message-style view). */
function listMessageStyles(guildId) {
  return db.prepare(`SELECT * FROM message_styles WHERE guild_id = ?`).all(guildId);
}

// ---------------------------------------------------------------------------
// Kit registry (/kit-config) - friendly display name -> internal kit name
// ---------------------------------------------------------------------------

function upsertKit(guildId, displayName, internalKitName) {
  db.prepare(
    `INSERT INTO kit_registry (guild_id, display_name, internal_kit_name) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, display_name) DO UPDATE SET internal_kit_name = excluded.internal_kit_name`
  ).run(guildId, displayName, internalKitName);
}

function getKit(guildId, displayName) {
  return db.prepare(`SELECT * FROM kit_registry WHERE guild_id = ? AND display_name = ?`).get(guildId, displayName) || null;
}


function listKits(guildId) {
  return db.prepare(`SELECT * FROM kit_registry WHERE guild_id = ? ORDER BY display_name ASC`).all(guildId);
}

function deleteKit(guildId, displayName) {
  db.prepare(`DELETE FROM kit_registry WHERE guild_id = ? AND display_name = ?`).run(guildId, displayName);
}

/** Per-kit override for delivery/cooldown message + color - NULL fields fall back to the guild's kit_delivery/kit_cooldown category default. */
function setKitStyle(guildId, displayName, type, { message, colorHex } = {}) {
  const field = type === "delivery" ? "delivery" : "cooldown";
  const sets = [];
  const values = { guildId, displayName };
  if (message !== undefined) {
    sets.push(`${field}_message = @${field}_message`);
    values[`${field}_message`] = message;
  }
  if (colorHex !== undefined) {
    sets.push(`${field}_color_hex = @${field}_color_hex`);
    values[`${field}_color_hex`] = colorHex;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE kit_registry SET ${sets.join(", ")} WHERE guild_id = @guildId AND display_name = @displayName`).run(values);
}

/** Player-facing self-claim settings (Kit Claims Drawer, utils/playerPanel.js) - claimable=0 (default) means this kit never shows there at all, same "opt-in per kit" convention as everything else in kit_registry. */
function setKitClaimSettings(guildId, displayName, { claimable, claimCooldownMinutes, requiredRoleId } = {}) {
  const sets = [];
  const values = { guildId, displayName };
  if (claimable !== undefined) {
    sets.push("claimable = @claimable");
    values.claimable = claimable ? 1 : 0;
  }
  if (claimCooldownMinutes !== undefined) {
    sets.push("claim_cooldown_minutes = @claim_cooldown_minutes");
    values.claim_cooldown_minutes = claimCooldownMinutes;
  }
  if (requiredRoleId !== undefined) {
    sets.push("required_role_id = @required_role_id");
    values.required_role_id = requiredRoleId;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE kit_registry SET ${sets.join(", ")} WHERE guild_id = @guildId AND display_name = @displayName`).run(values);
}

/** Every claimable kit a member is allowed to see in the Kit Claims Drawer - required_role_id NULL means everyone; otherwise the member must hold that exact role. */
function listClaimableKitsForMember(guildId, member) {
  return listKits(guildId).filter((k) => k.claimable && (!k.required_role_id || member.roles.cache.has(k.required_role_id)));
}

/** Sets (or clears, passing null) what a kit token costs the RECIPIENT to accept via a player-to-player trade - see schema.sql's role_trade_values header for the same concept applied to roles. No value = free transfer, unchanged from before this feature existed. */
function setKitTradeValue(guildId, displayName, currencyId, value) {
  db.prepare(`UPDATE kit_registry SET trade_value = ?, trade_currency_id = ? WHERE guild_id = ? AND display_name = ?`).run(value, currencyId, guildId, displayName);
}

// ---------------------------------------------------------------------------
// Per-role trade value - see schema.sql's role_trade_values header.
// ---------------------------------------------------------------------------

function setRoleTradeValue(guildId, roleId, currencyId, value) {
  db.prepare(
    `INSERT INTO role_trade_values (guild_id, role_id, currency_id, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, role_id) DO UPDATE SET currency_id = excluded.currency_id, value = excluded.value`
  ).run(guildId, roleId, currencyId, value);
}

function getRoleTradeValue(guildId, roleId) {
  return db.prepare(`SELECT * FROM role_trade_values WHERE guild_id = ? AND role_id = ?`).get(guildId, roleId) || null;
}

function listRoleTradeValues(guildId) {
  return db.prepare(`SELECT * FROM role_trade_values WHERE guild_id = ?`).all(guildId);
}

function removeRoleTradeValue(guildId, roleId) {
  db.prepare(`DELETE FROM role_trade_values WHERE guild_id = ? AND role_id = ?`).run(guildId, roleId);
}

// ---------------------------------------------------------------------------
// Dynamic Adaptive Kit Engine (/autokit-config) - see schema.sql's
// autokit_mappings header. quickchat_id holds the literal chat trigger text.
// ---------------------------------------------------------------------------

const AUTOKIT_FIELD_COLUMNS = {
  kitName: "kit_name",
  displayName: "display_name",
  colorHex: "color_hex",
  deliveryDelaySeconds: "delivery_delay_seconds",
  cooldownMinutes: "cooldown_minutes",
  claimMessageEnabled: "claim_message_enabled",
  cooldownNoticeEnabled: "cooldown_notice_enabled",
  requiredRoleId: "required_role_id",
  serverScope: "server_scope",
  enabled: "enabled",
  bindingType: "binding_type",
  fuelAmount: "fuel_amount",
  mode: "mode",
};

function createAutokitMapping(guildId, trigger, fields = {}) {
  const info = db
    .prepare(`INSERT INTO autokit_mappings (guild_id, quickchat_id, kit_name) VALUES (?, ?, ?)`)
    .run(guildId, trigger, fields.kitName || "");
  if (Object.keys(fields).length) updateAutokitMapping(guildId, info.lastInsertRowid, fields);
  return getAutokitMapping(guildId, info.lastInsertRowid);
}

function updateAutokitMapping(guildId, id, fields) {
  const sets = [];
  const values = { guildId, id };
  for (const [key, column] of Object.entries(AUTOKIT_FIELD_COLUMNS)) {
    if (fields[key] === undefined) continue;
    sets.push(`${column} = @${column}`);
    values[column] = fields[key];
  }
  if (fields.trigger !== undefined) {
    sets.push(`quickchat_id = @quickchat_id`);
    values.quickchat_id = fields.trigger;
  }
  if (!sets.length) return getAutokitMapping(guildId, id);
  db.prepare(`UPDATE autokit_mappings SET ${sets.join(", ")} WHERE guild_id = @guildId AND id = @id`).run(values);
  return getAutokitMapping(guildId, id);
}

function getAutokitMapping(guildId, id) {
  return db.prepare(`SELECT * FROM autokit_mappings WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function listAutokitMappings(guildId) {
  return db.prepare(`SELECT * FROM autokit_mappings WHERE guild_id = ? ORDER BY id ASC`).all(guildId);
}

function deleteAutokitMapping(guildId, id) {
  db.prepare(`DELETE FROM autokit_mappings WHERE guild_id = ? AND id = ?`).run(guildId, id);
  db.prepare(`DELETE FROM autokit_cooldowns WHERE guild_id = ? AND mapping_id = ?`).run(guildId, id);
}

/** Minutes remaining on this player's cooldown for this binding, or 0 if clear/never claimed. */
function getAutokitCooldownRemainingMs(guildId, mappingId, gamertag, cooldownMinutes) {
  if (!cooldownMinutes) return 0;
  const row = db.prepare(`SELECT last_claimed_at FROM autokit_cooldowns WHERE guild_id = ? AND mapping_id = ? AND gamertag = ?`).get(guildId, mappingId, gamertag);
  if (!row) return 0;
  const elapsed = Date.now() - row.last_claimed_at;
  const remaining = cooldownMinutes * 60 * 1000 - elapsed;
  return remaining > 0 ? remaining : 0;
}

function setAutokitCooldown(guildId, mappingId, gamertag) {
  db.prepare(
    `INSERT INTO autokit_cooldowns (guild_id, mapping_id, gamertag, last_claimed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, mapping_id, gamertag) DO UPDATE SET last_claimed_at = excluded.last_claimed_at`
  ).run(guildId, mappingId, gamertag, Date.now());
}

// ---------------------------------------------------------------------------
// Per-player saved Home coordinate - see schema.sql's player_homes header.
// REVIVED 2026-09-19 for the Kit Engine's Teleport Home binding - this
// table (and teleport_waypoints below) already existed from the TP Home
// feature removed 2026-09-10's product pruning pass; reusing the real
// schema (gamertag/set_at columns) rather than inventing a parallel one.
// ---------------------------------------------------------------------------

function setPlayerHome(guildId, discordId, gamertag, x, y, z) {
  db.prepare(
    `INSERT INTO player_homes (guild_id, discord_id, gamertag, x, y, z, set_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id) DO UPDATE SET gamertag = excluded.gamertag, x = excluded.x, y = excluded.y, z = excluded.z, set_at = excluded.set_at`
  ).run(guildId, discordId, gamertag, x, y, z, Date.now());
}

function getPlayerHome(guildId, discordId) {
  return db.prepare(`SELECT * FROM player_homes WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId) || null;
}

// ---------------------------------------------------------------------------
// Admin-set compass-direction teleport destinations - see schema.sql's
// teleport_waypoints header. direction is one of: north, north_east, east,
// south_east, south, south_west, west, north_west (Home is NOT stored here -
// it always resolves to the sender's own player_homes row instead).
// ---------------------------------------------------------------------------

function setTeleportWaypoint(guildId, direction, x, y, z) {
  db.prepare(
    `INSERT INTO teleport_waypoints (guild_id, direction, x, y, z, set_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, direction) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, set_at = excluded.set_at`
  ).run(guildId, direction, x, y, z, Date.now());
}

function getTeleportWaypoint(guildId, direction) {
  return db.prepare(`SELECT * FROM teleport_waypoints WHERE guild_id = ? AND direction = ?`).get(guildId, direction) || null;
}

// ---------------------------------------------------------------------------
// Prison/Jail (Category 6, Phase 2) - see schema.sql's jail_sentences header.
// ---------------------------------------------------------------------------

function createJailSentence(guildId, { gamertag, jailX, jailY, jailZ, originalX, originalY, originalZ, durationMs, jailedBy }) {
  const info = db
    .prepare(
      `INSERT INTO jail_sentences (guild_id, gamertag, jail_x, jail_y, jail_z, original_x, original_y, original_z, started_at, duration_ms, jailed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, gamertag, jailX, jailY, jailZ, originalX ?? null, originalY ?? null, originalZ ?? null, Date.now(), durationMs ?? null, jailedBy);
  return getJailSentence(info.lastInsertRowid);
}

function getJailSentence(id) {
  return db.prepare(`SELECT * FROM jail_sentences WHERE id = ?`).get(id) || null;
}

/** Case-insensitive, matching every other gamertag lookup in this codebase (e.g. getMemberByGamertag). */
function getActiveJailSentence(guildId, gamertag) {
  return (
    db
      .prepare(`SELECT * FROM jail_sentences WHERE guild_id = ? AND released_at IS NULL AND LOWER(gamertag) = LOWER(?) ORDER BY started_at DESC LIMIT 1`)
      .get(guildId, gamertag) || null
  );
}

function listActiveJailSentences(guildId) {
  return db.prepare(`SELECT * FROM jail_sentences WHERE guild_id = ? AND released_at IS NULL ORDER BY started_at ASC`).all(guildId);
}

/** Every still-active sentence across every guild - utils/jailSystem.js's drift-check tick polls this directly rather than looping guilds first, same shape as listDueZoneEvents/listDueTempRoleGrants. */
function listAllActiveJailSentences() {
  return db.prepare(`SELECT * FROM jail_sentences WHERE released_at IS NULL`).all();
}

/** Sentences with a duration whose clock has already run out and haven't been auto-released yet. */
function listDueJailSentences() {
  return db.prepare(`SELECT * FROM jail_sentences WHERE released_at IS NULL AND duration_ms IS NOT NULL AND started_at + duration_ms <= ?`).all(Date.now());
}

function releaseJailSentence(id, releasedBy) {
  db.prepare(`UPDATE jail_sentences SET released_at = ?, released_by = ? WHERE id = ?`).run(Date.now(), releasedBy ?? null, id);
}

// ---------------------------------------------------------------------------
// Per-guild Games Panel access control (/games-panel Configure) - see
// schema.sql's game_settings header.
// ---------------------------------------------------------------------------

function getGameSettings(guildId, gameKey) {
  return db.prepare(`SELECT * FROM game_settings WHERE guild_id = ? AND game_key = ?`).get(guildId, gameKey) || { guild_id: guildId, game_key: gameKey, enabled: 1, required_role_id: null };
}

function listGameSettings(guildId) {
  return db.prepare(`SELECT * FROM game_settings WHERE guild_id = ?`).all(guildId);
}

function setGameEnabled(guildId, gameKey, enabled) {
  db.prepare(
    `INSERT INTO game_settings (guild_id, game_key, enabled) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, game_key) DO UPDATE SET enabled = excluded.enabled`
  ).run(guildId, gameKey, enabled ? 1 : 0);
}

function setGameRequiredRole(guildId, gameKey, roleId) {
  db.prepare(
    `INSERT INTO game_settings (guild_id, game_key, required_role_id) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, game_key) DO UPDATE SET required_role_id = excluded.required_role_id`
  ).run(guildId, gameKey, roleId);
}

/** Claim-cooldown lookup - used by the kit-token redeem flow (player-panel.js) so re-redeeming the same token/kit combo is caught. */
function getKitClaimRecord(guildId, gamertag, internalKitName) {
  return db.prepare(`SELECT * FROM kit_claims WHERE guild_id = ? AND gamertag = ? AND internal_kit_name = ?`).get(guildId, gamertag, internalKitName) || null;
}

function recordKitClaim(guildId, gamertag, internalKitName, via) {
  db.prepare(
    `INSERT INTO kit_claims (guild_id, gamertag, internal_kit_name, claimed_at, claimed_via) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, gamertag, internal_kit_name) DO UPDATE SET claimed_at = excluded.claimed_at, claimed_via = excluded.claimed_via`
  ).run(guildId, gamertag, internalKitName, Date.now(), via);
}

/** Player web dashboard - claim history for one (guild, gamertag) pair, newest first. Kit claims are keyed by gamertag, not discord_id, so the dashboard calls this once per membership row. */
function listKitClaimsFor(guildId, gamertag) {
  return db.prepare(`SELECT * FROM kit_claims WHERE guild_id = ? AND gamertag = ? ORDER BY claimed_at DESC`).all(guildId, gamertag);
}

// ---------------------------------------------------------------------------
// Kit claim tokens - transferable Discord-side "items" created by giving a
// kit (see schema.sql). A token isn't delivered over RCON until redeemed.
// ---------------------------------------------------------------------------

function createKitClaimToken(guildId, internalKitName, displayName, holderDiscordId) {
  const info = db
    .prepare(`INSERT INTO kit_claim_tokens (guild_id, internal_kit_name, display_name, holder_discord_id, status, created_at) VALUES (?, ?, ?, ?, 'held', ?)`)
    .run(guildId, internalKitName, displayName, holderDiscordId, Date.now());
  return getKitClaimToken(info.lastInsertRowid);
}

function getKitClaimToken(id) {
  return db.prepare(`SELECT * FROM kit_claim_tokens WHERE id = ?`).get(id) || null;
}

function listHeldTokens(guildId, holderDiscordId) {
  return db.prepare(`SELECT * FROM kit_claim_tokens WHERE guild_id = ? AND holder_discord_id = ? AND status = 'held' ORDER BY created_at ASC`).all(guildId, holderDiscordId);
}

function transferKitClaimToken(id, newHolderId) {
  db.prepare(`UPDATE kit_claim_tokens SET holder_discord_id = ? WHERE id = ? AND status = 'held'`).run(newHolderId, id);
}

function redeemKitClaimToken(id) {
  db.prepare(`UPDATE kit_claim_tokens SET status = 'redeemed', redeemed_at = ? WHERE id = ? AND status = 'held'`).run(Date.now(), id);
}

// ---------------------------------------------------------------------------
// Auto-event scheduler configs (/auto-event-config) - see schema.sql for the
// last_triggered_at semantics (only advances on an actual fire).
// ---------------------------------------------------------------------------

function createAutoEvent(guildId, fields) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO auto_events (guild_id, config_name, event_name, zone_name, center_x, center_y, center_z, radius, duration_minutes, reward_material, reward_qty, color_hex, ingame_message, discord_message, min_players, interval_minutes, enabled, created_by, created_at)
     VALUES (@guildId, @configName, @eventName, @zoneName, @centerX, @centerY, @centerZ, @radius, @durationMinutes, @rewardMaterial, @rewardQty, @colorHex, @ingameMessage, @discordMessage, @minPlayers, @intervalMinutes, 1, @createdBy, @now)
     ON CONFLICT(guild_id, config_name) DO UPDATE SET
       event_name = excluded.event_name, zone_name = excluded.zone_name, center_x = excluded.center_x,
       center_y = excluded.center_y, center_z = excluded.center_z, radius = excluded.radius,
       duration_minutes = excluded.duration_minutes, reward_material = excluded.reward_material,
       reward_qty = excluded.reward_qty, color_hex = excluded.color_hex, ingame_message = excluded.ingame_message,
       discord_message = excluded.discord_message, min_players = excluded.min_players, interval_minutes = excluded.interval_minutes`
  ).run({ guildId, now, ...fields });
  return getAutoEvent(guildId, fields.configName);
}

function getAutoEvent(guildId, configName) {
  return db.prepare(`SELECT * FROM auto_events WHERE guild_id = ? AND config_name = ?`).get(guildId, configName) || null;
}

function listAutoEvents(guildId) {
  return db.prepare(`SELECT * FROM auto_events WHERE guild_id = ? ORDER BY config_name ASC`).all(guildId);
}

function listEnabledAutoEvents(guildId) {
  return db.prepare(`SELECT * FROM auto_events WHERE guild_id = ? AND enabled = 1`).all(guildId);
}

function deleteAutoEvent(guildId, configName) {
  db.prepare(`DELETE FROM auto_events WHERE guild_id = ? AND config_name = ?`).run(guildId, configName);
}

function setAutoEventEnabled(guildId, configName, enabled) {
  db.prepare(`UPDATE auto_events SET enabled = ? WHERE guild_id = ? AND config_name = ?`).run(enabled ? 1 : 0, guildId, configName);
}

function markAutoEventTriggered(id, timestamp) {
  db.prepare(`UPDATE auto_events SET last_triggered_at = ? WHERE id = ?`).run(timestamp, id);
}

// ---------------------------------------------------------------------------
// Auto-message scheduler (/auto-message-config) - see schema.sql for
// last_triggered_at/last_sent_at semantics (only advances on an actual send).
// ---------------------------------------------------------------------------

function createAutoMessage(guildId, fields) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO auto_messages (guild_id, config_name, message_text, color_hex, size_pt, schedule_type, interval_seconds, cron_expression, enabled, created_by, created_at)
     VALUES (@guildId, @configName, @messageText, @colorHex, @sizePt, @scheduleType, @intervalSeconds, @cronExpression, 1, @createdBy, @now)
     ON CONFLICT(guild_id, config_name) DO UPDATE SET
       message_text = excluded.message_text, color_hex = excluded.color_hex, size_pt = excluded.size_pt,
       schedule_type = excluded.schedule_type, interval_seconds = excluded.interval_seconds, cron_expression = excluded.cron_expression`
  ).run({
    guildId,
    now,
    colorHex: null,
    sizePt: null,
    intervalSeconds: null,
    cronExpression: null,
    ...fields,
  });
  return getAutoMessage(guildId, fields.configName);
}

function getAutoMessage(guildId, configName) {
  return db.prepare(`SELECT * FROM auto_messages WHERE guild_id = ? AND config_name = ?`).get(guildId, configName) || null;
}

function listAutoMessages(guildId) {
  return db.prepare(`SELECT * FROM auto_messages WHERE guild_id = ? ORDER BY config_name ASC`).all(guildId);
}

function listEnabledAutoMessages(guildId) {
  return db.prepare(`SELECT * FROM auto_messages WHERE guild_id = ? AND enabled = 1`).all(guildId);
}

function deleteAutoMessage(guildId, configName) {
  db.prepare(`DELETE FROM auto_messages WHERE guild_id = ? AND config_name = ?`).run(guildId, configName);
}

function setAutoMessageEnabled(guildId, configName, enabled) {
  db.prepare(`UPDATE auto_messages SET enabled = ? WHERE guild_id = ? AND config_name = ?`).run(enabled ? 1 : 0, guildId, configName);
}

function markAutoMessageSent(id, timestamp) {
  db.prepare(`UPDATE auto_messages SET last_sent_at = ? WHERE id = ?`).run(timestamp, id);
}

// ---------------------------------------------------------------------------
// Wars (/declare-war)
// ---------------------------------------------------------------------------

function getActiveWarForTeam(guildId, teamName) {
  return db.prepare(`SELECT * FROM wars WHERE guild_id = ? AND status = 'active' AND (team_a = ? OR team_b = ?)`).get(guildId, teamName, teamName) || null;
}

function declareWar(guildId, teamA, teamB, declaredBy) {
  const result = db
    .prepare(`INSERT INTO wars (guild_id, team_a, team_b, declared_by, status, declared_at) VALUES (?, ?, ?, ?, 'active', ?)`)
    .run(guildId, teamA, teamB, declaredBy, Date.now());
  return db.prepare(`SELECT * FROM wars WHERE id = ?`).get(result.lastInsertRowid);
}

function endWar(warId, winner) {
  db.prepare(`UPDATE wars SET status = 'ended', winner = ?, ended_at = ? WHERE id = ?`).run(winner || null, Date.now(), warId);
}

function listWarHistory(guildId, teamName, limit = 10) {
  return db.prepare(`SELECT * FROM wars WHERE guild_id = ? AND (team_a = ? OR team_b = ?) ORDER BY declared_at DESC LIMIT ?`).all(guildId, teamName, teamName, limit);
}

// ---------------------------------------------------------------------------
// Rival System (utils/rivalSystem.js, utils/challengeEngine.js)
// ---------------------------------------------------------------------------

/** Canonical (sorted) pair order - the ONE thing every rivalship read/write must agree on, so "A+B" and "B+A" can never diverge into two separate rows. */
function normalizeRivalPair(discordIdX, discordIdY) {
  return discordIdX < discordIdY ? [discordIdX, discordIdY] : [discordIdY, discordIdX];
}

function getRivalship(guildId, discordIdX, discordIdY) {
  const [a, b] = normalizeRivalPair(discordIdX, discordIdY);
  return db.prepare(`SELECT * FROM rivalships WHERE guild_id = ? AND player_a = ? AND player_b = ?`).get(guildId, a, b) || null;
}

function getRivalshipById(guildId, id) {
  return db.prepare(`SELECT * FROM rivalships WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

/** Creates a PENDING rivalship request - throws if one already exists (any status) for this pair, since reactivation (see reactivateRivalship below) is the correct path for a previously-ended one, not a second row (spec section 77/57). */
function createRivalshipRequest(guildId, requestedBy, discordIdX, discordIdY) {
  const [a, b] = normalizeRivalPair(discordIdX, discordIdY);
  const existing = getRivalship(guildId, a, b);
  if (existing) throw new Error("A rivalship already exists for this pair.");
  const info = db
    .prepare(`INSERT INTO rivalships (guild_id, player_a, player_b, status, requested_by, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`)
    .run(guildId, a, b, requestedBy, Date.now());
  db.prepare(`INSERT INTO rivalship_stats (rivalship_id) VALUES (?)`).run(info.lastInsertRowid);
  return getRivalshipById(guildId, info.lastInsertRowid);
}

function acceptRivalshipRequest(id) {
  db.prepare(`UPDATE rivalships SET status = 'active' WHERE id = ? AND status = 'pending'`).run(id);
}

/** Declining a request DELETES it outright (unlike ending an active rivalship, below) - a declined request never happened as far as history is concerned; there's nothing worth preserving. */
function declineRivalshipRequest(id) {
  db.prepare(`DELETE FROM rivalship_stats WHERE rivalship_id = ?`).run(id);
  db.prepare(`DELETE FROM rivalships WHERE id = ? AND status = 'pending'`).run(id);
}

/** Ends an ACTIVE rivalship - status only, row + stats + history are kept forever (spec section 56: "historical Rival statistics will remain available"). */
function endRivalship(id) {
  db.prepare(`UPDATE rivalships SET status = 'ended', ended_at = ? WHERE id = ?`).run(Date.now(), id);
}

/** Two players becoming Rivals again after a previous rivalship ended - reactivates the SAME row (and its existing stats/history) rather than creating a new, disconnected one (spec section 57). */
function reactivateRivalship(id) {
  db.prepare(`UPDATE rivalships SET status = 'active', ended_at = NULL WHERE id = ? AND status = 'ended'`).run(id);
}

function listRivalshipsForPlayer(guildId, discordId, status = "active") {
  return db
    .prepare(`SELECT * FROM rivalships WHERE guild_id = ? AND status = ? AND (player_a = ? OR player_b = ?) ORDER BY created_at DESC`)
    .all(guildId, status, discordId, discordId);
}

function getRivalshipStats(rivalshipId) {
  return db.prepare(`SELECT * FROM rivalship_stats WHERE rivalship_id = ?`).get(rivalshipId) || null;
}

/** Applies one settled Challenge's result to its rivalship's aggregate stats - winnerId/loserId are null on a push (refund, no head-to-head impact beyond the wagered total). */
function recordRivalshipMatch(rivalshipId, { guildId, challengeId, currencyId, stakeAmount, potAmount, feeAmount, winnerId, loserId }) {
  const rivalship = db.prepare(`SELECT * FROM rivalships WHERE id = ?`).get(rivalshipId);
  const stats = getRivalshipStats(rivalshipId);
  const now = Date.now();

  db.prepare(
    `INSERT INTO rivalship_matches (rivalship_id, guild_id, challenge_id, currency_id, stake_amount, pot_amount, fee_amount, winner, loser, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(rivalshipId, guildId, challengeId, currencyId, stakeAmount, potAmount, feeAmount, winnerId || null, loserId || null, now);

  if (!winnerId) {
    // Push - only the wagered total moves, no wins/streak change.
    db.prepare(`UPDATE rivalship_stats SET total_wagered = total_wagered + ?, last_match_at = ? WHERE rivalship_id = ?`).run(stakeAmount * 2, now, rivalshipId);
    return;
  }

  const winnerIsA = winnerId === rivalship.player_a;
  const sameStreakHolder = stats.current_streak_holder === winnerId;
  const newStreakCount = sameStreakHolder ? stats.current_streak_count + 1 : 1;
  const newBestA = winnerIsA ? Math.max(stats.best_streak_a, newStreakCount) : stats.best_streak_a;
  const newBestB = !winnerIsA ? Math.max(stats.best_streak_b, newStreakCount) : stats.best_streak_b;

  db.prepare(
    `UPDATE rivalship_stats SET
       wins_a = wins_a + ?, wins_b = wins_b + ?,
       current_streak_holder = ?, current_streak_count = ?,
       best_streak_a = ?, best_streak_b = ?,
       total_wagered = total_wagered + ?, last_match_at = ?, last_winner = ?
     WHERE rivalship_id = ?`
  ).run(winnerIsA ? 1 : 0, winnerIsA ? 0 : 1, winnerId, newStreakCount, newBestA, newBestB, stakeAmount * 2, now, winnerId, rivalshipId);
}

function listRivalshipMatches(rivalshipId, limit = 10) {
  return db.prepare(`SELECT * FROM rivalship_matches WHERE rivalship_id = ? ORDER BY completed_at DESC LIMIT ?`).all(rivalshipId, limit);
}

// --- Challenges ---

function createChallenge(guildId, challengerId, opponentId, currencyId, stakeAmount, expiresAt, rivalshipId, killTarget = 5) {
  const info = db
    .prepare(
      `INSERT INTO challenges (guild_id, challenger_id, opponent_id, currency_id, stake_amount, status, rivalship_id, created_at, expires_at, kill_target)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`
    )
    .run(guildId, challengerId, opponentId, currencyId, stakeAmount, rivalshipId || null, Date.now(), expiresAt, killTarget);
  return getChallenge(guildId, info.lastInsertRowid);
}

function getChallenge(guildId, id) {
  return db.prepare(`SELECT * FROM challenges WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

/**
 * Atomic OPEN -> terminal/ACCEPTED transition guarded by the WHERE clause
 * itself (spec section 55, the expiration race) - `changes` tells the
 * caller whether ITS transition actually won; if another call already
 * moved the row out of OPEN (accepted, declined, expired, cancelled -
 * whichever happened first), this one silently does nothing and reports
 * failure rather than racing to overwrite a decision that already happened.
 */
function tryTransitionChallenge(id, fromStatus, toStatus, extraFields = {}) {
  const setClauses = Object.keys(extraFields)
    .map((k) => `${k} = ?`)
    .join(", ");
  const sql = `UPDATE challenges SET status = ?${setClauses ? ", " + setClauses : ""} WHERE id = ? AND status = ?`;
  const info = db.prepare(sql).run(toStatus, ...Object.values(extraFields), id, fromStatus);
  return info.changes > 0;
}

/** Cross-guild - the background expiry tick doesn't iterate guilds itself, same pattern as auctionPanel.js's listDueAuctions(). */
function listExpiredOpenChallenges(now = Date.now()) {
  return db.prepare(`SELECT * FROM challenges WHERE status = 'OPEN' AND expires_at <= ?`).all(now);
}

// --- Challenge duels (utils/duelTracker.js) - live kill tracking for an ACCEPTED Challenge ---

function createChallengeDuel(guildId, challengeId, challengerGamertag, opponentGamertag, killTarget, expiresAt) {
  const info = db
    .prepare(
      `INSERT INTO challenge_duels (guild_id, challenge_id, challenger_gamertag, opponent_gamertag, kill_target, started_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, challengeId, challengerGamertag, opponentGamertag, killTarget, Date.now(), expiresAt);
  return getChallengeDuel(info.lastInsertRowid);
}

function getChallengeDuel(id) {
  return db.prepare(`SELECT * FROM challenge_duels WHERE id = ?`).get(id) || null;
}

function getChallengeDuelByChallengeId(challengeId) {
  return db.prepare(`SELECT * FROM challenge_duels WHERE challenge_id = ?`).get(challengeId) || null;
}

/** Every live duel for one guild - utils/duelTracker.js scans this list against each incoming PVP_KILL combat event (cheap: a handful of rows at most, same scale as pvp_rivalries). */
function listActiveChallengeDuels(guildId) {
  return db.prepare(`SELECT * FROM challenge_duels WHERE guild_id = ?`).all(guildId);
}

/** Cross-guild - the background expiry tick doesn't iterate guilds itself, same pattern as listExpiredOpenChallenges/listExpiredOpenBounties. */
function listExpiredChallengeDuels(now = Date.now()) {
  return db.prepare(`SELECT * FROM challenge_duels WHERE expires_at <= ?`).all(now);
}

function incrementDuelKills(id, side) {
  const column = side === "challenger" ? "challenger_kills" : "opponent_kills";
  db.prepare(`UPDATE challenge_duels SET ${column} = ${column} + 1 WHERE id = ?`).run(id);
  return getChallengeDuel(id);
}

/** Locks a live duel to the Rust server its first real kill happened on - see challenge_duels.server_name's schema.sql comment. Only ever sets it once (WHERE server_name IS NULL); a second call for the same duel is a no-op, not a re-lock. */
function bindChallengeDuelServer(id, serverName) {
  db.prepare(`UPDATE challenge_duels SET server_name = ? WHERE id = ? AND server_name IS NULL`).run(serverName, id);
  return getChallengeDuel(id);
}

function deleteChallengeDuel(id) {
  db.prepare(`DELETE FROM challenge_duels WHERE id = ?`).run(id);
}

/**
 * Server-wipe progression reset (see commands/wipe.js) - clears every
 * player's xp/lifetime_xp/level/prestige row for the guild on a real Rust
 * server wipe. Deliberately leaves xp_events alone (the idempotency ledger
 * behind awardXp's duplicate-award protection) - it's a historical event
 * log, not the player-facing progression state, and future XP awards use
 * fresh sourceIds from post-wipe events anyway so nothing about leaving it
 * in place causes a stuck/duplicate-blocked award after the reset.
 */
function resetAllProgression(guildId) {
  db.prepare(`DELETE FROM player_progression WHERE guild_id = ?`).run(guildId);
}

function listOpenChallengesAgainst(guildId, opponentId) {
  return db.prepare(`SELECT * FROM challenges WHERE guild_id = ? AND opponent_id = ? AND status = 'OPEN'`).all(guildId, opponentId);
}

// ---------------------------------------------------------------------------
// Progression System (utils/progression.js, utils/sessionManager.js)
// ---------------------------------------------------------------------------

/** Unset fields fall back to these documented defaults (spec: "do not hard-code the XP curve" - these ARE the configurable defaults, applied at read-time, not baked into the schema). Level N requires xpCurveBase * N^xpCurveGrowth XP (incremental, not cumulative) to climb from N-1 to N. */
function getXpCurveConfig(guildId) {
  const meta = getGuildMeta(guildId);
  return {
    base: meta?.xp_curve_base ?? 1000,
    growth: meta?.xp_curve_growth ?? 1.08,
    maxLevel: meta?.xp_max_level ?? 100,
    maxPrestige: meta?.xp_max_prestige ?? 10,
  };
}

function setXpCurveConfig(guildId, { base, growth, maxLevel, maxPrestige }) {
  upsertGuildMeta(guildId, { xp_curve_base: base, xp_curve_growth: growth, xp_max_level: maxLevel, xp_max_prestige: maxPrestige });
}

// Documented defaults, in the same rough proportion as the spec's own
// example numbers (section 7) - a "win" is worth more than a bare
// "completion", a Challenge win worth more than a solo game win.
const XP_SOURCE_DEFAULTS = { game_completion: 25, game_win: 100, pvp_kill: 50, pve_kill: 20, challenge_win: 150 };
const POINTS_SOURCE_DEFAULTS = { game_completion: 10, game_win: 40, pvp_kill: 20, pve_kill: 10, challenge_win: 60 };

function getXpSourceAmount(guildId, sourceType) {
  const meta = getGuildMeta(guildId);
  const column = `xp_per_${sourceType}`;
  return meta?.[column] ?? XP_SOURCE_DEFAULTS[sourceType] ?? 0;
}

function getPointsSourceAmount(guildId, sourceType) {
  const meta = getGuildMeta(guildId);
  const column = `points_per_${sourceType}`;
  return meta?.[column] ?? POINTS_SOURCE_DEFAULTS[sourceType] ?? 0;
}

function setXpSourceAmount(guildId, sourceType, amount) {
  upsertGuildMeta(guildId, { [`xp_per_${sourceType}`]: amount });
}

function setPointsSourceAmount(guildId, sourceType, amount) {
  upsertGuildMeta(guildId, { [`points_per_${sourceType}`]: amount });
}

function getPlayerProgression(guildId, discordId) {
  return (
    db.prepare(`SELECT * FROM player_progression WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId) || {
      guild_id: guildId,
      discord_id: discordId,
      xp: 0,
      lifetime_xp: 0,
      level: 1,
      prestige: 0,
      updated_at: null,
    }
  );
}

/** Koba-rivals (admin/rivalsApi.js) - same cross-guild stopgap as getBestKnownEloRating/getBestKnownPvpStreak: player_progression is tracked per-guild, so this picks the single row with the most lifetime_xp (the clearest "most total real progress" signal) rather than mixing a level from one guild with a prestige from another. */
function getBestKnownProgression(discordId) {
  return (
    db.prepare(`SELECT * FROM player_progression WHERE discord_id = ? ORDER BY lifetime_xp DESC LIMIT 1`).get(discordId) || {
      discord_id: discordId,
      xp: 0,
      lifetime_xp: 0,
      level: 1,
      prestige: 0,
      updated_at: null,
    }
  );
}

function upsertPlayerProgression(guildId, discordId, { xp, lifetimeXp, level, prestige }) {
  db.prepare(
    `INSERT INTO player_progression (guild_id, discord_id, xp, lifetime_xp, level, prestige, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id) DO UPDATE SET xp = excluded.xp, lifetime_xp = excluded.lifetime_xp, level = excluded.level, prestige = excluded.prestige, updated_at = excluded.updated_at`
  ).run(guildId, discordId, xp, lifetimeXp, level, prestige, Date.now());
}

/**
 * Idempotent XP award (spec section 5) - returns { awarded: false } with no
 * DB mutation at all if this exact (discord_id, source_type, source_id)
 * combination already awarded XP once before (the unique index on
 * xp_events is the actual enforcement; INSERT OR IGNORE + changes===0 is
 * how the caller finds out it was a no-op).
 */
function recordXpEvent(guildId, discordId, amount, sourceType, sourceId) {
  const info = db
    .prepare(`INSERT OR IGNORE INTO xp_events (guild_id, discord_id, amount, source_type, source_id, awarded_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(guildId, discordId, amount, sourceType, String(sourceId), Date.now());
  return info.changes > 0;
}

function getServerBadges(guildId) {
  return db.prepare(`SELECT * FROM server_badges WHERE guild_id = ?`).all(guildId);
}

function getServerBadgesByCondition(guildId, conditionType) {
  return db.prepare(`SELECT * FROM server_badges WHERE guild_id = ? AND condition_type = ?`).all(guildId, conditionType);
}

function createServerBadge(guildId, { name, icon, description, conditionType, conditionValue }) {
  const info = db
    .prepare(`INSERT INTO server_badges (guild_id, name, icon, description, condition_type, condition_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(guildId, name, icon || null, description || null, conditionType || "manual", conditionValue != null ? String(conditionValue) : null, Date.now());
  return db.prepare(`SELECT * FROM server_badges WHERE id = ?`).get(info.lastInsertRowid);
}

/** Idempotent - a badge can only ever be awarded once per player (the PRIMARY KEY on player_badges enforces this), regardless of how many times an automatic condition re-fires. Returns true only if this call actually granted it (false = already had it). */
function awardBadge(guildId, discordId, badgeId) {
  const info = db.prepare(`INSERT OR IGNORE INTO player_badges (guild_id, discord_id, badge_id, awarded_at) VALUES (?, ?, ?, ?)`).run(guildId, discordId, badgeId, Date.now());
  return info.changes > 0;
}

function listPlayerBadges(guildId, discordId) {
  return db
    .prepare(`SELECT sb.* FROM player_badges pb JOIN server_badges sb ON sb.id = pb.badge_id WHERE pb.guild_id = ? AND pb.discord_id = ? ORDER BY pb.awarded_at DESC`)
    .all(guildId, discordId);
}

function hasBadge(guildId, discordId, badgeId) {
  return !!db.prepare(`SELECT 1 FROM player_badges WHERE guild_id = ? AND discord_id = ? AND badge_id = ?`).get(guildId, discordId, badgeId);
}

// --- Sessions ---

function createSession(guildId, name, startsAt, endsAt) {
  const info = db.prepare(`INSERT INTO sessions (guild_id, name, status, starts_at, ends_at, created_at) VALUES (?, ?, 'scheduled', ?, ?, ?)`).run(guildId, name, startsAt || null, endsAt || null, Date.now());
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(info.lastInsertRowid);
}

function getSession(guildId, id) {
  return db.prepare(`SELECT * FROM sessions WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function getActiveSession(guildId) {
  return db.prepare(`SELECT * FROM sessions WHERE guild_id = ? AND status = 'active'`).get(guildId) || null;
}

/** Idempotent - a session that's already active/ended is left alone (WHERE status='scheduled' guards it), so a duplicate scheduler firing can never double-start the same session (spec section 11). */
function activateSession(guildId, sessionId) {
  return db.prepare(`UPDATE sessions SET status = 'active' WHERE guild_id = ? AND id = ? AND status = 'scheduled'`).run(guildId, sessionId).changes > 0;
}

function endSession(guildId, sessionId) {
  return db.prepare(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE guild_id = ? AND id = ? AND status = 'active'`).run(Date.now(), guildId, sessionId).changes > 0;
}

function listSessionHistory(guildId, limit = 10) {
  return db.prepare(`SELECT * FROM sessions WHERE guild_id = ? AND status = 'ended' ORDER BY ended_at DESC LIMIT ?`).all(guildId, limit);
}

function listDueScheduledSessions(now = Date.now()) {
  return db.prepare(`SELECT * FROM sessions WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ?`).all(now);
}

function listDueActiveSessions(now = Date.now()) {
  return db.prepare(`SELECT * FROM sessions WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?`).all(now);
}

/** Idempotent Points award, same shape/reasoning as recordXpEvent above - a no-op (false) if this exact source event already awarded points to this player in this session before. */
function recordSessionPointEvent(guildId, sessionId, discordId, amount, sourceType, sourceId) {
  const info = db
    .prepare(`INSERT OR IGNORE INTO session_point_events (guild_id, session_id, discord_id, amount, source_type, source_id, awarded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(guildId, sessionId, discordId, amount, sourceType, String(sourceId), Date.now());
  return info.changes > 0;
}

function addSessionPoints(guildId, sessionId, discordId, amount) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO session_points (guild_id, session_id, discord_id, points, last_point_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, session_id, discord_id) DO UPDATE SET points = points + excluded.points, last_point_at = excluded.last_point_at`
  ).run(guildId, sessionId, discordId, amount, now);
}

function getSessionPoints(guildId, sessionId, discordId) {
  return db.prepare(`SELECT * FROM session_points WHERE guild_id = ? AND session_id = ? AND discord_id = ?`).get(guildId, sessionId, discordId) || { points: 0, last_point_at: null };
}

/** Points DESC, then earliest-achieved-first as the tie-break (spec section 37 - "time the score was achieved"; the "secondary configured statistic" tier is intentionally skipped, see utils/sessionManager.js's header for why), then discord_id as a final fully-deterministic tiebreak. */
function getSessionLeaderboard(guildId, sessionId, limit = 10) {
  return db.prepare(`SELECT * FROM session_points WHERE guild_id = ? AND session_id = ? ORDER BY points DESC, last_point_at ASC, discord_id ASC LIMIT ?`).all(guildId, sessionId, limit);
}

/** 1-indexed leaderboard position - computed on demand (never stored), per the spec's explicit "do not store Rank as an independent permanent statistic" guidance. Same ordering as getSessionLeaderboard. */
function getSessionRank(guildId, sessionId, discordId) {
  const me = getSessionPoints(guildId, sessionId, discordId);
  const ahead = db
    .prepare(
      `SELECT COUNT(*) AS n FROM session_points WHERE guild_id = ? AND session_id = ?
       AND (points > ? OR (points = ? AND (last_point_at < ? OR (last_point_at = ? AND discord_id < ?))))`
    )
    .get(guildId, sessionId, me.points, me.points, me.last_point_at ?? Number.MAX_SAFE_INTEGER, me.last_point_at ?? Number.MAX_SAFE_INTEGER, discordId).n;
  return ahead + 1;
}

function getPlayersNearRank(guildId, sessionId, discordId, spread = 1) {
  const rows = getSessionLeaderboard(guildId, sessionId, 10000); // session populations are small (guild-scoped); a full scan here is cheap and keeps the "near rank" window trivially correct
  const myIndex = rows.findIndex((r) => r.discord_id === discordId);
  if (myIndex === -1) return [];
  return rows.slice(Math.max(0, myIndex - spread), myIndex + spread + 1);
}

// ---------------------------------------------------------------------------
// Server Rivalry (utils/serverRivalry.js)
// ---------------------------------------------------------------------------

function normalizeServerPair(guildIdX, guildIdY) {
  return guildIdX < guildIdY ? [guildIdX, guildIdY] : [guildIdY, guildIdX];
}

function getServerRivalry(guildIdX, guildIdY) {
  const [a, b] = normalizeServerPair(guildIdX, guildIdY);
  return db.prepare(`SELECT * FROM server_rivalries WHERE guild_a = ? AND guild_b = ?`).get(a, b) || null;
}

function getServerRivalryById(id) {
  return db.prepare(`SELECT * FROM server_rivalries WHERE id = ?`).get(id) || null;
}

/** A guild's own currently active/pending rivalry, if any - enforces the "one active rivalry per guild" rule (mirrors getActiveSession's per-guild uniqueness). */
function getActiveServerRivalryFor(guildId) {
  return db.prepare(`SELECT * FROM server_rivalries WHERE (guild_a = ? OR guild_b = ?) AND status IN ('pending', 'active')`).get(guildId, guildId) || null;
}

function createServerRivalryInvitation(guildIdX, guildIdY, invitedBy) {
  const [a, b] = normalizeServerPair(guildIdX, guildIdY);
  const existing = getServerRivalry(a, b);
  if (existing) throw new Error("A rivalry already exists between these servers.");
  const info = db.prepare(`INSERT INTO server_rivalries (guild_a, guild_b, status, invited_by, created_at) VALUES (?, ?, 'pending', ?, ?)`).run(a, b, invitedBy, Date.now());
  db.prepare(`INSERT INTO server_rivalry_stats (rivalry_id) VALUES (?)`).run(info.lastInsertRowid);
  return getServerRivalryById(info.lastInsertRowid);
}

function activateServerRivalry(id) {
  return db.prepare(`UPDATE server_rivalries SET status = 'active' WHERE id = ? AND status = 'pending'`).run(id).changes > 0;
}

function declineServerRivalryInvitation(id) {
  db.prepare(`DELETE FROM server_rivalry_stats WHERE rivalry_id = ?`).run(id);
  db.prepare(`DELETE FROM server_rivalries WHERE id = ? AND status = 'pending'`).run(id);
}

function endServerRivalry(id) {
  return db.prepare(`UPDATE server_rivalries SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'`).run(Date.now(), id).changes > 0;
}

/** Ownership-conflict discovery (spec section 24) - a distinct terminal status from a normal "ended" rivalry, so history can honestly show WHY it stopped. */
function voidServerRivalry(id, reason) {
  return db.prepare(`UPDATE server_rivalries SET status = 'voided', ended_at = ?, void_reason = ? WHERE id = ? AND status IN ('pending', 'active')`).run(Date.now(), reason, id).changes > 0;
}

function listActiveServerRivalries() {
  return db.prepare(`SELECT * FROM server_rivalries WHERE status IN ('pending', 'active')`).all();
}

function getServerRivalryStats(rivalryId) {
  return db.prepare(`SELECT * FROM server_rivalry_stats WHERE rivalry_id = ?`).get(rivalryId) || null;
}

/** Idempotent score award - same fingerprint-style dedup as xp_events/session_point_events. */
function recordServerRivalryEvent(rivalryId, guildId, points, sourceType, sourceId) {
  const info = db
    .prepare(`INSERT OR IGNORE INTO server_rivalry_events (rivalry_id, guild_id, source_type, source_id, points, awarded_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(rivalryId, guildId, sourceType, String(sourceId), points, Date.now());
  if (info.changes === 0) return false;

  const rivalry = getServerRivalryById(rivalryId);
  const isA = rivalry.guild_a === guildId;
  const winCol = sourceType === "game_win" ? "game_wins" : sourceType === "challenge_win" ? "challenge_wins" : sourceType === "clan_war_win" ? "clan_war_wins" : null;
  const setClauses = [`score_${isA ? "a" : "b"} = score_${isA ? "a" : "b"} + ?`];
  const params = [points];
  if (winCol) {
    setClauses.push(`${winCol}_${isA ? "a" : "b"} = ${winCol}_${isA ? "a" : "b"} + 1`);
  }
  db.prepare(`UPDATE server_rivalry_stats SET ${setClauses.join(", ")}, last_event_at = ? WHERE rivalry_id = ?`).run(...params, Date.now(), rivalryId);

  const updated = getServerRivalryStats(rivalryId);
  const leader = updated.score_a === updated.score_b ? null : updated.score_a > updated.score_b ? rivalry.guild_a : rivalry.guild_b;
  db.prepare(`UPDATE server_rivalry_stats SET current_leader_guild = ? WHERE rivalry_id = ?`).run(leader, rivalryId);
  return true;
}

function listServerRivalryHistory(guildId, limit = 10) {
  return db.prepare(`SELECT * FROM server_rivalries WHERE (guild_a = ? OR guild_b = ?) AND status IN ('ended', 'voided') ORDER BY ended_at DESC LIMIT ?`).all(guildId, guildId, limit);
}

// ---------------------------------------------------------------------------
// Official KOBA Bot Guild Leaderboards (commands/official-leaderboard.js) -
// every category here is a plain aggregate query over data the Progression
// System/Rival System already own (player_progression, rivalship_matches)
// scoped to ONE specific guild_id (the official guild, via
// process.env.OFFICIAL_GUILD_ID) - deliberately only the categories with a
// real backing table already built this session (spec section 25 explicitly
// says "only expose metrics that actually exist in the repository").
// ---------------------------------------------------------------------------

function getTopByLifetimeXp(guildId, limit = 10) {
  return db.prepare(`SELECT discord_id, lifetime_xp FROM player_progression WHERE guild_id = ? ORDER BY lifetime_xp DESC LIMIT ?`).all(guildId, limit);
}

/** "Top Players" overall - prestige first (it's the highest tier of career progression), then level, then raw xp as the final tiebreak within the same level. */
function getTopByProgression(guildId, limit = 10) {
  return db.prepare(`SELECT discord_id, prestige, level, xp FROM player_progression WHERE guild_id = ? ORDER BY prestige DESC, level DESC, xp DESC LIMIT ?`).all(guildId, limit);
}

/** Total Rival Challenge wins across every rivalship a player is part of in this guild - derived from rivalship_matches (never a separately-maintained counter). */
function getTopRivalWins(guildId, limit = 10) {
  return db
    .prepare(
      `SELECT winner AS discord_id, COUNT(*) AS wins FROM rivalship_matches
       WHERE guild_id = ? AND winner IS NOT NULL
       GROUP BY winner ORDER BY wins DESC LIMIT ?`
    )
    .all(guildId, limit);
}

// ---------------------------------------------------------------------------
// LFG Matchmaking
// ---------------------------------------------------------------------------

/** NULL is treated as 'guild' - the safe default before an owner ever touches /lfg-scope. */
function getLfgScope(guildId) {
  const meta = getGuildMeta(guildId);
  return meta?.lfg_scope === "global" ? "global" : "guild";
}

function setLfgScope(guildId, scope) {
  if (scope !== "global" && scope !== "guild") throw new Error(`Invalid LFG scope: ${scope}`);
  upsertGuildMeta(guildId, { lfg_scope: scope });
}

/** Every OTHER guild currently opted into 'global' with a working feed channel - the mirror list for a fresh post. */
function listGlobalLfgGuildIds(excludeGuildId) {
  return db
    .prepare(`SELECT guild_id FROM guild_meta WHERE lfg_scope = 'global' AND lfg_feed_channel_id IS NOT NULL AND guild_id != ?`)
    .all(excludeGuildId)
    .map((r) => r.guild_id);
}

const LFG_POST_LIFETIME_MS = 60 * 60 * 1000; // posts self-expire 1h after creation

function createLfgPost(guildId, userId, description, playersNeeded) {
  const createdAt = Date.now();
  const expiresAt = createdAt + LFG_POST_LIFETIME_MS;
  const result = db
    .prepare(`INSERT INTO lfg_posts (guild_id, user_id, description, players_needed, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'open', ?, ?)`)
    .run(guildId, userId, description, playersNeeded, createdAt, expiresAt);
  return getLfgPost(result.lastInsertRowid);
}

function getLfgPost(id) {
  return db.prepare(`SELECT * FROM lfg_posts WHERE id = ?`).get(id) || null;
}

function markLfgPostFilled(id) {
  db.prepare(`UPDATE lfg_posts SET status = 'filled' WHERE id = ?`).run(id);
}

function getLfgParticipantCount(postId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM lfg_participants WHERE post_id = ?`).get(postId).n;
}

function hasLfgParticipant(postId, discordId) {
  return !!db.prepare(`SELECT 1 FROM lfg_participants WHERE post_id = ? AND discord_id = ?`).get(postId, discordId);
}

function listLfgParticipants(postId) {
  return db.prepare(`SELECT * FROM lfg_participants WHERE post_id = ? ORDER BY joined_at ASC`).all(postId);
}

/**
 * The ONE join path both Discord's handleJoinButton and the website's
 * /dashboard/lfg/:id/join route call - single source of truth for "who's
 * in this group" (spec: "duplicate participation is impossible", "full LFG
 * cannot accept another player", "prevent race conditions where two
 * players simultaneously claim the last available slot"). Capacity is
 * re-checked and the row inserted within this one synchronous call - since
 * better-sqlite3 is synchronous and Node is single-threaded, nothing else
 * can interleave between the count-check and the insert here, so two
 * "simultaneous" join attempts (from Discord and the website, or two
 * different players) can never both slip through in the same tick past
 * the poster's actual cap. Also transitions the post to 'filled' the
 * moment the group reaches capacity (spec section 10: "the LFG should
 * automatically transition to its appropriate completed/filled state").
 */
function joinLfgPost(postId, discordId) {
  const post = getLfgPost(postId);
  if (!post) return { ok: false, reason: "not_found" };
  if (post.status !== "open") return { ok: false, reason: "not_open" };
  if (post.expires_at <= Date.now()) return { ok: false, reason: "expired" };
  if (post.user_id === discordId) return { ok: false, reason: "own_post" };
  if (hasLfgParticipant(postId, discordId)) return { ok: false, reason: "already_joined" };

  const currentCount = getLfgParticipantCount(postId);
  if (currentCount >= post.players_needed) return { ok: false, reason: "full" };

  db.prepare(`INSERT INTO lfg_participants (post_id, discord_id, joined_at) VALUES (?, ?, ?)`).run(postId, discordId, Date.now());
  const newCount = currentCount + 1;
  const justFilled = newCount >= post.players_needed;
  if (justFilled) markLfgPostFilled(postId);

  return { ok: true, count: newCount, needed: post.players_needed, justFilled };
}

/** Still-open posts whose 1h lifetime has elapsed - checked by the background loop, not a live timer, same pattern as temp role grants. */
function listExpiredLfgPosts() {
  return db.prepare(`SELECT * FROM lfg_posts WHERE status = 'open' AND expires_at <= ?`).all(Date.now());
}

// FIXED (2026-09-16): Discord's /create-lfg path creates the lfg_posts row
// and THEN calls deliverLfgPost - not one atomic step. This tick used to
// scan for ANY post with zero broadcasts yet, with no age check, so if it
// fired in the narrow window between those two steps (both real
// possibilities: Discord API latency on the synchronous send, or the
// tick's own 15s timer landing badly), it delivered the SAME post a
// second time - a real duplicate-post race, not a website-vs-Discord
// double-delivery (the website's own LFG-creation routes were removed
// entirely, so this tick is now purely a resilience fallback for a post
// that got created but never delivered, e.g. the bot crashing mid-flow).
// The 20s floor is comfortably longer than the synchronous path ever
// takes, so it never competes with a normal in-flight delivery, while
// still catching a genuinely stuck post on the next tick or two.
const LFG_PENDING_DELIVERY_MIN_AGE_MS = 20 * 1000;

/** Open posts with zero lfg_broadcasts rows anywhere AND old enough that the synchronous /create-lfg delivery must have already finished (or crashed) - see the fix note above. Picked up by utils/lfgPanel.js's runLfgWebDeliveryTick. */
function listPendingLfgDeliveries() {
  return db
    .prepare(`SELECT p.* FROM lfg_posts p WHERE p.status = 'open' AND p.created_at <= ? AND NOT EXISTS (SELECT 1 FROM lfg_broadcasts b WHERE b.lfg_post_id = p.id)`)
    .all(Date.now() - LFG_PENDING_DELIVERY_MIN_AGE_MS);
}

/** The inverse of listPendingLfgDeliveries above - open posts that HAVE already been broadcast somewhere, i.e. have a real Discord message to keep in sync (utils/lfgPanel.js's runLfgParticipantSyncTick). */
function listOpenLfgPostsWithBroadcasts() {
  return db
    .prepare(`SELECT p.* FROM lfg_posts p WHERE p.status = 'open' AND EXISTS (SELECT 1 FROM lfg_broadcasts b WHERE b.lfg_post_id = p.id)`)
    .all();
}

function markLfgPostExpired(id) {
  db.prepare(`UPDATE lfg_posts SET status = 'expired' WHERE id = ?`).run(id);
}

function addLfgBroadcast(lfgPostId, guildId, channelId, messageId, threadId = null) {
  db.prepare(`INSERT INTO lfg_broadcasts (lfg_post_id, guild_id, channel_id, message_id, thread_id) VALUES (?, ?, ?, ?, ?)`).run(lfgPostId, guildId, channelId, messageId, threadId);
}

/** The one thread that belongs to this guild's own copy of a post - a "Join Group" click always joins the guild-local thread, never a different server's. */
function getLfgBroadcastForGuild(lfgPostId, guildId) {
  return db.prepare(`SELECT * FROM lfg_broadcasts WHERE lfg_post_id = ? AND guild_id = ?`).get(lfgPostId, guildId) || null;
}

function listLfgBroadcasts(lfgPostId) {
  return db.prepare(`SELECT * FROM lfg_broadcasts WHERE lfg_post_id = ?`).all(lfgPostId);
}

// ---------------------------------------------------------------------------
// Staff accounts (admin dashboard multi-user login + roles)
// ---------------------------------------------------------------------------

const STAFF_ROLES = ["superadmin", "admin", "moderator"];

/** scrypt with a random salt per password - no extra dependency (bcrypt/argon2) needed for this. */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createStaffUser(username, plainPassword, role) {
  if (!STAFF_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  db.prepare(`INSERT INTO staff_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`).run(
    username,
    hashPassword(plainPassword),
    role,
    Date.now()
  );
  return getStaffUserByUsername(username);
}

function getStaffUserByUsername(username) {
  return db.prepare(`SELECT * FROM staff_users WHERE username = ? COLLATE NOCASE`).get(username) || null;
}

function getStaffUserById(id) {
  return db.prepare(`SELECT * FROM staff_users WHERE id = ?`).get(id) || null;
}

function listStaffUsers() {
  return db.prepare(`SELECT id, username, role, created_at, last_login_at FROM staff_users ORDER BY created_at`).all();
}

function countStaffUsers() {
  return db.prepare(`SELECT COUNT(*) AS n FROM staff_users`).get().n;
}

function deleteStaffUser(id) {
  db.prepare(`DELETE FROM staff_users WHERE id = ?`).run(id);
}

function touchStaffLogin(id) {
  db.prepare(`UPDATE staff_users SET last_login_at = ? WHERE id = ?`).run(Date.now(), id);
}

/**
 * Verifies username/password and returns the account if valid. Called by
 * the login route - deliberately doesn't distinguish "no such user" from
 * "wrong password" in its return value, so the login page can show one
 * generic error either way (avoids leaking which usernames exist).
 */
function authenticateStaffUser(username, plainPassword) {
  const user = getStaffUserByUsername(username);
  if (!user || !verifyPassword(plainPassword, user.password_hash)) return null;
  touchStaffLogin(user.id);
  return user;
}

// ---------------------------------------------------------------------------
// Player accounts (web dashboard - Discord OAuth and/or email/password,
// unified under one KOBAid) - see database/schema.sql's header comment on
// player_accounts for the full reasoning.
// ---------------------------------------------------------------------------

// Excludes visually-ambiguous characters (0/O, 1/I/L) - this ID gets typed/
// read aloud by real people (support tickets, account recovery), unlike an
// internal-only token.
const KOBAID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateKobaId() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = "";
    for (const b of bytes) code += KOBAID_ALPHABET[b % KOBAID_ALPHABET.length];
    const kobaid = `KOBA-${code}`;
    if (!getPlayerAccountByKobaId(kobaid)) return kobaid;
  }
  // Astronomically unlikely (32^6 keyspace) - fail loudly rather than ever
  // silently return a colliding ID.
  throw new Error("Could not generate a unique KOBAid after 20 attempts.");
}

function getPlayerAccountByKobaId(kobaid) {
  return db.prepare(`SELECT * FROM player_accounts WHERE kobaid = ?`).get(kobaid) || null;
}

function getPlayerAccountByDiscordId(discordId) {
  return db.prepare(`SELECT * FROM player_accounts WHERE discord_id = ?`).get(discordId) || null;
}

function getPlayerAccountByEmail(email) {
  return db.prepare(`SELECT * FROM player_accounts WHERE email = ? COLLATE NOCASE`).get((email || "").trim()) || null;
}

/** Finds-or-creates by Discord ID - the Discord OAuth callback calls this on every login, same idempotent find-or-create convention as the rest of this codebase. Returns { account, isNew } so the caller knows whether to route into onboarding. */
function findOrCreatePlayerAccountByDiscord(discordId, username) {
  const existing = getPlayerAccountByDiscordId(discordId);
  if (existing) {
    if (username && existing.username !== username) {
      db.prepare(`UPDATE player_accounts SET username = ? WHERE kobaid = ?`).run(username, existing.kobaid);
    }
    touchPlayerLogin(existing.kobaid);
    return { account: getPlayerAccountByKobaId(existing.kobaid), isNew: false };
  }
  const kobaid = generateKobaId();
  const now = Date.now();
  db.prepare(`INSERT INTO player_accounts (kobaid, discord_id, username, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)`).run(kobaid, discordId, username, now, now);
  return { account: getPlayerAccountByKobaId(kobaid), isNew: true };
}

/** Email/password registration - throws if the email is already taken (caller should check getPlayerAccountByEmail first for a friendlier error, this is the hard backstop). */
function createPlayerAccountWithEmail(email, plainPassword, username) {
  if (getPlayerAccountByEmail(email)) throw new Error("An account with that email already exists.");
  const kobaid = generateKobaId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO player_accounts (kobaid, email, password_hash, username, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(kobaid, email.trim(), hashPassword(plainPassword), username, now, now);
  return getPlayerAccountByKobaId(kobaid);
}

/** Same no-user-enumeration contract as authenticateStaffUser - one generic failure for both "no such email" and "wrong password". */
function authenticatePlayerEmail(email, plainPassword) {
  const account = getPlayerAccountByEmail(email);
  if (!account || !account.password_hash || !verifyPassword(plainPassword, account.password_hash)) return null;
  touchPlayerLogin(account.kobaid);
  return account;
}

function touchPlayerLogin(kobaid) {
  db.prepare(`UPDATE player_accounts SET last_login_at = ? WHERE kobaid = ?`).run(Date.now(), kobaid);
}

function isPlayerOnboardingComplete(kobaid) {
  return Boolean(getPlayerAccountByKobaId(kobaid)?.onboarding_completed_at);
}

/** Registration spec: at least 4 interests, at least 1 game, at least 1 platform - validated by the caller (route-level, so it can show a real form error), this just persists the already-validated selections and marks onboarding complete in one transaction. */
const setPlayerOnboarding = db.transaction((kobaid, { interests, games, platforms }) => {
  db.prepare(`DELETE FROM player_interests WHERE kobaid = ?`).run(kobaid);
  db.prepare(`DELETE FROM player_account_games WHERE kobaid = ?`).run(kobaid);
  db.prepare(`DELETE FROM player_account_platforms WHERE kobaid = ?`).run(kobaid);
  const insInterest = db.prepare(`INSERT INTO player_interests (kobaid, interest) VALUES (?, ?)`);
  const insGame = db.prepare(`INSERT INTO player_account_games (kobaid, game) VALUES (?, ?)`);
  const insPlatform = db.prepare(`INSERT INTO player_account_platforms (kobaid, platform) VALUES (?, ?)`);
  for (const i of interests) insInterest.run(kobaid, i);
  for (const g of games) insGame.run(kobaid, g);
  for (const p of platforms) insPlatform.run(kobaid, p);
  db.prepare(`UPDATE player_accounts SET onboarding_completed_at = ? WHERE kobaid = ?`).run(Date.now(), kobaid);
});

function getPlayerInterests(kobaid) {
  return db.prepare(`SELECT interest FROM player_interests WHERE kobaid = ?`).all(kobaid).map((r) => r.interest);
}
function getPlayerGames(kobaid) {
  return db.prepare(`SELECT game FROM player_account_games WHERE kobaid = ?`).all(kobaid).map((r) => r.game);
}
function getPlayerPlatforms(kobaid) {
  return db.prepare(`SELECT platform FROM player_account_platforms WHERE kobaid = ?`).all(kobaid).map((r) => r.platform);
}

// ---------------------------------------------------------------------------
// Operator backend: installs, sales, tickets, site settings
// ---------------------------------------------------------------------------

/** Called on every guildCreate, regardless of premium status - this is the real install count. */
function recordGuildInstall(guildId, guildName, ownerId, memberCount, premiumAtJoin) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO guild_installs (guild_id, guild_name, owner_id, member_count, first_joined_at, last_joined_at, left_at, premium_at_join)
     VALUES (@guildId, @guildName, @ownerId, @memberCount, @now, @now, NULL, @premiumAtJoin)
     ON CONFLICT(guild_id) DO UPDATE SET
       guild_name = @guildName, owner_id = @ownerId, member_count = @memberCount,
       last_joined_at = @now, left_at = NULL, premium_at_join = @premiumAtJoin`
  ).run({ guildId, guildName, ownerId, memberCount: memberCount ?? null, now, premiumAtJoin: premiumAtJoin ? 1 : 0 });
}

function recordGuildLeft(guildId) {
  db.prepare(`UPDATE guild_installs SET left_at = ? WHERE guild_id = ?`).run(Date.now(), guildId);
}

/** True if this guild has an install record already - used to distinguish a genuinely new join from discord.js's guildCreate firing again on every reconnect/cache-resync for guilds the bot was already in (see events/guildCreate.js's approval-gate header comment). */
function hasGuildInstallRecord(guildId) {
  return !!db.prepare(`SELECT 1 FROM guild_installs WHERE guild_id = ?`).get(guildId);
}

function listInstalls() {
  return db.prepare(`SELECT * FROM guild_installs ORDER BY last_joined_at DESC`).all();
}

function installStats() {
  const total = db.prepare(`SELECT COUNT(*) AS n FROM guild_installs`).get().n;
  const active = db.prepare(`SELECT COUNT(*) AS n FROM guild_installs WHERE left_at IS NULL`).get().n;
  const premiumActive = db
    .prepare(`SELECT COUNT(*) AS n FROM guild_installs WHERE left_at IS NULL AND premium_at_join = 1`)
    .get().n;
  return { total, active, premiumActive };
}


/** Player/server-owner web dashboard (see admin/dashboard.js) - every currently-installed server this Discord account owns. */
function listGuildInstallsByOwner(ownerId) {
  return db.prepare(`SELECT * FROM guild_installs WHERE owner_id = ? AND left_at IS NULL ORDER BY last_joined_at DESC`).all(ownerId);
}

/**
 * Product-wide totals for the official server's live STATS voice channels -
 * distinct from any single guild's own player count. "Players" counts
 * unique Discord accounts registered to a team anywhere, not concurrent
 * in-game players (that's the per-guild RCON-based channel instead).
 */
/**
 * Public-facing (site homepage, official STATS voice channels) totals -
 * the official/dev KOBA servers themselves are never real customers, so
 * every count here explicitly excludes all of them (bound params, not
 * string-interpolated, even though OFFICIAL_GUILD_IDS is env-controlled
 * not user input). installStats() above stays unfiltered on purpose -
 * that one's the internal /admin dashboard, where official servers
 * showing up in the raw total is fine/expected.
 *
 * Doesn't import utils/premium.js's officialGuildIds() here deliberately -
 * that module requires this one (database/db.js), so importing it back
 * would be circular. Parses OFFICIAL_GUILD_IDS inline instead (2026-10-11,
 * updated from the old single-ID OFFICIAL_GUILD_ID now that there are 3
 * official servers: koba, koba.games, KOBAbot).
 */
function productWideStats() {
  const officialIds = (process.env.OFFICIAL_GUILD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const placeholders = officialIds.map(() => "?").join(",");
  const exclude = placeholders ? `guild_id NOT IN (${placeholders})` : "1=1";
  const servers = db.prepare(`SELECT COUNT(*) AS n FROM guild_installs WHERE left_at IS NULL AND ${exclude}`).get(...officialIds).n;
  const owners = db.prepare(`SELECT COUNT(DISTINCT owner_id) AS n FROM guild_installs WHERE left_at IS NULL AND ${exclude}`).get(...officialIds).n;
  const players = db.prepare(`SELECT COUNT(DISTINCT discord_id) AS n FROM members WHERE ${exclude}`).get(...officialIds).n;
  const kills = db.prepare(`SELECT COUNT(*) AS n FROM pvp_kills WHERE ${exclude}`).get(...officialIds).n;
  const playerHours = db.prepare(`SELECT COALESCE(SUM(minutes), 0) AS n FROM directory_playtime WHERE ${exclude}`).get(...officialIds).n / 60;
  return { servers, owners, players, kills, playerHours: Math.floor(playerHours) };
}

/** Manual sales ledger - the source of truth until a real payment processor is wired in. */
function recordSale(discordId, amountCents, currency, plan, note, recordedBy) {
  db.prepare(
    `INSERT INTO sales (discord_id, amount_cents, currency, plan, note, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(discordId, amountCents, currency, plan || null, note || null, recordedBy, Date.now());
}

function listSales(limit = 200) {
  return db.prepare(`SELECT * FROM sales ORDER BY created_at DESC LIMIT ?`).all(limit);
}

function salesSummary() {
  const totalCents = db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM sales`).get().n;
  const count = db.prepare(`SELECT COUNT(*) AS n FROM sales`).get().n;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30Cents = db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM sales WHERE created_at >= ?`).get(thirtyDaysAgo).n;
  return { totalCents, count, last30Cents };
}

// ---------------------------------------------------------------------------
// Tip4Serv package -> duration mapping. A webhook self-registers any basket
// item id it's never seen before (days=0, i.e. "not configured yet") so the
// superadmin sees it appear in /admin/tip4serv and just has to fill in a
// duration - no need to know package ids up front.
// ---------------------------------------------------------------------------

function upsertTip4servPackageSeen(itemId, itemName) {
  db.prepare(
    `INSERT INTO tip4serv_packages (item_id, item_name, days, updated_at)
     VALUES (@itemId, @itemName, 0, @now)
     ON CONFLICT(item_id) DO UPDATE SET item_name = @itemName`
  ).run({ itemId: String(itemId), itemName: itemName || null, now: Date.now() });
}

function setTip4servPackageDays(itemId, days) {
  db.prepare(`UPDATE tip4serv_packages SET days = ?, updated_at = ? WHERE item_id = ?`).run(days, Date.now(), String(itemId));
}

function getTip4servPackageDays(itemId) {
  const row = db.prepare(`SELECT days FROM tip4serv_packages WHERE item_id = ?`).get(String(itemId));
  return row ? row.days : 0;
}

function listTip4servPackages() {
  return db.prepare(`SELECT * FROM tip4serv_packages ORDER BY updated_at DESC`).all();
}

function createTicket(guildId, discordId, subject, message, channelId = null, platform = null, game = null) {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO support_tickets (guild_id, channel_id, discord_id, subject, message, status, created_at, updated_at, platform, game)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
    )
    .run(guildId, channelId, discordId, subject, message, now, now, platform, game);
  return result.lastInsertRowid;
}

function listTickets(status) {
  if (status) return db.prepare(`SELECT * FROM support_tickets WHERE status = ? ORDER BY created_at DESC`).all(status);
  return db.prepare(`SELECT * FROM support_tickets ORDER BY created_at DESC`).all();
}

function getTicket(id) {
  return db.prepare(`SELECT * FROM support_tickets WHERE id = ?`).get(id) || null;
}

/** Player web dashboard's "My Tickets" list - every ticket this Discord account has ever opened, regardless of whether it came from /support or the website's own submit form. */
function listTicketsByDiscordId(discordId) {
  return db.prepare(`SELECT * FROM support_tickets WHERE discord_id = ? ORDER BY created_at DESC`).all(discordId);
}

function getTicketByChannelId(channelId) {
  return db.prepare(`SELECT * FROM support_tickets WHERE channel_id = ?`).get(channelId) || null;
}

function updateTicket(id, { status, adminNote, closedAt, archivedAt }) {
  const existing = getTicket(id);
  if (!existing) return null;
  db.prepare(`UPDATE support_tickets SET status = ?, admin_note = ?, closed_at = ?, archived_at = ?, updated_at = ? WHERE id = ?`).run(
    status ?? existing.status,
    adminNote !== undefined ? adminNote : existing.admin_note,
    closedAt !== undefined ? closedAt : existing.closed_at,
    archivedAt !== undefined ? archivedAt : existing.archived_at,
    Date.now(),
    id
  );
  return getTicket(id);
}

/** Archived tickets whose channel is due for permanent deletion - status 'archived', archived_at set, and (now - archived_at) past the guild's configured delay. Excludes tickets already marked 'deleted' (channel gone) so a restart doesn't re-attempt a delete every tick. */
function listExpiredArchivedTickets(guildId, cutoffMs) {
  return db
    .prepare(`SELECT * FROM support_tickets WHERE guild_id = ? AND status = 'archived' AND archived_at IS NOT NULL AND archived_at <= ?`)
    .all(guildId, cutoffMs);
}

function ticketStats() {
  const open = db.prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'open'`).get().n;
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'pending'`).get().n;
  return { open, pending };
}

function getSiteSetting(key, fallback = null) {
  const row = db.prepare(`SELECT value FROM site_settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}

function setSiteSetting(key, value) {
  db.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, Date.now());
}

function listSiteSettings() {
  return db.prepare(`SELECT * FROM site_settings ORDER BY key`).all();
}

// ---------------------------------------------------------------------------
// Stripe billing
// ---------------------------------------------------------------------------

function upsertStripeCustomer(discordId, stripeCustomerId, stripeSubscriptionId) {
  db.prepare(
    `INSERT INTO stripe_customers (discord_id, stripe_customer_id, stripe_subscription_id, updated_at)
     VALUES (@discordId, @stripeCustomerId, @stripeSubscriptionId, @now)
     ON CONFLICT(discord_id) DO UPDATE SET
       stripe_customer_id = @stripeCustomerId, stripe_subscription_id = @stripeSubscriptionId, updated_at = @now`
  ).run({ discordId, stripeCustomerId, stripeSubscriptionId: stripeSubscriptionId ?? null, now: Date.now() });
}

function getDiscordIdByStripeCustomerId(stripeCustomerId) {
  const row = db.prepare(`SELECT discord_id FROM stripe_customers WHERE stripe_customer_id = ?`).get(stripeCustomerId);
  return row ? row.discord_id : null;
}

function getStripeCustomerIdByDiscordId(discordId) {
  const row = db.prepare(`SELECT stripe_customer_id FROM stripe_customers WHERE discord_id = ?`).get(discordId);
  return row ? row.stripe_customer_id : null;
}

// ---------------------------------------------------------------------------
// Frank (mascot/helper persona) - see utils/frank.js
// ---------------------------------------------------------------------------

function addFrankFaq(guildId, keywords, answer, link, createdBy) {
  const info = db
    .prepare(`INSERT INTO frank_faq (guild_id, keywords, answer, link, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(guildId, keywords, answer, link || null, createdBy, Date.now());
  return info.lastInsertRowid;
}

function listFrankFaq(guildId) {
  return db.prepare(`SELECT * FROM frank_faq WHERE guild_id = ? ORDER BY id`).all(guildId);
}

function getFrankFaq(guildId, id) {
  return db.prepare(`SELECT * FROM frank_faq WHERE guild_id = ? AND id = ?`).get(guildId, id);
}

function removeFrankFaq(guildId, id) {
  return db.prepare(`DELETE FROM frank_faq WHERE guild_id = ? AND id = ?`).run(guildId, id).changes > 0;
}

// ---------------------------------------------------------------------------
// Lootboxes (/lootbox-config, /lootbox) - see config/lootboxes.js and
// utils/lootboxImage.js
// ---------------------------------------------------------------------------

function addLootboxReward(guildId, boxKey, { rewardType, rewardRef, amount, weight, displayName, imageUrl }) {
  const info = db
    .prepare(
      `INSERT INTO lootbox_rewards (guild_id, box_key, reward_type, reward_ref, amount, weight, display_name, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, boxKey, rewardType, rewardRef, amount ?? 1, weight ?? 1, displayName, imageUrl || null, Date.now());
  return info.lastInsertRowid;
}

function listLootboxRewards(guildId, boxKey) {
  return db.prepare(`SELECT * FROM lootbox_rewards WHERE guild_id = ? AND box_key = ?`).all(guildId, boxKey);
}

function getLootboxReward(guildId, id) {
  return db.prepare(`SELECT * FROM lootbox_rewards WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function removeLootboxReward(guildId, id) {
  return db.prepare(`DELETE FROM lootbox_rewards WHERE guild_id = ? AND id = ?`).run(guildId, id).changes > 0;
}

/** currency_name/currency_emoji joined in for display convenience - callers otherwise always need both. */
function getLootboxSettings(guildId, boxKey) {
  return db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM lootbox_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ? AND s.box_key = ?`
    )
    .get(guildId, boxKey) || null;
}

function setLootboxSettings(guildId, boxKey, currencyId, minBet, maxBet, winRate) {
  db.prepare(
    `INSERT INTO lootbox_settings (guild_id, box_key, currency_id, min_bet, max_bet, win_rate) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, box_key) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet, win_rate = excluded.win_rate`
  ).run(guildId, boxKey, currencyId, minBet, maxBet, winRate);
}

/**
 * Reset (/games-panel "Reset" button, 2026-09-07) - wipes a single game's
 * settings/rewards back to unconfigured, same end state as a brand new
 * guild that's never touched Configure/Quick Setup. Deliberately leaves
 * anything that isn't "configuration" alone - a player's actual scrap
 * inventory, an in-progress Vault Heist, pending lootbox claims already won
 * - none of that is touched, only the admin-facing setup gets cleared.
 */
function resetLootboxConfig(guildId) {
  db.prepare(`DELETE FROM lootbox_settings WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM lootbox_rewards WHERE guild_id = ?`).run(guildId);
}

function resetDefuseWireConfig(guildId) {
  db.prepare(`DELETE FROM defuse_wire_settings WHERE guild_id = ?`).run(guildId);
}

function resetGridMinefieldConfig(guildId) {
  db.prepare(`DELETE FROM grid_minefield_settings WHERE guild_id = ?`).run(guildId);
}

function resetTowerClimbConfig(guildId) {
  db.prepare(`DELETE FROM tower_climb_settings WHERE guild_id = ?`).run(guildId);
}

function resetVaultHeistConfig(guildId) {
  db.prepare(`DELETE FROM vault_heist_settings WHERE guild_id = ?`).run(guildId);
}

function resetScrapMerchantConfig(guildId) {
  db.prepare(`DELETE FROM scrap_merchant_settings WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM scrap_items WHERE guild_id = ?`).run(guildId);
}

// --- Pending claims (win -> Open -> Claim, see utils/lootboxPanel.js) ---

function addLootboxPendingClaim(guildId, discordId, boxKey, rewardId, wager, serverName) {
  const info = db
    .prepare(`INSERT INTO lootbox_pending_claims (guild_id, discord_id, box_key, reward_id, wager, server_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(guildId, discordId, boxKey, rewardId, wager, serverName || null, Date.now());
  return info.lastInsertRowid;
}

function getLootboxPendingClaim(guildId, id) {
  return db.prepare(`SELECT * FROM lootbox_pending_claims WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

/** Unclaimed lootbox wins for a player - reward info joined in for display (My Items panel, /lootbox-config auditing). Includes opened-but-not-yet-claimed wins, not just untouched ones. */
function listUnclaimedLootboxClaims(guildId, discordId) {
  return db
    .prepare(
      `SELECT c.*, r.display_name, r.image_url, r.reward_type
       FROM lootbox_pending_claims c
       JOIN lootbox_rewards r ON r.id = c.reward_id AND r.guild_id = c.guild_id
       WHERE c.guild_id = ? AND c.discord_id = ? AND c.claimed_at IS NULL
       ORDER BY c.created_at`
    )
    .all(guildId, discordId);
}

function markLootboxClaimOpened(id) {
  db.prepare(`UPDATE lootbox_pending_claims SET opened_at = ? WHERE id = ?`).run(Date.now(), id);
}

function markLootboxClaimClaimed(id) {
  db.prepare(`UPDATE lootbox_pending_claims SET claimed_at = ? WHERE id = ?`).run(Date.now(), id);
}

// ---------------------------------------------------------------------------
// The Defuse Wire (utils/defuseWire.js)
// ---------------------------------------------------------------------------

function getDefuseWireSettings(guildId) {
  return db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM defuse_wire_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId) || null;
}

function setDefuseWireSettings(guildId, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO defuse_wire_settings (guild_id, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, currencyId, minBet, maxBet);
}

// ---------------------------------------------------------------------------
// Additional wager currencies for the wager games - see schema.sql's
// game_currency_bets header. gameKey is 'defuse_wire' | 'grid_minefield' |
// 'tower_climb'.
// ---------------------------------------------------------------------------

function listGameCurrencyBets(guildId, gameKey) {
  return db
    .prepare(
      `SELECT b.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM game_currency_bets b
       JOIN shop_currencies c ON c.id = b.currency_id AND c.guild_id = b.guild_id
       WHERE b.guild_id = ? AND b.game_key = ?`
    )
    .all(guildId, gameKey);
}

function setGameCurrencyBet(guildId, gameKey, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO game_currency_bets (guild_id, game_key, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, game_key, currency_id) DO UPDATE SET min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, gameKey, currencyId, minBet, maxBet);
}

function removeGameCurrencyBet(guildId, gameKey, currencyId) {
  db.prepare(`DELETE FROM game_currency_bets WHERE guild_id = ? AND game_key = ? AND currency_id = ?`).run(guildId, gameKey, currencyId);
}

/** At most one 'active' run per (guild, player) - checked before a new wager is accepted, and reused to resume after e.g. a bot restart instead of losing track of an already-charged wager. */
function getActiveDefuseRun(guildId, discordId) {
  return db.prepare(`SELECT * FROM defuse_wire_runs WHERE guild_id = ? AND discord_id = ? AND status = 'active'`).get(guildId, discordId) || null;
}

function getDefuseRun(guildId, id) {
  return db.prepare(`SELECT * FROM defuse_wire_runs WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function createDefuseRun(guildId, discordId, currencyId, wager, wireOutcomes) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO defuse_wire_runs (guild_id, discord_id, currency_id, wager, pool, rounds_survived, wire_outcomes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)`
    )
    .run(guildId, discordId, currencyId, wager, wager, JSON.stringify(wireOutcomes), now, now);
  return info.lastInsertRowid;
}

/** Advances to a new round: bumps the pool/round counter (or leaves pool unchanged on a plain "safe" wire) and rolls a fresh wire_outcomes assignment. */
function advanceDefuseRun(id, { pool, roundsSurvived, wireOutcomes }) {
  db.prepare(`UPDATE defuse_wire_runs SET pool = ?, rounds_survived = ?, wire_outcomes = ?, updated_at = ? WHERE id = ?`).run(
    pool,
    roundsSurvived,
    JSON.stringify(wireOutcomes),
    Date.now(),
    id
  );
}

function closeDefuseRun(id, status) {
  db.prepare(`UPDATE defuse_wire_runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), id);
}

// ---------------------------------------------------------------------------
// The Grid Minefield (utils/gridMinefield.js)
// ---------------------------------------------------------------------------

function getGridMinefieldSettings(guildId) {
  return db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM grid_minefield_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId) || null;
}

function setGridMinefieldSettings(guildId, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO grid_minefield_settings (guild_id, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, currencyId, minBet, maxBet);
}

function getTreasureSlotsSettings(guildId) {
  return db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM treasure_slots_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId) || null;
}

function setTreasureSlotsSettings(guildId, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO treasure_slots_settings (guild_id, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, currencyId, minBet, maxBet);
}

function getActiveGridMinefieldRun(guildId, discordId) {
  return db.prepare(`SELECT * FROM grid_minefield_runs WHERE guild_id = ? AND discord_id = ? AND status = 'active'`).get(guildId, discordId) || null;
}

function getGridMinefieldRun(guildId, id) {
  return db.prepare(`SELECT * FROM grid_minefield_runs WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function createGridMinefieldRun(guildId, discordId, currencyId, wager, cellStates) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO grid_minefield_runs (guild_id, discord_id, currency_id, wager, pool, cell_states, revealed, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', 'active', ?, ?)`
    )
    .run(guildId, discordId, currencyId, wager, wager, JSON.stringify(cellStates), now, now);
  return info.lastInsertRowid;
}

function revealGridMinefieldCell(id, pool, revealed) {
  db.prepare(`UPDATE grid_minefield_runs SET pool = ?, revealed = ?, updated_at = ? WHERE id = ?`).run(pool, JSON.stringify(revealed), Date.now(), id);
}

function closeGridMinefieldRun(id, status) {
  db.prepare(`UPDATE grid_minefield_runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), id);
}

// ---------------------------------------------------------------------------
// Tower Climb (utils/towerClimb.js)
// ---------------------------------------------------------------------------

function getTowerClimbSettings(guildId) {
  return db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM tower_climb_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId) || null;
}

function setTowerClimbSettings(guildId, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO tower_climb_settings (guild_id, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, currencyId, minBet, maxBet);
}

function getActiveTowerClimbRun(guildId, discordId) {
  return db.prepare(`SELECT * FROM tower_climb_runs WHERE guild_id = ? AND discord_id = ? AND status = 'active'`).get(guildId, discordId) || null;
}

function getTowerClimbRun(guildId, id) {
  return db.prepare(`SELECT * FROM tower_climb_runs WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function createTowerClimbRun(guildId, discordId, currencyId, wager) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO tower_climb_runs (guild_id, discord_id, currency_id, wager, pool, current_floor, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?)`
    )
    .run(guildId, discordId, currencyId, wager, wager, now, now);
  return info.lastInsertRowid;
}

/** Advances after a successfully-survived floor: bumps current_floor and sets the new pool (wager * that floor's multiplier). */
function advanceTowerClimbRun(id, { pool, floor }) {
  db.prepare(`UPDATE tower_climb_runs SET pool = ?, current_floor = ?, updated_at = ? WHERE id = ?`).run(pool, floor, Date.now(), id);
}

function closeTowerClimbRun(id, status) {
  db.prepare(`UPDATE tower_climb_runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), id);
}

// ---------------------------------------------------------------------------
// The Co-op Vault Heist (utils/vaultHeist.js)
// ---------------------------------------------------------------------------

function getVaultHeistSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM vault_heist_settings s
       LEFT JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

/** Upserts only the fields provided - lets each Configure step (channel / rewards+timing / combat) update its own slice without clobbering the others. */
function upsertVaultHeistSettings(guildId, fields) {
  const existing = getVaultHeistSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO vault_heist_settings (guild_id, channel_id, currency_id, interval_hours, target_hp, cooldown_seconds, min_damage, max_damage, reward_pool_amount, top_damager_bonus, last_spawned_at)
     VALUES (@guildId, @channelId, @currencyId, @intervalHours, @targetHp, @cooldownSeconds, @minDamage, @maxDamage, @rewardPoolAmount, @topDamagerBonus, @lastSpawnedAt)
     ON CONFLICT(guild_id) DO UPDATE SET
       channel_id = excluded.channel_id, currency_id = excluded.currency_id, interval_hours = excluded.interval_hours,
       target_hp = excluded.target_hp, cooldown_seconds = excluded.cooldown_seconds, min_damage = excluded.min_damage,
       max_damage = excluded.max_damage, reward_pool_amount = excluded.reward_pool_amount, top_damager_bonus = excluded.top_damager_bonus,
       last_spawned_at = excluded.last_spawned_at`
  ).run({
    guildId,
    channelId: merged.channel_id ?? null,
    currencyId: merged.currency_id ?? null,
    intervalHours: merged.interval_hours ?? 4,
    targetHp: merged.target_hp ?? 5000,
    cooldownSeconds: merged.cooldown_seconds ?? 30,
    minDamage: merged.min_damage ?? 50,
    maxDamage: merged.max_damage ?? 200,
    rewardPoolAmount: merged.reward_pool_amount ?? 1000,
    topDamagerBonus: merged.top_damager_bonus ?? 200,
    lastSpawnedAt: merged.last_spawned_at ?? null,
  });
}

function markVaultSpawned(guildId, when) {
  db.prepare(`UPDATE vault_heist_settings SET last_spawned_at = ? WHERE guild_id = ?`).run(when, guildId);
}

function getActiveVault(guildId) {
  return db.prepare(`SELECT * FROM vault_heist_active WHERE guild_id = ?`).get(guildId) || null;
}

function createVault(guildId, channelId, maxHp) {
  const info = db
    .prepare(`INSERT INTO vault_heist_active (guild_id, channel_id, max_hp, current_hp, started_at) VALUES (?, ?, ?, ?, ?)`)
    .run(guildId, channelId, maxHp, maxHp, Date.now());
  return info.lastInsertRowid;
}

function setVaultMessageId(vaultId, messageId) {
  db.prepare(`UPDATE vault_heist_active SET message_id = ? WHERE id = ?`).run(messageId, vaultId);
}

function getVault(vaultId) {
  return db.prepare(`SELECT * FROM vault_heist_active WHERE id = ?`).get(vaultId) || null;
}

/** Applies damage, floored at 0 (never negative), and returns the vault's new current_hp. */
function damageVault(vaultId, amount) {
  db.prepare(`UPDATE vault_heist_active SET current_hp = MAX(0, current_hp - ?) WHERE id = ?`).run(amount, vaultId);
  return getVault(vaultId).current_hp;
}

function getVaultPlayerCooldown(vaultId, discordId) {
  return db.prepare(`SELECT * FROM vault_heist_damage WHERE vault_id = ? AND discord_id = ?`).get(vaultId, discordId) || null;
}

function recordVaultDamage(vaultId, discordId, amount, when) {
  db.prepare(
    `INSERT INTO vault_heist_damage (vault_id, discord_id, damage, last_action_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(vault_id, discord_id) DO UPDATE SET damage = damage + excluded.damage, last_action_at = excluded.last_action_at`
  ).run(vaultId, discordId, amount, when);
}

/** Everyone who dealt damage to this vault, highest first - used both for the reward split and to find the Top Damager bonus recipient. */
function listVaultDamage(vaultId) {
  return db.prepare(`SELECT * FROM vault_heist_damage WHERE vault_id = ? ORDER BY damage DESC`).all(vaultId);
}

/** Vault resolved (cracked) - removes the active vault and its damage rows. Called after rewards are already calculated/delivered by utils/vaultHeist.js, so nothing here needs to survive a restart mid-payout the way the wager games' rows do (payout is a single synchronous step, not a multi-interaction flow). */
function closeVault(vaultId) {
  db.prepare(`DELETE FROM vault_heist_damage WHERE vault_id = ?`).run(vaultId);
  db.prepare(`DELETE FROM vault_heist_active WHERE id = ?`).run(vaultId);
}

// ---------------------------------------------------------------------------
// The Scrap Merchant (utils/scrapMerchant.js)
// ---------------------------------------------------------------------------

function getScrapMerchantSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM scrap_merchant_settings s
       LEFT JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

/** Upserts only the fields provided - same pattern as upsertVaultHeistSettings, lets Configure's currency step and drop-rate/cap step update independently. */
function upsertScrapMerchantSettings(guildId, fields) {
  const existing = getScrapMerchantSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO scrap_merchant_settings (guild_id, currency_id, drop_chance_pct, max_inventory_items)
     VALUES (@guildId, @currencyId, @dropChancePct, @maxInventoryItems)
     ON CONFLICT(guild_id) DO UPDATE SET
       currency_id = excluded.currency_id, drop_chance_pct = excluded.drop_chance_pct, max_inventory_items = excluded.max_inventory_items`
  ).run({
    guildId,
    currencyId: merged.currency_id ?? null,
    dropChancePct: merged.drop_chance_pct ?? 10,
    maxInventoryItems: merged.max_inventory_items ?? 50,
  });
}

function createScrapItem(guildId, fields) {
  const result = db
    .prepare(
      `INSERT INTO scrap_items (guild_id, name, emoji, price_mode, fixed_price, min_price, max_price, drop_weight, enabled, created_at)
       VALUES (@guildId, @name, @emoji, @priceMode, @fixedPrice, @minPrice, @maxPrice, @dropWeight, 1, @now)`
    )
    .run({
      guildId,
      name: fields.name,
      emoji: fields.emoji ?? null,
      priceMode: fields.price_mode === "random" ? "random" : "fixed",
      fixedPrice: fields.fixed_price ?? 0,
      minPrice: fields.min_price ?? 0,
      maxPrice: fields.max_price ?? 0,
      dropWeight: fields.drop_weight ?? 1,
      now: Date.now(),
    });
  return result.lastInsertRowid;
}

function updateScrapItem(guildId, itemId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE scrap_items SET ${setClause} WHERE id = @itemId AND guild_id = @guildId`).run({ ...fields, itemId, guildId });
}

function deleteScrapItem(guildId, itemId) {
  db.prepare(`DELETE FROM player_scrap_inventory WHERE guild_id = ? AND item_id = ?`).run(guildId, itemId);
  db.prepare(`DELETE FROM scrap_items WHERE id = ? AND guild_id = ?`).run(itemId, guildId);
}

function getScrapItem(guildId, itemId) {
  return db.prepare(`SELECT * FROM scrap_items WHERE id = ? AND guild_id = ?`).get(itemId, guildId) || null;
}

function listScrapItems(guildId, { enabledOnly = false } = {}) {
  const query = enabledOnly ? `SELECT * FROM scrap_items WHERE guild_id = ? AND enabled = 1 ORDER BY name` : `SELECT * FROM scrap_items WHERE guild_id = ? ORDER BY name`;
  return db.prepare(query).all(guildId);
}

/** Sum of every item's quantity in this player's inventory - the value checked against scrap_merchant_settings.max_inventory_items before a new bonus drop is allowed in. */
function getScrapInventoryTotal(guildId, discordId) {
  const row = db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS total FROM player_scrap_inventory WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId);
  return row.total;
}

/** Adds one unit of the given item to a player's inventory - caller (utils/scrapMerchant.js's rollBonusDrop) is responsible for the cap check beforehand. */
function addScrapItem(guildId, discordId, itemId, quantity = 1) {
  db.prepare(
    `INSERT INTO player_scrap_inventory (guild_id, discord_id, item_id, quantity) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`
  ).run(guildId, discordId, itemId, quantity);
}

/** Every item type this player currently holds, joined with its catalog info (name/emoji/price) so a sell-off doesn't break on a since-deleted item. */
function listPlayerScrapInventory(guildId, discordId) {
  return db
    .prepare(
      `SELECT inv.item_id, inv.quantity, i.name, i.emoji, i.price_mode, i.fixed_price, i.min_price, i.max_price
       FROM player_scrap_inventory inv
       JOIN scrap_items i ON i.id = inv.item_id AND i.guild_id = inv.guild_id
       WHERE inv.guild_id = ? AND inv.discord_id = ? AND inv.quantity > 0
       ORDER BY i.name`
    )
    .all(guildId, discordId);
}

function getPlayerScrapItemQuantity(guildId, discordId, itemId) {
  const row = db.prepare(`SELECT quantity FROM player_scrap_inventory WHERE guild_id = ? AND discord_id = ? AND item_id = ?`).get(guildId, discordId, itemId);
  return row?.quantity ?? 0;
}

/** Removes up to `quantity` units - deletes the row entirely once it hits 0 rather than leaving a stale zero-quantity row (matches shop_cart_items' convention). Clamps to whatever's actually held, never goes negative. */
function removeScrapItem(guildId, discordId, itemId, quantity) {
  const held = getPlayerScrapItemQuantity(guildId, discordId, itemId);
  const remaining = Math.max(0, held - quantity);
  if (remaining <= 0) {
    db.prepare(`DELETE FROM player_scrap_inventory WHERE guild_id = ? AND discord_id = ? AND item_id = ?`).run(guildId, discordId, itemId);
  } else {
    db.prepare(`UPDATE player_scrap_inventory SET quantity = ? WHERE guild_id = ? AND discord_id = ? AND item_id = ?`).run(remaining, guildId, discordId, itemId);
  }
  return Math.min(quantity, held); // actual amount removed/sold, in case the caller asked for more than they held
}

/** Clears a player's entire scrap inventory in one shot - used by Sell All after payout's already been credited. */
function clearScrapInventory(guildId, discordId) {
  db.prepare(`DELETE FROM player_scrap_inventory WHERE guild_id = ? AND discord_id = ?`).run(guildId, discordId);
}

// ---------------------------------------------------------------------------
// The Ticket Jackpot (utils/ticketJackpot.js)
// ---------------------------------------------------------------------------

function getJackpotSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM jackpot_settings s
       LEFT JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

/** Upserts only the fields provided, same partial-update convention as upsertVaultHeistSettings. */
function upsertJackpotSettings(guildId, fields) {
  const existing = getJackpotSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO jackpot_settings (guild_id, currency_id, base_price, elite_price, vip_price, base_emoji, elite_emoji, vip_emoji, max_pool_ceiling, prize_splits)
     VALUES (@guildId, @currencyId, @basePrice, @elitePrice, @vipPrice, @baseEmoji, @eliteEmoji, @vipEmoji, @maxPoolCeiling, @prizeSplits)
     ON CONFLICT(guild_id) DO UPDATE SET
       currency_id = excluded.currency_id, base_price = excluded.base_price, elite_price = excluded.elite_price, vip_price = excluded.vip_price,
       base_emoji = excluded.base_emoji, elite_emoji = excluded.elite_emoji, vip_emoji = excluded.vip_emoji,
       max_pool_ceiling = excluded.max_pool_ceiling, prize_splits = excluded.prize_splits`
  ).run({
    guildId,
    currencyId: merged.currency_id ?? null,
    basePrice: merged.base_price ?? 10,
    elitePrice: merged.elite_price ?? 50,
    vipPrice: merged.vip_price ?? 200,
    baseEmoji: merged.base_emoji ?? "🎫",
    eliteEmoji: merged.elite_emoji ?? "🎟️",
    vipEmoji: merged.vip_emoji ?? "💎",
    maxPoolCeiling: merged.max_pool_ceiling ?? 10000,
    prizeSplits: merged.prize_splits ?? "70,20,10",
  });
}

function resetJackpotConfig(guildId) {
  db.prepare(`DELETE FROM jackpot_settings WHERE guild_id = ?`).run(guildId);
}

/** Opens a fresh pot if none is open yet - idempotent, safe to call on every "Play -> Ticket Jackpot" entry. */
function getOrOpenJackpot(guildId) {
  const existing = db.prepare(`SELECT * FROM jackpot_active WHERE guild_id = ?`).get(guildId);
  if (existing) return existing;
  db.prepare(`INSERT INTO jackpot_active (guild_id, pool_amount, total_tickets, status, started_at) VALUES (?, 0, 0, 'open', ?)`).run(guildId, Date.now());
  return db.prepare(`SELECT * FROM jackpot_active WHERE guild_id = ?`).get(guildId);
}

function getJackpot(guildId) {
  return db.prepare(`SELECT * FROM jackpot_active WHERE guild_id = ?`).get(guildId) || null;
}

/** Records a ticket purchase and grows the pot - caller has already charged the player's wallet. Returns the updated pot row. */
function buyJackpotTickets(guildId, discordId, tier, count, cost) {
  db.prepare(
    `INSERT INTO jackpot_tickets (guild_id, discord_id, tier, ticket_count, spent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, discord_id, tier) DO UPDATE SET ticket_count = ticket_count + excluded.ticket_count, spent = spent + excluded.spent`
  ).run(guildId, discordId, tier, count, cost);
  db.prepare(`UPDATE jackpot_active SET pool_amount = pool_amount + ?, total_tickets = total_tickets + ? WHERE guild_id = ?`).run(cost, count, guildId);
  return getJackpot(guildId);
}

function setJackpotStatus(guildId, status) {
  db.prepare(`UPDATE jackpot_active SET status = ? WHERE guild_id = ?`).run(status, guildId);
}

/** Every player's AGGREGATE ticket count across all 3 tiers for this pot, highest first - the weighted draw pool. */
function listJackpotEntrants(guildId) {
  return db
    .prepare(`SELECT discord_id, SUM(ticket_count) AS tickets FROM jackpot_tickets WHERE guild_id = ? GROUP BY discord_id HAVING tickets > 0 ORDER BY tickets DESC`)
    .all(guildId);
}

/** Pot drawn and paid out - wipes this pot's tickets and re-opens a fresh one at 0, same "never archived, always resets" convention as closeVault. */
function closeJackpotAndReopen(guildId) {
  db.prepare(`DELETE FROM jackpot_tickets WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM jackpot_active WHERE guild_id = ?`).run(guildId);
  return getOrOpenJackpot(guildId);
}

// ---------------------------------------------------------------------------
// The Bradley APC Ambush (utils/bradleyAmbush.js)
// ---------------------------------------------------------------------------

function getBradleyAmbushSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM bradley_ambush_settings s
       LEFT JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

function upsertBradleyAmbushSettings(guildId, fields) {
  const existing = getBradleyAmbushSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO bradley_ambush_settings (guild_id, channel_id, currency_id, interval_hours, entry_fee, checkin_minutes, combat_minutes, max_hp, action_cooldown_seconds, armor_crack_seconds, loot_kit_name, mvp_bonus_amount, last_spawned_at)
     VALUES (@guildId, @channelId, @currencyId, @intervalHours, @entryFee, @checkinMinutes, @combatMinutes, @maxHp, @actionCooldownSeconds, @armorCrackSeconds, @lootKitName, @mvpBonusAmount, @lastSpawnedAt)
     ON CONFLICT(guild_id) DO UPDATE SET
       channel_id = excluded.channel_id, currency_id = excluded.currency_id, interval_hours = excluded.interval_hours, entry_fee = excluded.entry_fee,
       checkin_minutes = excluded.checkin_minutes, combat_minutes = excluded.combat_minutes, max_hp = excluded.max_hp,
       action_cooldown_seconds = excluded.action_cooldown_seconds, armor_crack_seconds = excluded.armor_crack_seconds,
       loot_kit_name = excluded.loot_kit_name, mvp_bonus_amount = excluded.mvp_bonus_amount, last_spawned_at = excluded.last_spawned_at`
  ).run({
    guildId,
    channelId: merged.channel_id ?? null,
    currencyId: merged.currency_id ?? null,
    intervalHours: merged.interval_hours ?? 0,
    entryFee: merged.entry_fee ?? 0,
    checkinMinutes: merged.checkin_minutes ?? 3,
    combatMinutes: merged.combat_minutes ?? 15,
    maxHp: merged.max_hp ?? 1000,
    actionCooldownSeconds: merged.action_cooldown_seconds ?? 5,
    armorCrackSeconds: merged.armor_crack_seconds ?? 45,
    lootKitName: merged.loot_kit_name ?? null,
    mvpBonusAmount: merged.mvp_bonus_amount ?? 500,
    lastSpawnedAt: merged.last_spawned_at ?? null,
  });
}

function resetBradleyAmbushConfig(guildId) {
  db.prepare(`DELETE FROM bradley_ambush_settings WHERE guild_id = ?`).run(guildId);
}

function markBradleyAmbushSpawned(guildId, when) {
  db.prepare(`UPDATE bradley_ambush_settings SET last_spawned_at = ? WHERE guild_id = ?`).run(when, guildId);
}

function getActiveBradleyAmbush(guildId) {
  return db.prepare(`SELECT * FROM bradley_ambush_active WHERE guild_id = ? AND phase != 'resolved'`).get(guildId) || null;
}

function createBradleyAmbush(guildId, channelId, maxHp, checkinEndsAt) {
  const info = db
    .prepare(`INSERT INTO bradley_ambush_active (guild_id, channel_id, phase, current_hp, max_hp, checkin_ends_at, started_at) VALUES (?, ?, 'checkin', ?, ?, ?, ?)`)
    .run(guildId, channelId, maxHp, maxHp, checkinEndsAt, Date.now());
  return info.lastInsertRowid;
}

function getBradleyAmbush(id) {
  return db.prepare(`SELECT * FROM bradley_ambush_active WHERE id = ?`).get(id) || null;
}

function setBradleyAmbushMessageId(id, messageId) {
  db.prepare(`UPDATE bradley_ambush_active SET message_id = ? WHERE id = ?`).run(messageId, id);
}

function joinBradleyAmbush(ambushId, discordId) {
  db.prepare(`INSERT OR IGNORE INTO bradley_ambush_participants (ambush_id, discord_id, joined_at) VALUES (?, ?, ?)`).run(ambushId, discordId, Date.now());
}

function listBradleyAmbushParticipants(ambushId) {
  return db.prepare(`SELECT * FROM bradley_ambush_participants WHERE ambush_id = ?`).all(ambushId);
}

function startBradleyAmbushCombat(id, combatEndsAt) {
  db.prepare(`UPDATE bradley_ambush_active SET phase = 'combat', combat_ends_at = ? WHERE id = ?`).run(combatEndsAt, id);
}

function getBradleyAmbushCooldown(ambushId, discordId) {
  return db.prepare(`SELECT * FROM bradley_ambush_damage WHERE ambush_id = ? AND discord_id = ?`).get(ambushId, discordId) || null;
}

function recordBradleyAmbushDamage(ambushId, discordId, amount, when) {
  db.prepare(
    `INSERT INTO bradley_ambush_damage (ambush_id, discord_id, damage, last_action_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(ambush_id, discord_id) DO UPDATE SET damage = damage + excluded.damage, last_action_at = excluded.last_action_at`
  ).run(ambushId, discordId, amount, when);
}

function damageBradleyAmbush(id, amount) {
  db.prepare(`UPDATE bradley_ambush_active SET current_hp = MAX(0, current_hp - ?) WHERE id = ?`).run(amount, id);
  return getBradleyAmbush(id).current_hp;
}

function setBradleyAmbushArmorCracked(id, until) {
  db.prepare(`UPDATE bradley_ambush_active SET armor_cracked_until = ? WHERE id = ?`).run(until, id);
}

function listBradleyAmbushDamage(ambushId) {
  return db.prepare(`SELECT * FROM bradley_ambush_damage WHERE ambush_id = ? ORDER BY damage DESC`).all(ambushId);
}

/** Resolved (cracked, timed out, or cancelled for no check-ins) - removes every row tied to this event, matching closeVault's "never archived" convention. */
function closeBradleyAmbush(id) {
  db.prepare(`DELETE FROM bradley_ambush_damage WHERE ambush_id = ?`).run(id);
  db.prepare(`DELETE FROM bradley_ambush_participants WHERE ambush_id = ?`).run(id);
  db.prepare(`DELETE FROM bradley_ambush_active WHERE id = ?`).run(id);
}

/** Only used to flip an about-to-timeout check-in/combat row straight to 'resolved' right before closeBradleyAmbush deletes it - exists so a stale button click racing the background tick sees a consistent "not active" state instead of a half-deleted row. */
function markBradleyAmbushResolved(id) {
  db.prepare(`UPDATE bradley_ambush_active SET phase = 'resolved' WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// The Recycler Roulette (utils/recyclerRoulette.js)
// ---------------------------------------------------------------------------

function getRecyclerRouletteSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM recycler_roulette_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

function setRecyclerRouletteSettings(guildId, currencyId, minBet, maxBet) {
  db.prepare(
    `INSERT INTO recycler_roulette_settings (guild_id, currency_id, min_bet, max_bet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET currency_id = excluded.currency_id, min_bet = excluded.min_bet, max_bet = excluded.max_bet`
  ).run(guildId, currencyId, minBet, maxBet);
}

function resetRecyclerRouletteConfig(guildId) {
  db.prepare(`DELETE FROM recycler_roulette_settings WHERE guild_id = ?`).run(guildId);
}

function getActiveRecyclerRun(guildId, discordId) {
  return db.prepare(`SELECT * FROM recycler_roulette_runs WHERE guild_id = ? AND discord_id = ? AND status = 'active'`).get(guildId, discordId) || null;
}

function createRecyclerRun(guildId, discordId, currencyId, wager) {
  const now = Date.now();
  const info = db
    .prepare(`INSERT INTO recycler_roulette_runs (guild_id, discord_id, currency_id, wager, tier, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 'active', ?, ?)`)
    .run(guildId, discordId, currencyId, wager, now, now);
  return info.lastInsertRowid;
}

function getRecyclerRun(id) {
  return db.prepare(`SELECT * FROM recycler_roulette_runs WHERE id = ?`).get(id) || null;
}

function setRecyclerRunTier(id, tier) {
  db.prepare(`UPDATE recycler_roulette_runs SET tier = ?, updated_at = ? WHERE id = ?`).run(tier, Date.now(), id);
}

function closeRecyclerRun(id, status) {
  db.prepare(`UPDATE recycler_roulette_runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), id);
}

// ---------------------------------------------------------------------------
// The Target Range (utils/targetRange.js)
// ---------------------------------------------------------------------------

function getTargetRangeSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM target_range_settings s
       JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

function upsertTargetRangeSettings(guildId, fields) {
  const existing = getTargetRangeSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO target_range_settings (guild_id, currency_id, entry_fee, grid_size, shuffle_interval_ms, round_seconds, loot_table)
     VALUES (@guildId, @currencyId, @entryFee, @gridSize, @shuffleIntervalMs, @roundSeconds, @lootTable)
     ON CONFLICT(guild_id) DO UPDATE SET
       currency_id = excluded.currency_id, entry_fee = excluded.entry_fee, grid_size = excluded.grid_size,
       shuffle_interval_ms = excluded.shuffle_interval_ms, round_seconds = excluded.round_seconds, loot_table = excluded.loot_table`
  ).run({
    guildId,
    currencyId: merged.currency_id ?? null,
    entryFee: merged.entry_fee ?? 20,
    gridSize: merged.grid_size ?? 3,
    shuffleIntervalMs: merged.shuffle_interval_ms ?? 1500,
    roundSeconds: merged.round_seconds ?? 30,
    lootTable: merged.loot_table ?? "0:0,10:50,25:150,50:400",
  });
}

function resetTargetRangeConfig(guildId) {
  db.prepare(`DELETE FROM target_range_settings WHERE guild_id = ?`).run(guildId);
}

function getActiveTargetRangeRun(guildId, discordId) {
  return db.prepare(`SELECT * FROM target_range_runs WHERE guild_id = ? AND discord_id = ? AND status = 'active'`).get(guildId, discordId) || null;
}

function createTargetRangeRun(guildId, discordId, currencyId, entryFee, gridSize, roundEndsAt) {
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO target_range_runs (guild_id, discord_id, currency_id, entry_fee, grid_size, score, multiplier, target_index, status, round_ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?, 'active', ?, ?, ?)`
    )
    .run(guildId, discordId, currencyId, entryFee, gridSize, Math.floor(Math.random() * gridSize * gridSize), roundEndsAt, now, now);
  return info.lastInsertRowid;
}

function getTargetRangeRun(id) {
  return db.prepare(`SELECT * FROM target_range_runs WHERE id = ?`).get(id) || null;
}

function updateTargetRangeRun(id, fields) {
  db.prepare(`UPDATE target_range_runs SET score = ?, multiplier = ?, target_index = ?, updated_at = ? WHERE id = ?`).run(fields.score, fields.multiplier, fields.targetIndex, Date.now(), id);
}

function closeTargetRangeRun(id) {
  db.prepare(`UPDATE target_range_runs SET status = 'done', updated_at = ? WHERE id = ?`).run(Date.now(), id);
}

/** Best-ever score - only overwrites when the new score is strictly higher, same "never regresses" convention as pvp_streaks.best_streak. */
function recordTargetRangeScore(guildId, discordId, score) {
  const existing = db.prepare(`SELECT best_score FROM target_range_scores WHERE guild_id = ? AND discord_id = ?`).get(guildId, discordId);
  if (!existing) {
    db.prepare(`INSERT INTO target_range_scores (guild_id, discord_id, best_score, achieved_at) VALUES (?, ?, ?, ?)`).run(guildId, discordId, score, Date.now());
    return;
  }
  if (score > existing.best_score) {
    db.prepare(`UPDATE target_range_scores SET best_score = ?, achieved_at = ? WHERE guild_id = ? AND discord_id = ?`).run(score, Date.now(), guildId, discordId);
  }
}

function getTargetRangeLeaderboard(guildId, limit = 10) {
  return db.prepare(`SELECT * FROM target_range_scores WHERE guild_id = ? ORDER BY best_score DESC LIMIT ?`).all(guildId, limit);
}

// ---------------------------------------------------------------------------
// Cargo Ship Heist (utils/cargoShipHeist.js)
// ---------------------------------------------------------------------------

function getCargoShipHeistSettings(guildId) {
  const row = db
    .prepare(
      `SELECT s.*, c.name AS currency_name, c.emoji AS currency_emoji
       FROM cargo_ship_heist_settings s
       LEFT JOIN shop_currencies c ON c.id = s.currency_id AND c.guild_id = s.guild_id
       WHERE s.guild_id = ?`
    )
    .get(guildId);
  return row || null;
}

function upsertCargoShipHeistSettings(guildId, fields) {
  const existing = getCargoShipHeistSettings(guildId) || {};
  const merged = { ...existing, ...fields };
  db.prepare(
    `INSERT INTO cargo_ship_heist_settings (guild_id, channel_id, currency_id, interval_hours, entry_fee, lobby_minutes, round_seconds, rounds_total, grand_prize_amount, smoke_block_seconds, flank_steal_pct, last_spawned_at)
     VALUES (@guildId, @channelId, @currencyId, @intervalHours, @entryFee, @lobbyMinutes, @roundSeconds, @roundsTotal, @grandPrizeAmount, @smokeBlockSeconds, @flankStealPct, @lastSpawnedAt)
     ON CONFLICT(guild_id) DO UPDATE SET
       channel_id = excluded.channel_id, currency_id = excluded.currency_id, interval_hours = excluded.interval_hours, entry_fee = excluded.entry_fee,
       lobby_minutes = excluded.lobby_minutes, round_seconds = excluded.round_seconds, rounds_total = excluded.rounds_total,
       grand_prize_amount = excluded.grand_prize_amount, smoke_block_seconds = excluded.smoke_block_seconds, flank_steal_pct = excluded.flank_steal_pct,
       last_spawned_at = excluded.last_spawned_at`
  ).run({
    guildId,
    channelId: merged.channel_id ?? null,
    currencyId: merged.currency_id ?? null,
    intervalHours: merged.interval_hours ?? 0,
    entryFee: merged.entry_fee ?? 100,
    lobbyMinutes: merged.lobby_minutes ?? 5,
    roundSeconds: merged.round_seconds ?? 30,
    roundsTotal: merged.rounds_total ?? 10,
    grandPrizeAmount: merged.grand_prize_amount ?? 5000,
    smokeBlockSeconds: merged.smoke_block_seconds ?? 15,
    flankStealPct: merged.flank_steal_pct ?? 5,
    lastSpawnedAt: merged.last_spawned_at ?? null,
  });
}

function resetCargoShipHeistConfig(guildId) {
  db.prepare(`DELETE FROM cargo_ship_heist_settings WHERE guild_id = ?`).run(guildId);
}

function markCargoShipHeistSpawned(guildId, when) {
  db.prepare(`UPDATE cargo_ship_heist_settings SET last_spawned_at = ? WHERE guild_id = ?`).run(when, guildId);
}

function getActiveCargoShipHeist(guildId) {
  return db.prepare(`SELECT * FROM cargo_ship_heist_active WHERE guild_id = ? AND phase != 'resolved'`).get(guildId) || null;
}

function createCargoShipHeist(guildId, channelId, lobbyEndsAt) {
  const info = db.prepare(`INSERT INTO cargo_ship_heist_active (guild_id, channel_id, phase, current_round, lobby_ends_at, started_at) VALUES (?, ?, 'lobby', 0, ?, ?)`).run(guildId, channelId, lobbyEndsAt, Date.now());
  return info.lastInsertRowid;
}

function getCargoShipHeist(id) {
  return db.prepare(`SELECT * FROM cargo_ship_heist_active WHERE id = ?`).get(id) || null;
}

function setCargoShipHeistMessageId(id, messageId) {
  db.prepare(`UPDATE cargo_ship_heist_active SET message_id = ? WHERE id = ?`).run(messageId, id);
}

/** Boards the ship - starts this entrant with an even split of whatever's left of 100% (so a 4th boarder takes from the other 3 evenly, not from a fixed pre-divided pool). */
function joinCargoShipHeist(heistId, discordId) {
  const entrants = listCargoShipHeistEntrants(heistId);
  const n = entrants.length + 1;
  const evenShare = 100 / n;
  db.prepare(`UPDATE cargo_ship_heist_entrants SET control_pct = ? WHERE heist_id = ?`).run(evenShare, heistId);
  db.prepare(`INSERT OR IGNORE INTO cargo_ship_heist_entrants (heist_id, discord_id, control_pct, joined_at) VALUES (?, ?, ?, ?)`).run(heistId, discordId, evenShare, Date.now());
}

function listCargoShipHeistEntrants(heistId) {
  return db.prepare(`SELECT * FROM cargo_ship_heist_entrants WHERE heist_id = ? ORDER BY control_pct DESC`).all(heistId);
}

function getCargoShipHeistEntrant(heistId, discordId) {
  return db.prepare(`SELECT * FROM cargo_ship_heist_entrants WHERE heist_id = ? AND discord_id = ?`).get(heistId, discordId) || null;
}

function startCargoShipHeistCombat(id, roundEndsAt) {
  db.prepare(`UPDATE cargo_ship_heist_active SET phase = 'combat', current_round = 1, round_ends_at = ? WHERE id = ?`).run(roundEndsAt, id);
}

function setCargoShipHeistRound(id, round, roundEndsAt) {
  db.prepare(`UPDATE cargo_ship_heist_active SET current_round = ?, round_ends_at = ? WHERE id = ?`).run(round, roundEndsAt, id);
}

/** Defend Area - marks this entrant as defending for the CURRENT round only (halves Flank Deck's steal against them until the next round starts). */
function setCargoShipDefending(heistId, discordId, round) {
  db.prepare(`UPDATE cargo_ship_heist_entrants SET defending_round = ?, acted_round = ? WHERE heist_id = ? AND discord_id = ?`).run(round, round, heistId, discordId);
}

/** One action (Defend/Flank/Smoke) per entrant per round - mirrors vault_heist_damage's shared-cooldown-across-buttons convention, just gated per ROUND instead of per wall-clock seconds, matching this event's round-based state machine. */
function setCargoShipActed(heistId, discordId, round) {
  db.prepare(`UPDATE cargo_ship_heist_entrants SET acted_round = ? WHERE heist_id = ? AND discord_id = ?`).run(round, heistId, discordId);
}

/** Flank Deck - steals stealPct (halved if the leader is defending this round) from whoever currently holds the most control, floored at 0, and adds it to the attacker. No-op (returns null) if the attacker IS the leader (can't flank yourself). */
function flankCargoShipLeader(heistId, attackerDiscordId, stealPct, currentRound) {
  const entrants = listCargoShipHeistEntrants(heistId);
  const leader = entrants[0];
  if (!leader || leader.discord_id === attackerDiscordId) return null;
  const effectiveSteal = leader.defending_round === currentRound ? stealPct / 2 : stealPct;
  const actualSteal = Math.min(effectiveSteal, leader.control_pct);
  db.prepare(`UPDATE cargo_ship_heist_entrants SET control_pct = control_pct - ? WHERE heist_id = ? AND discord_id = ?`).run(actualSteal, heistId, leader.discord_id);
  db.prepare(`UPDATE cargo_ship_heist_entrants SET control_pct = control_pct + ? WHERE heist_id = ? AND discord_id = ?`).run(actualSteal, heistId, attackerDiscordId);
  return { leaderId: leader.discord_id, stolen: actualSteal };
}

/** Throw Smoke Grenade - blinds (disables every action button for) a target for smoke_block_seconds. */
function setCargoShipSmokeBlocked(heistId, discordId, until) {
  db.prepare(`UPDATE cargo_ship_heist_entrants SET smoke_blocked_until = ? WHERE heist_id = ? AND discord_id = ?`).run(until, heistId, discordId);
}

/** End-of-round snapshot - adds this round's control_pct to every entrant's running control_duration total (the actual win condition). */
function accumulateCargoShipControlDuration(heistId) {
  db.prepare(`UPDATE cargo_ship_heist_entrants SET control_duration = control_duration + control_pct WHERE heist_id = ?`).run(heistId);
}

function closeCargoShipHeist(id) {
  db.prepare(`DELETE FROM cargo_ship_heist_entrants WHERE heist_id = ?`).run(id);
  db.prepare(`DELETE FROM cargo_ship_heist_active WHERE id = ?`).run(id);
}

function markCargoShipHeistResolved(id) {
  db.prepare(`UPDATE cargo_ship_heist_active SET phase = 'resolved' WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------

function createGiveaway(fields) {
  const now = Date.now();
  const defaults = {
    brand_name: "Giveaways",
    logo_url: "",
    color_bg: "#07070d",
    color_cyan: "#00f0ff",
    color_magenta: "#ff2ec4",
    color_lime: "#c6ff3d",
    fomo_text: "Entries close the instant the timer hits zero — no extensions, no exceptions.",
    footer_text: "© {year} {brand}. All rights reserved.",
    youtube_url: "",
    media_urls: "[]",
  };
  const result = db
    .prepare(
      `INSERT INTO giveaways (
         slug, status, title, kicker, subheadline, prize_title, prize_value, prize_items, tasks, end_timestamp,
         brand_name, logo_url, color_bg, color_cyan, color_magenta, color_lime, fomo_text, footer_text, youtube_url, media_urls, created_at, updated_at
       ) VALUES (
         @slug, 'draft', @title, @kicker, @subheadline, @prize_title, @prize_value, @prize_items, @tasks, @end_timestamp,
         @brand_name, @logo_url, @color_bg, @color_cyan, @color_magenta, @color_lime, @fomo_text, @footer_text, @youtube_url, @media_urls, @now, @now
       )`
    )
    .run({ ...defaults, ...fields, now });
  return result.lastInsertRowid;
}

function updateGiveaway(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE giveaways SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run({
    ...fields,
    id,
    updated_at: Date.now(),
  });
}

function getGiveaway(id) {
  return db.prepare(`SELECT * FROM giveaways WHERE id = ?`).get(id) || null;
}

function getGiveawayBySlug(slug) {
  return db.prepare(`SELECT * FROM giveaways WHERE slug = ?`).get(slug) || null;
}

function listGiveaways() {
  return db.prepare(`SELECT * FROM giveaways ORDER BY created_at DESC`).all();
}

function listPublishedGiveaways() {
  return db.prepare(`SELECT * FROM giveaways WHERE status = 'published' ORDER BY end_timestamp ASC`).all();
}

function deleteGiveaway(id) {
  db.prepare(`DELETE FROM giveaway_entries WHERE giveaway_id = ?`).run(id);
  db.prepare(`DELETE FROM giveaways WHERE id = ?`).run(id);
}

function createGiveawayEntry(giveawayId, gamertag, email, completedTasks, totalEntries) {
  db.prepare(
    `INSERT INTO giveaway_entries (giveaway_id, gamertag, email, completed_tasks, total_entries, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(giveawayId, gamertag, email, JSON.stringify(completedTasks), totalEntries, Date.now());
}

function listGiveawayEntries(giveawayId) {
  return db.prepare(`SELECT * FROM giveaway_entries WHERE giveaway_id = ? ORDER BY created_at DESC`).all(giveawayId);
}

function countGiveawayEntries(giveawayId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway_id = ?`).get(giveawayId).n;
}

/**
 * Weighted random draw: each entry's chance of winning is proportional to
 * its total_entries (more completed bonus tasks = more weighted tickets in
 * the pool), same "more entries = better odds, not a guarantee" model the
 * giveaway page's own FAQ copy already promises players. Picks and records
 * the winner (winner_entry_id + drawn_at) and flips status to 'ended', but
 * does NOT post to Discord itself - that's utils/giveawayAnnounce.js's job,
 * running in the separate bot process, polled via backgroundLoops.js so a
 * draw triggered from the admin dashboard still gets announced even though
 * admin/server.js has no live discord.js Client of its own.
 */
function drawGiveawayWinner(giveawayId) {
  const entries = listGiveawayEntries(giveawayId);
  if (!entries.length) return { ok: false, reason: "no_entries" };

  const totalWeight = entries.reduce((sum, e) => sum + Math.max(1, e.total_entries), 0);
  let roll = Math.random() * totalWeight;
  let winner = entries[entries.length - 1]; // fallback for float rounding at the very end of the range
  for (const entry of entries) {
    roll -= Math.max(1, entry.total_entries);
    if (roll <= 0) {
      winner = entry;
      break;
    }
  }

  const now = Date.now();
  db.prepare(`UPDATE giveaways SET winner_entry_id = ?, drawn_at = ?, status = 'ended', updated_at = ? WHERE id = ?`).run(winner.id, now, now, giveawayId);
  return { ok: true, winner };
}

function getGiveawayWinnerEntry(giveawayId) {
  const giveaway = getGiveaway(giveawayId);
  if (!giveaway?.winner_entry_id) return null;
  return db.prepare(`SELECT * FROM giveaway_entries WHERE id = ?`).get(giveaway.winner_entry_id) || null;
}

/** Giveaways with a winner drawn but not yet posted to Discord - polled by utils/giveawayAnnounce.js in the bot process. */
function listGiveawaysNeedingAnnouncement() {
  return db.prepare(`SELECT * FROM giveaways WHERE winner_entry_id IS NOT NULL AND announced_at IS NULL AND announce_guild_id != '' AND announce_channel_id != ''`).all();
}

function markGiveawayAnnounced(giveawayId) {
  db.prepare(`UPDATE giveaways SET announced_at = ? WHERE id = ?`).run(Date.now(), giveawayId);
}

// ---------------------------------------------------------------------------
// Entity Spawning (/spawn) - saved locations + auto-respawn groups. See
// schema.sql's header comment on entity_spawn_locations/entity_respawn_groups.
// ---------------------------------------------------------------------------

function addEntitySpawnLocation(guildId, { label, entityKey, x, y, z, createdBy }) {
  const info = db
    .prepare(`INSERT INTO entity_spawn_locations (guild_id, label, entity_key, x, y, z, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(guildId, label, entityKey, x, y, z, createdBy, Date.now());
  return info.lastInsertRowid;
}

function listEntitySpawnLocations(guildId) {
  return db.prepare(`SELECT * FROM entity_spawn_locations WHERE guild_id = ? ORDER BY label ASC`).all(guildId);
}

function getEntitySpawnLocation(guildId, id) {
  return db.prepare(`SELECT * FROM entity_spawn_locations WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function removeEntitySpawnLocation(guildId, id) {
  db.prepare(`DELETE FROM entity_spawn_locations WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function addEntityRespawnGroup(guildId, { label, entityKey, x, y, z, intervalMinutes, createdBy }) {
  const info = db
    .prepare(
      `INSERT INTO entity_respawn_groups (guild_id, label, entity_key, x, y, z, interval_minutes, enabled, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(guildId, label, entityKey, x, y, z, intervalMinutes, createdBy, Date.now());
  return info.lastInsertRowid;
}

function listEntityRespawnGroups(guildId) {
  return db.prepare(`SELECT * FROM entity_respawn_groups WHERE guild_id = ? ORDER BY label ASC`).all(guildId);
}

function getEntityRespawnGroup(guildId, id) {
  return db.prepare(`SELECT * FROM entity_respawn_groups WHERE guild_id = ? AND id = ?`).get(guildId, id) || null;
}

function removeEntityRespawnGroup(guildId, id) {
  db.prepare(`DELETE FROM entity_respawn_groups WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

function setEntityRespawnGroupEnabled(guildId, id, enabled) {
  db.prepare(`UPDATE entity_respawn_groups SET enabled = ? WHERE guild_id = ? AND id = ?`).run(enabled ? 1 : 0, guildId, id);
}

/** Every enabled group across every guild - called once per tick, same "global sweep" pattern as the rest of utils/backgroundLoops.js. */
function listEnabledEntityRespawnGroups() {
  return db.prepare(`SELECT * FROM entity_respawn_groups WHERE enabled = 1`).all();
}

function markEntityRespawnGroupSpawned(id) {
  db.prepare(`UPDATE entity_respawn_groups SET last_spawned_at = ? WHERE id = ?`).run(Date.now(), id);
}

// ---------------------------------------------------------------------------
// ORP ("ZORP"-style Offline Raid Protection) zones - commands/orp.js +
// utils/orpZones.js. See schema.sql's orp_zones header for the one-per-team
// design and why state is flipped by a background tick, not a live event.
// ---------------------------------------------------------------------------

function getOrpZone(guildId, teamName) {
  return db.prepare(`SELECT * FROM orp_zones WHERE guild_id = ? AND team_name = ?`).get(guildId, teamName) || null;
}

/** Every ORP zone across every guild - called once per tick, same "global sweep" pattern as listEnabledEntityRespawnGroups above. */
function listAllOrpZones() {
  return db.prepare(`SELECT * FROM orp_zones`).all();
}

/** /orp register - replaces any existing zone for this team, same "setting a new one replaces the old" convention as setPlayerHome. shape/box_* are snapshotted from the guild's /orp configure default at register time - see schema.sql's orp_zones header. radius is 0/unused when shape is 'Box'. */
function upsertOrpZone(guildId, teamName, { zoneName, x, y, z, radius, shape = "Sphere", boxWidth = null, boxHeight = null, boxLength = null, createdBy }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO orp_zones (guild_id, team_name, zone_name, center_x, center_y, center_z, radius, state, created_by, created_at, updated_at, shape, box_width, box_height, box_length)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, team_name) DO UPDATE SET
       zone_name = excluded.zone_name, center_x = excluded.center_x, center_y = excluded.center_y, center_z = excluded.center_z,
       radius = excluded.radius, state = 'online', created_by = excluded.created_by, updated_at = excluded.updated_at,
       shape = excluded.shape, box_width = excluded.box_width, box_height = excluded.box_height, box_length = excluded.box_length`
  ).run(guildId, teamName, zoneName, x, y, z, radius, createdBy, now, now, shape, boxWidth, boxHeight, boxLength);
  return getOrpZone(guildId, teamName);
}

function setOrpZoneState(guildId, teamName, state) {
  db.prepare(`UPDATE orp_zones SET state = ?, updated_at = ? WHERE guild_id = ? AND team_name = ?`).run(state, Date.now(), guildId, teamName);
}

function deleteOrpZone(guildId, teamName) {
  db.prepare(`DELETE FROM orp_zones WHERE guild_id = ? AND team_name = ?`).run(guildId, teamName);
}

module.exports = {
  raw: db,
  // premium
  setPremiumUser,
  extendPremiumUser,
  isPremiumUser,
  getPremiumRecord,
  isGuildAuthorized,
  isPremiumElsewhere,
  transferGuildLicense,
  getGuildOwnerDiscordId,
  revokePremiumUser,
  listPremiumUsers,
  grantLicenses,
  listLicenseGrants,
  revokeLicenseGrant,
  getActiveLicenseForGuild,
  getGuildPlan,
  upsertKnownUser,
  findUserIdByUsername,
  getKnownUsername,
  // config
  getConfig,
  setConfig,
  // guild meta
  getGuildMeta,
  upsertGuildMeta,
  // teams
  getTeam,
  listTeams,
  createTeam,
  updateTeamFields,
  adjustTeamMaterials,
  deleteTeam,
  // rank overrides
  getRankOverride,
  listRankOverrides,
  setRankOverride,
  clearRankOverride,
  clearAllRankOverrides,
  // members
  getMember,
  listMembershipsByDiscordId,
  listVisibleLfgPostsForUser,
  getMemberByGamertag,
  getAnyLinkedGamertag,
  listTeamMembers,
  addMember,
  setMemberGamertag,
  setMemberRank,
  removeMember,
  getBoomIdentityByDiscordId,
  getBoomIdentityByPlatformId,
  getBoomIdentity,
  listSwipeablePlayers,
  getBoomIdentityByUsername,
  getOrCreateBoomIdentityByDiscordId,
  upsertBoomIdentityLink,
  setBoomIdentityProfile,
  generateBoomId,
  isUsernameAvailable,
  isOnboardingComplete,
  completeWebRegistration,
  setBoomIdentityBanned,
  logBoomIdentityAccess,
  findBannedIdentityByAccessIp,
  flagSuspiciousIp,
  listBoomIpFlags,
  findOrCreateDmConversation,
  getDmConversationFor,
  otherParticipant,
  listDmConversations,
  countUnreadDmConversations,
  listDmMessages,
  sendDmMessage,
  markDmConversationRead,
  banFromGuild,
  unbanFromGuild,
  isGuildBanned,
  listGuildBans,
  createLinkToken,
  getLinkToken,
  markLinkTokenUsed,
  queueRoleGrant,
  listPendingRoleGrants,
  clearRoleGrant,
  queueRankSync,
  listPendingRankSyncs,
  clearRankSync,
  logActivity,
  listRecentActivity,
  createTeamInvite,
  getTeamInvite,
  getPendingTeamInvite,
  setTeamInviteStatus,
  markTeamInviteDelivered,
  listPendingTeamInviteDeliveries,
  assignFireteamSlot,
  // queue
  getQueueEntry,
  pushToQueue,
  clearQueue,
  listDueQueueEntries,
  // zone events
  createZoneEvent,
  getZoneEvent,
  addEventJoin,
  listActiveZoneEvents,
  listDueZoneEvents,
  resolveZoneEvent,
  cancelZoneEvent,
  // referral reward engine
  createReferralCode,
  getReferralCode,
  redeemReferralCode,
  getReferralConfig,
  setReferralWelcomeGift,
  setLeaderboardReward,
  listLeaderboardRewards,
  getReferralLeaderboard,
  getReferralStatsByDiscordId,
  addTempRoleGrant,
  listDueTempRoleGrants,
  listActiveTempRoleIds,
  removeTempRoleGrant,
  getTempRoleGrant,
  transferTempRoleGrant,
  setGiftConfig,
  getGiftConfig,
  listGiftConfigs,
  setGiftEnabled,
  hasClaimedGift,
  recordGiftClaim,
  getTradeableRoleIds,
  addTradeableRole,
  removeTradeableRole,
  getClanWarLeaderboard,
  getEventWinLeaderboard,
  getPvpKillLeaderboard,
  getPveKillLeaderboard,
  upsertPlatformId,
  getGamertagByPlatformId,
  insertCombatEvent,
  getCombatEvent,
  getPvpStreak,
  bumpKillStreak,
  resetKillStreak,
  getClanSizeLeaderboard,
  getRichestLeaderboard,
  getPlaytimeLeaderboard,
  setGenericLeaderboardReward,
  listGenericLeaderboardRewards,
  setStaffPosition,
  getStaffPosition,
  listStaffPositions,
  listEnabledStaffPositions,
  deleteStaffPosition,
  setStaffPositionEnabled,
  createStaffApplication,
  getStaffApplication,
  setStaffApplicationStatus,
  hasPendingApplication,
  addTideWaypoint,
  removeTideWaypoint,
  listTideWaypoints,
  getRisingTidesEvent,
  upsertRisingTidesEvent,
  registerTidePlayer,
  getTidePlayer,
  eliminateTidePlayer,
  listTidePlayers,
  listTideSurvivors,
  clearTidePlayers,
  addCrateLootItem,
  removeCrateLootItem,
  listCrateLootItems,
  listCrateTiers,
  setCrateTierThreshold,
  listCrateTierThresholds,
  getActiveTierForSurvivorCount,
  getShipBattleEvent,
  upsertShipBattleEvent,
  registerShipBattlePlayer,
  getShipBattlePlayer,
  decrementShipBattleLife,
  listShipBattlePlayers,
  listShipBattleSurvivingTeams,
  clearShipBattlePlayers,
  addBoatWaypoint,
  removeBoatWaypoint,
  listBoatWaypoints,
  createCurrency,
  listCurrencies,
  getCurrency,
  setCurrencyInterestRate,
  deleteCurrency,
  createShop,
  listShops,
  getShop,
  updateShop,
  deleteShop,
  createCategory,
  listCategories,
  getCategory,
  deleteCategory,
  createProduct,
  listProducts,
  listProductsForShop,
  listAllItemProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  createSale,
  listActiveSales,
  deleteSale,
  getEffectivePrice,
  getWallet,
  listWallets,
  listWalletsByDiscordId,
  adjustWallet,
  resetAllWallets,
  getSavings,
  listSavings,
  adjustSavings,
  listAllSavingsAccounts,
  accrueSavingsInterest,
  getCartItems,
  setCartQuantity,
  clearCart,
  recordPurchase,
  setCurrencyMarketplaceBounds,
  setCurrencyMaxBalance,
  setCurrencyMaxSupply,
  grantFromSupply,
  createAuction,
  getAuction,
  setAuctionMessage,
  listActiveAuctions,
  listDueAuctions,
  setAuctionStatus,
  placeBid,
  buyNowAuction,
  markAuctionDelivered,
  createListing,
  getListing,
  listActiveListings,
  listSellerListings,
  buyListing,
  cancelListing,
  upsertDirectoryServer,
  createStandaloneDirectoryServer,
  updateStandaloneDirectoryServer,
  setDirectoryServerVerified,
  listDirectoryServersOwnedBy,
  getDirectoryServer,
  getDirectoryServerById,
  listDirectoryServers,
  setDirectoryServerMessage,
  updateDirectoryTelemetry,
  followDirectoryServer,
  unfollowDirectoryServer,
  isFollowingDirectoryServer,
  getDirectoryFollowerCount,
  incrementDirectoryServerEventsHosted,
  incrementDirectoryServerEventsCompleted,
  removeDirectoryServer,
  getDirectoryRating,
  getDirectoryReview,
  upsertDirectoryReview,
  setDirectoryReviewMessage,
  getDirectoryPlaytime,
  addDirectoryPlaytime,
  getPvpStatsForGamertag,
  getRecentPvpEventsForGamertag,
  countLinkedGuilds,
  createStaffListing,
  getStaffListing,
  setStaffListingMessage,
  listOpenStaffListingsForGuild,
  closeStaffListing,
  submitStaffApplication,
  listStaffApplications,
  upsertGuildServer,
  getGuildServer,
  listGuildServers,
  deleteGuildServer,
  setGuildServerChannel,
  dumpGuildServers,
  restoreGuildServers,
  getPlaytimeTracking,
  upsertPlaytimeTracking,
  getMessageStyle,
  setMessageStyle,
  listMessageStyles,
  upsertKit,
  getKit,
  listKits,
  deleteKit,
  setKitStyle,
  setKitClaimSettings,
  listClaimableKitsForMember,
  setKitTradeValue,
  setRoleTradeValue,
  getRoleTradeValue,
  listRoleTradeValues,
  removeRoleTradeValue,
  createAutokitMapping,
  updateAutokitMapping,
  getAutokitMapping,
  listAutokitMappings,
  deleteAutokitMapping,
  getAutokitCooldownRemainingMs,
  setAutokitCooldown,
  setPlayerHome,
  getPlayerHome,
  setTeleportWaypoint,
  getTeleportWaypoint,
  createJailSentence,
  getJailSentence,
  getActiveJailSentence,
  listActiveJailSentences,
  listAllActiveJailSentences,
  listDueJailSentences,
  releaseJailSentence,
  getGameSettings,
  listGameSettings,
  setGameEnabled,
  setGameRequiredRole,
  getKitClaimRecord,
  recordKitClaim,
  listKitClaimsFor,
  createKitClaimToken,
  getKitClaimToken,
  listHeldTokens,
  transferKitClaimToken,
  redeemKitClaimToken,
  createAutoMessage,
  getAutoMessage,
  listAutoMessages,
  listEnabledAutoMessages,
  deleteAutoMessage,
  setAutoMessageEnabled,
  markAutoMessageSent,
  createAutoEvent,
  getAutoEvent,
  listAutoEvents,
  listEnabledAutoEvents,
  deleteAutoEvent,
  setAutoEventEnabled,
  markAutoEventTriggered,
  getActiveWarForTeam,
  declareWar,
  endWar,
  listWarHistory,
  // Rival System
  normalizeRivalPair,
  getRivalship,
  getRivalshipById,
  createRivalshipRequest,
  acceptRivalshipRequest,
  declineRivalshipRequest,
  endRivalship,
  reactivateRivalship,
  listRivalshipsForPlayer,
  getRivalshipStats,
  recordRivalshipMatch,
  listRivalshipMatches,
  createChallenge,
  getChallenge,
  tryTransitionChallenge,
  listExpiredOpenChallenges,
  createChallengeDuel,
  getChallengeDuel,
  getChallengeDuelByChallengeId,
  listActiveChallengeDuels,
  listExpiredChallengeDuels,
  incrementDuelKills,
  bindChallengeDuelServer,
  deleteChallengeDuel,
  listOpenChallengesAgainst,
  resetAllProgression,
  // Progression System
  getXpCurveConfig,
  setXpCurveConfig,
  getXpSourceAmount,
  getPointsSourceAmount,
  setXpSourceAmount,
  setPointsSourceAmount,
  getPlayerProgression,
  getBestKnownProgression,
  upsertPlayerProgression,
  recordXpEvent,
  getServerBadges,
  getServerBadgesByCondition,
  createServerBadge,
  awardBadge,
  listPlayerBadges,
  hasBadge,
  createSession,
  getSession,
  getActiveSession,
  activateSession,
  endSession,
  listSessionHistory,
  listDueScheduledSessions,
  listDueActiveSessions,
  recordSessionPointEvent,
  addSessionPoints,
  getSessionPoints,
  getSessionLeaderboard,
  getSessionRank,
  getPlayersNearRank,
  // Server Rivalry
  normalizeServerPair,
  getServerRivalry,
  getServerRivalryById,
  getActiveServerRivalryFor,
  createServerRivalryInvitation,
  activateServerRivalry,
  declineServerRivalryInvitation,
  endServerRivalry,
  voidServerRivalry,
  listActiveServerRivalries,
  getServerRivalryStats,
  recordServerRivalryEvent,
  listServerRivalryHistory,
  getTopByLifetimeXp,
  getTopByProgression,
  getTopRivalWins,
  // LFG matchmaking
  getLfgScope,
  setLfgScope,
  listGlobalLfgGuildIds,
  createLfgPost,
  getLfgPost,
  markLfgPostFilled,
  getLfgParticipantCount,
  hasLfgParticipant,
  listLfgParticipants,
  joinLfgPost,
  listExpiredLfgPosts,
  listPendingLfgDeliveries,
  listOpenLfgPostsWithBroadcasts,
  markLfgPostExpired,
  addLfgBroadcast,
  getLfgBroadcastForGuild,
  listLfgBroadcasts,
  // staff accounts
  STAFF_ROLES,
  createStaffUser,
  getStaffUserByUsername,
  getStaffUserById,
  listStaffUsers,
  countStaffUsers,
  deleteStaffUser,
  authenticateStaffUser,
  // player accounts (Discord + email/password, unified under one KOBAid)
  getPlayerAccountByKobaId,
  getPlayerAccountByDiscordId,
  getPlayerAccountByEmail,
  findOrCreatePlayerAccountByDiscord,
  createPlayerAccountWithEmail,
  authenticatePlayerEmail,
  isPlayerOnboardingComplete,
  setPlayerOnboarding,
  getPlayerInterests,
  getPlayerGames,
  getPlayerPlatforms,
  // operator backend
  recordGuildInstall,
  recordGuildLeft,
  hasGuildInstallRecord,
  listInstalls,
  installStats,
  listGuildInstallsByOwner,
  addFrankFaq,
  listFrankFaq,
  getFrankFaq,
  removeFrankFaq,
  addLootboxReward,
  listLootboxRewards,
  getLootboxReward,
  removeLootboxReward,
  getLootboxSettings,
  setLootboxSettings,
  addLootboxPendingClaim,
  getLootboxPendingClaim,
  listUnclaimedLootboxClaims,
  markLootboxClaimOpened,
  markLootboxClaimClaimed,
  getDefuseWireSettings,
  setDefuseWireSettings,
  listGameCurrencyBets,
  setGameCurrencyBet,
  removeGameCurrencyBet,
  getActiveDefuseRun,
  getDefuseRun,
  createDefuseRun,
  advanceDefuseRun,
  closeDefuseRun,
  getGridMinefieldSettings,
  setGridMinefieldSettings,
  getTreasureSlotsSettings,
  setTreasureSlotsSettings,
  getActiveGridMinefieldRun,
  getGridMinefieldRun,
  createGridMinefieldRun,
  revealGridMinefieldCell,
  closeGridMinefieldRun,
  getTowerClimbSettings,
  setTowerClimbSettings,
  getActiveTowerClimbRun,
  getTowerClimbRun,
  createTowerClimbRun,
  advanceTowerClimbRun,
  closeTowerClimbRun,
  getVaultHeistSettings,
  upsertVaultHeistSettings,
  markVaultSpawned,
  getActiveVault,
  createVault,
  setVaultMessageId,
  getVault,
  damageVault,
  getVaultPlayerCooldown,
  recordVaultDamage,
  listVaultDamage,
  closeVault,
  getScrapMerchantSettings,
  upsertScrapMerchantSettings,
  createScrapItem,
  updateScrapItem,
  deleteScrapItem,
  getScrapItem,
  listScrapItems,
  getScrapInventoryTotal,
  addScrapItem,
  listPlayerScrapInventory,
  getPlayerScrapItemQuantity,
  removeScrapItem,
  clearScrapInventory,
  getJackpotSettings,
  upsertJackpotSettings,
  resetJackpotConfig,
  getOrOpenJackpot,
  getJackpot,
  buyJackpotTickets,
  setJackpotStatus,
  listJackpotEntrants,
  closeJackpotAndReopen,
  getBradleyAmbushSettings,
  upsertBradleyAmbushSettings,
  resetBradleyAmbushConfig,
  markBradleyAmbushSpawned,
  getActiveBradleyAmbush,
  createBradleyAmbush,
  getBradleyAmbush,
  setBradleyAmbushMessageId,
  joinBradleyAmbush,
  listBradleyAmbushParticipants,
  startBradleyAmbushCombat,
  getBradleyAmbushCooldown,
  recordBradleyAmbushDamage,
  damageBradleyAmbush,
  setBradleyAmbushArmorCracked,
  listBradleyAmbushDamage,
  closeBradleyAmbush,
  markBradleyAmbushResolved,
  getRecyclerRouletteSettings,
  setRecyclerRouletteSettings,
  resetRecyclerRouletteConfig,
  getActiveRecyclerRun,
  createRecyclerRun,
  getRecyclerRun,
  setRecyclerRunTier,
  closeRecyclerRun,
  getTargetRangeSettings,
  upsertTargetRangeSettings,
  resetTargetRangeConfig,
  getActiveTargetRangeRun,
  createTargetRangeRun,
  getTargetRangeRun,
  updateTargetRangeRun,
  closeTargetRangeRun,
  recordTargetRangeScore,
  getTargetRangeLeaderboard,
  getCargoShipHeistSettings,
  upsertCargoShipHeistSettings,
  resetCargoShipHeistConfig,
  markCargoShipHeistSpawned,
  getActiveCargoShipHeist,
  createCargoShipHeist,
  getCargoShipHeist,
  setCargoShipHeistMessageId,
  joinCargoShipHeist,
  listCargoShipHeistEntrants,
  getCargoShipHeistEntrant,
  startCargoShipHeistCombat,
  setCargoShipHeistRound,
  setCargoShipDefending,
  setCargoShipActed,
  flankCargoShipLeader,
  setCargoShipSmokeBlocked,
  accumulateCargoShipControlDuration,
  closeCargoShipHeist,
  markCargoShipHeistResolved,
  productWideStats,
  recordSale,
  listSales,
  salesSummary,
  createTicket,
  listTickets,
  getTicket,
  listTicketsByDiscordId,
  getTicketByChannelId,
  updateTicket,
  listExpiredArchivedTickets,
  ticketStats,
  getSiteSetting,
  setSiteSetting,
  listSiteSettings,
  // stripe (legacy, unused now that billing runs through Tip4Serv - left
  // intact rather than ripped out in case Stripe is ever re-enabled)
  upsertStripeCustomer,
  getDiscordIdByStripeCustomerId,
  getStripeCustomerIdByDiscordId,
  // tip4serv
  upsertTip4servPackageSeen,
  setTip4servPackageDays,
  getTip4servPackageDays,
  listTip4servPackages,
  // giveaways
  createGiveaway,
  updateGiveaway,
  getGiveaway,
  getGiveawayBySlug,
  listGiveaways,
  listPublishedGiveaways,
  deleteGiveaway,
  createGiveawayEntry,
  listGiveawayEntries,
  countGiveawayEntries,
  drawGiveawayWinner,
  getGiveawayWinnerEntry,
  listGiveawaysNeedingAnnouncement,
  markGiveawayAnnounced,
  // game config reset
  resetLootboxConfig,
  resetDefuseWireConfig,
  resetGridMinefieldConfig,
  resetTowerClimbConfig,
  resetVaultHeistConfig,
  resetScrapMerchantConfig,
  // entity spawning
  addEntitySpawnLocation,
  listEntitySpawnLocations,
  getEntitySpawnLocation,
  removeEntitySpawnLocation,
  addEntityRespawnGroup,
  listEntityRespawnGroups,
  getEntityRespawnGroup,
  removeEntityRespawnGroup,
  setEntityRespawnGroupEnabled,
  listEnabledEntityRespawnGroups,
  markEntityRespawnGroupSpawned,
  // ORP zones
  getOrpZone,
  listAllOrpZones,
  upsertOrpZone,
  setOrpZoneState,
  deleteOrpZone,
};

// ---------------------------------------------------------------------------
// Owner-saved custom templates (/save-template, /my-templates - see
// database/schema.sql's custom_templates header)
// ---------------------------------------------------------------------------

function saveCustomTemplate(ownerDiscordId, name, data) {
  db.prepare(
    `INSERT INTO custom_templates (owner_discord_id, name, data, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_discord_id, name) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`
  ).run(ownerDiscordId, name, JSON.stringify(data), Date.now());
}

function listCustomTemplates(ownerDiscordId) {
  return db.prepare(`SELECT name, created_at FROM custom_templates WHERE owner_discord_id = ? ORDER BY name`).all(ownerDiscordId);
}

function getCustomTemplate(ownerDiscordId, name) {
  const row = db.prepare(`SELECT * FROM custom_templates WHERE owner_discord_id = ? AND name = ?`).get(ownerDiscordId, name);
  if (!row) return null;
  return { ...row, data: JSON.parse(row.data) };
}

function deleteCustomTemplate(ownerDiscordId, name) {
  return db.prepare(`DELETE FROM custom_templates WHERE owner_discord_id = ? AND name = ?`).run(ownerDiscordId, name).changes > 0;
}

// ---------------------------------------------------------------------------
// Full config backup/restore (/server-backup, /server-restore) - scoped to
// CONFIGURATION only (definitions/settings an admin set up), deliberately
// NOT player/economy/history data (wallets, savings, kit claim history,
// active game runs, referral codes/claims, tickets, sales) - a restore
// starts everyone at zero, same as a brand new server would. See each
// command file's own header for the explicit scope decision this matches.
// ---------------------------------------------------------------------------

// Dependency-ordered: shop_currencies MUST come before anything with a
// currencyCols entry (builds the old->new currency id map they remap
// through); shops MUST come before shop_categories/shop_products (their
// parentCols map depends on shops' id map), and shop_categories before
// shop_products for the same reason.
const CONFIG_TABLES = [
  { table: "kit_registry", idCol: null },
  { table: "autokit_mappings", idCol: "id" },
  { table: "message_styles", idCol: null },
  { table: "gift_configs", idCol: null, currencyCols: ["coin_currency_id"] },
  { table: "referral_config", idCol: null },
  { table: "referral_leaderboard_rewards", idCol: null },
  { table: "leaderboard_rewards", idCol: null },
  { table: "staff_positions", idCol: null },
  { table: "shop_currencies", idCol: "id" },
  { table: "shops", idCol: "id", currencyCols: ["currency_id"] },
  { table: "shop_categories", idCol: "id", parentCols: { shop_id: "shops" } },
  { table: "shop_products", idCol: "id", parentCols: { shop_id: "shops", category_id: "shop_categories" } },
  { table: "lootbox_rewards", idCol: "id" },
  { table: "lootbox_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "defuse_wire_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "grid_minefield_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "tower_climb_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "game_currency_bets", idCol: null, currencyCols: ["currency_id"] },
  { table: "vault_heist_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "scrap_merchant_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "scrap_items", idCol: "id" },
  { table: "jackpot_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "bradley_ambush_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "recycler_roulette_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "target_range_settings", idCol: null, currencyCols: ["currency_id"] },
  { table: "cargo_ship_heist_settings", idCol: null, currencyCols: ["currency_id"] },
];

/** guild_config keys that are bot-internal bookkeeping (auto-created channel/message ids, period-boundary tracking) rather than a real admin-set setting - never part of a backup, always regenerated fresh by provisionGuild/repairManagedPanels or the next period tick. */
const CONFIG_BOOKKEEPING_KEY_PATTERN = /(_channel_id$|_message_id$|panel_msg:|period_start)/i;

/**
 * Added 2026-09-10 (per user request: /server-backup should capture "all of
 * it, even map names" - Multi-Server Cluster map links weren't part of a
 * backup at all before this, so restoring one to a fresh server silently
 * dropped every linked map's server name + RCON credentials). id/
 * player_count_channel_id/kill_feed_channel_id are stripped/nulled on the
 * way out - those are per-guild channel ids that won't exist post-wipe
 * (see restoreGuildServers), same "regenerated fresh, not backed up"
 * treatment CONFIG_BOOKKEEPING_KEY_PATTERN gives guild_config's own
 * channel-id settings.
 */
function dumpGuildServers(guildId) {
  return listGuildServers(guildId).map(({ id, player_count_channel_id, kill_feed_channel_id, ...rest }) => rest);
}

/** Reinserts a dumpGuildServers() snapshot - clears the guild's existing linked maps first so a restore never accumulates duplicates/leftover maps the backup didn't have. player_count_channel_id/kill_feed_channel_id are left unset (see dumpGuildServers) - re-link them via /panel-setup or the entity-spawn panel's channel pickers if needed after a restore. */
function restoreGuildServers(guildId, rows) {
  db.prepare(`DELETE FROM guild_servers WHERE guild_id = ?`).run(guildId);
  for (const row of rows || []) {
    try {
      upsertGuildServer(guildId, row.server_name, { rconHost: row.rcon_host, rconPort: row.rcon_port, rconPassword: row.rcon_password });
    } catch (err) {
      console.error(`[KOBA Bot] guild_servers restore: row "${row.server_name}" skipped:`, err.message);
    }
  }
}

function dumpConfigTables(guildId) {
  const out = {};
  for (const t of CONFIG_TABLES) out[t.table] = db.prepare(`SELECT * FROM ${t.table} WHERE guild_id = ?`).all(guildId);
  return out;
}

function clearConfigTables(guildId) {
  for (const t of CONFIG_TABLES) db.prepare(`DELETE FROM ${t.table} WHERE guild_id = ?`).run(guildId);
}

/** Reinserts a dumpConfigTables() snapshot into `guildId`, remapping surrogate ids along the way. Clears the guild's existing config-table rows first, so re-running a restore never accumulates duplicates. Returns { restored, skipped } - skipped rows are logged with the reason (usually a currency/parent row that wasn't in this backup, or an unmet NOT NULL constraint after that remap came back empty). */
function restoreConfigTables(guildId, dump) {
  const idMaps = {};
  const summary = { restored: 0, skipped: 0 };
  clearConfigTables(guildId);

  for (const t of CONFIG_TABLES) {
    const rows = dump[t.table] || [];
    idMaps[t.table] = new Map();

    for (const row of rows) {
      const copy = { ...row, guild_id: guildId };
      const oldId = t.idCol ? copy[t.idCol] : null;
      if (t.idCol) delete copy[t.idCol];

      for (const col of t.currencyCols || []) {
        if (copy[col] == null) continue;
        copy[col] = idMaps.shop_currencies?.get(copy[col]) ?? null;
      }
      for (const [col, parentTable] of Object.entries(t.parentCols || {})) {
        if (copy[col] == null) continue;
        copy[col] = idMaps[parentTable]?.get(copy[col]) ?? null;
      }

      try {
        const cols = Object.keys(copy);
        const info = db.prepare(`INSERT INTO ${t.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => copy[c]));
        if (t.idCol && oldId != null) idMaps[t.table].set(oldId, info.lastInsertRowid);
        summary.restored++;
      } catch (err) {
        console.error(`[KOBA Bot] Config restore: row in "${t.table}" skipped:`, err.message);
        summary.skipped++;
      }
    }
  }

  return summary;
}

/** Every genuine (non-bookkeeping) guild_config key/value for a guild - covers /set-config overrides like bomb_recipes/cooldowns, killfeed_coins_*, playtime_coins_*, lootbox_claim_*, event_join_emoji, etc. */
function dumpGuildConfig(guildId) {
  return db
    .prepare(`SELECT setting, value FROM guild_config WHERE guild_id = ?`)
    .all(guildId)
    .filter((r) => !CONFIG_BOOKKEEPING_KEY_PATTERN.test(r.setting))
    .map((r) => ({ setting: r.setting, value: JSON.parse(r.value) }));
}

function restoreGuildConfig(guildId, entries) {
  for (const { setting, value } of entries || []) setConfig(guildId, setting, value);
}

Object.assign(module.exports, {
  saveCustomTemplate,
  listCustomTemplates,
  getCustomTemplate,
  deleteCustomTemplate,
  dumpConfigTables,
  restoreConfigTables,
  dumpGuildConfig,
  restoreGuildConfig,
});

// NOTE (2026-09-10, product pruning pass): teleport functionality (TP Home,
// directional binds) and Combat Lock (which only ever existed to gate
// teleports) were removed entirely - generic Rust teleportation, no
// retained-feature dependency. The underlying tables (teleport_waypoints,
// teleport_positions, combat_locks, player_homes) are left in schema.sql
// per the "don't destroy production data" rule - just unused going forward.

// ---------------------------------------------------------------------------
// Message feed pools (added 2026-09-07) - matches Veretech's (a competitor
// bot) documented model: up to 25 custom messages per (guild, category),
// one shown at random each occurrence instead of /message-style's single
// fixed message_template - see utils/messageStyle.js's formatStyledMessage
// (checks this pool FIRST, only falling back to message_template/
// CATEGORY_DEFAULTS if the pool is empty for that category - "the default
// auto-disables once you add your first custom message", same as Veretech).
const MESSAGE_FEED_POOL_LIMIT = 25;

db.exec(`
  CREATE TABLE IF NOT EXISTS message_style_pool (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    category     TEXT NOT NULL,
    message_text TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  )
`);
try {
  // Same in-game/Discord split as message_styles (see its PK-rebuild comment
  // above) - no PK issue here since `id` is already the sole primary key,
  // just a plain additive column. Existing pool entries default to 'ingame'
  // (that's what they always were before this column existed).
  db.exec(`ALTER TABLE message_style_pool ADD COLUMN target TEXT NOT NULL DEFAULT 'ingame'`);
} catch {
  // already exists - fine
}

function countMessageStylePoolEntries(guildId, category, target = "ingame") {
  return db.prepare(`SELECT COUNT(*) AS n FROM message_style_pool WHERE guild_id = ? AND category = ? AND target = ?`).get(guildId, category, target).n;
}

/** Returns { ok: true, id } or { ok: false, reason: "limit" } if this (guild, category, target) already has MESSAGE_FEED_POOL_LIMIT entries. */
function addMessageStylePoolEntry(guildId, category, messageText, target = "ingame") {
  if (countMessageStylePoolEntries(guildId, category, target) >= MESSAGE_FEED_POOL_LIMIT) return { ok: false, reason: "limit" };
  const info = db
    .prepare(`INSERT INTO message_style_pool (guild_id, category, target, message_text, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(guildId, category, target, messageText, Date.now());
  return { ok: true, id: info.lastInsertRowid };
}

function listMessageStylePoolEntries(guildId, category, target = "ingame") {
  return db.prepare(`SELECT * FROM message_style_pool WHERE guild_id = ? AND category = ? AND target = ? ORDER BY created_at ASC`).all(guildId, category, target);
}

/** Ownership-safe delete - only removes the row if it actually belongs to this guild, so a customId can't be crafted to delete another guild's entry. */
function removeMessageStylePoolEntry(guildId, id) {
  db.prepare(`DELETE FROM message_style_pool WHERE guild_id = ? AND id = ?`).run(guildId, id);
}

/** One random entry's message_text for this (guild, category, target), or null if the pool is empty (caller falls back to the single message_template/CATEGORY_DEFAULTS). */
function getRandomMessageStylePoolEntry(guildId, category, target = "ingame") {
  const rows = listMessageStylePoolEntries(guildId, category, target);
  if (!rows.length) return null;
  return rows[Math.floor(Math.random() * rows.length)].message_text;
}

Object.assign(module.exports, {
  addMessageStylePoolEntry,
  listMessageStylePoolEntries,
  removeMessageStylePoolEntry,
  getRandomMessageStylePoolEntry,
  countMessageStylePoolEntries,
  MESSAGE_FEED_POOL_LIMIT,
});

/** Install approval gate - see schema.sql's approved_guilds header. */
function isGuildApproved(guildId) {
  return !!db.prepare(`SELECT 1 FROM approved_guilds WHERE guild_id = ?`).get(guildId);
}

function approveGuild(guildId, approvedBy, note = null) {
  db.prepare(`INSERT INTO approved_guilds (guild_id, approved_by, note, approved_at) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET approved_by = excluded.approved_by, note = excluded.note, approved_at = excluded.approved_at`).run(
    guildId,
    approvedBy,
    note,
    Date.now()
  );
}

function revokeGuildApproval(guildId) {
  db.prepare(`DELETE FROM approved_guilds WHERE guild_id = ?`).run(guildId);
}

function listApprovedGuilds() {
  return db.prepare(`SELECT * FROM approved_guilds ORDER BY approved_at DESC`).all();
}

Object.assign(module.exports, {
  isGuildApproved,
  approveGuild,
  revokeGuildApproval,
  listApprovedGuilds,
});

Object.assign(module.exports, {
  bumpRivalry,
  clearRivalry,
  getEloRating,
  setEloRating,
  getBestKnownEloRating,
  getBestKnownPvpStreak,
  getEloLeaderboard,
  getKobaScore,
  applyKobaScoreResult,
  getKobaScoreLeaderboard,
  getPlayerPlan,
  setPlayerPlan,
  getSubscriptionTenureMonths,
  getDailyUsage,
  incrementDailyUsage,
  countActiveCreatedChallenges,
  ELO_DEFAULT_RATING,
  createBounty,
  getOpenBountiesOnTarget,
  listOpenBounties,
  getBounty,
  claimBounty,
  cancelBounty,
  listExpiredOpenBounties,
  expireBounty,
});

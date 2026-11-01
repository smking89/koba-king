-- KOBA Bot schema (SQLite via better-sqlite3)
-- Note: premium_users is keyed by DISCORD USER ID, never guild ID.
-- Pricing is per-server, but the license itself is bound to the subscriber's
-- account rather than a fixed guild - active_guild_id is which single
-- server that license currently authorizes. /transfer moves it to a
-- different server the same owner controls, with no new payment required;
-- running KOBA Bot on a second server at the same time needs its own
-- separate subscription.

-- Discord has no public API for a web server to look up an arbitrary user by
-- username - only the bot, sharing a server with that user, can resolve one.
-- The bot records every username it observes here (any interaction, plus
-- guild owners on join) so the admin dashboard can target people by the
-- Discord username it actually shows, not a raw numeric ID.
CREATE TABLE IF NOT EXISTS known_users (
  discord_id   TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Rust Console Edition's "was killed by" kill log sometimes shows a raw
-- numeric platform/account ID instead of the player's gamertag (a known RCE
-- quirk - looks like it happens before the server has cached that player's
-- display name yet). The "has entered the game" join log line DOES carry
-- both {gamertag} and its bracketed platform ID together though, so every
-- join event backfills this table, and utils/combatEvents.js (originally
-- utils/killFeed.js, revived/rebuilt 2026-09-13 as the Combat Event
-- Pipeline) looks a raw numeric killer/victim up here before recording
-- anything - falls back to storing the bare ID if it's never been seen
-- (never guessed - see combatEvents.js's identity resolution rules).
CREATE TABLE IF NOT EXISTS player_platform_ids (
  guild_id     TEXT NOT NULL,
  platform_id  TEXT NOT NULL,
  gamertag     TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, platform_id)
);

CREATE TABLE IF NOT EXISTS premium_users (
  discord_id      TEXT PRIMARY KEY,
  expires_at      INTEGER NOT NULL,     -- unix ms timestamp
  activated_by    TEXT,                 -- admin who ran /activate-user, or "stripe"
  active_guild_id TEXT,                 -- the one guild this license currently authorizes; NULL until claimed
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_config (
  guild_id     TEXT NOT NULL,
  setting      TEXT NOT NULL,
  value        TEXT NOT NULL,        -- JSON-encoded value
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, setting)
);

CREATE TABLE IF NOT EXISTS guild_meta (
  guild_id       TEXT PRIMARY KEY,
  panel_message_id TEXT,
  panel_channel_id  TEXT,
  logs_channel_id   TEXT,
  team_mgmt_channel_id TEXT,
  support_channel_id TEXT,
  ticket_panel_message_id TEXT,
  player_count_channel_id TEXT,
  stats_servers_channel_id TEXT,
  stats_owners_channel_id TEXT,
  stats_players_channel_id TEXT,
  welcome_channel_id TEXT,
  leaderboard_channel_id TEXT,
  referral_leaderboard_message_id TEXT,
  lfg_feed_channel_id TEXT,
  link_gamertag_channel_id TEXT,
  referral_claim_channel_id TEXT,
  create_lfg_channel_id TEXT,
  kill_feed_channel_id TEXT,
  lfg_scope         TEXT,       -- 'guild' | 'global'; NULL is treated as 'guild' (the safe default)
  rcon_host         TEXT,       -- this guild's own Rust server WebRCON connection, set via /link-server
  rcon_port         INTEGER,
  rcon_password     TEXT,
  autokit_enabled   INTEGER NOT NULL DEFAULT 0, -- off until an admin has configured + verified mappings via /autokit-config
  provisioned_at    INTEGER,
  template_key      TEXT -- last /setup-template choice ('standard'|'cluster'|'minimal') - lets utils/provisioning.js's always-on base entities (category/roles/panel/games/etc. channels) match whichever emoji convention the admin picked, instead of always hardcoding emoji regardless of template
  ,kit_roles_enabled INTEGER DEFAULT 0
  -- Prison/Jail (Category 6, Phase 2) - single admin-configured jail
  -- coordinate per guild, set via /jail set-location (either captured live
  -- from the admin's own in-game position via server.printpos, or typed in
  -- manually). NULL until an admin has configured it at least once.
  ,jail_x REAL
  ,jail_y REAL
  ,jail_z REAL
  ,jail_set_at INTEGER
  -- The base provisioned "Operations" category's channel ID (set the first
  -- time provisionGuild() runs) - lets ensureCategory() resolve/rename by
  -- ID instead of by-name-only, so a future category-name change (template
  -- rebrand, emoji toggle) renames the existing category in place instead
  -- of silently creating an orphaned duplicate. See utils/provisioning.js's
  -- CATEGORY_NAME header comment for the real incident this fixes.
  ,operations_category_id TEXT
  -- Bot Health monitoring (utils/botHealthAlerts.js). The first 3 columns
  -- are unused since the 2026-10-15 consolidation into dev_logs_channel_id
  -- (kept rather than dropped - see database/db.js's migration comment).
  ,bot_status_logs_channel_id TEXT
  ,rcon_health_channel_id TEXT
  ,error_alerts_channel_id TEXT
  ,dev_logs_channel_id TEXT
  -- ORP ("ZORP"-style Offline Raid Protection) per-guild admin-configured
  -- defaults, set via /orp configure (hasAdminClearance-gated, same bar as
  -- /jail set-location). Applied to every team's ORP zone in this guild -
  -- NOT per-team customization. NULL columns fall back to the hardcoded
  -- defaults in utils/orpZones.js (green online / red protected / standard
  -- enter+leave text / Sphere shape) until an admin configures them.
  ,orp_shape TEXT
  ,orp_online_color TEXT
  ,orp_protected_color TEXT
  ,orp_enter_message TEXT
  ,orp_leave_message TEXT
);

-- LFG Matchmaking. A post always shows in its own guild's feed; if that
-- guild's lfg_scope is 'global', the same post also gets mirrored into
-- every OTHER guild that has also opted into 'global' - a guild set to
-- 'guild' (the default) never sends out or receives cross-server posts.
CREATE TABLE IF NOT EXISTS lfg_posts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT NOT NULL,     -- origin guild
  user_id        TEXT NOT NULL,
  description    TEXT NOT NULL,
  players_needed INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open', -- open | filled | expired
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL  -- auto-expires 1h after creation regardless of status
);

-- One row per guild a post was posted into (including its own origin guild) -
-- lets "Mark Filled"/expiry find and edit every mirrored copy across
-- servers, and thread_id is that guild's own temporary "Join Group" chat
-- (threads can't span guilds, so every broadcast gets its own).
CREATE TABLE IF NOT EXISTS lfg_broadcasts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lfg_post_id  INTEGER NOT NULL,
  guild_id     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  thread_id    TEXT
);

-- Real participant tracking (added for the Unified Platform/website-Discord
-- LFG sync pass) - previously "joining" only ever added someone to the
-- Discord thread with no actual count kept anywhere, so the website had no
-- way to show/enforce "3/4 - need 1" the way Discord's own embed claimed
-- to. The PRIMARY KEY itself is the duplicate-join guard (spec: "duplicate
-- participation is impossible") - both the website's join route and
-- Discord's handleJoinButton call the exact same db.joinLfgPost, so there
-- is exactly one join path regardless of which surface it's clicked from.
CREATE TABLE IF NOT EXISTS lfg_participants (
  post_id     INTEGER NOT NULL,
  discord_id  TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (post_id, discord_id)
);

CREATE TABLE IF NOT EXISTS teams (
  team_name       TEXT NOT NULL,
  guild_id        TEXT NOT NULL,
  max_team_size   INTEGER NOT NULL DEFAULT 72,
  tc_entity_id    TEXT,
  sulfur_cores    INTEGER NOT NULL DEFAULT 0,
  emp_capacitors  INTEGER NOT NULL DEFAULT 0,
  uranium_rods    INTEGER NOT NULL DEFAULT 0,
  blueprints      INTEGER NOT NULL DEFAULT 0,
  weapon_chemical      INTEGER NOT NULL DEFAULT 0,
  weapon_emp           INTEGER NOT NULL DEFAULT 0,
  weapon_radiation     INTEGER NOT NULL DEFAULT 0,
  weapon_spawn_denial  INTEGER NOT NULL DEFAULT 0,
  weapon_black_hole    INTEGER NOT NULL DEFAULT 0,
  cooldown_chemical      INTEGER NOT NULL DEFAULT 0, -- unix ms when cooldown clears, 0 = ready
  cooldown_emp           INTEGER NOT NULL DEFAULT 0,
  cooldown_radiation     INTEGER NOT NULL DEFAULT 0,
  cooldown_spawn_denial  INTEGER NOT NULL DEFAULT 0,
  cooldown_black_hole    INTEGER NOT NULL DEFAULT 0,
  base_grid       TEXT,               -- e.g. "G11" - team's home base grid for radiation/black-hole targeting
  clan_tag        TEXT,               -- short prefix, e.g. "KOBA" - display-only, not enforced on nicknames
  clan_rules      TEXT,
  embed_color     TEXT,               -- hex ("#1AFB9D"), set via /clan-config color - tints this team's PvP kill-feed Discord embed when they're the killer; falls back to the default kill-feed red when unset

  created_at      INTEGER NOT NULL,
  PRIMARY KEY (guild_id, team_name)
);

-- Per-team overrides of the default rank registry (config/ranks.js) - a
-- team can rename a rank tier and/or give it a custom badge image without
-- affecting any other team in the same (or any other) guild. Absence of a
-- row for a given rank_id means "use the built-in default" - deleting a
-- team's rows here is exactly what /clan-config reset does.
CREATE TABLE IF NOT EXISTS rank_overrides (
  guild_id   TEXT NOT NULL,
  team_name  TEXT NOT NULL,
  rank_id    TEXT NOT NULL,
  custom_name TEXT,
  badge_url  TEXT,
  PRIMARY KEY (guild_id, team_name, rank_id)
);

CREATE TABLE IF NOT EXISTS crafting_queue (
  guild_id     TEXT NOT NULL,
  team_name    TEXT NOT NULL,
  bomb_type    TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  finishes_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, team_name) -- one active queue slot per team (Feature 5 constraint)
);

CREATE TABLE IF NOT EXISTS members (
  discord_id    TEXT NOT NULL,
  guild_id      TEXT NOT NULL,
  team_name     TEXT NOT NULL,
  rank_id       TEXT NOT NULL DEFAULT 'E1',
  fireteam_id   TEXT,
  fireteam_role TEXT,               -- Leader / Quartermaster / Engineer / Vanguard
  gamertag      TEXT,               -- Xbox/PSN ID, set via /sync-base or manual link
  is_guest      INTEGER NOT NULL DEFAULT 0, -- flagged true if found on synced TC but not registered
  joined_at     INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);

-- BOOMid - a global identity spanning every guild, deliberately separate
-- from any single Discord account so a platform ban survives someone
-- making a brand new Discord account (a fresh Snowflake costs nothing) but
-- can't survive them still using the same Xbox Gamertag/PSN Online ID,
-- which is what actually stops ban evasion. Only ever created going
-- forward from a NEW /link attempt (see utils/linkPanel.js's
-- upsertBoomIdentityLink) - existing gamertags linked before this shipped
-- are untouched until whoever holds them re-links, per explicit decision
-- not to migrate/backfill retroactively. One platform per identity, same
-- as the existing per-guild `members.gamertag` convention - linking a
-- second platform under the same Discord account just updates this same
-- row rather than creating a second one.
-- account_type/username/tags (added 2026-09-06, /link overhaul): a public
-- profile riding on the same identity - account_type is a plain cosmetic
-- label ('player' | 'business'), username is a display name distinct from
-- both the Discord username and the Gamertag/PSN itself, tags is a
-- JSON-encoded array of >=4 playstyle hashtags (same "at least 4 hashtags"
-- convention as directory_servers.tags, just a player-facing version of it
-- instead of a server-facing one). All three are collected on the website's
-- /link form alongside platform+gamertag (see admin/linkVerify.js) and only
-- required the first time an identity is created - re-linking (a platform
-- switch, or the existing.js /link "I already have a KOBA Bot ID" shortcut)
-- leaves them untouched. boom_id itself IS the "KOBA Bot ID" players are
-- told to save - the shortcut path (utils/linkPanel.js's
-- completeExistingLinkShortcut) looks a player up by this same column.
CREATE TABLE IF NOT EXISTS boom_identities (
  boom_id       TEXT PRIMARY KEY,        -- "boom_" + a random UUID
  discord_id    TEXT UNIQUE,
  platform      TEXT,                    -- 'xbox' | 'playstation' | 'steam'
  platform_id   TEXT UNIQUE,             -- the Gamertag/Online ID/Steam ID itself
  account_type  TEXT,                    -- 'player' | 'business' - cosmetic label only
  username      TEXT,                    -- public display name, separate from Discord username and platform_id
  tags          TEXT,                    -- JSON array of >=4 playstyle hashtags, e.g. ["Builder","Raider","Solo"]
  is_banned     INTEGER NOT NULL DEFAULT 0,
  ban_reason    TEXT,
  banned_by     TEXT,                    -- discord_id of whoever issued the platform-wide ban
  banned_at     INTEGER,
  created_at    INTEGER NOT NULL,
  kick_url      TEXT, -- optional social links, website registration wizard only - all nullable, none required
  twitch_url    TEXT,
  tiktok_url    TEXT,
  instagram_url TEXT
);

-- Per-server bans - a server owner/admin banning someone only from their
-- own guild, entirely independent of a platform-wide BOOMid ban above (see
-- commands/guild-ban.js vs commands/global-ban.js).
CREATE TABLE IF NOT EXISTS guild_bans (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  reason      TEXT,
  banned_by   TEXT NOT NULL,
  banned_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);

-- Best-effort IP logging tied to a BOOMid, from the website's own login
-- flow only - KOBA Bot has no visibility into player IPs on the actual Rust
-- Console Edition dedicated servers over RCON, and Discord never exposes a
-- user's IP to a bot either, so this is the one touchpoint that can
-- actually see one. Used to flag a brand-new identity logging in from an
-- IP that's already associated with an existing BANNED one (see
-- admin/dashboard.js's OAuth callback).
CREATE TABLE IF NOT EXISTS boom_identity_access_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  boom_id     TEXT NOT NULL,
  ip_address  TEXT,
  occurred_at INTEGER NOT NULL
);

-- Raised whenever a website login's IP matches one previously logged
-- against a currently-banned BOOMid - surfaced to staff at /admin/boom-flags
-- (admin/server.js) for manual review rather than any automatic action,
-- since an IP match alone (shared household/NAT/VPN) isn't proof of ban
-- evasion by itself.
CREATE TABLE IF NOT EXISTS boom_ip_flags (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  boom_id        TEXT NOT NULL,   -- the (not-yet-banned) identity that logged in
  matched_boom_id TEXT NOT NULL,  -- the already-banned identity sharing that IP
  ip_address     TEXT NOT NULL,
  flagged_at     INTEGER NOT NULL
);

-- /team-invite and the Team Panel's own "Invite" button both create one of
-- these instead of adding the target straight to the roster - the invitee
-- gets DMed an Accept/Decline pair (see utils/teamPanel.js's sendTeamInvite)
-- and only db.addMember() runs once they actually accept. Old rows are kept
-- (not deleted) for history, same pattern as every other status-tracked
-- table here - a fresh invite is just a new row, not an update to the last one.
CREATE TABLE IF NOT EXISTS team_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  team_name   TEXT NOT NULL,
  inviter_id  TEXT NOT NULL,
  invitee_id  TEXT NOT NULL,
  rank_id     TEXT NOT NULL DEFAULT 'E1',
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined | expired
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  delivered_at INTEGER -- set once the invitee's Accept/Decline DM actually sends (see db.js's listPendingTeamInviteDeliveries) - null means the bot's background tick still needs to deliver it, whether it was created via Discord (a failed inline DM) or the website (no live Discord client there at all)
);

CREATE TABLE IF NOT EXISTS fireteams (
  guild_id     TEXT NOT NULL,
  fireteam_id  TEXT NOT NULL,
  team_name    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, fireteam_id)
);

-- Tool Cupboard sync (tc_sync_log / tc_synced_builders) was removed as a
-- feature - replaced by the KOBA Bot RCON Bomb & Warhead System instead.
-- Old databases may still have these tables sitting around unused; that's
-- harmless, so no migration bothers dropping them.

-- Staff accounts for the admin dashboard - replaces the single shared
-- ADMIN_PASSWORD with individual logins and role-based access. A superadmin
-- account is auto-seeded from ADMIN_PASSWORD on first boot if this table is
-- empty, so deploying never locks you out before you've created any real
-- accounts through /admin/staff.
CREATE TABLE IF NOT EXISTS staff_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- "salt:hash" (scrypt, no extra dependency)
  role          TEXT NOT NULL,   -- 'superadmin' | 'admin' | 'moderator'
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- ---------------------------------------------------------------------------
-- Player accounts (2026-10-15) - the player-facing web dashboard's real
-- identity, one account that can be reached via Discord OAuth, email/
-- password, or (once linked) both. "kobaid" is the one stable ID every
-- other player-facing table should key off going forward - discord_id
-- alone can't be the identity anymore now that email/password accounts
-- exist with no Discord account at all. See admin/playerAuth.js,
-- admin/emailAuth.js, admin/discordAuth.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_accounts (
  kobaid                   TEXT PRIMARY KEY,  -- e.g. "KOBA-7F9X2Q" - generated at registration, never reused
  discord_id               TEXT UNIQUE,       -- NULL until this account has logged in with (or linked) Discord
  email                    TEXT UNIQUE,       -- NULL until this account has registered with email/password
  password_hash            TEXT,              -- "salt:hash" (scrypt) - NULL for a Discord-only account
  username                 TEXT NOT NULL,     -- display name - Discord username, or chosen at email registration
  onboarding_completed_at  INTEGER,           -- NULL until interests/games/platforms are all set - required before the dashboard is usable, regardless of login method
  created_at               INTEGER NOT NULL,
  last_login_at            INTEGER
);
-- SQLite's own UNIQUE constraint on `email` is case-sensitive; this index
-- enforces case-insensitive uniqueness too (same reasoning as known_users'
-- username lookups elsewhere in this file) without touching the stored
-- casing. Partial (WHERE email IS NOT NULL) so NULL emails (Discord-only
-- accounts) never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_accounts_email_nocase ON player_accounts (email COLLATE NOCASE) WHERE email IS NOT NULL;

-- Required onboarding selections (Section: registration spec - "at least 4
-- interests, at least 1 game, at least 1 platform"). Separate tables rather
-- than a JSON blob column so a specific interest/game/platform can be
-- queried/counted directly later (e.g. "how many players are into PvP").
CREATE TABLE IF NOT EXISTS player_interests (
  kobaid   TEXT NOT NULL REFERENCES player_accounts(kobaid),
  interest TEXT NOT NULL,
  PRIMARY KEY (kobaid, interest)
);
CREATE TABLE IF NOT EXISTS player_account_games (
  kobaid TEXT NOT NULL REFERENCES player_accounts(kobaid),
  game   TEXT NOT NULL,
  PRIMARY KEY (kobaid, game)
);
CREATE TABLE IF NOT EXISTS player_account_platforms (
  kobaid   TEXT NOT NULL REFERENCES player_accounts(kobaid),
  platform TEXT NOT NULL,  -- 'console' | 'pc' | 'mobile' | 'web' - matches the homepage's platform ticker
  PRIMARY KEY (kobaid, platform)
);

-- ---------------------------------------------------------------------------
-- Operator backend (admin dashboard): installs, sales, support tickets.
-- None of this is Discord-gameplay data - it's what the person running
-- KOBA Bot needs to actually operate it as a paid product.
-- ---------------------------------------------------------------------------

-- One row per server KOBA Bot has ever joined, whether or not the owner was
-- premium at the time - this is the only reliable install/reach count,
-- since guild_meta only exists for servers that passed the premium gate.
CREATE TABLE IF NOT EXISTS guild_installs (
  guild_id          TEXT PRIMARY KEY,
  guild_name        TEXT,
  owner_id          TEXT NOT NULL,
  member_count      INTEGER,
  first_joined_at   INTEGER NOT NULL,
  last_joined_at    INTEGER NOT NULL,
  left_at           INTEGER,          -- NULL while still installed
  premium_at_join   INTEGER NOT NULL DEFAULT 0
);

-- Manual sales ledger. KOBA Bot has no payment processor wired in yet, so
-- every subscription is recorded here by whoever runs /activate-user (or
-- logs it from the admin dashboard) - this is the source of truth for
-- "how much has this made", not a Stripe/PayPal webhook.
CREATE TABLE IF NOT EXISTS sales (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  plan          TEXT,                -- e.g. "30-day", "annual"
  note          TEXT,
  recorded_by   TEXT NOT NULL,       -- admin discord id who logged the sale
  created_at    INTEGER NOT NULL
);

-- A ticket IS a real Discord channel - this row is just a pointer to it
-- (guild_id + channel_id) plus status metadata. The conversation itself
-- lives in Discord as normal messages, fetched live via the bot token from
-- both the Discord channel and the admin web dashboard, so there's exactly
-- one source of truth instead of two copies that can drift apart.
CREATE TABLE IF NOT EXISTS support_tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT,
  channel_id   TEXT,
  discord_id   TEXT NOT NULL,
  subject      TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open', -- open / pending / closed
  admin_note   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  closed_at    INTEGER,
  platform     TEXT, -- 'console' | 'pc' - which platform the ticket is about, nullable (older tickets predate this field)
  game         TEXT  -- 'rust' | 'ark' | 'dayz' | 'minecraft' - which game the ticket is about, same nullable convention
);

-- Marketing/site content the admin dashboard can edit (pricing display,
-- feature bullets, etc). NOTE: the published landing page is a static
-- Artifact page today, so editing these values here does not automatically
-- change what's live on that page - see admin/README section on this.
CREATE TABLE IF NOT EXISTS site_settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Maps a subscriber's Discord ID to their Stripe customer/subscription, so
-- renewal and cancellation webhooks (which only carry Stripe IDs, not
-- Discord IDs) can find who to update.
CREATE TABLE IF NOT EXISTS stripe_customers (
  discord_id             TEXT PRIMARY KEY,
  stripe_customer_id     TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT,
  updated_at             INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Feature: Tip4Serv billing (replaces Stripe). Tip4Serv is a one-time
-- purchase / donation-shop platform, not a recurring-billing API, so the
-- model here is "buy N days of access", not a subscription with a customer
-- portal. Every basket item (package) a webhook has ever reported gets
-- auto-registered here with days=0 so the superadmin can see it exists and
-- assign a duration to it from /admin/tip4serv - no manual JSON editing.
-- ---------------------------------------------------------------------------
-- grant_type (added for KABOOM Pro - see database/db.js's migration block)
-- distinguishes which subscription a package's webhook purchase extends:
-- 'server_license' (the existing default - extends premium_users, a
-- guild's KOBA Bot Pro/Max access) or 'kaboom_pro' (extends
-- kaboom_pro_subscriptions, a personal per-account cosmetic unlock,
-- entirely separate from any guild).
CREATE TABLE IF NOT EXISTS tip4serv_packages (
  item_id    TEXT PRIMARY KEY,
  item_name  TEXT,
  days       INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Feature: Giveaways. Admin-authored, published to the public site, with
-- real entries persisted server-side (the OLD static prototype only ever
-- faked this in localStorage).
-- ---------------------------------------------------------------------------

-- Giveaways are a standalone white-label promo product hosted alongside
-- KOBA Bot, not a KOBA Bot feature - each one carries its own brand identity
-- (name, logo, colors, footer) rather than inheriting KOBA Bot's, so an
-- admin can run a giveaway for any brand/sponsor without it looking like
-- an official KOBA Bot page.
CREATE TABLE IF NOT EXISTS giveaways (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT UNIQUE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft', -- draft / published / ended
  title          TEXT NOT NULL,
  kicker         TEXT NOT NULL DEFAULT 'Live Giveaway',
  subheadline    TEXT NOT NULL DEFAULT '',
  prize_title    TEXT NOT NULL DEFAULT '',
  prize_value    TEXT NOT NULL DEFAULT '',
  prize_items    TEXT NOT NULL DEFAULT '[]',   -- JSON string array
  tasks          TEXT NOT NULL DEFAULT '[]',   -- JSON array of {title, subtitle, points, url}
  end_timestamp  INTEGER NOT NULL,
  -- Branding (independent of KOBA Bot's own site identity)
  brand_name     TEXT NOT NULL DEFAULT 'Giveaways',
  logo_url       TEXT NOT NULL DEFAULT '',      -- external image URL; blank = show brand_name as text
  color_bg       TEXT NOT NULL DEFAULT '#07070d',
  color_cyan     TEXT NOT NULL DEFAULT '#00f0ff',
  color_magenta  TEXT NOT NULL DEFAULT '#ff2ec4',
  color_lime     TEXT NOT NULL DEFAULT '#c6ff3d',
  fomo_text      TEXT NOT NULL DEFAULT 'Entries close the instant the timer hits zero — no extensions, no exceptions.',
  footer_text    TEXT NOT NULL DEFAULT '© {year} {brand}. All rights reserved.',
  youtube_url    TEXT NOT NULL DEFAULT '',      -- optional demo/trailer video, embedded if set
  media_urls     TEXT NOT NULL DEFAULT '[]',    -- JSON string array, up to 3 external image/gif URLs
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id    INTEGER NOT NULL,
  gamertag       TEXT NOT NULL,
  email          TEXT NOT NULL,
  completed_tasks TEXT NOT NULL DEFAULT '[]',  -- JSON array of task indexes claimed
  total_entries  INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Zone Events & Component Economy. An admin-defined temporary "last player/
-- clan standing wins" event over a map area, resolved by polling live RCON
-- player positions - not a real in-game visual zone marker (Rust Console
-- Edition's vanilla WebRCON has no documented way to draw a colored map
-- overlay without a third-party plugin we can't assume is installed).
-- color_hex is stored and used for the Discord announcement embed's accent
-- color only; it's not rendered in-game.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zone_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  zone_name       TEXT NOT NULL,
  center_x        REAL NOT NULL,
  center_z        REAL NOT NULL,
  radius          REAL NOT NULL,
  color_hex       TEXT,
  reward_material TEXT NOT NULL,
  reward_qty      INTEGER NOT NULL DEFAULT 1,
  ingame_message  TEXT,
  discord_message TEXT,
  status          TEXT NOT NULL DEFAULT 'active', -- active | completed | cancelled
  winner_team     TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  ends_at         INTEGER NOT NULL,
  joined_user_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of Discord user ids who clicked "Join" on the announcement
  -- Added 2026-09-10 (bug fix pass) - /create-event-wizard has supported a
  -- Box shape (with its own X/Y/Z size + rotation) since it was built, but
  -- this table only ever stored center_x/center_z/radius, so a Box event's
  -- resolution silently fell back to a circle win-check regardless of what
  -- shape actually got created in-game. shape defaults to 'Sphere' so every
  -- row created before this column existed keeps resolving exactly as
  -- before. box_x/box_y/box_z/rotation are NULL for a Sphere event.
  shape           TEXT NOT NULL DEFAULT 'Sphere', -- 'Sphere' | 'Box'
  box_x           REAL,
  box_y           REAL,
  box_z           REAL,
  rotation        REAL NOT NULL DEFAULT 0,
  -- Which linked Multi-Server Cluster map (database/guild_servers) this event
  -- was created on and should resolve against - NULL = the guild's single
  -- default RCON connection, same meaning as lootbox_pending_claims.server_name
  -- above. Previously events always resolved against the default connection
  -- regardless of which map they were actually deployed to.
  server_name     TEXT
);

-- ---------------------------------------------------------------------------
-- Referral Reward Engine. Any member generates a short-lived personal code;
-- whoever redeems it gets the guild's configured "welcome gift" (kit and/or
-- role, optionally temporary), and the referrer's claim count feeds the
-- leaderboard, which pays out 1st/2nd/3rd place per period.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_config (
  guild_id             TEXT PRIMARY KEY,
  welcome_kit          TEXT,
  welcome_role_id      TEXT,
  welcome_role_temp_hours INTEGER  -- NULL = permanent role
);

CREATE TABLE IF NOT EXISTS referral_codes (
  code       TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  created_by TEXT NOT NULL,        -- the referrer
  max_uses   INTEGER NOT NULL DEFAULT 1,
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  referrer_id TEXT NOT NULL,       -- denormalized from referral_codes.created_by for fast leaderboard queries
  claimed_by  TEXT NOT NULL,
  claimed_at  INTEGER NOT NULL
);

-- One row per (guild, period, place) - period is 'daily'|'weekly'|'monthly'|'yearly'.
CREATE TABLE IF NOT EXISTS referral_leaderboard_rewards (
  guild_id       TEXT NOT NULL,
  period         TEXT NOT NULL,
  place          INTEGER NOT NULL,
  reward_type    TEXT NOT NULL,    -- 'kit' | 'role'
  kit_name       TEXT,
  role_id        TEXT,
  role_temp_hours INTEGER,
  PRIMARY KEY (guild_id, period, place)
);

-- Generic temporary-role tracking, reused by both the welcome gift and
-- leaderboard rewards - a single background tick removes any role whose
-- time is up, regardless of which feature granted it.
CREATE TABLE IF NOT EXISTS temp_role_grants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role_id    TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- /link no longer takes a gamertag directly in Discord - it DMs a one-time
-- link to kobabot.store/link?token=... instead (see utils/linkPanel.js's
-- sendLinkVerificationDm), where the player actually enters their platform
-- + Gamertag after confirming their Discord OAuth session matches this
-- token's discord_id. Closes the "guessing/impersonating someone else's
-- gamertag via a public Discord modal" gap the original in-Discord flow had.
CREATE TABLE IF NOT EXISTS link_tokens (
  token      TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

-- The website (admin/dashboard.js's POST /link) can't assign a Discord role
-- itself - no live Discord client in that process (see admin/server.js's
-- header comment on shared-DB-only cross-process architecture) - so a
-- completed web link just queues one of these, and the bot's own
-- runPendingRoleGrantsTick (utils/linkPanel.js) applies it moments later.
CREATE TABLE IF NOT EXISTS pending_role_grants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  platform   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Same architecture as pending_role_grants above, for a different gap: a
-- promote/demote/fireteam-assign made via the website (admin/dashboard.js's
-- /api/team routes) can update this member's rank/fireteam DB columns
-- instantly, but only the bot process (a live Discord client) can push the
-- matching Discord role change - see utils/teamPanel.js's runPendingRankSyncTick.
CREATE TABLE IF NOT EXISTS pending_rank_syncs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Real, queryable activity log - the website's ServerDashboard "console"
-- (a live feed of KOBA Bot actions staff/players take, NOT an RCON
-- terminal - see utils/adminFeed.js's logAdminAction, which now dual-
-- writes here as well as to the guild's admin-feed Discord channel, so
-- every existing call site starts populating this with zero changes).
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_log_guild ON activity_log(guild_id, created_at DESC);

-- In-game RCON admin authorization (/add-role, /remove-role) - RCE's
-- ownerid/moderatorid commands key on the player's platform ID rather than
-- their gamertag, and that ID is only ever visible while they're online
-- (from global.playerlist), so it's captured once at grant time here and
-- reused by /remove-role without needing the player to be online again.
CREATE TABLE IF NOT EXISTS rcon_role_grants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  gamertag     TEXT NOT NULL,
  platform_id  TEXT NOT NULL,
  role         TEXT NOT NULL,     -- 'moderator' | 'owner'
  granted_by   TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  UNIQUE(guild_id, discord_id, role)
);

-- AutoKit Quickchat: a player uses the in-game quick-chat wheel (e.g. "I
-- need Wood"), the bot detects the matching d11_quick_chat_* event in the
-- RCON console feed and auto-delivers the next kit in that id's rotation
-- (round-robin, to spread cooldowns across many near-duplicate kit
-- definitions - a real pattern from KaosBot's reference mapping). Mappings
-- are entirely admin-configured via /autokit-config, never hardcoded, since
-- exact kit names are unique to each server's own kit list. 'combo' mode is
-- for quickchats that only fire a delivery when preceded by "Out of Ammo"
-- within a short window (the "23-44" tier in the reference mapping).
CREATE TABLE IF NOT EXISTS autokit_mappings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  quickchat_id TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'direct', -- 'direct' | 'combo'
  kit_name     TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- FIXED (2026-09-06): kit_name alone (the internal Rust kit name) is
  -- ambiguous the moment two DIFFERENT registered kits (kit_registry rows,
  -- unique by display_name) happen to share the same internal name - the
  -- admin picks a specific registered kit from a dropdown when binding, but
  -- only kit_name got stored, so delivery later had to guess which
  -- registered row's custom message/color to use (utils/autoKit.js's old
  -- getKitByInternalName lookup), and could silently pick the WRONG one -
  -- confirmed live: a bind to "Freekit" delivered correctly but announced
  -- another kit's ("AK") custom message instead. NULL on pre-existing rows
  -- (falls back to the old ambiguous lookup) - only newly-created binds
  -- resolve unambiguously via this.
  display_name TEXT
);

-- Dynamic Adaptive Kit Engine (added 2026-09-19, per the user's own detailed
-- blueprint spec) - repurposes autokit_mappings' quickchat_id column to hold
-- a literal typed chat trigger string (e.g. "/claim freekit") instead of a
-- d11_quick_chat_* wheel identifier: the blueprint's own confirmed log
-- example (`[Chat] "PlayerName": /claim kit_name`) describes a typed chat
-- command, not the radial quick-chat wheel this table was originally built
-- for, and unlike the wheel-identifier list (never actually saved to a
-- config file, and not safe to reconstruct from memory - would be
-- fabricating RCE-specific data), a free-text trigger requires no fixed
-- lookup table at all. See utils/autoKitEngine.js's header for why the
-- actual chat-line REGEX watching for this is flagged UNCONFIRMED, same
-- as every other new WebRCON pattern in this codebase until a real capture
-- validates it. The new columns themselves (color_hex, delivery_delay_seconds,
-- cooldown_minutes, claim_message_enabled, cooldown_notice_enabled,
-- required_role_id, server_scope, enabled) are added via database/db.js's
-- migration block, same convention as every other ALTER TABLE in this file's
-- history - not restated here since this file only holds the original
-- CREATE TABLE.

-- Per-player, per-binding cooldown tracking for the Kit Engine above - KOBA Bot
-- tracks this itself (rather than relying on Rust's own native per-kit
-- cooldown, which /kit-panel's Reset Cooldown button manipulates via
-- `kit removeplayer` but which KOBA Bot has no way to READ back over RCON) so
-- admin-configured cooldown_minutes is enforceable independent of whatever
-- native cooldown (if any) the underlying Rust kit itself has.
CREATE TABLE IF NOT EXISTS autokit_cooldowns (
  guild_id        TEXT NOT NULL,
  mapping_id      INTEGER NOT NULL,
  gamertag        TEXT NOT NULL,
  last_claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, mapping_id, gamertag)
);

-- Additional wager currencies for the wager games (Defuse Wire/Grid
-- Minefield/Tower Climb), added 2026-09-19 per explicit user request: a
-- player choosing which coin to bet with should see a dropdown of every
-- currency the admin has set up for that game, not always the single
-- currency each game's own *_settings row hardcodes. That original
-- settings row (defuse_wire_settings etc.) stays as-is and is always
-- option #1 ("the primary currency") - this table holds any ADDITIONAL
-- currency+range pairs an admin adds on top, so existing single-currency
-- guilds need no migration and keep working unchanged.
CREATE TABLE IF NOT EXISTS game_currency_bets (
  guild_id    TEXT NOT NULL,
  game_key    TEXT NOT NULL, -- 'defuse_wire' | 'grid_minefield' | 'tower_climb'
  currency_id INTEGER NOT NULL,
  min_bet     REAL NOT NULL,
  max_bet     REAL NOT NULL,
  PRIMARY KEY (guild_id, game_key, currency_id)
);

-- Per-role trade value (added 2026-09-19, per explicit user request: "admin
-- and server owner can set a value for each role or item thats traded" so
-- the player-to-player role/item trade in utils/playerPanel.js charges the
-- recipient instead of just being a free gift). No row = free transfer,
-- unchanged from before this feature existed.
CREATE TABLE IF NOT EXISTS role_trade_values (
  guild_id    TEXT NOT NULL,
  role_id     TEXT NOT NULL,
  currency_id INTEGER NOT NULL,
  value       REAL NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);

-- Per-guild Games Panel access control (added 2026-09-19, per explicit user
-- request: owners need to enable/disable individual games and optionally
-- require a role to play them). Separate from config/games.js's GAMES_REGISTRY
-- `enabled` flag, which is a code-level kill switch across every guild - this
-- is the per-guild override on top of it. No row for a game = enabled, no
-- role requirement (the default, matching every game's current behavior).
CREATE TABLE IF NOT EXISTS game_settings (
  guild_id         TEXT NOT NULL,
  game_key         TEXT NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,
  required_role_id TEXT,
  PRIMARY KEY (guild_id, game_key)
);

-- Message styling (/message-style) - per-category, per-target default color
-- (Rust rich-text <color=#hex> tag, In-Game only) and optional custom text
-- template. target='ingame' feeds rcon.say() (<color>/<b>/<br> tags, no
-- emoji); target='discord' feeds a Discord embed (markdown/emoji, no Rust
-- tags) - added 2026-09-07 after in-game "shows stars" turned out to be
-- emoji/markdown leaking into a template meant for the other target. Absence
-- of a row for a (category, target) means "use that target's built-in
-- default text, color #00FF00 (green, In-Game only)".
CREATE TABLE IF NOT EXISTS message_styles (
  guild_id         TEXT NOT NULL,
  category         TEXT NOT NULL,  -- 'event' | 'kit_delivery' | 'kit_cooldown' | 'event_winner' | 'killfeed'
  target           TEXT NOT NULL DEFAULT 'ingame',  -- 'ingame' | 'discord'
  color_hex        TEXT NOT NULL DEFAULT '#00FF00',
  message_template TEXT,
  size_pt          INTEGER,
  PRIMARY KEY (guild_id, category, target)
);

-- Admin-defined kit registry (/kit-config) - binds a friendly display name
-- to the server's actual internal kit name (e.g. "Starter Pack" ->
-- freekit2), so /give-kit, /remove-kit, and AutoKit Quickchat all reference
-- kits the same human-readable way. Per-kit message/color overrides the
-- guild's kit_delivery/kit_cooldown category default when set (NULL = fall
-- back to the category default).
CREATE TABLE IF NOT EXISTS kit_registry (
  guild_id            TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  internal_kit_name   TEXT NOT NULL,
  delivery_message    TEXT,
  delivery_color_hex  TEXT,
  cooldown_message    TEXT,
  cooldown_color_hex  TEXT,
  claimable                INTEGER NOT NULL DEFAULT 0,
  claim_cooldown_minutes   INTEGER,
  PRIMARY KEY (guild_id, display_name)
);

-- A kit "given" via /kit-panel or /player-panel doesn't deliver over RCON
-- immediately - it creates a token in the recipient's Discord-side
-- inventory, which they redeem (or pass to someone else) themselves. This
-- is what makes kit gifting a real transferable item instead of an instant
-- one-shot RCON action.
CREATE TABLE IF NOT EXISTS kit_claim_tokens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id            TEXT NOT NULL,
  internal_kit_name   TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  holder_discord_id   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'held', -- held | redeemed
  created_at          INTEGER NOT NULL,
  redeemed_at         INTEGER
);

-- Shared claim-cooldown record for kits marked `claimable` on kit_registry -
-- keyed by gamertag (not Discord id) since it's the one identifier both
-- AutoKit quickchat delivery (only ever knows a gamertag) and the player
-- panel's own claim button (resolves the clicker's linked gamertag) share.
-- A kit that's ONLY autokit-mapped and never marked claimable never touches
-- this table at all - unlimited quickchat resupply stays exactly as it was.
CREATE TABLE IF NOT EXISTS kit_claims (
  guild_id            TEXT NOT NULL,
  gamertag            TEXT NOT NULL,
  internal_kit_name   TEXT NOT NULL,
  claimed_at          INTEGER NOT NULL,
  claimed_via         TEXT NOT NULL, -- 'autokit' | 'panel' - audit only, not enforcement
  PRIMARY KEY (guild_id, gamertag, internal_kit_name)
);

-- Named, reusable /create-event configs the auto-event scheduler
-- (utils/autoEvents.js) can fire on its own once both conditions are met:
-- at least `interval_minutes` since it last actually fired, AND at least
-- `min_players` currently online. last_triggered_at only advances on an
-- actual fire (not just an eligible tick), so a config that's blocked on
-- player count keeps getting rechecked every tick instead of missing its
-- window entirely.
CREATE TABLE IF NOT EXISTS auto_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id            TEXT NOT NULL,
  config_name         TEXT NOT NULL,
  event_name          TEXT NOT NULL,
  zone_name           TEXT NOT NULL,
  center_x            REAL NOT NULL,
  center_y            REAL NOT NULL,
  center_z            REAL NOT NULL,
  radius              REAL NOT NULL,
  duration_minutes    INTEGER NOT NULL,
  reward_material     TEXT NOT NULL,
  reward_qty          INTEGER NOT NULL DEFAULT 1,
  color_hex           TEXT,
  ingame_message      TEXT,
  discord_message     TEXT,
  min_players         INTEGER NOT NULL DEFAULT 0,
  interval_minutes    INTEGER NOT NULL,
  enabled             INTEGER NOT NULL DEFAULT 1,
  last_triggered_at   INTEGER,
  created_by          TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  UNIQUE (guild_id, config_name)
);

-- Named, admin-configurable recurring in-game broadcasts (/auto-message-config)
-- - independent of the built-in 15-min "ad" broadcast (utils/backgroundLoops.js),
-- this is for arbitrary extra messages on their own schedule. schedule_type
-- picks which of interval_seconds/cron_expression is used; last_sent_at only
-- advances on an actual send, same semantics as auto_events.
CREATE TABLE IF NOT EXISTS auto_messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  config_name       TEXT NOT NULL,
  message_text      TEXT NOT NULL,
  color_hex         TEXT,
  size_pt           INTEGER,
  schedule_type     TEXT NOT NULL, -- 'interval' | 'cron'
  interval_seconds  INTEGER,
  cron_expression   TEXT,
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_sent_at      INTEGER,
  created_by        TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  UNIQUE (guild_id, config_name)
);

-- Admin-configured gifts (/gift-config) - 'welcome' fires once per new
-- Discord member automatically; the recurring types post a claimable drop
-- in the gifts channel each time their period boundary rolls over.
CREATE TABLE IF NOT EXISTS gift_configs (
  guild_id         TEXT NOT NULL,
  gift_type        TEXT NOT NULL, -- 'welcome' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  reward_type      TEXT NOT NULL, -- 'kit' | 'role' | 'coins'
  kit_name         TEXT,
  role_id          TEXT,
  role_temp_hours  INTEGER,
  coin_currency_id INTEGER,
  coin_min_amount  REAL,          -- coin_min == coin_max means a fixed amount, not a range
  coin_max_amount  REAL,
  message_text     TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, gift_type)
);

-- One row per member who successfully claimed a given period's recurring
-- gift drop - period_start is the exact boundary timestamp (see
-- referralLeaderboard.js's currentPeriodStart, reused here) so claims never
-- carry over between periods and a restart can't lose track of who already got it.
CREATE TABLE IF NOT EXISTS gift_claims (
  guild_id      TEXT NOT NULL,
  gift_type     TEXT NOT NULL,
  period_start  INTEGER NOT NULL,
  user_id       TEXT NOT NULL,
  claimed_at    INTEGER NOT NULL,
  PRIMARY KEY (guild_id, gift_type, period_start, user_id)
);

-- Immutable Combat Event store (utils/combatEvents.js) - originally shipped
-- for the now-removed killfeed DISPLAY feature (killFeed.js), which never
-- actually wrote to this table (zero writers existed before 2026-09-13).
-- Revived and extended (see database/db.js's migration block right after
-- this table's base columns) rather than building a parallel table, since
-- the base shape (killer/victim gamertag, weapon, is_pvp, killed_at) was
-- already most of what the new pipeline needs. Rows are never updated or
-- deleted once inserted - a parser bug discovered later gets a NEW
-- parser_version and explicit reprocessing tooling, not a silent rewrite of
-- history.
CREATE TABLE IF NOT EXISTS pvp_kills (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  killer_gamertag TEXT NOT NULL,
  victim_gamertag TEXT,
  weapon          TEXT,
  is_pvp          INTEGER NOT NULL, -- 1 = player vs player, 0 = player vs NPC/animal (PvE)
  killed_at       INTEGER NOT NULL
);

-- Running PvP kill streak per gamertag (added 2026-09-07, revived by the
-- Combat Event Pipeline 2026-09-13 - had zero writers in between) - a
-- running counter updated live on every PvP kill/death, not derived from
-- pvp_kills on read (recomputing "consecutive kills since last death" from
-- the raw event log on every kill would mean scanning that player's whole
-- history every time). current_streak increments on a kill, resets to 0 on
-- a death; best_streak is the highest current_streak this gamertag has
-- ever reached, kept even after a death resets current_streak.
CREATE TABLE IF NOT EXISTS pvp_streaks (
  guild_id       TEXT NOT NULL,
  gamertag       TEXT NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, gamertag)
);

-- Nemesis/Rivalry tracking (utils/killfeedEngine.js) - one row per ordered
-- (attacker, victim) pair, counting CONSECUTIVE unanswered kills attacker
-- has landed on victim since victim's last kill back on attacker. Reaching
-- NEMESIS_THRESHOLD flags is_nemesis=1 (attacker is victim's active
-- nemesis); the row is deleted entirely the moment victim lands a kill back
-- on attacker (that's the "NEMESIS DOWN" moment), not just reset to 0 -
-- there's nothing meaningful left to track once the streak is broken.
CREATE TABLE IF NOT EXISTS pvp_rivalries (
  guild_id          TEXT NOT NULL,
  attacker_gamertag TEXT NOT NULL,
  victim_gamertag   TEXT NOT NULL,
  consecutive_kills INTEGER NOT NULL DEFAULT 0,
  is_nemesis        INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (guild_id, attacker_gamertag, victim_gamertag)
);

-- Elo-style skill rating per gamertag (utils/killfeedEngine.js). Standard
-- Elo starting value (1000, not 1500 - arbitrary either way, but lower
-- gives more visible early movement for a freshly-wiped server's small
-- early population). K-factor is computed at update time, not stored.
CREATE TABLE IF NOT EXISTS pvp_elo (
  guild_id  TEXT NOT NULL,
  gamertag  TEXT NOT NULL,
  rating    REAL NOT NULL DEFAULT 1000,
  PRIMARY KEY (guild_id, gamertag)
);

-- KOBA Score (utils/kobaScore.js) - a GLOBAL, cross-server, Challenge-
-- outcome-driven rating. Deliberately separate from pvp_elo above: that one
-- is per-guild and updates on every raw PvP kill (killfeed/bounty purposes);
-- this one updates ONLY on a verified Challenge settlement
-- (utils/challengeEngine.js's onChallengeSettled - a real, adjudicated
-- competitive result, not farmable by repeat kills). Keyed by discord_id,
-- not gamertag/guild_id, since this is meant to be the one score that
-- follows a player across every server KOBA tracks.
CREATE TABLE IF NOT EXISTS koba_scores (
  discord_id TEXT PRIMARY KEY,
  rating     REAL NOT NULL DEFAULT 1000,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Player-level KOBA Bot/Pro/Max subscription (Basic|Pro|Max) - deliberately
-- separate from premium.js's guild-owner plan (a SERVER's subscription,
-- gating bot features like /shop-mint). This one is an individual PLAYER's
-- entitlement, global across every guild, used by Koba-rivals' swipe/
-- Challenge limits (see config/playerPlans.js). No payment processing is
-- wired to this yet - plan is granted manually (admin command) until a real
-- checkout flow exists; NULL plan reads as 'basic' (the free default).
CREATE TABLE IF NOT EXISTS player_subscriptions (
  discord_id         TEXT PRIMARY KEY,
  plan               TEXT NOT NULL DEFAULT 'basic', -- 'basic' | 'pro' | 'max'
  expires_at         INTEGER, -- NULL = doesn't expire (e.g. admin-granted)
  updated_at         INTEGER NOT NULL,
  -- Set ONCE, the first time this discord_id ever goes from basic to
  -- pro/max - never overwritten by a later downgrade/upgrade/renewal, so
  -- config/subBadges.js's tenure badges (Shield_Twitch_Sub_Badges) measure
  -- real total time as a paying member, not just "time on current plan".
  first_subscribed_at INTEGER
);

-- Server-side daily counters backing config/playerPlans.js's swipe/Challenge
-- creation limits - tracked here (not trusted from the client) specifically
-- so Koba-rivals' swipe cap can't be bypassed by clearing localStorage.
-- `day_key` is a plain YYYY-MM-DD string (UTC) - a new row per day per
-- counter, old rows are harmless clutter (cheap enough not to need a sweep).
CREATE TABLE IF NOT EXISTS player_daily_usage (
  discord_id TEXT NOT NULL,
  day_key    TEXT NOT NULL,
  counter    TEXT NOT NULL, -- 'swipes' | 'challenges_created'
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (discord_id, day_key, counter)
);

-- Bounties (/bounty place|list|cancel) - currency is moved into escrow
-- (deducted from placer's wallet) the moment a bounty is placed, not just
-- promised, so a placer can't place a bounty they can't cover and then
-- cancel the obligation after the fact. status transitions: open -> claimed
-- (a valid PvP kill landed on target_gamertag) or open -> cancelled
-- (placer cancels, refunded) or open -> expired (TTL background sweep,
-- refunded) - never back out of claimed/cancelled/expired.
CREATE TABLE IF NOT EXISTS bounties (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT NOT NULL,
  target_gamertag  TEXT NOT NULL,
  placed_by        TEXT NOT NULL, -- Discord id of whoever placed it
  currency_id      INTEGER NOT NULL,
  amount           INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open', -- 'open' | 'claimed' | 'cancelled' | 'expired'
  claimed_by_gamertag TEXT,
  claimed_at       INTEGER,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bounties_guild_target_status ON bounties (guild_id, target_gamertag, status);

-- Reward config for the newer leaderboard categories (clan wars, PvP, PvE,
-- event wins) - separate from referral_leaderboard_rewards (which stays on
-- its own existing, already-working system) so nothing there gets disturbed.
CREATE TABLE IF NOT EXISTS leaderboard_rewards (
  guild_id         TEXT NOT NULL,
  category         TEXT NOT NULL, -- 'clan_wars' | 'pvp' | 'pve' | 'event_wins'
  period           TEXT NOT NULL, -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  place            INTEGER NOT NULL,
  reward_type      TEXT NOT NULL, -- 'kit' | 'role'
  kit_name         TEXT,
  role_id          TEXT,
  role_temp_hours  INTEGER,
  PRIMARY KEY (guild_id, category, period, place)
);

-- Staff application positions (/staff-config) - each position has its own
-- up-to-5-question form (Discord modals hard-cap at 5 text inputs, and a
-- required social-links field counts against that same limit).
CREATE TABLE IF NOT EXISTS staff_positions (
  guild_id       TEXT NOT NULL,
  position_name  TEXT NOT NULL,
  role_id        TEXT, -- granted automatically on Accept, if set
  questions      TEXT NOT NULL, -- JSON array of question strings
  require_social INTEGER NOT NULL DEFAULT 0,
  enabled        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, position_name)
);

-- One row per submitted application - answers/social_links are JSON.
CREATE TABLE IF NOT EXISTS staff_applications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT NOT NULL,
  position_name  TEXT NOT NULL,
  applicant_id   TEXT NOT NULL,
  answers        TEXT NOT NULL,
  social_links   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  submitted_at   INTEGER NOT NULL,
  reviewed_by    TEXT,
  reviewed_at    INTEGER
);

-- Rising Tides event - pre-walked spawn waypoints (RCON can't target
-- arbitrary coordinates without a saved reference point - see
-- utils/risingTides.js for the entity.spawnatpos confirmation status).
CREATE TABLE IF NOT EXISTS tide_waypoints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  tier        TEXT NOT NULL, -- 'high' | 'medium' | 'basic'
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  created_at  INTEGER NOT NULL
);

-- One active Rising Tides run per guild at a time - state for /tide,
-- /hardcore, /luckycrates, and /event all share this single row so /event
-- status can show a unified picture (water level, survivors, next drop).
CREATE TABLE IF NOT EXISTS rising_tides_events (
  guild_id              TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'inactive', -- inactive | active | ended
  started_at            INTEGER,
  ends_at               INTEGER,
  peak_water_height     REAL,
  step_interval_ms      INTEGER,
  step_increment        REAL,
  current_water_height  REAL NOT NULL DEFAULT 0,
  last_step_at          INTEGER,
  hardcore_enabled      INTEGER NOT NULL DEFAULT 0,
  crates_enabled        INTEGER NOT NULL DEFAULT 0,
  crate_interval_ms     INTEGER,
  last_crate_at         INTEGER
);

-- Per-player registration + life tracking for the current Rising Tides run.
CREATE TABLE IF NOT EXISTS rising_tides_players (
  guild_id     TEXT NOT NULL,
  gamertag     TEXT NOT NULL,
  discord_id   TEXT,
  eliminated   INTEGER NOT NULL DEFAULT 0,
  eliminated_at INTEGER,
  registered_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, gamertag)
);

-- Admin-configurable loot tables per crate tier (/luckycrates-config), and
-- the survivor-count threshold that unlocks each tier - e.g. tier1 while
-- survivors > 20, tier2 while 10 < survivors <= 20, tier3 at <= 10.
CREATE TABLE IF NOT EXISTS crate_loot_items (
  guild_id   TEXT NOT NULL,
  tier       TEXT NOT NULL,
  shortname  TEXT NOT NULL,
  PRIMARY KEY (guild_id, tier, shortname)
);

CREATE TABLE IF NOT EXISTS crate_tier_thresholds (
  guild_id      TEXT NOT NULL,
  tier          TEXT NOT NULL,
  max_survivors INTEGER NOT NULL, -- this tier becomes eligible once survivor count drops to (or starts at, for the first/highest tier) this value or below
  PRIMARY KEY (guild_id, tier)
);

-- Ship Battle event - one active run per guild. Water-rise mechanics reuse
-- the exact same env.oceanlevel approach as Rising Tides (utils/risingTides.js)
-- rather than sharing code, to avoid destabilizing that already-tested system.
CREATE TABLE IF NOT EXISTS ship_battle_events (
  guild_id              TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'inactive', -- inactive | registration | active | ended
  min_team              INTEGER,
  max_team              INTEGER,
  total_rounds          INTEGER,
  current_round         INTEGER NOT NULL DEFAULT 1,
  lives_per_player      INTEGER,
  prize_type            TEXT, -- 'role' | 'kit'
  prize_value           TEXT, -- role id, or a registered kit's display name
  peak_water_height     REAL,
  step_interval_ms      INTEGER,
  step_increment        REAL,
  current_water_height  REAL NOT NULL DEFAULT 0,
  last_step_at          INTEGER,
  created_at            INTEGER
);

-- Per-player registration + lives for the current Ship Battle run.
-- team_name is whichever existing KOBA Bot team (/team-panel) they belong
-- to - min/max team validated against that team's actual roster count.
CREATE TABLE IF NOT EXISTS ship_battle_players (
  guild_id    TEXT NOT NULL,
  gamertag    TEXT NOT NULL,
  discord_id  TEXT,
  team_name   TEXT,
  lives       INTEGER NOT NULL,
  eliminated  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, gamertag)
);

-- Pre-walked boat spawn points - same RCON limitation as Lucky Crate
-- waypoints (no arbitrary-coordinate spawning without a saved reference).
CREATE TABLE IF NOT EXISTS boat_waypoints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Player-set "home" position for the TP Home feature - captured via
-- `printpos <platformId>` when the player presses Pos in /player-panel
-- (player must be online - platform ID is looked up live from
-- global.playerlist, never stored, same convention /add-role already uses).
-- last_tp_at tracks the TP Home cooldown, separate from set_at. One home
-- per player per guild - setting a new one replaces the old.
CREATE TABLE IF NOT EXISTS player_homes (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  gamertag    TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  set_at      INTEGER NOT NULL,
  last_tp_at  INTEGER,
  PRIMARY KEY (guild_id, discord_id)
);

-- Admin-set fast-travel destinations for the 8 directional teleport
-- quick-chat binds (d11_quick_chat_teleport_north etc) - "direction" is the
-- compass key (north/north_east/east/south_east/south/south_west/west/
-- north_west), NOT tied to any player. "home" is intentionally not stored
-- here - that bind always resolves to the sender's own player_homes row.
CREATE TABLE IF NOT EXISTS teleport_waypoints (
  guild_id    TEXT NOT NULL,
  direction   TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  set_at      INTEGER NOT NULL,
  PRIMARY KEY (guild_id, direction)
);

-- ORP ("ZORP"-style Offline Raid Protection) zones, commands/orp.js +
-- utils/orpZones.js. One zone per TEAM per guild (not per player) - a base
-- is shared by the whole roster (teams already share a TC via
-- tc_entity_id), so the protection state has to key off whether ANY
-- registered member is online, not one person's own session. center_x/y/z
-- is captured live via `server.printpos "<gamertag>"` at /orp register time
-- (same confirmed mechanism as player_homes/Set Home above - see
-- utils/playerPanel.js's qc_set_home), never hand-typed. Registering again
-- replaces the old row/zone, same "setting a new one replaces the old"
-- convention as player_homes. state is flipped by utils/orpZones.js's
-- runOrpTick (utils/backgroundLoops.js heartbeat) by polling the `players`
-- RCON list for any team member's linked gamertag - same presence check
-- utils/rewardDelivery.js's isPlayerOnline and utils/zoneEvents.js's
-- teamsInZone already use, no new presence mechanism introduced.
-- IMPORTANT: this is a VISUAL/chat marker only (color + entermessage/
-- leavemessage/showchatmessage via zones.editcustomzone) - RCE's WebRCON
-- has no confirmed way to toggle PvP/building-damage on an EXISTING zone
-- (only zones.createcustomzone's one-time creation flags do that - see
-- docs/RUST_CONSOLE_RCON_REFERENCE.md), so it does not, on its own, block
-- raid damage. Treat it the same as zone_events' color_hex note above:
-- a warning signal, not an enforcement mechanism.
CREATE TABLE IF NOT EXISTS orp_zones (
  guild_id    TEXT NOT NULL,
  team_name   TEXT NOT NULL,
  zone_name   TEXT NOT NULL,
  center_x    REAL NOT NULL,
  center_y    REAL NOT NULL,
  center_z    REAL NOT NULL,
  radius      REAL NOT NULL, -- Sphere size; unused (0) when shape='Box' - see box_width/height/length instead
  state       TEXT NOT NULL DEFAULT 'online', -- 'online' | 'protected'
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  -- Shape snapshotted at register time from the guild's admin-configured
  -- /orp configure default (guild_meta.orp_shape) - a later admin shape
  -- change doesn't retroactively resize an already-deployed zone, same
  -- "snapshot, don't live-reference" convention as jail_sentences' jail_x/y/z.
  shape       TEXT NOT NULL DEFAULT 'Sphere', -- 'Sphere' | 'Box'
  box_width   REAL,
  box_height  REAL,
  box_length  REAL,
  PRIMARY KEY (guild_id, team_name)
);
CREATE INDEX IF NOT EXISTS idx_orp_zones_guild ON orp_zones (guild_id);

-- Prison/Jail system (Category 6, Phase 2 - KOBABOT_FULL_ROADMAP.md).
-- One row per active or past jail sentence. The jail coordinate itself
-- isn't duplicated here from guild_meta.jail_x/y/z - it's snapshotted onto
-- the sentence at /jail player time so a later /jail set-location change
-- doesn't retroactively move an already-jailed player's holding cell.
-- original_x/y/z is where the player was standing right before being
-- jailed, so /jail release can optionally return them there instead of
-- just leaving them at the jail coordinate. duration_ms is NULL for an
-- indefinite sentence (released only via /jail release); otherwise
-- utils/jailSystem.js's background tick auto-releases once
-- started_at + duration_ms has elapsed.
CREATE TABLE IF NOT EXISTS jail_sentences (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  gamertag     TEXT NOT NULL,
  jail_x       REAL NOT NULL,
  jail_y       REAL NOT NULL,
  jail_z       REAL NOT NULL,
  original_x   REAL,
  original_y   REAL,
  original_z   REAL,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER,
  released_at  INTEGER,
  jailed_by    TEXT NOT NULL,
  released_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_jail_sentences_active ON jail_sentences (guild_id, gamertag, released_at);

-- ===========================================================================
-- Shop system - multiple independently-configured shops, each gated by an
-- optional role allowlist (e.g. a VIP shop vs a general User shop), each
-- selling products in admin-defined categories, priced in admin-defined
-- currencies. Delivery is a per-purchase throwaway kit (kit add -> kit
-- givetoplayer -> kit delete), the only confirmed way to hand a player raw
-- items - RCE's docs have no direct "give item" RCON command (checked
-- 2026-09-01 against the official Kit Management + Items & Inventory pages).
-- ===========================================================================

-- max_supply/circulating_supply (added 2026-09-07, /currency-mint): NULL
-- max_supply (the default) means uncapped, exactly like every other
-- nullable-limit convention in this file (max_wallet_balance, marketplace
-- bounds). Once an owner mints for the first time, max_supply becomes a
-- hard ceiling - circulating_supply (a running total, NEVER read by
-- re-summing every wallet - see db.js's tryCreateCurrency) can never be
-- pushed past it by ANY reward-creation path (lootbox wins, /give,
-- referral rewards, etc.) - only player-to-player sends and purchases
-- (moving EXISTING coins between two wallets) are exempt, since those
-- don't create anything new. Burning lowers max_supply back down (can't
-- burn below what's already circulating - that would mean destroying coins
-- sitting in a real wallet, which this feature deliberately does NOT do).
CREATE TABLE IF NOT EXISTS shop_currencies (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  emoji              TEXT,
  savings_interest_pct REAL NOT NULL DEFAULT 1.0, -- percent per real-world day, admin-set per currency, not per player
  max_supply         REAL,                        -- NULL = uncapped
  circulating_supply REAL NOT NULL DEFAULT 0,      -- running total ever created, see tryCreateCurrency
  created_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  name              TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  required_role_ids TEXT NOT NULL DEFAULT '[]', -- JSON array - empty means anyone can shop here
  currency_id       INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  shop_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id           TEXT NOT NULL,
  shop_id            INTEGER NOT NULL,
  category_id        INTEGER NOT NULL,
  display_name       TEXT NOT NULL,
  item_short_name    TEXT NOT NULL, -- from config/rustItems.js - never hand-typed
  amount_per_unit    INTEGER NOT NULL DEFAULT 1,
  price              REAL NOT NULL,
  image_url          TEXT,
  created_at         INTEGER NOT NULL
);

-- A sale targets EITHER a whole category OR one product (whichever id is
-- non-null) - percent_off applies at checkout time, expires_at makes it
-- self-cleaning (checked live, no cron needed to "end" a sale).
CREATE TABLE IF NOT EXISTS shop_sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  shop_id      INTEGER NOT NULL,
  category_id  INTEGER,
  product_id   INTEGER,
  percent_off  INTEGER NOT NULL,
  starts_at    INTEGER NOT NULL,
  ends_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_wallets (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  currency_id  INTEGER NOT NULL,
  balance      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, discord_id, currency_id)
);

-- Simple interest, accrued on the background tick (utils/backgroundLoops.js)
-- against whatever's sitting in savings, at the owning currency's
-- savings_interest_pct rate, prorated per tick rather than requiring the
-- account to be open a full day.
CREATE TABLE IF NOT EXISTS shop_savings (
  guild_id           TEXT NOT NULL,
  discord_id         TEXT NOT NULL,
  currency_id        INTEGER NOT NULL,
  balance            REAL NOT NULL DEFAULT 0,
  last_accrued_at    INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, currency_id)
);

-- One row per (player, product) in their active cart - quantity 0 means
-- "not in cart" and just gets deleted rather than stored.
CREATE TABLE IF NOT EXISTS shop_cart_items (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  product_id  INTEGER NOT NULL,
  quantity    INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, product_id)
);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  discord_id    TEXT NOT NULL,
  gamertag      TEXT NOT NULL,
  shop_id       INTEGER NOT NULL,
  summary       TEXT NOT NULL, -- human-readable line items, since products can be edited/deleted later
  total_price   REAL NOT NULL,
  currency_id   INTEGER NOT NULL,
  purchased_at  INTEGER NOT NULL
);

-- Formal team-vs-team war declarations (/declare-war). One active war per
-- team at a time (a team already at war must end it before declaring a new
-- one) - keeps this a clean head-to-head feud tracker rather than a full
-- alliance/diplomacy system, matching how bomb targeting is already 1:1.
CREATE TABLE IF NOT EXISTS wars (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  team_a      TEXT NOT NULL,
  team_b      TEXT NOT NULL,
  declared_by TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'ended'
  winner      TEXT,
  declared_at INTEGER NOT NULL,
  ended_at    INTEGER
);

-- Rival System (utils/rivalSystem.js, utils/challengeEngine.js). A
-- rivalship is a persistent 1:1 competitive relationship between two
-- players in one guild - player_a/player_b are ALWAYS stored in canonical
-- (sorted) order so "A+B" and "B+A" can never create two separate rows for
-- the same relationship (spec's explicit "rivalship identity" requirement).
CREATE TABLE IF NOT EXISTS rivalships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  player_a   TEXT NOT NULL,
  player_b   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'ended'
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at   INTEGER,
  UNIQUE(guild_id, player_a, player_b)
);

-- One aggregate row per rivalship - updated only when a Challenge between
-- these two players SETTLES (never touched by any other feature). Kept
-- forever even after a rivalship is "ended" (spec section 56/57 - history
-- must remain available and reactivating must not orphan the old record).
CREATE TABLE IF NOT EXISTS rivalship_stats (
  rivalship_id           INTEGER PRIMARY KEY REFERENCES rivalships(id),
  wins_a                 INTEGER NOT NULL DEFAULT 0,
  wins_b                 INTEGER NOT NULL DEFAULT 0,
  current_streak_holder  TEXT,    -- discord_id currently on a streak against the other side, NULL before any match or right after a push
  current_streak_count   INTEGER NOT NULL DEFAULT 0,
  best_streak_a          INTEGER NOT NULL DEFAULT 0,
  best_streak_b          INTEGER NOT NULL DEFAULT 0,
  total_wagered          REAL NOT NULL DEFAULT 0,
  last_match_at          INTEGER,
  last_winner            TEXT
);

-- Full settled-match history for a rivalship (spec section 37).
CREATE TABLE IF NOT EXISTS rivalship_matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rivalship_id INTEGER NOT NULL REFERENCES rivalships(id),
  guild_id     TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  currency_id  INTEGER NOT NULL,
  stake_amount REAL NOT NULL,
  pot_amount   REAL NOT NULL,
  fee_amount   REAL NOT NULL DEFAULT 0,
  winner       TEXT,  -- discord_id, NULL on a push (refunded, no winner)
  loser        TEXT,
  completed_at INTEGER NOT NULL
);

-- A direct 1v1 wagered Challenge. State machine (simplified from the
-- spec's full DRAFT/OPEN/ACCEPTED/ESCROWED/ACTIVE/COMPLETED/SETTLED chain
-- to what's actually reachable given the resolution model below - see
-- utils/challengeEngine.js's header): OPEN -> ACCEPTED (escrow happens
-- atomically at acceptance, so there's no separately-observable ESCROWED
-- state) -> SETTLED, or OPEN -> DECLINED/EXPIRED/CANCELLED (terminal, no
-- money ever moved).
CREATE TABLE IF NOT EXISTS challenges (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT NOT NULL,
  challenger_id    TEXT NOT NULL,
  opponent_id      TEXT NOT NULL,
  currency_id      INTEGER NOT NULL,
  stake_amount     REAL NOT NULL,
  status           TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, ACCEPTED (duel live, see challenge_duels), SETTLED, FORFEITED (duel timed out), DECLINED, EXPIRED, CANCELLED
  rivalship_id     INTEGER REFERENCES rivalships(id),
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  accepted_at      INTEGER,
  settled_at       INTEGER,
  winner_id        TEXT
  -- kill_target, channel_id added via database/db.js's migration block (this table already shipped) - see that file
);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges (guild_id, opponent_id, status);

-- Live kill-tracking for an ACCEPTED Challenge (utils/duelTracker.js) - replaces
-- the old coin-flip settlement (see challengeEngine.js's former header comment,
-- "RESOLUTION MODEL") now that a real PvP kill signal exists
-- (utils/combatEvents.js/killfeedEngine.js). One row per live Challenge; deleted
-- once the Challenge is settled or forfeited (timeout). Gamertags are snapshotted
-- here rather than re-resolved from members on every kill event, so a mid-duel
-- /link change by either player can't retarget who counts as "them" for THIS
-- running duel.
CREATE TABLE IF NOT EXISTS challenge_duels (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id             TEXT NOT NULL,
  challenge_id         INTEGER NOT NULL REFERENCES challenges(id),
  challenger_gamertag  TEXT NOT NULL,
  opponent_gamertag    TEXT NOT NULL,
  kill_target          INTEGER NOT NULL,
  challenger_kills     INTEGER NOT NULL DEFAULT 0,
  opponent_kills       INTEGER NOT NULL DEFAULT 0,
  started_at           INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL,
  -- NULL until the first real kill between these two gamertags lands - that
  -- kill's pvp_kills.server_name locks the duel to that one linked Rust
  -- server for the rest of its life (guild_servers supports multiple Rust
  -- servers per Discord guild, so guild_id alone doesn't pin down which
  -- physical server a kill happened on). Prevents a losing player from
  -- hopping to a different server this same guild tracks and padding the
  -- other side's count with unrelated kills there.
  server_name          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_duels_challenge ON challenge_duels (challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_duels_guild ON challenge_duels (guild_id, expires_at);

-- Progression System (utils/progression.js) - permanent per-guild career
-- progression, deliberately separate from Session Points (session_points
-- below) per the spec's explicit "XP and Points are completely separate"
-- rule. Scoped per (guild_id, discord_id) like every other per-player table
-- in this codebase (wallets, kit claims, etc.) - nothing in this codebase
-- has a global-across-guilds player record except boom_identities, and
-- nothing in this spec requires XP to be one of the exceptions.
-- xp = current progression toward the next level, RESETS to 0 on Prestige.
-- lifetime_xp = permanent career total, NEVER decreases, not even on
-- Prestige (spec section 3/17). level/prestige are cached/derived columns
-- (recomputed from xp using the guild's configured curve on every award)
-- rather than recalculated from scratch on every read.
CREATE TABLE IF NOT EXISTS player_progression (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  lifetime_xp  INTEGER NOT NULL DEFAULT 0,
  level        INTEGER NOT NULL DEFAULT 1,
  prestige     INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);

-- Idempotency log for every XP award (spec section 5: "if GAME_COMPLETED
-- event_id=ABC123 is processed twice, the player receives XP only once").
-- source_id is whatever uniquely identifies the underlying event this XP
-- came from (a pvp_kills.id, a challenges.id, etc.) - the unique index
-- below is the actual enforcement mechanism, same pattern as the Combat
-- Event Pipeline's event_fingerprint.
CREATE TABLE IF NOT EXISTS xp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  awarded_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_dedup ON xp_events (guild_id, discord_id, source_type, source_id);

-- A Session is a temporary competitive period (spec section 8) - intended
-- to align with Rust wipe cycles, but that's just the common case, not
-- enforced. Only one 'active' session per guild at a time (see
-- utils/sessionManager.js's startSession). Ended sessions and their
-- session_points rows are NEVER deleted - that IS the permanent Session
-- History (spec section 10), so no separate archive table is needed.
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'active' | 'ended'
  starts_at    INTEGER,
  ends_at      INTEGER,
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_guild_status ON sessions (guild_id, status);

-- Live per-session leaderboard - Points are completely separate from XP
-- (different table entirely, never touched by utils/progression.js).
-- last_point_at is the tie-break spec section 37 calls for ("time the
-- score was achieved") when two players have equal points.
CREATE TABLE IF NOT EXISTS session_points (
  guild_id      TEXT NOT NULL,
  session_id    INTEGER NOT NULL,
  discord_id    TEXT NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  last_point_at INTEGER,
  PRIMARY KEY (guild_id, session_id, discord_id)
);

-- Idempotency log for Points, same reasoning/shape as xp_events above.
CREATE TABLE IF NOT EXISTS session_point_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  session_id  INTEGER NOT NULL,
  discord_id  TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  awarded_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_point_events_dedup ON session_point_events (guild_id, session_id, discord_id, source_type, source_id);

-- Server-configured badges (spec section 20) - condition_type/
-- condition_value describe an AUTOMATIC award rule (e.g. 'level_milestone'
-- / '50'); a badge with condition_type = 'manual' is never auto-checked,
-- only ever awarded via an explicit staff action.
CREATE TABLE IF NOT EXISTS server_badges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  name            TEXT NOT NULL,
  icon            TEXT,
  description     TEXT,
  condition_type  TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'xp_milestone' | 'level_milestone' | 'prestige_milestone'
  condition_value TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_badges (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  badge_id    INTEGER NOT NULL,
  awarded_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, badge_id)
);

-- KABOOM Profile (utils/kaboomProfile.js) - KOBA Bot's own website-only
-- cosmetic profile card system (see utils/kaboomProfileImage.js's header
-- for asset/creation guidelines). Global per discord_id (not guild-scoped) -
-- a player's cosmetic choices are theirs, following them everywhere
-- KOBA Bot shows their card. Available to both player and business account
-- types (boom_identities.account_type). EDITING requires an active KABOOM
-- Pro subscription (its own separate product, not bundled with server
-- Pro/Max) - viewing a profile never requires one, so a customization
-- already made is never hidden if a subscription lapses.
CREATE TABLE IF NOT EXISTS kaboom_profiles (
  discord_id       TEXT PRIMARY KEY,
  theme_key        TEXT NOT NULL DEFAULT 'green',
  banner_key       TEXT NOT NULL DEFAULT 'default',
  nameplate_style  TEXT NOT NULL DEFAULT 'plain',
  bio              TEXT,
  updated_at       INTEGER NOT NULL
);

-- KABOOM Pro is its own separate subscription (NOT bundled with a guild's
-- KOBA Bot Pro/Max license) - a per-DISCORD-ACCOUNT purchase, available to
-- both 'player' and 'business' account types (boom_identities.account_type
-- doesn't gate this at all). Same shape/reasoning as premium_users, kept
-- as its own table rather than reusing premium_users because that table
-- is specifically guild-license bookkeeping (active_guild_id, per-server
-- authorization) - a wholly different kind of "subscription" than a
-- personal cosmetic unlock with no guild concept at all.
CREATE TABLE IF NOT EXISTS kaboom_pro_subscriptions (
  discord_id   TEXT PRIMARY KEY,
  expires_at   INTEGER NOT NULL,
  granted_by   TEXT,   -- 'tip4serv' | an admin's discord_id for a manual grant
  created_at   INTEGER NOT NULL
);

-- Server Rivalry (utils/serverRivalry.js) - community vs community,
-- distinct from a player rivalship. guild_a/guild_b are ALWAYS stored in
-- canonical (sorted) order, same normalization convention as rivalships
-- (spec section 18: "A ↔ B is the same relationship as B ↔ A"). Only one
-- 'active' rivalry per guild at a time (mirrors Sessions' "one active per
-- guild" rule) - a guild already in a rivalry must end it before starting
-- another, keeping this a clean head-to-head feud rather than a full
-- alliance/standings system.
CREATE TABLE IF NOT EXISTS server_rivalries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_a      TEXT NOT NULL,
  guild_b      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' (invitation sent) | 'active' | 'ended' | 'voided' (same-owner conflict discovered after creation - see requireNoOwnershipConflict's background sweep)
  invited_by   TEXT NOT NULL, -- guild_id that sent the invitation
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  void_reason  TEXT,
  UNIQUE(guild_a, guild_b)
);

-- Aggregate scorecard for one server rivalry - score_a/score_b accumulate
-- from configured event types (game wins, Challenge wins, Clan War wins)
-- via the same event-bus consumer pattern as utils/progression.js, never
-- recomputed from scratch on read.
CREATE TABLE IF NOT EXISTS server_rivalry_stats (
  rivalry_id            INTEGER PRIMARY KEY REFERENCES server_rivalries(id),
  score_a                REAL NOT NULL DEFAULT 0,
  score_b                REAL NOT NULL DEFAULT 0,
  game_wins_a            INTEGER NOT NULL DEFAULT 0,
  game_wins_b            INTEGER NOT NULL DEFAULT 0,
  challenge_wins_a       INTEGER NOT NULL DEFAULT 0,
  challenge_wins_b       INTEGER NOT NULL DEFAULT 0,
  clan_war_wins_a        INTEGER NOT NULL DEFAULT 0,
  clan_war_wins_b        INTEGER NOT NULL DEFAULT 0,
  current_leader_guild   TEXT,
  last_event_at          INTEGER
);

-- Idempotency log for server rivalry score events - same shape/reasoning as
-- xp_events/session_point_events.
CREATE TABLE IF NOT EXISTS server_rivalry_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rivalry_id  INTEGER NOT NULL,
  guild_id    TEXT NOT NULL, -- which side of the rivalry this event credits
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  points      REAL NOT NULL,
  awarded_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_server_rivalry_events_dedup ON server_rivalry_events (rivalry_id, guild_id, source_type, source_id);

-- Permanent history of ended/voided rivalries - server_rivalry_stats rows
-- are NEVER deleted when a rivalry ends (same "history = the same rows,
-- just no longer active" pattern as Sessions), so no separate archive
-- table is needed; this index just makes "past rivalries involving guild
-- X" cheap to query.
CREATE INDEX IF NOT EXISTS idx_server_rivalries_guild_a ON server_rivalries (guild_a, status);
CREATE INDEX IF NOT EXISTS idx_server_rivalries_guild_b ON server_rivalries (guild_b, status);

-- Admin-listed auctions (/auction-config create). reward_type/reward_ref
-- mirror shop_products' scheme so the same delivery logic (utils/
-- rewardDelivery.js) handles both. Bidding is escrowed - a bidder's wallet
-- is debited the moment their bid is placed and the previous high bidder is
-- refunded when outbid, so current_bid is always money KOBA Bot is actually
-- holding, never just a number on a screen. Resolved by a background tick
-- once ends_at passes, or immediately via Buy Now.
CREATE TABLE IF NOT EXISTS auctions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  currency_id     INTEGER NOT NULL,
  reward_type     TEXT NOT NULL,   -- 'item' | 'role' | 'kit' | 'material'
  reward_ref      TEXT NOT NULL,   -- item short name | role id | kit display name | material field
  amount          INTEGER NOT NULL DEFAULT 1,
  starting_bid    REAL NOT NULL,
  buy_now_price   REAL,
  current_bid     REAL,
  current_bidder  TEXT,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'sold' | 'expired' | 'cancelled'
  channel_id      TEXT,
  message_id      TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  ends_at         INTEGER NOT NULL,
  -- FIXED (2026-09-06): Buy Now and the auction-close tick both used to call
  -- deliverReward() and ignore its return value entirely - a failed
  -- delivery (e.g. the winner wasn't online) was reported as a successful
  -- purchase with no way to ever retry, the exact same class of bug fixed
  -- in utils/lootboxPanel.js earlier the same day. NULL on a 'sold' auction
  -- means delivery hasn't succeeded yet - utils/auctionPanel.js shows a
  -- Retry Delivery button on the auction message until this gets set.
  delivered_at    INTEGER
);

CREATE TABLE IF NOT EXISTS auction_bids (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id  INTEGER NOT NULL,
  discord_id  TEXT NOT NULL,
  amount      REAL NOT NULL,
  placed_at   INTEGER NOT NULL
);

-- Player-to-player Marketplace, deliberately scoped to materials only (the
-- one asset type KOBA Bot has authoritative DB ownership of, via teams.*
-- stockpiles) - a player can't actually prove/transfer possession of a raw
-- in-game item or a role, but a material is just a number in this database
-- that KOBA Bot can safely move between teams. price is player-chosen but
-- clamped to the listing's currency's admin-set marketplace_min_price/
-- max_price at listing time. Materials are escrowed out of the seller's
-- team stockpile immediately on listing (refunded on cancel) so a sale can
-- never oversell what the team no longer has.
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  seller_discord_id TEXT NOT NULL,
  seller_team       TEXT NOT NULL,
  currency_id       INTEGER NOT NULL,
  material_field    TEXT NOT NULL, -- one of config/materials.js MATERIAL_FIELDS
  amount            INTEGER NOT NULL,
  price             REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'sold' | 'cancelled'
  buyer_discord_id  TEXT,
  created_at        INTEGER NOT NULL,
  sold_at           INTEGER
);

-- Cross-server Server Directory (/directory register, /directory search) -
-- the one genuinely cross-guild feature in the whole bot. Every OTHER
-- table here is scoped to the guild that owns the row; this one instead
-- always posts into a single hub guild (OFFICIAL_GUILD_ID), configured via
-- getConfig/setConfig("directory_channel_id" etc, no guild_meta needed
-- since there's only ever one hub). guild_id below is the REGISTERING
-- server, not the hub.
CREATE TABLE IF NOT EXISTS directory_servers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT, -- doubles as the public "Server ID" shown on the card
  guild_id      TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  invite_url    TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array, admin caps at 4 in the command itself
  player_count  INTEGER NOT NULL DEFAULT 0,
  max_players   INTEGER NOT NULL DEFAULT 0,
  queued        INTEGER NOT NULL DEFAULT 0,
  channel_id    TEXT,   -- hub channel this server's card lives in (cached, avoids a re-lookup every telemetry tick)
  message_id    TEXT,   -- this server's own persistent card message, edited in place on every telemetry/rating change
  registered_by TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  telemetry_at  INTEGER
);

-- A website visitor following a directory-listed server (see /servers,
-- admin/serversDirectory.js) - requires being logged in via the existing
-- Discord OAuth dashboard session (admin/playerAuth.js), not a separate
-- account system.
CREATE TABLE IF NOT EXISTS directory_follows (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  followed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);

-- One review per (server, reviewer) - UNIQUE lets a resubmission update
-- their existing review in place instead of stacking duplicates, which
-- keeps the aggregate rating (AVG(stars) computed live, never stored)
-- honest even if someone changes their mind.
CREATE TABLE IF NOT EXISTS directory_reviews (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  target_guild_id      TEXT NOT NULL,
  reviewer_discord_id  TEXT NOT NULL,
  stars                INTEGER NOT NULL,
  review_text          TEXT NOT NULL DEFAULT '',
  message_id           TEXT,
  posted_at            INTEGER NOT NULL,
  UNIQUE(target_guild_id, reviewer_discord_id)
);

-- Coarse playtime accrual (Verified Reviews gate) - incremented by the same
-- background tick that already polls each registered server's playerlist
-- for telemetry, so this is "free" rather than a second RCON poll loop.
-- Granularity is only as fine as that tick's interval, which is fine for a
-- one-time "have they logged 10+ minutes ever" threshold check.
CREATE TABLE IF NOT EXISTS directory_playtime (
  guild_id      TEXT NOT NULL,
  gamertag      TEXT NOT NULL,
  minutes       REAL NOT NULL DEFAULT 0,
  last_seen_at  INTEGER,
  PRIMARY KEY (guild_id, gamertag)
);

-- Cross-server Staff Recruitment Hub (/staff-post) - posted by a server
-- owner FROM their own guild, but the listing itself lives in the hub
-- guild's #staff-recruitment channel (same hub-guild pattern as the
-- Directory). Deliberately named staff_listings/staff_network_applications
-- rather than reusing staff_positions/staff_applications - those are a
-- completely different, pre-existing PER-GUILD "apply to be staff on this
-- one server" feature (see utils/staffApplications.js); this is the
-- network-wide "recruit staff across KOBA Bot servers" feature instead.
CREATE TABLE IF NOT EXISTS staff_listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,   -- the posting server (their own guild, not the hub)
  posted_by     TEXT NOT NULL,
  position_name TEXT NOT NULL,
  description   TEXT NOT NULL,
  requirements  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  channel_id    TEXT,   -- hub channel this listing's post lives in
  message_id    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_network_applications (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id          INTEGER NOT NULL,
  applicant_discord_id TEXT NOT NULL,
  experience          TEXT NOT NULL,
  submitted_at        INTEGER NOT NULL,
  UNIQUE(listing_id, applicant_discord_id)
);

-- Per-map RCON connections for Multi-Server Cluster guilds - strictly
-- additive on top of guild_meta.rcon_host/port/password (the guild's single
-- "default" connection, untouched by this table and still what every
-- existing getRcon(guildId) call site uses unless it also passes a
-- server_name). A guild with no rows here just has one server (default ==
-- its only server, Global == Local). One that links additional maps here
-- gets a true Global (sum of default + every row) vs Local (one specific
-- map) distinction. player_count_channel_id is that ONE map's own
-- "🌐-playercount-⏰-playerque" voice channel inside its Cluster category.
CREATE TABLE IF NOT EXISTS guild_servers (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id                 TEXT NOT NULL,
  server_name              TEXT NOT NULL,
  rcon_host                TEXT NOT NULL,
  rcon_port                INTEGER NOT NULL,
  rcon_password            TEXT NOT NULL,
  player_count_channel_id  TEXT,
  kill_feed_channel_id     TEXT, -- this map's own local killfeed channel - see utils/killFeed.js
  created_at               INTEGER NOT NULL,
  UNIQUE(guild_id, server_name)
);

-- Playtime coin-earning (/coin-earn-config) - one row per (guild, gamertag)
-- currently/recently online, tracking position so the earning tick can tell
-- "actually playing" from "connected but AFK". A player whose position
-- hasn't moved past afk_kick_minutes gets RCON-kicked (configurable) and
-- skipped for that cycle's coin award - the whole anti-farm mechanism.
CREATE TABLE IF NOT EXISTS playtime_tracking (
  guild_id            TEXT NOT NULL,
  gamertag            TEXT NOT NULL,
  last_x              REAL,
  last_z              REAL,
  last_moved_at       INTEGER,
  last_coin_award_at  INTEGER,
  PRIMARY KEY (guild_id, gamertag)
);

-- Frank (mascot/helper persona) FAQ entries, see utils/frank.js. Staff-authored
-- via /frank-faq; keywords is a comma-separated lowercase list matched as
-- plain substrings against message content in the guild's configured
-- frank_channel_id (guild_meta) - no fuzzy matching, deliberately simple.
CREATE TABLE IF NOT EXISTS frank_faq (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  keywords     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  link         TEXT,
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- Lootboxes (/lootbox-config, /lootbox) - box art/labels are a fixed global
-- list (config/lootboxes.js), but what's actually IN a box is per-guild.
-- reward_type/reward_ref/amount mirror utils/rewardDelivery.js's existing
-- shop/auction reward shape exactly (item|role|temp_role|kit|material) so
-- delivery logic is shared, not reinvented. weight is relative (not a
-- percentage) - a reward with weight 10 is 2x as likely as one with weight 5.
CREATE TABLE IF NOT EXISTS lootbox_rewards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  box_key       TEXT NOT NULL,
  reward_type   TEXT NOT NULL,   -- item | role | temp_role | kit | material
  reward_ref    TEXT NOT NULL,   -- item shortName | role ID | kit name | material shortName
  amount        REAL NOT NULL DEFAULT 1,  -- item/material quantity, or temp_role hours
  weight        INTEGER NOT NULL DEFAULT 1,
  display_name  TEXT NOT NULL,
  image_url     TEXT,
  created_at    INTEGER NOT NULL
);

-- One row per (guild, box) once an admin configures it - absence means that
-- box isn't openable yet (deliberately not defaulted, so a half-configured
-- box with no rewards can't accidentally take someone's coins). win_rate is
-- a 0-100 percentage chance of winning ANYTHING at all - failing that roll
-- is a loss regardless of the reward pool's own weights (which only decide
-- WHICH reward, conditional on already having won).
CREATE TABLE IF NOT EXISTS lootbox_settings (
  guild_id     TEXT NOT NULL,
  box_key      TEXT NOT NULL,
  currency_id  INTEGER NOT NULL,
  min_bet      REAL NOT NULL,
  max_bet      REAL NOT NULL,
  win_rate     INTEGER NOT NULL DEFAULT 50,  -- 0-100
  PRIMARY KEY (guild_id, box_key)
);

-- A win doesn't auto-deliver - it creates a pending claim the player must
-- press "Open" (reveals what they won) then "Claim" (actually delivers it)
-- to collect, rather than everything happening in one step. opened_at/
-- claimed_at are separate timestamps so partially-completed claims (opened
-- but never claimed) are distinguishable from untouched ones.
CREATE TABLE IF NOT EXISTS lootbox_pending_claims (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  box_key      TEXT NOT NULL,
  reward_id    INTEGER NOT NULL,
  wager        REAL NOT NULL,
  server_name  TEXT,  -- which linked map's RCON delivers this (see database/guild_servers) - NULL = the guild's single default connection
  created_at   INTEGER NOT NULL,
  opened_at    INTEGER,
  claimed_at   INTEGER
);

-- The Defuse Wire (/games-panel) - one game per guild (unlike lootbox's
-- multiple box "flavors"), so settings are keyed by guild_id alone. Fixed
-- game rules (4 wires: 2 safe, 1 multiplier, 1 bomb; 2x multiplier) are NOT
-- admin-configurable on purpose - only the currency/bet range are, so the
-- actual odds/house-edge stay consistent and can't be misconfigured into
-- something unfair.
CREATE TABLE IF NOT EXISTS defuse_wire_settings (
  guild_id     TEXT PRIMARY KEY,
  currency_id  INTEGER NOT NULL,
  min_bet      REAL NOT NULL,
  max_bet      REAL NOT NULL
);

-- The wager is charged and the pool is credited to the DB row (not the
-- player's wallet) the moment a run starts - kept as a real row (not
-- in-memory state) specifically so a bot restart mid-run can never strand a
-- player's already-charged wager with no way to resolve it; a stuck
-- 'active' row just sits there until they resume or staff investigates,
-- rather than silently vanishing. wire_outcomes is the current round's
-- fixed [safe,safe,multiplier,bomb] (shuffled) assignment, one JSON array
-- per row - decided server-side the moment the round is shown, never
-- re-rolled on click, so a client can't get a different outcome by
-- retrying the same button press.
CREATE TABLE IF NOT EXISTS defuse_wire_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  discord_id        TEXT NOT NULL,
  currency_id       INTEGER NOT NULL,
  wager             REAL NOT NULL,
  pool              REAL NOT NULL,
  rounds_survived   INTEGER NOT NULL DEFAULT 0,
  wire_outcomes     TEXT NOT NULL,  -- JSON array of 4: "safe" | "multiplier" | "bomb"
  status            TEXT NOT NULL DEFAULT 'active',  -- active | cashed_out | exploded
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_defuse_wire_runs_active ON defuse_wire_runs (guild_id, discord_id, status);

-- The Grid Minefield (/games-panel) - same shape/reasoning as Defuse Wire
-- above (one game per guild, fixed odds not admin-configurable, a real row
-- instead of in-memory state so a bot restart can't strand a charged
-- wager). Fixed grid: 16 cells (4x4), 3 traps / 13 stars, each star
-- multiplies the pool - see utils/gridMinefield.js's constants.
CREATE TABLE IF NOT EXISTS grid_minefield_settings (
  guild_id     TEXT PRIMARY KEY,
  currency_id  INTEGER NOT NULL,
  min_bet      REAL NOT NULL,
  max_bet      REAL NOT NULL
);

-- Treasure Slots (utils/treasureSlots.js) - a single-spin game, unlike
-- Grid Minefield/Tower Climb's multi-step cash-out-anytime runs, so there's
-- no persisted "run" row - a spin resolves fully within one interaction,
-- same settings-only shape as Target Range. Reel odds/payout table are
-- fixed code (config/treasureSlots.js), not admin-configurable, same
-- "don't let odds be misconfigured into something unfair" reasoning as
-- Grid Minefield's own fixed trap count.
CREATE TABLE IF NOT EXISTS treasure_slots_settings (
  guild_id     TEXT PRIMARY KEY,
  currency_id  INTEGER NOT NULL,
  min_bet      REAL NOT NULL,
  max_bet      REAL NOT NULL
);

-- cell_states is the fixed (never re-rolled) JSON array of 16 "trap"/"star"
-- assignments for this run, decided the moment the wager is placed.
-- revealed is the JSON array of cell indexes already clicked, in order -
-- used both to redraw already-revealed cells as disabled/marked buttons
-- and to reject a stale double-click on an already-revealed cell.
CREATE TABLE IF NOT EXISTS grid_minefield_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  discord_id        TEXT NOT NULL,
  currency_id       INTEGER NOT NULL,
  wager             REAL NOT NULL,
  pool              REAL NOT NULL,
  cell_states       TEXT NOT NULL,  -- JSON array of 16: "trap" | "star"
  revealed          TEXT NOT NULL DEFAULT '[]',  -- JSON array of revealed cell indexes, in click order
  status            TEXT NOT NULL DEFAULT 'active',  -- active | cashed_out | exploded
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grid_minefield_runs_active ON grid_minefield_runs (guild_id, discord_id, status);

-- Tower Climb (/games-panel) - same shape/reasoning as Defuse Wire and Grid
-- Minefield above (one game per guild, a real row instead of in-memory state
-- so a bot restart can't strand a charged wager, no expiration - a stuck
-- 'active' row just sits there until resumed, matching both sibling games).
-- Floor risk/multiplier progression is a FIXED game rule (see
-- utils/towerClimb.js's FLOOR_TABLE and its house-edge derivation comment),
-- NOT admin-configurable, for the same reason Defuse Wire's wire ratio and
-- Grid Minefield's trap count aren't - only currency/bet range are.
CREATE TABLE IF NOT EXISTS tower_climb_settings (
  guild_id     TEXT PRIMARY KEY,
  currency_id  INTEGER NOT NULL,
  min_bet      REAL NOT NULL,
  max_bet      REAL NOT NULL
);

-- current_floor is 0 before the first climb attempt (player is standing at
-- the bottom, hasn't resolved Floor 1 yet); becomes 1..MAX_FLOORS once a
-- floor is successfully survived, at which point `pool` reflects that
-- floor's multiplier applied to the wager. Cash Out is only offered once
-- current_floor >= 1 (nothing to cash out before surviving a floor).
CREATE TABLE IF NOT EXISTS tower_climb_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  discord_id        TEXT NOT NULL,
  currency_id       INTEGER NOT NULL,
  wager             REAL NOT NULL,
  pool              REAL NOT NULL,
  current_floor     INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',  -- active | cashed_out | failed
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tower_climb_runs_active ON tower_climb_runs (guild_id, discord_id, status);

-- The Co-op Vault Heist (/games-panel Configure only - NOT a per-player
-- wager game a player picks from Play, see utils/vaultHeist.js's header
-- comment) - a periodic ambient server event instead: kobabot drops a
-- "Locked Vault" post in a public channel with a shared HP pool everyone
-- can attack (no wager - free to participate), splits a reward pool among
-- everyone who dealt damage once it cracks, with a bonus for whoever dealt
-- the most.
CREATE TABLE IF NOT EXISTS vault_heist_settings (
  guild_id            TEXT PRIMARY KEY,
  channel_id          TEXT,
  currency_id         INTEGER,
  interval_hours      REAL NOT NULL DEFAULT 4,
  target_hp           INTEGER NOT NULL DEFAULT 5000,
  cooldown_seconds    INTEGER NOT NULL DEFAULT 30,
  min_damage          INTEGER NOT NULL DEFAULT 50,
  max_damage          INTEGER NOT NULL DEFAULT 200,
  reward_pool_amount  REAL NOT NULL DEFAULT 1000,
  top_damager_bonus   REAL NOT NULL DEFAULT 200,
  last_spawned_at     INTEGER
);

-- At most one active vault per guild at a time (checked in app logic, not a
-- unique index - a guild legitimately has zero or one, and check-then-
-- insert is simpler here than a partial unique index in SQLite).
CREATE TABLE IF NOT EXISTS vault_heist_active (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT,
  max_hp        INTEGER NOT NULL,
  current_hp    INTEGER NOT NULL,
  started_at    INTEGER NOT NULL
);

-- Per-vault (not per-guild) so every new vault starts everyone's
-- cooldown/contribution fresh - last_action_at is this player's own
-- cooldown gate, shared across all three attack actions (breach/hack/c4)
-- so cycling between buttons can't bypass it.
CREATE TABLE IF NOT EXISTS vault_heist_damage (
  vault_id        INTEGER NOT NULL,
  discord_id      TEXT NOT NULL,
  damage          INTEGER NOT NULL DEFAULT 0,
  last_action_at  INTEGER,
  PRIMARY KEY (vault_id, discord_id)
);

-- The Scrap Merchant. Not a wager game like the others above - players
-- don't bet anything here. Instead, a winning payout from Lootbox/The
-- Defuse Wire/The Grid Minefield has a chance (drop_chance_pct) to also
-- award a random junk item (weighted by each scrap_items row's
-- drop_weight) into the player's persistent inventory below; they bring it
-- to the merchant whenever they want to sell for coins, either one item
-- type at a time or their whole inventory in one shot. currency_id is
-- which currency the merchant pays out in - separate from any of the
-- wager games' own currency choice, since a guild could plausibly want
-- scrap sold for a different coin than what's wagered elsewhere.
CREATE TABLE IF NOT EXISTS scrap_merchant_settings (
  guild_id            TEXT PRIMARY KEY,
  currency_id         INTEGER,
  drop_chance_pct     REAL NOT NULL DEFAULT 10,
  max_inventory_items INTEGER NOT NULL DEFAULT 50
);

-- Admin-defined junk item catalog. price_mode "fixed" always pays
-- fixed_price per unit; "random" rolls an independent price between
-- min_price/max_price for EACH unit sold (not once for the whole stack) -
-- keeps the "merchant haggles" feel consistent whether you sell one or a
-- hundred at once.
CREATE TABLE IF NOT EXISTS scrap_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  emoji        TEXT,
  price_mode   TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' | 'random'
  fixed_price  REAL NOT NULL DEFAULT 0,
  min_price    REAL NOT NULL DEFAULT 0,
  max_price    REAL NOT NULL DEFAULT 0,
  drop_weight  INTEGER NOT NULL DEFAULT 1, -- relative odds vs other enabled items when a bonus drop rolls
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);

-- Persistent per-player junk inventory - quantity 0 means "doesn't hold
-- any" and the row is deleted rather than kept, same convention as
-- shop_cart_items above. Total quantity across all item rows is checked
-- against scrap_merchant_settings.max_inventory_items before a new bonus
-- drop is added; over the cap just silently skips the drop rather than
-- erroring (the player still keeps their normal game payout either way).
CREATE TABLE IF NOT EXISTS player_scrap_inventory (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  item_id     INTEGER NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, discord_id, item_id)
);

-- ---------------------------------------------------------------------------
-- The Ticket Jackpot (utils/ticketJackpot.js) - /play-flow picked wager game
-- (config/games.js key "jackpot", modes: ["solo"], same as Lootbox) backed
-- by a SHARED per-guild progressive pool, not a per-player pool like every
-- other wager game. Three fixed ticket tiers (base/elite/vip), admin-priced
-- and admin-emoji'd via jackpot_settings' CSV fields (parsed in
-- utils/ticketJackpot.js, never re-parsed ad hoc elsewhere). Entry closes
-- the instant pool_amount reaches max_pool_ceiling (checked immediately
-- after each buy, inside the same request - no separate background tick
-- needed, same "resolve inline" approach as utils/vaultHeist.js's
-- resolveVaultCracked) and the pot is drawn (weighted by ticket_count) and
-- paid out per prize_splits before a fresh pot opens automatically.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jackpot_settings (
  guild_id           TEXT PRIMARY KEY,
  currency_id        INTEGER,
  base_price         REAL NOT NULL DEFAULT 10,
  elite_price        REAL NOT NULL DEFAULT 50,
  vip_price          REAL NOT NULL DEFAULT 200,
  base_emoji         TEXT NOT NULL DEFAULT '🎫',
  elite_emoji        TEXT NOT NULL DEFAULT '🎟️',
  vip_emoji          TEXT NOT NULL DEFAULT '💎',
  max_pool_ceiling   REAL NOT NULL DEFAULT 10000,
  prize_splits       TEXT NOT NULL DEFAULT '70,20,10' -- CSV of % per place, place count = split count (place 1 first)
);

-- At most one open pot per guild at a time (app-level check-then-insert,
-- same convention as vault_heist_active's header comment on why this isn't
-- a partial unique index in SQLite).
CREATE TABLE IF NOT EXISTS jackpot_active (
  guild_id       TEXT PRIMARY KEY,
  pool_amount    REAL NOT NULL DEFAULT 0,
  total_tickets  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open', -- 'open' | 'frozen' (ceiling hit, resolving)
  started_at     INTEGER NOT NULL
);

-- Aggregated per-player, per-tier ticket counts for the CURRENT pot only -
-- wiped (not archived) the instant that pot is drawn, since a new pot
-- starts every player back at zero tickets by design (spec: "pool scales
-- live with entries").
CREATE TABLE IF NOT EXISTS jackpot_tickets (
  guild_id      TEXT NOT NULL,
  discord_id    TEXT NOT NULL,
  tier          TEXT NOT NULL, -- 'base' | 'elite' | 'vip'
  ticket_count  INTEGER NOT NULL DEFAULT 0,
  spent         REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, discord_id, tier)
);

-- ---------------------------------------------------------------------------
-- The Bradley APC Ambush (utils/bradleyAmbush.js) - ambient co-op event,
-- NOT a per-player wager picked from Play (config/games.js key
-- "bradley_ambush", modes: [], configureOnly: true) - same shape as The
-- Co-op Vault Heist (vault_heist_*), just with two phases (check-in then
-- combat) instead of one, and a real in-game RCON side-effect on
-- resolution (bradley.quickrespawn - see docs/RUST_CONSOLE_RCON_REFERENCE.md).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bradley_ambush_settings (
  guild_id                TEXT PRIMARY KEY,
  channel_id              TEXT,
  currency_id             INTEGER,
  interval_hours          REAL NOT NULL DEFAULT 0, -- 0 = manual-trigger only (staff's "Trigger Now" button), never auto-spawns
  entry_fee               REAL NOT NULL DEFAULT 0,
  checkin_minutes         REAL NOT NULL DEFAULT 3,
  combat_minutes          REAL NOT NULL DEFAULT 15,
  max_hp                  INTEGER NOT NULL DEFAULT 1000,
  action_cooldown_seconds INTEGER NOT NULL DEFAULT 5,
  armor_crack_seconds     INTEGER NOT NULL DEFAULT 45,
  loot_kit_name           TEXT, -- a kit_registry display_name (see /kit-panel) delivered to every participant who dealt damage, via utils/rewardDelivery.js - null = currency-only payout
  mvp_bonus_amount        REAL NOT NULL DEFAULT 500,
  last_spawned_at         INTEGER
);

CREATE TABLE IF NOT EXISTS bradley_ambush_active (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id            TEXT NOT NULL,
  channel_id          TEXT NOT NULL,
  message_id          TEXT,
  phase               TEXT NOT NULL DEFAULT 'checkin', -- 'checkin' | 'combat' | 'resolved'
  current_hp          INTEGER NOT NULL,
  max_hp              INTEGER NOT NULL,
  armor_cracked_until INTEGER NOT NULL DEFAULT 0, -- unix ms, 0/past = armor debuff not active
  checkin_ends_at     INTEGER NOT NULL,
  combat_ends_at      INTEGER,
  started_at          INTEGER NOT NULL
);

-- Check-in roster - staked entry_fee already deducted on insert (refunded
-- back out if the check-in window closes with zero HP damage dealt/event
-- cancelled for lack of interest).
CREATE TABLE IF NOT EXISTS bradley_ambush_participants (
  ambush_id   INTEGER NOT NULL,
  discord_id  TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (ambush_id, discord_id)
);

-- Per-player cooldown is shared across Shrapnel Charge/HV Rocket/Plant C4
-- (same "cycling between buttons can't bypass it" reasoning as
-- vault_heist_damage.last_action_at).
CREATE TABLE IF NOT EXISTS bradley_ambush_damage (
  ambush_id       INTEGER NOT NULL,
  discord_id      TEXT NOT NULL,
  damage          INTEGER NOT NULL DEFAULT 0,
  last_action_at  INTEGER,
  PRIMARY KEY (ambush_id, discord_id)
);

-- ---------------------------------------------------------------------------
-- The Recycler Roulette (utils/recyclerRoulette.js) - /play-flow solo wager
-- game (config/games.js key "recycler_roulette", modes: ["solo"]). The
-- whole round (loading-bar loop, Pull Early window, resolution) plays out
-- entirely inside ONE ephemeral interaction's edit window (Discord's own
-- ~15-minute interaction-token validity, same boundary every other
-- ephemeral flow in this codebase already lives within) - the DB row below
-- exists so a wager is never silently lost mid-loop (never in-memory-only
-- money), not to support resuming the animation itself across a bot
-- restart. If a restart interrupts a 'running' row with no live interval
-- left in memory, utils/recyclerRoulette.js's startOrResume refunds the
-- wager and closes it - see that file's header comment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recycler_roulette_settings (
  guild_id     TEXT PRIMARY KEY,
  currency_id  INTEGER,
  min_bet      REAL NOT NULL DEFAULT 10,
  max_bet      REAL NOT NULL DEFAULT 500
);

CREATE TABLE IF NOT EXISTS recycler_roulette_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  currency_id  INTEGER NOT NULL,
  wager        REAL NOT NULL,
  tier         TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'safe' | 'hazard' | 'launch'
  status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'won' | 'lost' | 'pulled'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recycler_roulette_runs_active ON recycler_roulette_runs (guild_id, discord_id, status);

-- ---------------------------------------------------------------------------
-- The Target Range (utils/targetRange.js) - /play-flow solo wager game
-- (config/games.js key "target_range", modes: ["solo"]), same "lives inside
-- one ephemeral interaction's edit window" reasoning as Recycler Roulette
-- above for the shuffle-loop itself; target_range_scores is the durable
-- part (best-ever score per player, feeding the existing standings
-- leaderboard image in utils/categoryLeaderboards.js's
-- runStandingsLeaderboardImageTick rather than a new leaderboard system).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS target_range_settings (
  guild_id             TEXT PRIMARY KEY,
  currency_id          INTEGER,
  entry_fee            REAL NOT NULL DEFAULT 20,
  grid_size            INTEGER NOT NULL DEFAULT 3, -- 3 (3x3) or 4 (4x4)
  shuffle_interval_ms  INTEGER NOT NULL DEFAULT 1500,
  round_seconds        INTEGER NOT NULL DEFAULT 30,
  loot_table           TEXT NOT NULL DEFAULT '0:0,10:50,25:150,50:400' -- CSV of "minScore:payout" tiers, highest qualifying tier wins (see utils/targetRange.js's resolvePayout)
);

CREATE TABLE IF NOT EXISTS target_range_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  discord_id      TEXT NOT NULL,
  currency_id     INTEGER NOT NULL,
  entry_fee       REAL NOT NULL,
  grid_size       INTEGER NOT NULL,
  score           INTEGER NOT NULL DEFAULT 0,
  multiplier      INTEGER NOT NULL DEFAULT 1,
  target_index    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'done'
  round_ends_at   INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_target_range_runs_active ON target_range_runs (guild_id, discord_id, status);

-- Best-ever score per player - one row per (guild, player), only ever
-- overwritten when a new run beats it, same "best_streak never drops"
-- convention as pvp_streaks.best_streak.
CREATE TABLE IF NOT EXISTS target_range_scores (
  guild_id      TEXT NOT NULL,
  discord_id    TEXT NOT NULL,
  best_score    INTEGER NOT NULL DEFAULT 0,
  achieved_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);

-- ---------------------------------------------------------------------------
-- Cargo Ship Heist (utils/cargoShipHeist.js) - ambient multiplayer/PvP event
-- (config/games.js key "cargo_ship_heist", modes: [], configureOnly: true),
-- same shape family as The Co-op Vault Heist/The Bradley APC Ambush: a
-- public lobby window, then a round-based state machine ticked from
-- utils/backgroundLoops.js rather than resolved inline (each round's
-- control-% snapshot needs to land on a wall-clock cadence regardless of
-- whether anyone clicks a button that round, unlike Vault Heist/Bradley
-- Ambush which only ever change state in response to a click).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargo_ship_heist_settings (
  guild_id                     TEXT PRIMARY KEY,
  channel_id                   TEXT,
  currency_id                  INTEGER,
  interval_hours               REAL NOT NULL DEFAULT 0, -- 0 = manual-trigger only, same convention as bradley_ambush_settings
  entry_fee                    REAL NOT NULL DEFAULT 100,
  lobby_minutes                REAL NOT NULL DEFAULT 5,
  round_seconds                INTEGER NOT NULL DEFAULT 30,
  rounds_total                 INTEGER NOT NULL DEFAULT 10,
  grand_prize_amount           REAL NOT NULL DEFAULT 5000,
  smoke_block_seconds          INTEGER NOT NULL DEFAULT 15,
  flank_steal_pct              REAL NOT NULL DEFAULT 5,
  last_spawned_at              INTEGER
);

CREATE TABLE IF NOT EXISTS cargo_ship_heist_active (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  channel_id      TEXT NOT NULL,
  message_id      TEXT,
  phase           TEXT NOT NULL DEFAULT 'lobby', -- 'lobby' | 'combat' | 'resolved'
  current_round   INTEGER NOT NULL DEFAULT 0,
  lobby_ends_at   INTEGER NOT NULL,
  round_ends_at   INTEGER,
  started_at      INTEGER NOT NULL
);

-- One row per boarded entrant - deliberately individual (discord_id), not
-- team-grouped: an entrant's teams.clan_tag (if rostered) is resolved live
-- for DISPLAY only (see utils/cargoShipHeist.js's deckStandingLines), same
-- "point-in-time clan snapshot is for combat/war attribution, current
-- clan_tag is fine for cosmetic display" split already drawn between
-- combatEvents.js and rivalSystem.js elsewhere in this codebase.
CREATE TABLE IF NOT EXISTS cargo_ship_heist_entrants (
  heist_id          INTEGER NOT NULL,
  discord_id        TEXT NOT NULL,
  control_pct       REAL NOT NULL DEFAULT 0,
  control_duration  REAL NOT NULL DEFAULT 0, -- sum of control_pct accumulated across every completed round - the actual win condition (spec: "most total control-duration")
  smoke_blocked_until INTEGER NOT NULL DEFAULT 0,
  defending_round     INTEGER NOT NULL DEFAULT 0, -- current_round value this entrant last pressed Defend Area on (0 = not defending this round)
  acted_round         INTEGER NOT NULL DEFAULT 0, -- current_round value this entrant last used ANY of the 3 action buttons on - one action per entrant per round, same "one real decision per round" granularity the round-based state machine itself implies
  joined_at         INTEGER NOT NULL,
  PRIMARY KEY (heist_id, discord_id)
);

-- Owner-saved reusable server layouts (/save-template, /my-templates) -
-- a snapshot of roles/categories/channels (same shape as /server-backup's
-- structure section, see utils/serverStructure.js) an owner builds by hand
-- and wants to reuse later, on this server or a different one they own.
-- Scoped to owner_discord_id (not guild_id) on purpose - the whole point is
-- reusing a layout across servers the same person owns, not just this one.
-- Distinct from config/templates.js's built-in TEMPLATES (which use a
-- richer schema tied to KOBA Bot's own managed-panel content) - these are
-- plain structure only, no KOBA Bot panel injection.
CREATE TABLE IF NOT EXISTS custom_templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_discord_id  TEXT NOT NULL,
  name              TEXT NOT NULL,
  data              TEXT NOT NULL, -- JSON: { roles, categories, uncategorizedChannels } - see utils/serverStructure.js
  created_at        INTEGER NOT NULL,
  UNIQUE (owner_discord_id, name)
);

-- Multiple positions per directional teleport bind (AutoKit Wizard ->
-- Teleport Settings) - when more than one is set for a direction, a
-- teleporting player's destination is chosen at random from the set (e.g.
-- spreading players across several entrances to the same event instead of
-- always landing everyone in the exact same spot). Supersedes the older
-- single-position teleport_waypoints table above (left in place, unused,
-- as a harmless historical record - db.js copies any of its rows in here
-- once on first boot after this table existed).
CREATE TABLE IF NOT EXISTS teleport_positions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  direction   TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  set_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teleport_positions_lookup ON teleport_positions (guild_id, direction);

-- Combat lock (AutoKit Wizard -> Teleport Settings) - a player who was just
-- involved in a kill (either side - killer or victim) has ALL teleports
-- (directional binds AND TP Home, every path funnels through
-- utils/homeTeleport.js's teleportPlayerToPosition) blocked for
-- guild_meta.combat_lock_seconds. Keyed by gamertag, not discord_id -
-- that's what killfeed events and every teleport path already resolve to
-- before attempting a teleport, so no extra lookup is needed at either end.
CREATE TABLE IF NOT EXISTS combat_locks (
  guild_id    TEXT NOT NULL,
  gamertag    TEXT NOT NULL,
  locked_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, gamertag)
);

-- Manual multi-license grants (/activate-user, admin dashboard) - separate
-- from premium_users (which models a single Stripe subscription = exactly
-- one active license per discord_id, correct for automated billing since a
-- Stripe customer only ever has one subscription). This table lets an
-- admin grant the SAME Discord user several INDEPENDENT licenses at once
-- (e.g. 5 separate Pro tokens so they can run Pro on 5 different servers
-- they own simultaneously, not just one license moved around via
-- /transfer). expires_at NULL = lifetime (never expires). A guild counts
-- as authorized if EITHER this table OR premium_users has a currently
-- valid, unrevoked license claimed by (or claimable for) it - see
-- database/db.js's getActiveLicenseForGuild.
CREATE TABLE IF NOT EXISTS manual_license_grants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id      TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'pro', -- 'pro' | 'max' - both currently unlock the exact same features, plan only distinguishes billing/display
  expires_at      INTEGER,                     -- NULL = lifetime
  active_guild_id TEXT,                        -- NULL until claimed by a guild
  granted_by      TEXT NOT NULL,
  note            TEXT,                        -- optional admin label, e.g. "5-pack for KOBA network"
  revoked_at      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_license_grants_discord ON manual_license_grants (discord_id);
CREATE INDEX IF NOT EXISTS idx_manual_license_grants_guild ON manual_license_grants (active_guild_id);

-- Entity Spawning (2026-09-06, commands/spawn.js) - saved coordinates for
-- repeat spawns, and optional auto-respawn on a timer. Modeled after a
-- competitor bot's equivalent feature. entity_key is free text (whatever
-- was typed/chosen at save time) since /spawn accepts BOTH a curated
-- dropdown (config/entitySpawns.js) and a manually-typed shortname, same as
-- the competitor's "Or enter shortname manually" fallback.
CREATE TABLE IF NOT EXISTS entity_spawn_locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  label       TEXT NOT NULL,
  entity_key  TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_spawn_locations_guild ON entity_spawn_locations (guild_id);

-- Re-spawns entity_key at (x,y,z) every interval_minutes - see
-- utils/backgroundLoops.js's runEntityRespawnTick. last_spawned_at NULL
-- means "due immediately, never spawned yet"; a failed RCON attempt
-- deliberately leaves it unset so the next tick retries instead of the
-- schedule silently drifting forward on a transient outage.
CREATE TABLE IF NOT EXISTS entity_respawn_groups (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT NOT NULL,
  label             TEXT NOT NULL,
  entity_key        TEXT NOT NULL,
  x                 REAL NOT NULL,
  y                 REAL NOT NULL,
  z                 REAL NOT NULL,
  interval_minutes  INTEGER NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_spawned_at   INTEGER,
  created_by        TEXT NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_respawn_groups_guild ON entity_respawn_groups (guild_id);

-- Website Messages feature (added 2026-09-08, replacing the "coming soon"
-- tab-bar stub) - direct messages between two KOBA Bot ID holders (see
-- boom_identities). Deliberately keyed on boom_id, not discord_id - a
-- KOBA Bot ID is the cross-guild, platform-agnostic identity this whole
-- system already treats as "a real, verified player/business", matching
-- the "only KOBA Bot ID holders can message" requirement without any new
-- verification concept. One row per unique PAIR of boom_ids - id is the
-- two boom_ids sorted alphabetically and joined with "::" (see
-- db.js's conversationIdFor), so looking up a conversation from EITHER
-- participant's side always resolves to the same row instead of two
-- separate ones depending on who messaged first.
CREATE TABLE IF NOT EXISTS dm_conversations (
  id               TEXT PRIMARY KEY,
  boom_id_a        TEXT NOT NULL,
  boom_id_b        TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  last_message_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_a ON dm_conversations (boom_id_a);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_b ON dm_conversations (boom_id_b);

-- read_at is per-CONVERSATION-per-reader, not per-message - see
-- db.js's markDmConversationRead (marks every message the OTHER
-- participant sent, up through "now", as read in one statement, matching
-- how every other messaging inbox's "seen" state behaves - not tracked
-- per individual message bubble).
CREATE TABLE IF NOT EXISTS dm_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  TEXT NOT NULL,
  sender_boom_id   TEXT NOT NULL,
  body             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  read_at          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON dm_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS message_styles (
  style_id     TEXT PRIMARY KEY,
  style_name   TEXT NOT NULL,
  embed_data   TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Install approval gate (2026-10-13, per explicit owner request): a
-- Discord OAuth invite link is inherently shareable/leakable, so hiding it
-- on the landing page alone can't actually stop an uninvited server from
-- adding the bot. This table is the real enforcement point - events/
-- guildCreate.js checks it on every join and self-leaves any guild that
-- isn't listed here (official guilds from OFFICIAL_GUILD_IDS are exempt,
-- not tracked here).
CREATE TABLE IF NOT EXISTS approved_guilds (
  guild_id     TEXT PRIMARY KEY,
  approved_by  TEXT NOT NULL,      -- Discord ID of the bot owner who approved it
  note         TEXT,
  approved_at  INTEGER NOT NULL
);

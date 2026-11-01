# KOBA Bot

An advanced, fully automated Clan/Team War Event Manager and Roster Commander for **Rust Console Edition**, controlled via WebRCON. Built on Discord.js v14.

## What it does

- **Per-account licensing**: premium status is tied to a Discord *user* account (the guild owner), not the server - a subscriber can move KOBA Bot between servers freely.
- **Auto-provisioning**: on join (for premium-owned servers), creates the roles/channels/dashboard automatically.
- **Interactive war terminal**: buttons + dropdowns for inventory, crafting, and launching bombs - no typed commands needed for day-to-day play.
- **Rank & fireteam management**: full E1-E9/Admin hierarchy, dynamically scaled to your team's max roster size.
- **Virtual crafting economy**: material stockpiles, a one-slot-at-a-time crafting queue, and automated monument-zone capture rewards.
- **5 bomb variants**: Chemical, EMP, Radiation, Spawn-Denial, Black Hole - each with real RCON detonation loops.
- **Live admin overrides**: `/set-config`, `/reset-queue`, `/give-material` - no restart required.

## Requirements

- Node.js 18+
- A Discord bot application (Discord Developer Portal) with the **Server Members Intent** enabled
- A Rust Console Edition server with WebRCON enabled and reachable from wherever KOBA Bot runs

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID, used to register slash commands |
| `BOT_OWNER_IDS` | Comma-separated Discord user IDs allowed to run `/activate-user` and other admin-restricted commands |
| `RCON_HOST` / `RCON_PORT` / `RCON_PASSWORD` | WebRCON connection details for the Rust server |
| `DB_PATH` | SQLite file location (defaults to `./database/kobabot.sqlite`) |

Register slash commands, then start the bot:

```bash
npm run deploy-commands
npm start
```

## First-run flow

1. Invite KOBA Bot to a server (needs `applications.commands` + `bot` scopes, with Manage Roles/Channels permissions).
2. As a `BOT_OWNER_IDS` account, run `/activate-user user:@ServerOwner duration_days:30` **before or after** inviting - order doesn't matter, the gate re-checks on every interaction.
3. If the server owner wasn't premium at invite time, KOBA Bot posts a warning embed and creates nothing. Once activated, run `/setup` in the server to provision it (or re-invite the bot to re-trigger `guildCreate`).
4. `/setup` creates the **KOBA Bot Admin** / **Faction Leader** roles, the **KOBABOT OPERATIONS** category with `#kobabot-panel`, `#team-management`, `#war-room-logs`, and posts the permanent dashboard.
5. A leader runs `/team-create team_name:Alpha max_team_size:72` to found a team (becomes its top-ranked member automatically).
6. Leaders (Corporal+ rank, "Faction Leader" role, or Manage Server permission) use `/team-invite`, `/team-promote`, `/team-demote`, `/team-kick`, `/assign-fireteam` to build out the roster in `#team-management`.
7. Everyone uses the dashboard buttons in `#kobabot-panel` for Inventory / Craft / Launch.

## Running the site + admin dashboard

KOBA Bot's Discord bot (`npm start`) and its web presence are two separate processes sharing the same SQLite database - the marketing site and the operator dashboard aren't part of the Discord bot process.

```bash
npm run admin
```

This starts one Express server with two halves:

- **`http://localhost:PORT/`** - the public marketing site. Its copy (hero headline, plan name, price, pricing bullets) is read live from the `site_settings` table on every request - there is no static build step, so editing it in the dashboard changes the live page immediately.
- **`http://localhost:PORT/admin`** - the password-gated operator dashboard: install counts, a manual sales ledger (log a sale, optionally activate the buyer's premium in the same step), support tickets (also reachable from Discord via `/support`), and the Site Settings editor that feeds the public page above.

Add to `.env` before running it:

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Password for the `/admin` dashboard - required, the server refuses to start without it |
| `ADMIN_SESSION_SECRET` | Long random string for signing the session cookie - falls back to a hash of `ADMIN_PASSWORD` if unset, but set a real one before exposing this beyond localhost |
| `ADMIN_PORT` | Defaults to `4141` |

To put this on a real domain, put it behind a reverse proxy (Caddy/Nginx) terminating TLS and forwarding to this port - the app itself only speaks plain HTTP.

## Project layout

```
index.js                  entry point - wires commands/events/handlers, starts background loops
deploy-commands.js        registers slash commands with Discord

commands/                 one file per slash command
events/                   discord.js client event handlers (ready, guildCreate, interactionCreate)
config/
  defaults.js              central tunable defaults (seeded into DB, overridable via /set-config)
  ranks.js                 E1-E9/Admin hierarchy + dynamic scaling rules
  bombs.js                 the 5 bomb variant catalog
  materials.js             raw crafting material field list
  adminSettings.js         whitelist of /set-config-editable keys
database/
  schema.sql               SQLite schema
  db.js                    typed data-access layer - all persistence goes through here
rcon/
  rcon.js                  low-level WebRCON client (WebSocket, request/response multiplexing)
  manager.js               shared connection singleton with auto-retry on failure
  parsers.js               best-effort JSON/text parsers for entcount, playerlist, ent auth
utils/
  premium.js               per-account subscription gate
  provisioning.js          Feature 1 - role/channel auto-setup
  dashboard.js             posts/edits the permanent panel message
  kobabotPanel.js          Feature 2 - Inventory/Craft/Launch button+select+modal handlers
  teamAuth.js              leadership/faction-leader/admin clearance checks
  detonation.js            Feature 6 dispatcher - broadcast + effect loop per bomb type
  bombEffects.js           Chemical/EMP/Spawn-Denial/Black Hole RCON effect loops
  radiationWatch.js        Radiation Bomb's stateful coordinate-trap watcher
  craftingQueueTimer.js    awards finished crafting queue items
  zoneCapture.js           monument zone capture tracking + reward
  backgroundLoops.js       single scheduler driving the two loops above

admin/                    separate process (npm run admin) - not required for the bot itself
  server.js                Express app: public site at "/", dashboard at "/admin"
  site.js                  renders the public marketing page from live site_settings
  siteSettingsSchema.js    the editable marketing fields shared by site.js and the settings page
  layout.js                shared dashboard chrome (sidebar, tables, cards, form styles)
  auth.js                  signed-cookie session auth for the dashboard
```

## Known limitations / things to verify against your real server

- **`entcount`/`playerlist`/`ent auth` JSON field names** in `rcon/parsers.js` are a best-effort match to typical Rust WebRCON conventions, written defensively with fallback field names. Log one raw response from your actual server and adjust the parsers if the shapes differ.
- **Per-guild RCON connections** (`rcon/manager.js`): each guild can link its own Rust server via `/link-server`, falling back to a shared env-var connection for guilds that haven't linked one yet.
- **Radiation zone state and zone-capture hold timers are in-memory only** - a bot restart resets an in-progress radiation trap or capture countdown. Acceptable for a live war-tracking feature, but worth knowing.
- **Grid boundaries are hardcoded per map** in `config/defaults.js` (`grid_boundaries`) - update these to match your actual map before relying on Radiation/Black Hole targeting or zone capture.
- **Sales are a manual ledger, not a payment processor.** `/admin/sales` is the source of truth for revenue until something like Stripe is actually wired in to auto-record charges and auto-activate premium via webhook.
- **The admin dashboard has no rate-limiting or 2FA** - it's a single shared password behind a signed cookie, fine for one operator running this themselves, not hardened for a team or public exposure without a reverse proxy adding those.

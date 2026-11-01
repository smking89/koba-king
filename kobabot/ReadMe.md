# KOBA Bot

An advanced, fully automated Clan/Team War Event Manager and Roster Commander for **Rust Console Edition**, controlled via WebRCON. Built on Discord.js v14.

## What it does

- **Per-account licensing**: premium status is tied to a Discord *user* account (the guild owner), not the server - a subscriber can move KOBA Bot between servers freely.
- **Auto-provisioning**: on join (for premium-owned servers), creates the roles/channels/dashboard automatically.
- **Streamlined Player Experience**: dedicated subcommands and intuitive interfaces for shopping, coin economies, and system progression tracking.
- **Rank & fireteam management**: full E1-E9/Admin hierarchy, dynamically scaled to your teams max roster size.
- **Live admin overrides**: clean parent configurations like `/set`, `/config`, and `/setup` — no restart required.

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
| `BOT_OWNER_IDS` | Comma-separated Discord user IDs allowed to run admin-restricted commands |
| `RCON_HOST` / `RCON_PORT` / `RCON_PASSWORD` | WebRCON connection details for the Rust server |
| `DB_PATH` | SQLite file location (defaults to `./database/kobabot.sqlite`) |

Register slash commands, then start the bot:

```bash
npm run deploy-commands
npm start
```

## First-run flow

1. Invite KOBA Bot to a server (needs `applications.commands` + `bot` scopes, with Manage Roles/Channels permissions).
2. Once activated, run `/setup` in the server to provision it (or re-invite the bot to re-trigger `guildCreate`).
3. `/setup` creates the **KOBA Bot Admin** / **Faction Leader** roles, the **KOBABOT OPERATIONS** category with `#kobabot-panel`, `#team-management`, `#war-room-logs`, and posts the permanent dashboard.
4. A leader runs `/team create` to found a team (becomes its top-ranked member automatically).
5. Leaders use team subcommands to build out the roster in `#team-management`.
6. Everyone uses the dashboard buttons for interactive shop, play, and reward claims.

## Running the site + admin dashboard

KOBA Bots Discord bot (`npm start`) and its web presence are two separate processes sharing the same SQLite database - the marketing site and the operator dashboard aren	 part of the Discord bot process.

```bash
npm run admin
```

This starts one Express server with two halves:

- **`http://localhost:PORT/`** - the public marketing site. Its copy is read live from the `site_settings` table on every request.
- **`http://localhost:PORT/admin`** - the password-gated operator dashboard: install counts, a manual sales ledger, support tickets, and the Site Settings editor.

Add to `.env` before running it:

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Password for the `/admin` dashboard - required, the server refuses to start without it |
| `ADMIN_SESSION_SECRET` | Long random string for signing the session cookie |
| `ADMIN_PORT` | Defaults to `4141` |

## Project layout

```
index.js                  entry point - wires commands/events/handlers, starts background loops
deploy-commands.js        registers slash commands with Discord

commands/                 one file per slash command group
events/                   discord.js client event handlers (ready, guildCreate, interactionCreate)
database/
  schema.sql               SQLite schema
  db.js                    typed data-access layer - all persistence goes through here
rcon/
  rcon.js                  low-level WebRCON client (WebSocket, request/response multiplexing)
  manager.js               shared connection singleton with auto-retry on failure
utils/
  premium.js               per-account subscription gate
  provisioning.js          Feature 1 - role/channel auto-setup
  dashboard.js             posts/edits the permanent panel message

admin/                    separate process (npm run admin) - not required for the bot itself
  server.js                Express app: public site at "/", dashboard at "/admin"
```
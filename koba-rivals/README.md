# KOBA

**Swipe-based competitive matchmaking for console and PC games.**

KOBA replaces the group-finding slog with a deck. You swipe through players who match your game,
rank, region and schedule; a mutual pass opens a **rivalry** with a kill-tier challenge attached.
Around that core sit a callouts board, a business console with a self-serve ad portal, and a
developer portal with a working REST runtime, keys, signed webhooks and a playground.

This repository is a **client-only prototype**: a complete, clickable product surface with no
backend behind it. The marketing site, the app and both consoles all run from `npm run dev`.

---

## Quick start

Requires Node 20 or newer (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Vite dev server on port 3000, bound to `0.0.0.0` |
| `npm run build`     | Typecheck, then production build into `dist/`   |
| `npm run preview`   | Serve the production build locally              |
| `npm run typecheck` | `tsc --noEmit`                                  |

---

## What renders where

The product is designed for phones, so the desktop web experience is the site, not the app.

| Route          | Renders                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `/`            | The marketing site on screens ≥ 900px; the app itself below that        |
| `/?app=1`      | The app presented inside a 390 × 800 phone frame, with a way back       |
| `/?embed=1`    | The app bare at phone width — this is what the frame loads              |
| `/?business`   | The business console, full width, behind the business account gate      |
| `/?preview=…`  | A shareable campaign preview, open to anyone holding the link           |

---

## Player app

Mobile screens, reachable at phone width or through `/?app=1`.

- **Discover deck** — a full-bleed card per player: game banner, ringed avatar, rank and RP,
  platform, region, play windows and reliability. Drag or use the pass / rival buttons. Filter by
  game, platform and rank.
- **Rival match** — a mutual pass opens the match moment and adds the player to your rivals.
- **Arena lobby** — the kill-tier ladder: 3 Skirmish, 5 Vendetta, 10 Execution.
- **Board** — post a callout, browse others, open threads and reply. Replies to your own callouts
  raise an unread badge in the navigation until you open that thread.
- **Your card** — edit your profile, upload your own avatar and banner (resized in-browser to 480px
  and 1440px JPEG data URLs).
- **Sponsored cards** — PPC campaigns from the ad portal rotate into the deck, clearly labelled,
  one card after every third swipe.

---

## Business console

Gated behind a business account. Reach it from `/?business` or the rail's business link.

- **Overview** — app-driven joins, rivalries, peak hours and retention.
- **Servers** — register game servers, run diagnostics, feature a placement.
- **Promotion** — featured arenas, sponsored events and VIP perks.
- **Ad portal** — PPC campaigns, reporting, billing and a review step before publishing.
- **Developers** — keys, usage and rate limits, webhooks, reference and a playground.

### Ad portal and PPC

Campaigns are sold on a **max CPC**: impressions are free, a click bills the campaign's bid, and
spend stops at the budget. The console shows estimated clicks and impressions per day from
`estimateDelivery(dailyBudget, cpc)`, and the blended CPC in reporting is derived from real spend
and clicks rather than a placeholder.

Nothing publishes blind. The form ends in **Preview & review**, which opens a modal containing the
actual deck card (the real `SponsoredCard` component, built from the draft), the delivery estimate,
targeting and the exact amount reserved from the wallet.

From that step you can publish **live** or **as paused**. A paused campaign reserves its budget,
appears in the table as paused and serves no cards until you resume it — useful when the creative
still needs client sign-off.

The review step also produces a **shareable preview link**: the creative is base64-encoded into the
URL, so `/?preview=…` renders the real deck card for anyone, with no account and no session. It is
preview only — nothing is live and no budget is reserved.

### Demo business account

The console seeds one account on first sign-in:

```
Email:    ops@rustopia.gg
Password: rivalry2026
```

> Demo convenience, not authentication: there is no server, no OAuth and no real password hashing.

---

## Developer platform

Base URLs used throughout the portal:

```
Live      https://api.koba.gg/v1
Sandbox   https://sandbox.api.koba.gg/v1
```

**The REST API actually runs.** `src/lib/api.ts` is an in-browser runtime that authenticates keys,
enforces scopes, validates bodies, applies rate limits and answers from the same seeded data the app
renders. Nothing leaves the tab — there is no server — but the request/response behaviour is real,
not a mock. The portal's **Playground** sends those requests and prints the JSON.

| Method   | Path                        | Scope              | Purpose                          |
| -------- | --------------------------- | ------------------ | -------------------------------- |
| `GET`    | `/deck`                     | `matches:read`     | Page through the deck            |
| `GET`    | `/matches`                  | `matches:read`     | List rival matches               |
| `GET`    | `/players/{id}`             | `matches:read`     | Player profile                   |
| `POST`   | `/challenges`               | `matches:write`    | Lock a kill-tier challenge       |
| `POST`   | `/challenges/{id}/resolve`  | `matches:write`    | Settle a result and move points  |
| `GET`    | `/servers`                  | `servers:read`     | Arena servers and live state     |
| `PATCH`  | `/servers/{id}`             | `servers:write`    | Toggle a featured placement      |
| `POST`   | `/webhooks`                 | `webhooks:manage`  | Register a signed endpoint       |
| `DELETE` | `/keys/{id}`                | `webhooks:manage`  | Revoke a key                     |

**Scopes and rate limits** — per key, per minute, sliding window:

| Scope             | Ceiling |
| ----------------- | ------- |
| `matches:read`    | 600/min |
| `matches:write`   | 120/min |
| `servers:read`    | 60/min  |
| `servers:write`   | 60/min  |
| `webhooks:manage` | 30/min  |

Exceeding a ceiling returns `429` with `retry_after`, `scope` and `limit` in the body. The **Usage**
tab charts per-key volume, shows live window state with a countdown, and includes a burst simulator
that trips the real limiter.

**Webhooks** — endpoints carry event subscriptions and a `whsec_` signing secret; deliveries retry
up to five times with backoff, and the delivery log records status, latency and attempt.

**Reference** — every endpoint is documented with its scope and a copyable example, and the
**OpenAPI 3.1** document is generated from the same table and downloadable as JSON.

---

## Data and storage

Everything lives in the browser: no API, database or session service. State survives reloads, not a
different browser or a cleared cache.

| Key                      | Contents                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `rivalry.state.v2`       | Deck position, swipes, matches, callouts, replies, profile    |
| `rivalry.accounts.v1`    | Locally created business accounts                            |
| `rivalry.session.v1`     | Signed-in business account                                   |
| `rivalry.ads.v1`         | Campaigns, PPC bids and their metrics                        |
| `rivalry.board.seen.v1`  | When each callout thread was last read                       |
| `rivalry.developer.v1`   | API keys, webhook endpoints, deliveries and the request log  |

Clear those keys for a clean first run with the seeded roster, games, campaigns and callouts.

---

## Project layout

```
src/
  App.tsx                 Shell, view routing, landing/app split and client state
  components/
    LandingPage.tsx       Marketing site + the desktop phone frame
    DeveloperPortal.tsx   Keys, usage, webhooks, reference, playground, request log
    AdPortal.tsx          PPC campaigns, review-before-publish, reporting, ledger
    BusinessPortal.tsx    Gated console shell and section routing
    SwipeDeck.tsx         Gesture deck with sponsored placements
    ...                   Cards, board, lobby, filters, profile, brand, icons
  data/                   Seeded games, players, callouts and servers
  lib/
    api.ts                In-browser REST runtime, rate limiting, OpenAPI
    developer.ts          Portal state, persistence, docs table, snippets
    ads.ts                Campaign model, PPC billing and the shared ad store
    ...                   Matchmaking, challenge tiers, accounts, storage, images
  styles.css              Design tokens and app styling
  components/*.css        Landing, ad portal and developer portal styles
public/
  logos/                  Game artwork used on cards and filters
  brand/                  KOBA wordmark and drop icon
```

The palette is red, white and black over a white canvas (`#F8F9FA` surfaces, charcoal headings,
slate secondary text), set in Inter with soft shadows and generous spacing.

---

## Notes and limitations

- No backend, real-time transport, RCON or WebSocket connections exist here; server diagnostics, ad
  delivery, billing and matchmaking are simulated client-side. The REST runtime is real code, but it
  runs in the tab, not on a host.
- Game names and logos belong to their respective publishers and are used to identify the titles a
  player can match on. KOBA is not affiliated with them.
- Avatars, banners and ad creatives are stored locally; nothing is uploaded and no payments are
  taken.

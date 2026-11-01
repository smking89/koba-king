# KOBA Bot — Full Product Roadmap

**Date:** 2026-10-12
**Scope:** Full feature wishlist (8 categories + Pyramid/Bridge/House spatial engine) stress-tested against real competitor research and the actual current codebase.

**Methodology note:** Part 1 is from live web search (cited inline). Part 2 is from reading the actual files in this repo — every "exists" or "doesn't exist" claim below cites a real path. Nothing here is inferred from the README, from memory of earlier sessions, or from what "should" be true of a Discord bot like this — it's what's actually in the code as of this pass.

---

## 1. Competitor Landscape (real research)

### Helios (Helios RCE) — heliosrce.com
Confirmed real name: **Helios**, explicitly branded for Rust Console Edition. Connects via WebRCON. Free tier: killfeed, server/player feeds, shop, economy, 100-level battle pass, TP/home, zones, autokits, quick-chat binds — all with limits. Premium unlocks ORP (Offline Raid Protection), random items, clans, tickets, timed commands, auto events, player market, higher limits. Also ships dedicated bounty and clan sub-products (heliosrce.com/rust-console-bounty, /rust-console-clans) and a leaderboards product. This is the closest 1:1 competitor to KOBA Bot's wishlist — nearly every wishlist category maps to something Helios already ships.
[Helios RCE](https://www.heliosrce.com/) | [Rust Console Edition Bot](https://www.heliosrce.com/rust-console-edition-bot/) | [Shop Bot](https://www.heliosrce.com/rust-console-shop-bot/) | [Bounty](https://www.heliosrce.com/rust-console-bounty/) | [Clans](https://www.heliosrce.com/rust-console-clans/) | [Leaderboards](https://www.heliosrce.com/rust-console-leaderboards/)

### Koas → actually **KAOSBOT / KA0SBOT** (bot.ka0s.uk)
The user's "Koas Bot" is almost certainly **KAOSBOT** (ka0s.uk) — close phonetic/spelling match, same RCE niche, and it's referenced directly in this repo's own code comments (`utils/autoKitEngine.js` cites "KaosBot's reference mapping" for quick-chat trigger IDs, confirmed from the user back in September). Features per its own docs and tip4serv's hosting-partner page: kits + shop purchasing, seller/marketplace system, virtual currency + virtual gambling, server diagnostics, role automation, Scheduled Raid Protection (SRP) and Zoned Offline Raid Protection (ZORP), raid alerts, a kill system with bounties, a prison system, teleport guide, message scheduler/auto events. Requires `/link` to a gamertag.
[KAOSBOT](https://bot.ka0s.uk/) | [Linking docs](https://bot.ka0s.uk/docs/linking/) | [tip4serv KAOS Discord Bot](https://docs.tip4serv.com/games/rust-console-edition/kaos-discord-bot)

### Vertex — **could not confirm which "Vertex" is the actual competitor**
Search surfaced at least three unrelated products all branded "Vertex": (1) a generic Discord.js moderation/economy bot on GitHub (`alktbihd/Vertex-Bot`) with confessions/captcha/welcomer — no Rust connection at all; (2) a "Vertex AI Discord Bot" (image gen, translation) — also unrelated; (3) a genuine Rust-console-adjacent product referenced only as "a bot designed for rust console to easily build kits/zones/spawn items/maps and manage settings" with a player-report system, found via a vertexbot.pro command list and veretech.systems docs ("Veretech RCE Bot" — possibly the real full name, with "Vertex" as a short/informal name). **This is the one name in the set I can't fully verify** — the Veretech/Vertex RCE product looks real (kit/zone building, item/map spawning, cross-server report system) but I did not find a clean, authoritative "this is Vertex Bot, here is its full feature list" page the way Helios and KAOSBOT have. Treat anything beyond "kit/zone building + spawn items + cross-server reports" as unconfirmed.
[Command List (vertexbot.pro)](https://www.vertexbot.pro/) | [Veretech RCE Bot docs](https://docs.veretech.systems/books/veretech-rce-bot/page/linking-economy) | [GitHub alktbihd/Vertex-Bot (likely unrelated)](https://github.com/alktbihd/Vertex-Bot)

### Cheeky's → **Ch33ky's RCE Bot** (ch33kysrcebot.com)
Confirmed real name: **Ch33ky's RCE Bot** ("Cheeky's" is almost certainly a phonetic spelling of "Ch33ky's"). Explicitly a "fully integrated Rust Console Edition management system for PS4, PS5 & Xbox," no mods required. Claims automated self-running events, a teleport system, fully integrated store, a 2-tier battle pass, a portal system, ORP with audit logging, and "over 35 system pages with multiple sub-systems." Premium tier: full coin economy, Stripe-powered store with vouchers, Dial-a-Ride vehicle system, ORP & SRP monument management, Discord role integration, kill feed & player stats, custom scheduled commands, prison, bounty & minigames. Notably, **"Dial-a-Ride"** — the exact term in KOBA Bot's own wishlist (#4) — is Ch33ky's own named feature, not a generic Rust term; the wishlist's phrasing here is very likely modeled directly on Ch33ky's.
[Ch33kys RCE Bot](https://ch33kysrcebot.com/docs) | [tebseu instance](https://tebseu.ch33kysrcebot.com/)

**Bottom line:** all four real competitors (Helios, KAOSBOT, Ch33ky's, and the unconfirmed Vertex/Veretech) already ship some combination of killfeed, economy, battle pass, kits/TP, ORP/raid alerts, clans, and prison/bounty systems for RCE specifically. KOBA Bot entering this space is not pioneering a new category — it is catching up to (and in a few areas, per Part 2, already exceeding) an established competitive set.

---

## 2. Current State — Ground Truth (repo-verified)

Legend: ✅ Shipped & wired end-to-end · 🟡 Partial/thematic-only/dead-code scaffolding · ⛔ Not present anywhere

### Category 1 — Killfeeds, status, economy, kits, raid alerts, zones, clans, tickets

| Feature | State | Evidence |
|---|---|---|
| Killfeed **Discord channel display** | ⛔ (removed) | `utils/categoryLeaderboards.js` header comment: "FIXED (2026-09-10): PvP/PvE leaderboard categories were removed when the killfeed feature itself was removed entirely (per explicit user request)." See Section 3 below. |
| Kill **event pipeline** (parse/identity/clan/DB/pub-sub) | ✅ | `utils/combatEvents.js` — real WebRCON→parser→identity→clan→`pvp_kills` table→internal event bus. Fully wired, just has no Discord-facing display today. |
| Server/player status tracking (live counts, queue) | ✅ | `utils/globalStatus.js` — renames voice/text channels with live player/queue counts via `server.serverinfo` RCON polling. Real, shipped, running. |
| Economy & shops | ✅ | `shop_currencies`/`shops`/`shop_products`/`shop_wallets`/`shop_purchases` tables (`database/schema.sql`) + live purchase flow. Mature, pre-existing system. |
| Kits & TP/home | ✅ (kits) / ✅ (home) | `utils/kitPanel.js` + `utils/autoKitEngine.js` (real kit delivery + quick-chat-triggered auto-kits); `player_homes`/`teleport_waypoints` tables with live `global.teleportpos` RCON calls. |
| Raid/base protection alerts (ORP-style) | ⛔ | No ORP/ZORP/SRP-equivalent found anywhere in `utils/` or `schema.sql`. This is pure greenfield — every competitor researched in Part 1 has some ORP/ZORP variant; KOBA Bot has none. |
| Zone & event feeds (cargo ship/heli/airdrop announcements + PvP/PvE zone tracking) | 🟡 | `utils/zoneEvents.js` + `utils/zoneCapture.js` are real, working **custom-zone capture/control** systems (team holds a zone, wins a reward) — but they are KOBA Bot's own invented zone-control minigame, not monument-event announcements (no cargo ship/heli/airdrop tracking exists — see Category 2 below). |
| Clan/team systems | ✅ | `teams`, `team_invites`, `rank_overrides` tables; full roster/permission/Discord-role integration already live (predates this pass). |
| Admin/ticket management | ✅ | `utils/tickets.js` — real private-channel ticket system (open/close/archive categories, reason dropdown, admin-role gating), backed by `support_tickets` table. |
| Scheduled broadcasts (wipe countdowns, rules) | 🟡 | `auto_messages`/`auto_events` tables exist and are used elsewhere in the codebase for scheduled content, but there's no dedicated "wipe countdown" broadcast template confirmed in this pass — likely buildable on existing scheduling infra rather than new infra. |

### Category 2 — Coordinate-spawned events (Pyramid/Bridge/House) & monument trackers

| Feature | State | Evidence |
|---|---|---|
| Single coordinate-based entity spawn + scheduled respawn | 🟡 (dead code) | `entity_spawn_locations` and `entity_respawn_groups` tables exist in `database/schema.sql` (lines ~2319–2351), with full CRUD in `database/db.js` (`addEntitySpawnLocation`, `addEntityRespawnGroup`, `listEnabledEntityRespawnGroups`, `markEntityRespawnGroupSpawned`, etc.) — **but these functions have zero callers anywhere in the codebase.** No command file, no background-loop tick (`utils/backgroundLoops.js` was grepped directly — no reference to any of these functions or tables). This is schema-and-CRUD scaffolding that was built and then never wired to RCON or exposed to a user. It is the single most relevant existing building block for the Pyramid/Bridge/House vision, but it is **not functional today** — treat it as "started, not shipped."
| Pyramid/Bridge/House multi-entity coordinate-stacked structures | ⛔ | No macro-loop, no stacking logic, no "decreasing square radius" math, nothing resembling this anywhere in the repo. 100% greenfield, and see Section 4 for why this is also the most technically uncertain item in the whole wishlist. |
| Cargo Ship / Oil Rig arrival-departure feeds, locked-crate hack/clear updates | ⛔ | `utils/cargoShipHeist.js` exists but is a **gambling/PvP minigame themed around a cargo ship** (control-%, 10 rounds, XP payout pool) — it does not listen for or announce the real in-game Cargo Ship event's spawn/despawn/crate state. No real monument-tracking code exists. |
| Patrol Helicopter / Airdrop logs (who downs it, coordinate alerts) | ⛔ | Nothing found. Greenfield. |
| Bradley APC tracker (Launch Site monitoring, killer attribution) | 🟡 (thematic only) | `utils/bradleyAmbush.js` exists but is, like Cargo Ship Heist, a **gambling minigame** themed around a Bradley (shared HP pool players "damage" via Discord buttons for loot) — it is admin-triggered/ambient, not a real-time tracker of the actual in-game Bradley entity's spawn/destruction. The file's own header honestly flags that even its one real RCON call (`bradley.quickrespawn`) is unconfirmed for WebRCON reachability. |
| Locked-crate countdown timers | ⛔ | Nothing found. Greenfield. |

### Category 3 — Standard Rust bot essentials

| Feature | State | Evidence |
|---|---|---|
| Real-time global killfeed display | ⛔ | Same finding as Category 1 — removed 2026-09-10, pipeline intact, display gone. |
| Leaderboards & player stats (Top Kills, K/D, longest kill, farming, playtime) | 🟡 | `pvp_kills`/`pvp_streaks` tables exist and are populated by the (headless) combat pipeline; `playtime_tracking` table exists. But `utils/categoryLeaderboards.js` explicitly removed the PvP/PvE leaderboard categories alongside the killfeed removal ("kept them would've just meant two permanently-empty leaderboards going forward" — false now only if the killfeed pipeline is re-surfaced). Clan Wars and Event Wins leaderboards remain live. Distance-kill and farmed-material leaderboards: not confirmed present. |
| Chat sync / two-way chat relay | ⛔ | No match anywhere in the repo for chat-relay/chat-sync logic. 100% greenfield — and per Section 4, technically uncertain given RCE's documented command set. |
| Server wipe automation | ✅ (infra) | `utils/serverWipe.js`'s `wipeGuild()` is real and shipped — but it's a **Discord-structure wipe** (channels/roles), used for `/nuke` and template-switch pre-wipe, not a "clear leaderboards + reset wallets + wipe progression + styled broadcast" game-wipe workflow. The wishlist's specific ask (reset wallets/progression on a real Rust server wipe) is not what this function does — it's a related-but-different capability that would need new orchestration on top of existing reset primitives (wallets, `player_progression` already have reset-style functions elsewhere in `db.js`, not audited individually in this pass). |

### Category 4 — Automated server utility & gameplay panels

| Feature | State | Evidence |
|---|---|---|
| Role-based teleport panel w/ cooldowns | ✅ (partial) | `player_homes`/`teleport_waypoints` + live RCON teleport calls exist; a dedicated panel-button "Teleport Home" UI with role-screened cooldowns specifically was not directly located in this pass — the data/RCON layer is there, the polished panel UX may need building. |
| Visual kit-claiming dropdown w/ instant delivery | ✅ | `utils/kitPanel.js` + `utils/playerPanel.js`'s "Kit Claims Drawer" (2026-09-19) — real, working, role-gated, cooldown-gated. |
| Dial-A-Ride vehicle delivery | ✅ | `utils/autoKitEngine.js` — vehicle delivery via RCON confirmed working (with the one flagged syntax concern noted in Section 4). |
| ZORP-style Offline Raid Protection | ⛔ | Confirmed absent (see Category 1). This is the single largest category gap relative to every competitor in Part 1 — Helios, KAOSBOT, and Ch33ky's all ship some ORP/ZORP variant; KOBA Bot ships none. |
| RaidLink Alerts (TC wall-damage → Discord DM/channel ping) | ⛔ | Nothing found. Greenfield, and depends on real-time wall/TC-damage detection — see Section 4 for feasibility concerns (RCE's documented RCON set has no "wall damaged" broadcast event confirmed anywhere in `docs/RUST_CONSOLE_RCON_REFERENCE.md`). |

### Category 5 — Progression & economy panels

| Feature | State | Evidence |
|---|---|---|
| Battle Pass (XP/level/prestige) | ✅ (deep, but not "100+ levels" confirmed) | `utils/progression.js` is a real, well-built system: idempotent XP events, configurable (non-hardcoded) XP curve, level cap (`curve.maxLevel`), Prestige, milestone badges, integrated with combat/game/challenge event buses. `curve.maxLevel` is configurable per-guild — whether it's currently set to 100+ anywhere is a config value, not a code gap. This is arguably ahead of a "battle pass" in sophistication (proper event-sourced XP ledger, not a simple counter). |
| Advanced player market / trading / "Trader" / heatmap analytics | 🟡 | `marketplace_listings`, `auctions`, `auction_bids` tables exist — real P2P trading infrastructure. `scrap_merchant_settings`/`scrap_items`/`player_scrap_inventory` cover the "junk-for-coins" Trader concept via `utils/scrap_merchant` game. Live global heatmap analytics: not found — greenfield. |
| Casino games panel (Vault, Tower Climb, Minefield, Lucky Boxes) | ✅ | `config/games.js`'s `GAMES_REGISTRY` — Lootbox, Defuse Wire, Grid Minefield, Tower Climb, Vault Heist, Scrap Merchant, Ticket Jackpot, Recycler Roulette, Target Range, Bradley Ambush, Cargo Ship Heist are ALL real, shipped, wired games (10 total, more than the wishlist's 4-game ask). Per the task's prior product decision (2026-10-11), Ticket Jackpot and Cargo Ship Heist are now Pro+-gated; the rest are free-tier. |

### Category 6 — Administration, monetization, web control

| Feature | State | Evidence |
|---|---|---|
| Live Command Center (server FPS/entity count/queue/stability) | 🟡 | `globalStatus.js` covers player count + queue via `serverinfo`. FPS/entity-count/stability specifically: `server.serverinfo`'s actual returned fields weren't verified field-by-field in this pass — worth confirming what `parseServerInfo` actually extracts before assuming FPS/entity-count are available. |
| Prison/Jail system (movement-locked at fixed coords) | ⛔ | Not found. Greenfield — and competitor research (Part 1) shows KAOSBOT, Ch33ky's, and (implicitly) Helios's premium tier all already have a prison system; this is a real competitive gap. |
| Granular ticket routing with role-gated appeal visibility | 🟡 | `utils/tickets.js` already has a reason-category dropdown (bug/billing/setup/report/other) and role-gated channel visibility per ticket — the core mechanism for "granular routing" exists; whether appeals specifically get separate role-gated visibility rules wasn't separately confirmed. |

### Category 7 — Cloud snapshot & blueprint engine

| Feature | State | Evidence |
|---|---|---|
| Full config backup (`/template save`) | ✅ | `commands/template.js`'s `save`/`mine`/`download` subcommands + `utils/serverStructure.js`'s `snapshotStructure`, backed by `custom_templates` table. Real, restored 2026-10-11. |
| One-click restore (`/template setup` on a saved template) | ✅ | Same file, `restoreStructure` + `provisionTemplate` (`utils/provisioning.js`). Confirmed real and working as of the 2026-10-11 restoration (previously a crude, disconnected stub had briefly overwritten it — now reverted). |
| Live Layout Repair (`/setup repair` equivalent) | ✅ | `utils/provisioning.js`'s `repairManagedPanels(guild)` function — walks every managed panel channel, re-posts/repairs content and buttons without a destructive wipe, plus a special case for the Rivals panel. This is real and already wired into `/template setup`/`/template mine`/a dedicated panel-repair path. **The wishlist's "silent integrity scan, auto-correct broken permissions / rebuild deleted panel channels without interrupting live operations" is already substantially built**, not a gap. |

### Category 8 — Command structure

Mostly confirmed real and already shipped per the task's own framing; this pass additionally confirmed:
- `/mod ban|unban`: real DB-backed logic (restored 2026-10-11) but **Discord-side only** — the file's own header comment states plainly: *"Neither scope calls RCON — KOBA Bot's ban system blocks bot/Discord access, it does not kick/ban from the live Rust server."* This is an important nuance the task description didn't fully capture: "restored to real working state" is true, but it was never meant to reach the game server, and currently doesn't. If in-game bans are actually wanted, that's a new scope, not a restoration.
- `/war declare|end`: real DB write (`recordClanWarWin`) AND a real RCON broadcast (`rcon.say(...)`) on declare/end. This one *does* touch the live server. Confirmed fully real.

---

## 3. The Killfeed Contradiction — Flagged, Not Resolved

**This is real and verified, not a guess.**

`utils/categoryLeaderboards.js`'s header comment states explicitly:

> "FIXED (2026-09-10): PvP/PvE leaderboard categories were removed when the killfeed feature itself was removed entirely (per explicit user request) — they had no other data source, so kept them would've just meant two permanently-empty leaderboards going forward."

This confirms two things:
1. A real, explicit, documented user decision on 2026-09-10 removed the killfeed Discord-channel display entirely.
2. The removal was deliberate and cascaded — it took the PvP/PvE leaderboard categories down with it, not just the raw feed.

Meanwhile, the underlying kill-event pipeline was never removed: `utils/combatEvents.js`'s full WebRCON→parse→identity→clan→`pvp_kills` DB write→internal pub/sub pipeline is still live and running today. The removal was specifically of the **Discord-facing display layer**, not the data layer.

**The new wishlist (Category 3) explicitly asks for it back**, verbatim: *"Killfeeds & Death Notifications: Automated real-time text logs posted to a designated Discord channel showing player kills, weapons used, distances, and death types."* And again in the "Standard Rust Bot Essentials" list: *"Real-Time Global Killfeed: PvP kills, PvE deaths, headshot indicators, distances, weapons."*

**This is a direct contradiction between a prior explicit decision and the new wishlist, and it is not this document's place to resolve it.** Re-enabling the display is technically low-effort (the pipeline and data model already exist; it's primarily a new consumer subscribed to `onCombatEvent()` plus posting to a channel, and possibly re-adding the two leaderboard categories). But "low-effort to re-enable" is not the same as "should be re-enabled" — there was a real, named reason someone wanted it gone once. Before this is built:

- **Someone needs to explicitly say why it was removed in the first place** (noise complaints? privacy concerns from players? a specific incident?) and whether that reason still applies.
- **If it's rebuilt, decide whether it should be opt-in/configurable** (e.g., toggle per-guild, or gated to a specific channel admins choose) rather than forced-on, given it was removed once by request.

This document deliberately does not pick a side. Flag for explicit human re-decision before any implementation work starts on Category 3's killfeed items.

---

## 4. Technical Feasibility Notes (cross-checked against `docs/RUST_CONSOLE_RCON_REFERENCE.md`)

The reference doc (fetched 2026-10-11 from the official RCE GitBook) is explicit about a critical distinction: commands tagged 🎮 are **in-game F1 console only** and cannot be reached over WebRCON at all, no matter how a bot is built. Commands tagged 📟 (or 📟🎮) are reachable over RCON/WebRCON. This matters enormously for the wishlist.

### Confirmed possible (documented 📟/RCON-reachable commands exist)
- **Coordinate-based single-entity spawning**: `entity.spawnatpos "object name" (coords)` is explicitly tagged 📟🎮 — RCON-capable, with a coordinate parameter. This is the command that should back any future coordinate-spawn feature. **Important existing bug to fix first**: `utils/autoKitEngine.js:150` currently sends `entity.spawn` (documented 🎮-only, no coordinate parameter) instead of `entity.spawnatpos` for vehicle delivery — this is a pre-existing, already-flagged syntax mismatch in the reference doc's own Gap Check section, not something new found in this pass.
- **Cargo Ship / Chinook / Attack Heli / Airdrop force-trigger**: `events.triggerevent`/`events.stopevent` with valid names `event_airdrop`, `event_cargoheli`, `event_cargoship`, `event_helicopter` are documented 📟. `cargoships.spawncargoship`/`startegressing` are also documented 📟. So **forcing** these events, and toggling them, is confirmed possible.
- **Bradley respawn control**: `bradley.respawndelayminutes`/`respawndelayvariance` (world/entities) are documented 📟. `bradley.quickrespawn` appears only in the undifferentiated "world/events" prose list with no per-command icon — **unconfirmed** reachability, already flagged honestly in `utils/bradleyAmbush.js`'s own header comment.
- **Player position polling** (needed for any "who's near the event" or raid-alert proximity logic): `server.printpos "<gamertag>"` is documented 📟🎮 and is already used successfully elsewhere in the codebase (`utils/zoneEvents.js`).
- **Custom PvP/PvE zones** around a location: `zones.createcustomzone`/`editcustomzone`/`deletecustomzone` are documented 📟, already used in `utils/eventCreation.js`/`zoneEvents.js`.

### Unverified / technically uncertain
- **Cargo Ship / Oil Rig / Patrol Heli / Bradley "arrival" and "destruction" *notifications*** (the actual wishlist ask — a Discord message firing when the real in-game event starts/ends/gets destroyed) require the bot to **detect** these events from the live broadcast/log stream, not just trigger them. The reference doc documents commands to *force* or *configure* these events, but does **not** document a confirmed WebRCON broadcast line format for "Cargo Ship has arrived" or "Bradley APC destroyed by X" the way `rcon/combatParser.js`'s kill-line regexes were built against real captured log lines. Building this requires either (a) a live capture of the actual broadcast text RCE emits for these events (same empirical approach `combatParser.js` used for kills), or (b) a polling-based workaround (e.g., periodically check `global.carstats`/entity counts) that nothing in this codebase currently does for monument entities. **Not confirmed buildable from documentation alone — needs a live capture session against a real server first.**
- **Locked-crate countdown timers**: `hackablelockedcrate.decayseconds`/`requiredhackseconds` (world/resources) are documented 📟 as *server settings* (how long a hack takes), not as a live "time remaining" readout for a specific crate instance. Converting a static setting into a live, per-crate countdown that ticks down in Discord would need either a broadcast-line capture of hack-start events or periodic polling of some entity-state command not confirmed to exist in this reference. **Uncertain.**
- **RaidLink (wall/TC damage → Discord alert)**: no documented RCON command or broadcast format for "a building block/TC took damage" was found anywhere in the 40-page reference doc. The building category (`gameplay/building`) documents decay/stability *settings*, not a live damage-event feed. **This is the single most technically uncertain item in the entire wishlist** — it's the foundation of both "Raid & Base Protection Alerts" (Category 1) and "RaidLink Alerts" (Category 4), two separately-named wishlist items that both depend on a capability that isn't confirmed to exist via documented RCON/WebRCON at all. If RCE genuinely has no broadcast event for wall damage, this entire feature class may be unbuildable as specified, full stop — not "harder than expected," but potentially impossible without an undocumented/unofficial signal. **Needs direct empirical testing against a live server before any commitment is made to building it.**
- **Chat Sync / two-way chat relay**: Discord→game direction is confirmed possible (`global.say` is documented 📟🎮, already used for broadcasts in `commands/war.js`). Game→Discord direction depends on whether player chat lines appear in the WebRCON broadcast stream in a parseable format — `utils/autoKitEngine.js`'s own header comment already flags this exact uncertainty for quick-chat detection ("CHAT_LINE_PATTERN below has NOT been confirmed against a real WebRCON broadcast sample"). **Half-confirmed, half-uncertain**: outbound works, inbound is unverified.
- **Pyramid/Bridge/House coordinate-math structure generation**: `entity.spawnatpos` with a coordinate parameter is confirmed RCON-reachable for **one entity at a time**. Nothing in the documentation confirms behavior for rapidly stacking dozens of entities in a precise mathematical pattern (collision/stability interactions, build-volume validation, whether spawned deployables actually stack/support each other the way real player-placed building pieces do, rate limits on rapid-fire RCON sends). This is **the single most technically uncertain item in the whole wishlist** tied with RaidLink — it rests on an unverified assumption that `entity.spawnatpos` behaves like a structural building-placement system when called in a tight loop, which the documentation gives no basis for either confirming or ruling out. Treat as **spec-only** until a live test proves even a 3-piece stack behaves as expected.

### Likely not possible with documented commands alone
- **Precise "who gets the final downing shot" on a Patrol Heli, or "who destroyed the Bradley with what weapon"** attribution — this requires either a documented kill-attribution broadcast line specific to NPC/vehicle-kills (not confirmed in the reference doc, which only documents player-vs-player adjacent commands) or extending `rcon/combatParser.js`'s existing (player-death-focused) regex set to NPC/vehicle-destruction lines never captured or tested. Plausible with real log capture, but not confirmed buildable from the documentation as it stands today.

---

## 5. Phased Roadmap

Sequencing logic: (a) fix pre-existing flagged bugs before building on top of them, (b) resolve the killfeed contradiction before building anything that depends on its answer, (c) do empirical RCON captures before committing scope to anything in the "unverified" bucket above, (d) greenfield builds that depend on nothing else go earliest if prioritized, (e) Pro/Max tier placement follows the existing precedent (Basic = included essentials; Pro = engagement/retention features; Max = heaviest-infra or most speculative features) already established in `config/games.js`'s 2026-10-11 Pro-gating of Ticket Jackpot/Cargo Ship Heist.

### Phase 0 — Decisions & Fixes (no new feature work, blocks everything downstream)
- **Resolve the killfeed contradiction** (Section 3) — explicit human decision required before Phase 1's killfeed item starts.
- **Live RCON capture session** against a real target server to settle the "unverified" bucket in Section 4: confirm/deny wall-damage broadcast lines, cargo ship/heli/Bradley arrival/destruction broadcast lines, chat-line broadcast format, and `entity.spawnatpos` multi-entity-stack behavior. This single session de-risks roughly half the wishlist's hardest items before any sprint planning happens.
- **Fix the already-flagged syntax bugs** in `docs/RUST_CONSOLE_RCON_REFERENCE.md`'s own Gap Check section (`entity.spawn`→`entity.spawnatpos` in `autoKitEngine.js`, `kit removeplayer` vs documented `kit remove`, `zones.editcustomzone` quoting, `teleportpos` coordinate format) — these are pre-existing bugs, not wishlist items, but several wishlist features (coordinate spawning, kits, zones, teleport) build directly on top of this exact code.

### Phase 1 — Re-enable + harden what's 90% there (Basic/Pro, fast wins)
Gated entirely on Phase 0's killfeed decision:
- Killfeed Discord display (re-subscribe to `utils/combatEvents.js`'s existing `onCombatEvent()`, make it configurable/opt-in per the Section 3 recommendation) — **Basic or Pro**, competitors ship this free-tier (Helios).
- Restore PvP/PvE leaderboard categories alongside it (`categoryLeaderboards.js`) — same tier as killfeed.
- Fill out remaining standard leaderboards (longest-distance kill, most-farmed material, total playtime) on top of existing `pvp_kills`/`playtime_tracking` tables — **Basic**.
- Formalize "Live Layout Repair" as a user-facing `/setup repair` alias if not already surfaced that way (the underlying `repairManagedPanels` already exists) — **Basic**, already basically done.

### Phase 2 — Raid Protection & Alerts (the single biggest competitive gap)
Depends on Phase 0's RCON capture resolving the wall-damage-broadcast question:
- If confirmed buildable: ORP/ZORP-equivalent base protection + RaidLink wall-damage alerts — **Pro**, matching where every researched competitor gates their raid-protection tier.
- If not confirmed buildable via documented RCON: fall back to a periodic-polling approximation (e.g., poll `server.printpos` for proximity near a registered TC location as a weaker substitute) and ship that as a clearly-labeled "best effort" feature, or defer entirely — this decision point is itself a roadmap deliverable, not something to pre-decide here.
- Prison/Jail system (movement-lock at fixed coords, tied to a gamertag/PSN ID) — **Pro**, another gap vs. KAOSBOT/Ch33ky's.

### Phase 3 — Monument Trackers (greenfield, sequenced after Phase 0's capture)
- Cargo Ship / Oil Rig arrival-departure feed, Patrol Heli + Airdrop logs, Bradley APC tracker — all depend on the same broadcast-capture work from Phase 0. Build the lowest-risk one first (Cargo Ship, since `cargoships.spawncargoship`/`startegressing` are confirmed 📟-reachable for at least the trigger side) as a pilot before committing to the harder attribution logic (who got the final heli shot, who destroyed the Bradley with what weapon).
- Locked-crate countdown timers — depends on resolving whether a live per-crate timer readout is even possible (Section 4); likely needs its own smaller capture/test pass.
- **Tier: Pro or Max** depending on infra cost — this category requires new polling/parsing infrastructure beyond anything that exists today, closer to Max-tier scope than a quick Pro add-on.

### Phase 4 — Chat Relay
- Discord→game direction: low-risk, build first (uses already-confirmed `global.say`).
- Game→Discord direction: depends on Phase 0's chat-line-format capture. If RCE's broadcast stream doesn't expose readable chat lines, this half may not be buildable at all — don't commit a date to the inbound half until Phase 0 confirms it.
- **Tier: Pro**, matches typical competitor gating of chat bridges.

### Phase 5 — Coordinate-Spawned Events (Pyramid/Bridge/House)
The highest-uncertainty, highest-effort item in the entire wishlist (Section 4). Do not sequence this before Phases 0–3 land, both because it depends on the same `entity.spawnatpos` foundation other features will have already exercised in production, and because it needs its own dedicated feasibility spike (small live test: stack 3–5 entities via `entity.spawnatpos` in a tight loop and observe actual in-game behavior) before any scope commitment.
- Pilot: The Bridge Event (linear chain, no vertical stacking, lowest geometric complexity) as the feasibility proof before attempting the Pyramid (vertical stacking, collision-dependent) or House (multi-room, highest complexity).
- **Tier: Max** — this is speculative, high-engineering-cost, and should only be promised to the highest tier where expectations are already "we're buying bleeding-edge."

### Phase 6 — Progression/Market polish & Live Command Center
Lower urgency since the underlying systems (`progression.js`, marketplace tables, `globalStatus.js`) are already strong:
- Confirm/raise `maxLevel` config to 100+ if not already, add prestige visual timeline polish — **Basic/Pro**, mostly cosmetic given the engine's already real.
- Player-to-player trade UX on top of existing `marketplace_listings`/`auctions` — **Pro**.
- Heatmap analytics on market activity — **Max**, genuinely new analytics infra.
- Live Command Center FPS/entity-count fields — first confirm what `parseServerInfo` actually extracts from `serverinfo` before promising fields that may not be in the payload (a Phase 0-adjacent verification task, cheap to do early).

### Phase 7 — Clean-up of dead scaffolding
- Decide whether to build on top of the existing-but-unwired `entity_spawn_locations`/`entity_respawn_groups` tables (Phase 5's foundation) or remove them if Phase 5 is deprioritized — leaving verified-dead CRUD code around indefinitely doesn't match this codebase's demonstrated discipline of flagging and resolving exactly this kind of gap.

---

## 6. Differentiation Recommendations

Matching the competitor feature lists 1:1 is not a strategy — all four researched competitors already do that to each other. KOBA Bot has three real, verified assets none of the four competitors were confirmed (in this research pass) to have:

1. **A real weighted-random giveaway system** (`admin/giveawaysAdmin.js`, `admin/giveawaysPublic.js`, `utils/giveawayAnnounce.js`, built 2026-10-12) — none of Helios/KAOSBOT/Ch33ky's/Vertex's public documentation mentioned a giveaway product. This is a genuine community-growth lever (giveaways drive server joins/invites) that's uncontested in the researched set. **Lean into this as a marketing/growth differentiator**, not just a feature line-item — e.g., cross-promote "KOBA Bot servers run better giveaways" rather than burying it in a feature list next to killfeed and kits.

2. **A 10-game arcade suite** (`config/games.js`) vs. competitors' typically-smaller casino offerings (the wishlist itself only asked for 4: Vault/Tower/Minefield/Lucky Boxes). KOBA Bot already ships more than double that, with real, tested game logic (Defuse Wire, Recycler Roulette, Target Range, Scrap Merchant, Ticket Jackpot, two ambient co-op events). **Differentiate on breadth and polish of the arcade, not parity** — "most game variety of any Rust Discord bot" is a defensible, verifiable claim today.

3. **A genuinely event-sourced progression engine** (`utils/progression.js`) — idempotent XP ledger with duplicate-award protection, configurable (non-hardcoded) XP curve, proper Prestige/badge milestone system. This is more architecturally sound than a typical "just increment a number" battle pass. **Market the engineering quality, not just "100+ levels"** — a configurable curve means server owners can genuinely tune pacing, which is a real operational advantage over a hardcoded competitor curve.

4. **A real, working clan-war + server-rivalry stack** (`commands/war.js`'s real RCON broadcast + DB write, `utils/serverRivalry.js`'s server-vs-server competition with an explicit, well-reasoned same-owner anti-abuse rule) — the Server Rivalry concept (community vs. community, not just player vs. player) was not found in any of the four competitors' feature lists in this research pass. **This could be a headline differentiator** — "network your Rust communities against each other" is a distinct value prop none of Helios/KAOSBOT/Ch33ky's/Vertex appear to offer.

5. **Honest gaps to close fast, not reframe**: ORP/ZORP and Prison are real, named gaps where every competitor researched has a shipped answer and KOBA Bot has none. Don't try to differentiate around these — close them (Phase 2) before they become a reason a prospect picks a competitor. These are table-stakes, not differentiators.

6. **Recommendation on the riskiest wishlist items (Pyramid/Bridge/House, RaidLink)**: given Section 4's findings, consider **not** committing these to a public roadmap or marketing page until the Phase 0 capture session proves them out. Shipping a "coming soon" promise for something that may turn out to be technically infeasible on RCE's documented RCON set is a worse outcome than quietly building the feasibility spike first and only announcing once it's proven — this matches the codebase's own established discipline of never claiming fabricated capability.

---

## 7. Advanced Killfeed/Economy Concepts (2026-10-13 addendum — aspirational, mostly unverified)

A long AI-generated architecture document was submitted proposing a much more elaborate killfeed/economy/monetization system. **Important calibration before using any of this as a real plan**: the document describes PostgreSQL/MongoDB + Redis + Stripe Connect as the stack, Python code samples, and a specific `[Damage] Gamertag[id] damaged wall.frame.wood[id] with rocket_basic[id] at (x,y,z)` WebRCON log format for raid detection. **None of this matches reality**:
- This codebase is Node.js/SQLite (`better-sqlite3`), not Python/Postgres/Mongo. No Redis exists anywhere in the stack.
- Payment/licensing already runs through Tip4Serv (`admin/server.js`'s webhook), not Stripe Connect.
- The real killfeed pipeline (`rcon/combatParser.js`, confirmed against an actual ~15,500-line captured log) parses plain lines like `"X was killed by Y (cause)"` — no weapon field, no distance field, no combo-buffer, no Elo, no Nemesis/Rivalry tracking, no bounty escrow exist today.
- **The claimed `[Damage] ... with rocket_basic ... at (x,y,z)` explosive-damage log format is unverified and should be treated with the exact same skepticism as every other "confirmed format" pasted into this project that turned out to be fabricated.** It directly contradicts Section 4's own finding: *"no documented RCON command or broadcast format for 'a building block/TC took damage' was found anywhere in the 40-page reference doc... the single most technically uncertain item in the entire wishlist."* Do not build a raid-alarm parser against this claimed format without a real captured log line to confirm it first — same Phase 0 capture-session requirement as everything else in Section 4's "unverified" bucket.

**What's genuinely worth keeping as future feature ideas** (concept only, real implementation would look completely different from the document's description):
- **Nemesis/Rivalry tracking** — flag a player pair after N consecutive one-sided kills, pay out a bonus and post a special embed when the losing side finally wins the matchup. A real, buildable idea on top of the existing `pvp_kills` table once killfeed display itself is resolved (Section 3) — doesn't need anything the document invented.
- **Elo-style skill rating** instead of raw kill count for leaderboards — legitimate differentiator idea, standard algorithm, fully implementable against existing `pvp_kills` data with plain SQLite, no Redis required.
- **Staff abuse audit log** — watch admin-triggered RCON commands and relay them to an owner-only channel. Plausible using the same broadcast-stream pattern already proven for kills/joins, if admin command invocations actually appear in the WebRCON stream (unconfirmed — would need its own capture check).
- **VIP store automation via existing payment rail** — the real version of this is "wire the shop to Tip4Serv's webhook for instant RCON delivery," not Stripe Connect. Worth scoping once the actual Tip4Serv integration's current capabilities are reviewed.
- **Cross-server/cross-game currency bridging, a "Kit Builder" visual asset renderer, and a mobile/web SDK** — these are real ambitions but describe a platform roughly the size of the `app.koba.games`/`developer.koba.games` project already discussed and deliberately deferred to its own planning session (see session notes) rather than folded into this bot's roadmap piecemeal.

**Raid-alarm concept specifically**: worth pursuing in principle (ORP is already visual/chat-only per Phase 2 — a real damage-triggered DM alert would be a genuine upgrade) — but only after a live WebRCON capture confirms whether structure damage is observable at all, exactly as Section 4 already flagged. Don't commit this to a public roadmap until that capture happens.

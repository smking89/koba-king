# Other Console Games with Community-Server / RCON-Equivalent Ecosystems

Research question: which other PS4/PS5/Xbox (not PC-only) games have a self-hosted or community-server model with remote admin access that a Discord-bot-style external tool — the same shape of thing KOBA Bot does for Rust Console Edition (RCE) — could plausibly integrate with today. Researched via web search (October 2026); no code was written or modified for this part.

For context, the KOBA Bot model that works for RCE is: (1) console players join a **community-rentable, console-native dedicated server** (GPORTAL/NITRADO), (2) that hosting panel exposes a **real WebRCON/console endpoint** reachable from an external program, (3) third-party tools (KOBA Bot included) connect to that endpoint directly. The bar for "comparable" below is all three of those being true on console specifically — not just "the PC version has RCON."

---

## 7 Days to Die (console editions)

**Current state:** The old console port (PS4/Xbox One, Telltale-era build) was delisted from the PlayStation and Microsoft stores and hasn't been updated since 2022 — The Fun Pimps explicitly declined to update it, citing "significant technical differences between old and current console hardware." A **new** console version (PS5/Xbox Series X/S) launched alongside the PC 1.0 release in July 2024, as a separate paid product (existing last-gen owners got a 25% discount, not a free upgrade).

**Admin/RCON on console:** 7 Days to Die's RCON is a plain Telnet-based protocol (`telnet serverip 8081`) that's long been documented for **PC dedicated servers**. All the RCON/admin-command documentation found (GameServerKings, HostHavoc, zap-hosting, 7d2d.net) describes PC dedicated-server hosting; no evidence was found of a console-rentable community server model (GPORTAL/NITRADO-style) with its own web console/RCON toggle for the console build specifically, the way RCE has.

**Feasibility / prior art:** Low confidence this is viable today. Console players appear to connect to PC-hosted dedicated servers (crossplay) rather than renting a console-native server with its own admin panel, so a Discord bot would need Telnet RCON against someone's PC-hosted box — exactly the same integration shape as any PC game, offering no console-specific advantage over continuing to focus on RCE. No third-party Discord bot specifically for 7 Days to Die console admin was found in this search pass (bots found were PC-Telnet-RCON tools, not console-specific).

---

## ARK: Survival Evolved / Ascended (console)

**Current state:** ARK: Survival Ascended supports full crossplay between PC (Steam/Epic/Microsoft Store), Xbox, and PlayStation — but **"Consoles cannot host an ARK: Survival Ascended dedicated server themselves"**; a dedicated server always runs on Windows, and console players simply join it. There is no console-native, console-rentable "community server" product the way RCE has GPORTAL/NITRADO consoles-specific hosting.

**Admin/RCON on console:** ARK: Survival Ascended kept the standard Valve Source RCON protocol from ARK: Survival Evolved — the exact protocol CS2/Rust (PC) tooling speaks. RCON is enabled via `GameUserSettings.ini` (`RCONEnabled=True`, `RCONPort`, `ServerAdminPassword`) on the Windows host. This is real, working, well-documented RCON — but it's PC-host RCON, not anything exposed by console hardware or a console-specific hosting panel. Console *players* can be in the server; a console *cannot host or administer* it on its own.

**Feasibility / prior art:** Technically very feasible as an integration target (Source RCON is a mature, well-documented protocol with existing client libraries — e.g. `malkamius/ASA_RCon` on GitHub), but it is **not a console-specific ecosystem** — it's the same PC-hosted-server-with-RCON model every PC survival game has, just with console players able to join via crossplay. Doesn't meaningfully expand KOBA Bot's "console game" footprint; it's really "yet another PC RCON game," with console as a client platform only.

---

## Conan Exiles (console)

**Current state:** Conan Exiles has official console-rentable servers via **GPORTAL exclusively** for PS4/PS5/Xbox ("GPORTAL is the official server partner for Conan Exiles on Xbox and PS4"; Funcom never enabled Nitrado for console, only PC). This is structurally the closest match to RCE's model found in this research — same hosting partner (GPORTAL), same general "rent a console server, admin it through a web panel" shape.

**Admin/RCON on console:** Conan Exiles has native RCON (`RconEnabled=1`, default port 25575, documented remote commands like `con <playerid> <command>`, `kick`, broadcast messages) and an in-game Admin Panel GUI. Sources note the Admin Panel GUI **does work on PS4/Xbox**, but the raw command-line interface "generally needs a USB keyboard" and some actions (Teleport/SummonPlayer) "may be unavailable on PS4." It is not yet confirmed from this research whether GPORTAL exposes a WebRCON-equivalent JSON/WebSocket console for Conan Exiles console servers the way it does for RCE (RCE's WebRCON is what KOBA Bot's `rcon/rcon.js` actually speaks) — this would need direct confirmation against GPORTAL's Conan Exiles console panel before building anything.

**Feasibility / prior art:** **The most promising of the games checked**, specifically because GPORTAL — the same hosting provider RCE community servers use — is also Conan Exiles' official console hosting partner, and Conan Exiles has a real, documented RCON protocol (not just an in-game-only console). No third-party Discord bot specifically doing Conan-Exiles-console RCON administration was found in this pass (the existing admin tooling found was mostly GPORTAL's own panel, not independent Discord bots), suggesting this would be a comparatively under-served niche if GPORTAL's console RCON/WebRCON access is confirmed to work the same way RCE's does.

---

## Valheim (console)

**Current state:** Valheim supports Xbox Series X/S and PS5 via a PlayFab-backed crossplay dedicated server (`-crossplay` launch flag), hosted by third-party rental providers.

**Admin/RCON on console:** This is a hard no. Per research: **"PlayStation 5's console access is undocumented by Iron Gate... On PlayStation, Xbox and Switch 2, no way has been found to open the command console, which means console players cannot type commands even if listed as admins."** Even on a dedicated server, cheat/admin commands are refused for everyone by default regardless of admin status — only a small allow-list (`kick`, `ban`, `unban`, `banned`, `save`, `ping`, `tune lodbias`, world-modifier tuning) works at all, and there's no console-reachable entry point to issue even those on PS5/Xbox.

**Feasibility / prior art:** Not viable. No console-side command entry point exists at all, let alone an RCON-equivalent. Not worth pursuing.

---

## DayZ (console)

**Current state:** DayZ console (PS4/Xbox) community servers are rented almost exclusively through **Nitrado**, which is explicitly the official console partner.

**Admin/RCON on console:** DayZ console doesn't expose the PC version's native RCON/BattlEye RCon protocol to console admins directly. Instead, **Nitrado provides its own web API** (server config, bans, whitelist, restarts, log access, mission-file editing) that third parties integrate against. This is a materially different shape than RCE's WebRCON (it's a hosting-provider REST API wrapping Nitrado's panel, not a live in-game console/RCON socket), but it serves the same purpose.

**Prior art — this is the strongest signal of real demand in this research:** A substantial existing ecosystem of third-party Discord bots does exactly this for DayZ console today, confirmed in this search: **DayZ Sentinel** ("the ultimate Discord integration bot for Nitrado Xbox and PlayStation DayZ servers"), **SS9-DayZ** ("the most powerful DayZ Console support bot both PS & Xbox" — killfeed, ban/green-zone management, base alarms, bounty system, reads server logs via the official Nitrado API), **Omnipotent/killfeed.me**, **Legion Killfeed** (killfeed.co), **dayzcode**, **DayZ XML Injector**, and the open-source `toxicwind/dayz-toolkit` (Discord bot + Nitrado API SDK + RCON/BERcon + mission patcher + trader configs). This is a mature, multi-vendor niche — DayZ console server owners already expect and pay for Discord-bot tooling.

**Feasibility:** Real and proven, but it's a **different integration surface** than KOBA Bot's RCE work (Nitrado's REST API, not a live RCON/WebRCON socket) and the space is already fairly crowded with established competitors. Worth noting as validation that "Discord bot for a console survival-game server" is a proven business model, but entering it would mean building a Nitrado-API integration from scratch, competing against several incumbents, not reusing KOBA's existing WebRCON client code.

---

## Minecraft (Bedrock/console Realms vs. self-hosted)

**Current state:** Two very different models exist under the Minecraft umbrella:
- **Realms** (Microsoft-hosted, available on console): fully managed, no admin/RCON access of any kind — by design, it's a closed hosted service.
- **Bedrock Dedicated Server (BDS)**, self-hosted: this is the PC/server-software side, not something a console itself can rent/host in the RCE/GPORTAL sense.

**Admin/RCON:** Confirmed directly: **"Bedrock Dedicated Server does not implement RCON... Bedrock Edition has no RCON, at all."** Full RCON support (the `rcon.io`/third-party-bot-style remote command protocol) is a **Java Edition-only** feature, and Java Edition isn't a console product. Bedrock's workarounds (BedrockBridge, Realm Bot, MC-BotDiscord) exist, but they operate by either scripting around the server process, calling undocumented/semi-official endpoints, or in some cases only talking to Java-Edition-RCON as a different product entirely — not a true console-native RCON.

**Feasibility / prior art:** Not viable in the RCE sense. Console Minecraft is either a closed Microsoft-managed Realm (no admin API at all) or depends on Bedrock Dedicated Server, which has no RCON by protocol design. Third-party Bedrock Discord bots exist but are working around a missing feature, not integrating with a documented remote-admin surface — a materially weaker foundation than RCE's WebRCON or even DayZ's Nitrado API.

---

## Recommendation

**Rust Console Edition remains the strongest and most directly supported target by a wide margin.** It is the only game in this research with all three of: (1) official console-rentable community servers, (2) a documented, officially-supported remote console/WebRCON interface reachable by third-party tools, and (3) first-party documentation (the GitBook reviewed in Part 1) describing that interface's exact command surface.

Of the others:
- **Conan Exiles (console, via GPORTAL)** is the one worth a real follow-up look before anything else — same hosting partner as RCE, genuine documented RCON, console Admin Panel confirmed working on PS4/Xbox, and apparently under-served by third-party Discord bots today. The next concrete step, if pursued, would be confirming whether GPORTAL's console panel exposes a WebRCON/WebSocket console for Conan the way it does for RCE (not yet confirmed in this pass), since that — not raw RCON — is what KOBA Bot's existing `rcon/rcon.js` client already knows how to speak.
- **DayZ (console, via Nitrado)** has proven commercial demand (multiple competing Discord bots already exist) but requires building an entirely different integration (Nitrado's REST API) rather than extending RCE's WebRCON client, and the niche is already crowded.
- **ARK: Survival Ascended (console)** has real, working RCON, but only because console players join a PC-hosted server — it's not a console-specific ecosystem and offers nothing RCE-adjacent beyond "another RCON protocol to learn."
- **7 Days to Die, Valheim, and Minecraft Bedrock** are not realistic targets on console: 7 Days to Die's console admin tooling doesn't appear to exist in a console-rentable form; Valheim has no console command entry point at all; and Bedrock Edition has no RCON by design.

Bottom line: stay focused on Rust Console Edition for now. If a second game is ever pursued, **Conan Exiles via GPORTAL** is the one candidate structurally close enough to possibly reuse meaningful pieces of KOBA Bot's existing RCON architecture — everything else either isn't console-native, isn't RCON-capable at all, or would require a ground-up rebuild against a different provider's API.

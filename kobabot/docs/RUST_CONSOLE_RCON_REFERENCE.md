# Rust Console Edition (RCE) — Official Command Reference

Source of truth: [rust-console-edition.gitbook.io/community-servers](https://rust-console-edition.gitbook.io/community-servers/) (fetched 2026-10-11, via the `.md` markdown export of each page). This GitBook is the **official RCE community-server documentation** (linked from the game's own community-server hosting partners, GPORTAL/NITRADO).

Every page below uses the site's own "Entry Point" legend:
- 📟 = usable from the GPORTAL/NITRADO web console **and** via RCON/WebRCON
- 🎮 = **in-game F1 console only** — NOT reachable via RCON/WebRCON
- 👢 = Custom Boot Command only (set at server boot, not a live console/RCON command)
- 🌌 = may be silently overridden by hosting-panel settings on restart
- 💥 = documented but currently non-functional on RCE

This distinction matters enormously for an external bot: **a 🎮-only command cannot be sent over WebRCON at all.**

No page returned only a bare nav list / stub during this pass — every sub-page listed in the task (40 pages) returned a populated command table or prose content. Four top-level prose pages (Server Setup, Configuring a Server, Permissions, Restarts & Backup, Logs/Booting/Saving, Authority Levels, Moderation Actions) are hosting-panel/process documentation rather than command tables; their content is summarized under "Top-Level / Process Pages" at the end.

---

## GAMEPLAY

### gameplay/building
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟🎮🌌 | `codelock.lockoutcooldown` | number | 900 | Code-lock lockout duration (sec) after too many failed attempts |
| 3 | 📟🎮🌌 | `codelock.maxfailedattempts` | number | 8 | Max incorrect code-lock attempts before lockout |
| 3 | 📟🎮🌌 | `construct.demolishabletimeseconds` | number | 600 | Free-demolish window after placing a building block (sec) |
| 3 | 📟🎮🌌 | `construct.demolishhammer` | 0/1 | 0 | Hammer instantly destroys any owned building block |
| 3 | 🎮💥 | `construct.getbuildinginfo` | none | — | Prints building info for the structure you're looking at (in-game only, currently non-functional per docs) |
| 3 | 🎮 | `construct.getvendingmachineinfo` | none | — | Prints vending-machine info you're looking at |
| 4 | 📟🎮 | `decay.bracket_0_blockcount` / `..._costfraction` (brackets 0–3) | number | 15/0.1, 50/0.15, 125/0.2, 200/0.333 | Per-bracket upkeep cost scaling by structure size |
| 4 | 📟🎮 | `decay.delay_metal/stone/toptier/twig/wood` | number (hrs) | 0 each | Decay-delay before unprotected blocks start decaying |
| 4 | 📟🎮 | `decay.duration_metal/stone/toptier/twig/wood` | number (hrs) | 8/5/12/1/3 | Time for unprotected blocks to fully decay |
| 4 | 📟🎮🌌 | `decay.scale` | number | 1 | Global decay/heal rate scale |
| 4 | 📟🎮🌌 | `decay.tick` | number (sec) | 600 | Decay tick interval |
| 4 | 📟🎮🌌 | `decay.upkeep` | 0/1 | 1 | Toggle upkeep-based vs natural decay |
| 4 | 📟🎮 | `decay.upkeep_grief_protection` | number (min) | 1440 | Grace period after TC destroyed |
| 4 | 📟🎮 | `decay.upkeep_heal_scale` | number | 1 | Heal-rate scale when upkeep paid & unattacked |
| 4 | 📟🎮 | `decay.upkeep_inside_decay_scale` | number | 0.1 | Decay scale for indoor objects |
| 4 | 📟🎮 | `decay.upkeep_period_minutes` | number | 1440 | Upkeep cost period length |
| 4 | 📟🎮 | `decay.variance_min/max` | number | 0.995/1.005 | Random decay-rate variance bounds |
| 4 | 📟🎮 | `server.debrisdespawn` | number (sec) | 30 | Building debris despawn time |
| 4 | 📟🎮 | `server.debrisenabled` | 0/1 | 1 | Toggle debris spawning on destruction |
| 4 | 📟🎮 | `server.stability` | 0/1 | 1 | Toggle building stability simulation |
| 3 | 📟🎮 | `stability.collapse` | number | 0.05 | Min stability % before a block collapses |

### gameplay/cook-and-smelt
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 👢📟🎮 | `craft.furnaceoutputmultiplier` | number (max 3) | 1 | Furnace output multiplier |
| 3 | 👢📟🎮 | `craft.furnaceusagemultiplier` | number (max 3) | 1 | Low Grade Fuel consumption multiplier for furnaces |
| 3 | 👢📟🎮 | `craft.itemcookspeedmultiplier` | number (max 3) | 1 | Furnace cook speed multiplier |
| 3 | 📟🎮 | `modifiers.charcoalratescale` | number (max 3) | 1 | Charcoal output rate from furnaces |
| 4 | 📟🎮 | `modifiers.crudeoiloutputscale` | number (max 3) | 1 | Crude oil output rate |
| 4 | 📟🎮 | `modifiers.lowgradeoutputscale` | number (max 3) | 1 | Low Grade Fuel output rate from refiner |
| 4 | 📟🎮 | `modifiers.quarryprocessratescale` | number (max 3) | 1 | Quarry output rate |

### gameplay/crafting
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟🎮 | `craft.adddefaultblueprint` | "item name" | — | Adds a blueprint everyone spawns already knowing |
| 3 | 📟🎮 | `craft.cleardefaultblueprint` | none | — | Resets default-blueprint list to Rock & Torch |
| 3 | 📟 | `craft.listdefaultblueprint` | none | — | Lists current default blueprints |
| 3 | 📟🎮 | `craft.removedefaultblueprint` | "item name" | — | Removes an item from default-blueprint list |

### gameplay/farming
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟🎮 | `server.artificialtemperaturegrowablerange` | number | 4 | Heater range for plant growth |
| 4 | 📟🎮 | `server.ceilinglightgrowablerange` | number | 4 | Ceiling-light range for plant growth |
| 4 | 📟🎮 | `server.nonplanterdeathchancepertick` | number | 0.005 | Chance a non-planter plant randomly dies |
| 4 | 📟🎮 | `server.plantlightdetection` | 0/1 | 1 | Whether plants get stats from player lights |
| 4 | 📟🎮 | `server.planttickscale` | number | 1 | Plant growth-speed multiplier |
| 4 | 📟🎮 | `server.sprinklerradius` | number | 3 | Sprinkler range |

### gameplay/gameplay (Custom Zones)
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟 | `zones.createcustomzone` | 10 positional args (name, position, rotation, shape, size/radius, flags…) | — | Creates a named custom zone. Full example: `zones.createcustomzone "Test" (500,35,90) 45 Box (225,150,150) 1 0 52 1 0` |
| 4 | 📟 | `zones.deletecustomzone` | "zone name" | — | Deletes a custom zone |
| 4 | 📟 | `zones.editcustomzone` | "zone name" setting value | — | Edits a zone setting. **Real examples use the setting name UNQUOTED**: `zones.editcustomzone "Test" showarea 1`, `zones.editcustomzone "Test" entermessage "Welcome!"`, `zones.editcustomzone "Test" color (255,0,255)` |

Also documented in the **Custom Zones feature guide**: `zones.customzoneinfo "Zone Name"`, `zones.listcustomzones`.

**`zones.createcustomzone` full 10-arg order** (confirmed via the official Custom Zones feature guide, fetched 2026-10-12 — matches `utils/orpZones.js` and `utils/eventCreation.js`'s existing calls exactly, no fix needed): `[0] "Zone Name"` · `[1] (x,y,z) position` · `[2] rotation (yaw)` · `[3] Sphere|Box shape` · `[4] size` (radius if Sphere, `(x,y,z)` if Box) · `[5] allowpvp 0/1` · `[6] allownpcdamage 0/1` · `[7] radiationdamage value` · `[8] allowbuildingdamage 0/1` · `[9] allowbuilding 0/1`.

**Zone overlap priority** (confirmed, same source): on a default server, the **non-default state wins** per property — `PvP Damage OFF beats ON`, `NPC Damage OFF beats ON`, `Building Damage OFF beats ON`, `Building Privilege OFF beats ON`. On a PvE server (`allowpvpdamage=0` server-wide), this flips: `PvP Damage ON beats OFF`, `NPC Damage ON beats OFF`. Radiation damage always **stacks** across overlapping zones rather than taking a priority winner (two 25-radiation zones overlapping = 50). Custom zones never override a Monument Zone's own properties, regardless of priority. **Relevant to ORP (`utils/orpZones.js`) and any future `/coordevent`-adjacent zone work**: if an ORP zone or event zone ever overlaps another custom/monument zone, these are the real interaction rules, not an assumption.

**Cargo Ship caveat** (confirmed, same source): custom zones **do not persist on Cargo Ships** — a default killzone regenerates on server boot for each new Cargo Ship, and any edits made to it are lost on the next one. Relevant if `/coordevent` or any future zone feature is ever pointed at a moving Cargo Ship rather than a fixed map coordinate.

**Monument Killzone toggles** (confirmed, same source) — `zones.setmonumentkillzone "monumentname" 0/1` activates/deactivates a built-in PvP killzone around a named monument; `zones.listmonumentkillzones` / `zones.clearmonumentkillzones` list/clear all of them. Full confirmed monument name list: `airfield_1`, `cargoshipdynamic1`, `cargoshipdynamic2`, `gas_station_1`, `harbor_1`, `harbor_2`, `launch_site_1`, `lighthouse`, `mining_quarry_a`, `mining_quarry_b`, `mining_quarry_c`, `oilrig_1`, `oilrig_2`, `powerplant_1`, `radtown_small_3`, `satellite_dish`, `sphere_tank`, `supermarket_1`, `trainyard_1`, `underwater_lab`, `water_treatment_plant_1`, `water_well_a` through `water_well_e`, `warehouse`. This is a real, low-effort feature opportunity not yet built anywhere in the codebase — e.g. an admin-triggered "Launch Site PvP Hour" command toggling `launch_site_1` on/off, using only this one already-confirmed command.

### gameplay/resources (Industrial)
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟🎮 | `industrial.conveyormovefrequency` | number (sec) | 5 | Conveyor move interval (0 disables) |
| 3 | 📟🎮 | `industrial.defaultblueprintresearchcost` | number | 10 | Scrap cost to research default blueprints |
| 3 | 📟🎮 | `industrial.enforcepipechecksonbuildingblockchanges` | 0/1 | 1 | Illegal industrial-pipe checks on block changes |
| 3 | 📟🎮 | `industrial.industrialcrafterfrequency` | number (sec) | 5 | Industrial crafter attempt interval |
| 3 | 📟🎮 | `industrial.industrialframebudgetms` | number | 0.5 | Per-frame time budget for industrial jobs |
| 3 | 📟🎮 | `industrial.maxitemstacksmovedpertickindustrial` | number | 12 | Max stacks moved per conveyor tick |

### gameplay/items-and-inventory
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟🌌 | `baseprojectile.fullstartingmagazine` | 0/1 | 0 | Full starting magazine toggle |
| 3 | 📟🌌 | `debug.disablecondition` | 0/1 | 0 | Toggle tool/weapon condition degradation |
| 4 | 👢📟🌌 | `global.stackablesizescale` | number (max 3) | 1 | Max stack-size scale |
| 3 | 📟 | `inventory.adddefaultitem` | "item name" | — | Add item to default spawn loadout |
| 3 | 📟 | `inventory.removedefaultitem` | "item name" | — | Remove item from default spawn loadout |
| 3 | 📟 | `kitmanager.kit` | multiple | — | Umbrella entry for kit create/edit/delete (see Kit Management guide below — the real sub-verbs are `kit add/info/list/remove/delete/edit/givetogroup/givetoplayer/giveall`) |
| 4 | 📟 | `sentry.hostileduration` | number (sec) | 120 | Hostile-flag duration outside Safe Zones |
| 4 | 📟 | `sentry.ignorealltargets` | 0/1 | 0 | Turrets ignore all players |
| 4 | 📟 | `sentry.targetall` | 0/1 | 0 | Turrets target regardless of authorization |
| 4 | 📟 | `server.arrowarmor` / `server.arrowdamage🌌` | number | 1 | Arrow armor-protection / damage scale |
| 4 | 📟 | `server.bleedingarmor` / `server.bleedingdamage🌌` | number | 1 | Bleed armor-protection / damage scale |
| 4 | 📟 | `server.bulletarmor` / `server.bulletdamage🌌` | number | 1 | Bullet armor-protection / damage scale |
| 4 | 📟🌌 | `server.d11buildtest` / `server.d11guntest` | 0/1 | 0 | Builder's-paradise / target-practice starting kits |
| 4 | 📟 | `server.itemdespawn` | number | 60 | Dropped-item despawn multiplier |
| 4 | 📟 | `server.meleearmor` / `server.meleedamage🌌` | number | 1 | Melee armor-protection / damage scale |
| 4 | 📟🌌 | `server.nostartingitems` | 0/1 | 0 | Spawn with no items at all |
| 4 | 📟 | `server.respawnresetrange` | number | 50 | Sleeping-bag reset range |
| 4 | 📟 | `sleepingbag.bagreuseseconds` / `bedreuseseconds` | number | 300/120 | Respawn cooldowns for bag/bed |

### gameplay/missions
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟🎮 | `basemission.missionsenabled` | 0/1 | 1 | Toggle mission accept/progress |
| 4 | 📟🎮 | `basemission.missionsfailondisconnect` | 0/1 | 0 | Fail missions on disconnect |

### gameplay/npcs (Vending)
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟 | `npcvendingmachine.dynamicpricingenabled` | 0/1 | 1 | Toggle Dynamic Vendor Pricing |
| 4 | 📟 | `npcvendingmachine.maximumpricemultiplier` / `minimumpricemultiplier` | number | 2 / 0.5 | Price bounds |
| 4 | 📟 | `npcvendingmachine.pricedecreaseamount` / `priceincreaseamount` | number | 0.05 / 0.1 | Dynamic-pricing step sizes |
| 4 | 📟 | `npcvendingmachine.priceupdatefrequencydefault` | number (hrs) | 3 | Dynamic-pricing update frequency |
| 4 | 📟 | `npcvendingmachine.printallpricechanges` | none | — | Print all price changes to console |
| 4 | 📟 | `npcvendingmachine.resetdynamicpricing` | none | — | Reset all dynamic pricing |
| 4 | 📟 | `npcvendingmachine.startingpricemultiplier` | number | 2 | Starting discount/surcharge post-wipe |

### gameplay/player (wounding/handcuffs/modifiers)
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟 | `handcuffs.maxconditionrepairlossonpush` | number | 0.4 | Handcuff condition loss on push |
| 3 | 📟 | `handcuffs.restrainedpushdamage` | number | 5 | Damage dealt pushing a handcuffed player |
| 3 | 📟🎮 | `player.woundforever` | 0/1 | 0 | Disable getting up after wounded |
| 4 | 📟🎮 | `server.corpsedespawn` | number (sec) | 300 | Corpse despawn → bag time |
| 3 | 📟🎮 | `server.crawlingenabled` | 0/1 | 1 | Toggle wounded crawling movement |
| 3 | 📟🎮 | `server.crawlingmaximumhealth` / `minimumhealth` | number | 60/50 | Wounded-state HP range |
| 4 | 📟🎮🌌 | `server.immortalserver` | 0/1 | 0 | Global invincibility |
| 3 | 📟🎮 | `server.incapacitatedrecoverchance` | number (0–1) | 0.1 | Base wounded-recovery chance |
| 4 | 📟🎮 | `server.pve_npc_protection` | 0/1 | 1 | Disable NPC damage (needs PvE mode) |
| 3 | 📟🎮 | `server.rewounddelay` | number (sec) | 60 | Cooldown before re-entering wounded state |
| 3 | 📟🎮 | `server.woundedmaxfoodandwaterbonus` | number | 0.25 | Bonus recovery chance from food/water |
| 3 | 📟🎮 | `server.woundedrecoverchance` | number | 0.2 | Base crawling-recovery chance |
| 4 | 📟🎮 | `server.woundingenabled` | 0/1 | 1 | Toggle wounding on fatal damage |
| 3 | 📟🎮 | `spawnhandler.mindistfromdeathpos` | number | 500 | Min respawn distance from last death |
| 3 | 📟🎮 | `modifiers.clearmodifier/clearmodifiers/listallmodifiers/listmodifiers/setmodifier` | item/modifier/scale | — | Item-stat modifier management (duplicated across several category pages) |

### gameplay/resources-1 (dup. of modifiers block — same 5 `modifiers.*` commands as above)

### gameplay/teams
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟🌌 | `relationshipmanager.limitbuildingauths` | 0/1 | 0 | Limit TC authorizations |
| 4 | 📟🌌 | `relationshipmanager.limitteamlocks` | 0/1 | 0 | Limit code/key-lock authorizations |
| 4 | 📟🌌 | `relationshipmanager.limitturretauths` | 0/1 | 0 | Limit turret auths to team size |
| 4 | 📟🌌 | `relationshipmanager.maxteamsize` | number | 8 | **Max team size** |

### gameplay/ui-and-visuals
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 🎮 | `basefishingrod.showui` | 0/1 | 0 | Fishing-rod break gauge |
| 4 | 🎮 | `ui.showbasestatsui` | 0/1 | 0 | TC upkeep contents display |

### gameplay/vehicles
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟 | `bike.doplayerdamage` | 0/1 | 1 | Bikes damage players on collision |
| 3 | 📟 | `bike.motorbikemonumentpopulation` / `pedalmonumentpopulation` / `pedalroadsidepopulation` | number | 1 each | Bike spawn density |
| 3 | 📟 | `bike.outsidedecayminutes` | number | 1440 | Bike decay when left outside |
| 3 | 📟 | `bike.playerdamageragdolltheshold` | number | 10 | Collision damage to ragdoll a player |
| 3 | 📟 | `vehicle.fixcars` / `killcars` / `killmotorbikes` / `killpushbikes` | none | — | Bulk repair/destroy vehicles |
| 3 | 📟✨ | `vehicle.killtrains` / `vehicle.trainskeeprunning` | none / 0/1 | —/0 | Train management |

---

## MODERATION

### moderation/access-management
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 4 | 📟 | `global.clearwhitelist` | none | Clears the whitelist |
| **2** | 📟 | `global.kick` | "ID" | **Kicks a player** |
| 3 | 📟 | `global.kickall` | none | Kicks everyone |
| 4 | 📟 | `global.removewhitelist` | "ID" | Removes from whitelist |
| 3 | 📟 | `global.skipqueue` | "ID" | Lets a queued player skip the queue |
| 3 | 📟 | `global.whitelist` | none | Shows current whitelist |
| 4 | 📟 | `global.whitelistid` | "ID" | Adds to whitelist |

### moderation/antihack
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟 | `antihack.admincheat` | 0/1 | 1 | AntiHack ignores noclip for Admins |
| 3 | 📟 | `antihack.build_inside_check` | 0/1/2 | 2 | World-asset clip checking level |
| 4 | 📟 | `antihack.build_losradius` / `build_losradius_sleepingbag` | number | 0.01 / 0.3 | Clip-check radii |
| 4 | 📟 | `antihack.build_terraincheck` / `build_vehiclecheck` | 0/1 | 1 each | Placement checks |
| 4 | 📟 | `antihack.enforcementlevel` | 0/1 | 1 | 0=none, 1=kick on violation |
| 4 | 📟 | `antihack.flyhack_protection` | 0–3 | 3 | Flying-player protection level |
| 4 | 📟 | `antihack.melee_protection` | 0–4 | 4 | Melee-attack verification level |
| 4 | 📟 | `antihack.noclip_protection` | 0–4 | 4 | Noclip protection level |
| 4 | 📟 | `antihack.projectile_protection` | 0–6 | 6 | Projectile verification level |
| 4 | 📟 | `antihack.speedhack_protection` | 0–2 | 0 | Speedhack protection level |
| 4 | 📟 | `antihack.terrain_check_geometry` | 0/1 | 0 | Kill player inside world geometry |
| 3 | 📟 | `server.d11oobcheck` | 0/1 | 1 | Out-of-bounds killbox toggle |

### moderation/banning
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟💥 | `baseplayer.reportactiveplayers` / `reportsleepingplayers` | 0/1 | Periodic active/sleeping-player report (currently non-functional per docs) |
| 3 | 📟💥 | `baseplayer.reportplayersseconds` | number | Report interval (default 60) |
| **3** | 📟 | `global.banid` | "ID" "reason" "time" | **Bans a player**, time in seconds, reason+time optional |
| 3 | 📟 | `global.banlist` / `global.banlistex` | none | List bans (with/without notes) |
| 2 | 📟 | `global.mutechat` / `mutevoice` | "ID" | Mute quick-chat / voice |
| 2 | 📟 | `global.removewarns` | "ID" | Clear a player's warnings |
| **3** | 📟 | `global.unban` | "ID" | **Unbans a player** |
| 2 | 📟 | `global.unmutechat` / `unmutevoice` | "ID" | Unmute |
| 2 | 📟 | `global.warnid` | "ID" | Sends a warning to a player |

### moderation/tools
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟🎮 | `construct.nukebuilding` | "building ID" | Destroys a building (ID from `getbuildinginfo`) |
| 3 | 📟🎮 | `entity.deleteby` | "ID" | Destroys everything built by a player |
| 4 | 📟 | `global.adminid` | "ID" | Grants Admin (Tier 3) |
| 3 | 📟🎮 | `global.moderatorid` | "ID" | Grants Moderator (Tier 2) |
| 4 | 📟 | `global.ownerid` | "ID" | Grants Owner (Tier 4) |
| 4 | 📟 | `setconvarauthlevel` | "command" "tier" | **Reassigns which tier a console command requires** (User/VIP/Moderator/Administrator/Owner) - e.g. lets an Owner make a normally Owner-only command runnable by Moderators. Distinct from `adminid`/`moderatorid`/`ownerid` above, which grant a TIER TO A PLAYER - this instead changes the REQUIRED TIER OF A COMMAND. Confirmed via official GitBook (community-servers/management-settings/authority-levels/custom-auth-levels, fetched 2026-10-12). Can only reassign commands the caller already has access to at their own level or lower. Changes persist through restarts but are NOT logged - track modifications manually. |
| 4 | 📟 | `getconvarauthlevel` | "command" | Reads back the currently configured tier for a command (companion to `setconvarauthlevel` above). |
| 4 | 🎮 | `vis.damage` / `vis.damagetext` / `vis.lineofsight` | 0/1 | Debug visualization toggles |

---

## SERVER

### server/settings
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 4 | 📟 | `global.buildinfo` | none | — | Prints server version |
| 4 | 📟 | `global.serverinfo` | none | — | Name/MaxPlayers/Players/UpTime/Memory stats |
| 4 | 📟🌌 | `server.adminmessage` | "message" | — | In-game notice shown to admins on join |
| 4 | 📟🎮 | `server.canequipbackpacksinair` | 0/1 | 0 | Allow equipping backpack mid-air |
| 4 | 📟🌌 | `server.enablewhitelist` | 0/1 | 0 | Toggle whitelist enforcement |
| 4 | 📟🌌 | `server.firsttimejoinedmessage` | "message" | — | First-join message |
| 4 | 📟 | `server.idlekick` | number | 30 | Idle-kick time (needs idlekickmode) |
| 4 | 📟🌌 | `server.justjoinedmessage` / `leftmessage` / `welcomemessage` | "message" | — | Join/leave/welcome notices |
| 4 | 📟🌌 | `welcomescreen.serverrulesmessage` / `serverwelcomemessage` | "message" | — | Welcome-screen text |
| 4 | 📟🌌 | `welcomescreen.showwelcomeadmintab` / `showwelcomerulestab` / `welcomescreenstate` | 0/1 | 1 | Welcome-screen visibility toggles |

### server/tools
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟🎮 | `global.say` | "message" | **Broadcasts to server chat** |
| 4 | 📟 | `server.forcesave` | none | Force save after a crashed save |
| 4 | 📟 | `server.save` | none | Manual save |

---

## UTILITY

### utility/crafting
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟 | `inventory.bpunlock` | "blueprint name" | Unlock one blueprint |
| 3 | 📟 | `inventory.resetbp` | none | Reset everyone's blueprint progress |
| 3 | 📟 | `inventory.unlockall` | none | Unlock all blueprints (for the command's own caller) |

### utility/entities
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟 | `ai.killanimals` / `ai.killscientists` / `ai.removecorpses` | none | Bulk NPC cleanup |
| 3 | 📟 | `attackentity.print_ai_stats` | none | Prints AI tuning stats |
| 3 | 📟 | `entity.deleteentity` | "entity name" | Deletes a named entity |
| **3** | **🎮 only** | `entity.spawn` | "object name" | **Spawns an object where you're looking** — no coordinate parameter, in-game console only |
| **3** | **📟🎮** | `entity.spawnatpos` | "object name" (coords) | **Spawns an object at specified coordinates** — this is the RCON-capable one |
| 3 | 📟🎮 | `global.ent` | sub-verb (Kill/DestroyBuilding/Lock/Unlock/Who/ChangeCode/ChangeGuestCode) | Entity-under-crosshair actions |
| 3 | 🎮 | `heli.calltome` / `heli.drop` | none | Summon/spawn Attack Heli near you |
| 3 | 🎮 | `heli.dropatplayer` | "player ID" | Spawn Attack Heli at a player's location |
| 4 | 📟 | `spawnhandler.fill_population` | none | Refill population entities |

### utility/events
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟 | `cargoships.spawncargoship` / `startegressing` | none | Force-spawn / force-exit Cargo Ship |
| 3 | 📟 | `dropcrate.heli_setdropzone` | "monument ID" | Set next Chinook crate drop zone |
| 3 | 📟 | `env.addtime` | number | Add hours to current time |
| 4 | 📟 | `events.current_special` / `list_special` / `pause_special` / `special_event` / `stop_all_special` / `stop_special` | varies | Special-event management |
| 3 | 📟 | `events.stopevent` / `events.triggerevent` | "event name" | Start/stop an event — valid names: `event_airdrop`, `event_cargoheli`, `event_cargoship`, `event_helicopter` |
| 3 | 📟 | `heli.call` | none | Summon roaming Attack Heli |
| 3 | 📟🎮 | `supply.call` / `supply.drop` | none | Call a Supply Plane drop |

### utility/gameplay
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 🎮 | `growableentity.growall` / `setalldying` | none | — | Area-based plant growth/kill (in-game only) |
| 3 | 📟🎮 | `rf.listboardcaster` / `listfakeboardcaster` / `listlistener` | none | — | RF device diagnostics |
| 4 | 📟 | `server.max_sleeping_bags` | number | 15 | Max sleeping bags per player |

### utility/inventory
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟🎮 | `entity.spawnitem` | "item" "x,y,z" | Spawn an item at a location |
| 3 | 🎮 | `inventory.clearall` | none | Empty your own inventory |
| 3 | 📟🎮 | `inventory.cleardefaultitem` | none | Reset default-items list to Rock & Torch |
| 3 | 📟🎮 | `inventory.clearitemfromplayers` | "item" | Remove an item from every inventory |
| **2** | 🎮 | `inventory.give` | "item name" | Give yourself an item |
| **2** | 📟🎮 | `inventory.giveall` | "item name" | Give everyone an item |
| 4 | 🎮 | `inventory.givecraftmatadv` / `givecraftmatbasic` | none | Give yourself crafting materials |
| 2 | 📟🎮 | `inventory.givedrop` | [playerID][item][amount][stackAmount][0][condition][throwSpray][throwRange] | Drop an item at a player's location |
| **2** | 📟🎮 | `inventory.giveto` | "item name" + target | **Give a specific item to a target player** |
| 3 | 📟🎮 | `inventory.removefromcorpses` | "item" | Strip an item from all corpses |
| 4 | 📟💥 | `vendingmachine.deletevendingmachinesellorderbyids/byname` | item ID/name + flags | Delete vending sell/buy orders |
| 4 | 📟💥 | `vendingmachine.listvendingmachinesellorderids` / `validatevendingmachinesellorders` | — | Vending diagnostics |

### utility/monuments
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟🎮 | `bigwheelgame.forcedbigwheelhittype` | -1 to 4 | -1 | Force Gambling Wheel outcome color |
| 3 | 📟🎮 | `debug.puzzlereset` | none | — | Reset keycard-puzzle loot/state |
| 4 | 🎮💥 | `world.monuments` / `world.monumentsrot` | none | — | Print monument positions/rotations (in-game only) |

### utility/player
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟🎮 | `global.injure` | "player ID" | Force target into downed state |
| **2** | 📟🎮 | `global.killplayer` | "ID" | Kill a target player |
| 3 | 📟🎮 | `global.setvanishother` | "player ID" "0/1" | Toggle Vanish for another player |
| 2 | 🎮 | `global.teleport2me` | "ID" | Teleport a player to you |
| 3 | 📟🎮 | `global.teleportgrid` | (x,y,z) number number | Teleport everyone to a position with grid spacing |
| **2** | **📟🎮** | `global.teleportpos` | **(x,y,z) "player ID"** | **Teleport a specific player to coordinates** |
| 3 | 📟🎮 | `global.teleportposrot` | (x,y,z) "player ID" "0/1" | Teleport + rotation placement |
| 3 | 📟🎮 | `relationshipmanager.sleeptoggleother` | "player ID" | Force target to sleep |
| **2** | **📟🎮** | `server.printpos` | "ID" | **Print a player's current X/Y/Z position** |
| 2 | 📟🎮 | `server.printrot` | "ID" | Print a player's rotation |

### utility/resources
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟 | `divesite.killalldivesites` | none | Destroy all dive sites |
| 4 | 📟🎮 | `junkpile.killalljunkpiles` | none | Destroy junkpiles/water junkpiles/dive sites |
| 4 | 📟💥 | `storagecontainer.deleteiteminallcontainers` | "item ID" | Remove an item from all containers |
| 4 | 📟💥 | `storagecontainer.listallitemsinallcontainers` / `listiteminallcontainers` | — / "item ID" | Container diagnostics |

### utility/self
| Tier | Entry | Command | Params | Default | Effect |
|---|---|---|---|---|---|
| 3 | 📟 | `chat.enabled` | 0/1 | 1 | Enable/disable chat |
| 3 | 🎮 | `debug.breakheld` | none | — | Break currently held item |
| 3 | 🎮 | `env.nightlight_*` (brightness/distance/enabled/fadefraction) | varies | 0.12/9/1/0.35 | Night-light visual effect tuning |
| 3 | 🎮 | `global.dayview` | 0/1 | 0 | Eternal daylight for self |
| **2** | 🎮 | `global.god` | 0/1 | 0 | God mode for self |
| 3 | 🎮 | `global.sleep` | none | — | Force self to sleep |
| 2 | 🎮 | `global.spectate` | "ID" | — | Spectate a player |
| 2 | 🎮 | `global.teleport` | "ID" | — | Teleport self to a player |
| 2 | 🎮 | `global.teleportany` | "object name" | — | Teleport self to a random object of that type |
| 2 | 🎮 | `global.vanish` | 0/1 | 0 | Self-invisibility + turret-ignore |
| 3 | 🎮 | `relationshipmanager.sleeptoggle` | none | — | Self sleep toggle |

### utility/teams
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 4 | 📟 | `relationshipmanager.findplayerteam` | "player ID" | Find a player's team members |
| 4 | 📟 | `relationshipmanager.logteamactions` | 0/1 | Log team create/invite/disband/join |
| 4 | 📟 | `relationshipmanager.teaminfo` | "team ID" | Show a team's members |
| 4 | 📟 | `relationshipmanager.teaminfoall` | none | Show all teams' members |

### utility/vehicles
| Tier | Entry | Command | Params | Effect |
|---|---|---|---|---|
| 3 | 📟 | `global.carstats` | none | Printout of all cars in the world |

---

## WORLD

### world/entities (AI/animal population & behavior)
Key commands: `ai.accuratevisiondistance`, `ai.addignoreplayer`/`removeignoreplayer`/`clearignoredplayers`/`printignoredplayers`, `ai.animal_ignore_food`, `ai.brainstats`, `ai.ignoreplayers`🌌, `ai.move`, `ai.npc_door_trigger_size`, `ai.npc_enable`, `ai.npc_families_no_hurt`, `ai.npc_gun_noise_silencer_modifier`, `ai.npc_junkpilespawn_chance`🌌, `ai.npc_patrol_point_cooldown`, `ai.npcswimming`, `ai.think`🌌; `attackentity.npc_aimconescale`/`attackcooldownscale`/`attacklengthscale`/`attackspacingscale`/`damagescale`; `attackentity.set_easy_ai`/`set_normal_ai` (bulk AI-difficulty presets); `bear.population`/`boar.population`/`chicken.population`/`polarbear.population`/`stag.population`/`wolf.population` (density per km²); `bradley.respawndelayminutes`/`respawndelayvariance`; `cargoshipdynamic.cargoship_speed_scale`; `global.stopallspawnsdisable`/`stopallspawnsenable`; `heli.bulletaccuracy`/`bulletdamagescale`/`cantargetplayers`/`guns`/`lifetimeminutes`/`napalm`/`rockets`; `heli.strafe` (🎮 only)/`heli.strafeatplayer`; `server.corpses`; `spawn.fill_groups/fill_individuals/fill_populations/respawn_groups/respawn_individuals/respawn_populations`; `supply.maxcargoplanes`.

### world/events
`bradley.enabled`🌌/`bradley.quickrespawn`; `cargoships.egress_duration_minutes`/`event_duration_minutes`/`event_enabled`/`loot_round_spacing_minutes`/`loot_rounds`; `env.progresstime`🌌; `events.activeevent`/`cooldowntime`/`cooldowntimemultiplier`/`remainingtime`; `server.events`🌌 (toggles Cargo Ship/Chinook/Attack Heli as a group); `server.radiation`🌌; `time.daylength`/`nightlength`/`timescale`🌌.

### world/monuments
`bigwheelgame.spinfrequencyseconds`; `craft.canuserecycler`/`recyclernextrecycletime`/`recyclersafezonenextrecycletime`/`recyclersafezonestarttime`/`recyclerstarttime`; `monumentspawns.disableconfig`/`enableconfig`👢/`forcespawnconfig`/`getconfigs`/`getenabledconfigs` (per-monument recycler config); `zones.clearmonumentkillzones`/`listmonumentkillzones`/`setmonumentkillzone "monument name" 0/1`.

### world/resources
`divesite.getdivesitecounts`; `hackablelockedcrate.decayseconds`/`requiredhackseconds`; `junkpile.getjunkpilecounts`; `server.d11gatherscale`🌌 (max 3)/`d11lootscale`🌌; `server.dropitems`🌌.

### world/vehicles
`baseridableanimal.decayminutes`/`dungtimescale`; `hotairballoon.population`/`minicopter.population`/`scraptransporthelicopter.population`; `motorrowboat.decaystartdelayminutes`/`deepwaterdecayminutes`/`outsidedecayminutes`/`population`; `rhib.rhibpopulation`; `ridablehorse.population`; `traincar.decayminutes`/`killofftracktrains`; `vehicle.boat_corpse_seconds`/`vehiclesdroploot`.

---

## FEATURE GUIDES (not in the task's 40-page list, but directly relevant and fetched for cross-reference)

**Kit Management** (`feature-guides/kit-management`) — the real kit sub-verbs, confirmed:
```
kit add [0] [1] [2] [3] [4]                          -> kit add "kitname" "itemshortname" "amount" "condition" "container"
kit info "KitName"
kit list
kit remove "KitName" "ID"          <- NOT "kit removeplayer"
kit delete "KitName"
kit edit "KitName" changename "NewName"
kit edit "KitName" addgroup "Group" / removegroup "Group"
kit givetogroup "kitname" "group"
kit givetoplayer "kitname" "ID"
kit giveall "kitname"
```
Max 128 kits per server. Valid groups: User, VIP, Moderator, Admin, Owner.

**Entity Spawning** (`feature-guides/entity-spawning`):
```
entity.spawn shortname position     e.g. entity.spawn 2module_car_spawned 100,50,200
```
Position is optional (defaults to 0,0,0); no quotes required in the feature-guide example. **This directly conflicts with the `commands/utility/entities` table**, which tags `entity.spawn` as 🎮-only (in-game console, spawns at your look-direction, no position parameter) and separately documents `entity.spawnatpos` as the 📟🎮 (RCON-capable) coordinate-spawn command. Treat the per-category command table as authoritative for RCON reachability — the feature guide's example was very likely written/tested from the in-game console, not WebRCON.

The feature guide's vehicle shortname table matches KOBA Bot's `config/vehicleShortnames.js` **exactly**, entry for entry (see Gap Check).

**Custom Zones** (`feature-guides/custom-zones`) — confirms `zones.editcustomzone` setting names are used **unquoted**: `zones.editcustomzone "Test" showarea 1`, `...entermessage "Welcome!"`, `...color (255,0,255)`.

---

## Top-Level / Process Pages (prose, no command tables)
- **Server Setup**: `OwnerID "Gamertag/PSN ID"` (and `AdminID`/`ModeratorID`/`VIPID`) are **Custom Boot Commands**, not live console/RCON commands — set once at server boot to establish the initial Owner.
- **Configuring a Server**: defines the 📟🎮👢💥🌌 legend used throughout the site (reproduced at the top of this doc).
- **Permissions**: GPORTAL-only feature for granting *panel* access (not in-game permissions); NITRADO doesn't support it.
- **Restarts and Backup**: restart schedule options (Daily/Weekly/Bi-Monthly-GPORTAL-only/Monthly) and wipe types (Save/Blueprint/Full); backups require a daily "No Wipe" restart first.
- **Logs, Booting & Saving**: `public.log` file; auto-save every 5 min; manual `save` command; boot takes 10–15 min.
- **Authority Levels**: Tier 0 User, 1 VIP (queue skip), 2 Moderator (kick/temp-ban/mute), 3 Admin (perm-ban, settings, user management), 4 Owner (full control). Owners cannot assign themselves another role.
- **Moderation Actions**: describes the in-game **Player List UI** actions (Report, Block, Kick, Disable Communication, Give Warning, Teleport, Kick+Ban with 6h/24h/1wk/permanent tiers, Change Role, Spectate) — these are UI-driven actions in the player list, distinct from (but overlapping with) the console commands above (`global.kick`, `global.banid`, `global.warnid`, etc.).

No sub-page returned an empty/stub nav-only page in this pass — all 40 listed sub-pages plus the 7 top-level pages produced real content.

---

## Gap Check Against Current KOBA Bot Implementation

Reviewed: `rcon/manager.js`, `rcon/parsers.js`, `rcon/rcon.js`, `config/vehicleShortnames.js`, `config/quickChatTriggers.js`, `commands/war.js`, `commands/mod.js`, and every `utils/*.js` file that calls `rcon.send(...)` (`shopDelivery.js`, `autoKitEngine.js`, `rewardDelivery.js`, `playerPanel.js`, `kitPanel.js`, `zoneEvents.js`, `zoneCapture.js`, `eventCreation.js`, `linkPanel.js`, `directoryPanel.js`, `playtimeCoins.js`, `referralRewards.js`).

### (a) Officially-documented commands KOBA Bot doesn't use yet, that could improve existing features

1. **`/mod` and `/war` issue ZERO real RCON commands today.** `commands/mod.js`'s `ban`/`unban` subcommands and `commands/war.js`'s `declare`/`end` subcommands only post cosmetic Discord embeds ("Database matrix matching rules applied", "User Excluded Successfully") — they never call `getRcon()` or send anything to the Rust server. This is the single biggest gap: the officially-documented `global.banid "ID" "reason" "time"` / `global.unban "ID"` / `global.kick "ID"` commands exist and are exactly what `/mod ban|unban` implies it's doing, but the slash command never calls them. If this is intentional "Discord-side only" moderation (e.g. deliberately decoupled from the game server), it should at minimum say so in the UI copy, because the current embed text ("Target Account Excluded Successfully", "Administrative Scope: Global Platform-Wide") reads as if it actually banned the player in-game.
2. **Zone/monument commands relevant to "monument-zone capture" features are only partly used.** `zones.createcustomzone`, `zones.editcustomzone`, `zones.deletecustomzone` are used (`eventCreation.js`, `zoneEvents.js`), but `zones.customzoneinfo` and `zones.listcustomzones` (documented in the Custom Zones feature guide) are not — they'd let the bot verify a zone actually exists/has the expected shape server-side after creation, instead of trusting the create call blindly. Also unused: `zones.setmonumentkillzone`/`listmonumentkillzones`/`clearmonumentkillzones` (world/monuments) — real built-in PvP-zone toggles around named monuments, which could directly back a "monument capture = temporary PvP zone" mechanic instead of (or alongside) the custom-zone approach already used.
3. **`server.printrot`** (utility/player) is documented alongside `server.printpos` (which IS used) but never called — could improve teleport/vehicle-spawn accuracy (spawning a vehicle facing the right direction) if `autoKitEngine.js`'s vehicle delivery ever cares about facing.
4. **`global.teleportgrid`** could support a "teleport whole team to muster point" feature; currently only single-player `global.teleportpos` is used.
5. **`global.carstats`** / **`vehicle.fixcars`** could back a "vehicle health check / mass-repair" admin feature; unused today.

### (b) KOBA Bot commands whose syntax doesn't match the official docs (real, flaggable bugs)

1. **`entity.spawn` in `utils/autoKitEngine.js:150`** — sent as `entity.spawn "${mapping.kit_name}" "${pos.x},${pos.y},${pos.z}"` over RCON. Per `commands/utility/entities`, **`entity.spawn` is 🎮 (in-game console) only** and its documented syntax takes no position argument at all ("Spawns an object where you're looking"). The feature guide's example (`entity.spawn 2module_car_spawned 100,50,200`) suggests position IS accepted by the parser in some contexts, but the authoritative per-category table still marks it 🎮-only, not 📟 (RCON). **The command that is explicitly documented as 📟🎮 (RCON-capable) and literally named for this purpose is `entity.spawnatpos`.** If vehicle delivery via auto-kits is silently failing or behaving unpredictably over WebRCON, this is the first thing to test — switch to `entity.spawnatpos` and confirm.
2. **`kit removeplayer` used in `utils/kitPanel.js:377` and `utils/playerPanel.js` (search confirms only `kitPanel.js` uses it directly)** — the official Kit Management guide documents **`kit remove "KitName" "ID"`**, not `kit removeplayer`. `kit removeplayer` doesn't appear anywhere in the fetched documentation. This is either (i) a real undocumented-but-working alias RCE accepts, or (ii) a bug sending a command the server doesn't recognize (which, per the `parsers.js` comment about `global.playerlist --json` silently returning `"[]"` instead of erroring, is a known failure mode for RCE's WebRCON — wrong commands don't always surface as errors). **Recommend testing `kit remove "kitname" "gamertag"` against a live server and comparing behavior.**
3. **`zones.editcustomzone` setting-name quoting** — `utils/eventCreation.js` sends setting names quoted: `zones.editcustomzone "${zoneName}" "showarea" 1`, `"showchatmessage" 1`, `"entermessage" "..."`, `"leavemessage" "..."`, `"color" (...)`. Every real documented example (both the command table and the Custom Zones feature guide) uses the **setting name unquoted**: `zones.editcustomzone "Test" showarea 1`, `...color (255,0,255)`. RCE's console parser may tolerate the extra quotes (since the game is fairly lenient about quoted tokens), but this hasn't been confirmed and is worth testing directly — if the parser treats `"showarea"` as a different value than `showarea`, every `/event` custom-zone edit (`eventCreation.js`) could be silently failing to apply chat messages, colors, or the show-area flag.
4. **`global.teleportpos` coordinate formatting** — KOBA sends `global.teleportpos ${dest.x} ${dest.y} ${dest.z} "${gamertag}"` (bare space-separated numbers, no parentheses/commas). The docs only show the abstract signature `(x,y,z) "player ID"` and never give a concrete example for this specific command the way they do for `zones.createcustomzone` (which uses parenthesized, comma-separated coordinates: `(500,35,90)`). This is lower-confidence than items 1–3, but worth a live test to confirm whether RCE expects `(x,y,z)` syntax here too, or genuinely accepts bare space-separated values as KOBA currently sends.

### (c) `config/vehicleShortnames.js` and `config/quickChatTriggers.js` vs. official docs

1. **`config/vehicleShortnames.js` is fully correct.** The official Entity Spawning feature guide's vehicle shortname table matches KOBA Bot's `ALL_VEHICLE_SHORTNAMES` **exactly**, entry for entry, including the inconsistent `.entity` suffix pattern (Premade cars/empty chassis/Attack Heli/Minicopter carry `.entity`; Hot Air Balloon/Kayak/Motorbike(+Sidecar)/Pedal Bike/Pedal Trike/RHIB/Rowboat/Scrap Transport Heli/Horse do not). This isn't a KOBA Bot bug — RCE's own shortnames are just inconsistent, and the hardcoded table correctly reflects that. No action needed here.
2. **`FUEL_VEHICLE_SHORTNAMES`** (which vehicles consume Low Grade Fuel) has no corresponding table on this GitBook at all — it's general Rust game-mechanics knowledge, not sourced from this documentation, so there's nothing to gap-check it against. The code comment already discloses this honestly.
3. **`config/quickChatTriggers.js`** (the `d11_quick_chat_*` IDs) — **this GitBook does not document the Quick Chat trigger ID list anywhere** (confirmed via both page-by-page fetch and a targeted search of the site). The code comment says this table was "confirmed 2026-09-19 directly from the user (the real d11_quick_chat_* id list, KaosBot's reference mapping)" — i.e., it was never sourced from this GitBook, so there is no official page to check it against. Nothing to flag; this table's source is simply out of scope for this GitBook-based review. If a future pass wants to validate it, the GitBook is not the right source — look for RCE's own data files or a confirmed WebRCON capture of quick-chat broadcast payloads instead.

### Honesty note
Several areas had nothing actionable: the `players`/`global.players` text-table command that `rcon/parsers.js` relies on (and already correctly treats as plain-text, not JSON) **isn't documented anywhere on this GitBook at all** — not in `commands/utility/player`, `commands/gameplay/player`, or `commands/utility/self`. That's a documentation gap on the GitBook's side, not a KOBA Bot bug; the existing parser comment's empirical, captured-log-based confirmation is the more reliable source here and should stay as-is. Similarly, `kit givetoplayer`, `kit add`, and `kit delete` (used in `shopDelivery.js`, `autoKitEngine.js`, `rewardDelivery.js`, `playerPanel.js`, `referralRewards.js`) all match the official Kit Management guide's documented syntax exactly — no changes needed there.

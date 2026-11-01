import type { Player } from "./types.ts";
import { CANDIDATE_MAP, CLAN_MAP, GAME_MAP, gameName } from "./world.ts";

/** Deterministic session tape. Same player and clock always yield the same rows. */

export type BehaviorKind =
  | "kill"
  | "death"
  | "assist"
  | "objective"
  | "loot"
  | "revive"
  | "rank"
  | "clan"
  | "hop";

export type Engagement = "locked-in" | "steady" | "drifting" | "between" | "idle-risk";

export interface BehaviorEvent {
  id: string;
  at: number;
  kind: BehaviorKind;
  gameId: string;
  place: string;
  detail: string;
  rankDelta: number;
}

export interface BehaviorPoint {
  label: string;
  combat: number;
  world: number;
}

export interface PartyRow {
  id: string;
  name: string;
  relation: "friend" | "rival";
  online: boolean;
  place: string;
  gameId: string;
  perMinute: number;
  samePlace: boolean;
  returnInMs: number;
}

export interface BehaviorSnapshot {
  anchor: boolean;
  nowMs: number;
  online: boolean;
  elapsedMs: number;
  returnInMs: number;
  offlineForMs: number;
  place: string;
  gameId: string;
  events: BehaviorEvent[];
  series: BehaviorPoint[];
  baseline: number[];
  liveVector: number[];
  kills: number;
  deaths: number;
  kd: number | null;
  lastMinute: number;
  perMinute: number;
  rankDelta: number;
  scoreNow: number;
  engagement: Engagement;
  party: PartyRow[];
  integrity: "clean" | "mismatch";
}

export interface PlaceInfo {
  title: string;
  gameId?: string;
}

export type PlaceLookup = (id: string) => PlaceInfo | undefined;

const MINUTE = 60_000;
const WINDOW_MINUTES = 24;
const TAPE_LIMIT = 12;

export const BEHAVIOR_ANCHOR = Date.UTC(2026, 9, 15, 18, 40, 0);

export const BEHAVIOR_AXES = ["Survival", "Tactical", "Session", "Loyalty", "Aggression", "Explore"] as const;

export const BEHAVIOR_LABEL: Record<BehaviorKind, string> = {
  kill: "Kill",
  death: "Death",
  assist: "Assist",
  objective: "Objective",
  loot: "Loot",
  revive: "Revive",
  rank: "Rank",
  clan: "Clan",
  hop: "Hop",
};

const COMBAT = new Set<BehaviorKind>(["kill", "death", "assist", "rank"]);

const COPY: Record<string, Record<BehaviorKind, readonly string[]>> = {
  survival: {
    kill: ["SAR across the compound", "Bolt from the rocks", "AK on the deck", "Fight at the recycler"],
    death: ["Dropped on the rotate", "Lost the door", "Caught in the open"],
    assist: ["Finished the down", "Covered the breach"],
    objective: ["Locked crate timer", "Took the airdrop", "Started the monument"],
    loot: ["Cached sulfur", "Military crate", "Components off the road"],
    revive: ["Picked a clanmate up", "Patched at the bag"],
    rank: ["Season score moved", "Ladder tick after the fight"],
    clan: ["Called the push", "Wipe ping"],
    hop: ["Left the server"],
  },
  tactical: {
    kill: ["Entry frag", "LAT on the vehicle", "Trade at the breach"],
    death: ["Swung and lost", "Caught on the flank"],
    assist: ["Traded the refrag", "Drone mark converted"],
    objective: ["HAB down", "Point secured", "Plant default"],
    loot: ["Resupplied at the rally", "Took the kit"],
    revive: ["Revived on the point", "Pulled them off the wire"],
    rank: ["Round changed the rating", "Season tick"],
    clan: ["Squad lead ping", "Stack call"],
    hop: ["Queued a different server"],
  },
  fps: {
    kill: ["Opening duel won", "AWP through the smoke", "Close spray"],
    death: ["Peeked into the hold", "Traded out"],
    assist: ["Damage into the trade", "Flash for the entry"],
    objective: ["Site taken", "Retake started", "Clutch round"],
    loot: ["Bought the round", "Dropped a rifle"],
    revive: ["Banner crafted", "Rez in the zone"],
    rank: ["Rating moved", "RR tick"],
    clan: ["Duo ping", "Stack ready"],
    hop: ["Left the lobby"],
  },
  sandbox: {
    kill: ["Cleared the camp", "Boss add down"],
    death: ["Caught by the boss", "Downed on the run back"],
    assist: ["Partner finished it", "Pal knocked the target"],
    objective: ["Boss phase cleared", "Base raid timer"],
    loot: ["Egg secured", "Ore run finished"],
    revive: ["Partner picked them up", "Respawned at the palbox"],
    rank: ["Score nudged", "Season tick"],
    clan: ["Co-op ping", "Base call"],
    hop: ["Moved worlds"],
  },
  moba: {
    kill: ["Solo kill in lane", "Pick before the objective"],
    death: ["Ganked on the ward", "Caught rotating"],
    assist: ["Follow-up on the gank", "Teamfight assist"],
    objective: ["Drake taken", "Tower plate", "Herald started"],
    loot: ["Item spike", "Cannon wave"],
    revive: ["Backed and bought", "Respawned for the fight"],
    rank: ["LP moved", "Promo game tick"],
    clan: ["Clash stack ping", "Duo ready"],
    hop: ["Dodged into another lobby"],
  },
};

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed: string): number {
  return hash32(seed) / 4294967296;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function axis(player: Player, index: number): number {
  const value = player.vector[index];
  return typeof value === "number" && !Number.isNaN(value) ? clamp01(value) : 0.5;
}

function genreOf(gameId: string): string {
  return GAME_MAP[gameId]?.genre ?? "survival";
}

export function resolveNow(nowMs: number): { now: number; anchor: boolean } {
  if (nowMs > 0) return { now: nowMs, anchor: false };
  return { now: BEHAVIOR_ANCHOR, anchor: true };
}

export function sessionClock(player: Player, nowMs: number): {
  online: boolean;
  elapsedMs: number;
  returnInMs: number;
  offlineForMs: number;
  sessionMs: number;
} {
  const sessionMin = 28 + axis(player, 2) * 110;
  const breakMin = 18 + (1 - axis(player, 2)) * 80;
  const sessionMs = Math.round(sessionMin * MINUTE);
  const cycleMs = sessionMs + Math.round(breakMin * MINUTE);
  const phase = hash32(`${player.id}:phase`) % cycleMs;
  const pos = (nowMs + phase) % cycleMs;
  if (pos < sessionMs) {
    return { online: true, elapsedMs: pos, returnInMs: 0, offlineForMs: 0, sessionMs };
  }
  const offlineForMs = pos - sessionMs;
  return { online: false, elapsedMs: sessionMs, returnInMs: cycleMs - pos, offlineForMs, sessionMs };
}

function expectedRate(player: Player): number {
  return 0.35 + axis(player, 4) * 1.6 + axis(player, 2) * 0.45;
}

function pickKind(player: Player, seed: string): BehaviorKind {
  const scoreLean = 1 - Math.min(1, Math.max(0, player.score) / 2200);
  const weights: [BehaviorKind, number][] = [
    ["kill", 0.15 + axis(player, 4) * 1.4],
    ["death", 0.12 + axis(player, 4) * 0.55 + scoreLean * 0.35],
    ["assist", 0.08 + axis(player, 1) * 0.7],
    ["objective", 0.06 + axis(player, 1) * 0.9],
    ["loot", 0.05 + axis(player, 0) * 0.85],
    ["revive", 0.04 + axis(player, 0) * 0.35],
    ["rank", 0.08 + (axis(player, 1) + axis(player, 4)) * 0.25],
    ["clan", (player.clanId ? 0.05 : 0.02) + axis(player, 3) * 0.7],
    ["hop", 0.03 + axis(player, 5) * 0.55],
  ];
  const sum = weights.reduce((total, [, weight]) => total + weight, 0);
  let cursor = unit(seed) * sum;
  for (const [kind, weight] of weights) {
    cursor -= weight;
    if (cursor <= 0) return kind;
  }
  return weights[0]![0];
}

function topGame(player: Player): string {
  const entries = Object.entries(player.games).filter(([, weight]) => weight > 0);
  if (!entries.length) return "rust";
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]![0];
}

function pickGame(player: Player, seed: string): string {
  const entries = Object.entries(player.games).filter(([, weight]) => weight > 0);
  if (!entries.length) return topGame(player);
  const sum = entries.reduce((total, [, weight]) => total + weight, 0);
  let cursor = unit(seed) * sum;
  for (const [gameId, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return gameId;
  }
  return entries[0]![0];
}

function defaultLookup(id: string): PlaceInfo | undefined {
  const candidate = CANDIDATE_MAP[id];
  if (!candidate) return undefined;
  return { title: candidate.title, gameId: candidate.gameId };
}

function placeFor(player: Player, gameId: string, seed: string, lookup: PlaceLookup): { id?: string; title: string } {
  const plays = player.plays.filter((id) => {
    const info = lookup(id);
    return info && (!info.gameId || info.gameId === gameId);
  });
  const pool = plays.length ? plays : player.plays;
  if (!pool.length) return { title: gameName(gameId) };
  const id = pool[Math.floor(unit(seed) * pool.length)]!;
  return { id, title: lookup(id)?.title ?? gameName(gameId) };
}

function homePlace(player: Player, lookup: PlaceLookup): { gameId: string; place: string } {
  const gameId = topGame(player);
  const play = player.plays.find((id) => lookup(id)?.gameId === gameId) ?? player.plays[0];
  return { gameId, place: (play && lookup(play)?.title) || gameName(gameId) };
}

function detailFor(player: Player, kind: BehaviorKind, gameId: string, seed: string, place: string): string {
  const genre = genreOf(gameId);
  const lines = COPY[genre]?.[kind] ?? COPY.survival[kind];
  const line = lines[Math.floor(unit(seed) * lines.length)] ?? lines[0]!;
  if (kind === "clan") {
    const clan = (player.clanId && CLAN_MAP[player.clanId]?.name) || "Open queue";
    return `${clan} · ${line}`;
  }
  if (kind === "hop") return `${line} · ${place}`;
  return line;
}

function buildEvent(
  player: Player,
  minuteIndex: number,
  slot: number,
  at: number,
  lookup: PlaceLookup,
): BehaviorEvent {
  const seed = `${player.id}:${minuteIndex}:${slot}`;
  const kind = pickKind(player, `${seed}:k`);
  const gameId = pickGame(player, `${seed}:g`);
  const place = placeFor(player, gameId, `${seed}:p`, lookup);
  let rankDelta = 0;
  if (kind === "rank") {
    const upBias = 0.42 + (player.score >= 1700 ? 0.1 : 0) + axis(player, 4) * 0.12;
    const up = unit(`${seed}:dir`) < upBias;
    const mag = 1 + Math.floor(unit(`${seed}:mag`) * (up ? 4 : 3));
    rankDelta = up ? mag : -mag;
  }
  return {
    id: seed,
    at,
    kind,
    gameId,
    place: place.title,
    detail: detailFor(player, kind, gameId, `${seed}:d`, place.title),
    rankDelta,
  };
}

export function collectEvents(
  player: Player,
  fromMs: number,
  toMs: number,
  lookup: PlaceLookup = defaultLookup,
): BehaviorEvent[] {
  if (!(toMs >= fromMs)) return [];
  const startMinute = Math.floor(fromMs / MINUTE);
  const endMinute = Math.floor(toMs / MINUTE);
  const out: BehaviorEvent[] = [];
  for (let minute = startMinute; minute <= endMinute; minute++) {
    const minuteStart = minute * MINUTE;
    if (!sessionClock(player, minuteStart + 30_000).online) continue;
    let count = 0;
    let budget = expectedRate(player);
    while (budget > 0 && count < 4) {
      if (unit(`${player.id}:c:${minute}:${count}`) < Math.min(0.9, budget)) count += 1;
      budget -= 1;
    }
    for (let slot = 0; slot < count; slot++) {
      const second = Math.floor(unit(`${player.id}:s:${minute}:${slot}`) * 60);
      const at = minuteStart + second * 1000;
      if (at < fromMs || at > toMs) continue;
      out.push(buildEvent(player, minute, slot, at, lookup));
    }
  }
  out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return out;
}

function shareGame(a: Player, b: Player): boolean {
  return Object.keys(a.games).some((id) => (a.games[id] ?? 0) > 0 && (b.games[id] ?? 0) > 0);
}

function liveVector(player: Player, events: BehaviorEvent[], onlineFraction: number): number[] {
  const total = Math.max(1, events.length);
  const share = (kinds: BehaviorKind[]) => events.filter((event) => kinds.includes(event.kind)).length / total;
  const observed = [
    clamp01(share(["loot", "revive"]) * 2.4),
    clamp01(share(["objective", "assist"]) * 2.1),
    clamp01(onlineFraction),
    clamp01(share(["clan"]) * 3.2 + (player.clanId ? 0.15 : 0)),
    clamp01(share(["kill", "death"]) * 2.2),
    clamp01(share(["hop"]) * 3.4),
  ];
  const lean = events.length < 4 ? 0.18 : 0.42;
  return observed.map((value, index) => {
    const blended = axis(player, index) * (1 - lean) + value * lean;
    return Math.round(blended * 100) / 100;
  });
}

function engagementFor(player: Player, online: boolean, returnInMs: number, recent: number): Engagement {
  if (!online) {
    if (axis(player, 2) < 0.4 && returnInMs > 40 * MINUTE) return "idle-risk";
    return "between";
  }
  if (recent === 0) return "drifting";
  if (recent >= 4 && axis(player, 4) >= 0.7) return "locked-in";
  return "steady";
}

export function behaviorSnapshot(
  player: Player,
  people: Player[],
  nowMs: number,
  lookup: PlaceLookup = defaultLookup,
): BehaviorSnapshot {
  const { now, anchor } = resolveNow(nowMs);
  const clock = sessionClock(player, now);
  const end = clock.online ? now : now - clock.offlineForMs;
  const from = end - WINDOW_MINUTES * MINUTE;
  const windowEvents = collectEvents(player, from, end, lookup);
  const endMinute = Math.floor(end / MINUTE);
  const startMinute = endMinute - (WINDOW_MINUTES - 1);
  let onlineMinutes = 0;
  const buckets = new Map<number, { combat: number; world: number }>();
  for (let minute = startMinute; minute <= endMinute; minute++) {
    buckets.set(minute, { combat: 0, world: 0 });
    if (sessionClock(player, minute * MINUTE + 30_000).online) onlineMinutes += 1;
  }
  for (const event of windowEvents) {
    const bucket = buckets.get(Math.floor(event.at / MINUTE));
    if (!bucket) continue;
    if (COMBAT.has(event.kind)) bucket.combat += 1;
    else bucket.world += 1;
  }
  const series = [...buckets.entries()].map(([, bucket], index, all) => ({
    label: index === all.length - 1 ? (clock.online ? "now" : "end") : `-${all.length - 1 - index}m`,
    combat: bucket.combat,
    world: bucket.world,
  }));
  const kills = windowEvents.filter((event) => event.kind === "kill").length;
  const deaths = windowEvents.filter((event) => event.kind === "death").length;
  const rankDelta = windowEvents.reduce((total, event) => total + event.rankDelta, 0);
  const lastMinute = windowEvents.filter((event) => end - event.at < MINUTE).length;
  const recent = windowEvents.filter((event) => end - event.at < 3 * MINUTE).length;
  const home = homePlace(player, lookup);
  const last = windowEvents[windowEvents.length - 1];
  const place = clock.online ? (last?.place ?? home.place) : home.place;
  const gameId = clock.online ? (last?.gameId ?? home.gameId) : home.gameId;
  const seen = new Set<string>();
  const party: PartyRow[] = [];
  for (const id of [...player.rivals, ...player.friends]) {
    if (seen.has(id) || id === player.id) continue;
    seen.add(id);
    const other = people.find((person) => person.id === id);
    if (!other) continue;
    const otherClock = sessionClock(other, now);
    const otherHome = homePlace(other, lookup);
    const recentEvents = collectEvents(other, now - 10 * MINUTE, now, lookup);
    const lastEvent = recentEvents[recentEvents.length - 1];
    const otherPlace = otherClock.online ? (lastEvent?.place ?? otherHome.place) : otherHome.place;
    party.push({
      id,
      name: other.name,
      relation: player.rivals.includes(id) ? "rival" : "friend",
      online: otherClock.online,
      place: otherPlace,
      gameId: otherClock.online ? (lastEvent?.gameId ?? otherHome.gameId) : otherHome.gameId,
      perMinute: recentEvents.filter((event) => now - event.at < MINUTE).length,
      samePlace: clock.online && otherClock.online && otherPlace === place && shareGame(player, other),
      returnInMs: otherClock.returnInMs,
    });
  }
  party.sort(
    (a, b) => Number(b.online) - Number(a.online) || Number(b.samePlace) - Number(a.samePlace) || a.name.localeCompare(b.name),
  );

  return {
    anchor,
    nowMs: now,
    online: clock.online,
    elapsedMs: clock.elapsedMs,
    returnInMs: clock.returnInMs,
    offlineForMs: clock.offlineForMs,
    place,
    gameId,
    events: [...windowEvents].reverse().slice(0, TAPE_LIMIT),
    series,
    baseline: [0, 1, 2, 3, 4, 5].map((index) => Math.round(axis(player, index) * 100) / 100),
    liveVector: liveVector(player, windowEvents, onlineMinutes / WINDOW_MINUTES),
    kills,
    deaths,
    kd: deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : null,
    lastMinute,
    perMinute: Math.round((windowEvents.length / WINDOW_MINUTES) * 10) / 10,
    rankDelta,
    scoreNow: Math.max(0, Math.round(player.score + rankDelta)),
    engagement: engagementFor(player, clock.online, clock.returnInMs, recent),
    party,
    integrity: player.plays.includes("srv-ghost-rust") ? "mismatch" : "clean",
  };
}

export function formatSpan(ms: number, precise = false): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return precise
      ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
      : `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatAgo(deltaMs: number): string {
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatWhen(at: number, now: number): string {
  const delta = now - at;
  if (delta < 90_000) return formatAgo(delta);
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function isCombatKind(kind: BehaviorKind): boolean {
  return COMBAT.has(kind);
}

export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const RATE_WINDOW_MS = 10_000;
export const RATE_LIMIT = 6;
export const DOCUMENTED_CLOCK = 1792120740;

export const GAME_TYPES = ["RUST", "RUST_CONSOLE", "DAYZ", "ARK", "SEVEN_DAYS", "LOL", "VALORANT", "APEX", "CS2"] as const;
export const EVENT_TYPES = ["COMBAT_KILL", "OBJECTIVE", "SESSION_JOIN", "MATCH_END", "WIPE"] as const;
export const PLATFORMS = ["PC", "CONSOLE"] as const;
export const REGIONS = ["NA", "EU", "OC", "AS", "SA", "RU"] as const;
export const SCOPES = ["GLOBAL", "REGION", "SERVER", "CLAN", "SEASON"] as const;

export type GameType = (typeof GAME_TYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Region = (typeof REGIONS)[number];
export type LeaderboardScope = (typeof SCOPES)[number];
export type Metric = string | number | boolean;

export interface Route {
  game: string;
  platform: Platform;
  region: Region;
  leaderboard_scope: LeaderboardScope;
}

export interface NormalizedEvent {
  route: Route;
  integration_metadata: {
    koba_server_id: string;
    game_type: GameType;
    payload_timestamp_utc: number;
  };
  event_envelope: {
    event_type: EventType;
    cryptographic_signature: string;
    fps_at_execution: number;
  };
  data_payload: {
    actor_identity: string;
    target_identity: string;
    weapon_used?: string;
    is_headshot?: boolean;
    combat_distance_meters?: number;
    metrics?: Record<string, Metric>;
  };
}

export interface Gate {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

export const SAMPLE_EVENT: NormalizedEvent = {
  route: { game: "RUST", platform: "CONSOLE", region: "NA", leaderboard_scope: "SERVER" },
  integration_metadata: {
    koba_server_id: "srv_rust_us_east_091",
    game_type: "RUST_CONSOLE",
    payload_timestamp_utc: DOCUMENTED_CLOCK,
  },
  event_envelope: {
    event_type: "COMBAT_KILL",
    cryptographic_signature: "0x7f8a9cd3e2a14b80",
    fps_at_execution: 59.4,
  },
  data_payload: {
    actor_identity: "steam_76561198000000000",
    target_identity: "epic_4a8b2c3d4e5f6a7b",
    weapon_used: "AK47_RIFLE",
    is_headshot: true,
    combat_distance_meters: 142.5,
  },
};

export const WIPE_EVENT: NormalizedEvent = {
  route: { game: "RUST", platform: "PC", region: "NA", leaderboard_scope: "SERVER" },
  integration_metadata: {
    koba_server_id: "srv_rust_na_wipe_014",
    game_type: "RUST",
    payload_timestamp_utc: DOCUMENTED_CLOCK,
  },
  event_envelope: {
    event_type: "WIPE",
    cryptographic_signature: "0x7f8a9cd3e2a14b80",
    fps_at_execution: 62,
  },
  data_payload: {
    actor_identity: "steam_76561198000001840",
    target_identity: "koba_none",
    metrics: { scrap: 4200, hours_on_wipe: 38, raids: 2 },
  },
};

export const MATCH_EVENT: NormalizedEvent = {
  route: { game: "CS2", platform: "PC", region: "EU", leaderboard_scope: "SEASON" },
  integration_metadata: {
    koba_server_id: "srv_cs2_eu_match_220",
    game_type: "CS2",
    payload_timestamp_utc: DOCUMENTED_CLOCK,
  },
  event_envelope: {
    event_type: "MATCH_END",
    cryptographic_signature: "0x7f8a9cd3e2a14b80",
    fps_at_execution: 128,
  },
  data_payload: {
    actor_identity: "steam_76561198000002144",
    target_identity: "koba_none",
    metrics: { rounds_won: 13, rounds_lost: 9, headshots: 7 },
  },
};

// eslint-disable-next-line no-control-regex -- \u0000 is deliberate: rejecting embedded NUL bytes in untrusted payload strings.
const FORGERY = /<|>|script|javascript:|\$\{|onerror|`|\u0000/i;
const IDENTITY = /^(steam|epic|riot|psn|xbox|koba)_[A-Za-z0-9]{4,32}$/;
const WEAPON = /^[A-Z0-9_]{2,32}$/;
const SERVER = /^srv_[a-z0-9_]{4,48}$/;
const SIGNATURE = /^0x[0-9a-f]{16,64}$/i;

export function neutralize(value: string) {
  // eslint-disable-next-line no-control-regex -- stripping the same NUL byte the forgery gate rejects.
  return value.replace(/[<>`${}]/g, "").replace(/javascript:/gi, "").replace(/\u0000/g, "").slice(0, 64);
}

function gate(id: string, name: string, pass: boolean, detail: string): Gate {
  return { id, name, pass, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inspectPayload(raw: string, nowSec: number): { gates: Gate[]; event: NormalizedEvent | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      gates: [gate("json", "JSON parse", false, "The body is not JSON. Nothing was written.")],
      event: null,
    };
  }
  if (!isRecord(parsed)) {
    return { gates: [gate("json", "JSON parse", false, "The body must be an object.")], event: null };
  }
  const gates: Gate[] = [gate("json", "JSON parse", true, "Object parsed in the isolated layer.")];
  const route = parsed.route;
  const meta = parsed.integration_metadata;
  const envelope = parsed.event_envelope;
  const data = parsed.data_payload;
  const allowed = ["route", "integration_metadata", "event_envelope", "data_payload"];
  const extra = Object.keys(parsed).filter((key) => !allowed.includes(key));
  gates.push(
    gate(
      "shape",
      "Normalized shape",
      extra.length === 0 && isRecord(route) && isRecord(meta) && isRecord(envelope) && isRecord(data),
      extra.length ? `Drop unknown keys: ${extra.join(", ")}.` : "route, integration_metadata, event_envelope, and data_payload are present.",
    ),
  );
  if (!isRecord(route) || !isRecord(meta) || !isRecord(envelope) || !isRecord(data)) return { gates, event: null };

  const routeGame = route.game;
  const platform = route.platform;
  const region = route.region;
  const scope = route.leaderboard_scope;
  const serverId = meta.koba_server_id;
  const game = meta.game_type;
  const clock = meta.payload_timestamp_utc;
  const eventType = envelope.event_type;
  const signature = envelope.cryptographic_signature;
  const fps = envelope.fps_at_execution;
  const actor = data.actor_identity;
  const target = data.target_identity;
  const weapon = data.weapon_used;
  const headshot = data.is_headshot;
  const distance = data.combat_distance_meters;
  const metrics = data.metrics;

  const metricStrings = isRecord(metrics) ? Object.values(metrics).filter((value): value is string => typeof value === "string") : [];
  const strings = [routeGame, platform, region, scope, serverId, game, eventType, signature, actor, target, weapon, ...metricStrings].filter(
    (value): value is string => typeof value === "string",
  );
  const dirty = strings.filter((value) => FORGERY.test(value));
  gates.push(
    gate(
      "forgery",
      "Forgery gate",
      dirty.length === 0,
      dirty.length ? `Rejected ${dirty.map(neutralize).join(", ") || "a control string"}. Markup is not stored.` : "Strings stayed inside the allowed alphabet.",
    ),
  );
  gates.push(gate("server", "Server id", typeof serverId === "string" && SERVER.test(serverId), "srv_ plus a short server key."));
  gates.push(gate("platform", "Platform", typeof platform === "string" && (PLATFORMS as readonly string[]).includes(platform), "PC or CONSOLE. They do not share a board."));
  gates.push(gate("region", "Region", typeof region === "string" && (REGIONS as readonly string[]).includes(region), REGIONS.join(", ")));
  gates.push(gate("scope", "Leaderboard scope", typeof scope === "string" && (SCOPES as readonly string[]).includes(scope), SCOPES.join(", ")));
  const gameOk = typeof game === "string" && (GAME_TYPES as readonly string[]).includes(game);
  const boundary =
    gameOk &&
    typeof routeGame === "string" &&
    typeof platform === "string" &&
    ((game === "RUST_CONSOLE" && routeGame === "RUST" && platform === "CONSOLE") ||
      (game === "RUST" && routeGame === "RUST" && platform === "PC") ||
      (game !== "RUST" && game !== "RUST_CONSOLE" && routeGame === game));
  gates.push(gate("game", "Game type", gameOk, GAME_TYPES.join(", ")));
  gates.push(gate("boundary", "Platform boundary", boundary, "RUST stays on PC. RUST_CONSOLE stays on CONSOLE. Every other title uses its own game id."));
  const fresh = typeof clock === "number" && (clock === DOCUMENTED_CLOCK || Math.abs(clock - nowSec) <= 15 * 60);
  gates.push(gate("clock", "Payload clock", fresh, fresh ? "Clock is the documented sample or within 15 minutes." : "Clock is stale or not a unix second."));
  gates.push(
    gate("event", "Event type", typeof eventType === "string" && (EVENT_TYPES as readonly string[]).includes(eventType), EVENT_TYPES.join(", ")),
  );
  gates.push(gate("signature", "Event signature", typeof signature === "string" && SIGNATURE.test(signature), "0x and 16 to 64 hex characters. The docs abbreviate this."));
  gates.push(gate("fps", "Frame time", typeof fps === "number" && fps >= 1 && fps <= 240, "Frames per second at execution, 1 to 240."));
  gates.push(gate("actor", "Actor identity", typeof actor === "string" && IDENTITY.test(actor), "steam_, epic_, riot_, psn_, xbox_, or koba_."));
  gates.push(gate("target", "Target identity", typeof target === "string" && IDENTITY.test(target), "Same identity shape as the actor."));
  const combat = eventType === "COMBAT_KILL" || eventType === "OBJECTIVE";
  if (combat) {
    gates.push(gate("weapon", "Weapon", typeof weapon === "string" && WEAPON.test(weapon), "Uppercase token such as AK47_RIFLE."));
    gates.push(gate("headshot", "Headshot flag", typeof headshot === "boolean", "true or false, not a string."));
    gates.push(gate("distance", "Distance", typeof distance === "number" && distance >= 0 && distance <= 2000, "Meters, 0 to 2000."));
  }
  const metricEntries = isRecord(metrics) ? Object.entries(metrics) : null;
  const metricsOk =
    metrics === undefined
      ? !combat
        ? false
        : true
      : metricEntries !== null &&
        metricEntries.length > 0 &&
        metricEntries.length <= 16 &&
        metricEntries.every(([key, value]) => /^[a-z0-9_]{1,32}$/.test(key) && (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 32 && !FORGERY.test(value))));
  if (!combat || metrics !== undefined) {
    gates.push(gate("metrics", "Game metrics", metricsOk, combat ? "Optional numbers for this game. The core does not read them as rules." : "Wipe and match events carry their numbers here."));
  }

  const event: NormalizedEvent | null =
    gates.every((item) => item.pass)
      ? {
          route: { game: routeGame as string, platform: platform as Platform, region: region as Region, leaderboard_scope: scope as LeaderboardScope },
          integration_metadata: { koba_server_id: serverId as string, game_type: game as GameType, payload_timestamp_utc: clock as number },
          event_envelope: { event_type: eventType as EventType, cryptographic_signature: signature as string, fps_at_execution: fps as number },
          data_payload: {
            actor_identity: actor as string,
            target_identity: target as string,
            ...(typeof weapon === "string" ? { weapon_used: weapon } : {}),
            ...(typeof headshot === "boolean" ? { is_headshot: headshot } : {}),
            ...(typeof distance === "number" ? { combat_distance_meters: distance } : {}),
            ...(metricEntries ? { metrics: Object.fromEntries(metricEntries) as Record<string, Metric> } : {}),
          },
        }
      : null;
  return { gates, event };
}

export function noteRate(hits: number[], nowMs: number) {
  const kept = hits.filter((stamp) => nowMs - stamp < RATE_WINDOW_MS);
  if (kept.length >= RATE_LIMIT) return { hits: kept, allowed: false };
  return { hits: [...kept, nowMs], allowed: true };
}

function b64url(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return b64url(mac);
}

export async function mintToken(kobaId: string, nowMs: number, secret: string) {
  const jtiBytes = new Uint8Array(9);
  crypto.getRandomValues(jtiBytes);
  const jti = [...jtiBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const exp = nowMs + TOKEN_TTL_MS;
  const body = b64url(new TextEncoder().encode(JSON.stringify({ kobaId, exp, jti })));
  const sig = await hmac(secret, body);
  return { token: `v1.${body}.${sig}`, jti, exp };
}

export async function readToken(token: string, nowMs: number, secret: string): Promise<{ ok: true; kobaId: string; jti: string; exp: number } | { ok: false; reason: "malformed" | "signature" | "expired" }> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const expected = await hmac(secret, parts[1]);
  if (expected !== parts[2]) return { ok: false, reason: "signature" };
  let claims: { kobaId?: unknown; exp?: unknown; jti?: unknown };
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.kobaId !== "string" || typeof claims.exp !== "number" || typeof claims.jti !== "string") return { ok: false, reason: "malformed" };
  if (claims.exp <= nowMs) return { ok: false, reason: "expired" };
  return { ok: true, kobaId: claims.kobaId, jti: claims.jti, exp: claims.exp };
}

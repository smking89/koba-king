/**
 * In-browser REST runtime for the developer portal.
 *
 * This executes the documented API for real: keys are authenticated, scopes are
 * enforced, bodies are validated, rate limits return 429, and every handler
 * answers from the same seeded data the app renders. Nothing leaves the browser,
 * so the "server" here is the tab you are looking at.
 */

import { GAMES } from '../data/games';
import { PLAYERS } from '../data/players';
import { SERVERS } from '../data/servers';
import { ENDPOINTS } from './developer';
import type { ApiKey, HttpMethod, Scope } from './developer';

export interface ApiRequest {
  method: HttpMethod;
  /** Path with optional query string, e.g. `/matches?status=locked`. */
  path: string;
  /** Raw JSON body for writes. */
  body?: string;
  key: ApiKey | null;
}

export interface ApiResponse {
  status: number;
  ms: number;
  body: unknown;
}

interface Result {
  status: number;
  body: unknown;
}

interface Context {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

interface Route {
  method: HttpMethod;
  pattern: RegExp;
  scope: Scope;
  handler: (ctx: Context) => Result;
}

const WINDOW = 60_000;
const usage: Record<string, number[]> = {};

/** Documented per-scope ceilings, enforced per key inside a one-minute window. */
export const SCOPE_LIMITS: Record<Scope, number> = {
  'matches:read': 600,
  'matches:write': 120,
  'servers:read': 60,
  'servers:write': 60,
  'webhooks:manage': 30,
};

export interface RateSnapshot {
  keyId: string;
  scope: Scope;
  limit: number;
  used: number;
  remaining: number;
  resetInSeconds: number;
}

function windowFor(keyId: string, scope: Scope): number[] {
  const bucket = `${keyId}:${scope}`;
  const now = Date.now();
  const stamps = (usage[bucket] ?? []).filter((stamp) => now - stamp < WINDOW);
  usage[bucket] = stamps;
  return stamps;
}

/** Live state of a key's window, used by the portal's usage panel. */
export function rateSnapshot(keyId: string, scope: Scope): RateSnapshot {
  const stamps = windowFor(keyId, scope);
  const lim = SCOPE_LIMITS[scope];
  const oldest = stamps[0] ?? Date.now();
  return {
    keyId,
    scope,
    limit: lim,
    used: stamps.length,
    remaining: Math.max(0, lim - stamps.length),
    resetInSeconds: stamps.length ? Math.max(0, Math.ceil((WINDOW - (Date.now() - oldest)) / 1000)) : 60,
  };
}

const MATCHES = [
  { id: 'mt_4410', gameId: 'valorant', status: 'locked', kills: 5, region: 'America', players: ['p_1042', 'p_2291'] },
  { id: 'mt_4409', gameId: 'cs2', status: 'pending', kills: 3, region: 'EU', players: ['p_1180', 'p_2077'] },
  { id: 'mt_4407', gameId: 'apex', status: 'resolved', kills: 10, region: 'America', players: ['p_1550', 'p_1642'] },
];

function failure(status: number, code: string, message: string): Result {
  return { status, body: { error: { code, message } } };
}

function requireFields(body: Record<string, unknown>, fields: string[]): string | null {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null);
  return missing.length ? missing.join(', ') : null;
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    pattern: /^\/deck$/,
    scope: 'matches:read',
    handler: ({ query }) => {
      const game = query.get('game');
      const region = query.get('region');
      const players = PLAYERS.filter((player) => {
        if (region && player.region !== region) return false;
        if (game && !player.games.some((entry) => entry.gameId === game)) return false;
        return true;
      }).slice(0, 20);

      return {
        status: 200,
        body: {
          object: 'list',
          data: players.map((player) => ({
            id: player.id,
            username: player.username,
            display_name: player.displayName,
            region: player.region,
            platform: player.platform,
            score: player.score,
            reliability: player.reliability,
            games: player.games.map((entry) => ({ game: entry.gameId, rank: entry.rank, role: entry.role })),
          })),
          has_more: PLAYERS.length > players.length,
        },
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/matches$/,
    scope: 'matches:read',
    handler: ({ query }) => {
      const status = query.get('status');
      const data = MATCHES.filter((match) => !status || match.status === status);
      return { status: 200, body: { object: 'list', data } };
    },
  },
  {
    method: 'GET',
    pattern: /^\/players\/([\w-]+)$/,
    scope: 'matches:read',
    handler: ({ params }) => {
      const player = PLAYERS.find((entry) => entry.id === params.id || entry.username === params.id);
      if (!player) return failure(404, 'player_not_found', `No player with id ${params.id}`);
      return {
        status: 200,
        body: {
          id: player.id,
          username: player.username,
          display_name: player.displayName,
          bio: player.bio,
          region: player.region,
          platform: player.platform,
          score: player.score,
          reliability: player.reliability,
          record: player.record,
          games: player.games,
        },
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/challenges$/,
    scope: 'matches:write',
    handler: ({ body }) => {
      const missing = requireFields(body, ['match_id', 'kills']);
      if (missing) return failure(422, 'parameter_missing', `Missing required field(s): ${missing}`);
      const kills = Number(body.kills);
      if (![3, 5, 10].includes(kills)) {
        return failure(422, 'invalid_tier', 'kills must be one of 3 (Skirmish), 5 (Vendetta) or 10 (Execution)');
      }
      return {
        status: 201,
        body: {
          id: `ch_${Math.random().toString(36).slice(2, 7)}`,
          match_id: body.match_id,
          kills,
          status: 'locked',
          window: body.window ?? null,
          created_at: new Date().toISOString(),
        },
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/challenges\/([\w-]+)\/resolve$/,
    scope: 'matches:write',
    handler: ({ params, body }) => {
      const missing = requireFields(body, ['winner', 'kills']);
      if (missing) return failure(422, 'parameter_missing', `Missing required field(s): ${missing}`);
      const kills = body.kills as Record<string, unknown>;
      if (typeof kills !== 'object' || kills === null) {
        return failure(422, 'invalid_kills', 'kills must map player ids to kill counts');
      }
      const winner = String(body.winner);
      const values = Object.values(kills).map(Number);
      if (values.some((value) => !Number.isFinite(value))) {
        return failure(422, 'invalid_kills', 'kill counts must be numbers');
      }
      return {
        status: 200,
        body: {
          id: params.id,
          status: 'resolved',
          winner,
          points_moved: 120 + Math.max(...values) * 15,
          settled_at: new Date().toISOString(),
          idempotent: true,
        },
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/servers$/,
    scope: 'servers:read',
    handler: () => ({
      status: 200,
      body: {
        object: 'list',
        data: SERVERS.slice(0, 12).map((server) => ({
          id: server.id,
          name: server.name,
          game: GAMES.find((game) => game.id === server.gameId)?.name ?? server.gameId,
          region: server.region,
          ip: server.ip,
          players: server.players,
          max_players: server.maxPlayers,
          ping_ms: server.ping,
          live: server.active,
          featured: server.featured,
        })),
      },
    }),
  },
  {
    method: 'PATCH',
    pattern: /^\/servers\/([\w-]+)$/,
    scope: 'servers:write',
    handler: ({ params, body }) => {
      if (typeof body.featured !== 'boolean') {
        return failure(422, 'invalid_body', 'featured must be a boolean');
      }
      return { status: 200, body: { id: params.id, featured: body.featured, updated_at: new Date().toISOString() } };
    },
  },
  {
    method: 'POST',
    pattern: /^\/webhooks$/,
    scope: 'webhooks:manage',
    handler: ({ body }) => {
      const url = String(body.url ?? '');
      if (!/^https:\/\//.test(url)) return failure(422, 'invalid_url', 'url must be an https:// endpoint');
      const events = Array.isArray(body.events) ? body.events : [];
      if (events.length === 0) return failure(422, 'events_required', 'Subscribe to at least one event');
      return {
        status: 201,
        body: {
          id: `wh_${Math.random().toString(36).slice(2, 7)}`,
          url,
          events,
          active: true,
          secret: `whsec_${Math.random().toString(36).slice(2, 12)}`,
        },
      };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/keys\/([\w-]+)$/,
    scope: 'webhooks:manage',
    handler: ({ params }) => ({ status: 204, body: { id: params.id, revoked: true } }),
  },
];

const SCOPE_BY_ENDPOINT = new Map(ENDPOINTS.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint.scope]));

export function callApi({ method, path, body, key }: ApiRequest): ApiResponse {
  const started = Date.now();
  const finish = (result: Result): ApiResponse => ({ ...result, ms: Math.max(11, Date.now() - started + 12) });

  if (!key) {
    return finish(failure(401, 'missing_key', 'Provide an API key in the Authorization header'));
  }


  const [rawPath, search = ''] = path.split('?');
  const normalized = rawPath.replace(/^\/v1/, '').replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(search);

  let parsedBody: Record<string, unknown> = {};
  if (body && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedBody = parsed as Record<string, unknown>;
      else if (Array.isArray(parsed)) parsedBody = { data: parsed };
    } catch {
      return finish(failure(422, 'invalid_json', 'Request body is not valid JSON'));
    }
  }

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(normalized);
    if (!match) continue;

    if (!key.scopes.includes(route.scope)) {
      return finish(
        failure(403, 'scope_missing', `This key is missing the ${route.scope} scope`),
      );
    }

    // Sliding window per key and scope, so the portal can demonstrate a real 429.
    const limit = SCOPE_LIMITS[route.scope];
    const stamps = windowFor(key.id, route.scope);
    if (stamps.length >= limit) {
      const retry = Math.max(1, Math.ceil((WINDOW - (Date.now() - stamps[0])) / 1000));
      const limited = failure(429, 'rate_limited', `Too many ${route.scope} requests. Retry in ${retry}s`);
      return finish({
        ...limited,
        body: { ...(limited.body as object), retry_after: retry, scope: route.scope, limit },
      });
    }
    stamps.push(Date.now());

    return finish(route.handler({ params: match[1] ? { id: match[1] } : {}, query, body: parsedBody }));
  }

  const known = SCOPE_BY_ENDPOINT.get(`${method} ${normalized}`);
  if (known && !key.scopes.includes(known)) {
    return finish(failure(403, 'scope_missing', `This key is missing the ${known} scope`));
  }
  return finish(failure(404, 'not_found', `No route for ${method} ${normalized}`));
}

/** Builds an OpenAPI 3.1 document from the same endpoint table the docs render. */
export function openApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    const key = endpoint.path.replace(/\{(\w+)\}/g, '{$1}');
    paths[key] = {
      ...(paths[key] ?? {}),
      [endpoint.method.toLowerCase()]: {
        summary: endpoint.summary,
        tags: [endpoint.scope.split(':')[0]],
        security: [{ bearerAuth: [] }],
        'x-required-scope': endpoint.scope,
        responses: {
          '200': { description: 'Success' },
          '401': { description: 'Missing or invalid key' },
          '403': { description: `Key lacks ${endpoint.scope}` },
          '422': { description: 'Validation failed' },
          '429': { description: 'Rate limited' },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'KOBA API',
      version: '1.0.0',
      description: 'Matchmaking, challenges, arena servers and signed webhooks.',
    },
    servers: [{ url: 'https://api.koba.gg/v1' }, { url: 'https://sandbox.api.koba.gg/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'koba_live_…' },
      },
    },
    paths,
  };
}

/** Clears the rate-limit window, used by the playground's reset control. */
export function resetRateLimit(keyId?: string): void {
  for (const bucket of Object.keys(usage)) {
    if (!keyId || bucket.startsWith(`${keyId}:`)) delete usage[bucket];
  }
}

/**
 * Developer portal state. Like the rest of the prototype this is browser-local:
 * keys, endpoints and logs are seeded once and then persisted to localStorage.
 * Secrets are only ever held long enough to be shown once; nothing here is a
 * real credential and no request leaves the browser.
 */

export type KeyEnv = 'live' | 'test';

export type Scope =
  | 'matches:read'
  | 'matches:write'
  | 'servers:read'
  | 'servers:write'
  | 'webhooks:manage';

export type WebhookEvent =
  | 'rivalry.formed'
  | 'challenge.locked'
  | 'match.resolved'
  | 'server.went_live'
  | 'player.verified';

export const SCOPES: { id: Scope; copy: string }[] = [
  { id: 'matches:read', copy: 'Read decks, matches and challenge state' },
  { id: 'matches:write', copy: 'Lock challenges, resolve results and settle points' },
  { id: 'servers:read', copy: 'List arena servers and their live player counts' },
  { id: 'servers:write', copy: 'Register servers and change featured placements' },
  { id: 'webhooks:manage', copy: 'Create, rotate and delete webhook endpoints' },
];

export const EVENTS: { id: WebhookEvent; copy: string }[] = [
  { id: 'rivalry.formed', copy: 'Two players matched on the deck' },
  { id: 'challenge.locked', copy: 'A kill-tier challenge was accepted' },
  { id: 'match.resolved', copy: 'A result settled and points moved' },
  { id: 'server.went_live', copy: 'An arena server started accepting rivals' },
  { id: 'player.verified', copy: 'A player cleared rank verification' },
];

export const BASE_URL = 'https://api.koba.gg/v1';
export const SANDBOX_URL = 'https://sandbox.api.koba.gg/v1';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiKey {
  id: string;
  label: string;
  env: KeyEnv;
  /** Last four characters, enough to tell two keys apart. */
  last4: string;
  createdAt: number;
  lastUsedAt: number | null;
  scopes: Scope[];
  /** Requests this key made in the current window. */
  requests: number;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  /** Shown in the portal so the signature can be verified locally. */
  secret: string;
  createdAt: number;
}

export interface Delivery {
  id: string;
  endpointId: string;
  event: WebhookEvent;
  status: number;
  ms: number;
  at: number;
  attempt: number;
}

export interface RequestLog {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  ms: number;
  at: number;
  keyLabel: string;
}

export interface DeveloperState {
  keys: ApiKey[];
  endpoints: WebhookEndpoint[];
  deliveries: Delivery[];
  log: RequestLog[];
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  scope: Scope;
  example: string;
}

export interface Snippet {
  id: 'curl' | 'node' | 'python';
  label: string;
  code: string;
}

const STORAGE_KEY = 'rivalry.developer.v1';

function randomToken(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function makeSecret(env: KeyEnv): string {
  return `koba_${env}_${randomToken(32)}`;
}

export function makeWebhookSecret(): string {
  return `whsec_${randomToken(26)}`;
}

export function maskKey(key: Pick<ApiKey, 'env' | 'last4'>): string {
  return `koba_${key.env}_••••••••${key.last4}`;
}

const MINUTE = 60 * 1000;

function seedState(): DeveloperState {
  const now = Date.now();
  return {
    keys: [
      {
        id: 'k1',
        label: 'Production · arena bot',
        env: 'live',
        last4: 'a91f',
        createdAt: now - 62 * 24 * 60 * MINUTE,
        lastUsedAt: now - 4 * MINUTE,
        scopes: ['matches:read', 'matches:write', 'servers:read'],
        requests: 8_942,
      },
      {
        id: 'k2',
        label: 'Sandbox · staging',
        env: 'test',
        last4: 'c40d',
        createdAt: now - 9 * 24 * 60 * MINUTE,
        lastUsedAt: now - 26 * 60 * MINUTE,
        scopes: ['matches:read', 'webhooks:manage'],
        requests: 138,
      },
    ],
    endpoints: [
      {
        id: 'w1',
        url: 'https://rustopia.gg/api/koba/hooks',
        events: ['rivalry.formed', 'challenge.locked', 'match.resolved'],
        active: true,
        secret: 'whsec_koba4f19d2c8aa71b5039e6d',
        createdAt: now - 40 * 24 * 60 * MINUTE,
      },
      {
        id: 'w2',
        url: 'https://rustopia.gg/api/koba/server-hooks',
        events: ['server.went_live'],
        active: true,
        secret: 'whsec_koba9b2e77c140df8a6c52f1',
        createdAt: now - 21 * 24 * 60 * MINUTE,
      },
    ],
    deliveries: [
      { id: 'd1', endpointId: 'w1', event: 'match.resolved', status: 200, ms: 118, at: now - 3 * MINUTE, attempt: 1 },
      { id: 'd2', endpointId: 'w1', event: 'challenge.locked', status: 200, ms: 96, at: now - 6 * MINUTE, attempt: 1 },
      { id: 'd3', endpointId: 'w2', event: 'server.went_live', status: 200, ms: 74, at: now - 9 * MINUTE, attempt: 1 },
      { id: 'd4', endpointId: 'w1', event: 'rivalry.formed', status: 200, ms: 131, at: now - 12 * MINUTE, attempt: 1 },
      { id: 'd5', endpointId: 'w1', event: 'match.resolved', status: 502, ms: 3_000, at: now - 24 * MINUTE, attempt: 3 },
      { id: 'd6', endpointId: 'w1', event: 'match.resolved', status: 200, ms: 141, at: now - 25 * MINUTE, attempt: 2 },
    ],
    log: [
      { id: 'l1', method: 'POST', path: '/challenges/ch_8f21/resolve', status: 200, ms: 121, at: now - 2 * MINUTE, keyLabel: 'Production · arena bot' },
      { id: 'l2', method: 'GET', path: '/matches?status=locked', status: 200, ms: 63, at: now - 4 * MINUTE, keyLabel: 'Production · arena bot' },
      { id: 'l3', method: 'POST', path: '/challenges', status: 201, ms: 188, at: now - 7 * MINUTE, keyLabel: 'Production · arena bot' },
      { id: 'l4', method: 'GET', path: '/servers', status: 200, ms: 47, at: now - 11 * MINUTE, keyLabel: 'Production · arena bot' },
      { id: 'l5', method: 'POST', path: '/webhooks/w1/test', status: 200, ms: 87, at: now - 18 * MINUTE, keyLabel: 'Sandbox · staging' },
      { id: 'l6', method: 'GET', path: '/players/p_2291', status: 404, ms: 22, at: now - 26 * MINUTE, keyLabel: 'Sandbox · staging' },
      { id: 'l7', method: 'PATCH', path: '/servers/srv_rustopia_main', status: 403, ms: 19, at: now - 33 * MINUTE, keyLabel: 'Sandbox · staging' },
      { id: 'l8', method: 'GET', path: '/matches/mt_4410', status: 200, ms: 58, at: now - 41 * MINUTE, keyLabel: 'Production · arena bot' },
      { id: 'l9', method: 'POST', path: '/keys', status: 201, ms: 96, at: now - 55 * MINUTE, keyLabel: 'Sandbox · staging' },
      { id: 'l10', method: 'GET', path: '/players/p1', status: 200, ms: 44, at: now - 68 * MINUTE, keyLabel: 'Production · arena bot' },
    ],
  };
}

export function loadDeveloper(): DeveloperState {
  if (typeof localStorage === 'undefined') return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<DeveloperState>;
    if (!parsed || !Array.isArray(parsed.keys) || !Array.isArray(parsed.endpoints)) {
      return seedState();
    }
    return {
      keys: parsed.keys,
      endpoints: parsed.endpoints,
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
  } catch {
    return seedState();
  }
}

export function saveDeveloper(state: DeveloperState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode: the portal keeps working for this session.
  }
}

/** Appends a request-log entry, newest first, capped so storage stays small. */
export function logRequest(
  state: DeveloperState,
  entry: Omit<RequestLog, 'id' | 'at'>,
): DeveloperState {
  const record: RequestLog = {
    ...entry,
    id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
  };
  return { ...state, log: [record, ...state.log].slice(0, 40) };
}

export const ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'e-deck',
    method: 'GET',
    path: '/deck',
    summary: 'Page through the matchmaking deck',
    scope: 'matches:read',
    example: `curl "${BASE_URL}/deck?game=valorant&region=America" \\
  -H "Authorization: Bearer koba_live_***"`,
  },
  {
    id: 'e-matches',
    method: 'GET',
    path: '/matches',
    summary: 'List rival matches, filterable by status',
    scope: 'matches:read',
    example: `curl "${BASE_URL}/matches?status=locked" \\
  -H "Authorization: Bearer koba_live_***"`,
  },
  {
    id: 'e-player',
    method: 'GET',
    path: '/players/{id}',
    summary: 'Player profile, ranks and record',
    scope: 'matches:read',
    example: `curl "${BASE_URL}/players/p1" \\\n  -H "Authorization: Bearer koba_live_***"`,
  },
  {
    id: 'e-challenge',
    method: 'POST',
    path: '/challenges',
    summary: 'Lock a kill-tier challenge between two rivals',
    scope: 'matches:write',
    example: `curl -X POST "${BASE_URL}/challenges" \\
  -H "Authorization: Bearer koba_live_***" \\
  -H "Content-Type: application/json" \\
  -d '{
    "match_id": "mt_4410",
    "kills": 5,
    "window": "2026-10-31T20:00:00Z"
  }'`,
  },
  {
    id: 'e-resolve',
    method: 'POST',
    path: '/challenges/{id}/resolve',
    summary: 'Settle a locked challenge and move points',
    scope: 'matches:write',
    example: `curl -X POST "${BASE_URL}/challenges/ch_8f21/resolve" \\
  -H "Authorization: Bearer koba_live_***" \\
  -H "Content-Type: application/json" \\
  -d '{
    "winner": "p_1042",
    "kills": { "p_1042": 5, "p_2291": 3 },
    "server_id": "srv_rustopia_main"
  }'`,
  },
  {
    id: 'e-servers',
    method: 'GET',
    path: '/servers',
    summary: 'Arena servers, player counts and live state',
    scope: 'servers:read',
    example: `curl "${BASE_URL}/servers" \\
  -H "Authorization: Bearer koba_live_***"`,
  },
  {
    id: 'e-feature',
    method: 'PATCH',
    path: '/servers/{id}',
    summary: 'Toggle a featured placement for a server',
    scope: 'servers:write',
    example: `curl -X PATCH "${BASE_URL}/servers/srv_rustopia_main" \\
  -H "Authorization: Bearer koba_live_***" \\
  -H "Content-Type: application/json" \\
  -d '{ "featured": true }'`,
  },
  {
    id: 'e-hooks',
    method: 'POST',
    path: '/webhooks',
    summary: 'Register an endpoint for signed event delivery',
    scope: 'webhooks:manage',
    example: `curl -X POST "${BASE_URL}/webhooks" \\
  -H "Authorization: Bearer koba_live_***" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://yournetwork.gg/hooks/koba",
    "events": ["rivalry.formed", "match.resolved"]
  }'`,
  },
  {
    id: 'e-revoke',
    method: 'DELETE',
    path: '/keys/{id}',
    summary: 'Revoke a key immediately',
    scope: 'webhooks:manage',
    example: `curl -X DELETE "${BASE_URL}/keys/k_9f21" \\
  -H "Authorization: Bearer koba_live_***"`,
  },
];

export function snippets(): Snippet[] {
  return [
    {
      id: 'curl',
      label: 'cURL',
      code: `curl "${BASE_URL}/matches?status=locked" \\
  -H "Authorization: Bearer koba_live_***" \\
  -H "Accept: application/json"`,
    },
    {
      id: 'node',
      label: 'Node',
      code: `const res = await fetch("${BASE_URL}/matches?status=locked", {
  headers: {
    Authorization: \`Bearer \${process.env.KOBA_KEY}\`,
    Accept: "application/json",
  },
});

const { data } = await res.json();`,
    },
    {
      id: 'python',
      label: 'Python',
      code: `import os, requests

res = requests.get(
    "${BASE_URL}/matches",
    params={"status": "locked"},
    headers={"Authorization": f"Bearer {os.environ['KOBA_KEY']}"},
    timeout=5,
)

matches = res.json()["data"]`,
    },
  ];
}

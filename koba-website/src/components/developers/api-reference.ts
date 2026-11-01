import { SUPPORTED_GAMES } from "@/site/games";

/**
 * The public KOBA API reference, as data.
 *
 * One source of truth for the docs page: every endpoint carries the shape the
 * playground renders (params, fields), a deterministic mock response, and the
 * scope it needs. Nothing here talks to a server - the playground simulates
 * responses so a developer can wire up an integration before they own a key.
 */

export type HttpMethod = "GET" | "POST";
export type GroupId = "players" | "leaderboards" | "matches" | "servers" | "events";

/** How a snippet writer should present the response of this endpoint. */
export type ResponseShape = "player" | "collection" | "match" | "generic";

export interface ApiGroup {
  id: GroupId;
  label: string;
  blurb: string;
}

export const API_GROUPS: ApiGroup[] = [
  { id: "players", label: "Players", blurb: "Profile, XP, hours, badges, and the challenges in flight." },
  { id: "leaderboards", label: "Leaderboards", blurb: "Ranked arrays scoped to global, region, server, clan, or season." },
  { id: "matches", label: "Matches & wipes", blurb: "The end of a match, and the end of a server's season." },
  { id: "servers", label: "Servers", blurb: "Registered hosts, live population, and who is on right now." },
  { id: "events", label: "Events & webhooks", blurb: "Post one normalized event. Receive everything else." },
];

export interface ApiParam {
  name: string;
  in: "path" | "query" | "header";
  type: string;
  example: string;
  required?: boolean;
  detail: string;
}

export interface ApiField {
  name: string;
  type: string;
  detail: string;
}

export interface ApiEndpoint {
  id: string;
  group: GroupId;
  method: HttpMethod;
  path: string;
  title: string;
  summary: string;
  scope: string;
  shape: ResponseShape;
  params: ApiParam[];
  /** Example request body for POST endpoints - also the playground's seed. */
  body?: Record<string, unknown>;
  fields: ApiField[];
  notes: string[];
  sample: (values: Record<string, string>) => unknown;
}

export const API_BASE = "https://api.koba.games";
export const API_VERSION = "2026-04-01";

const SAMPLE_PLAYER = {
  id: "koba_7c1f9a2b",
  name: "Vantage",
  handle: "vantage",
  region: "NA",
  standing: "VERIFIED",
  created_at: "2025-11-04T18:21:09Z",
  rank: { tier: "veteran", label: "Veteran", score: 1432, next_tier: "master", next_at: 1600 },
  totals: {
    xp: 184_320,
    hours: 912.5,
    sessions: 2408,
    matches: 1840,
    wins: 731,
    kills: 24_118,
    deaths: 19_842,
    kd: 1.22,
  },
  games: [
    { game: "RUST", platform: "PC", xp: 128_400, hours: 640.2, rank: { tier: "veteran", score: 1432 } },
    { game: "CS2", platform: "PC", xp: 42_180, hours: 208.4, rank: { tier: "marksman", score: 940 } },
    { game: "VALORANT", platform: "CONSOLE", xp: 13_740, hours: 63.9, rank: { tier: "apprentice", score: 412 } },
  ],
  badges_unlocked: 34,
  active_challenges: 3,
};

const SAMPLE_MATCH = {
  id: "mtc_9f21c4",
  game: "RUST",
  platform: "PC",
  region: "NA",
  server: { id: "srv_ashburn_07", name: "KOBA NA East · Ashburn 07" },
  started_at: "2026-10-24T19:02:11Z",
  ended_at: "2026-10-25T19:02:11Z",
  duration_seconds: 86_400,
  result: "WIN",
  koba_power_rating: 27.4,
  score_delta: 18,
  players: 96,
  metrics: {
    kills: 14,
    deaths: 6,
    headshots: 5,
    raid_structures: 3,
    resources_gathered: 18_400,
  },
  top_players: [
    { koba_id: "koba_2d81f0ca", name: "Halcyon", kills: 22, score_delta: 24 },
    { koba_id: "koba_7c1f9a2b", name: "Vantage", kills: 14, score_delta: 18 },
    { koba_id: "koba_b40e5d17", name: "Rook", kills: 11, score_delta: 9 },
  ],
};

const SAMPLE_SERVER = {
  id: "srv_ashburn_07",
  name: "KOBA NA East · Ashburn 07",
  game: "RUST",
  platform: "PC",
  region: "NA",
  status: "ONLINE",
  verified: true,
  population: { online: 142, max: 200, queued: 3 },
  uptime_seconds: 1_204_800,
  last_wipe: "2026-10-03T16:00:00Z",
  next_wipe: "2026-11-07T16:00:00Z",
  clans: 48,
  koba_server_key: "srv_ashburn_07",
};

const SAMPLE_BOARD = {
  id: "lb_global_rust_pc_na",
  scope: "GLOBAL",
  game: "RUST",
  platform: "PC",
  region: "NA",
  season: "2026-S4",
  entries: 48_210,
  updated_at: "2026-10-26T09:41:52Z",
};

const SAMPLE_ENTRIES = [
  { position: 1, koba_id: "koba_2d81f0ca", name: "Halcyon", handle: "halcyon", score: 24_910, delta_24h: 3, rank: "Legendary", region: "NA" },
  { position: 2, koba_id: "koba_9a3f11d6", name: "Sable", handle: "sable", score: 23_774, delta_24h: -1, rank: "Legendary", region: "EU" },
  { position: 3, koba_id: "koba_7c1f9a2b", name: "Vantage", handle: "vantage", score: 22_508, delta_24h: 2, rank: "Elite Guardian", region: "NA" },
  { position: 4, koba_id: "koba_b40e5d17", name: "Rook", handle: "rook", score: 21_960, delta_24h: 0, rank: "Elite Guardian", region: "NA" },
  { position: 5, koba_id: "koba_51c8e2f9", name: "Wren", handle: "wren", score: 21_104, delta_24h: 4, rank: "Elite Guardian", region: "APAC" },
];

const SAMPLE_BADGES = [
  { id: "ironclad", name: "Ironclad", tier: "gold", group: "Combat", earned_at: "2026-09-18T21:04:11Z", detail: "Closed a season without losing a defended base." },
  { id: "night-watch", name: "Night Watch", tier: "silver", group: "Dedication", earned_at: "2026-08-02T03:12:40Z", detail: "400 hours logged after midnight." },
  { id: "raidbreaker", name: "Raidbreaker", tier: "bronze", group: "Combat", earned_at: "2026-06-27T17:55:03Z", detail: "Twenty structures destroyed in a single wipe." },
];

const SAMPLE_CHALLENGES = [
  { id: "chl_8a12", title: "Finish a fight", event: "COMBAT_KILL", progress: 11, need: 25, reward: { kind: "role", id: "marksman" }, expires_at: "2026-11-02T00:00:00Z" },
  { id: "chl_4f90", title: "Close a match", event: "MATCH_END", progress: 1, need: 1, reward: { kind: "xp", amount: 250 }, expires_at: "2026-11-02T00:00:00Z" },
  { id: "chl_c217", title: "See a wipe", event: "WIPE", progress: 0, need: 1, reward: { kind: "badge", id: "raidbreaker" }, expires_at: "2026-11-07T16:00:00Z" },
];

const SAMPLE_EVENT = {
  route: { game: "RUST", platform: "PC", region: "NA", leaderboard_scope: "SERVER" },
  integration_metadata: {
    koba_server_id: "srv_ashburn_07",
    game_type: "RUST",
    payload_timestamp_utc: 1_793_020_931,
  },
  event_envelope: {
    event_type: "COMBAT_KILL",
    cryptographic_signature: "0x9f21c4a7b0d83e51",
    fps_at_execution: 144,
  },
  data_payload: {
    actor_identity: "koba_7c1f9a2b",
    target_identity: "koba_b40e5d17",
    weapon_used: "AK47_RIFLE",
    is_headshot: true,
    combat_distance_meters: 82.4,
    metrics: { shots_fired: 6, shots_hit: 4 },
  },
};

const id = (values: Record<string, string>, key: string, fallback: string) => {
  const value = values[key]?.trim();
  return value && value.length > 0 ? value : fallback;
};

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "players-get",
    group: "players",
    method: "GET",
    path: "/v1/players/{koba_id}",
    title: "Retrieve a player",
    summary:
      "One player's standing across every linked game: total XP, hours logged, current rank, badges held, and how many challenges are in flight.",
    scope: "players.read",
    shape: "player",
    params: [
      { name: "koba_id", in: "path", type: "string", example: SAMPLE_PLAYER.id, required: true, detail: "KOBAid. Always prefixed koba_; never reuse one after an account transfer." },
      { name: "include", in: "query", type: "string", example: "games,challenges", detail: "Comma-separated expansion. games, challenges, badges. Adds one join per expansion." },
    ],
    fields: [
      { name: "id", type: "string", detail: "KOBAid, koba_ prefix." },
      { name: "name / handle", type: "string", detail: "Display name and the lowercase handle used in URLs." },
      { name: "rank", type: "object", detail: "tier, label, score, next_tier, next_at. One ladder across all games." },
      { name: "totals", type: "object", detail: "xp, hours, sessions, matches, wins, kills, deaths, kd." },
      { name: "games[]", type: "array", detail: "game, platform, xp, hours, rank. Present when include=games." },
      { name: "badges_unlocked", type: "integer", detail: "Count of earned badges. The ids live on /badges." },
      { name: "active_challenges", type: "integer", detail: "Challenges with progress below need and an expiry in the future." },
    ],
    notes: [
      "Public fields only. Link state, email, and payment standing never appear here.",
      "Send If-None-Match with the last ETag; a 304 costs no quota.",
    ],
    sample: (values) => ({
      ...SAMPLE_PLAYER,
      id: id(values, "koba_id", SAMPLE_PLAYER.id),
      games: SAMPLE_PLAYER.games,
      active_challenges: SAMPLE_PLAYER.active_challenges,
      links: { profile: `https://koba.games/${SAMPLE_PLAYER.handle}`, avatar: "https://cdn.koba.games/avatars/koba_7c1f9a2b.png" },
    }),
  },
  {
    id: "players-games",
    group: "players",
    method: "GET",
    path: "/v1/players/{koba_id}/games",
    title: "List a player's games",
    summary: "Every title the player has linked, with the per-game slice of their XP, hours, and rank. Console and PC are separate rows.",
    scope: "players.read",
    shape: "collection",
    params: [
      { name: "koba_id", in: "path", type: "string", example: SAMPLE_PLAYER.id, required: true, detail: "KOBAid of the player." },
      { name: "platform", in: "query", type: "string", example: "PC", detail: "PC or CONSOLE. Boards never mix the two." },
    ],
    fields: [
      { name: "data[].game", type: "string", detail: "RUST, CS2, VALORANT, ARK, DAYZ, and the rest of the supported titles." },
      { name: "data[].platform", type: "enum", detail: "PC or CONSOLE." },
      { name: "data[].xp / hours", type: "number", detail: "Cumulative on this title only." },
      { name: "data[].rank", type: "object", detail: "tier and score for this game's board." },
    ],
    notes: ["A linked title with no verified server activity still returns a row, with xp 0."],
    sample: (values) => ({
      data: SAMPLE_PLAYER.games.filter((row) => !values.platform || row.platform === values.platform.trim().toUpperCase()),
      meta: { koba_id: id(values, "koba_id", SAMPLE_PLAYER.id), count: SAMPLE_PLAYER.games.length },
    }),
  },
  {
    id: "players-badges",
    group: "players",
    method: "GET",
    path: "/v1/players/{koba_id}/badges",
    title: "List unlocked badges",
    summary: "The badges a player has earned, newest first, with the tier that decides how the crest is painted.",
    scope: "players.read",
    shape: "collection",
    params: [
      { name: "koba_id", in: "path", type: "string", example: SAMPLE_PLAYER.id, required: true, detail: "KOBAid of the player." },
      { name: "tier", in: "query", type: "string", example: "gold", detail: "bronze, silver, or gold. Omit for every tier." },
      { name: "limit", in: "query", type: "integer", example: "25", detail: "1-100. Defaults to 25." },
    ],
    fields: [
      { name: "data[].id", type: "string", detail: "Stable badge id. Art lives at /badges/<id>.svg." },
      { name: "data[].tier", type: "enum", detail: "bronze, silver, gold. Sets the crest colour." },
      { name: "data[].group", type: "string", detail: "Combat, Dedication, Community, Standing." },
      { name: "data[].earned_at", type: "string", detail: "ISO 8601 UTC timestamp." },
    ],
    notes: ["Locked badges are never returned. Request them with ?include=locked on the profile endpoint."],
    sample: (values) => {
      const tier = values.tier?.trim().toLowerCase();
      const rows = tier ? SAMPLE_BADGES.filter((badge) => badge.tier === tier) : SAMPLE_BADGES;
      return {
        data: rows,
        meta: { koba_id: id(values, "koba_id", SAMPLE_PLAYER.id), count: rows.length, locked: 0 },
      };
    },
  },
  {
    id: "players-challenges",
    group: "players",
    method: "GET",
    path: "/v1/players/{koba_id}/challenges",
    title: "List active challenges",
    summary: "What the player is currently working toward, with live progress and the reward that lands on completion.",
    scope: "challenges.read",
    shape: "collection",
    params: [
      { name: "koba_id", in: "path", type: "string", example: SAMPLE_PLAYER.id, required: true, detail: "KOBAid of the player." },
      { name: "state", in: "query", type: "string", example: "active", detail: "active, completed, or expired. Defaults to active." },
    ],
    fields: [
      { name: "data[].event", type: "enum", detail: "COMBAT_KILL, MATCH_END, WIPE, or OBJECTIVE. Progress only moves on a passing event." },
      { name: "data[].progress / need", type: "integer", detail: "Filled when progress reaches need." },
      { name: "data[].reward", type: "object", detail: "kind is role, badge, or xp, plus the id or amount." },
      { name: "data[].expires_at", type: "string", detail: "ISO 8601. Expired challenges stop counting immediately." },
    ],
    notes: ["Progress is recomputed from the event log, not stored per challenge, so a replayed event never double-counts."],
    sample: (values) => ({
      data: SAMPLE_CHALLENGES,
      meta: { koba_id: id(values, "koba_id", SAMPLE_PLAYER.id), count: SAMPLE_CHALLENGES.length, state: "active" },
    }),
  },
  {
    id: "players-rank",
    group: "players",
    method: "GET",
    path: "/v1/players/{koba_id}/rank",
    title: "Retrieve a player's rank",
    summary: "The player's position on one board, plus the points between them and the next tier - the number a clan site puts beside a name.",
    scope: "rankings.read",
    shape: "generic",
    params: [
      { name: "koba_id", in: "path", type: "string", example: SAMPLE_PLAYER.id, required: true, detail: "KOBAid of the player." },
      { name: "board", in: "query", type: "string", example: "lb_global_rust_pc_na", detail: "Board id from /v1/leaderboards. Defaults to the global board for the player's primary game." },
    ],
    fields: [
      { name: "position", type: "integer", detail: "1-based position on the board." },
      { name: "of", type: "integer", detail: "Total ranked entries on that board." },
      { name: "score / delta_24h", type: "number", detail: "Current score and the 24-hour movement. Negative is falling." },
      { name: "to_next_tier", type: "object", detail: "tier and points_remaining. null on the top tier." },
    ],
    notes: ["Positions are computed at read time from the edge nodes, so a 30-second lag is normal on a busy board."],
    sample: (values) => ({
      koba_id: id(values, "koba_id", SAMPLE_PLAYER.id),
      board: { ...SAMPLE_BOARD, id: id(values, "board", SAMPLE_BOARD.id) },
      position: 3,
      of: 48_210,
      score: 22_508,
      delta_24h: 2,
      rank: { tier: "elite-guardian", label: "Elite Guardian" },
      to_next_tier: { tier: "legendary", at: 24_000, points_remaining: 1_492 },
    }),
  },

  {
    id: "leaderboards-list",
    group: "leaderboards",
    method: "GET",
    path: "/v1/leaderboards",
    title: "List leaderboards",
    summary: "Every board KOBA keeps for a game, resolved by scope. Pick one, then read its entries.",
    scope: "leaderboards.read",
    shape: "collection",
    params: [
      { name: "game", in: "query", type: "string", example: "RUST", detail: "Supported game id. Omit for every game." },
      { name: "platform", in: "query", type: "string", example: "PC", detail: "PC or CONSOLE." },
      { name: "region", in: "query", type: "string", example: "NA", detail: "NA, EU, APAC, OCE, LATAM, or AFR." },
      { name: "scope", in: "query", type: "string", example: "GLOBAL", detail: "GLOBAL, REGION, SERVER, CLAN, or SEASON." },
    ],
    fields: [
      { name: "data[].id", type: "string", detail: "Board id, e.g. lb_global_rust_pc_na." },
      { name: "data[].scope", type: "enum", detail: "What the board is scoped to. A SERVER board needs a server_id." },
      { name: "data[].season", type: "string", detail: "Season key. Boards roll over at wipe." },
      { name: "data[].entries", type: "integer", detail: "Ranked entries currently on the board." },
    ],
    notes: ["Boards are immutable per season. A wipe creates a new board instead of clearing the old one."],
    sample: (values) => {
      const game = id(values, "game", "RUST").toUpperCase();
      const platform = id(values, "platform", "PC").toUpperCase();
      const region = id(values, "region", "NA").toUpperCase();
      return {
        data: [
          { ...SAMPLE_BOARD, id: `lb_global_${game.toLowerCase()}_${platform.toLowerCase()}_${region.toLowerCase()}`, game, platform, region, scope: "GLOBAL" },
          { ...SAMPLE_BOARD, id: `lb_region_${game.toLowerCase()}_${region.toLowerCase()}`, game, platform, region, scope: "REGION", entries: 9_412 },
          { ...SAMPLE_BOARD, id: `lb_server_srv_ashburn_07`, game, platform, region, scope: "SERVER", entries: 142 },
          { ...SAMPLE_BOARD, id: `lb_season_${game.toLowerCase()}_2026-s4`, game, platform, region, scope: "SEASON", entries: 48_210 },
        ],
        meta: { count: 4 },
      };
    },
  },
  {
    id: "leaderboards-entries",
    group: "leaderboards",
    method: "GET",
    path: "/v1/leaderboards/{board_id}/entries",
    title: "List leaderboard entries",
    summary: "The ranked array itself. Cursor paginated, so a clan site can render a top-10 or walk the whole board.",
    scope: "leaderboards.read",
    shape: "collection",
    params: [
      { name: "board_id", in: "path", type: "string", example: SAMPLE_BOARD.id, required: true, detail: "Board id from /v1/leaderboards." },
      { name: "limit", in: "query", type: "integer", example: "10", detail: "1-100. Defaults to 25." },
      { name: "cursor", in: "query", type: "string", example: "", detail: "meta.next_cursor from the previous page." },
    ],
    fields: [
      { name: "data[].position", type: "integer", detail: "1-based. Ties share a position." },
      { name: "data[].koba_id / name / handle", type: "string", detail: "Identity fields, safe to render publicly." },
      { name: "data[].score", type: "number", detail: "KOBA score on this board." },
      { name: "data[].delta_24h", type: "integer", detail: "Positions gained (positive) or lost (negative) in 24 hours." },
      { name: "data[].rank", type: "string", detail: "Tier label for that score." },
      { name: "meta.next_cursor", type: "string | null", detail: "null on the last page." },
    ],
    notes: ["Read-only and cacheable for 30 seconds. There is no write endpoint: boards move from events only."],
    sample: (values) => {
      const limit = Math.min(Math.max(Number.parseInt(values.limit ?? "5", 10) || 5, 1), 5);
      return {
        board: { ...SAMPLE_BOARD, id: id(values, "board_id", SAMPLE_BOARD.id) },
        data: SAMPLE_ENTRIES.slice(0, limit),
        meta: {
          count: limit,
          total: SAMPLE_BOARD.entries,
          next_cursor: limit < SAMPLE_ENTRIES.length ? "eyJwIjo1fQ" : null,
          cursor: values.cursor?.trim() || null,
        },
      };
    },
  },

  {
    id: "matches-list",
    group: "matches",
    method: "GET",
    path: "/v1/matches",
    title: "List match results",
    summary: "Recent match endings for a server or a player, newest first. Each row is a scored result, not a live game.",
    scope: "matches.read",
    shape: "collection",
    params: [
      { name: "server_id", in: "query", type: "string", example: "srv_ashburn_07", detail: "Only matches on this host." },
      { name: "koba_id", in: "query", type: "string", example: SAMPLE_PLAYER.id, detail: "Only matches this player took part in." },
      { name: "game", in: "query", type: "string", example: "RUST", detail: "Supported game id." },
      { name: "limit", in: "query", type: "integer", example: "10", detail: "1-100. Defaults to 25." },
    ],
    fields: [
      { name: "data[].id", type: "string", detail: "Match id, mtc_ prefix." },
      { name: "data[].server", type: "object", detail: "id and name of the host that closed the match." },
      { name: "data[].result", type: "enum", detail: "WIN, LOSS, or DRAW for the requested player; null for a server query." },
      { name: "data[].koba_power_rating", type: "number", detail: "Weighted rating from the event mix, not raw kills." },
      { name: "data[].metrics", type: "object", detail: "Game numbers: kills, deaths, headshots, raid_structures, resources_gathered." },
    ],
    notes: ["A match row appears only after MATCH_END passes every ingest gate. Partial matches never show."],
    sample: (values) => ({
      data: [
        SAMPLE_MATCH,
        { ...SAMPLE_MATCH, id: "mtc_44be07", ended_at: "2026-10-23T18:40:02Z", result: "LOSS", score_delta: -6, players: 88 },
        { ...SAMPLE_MATCH, id: "mtc_1c9d38", ended_at: "2026-10-22T20:12:44Z", result: "WIN", score_delta: 12, players: 104 },
      ].slice(0, Math.min(Math.max(Number.parseInt(values.limit ?? "3", 10) || 3, 1), 3)),
      meta: { count: 3, next_cursor: "eyJwIjozfQ" },
    }),
  },
  {
    id: "matches-get",
    group: "matches",
    method: "GET",
    path: "/v1/matches/{match_id}",
    title: "Retrieve a match",
    summary: "The full result of one match: duration, population, the metrics that were scored, and the players who moved the board.",
    scope: "matches.read",
    shape: "match",
    params: [
      { name: "match_id", in: "path", type: "string", example: SAMPLE_MATCH.id, required: true, detail: "Match id, mtc_ prefix." },
    ],
    fields: [
      { name: "started_at / ended_at", type: "string", detail: "ISO 8601 UTC." },
      { name: "duration_seconds", type: "integer", detail: "Server-reported; gaps in telemetry extend it." },
      { name: "score_delta", type: "integer", detail: "KOBA score change for the queried player." },
      { name: "top_players[]", type: "array", detail: "The five highest kill counts, with their score movement." },
      { name: "metrics", type: "object", detail: "Only the keys the game actually reported." },
    ],
    notes: ["A match id is stable across replays: a corrected result raises the same id with a new revision field."],
    sample: (values) => ({
      ...SAMPLE_MATCH,
      id: id(values, "match_id", SAMPLE_MATCH.id),
      revision: 2,
      map: "Procedural · 4250",
    }),
  },
  {
    id: "wipes-get",
    group: "matches",
    method: "GET",
    path: "/v1/wipes/{wipe_id}",
    title: "Retrieve a server wipe",
    summary: "A wipe closes the season on one host: what was carried over, which boards were archived, and which clans kept their standing.",
    scope: "matches.read",
    shape: "generic",
    params: [
      { name: "wipe_id", in: "path", type: "string", example: "wpe_3b71", required: true, detail: "Wipe id, wpe_ prefix." },
    ],
    fields: [
      { name: "server_id", type: "string", detail: "The host that wiped." },
      { name: "wiped_at", type: "string", detail: "ISO 8601 UTC. Boards reset after this instant." },
      { name: "season", type: "string", detail: "Season that just closed, and the one that opens." },
      { name: "boards_archived", type: "integer", detail: "Boards frozen at wipe. Old boards stay readable." },
      { name: "carried_over", type: "object", detail: "clans and players whose lifetime totals survived the reset." },
    ],
    notes: ["A wipe is an event, not a delete. Match history from the closed season remains queryable by wipe id."],
    sample: (values) => ({
      id: id(values, "wipe_id", "wpe_3b71"),
      server_id: SAMPLE_SERVER.id,
      game: "RUST",
      region: "NA",
      wiped_at: "2026-10-03T16:00:00Z",
      kit: "Monthly · Vanilla x2",
      season: { closed: "2026-S3", opened: "2026-S4" },
      boards_archived: 4,
      carried_over: { clans: 48, players: 2_310, lifetime_only: true },
      top_clans: [
        { id: "cln_2b71", name: "Nightshift", members: 42, score: 18_420 },
        { id: "cln_8c04", name: "Cold Harbour", members: 36, score: 17_906 },
      ],
    }),
  },

  {
    id: "servers-list",
    group: "servers",
    method: "GET",
    path: "/v1/servers",
    title: "List servers",
    summary: "Registered KOBA hosts, filterable by game and region. The ids here are the ones you post events against.",
    scope: "servers.read",
    shape: "collection",
    params: [
      { name: "game", in: "query", type: "string", example: "RUST", detail: "Supported game id." },
      { name: "region", in: "query", type: "string", example: "NA", detail: "NA, EU, APAC, OCE, LATAM, or AFR." },
      { name: "status", in: "query", type: "string", example: "ONLINE", detail: "ONLINE, OFFLINE, or WIPING." },
    ],
    fields: [
      { name: "data[].id", type: "string", detail: "Server id, srv_ prefix. Stable for the life of the host." },
      { name: "data[].population", type: "object", detail: "online, max, queued. Refreshed every 20 seconds." },
      { name: "data[].last_wipe / next_wipe", type: "string", detail: "ISO 8601 UTC. next_wipe is null on a manually-wiped host." },
      { name: "data[].verified", type: "boolean", detail: "The host signs its events with a KOBA-issued key." },
    ],
    notes: ["Population is an edge value with a 20-second TTL. Do not poll it for a live player count; subscribe to server.player_joined instead."],
    sample: (values) => {
      const game = id(values, "game", "RUST").toUpperCase();
      return {
        data: [
          { ...SAMPLE_SERVER, game },
          { ...SAMPLE_SERVER, id: "srv_frankfurt_02", name: "KOBA EU · Frankfurt 02", region: "EU", population: { online: 196, max: 200, queued: 21 } },
          { ...SAMPLE_SERVER, id: "srv_sydney_01", name: "KOBA OCE · Sydney 01", region: "OCE", population: { online: 74, max: 150, queued: 0 } },
        ],
        meta: { count: 3 },
      };
    },
  },
  {
    id: "servers-get",
    group: "servers",
    method: "GET",
    path: "/v1/servers/{server_id}",
    title: "Retrieve a server",
    summary: "One host: live population, uptime, wipe schedule, and the clan count currently fighting on it.",
    scope: "servers.read",
    shape: "generic",
    params: [
      { name: "server_id", in: "path", type: "string", example: SAMPLE_SERVER.id, required: true, detail: "Server id, srv_ prefix." },
    ],
    fields: [
      { name: "status", type: "enum", detail: "ONLINE, OFFLINE, or WIPING." },
      { name: "uptime_seconds", type: "integer", detail: "Since the last restart, not the last wipe." },
      { name: "koba_server_key", type: "string", detail: "What the adapter signs events with. Never expose it client-side." },
      { name: "clans", type: "integer", detail: "Clans with at least one member active this season." },
    ],
    notes: ["Server keys are shown to the owning account only; a public read returns koba_server_key: null."],
    sample: (values) => ({
      ...SAMPLE_SERVER,
      id: id(values, "server_id", SAMPLE_SERVER.id),
      koba_server_key: null,
      boards: ["lb_server_srv_ashburn_07"],
    }),
  },
  {
    id: "servers-players",
    group: "servers",
    method: "GET",
    path: "/v1/servers/{server_id}/players",
    title: "List online players",
    summary: "Who is on the host right now, with session length and the clan they are flying. The payload a Discord bot posts on demand.",
    scope: "servers.players.read",
    shape: "collection",
    params: [
      { name: "server_id", in: "path", type: "string", example: SAMPLE_SERVER.id, required: true, detail: "Server id, srv_ prefix." },
      { name: "limit", in: "query", type: "integer", example: "10", detail: "1-500. Defaults to 50." },
    ],
    fields: [
      { name: "data[].koba_id", type: "string", detail: "Verified player. Unlinked Steam ids are omitted." },
      { name: "data[].session_seconds", type: "integer", detail: "Since SESSION_JOIN landed on the edge." },
      { name: "data[].clan", type: "object | null", detail: "id and tag, or null when the player is solo." },
    ],
    notes: ["Privacy-aware: players who hide their online state are counted in population but absent from this list."],
    sample: (values) => ({
      server: { id: id(values, "server_id", SAMPLE_SERVER.id), population: SAMPLE_SERVER.population },
      data: [
        { koba_id: "koba_2d81f0ca", name: "Halcyon", session_seconds: 7_412, clan: { id: "cln_2b71", tag: "NIGHT" } },
        { koba_id: SAMPLE_PLAYER.id, name: "Vantage", session_seconds: 3_186, clan: { id: "cln_2b71", tag: "NIGHT" } },
        { koba_id: "koba_b40e5d17", name: "Rook", session_seconds: 921, clan: null },
      ],
      meta: { count: 3, total_online: SAMPLE_SERVER.population.online },
    }),
  },

  {
    id: "events-ingest",
    group: "events",
    method: "POST",
    path: "/v1/events/ingest",
    title: "Ingest one event",
    summary: "The write side of the platform. Post a normalized event and let KOBA score it: gates, HMAC verification, then the leaderboard moves.",
    scope: "events.write",
    shape: "generic",
    params: [
      { name: "Idempotency-Key", in: "header", type: "string", example: "0x9f21c4a7b0d83e51", detail: "Replays of the same key return the original receipt instead of scoring twice." },
    ],
    body: SAMPLE_EVENT,
    fields: [
      { name: "route", type: "object", detail: "game, platform, region, leaderboard_scope. The route is the board." },
      { name: "integration_metadata", type: "object", detail: "koba_server_id, game_type, payload_timestamp_utc." },
      { name: "event_envelope", type: "object", detail: "event_type, cryptographic_signature, fps_at_execution." },
      { name: "data_payload", type: "object", detail: "actor/target identity, weapon, and up to 16 numeric metrics." },
      { name: "receipt.accepted", type: "boolean", detail: "Every gate passed. Nothing is written when false." },
      { name: "receipt.gates[]", type: "array", detail: "Per-gate pass/fail with the reason, so a plugin can log why it was dropped." },
    ],
    notes: [
      "Rate limited to 6 calls per 10 seconds per token. Excess is dropped, not queued.",
      "Verification checks the signature only. It never opens a player session.",
    ],
    sample: () => ({
      receipt: {
        id: "evt_7f31a2",
        accepted: true,
        event_type: "COMBAT_KILL",
        route: SAMPLE_EVENT.route,
        gates: [
          { id: "shape", pass: true, detail: "Envelope matches the published schema." },
          { id: "signature", pass: true, detail: "HMAC verified against the server key." },
          { id: "clock", pass: true, detail: "Timestamp inside the 120 second window." },
          { id: "sanitize", pass: true, detail: "No markup, nulls, or template markers." },
        ],
        score: { player_id: "koba_7c1f9a2b", delta: 6, power_rating: 27.4 },
      },
    }),
  },
  {
    id: "webhooks-test",
    group: "events",
    method: "POST",
    path: "/v1/webhooks/test",
    title: "Send a test delivery",
    summary: "Fire one signed webhook at your endpoint with a payload of your choosing, without touching a real player's record.",
    scope: "webhooks.write",
    shape: "generic",
    params: [],
    body: {
      event: "achievement.unlocked",
      endpoint_id: "whe_2c81",
      payload: {
        koba_id: "koba_7c1f9a2b",
        badge: { id: "ironclad", name: "Ironclad", tier: "gold" },
      },
    },
    fields: [
      { name: "delivery.id", type: "string", detail: "Delivery id, dlv_ prefix. Appears in the delivery log." },
      { name: "delivery.status", type: "string", detail: "queued, delivered, or failed." },
      { name: "delivery.signature", type: "string", detail: "HMAC-SHA256 of the raw body, timestamped. Verify it server-side." },
      { name: "delivery.attempt", type: "integer", detail: "1 for a test. Retries increment this." },
    ],
    notes: ["Tests are marked mock: true and never appear as real events in statistics."],
    sample: () => ({
      delivery: {
        id: "dlv_91c4e0",
        endpoint_id: "whe_2c81",
        event: "achievement.unlocked",
        status: "delivered",
        attempt: 1,
        mock: true,
        signature: "t=1793020931,v1=8f2c9a41d7be0356",
        latency_ms: 84,
      },
    }),
  },
  {
    id: "webhooks-deliveries",
    group: "events",
    method: "GET",
    path: "/v1/webhooks/deliveries",
    title: "List webhook deliveries",
    summary: "The delivery log: what KOBA sent, what your endpoint returned, and what is still retrying.",
    scope: "webhooks.read",
    shape: "collection",
    params: [
      { name: "status", in: "query", type: "string", example: "failed", detail: "queued, delivered, or failed. Omit for all." },
      { name: "event", in: "query", type: "string", example: "achievement.unlocked", detail: "Filter by event name." },
      { name: "limit", in: "query", type: "integer", example: "20", detail: "1-100. Defaults to 50." },
    ],
    fields: [
      { name: "data[].event", type: "string", detail: "One of the subscribed event names." },
      { name: "data[].response_status", type: "integer | null", detail: "Your HTTP status. null while queued." },
      { name: "data[].attempts", type: "integer", detail: "Five attempts, exponential backoff, then the delivery is parked." },
      { name: "data[].replay_safe", type: "boolean", detail: "True when the idempotency key has not been seen before." },
    ],
    notes: ["Retries are signed with the same key. Verify the timestamp, not just the hash, or a replay looks fresh."],
    sample: (values) => ({
      data: [
        { id: "dlv_91c4e0", event: "achievement.unlocked", status: "delivered", attempts: 1, response_status: 200, replay_safe: true, created_at: "2026-10-26T09:41:52Z", latency_ms: 84 },
        { id: "dlv_88b102", event: "server.player_joined", status: "delivered", attempts: 1, response_status: 204, replay_safe: true, created_at: "2026-10-26T09:40:11Z", latency_ms: 61 },
        { id: "dlv_7712ae", event: "rank.changed", status: "failed", attempts: 4, response_status: 502, replay_safe: true, created_at: "2026-10-26T09:32:07Z", latency_ms: 1_204 },
      ].filter((row) => !values.status || row.status === values.status.trim()),
      meta: { count: 3, window: "last 24 hours" },
    }),
  },
];

export function endpointById(idValue: string): ApiEndpoint | undefined {
  return API_ENDPOINTS.find((endpoint) => endpoint.id === idValue);
}

export function endpointsByGroup(group: GroupId): ApiEndpoint[] {
  return API_ENDPOINTS.filter((endpoint) => endpoint.group === group);
}

export function defaultValues(endpoint: ApiEndpoint): Record<string, string> {
  return Object.fromEntries(endpoint.params.map((param) => [param.name, param.example]));
}

/** The webhook catalogue, as published in the event reference. */
export const WEBHOOK_EVENTS = [
  "player.created",
  "player.connected",
  "server.online",
  "server.player_joined",
  "server.player_left",
  "challenge.completed",
  "achievement.unlocked",
  "rank.changed",
  "clan.member_joined",
  "competition.completed",
  "marketplace.order.created",
  "boost.activated",
];

export const SCOPES = [
  { scope: "players.read", grants: "Profile, XP, hours, and rank for any public player." },
  { scope: "players.games.read", grants: "Linked titles and the per-game split." },
  { scope: "leaderboards.read", grants: "Boards and their ranked entries, including historical seasons." },
  { scope: "rankings.read", grants: "One player's position on one board." },
  { scope: "challenges.read", grants: "Active, completed, and expired challenges." },
  { scope: "matches.read", grants: "Match results and wipe records." },
  { scope: "servers.read", grants: "Registered hosts and their live population." },
  { scope: "servers.players.read", grants: "Who is online on a host right now." },
  { scope: "events.write", grants: "Post normalized events from an adapter." },
  { scope: "webhooks.write", grants: "Send test deliveries and manage subscriptions." },
];

export interface ScenarioStep {
  id: string;
  label: string;
  detail: string;
  ms: number;
  event?: string;
  payload?: unknown;
}

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  trigger: string;
  steps: ScenarioStep[];
}

export type SandboxPlatform = "PC" | "CONSOLE";

/** A title the sandbox can simulate. Platform support follows the real boards. */
export interface SandboxGame {
  id: string;
  label: string;
  slug: string;
  platforms: SandboxPlatform[];
}

/**
 * Derived from the site's one supported-games list, so the sandbox can never
 * drift from the titles KOBA actually onboards or invent a board that does
 * not exist. Boards run on PC and console only; mobile/web titles keep the
 * platforms they share with those boards.
 */
export const SANDBOX_GAMES: SandboxGame[] = SUPPORTED_GAMES.map((game) => ({
  id: game.id,
  label: game.name,
  slug: game.id.toLowerCase(),
  platforms: game.devices
    .filter((device): device is "PC" | "Console" => device === "PC" || device === "Console")
    .map((device) => (device === "Console" ? "CONSOLE" : "PC")),
})).filter((game) => game.platforms.length > 0);

/**
 * The sandbox scenarios, built for the selected title and platform, so no
 * title is baked into the docs. Board ids and payload source fields follow
 * the same `lb_<scope>_<game>_<platform>_<region>` shape the API uses.
 */
export function sandboxScenarios(game: SandboxGame, platform: SandboxPlatform): Scenario[] {
  const board = `lb_global_${game.slug}_${platform.toLowerCase()}_na`;
  const source = { game: game.id, platform, server_id: "srv_ashburn_07" };
  const badgePayload = {
    event: "achievement.unlocked",
    created_at: "2026-10-26T09:41:52Z",
    data: {
      koba_id: "koba_7c1f9a2b",
      name: "Vantage",
      badge: { id: "ironclad", name: "Ironclad", tier: "gold", group: "Combat" },
      source,
      rank: { before: "elite-guardian", after: "legendary" },
    },
  };
  return [
  {
    id: "badge-unlocks",
    title: "A badge unlocks",
    summary: `A player earns a crest on ${game.label} ${platform}, KOBA signs it, your endpoint receives it.`,
    trigger: "achievement.unlocked",
    steps: [
      { id: "event", label: "Challenge completes", detail: "Progress reaches need, so the reward is queued.", ms: 340, event: "challenge.completed" },
      { id: "award", label: "Badge is written", detail: "ironclad is added to the player's collection at tier gold.", ms: 420, event: "achievement.unlocked" },
      { id: "sign", label: "Delivery is signed", detail: "HMAC-SHA256 over the raw body with a timestamp header.", ms: 280 },
      { id: "deliver", label: "Webhook delivered", detail: "POST to your endpoint · 200 OK · 84 ms.", ms: 380, event: "achievement.unlocked", payload: badgePayload },
    ],
  },
  {
    id: "kill-lands",
    title: `A kill lands on ${game.label}`,
    summary: `Post one COMBAT_KILL from ${game.label} ${platform} and watch the chain the platform actually runs: gates, score, challenge progress, rank movement.`,
    trigger: "POST /v1/events/ingest",
    steps: [
      { id: "gates", label: "Gates pass", detail: `Shape, signature, clock, and sanitize all return true for ${game.id} on ${platform}.`, ms: 320 },
      { id: "score", label: "KOBA score moves", detail: "COMBAT_KILL adds 6 on a SERVER board.", ms: 360, event: "rank.changed" },
      { id: "challenge", label: "Challenge advances", detail: "Finish a fight · 11 / 25.", ms: 300 },
      { id: "board", label: "Board recomputes", detail: `Position 4 → 3 on ${board}.`, ms: 340 },
      { id: "webhook", label: "Webhook delivered", detail: "rank.changed · 1 attempt · 61 ms.", ms: 260, event: "rank.changed", payload: { event: "rank.changed", data: { koba_id: "koba_7c1f9a2b", board, before: 4, after: 3, score: 22_508 } } },
    ],
  },
  {
    id: "player-joins",
    title: "A player joins a server",
    summary: "The presence path. Useful for a Discord bot that announces arrivals without polling the population endpoint.",
    trigger: "server.player_joined",
    steps: [
      { id: "join", label: "SESSION_JOIN accepted", detail: "Signed by srv_ashburn_07 · clock inside the window.", ms: 300 },
      { id: "presence", label: "Population increments", detail: "142 → 143 online on the edge node.", ms: 260 },
      { id: "deliver", label: "Webhook delivered", detail: "server.player_joined · your endpoint returned 204.", ms: 320, event: "server.player_joined", payload: { event: "server.player_joined", data: { server_id: "srv_ashburn_07", koba_id: "koba_7c1f9a2b", name: "Vantage", online: 143 } } },
    ],
  },
  {
    id: "season-wipe",
    title: "A season wipes",
    summary: "The destructive path: boards archive, seasons roll, lifetime totals survive. Run it before your app trusts a board id.",
    trigger: "WIPE",
    steps: [
      { id: "event", label: "WIPE accepted", detail: `Season 2026-S3 closes on the ${game.label} ${platform} host.`, ms: 320 },
      { id: "archive", label: "Boards archive", detail: "Four boards frozen. Old ids stay readable.", ms: 380, event: "competition.completed" },
      { id: "reset", label: "Scores reset", detail: "Season scores start at zero; lifetime XP is untouched.", ms: 340 },
      { id: "deliver", label: "Webhook delivered", detail: "competition.completed · 1 attempt · 92 ms.", ms: 300, payload: { event: "competition.completed", data: { server_id: "srv_ashburn_07", wipe_id: "wpe_3b71", season: "2026-S3", archived_boards: 4 } } },
    ],
  },
  ];
}

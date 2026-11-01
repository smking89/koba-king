/**
 * Real KOBA integration - talks to kobabot's admin web server
 * (admin/rivalsApi.js), not the in-browser fake REST runtime in
 * src/lib/api.ts (that one is the developer-portal playground, entirely
 * separate). Rust Console Edition only: kobabot has no data for any other
 * title this app lists, so everything here is scoped to the `rust_console`
 * gameId (src/data/games.ts).
 *
 * AUTH: see admin/rivalsApi.js's header for the full one-time-code login
 * handoff. In short - "Connect KOBA Account" does a normal top-level
 * navigation to KOBA_API_URL/auth/discord?returnTo=/rivals/handoff, which
 * eventually lands back here at /auth/callback?code=..., which this file's
 * `completeSignIn()` exchanges for a long-lived bearer token stored in
 * localStorage. Every other call sends that token as
 * `Authorization: Bearer <token>`.
 */

import type { ArenaServer, Player, PlayerGame } from '../types';

const TOKEN_KEY = 'rivalry.koba_token.v1';

/** The kobabot admin server's own origin, e.g. https://koba.games - set VITE_KOBA_API_URL in .env. Left unset, every function below no-ops/returns nothing instead of throwing, so the app still runs fully on its existing mock data. */
function apiBase(): string | null {
  const base = (import.meta.env.VITE_KOBA_API_URL as string | undefined)?.trim().replace(/\/+$/, '');
  return base || null;
}

export function isKobaConfigured(): boolean {
  return apiBase() !== null;
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked/full - the session just won't survive a reload, nothing more to do.
  }
}

export function isKobaSignedIn(): boolean {
  return getToken() !== null;
}

export function kobaSignOut(): void {
  setToken(null);
}

/** Starts the login handoff (see this file's header) - a real top-level navigation, not a fetch. */
export function kobaSignInUrl(): string | null {
  const base = apiBase();
  if (!base) return null;
  return `${base}/auth/discord?returnTo=${encodeURIComponent('/rivals/handoff')}`;
}

/**
 * Call once on app boot. If the current URL is the OAuth handoff's landing
 * page (/auth/callback?code=...), exchanges the one-time code for a bearer
 * token, stores it, and strips the code out of the URL (so a refresh/share
 * of this exact URL can't replay an already-consumed code). No-op on any
 * other page.
 */
export async function completeSignIn(): Promise<boolean> {
  if (window.location.pathname !== '/auth/callback') return false;
  const code = new URLSearchParams(window.location.search).get('code');
  window.history.replaceState(null, '', '/');
  if (!code) return false;

  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/rivals/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token: string };
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}

async function authedGet<T>(path: string): Promise<T | null> {
  const base = apiBase();
  const token = getToken();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      setToken(null); // expired/invalid - drop it so the UI falls back to signed-out state instead of looping on a dead token
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface KobaEntitlements {
  label: string;
  dailySwipeLimit: number | null;
  challengesCreatedPerDay: number;
  maxActiveCreatedChallenges: number;
  maxStakePerChallenge: number;
  priorityMatchmaking: boolean;
  seeWhoSwipedOnYou: boolean;
  advancedStatistics: boolean;
  earlyAccess: boolean;
  adFree: boolean;
}

export interface KobaUsage {
  swipesToday: number;
  challengesCreatedToday: number;
  activeCreatedChallenges: number;
}

interface KobaProgressionFields {
  score: number;
  scoreTier: string;
  wins: number;
  losses: number;
  streak: number;
  level: number;
  rankName: string;
  rankBadgeUrl: string;
  prestige: number;
  prestigeName: string | null;
  prestigeBadgeUrl: string | null;
}

export interface KobaMe extends KobaProgressionFields {
  kobaid: string;
  discordId: string | null;
  username: string;
  avatar: string | null;
  gamertag: string | null;
  platform: 'xbox' | 'playstation' | 'steam' | null;
  tags: string[];
  linked: boolean;
  plan: 'basic' | 'pro' | 'max';
  entitlements: KobaEntitlements;
  usage: KobaUsage;
}

export function fetchKobaMe(): Promise<KobaMe | null> {
  return authedGet<KobaMe>('/api/rivals/me');
}

/** Reports one swipe to kobabot's server-side daily counter (Basic's 20/day cap) - call this on every left/right swipe once signed in, so the cap can't be bypassed by clearing localStorage. No-op (always allows) when not signed in or kobabot isn't configured, since the cap only applies to a real KOBA account. */
export async function reportSwipe(): Promise<{ ok: boolean; limitReached: boolean }> {
  const base = apiBase();
  const token = getToken();
  if (!base || !token) return { ok: true, limitReached: false };
  try {
    const res = await fetch(`${base}/api/rivals/swipe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) return { ok: false, limitReached: true };
    return { ok: res.ok, limitReached: false };
  } catch {
    return { ok: true, limitReached: false };
  }
}

const RUST_GAME: PlayerGame = { gameId: 'rust_console', rank: 'Unranked', tier: 1, role: 'Survivor' };

function platformFor(platform: string | null): Player['platform'] {
  if (platform === 'xbox') return 'Xbox';
  if (platform === 'playstation') return 'PS5';
  return 'PC'; // 'steam' or unset - closest existing Platform value, this bot has no PC-specific identity data
}

interface KobaPlayerRow extends KobaProgressionFields {
  id: string;
  username: string;
  gamertag: string | null;
  platform: string | null;
  tags: string[];
}

/** Maps a real boom_identity row to the app's Player shape. score/streak/level/rank/wins/losses are all real (kobabot's global KOBA Score + Elo-derived kill streak + XP progression - see admin/rivalsApi.js's progressionBlock). Everything kobabot still doesn't track (reliability, online, verified, mic, intensity, badges, socials) stays at a neutral default rather than a plausible-looking fabricated number. */
function toPlayer(row: KobaPlayerRow): Player {
  return {
    id: row.id,
    username: row.gamertag || row.username,
    displayName: row.gamertag || row.username,
    bio: '',
    avatar: ['#ce4a1f', '#5c2410'],
    bannerGameId: 'rust_console',
    score: row.score,
    reliability: 100,
    record: { wins: row.wins, losses: row.losses },
    streak: row.streak,
    region: 'Unknown',
    platform: platformFor(row.platform),
    games: [RUST_GAME],
    tags: row.tags,
    online: false,
    verified: false,
    mic: false,
    intensity: 2,
    badges: [],
    socials: {},
    kobaRankName: row.rankName,
    kobaRankBadgeUrl: row.rankBadgeUrl,
    kobaScoreTier: row.scoreTier,
    kobaLevel: row.level,
  };
}

export async function fetchKobaPlayers(): Promise<Player[]> {
  const result = await authedGet<{ data: KobaPlayerRow[] }>('/api/rivals/players');
  return result?.data.map(toPlayer) ?? [];
}

interface KobaServerRow {
  id: string;
  name: string;
  invite: string;
  tags: string[];
  players: number;
  maxPlayers: number;
  queued: number;
  active: boolean;
}

/** Rust Console Edition has no typed server-connect command (console players join through the in-game server browser), so there is no real "ip" to put here - the Discord invite is the actual way to find/join one of these communities. ArenaLobby.tsx's copy button checks for this and labels itself "Copy Invite" instead of "Copy IP" when it sees one. */
function toArenaServer(row: KobaServerRow): ArenaServer {
  return {
    id: row.id,
    name: row.name,
    gameId: 'rust_console',
    ip: row.invite,
    region: 'Unknown',
    players: row.players,
    maxPlayers: row.maxPlayers,
    ping: 0,
    active: row.active,
    rules: row.tags.join(' · '),
    featured: false,
  };
}

export async function fetchKobaServers(): Promise<ArenaServer[]> {
  const result = await authedGet<{ data: KobaServerRow[] }>('/api/rivals/servers');
  return result?.data.map(toArenaServer) ?? [];
}

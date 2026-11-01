export type Platform = 'PC' | 'PS5' | 'Xbox' | 'Switch';

/** 'Unknown' covers a real KOBA-backed record with no region on file yet (kobabot's directory_servers has no region column) - never fabricate a specific region for one of those. */
export type Region = 'EU' | 'America' | 'Oceania' | 'Unknown';

export type Category =
  | 'FPS'
  | 'Tactical'
  | 'MOBA'
  | 'Fighter'
  | 'Battle Royale'
  | 'Sports'
  | 'Racing'
  | 'Hero Shooter'
  | 'Survival';

export type KillTier = 3 | 5 | 10;

export interface Game {
  id: string;
  name: string;
  short: string;
  category: Category;
  platforms: Platform[];
  /** Two-stop gradient used for card banners and game chips. */
  accent: [string, string];
  /** Bundled official logo artwork, served from /logos. */
  logo: string;
}

export interface PlayerGame {
  gameId: string;
  rank: string;
  /** 1 = low elo, 7 = top of the ladder. Drives bracket badges and rank proximity. */
  tier: number;
  role: string;
}

export interface Player {
  id: string;
  /** Unique handle, used for @mentions. */
  username: string;
  /** Friendly name shown as the headline on the card. */
  displayName: string;
  bio: string;
  avatar: [string, string];
  /** Optional uploaded avatar, stored as a downscaled data URL. */
  avatarUrl?: string;
  /** Optional uploaded banner image, stored as a downscaled data URL. */
  bannerUrl?: string;
  bannerGameId: string;
  /** Competitive app score in RP. */
  score: number;
  /** Follow-through percentage — how often locked challenges actually happen. */
  reliability: number;
  record: { wins: number; losses: number };
  streak: number;
  region: Region;
  platform: Platform;
  games: PlayerGame[];
  tags: string[];
  online: boolean;
  verified: boolean;
  mic: boolean;
  /** 1 = chill, 2 = competitive, 3 = sweat. */
  intensity: 1 | 2 | 3;
  /** Real KOBA data only (admin/rivalsApi.js) - undefined for every demo/mock player, never fabricated. kobaRank = the XP-level badge (Recruit...Commander), kobaScoreTier = the KOBA Score bucket (Bronze...Legend) - two different, deliberately separate ranking concepts, see config/progressionRanks.js and config/kobaScoreTiers.js on the kobabot side. */
  kobaRankName?: string;
  kobaRankBadgeUrl?: string;
  kobaScoreTier?: string;
  kobaLevel?: number;
  badges: string[];
  socials: { twitch?: string; discord?: string };
}

export type Direction = 'left' | 'right';

export interface Match {
  id: string;
  playerId: string;
  gameId: string;
  fit: number;
  createdAt: number;
  /** True once a kill tier + arena have been locked in. */
  challenged: boolean;
  kills?: KillTier;
  serverId?: string;
  stake?: number;
}

/**
 * A player's public callout: what they want to play, at what stake, and when.
 * Other players can challenge a post directly instead of waiting for a swipe.
 */
export interface Post {
  id: string;
  /** Player id, or 'me' for the signed-in player's own callout. */
  playerId: string;
  gameId: string;
  rank: string;
  role: string;
  killTier: KillTier;
  window: string;
  note: string;
  region: Region;
  platform: Platform;
  createdAt: number;
  status: 'open' | 'locked';
}

/** A reply on a callout, used to agree on times and stakes before locking in. */
export interface PostReply {
  id: string;
  postId: string;
  /** Player id, or 'me' for the signed-in player. */
  playerId: string;
  body: string;
  createdAt: number;
}

export interface Filters {
  gameIds: string[];
  platforms: Platform[];
  region: Region | 'Any';
  minFit: number;
  /** Region is a hard filter by default (ping matters even on console, where players can't see a number) - this explicitly opts IN to seeing cross-region players too, rather than cross-region ever happening silently. */
  crossRegionOptIn: boolean;
}

export interface ArenaServer {
  id: string;
  name: string;
  gameId: string;
  ip: string;
  region: Region;
  players: number;
  maxPlayers: number;
  ping: number;
  active: boolean;
  rules: string;
  featured: boolean;
}

export interface PersistedState {
  profile: Player;
  decisions: Record<string, Direction>;
  matches: Match[];
  posts: Post[];
  replies: PostReply[];
  filters: Filters;
}

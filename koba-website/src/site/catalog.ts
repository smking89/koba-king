import type { PublicRegion } from "@/site/regions";

export type GameId = "all" | "rust" | "dayz";
export type Region = PublicRegion;
export type PlayStyle = "Survival" | "Tactical" | "Social" | "Hardcore";

export interface Listing {
  id: string;
  name: string;
  game: "Rust Console" | "DayZ";
  gameId: Exclude<GameId, "all">;
  platform: "Console" | "PC";
  region: Region;
  players: number;
  cap: number;
  tags: string[];
  style: PlayStyle;
  blurb: string;
  rating: string;
}

export interface LfgPost {
  id: string;
  identityId: string;
  listingId: string;
  need: string;
}

export interface Bounty {
  id: string;
  title: string;
  game: string;
  reward: number;
  window: string;
  detail: string;
}

export interface Achievement {
  id: string;
  name: string;
  detail: string;
  rare: boolean;
}

export interface PlayerMeta {
  region: Region;
  dayzScore: number;
  achievements: Achievement[];
}

/**
 * Game servers come from the `servers` table (connector ingest), never from a
 * hard-coded catalog. These arrays stay empty until that data exists.
 */
export const LISTINGS: Listing[] = [];

/** LFG posts are user-generated and arrive with the server/community data. */
export const LFG: LfgPost[] = [];

/** Bounties are live campaign rows, not fixture content. */
export const BOUNTIES: Bounty[] = [];

/** Per-player achievements come from the badges registry; no seeded marks. */
export const PLAYER_META: Record<string, PlayerMeta> = {};

export function metaFor(id: string, fallbackScore: number): PlayerMeta {
  return PLAYER_META[id] ?? { region: "NA", dayzScore: fallbackScore, achievements: [] };
}

export function scoreFor(id: string, base: number, game: GameId): number {
  if (game === "dayz") return metaFor(id, base).dayzScore;
  return base;
}

export interface WipeClock {
  wiped: string;
  next: string;
  groups: string;
  gather: string;
}

export const WIPE: Record<string, WipeClock> = {};

export function wipeFor(id: string): WipeClock {
  return WIPE[id] ?? { wiped: "Unknown", next: "Unposted", groups: "Any", gather: "1x" };
}

export interface WipeEvent {
  id: string;
  listingId: string;
  title: string;
  when: string;
  cap: number;
  filled: number;
}

export const WIPE_EVENTS: WipeEvent[] = [];

export interface Clip {
  id: string;
  listingId: string;
  identityId: string;
  title: string;
  length: string;
}

export const CLIPS: Clip[] = [];

export interface Party {
  id: string;
  name: string;
  gameId: Exclude<GameId, "all">;
  region: Region;
  mic: "on" | "off";
  size: number;
  filled: number;
  hours: "day" | "night";
  listingId: string;
}

export const PARTIES: Party[] = [];

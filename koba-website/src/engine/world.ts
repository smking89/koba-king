import type { Candidate, Clan, GameDef, Player } from "./types.ts";

export const GAMES: GameDef[] = [
  { id: "rust", name: "Rust", genre: "survival", architecture: "dedicated" },
  { id: "dayz", name: "DayZ", genre: "survival", architecture: "dedicated" },
  { id: "ark", name: "ARK", genre: "survival", architecture: "dedicated" },
  { id: "7dtd", name: "7 Days to Die", genre: "survival", architecture: "dedicated" },
  { id: "conan", name: "Conan Exiles", genre: "survival", architecture: "dedicated" },
  { id: "squad", name: "Squad", genre: "tactical", architecture: "dedicated" },
  { id: "cs2", name: "CS2", genre: "fps", architecture: "dedicated" },
  { id: "hll", name: "Hell Let Loose", genre: "tactical", architecture: "dedicated" },
  { id: "tf2", name: "TF2", genre: "fps", architecture: "dedicated" },
  { id: "palworld", name: "Palworld", genre: "sandbox", architecture: "dedicated" },
  { id: "lol", name: "League of Legends", genre: "moba", architecture: "api" },
  { id: "valorant", name: "VALORANT", genre: "fps", architecture: "api" },
  { id: "apex", name: "Apex Legends", genre: "fps", architecture: "api" },
  { id: "r6", name: "Rainbow Six Siege", genre: "tactical", architecture: "api" },
];

export const GAME_MAP: Record<string, GameDef> = Object.fromEntries(GAMES.map((g) => [g.id, g]));

/**
 * Fictional rosters live in `world.fixtures.ts` for the engine unit tests only.
 * Production discovery data comes from the database; nothing is pre-populated.
 */
export const CLANS: Clan[] = [];
export const CLAN_MAP: Record<string, Clan> = {};
export const PLAYERS: Player[] = [];
export const PLAYER_MAP: Record<string, Player> = {};
export const CANDIDATES: Candidate[] = [];

export const CANDIDATE_MAP: Record<string, Candidate> = {};

export function gameName(id?: string): string {
  if (!id) return "Cross-game";
  return GAME_MAP[id]?.name ?? id;
}

export function playerName(id: string): string {
  return PLAYER_MAP[id]?.name ?? id;
}

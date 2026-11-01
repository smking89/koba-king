import type { ActionId, Candidate, Player } from "@/engine/types";

export type PortalId = "koba.games" | "developers.koba.games";

export interface KobaScoreRow {
  playerId: string;
  gameId: string;
  normalizedScore: number;
  confidenceLow: number;
  confidenceHigh: number;
  activityIndex: number;
}

export interface PulseCatalog {
  source: "database";
  players: Player[];
  candidates: Candidate[];
  weights: Record<ActionId, number>;
  boosts: Record<string, number>;
  spent: Record<string, number>;
  scores: KobaScoreRow[];
}

export type GateDenied = { ok: false; status: number; error: string };

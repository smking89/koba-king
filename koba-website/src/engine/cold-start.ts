import type { Candidate, Player } from "./types.ts";

/** Samples required before a playstyle vector is trusted on its own. */
export const PLAYER_ACTIVITY_PRIOR = 8;
/** Population samples required before server heat and fraud are trusted. */
export const SERVER_SAMPLE_PRIOR = 12;

const PRIOR_VECTOR = [0.42, 0.42, 0.48, 0.4, 0.45, 0.4];
const SCORE_PRIOR = 1500;
const HEAT_PRIOR = 0.35;
/** Thin telemetry is uncertain, not cleared. */
const FRAUD_PRIOR = 0.4;

export function shrinkVector(
  raw: number[],
  activityIndex: number,
): { vector: number[]; confidence: number; cold: boolean } {
  const confidence = Math.max(0, Math.min(1, activityIndex / PLAYER_ACTIVITY_PRIOR));
  if (confidence >= 1) return { vector: raw.slice(), confidence: 1, cold: false };
  const vector = raw.map((value, i) => confidence * value + (1 - confidence) * (PRIOR_VECTOR[i] ?? 0.4));
  return { vector, confidence, cold: true };
}

export function preparePlayer(player: Player): Player {
  const activity = player.activityIndex ?? 40;
  const shrunk = shrinkVector(player.vector, activity);
  const score = shrunk.cold ? shrunk.confidence * player.score + (1 - shrunk.confidence) * SCORE_PRIOR : player.score;
  return {
    ...player,
    activityIndex: activity,
    vector: shrunk.vector,
    score,
    confidence: shrunk.confidence,
    coldStart: shrunk.cold,
  };
}

export function prepareCandidate(candidate: Candidate): Candidate {
  if (candidate.kind !== "server") return { ...candidate, coldStart: false };
  const samples = candidate.sampleCount ?? 48;
  const trust = Math.max(0, Math.min(1, samples / SERVER_SAMPLE_PRIOR));
  if (trust >= 1) return { ...candidate, sampleCount: samples, coldStart: false };
  return {
    ...candidate,
    sampleCount: samples,
    heat: trust * candidate.heat + (1 - trust) * HEAT_PRIOR,
    fraudRisk: trust * candidate.fraudRisk + (1 - trust) * FRAUD_PRIOR,
    coldStart: true,
  };
}

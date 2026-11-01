import type { KillTier } from '../types';

export const BASE_STAKE = 240;

export interface KillTierConfig {
  kills: KillTier;
  label: string;
  multiplier: number;
  blurb: string;
}

export const KILL_TIERS: KillTierConfig[] = [
  { kills: 3, label: 'Skirmish', multiplier: 1, blurb: 'Quick warm-up duel' },
  { kills: 5, label: 'Vendetta', multiplier: 2.5, blurb: 'The standard rivalry' },
  { kills: 10, label: 'Execution', multiplier: 6, blurb: 'No timeouts, no excuses' },
];

export function tierFor(kills: KillTier): KillTierConfig {
  return KILL_TIERS.find((tier) => tier.kills === kills) ?? KILL_TIERS[1];
}

export function stakeFor(kills: KillTier): number {
  return Math.round(BASE_STAKE * tierFor(kills).multiplier);
}

/** Points swing shown in the lobby and applied by the score arbitrator. */
export function pointsDelta(kills: KillTier): { win: number; loss: number } {
  const stake = stakeFor(kills);
  return { win: Math.round(stake * 0.9), loss: -Math.round(stake * 0.6) };
}

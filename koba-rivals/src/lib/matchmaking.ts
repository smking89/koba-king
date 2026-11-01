import { getGame } from '../data/games';
import type { Filters, Player, PlayerGame } from '../types';

export interface Fit {
  score: number;
  reasons: string[];
}

const INTENSITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'chill',
  2: 'competitive',
  3: 'sweat',
};

export function primaryGame(player: Player, filters?: Filters): PlayerGame {
  if (filters?.gameIds.length) {
    const preferred = player.games.find((game) => filters.gameIds.includes(game.gameId));
    if (preferred) return preferred;
  }
  return [...player.games].sort((a, b) => b.tier - a.tier)[0];
}

/**
 * Competitive fit between the signed-in player and a candidate.
 * Region is NOT scored here - it's a hard filter in passesFilters below
 * (ping matters even on console, where there's no number to show for it),
 * so by the time two players reach this function they're already either
 * same-region or the viewer explicitly opted into cross-region. Within
 * that, weight order is: score/Elo proximity (fair-fight is the primary
 * signal for a competitive app) → shared ladders → shared playstyle tags
 * → reliability (follow-through rate - penalizes a ghoster even at a
 * perfect skill match). Returns 0-99 plus the reasons behind it.
 */
export function compatibility(me: Player, them: Player, filters?: Filters): Fit {
  const reasons: string[] = [];
  let score = 0;

  // Score/Elo proximity - the primary weight now. Inside 450 RP is a genuine rivalry.
  const gapRP = Math.abs(me.score - them.score);
  score += Math.max(0, 40 - gapRP / 55);
  if (gapRP <= 150) reasons.push(`Score match — ${them.score.toLocaleString('en-US')} RP`);
  else if (gapRP >= 700) reasons.push(`${gapRP.toLocaleString('en-US')} RP apart`);

  const myGames = new Map(me.games.map((game) => [game.gameId, game]));
  const shared = them.games.filter((game) => myGames.has(game.gameId));

  if (shared.length > 0) {
    const best = [...shared].sort(
      (a, b) => myGames.get(b.gameId)!.tier - myGames.get(a.gameId)!.tier,
    )[0];
    score += 24 + Math.min(shared.length - 1, 2) * 4;
    reasons.push(`Both queue ${getGame(best.gameId).short}`);
  } else {
    score += 4;
  }

  if (shared.length > 0) {
    const closest = shared.reduce((best, game) => {
      const gap = Math.abs(myGames.get(game.gameId)!.tier - game.tier);
      return gap < Math.abs(myGames.get(best.gameId)!.tier - best.tier) ? game : best;
    }, shared[0]);
    const gap = Math.abs(myGames.get(closest.gameId)!.tier - closest.tier);
    score += Math.max(0, 10 - gap * 2);
    if (gap <= 1) reasons.push(`Same bracket — ${closest.rank}`);
  }

  const sharedTags = them.tags.filter((tag) => me.tags.includes(tag));
  if (sharedTags.length > 0) {
    score += Math.min(sharedTags.length, 2) * 4;
    reasons.push(`Wants ${sharedTags[0]}`);
  }

  if (them.platform === me.platform) score += 4;

  if (them.intensity === me.intensity) {
    score += 3;
    reasons.push(`Equally ${INTENSITY_LABEL[them.intensity]}`);
  }

  // Reliability - a real follow-through rate once populated; defaults to 100
  // for both demo players and any real player KOBA hasn't measured this on
  // yet, so it only ever penalizes a genuinely observed ghoster, never
  // fabricates a low score for someone with no history.
  const reliabilityGap = me.reliability - them.reliability;
  if (reliabilityGap > 10) score -= Math.min(10, reliabilityGap / 4);
  if (them.reliability < 70) reasons.push(`${them.reliability}% follow-through`);

  if (filters?.gameIds.length) {
    if (them.games.some((game) => filters.gameIds.includes(game.gameId))) score += 3;
  }

  return {
    score: Math.max(12, Math.min(99, Math.round(score))),
    reasons: reasons.slice(0, 3),
  };
}

/** Chance the other player swipes back. Better fits accept far more often. */
export function acceptChance(fit: number): number {
  return Math.min(0.92, 0.2 + fit / 130);
}

/**
 * `me` is required specifically for the region hard-filter: region is
 * never scored (see compatibility's header) - it's filtered here instead,
 * on by default, same-region only, unless `filters.crossRegionOptIn` is
 * explicitly set. Neither side being 'Unknown' (no real region on file -
 * see types.ts) counts as a mismatch to exclude on; that's a data gap,
 * not a real cross-region case.
 */
export function passesFilters(me: Player, player: Player, filters: Filters): boolean {
  if (filters.gameIds.length > 0) {
    if (!player.games.some((game) => filters.gameIds.includes(game.gameId))) return false;
  }
  if (filters.platforms.length > 0) {
    if (!filters.platforms.includes(player.platform)) return false;
  }
  if (filters.region !== 'Any' && player.region !== filters.region) return false;
  if (!filters.crossRegionOptIn && me.region !== 'Unknown' && player.region !== 'Unknown' && player.region !== me.region) return false;
  return true;
}

/** Stable per-player tie-breaker so equal fits never reshuffle between renders. */
function jitter(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1000;
  }
  return (hash % 100) / 100;
}

/** Best fits first. Deterministic so undo puts the same card back where it was. */
export function buildDeck(me: Player, players: Player[], filters: Filters): Player[] {
  return players
    .filter((player) => passesFilters(me, player, filters))
    .map((player) => ({ player, fit: compatibility(me, player, filters).score }))
    .filter((entry) => entry.fit >= filters.minFit)
    .sort((a, b) => b.fit - a.fit || jitter(a.player.id) - jitter(b.player.id))
    .map((entry) => entry.player);
}

export function fitLabel(score: number): string {
  if (score >= 85) return 'Rival-tier fit';
  if (score >= 70) return 'Strong fit';
  if (score >= 55) return 'Decent fit';
  return 'Long shot';
}

export function initialsOf(player: Player): string {
  const source = player.displayName.trim() || player.username;
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function formatRP(value: number): string {
  return value.toLocaleString('en-US');
}

export function recordRate(record: { wins: number; losses: number }): number {
  const total = record.wins + record.losses;
  return total === 0 ? 0 : Math.round((record.wins / total) * 100);
}

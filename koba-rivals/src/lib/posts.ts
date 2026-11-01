import type { KillTier, Player, Post } from '../types';
import { primaryGame } from './matchmaking';

export const TIER_NAME: Record<KillTier, string> = {
  3: 'Skirmish',
  5: 'Vendetta',
  10: 'Execution',
};

export const TIER_COPY: Record<KillTier, string> = {
  3: 'short session, low stakes',
  5: 'the standard duel',
  10: 'long grudge match',
};

export const TIME_WINDOWS = [
  'Right now · next 2 hours',
  'Tonight · 20:00–23:00',
  'Tomorrow · 18:00–21:00',
  'Weekend · 14:00–18:00',
  'Flexible this week',
];

export interface PostDraft {
  gameId: string;
  killTier: KillTier;
  window: string;
  note: string;
}

/** A post is the player's own callout: "this is what I want, come get it". */
export function buildPost(me: Player, draft: PostDraft): Post {
  const game = me.games.find((entry) => entry.gameId === draft.gameId) ?? primaryGame(me);
  return {
    id: `post-me-${Date.now()}`,
    playerId: 'me',
    gameId: game.gameId,
    rank: game.rank,
    role: game.role,
    killTier: draft.killTier,
    window: draft.window,
    note: draft.note.trim().slice(0, 140),
    region: me.region,
    platform: me.platform,
    createdAt: Date.now(),
    status: 'open',
  };
}

export function timeAgo(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

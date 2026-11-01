import { SEED_POSTS, SEED_REPLIES } from '../data/posts';
import { ME } from '../data/players';
import type { Filters, PersistedState, Player } from '../types';

const KEY = 'rivalry.state.v2';

export const DEFAULT_FILTERS: Filters = {
  gameIds: [],
  platforms: [],
  region: 'Any',
  minFit: 0,
  crossRegionOptIn: false,
};

export function defaultState(): PersistedState {
  return {
    profile: ME,
    decisions: {},
    matches: [],
    posts: SEED_POSTS,
    replies: SEED_REPLIES,
    filters: DEFAULT_FILTERS,
  };
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      profile: { ...ME, ...(parsed.profile ?? {}) },
      decisions: parsed.decisions ?? {},
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      posts: Array.isArray(parsed.posts) ? parsed.posts : SEED_POSTS,
      replies: Array.isArray(parsed.replies) ? parsed.replies : SEED_REPLIES,
      filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

/** Returns false when storage rejected the write (private mode or quota). */
export function saveState(state: PersistedState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function updateProfile(profile: Player, patch: Partial<Player>): Player {
  return { ...profile, ...patch };
}

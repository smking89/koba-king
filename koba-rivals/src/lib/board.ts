/** Remembers when each callout thread was last opened, so new replies can be surfaced. */

const KEY = 'rivalry.board.seen.v1';

export type SeenThreads = Record<string, number>;

export function loadSeenThreads(): SeenThreads {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenThreads;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSeenThreads(seen: SeenThreads): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Storage can be full or blocked; the badge simply resets next load.
  }
}

/**
 * PlayStation has no sign-in/linking API KOBA can call, so verification is a
 * workaround: a player drops a custom emote in-game carrying their PSN
 * name+id, the log parser forwards it here, and it's held in a short-lived
 * cache for the Discord bot's /link flow to claim. Held in-memory (not
 * Redis - nothing else in this stack uses Redis, and a 5-minute single-process
 * window doesn't need a shared store). Purged on claim to block replay.
 */

const WINDOW_MS = 5 * 60 * 1000;

interface PendingLink {
  psnId: string;
  at: number;
}

const globalRef = globalThis as typeof globalThis & {
  __psnLinkCache__?: Map<string, PendingLink>;
};
globalRef.__psnLinkCache__ ??= new Map();
const cache = globalRef.__psnLinkCache__;

function sweep() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [psnName, entry] of cache) {
    if (entry.at < cutoff) cache.delete(psnName);
  }
}

export function recordPsnEmote(psnName: string, psnId: string): void {
  sweep();
  cache.set(psnName.toLowerCase(), { psnId, at: Date.now() });
}

/** Returns the PSN id and purges the slot (one-time claim) - a second call for the same name always misses. */
export function claimPsnLink(psnName: string): { psnId: string } | null {
  sweep();
  const key = psnName.toLowerCase();
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  return { psnId: entry.psnId };
}

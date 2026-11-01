import { useSyncExternalStore } from "react";
import type { BadgeView } from "@/lib/badges/badges.server";
import { badgeArt } from "@/site/badge-art";

/**
 * Two tiny stores shared by every badge surface:
 *
 * - `badgeVersion` tells `BadgeGrid` / `BadgeStrip` to refetch the moment an
 *   award lands, so the crest is already earned behind the celebration.
 * - `celebrations` is a queue of freshly awarded badges for the global overlay.
 *   It lives outside React so an award fired during onboarding still shows
 *   after the onboarding gate is replaced by the app shell.
 */

let badgeVersion = 0;
const versionListeners = new Set<() => void>();

export function notifyBadgesChanged() {
  badgeVersion += 1;
  for (const listener of versionListeners) listener();
}

export function useBadgeVersion() {
  return useSyncExternalStore(
    (listener) => {
      versionListeners.add(listener);
      return () => {
        versionListeners.delete(listener);
      };
    },
    () => badgeVersion,
    () => 0,
  );
}

interface Celebration {
  badge: BadgeView;
  serial: number;
}

interface CelebrationSnapshot {
  badge: BadgeView | null;
  serial: number;
  remaining: number;
}

const EMPTY: CelebrationSnapshot = { badge: null, serial: 0, remaining: 0 };

const pending: Celebration[] = [];
let current: Celebration | null = null;
let serial = 0;
let snapshot: CelebrationSnapshot = EMPTY;
const celebrated = new Set<string>();
const listeners = new Set<() => void>();

function publish() {
  snapshot = {
    badge: current?.badge ?? null,
    serial: current?.serial ?? 0,
    remaining: pending.length,
  };
  for (const listener of listeners) listener();
}

function advance() {
  current = pending.shift() ?? null;
  publish();
}

/**
 * Queues badges the server just inserted and wakes the overlay. Calling it with
 * an empty array is a no-op. A badge is only ever queued once per tab, so a
 * re-render or a second sync cannot replay a celebration.
 */
export function celebrateBadges(badges: BadgeView[]) {
  const fresh = badges.filter((badge) => badge.unlocked && !celebrated.has(badge.badgeId));
  if (fresh.length === 0) return;
  for (const badge of fresh) {
    celebrated.add(badge.badgeId);
    pending.push({ badge, serial: ++serial });
    // Start the crest fetch before React paints the card, so the ring is not
    // empty for the first frame of the celebration.
    if (typeof window !== "undefined") {
      const image = new Image();
      image.src = badgeArt(badge.badgeId);
    }
  }
  if (current) publish();
  else advance();
  // Update the collection now, not when the player next opens the profile.
  notifyBadgesChanged();
}

export function dismissCelebration() {
  advance();
}

/** Leaves immediately: drops every queued award (used by View collection and the backdrop). */
export function clearCelebrations() {
  pending.length = 0;
  current = null;
  publish();
}

/**
 * Account/organisation switch: forget what was celebrated so the next player's
 * awards are not suppressed by the previous player's dedupe set.
 */
export function resetBadgeCelebrations() {
  celebrated.clear();
  pending.length = 0;
  current = null;
  publish();
  notifyBadgesChanged();
}

export function useCelebration() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => EMPTY,
  );
}

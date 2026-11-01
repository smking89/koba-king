import { create } from "zustand";
import { creditsFor } from "@/engine/pipeline";
import { DEFAULT_WEIGHTS, type ActionId, type Candidate, type Compliance, type Player } from "@/engine/types";
import type { KobaScoreRow, PortalId, PulseCatalog } from "@/lib/pulse/types";

export type ViewId = "discover" | "pipeline" | "clusters" | "ranker" | "gate" | "behavior";

const BOOST_MS = 10 * 60 * 1000;

interface PulseState {
  view: ViewId;
  viewerId: string;
  query: string;
  weights: Record<ActionId, number>;
  weightsDirty: boolean;
  boosts: Record<string, number>;
  overrides: Record<string, Compliance>;
  dismissed: string[];
  spent: Record<string, number>;
  nowMs: number;
  focusId: string | null;
  roster: Player[];
  catalogCandidates: Candidate[];
  catalogSource: "unavailable" | "database";
  scores: KobaScoreRow[];
  token: string | null;
  portal: PortalId;
  gateNote: string | null;
  setView: (view: ViewId) => void;
  setViewer: (viewerId: string) => void;
  setQuery: (query: string) => void;
  setWeight: (id: ActionId, value: number) => void;
  resetWeights: () => void;
  activateBoost: (id: string) => boolean;
  endBoost: (id: string) => void;
  setOverride: (id: string, compliance: Compliance) => void;
  clearOverride: (id: string) => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  setNow: (nowMs: number) => void;
  setFocus: (focusId: string | null) => void;
  setToken: (token: string | null) => void;
  setPortal: (portal: PortalId) => void;
  setGateNote: (gateNote: string | null) => void;
  hydrateCatalog: (catalog: PulseCatalog) => void;
  reset: () => void;
}

const initial = {
  view: "discover" as ViewId,
  viewerId: "",
  query: "",
  weights: { ...DEFAULT_WEIGHTS },
  weightsDirty: false,
  boosts: {} as Record<string, number>,
  overrides: {} as Record<string, Compliance>,
  dismissed: [] as string[],
  spent: {} as Record<string, number>,
  nowMs: 0,
  focusId: null as string | null,
  roster: [] as Player[],
  catalogCandidates: [] as Candidate[],
  catalogSource: "unavailable" as const,
  scores: [] as KobaScoreRow[],
  token: null as string | null,
  portal: "koba.games" as PortalId,
  gateNote: null as string | null,
};

export const usePulse = create<PulseState>((set, get) => ({
  ...initial,
  setView: (view) => set({ view }),
  setViewer: (viewerId) => set({ viewerId, focusId: null }),
  setQuery: (query) => set({ query }),
  setWeight: (id, value) =>
    set((s) => ({
      weightsDirty: true,
      weights: { ...s.weights, [id]: Math.round(value * 100) / 100 },
    })),
  resetWeights: () => set({ weights: { ...DEFAULT_WEIGHTS }, weightsDirty: true }),
  activateBoost: (id) => {
    const s = get();
    if (s.boosts[id] && (s.nowMs <= 0 || s.boosts[id] > s.nowMs)) return true;
    const player = s.roster.find((p) => p.id === s.viewerId);
    const left = creditsFor(!!player?.astro) - (s.spent[s.viewerId] ?? 0);
    if (left <= 0) return false;
    const now = Date.now();
    set({
      boosts: { ...s.boosts, [id]: now + BOOST_MS },
      spent: { ...s.spent, [s.viewerId]: (s.spent[s.viewerId] ?? 0) + 1 },
      nowMs: now,
    });
    return true;
  },
  endBoost: (id) =>
    set((s) => {
      const boosts = { ...s.boosts };
      delete boosts[id];
      return { boosts, nowMs: Date.now() };
    }),
  setOverride: (id, compliance) => set((s) => ({ overrides: { ...s.overrides, [id]: compliance } })),
  clearOverride: (id) =>
    set((s) => {
      const overrides = { ...s.overrides };
      delete overrides[id];
      return { overrides };
    }),
  dismiss: (id) => set((s) => ({ dismissed: s.dismissed.includes(id) ? s.dismissed : [...s.dismissed, id] })),
  restore: (id) => set((s) => ({ dismissed: s.dismissed.filter((x) => x !== id) })),
  setNow: (nowMs) => set({ nowMs }),
  setFocus: (focusId) => set({ focusId }),
  setToken: (token) => set({ token }),
  setPortal: (portal) =>
    set((s) => ({
      portal,
      token: null,
      gateNote: s.token ? "Portal changed. Authorize again before a write." : s.gateNote,
    })),
  setGateNote: (gateNote) => set({ gateNote }),
  hydrateCatalog: (catalog) =>
    set((s) => ({
      roster: catalog.players,
      catalogCandidates: catalog.candidates,
      catalogSource: "database",
      viewerId: s.viewerId || catalog.players[0]?.id || "",
      scores: catalog.scores,
      weights: s.weightsDirty ? s.weights : catalog.weights,
      boosts: { ...catalog.boosts, ...s.boosts },
      spent: Object.keys(s.spent).length ? s.spent : catalog.spent,
      nowMs: Object.keys(catalog.boosts).length ? Date.now() : s.nowMs,
    })),
  reset: () =>
    set((s) => ({
      ...initial,
      weights: { ...DEFAULT_WEIGHTS },
      weightsDirty: false,
      roster: s.roster,
      catalogCandidates: s.catalogCandidates,
      catalogSource: s.catalogSource,
      scores: s.scores,
      token: s.token,
      portal: s.portal,
    })),
}));

export function creditsLeft(astro: boolean, viewerId: string, spent: Record<string, number>): number {
  return creditsFor(astro) - (spent[viewerId] ?? 0);
}

export function playerById(roster: Player[], id: string): Player | undefined {
  return roster.find((player) => player.id === id);
}

export function boostRemaining(expiresAt: number | undefined, nowMs: number): number | null {
  if (!expiresAt) return null;
  const now = nowMs > 0 ? nowMs : 0;
  if (now === 0) return Math.ceil((expiresAt - Date.now()) / 1000);
  if (expiresAt <= now) return null;
  return Math.ceil((expiresAt - now) / 1000);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

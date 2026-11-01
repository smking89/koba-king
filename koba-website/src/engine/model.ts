import { cosine, mean, tokenize } from "./math.ts";
import type { ClusterModel, Player } from "./types.ts";
import { CANDIDATES, PLAYERS, gameName } from "./world.ts";
import type { Candidate } from "./types.ts";

const AXIS = [
  "Survival circuit",
  "Tactical line",
  "Long-session grind",
  "Clan-first groups",
  "Ranked circuit",
  "Exploration co-op",
];

function farthest(players: Player[], centroids: number[][]): number[] {
  let best = players[0]!.vector.slice();
  let bestD = -1;
  for (const p of players) {
    let nearest = Infinity;
    for (const c of centroids) nearest = Math.min(nearest, 1 - cosine(p.vector, c));
    if (nearest > bestD) {
      bestD = nearest;
      best = p.vector.slice();
    }
  }
  return best;
}

export function buildClusters(players: Player[]): ClusterModel[] {
  if (players.length === 0) return [];
  let centroids = players.slice(0, 5).map((p) => p.vector.slice());
  let assign = new Array<number>(players.length).fill(0);

  for (let iter = 0; iter < 10; iter++) {
    assign = players.map((p) => {
      let bi = 0;
      let bd = -Infinity;
      centroids.forEach((c, i) => {
        const d = cosine(p.vector, c);
        if (d > bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    centroids = centroids.map((_, j) => {
      const members = players.filter((_, i) => assign[i] === j);
      if (!members.length) return farthest(players, centroids.filter((_, i) => i !== j));
      return mean(members.map((m) => m.vector));
    });
  }

  const used = new Set<string>();
  return centroids.map((centroid, j) => {
    const memberIds = players.filter((_, i) => assign[i] === j).map((p) => p.id);
    let name: string;
    if (memberIds.length <= 1) {
      name = "Thin graph";
    } else {
      const order = centroid
        .map((v, i) => ({ i, v }))
        .sort((a, b) => b.v - a.v);
      name = AXIS[order[0]!.i] ?? "Circuit";
      if (used.has(name)) {
        const alt = AXIS[order[1]!.i];
        name = alt && !used.has(alt) ? alt : `${name} ${j + 1}`;
      }
    }
    used.add(name);
    return { id: `c${j}`, name, centroid, memberIds };
  });
}

export function buildEdges(players: Player[]): Map<string, Map<string, number>> {
  const pair = new Map<string, number>();
  const bump = (a: string, b: string, w: number) => {
    if (a === b || w <= 0) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    pair.set(k, (pair.get(k) ?? 0) + w);
  };

  for (const p of players) {
    for (const f of p.friends) if (p.id < f) bump(p.id, f, 1);
    for (const r of p.rivals) if (p.id < r) bump(p.id, r, 0.45);
  }
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      if (a.clanId && a.clanId === b.clanId) bump(a.id, b.id, 0.7);
      const shared = a.plays.filter((s) => b.plays.includes(s)).length;
      if (shared) bump(a.id, b.id, 0.55 * Math.min(shared, 2));
    }
  }

  const edges = new Map<string, Map<string, number>>();
  for (const p of players) edges.set(p.id, new Map());
  for (const [k, w] of pair) {
    const [a, b] = k.split("|");
    if (!a || !b) continue;
    edges.get(a)!.set(b, w);
    edges.get(b)!.set(a, w);
  }
  return edges;
}

export interface Bm25Doc {
  id: string;
  tf: Map<string, number>;
  len: number;
}

export interface Bm25Index {
  docs: Bm25Doc[];
  df: Map<string, number>;
  avgdl: number;
  n: number;
}

export function candidateText(candidate: Candidate): string {
  return [
    candidate.title,
    candidate.detail,
    candidate.meta,
    candidate.kind,
    gameName(candidate.gameId),
    candidate.region ?? "",
    candidate.sponsor?.brand ?? "",
  ].join(" ");
}

export function buildBm25(candidates: Candidate[] = CANDIDATES): Bm25Index {
  const docs: Bm25Doc[] = candidates.map((candidate) => {
    const tokens = tokenize(candidateText(candidate));
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: candidate.id, tf, len: tokens.length || 1 };
  });
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgdl = docs.length === 0 ? 0 : docs.reduce((s, d) => s + d.len, 0) / docs.length;
  return { docs, df, avgdl, n: docs.length };
}

export const clusters = buildClusters(PLAYERS);
export const edges = buildEdges(PLAYERS);
export const bm25 = buildBm25();

export function clusterNameFor(playerId: string): string {
  return clusters.find((c) => c.memberIds.includes(playerId))?.name ?? "Unclustered";
}

import { prepareCandidate, preparePlayer } from "./cold-start.ts";
import { clamp01, cosine, sigmoid, softmax } from "./math.ts";
import { buildBm25, buildClusters, buildEdges, type Bm25Index } from "./model.ts";
import type {
  ActionId,
  Candidate,
  Compliance,
  PulseInput,
  PulseResult,
  ScoredItem,
  SourceHit,
  TraceRow,
  TraceStage,
} from "./types.ts";
import { ACTIONS, APPLICABLE, DEFAULT_WEIGHTS } from "./types.ts";
import { CANDIDATES, GAME_MAP, PLAYERS, gameName, playerName } from "./world.ts";

/**
 * KOBA Pulse ranking.
 *
 * Studied patterns (not ported):
 * - in-network retrieval resembles a restart walk over an interaction graph
 * - out-of-network retrieval is the serving side of community embeddings,
 *   fit here on multi-game playstyle instead of post engagement
 * - light rank truncates; heavy rank is multi-action expected value
 * - a paid boost multiplies distribution opportunity after scoring
 * - visibility is a separate gate and can drop a high score
 *
 * The heavy head is an explicit cold-start logistic so every coefficient
 * stays inspectable. It is the stand-in for a trained multi-task model,
 * not a claim that a network was fit on this seed.
 */

interface Features {
  graph: number;
  affinity: number;
  region: number;
  game: number;
  fresh: number;
  social: number;
  verified: number;
  gap: number;
  rival: number;
  sponsor: number;
  astro: number;
  query: number;
  community: number;
}

const COEF: Record<ActionId, { bias: number; terms: Partial<Record<keyof Features, number>> }> = {
  join_server: {
    bias: -2.05,
    terms: { game: 1.35, region: 1.05, graph: 0.9, affinity: 0.5, fresh: 0.35, social: 0.5, verified: 0.28 },
  },
  join_lfg: {
    bias: -1.9,
    terms: { game: 1.5, region: 1.2, graph: 1.0, gap: 0.65, fresh: 0.55, social: 0.35 },
  },
  open_profile: {
    bias: -1.25,
    terms: { graph: 0.85, gap: 1.05, affinity: 0.45, rival: 0.4, fresh: 0.2 },
  },
  challenge: {
    bias: -1.7,
    terms: { gap: 1.45, rival: 1.15, game: 0.6, graph: 0.5 },
  },
  follow_clan: {
    bias: -1.45,
    terms: { affinity: 1.1, graph: 0.8, game: 0.5, social: 0.35 },
  },
  engage_sponsor: {
    bias: -2.05,
    terms: { sponsor: 1.55, game: 0.4, astro: 0.4 },
  },
};

const TERM_LABEL: Record<string, string> = {
  graph: "In-network proximity",
  affinity: "Playstyle affinity",
  region: "Region match",
  game: "Game fit",
  fresh: "Freshness",
  social: "Friends on it",
  verified: "Verified",
  gap: "Rank gap",
  rival: "Rival link",
  sponsor: "Sponsor fit",
  astro: "Astro lean",
  query: "Search match",
  community: "Community match",
};

const LIGHT_K = 24;
const GRAPH_K = 10;
const AFFINITY_K = 10;
const HEAT_K = 8;
const SEARCH_K = 8;
const BOOST_CAP = 2;

export function personalizedPageRank(
  source: string,
  players: { id: string }[],
  edges: Map<string, Map<string, number>>,
): Record<string, number> {
  const nodes = players.map((p) => p.id);
  const alpha = 0.22;
  const rank: Record<string, number> = {};
  for (const n of nodes) rank[n] = n === source ? 1 : 0;

  const trans = new Map<string, { to: string; p: number }[]>();
  for (const n of nodes) {
    const m = edges.get(n);
    let sum = 0;
    if (m) for (const w of m.values()) sum += w;
    const list: { to: string; p: number }[] = [];
    if (m && sum > 0) for (const [to, w] of m) list.push({ to, p: w / sum });
    trans.set(n, list);
  }

  for (let iter = 0; iter < 16; iter++) {
    const next: Record<string, number> = {};
    for (const n of nodes) next[n] = n === source ? alpha : 0;
    for (const n of nodes) {
      const mass = rank[n] ?? 0;
      if (mass === 0) continue;
      const list = trans.get(n) ?? [];
      if (!list.length) {
        next[source] = (next[source] ?? 0) + (1 - alpha) * mass;
        continue;
      }
      for (const e of list) next[e.to] = (next[e.to] ?? 0) + (1 - alpha) * mass * e.p;
    }
    for (const n of nodes) rank[n] = next[n] ?? 0;
  }
  return rank;
}

function regionMatch(a?: string, b?: string): number {
  if (!a || !b) return 0.4;
  if (a === b) return 1;
  if ((a === "NA" && b === "EU") || (a === "EU" && b === "NA")) return 0.22;
  if (a === "OCE" || b === "OCE") return 0.28;
  return 0.14;
}

function gameFit(games: Record<string, number>, gameId?: string): number {
  if (!gameId) return 0.35;
  const direct = games[gameId];
  if (direct) return direct;
  const genre = GAME_MAP[gameId]?.genre;
  if (!genre) return 0.04;
  let best = 0;
  for (const [id, w] of Object.entries(games)) {
    if (GAME_MAP[id]?.genre === genre) best = Math.max(best, w);
  }
  return best > 0 ? best * 0.45 : 0.04;
}

function bm25Query(query: string, index: Bm25Index): Map<string, number> {
  const scores = new Map<string, number>();
  const terms = query.trim() ? Array.from(new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1))) : [];
  if (!terms.length) return scores;
  const k1 = 1.2;
  const b = 0.75;
  for (const doc of index.docs) {
    let s = 0;
    for (const term of terms) {
      const tf = doc.tf.get(term) ?? 0;
      if (!tf) continue;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log((index.n - df + 0.5) / (df + 0.5) + 1);
      const denom = tf + k1 * (1 - b + b * (doc.len / index.avgdl));
      s += idf * ((tf * (k1 + 1)) / denom);
    }
    if (s > 0) scores.set(doc.id, s);
  }
  return scores;
}

function boostOn(input: PulseInput, id: string, eligible: boolean): boolean {
  if (!eligible) return false;
  const exp = input.boosts[id];
  if (!exp) return false;
  if (input.nowMs <= 0) return true;
  return exp > input.nowMs;
}

function complianceOf(c: Candidate, overrides: Record<string, Compliance>): Compliance {
  return overrides[c.id] ?? c.compliance;
}

function top<T extends { score: number }>(rows: T[], k: number): T[] {
  return rows.slice().sort((a, b) => b.score - a.score).slice(0, k);
}

interface Acc {
  candidate: Candidate;
  sources: SourceHit[];
}

function addSource(pool: Map<string, Acc>, byId: Map<string, Candidate>, id: string, hit: SourceHit) {
  const candidate = byId.get(id);
  if (!candidate) return;
  const cur = pool.get(id) ?? { candidate, sources: [] };
  cur.sources.push(hit);
  pool.set(id, cur);
}

function takeSource(
  pool: Map<string, Acc>,
  byId: Map<string, Candidate>,
  ranked: { id: string; score: number }[],
  k: number,
  sourceId: string,
  label: string,
) {
  const rows = top(ranked.filter((r) => r.score > 0), k);
  const max = rows[0]?.score || 1;
  for (const row of rows) {
    addSource(pool, byId, row.id, { id: sourceId, label, score: row.score / max });
  }
  return rows;
}

function sim(a: Candidate, b: Candidate): number {
  let s = 0;
  if (a.kind === b.kind) s += 0.35;
  if (a.gameId && a.gameId === b.gameId) s += 0.5;
  if (a.region && a.region === b.region) s += 0.15;
  return Math.min(1, s);
}

function actionProb(action: ActionId, f: Features): { p: number; parts: { label: string; weight: number }[] } {
  const spec = COEF[action];
  const parts: { label: string; weight: number }[] = [];
  let z = spec.bias;
  for (const [key, coef] of Object.entries(spec.terms)) {
    const value = f[key as keyof Features] ?? 0;
    const weight = (coef ?? 0) * value;
    z += weight;
    if (Math.abs(weight) > 0.02) parts.push({ label: TERM_LABEL[key] ?? key, weight });
  }
  parts.sort((a, b) => b.weight - a.weight);
  return { p: sigmoid(z), parts };
}

function whyText(item: {
  sources: SourceHit[];
  probs: Record<ActionId, number>;
  weights: Record<ActionId, number>;
  boost: number;
  placed: ScoredItem["placed"];
  query: number;
  candidate: Candidate;
}): string {
  const src = item.sources.slice().sort((a, b) => b.score - a.score)[0];
  let best: ActionId = "open_profile";
  let bestEv = -1;
  for (const a of APPLICABLE[item.candidate.kind]) {
    const ev = item.weights[a] * item.probs[a];
    if (ev > bestEv) {
      bestEv = ev;
      best = a;
    }
  }
  const label = ACTIONS.find((a) => a.id === best)?.label ?? best;
  const bits = [
    src ? `Retrieved by ${src.label.toLowerCase()}` : "Retrieved from the catalog",
    `${label} leads the intent estimate at ${item.probs[best].toFixed(2)}`,
  ];
  if (item.query > 0.2) bits.push("search match is applied after intent, so the query can outrank a stronger habit");
  if (item.boost > 1)
    bits.push("exposure weight is ×3 for this window. Click order still follows organic relevance, not the paid multiplier");
  if (item.placed === "native-slot") bits.push("placed in the labeled sponsor slot so it cannot pass as organic");
  return `${bits.join(". ")}.`;
}

export function runPulse(input: PulseInput): PulseResult {
  const players = (input.corpus?.players ?? PLAYERS).map(preparePlayer);
  const candidates = (input.corpus?.candidates ?? CANDIDATES).map(prepareCandidate);
  const playerById: Record<string, (typeof players)[number]> = Object.fromEntries(players.map((p) => [p.id, p]));
  const viewer = playerById[input.viewerId] ?? players[0]!;
  const weights = { ...DEFAULT_WEIGHTS, ...input.weights };
  const limit = input.limit ?? 12;
  const query = input.query.trim();
  const index = buildBm25(candidates);
  const clusterModels = buildClusters(players);
  const edgeMap = buildEdges(players);
  const bm = bm25Query(query, index);
  let bmMax = 0;
  for (const v of bm.values()) bmMax = Math.max(bmMax, v);

  const sims = clusterModels.map((c) => cosine(viewer.vector, c.centroid));
  const membershipW = softmax(sims, 0.12);
  const membership = clusterModels.map((c, i) => ({
    id: c.id,
    name: c.name,
    weight: membershipW[i] ?? 0,
  }));
  const home = membership.slice().sort((a, b) => b.weight - a.weight)[0];

  const ppr = personalizedPageRank(viewer.id, players, edgeMap);
  let maxPpr = 1e-6;
  for (const p of players) if (p.id !== viewer.id) maxPpr = Math.max(maxPpr, ppr[p.id] ?? 0);

  const friendSet = new Set(viewer.friends);
  const rivalSet = new Set(viewer.rivals);

  const featuresFor = (c: Candidate, queryMatch: number): Features => {
    const anchors = c.anchors.filter((id) => id !== viewer.id);
    const graph = anchors.length ? Math.max(...anchors.map((id) => ppr[id] ?? 0)) / maxPpr : 0;
    const affinity = clamp01(cosine(viewer.vector, c.vector));
    const contentAff = softmax(
      clusterModels.map((cl) => cosine(c.vector, cl.centroid)),
      0.12,
    );
    const community = clamp01(dotSafe(membershipW, contentAff));
    const overlap = anchors.filter((id) => friendSet.has(id)).length;
    let social = Math.min(1, overlap / 2);
    if (c.clanId && c.clanId === viewer.clanId) social = Math.min(1, social + 0.45);
    const rival = anchors.some((id) => rivalSet.has(id)) || rivalSet.has(c.id) ? 1 : 0;
    const gapPeak = c.skillCenter == null ? (rival ? 0.45 : 0.12) : Math.exp(-((Math.abs(viewer.score - c.skillCenter) - 70) ** 2) / (2 * 110 ** 2));
    const gap = clamp01(gapPeak * (0.7 + 0.3 * rival));
    let sponsor = 0;
    if (c.sponsor) {
      const g = c.sponsor.games.length
        ? Math.max(...c.sponsor.games.map((id) => gameFit(viewer.games, id)))
        : 0.55;
      const r = c.sponsor.regions.length
        ? Math.max(...c.sponsor.regions.map((region) => regionMatch(viewer.region, region)))
        : 0.55;
      const scoreOk = c.sponsor.minScore <= 0 ? 1 : Math.min(1, viewer.score / c.sponsor.minScore);
      const premium = c.sponsor.premiumLean ? (viewer.astro ? 1 : 0.25) : 0.6;
      sponsor = clamp01((g + r + scoreOk + premium) / 4);
    }
    return {
      graph: clamp01(graph),
      affinity,
      region: regionMatch(viewer.region, c.region),
      game: gameFit(viewer.games, c.gameId),
      fresh: clamp01(Math.exp(-c.freshnessMin / 240)),
      social: clamp01(social),
      verified: c.verified ? 1 : 0,
      gap,
      rival,
      sponsor,
      astro: viewer.astro ? 1 : 0,
      query: queryMatch,
      community,
    };
  };

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pool = new Map<string, Acc>();
  const trace: TraceStage[] = [];

  const graphRanked = candidates.map((c) => {
    const f = featuresFor(c, 0);
    return { id: c.id, score: f.graph * (0.55 + 0.45 * f.game), title: c.title };
  });
  const graphKept = takeSource(pool, byId, graphRanked, GRAPH_K, "graph", "In-network walk");
  trace.push(stage("graph", "In-network walk", "Restart walk over friends, clanmates, rivals, and shared servers. Surfaces what the player is already structurally near.", graphRanked, graphKept));

  const affRanked = candidates.map((c) => {
    const f = featuresFor(c, 0);
    return { id: c.id, score: f.community, title: c.title };
  });
  const affKept = takeSource(pool, byId, affRanked, AFFINITY_K, "affinity", "Affinity community");
  trace.push(stage("affinity", "Affinity communities", "Players grouped by multi-game playstyle. This is how a server with no shared friends still enters the pool.", affRanked, affKept));

  const heatRanked = candidates.map((c) => ({
    id: c.id,
    score: c.heat * Math.exp(-c.freshnessMin / 180),
    title: c.title,
  }));
  const heatKept = takeSource(pool, byId, heatRanked, HEAT_K, "heat", "Live activity");
  trace.push(stage("heat", "Live activity", "Time-decayed heat from population, posts, and fresh LFGs. High heat is not eligibility.", heatRanked, heatKept));

  const searchRanked = candidates.map((c) => ({
    id: c.id,
    score: bmMax > 0 ? (bm.get(c.id) ?? 0) / bmMax : 0,
    title: c.title,
  }));
  const searchKept = query ? takeSource(pool, byId, searchRanked, SEARCH_K, "search", "Search") : [];
  trace.push({
    id: "search",
    title: "Search",
    purpose: query
      ? "BM25 over titles, games, and copy. A query filters the pool instead of nudging it."
      : "Idle until the operator types a query.",
    entered: query ? searchRanked.filter((r) => r.score > 0).length : 0,
    kept: searchKept.length,
    rows: query ? rowsOf(searchRanked, new Set(searchKept.map((r) => r.id))) : [],
  });

  const boostRanked = candidates.filter((c) => boostOn(input, c.id, c.boostEligible)).map((c) => ({
    id: c.id,
    score: 1,
    title: c.title,
  }));
  const boostKept = takeSource(pool, byId, boostRanked, 20, "boost", "Boost ingress");
  trace.push(stage("boost", "Boost ingress", "An active 10-minute boost is its own source, so a paid item is not stuck behind the light-rank cutoff.", boostRanked, boostKept));

  trace.push({
    id: "merge",
    title: "Merge",
    purpose: "Union of sources. An item can carry more than one nomination.",
    entered: pool.size,
    kept: pool.size,
    rows: [...pool.values()].map((a) => ({
      id: a.candidate.id,
      title: a.candidate.title,
      score: Math.max(...a.sources.map((s) => s.score)),
      kept: true,
      note: a.sources.map((s) => s.label).join(" · "),
    })),
  });

  const dismissed = new Set(input.dismissed);
  const lightRows: {
    acc: Acc;
    score: number;
    organicLight: number;
    queryMatch: number;
    features: Features;
  }[] = [];
  for (const acc of pool.values()) {
    const queryMatch = bmMax > 0 ? (bm.get(acc.candidate.id) ?? 0) / bmMax : 0;
    const boosted = boostOn(input, acc.candidate.id, acc.candidate.boostEligible);
    if (query && queryMatch < 0.08 && !boosted) continue;
    const features = featuresFor(acc.candidate, queryMatch);
    const organicSources = acc.sources.filter((source) => source.id !== "boost");
    const best = Math.max(...acc.sources.map((source) => source.score));
    const blend = (source: number) =>
      0.46 * source + 0.18 * features.region + 0.2 * features.game + 0.1 * features.fresh + 0.06 * features.verified;
    const queryOk = !query || queryMatch >= 0.08;
    const organicBest = organicSources.length ? Math.max(...organicSources.map((source) => source.score)) : 0;
    lightRows.push({
      acc,
      score: blend(best),
      organicLight: organicSources.length && queryOk ? blend(organicBest) : -1,
      queryMatch,
      features,
    });
  }
  lightRows.sort((a, b) => b.score - a.score);
  const organicPass = new Set<string>();
  const organicRanked = lightRows
    .filter((row) => row.organicLight >= 0)
    .sort((a, b) => b.organicLight - a.organicLight);
  for (const row of organicRanked) {
    if (organicPass.size < LIGHT_K) organicPass.add(row.acc.candidate.id);
  }
  const lightPass = new Set(organicPass);
  for (const row of lightRows) {
    if (boostOn(input, row.acc.candidate.id, row.acc.candidate.boostEligible)) lightPass.add(row.acc.candidate.id);
  }
  trace.push({
    id: "light",
    title: "Light rank",
    purpose: "Cheap linear score. The organic cut ignores the boost source. Items a boost pulls in are scored, then at most two can be reserved.",
    entered: lightRows.length,
    kept: lightPass.size,
    rows: lightRows.map((r) => ({
      id: r.acc.candidate.id,
      title: r.acc.candidate.title,
      score: r.score,
      kept: lightPass.has(r.acc.candidate.id),
      note: lightPass.has(r.acc.candidate.id) ? "kept" : "truncated",
    })),
  });

  const scored: ScoredItem[] = [];
  for (const row of lightRows) {
    if (!lightPass.has(row.acc.candidate.id)) continue;
    if (dismissed.has(row.acc.candidate.id)) continue;
    const applicable = new Set(APPLICABLE[row.acc.candidate.kind]);
    const probs = emptyProbs();
    let heavy = 0;
    let contrib: { label: string; weight: number }[] = [];
    let bestEv = -1;
    for (const action of ACTIONS) {
      if (!applicable.has(action.id)) continue;
      const { p, parts } = actionProb(action.id, row.features);
      probs[action.id] = p;
      const ev = weights[action.id] * p;
      heavy += ev;
      if (ev > bestEv) {
        bestEv = ev;
        contrib = parts.slice(0, 4);
      }
    }
    const boosted = boostOn(input, row.acc.candidate.id, row.acc.candidate.boostEligible);
    const queryFactor = query ? 0.25 + 1.65 * row.queryMatch : 1;
    const clickScore = heavy * queryFactor;
    const exposure = clickScore * (boosted ? 3 : 1);
    const visibility = complianceOf(row.acc.candidate, input.overrides);
    const item: ScoredItem = {
      candidate: row.acc.candidate,
      sources: row.acc.sources,
      lightScore: row.score,
      probs,
      heavyScore: heavy,
      clickScore,
      boostMultiplier: boosted ? 3 : 1,
      distributionScore: exposure,
      visibility,
      visibilityReason:
        visibility === "allow"
          ? row.acc.candidate.complianceNote
          : visibility === input.overrides[row.acc.candidate.id]
            ? `Staff override on this console: ${visibility}.`
            : row.acc.candidate.complianceNote,
      contributions: contrib,
      why: "",
      queryMatch: row.queryMatch,
      counterfactualRank: 0,
      placed: "organic",
      shadowRank: null,
      rank: 0,
    };
    item.why = whyText({
      sources: item.sources,
      probs,
      weights,
      boost: item.boostMultiplier,
      placed: "organic",
      query: row.queryMatch,
      candidate: item.candidate,
    });
    scored.push(item);
  }

  scored.sort((a, b) => b.clickScore - a.clickScore);
  scored.forEach((item, i) => {
    item.counterfactualRank = i + 1;
  });

  trace.push({
    id: "heavy",
    title: "Heavy rank",
    purpose: "Expected value across intents: join, LFG, open, challenge, follow, sponsor. One blended relevance score is intentionally not used.",
    entered: scored.length,
    kept: scored.length,
    rows: scored.map((s) => ({
      id: s.candidate.id,
      title: s.candidate.title,
      score: s.heavyScore,
      kept: true,
      note: dominantNote(s, weights),
    })),
  });

  trace.push({
    id: "boostmult",
    title: "Boost multiplier",
    purpose: "Exposure weight is organic relevance times 3 during the 10-minute window. The multiplier does not change click order.",
    entered: scored.length,
    kept: scored.filter((s) => s.boostMultiplier > 1).length,
    rows: scored.map((s) => ({
      id: s.candidate.id,
      title: s.candidate.title,
      score: s.distributionScore,
      kept: s.boostMultiplier > 1,
      note: s.boostMultiplier > 1 ? "×3 opportunity" : "×1",
    })),
  });

  const allow = scored.filter((s) => s.visibility === "allow");
  const held = scored.filter((s) => s.visibility === "interstitial").sort((a, b) => a.counterfactualRank - b.counterfactualRank);
  const dropped = scored.filter((s) => s.visibility === "drop").sort((a, b) => a.counterfactualRank - b.counterfactualRank);

  trace.push({
    id: "gate",
    title: "Visibility gate",
    purpose: "Isolated from rank. Staff labels from the admin side allow, hold, or drop. A high score cannot buy eligibility.",
    entered: scored.length,
    kept: allow.length,
    rows: scored.map((s) => ({
      id: s.candidate.id,
      title: s.candidate.title,
      score: s.distributionScore,
      kept: s.visibility === "allow",
      note: s.visibility,
    })),
  });

  const feed = orderForClicks(allow, limit, organicPass);
  trace.push({
    id: "mmr",
    title: "Diversity and boost cap",
    purpose: "Greedy selection uses organic relevance, then at most two boosted items the organic cut would have missed are reserved. The list is re-sorted by click score.",
    entered: allow.length,
    kept: feed.length,
    rows: allow
      .slice()
      .sort((a, b) => b.clickScore - a.clickScore)
      .map((s) => ({
        id: s.candidate.id,
        title: s.candidate.title,
        score: s.clickScore,
        kept: feed.some((f) => f.candidate.id === s.candidate.id),
        note: feed.some((f) => f.candidate.id === s.candidate.id) ? "selected" : "held back",
      })),
  });

  applySponsorSlot(feed, allow, weights, limit);
  feed.forEach((item, i) => {
    item.rank = i + 1;
    if (item.placed === "native-slot") {
      item.why = whyText({
        sources: item.sources,
        probs: item.probs,
        weights,
        boost: item.boostMultiplier,
        placed: "native-slot",
        query: item.queryMatch,
        candidate: item.candidate,
      });
    }
  });

  trace.push({
    id: "slots",
    title: "Sponsor slot",
    purpose: "One labeled campaign can sit in slot 4. It does not inherit an organic disguise.",
    entered: feed.length,
    kept: feed.length,
    rows: feed.map((s) => ({
      id: s.candidate.id,
      title: s.candidate.title,
      score: s.distributionScore,
      kept: true,
      note: s.placed === "native-slot" ? "native slot" : "organic",
    })),
  });

  if (!input.skipShadow) {
    for (const item of feed) {
      if (item.boostMultiplier <= 1) continue;
      const rest = { ...input.boosts };
      delete rest[item.candidate.id];
      const alt = runPulse({ ...input, boosts: rest, skipShadow: true });
      const idx = alt.feed.findIndex((f) => f.candidate.id === item.candidate.id);
      item.shadowRank = idx >= 0 ? idx + 1 : null;
    }
  }

  return {
    viewerId: viewer.id,
    clusterName: home?.name ?? "Unclustered",
    membership: membership.sort((a, b) => b.weight - a.weight),
    clusters: clusterModels,
    coldStart: {
      active: !!viewer.coldStart,
      confidence: viewer.confidence ?? 1,
      note: viewer.coldStart
        ? "Thin telemetry. Playstyle and score are shrunk toward the population prior until more matches land."
        : "Telemetry is past the cold-start prior.",
    },
    feed,
    held,
    dropped,
    scored,
    trace,
    retrieved: pool.size,
  };
}

function dotSafe(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function emptyProbs(): Record<ActionId, number> {
  return {
    join_server: 0,
    join_lfg: 0,
    open_profile: 0,
    challenge: 0,
    follow_clan: 0,
    engage_sponsor: 0,
  };
}

function dominantNote(s: ScoredItem, weights: Record<ActionId, number>): string {
  let best = "";
  let ev = -1;
  for (const a of APPLICABLE[s.candidate.kind]) {
    const v = weights[a] * s.probs[a];
    if (v > ev) {
      ev = v;
      best = ACTIONS.find((x) => x.id === a)?.short ?? a;
    }
  }
  return best;
}

function stage(
  id: string,
  title: string,
  purpose: string,
  ranked: { id: string; score: number; title: string }[],
  kept: { id: string }[],
): TraceStage {
  const ids = new Set(kept.map((k) => k.id));
  const sorted = ranked.slice().sort((a, b) => b.score - a.score);
  return {
    id,
    title,
    purpose,
    entered: sorted.filter((r) => r.score > 0).length,
    kept: kept.length,
    rows: rowsOf(sorted, ids),
  };
}

function rowsOf(sorted: { id: string; score: number; title: string }[], ids: Set<string>): TraceRow[] {
  return sorted.slice(0, 16).map((r) => ({
    id: r.id,
    title: r.title,
    score: r.score,
    kept: ids.has(r.id),
    note: ids.has(r.id) ? "nominated" : "below cutoff",
  }));
}

function mmr(allow: ScoredItem[], limit: number): ScoredItem[] {
  const pool = allow.slice();
  if (!pool.length) return [];
  const max = Math.max(...pool.map((p) => p.clickScore), 1e-6);
  const min = Math.min(...pool.map((p) => p.clickScore), 0);
  const span = Math.max(max - min, 1e-6);
  const norm = (s: ScoredItem) => (s.clickScore - min) / span;
  const selected: ScoredItem[] = [];
  const lambda = 0.72;

  while (selected.length < limit && pool.length) {
    let bestI = 0;
    let best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]!;
      let near = 0;
      for (const s of selected) near = Math.max(near, sim(c.candidate, s.candidate));
      const value = lambda * norm(c) - (1 - lambda) * near;
      if (value > best) {
        best = value;
        bestI = i;
      }
    }
    const [picked] = pool.splice(bestI, 1);
    if (picked) selected.push(picked);
  }
  return selected;
}

function orderForClicks(allow: ScoredItem[], limit: number, organicPass: Set<string>): ScoredItem[] {
  const organic = mmr(
    allow.filter((item) => organicPass.has(item.candidate.id)),
    limit,
  );
  const seen = new Set(organic.map((item) => item.candidate.id));
  const reserved = allow
    .filter((item) => item.boostMultiplier > 1 && !seen.has(item.candidate.id))
    .sort((a, b) => b.distributionScore - a.distributionScore)
    .slice(0, BOOST_CAP);
  return [...organic, ...reserved].sort((a, b) => b.clickScore - a.clickScore);
}

function applySponsorSlot(
  feed: ScoredItem[],
  allow: ScoredItem[],
  weights: Record<ActionId, number>,
  limit: number,
) {
  if (weights.engage_sponsor <= 0.05) return;
  const campaigns = allow.filter((f) => f.candidate.kind === "campaign" && f.probs.engage_sponsor >= 0.08);
  if (!campaigns.length) return;
  campaigns.sort((a, b) => b.clickScore - a.clickScore);
  const chosen = campaigns[0]!;
  const idx = feed.findIndex((f) => f.candidate.id === chosen.candidate.id);
  if (idx >= 0 && idx < 3) {
    chosen.placed = "native-slot";
    return;
  }
  if (idx >= 0) feed.splice(idx, 1);
  chosen.placed = "native-slot";
  feed.splice(Math.min(3, feed.length), 0, chosen);
  while (feed.length > limit + BOOST_CAP) {
    const last = feed.length - 1;
    if (feed[last]?.candidate.id === chosen.candidate.id && feed.length > 1) feed.splice(last - 1, 1);
    else feed.pop();
  }
}

export function creditsFor(astro: boolean): number {
  return astro ? 4 : 1;
}

export function formatNames(ids: string[]): string {
  return ids.map((id) => playerName(id)).join(", ");
}

export function gameLabel(id?: string): string {
  return gameName(id);
}

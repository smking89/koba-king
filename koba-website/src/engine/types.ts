export type Region = "NA" | "EU" | "APAC" | "OCE" | "LATAM" | "AFR";

export type Kind =
  | "server"
  | "lfg"
  | "profile"
  | "post"
  | "challenge"
  | "clan"
  | "listing"
  | "campaign";

export type Compliance = "allow" | "interstitial" | "drop";

export type ActionId =
  | "join_server"
  | "join_lfg"
  | "open_profile"
  | "challenge"
  | "follow_clan"
  | "engage_sponsor";

export interface ActionDef {
  id: ActionId;
  label: string;
  short: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "join_server", label: "Join server", short: "Server" },
  { id: "join_lfg", label: "Join LFG", short: "LFG" },
  { id: "open_profile", label: "Open", short: "Open" },
  { id: "challenge", label: "Challenge", short: "Challenge" },
  { id: "follow_clan", label: "Follow clan", short: "Clan" },
  { id: "engage_sponsor", label: "Sponsor", short: "Sponsor" },
];

// Rebalanced 2026-10-19 toward competitive signals, away from passive
// browsing: open_profile (merely viewing someone) no longer sits as the
// second-highest weight; challenge and follow_clan (actually committing to
// a competitive relationship) now outrank it. join_server/join_lfg
// untouched - showing up to play is already a real competitive action.
export const DEFAULT_WEIGHTS: Record<ActionId, number> = {
  join_server: 1.2,
  join_lfg: 1.15,
  open_profile: 0.35,
  challenge: 1.35,
  follow_clan: 1.1,
  engage_sponsor: 0.28,
};

export const APPLICABLE: Record<Kind, ActionId[]> = {
  server: ["join_server", "open_profile"],
  lfg: ["join_lfg", "open_profile"],
  profile: ["open_profile", "challenge"],
  post: ["open_profile"],
  challenge: ["challenge", "open_profile"],
  clan: ["follow_clan", "open_profile"],
  listing: ["open_profile"],
  campaign: ["engage_sponsor"],
};

export const KIND_LABEL: Record<Kind, string> = {
  server: "Server",
  lfg: "LFG",
  profile: "Player",
  post: "Post",
  challenge: "Challenge",
  clan: "Clan",
  listing: "Listing",
  campaign: "Sponsored",
};

export interface GameDef {
  id: string;
  name: string;
  genre: "survival" | "tactical" | "fps" | "sandbox" | "moba";
  architecture: "dedicated" | "api";
}

export interface Clan {
  id: string;
  name: string;
  region: Region;
  motto: string;
}

export interface Player {
  id: string;
  name: string;
  handle: string;
  region: Region;
  score: number;
  clanId?: string;
  friends: string[];
  rivals: string[];
  games: Record<string, number>;
  /** survival, tactical, session, loyalty, aggression, explore */
  vector: number[];
  astro: boolean;
  plays: string[];
  line: string;
  /** Total telemetry behind the playstyle vector. Below 8, the prior takes over. */
  activityIndex?: number;
  sampleCount?: number;
  accountLinks?: Record<string, string>;
  coldStart?: boolean;
  confidence?: number;
}

export interface SponsorTarget {
  brand: string;
  games: string[];
  regions: Region[];
  minScore: number;
  premiumLean: boolean;
}

export interface Candidate {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  meta: string;
  gameId?: string;
  region?: Region;
  anchors: string[];
  clanId?: string;
  vector: number[];
  freshnessMin: number;
  heat: number;
  skillCenter?: number;
  verified: boolean;
  boostEligible: boolean;
  compliance: Compliance;
  complianceNote: string;
  fraudRisk: number;
  sponsor?: SponsorTarget;
  sampleCount?: number;
  concurrent?: number;
  peak?: number;
  peakTracking?: boolean;
  coldStart?: boolean;
}

export interface SourceHit {
  id: string;
  label: string;
  score: number;
}

export interface Contribution {
  label: string;
  weight: number;
}

export interface ScoredItem {
  candidate: Candidate;
  sources: SourceHit[];
  lightScore: number;
  probs: Record<ActionId, number>;
  heavyScore: number;
  /** Organic relevance. This is the click-order key. */
  clickScore: number;
  boostMultiplier: 1 | 3;
  /** Exposure weight. Boost scales this, not click order. */
  distributionScore: number;
  visibility: Compliance;
  visibilityReason: string;
  contributions: Contribution[];
  why: string;
  queryMatch: number;
  /** Rank by click score if the visibility gate were off. */
  counterfactualRank: number;
  placed: "organic" | "native-slot";
  shadowRank: number | null;
  /** Presentation order. 0 when the item is not in the feed. */
  rank: number;
}

export interface TraceRow {
  id: string;
  title: string;
  score: number;
  kept: boolean;
  note: string;
}

export interface TraceStage {
  id: string;
  title: string;
  purpose: string;
  entered: number;
  kept: number;
  rows: TraceRow[];
}

export interface ClusterModel {
  id: string;
  name: string;
  centroid: number[];
  memberIds: string[];
}

export interface PulseInput {
  viewerId: string;
  query: string;
  weights: Record<ActionId, number>;
  /** item id → epoch ms when the 10-minute window ends */
  boosts: Record<string, number>;
  overrides: Record<string, Compliance>;
  dismissed: string[];
  /** 0 means "treat any stored boost as active" (stable first paint). */
  nowMs: number;
  limit?: number;
  skipShadow?: boolean;
  corpus?: { players: Player[]; candidates: Candidate[] };
}

export interface PulseResult {
  viewerId: string;
  clusterName: string;
  membership: { id: string; name: string; weight: number }[];
  clusters: ClusterModel[];
  coldStart: { active: boolean; confidence: number; note: string };
  feed: ScoredItem[];
  held: ScoredItem[];
  dropped: ScoredItem[];
  scored: ScoredItem[];
  trace: TraceStage[];
  retrieved: number;
}

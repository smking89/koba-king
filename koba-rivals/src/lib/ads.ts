import { getGame } from '../data/games';

export type Objective = 'awareness' | 'clicks' | 'rivalries';
export type CampaignStatus = 'active' | 'paused';

export interface Campaign {
  id: string;
  name: string;
  objective: Objective;
  status: CampaignStatus;
  /** Game ids this campaign is allowed to appear beside. */
  games: string[];
  budget: number;
  spend: number;
  /** Max cost per click in dollars. Spend only moves when a card is clicked. */
  cpc?: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Creative shown when the campaign runs as a sponsored deck card. */
  sponsor?: string;
  headline?: string;
  body?: string;
  cta?: string;
  serverName?: string;
  serverIp?: string;
  region?: string;
}

export interface AdState {
  wallet: number;
  campaigns: Campaign[];
}

export interface AdCreative {
  headline: string;
  body: string;
  cta: string;
  sponsor: string;
  serverName: string;
  serverIp?: string;
}

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  awareness: 'Awareness',
  clicks: 'Arena clicks',
  rivalries: 'Rivalries formed',
};

const KEY = 'rivalry.ads.v1';

/** Fallback bid for campaigns created before PPC bidding existed. */
export const DEFAULT_CPC = 0.85;

/** Rough delivery estimate shown in the review step before publishing. */
export function estimateDelivery(dailyBudget: number, cpc: number) {
  const bid = Math.max(0.05, cpc);
  const clicks = Math.floor(dailyBudget / bid);
  return { clicks, impressions: clicks * 18, cpc: bid };
}

/** Compact campaign payload carried inside a shareable preview link. */
export interface PreviewPayload {
  name: string;
  objective: Objective;
  games: string[];
  region: string;
  cpc: number;
  daily: number;
  budget: number;
  headline: string;
  body: string;
  cta: string;
  sponsor: string;
}

/** base64url so a link survives query parsing: `+` would decode as a space. */
function toBase64Url(value: string): string {
  return btoa(encodeURIComponent(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export function encodePreview(payload: PreviewPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodePreview(value: string): PreviewPayload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(fromBase64Url(value))) as PreviewPayload;
    if (!parsed || typeof parsed.name !== 'string' || !Array.isArray(parsed.games)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function previewUrl(payload: PreviewPayload, origin: string): string {
  return `${origin}/?preview=${encodePreview(payload)}`;
}

/** Rebuilds a campaign from a preview payload so the real card can render. */
export function previewCampaign(payload: PreviewPayload): Campaign {
  return {
    id: 'preview',
    name: payload.name,
    objective: payload.objective,
    status: 'paused',
    games: payload.games,
    budget: payload.budget,
    spend: 0,
    cpc: payload.cpc,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    sponsor: payload.sponsor,
    headline: payload.headline,
    body: payload.body,
    cta: payload.cta,
    region: payload.region,
    serverName: `${payload.sponsor} arena`,
  };
}

export const DEFAULT_ADS: AdState = {
  wallet: 4_200,
  campaigns: [
    {
      id: 'c1',
      name: 'Skirmish nights',
      objective: 'rivalries',
      status: 'active',
      games: ['valorant', 'cs2'],
      budget: 2_400,
      spend: 1_480,
      cpc: 0.19,
      impressions: 184_200,
      clicks: 7_940,
      conversions: 612,
      sponsor: 'Rustopia Network',
      headline: 'Find a rival at your rank tonight',
      body: 'Verified 128-tick servers, instant arena invites and a 5-kill Vendetta waiting.',
      cta: 'Copy server IP',
      serverName: 'Rustopia Main',
      serverIp: '147.185.221.10:28015',
      region: 'America',
    },
    {
      id: 'c2',
      name: 'Retake recruits · EU',
      objective: 'clicks',
      status: 'active',
      games: ['cs2', 'r6'],
      budget: 900,
      spend: 410,
      cpc: 0.18,
      impressions: 62_800,
      clicks: 2_310,
      conversions: 96,
      sponsor: 'Nordic Retakes',
      headline: 'EU retakes, no queue',
      body: '128 tick, anti-cheat staffed, and lobbies that start the moment two rivals lock in.',
      cta: 'Copy server IP',
      serverName: 'Nordic Retake EU-1',
      serverIp: '45.12.88.4:27015',
      region: 'EU',
    },
    {
      id: 'c3',
      name: 'Champion ladder push',
      objective: 'awareness',
      status: 'paused',
      games: ['rocketleague', 'overwatch'],
      budget: 1_200,
      spend: 1_200,
      cpc: 0.38,
      impressions: 121_400,
      clicks: 3_180,
      conversions: 140,
      sponsor: 'Aerial Academy',
      headline: 'Champion-level scrims every night',
      body: 'Coached 3v3 lobbies for players pushing out of Diamond.',
      cta: 'Enter arena',
      serverName: 'Aerial Academy',
      region: 'America',
    },
  ],
};

function readAds(): AdState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADS;
    const parsed = JSON.parse(raw) as Partial<AdState>;
    return {
      wallet: typeof parsed.wallet === 'number' ? parsed.wallet : DEFAULT_ADS.wallet,
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : DEFAULT_ADS.campaigns,
    };
  } catch {
    return DEFAULT_ADS;
  }
}

export function saveAds(state: AdState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* A tiny shared store so the console and the deck always agree. */
let cache: AdState | null = null;
const listeners = new Set<() => void>();

export function getAds(): AdState {
  if (!cache) cache = readAds();
  return cache;
}

export function setAds(next: AdState): void {
  cache = next;
  saveAds(next);
  listeners.forEach((listener) => listener());
}

export function subscribeAds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Campaigns that are on, funded and relevant to the games the player queues. */
export function deliveringCampaigns(state: AdState, gameIds: string[]): Campaign[] {
  const live = state.campaigns.filter(
    (campaign) => campaign.status === 'active' && campaign.spend < campaign.budget,
  );
  const relevant = live.filter((campaign) =>
    campaign.games.some((id) => gameIds.includes(id)),
  );
  return relevant.length > 0 ? relevant : live;
}

export function adCreative(campaign: Campaign): AdCreative {
  const game = campaign.games[0] ? getGame(campaign.games[0]) : undefined;
  return {
    headline: campaign.headline?.trim() || campaign.name,
    body:
      campaign.body?.trim() ||
      `A verified ${game?.name ?? 'arena'} server is running rivalries right now.`,
    cta: campaign.cta?.trim() || 'Enter arena',
    sponsor: campaign.sponsor?.trim() || 'KOBA partner',
    serverName:
      campaign.serverName?.trim() || `${campaign.sponsor?.trim() || 'Partner'} arena`,
    serverIp: campaign.serverIp,
  };
}

/** Deck interactions feed straight back into the campaign's reported metrics. */
export function bumpCampaign(
  state: AdState,
  id: string,
  field: 'impressions' | 'clicks' | 'conversions',
): AdState {
  return {
    ...state,
    campaigns: state.campaigns.map((campaign) =>
      campaign.id === id
        ? {
            ...campaign,
            [field]: campaign[field] + 1,
            // PPC: impressions are free, a click bills the bid up to the budget cap.
            spend:
              field === 'clicks'
                ? Math.min(campaign.budget, campaign.spend + (campaign.cpc ?? DEFAULT_CPC))
                : campaign.spend,
          }
        : campaign,
    ),
  };
}

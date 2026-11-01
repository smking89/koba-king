import { create } from "zustand";
import type { ShopProduct } from "@/site/astro";

import type { PublicRegion } from "@/site/regions";
import type { SupportedGame } from "@/site/games";
import type { DmPolicy, FollowPolicy, InvitePolicy, PresenceStatus, SocialGraph, TagView } from "@/lib/social/social.server";

export type SitePage = "home" | "groups" | "messages" | "shop" | "profile" | "settings";
export type HomeTab = "feed" | "discover" | "compete" | "rankings" | "social";
export type Desk = "play" | "business" | "mod" | "admin" | "super" | "support" | "trainee";
export type GameFilter = "all" | SupportedGame["id"];
export type PlatformFilter = "all" | "PC" | "Console";
export type RegionFilter = "all" | PublicRegion;

export interface Quest {
  id: string;
  event: "COMBAT_KILL" | "MATCH_END" | "WIPE";
  title: string;
  detail: string;
  need: number;
  progress: number;
  reward: string;
}

const QUESTS: Quest[] = [
  { id: "q-kill", event: "COMBAT_KILL", title: "Finish a fight", detail: "A combat packet has to commit.", need: 1, progress: 0, reward: "Clear shot" },
  { id: "q-match", event: "MATCH_END", title: "Close a match", detail: "A match-end payload has to pass the gates.", need: 1, progress: 0, reward: "Match mark" },
  { id: "q-wipe", event: "WIPE", title: "See a wipe", detail: "A wipe payload has to pass the gates.", need: 1, progress: 0, reward: "Wipe bell" },
];

export interface Notice {
  id: number;
  title: string;
  detail: string;
}

interface SiteState {
  page: SitePage;
  homeTab: HomeTab;
  query: string;
  game: GameFilter;
  platform: PlatformFilter;
  region: RegionFilter;
  saved: string[];
  follows: string[];
  blocked: string[];
  favorites: string[];
  aliases: Record<string, string>;
  tags: TagView[];
  friendRequestPolicy: FollowPolicy;
  groupInvitePolicy: InvitePolicy;
  dmPolicy: DmPolicy;
  presence: Record<string, PresenceStatus | "offline">;
  quests: Quest[];
  bounties: string[];
  products: ShopProduct[];
  productSeq: number;
  opened: Record<string, string>;
  pulse: number;
  notice: Notice | null;
  accountOpen: boolean;
  focusId: string | null;
  desk: Desk;
  setPage: (page: SitePage) => void;
  setHomeTab: (tab: HomeTab) => void;
  setDesk: (desk: Desk) => void;
  setQuery: (query: string) => void;
  setGame: (game: GameFilter) => void;
  setPlatform: (platform: PlatformFilter) => void;
  setRegion: (region: RegionFilter) => void;
  toggleSaved: (id: string) => void;
  toggleFollowLocal: (id: string) => void;
  blockPlayerLocal: (id: string) => void;
  unblockPlayerLocal: (id: string) => void;
  setFavoriteLocal: (id: string, favorite: boolean) => void;
  setAliasLocal: (id: string, alias: string) => void;
  setTagsLocal: (tags: TagView[]) => void;
  hydrateSocial: (graph: SocialGraph) => void;
  setPresence: (presence: Record<string, PresenceStatus | "offline">) => void;
  setPolicyLocal: (policy: { friendRequestPolicy?: FollowPolicy; groupInvitePolicy?: InvitePolicy; dmPolicy?: DmPolicy }) => void;
  advanceQuest: (event: Quest["event"]) => void;
  toggleBounty: (id: string) => void;
  openBusiness: (id: string, name: string) => void;
  addProduct: (draft: Omit<ShopProduct, "id">) => void;
  pullProduct: (id: string) => void;
  ping: (title: string, detail: string) => void;
  setAccountOpen: (accountOpen: boolean) => void;
  openProfile: (id: string) => void;
  reset: () => void;
}

const initial = {
  page: "home" as SitePage,
  homeTab: "feed" as HomeTab,
  query: "",
  game: "all" as GameFilter,
  platform: "all" as PlatformFilter,
  region: "all" as RegionFilter,
  saved: [] as string[],
  follows: [] as string[],
  blocked: [] as string[],
  favorites: [] as string[],
  aliases: {} as Record<string, string>,
  tags: [] as TagView[],
  friendRequestPolicy: "everyone" as FollowPolicy,
  groupInvitePolicy: "everyone" as InvitePolicy,
  dmPolicy: "everyone" as DmPolicy,
  presence: {} as Record<string, PresenceStatus | "offline">,
  quests: QUESTS,
  bounties: [] as string[],
  products: [] as ShopProduct[],
  productSeq: 0,
  opened: {} as Record<string, string>,
  pulse: 0,
  notice: null as Notice | null,
  accountOpen: false,
  focusId: null as string | null,
  desk: "play" as Desk,
};

export const useSite = create<SiteState>((set) => ({
  ...initial,
  setPage: (page) => set({ page, desk: "play", accountOpen: false }),
  setHomeTab: (homeTab) => set({ homeTab, page: "home", desk: "play", accountOpen: false }),
  setDesk: (desk) => set({ desk, accountOpen: false }),
  setQuery: (query) => set({ query }),
  setGame: (game) => set({ game }),
  setPlatform: (platform) => set({ platform }),
  setRegion: (region) => set({ region }),
  toggleSaved: (id) =>
    set((state) => ({
      saved: state.saved.includes(id) ? state.saved.filter((item) => item !== id) : [...state.saved, id],
    })),
  toggleFollowLocal: (id) =>
    set((state) => {
      if (state.blocked.includes(id)) return {};
      return { follows: state.follows.includes(id) ? state.follows.filter((item) => item !== id) : [...state.follows, id] };
    }),
  blockPlayerLocal: (id) =>
    set((state) => ({
      blocked: state.blocked.includes(id) ? state.blocked : [...state.blocked, id],
      follows: state.follows.filter((item) => item !== id),
      favorites: state.favorites.filter((item) => item !== id),
    })),
  unblockPlayerLocal: (id) => set((state) => ({ blocked: state.blocked.filter((item) => item !== id) })),
  setFavoriteLocal: (id, favorite) =>
    set((state) => ({
      favorites: favorite ? (state.favorites.includes(id) ? state.favorites : [...state.favorites, id]) : state.favorites.filter((item) => item !== id),
    })),
  setAliasLocal: (id, alias) =>
    set((state) => {
      const aliases = { ...state.aliases };
      if (alias.trim()) aliases[id] = alias.trim();
      else delete aliases[id];
      return { aliases };
    }),
  setTagsLocal: (tags) => set({ tags }),
  hydrateSocial: (graph) =>
    set({
      follows: graph.follows.map((f) => f.followeeId),
      favorites: graph.follows.filter((f) => f.isFavorite).map((f) => f.followeeId),
      aliases: Object.fromEntries(graph.follows.filter((f) => f.alias).map((f) => [f.followeeId, f.alias!])),
      blocked: graph.blocked,
      tags: graph.tags,
      friendRequestPolicy: graph.friendRequestPolicy,
      groupInvitePolicy: graph.groupInvitePolicy,
      dmPolicy: graph.dmPolicy,
    }),
  setPresence: (presence) => set({ presence }),
  setPolicyLocal: (policy) => set((state) => ({ ...state, ...policy })),
  advanceQuest: (event) =>
    set((state) => ({
      quests: state.quests.map((quest) => (quest.event === event && quest.progress < quest.need ? { ...quest, progress: quest.progress + 1 } : quest)),
    })),
  toggleBounty: (id) =>
    set((state) => ({
      bounties: state.bounties.includes(id) ? state.bounties.filter((item) => item !== id) : [...state.bounties, id],
    })),
  openBusiness: (id, name) => set((state) => ({ opened: { ...state.opened, [id]: name } })),
  addProduct: (draft) =>
    set((state) => {
      const productSeq = state.productSeq + 1;
      const product: ShopProduct = { id: `prd-${productSeq}`, ...draft };
      return { productSeq, products: [product, ...state.products] };
    }),
  pullProduct: (id) => set((state) => ({ products: state.products.filter((product) => product.id !== id) })),
  ping: (title, detail) => set((state) => ({ pulse: state.pulse + 1, notice: { id: state.pulse + 1, title, detail } })),
  setAccountOpen: (accountOpen) => set({ accountOpen }),
  openProfile: (focusId) => set({ focusId, page: "profile", desk: "play", accountOpen: false }),
  reset: () => set({ ...initial, products: [] }),
}));

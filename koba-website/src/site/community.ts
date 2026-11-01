import { create } from "zustand";

export type ChannelKind = "text" | "voice";

export interface Role {
  id: string;
  groupId: string;
  name: string;
  rank: number;
}

export interface Category {
  id: string;
  groupId: string;
  name: string;
  rank: number;
}

export interface Channel {
  id: string;
  groupId: string;
  categoryId: string;
  name: string;
  kind: ChannelKind;
  rank: number;
}

export interface RoomMessage {
  id: string;
  authorId: string;
  text: string;
}

export interface DirectMessage {
  id: string;
  authorId: string;
  text: string;
  sticker?: string;
  packTitle?: string;
  kind?: "text" | "sticker" | "gif" | "location" | "draw" | "photo" | "voice" | "gift";
  payload?: string;
  at?: number;
}

export interface DirectThread {
  id: string;
  a: string;
  b: string;
  messages: DirectMessage[];
}

export interface Sticker {
  id: string;
  name: string;
  tone: "ok" | "cyan" | "gold";
}

export interface StickerPack {
  id: string;
  productId: string;
  title: string;
  stickers: Sticker[];
}

interface CommunityState {
  groups: { id: string; name: string; tag: string; ownerId: string }[];
  roles: Role[];
  members: { groupId: string; identityId: string; roleId: string }[];
  categories: Category[];
  channels: Channel[];
  rooms: Record<string, RoomMessage[]>;
  directs: DirectThread[];
  astroPass: string[];
  astroMonths: Record<string, number>;
  owned: Record<string, string[]>;
  equipped: Record<string, string | null>;
  packs: StickerPack[];
  ownedPacks: Record<string, string[]>;
  wishlist: Record<string, string[]>;
  giftId: string | null;
  nights: { id: string; groupId: string; title: string; when: string }[];
  seq: number;
  activeGroup: string;
  activeChannel: string;
  activeThread: string;
  setActiveGroup: (id: string) => void;
  setActiveChannel: (id: string) => void;
  setActiveThread: (id: string) => void;
  /** Replaces the DM roster with real threads loaded from Postgres (Phase 2 of the data-migration plan). */
  hydrateDirects: (threads: DirectThread[]) => void;
  /** Replaces groups/roles/members/categories/channels/rooms with the real Postgres snapshot (Phase 3). */
  hydrateGroups: (snapshot: {
    groups: { id: string; name: string; tag: string; ownerId: string }[];
    roles: Role[];
    members: { groupId: string; identityId: string; roleId: string }[];
    categories: Category[];
    channels: Channel[];
    rooms: Record<string, RoomMessage[]>;
  }) => void;
  createGroup: (ownerId: string, name: string) => void;
  joinGroup: (groupId: string, identityId: string) => void;
  addCategory: (groupId: string, identityId: string, name: string) => string | null;
  addChannel: (groupId: string, identityId: string, categoryId: string, name: string, kind: ChannelKind) => string | null;
  addRole: (groupId: string, identityId: string, name: string) => string | null;
  moveRole: (groupId: string, identityId: string, roleId: string, direction: -1 | 1) => void;
  postRoom: (channelId: string, authorId: string, text: string) => void;
  openThread: (selfId: string, otherId: string) => string;
  sendDirect: (threadId: string, authorId: string, text: string, sticker?: { name: string; packTitle: string; url?: string }, extra?: { kind?: DirectMessage["kind"]; payload?: string }) => void;
  subscribe: (identityId: string) => void;
  endPass: (identityId: string) => void;
  grantProduct: (identityId: string, productId: string, kind: string, title: string, stickerNames?: string[]) => void;
  equip: (identityId: string, productId: string) => boolean;
  clearEquip: (identityId: string) => void;
  toggleWish: (identityId: string, productId: string) => void;
  setGift: (productId: string | null) => void;
  scheduleNight: (groupId: string, title: string) => void;
  canManage: (groupId: string, identityId: string) => boolean;
  reset: () => void;
}


function emptyState(): Omit<
  CommunityState,
  | "setActiveGroup"
  | "setActiveChannel"
  | "setActiveThread"
  | "hydrateDirects"
  | "hydrateGroups"
  | "createGroup"
  | "joinGroup"
  | "addCategory"
  | "addChannel"
  | "addRole"
  | "moveRole"
  | "postRoom"
  | "openThread"
  | "sendDirect"
  | "subscribe"
  | "endPass"
  | "grantProduct"
  | "equip"
  | "clearEquip"
  | "toggleWish"
  | "setGift"
  | "scheduleNight"
  | "canManage"
  | "reset"
> {
  return {
    groups: [],
    roles: [],
    members: [],
    categories: [],
    channels: [],
    rooms: {},
    directs: [],
    astroPass: [],
    astroMonths: {},
    owned: {},
    equipped: {},
    packs: [],
    ownedPacks: {},
    wishlist: {},
    giftId: null,
    nights: [],
    seq: 0,
    activeGroup: "",
    activeChannel: "",
    activeThread: "",
  };
}

function nextId(seq: number, prefix: string) {
  return `${prefix}-${seq}`;
}

export const useCommunity = create<CommunityState>((set, get) => ({
  ...emptyState(),
  setActiveGroup: (id) => {
    const channel = get().channels.find((item) => item.groupId === id);
    set({ activeGroup: id, activeChannel: channel?.id ?? get().activeChannel });
  },
  setActiveChannel: (id) => set({ activeChannel: id }),
  setActiveThread: (id) => set({ activeThread: id }),
  hydrateDirects: (threads) => set({ directs: threads }),
  hydrateGroups: (snapshot) => set(snapshot),
  canManage: (groupId, identityId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return false;
    if (group.ownerId === identityId) return true;
    const member = get().members.find((item) => item.groupId === groupId && item.identityId === identityId);
    if (!member) return false;
    const role = get().roles.find((item) => item.id === member.roleId);
    return (role?.rank ?? 0) >= 2;
  },
  createGroup: (ownerId, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (trimmed.length < 2) return state;
      const seq = state.seq + 1;
      const id = nextId(seq, "grp");
      const roleId = nextId(seq, "role");
      const categoryId = nextId(seq, "cat");
      const channelId = nextId(seq, "ch");
      return {
        seq,
        groups: [...state.groups, { id, name: trimmed.slice(0, 24), tag: trimmed.slice(0, 3).toUpperCase(), ownerId }],
        roles: [...state.roles, { id: roleId, groupId: id, name: "Owner", rank: 3 }],
        members: [...state.members, { groupId: id, identityId: ownerId, roleId }],
        categories: [...state.categories, { id: categoryId, groupId: id, name: "Text", rank: 1 }],
        channels: [...state.channels, { id: channelId, groupId: id, categoryId, name: "general", kind: "text", rank: 1 }],
        rooms: { ...state.rooms, [channelId]: [] },
        activeGroup: id,
        activeChannel: channelId,
      };
    }),
  joinGroup: (groupId, identityId) =>
    set((state) => {
      if (state.members.some((item) => item.groupId === groupId && item.identityId === identityId)) return state;
      const roles = state.roles.filter((item) => item.groupId === groupId).sort((a, b) => a.rank - b.rank);
      const role = roles[0];
      if (!role) return state;
      return { members: [...state.members, { groupId, identityId, roleId: role.id }] };
    }),
  addCategory: (groupId, identityId, name) => {
    if (!get().canManage(groupId, identityId)) return null;
    const trimmed = name.trim();
    if (trimmed.length < 2) return null;
    const seq = get().seq + 1;
    const id = nextId(seq, "cat");
    const rank = get().categories.filter((item) => item.groupId === groupId).length + 1;
    set((state) => ({
      seq,
      categories: [...state.categories, { id, groupId, name: trimmed.slice(0, 24), rank }],
    }));
    return id;
  },
  addChannel: (groupId, identityId, categoryId, name, kind) => {
    if (!get().canManage(groupId, identityId)) return null;
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (trimmed.length < 2) return null;
    const seq = get().seq + 1;
    const id = nextId(seq, "ch");
    const rank = get().channels.filter((item) => item.categoryId === categoryId).length + 1;
    set((state) => ({
      seq,
      channels: [...state.channels, { id, groupId, categoryId, name: trimmed.slice(0, 24), kind, rank }],
      rooms: { ...state.rooms, [id]: [] },
      activeChannel: id,
    }));
    return id;
  },
  addRole: (groupId, identityId, name) => {
    if (!get().canManage(groupId, identityId)) return null;
    const trimmed = name.trim();
    if (trimmed.length < 2) return null;
    const seq = get().seq + 1;
    const id = nextId(seq, "role");
    const lowest = get()
        .roles.filter((item) => item.groupId === groupId && item.name !== "Owner")
        .reduce((min, role) => Math.min(min, role.rank), 2);
      set((state) => ({
        seq,
        roles: [...state.roles, { id, groupId, name: trimmed.slice(0, 24), rank: Math.max(1, lowest) }],
      }));
    return id;
  },
  moveRole: (groupId, identityId, roleId, direction) =>
    set((state) => {
      if (!state.canManage(groupId, identityId)) return state;
      const group = state.groups.find((item) => item.id === groupId);
      const role = state.roles.find((item) => item.id === roleId);
      if (!group || !role || role.groupId !== groupId) return state;
      if (role.name === "Owner") return state;
      const sibling = state.roles
        .filter((item) => item.groupId === groupId && item.id !== roleId && item.name !== "Owner")
        .filter((item) => (direction < 0 ? item.rank > role.rank : item.rank < role.rank))
        .sort((a, b) => (direction < 0 ? a.rank - b.rank : b.rank - a.rank))[0];
      if (!sibling) return state;
      return {
        roles: state.roles.map((item) => {
          if (item.id === role.id) return { ...item, rank: sibling.rank };
          if (item.id === sibling.id) return { ...item, rank: role.rank };
          return item;
        }),
      };
    }),
  postRoom: (channelId, authorId, text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return state;
      const seq = state.seq + 1;
      const current = state.rooms[channelId] ?? [];
      return {
        seq,
        rooms: { ...state.rooms, [channelId]: [...current, { id: nextId(seq, "rm"), authorId, text: trimmed.slice(0, 240) }] },
      };
    }),
  openThread: (selfId, otherId) => {
    const existing = get().directs.find(
      (thread) => (thread.a === selfId && thread.b === otherId) || (thread.a === otherId && thread.b === selfId),
    );
    if (existing) {
      set({ activeThread: existing.id });
      return existing.id;
    }
    const seq = get().seq + 1;
    const id = nextId(seq, "dm");
    set((state) => ({
      seq,
      directs: [...state.directs, { id, a: selfId, b: otherId, messages: [] }],
      activeThread: id,
    }));
    return id;
  },
  sendDirect: (threadId, authorId, text, sticker, extra) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed && !sticker && !extra?.payload) return state;
      const seq = state.seq + 1;
      return {
        seq,
        directs: state.directs.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  {
                    id: nextId(seq, "dmmsg"),
                    authorId,
                    text: trimmed.slice(0, 240),
                    sticker: sticker?.name,
                    packTitle: sticker?.packTitle,
                    kind: extra?.kind ?? (sticker ? "sticker" : "text"),
                    payload: extra?.payload ?? sticker?.url,
                    at: Date.now(),
                  },
                ],
              }
            : thread,
        ),
      };
    }),
  subscribe: (identityId) =>
    set((state) => {
      const active = state.astroPass.includes(identityId);
      const months = state.astroMonths[identityId] ?? 0;
      return {
        astroPass: active ? state.astroPass : [...state.astroPass, identityId],
        astroMonths: { ...state.astroMonths, [identityId]: active ? months : Math.max(months, 1) },
      };
    }),
  endPass: (identityId) =>
    set((state) => ({
      astroPass: state.astroPass.filter((id) => id !== identityId),
      equipped: { ...state.equipped, [identityId]: null },
    })),
  grantProduct: (identityId, productId, kind, title, stickerNames) =>
    set((state) => {
      if (kind === "sticker-pack") {
        const existing = state.packs.find((pack) => pack.productId === productId);
        const seq = state.seq + 1;
        const source = stickerNames ?? [];
        const tones = ["ok", "cyan", "gold", "ok"] as const;
        const pack =
          existing ??
          ({
            id: nextId(seq, "pack"),
            productId,
            title,
            stickers: source.slice(0, 8).map((name, index) => ({
              id: `${nextId(seq, "stk")}-${index}`,
              name: name.replace(/\.[a-z0-9]+$/i, "").slice(0, 16) || `Sticker ${index + 1}`,
              tone: tones[index % tones.length],
            })),
          } satisfies StickerPack);
        const mine = state.ownedPacks[identityId] ?? [];
        return {
          seq: existing ? state.seq : seq,
          packs: existing ? state.packs : [...state.packs, pack],
          ownedPacks: { ...state.ownedPacks, [identityId]: mine.includes(pack.id) ? mine : [...mine, pack.id] },
        };
      }
      const mine = state.owned[identityId] ?? [];
      if (mine.includes(productId)) return state;
      return { owned: { ...state.owned, [identityId]: [...mine, productId] } };
    }),
  equip: (identityId, productId) => {
    const state = get();
    if (!state.astroPass.includes(identityId)) return false;
    if (!(state.owned[identityId] ?? []).includes(productId)) return false;
    set({ equipped: { ...state.equipped, [identityId]: productId } });
    return true;
  },
  clearEquip: (identityId) => set((state) => ({ equipped: { ...state.equipped, [identityId]: null } })),
  toggleWish: (identityId, productId) =>
    set((state) => {
      const current = state.wishlist[identityId] ?? [];
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
      return { wishlist: { ...state.wishlist, [identityId]: next } };
    }),
  setGift: (productId) => set({ giftId: productId }),
  scheduleNight: (groupId, title) =>
    set((state) => {
      const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
      when.setHours(21, 0, 0, 0);
      const seq = state.seq + 1;
      const night = { id: nextId(seq, "night"), groupId, title: title.trim().slice(0, 48) || "Wipe night", when: when.toISOString() };
      const channel = state.channels.find((item) => item.groupId === groupId);
      const rooms = channel
        ? {
            ...state.rooms,
            [channel.id]: [...(state.rooms[channel.id] ?? []), { id: nextId(seq, "rm"), authorId: "system", text: `${night.title} is set for ${when.toLocaleString()}.` }],
          }
        : state.rooms;
      return { seq, nights: [night, ...state.nights.filter((item) => item.groupId !== groupId)], rooms };
    }),
  reset: () => set(emptyState()),
}));

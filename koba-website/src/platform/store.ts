import { create } from "zustand";
import { money } from "@/site/astro";
import { type ShopRole } from "@/site/roles";
import { useSite } from "@/site/ui";
import {
  emptyPlatform,
  ingest,
  nextCapacity,
  routeCommand,
  settleProvisional,
  signPacket,
  UNLINKED_STEAM,
  workloadBudget,
  type Capacity,
  type Embed,
  type FeedRow,
  type GameScope,
  type IngestResult,
  type PlatformData,
  type RawPacket,
  type StaffRole,
} from "./engine.ts";

export type DeskGrant = "player" | "business" | "trainee" | "support" | "mod" | "admin" | "super";

function credentialFor(id: string, stamp: number) {
  return `cred_${id.replace("koba_", "")}_${stamp.toString(36)}`;
}

interface PlatformState extends PlatformData {
  role: StaffRole;
  hq: boolean;
  game: GameScope;
  fps: number;
  capacity: Capacity;
  lastIngest: IngestResult | null;
  lastEmbed: Embed | null;
  activeServerId: string;
  setViewer: (viewerId: string) => void;
  /** Insert or replace one identity by id - used to splice a real signed-in player's row into the loaded roster. */
  upsertIdentity: (identity: PlatformData["identities"][number]) => void;
  /** Replaces the whole roster with real players (Phase 1 of the data-migration plan) - keeps the real signed-in viewer's row if it's not in the new list yet (hydration ordering). */
  setIdentities: (identities: PlatformData["identities"]) => void;
  setRole: (role: StaffRole) => void;
  setHq: (hq: boolean) => void;
  setGame: (game: GameScope) => void;
  setServer: (serverId: string) => void;
  setFps: (fps: number) => void;
  run: (line: string) => Embed;
  emitCombat: (steamId?: string) => Promise<boolean>;
  emitRaid: () => Promise<void>;
  emitForged: () => Promise<void>;
  emitBurst: () => Promise<void>;
  reset: () => void;
  applySale: (sale: { buyerId: string; sellerId: string; price: number; payout: number; title: string; detail: string }) => { ok: true } | { ok: false; reason: string };
  creditCoins: (identityId: string, coins: number, title: string, detail: string) => boolean;
  spendCoins: (identityId: string, coins: number, title: string, detail: string) => boolean;
  boostUntil: Record<string, number>;
  buyBoost: (identityId: string) => { ok: true; until: number } | { ok: false; reason: string };
  grants: Record<string, DeskGrant>;
  shopStaff: Record<string, Record<string, ShopRole>>;
  credentials: Record<string, string>;
  assignGrant: (id: string, grant: DeskGrant) => void;
  assignShopRole: (shopId: string, identityId: string, role: ShopRole | null) => void;
  rotateCredential: (id: string) => void;
  revokeCredential: (id: string) => void;
  rotateServerKey: (serverId: string) => void;
  rotateHostKey: (serverId: string) => void;
  setServerLicense: (serverId: string, license: "active" | "expired") => void;
  addServer: (input: { name: string; game: GameScope }) => void;
  removeServer: (serverId: string) => { ok: true } | { ok: false; reason: string };
  removeIdentity: (id: string) => { ok: true } | { ok: false; reason: string };
  renameHandle: (handle: string) => { ok: true } | { ok: false; reason: string };
  setLink: (provider: "steam" | "discord" | "xbox", on: boolean) => { ok: true } | { ok: false; reason: string };
  heldLinks: Record<string, { steam?: string; discord?: string; xbox?: string }>;
}

function budgetLabel(capacity: Capacity): string {
  return `${capacity} · budget ${workloadBudget(capacity).toFixed(2)}`;
}

function pickedServer(state: { servers: PlatformData["servers"]; activeServerId: string }) {
  return state.servers.find((server) => server.id === state.activeServerId) ?? state.servers[0]!;
}

async function signed(
  data: PlatformData,
  body: Omit<RawPacket, "plugin_signature" | "hostKey">,
  hostKey: string,
  pluginKey: string,
  forge = false,
): Promise<RawPacket> {
  const plugin_signature = forge ? "00".repeat(32) : await signPacket(pluginKey, body);
  return { ...body, hostKey, plugin_signature };
}

function missingPair(
  server: PlatformData["servers"][number] | undefined,
  viewer: PlatformData["identities"][number] | undefined,
  opponent: PlatformData["identities"][number] | undefined,
): IngestResult {
  const note = !server
    ? "No game server is connected yet. Connect one from the developer portal before sending a test packet."
    : !viewer
      ? "No signed-in identity is loaded yet."
      : !opponent
        ? "No other player with a linked game account is on the network yet."
        : "";
  return { disposition: "drop", gates: [{ gate: "identity", pass: false, note }] };
}

export const usePlatform = create<PlatformState>((set, get) => ({
  ...emptyPlatform(),
  role: "player",
  hq: false,
  game: "RUST_CONSOLE",
  fps: 72,
  capacity: "nominal",
  lastIngest: null,
  lastEmbed: null,
  activeServerId: "",
  grants: {},
  shopStaff: {},
  credentials: {},
  heldLinks: {},
  setViewer: (viewerId) => set({ viewerId }),
  upsertIdentity: (identity) =>
    set((state) => {
      const exists = state.identities.some((item) => item.id === identity.id);
      return {
        identities: exists ? state.identities.map((item) => (item.id === identity.id ? identity : item)) : [...state.identities, identity],
      };
    }),
  setIdentities: (identities) =>
    set((state) => {
      const viewerPresent = identities.some((item) => item.id === state.viewerId);
      const viewerRow = state.identities.find((item) => item.id === state.viewerId);
      return { identities: viewerPresent || !viewerRow ? identities : [...identities, viewerRow] };
    }),
  setRole: (role) => set({ role }),
  setHq: (hq) => set({ hq }),
  setGame: (game) => set({ game }),
  setServer: (activeServerId) => set({ activeServerId }),
  setFps: (fps) => set((state) => ({ fps, capacity: nextCapacity(fps, state.capacity) })),
  run: (line) => {
    const state = get();
    const result = routeCommand(state, line, state.role, state.hq, state.game, Date.now());
    set({ ...result.data, role: state.role, hq: state.hq, game: state.game, fps: state.fps, capacity: state.capacity, lastIngest: state.lastIngest, lastEmbed: result.embed });
    return result.embed;
  },
  emitCombat: async (steamId) => {
    const state = get();
    const server = pickedServer(state);
    const viewer = state.identities.find((identity) => identity.id === state.viewerId);
    const victim = state.identities.find((identity) => identity.id !== state.viewerId && identity.steamId);
    if (!server || !viewer || !victim) {
      set({ lastIngest: missingPair(server, viewer, victim) });
      return false;
    }
    const attackerSteam = steamId ?? viewer.steamId ?? UNLINKED_STEAM;
    const body = {
      serverId: server.id,
      kind: "combat" as const,
      at: Date.now(),
      attackerSteam,
      attackerName: viewer.name,
      victimSteam: victim.steamId!,
      victimName: victim.name,
      weapon: "rifle.ak",
      distance: 42,
      hitZone: "head",
      pve: false,
    };
    const packet = await signed(state, body, server.hostKey, server.pluginKey);
    const ingested = await ingest(get(), packet, Date.now());
    set({ ...ingested.data, lastIngest: ingested.result });
    const committed = ingested.result.disposition === "commit";
    if (committed) useSite.getState().advanceQuest("COMBAT_KILL");
    return committed;
  },
  emitRaid: async () => {
    const state = get();
    const server = pickedServer(state);
    const viewer = state.identities.find((identity) => identity.id === state.viewerId);
    const target = state.identities.find((identity) => identity.id !== state.viewerId && identity.steamId);
    if (!server || !viewer || !target) {
      set({ lastIngest: missingPair(server, viewer, target) });
      return;
    }
    const body = {
      serverId: server.id,
      kind: "raid" as const,
      at: Date.now(),
      attackerSteam: viewer.steamId ?? UNLINKED_STEAM,
      attackerName: viewer.name,
      entity: "cupboard.tool",
      damage: 86,
      ownerSteam: target.steamId!,
      weapon: "explosive.timed",
    };
    const packet = await signed(state, body, server.hostKey, server.pluginKey);
    const ingested = await ingest(get(), packet, Date.now());
    set({ ...ingested.data, lastIngest: ingested.result });
  },
  emitForged: async () => {
    const state = get();
    const server = pickedServer(state);
    const viewer = state.identities.find((identity) => identity.id === state.viewerId);
    const victim = state.identities.find((identity) => identity.id !== state.viewerId && identity.steamId);
    if (!server || !viewer || !victim) {
      set({ lastIngest: missingPair(server, viewer, victim) });
      return;
    }
    const body = {
      serverId: server.id,
      kind: "combat" as const,
      at: Date.now(),
      attackerSteam: viewer.steamId ?? UNLINKED_STEAM,
      attackerName: viewer.name,
      victimSteam: victim.steamId!,
      victimName: victim.name,
      weapon: "rifle.ak",
      distance: 10,
      hitZone: "chest",
      pve: false,
    };
    const packet = await signed(state, body, server.hostKey, server.pluginKey, true);
    const ingested = await ingest(get(), packet, Date.now());
    set({ ...ingested.data, lastIngest: ingested.result });
  },
  emitBurst: async () => {
    const state = get();
    const server = pickedServer(state);
    const viewer = state.identities.find((identity) => identity.id === state.viewerId);
    const victim = state.identities.find((identity) => identity.id !== state.viewerId && identity.steamId);
    if (!server || !viewer || !victim) {
      set({ lastIngest: missingPair(server, viewer, victim) });
      return;
    }
    let data: PlatformData = state;
    let last: IngestResult | null = null;
    const start = Date.now();
    for (let i = 0; i < 9; i++) {
      const body = {
        serverId: server.id,
        kind: "combat" as const,
        at: start,
        attackerSteam: viewer.steamId ?? UNLINKED_STEAM,
        attackerName: viewer.name,
        victimSteam: victim.steamId!,
        victimName: victim.name,
        weapon: "rifle.ak",
        distance: 18 + i,
        hitZone: "chest",
        pve: false,
      };
      const packet = await signed(data, body, server.hostKey, server.pluginKey);
      const ingested = await ingest(data, packet, start);
      data = ingested.data;
      last = ingested.result;
    }
    set({
      identities: data.identities,
      clans: data.clans,
      servers: data.servers,
      events: data.events,
      provisional: data.provisional,
      attempts: data.attempts,
      feed: data.feed,
      audit: data.audit,
      viewerId: data.viewerId,
      seq: data.seq,
      lastIngest: last,
    });
  },
  reset: () =>
    set({
      ...emptyPlatform(),
      role: "player",
      hq: false,
      game: "RUST_CONSOLE",
      fps: 72,
      capacity: "nominal",
      lastIngest: null,
      lastEmbed: null,
      activeServerId: "",
      grants: {},
      shopStaff: {},
      credentials: {},
      heldLinks: {},
      boostUntil: {},
    }),
  applySale: (sale) => {
    const state = get();
    const buyer = state.identities.find((identity) => identity.id === sale.buyerId);
    const seller = state.identities.find((identity) => identity.id === sale.sellerId);
    if (!buyer || !seller) return { ok: false, reason: "That identity is not on the network." };
    if (buyer.id === seller.id) return { ok: false, reason: "You cannot buy your own listing." };
    if (buyer.coins < sale.price) return { ok: false, reason: "Not enough coins." };
    const identities = state.identities.map((identity) => {
      if (identity.id === buyer.id) return { ...identity, coins: money(identity.coins - sale.price) };
      if (identity.id === seller.id) return { ...identity, coins: money(identity.coins + sale.payout) };
      return identity;
    });
    const seq = state.seq + 1;
    const row: FeedRow = {
      id: `feed-${seq}`,
      at: seq,
      tone: "gold",
      title: sale.title,
      detail: sale.detail,
    };
    set({
      identities,
      seq,
      feed: [row, ...state.feed].slice(0, 40),
    });
    return { ok: true };
  },
  creditCoins: (identityId, coins, title, detail) => {
    const state = get();
    const buyer = state.identities.find((identity) => identity.id === identityId);
    if (!buyer || !Number.isInteger(coins) || coins <= 0) return false;
    const identities = state.identities.map((identity) => (identity.id === identityId ? { ...identity, coins: money(identity.coins + coins) } : identity));
    const seq = state.seq + 1;
    const row: FeedRow = { id: `feed-${seq}`, at: Date.now(), tone: "gold", title, detail };
    set({ identities, seq, feed: [row, ...state.feed].slice(0, 40) });
    return true;
  },
  boostUntil: {},
  spendCoins: (identityId, coins, title, detail) => {
    const state = get();
    const buyer = state.identities.find((identity) => identity.id === identityId);
    if (!buyer || !Number.isInteger(coins) || coins <= 0 || buyer.coins < coins) return false;
    const identities = state.identities.map((identity) => (identity.id === identityId ? { ...identity, coins: money(identity.coins - coins) } : identity));
    const seq = state.seq + 1;
    const row: FeedRow = { id: `feed-${seq}`, at: Date.now(), tone: "gold", title, detail };
    set({ identities, seq, feed: [row, ...state.feed].slice(0, 40) });
    return true;
  },
  buyBoost: (identityId) => {
    const cost = 50;
    const paid = get().spendCoins(identityId, cost, "Profile boost", "50 KOBA coins · 10 minutes");
    if (!paid) return { ok: false, reason: "Not enough KOBA coins." };
    const now = Date.now();
    const current = get().boostUntil[identityId] ?? 0;
    const until = Math.max(current, now) + 10 * 60 * 1000;
    set({ boostUntil: { ...get().boostUntil, [identityId]: until } });
    return { ok: true, until };
  },
  assignGrant: (id, grant) => set((state) => ({ grants: { ...state.grants, [id]: grant } })),
  assignShopRole: (shopId, identityId, role) =>
    set((state) => {
      const current = { ...(state.shopStaff[shopId] ?? {}) };
      if (!role || role === "owner") delete current[identityId];
      else current[identityId] = role;
      return { shopStaff: { ...state.shopStaff, [shopId]: current } };
    }),
  rotateCredential: (id) =>
    set((state) => ({
      credentials: { ...state.credentials, [id]: credentialFor(id, state.seq + 1) },
      seq: state.seq + 1,
    })),
  revokeCredential: (id) => set((state) => ({ credentials: { ...state.credentials, [id]: "" } })),
  rotateServerKey: (serverId) =>
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, pluginKey: `vk_${server.id.slice(-4)}_${(state.seq + 1).toString(36)}` } : server,
      ),
      seq: state.seq + 1,
    })),
  rotateHostKey: (serverId) =>
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId ? { ...server, hostKey: `hk_${server.id.slice(-4)}_${(state.seq + 1).toString(36)}` } : server,
      ),
      seq: state.seq + 1,
    })),
  setServerLicense: (serverId, license) =>
    set((state) => {
      const servers = state.servers.map((server) => (server.id === serverId ? { ...server, license } : server));
      if (license !== "active") return { servers };
      const settled = settleProvisional({ ...state, servers }, (event) => event.serverId === serverId, Date.now());
      return {
        servers: settled.servers,
        identities: settled.identities,
        events: settled.events,
        provisional: settled.provisional,
        feed: settled.feed,
        seq: settled.seq,
        attempts: settled.attempts,
      };
    }),
  addServer: ({ name, game }) =>
    set((state) => {
      const seq = state.seq + 1;
      const slug = seq.toString(36);
      return {
        seq,
        servers: [
          ...state.servers,
          {
            id: `srv-${slug}`,
            name: name.trim().slice(0, 32) || "New connection",
            game,
            guildId: `guild-${slug}`,
            license: "active",
            hostKey: `hk_${slug}`,
            pluginKey: `vk_${slug}`,
          },
        ],
      };
    }),
  removeServer: (serverId) => {
    const state = get();
    if (state.servers.length <= 1) return { ok: false, reason: "Keep at least one API connection." };
    if (state.activeServerId === serverId) {
      const next = state.servers.find((server) => server.id !== serverId);
      set({
        servers: state.servers.filter((server) => server.id !== serverId),
        activeServerId: next?.id ?? state.activeServerId,
      });
      return { ok: true };
    }
    set({ servers: state.servers.filter((server) => server.id !== serverId) });
    return { ok: true };
  },
  removeIdentity: (id) => {
    const state = get();
    if (state.identities.length <= 1) return { ok: false, reason: "The network needs at least one identity." };
    if (id === state.viewerId) return { ok: false, reason: "Switch off this identity before deleting it." };
    const grants = { ...state.grants };
    const credentials = { ...state.credentials };
    delete grants[id];
    delete credentials[id];
    set({
      identities: state.identities.filter((identity) => identity.id !== id),
      grants,
      credentials,
    });
    return { ok: true };
  },
  renameHandle: (handle) => {
    const state = get();
    const next = handle.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,15}$/.test(next)) return { ok: false, reason: "3 to 16 characters. Start with a letter." };
    const taken = state.identities.some((identity) => identity.id !== state.viewerId && identity.handle.toLowerCase() === next);
    if (taken) return { ok: false, reason: "That username is taken." };
    set({
      identities: state.identities.map((identity) => (identity.id === state.viewerId ? { ...identity, handle: next } : identity)),
    });
    return { ok: true };
  },
  setLink: (provider, on) => {
    const state = get();
    const identity = state.identities.find((item) => item.id === state.viewerId);
    if (!identity) return { ok: false, reason: "No account." };
    const current = provider === "steam" ? identity.steamId : provider === "discord" ? identity.discordId : identity.xboxId;
    const held = state.heldLinks[identity.id]?.[provider];
    const next = on ? current ?? held : undefined;
    if (on && !next) return { ok: false, reason: "Sign in with that provider to connect it." };
    set({
      heldLinks: {
        ...state.heldLinks,
        [identity.id]: { ...state.heldLinks[identity.id], [provider]: on ? undefined : current ?? held },
      },
      identities: state.identities.map((item) => {
        if (item.id !== identity.id) return item;
        if (provider === "steam") return { ...item, steamId: next };
        if (provider === "discord") return { ...item, discordId: next };
        return { ...item, xboxId: next };
      }),
    });
    return { ok: true };
  },
}));

export { budgetLabel };

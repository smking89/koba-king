export type Role = "PLAYER" | "BUSINESS" | "STAFF";
export type AppStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type AppType = "BOT" | "PLUGIN" | "ADAPTER";
export type GameId = "RUST" | "DAYZ" | "ARK" | "MINECRAFT";
export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "RELIC";
export type Billing = "BUY_NOW" | "SUBSCRIPTION";

export interface StoreUser {
  id: string;
  kobaId: string;
  email: string;
  name: string;
  role: Role;
  isVerifiedDeveloper: boolean;
}

export interface AppListing {
  id: string;
  name: string;
  developerId: string;
  developerName: string;
  developerVerified: boolean;
  type: AppType;
  game: GameId;
  rarityTier: Rarity;
  billingModel: Billing;
  basePrice: number;
  metaUrl: string;
  status: AppStatus;
  verifiedBy: string | null;
  createdAt: string;
}

export interface Purchase {
  id: string;
  userId: string;
  appId: string;
  licenseKey: string;
  billingModel: Billing;
  amountPaidTotal: number;
  platformFeeCharged: number;
  developerPayout: number;
  subscriptionEnd: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DownloadToken {
  id: string;
  tokenString: string;
  appId: string;
  kobaId: string;
  isUsed: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface AppStoreState {
  users: StoreUser[];
  apps: AppListing[];
  purchases: Purchase[];
  tokens: DownloadToken[];
}

export interface PublicApp {
  id: string;
  name: string;
  developerName: string;
  developerVerified: boolean;
  type: AppType;
  game: GameId;
  rarityTier: Rarity;
  billingModel: Billing;
  basePrice: number;
  feeLabel: "2.5%" | "3.0%";
}

export type StoreResult<T> = { ok: true; state: AppStoreState; value: T } | { ok: false; error: string; status: number };

const MINUTE = 60_000;
const MONTH = 30 * 24 * 60 * 60_000;

export const TYPE_LABEL: Record<AppType, string> = {
  BOT: "Discord Bots",
  PLUGIN: "PC Game Plugins",
  ADAPTER: "Dashboard Adapters",
};

export const GAME_LABEL: Record<GameId, string> = {
  RUST: "Rust",
  DAYZ: "DayZ",
  ARK: "Ark",
  MINECRAFT: "Minecraft",
};

export function feeSplit(cents: number, verified: boolean) {
  const rate = verified ? 0.025 : 0.03;
  const platformFeeCharged = Math.round(cents * rate);
  return {
    rate,
    platformFeeCharged,
    developerPayout: cents - platformFeeCharged,
    label: (verified ? "2.5%" : "3.0%") as "2.5%" | "3.0%",
  };
}

export function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function id(prefix: string, now: number) {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function key() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Store identities come from real KOBA accounts. There are no demo seats: the
 * account switcher only lists users the running store state actually has.
 */
export const SEATS: StoreUser[] = [];

export function emptyState(): AppStoreState {
  return { users: [], apps: [], purchases: [], tokens: [] };
}

export function toPublic(app: AppListing): PublicApp {
  return {
    id: app.id,
    name: app.name,
    developerName: app.developerName,
    developerVerified: app.developerVerified,
    type: app.type,
    game: app.game,
    rarityTier: app.rarityTier,
    billingModel: app.billingModel,
    basePrice: app.basePrice,
    feeLabel: feeSplit(app.basePrice, app.developerVerified).label,
  };
}

export function browseApps(state: AppStoreState, filter: { type?: AppType | ""; game?: GameId | "" }) {
  return state.apps
    .filter((app) => app.status === "APPROVED")
    .filter((app) => !filter.type || app.type === filter.type)
    .filter((app) => !filter.game || app.game === filter.game)
    .map(toPublic);
}

function userByKoba(state: AppStoreState, kobaId: string) {
  return state.users.find((user) => user.kobaId === kobaId) ?? null;
}

function owns(state: AppStoreState, userId: string, appId: string, now: number) {
  return state.purchases.find((purchase) => {
    if (purchase.userId !== userId || purchase.appId !== appId || !purchase.isActive) return false;
    if (!purchase.subscriptionEnd) return true;
    return new Date(purchase.subscriptionEnd).getTime() > now;
  });
}

export function buyApp(state: AppStoreState, kobaId: string, appId: string, now: number): StoreResult<Purchase> {
  const user = userByKoba(state, kobaId);
  if (!user) return { ok: false, error: "Unknown KOBAid.", status: 401 };
  const app = state.apps.find((item) => item.id === appId);
  if (!app || app.status !== "APPROVED") return { ok: false, error: "That listing is not for sale.", status: 404 };
  if (owns(state, user.id, app.id, now)) return { ok: false, error: "This KOBAid already owns an active license.", status: 409 };
  const split = feeSplit(app.basePrice, app.developerVerified);
  const purchase: Purchase = {
    id: id("pur", now),
    userId: user.id,
    appId: app.id,
    licenseKey: key(),
    billingModel: app.billingModel,
    amountPaidTotal: app.basePrice,
    platformFeeCharged: split.platformFeeCharged,
    developerPayout: split.developerPayout,
    subscriptionEnd: app.billingModel === "SUBSCRIPTION" ? new Date(now + MONTH).toISOString() : null,
    isActive: true,
    createdAt: new Date(now).toISOString(),
  };
  return { ok: true, state: { ...state, purchases: [purchase, ...state.purchases] }, value: purchase };
}

export interface AppDraft {
  name: string;
  type: AppType;
  game: GameId;
  rarityTier: Rarity;
  billingModel: Billing;
  basePrice: number;
}

export function submitApp(state: AppStoreState, kobaId: string, draft: AppDraft, now: number): StoreResult<AppListing> {
  const user = userByKoba(state, kobaId);
  if (!user) return { ok: false, error: "Unknown KOBAid.", status: 401 };
  if (user.role === "PLAYER") return { ok: false, error: "Only a business account can submit a listing.", status: 403 };
  const name = draft.name.trim();
  if (name.length < 3 || name.length > 40) return { ok: false, error: "Name the listing in 3 to 40 characters.", status: 400 };
  if (!Number.isInteger(draft.basePrice) || draft.basePrice < 100 || draft.basePrice > 20000) {
    return { ok: false, error: "Price must be between $1.00 and $200.00.", status: 400 };
  }
  const app: AppListing = {
    id: id("app", now),
    name,
    developerId: user.id,
    developerName: user.name,
    developerVerified: user.isVerifiedDeveloper,
    type: draft.type,
    game: draft.game,
    rarityTier: draft.rarityTier,
    billingModel: draft.billingModel,
    basePrice: draft.basePrice,
    metaUrl: `store://pending/${encodeURIComponent(name)}/package.bin`,
    status: "PENDING_REVIEW",
    verifiedBy: null,
    createdAt: new Date(now).toISOString(),
  };
  return { ok: true, state: { ...state, apps: [app, ...state.apps] }, value: app };
}

export function reviewApp(state: AppStoreState, staffKobaId: string, appId: string, decision: "APPROVED" | "REJECTED"): StoreResult<AppListing> {
  const staff = userByKoba(state, staffKobaId);
  if (!staff || staff.role !== "STAFF") return { ok: false, error: "Only KOBA staff can review a listing.", status: 403 };
  const app = state.apps.find((item) => item.id === appId);
  if (!app) return { ok: false, error: "Listing not found.", status: 404 };
  const next: AppListing = { ...app, status: decision, verifiedBy: decision === "APPROVED" ? staff.kobaId : null };
  return { ok: true, state: { ...state, apps: state.apps.map((item) => (item.id === appId ? next : item)) }, value: next };
}

export function issueDownload(state: AppStoreState, kobaId: string, appId: string, now: number): StoreResult<DownloadToken> {
  const user = userByKoba(state, kobaId);
  if (!user) return { ok: false, error: "Unknown KOBAid.", status: 401 };
  const app = state.apps.find((item) => item.id === appId && item.status === "APPROVED");
  if (!app) return { ok: false, error: "That package is not approved.", status: 404 };
  if (!owns(state, user.id, app.id, now)) return { ok: false, error: "No active license for this KOBAid.", status: 403 };
  const token: DownloadToken = {
    id: id("tok", now),
    tokenString: key(),
    appId: app.id,
    kobaId: user.kobaId,
    isUsed: false,
    expiresAt: new Date(now + MINUTE).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  const tokens = state.tokens.map((item) => (item.kobaId === user.kobaId && item.appId === app.id && !item.isUsed ? { ...item, isUsed: true } : item));
  return { ok: true, state: { ...state, tokens: [token, ...tokens] }, value: token };
}

export function redeemDownload(state: AppStoreState, tokenString: string, now: number): StoreResult<{ file: string }> {
  const token = state.tokens.find((item) => item.tokenString === tokenString);
  if (!token) return { ok: false, error: "Download link not found.", status: 404 };
  if (token.isUsed) return { ok: false, error: "That download link was already used.", status: 410 };
  if (new Date(token.expiresAt).getTime() <= now) return { ok: false, error: "That download link expired.", status: 410 };
  const app = state.apps.find((item) => item.id === token.appId);
  if (!app || app.status !== "APPROVED") return { ok: false, error: "That package is not approved.", status: 404 };
  const tokens = state.tokens.map((item) => (item.id === token.id ? { ...item, isUsed: true } : item));
  return { ok: true, state: { ...state, tokens }, value: { file: app.metaUrl } };
}

export function purchasesFor(state: AppStoreState, kobaId: string) {
  const user = userByKoba(state, kobaId);
  if (!user) return [];
  return state.purchases
    .filter((purchase) => purchase.userId === user.id)
    .map((purchase) => ({ ...purchase, app: toPublic(state.apps.find((app) => app.id === purchase.appId)!) }));
}

export function queueFor(state: AppStoreState, kobaId: string) {
  const user = userByKoba(state, kobaId);
  if (!user) return [];
  if (user.role === "STAFF") return state.apps.filter((app) => app.status === "PENDING_REVIEW");
  return state.apps.filter((app) => app.developerId === user.id);
}

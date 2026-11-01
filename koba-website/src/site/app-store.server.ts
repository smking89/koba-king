import {
  browseApps,
  buyApp,
  issueDownload,
  purchasesFor,
  queueFor,
  redeemDownload,
  reviewApp,
  emptyState,
  submitApp,
  type AppDraft,
  type AppStoreState,
  type AppType,
  type GameId,
} from "./app-store";

function loadState(): AppStoreState {
  const raw = process.env.KOBA_STORE_JSON?.trim();
  if (!raw) return emptyState();
  const parsed = JSON.parse(raw) as AppStoreState;
  if (!Array.isArray(parsed.apps) || !Array.isArray(parsed.users) || !Array.isArray(parsed.purchases) || !Array.isArray(parsed.tokens)) {
    throw new Error("KOBA_STORE_JSON is missing apps, users, purchases, or tokens.");
  }
  return parsed;
}

let state: AppStoreState = loadState();


export function resetAppStore() {
  state = emptyState();
}

export function browse(filter: { type?: AppType | ""; game?: GameId | "" }) {
  return browseApps(state, filter);
}

export function purchases(kobaId: string) {
  return purchasesFor(state, kobaId);
}

export function queue(kobaId: string) {
  return queueFor(state, kobaId);
}

export function buy(kobaId: string, appId: string, now = Date.now()) {
  const result = buyApp(state, kobaId, appId, now);
  if (result.ok) state = result.state;
  return result;
}

export function submit(kobaId: string, draft: AppDraft, now = Date.now()) {
  const result = submitApp(state, kobaId, draft, now);
  if (result.ok) state = result.state;
  return result;
}

export function review(kobaId: string, appId: string, decision: "APPROVED" | "REJECTED") {
  const result = reviewApp(state, kobaId, appId, decision);
  if (result.ok) state = result.state;
  return result;
}

export function issue(kobaId: string, appId: string, now = Date.now()) {
  const result = issueDownload(state, kobaId, appId, now);
  if (result.ok) state = result.state;
  return result;
}

export function redeem(token: string, now = Date.now()) {
  const result = redeemDownload(state, token, now);
  if (result.ok) state = result.state;
  return result;
}


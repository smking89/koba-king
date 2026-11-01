import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  browseApps,
  buyApp,
  feeSplit,
  issueDownload,
  redeemDownload,
  reviewApp,
  submitApp,
  type AppListing,
  type AppStoreState,
  type StoreUser,
} from "./app-store.ts";

const NOW = Date.parse("2026-10-16T00:00:00.000Z");

const BUYER: StoreUser = { id: "user_buyer", kobaId: "koba_buyer", email: "buyer@example.com", name: "Buyer", role: "PLAYER", isVerifiedDeveloper: false };
const DEV: StoreUser = { id: "user_dev", kobaId: "koba_dev", email: "dev@example.com", name: "Verified Dev", role: "BUSINESS", isVerifiedDeveloper: true };
const STAFF: StoreUser = { id: "user_staff", kobaId: "koba_staff", email: "staff@example.com", name: "Staff", role: "STAFF", isVerifiedDeveloper: true };

function listing(partial: Pick<AppListing, "id" | "name" | "status">): AppListing {
  return {
    id: partial.id,
    name: partial.name,
    developerId: DEV.id,
    developerName: DEV.name,
    developerVerified: true,
    type: "BOT",
    game: "RUST",
    rarityTier: "RARE",
    billingModel: "BUY_NOW",
    basePrice: 1200,
    metaUrl: `store://${partial.id}/package.bin`,
    status: partial.status,
    verifiedBy: partial.status === "APPROVED" ? STAFF.kobaId : null,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function fixture(): AppStoreState {
  return {
    users: [BUYER, DEV, STAFF],
    apps: [listing({ id: "app_live", name: "Live App", status: "APPROVED" }), listing({ id: "app_draft", name: "Draft App", status: "PENDING_REVIEW" })],
    purchases: [],
    tokens: [],
  };
}

describe("app store engine", () => {
  it("charges 2.5% for a verified developer and 3.0% otherwise", () => {
    assert.deepEqual(feeSplit(1000, true), { rate: 0.025, platformFeeCharged: 25, developerPayout: 975, label: "2.5%" });
    assert.deepEqual(feeSplit(1000, false), { rate: 0.03, platformFeeCharged: 30, developerPayout: 970, label: "3.0%" });
  });

  it("hides listings that staff have not approved", () => {
    const names = browseApps(fixture(), {}).map((app) => app.name);
    assert.equal(names.includes("Draft App"), false);
    assert.equal(names.includes("Live App"), true);
  });

  it("keeps a pending submission off the browse route until staff approve it", () => {
    const submitted = submitApp(fixture(), "koba_dev", { name: "Gate Lantern", type: "BOT", game: "RUST", rarityTier: "RARE", billingModel: "BUY_NOW", basePrice: 900 }, NOW);
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.equal(submitted.value.status, "PENDING_REVIEW");
    assert.equal(browseApps(submitted.state, {}).some((app) => app.name === "Gate Lantern"), false);
    const approved = reviewApp(submitted.state, "koba_staff", submitted.value.id, "APPROVED");
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.value.verifiedBy, "koba_staff");
    assert.equal(browseApps(approved.state, {}).some((app) => app.name === "Gate Lantern"), true);
  });

  it("rejects a download link that is missing, used, or older than 60 seconds", () => {
    const bought = buyApp(fixture(), "koba_buyer", "app_live", NOW);
    assert.equal(bought.ok, true);
    if (!bought.ok) return;
    assert.equal(bought.value.platformFeeCharged, 30);
    const issued = issueDownload(bought.state, "koba_buyer", "app_live", NOW);
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(new Date(issued.value.expiresAt).getTime() - NOW, 60_000);
    const first = redeemDownload(issued.state, issued.value.tokenString, NOW + 1000);
    assert.equal(first.ok, true);
    const second = first.ok ? redeemDownload(first.state, issued.value.tokenString, NOW + 2000) : first;
    assert.equal(second.ok, false);
    const expired = redeemDownload(issued.state, issued.value.tokenString, NOW + 60_000);
    assert.equal(expired.ok, false);
    const stranger = issueDownload(bought.state, "koba_stranger", "app_live", NOW);
    assert.equal(stranger.ok, false);
  });
});

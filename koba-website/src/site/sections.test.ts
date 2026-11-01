import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleSectionTabs, resolveSectionTab } from "./sections.ts";

const ids = (tabs: { id: string }[]) => tabs.map((tab) => tab.id);

describe("profile tabs", () => {
  it("offers Settings on your own profile", () => {
    assert.deepEqual(ids(visibleSectionTabs("you", false)), ["profile", "friends", "clans", "settings"]);
  });

  it("withholds Settings while viewing another player", () => {
    assert.deepEqual(ids(visibleSectionTabs("you", true)), ["profile", "friends", "clans"]);
  });

  it("leaves the other destinations alone", () => {
    assert.deepEqual(ids(visibleSectionTabs("compete", true)), ["overview", "rankings"]);
    assert.deepEqual(ids(visibleSectionTabs("discover", true)), ["servers", "clans"]);
  });

  it("resolves a settings link on your own profile", () => {
    assert.equal(resolveSectionTab("you", "settings", false), "settings");
  });

  it("falls back to the profile when a settings link points at someone else", () => {
    assert.equal(resolveSectionTab("you", "settings", true), "profile");
  });

  it("keeps a tab that is still offered on a viewed profile", () => {
    assert.equal(resolveSectionTab("you", "friends", true), "friends");
  });

  it("falls back to the first tab for an unknown tab", () => {
    assert.equal(resolveSectionTab("discover", "nonsense", false), "servers");
  });
});

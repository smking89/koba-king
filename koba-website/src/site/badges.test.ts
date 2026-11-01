import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBadges, type RoleSource } from "./badges.ts";

function source(patch: Partial<RoleSource>): RoleSource {
  return {
    id: "koba_mara",
    score: 1840,
    status: "clear",
    strikes: 0,
    warnings: 0,
    homes: 2,
    steam: "steam",
    engineBadges: [],
    verified: true,
    business: true,
    ownsGroup: false,
    officer: true,
    groupMembers: 3,
    hours: 320,
    games: 8,
    marks: [{ id: "a1", name: "Harbor regular", detail: "Thirty sessions.", rare: false }],
    ...patch,
  };
}

describe("koba roles", () => {
  it("keeps verified off the achievement row", () => {
    const result = resolveBadges(source({}));
    const names = result.featured.map((pin) => pin.name);
    assert.equal(result.verified, true);
    assert.equal(result.earned.some((pin) => pin.id === "verified"), false);
    assert.equal(names.includes("Verified"), false);
    assert.ok(names.includes("Business"));
    assert.ok(result.earned.some((pin) => pin.name === "Veteran"));
    assert.ok(result.earned.some((pin) => pin.name === "Circuit"));
    assert.equal(names.includes("Beacon"), false, "no season is invented before one is recorded");
    assert.equal(names.includes("Benefactor"), false, "no gifts are invented before one is sent");
    assert.equal(result.featured.length <= 6, true);
  });

  it("does not give an unverified player the verified pin", () => {
    const result = resolveBadges(source({ id: "koba_dex", verified: false, business: true, officer: false, groupMembers: 2, score: 1896, hours: 0, games: 0 }));
    assert.equal(result.verified, false);
    assert.equal(result.earned.some((pin) => pin.id === "verified"), false);
    assert.equal(result.earned.some((pin) => pin.name === "Spark"), false);
    assert.equal(result.earned.some((pin) => pin.id.startsWith("hours-")), false);
    assert.equal(result.earned.some((pin) => pin.id.startsWith("gift-")), false);
  });

  it("awards ranked at 2000 and keeps only the highest hour mark", () => {
    const result = resolveBadges(source({ id: "koba_nora", score: 2144, business: false, officer: false, groupMembers: 3, hours: 1000 }));
    assert.ok(result.earned.some((pin) => pin.id === "ranked"));
    const hours = result.earned.filter((pin) => pin.icon === "clock");
    assert.equal(hours.length, 1);
    assert.equal(hours[0]?.name, "Iron");
  });

  it("marks ladder roles permanent and status roles temporary", () => {
    const result = resolveBadges(source({}));
    const hourRole = result.earned.find((pin) => pin.icon === "clock");
    assert.equal(hourRole?.permanent, true);
    const ranked = resolveBadges(source({ score: 2100 })).earned.find((pin) => pin.id === "ranked");
    assert.equal(ranked?.permanent, false);
  });

  it("only shows an icon on gold/violet/magenta tier roles", () => {
    const result = resolveBadges(source({}));
    for (const pin of result.earned) {
      if (pin.color === "gold" || pin.color === "violet" || pin.color === "magenta") {
        assert.equal(pin.showIcon, true, `${pin.name} (${pin.color}) should show an icon`);
      } else {
        assert.equal(pin.showIcon, false, `${pin.name} (${pin.color}) should not show an icon`);
      }
    }
  });
});

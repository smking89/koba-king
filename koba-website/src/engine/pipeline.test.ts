import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareCandidate, preparePlayer, shrinkVector } from "./cold-start.ts";
import { runPulse } from "./pipeline.ts";
import { DEFAULT_WEIGHTS } from "./types.ts";
import type { PulseInput } from "./types.ts";
import { CANDIDATES, PLAYERS } from "./world.fixtures.ts";

function base(partial: Partial<PulseInput> = {}): PulseInput {
  return {
    viewerId: "mara",
    query: "",
    weights: DEFAULT_WEIGHTS,
    boosts: {},
    overrides: {},
    dismissed: [],
    nowMs: 1_000,
    skipShadow: true,
    corpus: { players: PLAYERS, candidates: CANDIDATES },
    ...partial,
  };
}

function ids(viewerId: string, query = "") {
  const result = runPulse(base({ viewerId, query }));
  return result.feed.map((f) => f.candidate.id);
}

describe("KOBA pulse", () => {
  it("is deterministic", () => {
    const a = runPulse(base());
    const b = runPulse(base());
    assert.deepEqual(
      a.feed.map((f) => f.candidate.id),
      b.feed.map((f) => f.candidate.id),
    );
  });

  it("keeps Mara near Harbor and off the fraud listing", () => {
    const result = runPulse(base());
    const top = result.feed.slice(0, 5).map((f) => f.candidate.id);
    assert.ok(top.includes("srv-iron-rust"), `expected Harbor in ${top.join(", ")}`);
    assert.equal(
      result.feed.some((f) => f.candidate.id === "srv-ghost-rust"),
      false,
    );
    const ghost = result.dropped.find((d) => d.candidate.id === "srv-ghost-rust");
    assert.ok(ghost, "ghost server should reach the gate and be dropped");
    assert.ok(ghost.counterfactualRank <= 12, `ghost rank ${ghost.counterfactualRank}`);
  });

  it("holds sandbox creatives out of the ranked feed", () => {
    const result = runPulse(base());
    assert.equal(
      result.feed.some((f) => f.visibility !== "allow"),
      false,
    );
    assert.ok(result.held.some((h) => h.candidate.id === "camp-night"));
  });

  it("changes the feed with the player", () => {
    const vex = ids("vex").slice(0, 5);
    const mara = ids("mara").slice(0, 5);
    assert.ok(
      vex.some((id) => id.includes("val")),
      `vex top ${vex.join(", ")}`,
    );
    assert.equal(
      mara.some((id) => id.includes("val")),
      false,
    );
    const nora = runPulse(base({ viewerId: "nora" })).feed.slice(0, 3);
    assert.ok(
      nora.some((f) => f.candidate.gameId === "cs2"),
      nora.map((f) => f.candidate.id).join(", "),
    );
    const pike = ids("pike").slice(0, 5);
    assert.ok(
      pike.some((id) => id.includes("ark") || id.includes("pal")),
      pike.join(", "),
    );
  });

  it("treats a query as a filter, not a nudge", () => {
    const result = runPulse(base({ query: "palworld" }));
    assert.ok(result.feed[0]?.candidate.id === "srv-pal-na", result.feed.map((f) => f.candidate.id).join(", "));
    assert.equal(
      result.feed.some((f) => f.candidate.id === "srv-iron-rust"),
      false,
    );
  });

  it("scales exposure without reordering clicks", () => {
    const one = runPulse(
      base({
        boosts: { "srv-conan-eu": 50_000 },
      }),
    );
    const row = one.scored.find((s) => s.candidate.id === "srv-conan-eu");
    assert.ok(row);
    assert.equal(row.boostMultiplier, 3);
    assert.ok(Math.abs(row.distributionScore - row.clickScore * 3) < 1e-9);
    const organic = one.feed.filter((item) => item.placed !== "native-slot");
    for (let i = 1; i < organic.length; i++) {
      assert.ok(organic[i - 1]!.clickScore >= organic[i]!.clickScore - 1e-9);
    }
    assert.notEqual(one.feed[0]?.candidate.id, "srv-conan-eu");

    const plain = runPulse(base());
    const many = runPulse(
      base({
        boosts: {
          "srv-tf2-na": 50_000,
          "srv-7d-na": 50_000,
          "srv-lol-eu": 50_000,
          "list-skin": 50_000,
        },
      }),
    );
    const plainIds = new Set(plain.feed.map((item) => item.candidate.id));
    const admitted = many.feed.filter((item) => item.boostMultiplier > 1 && !plainIds.has(item.candidate.id));
    assert.ok(admitted.length <= 2);
  });

  it("lets a staff drop remove a server without rescoring the rest", () => {
    const open = runPulse(base());
    const closed = runPulse(base({ overrides: { "srv-iron-rust": "drop" } }));
    assert.equal(
      closed.feed.some((f) => f.candidate.id === "srv-iron-rust"),
      false,
    );
    const before = open.scored.find((s) => s.candidate.id === "lfg-harbor")!;
    const after = closed.scored.find((s) => s.candidate.id === "lfg-harbor")!;
    assert.equal(before.heavyScore, after.heavyScore);
  });

  it("shrinks thin telemetry toward the prior", () => {
    const extreme = shrinkVector([1, 0, 0, 0, 0, 0], 0);
    assert.equal(extreme.cold, true);
    assert.ok(extreme.vector[0]! < 0.5);
    const trusted = shrinkVector([1, 0, 0, 0, 0, 0], 40);
    assert.equal(trusted.cold, false);
    assert.equal(trusted.vector[0], 1);

    const player = preparePlayer({
      id: "newt",
      name: "Newt",
      handle: "newt",
      region: "NA",
      score: 2400,
      friends: [],
      rivals: [],
      games: { rust: 1 },
      vector: [1, 0, 0, 0, 0, 0],
      astro: false,
      plays: [],
      line: "",
      activityIndex: 0,
    });
    assert.equal(player.coldStart, true);
    assert.ok(player.score < 2400);

    const server = prepareCandidate({
      id: "srv-cold",
      kind: "server",
      title: "Unsampled",
      detail: "",
      meta: "",
      vector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      freshnessMin: 10,
      heat: 0.99,
      verified: false,
      boostEligible: false,
      compliance: "allow",
      complianceNote: "",
      fraudRisk: 0.02,
      anchors: [],
      sampleCount: 0,
    });
    assert.equal(server.coldStart, true);
    assert.ok(server.heat < 0.5);
    assert.ok(server.fraudRisk > 0.3);
  });
});

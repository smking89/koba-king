import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { behaviorSnapshot, collectEvents, isCombatKind, sessionClock } from "./behavior.ts";
import { PLAYERS, PLAYER_MAP } from "./world.fixtures.ts";

const NOW = Date.UTC(2026, 9, 15, 21, 5, 17);

describe("player behavior", () => {
  it("is deterministic for a fixed clock", () => {
    const mara = PLAYER_MAP.mara!;
    const a = behaviorSnapshot(mara, PLAYERS, NOW);
    const b = behaviorSnapshot(mara, PLAYERS, NOW);
    assert.deepEqual(a, b);
    assert.equal(a.series.length, 24);
    assert.equal(a.anchor, false);
  });

  it("hides events until their timestamp", () => {
    const mara = PLAYER_MAP.mara!;
    const events = collectEvents(mara, NOW - 6 * 60 * 60_000, NOW);
    assert.ok(events.length > 8, `expected a tape, got ${events.length}`);
    const sample = events[Math.floor(events.length / 2)]!;
    const before = collectEvents(mara, sample.at - 60_000, sample.at - 1);
    const after = collectEvents(mara, sample.at - 60_000, sample.at);
    assert.equal(before.some((event) => event.id === sample.id), false);
    assert.equal(after.some((event) => event.id === sample.id), true);
    assert.ok(events.every((event, index) => index === 0 || event.at >= events[index - 1]!.at));
  });

  it("gives aggressive players a heavier combat tape", () => {
    const from = NOW - 8 * 60 * 60_000;
    const combat = (id: string) =>
      collectEvents(PLAYER_MAP[id]!, from, NOW).filter((event) => isCombatKind(event.kind)).length;
    const nora = combat("nora");
    const pike = combat("pike");
    assert.ok(nora > pike * 1.4, `nora ${nora} vs pike ${pike}`);
  });

  it("covers every player without throwing", () => {
    for (const player of PLAYERS) {
      const snap = behaviorSnapshot(player, PLAYERS, NOW);
      const clock = sessionClock(player, NOW);
      assert.equal(snap.online, clock.online);
      assert.equal(snap.baseline.length, 6);
      assert.ok(snap.perMinute >= 0);
      if (!clock.online) assert.ok(snap.returnInMs > 0);
    }
  });

  it("keeps the last session on screen during a break", () => {
    const mara = PLAYER_MAP.mara!;
    let checked = 0;
    for (let step = 0; step < 240 && checked < 4; step++) {
      const t = NOW + step * 60_000;
      if (sessionClock(mara, t).online) continue;
      const snap = behaviorSnapshot(mara, PLAYERS, t);
      const rows = snap.series.reduce((total, point) => total + point.combat + point.world, 0);
      assert.ok(rows > 0, `empty break window at step ${step}`);
      assert.equal(snap.series[snap.series.length - 1]?.label, "end");
      checked += 1;
    }
    assert.ok(checked >= 4);
  });

  it("flags the ghost server tape", () => {
    const snap = behaviorSnapshot(PLAYER_MAP.sibley!, PLAYERS, NOW);
    assert.equal(snap.integrity, "mismatch");
    assert.equal(behaviorSnapshot(PLAYER_MAP.mara!, PLAYERS, 0).anchor, true);
  });
});

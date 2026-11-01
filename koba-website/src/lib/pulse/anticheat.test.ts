import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideFlag } from "./anticheat.server.ts";

// Unit tests on the pure decision function only - recordResultAndCheck's
// database I/O (src/lib/db.ts's PGLite path) depends on Vite's
// import.meta.glob to load migrations/*.sql, which isn't available under
// plain `node --test`. None of this project's other db.ts-dependent code is
// tested this way either (checked before adding this file) - that's why the
// actual judgment call lives in a separate, pure, directly-testable
// function. The SQL I/O around it is straightforward insert/select and was
// verified by hand and against the real PGLite-backed dev server instead.

describe("decideFlag", () => {
  it("never flags below the minimum baseline sample size, however extreme the value", () => {
    const result = decideFlag(500, 10, 1, 4); // sampleSize 4 < MIN_BASELINE_SAMPLES
    assert.equal(result.flagged, false);
    assert.equal(result.zScore, null);
  });

  it("never flags when stddev is null (no baseline)", () => {
    const result = decideFlag(500, null, null, 0);
    assert.equal(result.flagged, false);
    assert.equal(result.zScore, null);
  });

  it("never flags against a zero/near-zero stddev baseline (avoids divide-by-near-zero blowups)", () => {
    const result = decideFlag(500, 10, 0, 10);
    assert.equal(result.flagged, false);
    assert.equal(result.zScore, null);
  });

  it("does not flag ordinary variance within the baseline", () => {
    // mean=10, stddev=1, value=12 -> z=2, under the 3.5 threshold
    const result = decideFlag(12, 10, 1, 10);
    assert.equal(result.flagged, false);
    assert.equal(result.zScore, 2);
  });

  it("flags a genuine statistical outlier against an established baseline", () => {
    // mean=10, stddev=1, value=500 -> z=490, way past threshold
    const result = decideFlag(500, 10, 1, 10);
    assert.equal(result.flagged, true);
    assert.equal(result.zScore, 490);
  });

  it("flags symmetrically for an extreme negative outlier too", () => {
    const result = decideFlag(-480, 10, 1, 10);
    assert.equal(result.flagged, true);
    assert.equal(result.zScore, -490);
  });

  it("sits right at the threshold boundary correctly (exclusive)", () => {
    // mean=0, stddev=1, value=3.5 -> z=3.5, threshold is "> 3.5", so this must NOT flag
    const atThreshold = decideFlag(3.5, 0, 1, 10);
    assert.equal(atThreshold.flagged, false);
    // just past it must flag
    const justPast = decideFlag(3.50001, 0, 1, 10);
    assert.equal(justPast.flagged, true);
  });
});

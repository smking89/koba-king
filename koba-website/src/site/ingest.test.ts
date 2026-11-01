import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectPayload, mintToken, noteRate, RATE_LIMIT, readToken, SAMPLE_EVENT } from "./ingest.ts";

const SECRET = "test-secret";
const NOW = 1_792_120_740_000;

describe("ingest gates", () => {
  it("accepts the documented combat payload", () => {
    const result = inspectPayload(JSON.stringify(SAMPLE_EVENT), SAMPLE_EVENT.integration_metadata.payload_timestamp_utc);
    assert.equal(result.gates.every((gate) => gate.pass), true);
    assert.equal(result.event?.data_payload.weapon_used, "AK47_RIFLE");
  });

  it("stops a script stuffed into a weapon before it is stored", () => {
    const forged = structuredClone(SAMPLE_EVENT);
    forged.data_payload.weapon_used = "<script>alert(1)</script>";
    const result = inspectPayload(JSON.stringify(forged), SAMPLE_EVENT.integration_metadata.payload_timestamp_utc);
    const gate = result.gates.find((item) => item.id === "forgery");
    assert.equal(gate?.pass, false);
    assert.equal(result.event, null);
  });

  it("drops the seventh call inside the same 10 seconds", () => {
    let hits: number[] = [];
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      const next = noteRate(hits, 1_000 + i);
      assert.equal(next.allowed, true);
      hits = next.hits;
    }
    assert.equal(noteRate(hits, 1_500).allowed, false);
    assert.equal(noteRate(hits, 1_000 + 11_000).allowed, true);
  });

  it("verifies a token from its signature alone and rejects a tamper or an expiry", async () => {
    const minted = await mintToken("koba_nix", NOW, SECRET);
    const read = await readToken(minted.token, NOW + 1_000, SECRET);
    assert.equal(read.ok, true);
    const tampered = `${minted.token.slice(0, -2)}aa`;
    const broken = await readToken(tampered, NOW + 1_000, SECRET);
    assert.equal(broken.ok, false);
    const expired = await readToken(minted.token, NOW + 16 * 60 * 1000, SECRET);
    assert.equal(expired.ok, false);
  });
});

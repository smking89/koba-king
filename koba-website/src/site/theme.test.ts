import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paletteLuminance } from "./theme.ts";

describe("palette luminance", () => {
  it("reads the white canvas as light", () => {
    assert.equal(paletteLuminance("#ffffff"), 1);
    assert.equal(paletteLuminance("#fff"), 1);
  });

  it("reads the black canvas as dark", () => {
    assert.equal(paletteLuminance("#000000"), 0);
  });

  it("accepts the rgb() form a browser returns", () => {
    assert.ok((paletteLuminance("rgb(255, 255, 255)") ?? 0) > 0.9);
    assert.ok((paletteLuminance("rgb(0, 0, 0)") ?? 1) < 0.1);
  });

  it("treats a near-white wash as light", () => {
    assert.ok((paletteLuminance("#fafafa") ?? 0) > 0.6);
  });

  it("gives up on values it cannot read", () => {
    assert.equal(paletteLuminance(""), null);
    assert.equal(paletteLuminance("var(--color-bg)"), null);
    assert.equal(paletteLuminance("rgb(nope)"), null);
  });
});

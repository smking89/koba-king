import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditUploads, specFor, themeError, type MeasuredFile } from "./astro.ts";

function file(partial: Partial<MeasuredFile> & Pick<MeasuredFile, "name">): MeasuredFile {
  return {
    bytes: 20_000,
    width: null,
    height: null,
    seconds: null,
    type: "image/png",
    ...partial,
  };
}

describe("cosmetic upload bounds", () => {
  it("rejects an avatar frame under the minimum pixels", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "small.png", width: 128, height: 128, bytes: 8000 })]);
    assert.match(issue ?? "", /Minimum is 256 px square/);
  });

  it("rejects an avatar frame over the maximum pixels", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "big.png", width: 400, height: 400, bytes: 80_000 })]);
    assert.match(issue ?? "", /Maximum is 288 px square/);
  });

  it("rejects a file under the minimum bytes", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "flat.png", width: 256, height: 256, bytes: 400 })]);
    assert.match(issue ?? "", /Minimum is 2 KB/);
  });

  it("rejects a file over the maximum bytes", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "heavy.png", width: 280, height: 280, bytes: 2_000_000 })]);
    assert.match(issue ?? "", /Maximum is 1 MB/);
  });

  it("accepts a square frame inside the range", () => {
    assert.equal(auditUploads(specFor("avatar-frame"), [file({ name: "wake.png", width: 280, height: 280, bytes: 48_000 })]), null);
  });

  it("rejects a frame that is not square", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "wide.png", width: 280, height: 260, bytes: 48_000 })]);
    assert.match(issue ?? "", /square/);
  });

  it("rejects the wrong format", () => {
    const issue = auditUploads(specFor("avatar-frame"), [file({ name: "wake.jpg", type: "image/jpeg", width: 280, height: 280 })]);
    assert.match(issue ?? "", /PNG or GIF/);
  });

  it("requires 4 to 8 stickers", () => {
    const sticker = file({ name: "mark.png", width: 320, height: 320, bytes: 12_000 });
    assert.match(auditUploads(specFor("sticker-pack"), [sticker, sticker, sticker]) ?? "", /4 to 8/);
    assert.equal(auditUploads(specFor("sticker-pack"), [sticker, sticker, sticker, sticker]), null);
    assert.match(auditUploads(specFor("sticker-pack"), Array.from({ length: 9 }, () => sticker)) ?? "", /4 to 8/);
  });

  it("rejects a banner with the wrong shape", () => {
    const issue = auditUploads(specFor("profile-banner"), [file({ name: "tall.png", type: "image/png", width: 680, height: 400, bytes: 40_000 })]);
    assert.match(issue ?? "", /same shape/);
  });

  it("checks both server-look files", () => {
    const avatar = file({ name: "face.png", width: 512, height: 512, bytes: 20_000 });
    const banner = file({ name: "wide.png", type: "image/png", width: 680, height: 240, bytes: 20_000 });
    assert.match(auditUploads(specFor("server-look"), [avatar]) ?? "", /2 files/);
    assert.equal(auditUploads(specFor("server-look"), [avatar, banner]), null);
  });

  it("rejects a short entrance sound and accepts one in range", () => {
    const sound = specFor("entrance-sound");
    assert.match(
      auditUploads(sound, [file({ name: "blip.mp3", type: "audio/mpeg", bytes: 8000, seconds: 0.2 })]) ?? "",
      /Minimum is 0.5 s/,
    );
    assert.equal(auditUploads(sound, [file({ name: "sting.mp3", type: "audio/mpeg", bytes: 20_000, seconds: 1.8 })]), null);
  });

  it("themes need two hex colors and no file", () => {
    const theme = specFor("profile-theme");
    assert.match(themeError(theme, "green wash") ?? "", /two hex colors/);
    assert.equal(themeError(theme, "Left #7CFF4F and right #101614."), null);
    assert.equal(auditUploads(theme, []), null);
  });
});

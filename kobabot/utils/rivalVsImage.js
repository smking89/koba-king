"use strict";

/**
 * Renders the Rival "VS" matchup card as a real animated GIF (not a static
 * frame) - a blue/red diagonal split-screen with each side's watermark
 * (the real KOBA Bot logo, assets/brand/icon-mark.png) scrolling in
 * OPPOSITE directions, a pulsing center "VS", and a moving shine sweeping
 * along the diagonal separator line. Same rendering stack as
 * utils/lootboxImage.js (@napi-rs/canvas + gif-encoder-2) and same "pure
 * renderer, caller resolves live Discord/DB data first" separation as
 * utils/leaderboardImage.js - this module never touches the Discord API or
 * the database itself.
 *
 * Three fonts, each doing one job (per explicit request - do not collapse
 * these into one font):
 *  - Talina (assets/fonts/Talina.otf) - the "VS" centerpiece only.
 *  - Milker (assets/fonts/Milker.otf) - the vertical "RIVALS" edge labels only.
 *  - bold sans-serif (system font, no file needed) - all player stats
 *    (username/level/rank/streak/clan/points) - deliberately the "regular,
 *    easier to read" font, not a display font, since these are the actual
 *    data the card exists to communicate.
 * Each font registration is best-effort - a missing/unreadable font file
 * falls back to sans-serif rather than crashing the render (same defensive
 * pattern as leaderboardImage.js's logo load below).
 */

const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");

function registerFont(file, family) {
  try {
    return GlobalFonts.registerFromPath(path.join(__dirname, "..", "assets", "fonts", file), family) ? family : "sans-serif";
  } catch {
    return "sans-serif";
  }
}
const VS_FONT = registerFont("Talina.otf", "Talina");
const RIVALS_FONT = registerFont("Milker.otf", "Milker");
const STATS_FONT = "sans-serif"; // deliberately plain/legible - see header

const WIDTH = 760;
const HEIGHT = 1000;
const FRAME_COUNT = 30;
const FRAME_DELAY_MS = 60;

const COLORS = {
  blue: "#1231e0",
  red: "#e0121f",
  white: "#ffffff",
  ink: "#0a0a0a",
};

/**
 * @napi-rs/canvas's fillText/measureText throw a native "Convert String to
 * CString failed" error (not a normal JS TypeError) on a non-string value
 * or a string with embedded NULs/unpaired UTF-16 surrogates - same fix as
 * utils/leaderboardImage.js's sanitizeText, reused here for the same
 * reason (real Discord usernames/clan tags hit this in practice).
 */
function sanitizeText(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/\0/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** The diagonal split line, expressed as two points - blue occupies the upper-left side, red the lower-right, matching the reference layout. */
const SPLIT = { x1: 0, y1: HEIGHT * 0.62, x2: WIDTH, y2: HEIGHT * 0.38 };

function sideClipPath(ctx, side) {
  ctx.beginPath();
  if (side === "blue") {
    ctx.moveTo(0, 0);
    ctx.lineTo(WIDTH, 0);
    ctx.lineTo(SPLIT.x2, SPLIT.y2);
    ctx.lineTo(SPLIT.x1, SPLIT.y1);
    ctx.closePath();
  } else {
    ctx.moveTo(SPLIT.x1, SPLIT.y1);
    ctx.lineTo(SPLIT.x2, SPLIT.y2);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
  }
}

let logoImagePromise = null;
function loadLogo() {
  if (!logoImagePromise) logoImagePromise = loadImage(path.join(__dirname, "..", "assets", "brand", "icon-mark.png")).catch(() => null);
  return logoImagePromise;
}

/** The real KOBA Bot logo (assets/brand/icon-mark.png), tiled in a diagonal grid and offset by `scroll` so the whole field visibly slides across frames - `tint` recolors it (via a "source-atop" composite) so it reads as a subtle watermark rather than a loud repeated logo, matching the reference's low-opacity pattern. */
function drawWatermarkField(ctx, side, logo, tint, scroll) {
  if (!logo) return; // missing/unreadable asset - skip the watermark rather than crash the whole render
  const tile = 130;
  ctx.save();
  sideClipPath(ctx, side);
  ctx.clip();
  const offset = ((scroll % tile) + tile) % tile;
  const logoW = tile * 0.62;
  const logoH = logoW * (logo.height / logo.width);
  ctx.globalAlpha = 0.16;
  for (let row = -1; row * tile - offset < HEIGHT + tile; row++) {
    for (let col = -1; col * tile < WIDTH + tile * 2; col++) {
      const x = col * tile + (row % 2 ? tile / 2 : 0);
      const y = row * tile + offset;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35);
      ctx.drawImage(logo, -logoW / 2, -logoH / 2, logoW, logoH);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  // Tint overlay, clipped to the same side - keeps the watermark visually
  // consistent with that side's color instead of showing the logo's own
  // green/black artwork at full saturation.
  ctx.fillStyle = tint;
  ctx.globalCompositeOperation = "color";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/** Vertical "RIVALS" text running down each edge, in the Milker font (per explicit request - kept separate from the VS font and the stats font). */
function drawEdgeLabel(ctx, side) {
  ctx.save();
  if (side === "blue") {
    ctx.translate(52, HEIGHT * 0.55);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
  } else {
    ctx.translate(WIDTH - 52, HEIGHT * 0.45);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
  }
  ctx.font = `64px "${RIVALS_FONT}"`;
  ctx.textAlign = "center";
  ctx.fillText("RIVALS", 0, 0);
  ctx.restore();
}

function strokedText(ctx, text, x, y, { size, fill, font = STATS_FONT, bold = true, strokeStyle = COLORS.ink, strokeWidth = 6, align = "left" }) {
  ctx.font = `${bold ? "bold " : ""}${size}px "${font}"`;
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.strokeText(sanitizeText(text), x, y);
  ctx.fillStyle = fill;
  ctx.fillText(sanitizeText(text), x, y);
}

/**
 * @param {object} player - { username, clanName, level, rank, streak, pointsBonus }
 */
function drawPlayerBlock(ctx, side, player, baseY) {
  const isBlue = side === "blue";
  const anchorX = isBlue ? 90 : WIDTH - 90;
  const textAlign = isBlue ? "left" : "right";
  // "LEVEL" always reads first (leftmost), "RANK" second (rightmost), on
  // BOTH sides - for the right-aligned red side that means shifting LEVEL
  // left instead of shifting RANK, so the reading order stays consistent
  // rather than mirroring (which read backwards: "RANK #18  LEVEL 31").
  const levelX = isBlue ? anchorX : anchorX - 220;
  const rankX = isBlue ? anchorX + 220 : anchorX;

  strokedText(ctx, `@${player.username}`, anchorX, baseY, { size: 40, fill: COLORS.white, align: textAlign });
  strokedText(ctx, `LEVEL ${player.level}`, levelX, baseY + 52, { size: 32, fill: "#ffe066", align: textAlign });
  strokedText(ctx, `RANK #${player.rank}`, rankX, baseY + 52, { size: 32, fill: "#7CFC9A", align: textAlign });
  if (player.clanName) {
    strokedText(ctx, player.clanName.toUpperCase(), anchorX, baseY + 92, { size: 24, fill: "#c9d6ff", align: textAlign, strokeWidth: 4, bold: false });
  }

  if (player.streak > 0) {
    strokedText(ctx, `${player.streak} WIN STREAK`, anchorX, baseY + 144, { size: 28, fill: "#ffb347", align: textAlign });
  }
  if (player.pointsBonus) {
    ctx.save();
    ctx.translate(anchorX + (isBlue ? 260 : -260), baseY + 195);
    ctx.rotate(isBlue ? -0.18 : 0.18);
    strokedText(ctx, `+${player.pointsBonus}`, 0, 0, { size: 32, fill: "#7CFC9A", align: "center" });
    ctx.restore();
  }
}

function drawVs(ctx, scale, shineOffset) {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // Moving shine highlight along the separator line.
  const gradLen = 260;
  const t = ((shineOffset % 1) + 1) % 1;
  const grad = ctx.createLinearGradient(SPLIT.x1 - gradLen + t * (WIDTH + gradLen * 2), SPLIT.y1, SPLIT.x1 - gradLen + t * (WIDTH + gradLen * 2) + gradLen, SPLIT.y2);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.save();
  ctx.lineWidth = 10;
  ctx.strokeStyle = COLORS.white;
  ctx.beginPath();
  ctx.moveTo(SPLIT.x1, SPLIT.y1);
  ctx.lineTo(SPLIT.x2, SPLIT.y2);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = grad;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  strokedText(ctx, "VS", 0, 24, { size: 140, fill: COLORS.white, font: VS_FONT, bold: false, align: "center", strokeWidth: 10 });
  ctx.restore();
}

/**
 * @param {object} options
 * @param {object} options.playerA - blue side, { username, clanName, level, rank, streak, pointsBonus }
 * @param {object} options.playerB - red side, same shape
 * @returns {Promise<Buffer>} animated GIF bytes
 */
async function renderRivalVsGif({ playerA, playerB }) {
  const logo = await loadLogo();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  encoder.start();
  encoder.setRepeat(0); // loop forever - this is an ambient card image, not a one-shot spin animation
  encoder.setQuality(10);
  encoder.setDelay(FRAME_DELAY_MS);

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const t = frame / FRAME_COUNT; // 0..1 across the loop

    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = COLORS.red;
    ctx.save();
    sideClipPath(ctx, "red");
    ctx.clip();
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    // Opposite-direction scroll - blue's watermark field drifts up-left, red's drifts down-right.
    drawWatermarkField(ctx, "blue", logo, COLORS.blue, -t * 130);
    drawWatermarkField(ctx, "red", logo, COLORS.red, t * 130);

    drawEdgeLabel(ctx, "blue");
    drawEdgeLabel(ctx, "red");

    drawPlayerBlock(ctx, "blue", playerA, HEIGHT * 0.22);
    drawPlayerBlock(ctx, "red", playerB, HEIGHT * 0.72);

    // VS pulses gently; the separator's shine sweeps continuously across the same loop.
    const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06;
    drawVs(ctx, pulse, t);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `12px monospace`;
    ctx.textAlign = "left";
    const copyright = `© ${new Date().getFullYear()} KOBA GAMES  All rights reserved.`;
    ctx.fillText(copyright, 20, HEIGHT - 16);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = { renderRivalVsGif };

"use strict";

/**
 * Renders the "spin strip" for /lootbox open as a real animated GIF (not a
 * single static frame) - a horizontal reel of LOCAL box-art icons (assets/
 * lootboxes/*.png) that visually scrolls left and decelerates into landing
 * under a center pointer, like a real slot machine. The actual reward is
 * deliberately never shown here - a win just lands on the player's own
 * opened box (still a mystery, revealed later via the Open button in
 * utils/lootboxPanel.js), a loss lands on the guild's designated loss box.
 * Local files only (no remote fetches) - fast and avoids depending on
 * external image hosts being reachable at spin time.
 *
 * The reel is built from repeated shuffled full sets of every box type
 * (never plain random-with-replacement per cell), so every 8-cell block
 * shows each type exactly once - no duplicate box art repeating right next
 * to itself the way a naive per-cell random pick would produce.
 */

const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");
const { LOOTBOX_TYPES } = require("../config/lootboxes");

const COLORS = {
  bg: "#07070d",
  panel: "#0d0d18",
  panelRaised: "#12121e",
  line: "#22223a",
  ink: "#eef0f8",
  inkDim: "#8b8fa8",
  brand: "#9b59b6",
  win: "#93ff1d",
  lose: "#ff3b5c",
  gold: "#ffd76a",
};

const CELL_SIZE = 140;
const CELL_GAP = 12;
const VIEWPORT_CELLS = 7; // odd so there's a true center cell under the pointer
const CENTER_INDEX = Math.floor(VIEWPORT_CELLS / 2);
const REEL_BLOCKS = 4; // 4 shuffled full sets of every box type = a long enough scroll to feel like a real spin
const HEADER_HEIGHT = 70;
const FOOTER_HEIGHT = 44;
const PADDING = 20;
const WIDTH = VIEWPORT_CELLS * CELL_SIZE + (VIEWPORT_CELLS - 1) * CELL_GAP + PADDING * 2;
const HEIGHT = HEADER_HEIGHT + CELL_SIZE + FOOTER_HEIGHT + PADDING * 2;
const FRAME_COUNT = 22;
const HOLD_FRAMES = 6; // extra copies of the final landed frame so it's actually readable, not just a flash

const ICON_CACHE = new Map();
async function loadBoxIcon(boxKey) {
  if (ICON_CACHE.has(boxKey)) return ICON_CACHE.get(boxKey);
  const box = LOOTBOX_TYPES.find((b) => b.key === boxKey);
  const image = box ? await loadImage(path.join(__dirname, "..", "assets", "lootboxes", box.file)).catch(() => null) : null;
  ICON_CACHE.set(boxKey, image);
  return image;
}

/** Fisher-Yates shuffle - used to build each one-of-each block of the reel. */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds the full reel of box keys - REEL_BLOCKS shuffled one-of-each
 * blocks, with the landing outcome guaranteed at a FIXED index that's
 * CENTER_INDEX cells before the very end (not the literal last cell) - that
 * leaves CENTER_INDEX worth of real, already-shuffled box art sitting past
 * the landing position, so when the final frame centers the landing cell
 * under the pointer, the viewport's right half still shows real cells
 * instead of empty space (the reel simply ending exactly where it landed
 * was the bug - nothing existed past that point to draw). The last block
 * already contains landingKey somewhere (it's shuffled from the same full
 * set as every other block) - SWAP it into position rather than
 * overwriting, so that block still shows every type exactly once instead
 * of landingKey appearing twice (once where the shuffle put it, once
 * forced at the target index).
 * @returns {{ reel: string[], landingIndex: number }}
 */
function buildReel(landingKey) {
  const allKeys = LOOTBOX_TYPES.map((b) => b.key);
  const reel = [];
  for (let i = 0; i < REEL_BLOCKS; i++) reel.push(...shuffle(allKeys));
  const lastBlockStart = reel.length - allKeys.length;
  const foundIndex = reel.indexOf(landingKey, lastBlockStart);
  const landingIndex = reel.length - 1 - CENTER_INDEX;
  [reel[foundIndex], reel[landingIndex]] = [reel[landingIndex], reel[foundIndex]];
  return { reel, landingIndex };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx, x, y, image, isLanding) {
  roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 10);
  ctx.fillStyle = isLanding ? COLORS.panelRaised : COLORS.panel;
  ctx.fill();
  if (isLanding) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.gold;
    roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 10);
    ctx.stroke();
  }

  if (image) {
    const boxSize = CELL_SIZE - 20;
    const scale = Math.min(boxSize / image.width, boxSize / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, x + (CELL_SIZE - w) / 2, y + (CELL_SIZE - h) / 2, w, h);
  }
}

/** ease-out cubic - fast at the start, smoothly decelerating into the landing position, like a real reel slowing down. */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawFrame(ctx, { openedBox, reel, landingIndex, images, offsetPx, isWin, isFinal }) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = COLORS.ink;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(openedBox?.label || "", PADDING, PADDING + 30);
  ctx.fillStyle = COLORS.brand;
  ctx.font = "13px sans-serif";
  ctx.fillText(isFinal ? "LANDED!" : "ROLLING...", PADDING, PADDING + 50);

  const stripY = HEADER_HEIGHT + PADDING;

  // Clip the reel to the viewport - cells scroll underneath via offsetPx, only the visible window is ever drawn.
  ctx.save();
  roundRect(ctx, PADDING, stripY, WIDTH - PADDING * 2, CELL_SIZE, 4);
  ctx.clip();
  const firstVisible = Math.floor(offsetPx / (CELL_SIZE + CELL_GAP)) - 1;
  for (let i = Math.max(0, firstVisible); i < reel.length; i++) {
    const x = PADDING + i * (CELL_SIZE + CELL_GAP) - offsetPx;
    if (x > WIDTH) break;
    if (x < PADDING - CELL_SIZE) continue;
    drawCell(ctx, x, stripY, images[i], i === landingIndex);
  }
  ctx.restore();

  // Center pointer
  const pointerX = PADDING + CENTER_INDEX * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.moveTo(pointerX - 8, stripY - 10);
  ctx.lineTo(pointerX + 8, stripY - 10);
  ctx.lineTo(pointerX, stripY - 1);
  ctx.closePath();
  ctx.fill();

  // Footer bar
  const footerY = HEIGHT - FOOTER_HEIGHT;
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(PADDING, footerY);
  ctx.lineTo(WIDTH - PADDING, footerY);
  ctx.stroke();

  // Only the landed frame (+ its held repeats) reveals win/lose - every
  // earlier "ROLLING..." frame stays neutral, otherwise the outcome flashes
  // in the footer from frame 1, spoiling it before the reel visually lands.
  ctx.fillStyle = isFinal ? (isWin ? COLORS.win : COLORS.lose) : COLORS.inkDim;
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(
    isFinal ? (isWin ? "🎉 You won something! Press Open to reveal it." : "💔 No luck this time.") : "Spinning...",
    PADDING,
    footerY + 26
  );

  const copyright = `© ${new Date().getFullYear()} KOBA GAMES  All rights reserved.`;
  ctx.fillStyle = COLORS.inkDim;
  ctx.font = "11px monospace";
  const copyrightWidth = ctx.measureText(copyright).width;
  ctx.fillText(copyright, WIDTH - PADDING - copyrightWidth, footerY + 26);
}

/**
 * @param {{ openedBoxKey: string, isWin: boolean, lossBoxKey?: string }} options
 * @returns {Promise<Buffer>} animated GIF bytes
 */
async function renderBoxSpin({ openedBoxKey, isWin, lossBoxKey }) {
  const openedBox = LOOTBOX_TYPES.find((b) => b.key === openedBoxKey);
  const landingKey = isWin ? openedBoxKey : lossBoxKey || openedBoxKey;

  const { reel, landingIndex } = buildReel(landingKey);
  const images = await Promise.all(reel.map(loadBoxIcon));

  // Final scroll offset lands the landing cell exactly under the center
  // pointer - landingIndex is CENTER_INDEX cells before the reel's actual
  // end, so the viewport's right half still has real cells to show once
  // it lands (see buildReel's header for why this isn't just reel.length-1).
  const finalOffsetPx = (landingIndex - CENTER_INDEX) * (CELL_SIZE + CELL_GAP);
  const startOffsetPx = 0;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  encoder.start();
  encoder.setRepeat(-1); // play once, hold on the last frame (no looping back to the start)
  encoder.setQuality(10);

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const t = easeOutCubic(frame / (FRAME_COUNT - 1));
    const offsetPx = startOffsetPx + (finalOffsetPx - startOffsetPx) * t;
    const isFinal = frame === FRAME_COUNT - 1;
    drawFrame(ctx, { openedBox, reel, landingIndex, images, offsetPx, isWin, isFinal });
    // Delay ramps up as the reel decelerates - fast flicker at the start, a clear slow-down into the landing.
    encoder.setDelay(30 + Math.round(t * 90));
    encoder.addFrame(ctx);
  }

  // Hold the landed frame for a few extra copies so the result is actually readable, not just a one-frame flash.
  drawFrame(ctx, { openedBox, reel, landingIndex, images, offsetPx: finalOffsetPx, isWin, isFinal: true });
  for (let i = 0; i < HOLD_FRAMES; i++) {
    encoder.setDelay(1200);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = { renderBoxSpin };

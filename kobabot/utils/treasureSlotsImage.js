"use strict";

/**
 * Renders the Treasure Slots result as a single static image (not an
 * animated GIF, unlike utils/lootboxImage.js's spin reel) - a deliberate
 * scope choice: this game resolves in one interaction with no "open to
 * reveal" follow-up step, so there's no suspense beat worth animating for.
 * Three real symbol icons (assets/icons/treasure-slots/*.png, cropped from
 * the purchased Raven Fantasy Icons set) on a card-style panel, with the
 * Gold chest-open art as a jackpot flourish only on a 3x Jackpot hit.
 */

const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const ASSET_DIR = path.join(__dirname, "..", "assets", "icons", "treasure-slots");

const COLORS = {
  bg: "#07070d",
  panel: "#13101d",
  slot: "#1c1830",
  line: "#2e2850",
  ink: "#f3eefc",
  inkDim: "#9b93b8",
  win: "#ffd76a",
  lose: "#8b8fa8",
};

const REEL_SIZE = 160;
const REEL_GAP = 18;
const PADDING = 26;
const HEADER_HEIGHT = 60;
const FOOTER_HEIGHT = 56;
const WIDTH = REEL_SIZE * 3 + REEL_GAP * 2 + PADDING * 2;
const HEIGHT = HEADER_HEIGHT + REEL_SIZE + FOOTER_HEIGHT + PADDING * 2;

const ICON_CACHE = new Map();
async function loadSymbolIcon(file) {
  if (ICON_CACHE.has(file)) return ICON_CACHE.get(file);
  const image = await loadImage(path.join(ASSET_DIR, file)).catch(() => null);
  ICON_CACHE.set(file, image);
  return image;
}

let jackpotChestImage = null;
async function loadJackpotChest() {
  if (jackpotChestImage !== null) return jackpotChestImage;
  jackpotChestImage = await loadImage(path.join(ASSET_DIR, "jackpot-chest-open.png")).catch(() => null);
  return jackpotChestImage;
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

/**
 * @param {{ reels: Array<{icon: string}>, multiplier: number, isJackpot: boolean }} params
 * @returns {Promise<Buffer>} a PNG buffer, ready for discord.js's AttachmentBuilder
 */
async function renderSlotResult({ reels, multiplier, isJackpot }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = COLORS.ink;
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🎰 Treasure Slots", WIDTH / 2, PADDING + 36);

  // Jackpot backdrop flourish - only on a true 3x Jackpot, never on a plain win.
  if (isJackpot) {
    const chest = await loadJackpotChest();
    if (chest) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      const bw = WIDTH - PADDING * 2;
      const bh = REEL_SIZE * 1.3;
      ctx.drawImage(chest, (WIDTH - bw) / 2, HEADER_HEIGHT + (REEL_SIZE - bh) / 2, bw, bh);
      ctx.restore();
    }
  }

  const reelY = HEADER_HEIGHT + PADDING / 2;
  for (let i = 0; i < 3; i++) {
    const x = PADDING + i * (REEL_SIZE + REEL_GAP);
    ctx.fillStyle = COLORS.slot;
    roundRect(ctx, x, reelY, REEL_SIZE, REEL_SIZE, 16);
    ctx.fill();
    ctx.strokeStyle = multiplier > 0 ? COLORS.win : COLORS.line;
    ctx.lineWidth = multiplier > 0 ? 3 : 2;
    roundRect(ctx, x, reelY, REEL_SIZE, REEL_SIZE, 16);
    ctx.stroke();

    const icon = await loadSymbolIcon(reels[i].icon);
    if (icon) {
      const iconSize = REEL_SIZE * 0.7;
      ctx.drawImage(icon, x + (REEL_SIZE - iconSize) / 2, reelY + (REEL_SIZE - iconSize) / 2, iconSize, iconSize);
    }
  }

  const footerY = reelY + REEL_SIZE + PADDING;
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = multiplier > 0 ? COLORS.win : COLORS.lose;
  const resultText = multiplier > 0 ? `${multiplier}x WIN!` : "No match";
  ctx.fillText(resultText, WIDTH / 2, footerY + 20);

  return canvas.toBuffer("image/png");
}

module.exports = { renderSlotResult };

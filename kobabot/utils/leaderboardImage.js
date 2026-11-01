"use strict";

/**
 * Renders a leaderboard as a PNG image (canvas), matching the visual
 * pattern of a live-refreshing leaderboard panel: dark card, ranked rows
 * with gold/silver/bronze accent bars for the top 3, a footer bar with a
 * timestamp and KOBA Bot's copyright + logo. Callers are responsible for
 * resolving `entries` to display names before calling this (keeps this
 * module pure/testable without needing live Discord API access).
 */

const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const COLORS = {
  bg: "#07070d",
  panel: "#0d0d18",
  line: "#22223a",
  ink: "#eef0f8",
  inkDim: "#8b8fa8",
  lime: "#93ff1d",
  teal: "#1afb9d",
  gold: "#ffd76a",
  silver: "#c7cbe0",
  bronze: "#e5a26a",
};

const ROW_HEIGHT = 46;
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 48;
const WIDTH = 620;
const PADDING = 24;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const RANK_ACCENTS = { 1: COLORS.gold, 2: COLORS.silver, 3: COLORS.bronze };

/**
 * @napi-rs/canvas's native fillText/measureText bindings throw "Convert
 * String to CString failed" (not a JS TypeError, so it doesn't self-explain)
 * on two distinct classes of bad input: a non-string value (null/undefined/
 * number slipping through), AND a real string that still can't convert to
 * valid UTF-8 - specifically embedded NUL bytes or unpaired UTF-16
 * surrogates (both turn up in real gamertags/team names often enough:
 * corrupted Unicode from a platform's own input sanitization, a raw control
 * character, etc.). An earlier fix here only handled the first case
 * (String(x ?? fallback)), which is why this kept crashing at the exact
 * same fillText call despite that guard - this replaces it with a sanitizer
 * that also strips the second case.
 */
function sanitizeText(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/\0/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/**
 * @param {{title: string, subtitle?: string, entries: Array<{rank: number, name: string, value: string}>}} options
 * @returns {Promise<Buffer>} PNG bytes
 */
async function renderLeaderboardImage({ title, subtitle, entries }) {
  const rowCount = Math.max(entries.length, 1);
  const height = HEADER_HEIGHT + rowCount * ROW_HEIGHT + FOOTER_HEIGHT + PADDING;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // Outer card
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, WIDTH - 8, height - 8, 14);
  ctx.stroke();

  // Logo (best-effort - a missing/unreadable file shouldn't break the render)
  let logoDrawn = false;
  try {
    const logo = await loadImage(path.join(__dirname, "..", "assets", "brand", "icon-mark.png"));
    const logoSize = 44;
    ctx.drawImage(logo, PADDING, 22, logoSize, (logoSize * logo.height) / logo.width);
    logoDrawn = true;
  } catch {
    // fine - just skip the logo
  }

  const titleX = PADDING + (logoDrawn ? 56 : 0);
  ctx.fillStyle = COLORS.ink;
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(sanitizeText(title, "Leaderboard"), titleX, 46);

  if (subtitle) {
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = "16px sans-serif";
    ctx.fillText(sanitizeText(subtitle), titleX, 72);
  }

  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(PADDING, HEADER_HEIGHT);
  ctx.lineTo(WIDTH - PADDING, HEADER_HEIGHT);
  ctx.stroke();

  // Rows
  let y = HEADER_HEIGHT + 10;
  for (const entry of entries) {
    const rowY = y;
    const accent = RANK_ACCENTS[entry.rank];

    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, PADDING, rowY, WIDTH - PADDING * 2, ROW_HEIGHT - 8, 8);
    ctx.fill();

    if (accent) {
      ctx.fillStyle = accent;
      roundRect(ctx, PADDING, rowY, 6, ROW_HEIGHT - 8, 3);
      ctx.fill();
    }

    const name = sanitizeText(entry.name, "Unknown");
    const value = sanitizeText(entry.value);

    ctx.fillStyle = accent || COLORS.teal;
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(`${entry.rank}.`, PADDING + 18, rowY + 29);

    ctx.fillStyle = COLORS.ink;
    ctx.font = "bold 17px sans-serif";
    ctx.fillText(name, PADDING + 60, rowY + 29);

    ctx.fillStyle = COLORS.lime;
    ctx.font = "bold 17px sans-serif";
    const valueWidth = ctx.measureText(value).width;
    ctx.fillText(value, WIDTH - PADDING - 14 - valueWidth, rowY + 29);

    y += ROW_HEIGHT;
  }

  if (!entries.length) {
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = "16px sans-serif";
    ctx.fillText("No entries yet.", PADDING, y + 20);
  }

  // Footer bar
  const footerY = height - FOOTER_HEIGHT;
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(PADDING, footerY);
  ctx.lineTo(WIDTH - PADDING, footerY);
  ctx.stroke();

  ctx.fillStyle = COLORS.inkDim;
  ctx.font = "12px monospace";
  const updated = `Updated ${new Date().toLocaleString("en-US")}`;
  ctx.fillText(updated, PADDING, footerY + 28);

  const copyright = `© ${new Date().getFullYear()} KOBA GAMES  All rights reserved.`;
  const copyrightWidth = ctx.measureText(copyright).width;
  ctx.fillText(copyright, WIDTH - PADDING - copyrightWidth, footerY + 28);

  return canvas.toBuffer("image/png");
}

module.exports = { renderLeaderboardImage };

const fs = require("fs");
const { EmbedBuilder } = require("discord.js");

// koba.games is live now (2026-10-13) - moved off the GitHub-raw-hosted
// workaround copy. Also the REAL current mascot icon now, not the old
// BoomBot logo that was still sitting in that GitHub copy.
const FOOTER_ICON_URL = "https://koba.games/assets/koba-icon.png";

function copyrightFooter() {
  return `© ${new Date().getFullYear()} KOBA GAMES  All rights reserved.`;
}

function applyBranding(embed) {
  embed.setFooter({
    text: copyrightFooter(),
    iconURL: FOOTER_ICON_URL
  }).setTimestamp();
}

// Shared design-token palette for embeds AND canvas-rendered images -
// imported by 10 files (tickets, LFG panel, vault heist, servers hub,
// directory panel, auction panel, staff recruitment, admin feed, Frank,
// mainPanels) that destructure `COLORS`/`baseEmbed` from this module, none
// of which actually existed here until this fix - every one of those call
// sites threw "Cannot read properties of undefined" the moment they tried
// to build an embed (confirmed live via /template panels's "Owner Panel"
// crash). Values match this codebase's already-established semantics:
// danger/warning/success/info mirror the embed builders below; win/lose
// are standard green/red; gold/silver/bronze are real medal colors; the
// rest (bg/panel/panelRaised/ink/inkDim/line/teal/lime/blue/red/white) are
// canvas-rendering tokens for the dark KOBA theme.
const COLORS = {
  brand: 0xFF6D00,
  danger: 0xD32F2F,
  warning: 0xFFA726,
  success: 0x4CAF50,
  info: 0xFFFFFF,
  win: 0x4CAF50,
  lose: 0xD32F2F,
  gold: 0xFFD700,
  silver: 0xC0C0C0,
  bronze: 0xCD7F32,
  bg: "#0A0A0A",
  panel: "#141414",
  panelRaised: "#1c1c1c",
  ink: "#F5F5F5",
  inkDim: "#9A9A9A",
  line: "#232323",
  teal: "#26A69A",
  lime: "#FFEA00",
  blue: "#2196F3",
  red: "#D50000",
  white: "#FFFFFF",
};

/** Generic branded embed with just a color set - callers chain .setTitle()/.setDescription() themselves (matches every existing call site, e.g. mainPanels.js's baseEmbed(COLORS.brand).setTitle(...).setDescription(...)). */
function baseEmbed(color) {
  const embed = new EmbedBuilder().setColor(color);
  applyBranding(embed);
  return embed;
}

function getBrandingFile() {
  // Return null so the bot stops uploading a duplicate large file attachment payload
  return null;
}

function successEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xFFFFFF);
  applyBranding(embed);
  return embed;
}

function errorEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xD32F2F);
  applyBranding(embed);
  return embed;
}

function infoEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xFFFFFF);
  applyBranding(embed);
  return embed;
}

function dangerEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xD32F2F);
  applyBranding(embed);
  return embed;
}

// Distinct from dangerEmbed (red, "this failed/is blocked") - amber,
// "heads up" tone for a non-fatal caveat or a soft limit reached (e.g.
// insufficient funds, already-at-max-rank, a reminder alongside a
// successful action). Was called throughout the codebase (shop, team
// panel, staff applications, gift scheduler, war, template) without ever
// being exported - every one of those call sites would have thrown at
// runtime until this was added.
function warningEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xFFA726);
  applyBranding(embed);
  return embed;
}

module.exports = {
  successEmbed,
  errorEmbed,
  infoEmbed,
  dangerEmbed,
  warningEmbed,
  baseEmbed,
  COLORS,
  copyrightFooter,
  FOOTER_ICON_URL,
  getBrandingFile
};

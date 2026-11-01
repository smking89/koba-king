"use strict";

const db = require("../database/db");

/**
 * Every category /message-style covers, plus the built-in text used until an
 * admin overrides it. `{var}` placeholders get substituted at send time.
 * FIXED (2026-09-07): this used to be the ONE set of defaults for both the
 * in-game broadcast (rcon.say) and the Discord embed - reported live as
 * in-game "showing stars" once emoji/markdown made it into a template meant
 * for the other target. Split into CATEGORY_DEFAULTS_INGAME (Rust rich-text
 * tags: <color>/<b>/<br>, no emoji - see rcon.js's say()) and
 * CATEGORY_DEFAULTS_DISCORD (Discord markdown + emoji are fine here). Kept
 * the original export name (CATEGORY_DEFAULTS) pointing at the in-game set
 * for backward compat - /ad-message-config only ever deals with the in-game
 * "ad" broadcast, there's no Discord equivalent for it.
 */
const CATEGORY_DEFAULTS_INGAME = {
  event: "{message}", // detonation/create-event already build their own full text - this category just controls color
  kit_delivery: "{kit} delivered to {player}.",
  kit_cooldown: "{player}'s cooldown on {kit} has been reset.",
  event_winner: "{event} resolved - {winner} takes the reward!",
  // Inline per-segment <color> tags - "Powered by" inherits the outer
  // colorize() wrap (green by default), BOOM/bot override to their own
  // colors within their own tags. See colorize()'s doc comment for why this
  // nesting is expected to work in Rust's rich text.
  ad: "Powered by <color=#FF1493>BOOM</color><color=#FF0000>bot</color>.store",
  // Added 2026-10-18 for utils/killfeedEngine.js's optional in-game
  // broadcast line - schema.sql's message_styles CHECK comment already
  // anticipated this category, just never got real defaults registered.
  killfeed: "{message}",
};

/** Discord-embed-text defaults - markdown/emoji are fine here, never sent to rcon.say(). "ad" has no current Discord consumer but keeps a parallel default for consistency. */
const CATEGORY_DEFAULTS_DISCORD = {
  event: "{message}",
  kit_delivery: "**{kit}** delivered to **{player}**.",
  kit_cooldown: "**{player}**'s cooldown on **{kit}** has been reset.",
  event_winner: "🏆 **{event}** resolved - **{winner}** takes the reward!",
  ad: "Powered by **BOOM**bot.store",
  killfeed: "{message}",
};

// Old name, kept for existing callers (commands/message-style.js's `view`,
// commands/ad-message-config.js) that only ever mean the in-game set.
const CATEGORY_DEFAULTS = CATEGORY_DEFAULTS_INGAME;

const CATEGORY_LABELS = {
  event: "Events (bomb detonations, zone events)",
  kit_delivery: "Kit Delivery",
  kit_cooldown: "Kit Cooldown Reset",
  event_winner: "Event Winners",
  ad: "Recurring Ad (every 15 min)",
  killfeed: "Killfeed (optional in-game broadcast)",
};

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

function isValidHex(hex) {
  return HEX_PATTERN.test(hex);
}

// FIXED (2026-09-06): a kit's custom delivery_message using {PlayerName}
// (the {KillerPlayerName}-style naming this bot's other placeholder docs use)
// silently failed to substitute, since every caller only ever supplies
// lowercase {player}/{kit} and the old match was exact-case-only - the
// literal, un-replaced "{PlayerName}" text got sent straight to in-game
// chat. Confirmed live: a "Free Kit" delivery message read
// `"{PlayerName}" Has claimed a FreeKit!!` verbatim in-game.
// Matching is now case-insensitive, plus a small alias table for the
// {PlayerName}/{KitName}-style names an admin could reasonably guess from
// that other naming convention - both now resolve to the same {player}/{kit}
// values every caller actually passes.
// FIXED (2026-09-07): the killfeed aliases mirror the exact placeholder
// naming (KillerPlayerName/VictimPlayerName/KillerPvPKD/KillerPvPDeaths) the
// user pasted from an external reference template - same class of bug as
// the original {PlayerName}/{player} kit-message mismatch, just for
// /message-style's killfeed category this time. Canonical values (right
// side) match the exact `vars` keys utils/killFeed.js's formatStyledMessage
// call already passes: killer/victim/killerKD/killerDeaths.
const PLACEHOLDER_ALIASES = {
  playername: "player",
  kitname: "kit",
  killerplayername: "killer",
  victimplayername: "victim",
  killerpvpkd: "killerkd",
  killerpvpdeaths: "killerdeaths",
};

function renderTemplate(template, vars) {
  const lowerVars = {};
  for (const key of Object.keys(vars)) lowerVars[key.toLowerCase()] = vars[key];
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const lowerKey = key.toLowerCase();
    const canonical = PLACEHOLDER_ALIASES[lowerKey] || lowerKey;
    return lowerVars[canonical] !== undefined ? String(lowerVars[canonical]) : match;
  });
}

const MIN_SIZE_PT = 8;
const MAX_SIZE_PT = 72; // sane ceiling - Rust chat is a small fixed box, anything huge just clips/wraps badly

function isValidSize(size) {
  return Number.isInteger(size) && size >= MIN_SIZE_PT && size <= MAX_SIZE_PT;
}

/**
 * Wraps text in Rust's rich-text color/size tags. CONFIRMED 2026-09-04:
 * <color=#hex>text</color> works in global.say on Rust Console Edition (a
 * competitor server owner running Veretech confirmed their own global.say
 * kill-feed templates use this exact tag, plus <b> and <br>) - <size=N> is
 * still an unconfirmed extrapolation from Unity's usual rich text support,
 * not independently verified the same way.
 * Size wraps outermost so it scales the whole colored string, matching how
 * these tags nest in Unity rich text.
 */
function colorize(text, hex, sizePt) {
  const colored = `<color=${hex}>${text}</color>`;
  return isValidSize(sizePt) ? `<size=${sizePt}>${colored}</size>` : colored;
}

/**
 * The "ad" category ("POWERED BY KOBA Bot", every 15 min) is KOBA Bot's own
 * brand attribution, not a per-server customization - removed from
 * /message-style's editable categories (see commands/message-style.js) so
 * individual server admins can no longer mute/rewrite it. This is the one
 * global override, set via /ad-message-config (bot owner, official server
 * only) and stored once in site_settings rather than per guild_id - every
 * server gets the same ad text/color/size, controlled centrally.
 */
function getGlobalAdOverride() {
  const raw = db.getSiteSetting("global_ad_message");
  return raw ? JSON.parse(raw) : null;
}

function setGlobalAdOverride({ message, colorHex, sizePt }) {
  db.setSiteSetting("global_ad_message", JSON.stringify({ message: message ?? null, colorHex: colorHex ?? null, sizePt: sizePt ?? null }));
}

/**
 * Builds the final message text for a category - the one function every
 * feature should call instead of hand-rolling tags/markdown.
 * target: 'ingame' (default) wraps the result in Rust rich-text `<color>`/
 * `<size>` tags for rcon.say(); 'discord' returns plain rendered text (the
 * template itself carries any markdown/emoji) for a Discord embed - never
 * wrapped in Rust tags, since Discord doesn't render those.
 */
function formatStyledMessage(guildId, category, vars = {}, target = "ingame") {
  if (category === "ad" && target === "ingame") {
    const override = getGlobalAdOverride();
    if (override) {
      const template = override.message || CATEGORY_DEFAULTS_INGAME.ad;
      const color = isValidHex(override.colorHex) ? override.colorHex : "#00FF00";
      return colorize(renderTemplate(template, vars), color, override.sizePt);
    }
  }
  const defaults = target === "discord" ? CATEGORY_DEFAULTS_DISCORD : CATEGORY_DEFAULTS_INGAME;
  const style = db.getMessageStyle(guildId, category, target);
  // Added 2026-09-07: a message-feed pool entry (see /message-feed, up to 25
  // per category/target, one shown at random) takes priority over the single
  // /message-style message_template - matches Veretech's documented "the
  // default disables once you add your first custom message" behavior.
  const pooled = db.getRandomMessageStylePoolEntry(guildId, category, target);
  const template = pooled || style.message_template || defaults[category] || "{message}";
  const rendered = renderTemplate(template, vars);
  if (target === "discord") return rendered;
  const color = isValidHex(style.color_hex) ? style.color_hex : "#00FF00";
  return colorize(rendered, color, style.size_pt);
}

/** Kit-specific delivery/cooldown message - per-kit override (set via /kit-config) falls back to the guild's category default, which itself falls back to CATEGORY_DEFAULTS_INGAME. In-game only - no Discord kit-delivery broadcast exists (see utils/playerPanel.js's own separate Discord confirmation embed, unrelated to this). */
function formatKitMessage(guildId, kitRow, type, vars) {
  const isDelivery = type === "delivery";
  const overrideMessage = isDelivery ? kitRow?.delivery_message : kitRow?.cooldown_message;
  const overrideColor = isDelivery ? kitRow?.delivery_color_hex : kitRow?.cooldown_color_hex;
  const category = isDelivery ? "kit_delivery" : "kit_cooldown";

  const style = db.getMessageStyle(guildId, category, "ingame");
  const template = overrideMessage || style.message_template || CATEGORY_DEFAULTS_INGAME[category];
  const color = isValidHex(overrideColor) ? overrideColor : isValidHex(style.color_hex) ? style.color_hex : "#00FF00";
  return colorize(renderTemplate(template, vars), color, style.size_pt);
}

module.exports = {
  CATEGORY_DEFAULTS,
  CATEGORY_DEFAULTS_INGAME,
  CATEGORY_DEFAULTS_DISCORD,
  CATEGORY_LABELS,
  isValidHex,
  isValidSize,
  formatStyledMessage,
  formatKitMessage,
  colorize,
  getGlobalAdOverride,
  setGlobalAdOverride,
};

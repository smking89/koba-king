"use strict";

const { FALLBACK_INVITE_URL, SETTING_KEY: DISCORD_INVITE_SETTING_KEY } = require("../utils/discordInvite");

/**
 * The marketing-copy fields the admin dashboard's Settings page can edit,
 * and that the public landing page (admin/site.js) actually reads live.
 * Shared in one place so the settings form and the rendered page can never
 * silently drift out of sync on field names or defaults.
 */
const SITE_SETTING_FIELDS = [
  { key: "hero_headline", label: "Hero headline", default: "The war room your rivals hope you never deploy." },
  { key: "plan_name", label: "Plan name", default: "Command Tier" },
  // $14.99 is priced against the closest direct competitor's Rust Console
  // Edition Discord bot, which charges $10.99/server/month. Licensing is
  // per-server, tied to the subscriber's Discord account for portability
  // (see /transfer) - it does NOT cover every server the account owns
  // simultaneously.
  { key: "price_display", label: "Price display", default: "$14.99 / 30 days" },
  {
    key: "feature_bullets",
    label: "Pricing card bullets (one per line)",
    default:
      "Full roster, rank & fireteam engine\nClan Wars & zone capture\nShop, marketplace & auctions\nConfig overrides - no restart required\nMove servers anytime with /transfer",
    multiline: true,
  },
  {
    key: "youtube_url",
    label: "Demo video (paste a YouTube link - leave blank to hide the video section)",
    default: "",
  },
  {
    key: "tip4serv_shop_url",
    label: "Tip4Serv shop URL (generic fallback \"Subscribe\" link - leave blank to show a \"coming soon\" state)",
    default: "",
  },
  { key: "tip4serv_pro_url", label: "Tip4Serv checkout URL - KOBA Bot Pro (monthly)", default: "https://kobabot.tip4serv.com/product/kobabot-pro" },
  { key: "tip4serv_max_url", label: "Tip4Serv checkout URL - KOBA Bot Max (yearly)", default: "https://kobabot.tip4serv.com/product/kobabot-max" },
  // Displayed Pro/Max prices - set via /set pricing (bot owner, official
  // guild only) rather than edited here, so the price shown on the pricing
  // page can be changed from Discord without a redeploy. Kept in this same
  // site_settings-backed schema (not a separate table) purely so
  // PlanGrid.jsx's fetch of /api/site-settings stays the single source of
  // truth for every price/link on the page. NOTE: this is DISPLAY TEXT
  // only - it does not touch the real Tip4Serv product price, which must
  // be changed separately on Tip4Serv's own dashboard or a customer will
  // see one price here and get charged another at checkout.
  { key: "pro_price_main", label: "KOBA Bot Pro displayed price (main)", default: "$9.85" },
  { key: "pro_price_suffix", label: "KOBA Bot Pro displayed price (suffix)", default: "/month per server" },
  { key: "max_price_main", label: "KOBA Bot Max displayed price (main)", default: "$149.95" },
  { key: "max_price_suffix", label: "KOBA Bot Max displayed price (suffix)", default: "/year per server" },
  { key: "max_price_note", label: "KOBA Bot Max displayed price (note)", default: "≈17% savings vs. paying monthly" },
  // Boom Coins (real-money currency for KOBA Bot's own directory ad slots -
  // see website/src/pages/Shop.jsx's header comment) is still deferred to
  // its own future session - no ledger, no webhook wiring, no spend system
  // yet. These 5 real checkout URLs are saved here so they're ready to
  // wire up whenever that work happens, without inventing a purchase flow
  // with nothing real behind it in the meantime.
  { key: "tip4serv_pack_starter_url", label: "Tip4Serv checkout URL - Boom Coins Starter Pack (not yet wired up)", default: "https://kobabot.tip4serv.com/product/starter-pack" },
  { key: "tip4serv_pack_small_url", label: "Tip4Serv checkout URL - Boom Coins Small Pack (not yet wired up)", default: "https://kobabot.tip4serv.com/product/small-pack" },
  { key: "tip4serv_pack_medium_url", label: "Tip4Serv checkout URL - Boom Coins Medium Pack (not yet wired up)", default: "https://kobabot.tip4serv.com/product/medium-pack" },
  { key: "tip4serv_pack_large_url", label: "Tip4Serv checkout URL - Boom Coins Large Pack (not yet wired up)", default: "https://kobabot.tip4serv.com/product/large-pack" },
  { key: "tip4serv_pack_mega_url", label: "Tip4Serv checkout URL - Boom Coins Mega Pack (not yet wired up)", default: "https://kobabot.tip4serv.com/product/mega-pack" },
  // Server Boost ($1.99, Boom Coins-spent 10-min directory ranking boost) -
  // same "coming soon" status as Boom Coins itself, same reasoning.
  { key: "tip4serv_boost_url", label: "Tip4Serv checkout URL - Server Boost (not yet wired up)", default: "https://kobabot.tip4serv.com/product/kobabot-boost" },
];

function readSiteSettings(db) {
  const values = Object.fromEntries(SITE_SETTING_FIELDS.map((f) => [f.key, db.getSiteSetting(f.key, f.default)]));
  // Not in SITE_SETTING_FIELDS (and not shown on /admin/settings) - this one
  // is bot-managed, auto-refreshed by utils/discordInvite.js since a
  // hardcoded Discord invite link can expire/get revoked. Falls back to the
  // originally-provided invite until the bot's first refresh tick replaces it.
  values.discord_invite_url = db.getSiteSetting(DISCORD_INVITE_SETTING_KEY, FALLBACK_INVITE_URL);
  return values;
}

module.exports = { SITE_SETTING_FIELDS, readSiteSettings };

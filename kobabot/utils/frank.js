"use strict";

const { EmbedBuilder } = require("discord.js");
const db = require("../database/db");
const { COLORS, copyrightFooter, FOOTER_ICON_URL } = require("./embeds");

// The site serves assets/brand/*.png at /brand/*.png (see admin/server.js) -
// same pattern as KOBA Bot's own icon-mark.png. Frank's actual logo file
// still needs to be added there (assets/brand/frank-icon.png) for this to
// render; until then Discord just quietly shows no author icon.
const FRANK_ICON_URL = "https://kobabot.store/brand/frank-icon.png";
const FRANK_NAME = "Frank";

/** Base embed for anything Frank says - distinct author line from KOBA Bot's own embeds, same brand purple. */
function frankEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.brand)
    .setAuthor({ name: FRANK_NAME, iconURL: FRANK_ICON_URL })
    .setTimestamp()
    .setFooter({ text: copyrightFooter(), iconURL: FOOTER_ICON_URL });
}

// Deliberately NOT a general chatbot - just a checklist per ticket reason
// (see utils/tickets.js's TICKET_REASONS) and a scoped keyword->answer
// lookup (see below). Keep additions here short and skimmable.
const TICKET_CHECKLISTS = {
  bug: ["What were you trying to do?", "What happened instead?", "Can you reproduce it? If so, how?", "Any screenshots or error messages?"],
  billing: ["Which server/Discord is this about?", "What's the issue - failed payment, wrong plan, or cancellation?", "Your Tip4Serv order/transaction ID, if you have it"],
  setup: ["What are you trying to set up?", "What have you already tried?", "Any error messages or unexpected behavior?"],
  report: ["Reported player's in-game name/gamertag", "What rule was broken?", "When did this happen (date/time)?", "Evidence - screenshots, clips, or RCON logs if you have them"],
  other: ["Describe what you need help with in as much detail as you can"],
};

/** Posts Frank's "please provide" checklist right after a ticket channel opens - see utils/tickets.js's createTicketChannel. */
async function postTicketChecklist(channel, reasonValue) {
  const items = TICKET_CHECKLISTS[reasonValue] || TICKET_CHECKLISTS.other;
  const embed = frankEmbed()
    .setTitle("To help staff move faster, please share:")
    .setDescription(items.map((i) => `• ${i}`).join("\n"));
  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Scans message content for a keyword match against this guild's /frank-faq
 * entries. Plain case-insensitive substring matching, first match wins by
 * insertion order - no fuzzy matching, no ranking. Simple and predictable is
 * the point; staff control exactly what Frank knows via /frank-faq.
 */
function matchFaq(guildId, content) {
  const lower = content.toLowerCase();
  const entries = db.listFrankFaq(guildId);
  for (const entry of entries) {
    const keywords = entry.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.some((k) => lower.includes(k))) return entry;
  }
  return null;
}

/** Builds Frank's reply embed for a matched FAQ entry. */
function faqAnswerEmbed(entry) {
  const embed = frankEmbed().setDescription(entry.answer);
  if (entry.link) embed.addFields({ name: "Link", value: entry.link });
  return embed;
}

// Baseline answers for the questions every new server actually gets asked -
// staff can edit/remove/add more any time via /frank-faq. Seeded once per
// guild (see seedDefaultFaq) rather than hardcoded live logic, so staff can
// freely edit or delete individual entries without them reappearing.
const DEFAULT_FRANK_FAQ = [
  {
    keywords: "how to play, getting started, new player, tutorial, rules, im new",
    answer: "Check out this server's how-to-play/rules channel for a full walkthrough of how everything works!",
  },
  {
    keywords: "kit, kits, claim kit, my kit, free kit",
    answer: "Kits are claimed from the kit panel in your kits channel - look for the buttons/dropdown there. If you don't see a kit panel, ask staff to set one up with `/kit-panel`.",
  },
  {
    keywords: "team, join team, create team, my team, how do i make a team",
    answer: "Manage your whole team - create, invite, kick, promote, demote, disband - from one place with `/team-panel`.",
  },
  {
    keywords: "coins, wallet, balance, my coins, how much do i have, currency",
    answer: "Check your balance with `/coins`. Coins are earned from playtime and kills, and spent in the shop.",
  },
  {
    keywords: "shop, buy, store, purchase, spend coins",
    answer: "Browse and buy items with `/shop` (or the shop panel if one's set up in this server). Prices and stock are set by this server's staff.",
  },
  {
    keywords: "referral, invite code, my code, refer a friend",
    answer: "Get your personal invite code with `/referral generate`. You and the person you referred both get rewarded once they've joined and linked up - check `/referral-leaderboard` for the top referrers.",
  },
  {
    keywords: "war, declare war, attack another team, raid another team",
    answer: "Team leaders can declare war on a rival team with `/declare-war`. Check the war logs channel for results.",
  },
  {
    keywords: "lfg, looking for group, find team, need players, group up",
    answer: "Post a \"looking for group\" request with `/create-lfg` - it'll show up in the LFG feed for others to join.",
  },
  {
    keywords: "link server, connect rcon, rcon, my server isn't connected",
    answer: "Server owners link their Rust server with `/server connection set` (host, port, and WebRCON password). This needs Manage Server permission.",
  },
  {
    keywords: "dashboard, my stats online, website dashboard",
    answer: "See your team, wallet, kit history, and referral stats online any time at kobabot.store/dashboard - log in with Discord.",
  },
  {
    keywords: "subscribe, premium, upgrade, activate kobabot, pricing",
    answer: "KOBA Bot runs on a per-server subscription - subscribe or manage billing at kobabot.store. Server owners can also move their subscription to a new server with `/transfer`.",
  },
  {
    keywords: "staff application, apply for staff, join the staff team, how do i become staff",
    answer: "Staff applications are posted in the staff applications channel, if this server has one open - check there for the application panel.",
  },
];

/** Idempotent - only seeds if this guild has zero FAQ entries, so staff edits/deletions never get silently reintroduced by a later re-provision. */
function seedDefaultFaq(guildId, createdBy) {
  if (db.listFrankFaq(guildId).length > 0) return;
  for (const { keywords, answer } of DEFAULT_FRANK_FAQ) {
    db.addFrankFaq(guildId, keywords, answer, null, createdBy);
  }
}

module.exports = {
  FRANK_NAME,
  FRANK_ICON_URL,
  frankEmbed,
  TICKET_CHECKLISTS,
  postTicketChecklist,
  matchFaq,
  faqAnswerEmbed,
  DEFAULT_FRANK_FAQ,
  seedDefaultFaq,
};

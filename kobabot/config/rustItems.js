"use strict";

/**
 * Rust item database for the Shop system - lets admins pick products from a
 * dropdown instead of typing shortnames by hand. Sourced from the user's own
 * rust_console_edition_items.json (corrosionhour.com item list + images) -
 * NOT Facepunch's official API, so treat "image" URLs as best-effort (some
 * items have none) and shortnames as PC Rust's, which the rest of this
 * codebase already assumes are shared with RCE (same underlying item DB,
 * per that file's own _meta.note).
 */

const raw = require("./data/rustItems.json");

const ITEMS = raw.items.map((i) => ({
  name: i.Name,
  shortName: i["Short Name"],
  itemId: i.ItemID,
  description: i["Item Description"] || "",
  stackSize: Number(i["Default Stacksize"]) || 1,
  image: i.image || null,
}));

const ITEMS_BY_SHORTNAME = new Map(ITEMS.map((i) => [i.shortName, i]));

function searchItems(query, limit = 25) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return ITEMS.slice(0, limit);
  return ITEMS.filter((i) => i.name.toLowerCase().includes(q) || i.shortName.toLowerCase().includes(q)).slice(0, limit);
}

function getItemByShortName(shortName) {
  return ITEMS_BY_SHORTNAME.get(shortName) || null;
}

/**
 * Coarse category buckets for "Easy Shop" auto-generation and for the
 * player-facing shop's category dropdown when an admin hasn't hand-built
 * categories yet. Keyword-matched against name/shortname - inherently
 * approximate (no official category field in the source data), first match
 * wins, "Misc" is the catch-all.
 */
const CATEGORY_RULES = [
  // Checked before "weapons" - guntrap/autoturret would otherwise fall
  // into that bucket first (both are technically firearms).
  { key: "traps", label: "Traps", match: (i) => /turret|trap\.|guntrap|spikes|beartrap/i.test(i.shortName) || /trap|turret|spike/i.test(i.name) },
  { key: "weapons", label: "Weapons", match: (i) => /rifle|pistol|shotgun|smg|revolver|launcher|bow|crossbow|machete|hatchet|knife|sword|mace|spear|salvaged|thompson|python|nailgun|speargun/i.test(i.name) },
  { key: "ammo", label: "Ammo", match: (i) => /ammo|\bcartridge\b|arrow|explosive\.|rocket/i.test(i.shortName) || /ammo|arrow/i.test(i.name) },
  { key: "medical", label: "Medical", match: (i) => /bandage|syringe|medkit|antiradpills|healingitem|blood/i.test(i.shortName) || /medical|bandage|syringe|medkit|antiradiation/i.test(i.name) },
  { key: "tools", label: "Tools", match: (i) => /pickaxe|axe|hammer|chainsaw|jackhammer|toolgun|wrench/i.test(i.name) },
  { key: "attire", label: "Attire & Armor", match: (i) => /helmet|hazmat|jacket|pants|boots|gloves|mask|hat|vest|armor|attire|hood|cap\b/i.test(i.name) },
  { key: "electrical", label: "Electrical", match: (i) => /electric\.|generator|solarpanel|battery|switch|branch|wire\b/i.test(i.shortName) },
  { key: "resources", label: "Resources", match: (i) => /^(wood|stones|metal\.|sulfur|cloth|leather|scrap|lowgradefuel|crude|charcoal|gunpowder|hq\.metal)/i.test(i.shortName) },
  { key: "components", label: "Components", match: (i) => /tech\.trash|gears|springs|pipes|sewingkit|metalpipe|metalspring|rope|tarp|fabric/i.test(i.shortName) },
  { key: "food_water", label: "Food & Water", match: (i) => /can\.|meat\.|apple|corn|pumpkin|mushroom|water\b|berries|chocolate|granolabar|humanmeat/i.test(i.shortName) },
  { key: "building", label: "Building & Deployables", match: (i) => /door\b|wall\.|foundation|floor\.|frame\.|window|storage|box\.|locker|furnace|workbench|autoturret|trapdoor|ladder/i.test(i.shortName) },
  { key: "vehicles", label: "Vehicles & Boats", match: (i) => /car|boat|chassis|module|rowboat|rhib|minicopter|scraptransport|horse/i.test(i.shortName) },
];

function categorize(item) {
  return CATEGORY_RULES.find((c) => c.match(item))?.key || "misc";
}

function categoryLabel(key) {
  return CATEGORY_RULES.find((c) => c.key === key)?.label || "Misc";
}

/**
 * Heuristic price tiers for the admin "Easy Shop" one-click generator -
 * there's no real economy data to derive this from, so it's a coarse
 * keyword-based guess an admin is expected to review/adjust afterward
 * (Edit Product is always available). Coins are an abstract unit - the
 * actual currency name/emoji is whatever the admin configured.
 */
const TIER_RULES = {
  cheap: { label: "Cheap", priceRange: [5, 40], match: (i) => ["resources", "food_water", "ammo", "misc"].includes(categorize(i)) },
  mid: { label: "Mid", priceRange: [50, 300], match: (i) => ["tools", "medical", "components", "electrical", "attire"].includes(categorize(i)) },
  expensive: { label: "Expensive", priceRange: [400, 3000], match: (i) => ["weapons", "building", "vehicles"].includes(categorize(i)) },
};

function itemsForTier(tierKey, limit = 15) {
  const tier = TIER_RULES[tierKey];
  if (!tier) return [];
  const matches = ITEMS.filter(tier.match);
  // Deterministic-ish sample (every Nth item) rather than fully random, so
  // repeated Easy Shop generations for the same tier aren't wildly different.
  const step = Math.max(1, Math.floor(matches.length / limit));
  const picked = [];
  for (let i = 0; i < matches.length && picked.length < limit; i += step) picked.push(matches[i]);
  return picked.map((item) => ({ item, price: randomInRange(tier.priceRange) }));
}

function randomInRange([min, max]) {
  return Math.round(min + Math.random() * (max - min));
}

module.exports = { ITEMS, searchItems, getItemByShortName, categorize, categoryLabel, CATEGORY_RULES, TIER_RULES, itemsForTier };

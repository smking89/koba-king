/**
 * Mock data layer - every page reads server status, pricing, logs, and
 * account info from here rather than hardcoding it inline. This is
 * deliberately the ONE seam to swap for real data later: point these
 * functions at the existing Express/SQLite backend (see ../../admin/*.js)
 * or new API routes once the visual rebuild is approved, without touching
 * any component. Nothing here is wired to a live database yet.
 */

export type ServerStatus = {
  online: boolean;
  players: number;
  maxPlayers: number;
  pingMs: number;
};

export const serverStatus: ServerStatus = {
  online: true,
  players: 12483,
  maxPlayers: 20000,
  pingMs: 32,
};

export type LogLine = { id: string; kind: "info" | "player" | "system"; text: string };

export const liveLogs: LogLine[] = [
  { id: "l1", kind: "info", text: "KOBABOT v3.8.2 | Server Connected" },
  { id: "l2", kind: "info", text: "Players Online: 24/100" },
  { id: "l3", kind: "info", text: "AutoKit: Ready" },
  { id: "l4", kind: "info", text: "Economy: Loaded (USD, EUR, BTC)" },
  { id: "l5", kind: "info", text: "Marketplace: Active" },
  { id: "l6", kind: "info", text: "Auction System: Running" },
  { id: "l7", kind: "info", text: "Clan Wars: Ready" },
  { id: "l8", kind: "info", text: "Loot Tables: Loaded" },
  { id: "l9", kind: "info", text: "Teleport System: Online" },
  { id: "l10", kind: "info", text: "All Modules: Operational ✓" },
  { id: "l11", kind: "player", text: "xXRageQuitXx joined the game" },
  { id: "l12", kind: "player", text: "ShadowWolf left the game" },
  { id: "l13", kind: "player", text: "BigDaddy420 joined the game" },
  { id: "l14", kind: "system", text: "Auto Save Complete" },
];

export type PlanTier = "basic" | "pro" | "max";

export type Plan = {
  id: PlanTier;
  name: string;
  tagline: string;
  price: string;
  period: string;
  coins: string;
  chestImage: string;
  features: string[];
  inherits?: string;
  cta: string;
  badge?: string;
};

export const plans: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "Perfect for small servers",
    price: "$4.99",
    period: "/month",
    coins: "500 Boom Coins",
    chestImage: "/assets/chest-green-basic.png",
    features: ["Core Server Management", "Basic Economy & Shop", "AutoKit Essentials", "Player Support"],
    cta: "Get Started Free",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing communities",
    price: "$14.95",
    period: "/month",
    coins: "1,000 Boom Coins",
    chestImage: "/assets/chest-gold-pro.png",
    features: ["Advanced Economy & Marketplace", "Auction System & Loot Tables", "Clan Wars & Teleport System", "Priority Support"],
    inherits: "Everything in Basic",
    cta: "Get Pro",
    badge: "Most Popular",
  },
  {
    id: "max",
    name: "Max",
    tagline: "For serious owners",
    price: "$149.95",
    period: "/year",
    coins: "2,500 Boom Coins",
    chestImage: "/assets/chest-purple-max.png",
    features: ["Multi-Server Management", "Advanced Templates & Customization", "Staff Recruitment Network", "24/7 Premium Support"],
    inherits: "Everything in Pro",
    cta: "Get Max",
  },
];

export type DirectoryServer = {
  id: string;
  name: string;
  online: boolean;
  game: string;
  map: string;
  players: number;
  maxPlayers: number;
};

export const directoryServers: DirectoryServer[] = [
  { id: "srv1", name: "KOBA Bot 1", online: true, game: "Rust Console Edition", map: "Procedural Map", players: 24, maxPlayers: 100 },
  { id: "srv2", name: "Wasteland Duos", online: true, game: "Rust Console Edition", map: "Barren", players: 41, maxPlayers: 60 },
  { id: "srv3", name: "Rustafied Longnight", online: false, game: "Rust Console Edition", map: "Procedural Map", players: 0, maxPlayers: 100 },
];

export const account = {
  name: "KobaBotUser",
  tag: "#4587",
  online: true,
  tier: "Pro",
  stats: { servers: 12, active: 5, totalPlayers: "2.4K" },
};

export const supportChannels = [
  { icon: "chat", title: "Live Chat", blurb: "Get instant support" },
  { icon: "ticket", title: "Submit Ticket", blurb: "Detailed issue form" },
  { icon: "faq", title: "FAQ", blurb: "Find quick answers" },
  { icon: "discord", title: "Discord", blurb: "Join our community" },
] as const;

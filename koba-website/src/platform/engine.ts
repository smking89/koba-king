import { hmacSha256 } from "./crypto.ts";
import type { PublicRegion } from "@/site/regions";

export type GameScope =
  | "ARK"
  | "RUST"
  | "RUST_CONSOLE"
  | "MINECRAFT"
  | "PALWORLD"
  | "DAYZ"
  | "ENSHROUDED"
  | "CS2"
  | "VALORANT"
  | "VALHEIM"
  | "SCUM"
  | "UNTURNED"
  | "SEVEN_DAYS"
  | "SATISFACTORY";

const GAME_LABELS: Record<GameScope, string> = {
  ARK: "ARK: Survival Ascended",
  RUST: "Rust",
  RUST_CONSOLE: "Rust Console",
  MINECRAFT: "Minecraft",
  PALWORLD: "Palworld",
  DAYZ: "DayZ",
  ENSHROUDED: "Enshrouded",
  CS2: "Counter-Strike 2",
  VALORANT: "Valorant",
  VALHEIM: "Valheim",
  SCUM: "SCUM",
  UNTURNED: "Unturned",
  SEVEN_DAYS: "7 Days to Die",
  SATISFACTORY: "Satisfactory",
};

export function gameLabel(game: GameScope) {
  return GAME_LABELS[game];
}
export type StaffRole = "player" | "moderator" | "admin" | "owner" | "developer";
export type FormState = "rising" | "steady" | "falling";
export type DisciplineStatus = "clear" | "warned" | "struck" | "under_review" | "blacklisted";
export type ClanTier = "SQUAD" | "STANDARD_CLAN" | "ZERG";
export type EmbedColor = "green" | "cyan" | "gold" | "danger";
export type Capacity = "nominal" | "strained" | "critical";

export interface Home {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface Identity {
  id: string;
  name: string;
  handle: string;
  region: PublicRegion;
  avatarUrl?: string;
  bannerUrl?: string;
  kobaTag?: string;
  /** "player" or "business" - picked when the account was created. */
  accountType?: string;
  /** "pc", "console" or "both". */
  platform?: string;
  /** Hashtags followed, stored without the leading "#". */
  interests?: string[];
  score: number;
  form: FormState;
  scoreDelta: number;
  badges: string[];
  steamId?: string;
  discordId?: string;
  xboxId?: string;
  coins: number;
  hours?: number;
  gameHours?: Record<string, number>;
  xp?: number;
  points?: Record<string, number>;
  claimed: boolean;
  warnings: number;
  strikes: number;
  status: DisciplineStatus;
  clanId?: string;
  homes: Home[];
  rivals: string[];
}

export interface Clan {
  id: string;
  name: string;
  memberIds: string[];
  atWarWith?: string;
}

export interface ServerAdapter {
  id: string;
  name: string;
  game: GameScope;
  guildId: string;
  license: "active" | "expired";
  hostKey: string;
  pluginKey: string;
}

export interface RawPacket {
  serverId: string;
  hostKey: string;
  kind: "combat" | "raid";
  at: number;
  attackerSteam: string;
  attackerName: string;
  victimSteam?: string;
  victimName?: string;
  weapon?: string;
  distance?: number;
  hitZone?: string;
  pve?: boolean;
  entity?: string;
  damage?: number;
  ownerSteam?: string;
  plugin_signature: string;
  minutes?: number;
}

export interface StoredEvent extends RawPacket {
  id: string;
  provisional: boolean;
}

export interface GateRow {
  gate: "host" | "signature" | "sanity" | "identity";
  pass: boolean;
  note: string;
}

export interface IngestResult {
  disposition: "commit" | "provisional" | "drop";
  gates: GateRow[];
  eventId?: string;
}

export interface FeedRow {
  id: string;
  at: number;
  tone: "ok" | "cyan" | "gold" | "danger" | "neutral";
  title: string;
  detail: string;
}

export interface AuditRow {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
}

export interface EmbedField {
  name: string;
  value: string;
}

export interface Embed {
  title: string;
  description: string;
  color: EmbedColor;
  fields: EmbedField[];
}

export interface BlacklistEntry {
  kobaId: string;
  discordId?: string;
  steamId?: string;
  xboxId?: string;
  serverIds: string[];
}

export interface PlatformData {
  identities: Identity[];
  clans: Clan[];
  servers: ServerAdapter[];
  events: StoredEvent[];
  provisional: StoredEvent[];
  attempts: { serverId: string; at: number; key: string }[];
  feed: FeedRow[];
  audit: AuditRow[];
  blacklist: BlacklistEntry[];
  viewerId: string;
  seq: number;
}

export interface CommandResult {
  embed: Embed;
  data: PlatformData;
}

const RAID_SURFACES = new Set(["cupboard.tool", "wall.external.high.stone"]);

export function clanTier(size: number): ClanTier {
  if (size <= 4) return "SQUAD";
  if (size <= 8) return "STANDARD_CLAN";
  return "ZERG";
}

export function canonicalBody(packet: Omit<RawPacket, "plugin_signature" | "hostKey">): string {
  return JSON.stringify({
    at: packet.at,
    attackerName: packet.attackerName,
    attackerSteam: packet.attackerSteam,
    damage: packet.damage ?? null,
    distance: packet.distance ?? null,
    entity: packet.entity ?? null,
    hitZone: packet.hitZone ?? null,
    kind: packet.kind,
    ownerSteam: packet.ownerSteam ?? null,
    pve: packet.pve ?? false,
    serverId: packet.serverId,
    victimName: packet.victimName ?? null,
    victimSteam: packet.victimSteam ?? null,
    weapon: packet.weapon ?? null,
  });
}

export async function signPacket(
  pluginKey: string,
  packet: Omit<RawPacket, "plugin_signature" | "hostKey">,
): Promise<string> {
  return hmacSha256(pluginKey, canonicalBody(packet));
}

function nextId(data: PlatformData, prefix: string): { id: string; data: PlatformData } {
  const seq = data.seq + 1;
  return { id: `${prefix}-${seq}`, data: { ...data, seq } };
}

function identityByHardware(data: PlatformData, hardwareId?: string): Identity | undefined {
  if (!hardwareId) return undefined;
  return data.identities.find((identity) => identity.steamId === hardwareId || identity.xboxId === hardwareId);
}

function structural(packet: RawPacket): boolean {
  if (packet.kind === "raid") return true;
  return packet.kind === "combat" && packet.pve !== true && Boolean(packet.victimSteam);
}

function scoreFor(packet: RawPacket, actor: Identity, victim?: Identity): number {
  if (packet.kind === "raid") return 8;
  const base = packet.hitZone === "head" ? 12 : 4;
  return victim && actor.rivals.includes(victim.id) ? base + 3 : base;
}

function applyScore(data: PlatformData, packet: RawPacket): PlatformData {
  const actor = identityByHardware(data, packet.attackerSteam);
  if (!actor || actor.status === "under_review" || actor.status === "blacklisted") return data;
  const victim = identityByHardware(data, packet.victimSteam);
  const delta = Math.max(0, scoreFor(packet, actor, victim));
  const badges = packet.kind === "raid" && packet.entity === "cupboard.tool" && !actor.badges.includes("Ashfall Raider") ? [...actor.badges, "Ashfall Raider"] : actor.badges;
  const xp = (actor.xp ?? actor.score) + delta;
  const serverId = packet.serverId || "unknown";
  const points = { ...(actor.points ?? {}), [serverId]: (actor.points?.[serverId] ?? 0) + Math.max(1, Math.round(delta / 2)) };
  const minutes = packet.minutes ?? 0;
  const gain = minutes >= 1 && minutes <= 180 ? minutes / 60 : 0;
  const hours = (actor.hours ?? 0) + gain;
  const game = data.servers.find((server) => server.id === serverId)?.game;
  const gameHours = { ...(actor.gameHours ?? {}) };
  if (gain > 0 && game) gameHours[game] = (gameHours[game] ?? 0) + gain;
  return replaceIdentity(data, { ...actor, score: xp, xp, scoreDelta: delta, points, hours, gameHours, badges });
}

export function settleProvisional(data: PlatformData, take: (event: StoredEvent) => boolean, now: number): PlatformData {
  const moved = data.provisional.filter(take);
  if (!moved.length) return data;
  let next: PlatformData = {
    ...data,
    provisional: data.provisional.filter((event) => !take(event)),
    events: [...moved.map((event) => ({ ...event, provisional: false })), ...data.events].slice(0, 60),
  };
  for (const event of moved) next = applyScore(next, event);
  const issued = nextId(next, "feed");
  return {
    ...issued.data,
    feed: [{ id: issued.id, at: now, tone: "ok" as const, title: `Back-dated ${moved.length} packet${moved.length === 1 ? "" : "s"}`, detail: "Score applied from the provisional table." }, ...issued.data.feed].slice(0, 40),
  };
}

export async function ingest(data: PlatformData, packet: RawPacket, now: number): Promise<{ data: PlatformData; result: IngestResult }> {
  const server = data.servers.find((item) => item.id === packet.serverId);
  const hostPass = Boolean(server && server.license === "active" && server.hostKey === packet.hostKey);
  const gates: GateRow[] = [
    {
      gate: "host",
      pass: hostPass,
      note: !server ? "Unknown server id." : server.license !== "active" ? "License is not active." : hostPass ? "Host key matches." : "Host key rejected.",
    },
  ];
  const expected = server ? await hmacSha256(server.pluginKey, canonicalBody(packet)) : "";
  const signaturePass = Boolean(server) && expected === packet.plugin_signature && packet.plugin_signature.length > 0;
  gates.push({
    gate: "signature",
    pass: signaturePass,
    note: !server ? "No plugin key on file." : signaturePass ? "HMAC-SHA256 matches KobaCore.cs." : "Signature failed. Dropped as a forgery.",
  });

  const key = canonicalBody(packet);
  const recent = data.attempts.filter((attempt) => attempt.serverId === packet.serverId && now - attempt.at < 10_000);
  const raids = data.attempts.filter((attempt) => attempt.serverId === packet.serverId && packet.kind === "raid" && now - attempt.at < 60_000);
  const replay = data.attempts.some((attempt) => attempt.key === key && attempt.at === packet.at);
  let sanityPass = true;
  let sanityNote = "Fields, replay, and rate are inside bounds.";
  if (replay) {
    sanityPass = false;
    sanityNote = "Replay dropped. The same packet timestamp is already on file.";
  } else if (packet.kind === "combat") {
    if (!packet.victimSteam || !packet.weapon) {
      sanityPass = false;
      sanityNote = "Combat rows need a victim and a weapon.";
    } else if ((packet.distance ?? 0) < 0 || (packet.distance ?? 0) > 350) {
      sanityPass = false;
      sanityNote = "Distance is outside the combat envelope.";
    }
  } else if (!packet.entity || !RAID_SURFACES.has(packet.entity)) {
    sanityPass = false;
    sanityNote = "Raid hook only accepts tool cupboards and external walls.";
  }
  if (sanityPass && raids.length >= 50) {
    sanityPass = false;
    sanityNote = "Rate gate: 50 structures in one minute.";
  }
  if (sanityPass && recent.length >= 8) {
    sanityPass = false;
    sanityNote = "Rate gate: more than 8 packets in 10 seconds.";
  }
  gates.push({ gate: "sanity", pass: sanityPass, note: sanityNote });

  if (!signaturePass || !sanityPass) {
    return { data, result: { disposition: "drop", gates } };
  }

  const actor = identityByHardware(data, packet.attackerSteam);
  const banned = Boolean(actor && (actor.status === "blacklisted" || data.blacklist.some((row) => row.kobaId === actor.id || row.steamId === packet.attackerSteam)));
  const identityPass = Boolean(actor) && actor!.status !== "blacklisted" && !banned;
  gates.push({
    gate: "identity",
    pass: identityPass,
    note: banned ? "Mapped hardware is blacklisted. Dropped." : identityPass ? `Mapped to ${actor!.name}.` : "No active KOBAid for this Steam ID or gamertag. Held for back-dating.",
  });
  if (banned || (!hostPass && !structural(packet)) || (!identityPass && !structural(packet))) {
    return { data, result: { disposition: "drop", gates } };
  }

  const attempts = [...data.attempts, { serverId: packet.serverId, at: packet.at, key }].slice(-80);
  let next = { ...data, attempts };
  const issued = nextId(next, "evt");
  next = issued.data;
  const stored: StoredEvent = { ...packet, id: issued.id, provisional: !hostPass || !identityPass };
  if (stored.provisional) {
    next = { ...next, provisional: [stored, ...next.provisional].slice(0, 40) };
    return { data: next, result: { disposition: "provisional", gates, eventId: stored.id } };
  }

  next = applyScore(next, packet);
  const feedIssued = nextId(next, "feed");
  next = feedIssued.data;
  const scored = identityByHardware(next, packet.attackerSteam);
  const title = packet.kind === "combat" ? `${packet.attackerName} downed ${packet.victimName ?? "someone"}` : `${packet.attackerName} hit ${packet.entity}`;
  const detail = `${server?.game ?? "server"} · ${server?.name ?? packet.serverId} · ${scored ? `${scored.scoreDelta >= 0 ? "+" : ""}${scored.scoreDelta}` : "0"}`;
  const tone: FeedRow["tone"] = packet.kind === "raid" ? "danger" : "cyan";
  next = {
    ...next,
    events: [stored, ...next.events].slice(0, 60),
    feed: [{ id: feedIssued.id, at: packet.at, tone, title, detail }, ...next.feed].slice(0, 40),
  };
  return { data: next, result: { disposition: "commit", gates, eventId: stored.id } };
}

function identityById(data: PlatformData, id: string): Identity | undefined {
  return data.identities.find((identity) => identity.id === id);
}

function replaceIdentity(data: PlatformData, next: Identity): PlatformData {
  return { ...data, identities: data.identities.map((identity) => (identity.id === next.id ? next : identity)) };
}

function embed(title: string, description: string, color: EmbedColor, fields: EmbedField[] = []): Embed {
  return { title, description, color, fields };
}

function findPerson(data: PlatformData, token: string): Identity | undefined {
  const key = token.toLowerCase();
  return data.identities.find((identity) => identity.handle === key || identity.name.toLowerCase() === key || identity.id === key);
}

function findClan(data: PlatformData, token: string): Clan | undefined {
  const key = token.toLowerCase();
  return data.clans.find((clan) => clan.id === key || clan.name.toLowerCase() === key);
}

function blocked(data: PlatformData, actor: Identity, line: string): CommandResult | null {
  if (actor.status !== "blacklisted") return null;
  if (line.startsWith("/support")) return null;
  return {
    embed: embed("Profile locked", "This KOBAid is on the permanent blacklist. Only /support still answers.", "danger"),
    data,
  };
}

function requireStaff(role: StaffRole, need: StaffRole): boolean {
  const rank: StaffRole[] = ["player", "moderator", "admin", "owner", "developer"];
  return rank.indexOf(role) >= rank.indexOf(need);
}

export function routeCommand(
  data: PlatformData,
  line: string,
  role: StaffRole,
  hq: boolean,
  game: GameScope,
  now: number,
): CommandResult {
  const actor = identityById(data, data.viewerId);
  if (!actor) return { embed: embed("No identity", "Pick a profile first.", "danger"), data };
  const text = line.trim();
  const denied = blocked(data, actor, text.toLowerCase());
  if (denied) return denied;
  const parts = text.replace(/^\//, "").split(/\s+/).filter(Boolean);
  const name = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);
  if (!name) return { embed: embed("Empty", "Start with a slash command.", "danger"), data };

  const unlinked = !actor.steamId;
  const needsLink = ["claim", "shop", "play", "war", "clan"].includes(name);
  if (needsLink && unlinked) {
    return {
      embed: embed("Link required", "This command waits on a verified game account. Use /link steam <SteamID64>.", "danger"),
      data,
    };
  }

  if (name === "coins") {
    const sub = (args[0] ?? "balance").toLowerCase();
    if (sub === "balance") {
      return {
        embed: embed("Coins", `${actor.name} holds ${actor.coins}.`, "gold", [{ name: "KOBAid", value: actor.id }]),
        data,
      };
    }
    if (sub === "send") {
      const target = findPerson(data, args[1] ?? "");
      const amount = Number(args[2]);
      if (!target || target.id === actor.id || !Number.isInteger(amount) || amount <= 0) {
        return { embed: embed("Send failed", "Use /coins send <handle> <amount>.", "danger"), data };
      }
      if (actor.coins < amount) return { embed: embed("Send failed", "Not enough coins.", "danger"), data };
      let next = replaceIdentity(data, { ...actor, coins: actor.coins - amount });
      const fresh = identityById(next, target.id)!;
      next = replaceIdentity(next, { ...fresh, coins: fresh.coins + amount });
      const issued = nextId(next, "feed");
      const row: FeedRow = { id: issued.id, at: now, tone: "gold", title: `${actor.name} sent ${amount} coins`, detail: `To ${target.name}` };
      next = {
        ...issued.data,
        feed: [row, ...issued.data.feed].slice(0, 40),
      };
      return { embed: embed("Transfer", `${amount} moved to ${target.name}.`, "gold"), data: next };
    }
  }

  if (name === "claim") {
    if (actor.claimed) return { embed: embed("Already claimed", "The daily claim is spent.", "gold"), data };
    const next = replaceIdentity(data, { ...actor, claimed: true, coins: actor.coins + 25 });
    return { embed: embed("Claim", "+25 coins.", "gold", [{ name: "Balance", value: String(actor.coins + 25) }]), data: next };
  }

  if (name === "shop" || name === "play" || name === "claim") {
    if (actor.status === "under_review") {
      return { embed: embed("Tracking frozen", "Three strikes put this profile under review. Shop and events stay closed until the master developer clears the case.", "danger"), data };
    }
  }

  if (name === "shop") {
    if (game === "DAYZ") {
      return {
        embed: embed("Shop · DayZ", "Medical supplies for a survival run.", "cyan", [
          { name: "Bandage pack", value: "15 coins" },
          { name: "Blood bag", value: "40 coins" },
        ]),
        data,
      };
    }
    if (game === "RUST_CONSOLE" || game === "RUST") {
      return {
        embed: embed("Shop · Rust", "Kits and a dial-a-ride off the beach.", "green", [
          { name: "Field kit", value: "30 coins" },
          { name: "Minicopter ride", value: "20 coins" },
        ]),
        data,
      };
    }
    return {
      embed: embed(`Shop · ${gameLabel(game)}`, "Kits for the server you are on.", "green", [
        { name: "Field kit", value: "15 coins" },
        { name: "Ride", value: "20 coins" },
      ]),
      data,
    };
  }

  if (name === "play") {
    if (actor.coins < 10) return { embed: embed("Can't queue", "Play costs 10 coins.", "danger"), data };
    const next = replaceIdentity(data, { ...actor, coins: actor.coins - 10 });
    return { embed: embed(`${gameLabel(game)} queued`, "10 coins staked. The core will settle the round.", game === "DAYZ" ? "cyan" : "green"), data: next };
  }

  if (name === "clan" && (args[0] ?? "").toLowerCase() === "create") {
    if (actor.clanId) return { embed: embed("Already in a clan", "Leave first.", "danger"), data };
    const clanName = args.slice(1).join(" ").trim();
    if (clanName.length < 3) return { embed: embed("Name too short", "Use /clan create <name>.", "danger"), data };
    const issued = nextId(data, "clan");
    const clan: Clan = { id: issued.id, name: clanName, memberIds: [actor.id] };
    const next = replaceIdentity(
      { ...issued.data, clans: [...issued.data.clans, clan] },
      { ...actor, clanId: clan.id },
    );
    return { embed: embed("Clan opened", `${clanName} is a SQUAD.`, "cyan"), data: next };
  }

  if (name === "clan" && (args[0] ?? "").toLowerCase() === "leave") {
    if (!actor.clanId) return { embed: embed("No clan", "Nothing to leave.", "danger"), data };
    const next = replaceIdentity(
      {
        ...data,
        clans: data.clans.map((clan) =>
          clan.id === actor.clanId ? { ...clan, memberIds: clan.memberIds.filter((id) => id !== actor.id) } : clan,
        ),
      },
      { ...actor, clanId: undefined },
    );
    return { embed: embed("Left clan", "Roster updated.", "cyan"), data: next };
  }

  if (name === "clan") {
    return { embed: embed("Clan", "Use /clan create <name> or /clan leave.", "cyan"), data };
  }

  if (name === "war") {
    const sub = (args[0] ?? "").toLowerCase();
    const clan = actor.clanId ? data.clans.find((item) => item.id === actor.clanId) : undefined;
    if (!clan) return { embed: embed("No clan", "Wars are clan actions.", "danger"), data };
    if (sub === "end") {
      const next = { ...data, clans: data.clans.map((item) => (item.id === clan.id ? { ...item, atWarWith: undefined } : item)) };
      return { embed: embed("War ended", `${clan.name} stands down.`, "cyan"), data: next };
    }
    if (sub === "declare") {
      const target = findClan(data, args.slice(1).join(" "));
      if (!target || target.id === clan.id) return { embed: embed("Declare failed", "Use /war declare <clan>.", "danger"), data };
      const next = { ...data, clans: data.clans.map((item) => (item.id === clan.id ? { ...item, atWarWith: target.id } : item)) };
      const issued = nextId(next, "feed");
      return {
        embed: embed("War declared", `${clan.name} against ${target.name}.`, "danger"),
        data: {
          ...issued.data,
          feed: [{ id: issued.id, at: now, tone: "danger", title: `${clan.name} declared war`, detail: target.name }, ...issued.data.feed],
        },
      };
    }
    return { embed: embed("War", "Use /war declare <clan> or /war end.", "danger"), data };
  }

  if (name === "link" && (args[0] ?? "").toLowerCase() === "steam") {
    const steamId = args[1] ?? "";
    if (!/^7656\d{13}$/.test(steamId)) return { embed: embed("Bad SteamID64", "Expected 17 digits starting with 7656.", "danger"), data };
    if (data.identities.some((identity) => identity.steamId === steamId && identity.id !== actor.id)) {
      return { embed: embed("Already linked", "That SteamID belongs to another KOBAid.", "danger"), data };
    }
    let next = replaceIdentity(data, { ...actor, steamId });
    next = settleProvisional(next, (event) => event.attackerSteam === steamId || event.victimSteam === steamId, now);
    const moved = data.provisional.filter((event) => event.attackerSteam === steamId || event.victimSteam === steamId).length;
    return { embed: embed("Linked", `Steam ${steamId} is on ${actor.name}.`, "green", [{ name: "Back-dated", value: String(moved) }]), data: next };
  }

  if (name === "unlink" && (args[0] ?? "").toLowerCase() === "steam") {
    return { embed: embed("Unlinked", "The Steam footprint is clear. History stays.", "cyan"), data: replaceIdentity(data, { ...actor, steamId: undefined }) };
  }

  if (name === "support") {
    return { embed: embed("Support", "Ticket opened against this KOBAid. A staff seat can read the audit.", "cyan"), data };
  }

  if (name === "mod") {
    const sub = (args[0] ?? "").toLowerCase();
    const target = findPerson(data, args[1] ?? "");
    if (!target) return { embed: embed("No player", "Use /mod warning|strike|clear <handle>.", "danger"), data };
    if (sub === "warning") {
      if (role !== "moderator") return { embed: embed("Moderator only", "A warning is a level 1 action. Admins file strikes.", "danger"), data };
      if (target.warnings >= 1) return { embed: embed("Escalate", "The one warning is used. Send this case to an admin.", "danger"), data };
      const status: DisciplineStatus = target.strikes > 0 ? target.status : "warned";
      let next = replaceIdentity(data, { ...target, warnings: 1, status });
      const audit = nextId(next, "audit");
      next = {
        ...audit.data,
        audit: [{ id: audit.id, at: now, actor: actor.name, action: "warning", detail: target.name }, ...audit.data.audit],
      };
      return { embed: embed("Warning filed", `${target.name} is on one warning.`, "danger"), data: next };
    }
    if (sub === "strike") {
      if (!requireStaff(role, "admin")) return { embed: embed("Staff only", "Strikes need an admin seat.", "danger"), data };
      if (target.status === "blacklisted" || target.strikes >= 3) {
        return { embed: embed("No further strikes", "The profile is already at the cap.", "danger"), data };
      }
      const strikes = target.strikes + 1;
      const status: DisciplineStatus = strikes >= 3 ? "under_review" : "struck";
      let next = replaceIdentity(data, { ...target, strikes, status });
      const audit = nextId(next, "audit");
      const notice = nextId(audit.data, "feed");
      next = {
        ...notice.data,
        audit: [{ id: audit.id, at: now, actor: actor.name, action: "strike", detail: `${target.name} · ${strikes}/3` }, ...audit.data.audit],
        feed:
          strikes >= 3
            ? [{ id: notice.id, at: now, tone: "danger" as const, title: `${target.name} is under review`, detail: "Tracking is frozen. The case is on the master desk." }, ...notice.data.feed].slice(0, 40)
            : notice.data.feed,
      };
      return {
        embed: embed(strikes >= 3 ? "Profile under review" : "Strike filed", `${target.name} is at ${strikes}/3.`, "danger"),
        data: next,
      };
    }
    if (sub === "clear") {
      if (role !== "developer") return { embed: embed("Master only", "Removing a strike is a developer action.", "danger"), data };
      if (target.strikes <= 0 && target.status !== "under_review") return { embed: embed("Nothing to clear", "No strikes on file.", "cyan"), data };
      const strikes = Math.max(0, target.strikes - 1);
      const status: DisciplineStatus = target.status === "blacklisted" ? "blacklisted" : strikes > 0 ? "struck" : target.warnings ? "warned" : "clear";
      let next = replaceIdentity(data, { ...target, strikes, status });
      const audit = nextId(next, "audit");
      next = { ...audit.data, audit: [{ id: audit.id, at: now, actor: actor.name, action: "clear-strike", detail: target.name }, ...audit.data.audit] };
      return { embed: embed("Strike removed", "The score network stays. The count went down by one.", "cyan"), data: next };
    }
  }

  if (name === "globalban" || name === "globalunban") {
    if (role !== "moderator" && role !== "admin" && role !== "owner" && role !== "developer") {
      return { embed: embed("Staff only", "A ban needs a moderator or higher.", "danger"), data };
    }
    const target = findPerson(data, args[0] ?? "");
    if (!target) return { embed: embed("No player", `Use /${name} <handle>.`, "danger"), data };
    if (name === "globalunban" && role !== "developer") {
      return { embed: embed("CEO only", "Lifting a ban stays with the CEO.", "danger"), data };
    }
    if (name === "globalban") {
      const entry: BlacklistEntry = {
        kobaId: target.id,
        discordId: target.discordId,
        steamId: target.steamId,
        xboxId: target.xboxId,
        serverIds: data.servers.filter((server) => server.guildId).map((server) => server.id),
      };
      let next = replaceIdentity(data, { ...target, status: "blacklisted" });
      const audit = nextId(next, "audit");
      next = {
        ...audit.data,
        blacklist: [entry, ...next.blacklist.filter((row) => row.kobaId !== target.id)],
        audit: [{ id: audit.id, at: now, actor: actor.name, action: "globalban", detail: `${target.id} · ${target.discordId ?? "no-discord"} · ${target.steamId ?? "no-steam"}` }, ...audit.data.audit],
      };
      return { embed: embed("Blacklisted", `${target.name} is locked out of the site, the plugin, and bot commands. The score stays on file.`, "danger"), data: next };
    }
    const status: DisciplineStatus = target.strikes >= 3 ? "under_review" : target.strikes > 0 ? "struck" : target.warnings ? "warned" : "clear";
    let next = replaceIdentity(data, { ...target, status });
    const audit = nextId(next, "audit");
    next = {
      ...audit.data,
      blacklist: next.blacklist.filter((row) => row.kobaId !== target.id),
      audit: [{ id: audit.id, at: now, actor: actor.name, action: "globalunban", detail: target.name }, ...audit.data.audit],
    };
    return { embed: embed("Ban lifted", `${target.name} is active again. Score, seasons, and history were not wiped.`, "green"), data: next };
  }

  if (name === "license") {
    if (!hq || !requireStaff(role, "developer")) return { embed: embed("HQ only", "License tools stay on the official server.", "danger"), data };
    return {
      embed: embed(
        "Licenses",
        "Guild adapters currently on file.",
        "cyan",
        data.servers.map((server) => ({ name: server.name, value: `${server.game} · ${server.license}` })),
      ),
      data,
    };
  }

  if (name === "nuke") {
    if (!requireStaff(role, "owner")) return { embed: embed("Owner only", "/nuke is the server owner's absolute reset.", "danger"), data };
    if ((args[0] ?? "").toLowerCase() !== "confirm") {
      return { embed: embed("Confirm nuke", "NUKE IS DESTRUCTIVE. This clears every balance, claim, and clan war on the network and cannot be undone. Identities and the audit log stay. Run /nuke confirm to proceed.", "danger"), data };
    }
    const issued = nextId(data, "audit");
    const next: PlatformData = {
      ...issued.data,
      identities: data.identities.map((identity) => ({ ...identity, coins: 0, claimed: false })),
      clans: data.clans.map((clan) => ({ ...clan, atWarWith: undefined })),
      audit: [{ id: issued.id, at: now, actor: actor.name, action: "nuke", detail: "Balances, claims, and wars reset." }, ...issued.data.audit],
    };
    return { embed: embed("Nuke complete", "Every balance, claim, and clan war on the network was reset. This cannot be undone. The audit was not touched.", "danger"), data: next };
  }

  if (name === "progression") {
    return {
      embed: embed("Progression", `${actor.name} is ${actor.form}.`, game === "DAYZ" ? "cyan" : "green", [
        { name: "XP", value: String(actor.xp ?? actor.score) },
        { name: "Session", value: `+${Math.max(0, actor.scoreDelta)}` },
        { name: "Points", value: String(Object.values(actor.points ?? {}).reduce((sum, value) => sum + value, 0)) },
        { name: "KOBA coins", value: String(actor.coins) },
      ]),
      data,
    };
  }

  if (name === "lfg") {
    const issued = nextId(data, "feed");
    const where = gameLabel(game);
    const row: FeedRow = { id: issued.id, at: now, tone: "gold", title: `${actor.name} posted LFG`, detail: where };
    return {
      embed: embed("LFG posted", `${actor.name} is looking for a group on ${where}.`, "gold"),
      data: {
        ...issued.data,
        feed: [row, ...issued.data.feed].slice(0, 40),
      },
    };
  }

  if (name === "challenge") {
    const target = findPerson(data, args[0] ?? "");
    if (!target || target.id === actor.id) return { embed: embed("No rival", "Use /challenge <handle>.", "danger"), data };
    const gap = target.score - actor.score;
    const issued = nextId(data, "feed");
    const gapLabel = gap === 0 ? "Even" : gap > 0 ? `${target.name} leads by ${gap}` : `${actor.name} leads by ${-gap}`;
    const row: FeedRow = { id: issued.id, at: now, tone: "gold", title: `${actor.name} challenged ${target.name}`, detail: gapLabel };
    return {
      embed: embed("Challenge open", `${actor.name} against ${target.name}.`, "gold", [
        { name: actor.handle, value: String(actor.score) },
        { name: target.handle, value: String(target.score) },
        { name: "Gap", value: gapLabel },
      ]),
      data: {
        ...issued.data,
        feed: [row, ...issued.data.feed].slice(0, 40),
      },
    };
  }

  if (name === "commands") {
    return {
      embed: embed("Commands", "Player, clan, and staff trees.", game === "DAYZ" ? "cyan" : "green", [
        { name: "Player", value: "/claim /shop /play /coins /progression /challenge /lfg /link /support" },
        { name: "Clan", value: "/clan create /clan leave /war declare /war end" },
        { name: "Staff", value: "/mod warning /mod strike /nuke" },
      ]),
      data,
    };
  }

  return { embed: embed("Unknown", "Try /commands.", "danger"), data };
}

export function nextCapacity(fps: number, prev: Capacity): Capacity {
  if (prev === "nominal") {
    if (fps < 25) return "critical";
    if (fps < 45) return "strained";
    return "nominal";
  }
  if (prev === "strained") {
    if (fps < 25) return "critical";
    if (fps > 55) return "nominal";
    return "strained";
  }
  if (fps > 55) return "nominal";
  if (fps > 35) return "strained";
  return "critical";
}

export function workloadBudget(state: Capacity): number {
  if (state === "nominal") return 1;
  if (state === "strained") return 0.6;
  return 0.25;
}

/** Blank platform state. Real identities arrive from the players table and real servers from the server registry; nothing is pre-populated. */
export function emptyPlatform(): PlatformData {
  return {
    identities: [],
    clans: [],
    servers: [],
    events: [],
    provisional: [],
    attempts: [],
    feed: [],
    audit: [],
    blacklist: [],
    viewerId: "",
    seq: 0,
  };
}

export const UNLINKED_STEAM = "76561198999900001";

import { getSql } from "@/lib/db";
import { eligiblePlayerIds } from "@/lib/competition/eligibility.server";
import { DEFAULT_WEIGHTS, type ActionId, type Candidate, type Compliance, type Kind, type Player, type Region, type SponsorTarget } from "@/engine/types";
import { requireConfigToken } from "@/lib/pulse/gate.server";
import type { GateDenied, KobaScoreRow, PortalId, PulseCatalog } from "@/lib/pulse/types";

const ACTIONS: ActionId[] = [
  "join_server",
  "join_lfg",
  "open_profile",
  "challenge",
  "follow_clan",
  "engage_sponsor",
];

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((entry) => num(entry));
  if (typeof value === "string") {
    const body = value.trim().replace(/^\{/, "").replace(/\}$/, "");
    if (!body) return [];
    return body.split(",").map((entry) => num(entry.trim()));
  }
  return [];
}

function idOk(id: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(id);
}

function cleanWeights(input: Record<string, number> | null | undefined): Record<ActionId, number> {
  const weights = { ...DEFAULT_WEIGHTS };
  for (const id of ACTIONS) {
    const value = input?.[id];
    if (typeof value === "number" && Number.isFinite(value)) {
      weights[id] = Math.round(Math.min(2, Math.max(0, value)) * 100) / 100;
    }
  }
  return weights;
}

async function gate(authorization: string, portal: string): Promise<{ ok: true; portal: PortalId } | GateDenied> {
  if (portal !== "koba.games" && portal !== "developers.koba.games") {
    return { ok: false, status: 401, error: "Unknown portal" };
  }
  try {
    await requireConfigToken(authorization, portal);
    return { ok: true, portal };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("not configured")) return { ok: false, status: 503, error: message };
    return { ok: false, status: 401, error: "Unauthorized" };
  }
}

function mapPlayer(row: Record<string, unknown>): Player {
  const clan = row.clan_id ? String(row.clan_id) : undefined;
  return {
    id: String(row.id),
    name: String(row.display_name),
    handle: String(row.handle),
    region: String(row.region) as Region,
    score: num(row.score),
    clanId: clan,
    friends: asJson<string[]>(row.friends, []),
    rivals: asJson<string[]>(row.rivals, []),
    plays: asJson<string[]>(row.plays, []),
    games: asJson<Record<string, number>>(row.games, {}),
    vector: asNumberArray(row.vector),
    astro: bool(row.astro),
    line: String(row.line ?? ""),
    activityIndex: num(row.activity_index, 40),
    accountLinks: asJson<Record<string, string>>(row.account_links, {}),
  };
}

function mapCandidate(row: Record<string, unknown>, kind: Kind): Candidate {
  const sponsor = row.sponsor ? asJson<SponsorTarget | null>(row.sponsor, null) : null;
  const candidate: Candidate = {
    id: String(row.id),
    kind,
    title: String(row.title),
    detail: String(row.detail),
    meta: String(row.meta),
    vector: asNumberArray(row.vector),
    freshnessMin: num(row.freshness_min),
    heat: num(row.heat),
    verified: bool(row.verified),
    boostEligible: bool(row.boost_eligible),
    compliance: String(row.compliance) as Compliance,
    complianceNote: String(row.compliance_note ?? ""),
    fraudRisk: num(row.fraud_probability),
    anchors: asJson<string[]>(row.anchors, []),
  };
  if (row.game_id) candidate.gameId = String(row.game_id);
  if (row.region) candidate.region = String(row.region) as Region;
  if (row.clan_id) candidate.clanId = String(row.clan_id);
  if (row.skill_center != null) candidate.skillCenter = num(row.skill_center);
  if (sponsor) candidate.sponsor = sponsor;
  if (kind === "server") {
    candidate.sampleCount = num(row.sample_count, 48);
    candidate.concurrent = num(row.concurrent_players);
    candidate.peak = num(row.peak_players);
    candidate.peakTracking = bool(row.peak_tracking);
  }
  return candidate;
}

export async function readCatalog(): Promise<PulseCatalog> {
  const sql = await getSql();
  const playerRows = await sql<Record<string, unknown>>`select * from players order by ordinal`;
  const scoreRows = await sql<Record<string, unknown>>`select * from koba_scores`;  const serverRows = await sql<Record<string, unknown>>`select * from servers order by ordinal`;
  const itemRows = await sql<Record<string, unknown>>`select * from discovery_items order by ordinal`;
  const configRows = await sql<{ weights: unknown }>`select weights from ranker_config where id = 'global'`;
  const boostRows = await sql<{ item_id: string; ends_ms: unknown }>`
    select item_id, (extract(epoch from ends_at) * 1000) as ends_ms
    from boost_ledger
    where status = 'active' and ends_at > now()
  `;
  const spentRows = await sql<{ actor_id: string; n: unknown }>`
    select actor_id, count(*)::int as n
    from boost_ledger
    where status <> 'void'
    group by actor_id
  `;

  const boosts: Record<string, number> = {};
  for (const row of boostRows) boosts[row.item_id] = num(row.ends_ms);
  const spent: Record<string, number> = {};
  for (const row of spentRows) spent[row.actor_id] = num(row.n);
  const rawWeights = asJson<Record<string, number>>(configRows[0]?.weights, {});
  const eligible = await eligiblePlayerIds();

  return {
    source: "database",
    players: playerRows.filter((row) => eligible.has(String(row.id))).map(mapPlayer),
    candidates: [
      ...serverRows.map((row) => mapCandidate(row, "server")),
      ...itemRows.map((row) => mapCandidate(row, String(row.kind) as Kind)),
    ],
    weights: cleanWeights(rawWeights),
    boosts,
    spent,
    scores: scoreRows
      .filter((row) => eligible.has(String(row.player_id)))
      .map((row) => ({
        playerId: String(row.player_id),
        gameId: String(row.game_id),
        normalizedScore: num(row.normalized_score),
        confidenceLow: num(row.confidence_low),
        confidenceHigh: num(row.confidence_high),
        activityIndex: num(row.activity_index),
      })),
  };
}

export async function publishWeights(input: {
  authorization: string;
  portal: string;
  weights: Record<string, number>;
}): Promise<{ ok: true } | GateDenied> {
  const allowed = await gate(input.authorization, input.portal);
  if (!allowed.ok) return allowed;
  const weights = cleanWeights(input.weights);
  const sql = await getSql();
  await sql`
    insert into ranker_config (id, weights, updated_at, updated_by)
    values ('global', ${JSON.stringify(weights)}::jsonb, now(), ${allowed.portal})
    on conflict (id) do update
      set weights = excluded.weights,
          updated_at = now(),
          updated_by = excluded.updated_by
  `;
  return { ok: true };
}

export async function activateLedgerBoost(input: {
  authorization: string;
  portal: string;
  itemId: string;
  actorId: string;
}): Promise<{ ok: true; id: string; creditsRemaining: number; endsAt: number } | GateDenied> {
  const allowed = await gate(input.authorization, input.portal);
  if (!allowed.ok) return allowed;
  if (!idOk(input.itemId) || !idOk(input.actorId)) {
    return { ok: false, status: 400, error: "Unknown catalog id" };
  }
  const sql = await getSql();
  const players = await sql<{ boost_credits: unknown }>`
    select boost_credits from players where id = ${input.actorId}
  `;
  const player = players[0];
  if (!player) return { ok: false, status: 404, error: "Unknown player" };
  const eligible = await sql<{ id: string }>`
    select id from servers where id = ${input.itemId} and boost_eligible = true
    union all
    select id from discovery_items where id = ${input.itemId} and boost_eligible = true
    limit 1
  `;
  if (!eligible.length) return { ok: false, status: 404, error: "Item cannot be boosted" };
  const active = await sql<{ id: string; ends_ms: unknown; credits_remaining: unknown }>`
    select id, (extract(epoch from ends_at) * 1000) as ends_ms, credits_remaining
    from boost_ledger
    where item_id = ${input.itemId}
      and actor_id = ${input.actorId}
      and status = 'active'
      and ends_at > now()
    limit 1
  `;
  if (active[0]) {
    return {
      ok: true,
      id: active[0].id,
      creditsRemaining: num(active[0].credits_remaining),
      endsAt: num(active[0].ends_ms),
    };
  }
  const spentRows = await sql<{ n: unknown }>`
    select count(*)::int as n from boost_ledger
    where actor_id = ${input.actorId} and status <> 'void'
  `;
  const used = num(spentRows[0]?.n);
  const credits = num(player.boost_credits);
  if (used >= credits) return { ok: false, status: 409, error: "No boost credits" };
  const remaining = credits - used - 1;
  const id = `led-${input.actorId}-${Date.now()}`;
  const campaign = input.itemId.startsWith("camp-") ? input.itemId : null;
  await sql`
    insert into boost_ledger (
      id, item_id, actor_id, portal, started_at, ends_at, multiplier,
      credits_remaining, wallet_owner_id, campaign_id, status
    ) values (
      ${id},
      ${input.itemId},
      ${input.actorId},
      ${allowed.portal},
      now(),
      now() + interval '10 minutes',
      3,
      ${remaining},
      ${input.actorId},
      ${campaign},
      'active'
    )
  `;
  return { ok: true, id, creditsRemaining: remaining, endsAt: Date.now() + 10 * 60 * 1000 };
}

export async function closeLedgerBoost(input: {
  authorization: string;
  portal: string;
  itemId: string;
  actorId: string;
}): Promise<{ ok: true } | GateDenied> {
  const allowed = await gate(input.authorization, input.portal);
  if (!allowed.ok) return allowed;
  if (!idOk(input.itemId) || !idOk(input.actorId)) {
    return { ok: false, status: 400, error: "Unknown catalog id" };
  }
  const sql = await getSql();
  await sql`
    update boost_ledger
    set status = 'closed', ends_at = now()
    where item_id = ${input.itemId}
      and actor_id = ${input.actorId}
      and status = 'active'
  `;
  return { ok: true };
}

export type { KobaScoreRow, PulseCatalog };

import { inspectPayload, mintToken, noteRate, readToken, type Gate } from "./ingest";
import { actorEligibility } from "@/lib/competition/eligibility.server";

const SECRET = "koba-ingest-preview-key";

export interface IssuedToken {
  jti: string;
  kobaId: string;
  exp: number;
  issuedAt: number;
  rotated: boolean;
  requests: number;
  dropped: number;
}

export interface StatusSeries {
  ingress: number[];
  failures: number[];
  forgery: number[];
  bandwidth: number[];
}

let issued: IssuedToken[] = [];
const hits = new Map<string, number[]>();
// Real traffic only: the series starts empty and grows from actual ingest calls.
const series: StatusSeries = { ingress: [], failures: [], forgery: [], bandwidth: [] };

function push(bucket: number[], value: number) {
  bucket.shift();
  bucket.push(value);
}

export function tokenAudit(kobaId: string) {
  const now = Date.now();
  return issued
    .filter((token) => token.kobaId === kobaId)
    .map((token) => ({ ...token, live: !token.rotated && token.exp > now }));
}

export async function issueToken(kobaId: string, now = Date.now()) {
  const minted = await mintToken(kobaId, now, SECRET);
  issued = [{ jti: minted.jti, kobaId, exp: minted.exp, issuedAt: now, rotated: false, requests: 0, dropped: 0 }, ...issued].slice(0, 12);
  return { token: minted.token, jti: minted.jti, exp: minted.exp };
}

export async function rotateToken(kobaId: string, jti: string, now = Date.now()) {
  const current = issued.find((token) => token.jti === jti && token.kobaId === kobaId && !token.rotated);
  if (!current) return { ok: false as const, error: "That token is not active for this KOBAid." };
  current.rotated = true;
  const next = await issueToken(kobaId, now);
  return { ok: true as const, ...next, retired: jti };
}

export async function testIngest(raw: string, token: string, now = Date.now()) {
  const gates: Gate[] = [];
  const read = token ? await readToken(token, now, SECRET) : { ok: false as const, reason: "malformed" as const };
  const known = read.ok ? issued.find((item) => item.jti === read.jti) : undefined;
  gates.push({
    id: "stateless",
    name: "Stateless signature",
    pass: read.ok || read.reason === "expired",
    detail: read.ok || read.reason === "expired" ? "HMAC matched. No session was loaded." : "Signature missing or altered. The request never reached the tables.",
  });
  gates.push({
    id: "expiry",
    name: "Token expiry",
    pass: read.ok,
    detail: read.ok ? "Inside the 15 minute life." : read.reason === "expired" ? "The token is older than 15 minutes. Rotate it." : "No live token.",
  });
  gates.push({
    id: "revocation",
    name: "Rotation",
    pass: read.ok && !!known && !known.rotated,
    detail: !read.ok ? "Skipped." : !known ? "Signature is valid, but this preview has no issue record." : known.rotated ? "Rotated. The old secret is dead." : "This secret is the current one.",
  });

  let limited = false;
  if (read.ok && known && !known.rotated) {
    const next = noteRate(hits.get(known.jti) ?? [], now);
    hits.set(known.jti, next.hits);
    limited = !next.allowed;
    if (limited) known.dropped += 1;
    else known.requests += 1;
  }
  gates.push({
    id: "rate",
    name: "Frequency gate",
    pass: !limited,
    detail: limited ? "More than 6 calls in 10 seconds. The gateway dropped the connection." : "Under the 6 calls / 10 seconds cap.",
  });

  const inspected = inspectPayload(raw, Math.floor(now / 1000));
  gates.push(...inspected.gates);

  // Score permission: an internal seat or an in-game admin/owner/moderator must
  // never move a score, because it can award itself anything the server reports.
  // Checked before the event is accepted, so nothing downstream ever sees it.
  const actor = inspected.event?.data_payload.actor_identity ?? "";
  const eligibility = actor ? await actorEligibility(actor) : null;
  const permitted = eligibility === null || eligibility.eligible;
  gates.push({
    id: "permission",
    name: "Score permission",
    pass: permitted,
    detail: !actor
      ? "No actor on this event."
      : eligibility === null
        ? "Unknown to KOBA, so there is no score row to move."
        : eligibility.reason === "staff"
          ? `Internal seat (${eligibility.staffRole}). Staff are excluded from every board.`
          : eligibility.eligible
            ? "No in-game admin, owner or moderator permission."
            : `Holds in-game ${eligibility.ingameRole}. Score stays frozen until the connector reports none.`,
  });

  const ok = gates.every((gate) => gate.pass) && inspected.event !== null;
  const forgery = inspected.gates.some((gate) => gate.id === "forgery" && !gate.pass);
  push(series.ingress, (series.ingress.at(-1) ?? 0) + 1);
  push(series.failures, ok ? Math.max(0, (series.failures.at(-1) ?? 1) - 1) : (series.failures.at(-1) ?? 0) + 1);
  push(series.forgery, forgery ? (series.forgery.at(-1) ?? 0) + 1 : series.forgery.at(-1) ?? 0);
  push(series.bandwidth, (series.bandwidth.at(-1) ?? 0) + Math.ceil(raw.length / 40));
  return { ok, gates, event: ok ? inspected.event : null };
}

export function statusSeries(): StatusSeries {
  return {
    ingress: [...series.ingress],
    failures: [...series.failures],
    forgery: [...series.forgery],
    bandwidth: [...series.bandwidth],
  };
}

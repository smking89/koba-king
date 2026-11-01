import { getSql } from "@/lib/db";
import { PLATFORM_ROLES } from "@/site/roles";

/**
 * Who is allowed to be on a board.
 *
 * Two independent exclusions, both read from the database and never from the
 * caller:
 *
 *  1. **Internal staff.** A KOBA seat (`staff_role` above rank 0) administers
 *     the platform. Staff moderate boards; they must not sit on them, or a
 *     moderator could edit the very list they appear in.
 *  2. **Elevated in-game permission.** An identity holding admin, owner or
 *     moderator on the game server can award itself anything the server
 *     reports. Until the connector reports `none`, that identity gets no score
 *     movement and no board position.
 *
 * This module is the single place either rule lives, so the read side (boards)
 * and the write side (score updates) can never drift apart.
 */

/** In-game permission the connector reports. `none` is the only eligible value. */
export type IngameRole = "none" | "moderator" | "admin" | "owner";

/** Permissions that let an identity grant itself points in-game. */
export const ELEVATED_INGAME_ROLES: readonly IngameRole[] = ["admin", "owner", "moderator"];

/**
 * Internal KOBA seats, derived from the platform's own role ladder so a new
 * staff tier is excluded automatically instead of being added here by hand.
 * Rank 0 (`player`, `business`) is everyone else.
 */
export const INTERNAL_STAFF_ROLES: readonly string[] = PLATFORM_ROLES.filter((role) => role.rank > 0).map(
  (role) => role.id,
);

export function isInternalStaff(staffRole: string | null | undefined): boolean {
  return INTERNAL_STAFF_ROLES.includes(String(staffRole ?? "player"));
}

export function isElevatedIngame(ingameRole: string | null | undefined): boolean {
  return ELEVATED_INGAME_ROLES.includes(String(ingameRole ?? "none") as IngameRole);
}

/** Why an identity is off the board. `null` means eligible. */
export type Ineligibility = "staff" | "ingame-permissions";

export interface Eligibility {
  eligible: boolean;
  reason: Ineligibility | null;
  staffRole: string;
  ingameRole: IngameRole;
}

export function eligibilityOf(flags: { staff_role?: unknown; ingame_role?: unknown }): Eligibility {
  const staffRole = String(flags.staff_role ?? "player");
  const ingameRole = String(flags.ingame_role ?? "none") as IngameRole;
  if (isInternalStaff(staffRole)) return { eligible: false, reason: "staff", staffRole, ingameRole };
  if (isElevatedIngame(ingameRole)) return { eligible: false, reason: "ingame-permissions", staffRole, ingameRole };
  return { eligible: true, reason: null, staffRole, ingameRole };
}

/** One lookup for one identity. `null` when the KOBAid does not exist. */
export async function scoreEligibility(playerId: string): Promise<Eligibility | null> {
  const sql = await getSql();
  const rows = await sql<{ staff_role: string; ingame_role: string }>`
    select staff_role, ingame_role from players where id = ${playerId}
  `;
  const row = rows[0];
  if (!row) return null;
  return eligibilityOf(row);
}

/**
 * Resolve an ingest actor (`steam_…`, `xbox_…`, `koba_…`) onto its KOBA row.
 * `null` means the identity is unknown to KOBA, so it owns no score row and the
 * gate has nothing to protect.
 */
export async function actorEligibility(actor: string): Promise<Eligibility | null> {
  if (!actor) return null;
  const sql = await getSql();
  const rows = await sql<{ staff_role: string; ingame_role: string }>`
    select staff_role, ingame_role from players
    where id = ${actor}
       or steam_id = ${actor}
       or xbox_xuid = ${actor}
       or psn_id = ${actor}
       or discord_id = ${actor}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return eligibilityOf(row);
}

/**
 * The whole board in one query. Anything not in this set is off every
 * leaderboard, ranking and score list the site renders.
 */
export async function eligiblePlayerIds(): Promise<Set<string>> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from players
    where staff_role = 'player' and ingame_role = 'none'
  `;
  return new Set(rows.map((row) => row.id));
}

/**
 * The write-side guard. Every path that moves a score goes through this, so a
 * staff seat or an in-game admin can never reach the write even if a caller
 * forgets to check.
 */
export async function guardScoreUpdate<T>(
  playerId: string,
  apply: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; status: number; error: string }> {
  const eligibility = await scoreEligibility(playerId);
  // An unknown KOBAid owns no score row, so there is nothing to protect.
  if (eligibility === null) return { ok: true, value: await apply() };
  if (!eligibility.eligible && eligibility.reason === "staff") {
    return { ok: false, status: 403, error: "Internal staff seats are not scored." };
  }
  if (!eligibility.eligible) {
    return { ok: false, status: 403, error: "This identity holds in-game admin, owner or moderator permissions." };
  }
  return { ok: true, value: await apply() };
}

import { getSql } from "@/lib/db";
import { eligiblePlayerIds } from "@/lib/competition/eligibility.server";
import type { Identity } from "@/platform/engine";

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asHomes(value: unknown): Identity["homes"] {
  if (Array.isArray(value)) return value as Identity["homes"];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asGameHours(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, number>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function mapRowToIdentity(row: Record<string, unknown>): Identity {
  return {
    id: String(row.id),
    name: String(row.display_name),
    handle: String(row.handle),
    region: (row.region as Identity["region"]) ?? "NA",
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    bannerUrl: row.banner_url ? String(row.banner_url) : undefined,
    kobaTag: row.koba_tag ? String(row.koba_tag) : undefined,
    accountType: row.account_type ? String(row.account_type) : undefined,
    platform: row.platform ? String(row.platform) : undefined,
    interests: asStringArray(row.interests),
    score: Number(row.score ?? 0),
    form: "steady",
    scoreDelta: 0,
    badges: [],
    steamId: row.steam_id ? String(row.steam_id) : undefined,
    discordId: row.discord_id ? String(row.discord_id) : undefined,
    xboxId: row.xbox_xuid ? String(row.xbox_xuid) : undefined,
    coins: Number(row.coins ?? 0),
    gameHours: asGameHours(row.games),
    claimed: row.claimed !== false,
    warnings: Number(row.warnings ?? 0),
    strikes: Number(row.strikes ?? 0),
    status: (row.status as Identity["status"]) ?? "clear",
    clanId: row.clan_id ? String(row.clan_id) : undefined,
    homes: asHomes(row.homes),
    rivals: asStringArray(row.rivals),
  };
}

/**
 * Real players, mapped onto the simulated engine's Identity shape (see engine.ts:53) so its pure ranking/combat math keeps working unmodified.
 *
 * Staff seats and identities holding in-game admin/owner/moderator are dropped
 * before the rows leave the server - the board never renders them at all, so no
 * caller can accidentally rank one.
 */
export async function loadRealIdentities(): Promise<Identity[]> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select * from players order by ordinal`;
  const eligible = await eligiblePlayerIds();
  return rows.filter((row) => eligible.has(String(row.id))).map(mapRowToIdentity);
}

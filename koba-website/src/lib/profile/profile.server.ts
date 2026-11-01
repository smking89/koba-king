import { getSql } from "@/lib/db";
import { checkImageDataUrl } from "@/lib/images";

/** Neutral playstyle vector for a brand-new real player with no telemetry yet - see engine/types.ts's "below 8 plays the prior takes over" comment. */
const NEUTRAL_VECTOR = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

const REGION_IDS = ["NA", "EU", "APAC", "OCE", "LATAM", "AFR"] as const;

export const ACCOUNT_TYPES = ["player", "business"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const PLAY_PLATFORMS = ["pc", "console", "both"] as const;
export type PlayPlatform = (typeof PLAY_PLATFORMS)[number];

/** Hashtags a new account can follow; stored lowercase, without the "#". */
export const INTEREST_TAGS = [
  "rust",
  "dayz",
  "ark",
  "minecraft",
  "pvp",
  "survival",
  "raiding",
  "roleplay",
  "basebuilding",
  "clans",
  "trading",
  "esports",
] as const;

/** jsonb comes back as an array (pg) or a JSON string (PGlite text), so accept both. */
function asInterests(value: unknown): string[] {
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

export interface MyProfile {
  id: string;
  handle: string;
  displayName: string;
  region: string;
  score: number;
  clanId: string | null;
  kobaTag: string | null;
  onboarded: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** "player" or "business" - chosen during account creation. */
  accountType: AccountType;
  /** Where they play: "pc", "console" or "both". */
  platform: PlayPlatform;
  /** Hashtags picked at sign-up, stored without the leading "#". */
  interests: string[];
}

function handleFrom(email: string | null, displayName: string | null, userId: string): string {
  const source = email?.split("@")[0] ?? displayName ?? userId;
  const cleaned = source.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
  return cleaned || `player${userId.slice(0, 8)}`;
}

const TAG_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O - easy to misread
const TAG_DIGITS = "23456789"; // no 0/1 - easy to misread
const TAG_SYMBOLS = "#*-+";

function pick(set: string): string {
  return set[Math.floor(Math.random() * set.length)]!;
}

/** 5 characters: fixed leading "K", then a shuffled mix guaranteeing at least one letter, one digit, and one symbol among the remaining four. */
function generateKobaTag(): string {
  const rest = [pick(TAG_LETTERS), pick(TAG_DIGITS), pick(TAG_SYMBOLS), pick(TAG_LETTERS + TAG_DIGITS)];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return `K${rest.join("")}`;
}

async function uniqueKobaTag(sql: Awaited<ReturnType<typeof getSql>>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tag = generateKobaTag();
    const taken = await sql<{ koba_tag: string }>`select koba_tag from players where koba_tag = ${tag}`;
    if (taken.length === 0) return tag;
  }
  // Astronomically unlikely with a 10-try loop over a ~6M-combination space, but fall back to a wider retry rather than ever throwing.
  return generateKobaTag() + pick(TAG_DIGITS);
}

/** Backfills players.xbox_xuid from Better Auth's own account table - sign-in via Xbox only creates a `user`/`account` row, it never touches `players`, so without this the settings page shows "Not linked" even though that's literally how the player signed up. Idempotent, safe to run on every call. (Steam sign-in was removed - Rust Console Edition has no Steam accounts.) */
async function syncProviderLinks(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<void> {
  const accounts = await sql<{ providerId: string; accountId: string }>`
    select "providerId", "accountId" from "account" where "userId" = ${userId} and "providerId" = 'xbox'
  `;
  for (const account of accounts) {
    await sql`update players set xbox_xuid = coalesce(xbox_xuid, ${account.accountId}) where id = ${userId}`;
  }
}

/** Google/X/Xbox all return a real avatar URL on sign-in, captured by Better Auth onto "user".image - copies it onto the players row the rest of the app actually reads from, without clobbering an avatar the player already has stored. */
async function syncAvatar(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<void> {
  const rows = await sql<{ image: string | null }>`select "image" from "user" where "id" = ${userId}`;
  const image = rows[0]?.image;
  if (image) await sql`update players set avatar_url = coalesce(avatar_url, ${image}) where id = ${userId}`;
}

function toProfile(row: {
  id: string;
  handle: string;
  display_name: string;
  region: string;
  score: number;
  clan_id: string | null;
  koba_tag: string | null;
  onboarded: boolean;
  avatar_url: string | null;
  banner_url: string | null;
  account_type: string;
  platform: string;
  interests: unknown;
}): MyProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    region: row.region,
    score: row.score,
    clanId: row.clan_id,
    kobaTag: row.koba_tag,
    onboarded: row.onboarded,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    accountType: (ACCOUNT_TYPES as readonly string[]).includes(row.account_type) ? (row.account_type as AccountType) : "player",
    platform: (PLAY_PLATFORMS as readonly string[]).includes(row.platform) ? (row.platform as PlayPlatform) : "both",
    interests: asInterests(row.interests),
  };
}

/**
 * Reuses Pulse's `players` table (migrations/0002_pulse.sql) as the single
 * canonical identity table for the whole app, not just the Pulse product -
 * see the data-migration plan. Row is created once, on first real sign-in;
 * every call after that backfills provider links and returns the row as-is.
 */
export async function ensurePlayerProfile(userId: string, seed: { email: string | null; displayName: string | null }): Promise<MyProfile> {
  const sql = await getSql();
  const existing = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
    select id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests from players where id = ${userId}
  `;
  if (existing[0]) {
    await syncProviderLinks(sql, userId);
    await syncAvatar(sql, userId);
    const refreshed = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
      select id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests from players where id = ${userId}
    `;
    return toProfile(refreshed[0]!);
  }
  const handle = handleFrom(seed.email, seed.displayName, userId);
  const displayName = seed.displayName ?? handle;
  const kobaTag = await uniqueKobaTag(sql);
  const inserted = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
    insert into players (id, handle, display_name, region, vector, score, koba_tag, onboarded)
    values (${userId}, ${handle}, ${displayName}, 'NA', ${NEUTRAL_VECTOR}, 0, ${kobaTag}, false)
    on conflict (id) do update set id = excluded.id
    returning id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests
  `;
  await syncProviderLinks(sql, userId);
  await syncAvatar(sql, userId);
  // Real signup moment (row just created, not a repeat sign-in) - send the
  // welcome email. Xbox/Google/X all return a real email.
  if (seed.email) {
    const { sendTemplateEmail } = await import("@/lib/email/send.server");
    void sendTemplateEmail("support-welcome", seed.email, { player_name: displayName }).catch(() => {});
  }
  const refreshed = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
    select id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests from players where id = ${userId}
  `;
  return toProfile(refreshed[0] ?? inserted[0]!);
}

export interface OnboardingChoices {
  handle: string;
  region: string;
  accountType: string;
  platform: string;
  interests: string[];
}

/** Lowercases, de-dupes and drops anything outside the published hashtag list. */
export function cleanInterests(input: unknown): string[] {
  const list = Array.isArray(input) ? input.map(String) : [];
  const allowed = INTEREST_TAGS as readonly string[];
  return [...new Set(list.map((tag) => tag.trim().toLowerCase().replace(/^#/, "")))].filter((tag) => allowed.includes(tag));
}

export async function completeOnboarding(userId: string, input: OnboardingChoices): Promise<MyProfile | { error: string }> {
  const handle = input.handle.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,15}$/.test(handle)) return { error: "3 to 16 characters. Start with a letter. Letters, numbers, underscore." };
  if (!REGION_IDS.includes(input.region as (typeof REGION_IDS)[number])) return { error: "Pick a region." };
  if (!(ACCOUNT_TYPES as readonly string[]).includes(input.accountType)) return { error: "Choose a player or business account." };
  if (!(PLAY_PLATFORMS as readonly string[]).includes(input.platform)) return { error: "Choose where you play." };
  const interests = cleanInterests(input.interests);
  if (interests.length < 4) return { error: "Pick at least four interests." };
  const sql = await getSql();
  const taken = await sql<{ id: string }>`select id from players where handle = ${handle} and id <> ${userId}`;
  if (taken.length > 0) return { error: "That username is taken." };
  const updated = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
    update players
    set handle = ${handle},
        region = ${input.region},
        account_type = ${input.accountType},
        platform = ${input.platform},
        interests = ${JSON.stringify(interests)}::jsonb,
        onboarded = true
    where id = ${userId}
    returning id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests
  `;
  if (!updated[0]) return { error: "Account not found." };
  return toProfile(updated[0]);
}

/** Username and region are editable after onboarding too - this is the real persistence behind the Settings page's "Username" field and region picker (previously a Zustand-only rename that reverted on reload). Either field can be updated independently. */
export async function updateProfile(userId: string, input: { handle?: string; region?: string }): Promise<MyProfile | { error: string }> {
  const sql = await getSql();
  if (input.handle !== undefined) {
    const handle = input.handle.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,15}$/.test(handle)) return { error: "3 to 16 characters. Start with a letter. Letters, numbers, underscore." };
    const taken = await sql<{ id: string }>`select id from players where handle = ${handle} and id <> ${userId}`;
    if (taken.length > 0) return { error: "That username is taken." };
    await sql`update players set handle = ${handle} where id = ${userId}`;
  }
  if (input.region !== undefined) {
    if (!REGION_IDS.includes(input.region as (typeof REGION_IDS)[number])) return { error: "Pick a region." };
    await sql`update players set region = ${input.region} where id = ${userId}`;
  }
  const updated = await sql<{ id: string; handle: string; display_name: string; region: string; score: number; clan_id: string | null; koba_tag: string | null; onboarded: boolean; avatar_url: string | null; banner_url: string | null; account_type: string; platform: string; interests: unknown }>`
    select id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests from players where id = ${userId}
  `;
  if (!updated[0]) return { error: "Account not found." };
  return toProfile(updated[0]);
}

export async function checkHandleAvailable(userId: string, handle: string): Promise<{ available: boolean; reason?: string }> {
  const cleaned = handle.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,15}$/.test(cleaned)) return { available: false, reason: "3-16 chars, start with a letter" };
  const sql = await getSql();
  const taken = await sql<{ id: string }>`select id from players where handle = ${cleaned} and id <> ${userId}`;
  return taken.length > 0 ? { available: false, reason: "Already taken" } : { available: true };
}

/**
 * Avatar and banner uploads for any player, not just clan owners. Both arrive as
 * PNG/JPEG/GIF data URLs from the profile editor; `null` clears a picture.
 */
export async function updateProfileImages(
  userId: string,
  input: { avatarUrl?: string | null; bannerUrl?: string | null },
): Promise<MyProfile | { error: string }> {
  const sql = await getSql();
  if (input.avatarUrl !== undefined) {
    const checked = checkImageDataUrl(input.avatarUrl);
    if (!checked.ok) return { error: checked.error };
    await sql`update players set avatar_url = ${checked.value} where id = ${userId}`;
  }
  if (input.bannerUrl !== undefined) {
    const checked = checkImageDataUrl(input.bannerUrl);
    if (!checked.ok) return { error: checked.error };
    await sql`update players set banner_url = ${checked.value} where id = ${userId}`;
  }
  const rows = await sql<{
    id: string;
    handle: string;
    display_name: string;
    region: string;
    score: number;
    clan_id: string | null;
    koba_tag: string | null;
    onboarded: boolean;
    avatar_url: string | null;
    banner_url: string | null;
    account_type: string;
    platform: string;
    interests: unknown;
  }>`
    select id, handle, display_name, region, score, clan_id, koba_tag, onboarded, avatar_url, banner_url, account_type, platform, interests
    from players where id = ${userId}
  `;
  if (!rows[0]) return { error: "Account not found." };
  return toProfile(rows[0]);
}

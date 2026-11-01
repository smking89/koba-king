import { getSql } from "@/lib/db";
import { checkImageDataUrl } from "@/lib/images";
import {
  GROUP_PERMISSIONS,
  MAX_RANK_POSITION,
  OWNER_POSITION,
  isGroupPermission,
  isRankIcon,
  type GroupPermission,
} from "@/site/clan-ranks";

export type GroupRole = "owner" | "member";

export interface GroupView {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  visibility: "public" | "private";
  inviteCode: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

export interface GroupRankView {
  id: string;
  groupId: string;
  name: string;
  description: string;
  icon: string;
  position: number;
  permissions: GroupPermission[];
}

export interface GroupMemberView {
  groupId: string;
  playerId: string;
  role: GroupRole;
  rankId: string | null;
}

export interface GroupMessageView {
  id: string;
  groupId: string;
  authorId: string;
  text: string;
  at: number;
}

export interface GroupsSnapshot {
  groups: GroupView[];
  ranks: GroupRankView[];
  members: GroupMemberView[];
  messages: GroupMessageView[];
}

type Actor = {
  role: GroupRole;
  rankId: string | null;
  isOwner: boolean;
  /** Authority: the owner sits at OWNER_POSITION, an unranked member at 0. */
  position: number;
  permissions: GroupPermission[];
};

type Fail = { ok: false; error: string };
type Ok = { ok: true };

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inviteCode(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parsePermissions(value: unknown): GroupPermission[] {
  const list: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return list.map(String).filter(isGroupPermission);
}

function toRank(row: {
  id: string;
  group_id: string;
  name: string;
  description: string;
  icon: string;
  position: number;
  permissions: unknown;
}): GroupRankView {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    position: Number(row.position),
    permissions: parsePermissions(row.permissions),
  };
}

/** Owner override, otherwise the union of whatever the assigned rank grants. */
function actorFor(member: { role: string; rank_id: string | null }, ranks: GroupRankView[]): Actor {
  const isOwner = member.role === "owner";
  const rank = member.rank_id ? ranks.find((item) => item.id === member.rank_id) ?? null : null;
  return {
    role: isOwner ? "owner" : "member",
    rankId: member.rank_id,
    isOwner,
    position: isOwner ? OWNER_POSITION : rank?.position ?? 0,
    permissions: isOwner ? GROUP_PERMISSIONS.map((permission) => permission.id) : rank?.permissions ?? [],
  };
}

async function ranksFor(groupId: string): Promise<GroupRankView[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    group_id: string;
    name: string;
    description: string;
    icon: string;
    position: number;
    permissions: unknown;
  }>`select id, group_id, name, description, icon, position, permissions from group_ranks where group_id = ${groupId} order by position desc, name asc`;
  return rows.map(toRank);
}

async function loadActor(groupId: string, playerId: string): Promise<Actor | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string; rank_id: string | null }>`
    select role, rank_id from group_members where group_id = ${groupId} and player_id = ${playerId}
  `;
  const member = rows[0];
  if (!member) return null;
  const ranks = member.rank_id ? await ranksFor(groupId) : [];
  return actorFor(member, ranks);
}

function can(actor: Actor, permission: GroupPermission): boolean {
  return actor.isOwner || actor.permissions.includes(permission);
}

/** Public groups are visible to everyone; private groups only to their members. */
export async function loadGroupsSnapshot(viewerId: string): Promise<GroupsSnapshot> {
  const sql = await getSql();
  const groupRows = await sql<{
    id: string;
    name: string;
    tag: string;
    owner_id: string;
    visibility: string;
    invite_code: string | null;
    avatar_url: string | null;
    banner_url: string | null;
  }>`
    select g.id, g.name, g.tag, g.owner_id, g.visibility, g.invite_code, g.avatar_url, g.banner_url
    from groups g
    where g.visibility = 'public' or exists (select 1 from group_members m where m.group_id = g.id and m.player_id = ${viewerId})
  `;
  const groupIds = groupRows.map((row) => row.id);
  const memberRows = groupIds.length
    ? await sql.query<{ group_id: string; player_id: string; role: string; rank_id: string | null }>(
        `select group_id, player_id, role, rank_id from group_members where group_id = any($1)`,
        [groupIds],
      )
    : [];
  const rankRows = groupIds.length
    ? await sql.query<{
        id: string;
        group_id: string;
        name: string;
        description: string;
        icon: string;
        position: number;
        permissions: string;
      }>(
        `select id, group_id, name, description, icon, position, permissions from group_ranks where group_id = any($1) order by position desc`,
        [groupIds],
      )
    : [];
  const messageRows = groupIds.length
    ? await sql.query<{ id: string; group_id: string; author_id: string; text: string; at: string }>(
        `select id, group_id, author_id, text, at from group_messages where group_id = any($1) order by at asc`,
        [groupIds],
      )
    : [];
  return {
    groups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      ownerId: row.owner_id,
      visibility: row.visibility === "private" ? "private" : "public",
      inviteCode: row.invite_code,
      avatarUrl: row.avatar_url,
      bannerUrl: row.banner_url,
    })),
    ranks: rankRows.map(toRank),
    members: memberRows.map((row) => ({
      groupId: row.group_id,
      playerId: row.player_id,
      role: row.role === "owner" ? "owner" : "member",
      rankId: row.rank_id,
    })),
    messages: messageRows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      authorId: row.author_id,
      text: row.text,
      at: new Date(row.at).getTime(),
    })),
  };
}

/** Starter hierarchy for a new clan: one officer rank and a base member rank. */
const STARTER_RANKS = [
  {
    name: "Officer",
    description: "Runs the roster day to day and keeps the clan settings in shape.",
    icon: "shield",
    position: 30,
    permissions: ["manage_members", "manage_clan"],
  },
  {
    name: "Member",
    description: "On the roster, in the chat, in the wars.",
    icon: "star",
    position: 10,
    permissions: [],
  },
] as const;

/** A tag the owner typed wins; anything malformed or already taken falls back to a unique one. */
async function uniqueTag(sql: Awaited<ReturnType<typeof getSql>>, wanted: string | undefined, fallback: string): Promise<string> {
  const base = (wanted ?? fallback).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const seed = base.length >= 2 ? base : `${base || "C"}X`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? seed : `${seed.slice(0, 4)}${attempt}`.slice(0, 5);
    const taken = await sql<{ id: string }>`select id from groups where tag = ${candidate}`;
    if (taken.length === 0) return candidate;
  }
  return `${seed.slice(0, 3)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 5);
}

export async function createRealGroup(
  ownerId: string,
  name: string,
  visibility: "public" | "private",
  tag?: string,
): Promise<string> {
  const sql = await getSql();
  const trimmed = name.trim().slice(0, 24) || "New clan";
  const groupId = nextId("grp");
  const code = visibility === "private" ? inviteCode() : null;
  const clanTag = await uniqueTag(sql, tag, trimmed.slice(0, 3));
  await sql`
    insert into groups (id, name, tag, owner_id, visibility, invite_code)
    values (${groupId}, ${trimmed}, ${clanTag}, ${ownerId}, ${visibility}, ${code})
  `;
  await sql`insert into group_members (group_id, player_id, role) values (${groupId}, ${ownerId}, 'owner')`;
  for (const rank of STARTER_RANKS) {
    await sql`
      insert into group_ranks (id, group_id, name, description, icon, position, permissions)
      values (${nextId("rnk")}, ${groupId}, ${rank.name}, ${rank.description}, ${rank.icon}, ${rank.position}, ${JSON.stringify(rank.permissions)})
    `;
  }
  return groupId;
}

export async function joinRealGroup(groupId: string, playerId: string, providedInviteCode?: string): Promise<Ok | Fail> {
  const sql = await getSql();
  const groupRows = await sql<{ visibility: string; invite_code: string | null }>`select visibility, invite_code from groups where id = ${groupId}`;
  const group = groupRows[0];
  if (!group) return { ok: false, error: "Group not found." };
  if (group.visibility === "private" && group.invite_code !== providedInviteCode) {
    return { ok: false, error: "This group is invite-only - a valid invite link is required." };
  }
  await sql`
    insert into group_members (group_id, player_id, role) values (${groupId}, ${playerId}, 'member')
    on conflict (group_id, player_id) do nothing
  `;
  return { ok: true };
}

/** Owner only: removes the clan, its roster, ranks and chat in one cascade. */
export async function deleteRealGroup(groupId: string, actorId: string): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor) return { ok: false, error: "Not a member of this clan." };
  if (!actor.isOwner) return { ok: false, error: "Only the clan owner can delete the clan." };
  const sql = await getSql();
  await sql`delete from groups where id = ${groupId}`;
  return { ok: true };
}

export async function regenerateInvite(groupId: string, actorId: string): Promise<{ ok: true; inviteCode: string } | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_clan")) return { ok: false, error: "You don't have permission to manage invites." };
  const sql = await getSql();
  const code = inviteCode();
  await sql`update groups set invite_code = ${code}, visibility = 'private' where id = ${groupId}`;
  return { ok: true, inviteCode: code };
}

export async function setGroupVisibility(groupId: string, actorId: string, visibility: "public" | "private"): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_clan")) return { ok: false, error: "You don't have permission to change visibility." };
  const sql = await getSql();
  if (visibility === "private") {
    await sql`update groups set visibility = 'private', invite_code = coalesce(invite_code, ${inviteCode()}) where id = ${groupId}`;
  } else {
    await sql`update groups set visibility = 'public' where id = ${groupId}`;
  }
  return { ok: true };
}

/** Clan name, tag, avatar and banner — the identity block on the clan page. */
export async function updateGroupIdentity(
  groupId: string,
  actorId: string,
  patch: { name?: string; tag?: string; avatarUrl?: string | null; bannerUrl?: string | null },
): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_clan")) return { ok: false, error: "You don't have permission to edit this clan." };
  const sql = await getSql();
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 24);
    if (name.length < 2) return { ok: false, error: "Clan names are 2–24 characters." };
    await sql`update groups set name = ${name} where id = ${groupId}`;
  }
  if (patch.tag !== undefined) {
    const tag = patch.tag.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) return { ok: false, error: "A clan tag is 2–5 letters or numbers." };
    const taken = await sql<{ id: string }>`select id from groups where tag = ${tag} and id <> ${groupId}`;
    if (taken.length > 0) return { ok: false, error: "That clan tag is already in use." };
    await sql`update groups set tag = ${tag} where id = ${groupId}`;
  }
  if (patch.avatarUrl !== undefined) {
    const checked = checkImageDataUrl(patch.avatarUrl);
    if (!checked.ok) return checked;
    await sql`update groups set avatar_url = ${checked.value} where id = ${groupId}`;
  }
  if (patch.bannerUrl !== undefined) {
    const checked = checkImageDataUrl(patch.bannerUrl);
    if (!checked.ok) return checked;
    await sql`update groups set banner_url = ${checked.value} where id = ${groupId}`;
  }
  return { ok: true };
}

function normalizePermissions(value: unknown): GroupPermission[] | null {
  if (!Array.isArray(value)) return null;
  const permissions = value.map(String).filter(isGroupPermission);
  return permissions.length === value.length ? Array.from(new Set(permissions)) : null;
}

function validatePosition(value: number, actorPosition: number): number | null {
  if (!Number.isFinite(value)) return null;
  const position = Math.round(value);
  if (position < 1 || position > MAX_RANK_POSITION) return null;
  if (position >= actorPosition) return null;
  return position;
}

export async function createRank(
  groupId: string,
  actorId: string,
  input: { name: string; description: string; icon: string; position: number; permissions: string[] },
): Promise<{ ok: true; rank: GroupRankView } | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_ranks")) return { ok: false, error: "You don't have permission to create ranks." };
  const name = input.name.trim().slice(0, 24);
  if (name.length < 2) return { ok: false, error: "Rank names are 2–24 characters." };
  const description = input.description.trim().slice(0, 140);
  if (!isRankIcon(input.icon)) return { ok: false, error: "Pick a badge for the rank." };
  const position = validatePosition(input.position, actor.position);
  if (position === null) return { ok: false, error: "Authority must be below your own rank." };
  const permissions = normalizePermissions(input.permissions);
  if (!permissions) return { ok: false, error: "One of those permissions is unknown." };
  const sql = await getSql();
  const id = nextId("rnk");
  await sql`
    insert into group_ranks (id, group_id, name, description, icon, position, permissions)
    values (${id}, ${groupId}, ${name}, ${description}, ${input.icon}, ${position}, ${JSON.stringify(permissions)})
  `;
  return {
    ok: true,
    rank: { id, groupId, name, description, icon: input.icon, position, permissions },
  };
}

export async function updateRank(
  groupId: string,
  actorId: string,
  rankId: string,
  patch: { name?: string; description?: string; icon?: string; position?: number; permissions?: string[] },
): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_ranks")) return { ok: false, error: "You don't have permission to edit ranks." };
  const ranks = await ranksFor(groupId);
  const existing = ranks.find((rank) => rank.id === rankId);
  if (!existing) return { ok: false, error: "That rank is gone." };
  if (existing.position >= actor.position) return { ok: false, error: "You can only edit ranks below your own." };
  const sql = await getSql();
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 24);
    if (name.length < 2) return { ok: false, error: "Rank names are 2–24 characters." };
    await sql`update group_ranks set name = ${name} where id = ${rankId}`;
  }
  if (patch.description !== undefined) {
    await sql`update group_ranks set description = ${patch.description.trim().slice(0, 140)} where id = ${rankId}`;
  }
  if (patch.icon !== undefined) {
    if (!isRankIcon(patch.icon)) return { ok: false, error: "Pick a badge for the rank." };
    await sql`update group_ranks set icon = ${patch.icon} where id = ${rankId}`;
  }
  if (patch.position !== undefined) {
    const position = validatePosition(patch.position, actor.position);
    if (position === null) return { ok: false, error: "Authority must be below your own rank." };
    await sql`update group_ranks set position = ${position} where id = ${rankId}`;
  }
  if (patch.permissions !== undefined) {
    const permissions = normalizePermissions(patch.permissions);
    if (!permissions) return { ok: false, error: "One of those permissions is unknown." };
    await sql`update group_ranks set permissions = ${JSON.stringify(permissions)} where id = ${rankId}`;
  }
  return { ok: true };
}

export async function deleteRank(groupId: string, actorId: string, rankId: string): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_ranks")) return { ok: false, error: "You don't have permission to delete ranks." };
  const ranks = await ranksFor(groupId);
  const existing = ranks.find((rank) => rank.id === rankId);
  if (!existing) return { ok: false, error: "That rank is gone." };
  if (existing.position >= actor.position) return { ok: false, error: "You can only delete ranks below your own." };
  const sql = await getSql();
  await sql`delete from group_ranks where id = ${rankId}`;
  return { ok: true };
}

/** Assign a rank (or clear it) — the promote/demote path. */
export async function assignRank(
  groupId: string,
  actorId: string,
  targetId: string,
  rankId: string | null,
): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_members")) return { ok: false, error: "You don't have permission to change ranks." };
  if (targetId === actorId) return { ok: false, error: "You can't change your own rank." };
  const ranks = await ranksFor(groupId);
  const sql = await getSql();
  const rows = await sql<{ role: string; rank_id: string | null }>`
    select role, rank_id from group_members where group_id = ${groupId} and player_id = ${targetId}
  `;
  const target = rows[0];
  if (!target) return { ok: false, error: "Not a member of this clan." };
  if (target.role === "owner") return { ok: false, error: "The owner's rank can't be changed." };
  const targetActor = actorFor(target, ranks);
  if (targetActor.position >= actor.position) return { ok: false, error: "That member is at or above your rank." };
  if (rankId) {
    const rank = ranks.find((item) => item.id === rankId);
    if (!rank) return { ok: false, error: "That rank is gone." };
    if (rank.position >= actor.position) return { ok: false, error: "You can only hand out ranks below your own." };
  }
  await sql`update group_members set rank_id = ${rankId} where group_id = ${groupId} and player_id = ${targetId}`;
  return { ok: true };
}

export async function removeMember(groupId: string, actorId: string, targetId: string): Promise<Ok | Fail> {
  const actor = await loadActor(groupId, actorId);
  if (!actor || !can(actor, "manage_members")) return { ok: false, error: "You don't have permission to remove members." };
  const ranks = await ranksFor(groupId);
  const sql = await getSql();
  const rows = await sql<{ role: string; rank_id: string | null }>`
    select role, rank_id from group_members where group_id = ${groupId} and player_id = ${targetId}
  `;
  const target = rows[0];
  if (!target) return { ok: false, error: "Not a member of this clan." };
  if (target.role === "owner") return { ok: false, error: "The owner can't be removed." };
  const targetActor = actorFor(target, ranks);
  if (targetActor.position >= actor.position) return { ok: false, error: "That member is at or above your rank." };
  await sql`delete from group_members where group_id = ${groupId} and player_id = ${targetId}`;
  return { ok: true };
}

export async function postRealRoom(groupId: string, authorId: string, text: string): Promise<{ ok: true; message: GroupMessageView } | Fail> {
  const actor = await loadActor(groupId, authorId);
  if (!actor) return { ok: false, error: "Join the group to post." };
  const sql = await getSql();
  const id = nextId("gm");
  const trimmed = text.trim().slice(0, 240);
  await sql`insert into group_messages (id, group_id, author_id, text) values (${id}, ${groupId}, ${authorId}, ${trimmed})`;
  return { ok: true, message: { id, groupId, authorId, text: trimmed, at: Date.now() } };
}

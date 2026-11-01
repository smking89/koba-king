import { getSql } from "@/lib/db";

export type FollowPolicy = "everyone" | "friends_of_friends" | "no_one";
export type InvitePolicy = "everyone" | "friends_only" | "no_one";
export type DmPolicy = "everyone" | "friends_only";
export type PresenceStatus = "online" | "away" | "invisible";

export interface FollowRow {
  followeeId: string;
  isFavorite: boolean;
  alias: string | null;
}

export interface TagView {
  id: string;
  label: string;
  memberIds: string[];
}

export interface SocialGraph {
  follows: FollowRow[];
  blocked: string[];
  tags: TagView[];
  friendRequestPolicy: FollowPolicy;
  groupInvitePolicy: InvitePolicy;
  dmPolicy: DmPolicy;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadSocialGraph(viewerId: string): Promise<SocialGraph> {
  const sql = await getSql();
  const [followRows, blockRows, tagRows, memberRows, policyRows] = await Promise.all([
    sql<{ followee_id: string; is_favorite: boolean; alias: string | null }>`
      select followee_id, is_favorite, alias from follows where follower_id = ${viewerId}
    `,
    sql<{ blocked_id: string }>`select blocked_id from blocks where blocker_id = ${viewerId}`,
    sql<{ id: string; label: string }>`select id, label from friend_tags where owner_id = ${viewerId} order by ordinal`,
    sql<{ tag_id: string; player_id: string }>`
      select m.tag_id, m.player_id from friend_tag_members m
      join friend_tags t on t.id = m.tag_id
      where t.owner_id = ${viewerId}
    `,
    sql<{ friend_request_policy: FollowPolicy; group_invite_policy: InvitePolicy; dm_policy: DmPolicy }>`
      select friend_request_policy, group_invite_policy, dm_policy from players where id = ${viewerId}
    `,
  ]);
  const tags = tagRows.map((tag) => ({
    id: tag.id,
    label: tag.label,
    memberIds: memberRows.filter((m) => m.tag_id === tag.id).map((m) => m.player_id),
  }));
  const policy = policyRows[0];
  return {
    follows: followRows.map((row) => ({ followeeId: row.followee_id, isFavorite: row.is_favorite, alias: row.alias })),
    blocked: blockRows.map((row) => row.blocked_id),
    tags,
    friendRequestPolicy: policy?.friend_request_policy ?? "everyone",
    groupInvitePolicy: policy?.group_invite_policy ?? "everyone",
    dmPolicy: policy?.dm_policy ?? "everyone",
  };
}

/** Mutual-contact check for the "friends_of_friends" friend-request policy. */
async function hasMutualFriend(sql: Awaited<ReturnType<typeof getSql>>, a: string, b: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    select f1.followee_id as id from follows f1
    join follows f2 on f2.followee_id = f1.followee_id
    where f1.follower_id = ${a} and f2.follower_id = ${b}
    limit 1
  `;
  return rows.length > 0;
}

export async function toggleFollow(followerId: string, followeeId: string): Promise<{ ok: true; following: boolean } | { ok: false; reason: string }> {
  if (followerId === followeeId) return { ok: false, reason: "You can't follow yourself." };
  const sql = await getSql();
  const existing = await sql<{ follower_id: string }>`select follower_id from follows where follower_id = ${followerId} and followee_id = ${followeeId}`;
  if (existing.length > 0) {
    await sql`delete from follows where follower_id = ${followerId} and followee_id = ${followeeId}`;
    return { ok: true, following: false };
  }
  const policyRows = await sql<{ friend_request_policy: FollowPolicy }>`select friend_request_policy from players where id = ${followeeId}`;
  const policy = policyRows[0]?.friend_request_policy ?? "everyone";
  if (policy === "no_one") return { ok: false, reason: "This player isn't accepting new follows." };
  if (policy === "friends_of_friends" && !(await hasMutualFriend(sql, followerId, followeeId))) {
    return { ok: false, reason: "This player only accepts requests from mutual contacts." };
  }
  await sql`insert into follows (follower_id, followee_id) values (${followerId}, ${followeeId}) on conflict (follower_id, followee_id) do nothing`;
  return { ok: true, following: true };
}

export async function setFavorite(followerId: string, followeeId: string, favorite: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sql = await getSql();
  const result = await sql`update follows set is_favorite = ${favorite} where follower_id = ${followerId} and followee_id = ${followeeId}`;
  void result;
  return { ok: true };
}

export async function setAlias(followerId: string, followeeId: string, alias: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cleaned = alias.trim().slice(0, 32);
  const sql = await getSql();
  await sql`update follows set alias = ${cleaned || null} where follower_id = ${followerId} and followee_id = ${followeeId}`;
  return { ok: true };
}

export async function blockPlayer(blockerId: string, blockedId: string): Promise<{ ok: true }> {
  const sql = await getSql();
  await sql`insert into blocks (blocker_id, blocked_id) values (${blockerId}, ${blockedId}) on conflict (blocker_id, blocked_id) do nothing`;
  await sql`delete from follows where (follower_id = ${blockerId} and followee_id = ${blockedId}) or (follower_id = ${blockedId} and followee_id = ${blockerId})`;
  return { ok: true };
}

export async function unblockPlayer(blockerId: string, blockedId: string): Promise<{ ok: true }> {
  const sql = await getSql();
  await sql`delete from blocks where blocker_id = ${blockerId} and blocked_id = ${blockedId}`;
  return { ok: true };
}

export async function createTag(ownerId: string, label: string): Promise<TagView | { error: string }> {
  const cleaned = label.trim().slice(0, 24);
  if (!cleaned) return { error: "Name your tag first." };
  const sql = await getSql();
  const id = nextId("tag");
  const countRows = await sql<{ count: number }>`select count(*)::int as count from friend_tags where owner_id = ${ownerId}`;
  await sql`insert into friend_tags (id, owner_id, label, ordinal) values (${id}, ${ownerId}, ${cleaned}, ${countRows[0]?.count ?? 0})`;
  return { id, label: cleaned, memberIds: [] };
}

export async function deleteTag(ownerId: string, tagId: string): Promise<{ ok: true }> {
  const sql = await getSql();
  await sql`delete from friend_tags where id = ${tagId} and owner_id = ${ownerId}`;
  return { ok: true };
}

export async function setTagMember(ownerId: string, tagId: string, playerId: string, on: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sql = await getSql();
  const owns = await sql<{ id: string }>`select id from friend_tags where id = ${tagId} and owner_id = ${ownerId}`;
  if (owns.length === 0) return { ok: false, reason: "Tag not found." };
  if (on) {
    await sql`insert into friend_tag_members (tag_id, player_id) values (${tagId}, ${playerId}) on conflict (tag_id, player_id) do nothing`;
  } else {
    await sql`delete from friend_tag_members where tag_id = ${tagId} and player_id = ${playerId}`;
  }
  return { ok: true };
}

export async function setPrivacyPolicies(
  playerId: string,
  input: { friendRequestPolicy?: FollowPolicy; groupInvitePolicy?: InvitePolicy; dmPolicy?: DmPolicy },
): Promise<{ ok: true }> {
  const sql = await getSql();
  if (input.friendRequestPolicy) await sql`update players set friend_request_policy = ${input.friendRequestPolicy} where id = ${playerId}`;
  if (input.groupInvitePolicy) await sql`update players set group_invite_policy = ${input.groupInvitePolicy} where id = ${playerId}`;
  if (input.dmPolicy) await sql`update players set dm_policy = ${input.dmPolicy} where id = ${playerId}`;
  return { ok: true };
}

/** Called on an interval while the app is open - real heartbeat, not a guess. `status` is the user's own online/away/invisible toggle. */
export async function pingPresence(playerId: string, status: PresenceStatus): Promise<{ ok: true }> {
  const sql = await getSql();
  await sql`update players set presence_status = ${status}, last_seen_at = now() where id = ${playerId}`;
  return { ok: true };
}

export interface PresenceView {
  id: string;
  status: PresenceStatus | "offline";
  lastSeenAt: string | null;
}

const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export async function loadPresence(ids: string[]): Promise<PresenceView[]> {
  if (ids.length === 0) return [];
  const sql = await getSql();
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.query<{ id: string; presence_status: PresenceStatus; last_seen_at: string | null }>(
    `select id, presence_status, last_seen_at from players where id in (${placeholders})`,
    ids,
  );
  return rows.map((row) => {
    const recent = row.last_seen_at ? Date.now() - new Date(row.last_seen_at).getTime() < ONLINE_WINDOW_MS : false;
    const status: PresenceView["status"] = !recent ? "offline" : row.presence_status === "invisible" ? "offline" : row.presence_status;
    return { id: row.id, status, lastSeenAt: row.last_seen_at };
  });
}

import { getSql } from "@/lib/db";
import type { DirectMessage, DirectThread } from "@/site/community";

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listMyThreads(kobaId: string): Promise<DirectThread[]> {
  const sql = await getSql();
  const threadRows = await sql<{ id: string; player_a: string; player_b: string }>`
    select id, player_a, player_b from direct_threads where player_a = ${kobaId} or player_b = ${kobaId}
  `;
  const messageRows = await sql<{
    id: string;
    thread_id: string;
    author_id: string;
    text: string;
    sticker: string | null;
    pack_title: string | null;
    kind: string;
    payload: string | null;
    at: string;
  }>`
    select m.id, m.thread_id, m.author_id, m.text, m.sticker, m.pack_title, m.kind, m.payload, m.at
    from direct_messages m
    join direct_threads t on t.id = m.thread_id
    where t.player_a = ${kobaId} or t.player_b = ${kobaId}
    order by m.at asc
  `;
  return threadRows.map((thread) => ({
    id: thread.id,
    a: thread.player_a,
    b: thread.player_b,
    messages: messageRows
      .filter((row) => row.thread_id === thread.id)
      .map(
        (row): DirectMessage => ({
          id: row.id,
          authorId: row.author_id,
          text: row.text,
          sticker: row.sticker ?? undefined,
          packTitle: row.pack_title ?? undefined,
          kind: row.kind as DirectMessage["kind"],
          payload: row.payload ?? undefined,
          at: new Date(row.at).getTime(),
        }),
      ),
  }));
}

export async function openRealThread(selfId: string, otherId: string): Promise<{ ok: true; threadId: string } | { ok: false; reason: string }> {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`
    select id from direct_threads
    where least(player_a, player_b) = least(${selfId}, ${otherId}) and greatest(player_a, player_b) = greatest(${selfId}, ${otherId})
  `;
  if (existing[0]) return { ok: true, threadId: existing[0].id };
  const policyRows = await sql<{ dm_policy: "everyone" | "friends_only" }>`select dm_policy from players where id = ${otherId}`;
  if (policyRows[0]?.dm_policy === "friends_only") {
    const related = await sql<{ follower_id: string }>`
      select follower_id from follows
      where (follower_id = ${otherId} and followee_id = ${selfId}) or (follower_id = ${selfId} and followee_id = ${otherId})
    `;
    if (related.length === 0) return { ok: false, reason: "This player only accepts messages from their friends list." };
  }
  const id = nextId("dm-thread");
  await sql`insert into direct_threads (id, player_a, player_b) values (${id}, ${selfId}, ${otherId})`;
  return { ok: true, threadId: id };
}

export async function sendRealDirect(
  threadId: string,
  authorId: string,
  text: string,
  sticker?: { name: string; packTitle: string },
  extra?: { kind?: DirectMessage["kind"]; payload?: string },
): Promise<DirectMessage> {
  const sql = await getSql();
  const id = nextId("dm-msg");
  const kind = extra?.kind ?? (sticker ? "sticker" : "text");
  await sql`
    insert into direct_messages (id, thread_id, author_id, text, sticker, pack_title, kind, payload)
    values (${id}, ${threadId}, ${authorId}, ${text.trim().slice(0, 240)}, ${sticker?.name ?? null}, ${sticker?.packTitle ?? null}, ${kind}, ${extra?.payload ?? null})
  `;
  return { id, authorId, text: text.trim().slice(0, 240), sticker: sticker?.name, packTitle: sticker?.packTitle, kind, payload: extra?.payload, at: Date.now() };
}

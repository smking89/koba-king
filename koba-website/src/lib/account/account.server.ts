import { getSql } from "@/lib/db";

/**
 * Plain-text export of everything real we actually store for this player -
 * no "match history" or "transaction receipts" sections, because this app
 * has no real match-telemetry log or payment-receipt table yet. Exporting
 * placeholder sections for those would be exactly the fake-data problem this
 * project has spent weeks removing; the export only ever contains rows that
 * exist in Postgres for this exact user.
 */
export async function exportPlayerData(userId: string): Promise<string> {
  const sql = await getSql();
  const [profile, scores, badges, ownedGroups, memberGroups, directMessages, groupMessages] = await Promise.all([
    sql<Record<string, unknown>>`select handle, display_name, region, score, coins from players where id = ${userId}`,
    sql<{ game_id: string; normalized_score: number }>`select game_id, normalized_score from koba_scores where player_id = ${userId}`,
    sql<{ display_name: string; tier: string; unlocked_at: string }>`
      select r.display_name, r.tier, b.unlocked_at from player_badges b
      join badge_registry r on r.badge_id = b.badge_id
      where b.koba_id = ${userId} order by b.unlocked_at
    `,
    sql<{ name: string; visibility: string }>`select name, visibility from groups where owner_id = ${userId}`,
    sql<{ name: string; role: string }>`
      select g.name, m.role from group_members m join groups g on g.id = m.group_id where m.player_id = ${userId}
    `,
    sql<{ text: string; at: string }>`
      select text, at from direct_messages where author_id = ${userId} order by at
    `,
    sql<{ text: string; at: string }>`
      select text, at from group_messages where author_id = ${userId} order by at
    `,
  ]);

  const row = profile[0] ?? {};
  const lines: string[] = [];
  lines.push("KOBA DATA ARCHIVE");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("== PROFILE ==");
  for (const [key, value] of Object.entries(row)) lines.push(`${key}: ${value}`);
  lines.push("");
  lines.push("== PER-GAME SCORES ==");
  if (scores.length === 0) lines.push("(none)");
  for (const s of scores) lines.push(`${s.game_id}: ${s.normalized_score}`);
  lines.push("");
  lines.push("== UNLOCKED BADGES ==");
  if (badges.length === 0) lines.push("(none)");
  for (const b of badges) lines.push(`${b.display_name} (${b.tier}) - unlocked ${b.unlocked_at}`);
  lines.push("");
  lines.push("== CLANS YOU OWN ==");
  if (ownedGroups.length === 0) lines.push("(none)");
  for (const g of ownedGroups) lines.push(`${g.name} (${g.visibility})`);
  lines.push("");
  lines.push("== CLAN MEMBERSHIPS ==");
  if (memberGroups.length === 0) lines.push("(none)");
  for (const g of memberGroups) lines.push(`${g.name} - ${g.role}`);
  lines.push("");
  lines.push(`== DIRECT MESSAGES SENT (${directMessages.length}) ==`);
  for (const m of directMessages) lines.push(`[${m.at}] ${m.text}`);
  lines.push("");
  lines.push(`== CLAN MESSAGES SENT (${groupMessages.length}) ==`);
  for (const m of groupMessages) lines.push(`[${m.at}] ${m.text}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Permanently removes the player's KOBA profile and every row that FKs to
 * it. Most child tables already cascade from players(id); koba_scores does
 * not, so it's deleted explicitly first. Also removes the Better Auth
 * user/account/session rows (same id, no FK link between the two systems)
 * so the gamertag can never sign back in. Irreversible - the confirmation
 * modal is the only safety net, there is no soft-delete/undo here.
 */
export async function deletePlayerAccount(userId: string): Promise<{ ok: true }> {
  const sql = await getSql();
  await sql`delete from koba_scores where player_id = ${userId}`;
  await sql`delete from players where id = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
  return { ok: true };
}

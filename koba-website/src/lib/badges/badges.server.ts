import { getSql } from "@/lib/db";

export interface BadgeView {
  badgeId: string;
  audience: string;
  track: string | null;
  rung: number | null;
  gameType: string | null;
  displayName: string;
  description: string;
  tier: string;
  iconUrl: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
}

const TRACK_ORDER = `
  case r.track
    when 'rivalry' then 1
    when 'competition' then 2
    when 'legend' then 3
    when 'merchant' then 1
    when 'operator' then 2
    when 'patron' then 3
    else 9
  end
`;

/**
 * Loads the collection that belongs to this profile's account type. The
 * audience is read from `players.account_type` - never from the caller - so a
 * player account can only ever see player badges, and a business profile only
 * business badges.
 *
 * Diffs the registry against `player_badges` rows: unearned badges are never
 * stored, so "locked" is computed here, not read from a row (see
 * migrations/0020_badge_sets.sql).
 */
export async function getProfileBadges(kobaId: string): Promise<BadgeView[]> {
  const sql = await getSql();
  const account = await sql<{ account_type: string }>`
    select account_type from players where id = ${kobaId}
  `;
  const audience = account[0]?.account_type === "business" ? "business" : "player";
  const rows = await sql.query<{
    badge_id: string;
    audience: string;
    track: string | null;
    rung: number | null;
    game_type: string | null;
    display_name: string;
    description: string;
    tier: string;
    icon_url: string | null;
    unlocked_at: string | null;
  }>(
    `
    select
      r.badge_id,
      r.audience,
      r.track,
      r.rung,
      r.game_type,
      r.display_name,
      r.description,
      r.tier,
      r.icon_url,
      pb.unlocked_at
    from badge_registry r
    left join player_badges pb on pb.badge_id = r.badge_id and pb.koba_id = $1
    where r.audience = $2
    order by ${TRACK_ORDER}, r.rung, r.display_name
  `,
    [kobaId, audience],
  );
  return rows.map((row) => ({
    badgeId: row.badge_id,
    audience: row.audience,
    track: row.track,
    rung: row.rung,
    gameType: row.game_type,
    displayName: row.display_name,
    description: row.description,
    tier: row.tier,
    iconUrl: row.icon_url,
    unlocked: row.unlocked_at !== null,
    unlockedAt: row.unlocked_at,
  }));
}

export async function unlockBadge(kobaId: string, badgeId: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into player_badges (koba_id, badge_id)
    values (${kobaId}, ${badgeId})
    on conflict (koba_id, badge_id) do nothing
  `;
}

interface BadgeSignals {
  business: boolean;
  /** Results that cleared the anti-cheat gates - a flagged row never counts. */
  cleanResults: number;
}

/**
 * Rules for the badges whose evidence exists in Postgres today. The rest of
 * both sets (rivals, competitions, orders, server ownership) wait on the
 * tables that will record them - they are not awarded from guesses, so they
 * stay locked until a real signal lands here.
 */
const BADGE_RULES: Record<string, (signals: BadgeSignals) => boolean> = {
  "legend-1": (signals) => signals.cleanResults >= 10,
  "legend-2": (signals) => signals.cleanResults >= 50,
  "legend-3": (signals) => signals.cleanResults >= 100,
  "legend-4": (signals) => signals.cleanResults >= 250,
  "legend-5": (signals) => signals.cleanResults >= 500,
  "merchant-1": (signals) => signals.business,
};

/**
 * Awards every registry badge whose real condition is now true, and returns
 * only the rows this call inserted. Callers use that return value to fire the
 * celebration at the action itself (finish onboarding, create/join a clan)
 * instead of making the player visit the profile grid to discover it later.
 *
 * One insert per badge, not a bulk `= any($1)`: PGLite does not serialize a JS
 * string array into a Postgres array literal (same limitation noted above).
 */
export async function awardEarnedBadges(kobaId: string): Promise<BadgeView[]> {
  const sql = await getSql();
  const signals = await sql<{ business: boolean; clean_results: number }>`
    select
      (p.account_type = 'business') as business,
      (
        select count(*)
        from player_results r
        where r.player_id = p.id
          and not exists (select 1 from flagged_results f where f.result_id = r.id)
      ) as clean_results
    from players p
    where p.id = ${kobaId}
  `;
  const current = signals[0];
  if (!current) return [];
  const state: BadgeSignals = {
    business: Boolean(current.business),
    cleanResults: Number(current.clean_results) || 0,
  };

  const awarded: BadgeView[] = [];
  for (const [badgeId, earned] of Object.entries(BADGE_RULES)) {
    if (!earned(state)) continue;
    const inserted = await sql<{ unlocked_at: string | Date }>`
      insert into player_badges (koba_id, badge_id)
      values (${kobaId}, ${badgeId})
      on conflict (koba_id, badge_id) do nothing
      returning unlocked_at
    `;
    if (!inserted[0]) continue;
    const registry = await sql<{
      badge_id: string;
      audience: string;
      track: string | null;
      rung: number | null;
      game_type: string | null;
      display_name: string;
      description: string;
      tier: string;
      icon_url: string | null;
    }>`
      select badge_id, audience, track, rung, game_type, display_name, description, tier, icon_url
      from badge_registry where badge_id = ${badgeId}
    `;
    const row = registry[0];
    if (!row) continue;
    awarded.push({
      badgeId: row.badge_id,
      audience: row.audience,
      track: row.track,
      rung: row.rung,
      gameType: row.game_type,
      displayName: row.display_name,
      description: row.description,
      tier: row.tier,
      iconUrl: row.icon_url,
      unlocked: true,
      unlockedAt: new Date(inserted[0].unlocked_at).toISOString(),
    });
  }
  return awarded;
}

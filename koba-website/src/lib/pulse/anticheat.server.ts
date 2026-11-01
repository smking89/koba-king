/**
 * Anti-cheat guardrail: a rolling z-score over a player's own last-N
 * verified results, computed with plain Postgres aggregates over a windowed
 * slice (not a streaming ML pipeline - see migrations/0003_pulse_anticheat.sql's
 * header for why this exists and what it deliberately does NOT do).
 *
 * This NEVER touches players.score or koba_scores. recordResultAndCheck()
 * only ever: (1) appends the new result, (2) optionally inserts a
 * flagged_results row for a human to look at. Nothing here auto-penalizes a
 * player or adjusts a ranking - that is the whole point (an integration
 * submits evidence, KOBA decides, and "decides" here means "a person
 * reviews flagged_results", not "this function does").
 */

// Dynamically imported inside each DB-touching function below, not at
// module scope - src/lib/db.ts eagerly self-bootstraps (PGLite +
// import.meta.glob) the moment it's imported at all, which breaks under
// plain `node --test` even if the importing code never calls getSql(). A
// static top-level import would make decideFlag() (the pure function
// anticheat.test.ts actually exercises) untestable by side effect alone.
type DbModule = typeof import("../db.ts");
let dbModulePromise: Promise<DbModule> | null = null;
function loadDb(): Promise<DbModule> {
  dbModulePromise ??= import("../db.ts");
  return dbModulePromise;
}

/** Results before this many samples don't have a meaningful baseline - flagging off a baseline of 2-3 points would be noise, not signal. */
const MIN_BASELINE_SAMPLES = 5;
/** How many of the player's most recent results (excluding the new one) establish the baseline. */
const BASELINE_WINDOW = 20;
/**
 * Standard "extreme outlier" territory starts around 3 standard deviations;
 * 3.5 is picked deliberately more conservative than the textbook 3.0 so a
 * small, noisy baseline (as low as MIN_BASELINE_SAMPLES) doesn't throw a
 * flag on ordinary variance - this errs toward fewer false positives at the
 * cost of catching some true ones later, which is the right tradeoff for
 * something that creates work for a human reviewer.
 */
const Z_SCORE_THRESHOLD = 3.5;

export interface AntiCheatResult {
  resultId: number;
  flagged: boolean;
  zScore: number | null;
  sampleSize: number;
}

export interface FlagDecision {
  flagged: boolean;
  zScore: number | null;
}

/**
 * Pure decision function - no I/O, directly unit-testable with plain
 * `node --test` (see anticheat.test.ts). Split out from recordResultAndCheck
 * so the actual judgment call (is this value an outlier against this
 * baseline) can be verified without a database, which matters here more
 * than for most of this codebase's server functions - this is the function
 * that decides whether a real player's result gets held up for review.
 */
export function decideFlag(value: number, mean: number | null, stddev: number | null, sampleSize: number): FlagDecision {
  // Can't compute a meaningful z-score off too few points or zero variance
  // (every prior result identical) - skip flagging rather than divide by a
  // near-zero stddev and manufacture a huge, meaningless z-score.
  if (sampleSize < MIN_BASELINE_SAMPLES || mean == null || stddev == null || stddev <= 1e-9) {
    return { flagged: false, zScore: null };
  }
  const zScore = (value - mean) / stddev;
  return { flagged: Math.abs(zScore) > Z_SCORE_THRESHOLD, zScore };
}

/**
 * Records one verified result and checks it against the player's own recent
 * baseline for that exact (game, metric) pair. Returns whether it was
 * flagged - callers should surface that for review, never act on it
 * directly.
 */
export async function recordResultAndCheck(input: {
  playerId: string;
  gameId: string;
  metric: string;
  value: number;
}): Promise<AntiCheatResult> {
  const { getSql } = await loadDb();
  const sql = await getSql();

  // Baseline from the PRIOR results only - the new value must never be
  // included in its own baseline, or an outlier would partly absorb itself
  // into the mean/stddev and the z-score would understate how extreme it is.
  const baselineRows = await sql<{ mean: number | null; stddev: number | null; n: number }>`
    select avg(value) as mean, stddev_samp(value) as stddev, count(*)::int as n
    from (
      select value from player_results
      where player_id = ${input.playerId} and game_id = ${input.gameId} and metric = ${input.metric}
      order by recorded_at desc
      limit ${BASELINE_WINDOW}
    ) recent
  `;
  const baseline = baselineRows[0];
  const sampleSize = baseline?.n ?? 0;
  const mean = baseline?.mean ?? null;
  const stddev = baseline?.stddev ?? null;

  const inserted = await sql<{ id: number }>`
    insert into player_results (player_id, game_id, metric, value)
    values (${input.playerId}, ${input.gameId}, ${input.metric}, ${input.value})
    returning id
  `;
  const resultId = inserted[0]!.id;

  const decision = decideFlag(input.value, mean, stddev, sampleSize);

  if (decision.flagged) {
    await sql`
      insert into flagged_results (result_id, player_id, z_score, baseline_mean, baseline_stddev, sample_size)
      values (${resultId}, ${input.playerId}, ${decision.zScore}, ${mean}, ${stddev}, ${sampleSize})
    `;
  }

  // A committed result can cross a Legend rung. Awarding here means the badge
  // lands on the account from the result itself, not only when the player next
  // touches a clan action; a badge failure must never lose the result.
  try {
    const { awardEarnedBadges } = await import("@/lib/badges/badges.server");
    await awardEarnedBadges(input.playerId);
  } catch (err) {
    console.error("[badges] award after result failed:", err);
  }

  return { resultId, flagged: decision.flagged, zScore: decision.zScore, sampleSize };
}

/** Pending flags for a human reviewer - oldest first, so nothing sits unreviewed indefinitely while newer flags jump the queue. */
export async function listPendingFlags(limit = 50) {
  const { getSql } = await loadDb();
  const sql = await getSql();
  return sql`
    select f.*, r.game_id, r.metric, r.value, r.recorded_at
    from flagged_results f
    join player_results r on r.id = f.result_id
    where f.status = 'pending'
    order by f.flagged_at asc
    limit ${limit}
  `;
}

/** A human reviewer's verdict - the only place review status ever changes. Still never touches score/ranking state directly; that's a separate, explicit decision for whatever workflow consumes a 'reviewed_confirmed' flag. */
export async function resolveFlag(id: number, status: "reviewed_ok" | "reviewed_confirmed", reviewedBy: string) {
  const { getSql } = await loadDb();
  const sql = await getSql();
  await sql`
    update flagged_results
    set status = ${status}, reviewed_at = now(), reviewed_by = ${reviewedBy}
    where id = ${id} and status = 'pending'
  `;
}

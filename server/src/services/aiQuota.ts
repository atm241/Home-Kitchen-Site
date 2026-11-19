// Daily per-household caps on the AI calls users can trigger directly.
//
// Every household shares the server owner's Anthropic key, so without a cap
// one account (or a runaway Shortcut) could import hundreds of videos and
// run up the bill. Cheap background calls (categorizing, ingredient cleanup)
// are not capped; they only happen as a side effect of an import.
//
// Limits are a rolling 24 hours, overridable per kind in .env, e.g.
// AI_DAILY_LIMIT_VIDEO=40. Set a limit to 0 to switch that feature off.
import pool, { releaseClient } from '../config/database';
import { ImportError } from './videoRecipeImporter';

export type AiKind = 'video' | 'photo' | 'receipt';

// First key of the two-part advisory lock; the household id is the second.
const AI_QUOTA_LOCK = 7311;

const DEFAULT_LIMITS: Record<AiKind, number> = {
  video: 25,
  photo: 20,
  receipt: 30,
};

const LABELS: Record<AiKind, string> = {
  video: 'video imports',
  photo: 'recipe photo scans',
  receipt: 'receipt scans',
};

export function dailyLimit(kind: AiKind): number {
  const raw = process.env[`AI_DAILY_LIMIT_${kind.toUpperCase()}`];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_LIMITS[kind];
}

/**
 * Count one call against the household's daily limit, or throw a 429
 * ImportError if the limit is reached. Call it right before the paid API
 * call. Attempts count even when the call later fails, so retry loops are
 * capped too.
 */
export async function reserveAiCall(householdId: number, kind: AiKind): Promise<void> {
  const limit = dailyLimit(kind);
  const client = await pool.connect();
  let reserved = false;
  try {
    await client.query('BEGIN');
    // Serializes reservations per household, so two simultaneous requests
    // can't both count the same last free slot. Released at COMMIT.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [AI_QUOTA_LOCK, householdId]);
    const result = await client.query(
      `INSERT INTO ai_usage (household_id, kind)
       SELECT $1::int, $2::varchar
       WHERE (SELECT COUNT(*) FROM ai_usage
              WHERE household_id = $1::int AND kind = $2::varchar
                AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') < $3::int
       RETURNING id`,
      [householdId, kind, limit]
    );
    await client.query('COMMIT');
    reserved = (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await releaseClient(client);
  }
  if (!reserved) {
    throw new ImportError(
      limit === 0
        ? `${LABELS[kind][0].toUpperCase()}${LABELS[kind].slice(1)} are turned off on this server.`
        : `Your household has used today's ${limit} ${LABELS[kind]}. Try again tomorrow.`,
      429
    );
  }
}

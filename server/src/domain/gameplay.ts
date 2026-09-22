import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';

const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const shortText = z.string().max(200);
const contexts = ['battle', 'battle_block', 'battle_sword', 'battle_pet', 'shop_prep_sword',
  'shop_prep_shield', 'mana_collection', 'underwater_bell', 'exam', 'fluency',
  'mastery_challenge', 'band_gate'] as const;

export const gameplayBatchSchema = z.object({
  version: z.literal(1),
  // Checked against the current session, never used to choose another user's account.
  accountId: z.uuid(),
  profileId: z.uuid(),
  deviceId: z.uuid(),
  slotNumber: z.int().min(1).max(8),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  savedAt: timestamp,
  release: z.string().min(1).max(100),
  progress: z.object({
    player: z.object({ name: shortText }).catchall(z.json()),
    mathStats: z.record(z.string(), z.json()),
  }).strict(),
  attempts: z.array(z.object({
    eventKey: z.string().min(1).max(600),
    source: z.enum(['mastery', 'comparison']),
    sequenceIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    timestamp,
    problemKey: z.string().min(1).max(200),
    context: z.enum(contexts),
    correct: z.boolean(),
    responseTimeMs: z.number().min(0).max(86_400_000),
    assisted: z.boolean(),
    details: z.record(z.string(), z.json()),
  }).strict()).max(100),
}).strict();

export type GameplayBatch = z.infer<typeof gameplayBatchSchema>;

export async function resolveGameplayBrowser(database: Database, token: string, deviceId?: string): Promise<{ id: string } | null> {
  const hash = createHash('sha256').update(token).digest('hex');
  return database.begin(async tx => {
    // Serializes simultaneous first requests from tabs sharing the same durable credential.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`gameplay-browser:${hash}`}, 0))`;
    const [existing] = await tx<{ account_id: string }[]>`SELECT account_id FROM gameplay_browsers WHERE token_hash=${hash}`;
    if (existing) return { id: existing.account_id };
    if (!deviceId) return null;
    const id = randomUUID();
    await tx`INSERT INTO player_accounts (id) VALUES (${id})`;
    await tx`INSERT INTO gameplay_browsers (token_hash, account_id, device_id) VALUES (${hash}, ${id}, ${deviceId})`;
    return { id };
  });
}

export async function collectGameplay(database: Database, accountId: string, batch: GameplayBatch, parentAccountId: string | null = null): Promise<void> {
  await database.begin(async tx => {
    await tx`INSERT INTO gameplay_profiles (account_id, profile_id, parent_account_id)
      VALUES (${accountId}, ${batch.profileId}, ${parentAccountId})
      ON CONFLICT (account_id, profile_id) DO UPDATE SET
        parent_account_id = coalesce(gameplay_profiles.parent_account_id, EXCLUDED.parent_account_id)`;
    await tx`INSERT INTO gameplay_progress
      (account_id, profile_id, device_id, slot_number, revision, client_saved_at, release, payload)
      VALUES (${accountId}, ${batch.profileId}, ${batch.deviceId}, ${batch.slotNumber}, ${batch.revision},
        ${new Date(batch.savedAt)}, ${batch.release}, ${tx.json(batch.progress)})
      ON CONFLICT (account_id, profile_id, device_id) DO UPDATE SET
        slot_number = EXCLUDED.slot_number, revision = EXCLUDED.revision,
        client_saved_at = EXCLUDED.client_saved_at, release = EXCLUDED.release,
        payload = EXCLUDED.payload, received_at = now()
      WHERE gameplay_progress.revision < EXCLUDED.revision`;

    if (batch.attempts.length) {
      const rows = batch.attempts.map(attempt => ({
        account_id: accountId, profile_id: batch.profileId, event_key: attempt.eventKey,
        device_id: batch.deviceId, source: attempt.source, sequence_index: attempt.sequenceIndex,
        occurred_at: new Date(attempt.timestamp), problem_key: attempt.problemKey,
        context: attempt.context, correct: attempt.correct, response_time_ms: attempt.responseTimeMs,
        assisted: attempt.assisted, release: batch.release, details: tx.json(attempt.details),
      }));
      // An acknowledgement can be lost after commit. Replays must not duplicate answers.
      await tx`INSERT INTO gameplay_attempts ${tx(rows)} ON CONFLICT DO NOTHING`;
    }
  });
}

export async function gameplaySummary(database: Database, accountId: string, parentView = false) {
  return database`
    WITH owned AS (
      SELECT account_id, profile_id FROM gameplay_profiles
      WHERE (${parentView} AND parent_account_id = ${accountId})
        OR (NOT ${parentView} AND account_id = ${accountId})
    ), latest AS (
      SELECT DISTINCT ON (account_id, profile_id) gameplay_progress.* FROM gameplay_progress
      JOIN owned USING (account_id, profile_id)
      ORDER BY account_id, profile_id, client_saved_at DESC, received_at DESC
    ), answers AS (
      SELECT account_id, profile_id, count(*)::int AS attempts,
        count(*) FILTER (WHERE correct)::int AS correct,
        round(avg(response_time_ms)::numeric, 2)::float AS average_response_time_ms,
        min(occurred_at) AS first_answer_at, max(occurred_at) AS last_answer_at
      FROM gameplay_attempts JOIN owned USING (account_id, profile_id) GROUP BY account_id, profile_id
    )
    SELECT latest.profile_id, latest.payload->'player'->>'name' AS name,
      latest.client_saved_at, latest.received_at, latest.release,
      coalesce(answers.attempts, 0) AS attempts, coalesce(answers.correct, 0) AS correct,
      answers.average_response_time_ms, answers.first_answer_at, answers.last_answer_at,
      latest.payload AS progress
    FROM latest LEFT JOIN answers USING (account_id, profile_id)
    ORDER BY latest.client_saved_at DESC
  `;
}

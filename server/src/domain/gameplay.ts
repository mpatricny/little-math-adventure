import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import { issue, reconcileProfiles, stableHash } from './analytics/ingest.js';
import type { GameplayBatch } from '../contracts/gameplaySchema.js';
export { gameplayBatchSchema, type GameplayBatch } from '../contracts/gameplaySchema.js';

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

export async function collectGameplay(database: Database, accountId: string, batch: GameplayBatch, parentAccountId: string | null = null) {
  const confirmedLinks=await database.begin(async tx => {
    const links:Array<{presentationId:string;legacyEventKey:string}>=[];
    await tx`INSERT INTO gameplay_profiles (account_id, profile_id, parent_account_id)
      VALUES (${accountId}, ${batch.profileId}, ${parentAccountId})
      ON CONFLICT (account_id, profile_id) DO UPDATE SET
        parent_account_id = coalesce(gameplay_profiles.parent_account_id, EXCLUDED.parent_account_id)`;
    await tx`INSERT INTO analytics_profile_links(account_id,profile_id,canonical_profile_id)
      VALUES(${accountId},${batch.profileId},${createHash('md5').update(`${accountId}:${batch.profileId}`).digest('hex')}) ON CONFLICT DO NOTHING`;
    if (batch.progress) await tx`INSERT INTO gameplay_progress
      (account_id, profile_id, device_id, slot_number, revision, client_saved_at, release, payload)
      VALUES (${accountId}, ${batch.profileId}, ${batch.deviceId}, ${batch.slotNumber}, ${batch.revision},
        ${new Date(batch.savedAt)}, ${batch.release}, ${tx.json(batch.progress)})
      ON CONFLICT (account_id, profile_id, device_id) DO UPDATE SET
        slot_number = EXCLUDED.slot_number, revision = EXCLUDED.revision,
        client_saved_at = EXCLUDED.client_saved_at, release = EXCLUDED.release,
        payload = EXCLUDED.payload, received_at = now()
      WHERE gameplay_progress.revision < EXCLUDED.revision`;

    if (batch.attempts.length) {
      for (const attempt of batch.attempts) {
        const observation=batch.version===2?(attempt.details as any).observation:undefined;
        const hash=stableHash({eventKey:attempt.eventKey,source:attempt.source,timestamp:attempt.timestamp,
          problemKey:attempt.problemKey,context:attempt.context,correct:attempt.correct,responseTimeMs:attempt.responseTimeMs,
          details:observation?{...observation,legacyEventKey:undefined}:attempt.details});
        const row={
        account_id: accountId, profile_id: batch.profileId, event_key: attempt.eventKey,
        device_id: batch.deviceId, source: attempt.source, sequence_index: attempt.sequenceIndex,
        occurred_at: new Date(attempt.timestamp), problem_key: attempt.problemKey,
        context: attempt.context, correct: attempt.correct, response_time_ms: attempt.responseTimeMs,
        assisted: attempt.assisted, release: batch.release, details: tx.json(attempt.details),
        presentation_id:observation?.presentationId??null,play_session_id:observation?.playSessionId??null,
        run_id:observation?.runId??null,source_release:observation?.sourceRelease??null,
        capture_origin:observation?'live':'historical',observation_version:observation?1:null,payload_hash:hash,
        };
        const inserted=await tx`INSERT INTO gameplay_attempts ${tx(row)} ON CONFLICT DO NOTHING RETURNING event_key`;
        if(!inserted.length){
          const [old]=await tx`SELECT * FROM gameplay_attempts WHERE account_id=${accountId} AND profile_id=${batch.profileId}
            AND (event_key=${attempt.eventKey} OR presentation_id=${observation?.presentationId??null})`;
          if(old && old.payload_hash!==hash && !(old.payload_hash===null && old.correct===attempt.correct&&old.problem_key===attempt.problemKey&&old.response_time_ms===attempt.responseTimeMs))
            await issue(tx,`answer:${accountId}:${batch.profileId}:${attempt.eventKey}`,'answer_collision',accountId,{hash,attempt},batch.profileId,attempt.eventKey);
        }
      }
    }
    if(batch.version===2)for(const link of batch.observationLinks??[]){
      const [target]=await tx`SELECT * FROM gameplay_attempts WHERE account_id=${accountId} AND profile_id=${batch.profileId} AND presentation_id=${link.presentationId}`;
      if(!target)continue;
      const [legacy]=await tx`SELECT * FROM gameplay_attempts WHERE account_id=${accountId} AND profile_id=${batch.profileId} AND event_key=${link.legacyEventKey}`;
      const existing=target.details.observation?.legacyEventKey;
      if((existing&&existing!==link.legacyEventKey)||(legacy&&(legacy.correct!==target.correct||legacy.problem_key!==target.problem_key||legacy.response_time_ms!==target.response_time_ms))){
        await issue(tx,`link:${accountId}:${link.presentationId}`,'answer_collision',accountId,{link},batch.profileId,link.legacyEventKey);links.push(link);continue;
      }
      await tx`UPDATE gameplay_attempts SET details=jsonb_set(details,'{observation,legacyEventKey}',to_jsonb(${link.legacyEventKey}::text))
        WHERE account_id=${accountId} AND profile_id=${batch.profileId} AND presentation_id=${link.presentationId}`;
      links.push(link);
    }
    return links;
  });
  await reconcileProfiles(database,batch.profileId);
  return {observationLinks:confirmedLinks};
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

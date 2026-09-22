import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db/database.js';

const args = process.argv.slice(2);
let days = 7; let email: string | null = null;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--days') days = Number(args[i + 1]);
  else if (args[i] === '--email' && args[i + 1]) email = args[i + 1]!;
  else throw new Error('Usage: gameplay:report [--days 7] [--email parent@example.com]');
}
if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('--days must be between 1 and 3650');
const db = createDatabase(loadDatabaseConfig().databaseUrl);
try {
  const since = new Date(Date.now() - days * 86_400_000);
  const profiles = await db.begin('read only', async tx => tx`
    WITH selected AS (
      SELECT p.* FROM gameplay_profiles p
      WHERE ${email}::text IS NULL OR EXISTS (
        SELECT 1 FROM account_identities i
        WHERE i.account_id=p.parent_account_id AND i.email=${email}
      )
    ), latest AS (
      SELECT DISTINCT ON (g.account_id, g.profile_id) g.*
      FROM gameplay_progress g JOIN selected USING (account_id, profile_id)
      ORDER BY g.account_id, g.profile_id, g.client_saved_at DESC, g.received_at DESC
    ), answers AS (
      SELECT a.account_id, a.profile_id, count(*)::int AS answers,
        count(*) FILTER (WHERE correct)::int AS correct,
        count(*) FILTER (WHERE assisted)::int AS assisted,
        round(avg(response_time_ms)::numeric, 2)::float AS average_response_time_ms,
        min(occurred_at) AS first_answer_at, max(occurred_at) AS last_answer_at
      FROM gameplay_attempts a JOIN selected USING (account_id, profile_id)
      WHERE a.occurred_at >= ${since} GROUP BY a.account_id, a.profile_id
    )
    SELECT s.account_id AS browser_id, s.profile_id, (s.parent_account_id IS NULL) AS anonymous,
      l.payload->'player'->>'name' AS name, coalesce(a.answers, 0) AS answers,
      coalesce(a.correct, 0) AS correct, coalesce(a.assisted, 0) AS assisted,
      a.average_response_time_ms, a.first_answer_at, a.last_answer_at,
      l.client_saved_at, l.received_at, l.release,
      l.payload->'player'->'mana' AS mana,
      l.payload->'player'->'coins' AS coins,
      l.payload->'player'->'dailyProgressLog' AS daily_rewards,
      l.payload->'player'->'arena' AS arena
    FROM selected s JOIN latest l USING (account_id, profile_id)
    LEFT JOIN answers a USING (account_id, profile_id)
    WHERE l.received_at >= ${since}
    ORDER BY l.received_at DESC LIMIT 200
  `);
  console.log(JSON.stringify({ since: since.toISOString(), profiles }, null, 2));
} finally { await db.end(); }

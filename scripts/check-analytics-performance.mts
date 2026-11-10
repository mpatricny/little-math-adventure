import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { analyticsTestDatabase } from '../server/src/domain/analytics/testDatabase.js';
import { analyticsReport, parseFilter } from '../server/src/domain/analytics/queries.js';
import { reconcileProfiles } from '../server/src/domain/analytics/ingest.js';

// Optional pilot-volume check, never a load test against production.
const db=await analyticsTestDatabase(),scope=randomUUID(),device=randomUUID();
try {
  await db`INSERT INTO player_accounts(id) VALUES(${scope})`;
  await db`INSERT INTO gameplay_profiles(account_id,profile_id)
    SELECT ${scope}::uuid,md5(${scope}::text||':'||n)::uuid FROM generate_series(1,100) n`;
  await db`INSERT INTO gameplay_attempts(account_id,profile_id,event_key,device_id,source,sequence_index,occurred_at,
    problem_key,context,correct,response_time_ms,assisted,release,details)
    SELECT ${scope}::uuid,md5(${scope}::text||':'||((n-1)/100+1))::uuid,'perf:'||n,${device}::uuid,'mastery',n,
      now()-interval '4 hours'+(n%3600)*interval '1 second','A1:2+3:result_unknown','battle',n%4<>0,1250,false,
      'analytics-performance-fixture','{"subAtomId":"A1","form":"result_unknown"}'::jsonb FROM generate_series(1,10000) n`;
  await reconcileProfiles(db);
  await db`ANALYZE gameplay_attempts, analytics_profile_links`;
  const filter=await parseFilter(db,{preset:'7d',data:'all',learningActor:'all'});
  const samples=[];
  for(let i=0;i<3;i++){const started=performance.now(),report=await analyticsReport(db,filter,'overview','dev');
    assert.equal(report.data.cards.attempts.value,10000);samples.push(Math.round(performance.now()-started));}
  const explain=await db`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT count(*),percentile_cont(0.5) WITHIN GROUP(ORDER BY response_time_ms) FILTER(WHERE correct)
    FROM analytics_attempts_v1 WHERE occurred_at>=now()-interval '7 days'`;
  const profileExplain=await db`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT * FROM gameplay_attempts WHERE account_id=${scope} AND profile_id=md5(${scope}::text||':1')::uuid
    ORDER BY occurred_at DESC LIMIT 25`;
  const result={fixture:{profiles:100,answers:10000},overviewMs:samples,plans:{normalized:explain,profile:profileExplain}};
  await mkdir('artifacts/analytics',{recursive:true});await writeFile('artifacts/analytics/performance.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({fixture:result.fixture,overviewMs:samples,planFile:'artifacts/analytics/performance.json'}));
  assert.ok(Math.max(...samples)<2000,'Pilot overview exceeded the 2-second target; inspect the saved EXPLAIN plans.');
}finally{await db`DELETE FROM player_accounts WHERE id=${scope}`;await db.end();}

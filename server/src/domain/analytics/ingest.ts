import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../../db/database.js';
import type { ClientEvent, AnalyticsReceipt } from '../../contracts/analytics.js';

export function stableHash(value: unknown): string {
  const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v && typeof v==='object'?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}
export async function issue(db:any,key:string,kind:string,scope:string|null,details:unknown,profile:string|null=null,eventKey:string|null=null) {
  await db`INSERT INTO analytics_issues(issue_key,kind,scope_id,profile_id,event_key,details)
    VALUES(${key},${kind},${scope},${profile},${eventKey},${db.json(details)})
    ON CONFLICT(issue_key) DO UPDATE SET occurrences=analytics_issues.occurrences+1,last_seen_at=now(),details=EXCLUDED.details`;
}
export async function ingestEvents(db:Database,scope:string,events:ClientEvent[],release:string):Promise<AnalyticsReceipt> {
  return db.begin(async tx=>{
    const receipt:AnalyticsReceipt={stored:true,acceptedIds:[],duplicateIds:[],quarantinedIds:[],serverReceivedAt:new Date().toISOString()};
    for(const e of events) {
      const hash=stableHash(e);
      const inserted=await tx`INSERT INTO analytics_events(browser_account_id,event_id,schema_version,kind,visitor_id,visit_id,
        play_session_id,run_id,seq,profile_id,encounter_run_id,occurred_at,monotonic_ms,clock_quality,source_release,uploader_release,payload_hash,payload)
        VALUES(${scope},${e.id},1,${e.kind},${e.visitorId},${e.visitId},${e.playSessionId??null},${e.runId},${e.seq},${e.profileId??null},
        ${e.encounterRunId??null},${new Date(e.occurredAt)},${e.monotonicMs},${e.occurredAt>Date.now()+300_000?'uncertain':'observed'},
        ${e.sourceRelease},${release},${hash},${tx.json(e.payload as any)}) ON CONFLICT DO NOTHING RETURNING event_id`;
      if(inserted.length) receipt.acceptedIds.push(e.id);
      else {
        const [old]=await tx`SELECT payload_hash FROM analytics_events WHERE browser_account_id=${scope} AND event_id=${e.id}`;
        if(old?.payload_hash===hash) receipt.duplicateIds.push(e.id);
        else { await issue(tx,`event:${scope}:${e.id}`,'event_collision',scope,{event:e,hash},e.profileId??null,e.id);
          receipt.quarantinedIds.push(e.id); }
      }
    }
    await tx`INSERT INTO analytics_ingest_stats(bucket,schema_version,uploader_release,accepted,duplicates,conflicts)
      VALUES(date_trunc('hour',now()),1,${release},${receipt.acceptedIds.length},${receipt.duplicateIds.length},${receipt.quarantinedIds.length})
      ON CONFLICT(bucket,schema_version,uploader_release) DO UPDATE SET
      accepted=analytics_ingest_stats.accepted+EXCLUDED.accepted,duplicates=analytics_ingest_stats.duplicates+EXCLUDED.duplicates,
      conflicts=analytics_ingest_stats.conflicts+EXCLUDED.conflicts,last_received_at=now()`;
    return receipt;
  });
}
/** The same evidence check is used by live ingestion and the read-only backfill preview. */
export async function copyEvidence(tx:any,profileId:string,firstScope:string,secondScope:string){
  const [evidence]=await tx`SELECT count(*)::int AS matches FROM gameplay_attempts x JOIN gameplay_attempts y
    ON x.profile_id=y.profile_id AND x.event_key=y.event_key AND x.problem_key=y.problem_key AND x.context=y.context
    AND x.correct=y.correct AND x.response_time_ms=y.response_time_ms AND x.occurred_at=y.occurred_at
    WHERE x.account_id=${firstScope} AND y.account_id=${secondScope} AND x.profile_id=${profileId}`;
  const [conflict]=await tx`SELECT count(*)::int AS conflicts FROM gameplay_attempts x JOIN gameplay_attempts y
    ON x.profile_id=y.profile_id AND x.event_key=y.event_key WHERE x.account_id=${firstScope} AND y.account_id=${secondScope}
    AND x.profile_id=${profileId} AND (x.correct<>y.correct OR x.problem_key<>y.problem_key OR x.context<>y.context OR x.response_time_ms<>y.response_time_ms
      OR (x.details#>'{observation,selected}' IS NOT NULL AND y.details#>'{observation,selected}' IS NOT NULL AND x.details#>'{observation,selected}'<>y.details#>'{observation,selected}'))`;
  return {matches:evidence!.matches as number,conflicts:conflict!.conflicts as number};
}
export async function previewReconciliation(db:Database,profileId?:string){
  return db.begin('read only isolation level repeatable read',async tx=>{
    await tx`SET LOCAL statement_timeout = '2000ms'`;
    const pairs=await tx`SELECT a.profile_id,a.account_id AS first_scope,b.account_id AS second_scope,
      la.canonical_profile_id AS first_canonical,lb.canonical_profile_id AS second_canonical
      FROM gameplay_profiles a JOIN gameplay_profiles b ON a.profile_id=b.profile_id AND a.account_id<b.account_id
      LEFT JOIN analytics_profile_links la ON la.account_id=a.account_id AND la.profile_id=a.profile_id
      LEFT JOIN analytics_profile_links lb ON lb.account_id=b.account_id AND lb.profile_id=b.profile_id
      WHERE (${profileId??null}::uuid IS NULL OR a.profile_id=${profileId??null}::uuid)
      ORDER BY a.profile_id,a.account_id,b.account_id`;
    const candidates=[];
    for(const pair of pairs){const evidence=await copyEvidence(tx,pair.profile_id,pair.first_scope,pair.second_scope);
      candidates.push({profileId:pair.profile_id,...evidence,decision:evidence.matches>0&&evidence.conflicts===0?'verified_copy':'unresolved',
        alreadyMapped:pair.first_canonical===pair.second_canonical});}
    const [counts]=await tx`SELECT (SELECT count(*)::int FROM gameplay_profiles) AS source_profiles,
      (SELECT count(*)::int FROM gameplay_attempts) AS raw_attempts,
      (SELECT count(*)::int FROM analytics_attempts_v1) AS normalized_attempts,
      (SELECT count(*)::int FROM gameplay_profiles p LEFT JOIN analytics_profile_links l USING(account_id,profile_id) WHERE l.account_id IS NULL) AS missing_links`;
    return {ruleVersion:1,...counts,candidates};
  });
}
export async function reconcileProfiles(db:Database, profileId?:string):Promise<void> {
  await db.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtext('analytics:profiles'))`;
    await tx`INSERT INTO analytics_profile_links(account_id,profile_id,canonical_profile_id)
      SELECT account_id,profile_id,md5(account_id::text||':'||profile_id::text)::uuid FROM gameplay_profiles
      ON CONFLICT DO NOTHING`;
    const candidates=await tx`SELECT profile_id FROM gameplay_profiles WHERE (${profileId??null}::uuid IS NULL OR profile_id=${profileId??null}::uuid)
      GROUP BY profile_id HAVING count(*)>1`;
    for(const p of candidates) {
      const links=await tx`SELECT * FROM analytics_profile_links WHERE profile_id=${p.profile_id} ORDER BY created_at,account_id`;
      for(let i=0;i<links.length;i++) for(let j=i+1;j<links.length;j++) {
        const a=links[i]!,b=links[j]!;
        const evidence=await copyEvidence(tx,p.profile_id,a.account_id,b.account_id);
        if(evidence.matches>0 && evidence.conflicts===0) {
          await tx`UPDATE analytics_profile_links SET canonical_profile_id=${a.canonical_profile_id},decision='verified_copy',
            evidence=${tx.json({matchingEvents:evidence.matches,rule:1})},updated_at=now()
            WHERE profile_id=${p.profile_id} AND canonical_profile_id=${b.canonical_profile_id}`;
          b.canonical_profile_id=a.canonical_profile_id;
        } else if(a.canonical_profile_id!==b.canonical_profile_id || evidence.conflicts>0) {
          await tx`UPDATE analytics_profile_links SET decision='unresolved' WHERE profile_id=${p.profile_id}`;
          await issue(tx,`identity:${p.profile_id}`,'profile_identity',null,evidence,p.profile_id);
        }
      }
    }
  });
}
export async function recordCapabilities(db:Database,enabled:boolean){
  await db.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtext('analytics:capabilities'))`;
    for(const capability of ['web','play_sessions','activity_time','actual_choices','assistance','technical_errors']){
      const [last]=await tx`SELECT enabled FROM analytics_capabilities WHERE capability=${capability} ORDER BY changed_at DESC,id DESC LIMIT 1`;
      if(!last||last.enabled!==enabled)await tx`INSERT INTO analytics_capabilities(capability,enabled,reason) VALUES(${capability},${enabled},'Server collection configuration')`;
    }
  });
}
export async function recordGoogleLogin(db:Database, data:{sessionId:string;userId:string;occurredAt:Date},visit?:{scope:string;id:string}) {
  const [account]=await db`SELECT account_id FROM "account" WHERE user_id=${data.userId} AND provider_id='google' ORDER BY created_at LIMIT 1`;
  if(!account)return;
  await db`INSERT INTO analytics_auth_activity(id,kind,source_key,provider_subject,visit_scope_id,visit_id,occurred_at)
    VALUES(${randomUUID()},'google_login',${`session:${data.sessionId}`},${account.account_id},${visit?.scope??null},${visit?.id??null},${data.occurredAt})
    ON CONFLICT(source_key) DO NOTHING`;
}

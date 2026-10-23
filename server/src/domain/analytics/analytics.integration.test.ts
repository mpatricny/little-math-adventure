import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { analyticsTestDatabase } from './testDatabase.js';
import type { Database } from '../../db/database.js';
import { collectGameplay, gameplayBatchSchema, gameplaySummary, resolveGameplayBrowser } from '../gameplay.js';
import { analyticsReport, parseFilter } from './queries.js';
import { ingestEvents, recordCapabilities, recordGoogleLogin, previewReconciliation } from './ingest.js';
import { createAnalyticsService, analyticsRoutes } from '../../admin/routes.js';
import { createAuthService, type AuthService } from '../../auth.js';
import type { AppConfig } from '../../config.js';
import type { ClientEvent } from '../../contracts/analytics.js';

describe('analytics: one guarded PostgreSQL fixture',()=>{
  let db:Database,auth:AuthService|undefined;const scopes=[randomUUID(),randomUUID()],device=randomUUID(),profiles=[randomUUID(),randomUUID()];
  const session=randomUUID(),visit=randomUUID(),run=randomUUID(),visitor=randomUUID(),subject='analytics-fixture-'+randomUUID();
  const start=Date.now()-2*3600_000;let canonical:string,seq=0;
  const config:AppConfig={nodeEnv:'test',port:3000,databaseUrl:process.env.ANALYTICS_TEST_DATABASE_URL!,corsOrigins:new Set(['http://localhost:8002']),appRelease:'fixture',logLevel:'error',
    auth:{authBaseUrl:'http://localhost:8002',authSecret:'analytics-test-secret-at-least-32-characters',googleClientId:'test-client.apps.googleusercontent.com',googleClientSecret:'test-secret'},
    analytics:{adminEnabled:true,collectionEnabled:true,adminSubjects:new Set(['admin']),bootstrapEmail:'verified-admin@example.invalid'}};
  const event=(kind:ClientEvent['kind'],payload:Record<string,unknown>,time=start):ClientEvent=>({schemaVersion:1,id:randomUUID(),kind,visitorId:visitor,visitId:visit,playSessionId:session,runId:run,seq:seq++,occurredAt:time,monotonicMs:seq*1000,sourceRelease:'original-release',payload});
  const answers=Array.from({length:5},(_,i)=>{
    const profileId=profiles[i<3?0:1]!,at=start+(i+1)*60_000,presentationId=randomUUID(),key=`A1:add:${i}:1`;
    return {eventKey:`attempt:${presentationId}`,source:'mastery' as const,sequenceIndex:null,timestamp:at,problemKey:key,context:'battle' as const,correct:i!==1,responseTimeMs:1000+i*100,
      assisted:false,details:{subAtomId:'A1',form:'result_unknown',observation:{presentationId,profileId,playSessionId:session,runId:run,scene:'BattleScene',context:'battle',role:i<3?'A':'B',
        sourceRelease:'original-release',presentedAt:at-1500,answeredAt:at,question:`${i} + 1 = ?`,choices:[i+1,i+2,i+3],selected:i===1?i+2:i+1,correct:i!==1,responseTimeMs:1000+i*100,
        assisted:false,clockQuality:'observed',taskKind:'arithmetic'}}};
  });
  const batch=(scope:string,profileId:string,items:unknown[],revision=1,progress?:unknown)=>gameplayBatchSchema.parse({version:2,accountId:scope,profileId,deviceId:device,slotNumber:profileId===profiles[0]?1:2,
    revision,savedAt:start+revision*1000,release:'uploader-release',...(progress?{progress}:{}),attempts:items});
  const query=async(data='all',actor='all')=>parseFilter(db,{from:new Date(start-1).toISOString(),to:new Date(start+600_000).toISOString(),data,learningActor:actor});
  const report=async(resource:string,data='all',actor='all')=>analyticsReport(db,await query(data,actor),resource,'dev');
  before(async()=>{
    db=await analyticsTestDatabase();await db`INSERT INTO player_accounts(id) VALUES(${scopes[0]!}),(${scopes[1]!})`;
    await recordCapabilities(db,true);
    for(let i=0;i<2;i++)await collectGameplay(db,scopes[0]!,batch(scopes[0]!,profiles[i]!,answers.filter(a=>a.details.observation.profileId===profiles[i]),1,
      {player:{name:'<img src=x onerror=alert(1)>',level:2},mathStats:{masteryData:{selectedStartBand:'A',subAtoms:{A1:{state:'training',successfulSolves:999}}}}}));
    const legacyKey=`mastery:1:${answers[0]!.timestamp}:${answers[0]!.problemKey}`;
    await collectGameplay(db,scopes[0]!,gameplayBatchSchema.parse({...batch(scopes[0]!,profiles[0]!,[]),observationLinks:[{presentationId:answers[0]!.details.observation.presentationId,legacyEventKey:legacyKey}]}));
    const a=answers[0]!;
    const legacy={...a,eventKey:legacyKey,sequenceIndex:1,details:{subAtomId:'A1',form:'result_unknown'}};
    await collectGameplay(db,scopes[1]!,gameplayBatchSchema.parse({version:1,accountId:scopes[1]!,profileId:profiles[0]!,deviceId:randomUUID(),slotNumber:4,revision:1,savedAt:start,
      release:'legacy-uploader',progress:{player:{name:'Copied same profile'},mathStats:{}},attempts:[legacy]}));
    // Add the V2 copy as import evidence: aliases must not become another answer.
    await collectGameplay(db,scopes[1]!,batch(scopes[1]!,profiles[0]!,[a]));
    await collectGameplay(db,scopes[1]!,gameplayBatchSchema.parse({...batch(scopes[1]!,profiles[0]!,[]),observationLinks:[{presentationId:a.details.observation.presentationId,legacyEventKey:legacyKey}]}));
    const [link]=await db`SELECT canonical_profile_id FROM analytics_profile_links WHERE account_id=${scopes[0]!} AND profile_id=${profiles[0]!}`;canonical=link!.canonical_profile_id;
    const events=[event('page_view',{route:'/',referrer:'',device:'tablet'}),event('play_clicked',{placement:'hero'},start+1000),event('game_menu_ready',{scene:'NewMenuScene'},start+2000),
      {...event('profile_created',{role:'A',origin:'new'},start+2500),profileId:profiles[0]!},
      event('play_started',{mode:'coop',participants:profiles.map((profileId,i)=>({profileId,role:i?'B':'A'})),tabId:randomUUID()},start+3000),
      {...event('profile_activated',{role:'A'},start+3500),profileId:profiles[0]!},
      {...event('scene_entered',{scene:'BattleScene',region:'forest'},start+4000),profileId:profiles[0]!},
      event('activity_window',{start:start+5000,end:start+15_000,durationMs:10_000,state:'game-active',uncertain:false,cumulativeMs:10_000},start+15_000),
      event('play_ended',{reason:'menu'},start+400_000)];
    // Receive the terminal event before the start to exercise event-time reconstruction.
    await ingestEvents(db,scopes[0]!,[...events].reverse(),'new-uploader');
    for(const [a,label]of [[answers[2]!,'test'],[answers[3]!,'adult']] as const){
      const [link]=await db`SELECT canonical_profile_id FROM analytics_profile_links WHERE account_id=${scopes[0]!} AND profile_id=${a.details.observation.profileId}`;
      await db`INSERT INTO analytics_annotations(id,mutation_id,target_type,target_id,from_at,to_at,label,action,reason,actor_subject)
        VALUES(${randomUUID()},${randomUUID()},'profile',${link!.canonical_profile_id},${new Date(a.timestamp)},${new Date(a.timestamp+1)},${label},'set','Fixture interval','admin')`;
    }
  });
  after(async()=>{
    await auth?.close();if(!db)return;
    await db`DELETE FROM analytics_annotations WHERE actor_subject='admin' AND reason LIKE 'Fixture%'`;
    await db`DELETE FROM analytics_issues WHERE scope_id IN ${db(scopes)} OR profile_id IN ${db(profiles)}`;
    await db`DELETE FROM player_accounts WHERE id IN ${db(scopes)}`;
    await db`DELETE FROM analytics_auth_activity WHERE provider_subject=${subject}`;
    await db`DELETE FROM "user" WHERE email=${subject+'@example.invalid'}`;
    await db.end();
  });
  it('coalesces imported V1 + V2 + alias without widening the player API ownership',async()=>{
    const linksBefore=await db`SELECT * FROM analytics_profile_links ORDER BY account_id,profile_id`;
    const preview=await previewReconciliation(db,profiles[0]);
    assert.equal(preview.candidates.length,1);assert.equal(preview.candidates[0]!.decision,'verified_copy');
    assert.ok(preview.candidates[0]!.matches>0);assert.equal(preview.candidates[0]!.conflicts,0);
    assert.deepEqual([...await db`SELECT * FROM analytics_profile_links ORDER BY account_id,profile_id`],[...linksBefore]);
    const all=await report('overview');assert.equal(all.data.cards.attempts.value,5);assert.equal(all.data.cards.accuracy.value,80);
    assert.equal(all.data.cards.players.value,2);assert.equal(all.data.cards.accounts.value,0);
    assert.equal((await db`SELECT count(DISTINCT canonical_profile_id)::int AS n FROM analytics_profile_links WHERE profile_id=${profiles[0]!}`)[0]!.n,1);
    assert.equal((await gameplaySummary(db,scopes[1]!)).length,1);
    assert.equal((await gameplaySummary(db,randomUUID())).length,0);
  });
  it('keeps card, graph, list, detail, co-op and first-answer denominators identical',async()=>{
    const clickedFilter=await parseFilter(db,{profile:canonical,data:'all',learningActor:'all',from:new Date(start-1).toISOString(),to:new Date(start+600_000).toISOString()});
    assert.equal((await analyticsReport(db,clickedFilter,'attempts','dev')).data.total,3);
    for(const [data,actor,n,c]of [['all','all',5,4],['normal','all',4,3],['normal','unmarked',3,2]] as const){
      const overview=await report('overview',data,actor),list=await report('attempts',data,actor),sessions=await report('sessions',data,actor);
      assert.equal(overview.data.cards.attempts.value,n);assert.equal(list.data.total,n);assert.equal(list.data.items.filter((a:any)=>a.correct).length,c);
      assert.equal(overview.data.daily.reduce((s:number,r:any)=>s+r.attempts,0),n);assert.equal(sessions.data.total,1);
      assert.equal(sessions.data.items[0].participants.length,2);assert.equal(sessions.data.items[0].attempts,n);
      assert.equal(sessions.data.items[0].activeTimeMs,10_000);assert.equal(sessions.data.items[0].status,'ended');
      const player=await report('players/'+canonical,data,actor);assert.equal(player.data.attempts,list.data.items.filter((a:any)=>a.profileId===canonical).length);
      assert.equal(player.data.lastActivityAt,new Date(answers[2]!.timestamp).toISOString());
      assert.equal(player.data.lastProblem,answers[2]!.details.observation.question);
      assert.ok(Number.isFinite(Date.parse(overview.meta.lastReceivedAt!)));
      assert.ok(Number.isFinite(Date.parse(sessions.data.items[0].lastReceivedAt)));
      const traffic=await report('traffic',data,actor);assert.equal(traffic.data.daily.reduce((sum:number,d:any)=>sum+(d.visits??0),0),traffic.data.visits);
    }
    const filter=await query();filter.device='tablet';filter.region='forest';filter.mode='coop';assert.equal((await analyticsReport(db,filter,'attempts','dev')).data.total,5);
    const tested=await report('sessions','test','all');assert.equal(tested.data.total,1);assert.equal(tested.data.items[0].attempts,1);
    const selected=await query();selected.result='wrong';assert.equal((await analyticsReport(db,selected,'attempts','dev')).data.total,1);
    const old=await parseFilter(db,{fromDay:'2026-03-01',toDay:'2026-03-07'});
    assert.ok((await analyticsReport(db,old,'overview','dev')).data.daily.every((d:any)=>d.visits===null&&d.sessions===null));
  });
  it('applies durable test/adult revocation while preserving raw attempts',async()=>{
    const raw=(await db`SELECT count(*)::int AS n FROM gameplay_attempts`)[0]!.n;
    const [a]=await db`SELECT * FROM analytics_effective_annotations WHERE reason='Fixture interval' AND label='test'`;
    const id=randomUUID();await db`INSERT INTO analytics_annotations(id,mutation_id,target_type,target_id,label,action,reverts_id,reason,actor_subject)
      VALUES(${id},${randomUUID()},'profile',${a!.target_id},'test','revoke',${a!.id},'Fixture revoke','admin')`;
    assert.equal((await report('overview','normal','all')).data.cards.attempts.value,5);
    assert.equal((await db`SELECT count(*)::int AS n FROM gameplay_attempts`)[0]!.n,raw);
    await db`DELETE FROM analytics_annotations WHERE id=${id}`;
  });
  it('accepts concurrent retry once; preserves original release/time and quarantines a collision',async()=>{
    const e=event('visibility_changed',{hidden:true},start+30_000);const receipts=await Promise.all([ingestEvents(db,scopes[0]!,[e],'upload-1'),ingestEvents(db,scopes[0]!,[e],'upload-2')]);
    assert.equal(receipts.flatMap(r=>r.acceptedIds).length,1);assert.equal(receipts.flatMap(r=>r.duplicateIds).length,1);
    const collision=await ingestEvents(db,scopes[0]!,[{...e,payload:{hidden:false}}],'upload-3');assert.deepEqual(collision.quarantinedIds,[e.id]);
    const [raw]=await db`SELECT * FROM analytics_events WHERE browser_account_id=${scopes[0]!} AND event_id=${e.id}`;
    assert.equal(raw!.occurred_at.getTime(),e.occurredAt);assert.equal(raw!.source_release,'original-release');
    const conflict=structuredClone(answers[4]!);conflict.correct=false;conflict.details.observation.correct=false;
    await collectGameplay(db,scopes[0]!,batch(scopes[0]!,profiles[1]!,[conflict]));assert.equal((await report('overview')).data.cards.attempts.value,4);
    await db`DELETE FROM analytics_issues WHERE kind='answer_collision' AND scope_id=${scopes[0]!}`;
  });
  it('rejects unauthorized reads and untrusted annotation writes with no-store on all outcomes',async()=>{
    const service=createAnalyticsService(db,config),principal={provider:'google' as const,providerSubject:'admin',email:'admin@example.invalid',emailVerified:true,sessionId:'s'};
    const fakeAuth:AuthService={close:async()=>{},handler:async()=>new Response(),getPrincipal:async headers=>headers.get('cookie')==='admin'?principal:headers.get('cookie')==='parent'?{...principal,providerSubject:'parent'}:null};
    const api=analyticsRoutes({config,auth:fakeAuth,service,resolveBrowser:(token,device)=>resolveGameplayBrowser(db,token,device)});
    for(const [cookie,status]of [['',401],['parent',403],['admin',200]] as const){const r=await api.request('/v1/admin/overview',{headers:{Cookie:cookie}});assert.equal(r.status,status);assert.match(r.headers.get('cache-control')!,/no-store/);}
    for(const headers of [{Cookie:'admin'},{Cookie:'admin',Origin:'http://evil.invalid','Content-Type':'application/json','X-CSRF-Token':service.csrf(principal)}])
      assert.equal((await api.request('/v1/admin/annotations',{method:'POST',headers,body:'{}'})).status,403);
    assert.equal((await api.request('/v1/admin/players?sql=drop',{headers:{Cookie:'admin'}})).status,400);
    assert.equal((await api.request('/v1/admin/overview?cursor=bad',{headers:{Cookie:'admin'}})).status,400);
    const clear=await api.request('/v1/analytics/auth-context',{method:'DELETE',headers:{Origin:'http://localhost:8002'}});
    assert.equal(clear.status,200);assert.match(clear.headers.get('set-cookie')!,/ck-analytics-auth=;.*Max-Age=0/);
    assert.equal((await api.request('/v1/analytics/auth-context',{method:'DELETE',headers:{Origin:'http://evil.invalid'}})).status,403);
  });
  it('uses Prague calendar boundaries across DST and rejects future-clock snapshots as latest',async()=>{
    const f=await parseFilter(db,{fromDay:'2026-03-29',toDay:'2026-03-29'});assert.equal(Date.parse(f.to)-Date.parse(f.from),23*3600_000);
    const autumn=await parseFilter(db,{fromDay:'2026-10-25',toDay:'2026-10-25'});assert.equal(Date.parse(autumn.to)-Date.parse(autumn.from),25*3600_000);
    const bad=batch(scopes[0]!,profiles[0]!,[],999,{player:{name:'Future clock must not win'},mathStats:{}});bad.deviceId=randomUUID();bad.savedAt=Date.now()+365*86_400_000;
    await collectGameplay(db,scopes[0]!,bad);assert.equal((await report('players/'+canonical)).data.name,'<img src=x onerror=alert(1)>');
  });
  it('records two real Better Auth Google callbacks as one registration and two logins',async t=>{
    const keys=generateKeyPairSync('rsa',{modulusLength:2048}),publicKey={...keys.publicKey.export({format:'jwk'}),kid:'fixture-key',alg:'RS256',use:'sig'};let nonce='';
    t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
      const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
      if(url.includes('oauth2.googleapis.com/token')){
        const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture-key'})).toString('base64url'),payload=Buffer.from(JSON.stringify({sub:subject,email:subject+'@example.invalid',email_verified:true,name:'Synthetic parent',
          iss:'https://accounts.google.com',aud:config.auth!.googleClientId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...(nonce?{nonce}: {})})).toString('base64url');
        const signature=sign('RSA-SHA256',Buffer.from(head+'.'+payload),keys.privateKey).toString('base64url');
        return Response.json({access_token:'fixture-access-token',id_token:head+'.'+payload+'.'+signature,token_type:'Bearer',expires_in:3600});
      }
      if(url.includes('www.googleapis.com/oauth2/v3/certs'))return Response.json({keys:[publicKey]});throw new Error('Unexpected external fetch '+url);
    });
    auth=createAuthService(config,config.auth!,data=>recordGoogleLogin(db,data));
    for(let i=0;i<2;i++){
      const begin=await auth.handler(new Request(config.auth!.authBaseUrl+'/api/auth/sign-in/social',{method:'POST',headers:{Origin:config.auth!.authBaseUrl,'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/admin/'})}));
      const url=new URL((await begin.json()).url);nonce=url.searchParams.get('nonce')??'';const cookie=begin.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
      const callback:Response=await auth.handler(new Request(config.auth!.authBaseUrl+'/api/auth/callback/google?code=fixture&state='+url.searchParams.get('state'),{headers:{Cookie:cookie}}));
      assert.equal(callback.status,302);assert.equal(new URL(callback.headers.get('location')!,config.auth!.authBaseUrl).pathname,'/admin/');
    }
    assert.equal((await db`SELECT count(*)::int AS n FROM "account" WHERE provider_id='google' AND account_id=${subject}`)[0]!.n,1);
    assert.equal((await db`SELECT count(*)::int AS n FROM analytics_auth_activity WHERE provider_subject=${subject}`)[0]!.n,2);
    const accounts=await analyticsReport(db,await parseFilter(db,{preset:'today',data:'all',learningActor:'all'}),'accounts','dev');assert.equal(accounts.data.total,1);
    assert.equal(accounts.data.totalAccounts,1);assert.equal(accounts.data.unlinkedAccounts,1);assert.equal(accounts.data.activeAccounts,0);
    assert.equal(accounts.data.daily.reduce((n:number,d:any)=>n+d.registrations,0),accounts.data.newRegistrations);
  });
});

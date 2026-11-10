import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { clientEventSchema, observationSchema } from '../../server/src/domain/analytics/contracts.js';
import { stableHash } from '../../server/src/domain/analytics/ingest.js';
import { unionDuration } from '../../server/src/domain/analytics/queries.js';
import { ActivityClock } from '../../src/telemetry/ActivityClock.js';
import { captureGameplay } from '../../src/telemetry/gameplayData.js';
import { createAnalyticsService } from '../../server/src/admin/routes.js';
import { underwaterPumpChallenge } from '../../src/systems/UnderwaterPumpProblems.js';

describe('analytics fast boundaries',()=>{
  it('merges overlapping intervals without counting two tabs twice',()=>{assert.equal(unionDuration([[10,30],[20,40],[40,50],[90,100],[3,3]]),50);});
  it('counts game thinking but not hidden, paused or loading as play time',()=>{const clock=new ActivityClock();clock.sample(0,0,'game-active');clock.sample(1000,1000,'loading');clock.sample(2000,2000,'hidden');clock.sample(3000,3000,'paused');clock.sample(4000,4000,'game-active');clock.sample(5000,5000,'game-active');assert.equal(clock.totalGameMs,2000);});
  it('excludes sleep and clock jumps instead of fabricating elapsed time',()=>{const c=new ActivityClock();c.sample(0,0,'game-active');assert.equal(c.sample(60_000,60_000,'game-active'),null);assert.equal(c.totalGameMs,0);assert.equal(c.uncertain,true);c.sample(60_001,60_001,'game-active');assert.equal(c.sample(120_002,60_002,'game-active'),null);});
  it('uses stable content hashes independent of property order',()=>{assert.equal(stableHash({b:2,a:{d:4,c:3}}),stableHash({a:{c:3,d:4},b:2}));assert.notEqual(stableHash({a:1}),stableHash({a:2}));});
  it('validates exact kind payloads and rejects private arbitrary content',()=>{const base={schemaVersion:1,id:randomUUID(),visitorId:randomUUID(),visitId:randomUUID(),runId:randomUUID(),seq:0,occurredAt:Date.now(),monotonicMs:0,sourceRelease:'test'};
    assert.ok(clientEventSchema.safeParse({...base,kind:'page_view',payload:{route:'/',referrer:'example.com',device:'desktop'}}).success);
    for(const payload of [{route:'/admin/',referrer:'',device:'desktop'},{route:'/',referrer:'https://parent/email',device:'desktop'},{route:'/',referrer:'',device:'desktop',email:'private'}])assert.equal(clientEventSchema.safeParse({...base,kind:'page_view',payload}).success,false);
    assert.equal(clientEventSchema.safeParse({...base,kind:'play_started',payload:{mode:'coop',participants:[],tabId:randomUUID()}}).success,false);
  });
  it('never turns synthetic placement counters into observed answers',()=>{const snapshot=captureGameplay(0,{timestamp:1,player:{name:'fixture',gameplayProfileId:randomUUID()},mathStats:{masteryData:{problemRecords:{'A1:1+1':{problemKey:'A1:1+1',subAtomId:'A1',form:'result_unknown',attempts:[{synthetic:true,timestamp:1,correct:true,sequenceIndex:1,responseTimeMs:500,context:'battle'}]}},subAtoms:{A1:{successfulSolves:999}}}}} as any);assert.equal(snapshot.attempts.length,0);});
  it('accepts all actual pump choices while bounding arbitrary oversized payloads',()=>{
    const c=underwaterPumpChallenge('A',()=>0.4),choices=c.options.flat();assert.equal(choices.length,12);
    const trace={presentationId:randomUUID(),profileId:randomUUID(),runId:randomUUID(),scene:'UnderwaterRoomScene',context:'underwater_pump',role:'A',sourceRelease:'test',
      presentedAt:Date.now(),question:c.readings.join(' → '),choices,correctAnswer:c.solution.map((n,i)=>c.options[i][n]).join(', '),assisted:false,clockQuality:'observed',taskKind:'arithmetic'};
    assert.ok(observationSchema.safeParse(trace).success);assert.equal(observationSchema.safeParse({...trace,choices:Array(25).fill(1)}).success,false);
    assert.ok(clientEventSchema.safeParse({schemaVersion:1,id:randomUUID(),visitorId:randomUUID(),visitId:randomUUID(),runId:trace.runId,seq:0,occurredAt:trace.presentedAt,monotonicMs:0,
      sourceRelease:'test',kind:'problem_presented',payload:{presentationId:trace.presentationId,question:trace.question,choices,context:trace.context,taskKind:'arithmetic',role:'A'}}).success);
  });
  it('pins only verified configured Google identities and binds CSRF to a session',async()=>{const db=Object.assign(async()=>[],{});const config:any={auth:{authSecret:'test-secret'},analytics:{adminEnabled:true,adminSubjects:new Set(['allowed']),bootstrapEmail:'admin@example.invalid'}};
    const service=createAnalyticsService(db as any,config),principal={provider:'google' as const,providerSubject:'allowed',email:'other@example.invalid',sessionId:'one'};
    assert.equal(await service.isAdmin(null),false);assert.equal(await service.isAdmin({...principal,providerSubject:'other'}),false);assert.equal(await service.isAdmin({...principal,providerSubject:'other',email:'admin@example.invalid',emailVerified:false}),false);
    assert.equal(await service.isAdmin(principal),true);const token=service.csrf(principal);assert.equal(service.validCsrf(principal,token),true);assert.equal(service.validCsrf({...principal,sessionId:'two'},token),false);
  });
  it('requires a valid signed, unexpired OAuth visit context',()=>{const db:any=()=>[];const service=createAnalyticsService(db,{auth:{authSecret:'test-secret'}} as any),scope=randomUUID(),id=randomUUID(),cookie=service.authContext(scope,id);
    assert.deepEqual(service.readAuthContext(new Headers({cookie:'ck-analytics-auth='+cookie})),{scope,id});assert.equal(service.readAuthContext(new Headers({cookie:'ck-analytics-auth='+cookie+'x'})),undefined);
  });
});

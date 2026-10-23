import type { Database } from '../../db/database.js';
import type { ReportFilter, ReportMeta, Metric } from '../../contracts/analytics.js';
import { z } from 'zod';

const querySchema=z.object({ from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),
  fromDay:z.iso.date().optional(),toDay:z.iso.date().optional(),preset:z.enum(['today','yesterday','7d','30d']).default('7d'),
  tz:z.literal('Europe/Prague').optional(),data:z.enum(['normal','test','all']).default('normal'),
  // Canonical PostgreSQL UUIDs are deterministic md5 identities, not random RFC-v4 UUIDs.
  learningActor:z.enum(['unmarked','adult','all']).default('unmarked'),profile:z.guid().optional(),
  session:z.string().max(80).optional(),participant:z.uuid().optional(),skill:z.string().max(100).optional(),
  region:z.string().max(100).optional(),mode:z.enum(['solo','coop']).optional(),device:z.enum(['desktop','tablet','mobile']).optional(),
  release:z.string().max(100).optional(),search:z.string().max(100).optional(),limit:z.coerce.number().int().min(1).max(100).default(25),
  result:z.enum(['correct','wrong']).optional(),assistance:z.enum(['yes','no','unknown']).optional(),
  state:z.enum(['active','paused','ended','unconfirmed','incomplete']).optional(),location:z.string().max(100).optional(),
  stage:z.enum(['web','click','menu','profile','answer']).optional(),
  detailScope:z.enum(['period','whole']).default('period'),
  cursor:z.string().max(1500).optional(),sort:z.enum(['newest','oldest']).default('newest') }).strict();
export async function parseFilter(db:Database,input:Record<string,string>):Promise<ReportFilter> {
  const q=querySchema.parse(input);
  if(q.cursor){let cursor:unknown;try{cursor=JSON.parse(Buffer.from(q.cursor,'base64url').toString());}catch{throw new Error('invalid_cursor');}
    if(!Array.isArray(cursor)||cursor.length!==2||cursor.some(v=>typeof v!=='string'))throw new Error('invalid_cursor');}
  const [range]=await db`SELECT
    (date_trunc('day',now() AT TIME ZONE 'Europe/Prague') AT TIME ZONE 'Europe/Prague') AS today,
    ((${q.fromDay??null}::date)::timestamp AT TIME ZONE 'Europe/Prague') AS first,
    ((${q.toDay??null}::date+1)::timestamp AT TIME ZONE 'Europe/Prague') AS last,
    ((date_trunc('day',now() AT TIME ZONE 'Europe/Prague') -
      (${q.preset==='30d'?29:q.preset==='7d'?6:q.preset==='yesterday'?1:0}::int * interval '1 day')) AT TIME ZONE 'Europe/Prague') AS preset_start`;
  const from=q.from??range!.first?.toISOString()??range!.preset_start.toISOString();
  const to=q.to??range!.last?.toISOString()??(q.preset==='yesterday'?range!.today.toISOString():new Date().toISOString());
  const span=Date.parse(to)-Date.parse(from);
  if(!(span>0 && span<=366*86_400_000))throw new Error('invalid_period');
  return {...q,from,to,timezone:'Europe/Prague'};
}
const iso=(v:any):string=>v instanceof Date?v.toISOString():typeof v==='number'?new Date(v).toISOString():String(v);
const ms=(v:any):number=>v instanceof Date?v.getTime():typeof v==='number'?v:Date.parse(v);
const inPeriod=(v:any,f:ReportFilter)=>ms(v)>=Date.parse(f.from)&&ms(v)<Date.parse(f.to);
const metric=(value:number|null,unit:Metric['unit']='count',partial=false,samples?:number):Metric=>({value,unit,
  status:value===null?'unavailable':partial?'partial':'measured',...(samples===undefined?{}:{samples})});
const median=(values:number[])=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor(a.length/2)]!+a[Math.ceil(a.length/2)-1]!)/2:null;};
export function unionDuration(intervals:Array<[number,number]>):number {
  const list=intervals.filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);let total=0,start=0,end=0;
  for(const [a,b]of list){if(a>end){total+=end-start;start=a;end=b;}else end=Math.max(end,b);}
  return total+end-start;
}
type Dataset={attempts:any[];events:any[];profiles:any[];accounts:any[];annotations:any[];issues:any[];coverage:any[];stats:any[];auth:any[]};
async function dataset(db:Database):Promise<Dataset> {
  // Pilot reports use a consistent read-only snapshot; client responses are still paginated.
  return db.begin('read only isolation level repeatable read',async tx=>{
    await tx`SET LOCAL statement_timeout = '2000ms'`;
    const attempts=await tx`SELECT * FROM analytics_attempts_v1`;
    const events=await tx`SELECT * FROM analytics_events WHERE occurred_at>=now()-interval '367 days' ORDER BY occurred_at,run_id,seq`;
    const profiles=await tx`SELECT l.*,p.parent_account_id,p.created_at AS first_observed_at,s.client_saved_at,s.received_at,s.release,s.payload,s.device_id,s.revision
      FROM analytics_profile_links l JOIN gameplay_profiles p USING(account_id,profile_id)
      LEFT JOIN LATERAL (SELECT * FROM gameplay_progress g WHERE g.account_id=p.account_id AND g.profile_id=p.profile_id
        ORDER BY CASE WHEN client_saved_at<=received_at+interval '5 minutes' THEN client_saved_at END DESC NULLS LAST,received_at DESC LIMIT 1) s ON true`;
    const accounts=await tx`SELECT a.account_id AS subject,min(a.created_at) AS registered_at,min(u.email) AS email,min(u.id) AS auth_user_id,
      (SELECT i.account_id FROM account_identities i WHERE i.provider='google' AND i.provider_subject=a.account_id) AS parent_id
      FROM "account" a JOIN "user" u ON u.id=a.user_id WHERE a.provider_id='google' GROUP BY a.account_id`;
    const annotations=await tx`SELECT * FROM analytics_effective_annotations`;
    const issues=await tx`SELECT * FROM analytics_issues ORDER BY last_seen_at DESC`;
    const coverage=await tx`SELECT * FROM analytics_capabilities ORDER BY changed_at`;
    const stats=await tx`SELECT * FROM analytics_ingest_stats ORDER BY bucket DESC`;
    const auth=await tx`SELECT * FROM analytics_auth_activity ORDER BY occurred_at`;
    return {attempts:[...attempts],events:[...events],profiles:[...profiles],accounts:[...accounts],annotations:[...annotations],
      issues:[...issues],coverage:[...coverage],stats:[...stats],auth:[...auth]};
  });
}
const scoped=(scope:string,id:string)=>`${scope}:${id}`;
function annotated(ds:Dataset,label:string,profile:string|undefined,session:string|undefined,visit:string|undefined,date:any):boolean {
  return ds.annotations.some(a=>a.label===label && ((a.target_type==='profile'&&a.target_id===profile)||
    (a.target_type==='session'&&a.target_id===session)||(a.target_type==='visit'&&a.target_id===visit)) &&
    (!a.from_at || (ms(date)>=ms(a.from_at)&&ms(date)<ms(a.to_at))));
}
function includeData(test:boolean,f:ReportFilter){return f.data==='all'||(f.data==='test'?test:!test);}
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'});
const day=(date:any)=>dayFormatter.format(new Date(date));
function page<T extends {id:string}>(rows:T[],f:ReportFilter,key:(row:T)=>string) {
  const ordered=[...rows].sort((a,b)=>(key(a).localeCompare(key(b))||a.id.localeCompare(b.id))*(f.sort==='newest'?-1:1));
  let rest=ordered;
  if(f.cursor){let cursor:any;try{cursor=JSON.parse(Buffer.from(f.cursor,'base64url').toString());}catch{throw new Error('invalid_cursor');}
    if(!Array.isArray(cursor)||cursor.length!==2||cursor.some(x=>typeof x!=='string'))throw new Error('invalid_cursor');
    rest=ordered.filter(r=>((key(r).localeCompare(cursor[0])||r.id.localeCompare(cursor[1]))*(f.sort==='newest'?-1:1))>0);}
  const items=rest.slice(0,f.limit),last=items.at(-1);
  return {items,total:rows.length,nextCursor:rest.length>f.limit&&last?Buffer.from(JSON.stringify([key(last),last.id])).toString('base64url'):null};
}
export async function analyticsReport(db:Database,f:ReportFilter,resource:string,environment:'dev'|'prd',source?:Dataset,compare=true) {
  const ds=source??await dataset(db);
  if(f.detailScope==='whole'&&/^sessions\/[^/]+(?:\/timeline)?$/.test(resource)){
    const id=resource.split('/')[1],times=[...ds.events,...ds.attempts.map(a=>({...a,browser_account_id:a.account_id}))]
      .filter(e=>e.play_session_id&&scoped(e.browser_account_id,e.play_session_id)===id).map(e=>ms(e.occurred_at));
    if(times.length)f={...f,from:new Date(Math.min(...times)).toISOString(),to:new Date(Math.max(...times)+1).toISOString()};
  }
  const canonical=new Map(ds.profiles.map(p=>[scoped(p.account_id,p.profile_id),p.canonical_profile_id]));
  const canon=(scope:string,profile:string)=>canonical.get(scoped(scope,profile));
  const deviceForSession=(scope:string,id:string|undefined)=>{
    const first=ds.events.find(e=>e.browser_account_id===scope&&e.play_session_id===id),view=ds.events.find(e=>e.kind==='page_view'&&e.browser_account_id===scope&&e.visit_id===first?.visit_id);
    return view?.payload.device;};
  const modeFor=(scope:string,id:string|undefined)=>ds.events.find(e=>e.browser_account_id===scope&&e.play_session_id===id&&['play_started','play_resumed'].includes(e.kind))?.payload.mode;
  const visitFor=(scope:string,id:string|undefined)=>ds.events.find(e=>e.browser_account_id===scope&&e.play_session_id===id)?.visit_id;
  const regionFor=(scope:string,id:string|undefined,scene:string|undefined)=>ds.events.filter(e=>e.browser_account_id===scope&&e.play_session_id===id&&e.kind==='scene_entered'&&e.payload.scene===scene).at(-1)?.payload.region;
  const rows=ds.attempts.map(a=>{
    const o=a.details.observation,session=a.play_session_id?scoped(a.account_id,a.play_session_id):undefined;
    return {id:scoped(a.canonical_profile_id,a.logical_key),eventKey:a.event_key,profileId:a.canonical_profile_id,rawProfileId:a.profile_id,
      scope:a.account_id,occurredAt:iso(a.occurred_at),receivedAt:iso(a.received_at),context:a.context,problemKey:a.problem_key,
      skill:a.details.subAtomId??a.problem_key.split(':')[0],correct:a.correct,responseTimeMs:a.response_time_ms,
      assisted:o?o.assisted:a.source==='comparison'?a.assisted:null,question:o?.question??a.problem_key,choices:o?.choices??null,
      selected:o?.selected??a.details.selectedRelation??null,correctAnswer:o?.correctAnswer??null,role:o?.role??null,scene:o?.scene??null,sessionId:session??null,
      laterAttempts:o?ds.events.filter(e=>e.browser_account_id===a.account_id&&e.kind==='problem_corrected'&&e.payload.presentationId===o.presentationId)
        .map(e=>({occurredAt:iso(e.occurred_at),selected:e.payload.selected,correct:e.payload.correct})):[],
      release:a.source_release??null,uploadRelease:a.release,origin:a.capture_origin??'historical',clockQuality:ms(a.occurred_at)>ms(a.received_at)+300_000?'uncertain':o?.clockQuality??'legacy',form:a.details.form??null,
      mode:modeFor(a.account_id,a.play_session_id),device:deviceForSession(a.account_id,a.play_session_id),region:regionFor(a.account_id,a.play_session_id,o?.scene),
      test:annotated(ds,'test',a.canonical_profile_id,session,visitFor(a.account_id,a.play_session_id)?scoped(a.account_id,visitFor(a.account_id,a.play_session_id)):undefined,a.occurred_at),
      adult:annotated(ds,'adult',a.canonical_profile_id,session,undefined,a.occurred_at)};
  }).sort((a,b)=>ms(a.occurredAt)-ms(b.occurredAt)||a.id.localeCompare(b.id));
  const common=rows.filter(a=>inPeriod(a.occurredAt,f)&&includeData(a.test,f)&&(!f.profile||a.profileId===f.profile)&&
    (!f.participant||a.rawProfileId===f.participant)&&(!f.session||a.sessionId===f.session)&&(!f.skill||a.skill===f.skill)&&
    (!f.release||(a.release??a.uploadRelease)===f.release)&&(!f.region||a.region===f.region)&&(!f.mode||a.mode===f.mode)&&(!f.device||a.device===f.device)&&
    (!f.result||a.correct===(f.result==='correct'))&&(!f.assistance||(f.assistance==='unknown'?a.assisted===null:a.assisted===(f.assistance==='yes'))));
  let attempts=common.filter(a=>f.learningActor==='all'||(f.learningActor==='adult'?a.adult:!a.adult));
  const summary=(a:typeof rows)=>({attempts:a.length,correct:a.filter(x=>x.correct).length,
    accuracy:a.length?100*a.filter(x=>x.correct).length/a.length:null,medianResponseTimeMs:median(a.filter(x=>x.correct&&x.clockQuality!=='uncertain').map(x=>x.responseTimeMs))});
  const events=ds.events.filter(e=>!ds.issues.some(i=>i.kind==='event_collision'&&i.status==='open'&&i.scope_id===e.browser_account_id&&i.event_key===e.event_id))
    .map(e=>({...e,id:scoped(e.browser_account_id,e.event_id),occurredAt:iso(e.occurred_at),
    sessionId:e.play_session_id?scoped(e.browser_account_id,e.play_session_id):null,visitId:scoped(e.browser_account_id,e.visit_id),
    canonicalProfileId:e.profile_id?canon(e.browser_account_id,e.profile_id):undefined}));
  const eventAllowed=(e:any,skipData=false)=>(skipData||includeData(annotated(ds,'test',e.canonicalProfileId,e.sessionId,e.visitId,e.occurredAt),f))&&
    (!f.device||(e.payload.device??deviceForSession(e.browser_account_id,e.play_session_id))===f.device)&&(!f.release||e.source_release===f.release)&&
    (!f.session||e.sessionId===f.session)&&(!f.profile||e.canonicalProfileId===f.profile||e.payload.participants?.some((p:any)=>canon(e.browser_account_id,p.profileId)===f.profile))&&
    (!f.participant||e.profile_id===f.participant||e.payload.participants?.some((p:any)=>p.profileId===f.participant))&&
    (!f.mode||modeFor(e.browser_account_id,e.play_session_id)===f.mode)&&
    (!f.region||e.payload.region===f.region||rows.some(a=>a.sessionId===e.sessionId&&a.region===f.region))&&
    (!f.skill||rows.some(a=>a.sessionId===e.sessionId&&a.skill===f.skill));
  let selectedEvents=events.filter(e=>inPeriod(e.occurredAt,f)&&eventAllowed(e));
  const timeFor=(list:any[],state:string)=>{
    const byVisitor=new Map<string,Array<[number,number]>>();
    for(const e of list){if(e.kind!=='activity_window'||e.payload.state!==state||e.clock_quality!=='observed'||!eventAllowed(e,true))continue;
      const start=Math.max(e.payload.start,Date.parse(f.from)),end=Math.min(e.payload.end,Date.parse(f.to));
      if(end<=start||e.payload.uncertain)continue;const k=state==='web-active'?scoped(e.browser_account_id,e.visitor_id):(e.sessionId??e.run_id);
      const intervals=byVisitor.get(k)??[];
      const cuts=ds.annotations.filter(a=>a.label==='test'&&a.from_at&&((a.target_type==='profile'&&a.target_id===e.canonicalProfileId)||(a.target_type==='session'&&a.target_id===e.sessionId)||(a.target_type==='visit'&&a.target_id===e.visitId)));
      const points=[start,end,...cuts.flatMap(a=>[Math.max(start,ms(a.from_at)),Math.min(end,ms(a.to_at))]).filter(n=>n>start&&n<end)].sort((a,b)=>a-b);
      for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!;
        const test=annotated(ds,'test',e.canonicalProfileId,e.sessionId,e.visitId,new Date((a+b)/2));if(includeData(test,f))intervals.push([a,b]);}
      byVisitor.set(k,intervals);}
    return [...byVisitor.values()].reduce((n,v)=>n+unionDuration(v),0);
  };
  const profileGroups=new Map<string,any[]>();for(const p of ds.profiles){const g=profileGroups.get(p.canonical_profile_id)??[];g.push(p);profileGroups.set(p.canonical_profile_id,g);}
  const allProfiles=[...profileGroups].map(([id,copies])=>{
    const history=rows.filter(a=>a.profileId===id), observed=events.filter(e=>e.canonicalProfileId===id),
      chosen=[...copies].sort((a,b)=>{const valid=(x:any)=>x.client_saved_at&&ms(x.client_saved_at)<=ms(x.received_at)+300_000?ms(x.client_saved_at):ms(x.first_observed_at);
        return valid(b)-valid(a)||ms(b.received_at??b.first_observed_at)-ms(a.received_at??a.first_observed_at);})[0]!;
    const ownAttempts=attempts.filter(a=>a.profileId===id),validHistory=history.filter(a=>ms(a.occurredAt)<=ms(a.receivedAt)+300_000),last=validHistory.at(-1);
    const creation=observed.find(e=>e.kind==='profile_created');
    return {id,name:chosen.payload?.player?.name??'Nezaznamenáno',firstObservedAt:iso(copies.reduce((a,b)=>ms(a.first_observed_at)<ms(b.first_observed_at)?a:b).first_observed_at),
      createdAt:creation?.occurredAt??null,lastActivityAt:validHistory.length?iso(Math.max(...validHistory.map(a=>ms(a.occurredAt)))):null,
      linkedAccounts:[...new Set(copies.map(p=>p.parent_account_id).filter(Boolean))],
      ...summary(ownAttempts),sourceCopies:copies.length,identityStatus:copies.some(p=>p.decision==='unresolved')?'unresolved':'verified',
      release:chosen.release??null,lastLocation:observed.filter(e=>e.kind==='scene_entered').at(-1)?.payload.scene??null,
      state:chosen.payload??null,stateSource:{deviceId:chosen.device_id,revision:chosen.revision,clientSavedAt:chosen.client_saved_at,receivedAt:chosen.received_at},
      sourceStates:copies.map(p=>({scope:p.account_id,deviceId:p.device_id,revision:p.revision,clientSavedAt:p.client_saved_at,
        receivedAt:p.received_at,level:p.payload?.player?.level??null,identityStatus:p.decision})),
      lastProblem:last?.question??last?.problemKey??null};
  });
  let profiles=allProfiles.filter(p=>(!f.profile||p.id===f.profile)&&(!f.search||p.name.toLowerCase().includes(f.search.toLowerCase())||p.id.includes(f.search.toLowerCase()))&&
    (f.data==='all'||(f.data==='test'?(attempts.some(a=>a.profileId===p.id)||ds.annotations.some(a=>a.label==='test'&&a.target_type==='profile'&&a.target_id===p.id)):
      !ds.annotations.some(a=>a.label==='test'&&a.target_type==='profile'&&a.target_id===p.id&&!a.from_at)))&&
    (!(f.mode||f.skill||f.region||f.device||f.release)||attempts.some(a=>a.profileId===p.id)));
  const sessionGroups=new Map<string,any[]>();for(const e of events){if(!e.sessionId)continue;const g=sessionGroups.get(e.sessionId)??[];g.push(e);sessionGroups.set(e.sessionId,g);}
  const sessions=[...sessionGroups].map(([id,history])=>{
    const start=history.find(e=>e.kind==='play_started'),end=history.filter(e=>e.kind==='play_ended').at(-1),last=history.at(-1)!;
    const roster=start?.payload.participants??history.find(e=>e.kind==='play_resumed')?.payload.participants??[];
    const participants=roster.map((p:any)=>({role:p.role,rawProfileId:p.profileId,profileId:canon(last.browser_account_id,p.profileId),
      name:profiles.find(x=>x.id===canon(last.browser_account_id,p.profileId))?.name??'Nezaznamenáno'}));
    const own=attempts.filter(a=>a.sessionId===id);
    return {id,startedAt:start?.occurredAt??null,endedAt:end?.occurredAt??null,lastActivityAt:last.occurredAt,
      lastReceivedAt:iso(Math.max(...history.map(e=>ms(e.received_at)))),mode:start?.payload.mode??'unknown',participants,
      ...summary(own),activeTimeMs:timeFor(history,'game-active'),loadingTimeMs:timeFor(history,'loading'),device:deviceForSession(last.browser_account_id,last.play_session_id),
      status:end?'ended':start?(Date.now()-ms(last.received_at)>45_000?'unconfirmed':
        history.filter(e=>e.kind==='pause_changed').at(-1)?.payload.paused||history.filter(e=>e.kind==='visibility_changed').at(-1)?.payload.hidden?'paused':'active'):'incomplete',
      hasError:history.some(e=>['client_error','asset_error','save_error'].includes(e.kind)),
      endReason:end?.payload.reason??null,firstLocation:history.find(e=>e.kind==='scene_entered')?.payload.scene??null,
      lastLocation:history.filter(e=>e.kind==='scene_entered').at(-1)?.payload.scene??null,release:start?.source_release??last.source_release,
      hasIncludedData:own.length>0||history.some(e=>includeData(annotated(ds,'test',e.canonicalProfileId,id,e.visitId,e.occurredAt),f)),
      timeline:history.filter(e=>!['activity_window'].includes(e.kind)&&inPeriod(e.occurredAt,f)&&eventAllowed(e)).map(e=>({id:e.id,kind:e.kind,occurredAt:e.occurredAt,payload:e.payload,profileId:e.canonicalProfileId??null})),
      attemptItems:own};
  }).filter(s=>(!f.session||s.id===f.session)&&(!f.profile||s.participants.some((p:any)=>p.profileId===f.profile))&&
    (!f.mode||s.mode===f.mode)&&(!f.release||s.release===f.release)&&(!f.device||s.device===f.device)&&
    (!f.region||events.some(e=>e.sessionId===s.id&&e.payload.region===f.region))&&(!f.skill||rows.some(a=>a.sessionId===s.id&&a.skill===f.skill))&&
    (!f.participant||s.participants.some((p:any)=>p.rawProfileId===f.participant))&&(!f.state||s.status===f.state)&&(!f.location||s.lastLocation===f.location)&&
    (!(f.result||f.assistance)||s.attempts>0)&&
    s.hasIncludedData);
  if(f.state||f.location){
    const eligible=new Set(sessions.map(s=>s.id));attempts=attempts.filter(a=>!!a.sessionId&&eligible.has(a.sessionId));
    profiles=profiles.filter(p=>sessions.some(s=>s.participants.some((participant:any)=>participant.profileId===p.id)));
    for(const p of profiles)Object.assign(p,summary(attempts.filter(a=>a.profileId===p.id)));
  }
  for(const p of profiles){const ownSessions=sessions.filter(s=>s.participants.some((participant:any)=>participant.profileId===p.id));
    Object.assign(p,{sessionsCount:ownSessions.filter(s=>s.startedAt&&inPeriod(s.startedAt,f)).length,
      sharedTimeMs:ownSessions.reduce((n,s)=>n+s.activeTimeMs,0),lastSkill:attempts.filter(a=>a.profileId===p.id).at(-1)?.skill??null});}
  const visits=[...new Set(events.map(e=>e.visitId))].map(id=>{
    const h=events.filter(e=>e.visitId===id&&eventAllowed(e)&&ms(e.occurredAt)<Date.parse(f.to)),first=h[0];if(!first)return null;
    if((f.state||f.location||f.result||f.assistance)&&!h.some(e=>sessions.some(s=>s.id===e.sessionId)))return null;
    const pageViews=h.filter(e=>e.kind==='page_view'),landing=pageViews.find(e=>e.payload.route==='/'),click=h.find(e=>e.kind==='play_clicked'&&(!landing||ms(e.occurredAt)>=ms(landing.occurredAt)));
    const menu=h.find(e=>e.kind==='game_menu_ready'&&(!click||ms(e.occurredAt)>=ms(click.occurredAt)));
    const activation=h.find(e=>e.kind==='profile_activated'&&(!menu||ms(e.occurredAt)>=ms(menu.occurredAt)));
    const visitAnswers=attempts.filter(a=>h.some(e=>e.sessionId===a.sessionId)&&(!activation||ms(a.occurredAt)>=ms(activation.occurredAt)));
    return {id,visitorId:first.visitor_id,startedAt:first.occurredAt,lastActivityAt:h.at(-1)!.occurredAt,
      device:pageViews[0]?.payload.device??'unknown',referrer:pageViews[0]?.payload.referrer??'',utm:pageViews[0]?.payload.utmSource??null,
      pageViews:pageViews.length,playClicks:h.filter(e=>e.kind==='play_clicked').length,landingAt:landing?.occurredAt??null,
      clickedAt:click?.occurredAt??null,menuAt:menu?.occurredAt??null,activatedAt:activation?.occurredAt??null,answered:visitAnswers.length>0,
      activeTimeMs:timeFor(h,'web-active'),sessions:sessions.filter(s=>h.some(e=>e.sessionId===s.id)).map(s=>s.id),
      timeline:h.filter(e=>e.kind!=='activity_window').map(e=>({id:e.id,kind:e.kind,occurredAt:e.occurredAt,payload:e.payload}))};
  }).filter((v):v is NonNullable<typeof v>=>v!==null).filter(v=>(!f.device||v.device===f.device)&&
    (!f.stage||(f.stage==='web'?!!v.landingAt:f.stage==='click'?!!v.clickedAt:f.stage==='menu'?!!v.clickedAt&&!!v.menuAt:
      f.stage==='profile'?!!v.clickedAt&&!!v.menuAt&&!!v.activatedAt:!!v.clickedAt&&!!v.menuAt&&!!v.activatedAt&&v.answered)));
  const filteredVisits=new Set(visits.map(v=>v.id));
  const contextEvents=(f.state||f.location||f.stage||f.result||f.assistance)?events.filter(e=>filteredVisits.has(e.visitId)&&
    (!e.sessionId||sessions.some(s=>s.id===e.sessionId))):events;
  selectedEvents=selectedEvents.filter(e=>contextEvents.includes(e));
  const registered=ds.accounts.map(a=>{
    const linked=allProfiles.filter(p=>p.linkedAccounts.includes(a.parent_id)),own=rows.filter(r=>linked.some(p=>p.id===r.profileId)&&inPeriod(r.occurredAt,f)&&includeData(r.test,f));
    return {id:a.subject,email:String(a.email).replace(/^(.{1,2}).*(@.*)$/,'$1•••$2'),
      registeredAt:iso(a.registered_at),lastLoginAt:ds.auth.filter(x=>x.provider_subject===a.subject&&x.kind==='google_login').at(-1)?.occurred_at??null,
      profiles:linked.map(p=>({id:p.id,name:p.name})),parentId:a.parent_id??null,activeInPeriod:own.length>0,
      lastActivityAt:linked.map(p=>p.lastActivityAt).filter((t):t is string=>t!==null).sort().at(-1)??null};
  });
  for(const p of profiles)Object.assign(p,{linkedAccountDetails:registered.filter(a=>a.profiles.some(x=>x.id===p.id)).map(a=>({id:a.id,email:a.email}))});
  const meta:ReportMeta={generatedAt:new Date().toISOString(),environment,metricVersion:1,from:f.from,to:f.to,timezone:'Europe/Prague',
    coverage:ds.coverage.map(c=>({capability:c.capability,enabled:c.enabled,changedAt:iso(c.changed_at),version:c.version})),
    excluded:{tests:f.data==='normal'?rows.filter(a=>inPeriod(a.occurredAt,f)&&a.test).length:0,adults:f.learningActor==='unmarked'?common.filter(a=>a.adult).length:0,
      conflicts:ds.issues.filter(x=>x.kind.includes('collision')&&x.status==='open').length},
    lastReceivedAt:events.length?iso(Math.max(...events.map(e=>ms(e.received_at)))):null,
    warnings:[...(ds.profiles.some(p=>p.decision==='unresolved')?['Některé identity profilů čekají na ověření.']:[]),
      ...(rows.some(a=>inPeriod(a.occurredAt,f)&&a.clockQuality==='legacy')?['Historické odpovědi nemají úplný kontext sezení, volby a pomoci.']:[]),
      ...(events.some(e=>inPeriod(e.occurredAt,f)&&e.kind==='activity_window'&&e.payload.uncertain)?['Čas obsahuje nepozorované nebo nejisté úseky; přesný aktivní čas je nezahrnuje.']:[]),
      ...(rows.some(a=>a.clockQuality==='uncertain')?['Některé časy odpovědí jsou nejisté. Nezahrnují se do mediánu rychlosti.']:[]),
      ...(events.some(e=>e.kind==='coverage_gap')?['Některá zařízení hlásí mezeru v místní frontě. Souhrny nemusí obsahovat všechny jejich události.']:[]),
      ...(['accounts','data-quality','annotations'].includes(resource.split('/')[0]!)&&Object.entries(f).some(([k,v])=>v&&['profile','session','participant','skill','region','mode','device','release','search','result','assistance','state','location','stage'].includes(k))?
        ['Herní filtry na této stránce nemění technický audit ani registrace Google. Používají se jen v herních přehledech.']:[]),
      ...(f.search&&!resource.startsWith('players')?['Vyhledávání přezdívky se používá v seznamu hráčů, ne v návštěvnosti nebo počtech sezení.']:[])]};
  const measured=(cap:string)=>ds.coverage.some(c=>c.capability===cap&&c.enabled&&ms(c.changed_at)<Date.parse(f.to))||events.some(e=>ms(e.occurredAt)<Date.parse(f.to)&&(cap==='web'?e.kind==='page_view':e.kind==='play_started'));
  const partial=(cap:string)=>{const history=ds.coverage.filter(c=>c.capability===cap),atStart=history.filter(c=>ms(c.changed_at)<=Date.parse(f.from)).at(-1);
    return !atStart?.enabled||history.some(c=>inPeriod(c.changed_at,f)&&!c.enabled);};
  const periodSessions=sessions.filter(s=>s.startedAt&&inPeriod(s.startedAt,f)),periodVisits=visits.filter(v=>inPeriod(v.startedAt,f));
  const coh=periodVisits.filter(v=>v.landingAt&&inPeriod(v.landingAt,f)),step=(predicate:(v:any)=>boolean)=>coh.filter(predicate).length;
  const days=new Set<string>();for(let at=Date.parse(f.from);at<Date.parse(f.to);at+=3600_000)days.add(day(at));days.add(day(Date.parse(f.to)-1));
  const dayMeasured=(cap:string,date:string)=>{const history=ds.coverage.filter(c=>c.capability===cap);
    const first=Date.parse(date+'T00:00:00Z')-14*3600_000,last=first+52*3600_000;
    // Compare Prague calendar dates, not UTC midnight. Before activation is unknown, never zero.
    return history.some((c,i)=>c.enabled&&day(c.changed_at)<=date&&(!history[i+1]||day(history[i+1]!.changed_at)>=date))||
      events.some(e=>ms(e.occurredAt)>=first&&ms(e.occurredAt)<last&&day(e.occurredAt)===date&&(cap==='web'?e.kind==='page_view':e.kind==='play_started'));};
  const webDaily=()=>[...days].sort().map(date=>({date,
    playClicks:dayMeasured('web',date)?selectedEvents.filter(e=>e.kind==='play_clicked'&&day(e.occurredAt)===date).length:null,
    visits:dayMeasured('web',date)?periodVisits.filter(v=>day(v.startedAt)===date).length:null}));
  let data:any;
  if(resource==='overview'){
    const learning=summary(attempts),visitsMeasured=measured('web'),gamesMeasured=measured('play_sessions');
    const cards={visits:metric(visitsMeasured?periodVisits.length:null,'count',partial('web')),visitors:metric(visitsMeasured?new Set(periodVisits.map(v=>v.visitorId)).size:null,'count',partial('web')),
      playClicks:metric(visitsMeasured?selectedEvents.filter(e=>e.kind==='play_clicked').length:null,'count',partial('web')),
      clickConversion:{...metric(visitsMeasured&&coh.length?100*step(v=>!!v.clickedAt)/coh.length:null,'percent'),numerator:step(v=>!!v.clickedAt),denominator:coh.length},
      registrations:metric(registered.filter(a=>inPeriod(a.registeredAt,f)).length),accounts:metric(registered.length),
      activePlayers:metric(new Set(attempts.map(a=>a.profileId)).size),newPlayers:metric(profiles.filter(p=>p.createdAt&&inPeriod(p.createdAt,f)).length),
      players:metric(profiles.length, 'count', ds.profiles.some(p=>p.decision==='unresolved')),
      sessions:metric(gamesMeasured?periodSessions.length:null,'count',partial('play_sessions')),gameTime:metric(gamesMeasured?timeFor(contextEvents,'game-active'):null,'ms',partial('activity_time')),
      medianGameTime:metric(gamesMeasured?median(periodSessions.map(s=>s.activeTimeMs)):null,'ms',partial('activity_time')),
      webTime:metric(visitsMeasured?timeFor(contextEvents,'web-active'):null,'ms',partial('web')),attempts:metric(learning.attempts),
      accuracy:metric(learning.accuracy,'percent',false,learning.attempts),medianResponseTime:metric(learning.medianResponseTimeMs,'ms',false,learning.correct)};
    const daily=webDaily().map(row=>{const date=row.date;return {...row,
      attempts:attempts.filter(a=>day(a.occurredAt)===date).length,activePlayers:new Set(attempts.filter(a=>day(a.occurredAt)===date).map(a=>a.profileId)).size,
      sessions:dayMeasured('play_sessions',date)?periodSessions.filter(s=>day(s.startedAt)===date).length:null};});
    const funnel=[{step:'Web',filter:'web',value:coh.length},{step:'Hrát',filter:'click',value:step(v=>!!v.clickedAt)},
      {step:'Menu',filter:'menu',value:step(v=>!!v.clickedAt&&!!v.menuAt)},{step:'Profil',filter:'profile',value:step(v=>!!v.clickedAt&&!!v.menuAt&&!!v.activatedAt)},
      {step:'Odpověď',filter:'answer',value:step(v=>!!v.clickedAt&&!!v.menuAt&&!!v.activatedAt&&v.answered)}];
    const width=Date.parse(f.to)-Date.parse(f.from),previous=compare?await analyticsReport(db,{...f,from:new Date(Date.parse(f.from)-width).toISOString(),to:f.from},resource,environment,ds,false):null;
    data={cards,daily,funnel,recentSessions:[...periodSessions].sort((a,b)=>ms(b.startedAt)-ms(a.startedAt)).slice(0,10),
      previous:previous?{from:previous.meta.from,to:previous.meta.to,cards:previous.data.cards}:null,
      lastLocations:periodSessions.reduce((acc:any,s)=>{const k=s.lastLocation??'Nezaznamenáno';acc[k]=(acc[k]??0)+1;return acc;},{}),directGameVisits:periodVisits.filter(v=>!v.landingAt).length};
  }else if(resource==='traffic'){
    const hourly=[];if(days.size===1)for(let at=Math.floor(Date.parse(f.from)/3600_000)*3600_000;at<Date.parse(f.to);at+=3600_000){const first=Math.max(at,Date.parse(f.from)),end=Math.min(at+3600_000,Date.parse(f.to)),history=ds.coverage.filter(c=>c.capability==='web'),current=history.filter(c=>ms(c.changed_at)<end).at(-1);
      const known=!!current?.enabled||events.some(e=>e.kind==='page_view'&&ms(e.occurredAt)>=first&&ms(e.occurredAt)<end);
      hourly.push({date:new Date(at).toISOString(),visits:known?periodVisits.filter(v=>ms(v.startedAt)>=first&&ms(v.startedAt)<end).length:null,
        playClicks:known?selectedEvents.filter(e=>e.kind==='play_clicked'&&ms(e.occurredAt)>=first&&ms(e.occurredAt)<end).length:null});}
    data={visits:periodVisits.length,measured:measured('web'),partial:partial('web'),webTimeMs:timeFor(contextEvents,'web-active'),daily:webDaily(),hourly,
    visitors:new Set(periodVisits.map(v=>v.visitorId)).size,pageViews:periodVisits.reduce((n,v)=>n+v.pageViews,0),
    medianWebTimeMs:median(periodVisits.map(v=>v.activeTimeMs)),meanWebTimeMs:periodVisits.length?periodVisits.reduce((n,v)=>n+v.activeTimeMs,0)/periodVisits.length:null,
    returningVisitors:new Set(periodVisits.filter(v=>events.some(e=>e.visitor_id===v.visitorId&&ms(e.occurredAt)<Date.parse(f.from))).map(v=>v.visitorId)).size,
    playClicks:selectedEvents.filter(e=>e.kind==='play_clicked').length,
    pages:['/','/hra/'].map(route=>({route,pageViews:selectedEvents.filter(e=>e.kind==='page_view'&&e.payload.route===route).length,
      visits:periodVisits.filter(v=>v.timeline.some(e=>e.kind==='page_view'&&e.payload.route===route)).length,webTimeMs:route==='/'?timeFor(contextEvents,'web-active'):0})),
    sourceRows:[...new Set(periodVisits.map(v=>v.utm||v.referrer||'Přímá návštěva'))].map(source=>{const own=periodVisits.filter(v=>(v.utm||v.referrer||'Přímá návštěva')===source);return {source,visits:own.length,clicked:own.filter(v=>v.playClicks>0).length,answered:own.filter(v=>v.answered).length};}),
    placementRows:[...new Set(selectedEvents.filter(e=>e.kind==='play_clicked').map(e=>e.payload.placement))].map(placement=>{const own=selectedEvents.filter(e=>e.kind==='play_clicked'&&e.payload.placement===placement);return {placement,clicks:own.length,visits:new Set(own.map(e=>e.visitId)).size};}),
    sources:periodVisits.reduce((a:any,v)=>{const k=v.referrer||'Přímá návštěva';a[k]=(a[k]??0)+1;return a;},{}),
    placements:selectedEvents.filter(e=>e.kind==='play_clicked').reduce((a:any,e)=>{a[e.payload.placement]=(a[e.payload.placement]??0)+1;return a;},{}),
    devices:periodVisits.reduce((a:any,v)=>{a[v.device]=(a[v.device]??0)+1;return a;},{})};
  }
  else if(resource==='players')data=page(profiles,f,p=>p.lastActivityAt??p.firstObservedAt);
  else if(resource.startsWith('players/')){
    const id=resource.split('/')[1],p=profiles.find(x=>x.id===id);if(!p)throw new Error('not_found');
    if(resource.endsWith('/learning')){
      const own=attempts.filter(a=>a.profileId===id),keys=[...new Set(own.map(a=>a.skill))];
      data={items:keys.map(skill=>{const group=own.filter(a=>a.skill===skill);return {id:skill,skill,...summary(group),assisted:group.filter(a=>a.assisted).length,unobservedAssistance:group.filter(a=>a.assisted===null).length,
        forms:[...new Set(group.map(a=>a.form??a.context))].map(form=>({form,...summary(group.filter(a=>(a.form??a.context)===form))})),state:p.state?.mathStats?.masteryData?.subAtoms?.[skill]?.state??null};})};
    }else data={...p,lifetime:summary(rows.filter(a=>a.profileId===id&&includeData(a.test,f)&&(f.learningActor==='all'||(f.learningActor==='adult'?a.adult:!a.adult)))),
      activeDays:new Set(attempts.filter(a=>a.profileId===id).map(a=>day(a.occurredAt))).size,
      sessions:sessions.filter(s=>s.participants.some((x:any)=>x.profileId===id)),answers:page(attempts.filter(a=>a.profileId===id),f,a=>a.occurredAt)};
  }else if(resource==='sessions')data={...page(periodSessions,f,s=>s.startedAt??s.lastActivityAt),summary:{sessions:periodSessions.length,
    activeTimeMs:periodSessions.reduce((n,s)=>n+s.activeTimeMs,0),medianTimeMs:median(periodSessions.map(s=>s.activeTimeMs)),withErrors:periodSessions.filter(s=>s.hasError).length}};
  else if(resource.startsWith('sessions/')){
    const id=resource.split('/')[1],s=sessions.find(x=>x.id===id);if(!s)throw new Error('not_found');
    data=resource.endsWith('/timeline')?page([...s.timeline,...s.attemptItems.map(a=>({id:a.id,kind:'first_answer',occurredAt:a.occurredAt,payload:a}))],f,x=>x.occurredAt):s;
  }else if(resource==='visits')data=page(periodVisits,f,v=>v.startedAt);
  else if(resource.startsWith('visits/')){data=visits.find(v=>v.id===resource.split('/')[1]);if(!data)throw new Error('not_found');}
  else if(resource==='attempts')data=page(attempts,f,a=>a.occurredAt);
  else if(resource==='accounts')data={...page(registered,f,a=>a.registeredAt),newRegistrations:registered.filter(a=>inPeriod(a.registeredAt,f)).length,
    totalAccounts:registered.length,activeAccounts:registered.filter(a=>a.activeInPeriod).length,
    unlinkedAccounts:registered.filter(a=>!a.profiles.length).length,linkedPlayers:new Set(registered.flatMap(a=>a.profiles.map(p=>p.id))).size,
    daily:[...days].sort().map(date=>({date,registrations:registered.filter(a=>day(a.registeredAt)===date).length}))};
  else if(resource.startsWith('accounts/')){data=registered.find(a=>a.id===resource.split('/')[1]);if(!data)throw new Error('not_found');}
  else if(resource==='data-quality')data={issues:ds.issues,coverage:meta.coverage,ingest:ds.stats,rawProfiles:ds.profiles.length,
    canonicalProfiles:profiles.length,rawAttempts:Number((await db`SELECT count(*) AS n FROM gameplay_attempts`)[0]!.n),
    logicalAttempts:rows.length,oldAnswers:rows.filter(a=>a.clockQuality==='legacy').length,
    sessionsWithoutEnd:sessions.filter(s=>s.status==='unconfirmed'||s.status==='incomplete').length,
    lateUploads:events.filter(e=>ms(e.received_at)-ms(e.occurred_at)>60_000).length};
  else if(resource==='annotations')data={items:await db`SELECT * FROM analytics_annotations ORDER BY created_at DESC LIMIT 100`};
  else throw new Error('not_found');
  return {data,meta};
}

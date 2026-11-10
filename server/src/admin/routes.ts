import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { AuthPrincipal, AuthService } from '../auth.js';
import type { Database } from '../db/database.js';
import { analyticsBatchSchema } from '../domain/analytics/contracts.js';
import { ingestEvents } from '../domain/analytics/ingest.js';
import { analyticsReport, parseFilter } from '../domain/analytics/queries.js';

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
export function createAnalyticsService(db:Database,config:AppConfig) {
  const secret=config.auth?.authSecret??randomUUID();
  const sign=(s:string)=>createHmac('sha256',secret).update('analytics:'+s).digest('base64url');
  const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
  return {
    db,
    async isAdmin(principal:AuthPrincipal|null):Promise<boolean> {
      if(!principal||!config.analytics?.adminEnabled||principal.provider!=='google')return false;
      if(config.analytics.adminSubjects.has(principal.providerSubject))return true;
      const email=config.analytics.bootstrapEmail;
      if(!email||!principal.emailVerified||principal.email.toLowerCase()!==email)return false;
      await db`INSERT INTO analytics_admin_bindings(email,provider_subject) VALUES(${email},${principal.providerSubject}) ON CONFLICT DO NOTHING`;
      const [binding]=await db`SELECT provider_subject FROM analytics_admin_bindings WHERE email=${email}`;
      return binding?.provider_subject===principal.providerSubject;
    },
    csrf(principal:AuthPrincipal) {const time=Date.now().toString();return `${time}.${sign(`${principal.sessionId??principal.providerSubject}:${time}`)}`;},
    validCsrf(principal:AuthPrincipal,token:string|undefined) {
      if(!token)return false;const [time,hash]=token.split('.');
      return !!time&&!!hash&&Math.abs(Date.now()-Number(time))<3_600_000&&same(hash,sign(`${principal.sessionId??principal.providerSubject}:${time}`));
    },
    authContext(scope:string,id:string){const payload=Buffer.from(JSON.stringify({scope,id,at:Date.now()})).toString('base64url');return `${payload}.${sign(payload)}`;},
    readAuthContext(headers:Headers|null):{scope:string;id:string}|undefined {
      const value=headers?.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ck-analytics-auth='))?.slice(18);
      if(!value)return;const [payload,hash]=value.split('.');if(!payload||!hash||!same(hash,sign(payload)))return;
      try {const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());
        if(Math.abs(Date.now()-parsed.at)>900_000||!z.uuid().safeParse(parsed.scope).success||!z.uuid().safeParse(parsed.id).success)return;
        return {scope:parsed.scope,id:parsed.id};}catch{return;}
    },
  };
}
export function analyticsRoutes(deps:{config:AppConfig;auth:AuthService|null;service:AnalyticsService;
  resolveBrowser:(token:string,deviceId?:string)=>Promise<{id:string}|null>}) {
  const {config,auth,service,resolveBrowser}=deps;
  const app=new Hono<{Variables:{principal:AuthPrincipal}}>();
  app.use('/v1/admin/*',async(c,next)=>{
    c.header('Cache-Control','private, no-store');c.header('Vary','Cookie, Origin');
    if(!auth)return c.json({error:'auth_not_configured'},503);
    const principal=await auth.getPrincipal(c.req.raw.headers);
    if(!principal)return c.json({error:'unauthorized'},401);
    if(!config.analytics?.adminEnabled)return c.json({error:'admin_disabled'},503);
    if(!await service.isAdmin(principal))return c.json({error:'forbidden'},403);
    c.set('principal',principal);await next();
  });
  app.use('/v1/admin/*',bodyLimit({maxSize:8192,onError:c=>c.json({error:'payload_too_large'},413)}));
  app.get('/v1/admin/bootstrap',async c=>c.json({environment:config.nodeEnv==='production'?'prd':'dev',metricVersion:1,
    csrfToken:service.csrf(c.get('principal')),capabilities:await service.db`SELECT capability,enabled,version,changed_at FROM analytics_capabilities ORDER BY changed_at`,
    admin:true,timezone:'Europe/Prague'}));
  app.get('/v1/admin/*',async c=>{
    try {
      const filter=await parseFilter(service.db,c.req.query());
      const resource=decodeURIComponent(c.req.path.slice('/v1/admin/'.length));
      if(!/^(overview|traffic|players(?:\/[^/]+(?:\/learning)?)?|sessions(?:\/[^/]+(?:\/timeline)?)?|visits(?:\/[^/]+)?|accounts(?:\/[^/]+)?|attempts|data-quality|annotations)$/.test(resource))return c.json({error:'not_found'},404);
      return c.json(await analyticsReport(service.db,filter,resource,config.nodeEnv==='production'?'prd':'dev'));
    }catch(e){const message=e instanceof Error?e.message:'';
      if(message==='not_found')return c.json({error:'not_found'},404);
      if(e instanceof z.ZodError||message.startsWith('invalid_'))return c.json({error:'invalid_filter'},400);
      throw e;
    }
  });
  app.use('/v1/admin/annotations*',async(c,next)=>{
    if(c.req.method==='GET')return next();
    if(!config.corsOrigins.has(c.req.header('Origin')??''))return c.json({error:'forbidden_origin'},403);
    if(!c.req.header('Content-Type')?.startsWith('application/json'))return c.json({error:'json_required'},415);
    if(!service.validCsrf(c.get('principal'),c.req.header('X-CSRF-Token')))return c.json({error:'invalid_csrf'},403);
    await next();
  });
  const annotation=z.object({mutationId:z.uuid(),targetType:z.enum(['profile','session','visit']),targetId:z.string().min(1).max(80),
    label:z.enum(['test','adult']),reason:z.string().min(1).max(300),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional()}).strict()
    .refine(x=>(!x.from&&!x.to)||!!x.from&&!!x.to&&Date.parse(x.to)>Date.parse(x.from));
  app.post('/v1/admin/annotations',async c=>{
    const parsed=annotation.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'invalid_annotation'},400);
    const x=parsed.data;
    const exists=x.targetType==='profile'?await service.db`SELECT 1 FROM analytics_profile_links WHERE canonical_profile_id::text=${x.targetId} LIMIT 1`:
      await service.db`SELECT 1 FROM analytics_events WHERE browser_account_id::text||':'||${x.targetType==='session'?service.db`play_session_id::text`:service.db`visit_id::text`}=${x.targetId} LIMIT 1`;
    if(!exists.length)return c.json({error:'not_found'},404);
    const id=randomUUID();await service.db`INSERT INTO analytics_annotations(id,mutation_id,target_type,target_id,from_at,to_at,label,action,reason,actor_subject)
      VALUES(${id},${x.mutationId},${x.targetType},${x.targetId},${x.from??null},${x.to??null},${x.label},'set',${x.reason},${c.get('principal').providerSubject})
      ON CONFLICT(mutation_id) DO NOTHING`;
    const [row]=await service.db`SELECT * FROM analytics_annotations WHERE mutation_id=${x.mutationId}`;
    if(row!.action!=='set'||row!.target_type!==x.targetType||row!.target_id!==x.targetId||row!.label!==x.label||row!.reason!==x.reason||
      row!.actor_subject!==c.get('principal').providerSubject||(row!.from_at?.toISOString()??null)!==(x.from?new Date(x.from).toISOString():null)||
      (row!.to_at?.toISOString()??null)!==(x.to?new Date(x.to).toISOString():null))return c.json({error:'mutation_conflict'},409);
    return c.json({id:row!.id});
  });
  app.post('/v1/admin/annotations/:id/revoke',async c=>{
    const input=z.object({mutationId:z.uuid(),reason:z.string().min(1).max(300)}).strict().safeParse(await c.req.json().catch(()=>null));
    if(!input.success||!z.uuid().safeParse(c.req.param('id')).success)return c.json({error:'invalid_annotation'},400);
    const [a]=await service.db`SELECT * FROM analytics_annotations WHERE id=${c.req.param('id')} AND action='set'`;
    if(!a)return c.json({error:'not_found'},404);
    await service.db`INSERT INTO analytics_annotations(id,mutation_id,target_type,target_id,label,action,reverts_id,reason,actor_subject)
      VALUES(${randomUUID()},${input.data.mutationId},${a.target_type},${a.target_id},${a.label},'revoke',${a.id},${input.data.reason},${c.get('principal').providerSubject})
      ON CONFLICT DO NOTHING`;
    const [row]=await service.db`SELECT * FROM analytics_annotations WHERE mutation_id=${input.data.mutationId}`;
    if(row&&(row.action!=='revoke'||row.reverts_id!==a.id||row.reason!==input.data.reason||row.actor_subject!==c.get('principal').providerSubject))
      return c.json({error:'mutation_conflict'},409);
    if(!row){const [prior]=await service.db`SELECT id FROM analytics_annotations WHERE reverts_id=${a.id}`;
      if(!prior)return c.json({error:'mutation_conflict'},409);}
    return c.json({revoked:true});
  });
  app.use('/v1/analytics/*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
  app.get('/v1/analytics/config',c=>c.json({enabled:config.analytics?.collectionEnabled??false,schemaVersion:1,
    gameplayVersion:2,serverTime:Date.now(),heartbeatMs:15_000}));
  // Cookie revocation remains available even while collection is disabled.
  // It clears only this browser's optional visit attribution, never its login.
  app.delete('/v1/analytics/auth-context',c=>{
    if(!config.corsOrigins.has(c.req.header('Origin')??''))return c.json({error:'forbidden_origin'},403);
    c.header('Set-Cookie','ck-analytics-auth=; Path=/api/auth/; HttpOnly; SameSite=Lax; Max-Age=0');
    return c.json({cleared:true});
  });
  app.use('/v1/analytics/*',bodyLimit({maxSize:256*1024,onError:c=>c.json({error:'payload_too_large'},413)}));
  const limits=new Map<string,{at:number;count:number}>();
  app.use('/v1/analytics/*',async(c,next)=>{
    if(c.req.method==='GET')return next();
    if(!config.analytics?.collectionEnabled)return c.json({error:'collection_disabled'},503);
    if(!config.corsOrigins.has(c.req.header('Origin')??''))return c.json({error:'forbidden_origin'},403);
    if(!c.req.header('Content-Type')?.startsWith('application/json'))return c.json({error:'json_required'},415);
    const header=c.req.header('Authorization')??'';
    if(!/^Bearer [a-f0-9]{64}$/.test(header))return c.json({error:'browser_identity_required'},401);
    const owner=await resolveBrowser(header.slice(7));if(!owner)return c.json({error:'browser_identity_required'},401);
    c.set('principal',{provider:'google',providerSubject:owner.id,email:''});
    const now=Date.now(),limit=limits.get(owner.id);
    if(limit&&now-limit.at<60_000&&limit.count>=60){c.header('Retry-After','30');return c.json({error:'rate_limited'},429);}
    limits.set(owner.id,{at:limit&&now-limit.at<60_000?limit.at:now,count:limit&&now-limit.at<60_000?limit.count+1:1});
    if(limits.size>10_000)for(const [key,value]of limits)if(now-value.at>60_000)limits.delete(key);
    await next();
  });
  app.post('/v1/analytics/batch',async c=>{
    const input=analyticsBatchSchema.safeParse(await c.req.json().catch(()=>null));if(!input.success)return c.json({error:'invalid_analytics_batch'},400);
    return c.json(await ingestEvents(service.db,c.get('principal').providerSubject,input.data.events,input.data.release));
  });
  app.post('/v1/analytics/auth-context',async c=>{
    const input=z.object({visitId:z.uuid()}).strict().safeParse(await c.req.json().catch(()=>null));if(!input.success)return c.json({error:'invalid_visit'},400);
    const scope=c.get('principal').providerSubject;
    const [visit]=await service.db`SELECT 1 FROM analytics_events WHERE browser_account_id=${scope} AND visit_id=${input.data.visitId} LIMIT 1`;
    if(!visit)return c.json({error:'unknown_visit'},404);
    const secure=new URL(c.req.url).protocol==='https:'||c.req.header('X-Forwarded-Proto')==='https';
    c.header('Set-Cookie',`ck-analytics-auth=${service.authContext(scope,input.data.visitId)}; Path=/api/auth/; HttpOnly; SameSite=Lax; Max-Age=900${secure?'; Secure':''}`);
    return c.json({linked:true});
  });
  return app;
}

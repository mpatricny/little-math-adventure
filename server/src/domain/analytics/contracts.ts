import { z } from 'zod';
import { eventKinds } from '../../contracts/analytics.js';

// Also lazy-loaded in the browser to isolate invalid durable records. Never probe
// new Function there: even a caught JIT probe reports a production CSP violation.
if('document' in globalThis)z.config({jitless:true});

const id = z.uuid();
const time = z.number().int().min(0).max(4_102_444_800_000);
const label = z.string().max(160);
const key = z.string().max(160).regex(/^[\w:./+<>=?() -]*$/);
const participants = z.array(z.object({ role: z.enum(['A','B']), profileId: id }).strict()).min(1).max(2)
  .refine(p => new Set(p.map(x=>x.profileId)).size===p.length && new Set(p.map(x=>x.role)).size===p.length);
const states = ['web-active','game-active','loading','paused','hidden','unobserved'] as const;
const baseProblem = z.object({ presentationId: id, question: label, choices: z.array(z.union([label,z.number().finite()])).max(24),
  context: key, taskKind: z.enum(['arithmetic','comparison']), skill: key.optional(), role: z.enum(['A','B']) }).strict();
const schemas: Record<string,z.ZodType> = {
  page_view: z.object({ route: z.enum(['/','/hra/','/landing.html']), referrer: z.string().max(253).regex(/^[a-zA-Z0-9.-]*$/),
    utmSource: label.optional(), utmMedium: label.optional(), utmCampaign: label.optional(),
    device: z.enum(['desktop','tablet','mobile']) }).strict(),
  play_clicked: z.object({ placement: key }).strict(), game_menu_ready: z.object({ scene: key }).strict(),
  profile_created: z.object({ role: z.enum(['A','B']), origin: z.enum(['new','placement']) }).strict(),
  profile_imported: z.object({ role: z.enum(['A','B']), origin: z.enum(['import','legacy']) }).strict(),
  profile_activated: z.object({ role: z.enum(['A','B']) }).strict(),
  play_started: z.object({ mode: z.enum(['solo','coop']), participants, tabId: id }).strict(),
  play_resumed: z.object({ mode: z.enum(['solo','coop']), participants, tabId: id, previousRunId: id.optional() }).strict(),
  play_ended: z.object({ reason: z.enum(['menu','switch','pause_timeout','quit','destroy']) }).strict(),
  activity_window: z.object({ start: time, end: time, durationMs: z.number().min(0).max(60_000),
    state: z.enum(states), uncertain: z.boolean(), cumulativeMs: z.number().min(0) }).strict()
    .refine(x=>x.end>=x.start && x.durationMs<=x.end-x.start+5),
  visibility_changed: z.object({ hidden: z.boolean() }).strict(),
  pause_changed: z.object({ paused: z.boolean() }).strict(), loading_changed: z.object({ loading: z.boolean() }).strict(),
  scene_entered: z.object({ scene: key, region: key, room: key.optional() }).strict(),
  scene_left: z.object({ scene: key }).strict(),
  encounter_started: z.object({ encounter: key, scene: key }).strict(),
  encounter_finished: z.object({ encounter: key, result: z.enum(['victory','defeat','completed','abandoned']), scene: key }).strict(),
  skill_changed: z.object({ skill: key, before: key, after: key, origin: z.enum(['earned','placement','import']) }).strict(),
  milestone_reached: z.object({ milestone: key, participants, origin: z.enum(['earned','placement','import']) }).strict(),
  problem_presented: baseProblem,
  assistance_shown: z.object({ presentationId:id, type:key }).strict(),
  problem_corrected: z.object({ presentationId:id,selected:z.union([label,z.number().finite()]).optional(),correct:z.boolean().optional() }).strict(),
  problem_abandoned: z.object({ presentationId:id, reason:key }).strict(),
  coverage_gap: z.object({ reason:key, dropped:z.number().int().min(0) }).strict(),
  puzzle_started:z.object({instanceId:id,family:key}).strict(),
  puzzle_submitted:z.object({instanceId:id,family:key,correct:z.boolean(),assisted:z.boolean(),first:z.boolean()}).strict(),
  puzzle_completed:z.object({instanceId:id,family:key}).strict(),
};
for (const name of ['client_error','asset_error','save_error']) schemas[name] = z.object({ code:key, scene:key,
  fingerprint:z.string().max(160), count:z.number().int().min(1).max(1000) }).strict();
export const clientEventSchema = z.object({ schemaVersion:z.literal(1), id, kind:z.enum(eventKinds), visitorId:id,
  visitId:id, runId:id, seq:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), occurredAt:time,
  monotonicMs:z.number().finite().min(0), sourceRelease:z.string().min(1).max(100), playSessionId:id.optional(),
  profileId:id.optional(), encounterRunId:id.optional(), payload:z.record(z.string(),z.json()) }).strict()
  .superRefine((event,ctx)=>{
    if (!schemas[event.kind]!.safeParse(event.payload).success) ctx.addIssue({code:'custom',message:'Invalid event payload'});
    if (JSON.stringify(event).length>8192) ctx.addIssue({code:'custom',message:'Event too large'});
    if (['play_started','play_resumed','play_ended'].includes(event.kind) && !event.playSessionId)
      ctx.addIssue({code:'custom',message:'Session required'});
    if (event.kind.startsWith('profile_') && !event.profileId) ctx.addIssue({code:'custom',message:'Profile required'});
  });
export const analyticsBatchSchema = z.object({ version:z.literal(1), release:z.string().min(1).max(100),
  events:z.array(clientEventSchema).min(1).max(100) }).strict();
export const observationSchema = z.object({ presentationId:id, profileId:id, playSessionId:id.optional(), runId:id,
  scene:key, context:key, role:z.enum(['A','B']), sourceRelease:z.string().min(1).max(100),
  presentedAt:time, answeredAt:time.optional(), question:label,
  choices:z.array(z.union([label,z.number().finite()])).max(24), selected:z.union([label,z.number().finite()]).optional(),
  correctAnswer:z.union([label,z.number().finite()]).optional(),
  correct:z.boolean().optional(), responseTimeMs:z.number().min(0).max(86_400_000).optional(),
  assisted:z.boolean(), clockQuality:z.enum(['observed','uncertain']), legacyEventKey:z.string().max(600).optional(),
  taskKind:z.enum(['arithmetic','comparison']) }).strict();

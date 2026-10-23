/** Pure, browser-safe validation shared with the durable uploader. */
import { z } from 'zod';
import { observationSchema } from '../domain/analytics/contracts.js';

const timestamp=z.number().int().min(0).max(8_640_000_000_000_000);
const contexts=['battle','battle_block','battle_sword','battle_pet','shop_prep_sword',
  'shop_prep_shield','mana_collection','underwater_bell','exam','fluency','mastery_challenge','band_gate'] as const;
const legacyAttemptSchema=z.object({eventKey:z.string().min(1).max(600),source:z.enum(['mastery','comparison']),
  sequenceIndex:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),timestamp,problemKey:z.string().min(1).max(200),
  context:z.enum(contexts),correct:z.boolean(),responseTimeMs:z.number().min(0).max(86_400_000),assisted:z.boolean(),
  details:z.record(z.string(),z.json())}).strict();
const legacyGameplayBatchSchema=z.object({version:z.literal(1),accountId:z.uuid(),profileId:z.uuid(),deviceId:z.uuid(),
  slotNumber:z.int().min(1).max(8),revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),savedAt:timestamp,
  release:z.string().min(1).max(100),progress:z.object({player:z.object({name:z.string().max(200)}).catchall(z.json()),
    mathStats:z.record(z.string(),z.json())}).strict(),attempts:z.array(legacyAttemptSchema).max(100)}).strict();
export const observedAttemptSchema=legacyAttemptSchema.extend({source:z.enum(['mastery','comparison','activity']),
  sequenceIndex:z.number().int().min(0).nullable(),context:z.enum([...contexts,'crystal_forge','underwater_current','underwater_pump','underwater_reverse']),
  details:z.object({observation:observationSchema,form:z.string().max(100).optional(),subAtomId:z.string().max(100).optional()}).strict(),
}).strict().superRefine((a,ctx)=>{
  const o=a.details.observation;
  if(a.eventKey!==`attempt:${o.presentationId}`||o.correct!==a.correct||o.answeredAt!==a.timestamp||
    o.responseTimeMs!==a.responseTimeMs||o.context!==a.context||o.assisted!==a.assisted||o.selected===undefined)
    ctx.addIssue({code:'custom',message:'Observation identity mismatch'});
});
const observedBatchSchema=legacyGameplayBatchSchema.extend({version:z.literal(2),progress:legacyGameplayBatchSchema.shape.progress.optional(),
  attempts:z.array(observedAttemptSchema).max(100),
  observationLinks:z.array(z.object({presentationId:z.uuid(),legacyEventKey:z.string().max(600)}).strict()).max(100).optional(),
}).strict().superRefine((batch,ctx)=>{
  for(const a of batch.attempts)if(a.details.observation.profileId!==batch.profileId)
    ctx.addIssue({code:'custom',message:'Observation profile mismatch'});
});
export const gameplayBatchSchema=z.union([legacyGameplayBatchSchema,observedBatchSchema]);
export type GameplayBatch=z.infer<typeof gameplayBatchSchema>;

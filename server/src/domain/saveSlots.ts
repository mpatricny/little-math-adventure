import { z } from 'zod';

export const MAX_SAVE_SLOTS = 8;
export const CURRENT_SAVE_SCHEMA_VERSION = 1;

export const accountIdSchema = z.uuid();
export const saveIdSchema = z.uuid();
export const saveSlotNumberSchema = z.int().min(1).max(MAX_SAVE_SLOTS);
export const savePayloadSchema = z.record(z.string(), z.unknown());

export const cloudSaveSlotSchema = z.object({
  accountId: accountIdSchema,
  slotNumber: saveSlotNumberSchema,
  saveId: saveIdSchema,
  schemaVersion: z.int().min(1),
  revision: z.int().min(1),
  payload: savePayloadSchema,
  clientSavedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type CloudSaveSlot = z.infer<typeof cloudSaveSlotSchema>;

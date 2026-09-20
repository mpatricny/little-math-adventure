import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  MAX_SAVE_SLOTS,
  cloudSaveSlotSchema,
  savePayloadSchema,
  saveSlotNumberSchema,
} from './saveSlots.js';

describe('cloud save slot contract', () => {
  it('accepts exactly the supported slot range', () => {
    assert.equal(MAX_SAVE_SLOTS, 8);
    for (let slot = 1; slot <= MAX_SAVE_SLOTS; slot += 1) {
      assert.equal(saveSlotNumberSchema.parse(slot), slot);
    }
    assert.equal(saveSlotNumberSchema.safeParse(0).success, false);
    assert.equal(saveSlotNumberSchema.safeParse(9).success, false);
    assert.equal(saveSlotNumberSchema.safeParse(1.5).success, false);
  });

  it('requires an object payload and positive schema/revision versions', () => {
    const save = cloudSaveSlotSchema.parse({
      accountId: '5a091994-ff68-4f41-8077-a09cc5762bd8',
      slotNumber: 3,
      saveId: 'd7053b77-bf4b-43f5-821f-ecbe2f422e44',
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      revision: 1,
      payload: { player: { name: 'Ada' } },
      clientSavedAt: '2026-09-11T12:30:00+02:00',
    });

    assert.equal(save.slotNumber, 3);
    assert.equal(save.payload.player instanceof Object, true);
    assert.equal(savePayloadSchema.safeParse(['not', 'an', 'object']).success, false);
    assert.equal(cloudSaveSlotSchema.safeParse({ ...save, revision: 0 }).success, false);
  });
});

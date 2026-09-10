import { describe, expect, it } from 'vitest';
import layouts from '../../../public/assets/data/scenes.json';
import { UNDERWATER_ROOMS, claimUnderwaterChest, getUnderwaterProgress } from '../UnderwaterProgressSystem';
import type { PlayerState } from '../../types';

describe('underwater chest loot', () => {
    for (const [id, room] of Object.entries(UNDERWATER_ROOMS).filter(([, room]) => room.chest)) {
        it(`${id}: nonempty catalog reward, one personal claim, reload-safe`, () => {
            const chest = room.chest!;
            expect(Number.isInteger(chest.coins) && chest.coins > 0).toBe(true);
            expect(Number.isInteger(chest.mana) && chest.mana > 0).toBe(true);
            const player = {} as PlayerState;
            const progress = getUnderwaterProgress(player);
            if (chest.requiresEncounter) progress.defeatedEncounters.push(chest.requiresEncounter);
            if (chest.requiresMechanism) progress.restoredMechanisms = [chest.requiresMechanism];
            expect(claimUnderwaterChest(player, id)).toEqual(chest);
            expect(claimUnderwaterChest(JSON.parse(JSON.stringify(player)), id)).toBeNull();
        });
    }
    it('keeps the receipt title, icons and counts in distinct safe regions', () => {
        const elements = layouts.scenes.UnderwaterChestReward.elements;
        const safe = elements.find(e => e.id === 'chestRewardSafeHost')!;
        const controls = elements.filter(e => !['chestRewardSafeHost', 'chestRewardPanelHost'].includes(e.id));
        for (const a of controls) {
            expect(Math.abs(a.x - safe.x) + a.width / 2).toBeLessThanOrEqual(safe.width / 2);
            expect(Math.abs(a.y - safe.y) + a.height / 2).toBeLessThanOrEqual(safe.height / 2);
            for (const b of controls.filter(b => b.id !== a.id)) expect(
                Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2,
                `${a.id}/${b.id}`,
            ).toBe(false);
        }
    });
});

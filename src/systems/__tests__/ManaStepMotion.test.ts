import { describe, expect, it } from 'vitest';
import { MANA_READING_PAUSE_MS, MANA_ROW_COUNT, getManaRowHoldMs, getManaRowY } from '../ManaStepMotion';

describe('mana floor steps', () => {
    it('lands at all eight answer centers, never between floors', () => {
        expect(MANA_ROW_COUNT).toBe(8);
        expect(Array.from({ length: MANA_ROW_COUNT }, (_, i) => getManaRowY(100, 580, i)))
            .toEqual([130, 190, 250, 310, 370, 430, 490, 550]);
        expect(getManaRowY(100, 580, -1)).toBe(130);
        expect(getManaRowY(100, 580, 8)).toBe(550);
    });
    it('keeps a readable hold even late in the game and an extra initial reading pause', () => {
        expect(MANA_READING_PAUSE_MS).toBe(750);
        expect(getManaRowHoldMs(0)).toBe(1000);
        for (const count of [0, 1, 3, 4, 50, 1000]) expect(getManaRowHoldMs(count)).toBeGreaterThanOrEqual(900);
    });
});

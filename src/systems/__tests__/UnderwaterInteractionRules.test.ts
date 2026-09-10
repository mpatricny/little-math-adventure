import { describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../types';
import { buyUnderwaterHint, UNDERWATER_HINT } from '../UnderwaterHintPolicy';
import { DESCENT, descentHitHp, descentCollides } from '../UnderwaterDescentRules';
import { ProgressionSystem } from '../ProgressionSystem';
import layouts from '../../../public/assets/data/scenes.json';
vi.mock('phaser', () => ({ default: { Math: { Between: (min: number) => min } } }));

describe('underwater interaction rules', () => {
    it('only charges an available useful hint, making change from silver', () => {
        const p = { coins: { copper: 0, silver: 1, gold: 0, pouch: 0 }, level: 2 } as PlayerState;
        expect(buyUnderwaterHint(p, UNDERWATER_HINT.delayMs - 1, true)).toBe(false);
        expect(buyUnderwaterHint(p, UNDERWATER_HINT.delayMs, false)).toBe(false);
        expect(ProgressionSystem.getTotalCoinValue(p.coins)).toBe(5);
        expect(buyUnderwaterHint(p, UNDERWATER_HINT.delayMs, true)).toBe(true);
        expect(ProgressionSystem.getTotalCoinValue(p.coins)).toBe(5 - UNDERWATER_HINT.cost);
        p.coins = { copper: 0, silver: 0, gold: 0, pouch: 0 };
        expect(buyUnderwaterHint(p, UNDERWATER_HINT.delayMs, true)).toBe(false);
    });
    it('uses small forgiving collision bounds and never takes the final HP', () => {
        expect(descentHitHp(8)).toBe(8 - DESCENT.damage);
        expect(descentHitHp(1)).toBe(1);
        expect(descentHitHp(0)).toBe(0);
        expect(descentCollides({ x: 500, y: 800 }, { x: 500, y: 800, radius: 30 })).toBe(true);
        expect(descentCollides({ x: 600, y: 800 }, { x: 500, y: 800, radius: 30 })).toBe(false);
    });
    it('keeps every price/countdown in an independent editor host', () => {
        const ids = ['lightHintHost', 'iconCurrentHintHost', 'iconPumpHintHost', 'iconFlowHintHost', 'iconClueHost', 'iconReverseHintHost', 'iconRoutingHintHost'];
        for (const scene of Object.values(layouts.scenes)) {
            const elements = (scene as { elements?: Array<{ id: string; y: number; height?: number }> }).elements ?? [];
            for (const hint of elements.filter(e => ids.includes(e.id))) {
                const status = elements.find(e => e.id === `${hint.id}Status`)!;
                expect(status).toBeDefined();
                expect(Math.abs(status.y - hint.y)).toBeGreaterThan(((status.height ?? 0) + (hint.height ?? 0)) / 2);
            }
        }
    });
});

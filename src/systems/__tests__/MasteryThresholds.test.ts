import { describe, it, expect } from 'vitest';
import { getThresholdsForSubAtom } from '../MasteryThresholds';

describe('getThresholdsForSubAtom', () => {
    it('returns base thresholds for A1/A2 (simple add/sub)', () => {
        const t = getThresholdsForSubAtom('A1');
        expect(t.masteryRT).toBe(5000);
        expect(t.swiftHitRT).toBe(5000);
        expect(t.lightningHitRT).toBe(3000);
        expect(t.fluentRT).toBe(7000);

        // A2 same as A1
        expect(getThresholdsForSubAtom('A2')).toEqual(t);
    });

    it('returns base thresholds for B1/B2/C1/C2 (same tier as A1/A2)', () => {
        expect(getThresholdsForSubAtom('B1').masteryRT).toBe(5000);
        expect(getThresholdsForSubAtom('B2').masteryRT).toBe(5000);
        expect(getThresholdsForSubAtom('C1').masteryRT).toBe(5000);
        expect(getThresholdsForSubAtom('C2').masteryRT).toBe(5000);
    });

    it('returns 5500ms for A3/A4 (3-operand / mixed in small ranges)', () => {
        const t = getThresholdsForSubAtom('A3');
        expect(t.masteryRT).toBe(5500);
        expect(t.swiftHitRT).toBe(5500);
        expect(t.lightningHitRT).toBe(3300);
        expect(t.fluentRT).toBe(7700);

        expect(getThresholdsForSubAtom('A4').masteryRT).toBe(5500);
        expect(getThresholdsForSubAtom('B3').masteryRT).toBe(5500);
        expect(getThresholdsForSubAtom('C4').masteryRT).toBe(5500);
    });

    it('returns 5500ms for D1/D2 (add/sub within 20, no crossing)', () => {
        expect(getThresholdsForSubAtom('D1').masteryRT).toBe(5500);
        expect(getThresholdsForSubAtom('D2').masteryRT).toBe(5500);
    });

    it('returns 6000ms for D3/D4 (3-op/mixed within 20)', () => {
        const t = getThresholdsForSubAtom('D3');
        expect(t.masteryRT).toBe(6000);
        expect(t.swiftHitRT).toBe(6000);
        expect(t.lightningHitRT).toBe(3600);
        expect(t.fluentRT).toBe(8400);

        expect(getThresholdsForSubAtom('D4').masteryRT).toBe(6000);
    });

    it('returns 6000ms for E1/E2 (add/sub crossing 10)', () => {
        expect(getThresholdsForSubAtom('E1').masteryRT).toBe(6000);
        expect(getThresholdsForSubAtom('E2').masteryRT).toBe(6000);
    });

    it('returns 6500ms for E3/E4 (3-op/mixed crossing 10)', () => {
        const t = getThresholdsForSubAtom('E3');
        expect(t.masteryRT).toBe(6500);
        expect(t.swiftHitRT).toBe(6500);
        expect(t.lightningHitRT).toBe(3900);
        expect(t.fluentRT).toBe(9100);

        expect(getThresholdsForSubAtom('E4').masteryRT).toBe(6500);
    });

    it('returns default 5000ms for undefined sub-atom', () => {
        const t = getThresholdsForSubAtom(undefined);
        expect(t.masteryRT).toBe(5000);
        expect(t.lightningHitRT).toBe(3000);
    });

    it('returns default 5000ms for unknown sub-atom (future bands)', () => {
        const t = getThresholdsForSubAtom('Z9');
        expect(t.masteryRT).toBe(5000);
    });

    it('preserves ratio: lightning = 0.6×, fluent = 1.4× of mastery', () => {
        for (const id of ['A1', 'A3', 'D3', 'E4']) {
            const t = getThresholdsForSubAtom(id);
            expect(t.lightningHitRT).toBe(Math.round(t.masteryRT * 0.6));
            expect(t.fluentRT).toBe(Math.round(t.masteryRT * 1.4));
            expect(t.swiftHitRT).toBe(t.masteryRT);
        }
    });
});

describe('getSpeedBonus thresholds via getThresholdsForSubAtom', () => {
    // Test the threshold boundaries that getSpeedBonus uses

    it('A1: lightning ≤3000, swift ≤5000', () => {
        const t = getThresholdsForSubAtom('A1');
        expect(2500 <= t.lightningHitRT).toBe(true);  // 2500 → lightning
        expect(4000 <= t.swiftHitRT).toBe(true);       // 4000 → swift
        expect(4000 <= t.lightningHitRT).toBe(false);   // 4000 → NOT lightning
        expect(6000 <= t.swiftHitRT).toBe(false);       // 6000 → none
    });

    it('E3: lightning ≤3900, swift ≤6500', () => {
        const t = getThresholdsForSubAtom('E3');
        expect(3500 <= t.lightningHitRT).toBe(true);   // 3500 → lightning
        expect(5000 <= t.swiftHitRT).toBe(true);        // 5000 → swift
        expect(5000 <= t.lightningHitRT).toBe(false);    // 5000 → NOT lightning
        expect(7000 <= t.swiftHitRT).toBe(false);        // 7000 → none
    });
});

describe('getMasteryRTThreshold key parsing', () => {
    // Test that masteryKey format "A1:3+2:result_unknown" extracts sub-atom correctly

    it('extracts sub-atom from standard masteryKey format', () => {
        // Simulating what getMasteryRTThreshold does internally
        const key = 'E4:8+7:missing_part';
        const subAtomId = key.split(':')[0];
        expect(subAtomId).toBe('E4');
        expect(getThresholdsForSubAtom(subAtomId).masteryRT).toBe(6500);
    });

    it('extracts sub-atom from simple masteryKey', () => {
        const key = 'A1:3+2:result_unknown';
        const subAtomId = key.split(':')[0];
        expect(subAtomId).toBe('A1');
        expect(getThresholdsForSubAtom(subAtomId).masteryRT).toBe(5000);
    });
});

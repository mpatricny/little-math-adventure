import { describe, expect, it } from 'vitest';
import { createReviewSession } from './practice-journey';

describe('connected review of the existing catacomb journey', () => {
    it('remembers a target without changing mode or the other child', () => {
        const s = createReviewSession();
        s.setMode('A', 'progress');
        const other = s.snapshot('B');
        s.chooseTarget('A', 'B2');
        expect(s.preference('A')).toEqual({ mode: 'progress', targetId: 'B2' });
        expect(s.snapshot('B')).toEqual(other);
        expect(s.snapshot('A')).toMatchObject({ lockReason: 'exam', speed: { met: true }, readiness: { ready: false, accuracy: { met: true } } });
        s.demoExam('A');
        expect(s.snapshot('A')).toMatchObject({ lockReason: 'open', readiness: { ready: true } });
    });

    it('carries the same speed from victory to the door, without giving the fox for a normal battle', () => {
        const s = createReviewSession();
        const result = s.demoBattle('A');
        expect(result).toMatchObject({ owner: 'A', targetId: 'B1', reward: { mana: 1 }, before: { speed: { value: 9200 } } });
        expect(result.after).toEqual(s.snapshot('A'));
        expect(result.after).toMatchObject({ readiness: { ready: true }, fox: { status: 'locked', attack: 6 } });
        expect(s.snapshot('B')).toMatchObject({ fox: { status: 'locked' }, speed: { value: 11800 } });
    });

    it('distinguishes rescue, binding and a real 6 to 7 upgrade even before binding', () => {
        const s = createReviewSession();
        expect(s.demoTrial()).toBeNull();
        s.demoBattle();
        const first = s.demoTrial();
        expect(first).toMatchObject({ kind: 'rescue', attackBefore: 6, attackAfter: 6, after: { state: 'fluent', fox: { status: 'at_pythia' } } });
        expect(s.demoTrial()).toBeNull();
        s.demoBattle();
        const second = s.demoTrial();
        expect(second).toMatchObject({ kind: 'upgrade', attackBefore: 6, attackAfter: 7, after: { state: 'mastery', fox: { status: 'at_pythia' } } });
        s.demoBind();
        expect(s.snapshot()).toMatchObject({ lockReason: 'complete', fox: { status: 'owned', attack: 7 } });
        expect(s.chooseTarget('A', 'B1')).toBe(true);
        expect(s.preference()).toEqual({ mode: 'practice', targetId: 'B1' });
        expect(s.demoTrial()).toBeNull();
        expect(s.trial()).toEqual(second);
    });

    it('does not create or alter receipts while rendering, navigating or confirming', () => {
        const s = createReviewSession();
        expect(s.battle()).toBeNull();
        expect(s.trial()).toBeNull();
        const before = s.snapshot();
        const route = { view: 'catacombs' as const, owner: 'A' as const, targetId: 'B2' as const, returnTo: 'victory' as const };
        let received: unknown;
        s.subscribe(e => { if (e.type === 'route') received = e.route; });
        s.route(route);
        expect(received).toEqual(route);
        expect(s.snapshot()).toEqual(before);
        expect(s.battle()).toBeNull();
        const result = s.demoBattle('A', false);
        expect(result.reward.mana).toBe(0);
        expect(result.reward.improvement).toBe(0);
        for (let i = 0; i < 10; i++) { s.snapshot(); s.modules(); s.route(route); }
        expect(s.battle()).toEqual(result);
    });
});

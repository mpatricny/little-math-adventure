import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../../types';
import { bandProfile } from '../PuzzleDifficulty';

const runtime = vi.hoisted(() => ({ player: {} as PlayerState, coop: false }));
vi.mock('../../GameStateManager', () => ({ GameStateManager: { getInstance: () => ({ getPlayer: () => runtime.player }) } }));
vi.mock('../../CoopSessionManager', () => ({ CoopSessionManager: { getInstance: () => ({ isCoopActive: () => runtime.coop }) } }));
vi.mock('../../SaveSystem', () => ({ SaveSystem: { load: () => null } }));
import { acquirePuzzle, puzzleProgress, recordPuzzleAnswer } from '../PuzzleService';
import { bindPuzzleViewState, observePuzzleViewState, stopObservingPuzzleViewState } from '../../../ui/PuzzleViewState';
import { isCurrentLightChallenge, LEGACY_LIGHT, underwaterLightChallenge } from '../../UnderwaterLightPuzzle';
import { bridgePuzzle, isCurrentBridgePuzzle } from '../PuzzleCatalog';

beforeEach(() => { runtime.player = {} as PlayerState; });
describe('puzzle lifecycle and adaptation', () => {
    it('replaces a shortened bridge together with its single-slot state and keeps the replacement on re-entry', () => {
        const store = puzzleProgress(runtime.player).active, profile = bandProfile('A', 1);
        const old = acquirePuzzle(store, 'forest:bridge', 'sequence', () => ({ full: [1, 2, 3], stoneDisplayValues: [1, 3, null, null, null] }), profile);
        old.state.placed = [2];
        const fixed = acquirePuzzle(store, 'forest:bridge', 'sequence', bridgePuzzle, profile, false, isCurrentBridgePuzzle);
        expect(fixed.payload.full).toHaveLength(7);
        expect(fixed.payload.dropZoneConfig).toHaveLength(2);
        expect(fixed.state).toEqual({});
        fixed.state.placed = [fixed.payload.answers[0], null];
        expect(acquirePuzzle(store, 'forest:bridge', 'sequence', bridgePuzzle, profile, false, isCurrentBridgePuzzle)).toBe(fixed);
    });
    it('replaces old optical geometry and stale rotations together, then preserves the repaired save', () => {
        const progress = puzzleProgress(runtime.player), profile = bandProfile('A');
        const old = acquirePuzzle(progress.active, 'grotto:light', 'light', () => LEGACY_LIGHT, profile);
        old.state = { turns: [3, 1, 2, 0], assisted: true, revealed: 2 };
        recordPuzzleAnswer(old, false, true);
        const unrelated = acquirePuzzle(progress.active, 'canal:pump', 'pump', () => ({ answer: 7 }), profile);
        const results = structuredClone(progress.results);
        const draw = vi.fn(() => underwaterLightChallenge(profile, () => 0));
        const fixed = acquirePuzzle(progress.active, 'grotto:light', 'light', draw, profile, true, isCurrentLightChallenge);
        expect(fixed).not.toBe(old);
        expect(isCurrentLightChallenge(fixed.payload)).toBe(true);
        expect(fixed.state).toEqual({});
        expect(fixed.firstCorrect).toBeUndefined();
        expect(fixed.assisted).toBe(false);
        expect(progress.results).toEqual(results);
        expect(progress.active['canal:pump']).toBe(unrelated);
        fixed.state.turns = [1, 0, 0, 1];
        const restored = JSON.parse(JSON.stringify(progress));
        expect(acquirePuzzle(restored.active, 'grotto:light', 'light', draw, profile, true, isCurrentLightChallenge)).toEqual(fixed);
        expect(draw).toHaveBeenCalledTimes(1);
    });
    it('initializes old saves without changing their fields, and preserves state through JSON export/import', () => {
        runtime.player.name = 'Ada';
        const progress = puzzleProgress(runtime.player), draw = vi.fn(() => ({ values: [1, 2, 3] }));
        const instance = acquirePuzzle(progress.active, 'room:chest', 'sum_selection', draw, bandProfile('A'));
        instance.state = { selected: [1], hintLevel: 1 }; recordPuzzleAnswer(instance, false);
        const restored = JSON.parse(JSON.stringify(runtime.player)) as PlayerState;
        expect(restored.name).toBe('Ada');
        const same = acquirePuzzle(puzzleProgress(restored).active, 'room:chest', 'sum_selection', draw, bandProfile('E'), true);
        expect(draw).toHaveBeenCalledTimes(1);
        expect(same).toEqual(instance);
        expect(same.profile.band).toBe('A');
        expect(restored.puzzleProgress?.results.sum_selection?.attempts[0].firstCorrect).toBe(false);
    });
    it('correction and duplicate callbacks never count as another success; completed practice can draw again', () => {
        const store = puzzleProgress(runtime.player).active, draw = vi.fn(() => ({ answer: 4 }));
        const a = acquirePuzzle(store, 'room', 'balance', draw, bandProfile('A'));
        recordPuzzleAnswer(a, false); recordPuzzleAnswer(a, true); recordPuzzleAnswer(a, true);
        expect(a.completed).toBe(true);
        expect(runtime.player.puzzleProgress?.results.balance?.attempts).toHaveLength(1);
        expect(runtime.player.puzzleProgress?.results.balance?.attempts[0].firstCorrect).toBe(false);
        expect(acquirePuzzle(store, 'room', 'balance', draw, bandProfile('A'))).toBe(a);
        expect(acquirePuzzle(store, 'room', 'balance', draw, bandProfile('A'), true)).not.toBe(a);
        expect(draw).toHaveBeenCalledTimes(2);
    });
    it('promotes after independent success, demotes after errors, and keeps assisted performance separate', () => {
        const progress = puzzleProgress(runtime.player);
        const answer = (correct: boolean, assisted = false) => {
            const instance = acquirePuzzle({}, 'test', 'sequence', () => ({}), bandProfile('A'));
            recordPuzzleAnswer(instance, correct, assisted);
        };
        for (let n = 0; n < 6; n++) answer(true);
        expect(progress.results.sequence?.tier).toBe(2);
        for (let n = 0; n < 6; n++) answer(true, true);
        expect(progress.results.sequence?.tier).toBe(2);
        for (let n = 0; n < 6; n++) answer(n > 2);
        expect(progress.results.sequence?.tier).toBe(1);
        expect(progress.results.sequence?.attempts).toEqual([]);
    });
    it('persists nested UI mutations immediately while player data stays plain and cloneable', () => {
        const state: Record<string, unknown> = {}, saved: unknown[] = [];
        const view = { selected: [0, 1, 2], hintLevel: 0 };
        const observed = observePuzzleViewState(state, () => saved.push(structuredClone(state)));
        bindPuzzleViewState(view, observed, ['selected', 'hintLevel']);
        view.selected[0] = 3;
        expect(saved.at(-1)).toEqual({ selected: [3, 1, 2], hintLevel: 0 });
        view.hintLevel = 1; observed.revealed = 2;
        expect(JSON.parse(JSON.stringify(state))).toEqual(structuredClone(state));
        expect((saved.at(-1) as any).revealed).toBe(2);
        const count = saved.length; stopObservingPuzzleViewState(state); view.selected[1] = 3;
        expect(saved).toHaveLength(count);
    });

    it('binds live selections and scalar hints without saving UI objects', () => {
        const state: Record<string, unknown> = {};
        const view = { selected: [null, null] as (number | null)[], hintLevel: 0 };
        bindPuzzleViewState(view, state, ['selected', 'hintLevel']);
        view.selected[0] = 2; view.hintLevel = 1;
        const restored = { selected: [null, null] as (number | null)[], hintLevel: 0 };
        bindPuzzleViewState(restored, JSON.parse(JSON.stringify(state)), ['selected', 'hintLevel']);
        expect(restored).toEqual(view);
    });
});

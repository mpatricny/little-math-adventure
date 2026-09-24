import { beforeEach, describe, expect, it } from 'vitest';
import type { MathStats, PlayerState } from '../../types';
import { SaveSystem } from '../SaveSystem';

function installLocalStorage(): Map<string, string> {
    const data = new Map<string, string>();
    const storage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); },
        removeItem: (key: string) => { data.delete(key); },
        clear: () => { data.clear(); },
        key: (index: number) => Array.from(data.keys())[index] ?? null,
        get length() { return data.size; },
    } satisfies Storage;
    Object.defineProperty(globalThis, 'localStorage', {
        value: storage,
        configurable: true,
    });
    return data;
}

function saveSlot(slotIndex: number, name: string): void {
    const player = {
        name,
        characterType: 'girl_knight',
        level: 3,
        hp: 18,
        maxHp: 20,
        attack: 5,
        defense: 2,
    } as PlayerState;
    const mathStats = {
        totalAttempts: 42,
        correctAnswers: 36,
        recentResults: [true, false],
        currentDifficulty: 1,
        highestDifficulty: 2,
        problemStats: {},
        currentPool: [],
        poolCycle: 0,
        dailyAttempts: 4,
        lastAttemptDate: '2026-09-03',
    } satisfies MathStats;
    SaveSystem.save(slotIndex, player, mathStats);
}

describe('Save transfer', () => {
    beforeEach(() => {
        installLocalStorage();
    });

    it('exports every occupied slot and the active slot in one versioned bundle', () => {
        saveSlot(2, 'Kitten');
        saveSlot(5, 'Mina');
        SaveSystem.setActiveSlot(2);

        const bundle = JSON.parse(SaveSystem.exportBundle()!);

        expect(bundle).toMatchObject({
            format: 'little-math-adventure-save-bundle',
            version: 1,
            activeSlot: 2,
        });
        expect(bundle.saves.map((entry: { sourceSlot: number }) => entry.sourceSlot)).toEqual([2, 5]);
        expect(bundle.saves.map((entry: { save: { player: { name: string } } }) => entry.save.player.name))
            .toEqual(['Kitten', 'Mina']);
    });

    it('keeps tutorial completion independent for each imported hero', () => {
        saveSlot(0, 'Ada');
        saveSlot(1, 'Filip');
        const ada = SaveSystem.load(0)!;
        ada.player.seenGuides = ['forge.merge.v1', 'shop.sword.v1'];
        SaveSystem.save(0, ada.player, ada.mathStats);
        const bundle = SaveSystem.exportBundle()!;
        installLocalStorage();
        expect(SaveSystem.importBundle(bundle).ok).toBe(true);
        expect(SaveSystem.load(0)?.player.seenGuides).toEqual(['forge.merge.v1', 'shop.sword.v1']);
        expect(SaveSystem.load(1)?.player.seenGuides).toBeUndefined();
    });

    it('imports into free slots without overwriting an existing local save', () => {
        saveSlot(2, 'Kitten');
        saveSlot(5, 'Mina');
        SaveSystem.setActiveSlot(5);
        const bundle = SaveSystem.exportBundle()!;

        installLocalStorage();
        saveSlot(2, 'Local hero');

        const result = SaveSystem.importBundle(bundle);

        expect(result).toEqual({ ok: true, importedSlots: [0, 5], activeSlot: 5 });
        expect(SaveSystem.load(0)?.player.name).toBe('Kitten');
        expect(SaveSystem.load(2)?.player.name).toBe('Local hero');
        expect(SaveSystem.load(5)?.player.name).toBe('Mina');
        expect(SaveSystem.getActiveSlot()).toBe(5);
    });

    it('rejects the complete import when there are not enough empty slots', () => {
        saveSlot(0, 'Kitten');
        saveSlot(1, 'Mina');
        const bundle = SaveSystem.exportBundle()!;

        installLocalStorage();
        for (let slotIndex = 0; slotIndex < 7; slotIndex++) {
            saveSlot(slotIndex, `Local ${slotIndex}`);
        }

        const result = SaveSystem.importBundle(bundle);

        expect(result).toMatchObject({ ok: false });
        expect(SaveSystem.getUsedSlotCount()).toBe(7);
        expect(SaveSystem.load(7)).toBeNull();
    });

    it('exports and imports unfinished puzzle instances and adaptive family results', () => {
        saveSlot(0, 'Puzzle learner');
        const saved = SaveSystem.load(0)!;
        saved.player.puzzleProgress = { version: 1, active: { pump: { version: 1, family: 'pump',
            payload: { readings: [1, 2, 3, 4] }, profile: { band: 'A', max: 5, subtraction: false, crossing: false, tier: 1 },
            startedAt: 123, firstCorrect: false, assisted: true, completed: false, state: { selected: [2, 1, 0], hintLevel: 1 } } },
            results: { pump: { tier: 2, attempts: [{ firstCorrect: false, assisted: true, elapsedMs: 100 }] } } };
        SaveSystem.save(0, saved.player, saved.mathStats);
        const bundle = SaveSystem.exportBundle()!;
        installLocalStorage();
        expect(SaveSystem.importBundle(bundle).ok).toBe(true);
        expect(SaveSystem.load(0)?.player.puzzleProgress).toEqual(saved.player.puzzleProgress);
    });

    it('rejects malformed files without changing local saves', () => {
        saveSlot(3, 'Local hero');

        expect(SaveSystem.importBundle('{not json')).toMatchObject({ ok: false });
        expect(SaveSystem.importBundle(JSON.stringify({ version: 1 }))).toMatchObject({ ok: false });
        expect(SaveSystem.getUsedSlotCount()).toBe(1);
        expect(SaveSystem.load(3)?.player.name).toBe('Local hero');
    });
});

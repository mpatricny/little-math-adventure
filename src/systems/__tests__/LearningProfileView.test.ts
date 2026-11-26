import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_BANDS, MasteryData, MathStats, PlayerState } from '../../types';
import { buildLearningBands, createLearningProfileSnapshot, learningFormExample, readLearningProfiles, readSavedLearningProfiles, summarizeSkill } from '../LearningProfileView';
import { GameStateManager } from '../GameStateManager';
import { CoopSessionManager } from '../CoopSessionManager';
import { SaveSystem } from '../SaveSystem';
import { BAND_RANGES } from '../MathSkillRules';

vi.mock('../GameStateManager', () => ({ GameStateManager: { getInstance: vi.fn() } }));
vi.mock('../CoopSessionManager', () => ({ CoopSessionManager: { getInstance: vi.fn() } }));

const stats = (): MathStats => ({ totalAttempts: 0, correctAnswers: 0, recentResults: [], currentDifficulty: 1,
    highestDifficulty: 1, problemStats: {}, currentPool: [], poolCycle: 0, dailyAttempts: 0, lastAttemptDate: '' });
const player = (name: string): PlayerState => ({ name, level: 1, characterType: 'girl_knight' } as PlayerState);
const mastery = (): MasteryData => createLearningProfileSnapshot(0, player('Ada'), stats()).stats.masteryData;
let storage: Map<string, string>;
beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value) });
});

describe('read-only learning profiles', () => {
    it('inspects legacy slots without adding identity, changing active slot or persisting hydration', () => {
        storage.set('littleMathAdventure_slot_3', JSON.stringify({ player: player('Dlouhé jméno hráče'), mathStats: stats(), timestamp: 42 }));
        storage.set('littleMathAdventure_activeSlot', '7');
        const before = [...storage];
        const profiles = readSavedLearningProfiles();
        expect(profiles).toHaveLength(1);
        expect(profiles[0].slotIndex).toBe(3);
        expect(profiles[0].stats.masteryData.subAtoms.A1.state).toBe('training');
        profiles[0].player.name = 'Changed copy';
        expect(SaveSystem.readSnapshot(3)?.player.name).toBe('Dlouhé jméno hráče');
        expect([...storage]).toEqual(before);
    });

    it('takes isolated co-op snapshots with live mastery, while preserving active B and both sources', () => {
        const a = mastery(), b = mastery();
        a.subAtoms.A1.successfulSolves = 11; b.subAtoms.A1.successfulSolves = 29;
        const liveStats = { ...stats(), masteryData: b };
        storage.set('littleMathAdventure_slot_2', JSON.stringify({ player: player('Ada'), mathStats: stats() }));
        const state = { getActiveSlotIndex: () => 6, getPlayer: () => player('Borek'), getMathStats: () => liveStats };
        const coop = { isCoopActive: () => true, getPlayerASlotIndex: () => 2, getPlayerBSlotIndex: () => 6,
            getPlayerAMasteryData: () => a, getPlayerBMasteryData: () => b };
        vi.mocked(GameStateManager.getInstance).mockReturnValue(state as unknown as GameStateManager);
        vi.mocked(CoopSessionManager.getInstance).mockReturnValue(coop as unknown as CoopSessionManager);
        const before = JSON.stringify({ a, b, liveStats, storage: [...storage] });
        const result = readLearningProfiles();
        expect(result.map(p => [p.slotIndex, p.player.name, p.stats.masteryData.subAtoms.A1.successfulSolves]))
            .toEqual([[2, 'Ada', 11], [6, 'Borek', 29]]);
        result[0].stats.masteryData.subAtoms.A1.successfulSolves = 0;
        expect(JSON.stringify({ a, b, liveStats, storage: [...storage] })).toBe(before);
        expect(state.getActiveSlotIndex()).toBe(6);
    });

    it('hides only bands before the saved starting band, never before the current frontier', () => {
        const data = mastery();
        data.subAtoms.E1.state = 'training'; data.bands.E.state = 'training';
        expect(buildLearningBands(data).map(b => b.id)).toEqual(ALL_BANDS);
        data.selectedStartBand = 'C';
        expect(buildLearningBands(data).map(b => b.id)).toEqual(ALL_BANDS.slice(ALL_BANDS.indexOf('C')));
        data.requiredBand = 'A';
        expect(buildLearningBands(data).map(b => b.id)).toEqual(ALL_BANDS.slice(ALL_BANDS.indexOf('C')));
    });

    it('derives range labels from curriculum and counts records instead of credited placement solves', () => {
        const data = mastery();
        data.subAtoms.A1.successfulSolves = 20;
        data.problemRecords.oldCatalogEntry = { problemKey: 'oldCatalogEntry', subAtomId: 'A1', form: 'result_unknown', attempts: [
            { timestamp: 1, correct: true, responseTimeMs: 1000, sequenceIndex: 1, context: 'battle' },
            { timestamp: 2, correct: false, responseTimeMs: 2000, sequenceIndex: 2, context: 'battle' },
        ] };
        expect(summarizeSkill(data, 'A1')).toMatchObject({ attempts: 2, correct: 1, wrong: 1, accuracy: 0.5 });
        const bands = buildLearningBands(data);
        for (const band of bands) expect(band.label).toBe(`${BAND_RANGES[band.id].minResult}–${BAND_RANGES[band.id].maxResult}`);
        expect(bands[0].skills.map(skill => skill.label)).toEqual(['Sčítání', 'Odčítání', 'Porovnávání', 'Tři čísla', 'Mix']);
        expect(bands[4].crossingTen).toBe(true);
    });

    it('shows advanced comparison levels and only catalog-supported form examples', () => {
        const data = mastery(); const chapter = data.comparisonChapter!;
        chapter.status = 'complete'; chapter.fluencyChallengeResult = 'pass';
        expect(summarizeSkill(data, 'comparison_symbols').state).toBe('fluent');
        chapter.masteryChallengeResult = 'pass';
        expect(summarizeSkill(data, 'comparison_symbols').state).toBe('mastery');
        expect(learningFormExample('A2', 'result_unknown')?.expression).toContain('−');
        expect(learningFormExample('A3', 'missing_part')).toBeNull();
        expect(learningFormExample('E1', 'result_unknown')?.expression).toMatch(/\d+\+\d+=□/);
        expect(learningFormExample('A3', 'compare_equation_vs_number')?.expression).toMatch(/\d+[+−]\d+[+−]\d+[<=>]\d+/);
    });
});

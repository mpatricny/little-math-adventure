import { describe, expect, it } from 'vitest';
import type { MathStats, PlayerState, PracticeTargetId } from '../../types';
import type { FoxAbilityId } from '../../types/foxAbilities';
import { allocateFoxAbilityPoint, awardFoxRune, FOX_ABILITY_CONFIG, getFoxJourney } from '../FoxAbilitySystem';
import { admitFoxLesson, completeFoxLesson, FOX_LESSON_ORDER } from '../FoxLessons';
import { MasteryMigration } from '../MasteryMigration';

type Owner = Pick<PlayerState, 'catacombFoxJourney' | 'catacombFoxBonus' | 'unlockedPets' | 'ownedPets'>;
const receipt = (evidenceId: string) => ({ evidenceId, earnedAt: 100 });

function rescuedFox(): Owner {
    return { catacombFoxBonus: 3, unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'] };
}

function finishLesson(player: Owner, ability: FoxAbilityId, evidenceId = 'lesson-' + ability): boolean {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.subAtoms.A1.state = 'mastery';
    const admission = admitFoxLesson(player, data, 'A1', ability, evidenceId);
    const answers = ['1+2', '2+2', '3+2', '1+1', '2+1', '1+3'].map(problemKey => ({ problemKey, correct: true, assisted: false }));
    return !!admission && completeFoxLesson(admission, answers, true, 50);
}

function finishLessons(player: Owner): void {
    for (const ability of FOX_LESSON_ORDER) expect(finishLesson(player, ability)).toBe(true);
}

describe('player-selected fox ability upgrades', () => {
    it('banks an early speed reward through reload and the first two lessons, then lets the child spend it once', () => {
        const player = rescuedFox();
        expect(awardFoxRune(player, 'A3', 1, receipt('early-speed-trial'))).toBe(true);
        const restored: Owner = JSON.parse(JSON.stringify(player));
        expect(getFoxJourney(restored)).toMatchObject({ points: 1, availablePoints: 0, powers: { shield: 0, heal: 0, strike: 0 } });
        for (const ability of ['shield', 'heal'] as const) {
            expect(finishLesson(restored, ability)).toBe(true);
            expect(getFoxJourney(restored).availablePoints).toBe(0);
            expect(allocateFoxAbilityPoint(restored, ability)).toBe(false);
        }
        expect(getFoxJourney(restored).powers.strike).toBe(0);
        expect(finishLesson(restored, 'strike')).toBe(true);
        expect(getFoxJourney(restored)).toMatchObject({ points: 1, availablePoints: 1, powers: { shield: 1, heal: 1, strike: 1 } });
        expect(allocateFoxAbilityPoint(restored, 'heal')).toBe(true);
        expect(allocateFoxAbilityPoint(restored, 'strike')).toBe(false);
        expect(getFoxJourney(restored)).toMatchObject({ points: 1, availablePoints: 0, powers: { shield: 1, heal: 2, strike: 1 } });
    });

    it('opens the three base powers through lessons without spending or awarding appearance points', () => {
        const player = rescuedFox();
        for (const ability of FOX_LESSON_ORDER) {
            expect(allocateFoxAbilityPoint(player, ability)).toBe(false);
            expect(finishLesson(player, ability)).toBe(true);
            expect(getFoxJourney(player).powers[ability]).toBe(1);
        }
        expect(getFoxJourney(player)).toMatchObject({
            points: 0, availablePoints: 0, form: '01', powers: { shield: 1, heal: 1, strike: 1 },
        });
    });

    it('keeps older fixed-family awards while allowing the new tier of the same module to strengthen another ability', () => {
        const player = rescuedFox();
        player.catacombFoxJourney = { version: 1, awards: { A1: { I: receipt('old-shield') } } };
        const original = structuredClone(player);
        expect(getFoxJourney(player)).toMatchObject({ points: 1, availablePoints: 0, powers: { shield: 1, heal: 0, strike: 0 } });
        expect(player).toEqual(original);
        finishLessons(player);
        expect(awardFoxRune(player, 'A1', 2, receipt('new-choice'))).toBe(true);
        expect(getFoxJourney(player)).toMatchObject({ points: 2, availablePoints: 1, powers: { shield: 2, heal: 1, strike: 1 } });
        expect(allocateFoxAbilityPoint(player, 'strike')).toBe(true);
        expect(getFoxJourney(player)).toMatchObject({ points: 2, availablePoints: 0, powers: { shield: 2, heal: 1, strike: 2 } });
    });

    it('allows both upgrades of one module in the same ability and carries spent and unspent points across reloads', () => {
        const player = rescuedFox();
        finishLessons(player);
        expect(awardFoxRune(player, 'A1', 1, receipt('first'))).toBe(true);
        expect(awardFoxRune(player, 'A1', 2, receipt('second'))).toBe(true);
        expect(allocateFoxAbilityPoint(player, 'heal')).toBe(true);

        const restored: Owner = JSON.parse(JSON.stringify(player));
        expect(getFoxJourney(restored)).toMatchObject({ points: 2, availablePoints: 1, powers: { shield: 1, heal: 2, strike: 1 } });
        expect(allocateFoxAbilityPoint(restored, 'heal')).toBe(true);
        expect(awardFoxRune(restored, 'A1', 2, receipt('repeated-tier'))).toBe(false);
        expect(allocateFoxAbilityPoint(restored, 'heal')).toBe(false);

        expect(awardFoxRune(restored, 'A3', 1, receipt('third'))).toBe(true);
        expect(allocateFoxAbilityPoint(restored, 'heal')).toBe(true);
        expect(getFoxJourney(restored)).toMatchObject({ form: '01', points: 3, availablePoints: 0, powers: { shield: 1, heal: 4, strike: 1 } });
        expect(awardFoxRune(restored, 'A3', 2, receipt('fourth'))).toBe(true);
        expect(allocateFoxAbilityPoint(restored, 'shield')).toBe(true);
        expect(getFoxJourney(JSON.parse(JSON.stringify(restored)))).toMatchObject({
            form: '02', points: 4, availablePoints: 0, powers: { shield: 2, heal: 4, strike: 1 },
        });
    });

    it('rejects invalid abilities, invalid receipts and reused evidence across modules and lessons without changing the save', () => {
        const player = rescuedFox();
        player.catacombFoxJourney = { version: 1, awards: { A2: { I: receipt('old-rune') } } };
        expect(finishLesson(player, 'shield', 'old-rune')).toBe(false);
        finishLessons(player);
        expect(awardFoxRune(player, 'A1', 1, receipt('fresh'))).toBe(true);
        const before = structuredClone(player);
        expect(awardFoxRune(player, 'A1', 2, receipt('fresh'))).toBe(false);
        expect(awardFoxRune(player, 'B1', 1, receipt('fresh'))).toBe(false);
        expect(awardFoxRune(player, 'B1', 1, receipt('lesson-heal'))).toBe(false);
        expect(awardFoxRune(player, 'B1', 1, receipt('  '))).toBe(false);
        for (const invalid of ['other', '__proto__', null]) {
            expect(allocateFoxAbilityPoint(player, invalid as FoxAbilityId)).toBe(false);
        }
        expect(player).toEqual(before);
    });

    it('continues awarding selectable points after reaching the final appearance', () => {
        const player = rescuedFox();
        finishLessons(player);
        const targets = Object.keys(FOX_ABILITY_CONFIG.moduleFamilies) as PracticeTargetId[];
        const finalThreshold = Math.max(...FOX_ABILITY_CONFIG.appearanceMilestones);
        const total = finalThreshold + 1;
        for (let i = 0; i < total; i++) {
            const target = targets[Math.floor(i / 2)];
            expect(awardFoxRune(player, target, i % 2 === 0 ? 1 : 2, receipt('rune-' + i))).toBe(true);
            expect(allocateFoxAbilityPoint(player, 'strike')).toBe(true);
        }
        expect(getFoxJourney(player)).toMatchObject({
            form: '05', availablePoints: 0, points: total, powers: { shield: 1, heal: 1, strike: total + 1 },
        });
    });
});

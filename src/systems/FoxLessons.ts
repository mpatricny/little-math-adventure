import type { MasteryData, PlayerState, PracticeTargetId, SubAtomId } from '../types';
import type { FoxAbilityId, FoxRuneReceipt } from '../types/foxAbilities';
import { getCatacombFoxBonus, CATACOMB_FOX_ENEMY, CATACOMB_FOX_PET } from './CatacombPetProgress';
import { getOpenPracticeTargets, getPracticeTargetState, preferredPracticeTarget } from './PracticeProgress';
import { drawAdvancedExamKeys, isAdvancedNode } from './AdvancedCurriculum';
import { ProblemDatabase } from './ProblemDatabase';
import { practiceNumberMask } from './PracticeNumberLimits';
import { shuffle } from './puzzles/PuzzleRandom';

export const FOX_LESSON_ORDER = ['shield', 'heal', 'strike'] as const;
export const FOX_LESSON_QUESTIONS = 6;
export const FOX_LESSON_CORRECT = 5;
export const FOX_LESSON_NAMES: Record<FoxAbilityId, string> = {
    shield: 'Zkouška štítu', heal: 'Zkouška léčení', strike: 'Zkouška zásahu',
};

/** Ability lessons rehearse the module pictured on the door. Only the comparison chapter asks for a relation. */
export function drawFoxLessonArithmeticKeys(target: SubAtomId): string[] {
    if (isAdvancedNode(target)) return drawAdvancedExamKeys(target, FOX_LESSON_QUESTIONS);
    const facts = shuffle(ProblemDatabase.getInstance().getProblemsForForm(target, 'result_unknown'));
    const ordinary = facts.filter(p => practiceNumberMask(p) === 0);
    if (ordinary.length >= FOX_LESSON_QUESTIONS) return ordinary.slice(0, FOX_LESSON_QUESTIONS).map(p => p.key);
    // Sčítání do 5 has just three ordered sums without 0 or 1. Fill the small
    // deck with other distinct sums from that module, preferring ones over zeros.
    const withOne = facts.filter(p => practiceNumberMask(p) === 2);
    const withZero = facts.filter(p => (practiceNumberMask(p) & 1) !== 0);
    return shuffle([...ordinary, ...withOne, ...withZero].slice(0, FOX_LESSON_QUESTIONS)).map(p => p.key);
}
type Owner = Pick<PlayerState, 'catacombFoxJourney' | 'catacombFoxBonus' | 'catacombPetUpgrades' | 'unlockedPets' | 'ownedPets'>;
const receiptValid = (r?: FoxRuneReceipt) => typeof r?.evidenceId === 'string' && !!r.evidenceId.trim()
    && Number.isFinite(r.earnedAt) && r.earnedAt > 0;

/** A read never grants a lesson, a rune, attack power or appearance progress. */
export function getFoxLessonProgress(player: Owner, data: MasteryData) {
    const targets = getOpenPracticeTargets(data);
    const hasMastery = targets.some(id => getPracticeTargetState(data, id) === 'mastery');
    const targetId = preferredPracticeTarget(data, player) ?? targets[0];
    const lessons = player.catacombFoxJourney?.version === 1 ? player.catacombFoxJourney.lessons : undefined;
    const completed = FOX_LESSON_ORDER.filter(id => receiptValid(lessons?.[id]));
    const next = FOX_LESSON_ORDER.find(id => !completed.includes(id)) ?? null;
    const rescued = player.unlockedPets?.includes(CATACOMB_FOX_ENEMY) || player.ownedPets?.includes(CATACOMB_FOX_PET);
    const requiredUpgrades = next ? FOX_LESSON_ORDER.indexOf(next) + 1 : 3;
    const upgrades = getCatacombFoxBonus(player);
    return { next, completed, targets, targetId, upgrades, requiredUpgrades,
        ready: (!player.catacombFoxJourney || player.catacombFoxJourney.version === 1)
            && !!next && !!rescued && upgrades >= requiredUpgrades && hasMastery };
}

export interface FoxLessonAdmission {
    readonly player: Owner; readonly data: MasteryData; readonly target: PracticeTargetId;
    readonly ability: FoxAbilityId; readonly evidenceId: string;
}
export function admitFoxLesson(player: Owner, data: MasteryData, target: PracticeTargetId,
    ability: FoxAbilityId, evidenceId: string): FoxLessonAdmission | null {
    const progress = getFoxLessonProgress(player, data);
    return typeof evidenceId === 'string' && evidenceId.trim() && progress.ready && progress.next === ability && progress.targets.includes(target)
        ? { player, data, target, ability, evidenceId } : null;
}
export interface FoxLessonAnswer { problemKey: string; correct: boolean; assisted: boolean }

/** Finish all six distinct prompts. A correction or hint cannot turn the first answer into an independent success. */
export function passedFoxLessonQuestions(answers: readonly FoxLessonAnswer[]): boolean {
    if (answers.length !== FOX_LESSON_QUESTIONS || answers.some(answer => !answer.problemKey?.trim())) return false;
    const keys = new Set(answers.map(answer => answer.problemKey));
    return keys.size === FOX_LESSON_QUESTIONS
        && answers.filter(answer => answer.correct && !answer.assisted).length >= FOX_LESSON_CORRECT;
}

export function completeFoxLesson(admission: FoxLessonAdmission, answers: readonly FoxLessonAnswer[],
    demonstrationUsed: boolean, earnedAt = Date.now()): boolean {
    const { player, data, target, ability, evidenceId } = admission;
    if (!demonstrationUsed || !Number.isFinite(earnedAt) || earnedAt <= 0
        || !passedFoxLessonQuestions(answers) || !admitFoxLesson(player, data, target, ability, evidenceId)) return false;
    const progress = structuredClone(player.catacombFoxJourney ?? { version: 1 as const, awards: {} });
    if (progress.version !== 1 || Object.values(progress.lessons ?? {}).some(r => r?.evidenceId === evidenceId)
        || Object.values(progress.awards ?? {}).some(r => r?.I?.evidenceId === evidenceId || r?.II?.evidenceId === evidenceId)) return false;
    progress.lessons ??= {};
    progress.lessons[ability] = { targetId: target, evidenceId, earnedAt };
    player.catacombFoxJourney = progress;
    return true;
}

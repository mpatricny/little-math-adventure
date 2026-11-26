import { isAdvancedNode } from './AdvancedCurriculum';
import { getExamPresentation } from '../ui/ExamPresentation';
import { ensureAdvancedLearningBands } from './LearningProgress';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, MasteryData, MasteryState, MathStats, PlayerState, ProblemForm, SubAtomId } from '../types';
import { SaveSystem } from './SaveSystem';
import { GameStateManager } from './GameStateManager';
import { CoopSessionManager } from './CoopSessionManager';
import { MasteryMigration } from './MasteryMigration';
import { ensureComparisonChapter } from './ComparisonLearningSystem';
import { getComparisonStatistics } from './ComparisonStatistics';
import { BAND_RANGES } from './MathSkillRules';
import { ProblemDatabase } from './ProblemDatabase';
import { collectLearningAttempts } from './LearningHistory';
import { learningStage, type LearningStage } from './CatacombProgress';

export interface LearningProfileSnapshot {
    slotIndex: number;
    player: PlayerState;
    stats: MathStats & { masteryData: MasteryData };
}

export interface LearningProfileOptions {
    /** Omit to show the current solo player / both current co-op partners. */
    slotIndices?: number[];
    selectedSlotIndex?: number;
    onProfileChange?: (slotIndex: number) => void;
}

function copy<T>(source: T): T { return JSON.parse(JSON.stringify(source)) as T; }

/** Hydration happens only on the isolated inspection copy, never on gameplay. */
export function createLearningProfileSnapshot(slotIndex: number, player: PlayerState, stats: MathStats, liveMastery?: MasteryData | null): LearningProfileSnapshot {
    const snapshot = copy({ slotIndex, player, stats });
    const estimatedLevel = Math.min(10, Math.max(1, Math.floor((stats.correctAnswers || 0) / 20) + 1));
    snapshot.stats.masteryData = liveMastery ? copy(liveMastery) : snapshot.stats.masteryData
        ?? MasteryMigration.migrateFromLevel(estimatedLevel, snapshot.stats);
    ensureAdvancedLearningBands(snapshot.stats.masteryData);
    ensureComparisonChapter(snapshot.stats.masteryData);
    return snapshot as LearningProfileSnapshot;
}

export function readSavedLearningProfiles(): LearningProfileSnapshot[] {
    const profiles: LearningProfileSnapshot[] = [];
    for (let slot = 0; slot < 8; slot++) {
        const saved = SaveSystem.readSnapshot(slot);
        if (saved) profiles.push(createLearningProfileSnapshot(slot, saved.player, saved.mathStats));
    }
    return profiles;
}

/** Does not call loadSlot, activatePlayer, setActiveData, save, or endSession. */
export function readLearningProfiles(options: LearningProfileOptions = {}): LearningProfileSnapshot[] {
    const state = GameStateManager.getInstance();
    const coop = CoopSessionManager.getInstance();
    const activeSlot = state.getActiveSlotIndex();
    const slots = options.slotIndices ?? (coop.isCoopActive()
        ? [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()]
        : [activeSlot ?? -1]);
    return [...new Set(slots)].flatMap(slot => {
        const live = slot === activeSlot || slot === -1;
        const saved = live ? null : SaveSystem.readSnapshot(slot);
        if (!live && !saved) return [];
        const mastery = coop.isCoopActive()
            ? slot === coop.getPlayerASlotIndex() ? coop.getPlayerAMasteryData()
                : slot === coop.getPlayerBSlotIndex() ? coop.getPlayerBMasteryData() : null
            : null;
        return [createLearningProfileSnapshot(slot, live ? state.getPlayer() : saved!.player,
            live ? state.getMathStats() : saved!.mathStats, mastery)];
    });
}

export const LEARNING_STATE_MARKS: Record<LearningStage, number> = {
    locked: 0, training: 1, secure: 2, fluent: 3, mastery: 4, grandmaster: 5, legend: 6,
};
export const LEARNING_STATE_LABELS: Record<LearningStage, string> = {
    locked: 'Zamčeno', training: 'Trénuji', secure: 'Umím', fluent: 'Rychle', mastery: 'Mistr',
    grandmaster: 'Velmistr', legend: 'Legenda',
};
export const SKILL_LABELS = ['Sčítání', 'Odčítání', 'Tři čísla', 'Mix'] as const;
export const SKILL_SYMBOLS = ['+', '−', '1+2+1', '+ −'] as const;
export const FORM_LABELS: Record<ProblemForm, string> = {
    result_unknown: 'Výsledek', missing_part: 'Chybí číslo',
    compare_equation_vs_number: 'Příklad a číslo', compare_equation_vs_equation: 'Dva příklady',
};

export interface LearningSkillView {
    id: SubAtomId | 'comparison_symbols'; label: string; symbol: string; state: MasteryState;
    attempts: number; correct: number; wrong: number; accuracy: number | null; medianMs: number | null;
}
export function summarizeSkill(data: MasteryData, id: SubAtomId | 'comparison_symbols'): LearningSkillView {
    if (id === 'comparison_symbols') {
        const stats = getComparisonStatistics(data.comparisonChapter!);
        const status = data.comparisonChapter!.status;
        return { id, label: 'Porovnávání', symbol: '< = >',
            state: status === 'complete'
                ? data.comparisonChapter!.masteryChallengeResult === 'pass' ? 'mastery'
                    : data.comparisonChapter!.fluencyChallengeResult === 'pass' ? 'fluent' : 'secure'
                : status === 'locked' ? 'locked' : 'training',
            attempts: stats.correct + stats.wrong, correct: stats.correct, wrong: stats.wrong,
            accuracy: stats.recentAccuracy, medianMs: stats.medianMs };
    }
    const attempts = collectLearningAttempts(data).filter(attempt => attempt.subAtomId === id);
    const correct = attempts.filter(attempt => attempt.correct).length;
    const recent = attempts.slice(-20);
    const times = recent.filter(attempt => attempt.correct && attempt.responseTimeMs > 0 && attempt.responseTimeMs <= 20000)
        .map(attempt => attempt.responseTimeMs).sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    const ordinal = Number(id[1]) - 1;
    const presentation = isAdvancedNode(id) ? getExamPresentation(id) : null;
    return { id, label: presentation?.title ?? SKILL_LABELS[ordinal], symbol: presentation?.compact ?? SKILL_SYMBOLS[ordinal], state: data.subAtoms[id].state,
        attempts: attempts.length, correct, wrong: attempts.length - correct,
        accuracy: recent.length ? recent.filter(attempt => attempt.correct).length / recent.length : null,
        medianMs: times.length ? times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2 : null };
}

/** Saved placement is the only visibility boundary. Progress does not hide earlier practice. */
export function buildLearningBands(data: MasteryData, player?: Pick<PlayerState, 'catacombFoxJourney'>) {
    const start = Math.max(0, ALL_BANDS.indexOf(data.selectedStartBand as BandId));
    return ALL_BANDS.slice(start).map(id => {
        const domain = BAND_RANGES[id];
        const skills = ALL_SUB_ATOM_NUMBERS.map(n => summarizeSkill(data, `${id}${n}`));
        if (id === 'A') skills.splice(2, 0, summarizeSkill(data, 'comparison_symbols'));
        return { id, label: `${domain.minResult}–${domain.maxResult}`, crossingTen: id === 'E',
            skills: skills.map(skill => ({ ...skill, stage: learningStage(skill.state, player ?? {}, skill.id) })) };
    });
}

/** The pictured form is an actual catalog problem, including unavailable forms. */
export function learningFormExample(id: SubAtomId, form: ProblemForm): { expression: string; label: string } | null {
    const problems = ProblemDatabase.getInstance().getProblemsForForm(id, form);
    const p = problems.find(problem => problem.operand1 > 0 && problem.operand2 > 0) ?? problems[0];
    if (!p) return null;
    const op = (operator: string) => operator === '-' ? '−' : operator;
    const left = `${p.operand1}${op(p.operator)}${p.operand2}${p.operator2 ? `${op(p.operator2)}${p.operand3}` : ''}`;
    if (form === 'result_unknown') return { expression: `${left}=□`, label: FORM_LABELS[form] };
    if (form === 'missing_part') return { expression: `${p.operand1}${op(p.operator)}□=${p.operand2}`, label: FORM_LABELS[form] };
    const right = p.operator3 ? `${p.operand3}${op(p.operator3)}${p.operand4}` : `${p.operator2 ? p.operand4 : p.operand3}`;
    return { expression: `${left}${['<', '=', '>'][p.answer]}${right}`,
        label: p.operator3 ? FORM_LABELS.compare_equation_vs_equation : FORM_LABELS.compare_equation_vs_number };
}

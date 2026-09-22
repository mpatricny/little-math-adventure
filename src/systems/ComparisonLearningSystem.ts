import {
    ComparisonAttempt,
    ComparisonChapterState,
    ComparisonProblemMeta,
    ComparisonRelation,
    ComparisonRepresentation,
    ComparisonStageId,
    EXAM_CONFIGS,
    MathProblem,
    MasteryData,
    ALL_BANDS,
    TrialTier,
} from '../types';
import { COMPARISON_INSTANT_HINT_COUNT, COMPARISON_INTRO_VERSION, normalizeComparisonSupport, updateComparisonSupport } from './ComparisonSupport';

export const COMPARISON_CHAPTER_ID = 'comparison_symbols' as const;

export const COMPARISON_STAGES: ComparisonStageId[] = [
    'size_crocodile',
    'count_crocodile',
    'number_crocodile',
    'number_symbol',
    'expression_guided',
    'expression_independent',
];

export const COMPARISON_STAGE_LABELS: Record<ComparisonStageId, string> = {
    size_crocodile: 'Velikost a krokodýl',
    count_crocodile: 'Počet a krokodýl',
    number_crocodile: 'Čísla a krokodýl',
    number_symbol: 'Čísla a symbol',
    expression_guided: 'Výraz s početní nápovědou',
    expression_independent: 'Výraz samostatně',
};

interface StageRequirement {
    itemCount: number;
    correctCount: number;
    independent: boolean;
}

const STAGE_REQUIREMENTS: Record<ComparisonStageId, StageRequirement> = {
    size_crocodile: { itemCount: 6, correctCount: 5, independent: false },
    count_crocodile: { itemCount: 6, correctCount: 5, independent: false },
    number_crocodile: { itemCount: 6, correctCount: 5, independent: false },
    number_symbol: { itemCount: 9, correctCount: 8, independent: true },
    expression_guided: { itemCount: 6, correctCount: 5, independent: false },
    expression_independent: { itemCount: 9, correctCount: 8, independent: true },
};

const RELATIONS: ComparisonRelation[] = ['less', 'equal', 'greater'];

export function createInitialComparisonChapterState(
    status: ComparisonChapterState['status'] = 'locked',
): ComparisonChapterState {
    return {
        id: COMPARISON_CHAPTER_ID,
        schemaVersion: 1,
        status,
        currentStageIndex: status === 'complete' ? COMPARISON_STAGES.length : 0,
        stages: COMPARISON_STAGES.map(stage => ({
            stage,
            introSeen: status === 'complete',
            introVersionSeen: status === 'complete' ? COMPARISON_INTRO_VERSION : 0,
            ...normalizeComparisonSupport(status === 'complete' ? { symbolAnswers: COMPARISON_INSTANT_HINT_COUNT } : undefined),
            attempts: 0,
            correctFirst: 0,
            correctIndependent: 0,
            supportMode: false,
            consecutiveSupportCorrect: 0,
            relationStats: createRelationStats(),
        })),
        attempts: [],
        examBestMedal: status === 'complete' ? 'bronze' : null,
        examRotation: 0,
    };
}

export function migrateComparisonChapterState(
    existing: ComparisonChapterState | undefined,
    a2Ready: boolean,
    hasAdvancedProgress: boolean,
): ComparisonChapterState {
    if (!existing) {
        return createInitialComparisonChapterState(
            hasAdvancedProgress ? 'complete' : a2Ready ? 'training' : 'locked',
        );
    }

    const defaults = createInitialComparisonChapterState(existing.status);
    const stages = COMPARISON_STAGES.map((stage, index) => {
        const prior = existing.stages?.find(progress => progress.stage === stage);
        return {
            ...defaults.stages[index],
            ...prior,
            stage,
            introVersionSeen: prior?.introVersionSeen ?? (existing.status === 'complete' ? COMPARISON_INTRO_VERSION : 0),
            ...normalizeComparisonSupport(prior ?? defaults.stages[index]),
            relationStats: {
                less: { ...defaults.stages[index].relationStats.less, ...prior?.relationStats?.less },
                equal: { ...defaults.stages[index].relationStats.equal, ...prior?.relationStats?.equal },
                greater: { ...defaults.stages[index].relationStats.greater, ...prior?.relationStats?.greater },
            },
        };
    });

    const migrated: ComparisonChapterState = {
        ...defaults,
        ...existing,
        id: COMPARISON_CHAPTER_ID,
        schemaVersion: 1,
        stages,
        attempts: existing.attempts ?? [],
        examRotation: existing.examRotation ?? 0,
    };

    // An existing lesson remains in progress even when an older save already
    // unlocked A3/A4. Only legacy placement outside A can skip the new lesson.
    if (hasAdvancedProgress && existing.status === 'locked') {
        migrated.status = 'complete';
        migrated.currentStageIndex = COMPARISON_STAGES.length;
    } else if (a2Ready && migrated.status === 'locked') {
        migrated.status = 'training';
    }

    return migrated;
}

/** Shared save hydration, used by combat, mana lanes and the learning map. */
export function ensureComparisonChapter(data: MasteryData): void {
    const a2Ready = ['secure', 'fluent', 'mastery'].includes(data.subAtoms.A2?.state);
    const beyondIntroBand = ALL_BANDS.slice(1).some(band => {
        const state = data.bands[band]?.state;
        return state !== undefined && state !== 'locked';
    });
    const prior = data.comparisonChapter;
    // The first implementation marked A3/A4 unlocks as a completed lesson.
    // Preserve real chapter attempts and every arithmetic achievement, but
    // reopen this synthetic completion for children still learning band A.
    const syntheticCompletion = prior?.status === 'complete'
        && (prior.attempts?.length ?? 0) === 0 && !beyondIntroBand;
    if (!prior || syntheticCompletion) {
        data.comparisonChapter = migrateComparisonChapterState(undefined, a2Ready, beyondIntroBand);
    } else if (prior.status === 'locked' && (a2Ready || beyondIntroBand)) {
        data.comparisonChapter = migrateComparisonChapterState(prior, a2Ready, beyondIntroBand);
    } else if (prior.stages.some(progress => progress.introVersionSeen === undefined || progress.symbolAnswers === undefined)) {
        data.comparisonChapter = migrateComparisonChapterState(prior, a2Ready, beyondIntroBand);
    }
}

export function getCurrentComparisonStage(state: ComparisonChapterState): ComparisonStageId | null {
    if (state.status !== 'training') return null;
    return COMPARISON_STAGES[state.currentStageIndex] ?? null;
}

export function needsComparisonStageIntro(state: ComparisonChapterState): boolean {
    const stage = getCurrentComparisonStage(state);
    if (!stage) return false;
    const progress = state.stages[state.currentStageIndex];
    return !progress?.introSeen || (progress.introVersionSeen ?? 0) < COMPARISON_INTRO_VERSION;
}

export function markComparisonStageIntroSeen(state: ComparisonChapterState): void {
    if (state.status !== 'training') return;
    const progress = state.stages[state.currentStageIndex];
    if (progress) {
        progress.introSeen = true;
        progress.introVersionSeen = COMPARISON_INTRO_VERSION;
    }
}

export function generateComparisonTrainingProblems(
    state: ComparisonChapterState,
    count: number,
    diagnosticMode = false,
): MathProblem[] {
    const stage = getCurrentComparisonStage(state) ?? 'expression_independent';
    const stageProgress = state.stages[COMPARISON_STAGES.indexOf(stage)];
    const supportRelation = getSupportRelation(state, stage);
    const startIndex = stageProgress?.attempts ?? state.attempts.length;

    return Array.from({ length: count }, (_, index) => {
        const relation = supportRelation ?? RELATIONS[(startIndex + index) % RELATIONS.length];
        return createComparisonProblem(stage, relation, startIndex + index, {
            diagnosticMode,
            supportMode: stageProgress?.supportMode ?? false,
        });
    });
}

export function generateComparisonExamProblems(state: ComparisonChapterState, itemCount = EXAM_CONFIGS.comparison_chapter.itemCount): MathProblem[] {
    const representations: ComparisonRepresentation[] = [];
    const representationCycle: ComparisonRepresentation[] = ['size', 'count', 'number', 'expression'];
    for (let index = 0; index < itemCount; index++) {
        representations.push(representationCycle[index % representationCycle.length]);
    }

    const shortRelation = state.examRotation % RELATIONS.length;
    const relations: ComparisonRelation[] = [];
    for (const [relationIndex, relation] of RELATIONS.entries()) {
        const extraIndex = (relationIndex - shortRelation - 1 + RELATIONS.length) % RELATIONS.length;
        const amount = Math.floor(itemCount / RELATIONS.length) + (extraIndex < itemCount % RELATIONS.length ? 1 : 0);
        for (let index = 0; index < amount; index++) {
            relations.push(relation);
        }
    }

    const problems = representations.map((representation, index) => {
        const stage = examStageForRepresentation(representation);
        return createComparisonProblem(stage, relations[index], state.attempts.length + index, {
            exam: true,
            representation,
            showCrocodile: false,
        });
    });

    state.examRotation = (state.examRotation + 1) % RELATIONS.length;
    return deterministicInterleave(problems, state.examRotation);
}

/** Separate teaching examples: never appended to a scored attack batch. */
export function createComparisonDemoProblems(stage: ComparisonStageId): MathProblem[] {
    return (['less', 'greater', 'equal'] as const).map((relation, index) => {
        const problem = createComparisonProblem(stage, relation, 7 + index);
        problem.id = `demo_${stage}_${relation}`;
        return problem;
    });
}

export function recordComparisonAttempt(
    state: ComparisonChapterState,
    problem: MathProblem,
    correct: boolean,
    responseTimeMs: number,
    assisted: boolean,
    sequenceIndex: number,
): void {
    const meta = problem.comparisonMeta;
    if (!meta) return;

    const attempt: ComparisonAttempt = {
        timestamp: Date.now(),
        sequenceIndex,
        stage: meta.stage,
        representation: meta.representation,
        relation: meta.relation,
        selectedRelation: meta.selectedRelation ?? null,
        leftValue: meta.leftValue,
        rightValue: meta.rightValue,
        operand1: problem.operand1,
        operand2: problem.operand2,
        operand3: problem.operand3,
        operator: problem.operator,
        operator2: problem.operator2,
        correct,
        responseTimeMs,
        activeTimeMs: responseTimeMs,
        assisted,
        exam: meta.exam === true,
        diagnosticMode: meta.diagnosticMode === true,
        context: meta.exam ? 'exam' : meta.diagnosticMode ? 'diagnostic' : 'battle',
    };
    state.attempts.push(attempt);
    if (state.attempts.length > 400) state.attempts.splice(0, state.attempts.length - 400);

    if (!attempt.exam && attempt.stage === 'number_symbol') {
        const progress = state.stages.find(entry => entry.stage === attempt.stage);
        if (progress) {
            const support = normalizeComparisonSupport(progress);
            updateComparisonSupport(support, correct);
            Object.assign(progress, support);
        }
    }

    if (attempt.exam || state.status !== 'training') return;
    const stage = getCurrentComparisonStage(state);
    if (!stage || attempt.stage !== stage) return;

    const progress = state.stages[state.currentStageIndex];
    progress.attempts++;
    const relationStats = progress.relationStats[meta.relation];
    relationStats.attempts++;
    if (correct) {
        progress.correctFirst++;
        relationStats.correctFirst++;
        if (!assisted) progress.correctIndependent++;
        if (!assisted) relationStats.correctIndependent++;
    }

    const recent = state.attempts
        .filter(entry => !entry.exam && entry.stage === stage)
        .slice(-4);
    if (recent.length === 4 && recent.filter(entry => !entry.correct).length >= 2) {
        progress.supportMode = true;
        progress.consecutiveSupportCorrect = 0;
    } else if (progress.supportMode && correct) {
        progress.consecutiveSupportCorrect++;
        if (progress.consecutiveSupportCorrect >= 2) {
            progress.supportMode = false;
            progress.consecutiveSupportCorrect = 0;
        }
    } else if (progress.supportMode && !correct) {
        progress.consecutiveSupportCorrect = 0;
    }

    if (stageRequirementMet(state, stage)) {
        progress.supportMode = false;
        state.currentStageIndex++;
        if (state.currentStageIndex >= COMPARISON_STAGES.length) {
            state.status = 'exam_ready';
        }
    }
}

export function applyComparisonExamResult(
    state: ComparisonChapterState,
    medal: TrialTier,
): void {
    if (medalRank(medal) > medalRank(state.examBestMedal ?? 'none')) {
        state.examBestMedal = medal;
    }
    if (medal !== 'none') {
        state.status = 'complete';
        state.currentStageIndex = COMPARISON_STAGES.length;
        return;
    }

    const examAttempts = state.attempts.filter(attempt => attempt.exam).slice(-EXAM_CONFIGS.comparison_chapter.itemCount);
    const representations: ComparisonRepresentation[] = ['size', 'count', 'number', 'expression'];
    let weakest: ComparisonRepresentation = 'expression';
    let weakestAccuracy = Number.POSITIVE_INFINITY;
    for (const representation of representations) {
        const sample = examAttempts.filter(attempt => attempt.representation === representation);
        const accuracy = sample.length === 0 ? 1 : sample.filter(attempt => attempt.correct).length / sample.length;
        if (accuracy < weakestAccuracy) {
            weakest = representation;
            weakestAccuracy = accuracy;
        }
    }

    const retryStage = examStageForRepresentation(weakest);
    state.currentStageIndex = COMPARISON_STAGES.indexOf(retryStage);
    state.status = 'training';
    const progress = state.stages[state.currentStageIndex];
    progress.attempts = 0;
    progress.correctFirst = 0;
    progress.correctIndependent = 0;
    progress.supportMode = true;
    progress.consecutiveSupportCorrect = 0;
}

export function comparisonChapterProgress(state: ComparisonChapterState): number {
    if (state.status === 'complete') return 1;
    if (state.status === 'locked') return 0;
    if (state.status === 'exam_ready') return 1;
    const stage = getCurrentComparisonStage(state);
    if (!stage) return 0;
    const requirement = STAGE_REQUIREMENTS[stage];
    const attempts = state.attempts.filter(entry => !entry.exam && entry.stage === stage).slice(-requirement.itemCount);
    const qualifying = attempts.filter(attempt => attempt.correct && (!requirement.independent || !attempt.assisted));
    const stageFraction = Math.min(attempts.length / requirement.itemCount, qualifying.length / requirement.correctCount, 1);
    return (state.currentStageIndex + stageFraction) / COMPARISON_STAGES.length;
}

export function relationSymbol(relation: ComparisonRelation): '<' | '=' | '>' {
    return relation === 'less' ? '<' : relation === 'equal' ? '=' : '>';
}

function stageRequirementMet(state: ComparisonChapterState, stage: ComparisonStageId): boolean {
    const requirement = STAGE_REQUIREMENTS[stage];
    const window = state.attempts
        .filter(attempt => !attempt.exam && attempt.stage === stage)
        .slice(-requirement.itemCount);
    if (window.length < requirement.itemCount) return false;
    return window.filter(attempt => attempt.correct && (!requirement.independent || !attempt.assisted)).length
        >= requirement.correctCount;
}

function getSupportRelation(state: ComparisonChapterState, stage: ComparisonStageId): ComparisonRelation | null {
    const progress = state.stages[COMPARISON_STAGES.indexOf(stage)];
    if (!progress?.supportMode) return null;
    const recentWrong = [...state.attempts]
        .reverse()
        .find(attempt => !attempt.exam && attempt.stage === stage && !attempt.correct);
    return recentWrong?.relation ?? null;
}

function createComparisonProblem(
    stage: ComparisonStageId,
    relation: ComparisonRelation,
    variant: number,
    options: {
        diagnosticMode?: boolean;
        supportMode?: boolean;
        exam?: boolean;
        representation?: ComparisonRepresentation;
        showCrocodile?: boolean;
    } = {},
): MathProblem {
    const representation = options.representation ?? representationForStage(stage);
    const [leftValue, rightValue] = valuePairForRelation(relation, variant);
    const showCrocodile = options.showCrocodile ?? (
        stage === 'size_crocodile' || stage === 'count_crocodile' || stage === 'number_crocodile'
    );
    const answer = relation === 'less' ? 0 : relation === 'equal' ? 1 : 2;
    const problem: MathProblem = {
        id: `comparison_${stage}_${variant}_${relation}`,
        operand1: leftValue,
        operand2: rightValue,
        operator: '+',
        answer,
        choices: [0, 1, 2],
        showVisualHint: false,
        hintType: 'none',
        source: 'player',
        problemType: 'comparison',
    };

    if (representation === 'expression') {
        const useSubtraction = variant % 2 === 1 && leftValue < 5;
        if (useSubtraction) {
            const extra = Math.min(2, 5 - leftValue);
            problem.operand1 = leftValue + extra;
            problem.operand2 = extra;
            problem.operator = '-';
        } else {
            problem.operand1 = Math.floor(leftValue / 2);
            problem.operand2 = leftValue - problem.operand1;
            problem.operator = '+';
        }
        problem.operand3 = rightValue;
    }

    const meta: ComparisonProblemMeta = {
        chapterId: COMPARISON_CHAPTER_ID,
        stage,
        representation,
        relation,
        leftValue,
        rightValue,
        leftVisualValue: leftValue,
        rightVisualValue: rightValue,
        showCrocodile,
        diagnosticMode: options.diagnosticMode,
        exam: options.exam,
    };
    if (stage === 'expression_guided' && !options.exam) {
        meta.autoArithmeticHintMs = 15000;
        meta.arithmeticHintText = `${problem.operand1} ${problem.operator} ${problem.operand2} = ${leftValue}`;
    }
    // Symbol phases always retain plain choices. Their separate delayed jaw
    // reminders must not turn the buttons back into crocodiles after a mistake.
    problem.comparisonMeta = meta;
    return problem;
}

function representationForStage(stage: ComparisonStageId): ComparisonRepresentation {
    if (stage === 'size_crocodile') return 'size';
    if (stage === 'count_crocodile') return 'count';
    if (stage === 'number_crocodile' || stage === 'number_symbol') return 'number';
    return 'expression';
}

function examStageForRepresentation(representation: ComparisonRepresentation): ComparisonStageId {
    if (representation === 'size') return 'size_crocodile';
    if (representation === 'count') return 'count_crocodile';
    if (representation === 'number') return 'number_symbol';
    return 'expression_independent';
}

function valuePairForRelation(relation: ComparisonRelation, variant: number): [number, number] {
    const low = 1 + (variant % 3);
    const high = Math.min(5, low + 1 + (variant % Math.max(1, 5 - low)));
    if (relation === 'less') return [low, high];
    if (relation === 'greater') return [high, low];
    const equal = 2 + (variant % 4);
    return [equal, equal];
}

function deterministicInterleave<T>(values: T[], rotation: number): T[] {
    if (values.length < 3) return values;
    const evens = values.filter((_, index) => index % 2 === 0);
    const odds = values.filter((_, index) => index % 2 === 1).reverse();
    const mixed = [...evens, ...odds];
    return mixed.slice(rotation).concat(mixed.slice(0, rotation));
}

function medalRank(medal: TrialTier): number {
    return ['none', 'bronze', 'silver', 'gold'].indexOf(medal);
}

function createRelationStats(): Record<ComparisonRelation, {
    attempts: number;
    correctFirst: number;
    correctIndependent: number;
}> {
    return {
        less: { attempts: 0, correctFirst: 0, correctIndependent: 0 },
        equal: { attempts: 0, correctFirst: 0, correctIndependent: 0 },
        greater: { attempts: 0, correctFirst: 0, correctIndependent: 0 },
    };
}

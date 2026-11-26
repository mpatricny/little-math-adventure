import tuning from '../data/personal-bonuses.json';
import type { MasteryData, MathProblem, PlayerState, PracticeTargetId } from '../types';
import { collectLearningAttempts } from './LearningHistory';
import { getPracticeSelection } from './PracticeProgress';
import { catacombTimedAttempts } from './CatacombBatch';
import { catacombProgress, nextCatacombStage } from './CatacombProgress';

export const PERSONAL_BONUS_CONFIG = tuning;
export interface BattleAnswerEvidence {
    problem: MathProblem;
    correct: boolean;
    responseTimeMs: number;
    assisted: boolean;
    defense: boolean;
}
export interface PersonalAnswerBonus {
    damage: number;
    baselineMs: number | null;
    quick: boolean;
}
export interface PracticeImprovementReward {
    mana: number;
    targetId?: PracticeTargetId;
    measuredAnswers: number;
    accuracy: number;
    /** Weighted by each task's own frozen reference, not by the difficulty mix. */
    improvement: number | null;
}

export interface PracticeSpeedSnapshot {
    medianMs: number | null;
    milestoneMs: number | null;
    targetMs: number;
    door: 'locked' | 'open' | 'complete';
}

export interface PracticeVictoryResult extends PracticeImprovementReward {
    journey?: { targetId: PracticeTargetId; before?: PracticeSpeedSnapshot; after: PracticeSpeedSnapshot };
}

function practiceSpeedSnapshot(data: MasteryData, player: Pick<PlayerState, 'catacombFoxJourney'>, target: PracticeTargetId): PracticeSpeedSnapshot {
    const milestone = nextCatacombStage(catacombProgress(data, player, target));
    // Personal pace includes slower children. The door uses the actual trial's stricter evidence.
    const times = catacombTimedAttempts(data, target, tuning.maximumReferenceTimeMs).slice(-20)
        .filter(a => a.correct && !a.assisted).map(a => a.responseTimeMs).sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return {
        medianMs: times.length ? (times[mid] + times[Math.floor((times.length - 1) / 2)]) / 2 : null,
        milestoneMs: milestone.speedMs, targetMs: milestone.targetMs,
        door: milestone.completed ? 'complete' : milestone.ready ? 'open' : 'locked',
    };
}

export interface PersonalBattleBonusCheckpoint {
    version: 1;
    baselines: Array<[string, number]>;
    practiceTarget?: PracticeTargetId;
    practiceBefore?: PracticeSpeedSnapshot;
    answers: number;
    independentCorrect: number;
    ratios: number[];
    invalidTiming: boolean;
    claimed: boolean;
}

function timed(ms: number): boolean {
    // Personal improvement must also work above the mastery evidence window.
    // Only a very long/invalid clock is discarded as an unreliable reference.
    return Number.isFinite(ms) && ms > 0 && ms <= tuning.maximumReferenceTimeMs;
}
function groupForProblem(problem: MathProblem): string | null {
    if (problem.comparisonMeta) {
        if (problem.comparisonMeta.exam || problem.comparisonMeta.diagnosticMode) return null;
        return `comparison:${problem.comparisonMeta.stage}`;
    }
    const parts = problem.masteryKey?.split(':');
    return parts && parts.length >= 3 ? `${parts[0]}:${parts.at(-1)}` : null;
}

/** One child, one fight. Snapshot before generating tasks or recording this fight's answers. */
export class PersonalBattleBonuses {
    private readonly baselines = new Map<string, number>();
    private practiceTarget?: PracticeTargetId;
    private practiceBefore?: PracticeSpeedSnapshot;
    private answers = 0;
    private independentCorrect = 0;
    private ratios: number[] = [];
    private invalidTiming = false;
    private claimed = false;

    constructor(data: MasteryData, player: Pick<PlayerState, 'catacombFoxJourney'> = {}, phase: 'start' | 'resume' = 'start') {
        const selection = getPracticeSelection(data, player);
        if (selection.mode === 'practice') {
            this.practiceTarget = selection.targetId;
            if (phase === 'start') this.practiceBefore = practiceSpeedSnapshot(data, player, selection.targetId);
        }
        const samples = new Map<string, number[]>();
        for (const attempt of collectLearningAttempts(data)) {
            if (!attempt.correct || attempt.assisted || attempt.clockUncertain
                || attempt.context === 'underwater_bell' || !timed(attempt.responseTimeMs)) continue;
            const group = attempt.source === 'comparison'
                ? attempt.problemKey.split(':').slice(0, 2).join(':')
                : attempt.subAtomId && attempt.form ? `${attempt.subAtomId}:${attempt.form}` : null;
            if (!group) continue;
            const times = samples.get(group) ?? [];
            times.push(attempt.responseTimeMs);
            if (times.length > tuning.historySize) times.shift();
            samples.set(group, times);
        }
        samples.forEach((times, group) => {
            if (times.length >= tuning.minimumHistory) {
                this.baselines.set(group, times.reduce((sum, ms) => sum + ms, 0) / times.length);
            }
        });
    }

    exportCheckpoint(): PersonalBattleBonusCheckpoint {
        return { version: 1, baselines: Array.from(this.baselines), practiceTarget: this.practiceTarget,
            practiceBefore: this.practiceBefore && { ...this.practiceBefore },
            answers: this.answers, independentCorrect: this.independentCorrect, ratios: [...this.ratios],
            invalidTiming: this.invalidTiming, claimed: this.claimed };
    }

    /** Keep the original battle's reference, even if learning history advanced before reload. */
    restoreCheckpoint(value: PersonalBattleBonusCheckpoint): boolean {
        if (value?.version !== 1 || !Array.isArray(value.baselines)
            || !value.baselines.every(entry => Array.isArray(entry) && entry.length === 2
                && typeof entry[0] === 'string' && entry[0].length > 0 && timed(entry[1]))
            || new Set(value.baselines.map(entry => entry[0])).size !== value.baselines.length
            || (value.practiceTarget !== undefined && value.practiceTarget !== 'comparison_symbols'
                && !/^[A-H][1-4]$/.test(value.practiceTarget))
            || !Number.isInteger(value.answers) || value.answers < 0
            || !Number.isInteger(value.independentCorrect) || value.independentCorrect < 0
            || value.independentCorrect > value.answers || !Array.isArray(value.ratios)
            || value.ratios.length > value.independentCorrect || !value.ratios.every(ratio => Number.isFinite(ratio) && ratio > 0)
            || typeof value.invalidTiming !== 'boolean' || typeof value.claimed !== 'boolean') return false;
        this.baselines.clear();
        value.baselines.forEach(([group, time]) => this.baselines.set(group, time));
        this.practiceTarget = value.practiceTarget;
        const before = value.practiceBefore;
        // An older checkpoint has no pre-fight measurement. Never substitute the reloaded profile.
        this.practiceBefore = before && timed(before.targetMs) && (before.medianMs === null || timed(before.medianMs))
            && (before.milestoneMs === null || timed(before.milestoneMs)) && ['locked', 'open', 'complete'].includes(before.door)
            ? { ...before } : undefined;
        this.answers = value.answers; this.independentCorrect = value.independentCorrect;
        this.ratios = [...value.ratios]; this.invalidTiming = value.invalidTiming; this.claimed = value.claimed;
        return true;
    }

    /** Called once by MathBoard's first-answer gate, including wrong and shield answers. */
    answer(evidence: BattleAnswerEvidence): PersonalAnswerBonus {
        const { problem, correct, responseTimeMs, assisted, defense } = evidence;
        const group = groupForProblem(problem);
        const baselineMs = group ? this.baselines.get(group) ?? null : null;
        const independent = correct && !assisted;
        const quick = independent && timed(responseTimeMs) && baselineMs !== null && responseTimeMs < baselineMs;
        const target = problem.comparisonMeta ? 'comparison_symbols' : problem.masteryKey?.split(':')[0];
        if (group && this.practiceTarget && target === this.practiceTarget) {
            this.answers++;
            if (independent) this.independentCorrect++;
            // A long active answer remains in the improvement average; dropping it
            // would let several quick answers hide a difficult task. Invalid clocks
            // suppress the reward, never fabricate a fast answer.
            if (!Number.isFinite(responseTimeMs) || responseTimeMs <= 0) this.invalidTiming = true;
            else if (independent && baselineMs !== null) this.ratios.push(responseTimeMs / baselineMs);
        }
        return { damage: quick && !defense ? tuning.quickAttackDamage : 0, baselineMs, quick };
    }

    summary(won: boolean): PracticeImprovementReward {
        const accuracy = this.answers ? this.independentCorrect / this.answers : 0;
        const improvement = this.ratios.length
            ? 1 - this.ratios.reduce((sum, ratio) => sum + ratio, 0) / this.ratios.length : null;
        const earned = won && this.practiceTarget && !this.invalidTiming
            && this.ratios.length >= tuning.minimumPracticeAnswers
            && accuracy >= tuning.minimumPracticeAccuracy
            && improvement !== null && improvement + Number.EPSILON >= tuning.minimumImprovement;
        return { mana: earned ? tuning.practiceMana : 0, targetId: this.practiceTarget,
            measuredAnswers: this.ratios.length, accuracy, improvement };
    }

    /** Freeze the result after the owner's final mastery updates. Rendering it has no side effects. */
    victoryResult(reward: PracticeImprovementReward, data: MasteryData, player: Pick<PlayerState, 'catacombFoxJourney'>): PracticeVictoryResult {
        if (!this.practiceTarget) return reward;
        return { ...reward, journey: { targetId: this.practiceTarget, before: this.practiceBefore && { ...this.practiceBefore },
            after: practiceSpeedSnapshot(data, player, this.practiceTarget) } };
    }

    /** Receipt and mana are saved in the same player snapshot by the caller. */
    claim(player: PlayerState, battleId: string, won: boolean, addMana: (amount: number) => void): PracticeImprovementReward {
        const result = this.summary(won);
        if (this.claimed || player.lastPracticeManaBattleId === battleId) return { ...result, mana: 0 };
        this.claimed = true;
        if (result.mana > 0) {
            player.lastPracticeManaBattleId = battleId;
            addMana(result.mana);
        }
        return result;
    }
}

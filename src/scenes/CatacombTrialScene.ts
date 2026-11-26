import Phaser from 'phaser';
import type { MathProblem, PetDefinition, PracticeTargetId } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MasterySystem } from '../systems/MasterySystem';
import { generateComparisonExamProblems } from '../systems/ComparisonLearningSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CatacombTrialUI, type CatacombRewardView } from '../ui/CatacombTrialUI';
import type { FoxRewardArrival } from '../ui/CatacombProgressOverlay';
import { awardCatacombFoxVictory, getPetAttackPower, CATACOMB_FOX_ENEMY, CATACOMB_FOX_PET } from '../systems/CatacombPetProgress';
import { admitFoxSpeedTrial, completeFoxSpeedTrial, type FoxSpeedStage, type FoxTrialAdmission } from '../systems/CatacombProgress';
import { CatacombBatch, catacombBatchGoal, getCatacombBatchRules } from '../systems/CatacombBatch';
import { getPracticeTargetState, type CatacombChallenge } from '../systems/PracticeProgress';
import { getFoxJourney } from '../systems/FoxAbilitySystem';
import { CatacombTrialOwner } from '../systems/CatacombTrialOwner';
import { recordCatacombTrial } from '../systems/CatacombTrialHistory';
import { ObservatoryRound } from '../ui/ObservatoryRound';
import type { MathBoardFirstAnswer } from '../ui/MathBoard';

interface CatacombInitData {
    examType: CatacombChallenge;
    subAtomId: PracticeTargetId;
    returnScene?: string;
    speedStage?: FoxSpeedStage;
    ownerSlot?: number;
}

/** Each module trial is one timed constellation. All rewards belong to its admitted player. */
export class CatacombTrialScene extends Phaser.Scene {
    private args!: CatacombInitData;
    private owner!: CatacombTrialOwner;
    private sceneBuilder!: SceneBuilder;
    private round?: ObservatoryRound;
    private resultShown = false;
    private trialEvidenceId = '';
    private admission: FoxTrialAdmission | null = null;

    constructor() { super({ key: 'CatacombTrialScene' }); }

    init(data: CatacombInitData): void {
        this.args = data;
        this.resultShown = false;
        this.trialEvidenceId = Phaser.Utils.String.UUID();
        this.admission = null;
    }

    create(): void {
        this.owner = new CatacombTrialOwner(this.args.ownerSlot);
        if (!this.owner.activate()) { this.leave(); return; }
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.round = undefined; this.owner.release(); });
        const { subAtomId, speedStage, examType } = this.args;
        const { total } = catacombBatchGoal(speedStage ?? examType);
        const mastery = MasterySystem.getInstance();
        const chapter = subAtomId === 'comparison_symbols' ? mastery.getComparisonChapterState() : undefined;
        const draw = chapter && { ...chapter };
        const problems = draw ? generateComparisonExamProblems(draw, total)
            : this.generateArithmeticProblems(total);
        if (problems.length !== total) { this.leave(); return; }
        if (speedStage) {
            this.admission = admitFoxSpeedTrial(this.owner.data, this.owner.player, subAtomId, speedStage, this.trialEvidenceId, problems);
            if (!this.admission) { this.leave(); return; }
            if (this.admission.firstEntry) this.owner.save();
        }
        if (chapter && draw) chapter.examRotation = draw.examRotation;
        const rules = this.admission?.rules ?? getCatacombBatchRules(this.owner.data, subAtomId, examType, problems);
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('CatacombTrialScene');
        this.sceneBuilder.get<Phaser.GameObjects.Image>('catacombBattleBackground')?.setVisible(false);
        const ownsFox = this.owner.player.unlockedPets.includes(CATACOMB_FOX_ENEMY);
        this.round = new ObservatoryRound(this, this.sceneBuilder, rules, problems, speedStage ? 'rune' : ownsFox ? 'attack' : 'rescue', {
            telemetryContext: this.args.examType === 'fluency_challenge' ? 'fluency' : 'mastery_challenge',
            onAnswer: answer => this.recordAnswer(answer), onFinish: batch => this.finish(batch, problems), onExit: () => this.leave(),
        });
    }

    private generateArithmeticProblems(total: number): MathProblem[] {
        const mastery = MasterySystem.getInstance();
        const { subAtomId, examType } = this.args;
        if (subAtomId === 'comparison_symbols') return [];
        const engine = new MathEngine(this.registry);
        const keys = mastery.generateChallengeProblemKeys(subAtomId, total, examType);
        return keys.map(key => engine.generateProblemFromKey(key, 'practice')).filter((p): p is MathProblem => p !== null);
    }

    private recordAnswer({ problem, correct, responseTimeMs, assisted }: MathBoardFirstAnswer): void {
        if (!this.owner.isCurrent()) { this.round?.destroy(); this.leave(); return; }
        const mastery = MasterySystem.getInstance();
        if (problem.masteryKey) {
            const context = this.args.examType === 'fluency_challenge' ? 'fluency' : 'mastery_challenge';
            mastery.recordSolve(problem.masteryKey, correct, responseTimeMs, context, assisted);
        }
        if (problem.comparisonMeta) mastery.recordComparisonSolve(problem, correct, responseTimeMs, assisted);
        // recordSolve and recordComparisonSolve already checkpoint the solo player.
        // A co-op attempt lives in the participant's separate mastery state.
        if (this.owner.participant) this.owner.save();
    }

    private finish(batch: CatacombBatch, problems: readonly MathProblem[]): void {
        if (this.resultShown) return;
        this.resultShown = true;
        if (!this.owner.isCurrent()) { this.leave(); return; }
        const { subAtomId, speedStage, examType } = this.args;
        const player = this.owner.player;
        const fox = (this.cache.json.get('pets') as PetDefinition[]).find(pet => pet.id === CATACOMB_FOX_PET)!;
        let passed = batch.passed;
        let reward: CatacombRewardView;
        if (speedStage) {
            const before = getFoxJourney(player).points;
            passed = passed && completeFoxSpeedTrial(this.owner.data, player, subAtomId, speedStage,
                batch.answers, this.trialEvidenceId, Date.now(), this.admission);
            reward = { kind: 'ability', before, after: getFoxJourney(player).points };
        } else {
            const before = getPetAttackPower(fox, player);
            const expectedState = examType === 'fluency_challenge' ? 'secure' : 'fluent';
            let rescued = false;
            // Retry/abandon never reverses a previous award. The score APIs accept counts only,
            // so an incomplete round cannot be passed to them as a qualifying score on timeout.
            if (getPracticeTargetState(this.owner.data, subAtomId) === expectedState
                && (passed || batch.correctCount < batch.rules.required)) {
                const mastery = MasterySystem.getInstance();
                const result = examType === 'fluency_challenge' ? mastery.applyFluencyResult(subAtomId, batch.correctCount)
                    : mastery.applyMasteryResult(subAtomId, batch.correctCount);
                if (passed && result.stateChanged) rescued = awardCatacombFoxVictory(player).petUnlocked;
            }
            reward = { kind: rescued ? 'rescue' : 'attack', before,
                after: getPetAttackPower(fox, player) };
        }
        if (speedStage) recordCatacombTrial(this.owner.data, subAtomId, speedStage, this.trialEvidenceId, problems, batch, passed);
        this.owner.save();
        const ui = new CatacombTrialUI(this, this.sceneBuilder);
        if (batch.passed && !passed) this.round?.art.finish(false);
        const arrival: FoxRewardArrival | undefined = passed ? { slot: this.owner.slot, target: subAtomId, reward } : undefined;
        ui.showResult(batch, passed ? reward : null, () => this.leave(arrival), () => this.scene.restart({ ...this.args, ownerSlot: this.owner.slot }));
    }

    private leave(foxReward?: FoxRewardArrival): void { this.scene.start(this.args.returnScene ?? 'GuildScene', { foxReward }); }
}

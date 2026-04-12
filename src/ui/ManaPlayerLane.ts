import Phaser from 'phaser';
import { MathEngine } from '../systems/MathEngine';
import { ManaSystem } from '../systems/ManaSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { ProblemDatabase } from '../systems/ProblemDatabase';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, MasteryData, MathProblem, MathProblemDef, PlayerState, ProblemDefinition, ProblemStats, SubAtomId } from '../types';
import { formatMathProblem } from '../utils/formatMathProblem';

const ROW_COUNT = 8;
const MAX_LIVES = 3;

interface AnswerSlot {
    value: number;
    x: number;
    y: number;
    isCorrect: boolean;
    label: Phaser.GameObjects.Text;
}

export interface PoolProblem extends MathProblemDef {
    stats: ProblemStats;
    masteryKey?: string;
}

export interface PlayerLaneConfig {
    channelLeft: number;
    channelRight: number;
    channelTop: number;
    channelBottom: number;
    leftNumX: number;
    rightNumX: number;
    problemX: number;
    nextPreviewX: number;
    nextPreviewY: number;
    heartsX: number;
    heartsY: number;
    titleX: number;
    titleY: number;
    manaX: number;
    manaY: number;
    buttonX: number;
    buttonY: number;
    playerLabel: string;
    playerIdentifier: 'A' | 'B';
    resolveKey?: string;
    fontScale?: number;
}

export interface LaneResults {
    correctCount: number;
    problemCount: number;
    wrongCount: number;
    manaEarnedThreshold: number;
}

export interface LanePersistenceContext {
    playerState?: PlayerState;
    persistProgress?: () => void;
    sharedManaRewards?: boolean;
}

export class ManaPlayerLane {
    private static readonly FIXED_POOL_SIZE = 20;
    private scene: Phaser.Scene;
    private config: PlayerLaneConfig;
    private mathEngine: MathEngine;
    private gameState: GameStateManager;
    private onLaneDead: () => void;
    private playerState: PlayerState | null;
    private persistProgress: (() => void) | null;
    private sharedManaRewards: boolean;

    // Derived constants
    private rowHeight: number;
    private problemStartY: number;
    private problemEndY: number;
    private fontScale: number;

    // Game state
    private lives: number = MAX_LIVES;
    private problemCount: number = 0;
    private correctCount: number = 0;
    private wrongCount: number = 0;
    private manaEarnedThreshold: number = 0;
    private isGameActive: boolean = false;
    private isResolving: boolean = false;

    // Pool
    private manaPool: PoolProblem[];
    private poolIndex: number = 0;

    // Current problem & next
    private currentProblem: MathProblem | null = null;
    private nextPoolProblem: PoolProblem | null = null;
    private answerSlots: AnswerSlot[] = [];

    // Game objects
    private channelGraphics!: Phaser.GameObjects.Graphics;
    private problemText!: Phaser.GameObjects.Text;
    private fallingTween: Phaser.Tweens.Tween | null = null;
    private heartTexts: Phaser.GameObjects.Text[] = [];
    private manaDisplayText!: Phaser.GameObjects.Text;
    private resolveButton!: Phaser.GameObjects.Container;
    private resolveKey: Phaser.Input.Keyboard.Key | null = null;
    private scoreText!: Phaser.GameObjects.Text;
    private nextProblemLabel!: Phaser.GameObjects.Text;
    private nextProblemText!: Phaser.GameObjects.Text;
    private laneFinishedText: Phaser.GameObjects.Text | null = null;

    constructor(
        scene: Phaser.Scene,
        config: PlayerLaneConfig,
        mathEngine: MathEngine,
        gameState: GameStateManager,
        manaPool: PoolProblem[],
        onLaneDead: () => void,
        persistence?: LanePersistenceContext,
    ) {
        this.scene = scene;
        this.config = config;
        this.mathEngine = mathEngine;
        this.gameState = gameState;
        this.manaPool = manaPool;
        this.onLaneDead = onLaneDead;
        this.playerState = persistence?.playerState ?? null;
        this.persistProgress = persistence?.persistProgress ?? null;
        this.sharedManaRewards = persistence?.sharedManaRewards ?? false;

        this.rowHeight = (config.channelBottom - config.channelTop) / ROW_COUNT;
        this.problemStartY = config.channelTop - 60;
        this.problemEndY = config.channelBottom + 20;
        this.fontScale = config.fontScale ?? 1.0;

        this.createChannel();
        this.createHeader();
        this.createResolveButton();
        this.createProblemText();
        this.createNextProblemPreview();
    }

    // ============ STATIC: BUILD MANA POOL ============

    static buildManaPool(mathEngine: MathEngine, masteryData?: MasteryData): PoolProblem[] {
        const frontierSubAtom = masteryData ? ManaPlayerLane.getFrontierSubAtom(masteryData) : null;
        if (frontierSubAtom) {
            const masteryPool = ManaPlayerLane.buildFrontierSubAtomPool(frontierSubAtom);
            if (masteryPool.length > 0) {
                return masteryPool;
            }
        }

        const levelProblems = mathEngine.getLevelProblemsWithStats()
            .filter(p => !p.problemType || p.problemType === 'standard')
            .filter(p => p.answer >= 0)
            .filter(problem => !ManaPlayerLane.hasZero(problem))
            .map(problem => ({
                ...problem,
                stats: problem.stats ?? { correctCount: 0, wrongCount: 0, lastAttempt: 0, mastered: false, manaCollected: 0 },
            } as PoolProblem));

        if (levelProblems.length === 0) {
            return [];
        }

        const thresholds = [5, 10, 20];
        const scored = levelProblems.map(problem => {
            let nextThreshold = Infinity;
            for (let i = 0; i < thresholds.length; i++) {
                if (problem.stats.manaCollected <= i) {
                    nextThreshold = thresholds[i];
                    break;
                }
            }
            const distance = nextThreshold === Infinity
                ? Infinity
                : Math.max(0, nextThreshold - problem.stats.correctCount);
            const priority = distance === Infinity ? 999 : distance;
            return { problem, priority };
        });

        scored.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            if (a.problem.stats.wrongCount !== b.problem.stats.wrongCount) {
                return b.problem.stats.wrongCount - a.problem.stats.wrongCount;
            }
            return a.problem.stats.correctCount - b.problem.stats.correctCount;
        });

        const rankedProblems = scored.map(entry => entry.problem);
        const pool: PoolProblem[] = [];

        while (pool.length < ManaPlayerLane.FIXED_POOL_SIZE) {
            const batch = ManaPlayerLane.shuffle(rankedProblems);
            for (const problem of batch) {
                if (pool.length >= ManaPlayerLane.FIXED_POOL_SIZE) {
                    break;
                }
                pool.push({
                    ...problem,
                    stats: { ...problem.stats },
                });
            }
        }

        return pool;
    }

    private static buildFrontierSubAtomPool(subAtomId: SubAtomId): PoolProblem[] {
        const sourceProblems = ProblemDatabase.getInstance()
            .getProblemsForForm(subAtomId, 'result_unknown')
            .filter(problem => !ManaPlayerLane.hasZero(problem));
        if (sourceProblems.length === 0) {
            return [];
        }

        const rankedProblems = ManaPlayerLane.rankFrontierProblems(sourceProblems, subAtomId);
        const pool: PoolProblem[] = [];

        while (pool.length < ManaPlayerLane.FIXED_POOL_SIZE) {
            for (const problem of rankedProblems) {
                if (pool.length >= ManaPlayerLane.FIXED_POOL_SIZE) {
                    break;
                }
                pool.push({
                    id: problem.key,
                    masteryKey: problem.key,
                    operand1: problem.operand1,
                    operand2: problem.operand2,
                    operand3: problem.operand3,
                    operand4: problem.operand4,
                    operator: problem.operator,
                    operator2: problem.operator2,
                    operator3: problem.operator3,
                    answer: problem.answer,
                    stats: { correctCount: 0, wrongCount: 0, lastAttempt: 0, mastered: false, manaCollected: 0 },
                });
            }
        }

        return pool;
    }

    private static rankFrontierProblems(sourceProblems: ProblemDefinition[], subAtomId: SubAtomId): ProblemDefinition[] {
        if (!subAtomId.startsWith('E')) {
            return ManaPlayerLane.shuffle(sourceProblems);
        }

        const preferred = ManaPlayerLane.shuffle(sourceProblems.filter(problem => ManaPlayerLane.isPreferredEProblem(problem)));
        const remaining = ManaPlayerLane.shuffle(sourceProblems.filter(problem => !ManaPlayerLane.isPreferredEProblem(problem)));
        return preferred.length > 0 ? [...preferred, ...remaining] : remaining;
    }

    private static hasZero(problem: { operand1?: number; operand2?: number; operand3?: number; operand4?: number; answer?: number }): boolean {
        return [problem.operand1, problem.operand2, problem.operand3, problem.operand4, problem.answer]
            .some(value => value === 0);
    }

    private static isPreferredEProblem(problem: ProblemDefinition): boolean {
        if (problem.bandId !== 'E' || problem.answer < 0 || problem.answer > 20) {
            return false;
        }

        // Prefer the classic two-term crossing-10 shape for E pools.
        if (problem.operand3 !== undefined || problem.operand4 !== undefined || problem.operator2 || problem.operator3) {
            return false;
        }

        if (problem.operator === '+') {
            return problem.operand1 < 10 && problem.operand2 > 0 && problem.answer > 10;
        }

        return problem.operator === '-'
            && problem.operand1 > 10
            && problem.operand2 > 0
            && problem.answer < 10;
    }

    private static getFrontierSubAtom(data: MasteryData): SubAtomId | null {
        const currentBand = ManaPlayerLane.getCurrentBand(data);
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${currentBand}${num}` as SubAtomId;
            if (data.subAtoms[id].state === 'training') {
                return id;
            }
        }
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${currentBand}${num}` as SubAtomId;
            if (data.subAtoms[id].state !== 'mastery') {
                return id;
            }
        }
        return `${currentBand}1` as SubAtomId;
    }

    private static getCurrentBand(data: MasteryData): BandId {
        for (let i = ALL_BANDS.length - 1; i >= 0; i--) {
            const band = ALL_BANDS[i];
            const state = data.bands[band].state;
            if (state !== 'locked' && state !== 'secure' && state !== 'fluent' && state !== 'mastery') {
                return band;
            }
        }
        for (let i = ALL_BANDS.length - 1; i >= 0; i--) {
            const band = ALL_BANDS[i];
            const state = data.bands[band].state;
            if (state !== 'locked' && state !== 'mastery') {
                return band;
            }
        }
        return 'A';
    }

    // ============ CHANNEL ============

    private createChannel(): void {
        const { channelLeft: cl, channelRight: cr, channelTop: ct, channelBottom: cb } = this.config;

        this.channelGraphics = this.scene.add.graphics();
        this.channelGraphics.setDepth(3);

        // Outer border
        this.channelGraphics.lineStyle(4, 0x6b5020, 0.9);
        this.channelGraphics.strokeRect(cl, ct, cr - cl, cb - ct);
        // Inner border
        this.channelGraphics.lineStyle(1, 0x8b6914, 0.5);
        this.channelGraphics.strokeRect(cl + 5, ct + 5, cr - cl - 10, cb - ct - 10);

        // Dark fill
        this.channelGraphics.fillStyle(0x12100a, 0.7);
        this.channelGraphics.fillRect(cl + 1, ct + 1, cr - cl - 2, cb - ct - 2);

        // Row separators
        this.channelGraphics.lineStyle(1, 0x5a4a2a, 0.4);
        for (let row = 1; row < ROW_COUNT; row++) {
            const y = ct + row * this.rowHeight;
            this.channelGraphics.lineBetween(cl + 6, y, cr - 6, y);
        }
    }

    // ============ HEADER ============

    private createHeader(): void {
        const { titleX, titleY, heartsX, heartsY, manaX, manaY } = this.config;

        this.scene.add.text(titleX, titleY, this.config.playerLabel, {
            fontSize: `${Math.round(26 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
            stroke: '#1a1008',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10);

        for (let i = 0; i < MAX_LIVES; i++) {
            const spacing = Math.round(35 * this.fontScale);
            const heart = this.scene.add.text(heartsX + i * spacing, heartsY, '♥', {
                fontSize: `${Math.round(30 * this.fontScale)}px`,
                fontFamily: 'Arial, sans-serif',
                color: '#cc3333',
                stroke: '#1a0808',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(10);
            this.heartTexts.push(heart);
        }

        this.manaDisplayText = this.scene.add.text(manaX, manaY, 'Mana: ⚡ 0', {
            fontSize: `${Math.round(18 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#88ccaa',
            fontStyle: 'bold',
            stroke: '#0a1a0a',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10);

        this.scoreText = this.scene.add.text(manaX, manaY + 25, '', {
            fontSize: `${Math.round(14 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
        }).setOrigin(0.5).setDepth(10);
    }

    // ============ RESOLVE BUTTON ============

    private createResolveButton(): void {
        const { buttonX, buttonY } = this.config;
        const btnW = Math.round(220 * this.fontScale);
        const btnH = Math.round(52 * this.fontScale);

        this.resolveButton = this.scene.add.container(buttonX, buttonY);
        this.resolveButton.setDepth(20);

        const bg = this.scene.add.rectangle(0, 0, btnW, btnH, 0x2a1f14)
            .setStrokeStyle(3, 0x8b6914);
        const innerBorder = this.scene.add.rectangle(0, 0, btnW - 10, btnH - 10, 0x000000, 0)
            .setStrokeStyle(1, 0x5a4a2a);
        const label = this.config.resolveKey
            ? `VYHODNOTIT (${this.config.resolveKey.toUpperCase()})`
            : 'VYHODNOTIT';
        const text = this.scene.add.text(0, 0, label, {
            fontSize: `${Math.round(20 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.resolveButton.add([bg, innerBorder, text]);
        this.resolveButton.setSize(btnW, btnH);
        this.resolveButton.setInteractive({ useHandCursor: true });

        this.resolveButton.on('pointerover', () => {
            bg.setFillStyle(0x3d2e1c);
            bg.setStrokeStyle(3, 0xccaa44);
            text.setColor('#ffe066');
        });
        this.resolveButton.on('pointerout', () => {
            bg.setFillStyle(0x2a1f14);
            bg.setStrokeStyle(3, 0x8b6914);
            text.setColor('#d4aa44');
        });
        this.resolveButton.on('pointerdown', () => this.onResolve());

        this.resolveButton.setVisible(false);

        if (this.config.resolveKey && this.scene.input.keyboard) {
            this.resolveKey = this.scene.input.keyboard.addKey(this.config.resolveKey);
            this.resolveKey.on('down', this.onResolve, this);
        }
    }

    // ============ PROBLEM TEXT ============

    private createProblemText(): void {
        this.problemText = this.scene.add.text(this.config.problemX, this.problemStartY, '', {
            fontSize: `${Math.round(26 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#f0e8d0',
            fontStyle: 'bold',
            stroke: '#1a1008',
            strokeThickness: 4,
            backgroundColor: '#2a1f14',
            padding: { x: 16, y: 8 },
        }).setOrigin(0.5).setDepth(15).setVisible(false);
    }

    // ============ NEXT PROBLEM PREVIEW ============

    private createNextProblemPreview(): void {
        const { nextPreviewX, nextPreviewY } = this.config;

        this.nextProblemLabel = this.scene.add.text(nextPreviewX, nextPreviewY - 25, 'Další:', {
            fontSize: `${Math.round(13 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#6a5a40',
        }).setOrigin(0.5).setDepth(10).setVisible(false);

        this.nextProblemText = this.scene.add.text(nextPreviewX, nextPreviewY + 5, '', {
            fontSize: `${Math.round(16 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#8a7a5a',
            fontStyle: 'bold',
            stroke: '#0a0806',
            strokeThickness: 2,
            backgroundColor: '#1e1810',
            padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(10).setVisible(false);
    }

    // ============ PUBLIC API ============

    startGame(): void {
        this.isGameActive = true;
        this.resolveButton.setVisible(true);
        this.nextPoolProblem = this.fetchNextPoolProblem();
        this.nextProblem();
    }

    stopGame(): void {
        this.isGameActive = false;
        if (this.fallingTween) {
            this.fallingTween.stop();
            this.fallingTween = null;
        }
        this.resolveButton.setVisible(false);
        this.problemText.setVisible(false);
        this.nextProblemText.setVisible(false);
        this.nextProblemLabel.setVisible(false);
        this.clearAnswerSlots();
    }

    isAlive(): boolean {
        return this.lives > 0;
    }

    getResults(): LaneResults {
        return {
            correctCount: this.correctCount,
            problemCount: this.problemCount,
            wrongCount: this.wrongCount,
            manaEarnedThreshold: this.manaEarnedThreshold,
        };
    }

    showLaneFinished(): void {
        if (this.laneFinishedText) return; // already showing

        const centerX = (this.config.channelLeft + this.config.channelRight) / 2;
        const centerY = (this.config.channelTop + this.config.channelBottom) / 2;

        this.laneFinishedText = this.scene.add.text(centerX, centerY, 'Konec!', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6644',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50);

        this.scene.tweens.add({
            targets: this.laneFinishedText,
            scale: 1.2,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    destroy(): void {
        this.stopGame();
        if (this.resolveKey) {
            this.resolveKey.off('down', this.onResolve, this);
            this.resolveKey.destroy();
            this.resolveKey = null;
        }
        if (this.laneFinishedText) {
            this.scene.tweens.killTweensOf(this.laneFinishedText);
            this.laneFinishedText.destroy();
        }
    }

    // ============ POOL ============

    private fetchNextPoolProblem(): PoolProblem {
        if (this.manaPool.length === 0) {
            this.manaPool = ManaPlayerLane.buildManaPool(this.mathEngine);
        }
        if (this.poolIndex >= this.manaPool.length) {
            this.poolIndex = 0;
            this.manaPool = ManaPlayerLane.shuffle(this.manaPool);
        }
        return this.manaPool[this.poolIndex++];
    }

    // ============ GAME LOOP ============

    private nextProblem(): void {
        if (!this.isGameActive) return;

        this.clearAnswerSlots();

        const poolProblem = this.nextPoolProblem ?? this.fetchNextPoolProblem();
        this.nextPoolProblem = this.fetchNextPoolProblem();

        this.currentProblem = poolProblem.masteryKey
            ? this.mathEngine.generateProblemFromKey(poolProblem.masteryKey)
            : this.mathEngine.generateProblemFromDef(poolProblem);
        if (!this.currentProblem) {
            return;
        }

        this.createAnswerSlots(this.currentProblem.answer, this.currentProblem.choices);

        const displayText = formatMathProblem(this.currentProblem, 'question');
        this.problemText.setText(displayText);
        this.problemText.setY(this.problemStartY);
        this.problemText.setVisible(true);

        this.scoreText.setText(`${this.correctCount} / ${this.problemCount}`);
        this.updateNextProblemPreview();

        const duration = this.getFallDuration();
        this.isResolving = false;

        this.fallingTween = this.scene.tweens.add({
            targets: this.problemText,
            y: this.problemEndY,
            duration,
            ease: 'Linear',
            onComplete: () => {
                if (!this.isResolving) {
                    this.onMissed();
                }
            },
        });
    }

    private getFallDuration(): number {
        return Math.max(1500, 8000 - this.problemCount * 300);
    }

    // ============ ANSWER SLOTS ============

    private createAnswerSlots(correctAnswer: number, choices: number[]): void {
        const values: number[] = [];
        for (let i = 0; i < ROW_COUNT; i++) {
            values.push(choices[i % 3]);
        }
        const shuffled = ManaPlayerLane.shuffle(values);
        const fontSize = `${Math.round(22 * this.fontScale)}px`;

        for (let row = 0; row < ROW_COUNT; row++) {
            const rowCenterY = this.config.channelTop + row * this.rowHeight + this.rowHeight / 2;
            const value = shuffled[row];
            const isCorrect = value === correctAnswer;

            const leftLabel = this.scene.add.text(this.config.leftNumX, rowCenterY, String(value), {
                fontSize,
                fontFamily: 'Arial, sans-serif',
                color: '#c4a86a',
                fontStyle: 'bold',
                stroke: '#1a1008',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(10);

            const rightLabel = this.scene.add.text(this.config.rightNumX, rowCenterY, String(value), {
                fontSize,
                fontFamily: 'Arial, sans-serif',
                color: '#c4a86a',
                fontStyle: 'bold',
                stroke: '#1a1008',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(10);

            this.answerSlots.push({
                value, x: this.config.leftNumX, y: rowCenterY, isCorrect, label: leftLabel,
            });
            this.answerSlots.push({
                value, x: this.config.rightNumX, y: rowCenterY, isCorrect, label: rightLabel,
            });
        }
    }

    private clearAnswerSlots(): void {
        for (const slot of this.answerSlots) {
            slot.label.destroy();
        }
        this.answerSlots = [];
    }

    // ============ NEXT PROBLEM PREVIEW ============

    private updateNextProblemPreview(): void {
        if (this.nextPoolProblem) {
            const previewText = formatMathProblem(this.nextPoolProblem, 'question');
            this.nextProblemText.setText(previewText);
            this.nextProblemText.setVisible(true);
            this.nextProblemLabel.setVisible(true);
        } else {
            this.nextProblemText.setVisible(false);
            this.nextProblemLabel.setVisible(false);
        }
    }

    // ============ RESOLVE ============

    private onResolve(): void {
        if (!this.isGameActive || this.isResolving || !this.currentProblem) return;
        this.isResolving = true;

        if (this.fallingTween) {
            this.fallingTween.stop();
            this.fallingTween = null;
        }

        const problemY = this.problemText.y;
        let closestSlot = this.answerSlots[0];
        let closestDist = Infinity;

        for (const slot of this.answerSlots) {
            const dist = Math.abs(problemY - slot.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestSlot = slot;
            }
        }

        const channelWidth = this.config.channelRight - this.config.channelLeft;
        const highlightBar = this.scene.add.rectangle(
            this.config.problemX, closestSlot.y,
            channelWidth - 4, this.rowHeight - 2,
            0x3355aa, 0.3
        ).setDepth(4);

        closestSlot.label.setColor('#ffffff');
        closestSlot.label.setFontSize(Math.round(26 * this.fontScale));

        if (closestSlot.isCorrect) {
            this.onCorrectAnswer(highlightBar);
        } else {
            this.onWrongAnswer(closestSlot, highlightBar);
        }
    }

    // ============ CORRECT / WRONG / MISSED ============

    private onCorrectAnswer(highlightBar: Phaser.GameObjects.Rectangle): void {
        highlightBar.setFillStyle(0x228822, 0.4);

        for (const s of this.answerSlots) {
            if (s.isCorrect) {
                s.label.setColor('#44ff44');
            }
        }

        let collectedMana = 0;
        this.withPlayerContext(() => {
            this.mathEngine.recordResultForProblem(this.currentProblem!.id, true);
            if (!this.sharedManaRewards) {
                const collectableMana = this.mathEngine.getCollectableMana(this.currentProblem!.id);
                if (collectableMana > 0) {
                    collectedMana = this.mathEngine.collectManaForProblem(this.currentProblem!.id);
                    ManaSystem.add(this.getPlayerState(), collectedMana);
                    this.manaEarnedThreshold += collectedMana;
                }
            }
            this.persistProgressIfNeeded(collectedMana > 0);
        });

        this.correctCount++;
        this.problemCount++;

        if (collectedMana > 0) {
            this.showManaCollectedFeedback(collectedMana);
        }

        this.showFeedbackText('SPRÁVNĚ!', '#44ff44', this.config.problemX, this.problemText.y - 40);
        this.updateManaDisplay();

        this.scene.time.delayedCall(1000, () => {
            highlightBar.destroy();
            this.nextProblem();
        });
    }

    private onWrongAnswer(selectedSlot?: AnswerSlot, highlightBar?: Phaser.GameObjects.Rectangle): void {
        if (highlightBar) {
            highlightBar.setFillStyle(0x882222, 0.4);
        }

        if (selectedSlot) {
            selectedSlot.label.setColor('#ff4444');
        }

        for (const slot of this.answerSlots) {
            if (slot.isCorrect) {
                slot.label.setColor('#44ff44');
                this.scene.tweens.add({
                    targets: slot.label,
                    scaleX: 1.4,
                    scaleY: 1.4,
                    duration: 300,
                    yoyo: true,
                    repeat: 1,
                });
            }
        }

        this.withPlayerContext(() => {
            this.mathEngine.recordResultForProblem(this.currentProblem!.id, false);
            this.persistProgressIfNeeded();
        });
        this.wrongCount++;
        this.problemCount++;

        this.lives--;
        this.updateHearts();

        this.showFeedbackText('ŠPATNĚ!', '#ff4444', this.config.problemX, this.problemText.y - 40);

        this.scene.time.delayedCall(1200, () => {
            highlightBar?.destroy();
            if (this.lives <= 0) {
                this.stopGame();
                this.onLaneDead();
            } else {
                this.nextProblem();
            }
        });
    }

    private onMissed(): void {
        this.isResolving = true;
        const feedbackY = (this.config.channelTop + this.config.channelBottom) / 2;
        this.showFeedbackText('NESTIHNUTÉ!', '#ffaa44', this.config.problemX, feedbackY);
        this.onWrongAnswer();
    }

    // ============ UI UPDATES ============

    private updateHearts(): void {
        for (let i = 0; i < MAX_LIVES; i++) {
            if (i < this.lives) {
                this.heartTexts[i].setColor('#ff4444');
                this.heartTexts[i].setText('♥');
            } else {
                this.heartTexts[i].setColor('#444444');
                this.heartTexts[i].setText('♡');
                if (i === this.lives) {
                    this.scene.tweens.add({
                        targets: this.heartTexts[i],
                        scale: 1.5,
                        alpha: 0.3,
                        duration: 400,
                        yoyo: true,
                    });
                }
            }
        }
    }

    private updateManaDisplay(): void {
        this.manaDisplayText.setText(`Mana: ⚡ ${this.manaEarnedThreshold}`);
    }

    private showFeedbackText(text: string, color: string, x: number, y: number): void {
        const feedback = this.scene.add.text(x, y, text, {
            fontSize: `${Math.round(24 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50);

        this.scene.tweens.add({
            targets: feedback,
            y: y - 60,
            alpha: 0,
            scale: 1.3,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => feedback.destroy(),
        });
    }

    private showManaCollectedFeedback(amount: number): void {
        const feedbackY = this.config.channelTop + 120;
        const feedback = this.scene.add.text(this.config.problemX, feedbackY, `⚡ +${amount} MANA!`, {
            fontSize: `${Math.round(28 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#44ffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(60);

        this.scene.tweens.add({
            targets: feedback,
            y: feedbackY - 60,
            alpha: 0,
            scale: 1.5,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => feedback.destroy(),
        });
    }

    // ============ CONTEXT SWAPPING ============

    private withPlayerContext(fn: () => void): void {
        if (this.playerState && this.persistProgress) {
            fn();
            return;
        }

        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) {
            fn();
            return;
        }
        const originalPlayer = coop.getActivePlayer();

        try {
            if (this.config.playerIdentifier === 'A') {
                coop.activatePlayerA();
            } else {
                coop.activatePlayerB();
            }
            fn();
        } finally {
            if (originalPlayer === 'A') {
                coop.activatePlayerA();
            } else {
                coop.activatePlayerB();
            }
        }
    }

    private getPlayerState(): PlayerState {
        return this.playerState ?? this.gameState.getPlayer();
    }

    private persistProgressIfNeeded(playerDirty: boolean = false): void {
        if (this.persistProgress) {
            this.persistProgress();
            return;
        }

        if (playerDirty) {
            this.gameState.save();
        }
    }

    // ============ UTILITY ============

    private static shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

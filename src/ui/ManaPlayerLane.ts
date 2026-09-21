import { sfx } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { MathEngine } from '../systems/MathEngine';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { getLearningFrontier } from '../systems/LearningProgress';
import { ensureComparisonChapter } from '../systems/ComparisonLearningSystem';
import { MasterySystem } from '../systems/MasterySystem';
import { ProblemDatabase } from '../systems/ProblemDatabase';
import { MasteryData, MathProblem, MathProblemDef, PlayerState, ProblemDefinition, ProblemStats, SubAtomId } from '../types';
import { formatMathProblem } from '../utils/formatMathProblem';
import { manaForCorrectAnswers } from '../systems/ManaCollectionRewards';

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
    rewardMode?: 'individual' | 'shared';
    resolveKey?: string;
    fontScale?: number;
    titleWidth: number;
    headerDepth: number;
    livesDepth: number;
    manaDepth: number;
    scoreDepth: number;
    previewDepth: number;
    scoreX: number;
    scoreY: number;
    gainX: number;
    gainY: number;
    gainDepth: number;
    buttonDepth: number;
    buttonWidth: number;
    buttonHeight: number;
    onScoreChanged?: () => void;
}

export interface LaneResults {
    correctCount: number;
    problemCount: number;
    wrongCount: number;
}

export interface LanePersistenceContext {
    playerState?: PlayerState;
    masteryData?: MasteryData;
    persistProgress?: () => void;
}

export class ManaPlayerLane {
    private static readonly FIXED_POOL_SIZE = 20;
    private scene: Phaser.Scene;
    private config: PlayerLaneConfig;
    private mathEngine: MathEngine;
    private gameState: GameStateManager;
    private onLaneDead: () => void;
    private playerState: PlayerState | null;
    private masteryData: MasteryData | null;
    private persistProgress: (() => void) | null;

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
    private isGameActive: boolean = false;
    private isResolving: boolean = false;
    private problemStartedAt: number = 0;

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
    private earnedMana = 0;
    private rewardEffect: Phaser.GameObjects.Container | null = null;
    private manaIcon!: Phaser.GameObjects.Image;

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
        this.masteryData = persistence?.masteryData ?? null;
        this.persistProgress = persistence?.persistProgress ?? null;

        this.rowHeight = (config.channelBottom - config.channelTop) / ROW_COUNT;
        // Enter inside the first answer row, below the player's name/HUD.
        // A short reading pause preserves time to choose that first row.
        this.problemStartY = config.channelTop + this.rowHeight / 2;
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
        if (masteryData) ensureComparisonChapter(masteryData);
        const frontierSubAtom = masteryData ? getLearningFrontier(masteryData) : null;
        if (frontierSubAtom) {
            const masteryPool = ManaPlayerLane.buildFrontierSubAtomPool(frontierSubAtom);
            if (masteryPool.length > 0) {
                return masteryPool;
            }
        }

        const levelProblems = mathEngine.getLevelProblemsWithStats()
            .filter(problem => ManaPlayerLane.isSimpleTwoOperand(problem))
            .filter(p => p.answer >= 0)
            .filter(problem => !ManaPlayerLane.hasZero(problem))
            .map(problem => ({
                ...problem,
                stats: problem.stats ?? { correctCount: 0, wrongCount: 0, lastAttempt: 0, mastered: false, manaCollected: 0 },
            } as PoolProblem));

        if (levelProblems.length === 0) {
            return [];
        }

        const rankedProblems = [...levelProblems].sort((a, b) => {
            if (a.stats.wrongCount !== b.stats.wrongCount) {
                return b.stats.wrongCount - a.stats.wrongCount;
            }
            if (a.stats.correctCount !== b.stats.correctCount) {
                return a.stats.correctCount - b.stats.correctCount;
            }
            return a.id.localeCompare(b.id);
        });
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
        const sourceSubAtoms = subAtomId.endsWith('3')
            ? ([`${subAtomId[0]}1`, `${subAtomId[0]}2`] as SubAtomId[])
            : [subAtomId];
        const sourceProblems = sourceSubAtoms
            .flatMap(sourceSubAtom => ProblemDatabase.getInstance().getProblemsForForm(sourceSubAtom, 'result_unknown'))
            .filter(problem => ManaPlayerLane.isSimpleTwoOperand(problem))
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

    private static isSimpleTwoOperand(problem: {
        operator?: string;
        operator2?: string;
        operator3?: string;
        operand3?: number;
        operand4?: number;
        problemType?: string;
    }): boolean {
        return (problem.operator === '+' || problem.operator === '-')
            && problem.operator2 === undefined
            && problem.operator3 === undefined
            && problem.operand3 === undefined
            && problem.operand4 === undefined
            && (!problem.problemType || problem.problemType === 'standard');
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
            return problem.operand1 < 10 && problem.operand2 > 0 && problem.operand2 < 10 && problem.answer > 10;
        }

        return problem.operator === '-'
            && problem.operand1 > 10
            && problem.operand2 > 0
            && problem.operand2 < 10
            && problem.answer < 10;
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

        const title = this.scene.add.text(titleX, titleY, this.config.playerLabel, {
            resolution: 2,
            fontSize: `${Math.round(26 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#d4aa44',
            fontStyle: 'bold',
            stroke: '#1a1008',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(this.config.headerDepth).setName(`manaPlayerName-${this.config.playerIdentifier}`);
        let titleSize = Number.parseInt(String(title.style.fontSize), 10);
        while (title.width > this.config.titleWidth && titleSize > 16) {
            title.setFontSize(--titleSize);
        }
        if (title.width > this.config.titleWidth) title.setWordWrapWidth(this.config.titleWidth).setFontSize(16);

        for (let i = 0; i < MAX_LIVES; i++) {
            const spacing = Math.round(35 * this.fontScale);
            const heart = this.scene.add.text(heartsX + i * spacing, heartsY, '♥', {
                resolution: 2,
                fontSize: `${Math.round(30 * this.fontScale)}px`,
                fontFamily: 'Arial, sans-serif',
                color: '#cc3333',
                stroke: '#1a0808',
                strokeThickness: 2,
            }).setOrigin(0.5).setDepth(this.config.livesDepth);
            this.heartTexts.push(heart);
        }

        this.manaIcon = this.scene.add.image(manaX - 26, manaY, 'mana-icon').setDepth(this.config.manaDepth);
        this.manaIcon.setScale(Math.min(44 / this.manaIcon.width, 44 / this.manaIcon.height));
        this.manaDisplayText = this.scene.add.text(manaX + 10, manaY, '0', {
            resolution: 2,
            fontSize: '30px',
            fontFamily: 'Arial, sans-serif',
            color: '#b8f6ff',
            fontStyle: 'bold',
            stroke: '#0a1a0a',
            strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(this.config.manaDepth).setName(`manaEarned-${this.config.playerIdentifier}`);

        this.scoreText = this.scene.add.text(this.config.scoreX, this.config.scoreY, '✓ 0', {
            resolution: 2,
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
        }).setOrigin(0.5).setDepth(this.config.scoreDepth).setName(`manaCorrect-${this.config.playerIdentifier}`);
    }

    // ============ RESOLVE BUTTON ============

    private createResolveButton(): void {
        const { buttonX, buttonY } = this.config;
        const btnW = this.config.buttonWidth;
        const btnH = this.config.buttonHeight;

        this.resolveButton = this.scene.add.container(buttonX, buttonY);
        this.resolveButton.setDepth(this.config.buttonDepth);

        const bg = this.scene.add.rectangle(0, 0, btnW, btnH, 0x2a1f14)
            .setStrokeStyle(3, 0x8b6914);
        const innerBorder = this.scene.add.rectangle(0, 0, btnW - 10, btnH - 10, 0x000000, 0)
            .setStrokeStyle(1, 0x5a4a2a);
        const label = this.config.resolveKey
            ? `ZASTAV · ${this.config.resolveKey.toUpperCase()}`
            : 'ZASTAV';
        const text = this.scene.add.text(0, 0, label, {
            resolution: 2,
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
        }).setOrigin(0.5).setDepth(this.config.previewDepth).setVisible(false);

        this.nextProblemText = this.scene.add.text(nextPreviewX, nextPreviewY + 5, '', {
            fontSize: `${Math.round(16 * this.fontScale)}px`,
            fontFamily: 'Arial, sans-serif',
            color: '#8a7a5a',
            fontStyle: 'bold',
            stroke: '#0a0806',
            strokeThickness: 2,
            backgroundColor: '#1e1810',
            padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(this.config.previewDepth).setVisible(false);
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
        this.rewardEffect?.destroy(true);
        this.rewardEffect = null;
        this.laneFinishedText?.setVisible(false);
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
            this.manaPool = ManaPlayerLane.buildManaPool(this.mathEngine, this.masteryData ?? undefined);
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
        this.problemStartedAt = Date.now();

        this.createAnswerSlots(this.currentProblem.answer, this.currentProblem.choices);

        const displayText = formatMathProblem(this.currentProblem, 'question');
        this.problemText.setText(displayText);
        this.problemText.setY(this.problemStartY);
        this.problemText.setVisible(true);

        this.scoreText.setText(`✓ ${this.correctCount}`);
        this.updateNextProblemPreview();

        const duration = this.getFallDuration();
        this.isResolving = false;

        this.fallingTween = this.scene.tweens.add({
            targets: this.problemText,
            y: this.problemEndY,
            delay: 750,
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
        sfx(this.scene, 'math.correct');
        highlightBar.setFillStyle(0x228822, 0.4);

        for (const s of this.answerSlots) {
            if (s.isCorrect) {
                s.label.setColor('#44ff44');
            }
        }

        this.withPlayerContext(() => {
            this.recordCurrentProblemResult(true);
        });

        this.correctCount++;
        this.problemCount++;

        this.showFeedbackText('✓', '#44ff44', this.config.problemX, this.problemText.y - 40);
        this.scoreText.setText(`✓ ${this.correctCount}`);
        if (this.config.onScoreChanged) this.config.onScoreChanged();
        else this.setManaReward(manaForCorrectAnswers(this.correctCount));

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
            this.recordCurrentProblemResult(false);
        });
        this.wrongCount++;
        this.problemCount++;

        this.lives--;
        this.updateHearts();

        this.showFeedbackText('×', '#ff4444', this.config.problemX, this.problemText.y - 40);

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

    setManaReward(earnedMana: number): void {
        const added = earnedMana - this.earnedMana;
        this.earnedMana = earnedMana;
        this.manaDisplayText.setText(String(earnedMana));
        if (added > 0) this.showManaGain(added);
    }

    /** Keep the celebration below the falling answers, including the partner's lane. */
    private showManaGain(added: number): void {
        this.rewardEffect?.destroy(true);
        const { gainX, gainY, gainDepth, channelLeft, channelRight, channelTop, channelBottom } = this.config;
        const root = this.scene.add.container(gainX, gainY).setDepth(gainDepth)
            .setName(`manaRewardGain-${this.config.playerIdentifier}`).setData('added', added);
        this.rewardEffect = root;
        const glow = this.scene.add.graphics().fillStyle(0x123b54, 0.94)
            .fillRoundedRect(-100, -37, 200, 74, 30)
            .lineStyle(3, 0x6be9ff, 0.95).strokeRoundedRect(-100, -37, 200, 74, 30);
        const icon = this.scene.add.image(-43, 0, 'mana-icon');
        icon.setScale(Math.min(84 / icon.width, 84 / icon.height));
        const value = this.scene.add.text(5, 0, `+${added}`, { resolution: 2, fontFamily: 'Arial',
            fontSize: '54px', fontStyle: 'bold', color: '#e5fcff', stroke: '#126189', strokeThickness: 4 }).setOrigin(0, 0.5);
        const rim = this.scene.add.graphics().lineStyle(5, 0x5beaff, 1)
            .strokeRect(channelLeft - gainX, channelTop - gainY, channelRight - channelLeft, channelBottom - channelTop);
        root.add([rim, glow, icon, value]);
        const animated: Phaser.GameObjects.GameObject[] = [root, rim, icon];
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5;
            const spark = this.scene.add.circle(Math.cos(angle) * 70, Math.sin(angle) * 20, i % 2 ? 3 : 4, 0xc7f9ff);
            root.add(spark); animated.push(spark);
            this.scene.tweens.add({ targets: spark, x: Math.cos(angle) * 118, y: Math.sin(angle) * 42,
                alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
        }
        this.scene.tweens.add({ targets: icon, scale: icon.scaleX * 1.12, duration: 180, yoyo: true, repeat: 1 });
        this.scene.tweens.add({ targets: rim, alpha: 0, duration: 900 });
        this.scene.tweens.add({ targets: root, alpha: 0, delay: 1050, duration: 300, onComplete: () => root.destroy(true) });
        root.once('destroy', () => {
            animated.forEach(object => this.scene.tweens.killTweensOf(object));
            if (this.rewardEffect === root) this.rewardEffect = null;
        });
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

    private recordCurrentProblemResult(isCorrect: boolean): void {
        if (!isCorrect) sfx(this.scene, 'math.retry');
        const problem = this.currentProblem;
        if (!problem) return;

        this.mathEngine.recordResultForProblem(problem.id, isCorrect);

        if (problem.masteryKey) {
            const masterySystem = MasterySystem.getInstance();
            try {
                masterySystem.setActiveData(this.masteryData);
                masterySystem.recordSolve(
                    problem.masteryKey,
                    isCorrect,
                    Math.max(0, Date.now() - this.problemStartedAt),
                    'mana_collection',
                );
            } finally {
                masterySystem.setActiveData(null);
            }
        }

        // Mastery attempts power Daily Progress, so they must be saved even when
        // the answer did not award mana or mutate another player resource.
        this.persistProgressIfNeeded(Boolean(problem.masteryKey));
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

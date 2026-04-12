import Phaser from 'phaser';
import { EnemyDefinition, MathProblem, ExamType, SubAtomId, BandId, EXAM_CONFIGS } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneBuilder } from '../systems/SceneBuilder';
import { MathBoard } from '../ui/MathBoard';
import { getPlayerSpriteConfig, PlayerSpriteConfig } from '../utils/characterUtils';
import { CATACOMB_BANDS } from '../data/catacombTrials';

type CatacombPhase = 'intro' | 'charging' | 'resolve' | 'victory' | 'defeat';

interface CatacombInitData {
    examType: 'fluency_challenge' | 'mastery_challenge';
    subAtomId: SubAtomId;
    returnScene?: string;
}

export class CatacombTrialScene extends Phaser.Scene {

    // === Config ===
    private examType!: ExamType;
    private subAtomId!: SubAtomId;
    private bandId!: BandId;
    private returnScene: string = 'GuildScene';

    private creatureHp!: number;
    private creatureMaxHp!: number;
    private playerLives!: number;
    private playerMaxLives!: number;
    private chargeTime: number = 15;

    // === Systems ===
    private gameState!: GameStateManager;
    private mathEngine!: MathEngine;
    private sceneBuilder!: SceneBuilder;
    private mathBoard!: MathBoard;

    // === State ===
    private phase: CatacombPhase = 'intro';
    private correctCount: number = 0;
    private wrongCount: number = 0;
    private problemQueue: MathProblem[] = [];
    private usedKeys: Set<string> = new Set();
    private currentProblem: MathProblem | null = null;
    private problemStartTime: number = 0;

    // === Enemy definition ===
    private enemyDef: EnemyDefinition | null = null;
    private enemyAnimPrefix: string = 'wolf';

    // === Player sprite ===
    private playerSpriteConfig!: PlayerSpriteConfig;
    private heroContainer!: Phaser.GameObjects.Container;
    private heroSprite!: Phaser.GameObjects.Sprite;

    // === Creature UI ===
    private creatureSprite!: Phaser.GameObjects.Sprite;
    private creatureContainer!: Phaser.GameObjects.Container;
    private creatureSpawnX: number = 899;
    private creatureSpawnY: number = 484;

    // === HP Bars (BattleScene-style) ===
    private enemyHpFill!: Phaser.GameObjects.Rectangle;
    private enemyHpText!: Phaser.GameObjects.Text;

    // === Player lives ===
    private heartIcons: Phaser.GameObjects.Text[] = [];
    private livesContainer!: Phaser.GameObjects.Container;

    // === Charge bar ===
    private chargeBarBg!: Phaser.GameObjects.Rectangle;
    private chargeBarFill!: Phaser.GameObjects.Rectangle;
    private chargeTimer: Phaser.Time.TimerEvent | null = null;
    private chargeElapsed: number = 0;

    // === Animation definitions (from animations.json via registry) ===
    private animationDefs: Record<string, any> = {};

    // === Intro overlay ===
    private introOverlay!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'CatacombTrialScene' });
    }

    init(data: CatacombInitData): void {
        this.examType = data.examType as ExamType;
        this.subAtomId = data.subAtomId;
        this.bandId = data.subAtomId[0] as BandId;
        this.returnScene = data.returnScene || 'GuildScene';

        const config = EXAM_CONFIGS[this.examType];
        this.creatureMaxHp = config.itemCount;     // 12
        this.creatureHp = this.creatureMaxHp;
        this.playerMaxLives = this.examType === 'fluency_challenge' ? 3 : 2;
        this.playerLives = this.playerMaxLives;
        this.chargeTime = config.timePerItem;      // 15

        this.correctCount = 0;
        this.wrongCount = 0;
        this.usedKeys = new Set();
        this.problemQueue = [];
        this.currentProblem = null;
        this.phase = 'intro';
        this.heartIcons = [];
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.mathEngine = new MathEngine(this.registry);
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('BattleScene');  // Reuse BattleScene layout for ground/terrain

        // Load data
        this.loadEnemyDef();
        this.generateProblems();

        // Get player sprite config
        const player = this.gameState.getPlayer();
        this.playerSpriteConfig = getPlayerSpriteConfig(player.characterType);

        // Load animation definitions from registry (same source as BattleScene)
        this.animationDefs = this.registry.get('animationDefs') || {};

        // Custom mastery battle background (replaces BattleScene's default bg)
        const bandConfig = CATACOMB_BANDS[this.bandId];
        if (this.textures.exists(bandConfig.backgroundKey)) {
            this.add.image(640, 360, bandConfig.backgroundKey).setDepth(-9);
        }

        // Create battle scene elements
        this.createHero();
        this.createCreature();
        this.createEnemyHpBar();
        this.createPlayerLives();
        this.createChargeBar();
        this.createMathBoard();
        this.createIntroOverlay();
    }

    // === SETUP ===

    private loadEnemyDef(): void {
        const bandConfig = CATACOMB_BANDS[this.bandId];
        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        this.enemyDef = enemies?.find(e => e.id === bandConfig.enemyId) || null;

        if (this.enemyDef) {
            this.enemyAnimPrefix = this.enemyDef.animPrefix || 'wolf';
        }
    }

    private generateProblems(): void {
        const masterySystem = MasterySystem.getInstance();
        const problemKeys = masterySystem.generateChallengeProblemKeys(
            this.subAtomId,
            this.creatureMaxHp,
            this.examType
        );

        this.problemQueue = [];
        for (const key of problemKeys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) {
                this.problemQueue.push(problem);
                if (problem.masteryKey) {
                    this.usedKeys.add(problem.masteryKey);
                }
            }
        }
    }

    private generateReplacementProblem(): MathProblem | null {
        const masterySystem = MasterySystem.getInstance();
        const keys = masterySystem.generateChallengeProblemKeys(
            this.subAtomId, 3, this.examType
        );

        for (const key of keys) {
            if (!this.usedKeys.has(key)) {
                const problem = this.mathEngine.generateProblemFromKey(key);
                if (problem) {
                    if (problem.masteryKey) this.usedKeys.add(problem.masteryKey);
                    return problem;
                }
            }
        }

        // Fallback: reuse a key from the pool
        for (const key of keys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) return problem;
        }
        return null;
    }

    // === SCENE CREATION ===

    private createHero(): void {
        // Player spawn matches BattleScene: (301, 454)
        const heroX = 301;
        const heroY = 454;

        this.heroContainer = this.add.container(heroX, heroY).setDepth(2);
        this.heroSprite = this.add.sprite(0, 0, this.playerSpriteConfig.idleTexture);

        // Play idle animation
        const idleAnim = this.playerSpriteConfig.idleAnim;
        if (this.anims.exists(idleAnim)) {
            this.heroSprite.play(idleAnim);
        }

        this.heroContainer.add(this.heroSprite);
    }

    private createCreature(): void {
        const def = this.enemyDef;
        const spriteKey = def?.spriteKey || 'wolves-only-transparent-sheet';
        const scale = def?.scale ?? 1.0;

        // Ensure animations exist
        this.ensureAnimations(spriteKey, this.enemyAnimPrefix);

        this.creatureContainer = this.add.container(this.creatureSpawnX, this.creatureSpawnY).setDepth(2);
        this.creatureSprite = this.add.sprite(0, 0, spriteKey).setScale(scale);
        this.creatureContainer.add(this.creatureSprite);

        // Play idle animation
        const idleKey = `${this.enemyAnimPrefix}-idle`;
        if (this.anims.exists(idleKey)) {
            this.creatureSprite.play(idleKey);
        }
    }

    private ensureAnimations(spriteKey: string, animPrefix: string): void {
        const keys = [
            `${animPrefix}-idle`, `${animPrefix}-hurt`,
            `${animPrefix}-death`, `${animPrefix}-attack-anim`
        ];
        for (const animKey of keys) {
            if (!this.anims.exists(animKey)) {
                this.anims.create({
                    key: animKey,
                    frames: [{ key: spriteKey, frame: 0 }],
                    frameRate: 1,
                    repeat: 0,
                });
            }
        }
    }

    private createEnemyHpBar(): void {
        // HP bar above creature sprite (BattleScene pattern)
        const barWidth = 100;
        const barHeight = 12;
        const hpBarY = -(this.creatureSprite.displayHeight / 2) - 15;

        const hpBarContainer = this.add.container(0, hpBarY);
        const bg = this.add.rectangle(0, 0, barWidth + 4, barHeight + 4, 0x333333).setOrigin(0.5);
        this.enemyHpFill = this.add.rectangle(-barWidth / 2, 0, barWidth, barHeight, 0xcc4444)
            .setOrigin(0, 0.5);
        this.enemyHpText = this.add.text(0, 0, `${this.creatureHp}/${this.creatureMaxHp}`, {
            fontSize: '10px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        hpBarContainer.add([bg, this.enemyHpFill, this.enemyHpText]);
        this.creatureContainer.add(hpBarContainer);
    }

    private createPlayerLives(): void {
        // Lives display near hero, bottom-left area
        this.livesContainer = this.add.container(100, 580).setDepth(50);

        const label = this.add.text(0, -20, 'ŽIVOTY:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.livesContainer.add(label);

        this.heartIcons = [];
        for (let i = 0; i < this.playerMaxLives; i++) {
            const heart = this.add.text(i * 35, 8, '♥', {
                fontSize: '28px',
                color: '#ff4444',
            }).setOrigin(0, 0.5);
            this.livesContainer.add(heart);
            this.heartIcons.push(heart);
        }
    }

    private createChargeBar(): void {
        // Charge bar below the creature HP bar
        const barWidth = 120;
        const barHeight = 8;
        const chargeY = -(this.creatureSprite.displayHeight / 2) - 30;

        const chargeContainer = this.add.container(0, chargeY);
        this.chargeBarBg = this.add.rectangle(0, 0, barWidth + 2, barHeight + 2, 0x222222)
            .setOrigin(0.5);
        this.chargeBarFill = this.add.rectangle(-barWidth / 2, 0, 0, barHeight, 0x44aa44)
            .setOrigin(0, 0.5);

        chargeContainer.add([this.chargeBarBg, this.chargeBarFill]);
        this.creatureContainer.add(chargeContainer);
    }

    private createMathBoard(): void {
        this.mathBoard = new MathBoard(this, (damageDealt, results, timings) => {
            this.onMathBoardComplete(damageDealt, results, timings);
        });

        // Hook wrong answer callback for mastery recording
        this.mathBoard.setOnWrongAnswer((problem, onDismiss) => {
            // Just dismiss immediately — we handle wrong answers ourselves
            onDismiss();
        });
    }

    private createIntroOverlay(): void {
        this.introOverlay = this.add.container(640, 360).setDepth(200);

        const backdrop = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.85);

        const creatureName = this.enemyDef?.name || 'Ztracený Tvor';
        const examLabel = this.examType === 'fluency_challenge' ? 'Zkouška plynulosti' : 'Zkouška mistrovství';
        const livesLabel = this.playerMaxLives === 3 ? '3 životy' : '2 životy';

        const title = this.add.text(0, -180, 'KATAKOMBY', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa88cc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const desc = this.add.text(0, -80, [
            `${examLabel} — ${this.subAtomId}`,
            '',
            `V katakombách je uvězněn ${creatureName}.`,
            `Osvoboď ho správnými odpověďmi!`,
            '',
            `Tvor má ${this.creatureMaxHp} HP • Ty máš ${livesLabel}`,
            `${this.chargeTime}s na každou odpověď`,
        ].join('\n'), {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
            align: 'center',
            lineSpacing: 4,
        }).setOrigin(0.5);

        const btnBg = this.add.rectangle(0, 140, 260, 70, 0x442244)
            .setStrokeStyle(3, 0x886688);
        const btnText = this.add.text(0, 140, 'VSTOUPIT', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        btnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => btnBg.setFillStyle(0x553355))
            .on('pointerout', () => btnBg.setFillStyle(0x442244))
            .on('pointerdown', () => this.startBattle());

        this.tweens.add({
            targets: [btnBg, btnText],
            scaleX: 1.05, scaleY: 1.05,
            duration: 600, yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.introOverlay.add([backdrop, title, desc, btnBg, btnText]);
    }

    // === BATTLE FLOW ===

    private startBattle(): void {
        this.introOverlay.destroy();
        this.presentNextProblem();
    }

    private presentNextProblem(): void {
        if (this.problemQueue.length === 0) {
            this.onVictory();
            return;
        }

        this.currentProblem = this.problemQueue.shift()!;
        this.phase = 'charging';
        this.problemStartTime = Date.now();
        this.chargeElapsed = 0;

        // Show single problem on MathBoard
        this.mathBoard.show([this.currentProblem]);

        // Start charge timer
        this.startChargeTimer();

        // Start creature charge animation
        this.playCreatureCharge();
    }

    private onMathBoardComplete(damageDealt: number, results: boolean[], timings: number[]): void {
        if (this.phase !== 'charging') return;

        this.phase = 'resolve';
        this.stopChargeTimer();

        const isCorrect = results.length > 0 && results[0];
        const responseTimeMs = timings.length > 0 ? timings[0] : 0;

        // Record solve to mastery system
        if (this.currentProblem?.masteryKey) {
            const context = this.examType === 'fluency_challenge' ? 'fluency' : 'mastery_challenge';
            MasterySystem.getInstance().recordSolve(
                this.currentProblem.masteryKey,
                isCorrect,
                responseTimeMs,
                context as any
            );
        }

        if (isCorrect) {
            this.resolveCorrect(responseTimeMs);
        } else {
            this.resolveWrong();
        }
    }

    private onTimeout(): void {
        if (this.phase !== 'charging' || !this.currentProblem) return;

        this.phase = 'resolve';
        this.mathBoard.hide();

        // Record as wrong
        if (this.currentProblem.masteryKey) {
            const context = this.examType === 'fluency_challenge' ? 'fluency' : 'mastery_challenge';
            MasterySystem.getInstance().recordSolve(
                this.currentProblem.masteryKey,
                false,
                this.chargeTime * 1000,
                context as any
            );
        }

        this.resolveWrong();
    }

    // === CHARGE TIMER ===

    private startChargeTimer(): void {
        this.chargeElapsed = 0;
        this.updateChargeBar();

        this.chargeTimer = this.time.addEvent({
            delay: 100,
            callback: this.onChargeTick,
            callbackScope: this,
            loop: true,
        });
    }

    private stopChargeTimer(): void {
        if (this.chargeTimer) {
            this.chargeTimer.remove(false);
            this.chargeTimer = null;
        }
    }

    private onChargeTick(): void {
        if (this.phase !== 'charging') return;

        this.chargeElapsed += 0.1;
        this.updateChargeBar();

        if (this.chargeElapsed >= this.chargeTime) {
            this.stopChargeTimer();
            this.onTimeout();
        }
    }

    private updateChargeBar(): void {
        const progress = Math.min(this.chargeElapsed / this.chargeTime, 1);
        const maxWidth = 120;
        this.chargeBarFill.width = maxWidth * progress;

        // Color: green → yellow → red
        if (progress < 0.33) {
            this.chargeBarFill.setFillStyle(0x44aa44);
        } else if (progress < 0.66) {
            this.chargeBarFill.setFillStyle(0xaaaa44);
        } else {
            this.chargeBarFill.setFillStyle(0xcc4444);
        }

        // Creature shakes more as charge builds
        if (progress > 0.66) {
            const shakeAmount = (progress - 0.66) * 15;
            this.creatureContainer.x = this.creatureSpawnX + (Math.random() - 0.5) * shakeAmount;
        }
    }

    // === CREATURE ANIMATIONS ===

    private playCreatureCharge(): void {
        this.tweens.add({
            targets: this.creatureSprite,
            alpha: { from: 1, to: 0.7 },
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private stopCreatureCharge(): void {
        this.tweens.killTweensOf(this.creatureSprite);
        this.creatureSprite.setAlpha(1);
        this.creatureContainer.x = this.creatureSpawnX;
    }

    private playCreatureAttack(onComplete: () => void): void {
        this.stopCreatureCharge();

        const startX = this.creatureContainer.x;
        const startY = this.creatureContainer.y;
        const targetX = this.heroContainer.x + 50;
        const targetY = this.heroContainer.y;

        // Read movement from animation definitions (same as BattleScene)
        const attackDefKey = `${this.enemyAnimPrefix}-attack-anim`;
        const attackAnim = this.animationDefs[attackDefKey];
        const movement = attackAnim?.movement;
        const moveDuration = movement?.duration || 400;
        const moveEase = movement?.ease || 'Power1';

        this.creatureContainer.setDepth(10);

        // Play attack animation
        if (this.anims.exists(attackDefKey)) {
            this.creatureSprite.play(attackDefKey);
        }

        // X movement
        this.tweens.add({
            targets: this.creatureContainer,
            x: targetX,
            duration: moveDuration,
            ease: moveEase,
        });

        // Y movement based on type (matches BattleScene pattern)
        if (movement?.type === 'jump') {
            const jumpOffsetY = movement.offsetY || -40;
            this.tweens.add({
                targets: this.creatureContainer,
                y: [startY + jumpOffsetY, targetY],
                duration: moveDuration,
                ease: 'Sine.easeInOut',
            });
        } else if (movement?.type === 'bounce') {
            const bounceOffsetY = movement.offsetY || -30;
            this.tweens.add({
                targets: this.creatureContainer,
                y: [startY + bounceOffsetY, targetY],
                duration: moveDuration,
                ease: 'Bounce.easeOut',
            });
        } else {
            this.tweens.add({
                targets: this.creatureContainer,
                y: targetY,
                duration: moveDuration,
                ease: moveEase,
            });
        }

        // After movement: return to spawn (same as BattleScene returnEnemyToPosition)
        this.time.delayedCall(moveDuration + 100, () => {
            const idleKey = `${this.enemyAnimPrefix}-idle`;
            if (this.anims.exists(idleKey)) {
                this.creatureSprite.play(idleKey);
            }

            this.tweens.add({
                targets: this.creatureContainer,
                x: this.creatureSpawnX,
                y: this.creatureSpawnY,
                duration: 300,
                ease: 'Power1',
                onComplete: () => {
                    this.creatureContainer.setDepth(2);
                    onComplete();
                },
            });
        });
    }

    private playHeroAttack(onComplete: () => void): void {
        const startX = this.heroContainer.x;
        const startY = this.heroContainer.y;
        const targetX = this.creatureContainer.x - 50;
        const targetY = this.creatureContainer.y;

        // Read movement from animation definitions (same as BattleScene)
        const attackAnim = this.animationDefs[this.playerSpriteConfig.attackAnim];
        const movement = attackAnim?.movement;
        const jumpDuration = movement?.duration || 400;
        const jumpOffsetY = movement?.offsetY || 0;
        const jumpEase = movement?.ease || 'Power1';
        const returnEase = movement?.returnEase || 'Power2';

        this.heroContainer.setDepth(10);
        this.heroSprite.play(this.playerSpriteConfig.attackAnim);

        // X movement to creature
        this.tweens.add({
            targets: this.heroContainer,
            x: targetX,
            duration: jumpDuration,
            ease: jumpEase,
        });

        // Y movement with jump arc if configured
        if (movement?.type === 'jump' && jumpOffsetY !== 0) {
            this.tweens.add({
                targets: this.heroContainer,
                y: startY + jumpOffsetY,
                duration: jumpDuration / 2,
                ease: jumpEase,
                onComplete: () => {
                    this.tweens.add({
                        targets: this.heroContainer,
                        y: targetY,
                        duration: jumpDuration / 2,
                        ease: returnEase,
                    });
                },
            });
        } else {
            this.tweens.add({
                targets: this.heroContainer,
                y: targetY,
                duration: jumpDuration,
                ease: jumpEase,
            });
        }

        // After reaching creature: show damage, then return
        this.time.delayedCall(jumpDuration, () => {
            // Floating damage number
            const dmgText = this.add.text(
                this.creatureContainer.x, this.creatureContainer.y - 50, '-1',
                {
                    fontSize: '28px', fontFamily: 'Arial, sans-serif',
                    color: '#ff4444', fontStyle: 'bold',
                    stroke: '#000000', strokeThickness: 3,
                }
            ).setOrigin(0.5).setDepth(20);

            this.tweens.add({
                targets: dmgText,
                y: dmgText.y - 40, alpha: 0,
                duration: 800,
                onComplete: () => dmgText.destroy(),
            });

            // Creature hurt effect
            this.creatureSprite.setTint(0xff0000);
            this.time.delayedCall(100, () => this.creatureSprite.clearTint());

            // Wait for hero attack animation to finish, then return
            this.heroSprite.once('animationcomplete', () => {
                this.heroSprite.play(this.playerSpriteConfig.idleAnim);

                // Return with jump arc (same as BattleScene lines 2458-2491)
                if (movement?.type === 'jump' && jumpOffsetY !== 0) {
                    this.tweens.add({
                        targets: this.heroContainer,
                        y: targetY + jumpOffsetY,
                        duration: 200,
                        ease: jumpEase,
                        onComplete: () => {
                            this.tweens.add({
                                targets: this.heroContainer,
                                y: startY,
                                duration: 200,
                                ease: returnEase,
                            });
                        },
                    });
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => {
                            this.heroContainer.setDepth(2);
                            onComplete();
                        },
                    });
                } else {
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX, y: startY,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => {
                            this.heroContainer.setDepth(2);
                            onComplete();
                        },
                    });
                }
            });
        });
    }

    private playCreatureHurt(onComplete: () => void): void {
        this.stopCreatureCharge();

        const hurtKey = `${this.enemyAnimPrefix}-hurt`;
        if (this.anims.exists(hurtKey)) {
            this.creatureSprite.play(hurtKey);
        }

        this.creatureSprite.setTint(0xff0000);
        this.time.delayedCall(100, () => {
            this.creatureSprite.clearTint();
        });
        this.creatureSprite.once('animationcomplete', () => {
            const idleKey = `${this.enemyAnimPrefix}-idle`;
            if (this.anims.exists(idleKey)) {
                this.creatureSprite.play(idleKey);
            }
            onComplete();
        });
    }

    private playCreatureDeath(onComplete: () => void): void {
        this.stopCreatureCharge();

        const deathKey = `${this.enemyAnimPrefix}-death`;
        if (this.anims.exists(deathKey)) {
            this.creatureSprite.play(deathKey);
        }

        this.tweens.add({
            targets: this.creatureContainer,
            alpha: 0,
            duration: 1500,
            ease: 'Power2',
            onComplete,
        });
    }

    // === RESOLVE ===

    private resolveCorrect(responseTimeMs: number): void {
        this.correctCount++;
        this.creatureHp--;
        this.updateHpBar();

        // Speed bonus visual only
        if (responseTimeMs < 3000) {
            this.showFloatingText('⚡ RYCHLE!', '#ffff44', this.creatureContainer.x, this.creatureContainer.y - 80);
        }

        // Hero attacks creature
        this.playHeroAttack(() => {
            if (this.creatureHp <= 0) {
                this.playCreatureDeath(() => this.onVictory());
            } else {
                this.playCreatureHurt(() => {
                    this.time.delayedCall(300, () => this.presentNextProblem());
                });
            }
        });
    }

    private resolveWrong(): void {
        this.wrongCount++;
        this.playerLives--;
        this.breakHeart();

        this.showFloatingText('ŠPATNĚ!', '#ff4444', 640, 300);

        // Creature attacks hero
        this.playCreatureAttack(() => {
            this.cameras.main.shake(200, 0.01);

            // Flash hero red
            this.heroSprite.setTint(0xff6666);
            this.time.delayedCall(300, () => this.heroSprite.clearTint());

            if (this.playerLives <= 0) {
                this.time.delayedCall(500, () => this.onDefeat());
            } else {
                const replacement = this.generateReplacementProblem();
                if (replacement) {
                    this.problemQueue.push(replacement);
                }
                this.time.delayedCall(500, () => this.presentNextProblem());
            }
        });
    }

    // === UI UPDATES ===

    private updateHpBar(): void {
        const progress = this.creatureHp / this.creatureMaxHp;
        this.enemyHpFill.width = 100 * progress;
        this.enemyHpText.setText(`${this.creatureHp}/${this.creatureMaxHp}`);
    }

    private breakHeart(): void {
        const heartIndex = this.playerLives;  // Already decremented
        if (heartIndex >= 0 && heartIndex < this.heartIcons.length) {
            const heart = this.heartIcons[heartIndex];
            this.tweens.add({
                targets: heart,
                scaleX: 1.5, scaleY: 1.5, alpha: 0,
                duration: 400, ease: 'Power2',
                onComplete: () => {
                    heart.setText('♡');
                    heart.setAlpha(0.3);
                    heart.setScale(1);
                },
            });
        }
    }

    private showFloatingText(text: string, color: string, x: number, y: number): void {
        const feedback = this.add.text(x, y, text, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color,
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(150);

        this.tweens.add({
            targets: feedback,
            y: y - 50,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => feedback.destroy(),
        });
    }

    // === VICTORY / DEFEAT ===

    private onVictory(): void {
        this.phase = 'victory';
        this.mathBoard.hide();

        const masterySystem = MasterySystem.getInstance();
        const player = this.gameState.getPlayer();
        const bandConfig = CATACOMB_BANDS[this.bandId];

        // Apply mastery result (correctCount = 12 always on victory)
        let result: { passed: boolean; stateChanged: boolean };
        if (this.examType === 'fluency_challenge') {
            result = masterySystem.applyFluencyResult(this.subAtomId, this.creatureMaxHp);
        } else {
            result = masterySystem.applyMasteryResult(this.subAtomId, this.creatureMaxHp);
        }

        // Pet unlock (first fluency win in band)
        let petUnlocked = false;
        if (!player.unlockedPets.includes(bandConfig.enemyId)) {
            player.unlockedPets.push(bandConfig.enemyId);
            petUnlocked = true;
        }

        // Pet upgrade (mastery wins)
        let petUpgraded = false;
        if (this.examType === 'mastery_challenge') {
            player.catacombPetUpgrades ??= {};
            const current = player.catacombPetUpgrades[this.bandId] ?? 0;
            if (current < 4) {
                player.catacombPetUpgrades[this.bandId] = current + 1;
                petUpgraded = true;
            }
        }

        this.gameState.save();

        const lines: string[] = ['TVOR OSVOBOZEN!', ''];
        if (petUnlocked) {
            lines.push(`${this.enemyDef?.name || 'Tvor'} je nyní volný!`);
            lines.push('Navštiv Pythii pro jeho připoutání.');
        }
        if (petUpgraded) {
            const upgrades = player.catacombPetUpgrades![this.bandId];
            lines.push(`Mazlíček vylepšen! (+${upgrades} útok)`);
        }
        if (result.stateChanged) {
            const newState = this.examType === 'fluency_challenge' ? 'Plynulost' : 'Mistrovství';
            lines.push(`${this.subAtomId}: ${newState} dosažena!`);
        }

        this.showEndScreen(lines.join('\n'), 0x44aa44);
    }

    private onDefeat(): void {
        this.phase = 'defeat';
        this.mathBoard.hide();

        const masterySystem = MasterySystem.getInstance();

        if (this.examType === 'fluency_challenge') {
            masterySystem.applyFluencyResult(this.subAtomId, 0);
        } else {
            masterySystem.applyMasteryResult(this.subAtomId, 0);
        }

        this.gameState.save();

        this.showEndScreen(
            'PORÁŽKA...\n\nTvor uniká hlouběji do katakomb.\nProcvič si příklady a zkus to znovu!',
            0xcc4444
        );
    }

    private showEndScreen(message: string, titleColor: number): void {
        const overlay = this.add.container(640, 360).setDepth(300);

        const backdrop = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.85);
        const colorStr = `#${titleColor.toString(16).padStart(6, '0')}`;
        const text = this.add.text(0, -60, message, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: colorStr,
            align: 'center',
            lineSpacing: 6,
        }).setOrigin(0.5);

        const scoreText = this.add.text(0, 80, `Správně: ${this.correctCount}  |  Chybně: ${this.wrongCount}`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
        }).setOrigin(0.5);

        const btnBg = this.add.rectangle(0, 150, 220, 60, 0x444466)
            .setStrokeStyle(3, 0x6666aa);
        const btnText = this.add.text(0, 150, 'POKRAČOVAT', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        btnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => btnBg.setFillStyle(0x555588))
            .on('pointerout', () => btnBg.setFillStyle(0x444466))
            .on('pointerdown', () => this.scene.start(this.returnScene));

        overlay.add([backdrop, text, scoreText, btnBg, btnText]);
    }
}

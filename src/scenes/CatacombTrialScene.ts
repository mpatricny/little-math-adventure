import Phaser from 'phaser';
import { EnemyDefinition, PetDefinition, MathProblem, ExamType, SubAtomId, BandId, EXAM_CONFIGS } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CatacombTrialUI } from '../ui/CatacombTrialUI';
import { getPlayerSpriteConfig, PlayerSpriteConfig } from '../utils/characterUtils';
import { awardCatacombFoxVictory, getPetAttackPower } from '../systems/CatacombPetProgress';
import { CATACOMB_BANDS } from '../data/catacombTrials';
import { BattleActorStatusHud } from '../ui/BattleActorStatusHud';
import { getExamPresentation } from '../ui/ExamPresentation';

type CatacombPhase = 'intro' | 'charging' | 'resolve' | 'victory' | 'defeat';

interface CatacombInitData {
    examType: 'fluency_challenge' | 'mastery_challenge';
    subAtomId: SubAtomId | 'comparison_symbols';
    returnScene?: string;
}

export class CatacombTrialScene extends Phaser.Scene {

    // === Config ===
    private examType!: ExamType;
    private subAtomId!: SubAtomId | 'comparison_symbols';
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
    private mathBoard!: CatacombTrialUI;
    private timerLabel!: Phaser.GameObjects.Text;

    // === State ===
    private phase: CatacombPhase = 'intro';
    private correctCount: number = 0;
    private wrongCount: number = 0;
    private problemQueue: MathProblem[] = [];
    private currentProblem: MathProblem | null = null;

    // === Enemy definition ===
    private enemyDef: EnemyDefinition | null = null;
    private enemyAnimPrefix: string = 'rune-fox';

    // === Player sprite ===
    private playerSpriteConfig!: PlayerSpriteConfig;
    private heroContainer!: Phaser.GameObjects.Container;
    private heroSprite!: Phaser.GameObjects.Sprite;

    // === Creature UI ===
    private creatureSprite!: Phaser.GameObjects.Sprite;
    private creatureContainer!: Phaser.GameObjects.Container;
    private creatureSpawnX: number = 899;
    private creatureSpawnY: number = 484;

    // === Actor-bound creature status ===
    private enemyHpBar!: BattleActorStatusHud;

    // === Player lives ===
    private heartIcons: Phaser.GameObjects.Text[] = [];
    private livesContainer!: Phaser.GameObjects.Container;

    // === Charge bar ===
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
        this.bandId = data.subAtomId === 'comparison_symbols' ? 'A' : data.subAtomId[0] as BandId;
        this.returnScene = data.returnScene || 'GuildScene';

        const config = EXAM_CONFIGS[this.examType];
        this.creatureMaxHp = config.itemCount;
        this.creatureHp = this.creatureMaxHp;
        const passThreshold = config.passThreshold ?? config.itemCount;
        this.playerMaxLives = config.itemCount - passThreshold + 1;
        this.playerLives = this.playerMaxLives;
        this.chargeTime = config.timePerItem;

        this.correctCount = 0;
        this.wrongCount = 0;
        this.problemQueue = [];
        this.currentProblem = null;
        this.phase = 'intro';
        this.heartIcons = [];
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.mathEngine = new MathEngine(this.registry);
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('CatacombTrialScene');

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
            const background = this.sceneBuilder.get<Phaser.GameObjects.Image>('catacombBattleBackground')!;
            background.setTexture(bandConfig.backgroundKey);
            const layout = this.sceneBuilder.getElementDef('catacombBattleBackground')!;
            background.setScale(Math.max(layout.width! / background.width, layout.height! / background.height));
        }

        // Create battle scene elements
        this.createHero();
        this.createCreature();
        this.createEnemyHpBar();
        this.createPlayerLives();
        this.createChargeBar();
        this.createMathBoard();
        this.createIntroOverlay();
        this.events.once('shutdown', () => this.stopChargeTimer());
    }

    // === SETUP ===

    private loadEnemyDef(): void {
        const bandConfig = CATACOMB_BANDS[this.bandId];
        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        this.enemyDef = enemies?.find(e => e.id === bandConfig.enemyId) || null;

        if (this.enemyDef) {
            this.enemyAnimPrefix = this.enemyDef.animPrefix || 'rune-fox';
        }
    }

    private generateProblems(): void {
        const masterySystem = MasterySystem.getInstance();
        if (this.subAtomId === 'comparison_symbols') {
            this.problemQueue = masterySystem.generateComparisonExamProblems(this.creatureMaxHp);
            return;
        }
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
            }
        }
    }

    // === SCENE CREATION ===

    private createHero(): void {
        // Player spawn matches BattleScene: (301, 454)
        const spawn = this.sceneBuilder.getSpawnPoints()?.player;
        const heroX = spawn?.x ?? 301;
        const heroY = spawn?.y ?? 380;

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
        const spawn = this.sceneBuilder.getSpawnPoints()!.enemies[0];
        this.creatureSpawnX = spawn.x;
        this.creatureSpawnY = spawn.y;
        const def = this.enemyDef;
        const spriteKey = def?.spriteKey || 'rune-fox-sheet';
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
            // A registered animation can still have zero frames after a texture
            // load failure. Phaser's play() then crashes reading frame.duration.
            const existing = this.anims.get(animKey);
            if (existing && existing.frames.length === 0) {
                this.anims.remove(animKey);
            }
            if (!this.textures.exists(spriteKey) || !this.textures.get(spriteKey).has(0)) continue;
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
        const authored = this.sceneBuilder.get<Phaser.GameObjects.Image>('catacombCreatureStatusHost');
        const hostX = authored?.x ?? this.creatureSpawnX;
        const hostY = authored?.y ?? this.creatureSpawnY - 121;
        const depth = authored?.depth ?? 80;
        const frameWidth = authored?.displayWidth || 118;
        const frameHeight = authored?.displayHeight || 28;
        authored?.destroy();
        this.enemyHpBar = new BattleActorStatusHud(this, {
            anchor: this.creatureContainer,
            sprite: this.creatureSprite,
            x: hostX,
            y: hostY,
            depth,
            offsetX: hostX - this.creatureSpawnX,
            offsetY: hostY - this.creatureSpawnY,
            referenceDisplayHeight: 200,
            kind: 'enemy',
            hp: this.creatureHp,
            maxHp: this.creatureMaxHp,
            color: 0xf05b64,
            frameWidth,
            frameHeight,
            trackWidth: 86,
            trackHeight: 7,
            name: 'catacombCreatureStatus',
        });
    }

    private createPlayerLives(): void {
        // Lives display near hero, bottom-left area
        const host=this.sceneBuilder.get<Phaser.GameObjects.Container>('catacombLivesHost')!;
        this.livesContainer = this.add.container(host.x-70, host.y).setDepth(host.depth);

        const label = this.add.text(0, -20, 'ŽIVOTY:', {
            resolution: 2, fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.livesContainer.add(label);

        this.heartIcons = [];
        for (let i = 0; i < this.playerMaxLives; i++) {
            const heart = this.add.text(i * 35, 8, '♥', {
                resolution: 2, fontSize: '28px',
                color: '#ff4444',
            }).setOrigin(0, 0.5);
            this.livesContainer.add(heart);
            this.heartIcons.push(heart);
        }
    }

    private createChargeBar(): void {
        const h=this.sceneBuilder.get<Phaser.GameObjects.Container>('catacombTimerHost')!;
        const def=this.sceneBuilder.getElementDef('catacombTimerHost')!;
        const label=this.sceneBuilder.get<Phaser.GameObjects.Container>('catacombTimerLabel')!;
        this.timerLabel=this.add.text(label.x,label.y,`⏳ ${this.chargeTime} s`,{
            resolution:2,fontFamily:'Georgia, serif',fontSize:'14px',color:'#d6edf0',stroke:'#07111d',strokeThickness:4,
        }).setOrigin(0.5).setDepth(label.depth);
        this.add.rectangle(h.x,h.y,def.width!,def.height!,0x142c38).setStrokeStyle(2,0xb79a65).setDepth(h.depth);
        this.chargeBarFill=this.add.rectangle(h.x-def.width!/2,h.y,0,def.height!-4,0x74c7ce).setOrigin(0,0.5).setDepth(h.depth+1);
    }

    private createMathBoard(): void {
        this.mathBoard = new CatacombTrialUI(this, this.sceneBuilder, (damage, results, timings) =>
            this.onMathBoardComplete(damage, results, timings));
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>('catacombHeadingHost')!;
        this.add.text(host.x, host.y, 'KATAKOMBY · RUNOVÁ LIŠKA', {
            resolution: 2, fontFamily: 'Georgia, serif', fontSize: '23px', color: '#ffe5af',
            stroke: '#07111d', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(host.depth);
    }

    private createIntroOverlay(): void {
        const identity = getExamPresentation(this.subAtomId, this.examType);
        this.introOverlay = this.mathBoard.showPanel({
            title: 'Osvoboď lišku', subtitle: identity.title, subtitleFontSize: 24,
            body: '✓ → ⚔\n× → −♥', bodyFontSize: 40,
            stats: `✓ ${EXAM_CONFIGS[this.examType].passThreshold}/${this.creatureMaxHp}     ♥ ${this.playerMaxLives}     ⏳ ${this.chargeTime} s`, statsFontSize: 26,
            primary: 'ZAČÍT', onPrimary: () => this.startBattle(),
            secondary: 'ZPĚT', onSecondary: () => this.scene.start(this.returnScene),
        });
    }

    // === BATTLE FLOW ===

    private startBattle(): void {
        this.introOverlay.destroy();
        this.presentNextProblem();
    }

    private presentNextProblem(): void {
        if (this.problemQueue.length === 0) {
            const passThreshold = EXAM_CONFIGS[this.examType].passThreshold ?? this.creatureMaxHp;
            if (this.correctCount >= passThreshold) {
                this.creatureHp = 0;
                this.updateHpBar();
                this.playCreatureDeath(() => this.onVictory());
            } else {
                this.onDefeat();
            }
            return;
        }

        this.currentProblem = this.problemQueue.shift()!;
        this.phase = 'charging';
        this.chargeElapsed = 0;

        // Show single problem on MathBoard
        this.mathBoard.show([this.currentProblem]);

        // Start charge timer
        this.startChargeTimer();

        // Start creature charge animation
        this.playCreatureCharge();
    }

    private onMathBoardComplete(_damageDealt: number, results: boolean[], timings: number[]): void {
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
        if (this.currentProblem?.comparisonMeta) {
            MasterySystem.getInstance().recordComparisonSolve(this.currentProblem, isCorrect, responseTimeMs, false);
        }
        this.gameState.save();

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
        if (this.currentProblem.comparisonMeta) {
            MasterySystem.getInstance().recordComparisonSolve(this.currentProblem, false, this.chargeTime * 1000, false);
        }
        this.gameState.save();

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
        const maxWidth = this.sceneBuilder.getElementDef('catacombTimerHost')!.width!;
        this.timerLabel.setText(`⏳ ${Math.max(0, this.chargeTime - this.chargeElapsed).toFixed(1)} s`);
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

    private playHeroAttack(onImpact: () => void, onComplete: () => void): void {
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
            // Match BattleScene: HP and the target's reaction belong to impact,
            // not to the later completion of the hero's return movement.
            onImpact();
            // Floating damage number
            const dmgText = this.add.text(
                this.creatureContainer.x, this.creatureContainer.y - 50, '-1',
                {
                    resolution: 2, fontSize: '28px', fontFamily: 'Arial, sans-serif',
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

        // Speed bonus visual only
        if (responseTimeMs < 3000) {
            this.showFloatingText('⚡ RYCHLE!', '#ffff44', this.creatureContainer.x, this.creatureContainer.y - 80);
        }

        // The attack and the creature reaction run concurrently after impact.
        // Advance only once both the hero has returned and the reaction is done.
        let heroReturned = false;
        let reactionComplete = false;
        const finish = (): void => {
            if (!heroReturned || !reactionComplete) return;
            if (this.creatureHp <= 0) this.onVictory();
            else this.time.delayedCall(300, () => this.presentNextProblem());
        };
        const onReactionComplete = (): void => {
            reactionComplete = true;
            finish();
        };

        this.playHeroAttack(() => {
            this.creatureHp--;
            this.updateHpBar();
            if (this.creatureHp <= 0) {
                this.playCreatureDeath(onReactionComplete);
            } else {
                this.playCreatureHurt(onReactionComplete);
            }
        }, () => {
            heroReturned = true;
            finish();
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
                this.time.delayedCall(500, () => this.presentNextProblem());
            }
        });
    }

    // === UI UPDATES ===

    private updateHpBar(): void {
        this.enemyHpBar.setHp(this.creatureHp, this.creatureMaxHp);
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
        if (this.phase === 'victory' || this.phase === 'defeat') return;
        this.phase = 'victory';
        this.mathBoard.hide();

        const masterySystem = MasterySystem.getInstance();
        const player = this.gameState.getPlayer();
        const bandConfig = CATACOMB_BANDS[this.bandId];

        // Apply the actual fixed-length trial score against the configured threshold.
        let result: { passed: boolean; stateChanged: boolean };
        if (this.examType === 'fluency_challenge') {
            result = masterySystem.applyFluencyResult(this.subAtomId, this.correctCount);
        } else {
            result = masterySystem.applyMasteryResult(this.subAtomId, this.correctCount);
        }

        if (!result.passed) {
            this.phase = 'defeat';
            this.gameState.save();
            this.showEndScreen();
            return;
        }

        // Rescue first at catalog strength. Only later wins train the fox.
        const fox = (this.cache.json.get('pets') as PetDefinition[]).find(pet => pet.id === bandConfig.petId)!;
        const attackBefore = getPetAttackPower(fox, player);
        const { petUnlocked } = awardCatacombFoxVictory(player);

        this.gameState.save();
        this.showEndScreen({ attackBefore, attackAfter: getPetAttackPower(fox, player), petUnlocked });
    }

    private onDefeat(): void {
        if (this.phase === 'victory' || this.phase === 'defeat') return;
        this.phase = 'defeat';
        this.mathBoard.hide();

        const masterySystem = MasterySystem.getInstance();

        if (this.examType === 'fluency_challenge') {
            masterySystem.applyFluencyResult(this.subAtomId, this.correctCount);
        } else {
            masterySystem.applyMasteryResult(this.subAtomId, this.correctCount);
        }

        this.gameState.save();

        this.showEndScreen();
    }

    private showEndScreen(reward?: { attackBefore: number; attackAfter: number; petUnlocked: boolean }): void {
        const won = this.phase === 'victory';
        this.mathBoard.showPanel({
            title: won ? reward?.petUnlocked ? 'Liška zachráněna!' : 'Liška zesílila!' : 'Zkus to znovu',
            subtitle: reward?.petUnlocked ? 'U Pythie' : 'Runová liška',
            body: reward ? reward.petUnlocked ? `Síla ${reward.attackAfter}` : `Útok +1\n${reward.attackBefore} → ${reward.attackAfter}` : '',
            bodyFontSize: 28, frame: won ? 30 : 0,
            stats: `✓ ${this.correctCount}     × ${this.wrongCount}`, statsFontSize: 24,
            primary: 'ZPĚT', onPrimary: () => this.scene.start(this.returnScene),
            secondary: won ? undefined : 'ZNOVU',
            onSecondary: won ? undefined : () => this.scene.restart({examType:this.examType,subAtomId:this.subAtomId,returnScene:this.returnScene}),
        });
    }
}

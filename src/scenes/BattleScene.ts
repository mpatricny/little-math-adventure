import Phaser from 'phaser';
import { BattleState, BattlePhase, BattleEnemy, EnemyDefinition, ItemDefinition, PetDefinition, MathProblem, Crystal, CrystalTier } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem, createInitialTownProgress } from '../systems/ProgressionSystem';
import { CrystalSystem } from '../systems/CrystalSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig, PlayerSpriteConfig } from '../utils/characterUtils';
import { PauseMenu } from '../ui/PauseMenu';

// HP Bar component attached to character
interface HpBar {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
    // Character containers (sprite + HP bar)
    private heroContainer!: Phaser.GameObjects.Container;
    private enemyContainers: Phaser.GameObjects.Container[] = [];
    private hero!: Phaser.GameObjects.Sprite;
    private enemies: Phaser.GameObjects.Sprite[] = [];
    private heroHpBar!: HpBar;
    private enemyHpBars: HpBar[] = [];

    // UI Components
    private mathBoard!: MathBoard;
    private attackButton!: Phaser.GameObjects.Container;
    private potionButton!: Phaser.GameObjects.Container;
    private blockUI!: Phaser.GameObjects.Container;
    private blockDamageText!: Phaser.GameObjects.Text;
    private blockTimerText!: Phaser.GameObjects.Text;
    private blockAttemptsText!: Phaser.GameObjects.Text;
    private targetIndicator!: Phaser.GameObjects.Image;

    // Systems
    private mathEngine!: MathEngine;
    private gameState!: GameStateManager;
    private sceneBuilder!: SceneBuilder;

    // State
    private battleState!: BattleState;
    private enemyDefs: EnemyDefinition[] = [];
    private enemyAnimPrefixes: string[] = [];

    // Block state
    private isBlockPhase: boolean = false;
    private blockCorrectCount: number = 0;
    private blockMaxAttempts: number = 0;
    private blockAttemptsMade: number = 0;
    private blockTimeRemaining: number = 0;
    private blockTimerEvent: Phaser.Time.TimerEvent | null = null;
    private pendingDamage: number = 0;
    private mathBoardContext: 'attack' | 'block' | null = null;

    // Multi-enemy attack tracking
    private currentAttackingEnemyIndex: number = 0;

    // Animation definitions with movement data
    private animationDefs: Record<string, any> = {};

    // Player character sprite configuration
    private playerSpriteConfig!: PlayerSpriteConfig;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Pause menu
    private pauseMenu!: PauseMenu;

    // Cached spawn points for battle positioning
    private cachedSpawnPoints: {
        player: { x: number; y: number };
        pet: { x: number; y: number };
        enemies: { x: number; y: number }[];
    } | null = null;

    // Pet companion
    private petContainer: Phaser.GameObjects.Container | null = null;
    private petSprite: Phaser.GameObjects.Sprite | null = null;
    private equippedPetDef: PetDefinition | null = null;

    // Pet turn system
    private petTargetIndex: number = 0;
    private petMathProblem: MathProblem | null = null;
    private petAttackButton!: Phaser.GameObjects.Container;
    private petTargetIndicator: Phaser.GameObjects.Image | null = null;
    private petTargetIndicatorTween: Phaser.Tweens.Tween | null = null;

    // Active character highlighting
    private activeHighlight: Phaser.GameObjects.Graphics | null = null;
    private activeHighlightTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super({ key: 'BattleScene' });
    }

    // Arena mode data
    private fromArena: boolean = false;
    private arenaLevel: number = 1;
    private arenaWave: number = 0;
    private waveWrongAnswerCount: number = 0;

    // Enemy attack tween tracking for mid-attack pause
    private enemyAttackTweens: Phaser.Tweens.Tween[] = [];
    private blockPhaseResumeCallback?: () => void;
    private enemyAttackStartPosition: { x: number; y: number } = { x: 0, y: 0 };

    // Journey mode data
    private journeyMode: boolean = false;
    private returnScene: string = 'TownScene';
    private returnData: Record<string, unknown> = {};
    private backgroundKey: string | null = null;

    // Boss battle data
    private isBoss: boolean = false;
    private bossPhases: {
        hp: number;
        atk: number;
        name: string;
        nameCs: string;
        mathType?: string;
        mathDifficulty?: number;
        ability?: string | null;
        healPercent?: number;
        transitionAnim?: string;
        idleAnim?: string;
        attackAnim?: string;
        tint?: string;
        deathSequence?: string[];
    }[] = [];
    private currentBossPhase: number = 0;
    private bossPhaseHealPlayer: number = 0;

    // Boss phase animation overrides (applied per-phase)
    private bossPhaseAnimOverrides: {
        idleAnim?: string;
        attackAnim?: string;
        tint?: number;
        deathSequence?: string[];
    } = {};

    // Boss ability tracking
    private currentPhaseAbility: string | null = null;
    private lastAnswerCorrect: boolean = true;
    private lastStandTriggered: boolean = false;

    init(data: { 
        enemyId?: string; 
        enemyDefs?: EnemyDefinition[]; 
        fromArena?: boolean; 
        arenaLevel?: number; 
        wave?: number;
        mode?: string;
        returnScene?: string;
        returnData?: Record<string, unknown>;
        backgroundKey?: string;
        enemy?: string;
    }): void {
        // Get global game state
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();

        // Store journey mode data
        this.journeyMode = data.mode === 'journey';
        this.returnScene = data.returnScene || 'TownScene';
        this.returnData = data.returnData || {};
        this.backgroundKey = data.backgroundKey || null;

        // Store arena data if coming from arena
        this.fromArena = data.fromArena || false;
        this.arenaLevel = data.arenaLevel || 1;
        this.arenaWave = data.wave || 0;
        this.waveWrongAnswerCount = 0;

        // Reset boss state (in case previous battle was a boss)
        this.isBoss = false;
        this.bossPhases = [];
        this.currentBossPhase = 0;
        this.bossPhaseHealPlayer = 0;
        this.bossPhaseAnimOverrides = {};

        // Get enemy data - either from arena or single enemy
        if (data.enemyDefs && data.enemyDefs.length > 0) {
            this.enemyDefs = data.enemyDefs;
        } else {
            const enemyId = data.enemyId || data.enemy || 'slime_green';
            const useForestEnemy = data.useForestEnemy === true;

            // When launched from forest, check forest enemies first (they have full boss phase data)
            // Otherwise, check main enemies list first for backward compatibility
            const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
            let enemy: EnemyDefinition | undefined;

            if (!useForestEnemy) {
                enemy = enemies?.find(e => e.id === enemyId);
            }

            // Try forest enemies
            if (!enemy && this.cache.json.has('forestEnemies')) {
                interface ForestEnemy {
                    id: string;
                    name: string;
                    nameCs?: string;
                    hp: number;
                    atk?: number;
                    xp?: number;
                    goldMin?: number;
                    goldMax?: number;
                    spriteKey: string;
                    animPrefix?: string;
                    scale?: number;
                    battleOffsetY?: number;
                    // Boss properties
                    isBoss?: boolean;
                    phases?: {
                        hp: number;
                        atk: number;
                        name: string;
                        nameCs: string;
                        mathType?: string;
                        mathDifficulty?: number;
                        ability?: string | null;
                        healPercent?: number;
                        transitionAnim?: string;
                        idleAnim?: string;
                        attackAnim?: string;
                        tint?: string;
                        deathSequence?: string[];
                    }[];
                    phaseHealPlayer?: number;
                }
                const forestData = this.cache.json.get('forestEnemies') as { enemies: Record<string, ForestEnemy> };
                const forestEnemy = forestData?.enemies?.[enemyId];
                if (forestEnemy) {
                    // Check if this is a boss with phases
                    if (forestEnemy.isBoss && forestEnemy.phases && forestEnemy.phases.length > 0) {
                        this.isBoss = true;
                        this.bossPhases = forestEnemy.phases;
                        this.currentBossPhase = 0;
                        this.bossPhaseHealPlayer = forestEnemy.phaseHealPlayer || 0;

                        // Initialize boss ability tracking for first phase
                        const phase1 = forestEnemy.phases[0];
                        this.currentPhaseAbility = phase1.ability || null;
                        this.lastAnswerCorrect = true;
                        this.lastStandTriggered = false;

                        // Apply phase 1 animation overrides
                        this.applyBossPhaseOverrides(phase1);

                        console.log(`[BattleScene] Boss battle! ${forestEnemy.phases.length} phases. Starting phase: ${phase1.nameCs}, ability: ${this.currentPhaseAbility}`);

                        const goldMin = forestEnemy.goldMin || 5;
                        const goldMax = forestEnemy.goldMax || goldMin + 5;
                        enemy = {
                            id: forestEnemy.id,
                            name: `${forestEnemy.nameCs || forestEnemy.name} - ${phase1.nameCs}`,
                            hp: phase1.hp,
                            attack: phase1.atk,
                            defense: 0,
                            xp: forestEnemy.xp || 10,
                            goldReward: [goldMin, goldMax],
                            spriteKey: forestEnemy.spriteKey,
                            animPrefix: forestEnemy.animPrefix || forestEnemy.spriteKey?.replace('-sheet', '') || 'slime',
                            scale: forestEnemy.scale,
                            battleOffsetY: forestEnemy.battleOffsetY
                        } as unknown as EnemyDefinition;
                    } else {
                        // Regular forest enemy
                        const goldMin = forestEnemy.goldMin || 5;
                        const goldMax = forestEnemy.goldMax || goldMin + 5;
                        enemy = {
                            id: forestEnemy.id,
                            name: forestEnemy.nameCs || forestEnemy.name,
                            hp: forestEnemy.hp,
                            attack: forestEnemy.atk || 3,
                            defense: 0,
                            xp: forestEnemy.xp || 10,
                            goldReward: [goldMin, goldMax],
                            spriteKey: forestEnemy.spriteKey,
                            animPrefix: forestEnemy.animPrefix || forestEnemy.spriteKey?.replace('-sheet', '') || 'slime',
                            scale: forestEnemy.scale,
                            battleOffsetY: forestEnemy.battleOffsetY
                        } as unknown as EnemyDefinition;
                    }
                }
            }

            // If useForestEnemy was set but enemy wasn't in forest data, fall back to main enemies
            if (!enemy && useForestEnemy) {
                enemy = enemies?.find(e => e.id === enemyId);
            }

            // Fallback to first enemy if still not found
            this.enemyDefs = [enemy || enemies?.[0]];
        }

        // Use animPrefix if available (new format), fallback to parsing spriteKey (legacy)
        this.enemyAnimPrefixes = this.enemyDefs.map(def => {
            if (def.animPrefix) {
                return def.animPrefix;
            }
            // Legacy fallback: derive from spriteKey
            const spriteKey = def.spriteKey;
            return spriteKey.includes('-') ? spriteKey.split('-')[0] : spriteKey;
        });

        // Create battle enemies from definitions
        const battleEnemies: BattleEnemy[] = this.enemyDefs.map((def, index) => ({
            id: `${def.id}_${index}`,
            name: def.name,
            spriteKey: def.spriteKey,
            hp: def.hp,
            maxHp: def.hp,
            attack: def.attack,
            defense: def.defense,
        }));

        // Initialize battle state
        this.battleState = {
            phase: 'start',
            playerHp: player.hp,
            enemies: battleEnemies,
            selectedEnemyIndex: 0,
            currentProblems: [],
            currentProblemIndex: 0,
            damageDealt: 0,
            turnCount: 0,
        };
    }

    create(): void {
        // Clear arrays from previous battle
        this.enemyContainers = [];
        this.enemies = [];
        this.enemyHpBars = [];

        // Get animation definitions (including movement data) from registry
        this.animationDefs = this.registry.get('animationDefs') || {};

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onAttack', () => this.onAttackClicked());

        this.sceneBuilder.buildScene();

        // Add custom background for journey mode (covers the default battle background)
        if (this.backgroundKey && this.textures.exists(this.backgroundKey)) {
            const bg = this.add.image(640, 360, this.backgroundKey);
            bg.setDepth(-5); // Above default background (-10) but behind characters
            bg.setDisplaySize(1280, 720);
            console.log(`[BattleScene] Using custom background: ${this.backgroundKey}`);
        } else if (this.backgroundKey) {
            console.warn(`[BattleScene] Background texture not found: ${this.backgroundKey}`);
        }

        const player = this.gameState.getPlayer();

        // Get spawn points from scene-layouts.json (preferred) or fallback to zones
        const enemyCount = this.battleState.enemies.length;
        const spawnPoints = this.sceneBuilder.getSpawnPoints(undefined, enemyCount);

        // Hero position from spawn points or fallback
        let heroX: number, heroY: number;
        if (spawnPoints) {
            heroX = spawnPoints.player.x;
            heroY = spawnPoints.player.y;
        } else {
            const playerSpawn = this.sceneBuilder.getZone('playerSpawn');
            heroX = playerSpawn ? playerSpawn.x : 300;
            heroY = playerSpawn ? playerSpawn.y : 480;
        }

        // Get player sprite configuration based on selected character
        this.playerSpriteConfig = getPlayerSpriteConfig(player.characterType);

        // Get hero scale from character definition
        const charactersData = this.cache.json.get('characters') as Array<{ id: string; scale?: number }>;
        const characterDef = charactersData?.find(c => c.id === player.characterType);
        const HERO_BASE_SCALE = 1.0;
        const heroScale = (characterDef?.scale ?? 1.0) * HERO_BASE_SCALE;

        // Create hero container with sprite and HP bar
        this.heroContainer = this.add.container(heroX, heroY);
        this.hero = this.add.sprite(0, 0, this.playerSpriteConfig.idleTexture)
            .setScale(heroScale)
            .play(this.playerSpriteConfig.idleAnim);
        this.heroHpBar = this.createHpBar(0, -90, this.battleState.playerHp, player.maxHp, '#44cc44');
        this.heroContainer.add([this.hero, this.heroHpBar.container]);

        // Pet position from spawn points or default relative to hero
        let petX: number, petY: number;
        if (spawnPoints) {
            petX = spawnPoints.pet.x;
            petY = spawnPoints.pet.y;
        } else {
            petX = heroX - 80;
            petY = heroY + 20;
        }

        // Create pet companion if player has one equipped
        this.createPetCompanion(player, petX, petY);

        // Initialize cached spawn points
        this.cachedSpawnPoints = {
            player: { x: heroX, y: heroY },
            pet: { x: petX, y: petY },
            enemies: []
        };

        // Create enemy containers using configured spawn points
        this.battleState.enemies.forEach((enemy, index) => {
            // Use spawn points if available, otherwise calculate positions
            let x: number, y: number;
            if (spawnPoints && spawnPoints.enemies[index]) {
                x = spawnPoints.enemies[index].x;
                y = spawnPoints.enemies[index].y;
            } else {
                // Fallback: center enemies around a base position
                const enemySpawn = this.sceneBuilder.getZone('enemySpawn');
                const baseEnemyX = enemySpawn ? enemySpawn.x : 900;
                const baseEnemyY = enemySpawn ? enemySpawn.y : 480;
                const enemySpacing = 140;
                const startX = baseEnemyX - ((enemyCount - 1) * enemySpacing) / 2;
                x = startX + index * enemySpacing;
                y = baseEnemyY;
            }

            // Cache the enemy position for use in finishEnemyAttack
            this.cachedSpawnPoints!.enemies.push({ x, y });

            const def = this.enemyDefs[index];
            let animPrefix = this.enemyAnimPrefixes[index];

            // Ensure animations exist for this enemy (creates fallbacks for static sprites)
            // This may also substitute the texture/animPrefix if the original is missing
            animPrefix = this.ensureEnemyAnimations(def.spriteKey, animPrefix);
            this.enemyAnimPrefixes[index] = animPrefix; // Update stored prefix

            // Get enemy scale from definition
            const ENEMY_BASE_SCALE = 1.0;
            const enemyScale = (def.scale ?? 1.0) * ENEMY_BASE_SCALE;

            // Use the texture that actually exists (might be fallback)
            const actualSpriteKey = this.textures.exists(def.spriteKey) ? def.spriteKey : 'slime-sheet';

            const offsetY = def.battleOffsetY || 0;
            const container = this.add.container(x, y + offsetY);
            const idleAnimKey = (this.isBoss && index === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
            const sprite = this.add.sprite(0, 0, actualSpriteKey).setScale(enemyScale).play(idleAnimKey);
            const hpBarY = -(sprite.displayHeight / 2) - 15;
            const hpBar = this.createHpBar(0, hpBarY, enemy.hp, enemy.maxHp, '#cc4444');
            container.add([sprite, hpBar.container]);
            container.setData('hpBarY', hpBarY);
            container.setData('origFrameW', sprite.width);

            // Make enemy clickable to select as target (for both player and pet turns)
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                if (this.battleState.phase === 'player_turn') {
                    this.selectTarget(index);
                } else if (this.battleState.phase === 'pet_turn') {
                    this.selectPetTarget(index);
                }
            });

            this.enemyContainers.push(container);
            this.enemies.push(sprite);
            this.enemyHpBars.push(hpBar);
        });

        // Create target indicator (iron sword pointing down at selected enemy)
        this.targetIndicator = this.add.image(0, 0, 'shop-swords-sheet', 1)  // frame 1 = iron sword
            .setScale(0.2)
            .setAngle(180)  // upside down, pointing down
            .setDepth(50);

        // Add bobbing animation
        this.tweens.add({
            targets: this.targetIndicator,
            y: '-=8',
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.updateTargetIndicator();

        // Create pet target indicator (green-tinted sword for pet's target)
        this.petTargetIndicator = this.add.image(0, 0, 'shop-swords-sheet', 1)
            .setScale(0.18)
            .setAngle(180)
            .setTint(0x44ff44)  // Green tint for pet
            .setDepth(50)
            .setVisible(false);

        // Create pet attack button (same position as attack button, shown during pet_turn)
        this.createPetAttackButton();

        // Set player level in registry for MathEngine's adaptive difficulty
        this.registry.set('playerLevel', player.level);

        // Initialize systems
        this.mathEngine = new MathEngine(this.registry);

        // Create math board with multi-problem callback (but we'll use showSingle)
        this.mathBoard = new MathBoard(this, this.onMathComplete.bind(this));

        // Get attack button from SceneBuilder (already has click handler bound via registerHandler)
        const builderAttackBtn = this.sceneBuilder.get('attackBtn');
        if (builderAttackBtn) {
            this.attackButton = builderAttackBtn as Phaser.GameObjects.Container;
        } else {
            this.createAttackButton();
        }

        this.createBlockUI();
        this.createPotionButton();

        // Setup universal debugger
        this.setupDebugger();

        // Start battle
        this.time.delayedCall(500, () => this.setPhase('player_turn'));
    }

    /**
     * Ensure enemy animations exist, creating fallback single-frame animations for static sprites
     * Also handles missing textures by substituting with slime
     */
    private ensureEnemyAnimations(spriteKey: string, animPrefix: string): string {
        // If texture doesn't exist, use slime as fallback
        if (!this.textures.exists(spriteKey)) {
            console.warn(`[BattleScene] Texture not found: ${spriteKey}, using slime-sheet fallback`);
            spriteKey = 'slime-sheet';
            animPrefix = 'slime';
        }

        const animations = [`${animPrefix}-idle`, `${animPrefix}-hurt`, `${animPrefix}-death`, `${animPrefix}-attack`];

        for (const animKey of animations) {
            if (!this.anims.exists(animKey)) {
                // Create a fallback single-frame animation using the static sprite
                this.anims.create({
                    key: animKey,
                    frames: [{ key: spriteKey, frame: 0 }],
                    frameRate: 1,
                    repeat: 0
                });
                console.log(`[BattleScene] Created fallback animation: ${animKey}`);
            }
        }

        return animPrefix; // Return potentially modified animPrefix
    }

    private createHpBar(x: number, y: number, hp: number, maxHp: number, color: string): HpBar {
        const width = 100;
        const height = 12;
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width + 4, height + 4, 0x333333).setOrigin(0.5);
        const fillColor = color === '#44cc44' ? 0x44cc44 : 0xcc4444;
        const fill = this.add.rectangle(-width / 2, 0, width * (hp / maxHp), height, fillColor).setOrigin(0, 0.5);
        const text = this.add.text(0, 0, `${hp}/${maxHp}`, {
            fontSize: '10px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        container.add([bg, fill, text]);
        return { container, bg, fill, text };
    }

    private updateHpBar(hpBar: HpBar, hp: number, maxHp: number): void {
        const width = 100;
        const percent = Math.max(0, hp / maxHp);
        hpBar.fill.setSize(width * percent, 12);
        hpBar.text.setText(`${Math.max(0, hp)}/${maxHp}`);

        // Color based on health percentage
        if (percent > 0.5) {
            hpBar.fill.setFillStyle(0x44cc44);
        } else if (percent > 0.25) {
            hpBar.fill.setFillStyle(0xcccc44);
        } else {
            hpBar.fill.setFillStyle(0xcc4444);
        }
    }

    private createPetCompanion(player: { activePet: string | null }, petX: number, petY: number): void {
        // Reset pet references
        this.petContainer = null;
        this.petSprite = null;
        this.equippedPetDef = null;

        if (!player.activePet) return;

        // Get pet definition
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const petDef = petsData.find(p => p.id === player.activePet);
        if (!petDef) return;

        this.equippedPetDef = petDef;

        // Create pet container at the specified position
        this.petContainer = this.add.container(petX, petY);

        // Get pet scale from definition
        const PET_BASE_SCALE = 0.5;
        const petScale = (petDef.scale ?? 1.0) * PET_BASE_SCALE;

        // Create pet sprite - flipped horizontally (facing right like hero)
        // Use spriteKey (spritesheet) with frame 0, then play idle animation
        this.petSprite = this.add.sprite(0, 0, petDef.spriteKey, 0)
            .setScale(petScale)
            .setFlipX(true);  // Flip to face right (same direction as hero)

        // Play idle animation if it exists
        const idleAnim = `${petDef.animPrefix}-idle`;
        if (this.anims.exists(idleAnim)) {
            this.petSprite.play(idleAnim);
        }

        this.petContainer.add(this.petSprite);
        this.petContainer.setDepth(-1);  // Behind hero
    }

    /**
     * Return pet to its starting position after attack
     */
    private returnPetToPosition(startX: number, startY: number, onComplete: () => void): void {
        if (!this.petContainer) {
            onComplete();
            return;
        }

        this.tweens.add({
            targets: this.petContainer,
            x: startX,
            y: startY,
            duration: 300,
            ease: 'Quad.easeIn',
            onComplete: () => {
                // Reset depth
                this.petContainer?.setDepth(-1);
                onComplete();
            }
        });
    }

    /**
     * Show pet's dedicated math problem
     */
    private showPetMathProblem(): void {
        if (!this.equippedPetDef) {
            this.transitionToEnemyTurn();
            return;
        }

        // Show active highlight on pet
        if (this.petContainer) {
            this.showActiveHighlight(this.petContainer.x, this.petContainer.y + 30, 'green');
        }

        // Generate pet's single problem from mastery pool
        this.petMathProblem = this.generatePetProblemFromPool(this.equippedPetDef);

        if (!this.petMathProblem) {
            this.transitionToEnemyTurn();
            return;
        }

        // Show in MathBoard with pet styling
        this.mathBoard.showSingle(this.petMathProblem, this.onPetMathComplete.bind(this));
    }

    /**
     * Handle pet math problem completion
     */
    private onPetMathComplete(isCorrect: boolean, responseTimeMs: number): void {
        this.mathBoard.hide();
        this.hideActiveHighlight();

        if (this.petMathProblem) {
            this.mathEngine.recordResultForProblem(this.petMathProblem.id, isCorrect);

            // Record to mastery system if this was a mastery problem
            if (this.petMathProblem.masteryKey) {
                MasterySystem.getInstance().recordSolve(
                    this.petMathProblem.masteryKey,
                    isCorrect,
                    responseTimeMs,
                    'battle_pet'
                );
            }
        }

        // Track wrong answers for arena perfect wave calculation
        if (this.fromArena && !isCorrect) {
            this.waveWrongAnswerCount++;
        }

        if (isCorrect) {
            this.setPhase('pet_attack');
        } else {
            // Pet misses turn
            this.showPetMissMessage();
            this.time.delayedCall(500, () => this.transitionToEnemyTurn());
        }
    }

    /**
     * Show "miss" message for pet
     */
    private showPetMissMessage(): void {
        if (!this.petContainer) return;

        const missText = this.add.text(this.petContainer.x, this.petContainer.y - 50, 'VEDLE!', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: missText,
            y: missText.y - 30,
            alpha: 0,
            duration: 600,
            onComplete: () => missText.destroy(),
        });
    }

    /**
     * Execute pet's attack
     */
    private executePetAttack(): void {
        if (!this.equippedPetDef || !this.petMathProblem) {
            this.transitionToEnemyTurn();
            return;
        }

        const damage = this.petMathProblem.damageMultiplier || 1;
        const targetIdx = this.petTargetIndex;

        // Check for spell attack effect (like Bodlina's lightning)
        if (this.equippedPetDef.attackEffect) {
            this.playPetSpellAttack(targetIdx, damage, () => {
                this.transitionToEnemyTurn();
            });
        } else {
            this.playPetMeleeAttack(targetIdx, damage, () => {
                this.transitionToEnemyTurn();
            });
        }
    }

    /**
     * Play pet melee attack (same as original playPetAttack but with damage)
     */
    private playPetMeleeAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        if (!this.petSprite || !this.equippedPetDef || !this.petContainer) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = this.equippedPetDef.animPrefix;
        const startX = this.petContainer.x;
        const startY = this.petContainer.y;

        // Target position - offset slightly to the left of enemy
        const targetX = enemyContainer.x - 40;
        const targetY = enemyContainer.y;

        // Get movement data from pet's attack animation definition
        const attackAnimDef = this.animationDefs[`${animPrefix}-attack`];
        const movement = attackAnimDef?.movement;
        const moveDuration = movement?.duration || 300;

        // Pet appears on top during attack
        this.petContainer.setDepth(10);

        // Play attack animation immediately during approach
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            this.petSprite.play(attackAnim);
        }

        // Move to enemy position
        this.tweens.add({
            targets: this.petContainer,
            x: targetX,
            y: targetY,
            duration: moveDuration,
            ease: movement?.ease || 'Quad.easeOut',
            onComplete: () => {
                // Apply damage
                this.applyPetDamageToEnemy(targetIdx, damage);

                // Brief pause at enemy (100ms), then return
                this.time.delayedCall(100, () => {
                    this.petSprite!.play(`${animPrefix}-idle`);
                    this.returnPetToPosition(startX, startY, onComplete);
                });
            }
        });
    }

    /**
     * Play pet spell attack (lightning for Bodlina)
     */
    private playPetSpellAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        if (!this.petSprite || !this.equippedPetDef || !this.petContainer) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = this.equippedPetDef.animPrefix;
        const attackEffect = this.equippedPetDef.attackEffect;

        // Play attack animation in place (pet doesn't move for spells)
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            this.petSprite.play(attackAnim);
        }

        // Play effect based on type
        if (attackEffect?.type === 'lightning') {
            const tintColor = attackEffect.tint ? parseInt(attackEffect.tint, 16) : 0x44ff44;
            this.playLightningEffect(
                this.petContainer.x,
                this.petContainer.y - 30,
                enemyContainer.x,
                enemyContainer.y,
                tintColor,
                () => {
                    // Apply damage after effect
                    this.applyPetDamageToEnemy(targetIdx, damage);

                    // Return to idle
                    this.time.delayedCall(200, () => {
                        this.petSprite!.play(`${animPrefix}-idle`);
                        onComplete();
                    });
                }
            );
        } else {
            // Fallback to melee if effect type not recognized
            this.playPetMeleeAttack(targetIdx, damage, onComplete);
        }
    }

    /**
     * Play lightning effect from start to end position
     */
    private playLightningEffect(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        tintColor: number,
        onComplete: () => void
    ): void {
        const graphics = this.add.graphics();
        graphics.setDepth(50);

        // Generate jagged lightning path with 12 segments
        const segments = 12;
        const points: { x: number; y: number }[] = [{ x: startX, y: startY }];

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const baseX = startX + (endX - startX) * t;
            const baseY = startY + (endY - startY) * t;

            // Add random offset (±35 perpendicular, ±25 parallel)
            const perpOffset = (Math.random() - 0.5) * 70;
            const paraOffset = (Math.random() - 0.5) * 50;

            // Calculate perpendicular direction
            const dx = endX - startX;
            const dy = endY - startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            const perpX = -dy / len;
            const perpY = dx / len;

            points.push({
                x: baseX + perpX * perpOffset + (dx / len) * paraOffset,
                y: baseY + perpY * perpOffset + (dy / len) * paraOffset,
            });
        }
        points.push({ x: endX, y: endY });

        // Draw 4 layers: outer glow (20px), middle (12px), main (6px), core (2px)
        const layers = [
            { width: 20, alpha: 0.2 },
            { width: 12, alpha: 0.4 },
            { width: 6, alpha: 0.8 },
            { width: 2, alpha: 1.0 },
        ];

        layers.forEach(layer => {
            graphics.lineStyle(layer.width, tintColor, layer.alpha);
            graphics.beginPath();
            graphics.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                graphics.lineTo(points[i].x, points[i].y);
            }
            graphics.strokePath();
        });

        // Camera shake
        this.cameras.main.shake(100, 0.005);

        // Fade out and destroy
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 300,
            onComplete: () => {
                graphics.destroy();
                onComplete();
            },
        });
    }

    /**
     * Apply damage from pet to enemy
     */
    private applyPetDamageToEnemy(targetIdx: number, damage: number): void {
        const enemy = this.battleState.enemies[targetIdx];
        const enemyContainer = this.enemyContainers[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];

        enemy.hp -= damage;

        // Check for Last Stand ability (boss survives with 1 HP once)
        if (this.isBoss && enemy.hp <= 0 &&
            this.currentPhaseAbility === 'last_stand' && !this.lastStandTriggered) {
            enemy.hp = 1;
            this.lastStandTriggered = true;
            this.showAbilityText('🛡️ Last Stand! Survived with 1 HP!');
        }

        this.updateHpBar(this.enemyHpBars[targetIdx], enemy.hp, enemy.maxHp);

        // Show damage number
        const dmgText = this.add.text(enemyContainer.x, enemyContainer.y - 50, `-${damage}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44', // Green for pet damage
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: dmgText,
            y: dmgText.y - 30,
            alpha: 0,
            duration: 600,
            onComplete: () => dmgText.destroy(),
        });

        // Enemy hit effect
        if (enemy.hp > 0) {
            const hurtKey = (this.isBoss && targetIdx === 0) ? this.getBossAnimKey(0, 'hurt') : `${animPrefix}-hurt`;
            enemySprite.play(hurtKey);
            enemySprite.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                if (this.isBoss && targetIdx === 0 && this.bossPhaseAnimOverrides.tint) {
                    enemySprite.setTint(this.bossPhaseAnimOverrides.tint);
                } else {
                    enemySprite.clearTint();
                }
            });
            enemySprite.once('animationcomplete', () => {
                if (enemy.hp > 0) {
                    const idleKey = (this.isBoss && targetIdx === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
                    enemySprite.play(idleKey);
                }
            });
        }
    }

    /**
     * Transition to enemy turn after pet attack
     */
    private transitionToEnemyTurn(): void {
        const targetIdx = this.petTargetIndex;
        const enemy = this.battleState.enemies[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];

        // Check if target enemy died from pet attack
        if (enemy.hp <= 0) {
            if (this.isBoss && targetIdx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
                this.playBossDeathSequence(targetIdx, enemySprite, () => {
                    this.checkVictoryOrContinue();
                });
            } else {
                const deathKey = (this.isBoss && targetIdx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
                enemySprite.play(deathKey);
                enemySprite.once('animationcomplete', () => {
                    this.time.delayedCall(1000, () => {
                        this.tweens.add({
                            targets: this.enemyContainers[targetIdx],
                            alpha: 0,
                            duration: 500,
                            onComplete: () => {
                                this.checkVictoryOrContinue();
                            }
                        });
                    });
                });
            }
        } else {
            this.setPhase('enemy_turn');
        }
    }

    /**
     * Show active character highlight (pulsing ellipse on ground)
     */
    private showActiveHighlight(x: number, y: number, color: 'green' | 'red'): void {
        this.hideActiveHighlight();

        this.activeHighlight = this.add.graphics();
        this.activeHighlight.setDepth(-2); // Behind characters

        const fillColor = color === 'green' ? 0x44aa44 : 0xaa4444;

        // Draw ellipse
        this.activeHighlight.fillStyle(fillColor, 0.3);
        this.activeHighlight.fillEllipse(x, y, 80, 30);

        // Pulsing animation
        this.activeHighlightTween = this.tweens.add({
            targets: this.activeHighlight,
            alpha: { from: 0.6, to: 0.2 },
            duration: 600,
            yoyo: true,
            repeat: -1,
        });
    }

    /**
     * Hide active character highlight
     */
    private hideActiveHighlight(): void {
        if (this.activeHighlightTween) {
            this.activeHighlightTween.stop();
            this.activeHighlightTween = null;
        }
        if (this.activeHighlight) {
            this.activeHighlight.destroy();
            this.activeHighlight = null;
        }
    }

    /**
     * Play hero defense animation when player successfully blocks damage
     */
    private playHeroDefense(): void {
        this.hero.play(this.playerSpriteConfig.defendAnim);

        // Blue tint for defense effect
        this.hero.setTint(0x4488ff);
        this.time.delayedCall(200, () => this.hero.clearTint());

        // Return to idle when animation completes
        this.hero.once('animationcomplete', () => {
            this.hero.play(this.playerSpriteConfig.idleAnim);
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'BattleScene');

        // Create pause menu (ESC key to toggle)
        this.pauseMenu = new PauseMenu(this);

        // Visible pause button (for mobile + desktop convenience)
        const pauseEl = this.sceneBuilder.get('pauseButton') as Phaser.GameObjects.Container | undefined;
        const pauseBtn = this.add.text(
            pauseEl?.x ?? 1240, pauseEl?.y ?? 30, '\u23f8',
            { fontSize: '36px', color: '#ffffff' }
        ).setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .setDepth(pauseEl?.depth ?? 500)
            .setScrollFactor(0);
        pauseBtn.on('pointerdown', () => this.pauseMenu.toggle());

        // Register containers (sprite + HP bar move together)
        this.debugger.register('hero', this.heroContainer);
        this.enemyContainers.forEach((container, index) => {
            this.debugger.register(`enemy${index}`, container);
        });
        this.debugger.register('attackButton', this.attackButton);
        this.debugger.register('mathBoard', this.mathBoard.getContainer());

        // Set battle-specific callbacks (W for win, H for heal)
        this.debugger.setBattleCallbacks(
            () => this.debugInstantWin(),
            () => this.debugFullHeal()
        );

        // Additional battle debug keys (not handled by SceneDebugger)
        this.input.keyboard?.on('keydown-K', () => this.debugKillEnemy());
    }

    private debugInstantWin(): void {
        console.log('[DEBUG] Instant win triggered');
        this.battleState.enemies.forEach(e => e.hp = 0);
        this.setPhase('victory');
    }

    private debugKillEnemy(): void {
        console.log('[DEBUG] Kill current enemy');
        const idx = this.battleState.selectedEnemyIndex;
        const enemy = this.battleState.enemies[idx];
        enemy.hp = 0;
        this.updateHpBar(this.enemyHpBars[idx], 0, enemy.maxHp);

        const animPrefix = this.enemyAnimPrefixes[idx];
        if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
            this.playBossDeathSequence(idx, this.enemies[idx], () => {
                this.checkVictoryOrContinue();
            });
        } else {
            const deathKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
            this.enemies[idx].play(deathKey);
            this.enemies[idx].once('animationcomplete', () => {
                this.time.delayedCall(1000, () => {
                    this.tweens.add({
                        targets: this.enemyContainers[idx],
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            this.checkVictoryOrContinue();
                        }
                    });
                });
            });
        }
    }

    private debugFullHeal(): void {
        console.log('[DEBUG] Full heal');
        const player = this.gameState.getPlayer();
        this.battleState.playerHp = player.maxHp;
        this.updateHpBar(this.heroHpBar, player.maxHp, player.maxHp);
    }

    private selectTarget(index: number): void {
        // Only allow selecting alive enemies during player turn
        if (this.battleState.phase !== 'player_turn') return;
        if (this.battleState.enemies[index].hp <= 0) return;

        this.battleState.selectedEnemyIndex = index;
        this.updateTargetIndicator();
    }

    private updateTargetIndicator(): void {
        const idx = this.battleState.selectedEnemyIndex;
        const container = this.enemyContainers[idx];

        // Position sword above the enemy's health bar
        const indicatorY = container.y + (container.getData('hpBarY') ?? -80) - 25;
        this.targetIndicator.setPosition(container.x, indicatorY);

        // Hide indicator if target is dead
        if (this.battleState.enemies[idx].hp <= 0) {
            this.targetIndicator.setVisible(false);
        } else {
            this.targetIndicator.setVisible(true);
        }
    }

    private createBlockUI(): void {
        // Centered for 1280x720
        this.blockUI = this.add.container(640, 80);
        this.blockUI.setVisible(false);
        this.blockUI.setDepth(90);

        const bg = this.add.rectangle(0, 0, 340, 70, 0x000000, 0.8)
            .setStrokeStyle(2, 0x4488ff);
        this.blockUI.add(bg);

        this.blockDamageText = this.add.text(0, -20, 'ÚTOK: 5 DMG', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6666',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.blockUI.add(this.blockDamageText);

        this.blockTimerText = this.add.text(-100, 10, 'ČAS: 10S', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockTimerText);

        this.blockAttemptsText = this.add.text(30, 10, 'BLOKUJI: 0 DMG', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaffaa',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockAttemptsText);
    }

    private createAttackButton(): void {
        // Centered for 1280x720
        const button = this.add.rectangle(640, 660, 150, 50, 0x44aa44)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(640, 660, 'ÚTOK', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.attackButton = this.add.container(0, 0, [button, text]);

        button.on('pointerdown', () => this.onAttackClicked());
        button.on('pointerover', () => button.setFillStyle(0x55bb55));
        button.on('pointerout', () => button.setFillStyle(0x44aa44));
    }

    private createPotionButton(): void {
        const player = this.gameState.getPlayer();

        // Get position from sceneBuilder (fallback to left of attack button)
        const potionBtnEl = this.sceneBuilder.get('potionBtn');
        const btnX = potionBtnEl?.x ?? 480;
        const btnY = potionBtnEl?.y ?? 660;
        const btnDepth = this.sceneBuilder.getLayoutOverride('potionBtn')?.depth ?? 50;

        this.potionButton = this.add.container(btnX, btnY);
        this.potionButton.setDepth(btnDepth);

        const hasPotion = player.potions > 0;
        const btnColor = hasPotion ? 0x8844aa : 0x444444;

        const bg = this.add.rectangle(0, 0, 100, 50, btnColor)
            .setStrokeStyle(2, 0xffffff);

        // Potion icon
        const icon = this.add.text(-25, 0, '🧪', {
            fontSize: '24px'
        }).setOrigin(0.5);

        // Count text
        const countText = this.add.text(20, 0, hasPotion ? '1' : '0', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: hasPotion ? '#ffffff' : '#666666',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.potionButton.add([bg, icon, countText]);

        if (hasPotion) {
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0xaa66cc))
                .on('pointerout', () => bg.setFillStyle(0x8844aa))
                .on('pointerdown', () => this.usePotion());
        }

        // Hide initially - show during player_turn
        this.potionButton.setVisible(false);
    }

    private createPetAttackButton(): void {
        // Same position as attack button - centered at 640, 660
        this.petAttackButton = this.add.container(640, 660);
        this.petAttackButton.setDepth(50);

        const petBtnBg = this.add.rectangle(0, 0, 150, 50, 0x44aa44)  // Green background
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });

        const petBtnText = this.add.text(0, 0, '🐾 ÚTOK', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.petAttackButton.add([petBtnBg, petBtnText]);
        this.petAttackButton.setVisible(false);

        petBtnBg.on('pointerdown', () => this.onPetAttackClicked());
        petBtnBg.on('pointerover', () => petBtnBg.setFillStyle(0x55bb55));
        petBtnBg.on('pointerout', () => petBtnBg.setFillStyle(0x44aa44));
    }

    private onPetAttackClicked(): void {
        if (this.battleState.phase !== 'pet_turn') return;

        this.petAttackButton.setVisible(false);
        this.hidePetTargetIndicator();
        this.setPhase('pet_math');
    }

    private selectPetTarget(index: number): void {
        if (this.battleState.phase !== 'pet_turn') return;
        if (this.battleState.enemies[index].hp <= 0) return;

        this.petTargetIndex = index;
        this.updatePetTargetIndicator();
    }

    private updatePetTargetIndicator(): void {
        const idx = this.petTargetIndex;
        const container = this.enemyContainers[idx];

        if (!container || this.battleState.enemies[idx].hp <= 0) {
            this.hidePetTargetIndicator();
            return;
        }

        // Position above enemy (same height as player indicator)
        const baseY = container.y + (container.getData('hpBarY') ?? -80) - 25;
        this.petTargetIndicator?.setPosition(container.x, baseY);
        this.petTargetIndicator?.setVisible(true);

        // Restart bobbing tween with absolute position
        if (this.petTargetIndicatorTween) {
            this.petTargetIndicatorTween.stop();
        }
        this.petTargetIndicatorTween = this.tweens.add({
            targets: this.petTargetIndicator,
            y: { from: baseY, to: baseY - 8 },
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });
    }

    private hidePetTargetIndicator(): void {
        this.petTargetIndicator?.setVisible(false);
        if (this.petTargetIndicatorTween) {
            this.petTargetIndicatorTween.stop();
            this.petTargetIndicatorTween = null;
        }
    }

    private usePotion(): void {
        // Only allow during player_turn phase
        if (this.battleState.phase !== 'player_turn') return;

        const player = this.gameState.getPlayer();
        if (player.potions <= 0) return;

        // Use potion - heal to full
        player.potions = 0;
        this.battleState.playerHp = player.maxHp;

        // Update HP bar
        this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);

        // Save state (potion used)
        this.gameState.save();

        // Hide potion button (no more potions)
        this.potionButton.setVisible(false);

        // Visual feedback
        const healText = this.add.text(this.heroContainer.x, this.heroContainer.y - 80, 'VYLÉČEN!', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({
            targets: healText,
            y: healText.y - 40,
            alpha: 0,
            duration: 1200,
            onComplete: () => healText.destroy()
        });

        // Green flash on hero
        this.hero.setTint(0x44ff44);
        this.time.delayedCall(200, () => {
            this.hero.clearTint();
        });
    }

    private setPhase(phase: BattlePhase): void {
        this.battleState.phase = phase;

        switch (phase) {
            case 'player_turn':
                this.attackButton.setVisible(true);
                // Show potion button if player has a potion
                const playerForTurn = this.gameState.getPlayer();
                this.potionButton.setVisible(playerForTurn.potions > 0);
                this.hideActiveHighlight();
                break;

            case 'player_math':
                this.attackButton.setVisible(false);
                this.potionButton.setVisible(false);
                this.showAttackProblems();
                break;

            case 'player_attack':
                this.playHeroAttack();
                break;

            case 'player_miss':
                this.playHeroMiss();
                break;

            case 'pet_turn':
                // Show pet attack button for target selection
                this.petAttackButton.setVisible(true);
                // Hide player's target indicator
                this.targetIndicator.setVisible(false);
                // Show green highlight on pet
                if (this.petContainer) {
                    this.showActiveHighlight(this.petContainer.x, this.petContainer.y + 30, 'green');
                }
                // Auto-select first alive enemy (can be changed by clicking)
                this.petTargetIndex = this.battleState.enemies.findIndex(e => e.hp > 0);
                this.updatePetTargetIndicator();
                break;

            case 'pet_math':
                // Show pet's dedicated math problem
                this.showPetMathProblem();
                break;

            case 'pet_attack':
                // Pet executes attack
                this.executePetAttack();
                break;

            case 'enemy_turn':
                this.hideActiveHighlight();
                // Start enemy attacks from first alive enemy
                this.currentAttackingEnemyIndex = this.findNextAliveEnemy(-1);
                if (this.currentAttackingEnemyIndex >= 0) {
                    this.time.delayedCall(500, () => this.playEnemyAttack());
                } else {
                    // No alive enemies (shouldn't happen, but safety)
                    this.setPhase('player_turn');
                }
                break;

            case 'victory':
                this.hideActiveHighlight();
                this.onVictory();
                break;

            case 'defeat':
                this.hideActiveHighlight();
                this.onDefeat();
                break;
        }
    }

    private onAttackClicked(): void {
        if (this.battleState.phase === 'player_turn') {
            this.setPhase('player_math');
        }
    }

    private showAttackProblems(): void {
        const player = this.gameState.getPlayer();

        // Store equipped pet definition for pet turn (but don't include in player's attack problems)
        if (player.activePet) {
            const petsData = this.cache.json.get('pets') as PetDefinition[];
            this.equippedPetDef = petsData.find(p => p.id === player.activePet) || null;
        } else {
            this.equippedPetDef = null;
        }

        // Get equipped sword definition
        let equippedSword: ItemDefinition | null = null;
        if (player.equippedWeapon) {
            const itemsData = this.cache.json.get('items') as ItemDefinition[];
            equippedSword = itemsData.find(i => i.id === player.equippedWeapon && i.type === 'weapon') || null;
        }

        // Check if we're in a boss fight with phase-specific math
        if (this.isBoss && this.bossPhases[this.currentBossPhase]) {
            const phase = this.bossPhases[this.currentBossPhase];
            if (phase.mathType) {
                // Generate boss phase-specific problems (count based on player.attack, same as normal fights)
                const problemCount = MasterySystem.getInstance().getProblemsPerTurn();
                const problems: MathProblem[] = [];
                for (let i = 0; i < problemCount; i++) {
                    problems.push(this.mathEngine.generateBossPhaseProblem(
                        phase.mathType,
                        phase.mathDifficulty || 5
                    ));
                }

                // Add sword bonus problem if equipped (drawn from mastery master pool)
                if (equippedSword && equippedSword.mathProblemType) {
                    problems.push(this.generateSwordProblem(equippedSword));
                }

                this.applyAttackPowerBonus(problems);
                this.battleState.currentProblems = problems;
                this.mathBoardContext = 'attack';
                this.mathBoard.show(problems);
                return;
            }
        }

        // Generate problems from mastery pool
        const masterySystem = MasterySystem.getInstance();
        const count = masterySystem.getProblemsPerTurn();
        const problemKeys = masterySystem.drawFromPool(count);
        const problems: MathProblem[] = [];
        for (const key of problemKeys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) {
                problems.push(problem);
            }
        }

        // Fallback: if mastery system returned no problems, use legacy generation
        if (problems.length === 0) {
            const legacyProblems = this.mathEngine.generateAttackProblems(player.level, null, equippedSword);
            problems.push(...legacyProblems);
        } else {
            // Add sword bonus problem if equipped (drawn from mastery master pool)
            if (equippedSword && equippedSword.mathProblemType) {
                problems.push(this.generateSwordProblem(equippedSword));
            }
        }

        this.applyAttackPowerBonus(problems);
        this.battleState.currentProblems = problems;
        this.mathBoardContext = 'attack';
        this.mathBoard.show(problems);
    }

    private onMathComplete(_damageDealt: number, results: boolean[], timings: number[]): void {
        const context = this.mathBoardContext;
        this.mathBoardContext = null;

        // LAYER 1: No context = stale callback from an already-ended phase. Ignore.
        if (context === null) {
            console.warn('[BattleScene] Stale onMathComplete callback ignored');
            return;
        }

        // ---- BLOCK PHASE ----
        if (context === 'block') {
            // LAYER 2: Timer may have already ended the block phase
            if (!this.isBlockPhase) {
                console.warn('[BattleScene] Block callback arrived after timer expiry, ignoring');
                return;
            }

            // Count correct answers for blocking + mastery recording + quick-block bonus
            let correctCount = 0;
            const masterySystem = MasterySystem.getInstance();
            const masteryRT = masterySystem.getMasteryRTThreshold();

            results.forEach((isCorrect, index) => {
                const problem = this.battleState.currentProblems[index];
                if (problem) {
                    this.mathEngine.recordResultForProblem(problem.id, isCorrect);
                    // Mastery recording: feeds into [retry]/[slow] pools
                    if (problem.masteryKey) {
                        const rt = timings[index] || 0;
                        masterySystem.recordSolve(problem.masteryKey, isCorrect, rt, 'battle_block');
                    }
                }
                if (isCorrect) {
                    correctCount++;
                    // Quick block bonus: +1 extra block if answered under mastery RT threshold
                    if (timings[index] && timings[index] < masteryRT) {
                        correctCount++;
                    }
                }
            });
            this.blockCorrectCount = correctCount;
            this.blockAttemptsMade = results.length;

            // Update UI with final count
            const currentBlock = Math.min(this.blockCorrectCount, this.pendingDamage);
            this.blockAttemptsText.setText(`BLOKUJI: ${currentBlock} DMG`);

            // End block phase
            this.endBlockPhase();
            return;
        }

        // ---- ATTACK PHASE ---- (context === 'attack')
        this.mathBoard.hide();

        // Calculate total damage with multipliers + speed bonuses
        let totalDamage = 0;
        const masterySystem = MasterySystem.getInstance();

        results.forEach((isCorrect, index) => {
            const problem = this.battleState.currentProblems[index];
            if (problem) {
                // Record results for stats (legacy)
                this.mathEngine.recordResultForProblem(problem.id, isCorrect);

                // Record to mastery system (for mastery problems only)
                if (problem.masteryKey) {
                    const responseTimeMs = timings[index] || 0;
                    const ctx = problem.source === 'sword' ? 'battle_sword' : 'battle';
                    masterySystem.recordSolve(problem.masteryKey, isCorrect, responseTimeMs, ctx);
                }

                // Add damage with multiplier if correct
                if (isCorrect) {
                    const multiplier = problem.damageMultiplier || 1;
                    totalDamage += multiplier;

                    // Speed bonus for mastery problems
                    if (problem.masteryKey && timings[index]) {
                        const speedBonus = masterySystem.getSpeedBonus(timings[index]);
                        if (speedBonus.bonusDamage > 0 && speedBonus.type !== 'none') {
                            totalDamage += speedBonus.bonusDamage;
                            // Show speed bonus visual (Phase 5)
                            this.showSpeedBonusEffect(speedBonus.type, index);
                        }
                    }
                } else if (this.fromArena) {
                    // Track wrong answers for arena perfect wave calculation
                    this.waveWrongAnswerCount++;
                }
            }
        });

        this.battleState.damageDealt = totalDamage;

        // Track if last answer was correct for Vengeful Strike ability
        // Consider it "wrong" if any answer in the batch was wrong, or if total damage is 0
        const anyWrong = results.some(r => !r);
        this.lastAnswerCorrect = !anyWrong && totalDamage > 0;

        if (totalDamage > 0) {
            this.setPhase('player_attack');
        } else {
            this.setPhase('player_miss');
        }
    }

    /** Apply attack power bonus: mark N player problems as 2× damage (N = player.attack beyond 5) */
    private applyAttackPowerBonus(problems: MathProblem[]): void {
        const bonus = MasterySystem.getInstance().getAttackPowerBonus();
        if (bonus <= 0) return;

        // Only boost player problems (not sword/pet), one at a time
        let applied = 0;
        for (const problem of problems) {
            if (applied >= bonus) break;
            if (problem.source !== 'sword' && problem.source !== 'pet' && (!problem.damageMultiplier || problem.damageMultiplier === 1)) {
                problem.damageMultiplier = 2;
                applied++;
            }
        }
    }

    /** Generate a sword problem from mastery master pool, with fallbacks */
    private generateSwordProblem(sword: ItemDefinition): MathProblem {
        const masterySystem = MasterySystem.getInstance();

        // 1. Try master pool (Mastery sub-atoms)
        const masterKeys = masterySystem.drawFromMasterPool(1);
        if (masterKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(masterKeys[0]);
            if (problem) {
                problem.damageMultiplier = sword.damageMultiplier || 1;
                problem.source = 'sword';
                return problem;
            }
        }

        // 2. Fallback: standard mastery pool (consumes 1 from main pool)
        const poolKeys = masterySystem.drawFromPool(1);
        if (poolKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(poolKeys[0]);
            if (problem) {
                problem.damageMultiplier = sword.damageMultiplier || 1;
                problem.source = 'sword';
                return problem;
            }
        }

        // 3. Last resort: legacy generation (should rarely happen)
        const problem = this.mathEngine.generateBossPhaseProblem(
            sword.mathProblemType!, sword.mathProblemMax || 5
        );
        problem.damageMultiplier = sword.damageMultiplier || 1;
        problem.source = 'sword';
        return problem;
    }

    /** Generate block problems from mastery review pool (Fluent sub-atoms), with fallbacks */
    private generateBlockProblemsFromPool(count: number): MathProblem[] {
        const masterySystem = MasterySystem.getInstance();
        const problems: MathProblem[] = [];

        // 1. Try review pool (Fluent sub-atoms)
        const reviewKeys = masterySystem.drawFromReviewPool(count);
        for (const key of reviewKeys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) problems.push(problem);
        }

        // 2. Fallback for remaining: standard mastery pool
        if (problems.length < count) {
            const remaining = count - problems.length;
            const poolKeys = masterySystem.drawFromPool(remaining);
            for (const key of poolKeys) {
                const problem = this.mathEngine.generateProblemFromKey(key);
                if (problem) problems.push(problem);
            }
        }

        return problems;
    }

    /** Generate pet problem from mastery review pool (Fluent sub-atoms), with fallbacks */
    private generatePetProblemFromPool(pet: PetDefinition): MathProblem | null {
        const masterySystem = MasterySystem.getInstance();

        // 1. Try review pool (Fluent sub-atoms) — same as shield block
        const reviewKeys = masterySystem.drawFromReviewPool(1);
        if (reviewKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(reviewKeys[0]);
            if (problem) {
                problem.damageMultiplier = pet.damageMultiplier || 1;
                problem.source = 'pet';
                return problem;
            }
        }

        // 2. Fallback: standard mastery pool
        const poolKeys = masterySystem.drawFromPool(1);
        if (poolKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(poolKeys[0]);
            if (problem) {
                problem.damageMultiplier = pet.damageMultiplier || 1;
                problem.source = 'pet';
                return problem;
            }
        }

        // 3. Last resort: legacy pet problem generation
        return this.mathEngine.generatePetTurnProblem(pet);
    }

    /** Show speed bonus visual effect (Phase 5) */
    private showSpeedBonusEffect(type: 'swift' | 'lightning', problemIndex: number): void {
        const text = type === 'lightning' ? 'Lightning Hit! ⚡' : 'Swift Hit! ✨';
        const color = type === 'lightning' ? '#4488ff' : '#ffcc00';

        // Offset vertically when multiple bonus texts appear (one per problem)
        const baseY = 280 + problemIndex * 40;

        const bonusText = this.add.text(640, baseY, text, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(200).setScale(0.5).setAlpha(0);

        // Pop-in then float up and fade
        this.tweens.add({
            targets: bonusText,
            scale: 1,
            alpha: 1,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: bonusText,
                    y: baseY - 60,
                    alpha: 0,
                    duration: 2000,
                    ease: 'Sine.easeIn',
                    onComplete: () => bonusText.destroy(),
                });
            },
        });

        // Lightning effect: white flash on enemy
        if (type === 'lightning' && this.battleState.enemies.length > 0) {
            const targetEnemy = this.battleState.enemies[this.battleState.selectedEnemyIndex];
            if (targetEnemy) {
                // Brief white flash effect
                const flash = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0.2)
                    .setDepth(150);
                this.tweens.add({
                    targets: flash,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => flash.destroy(),
                });
            }
        }
    }

    private getEquippedShield(): ItemDefinition | null {
        const player = this.gameState.getPlayer();
        if (!player.equippedShield) return null;

        const items = this.cache.json.get('items') as ItemDefinition[];
        return items.find(item => item.id === player.equippedShield) || null;
    }

    private startBlockPhase(damage: number): void {
        const shield = this.getEquippedShield();
        if (!shield) {
            // No shield - apply damage directly and resume enemy attack sequence
            this.applyDamageToPlayer(damage);
            if (this.blockPhaseResumeCallback) {
                this.blockPhaseResumeCallback();
                this.blockPhaseResumeCallback = undefined;
            }
            return;
        }

        this.isBlockPhase = true;
        this.pendingDamage = damage;
        this.blockCorrectCount = 0;
        this.blockAttemptsMade = 0;
        this.blockMaxAttempts = shield.blockAttempts || 1;
        this.blockTimeRemaining = shield.blockTime || 5;

        // Show block UI (no countdown timer — block phase ends when all problems answered)
        this.blockUI.setVisible(true);
        this.blockDamageText.setText(`ÚTOK: ${damage} DMG`);
        this.blockTimerText.setVisible(false); // Timer removed; block ends on completion
        this.blockAttemptsText.setText(`BLOKUJI: 0 DMG`);

        // Generate block problems from mastery review pool (Fluent sub-atoms)
        const problems = this.generateBlockProblemsFromPool(this.blockMaxAttempts);
        this.battleState.currentProblems = problems;

        // DEBUG: Log block phase setup
        console.log('[BattleScene] Block phase started:', {
            shieldId: shield?.id,
            blockAttempts: this.blockMaxAttempts,
            mathProblemTypes: shield?.mathProblemTypes,
            problems: problems.map(p => ({ answer: p.answer, choices: p.choices }))
        });

        this.mathBoardContext = 'block';
        this.mathBoard.show(problems);
    }

    private endBlockPhase(): void {
        // Guard against being called twice (timer + answer callback race)
        if (!this.isBlockPhase) return;

        this.isBlockPhase = false;
        this.mathBoardContext = null;
        this.blockUI.setVisible(false);
        this.mathBoard.hide(); // Always hide math board when block phase ends

        // Stop timer
        if (this.blockTimerEvent) {
            this.blockTimerEvent.destroy();
            this.blockTimerEvent = null;
        }

        // Each correct answer blocks 1 damage, max is the shield's blockAttempts or incoming damage
        const damageBlocked = Math.min(this.blockCorrectCount, this.pendingDamage);
        const finalDamage = this.pendingDamage - damageBlocked;

        // Play defense animation if player blocked at least 1 damage
        if (damageBlocked > 0) {
            this.playHeroDefense();
        }

        // Show block result only if player actually blocked something
        if (damageBlocked > 0) {
            const blockMessage = finalDamage === 0
                ? 'ZABLOKOVÁNO!'
                : `-${damageBlocked} dmg`;

            const blockText = this.add.text(640, 180, blockMessage.toUpperCase(), {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#4488ff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4,
            }).setOrigin(0.5).setDepth(200);

            this.tweens.add({
                targets: blockText,
                alpha: 0,
                y: 100,
                duration: 1500,
                onComplete: () => blockText.destroy(),
            });
        }

        // Apply remaining damage
        this.applyDamageToPlayer(finalDamage);

        // Resume the attack sequence (continue movement, play attack anim, return enemy)
        if (this.blockPhaseResumeCallback) {
            this.blockPhaseResumeCallback();
            this.blockPhaseResumeCallback = undefined;
        }
    }

    private applyDamageToPlayer(damage: number): void {
        if (damage > 0) {
            this.battleState.playerHp -= damage;
            const player = this.gameState.getPlayer();
            this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);

            // Hero hurt effect
            this.hero.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                this.hero.clearTint();
            });
        }
        // Note: Enemy return is handled by blockPhaseResumeCallback -> returnEnemyToPosition
    }

    // Helper to get current target enemy index (first alive enemy)
    private getCurrentEnemyIndex(): number {
        const idx = this.battleState.selectedEnemyIndex;
        // If current target is dead, find next alive enemy
        if (this.battleState.enemies[idx].hp <= 0) {
            const aliveIdx = this.battleState.enemies.findIndex(e => e.hp > 0);
            if (aliveIdx >= 0) {
                this.battleState.selectedEnemyIndex = aliveIdx;
                return aliveIdx;
            }
        }
        return idx;
    }

    // Find next alive enemy after the given index (-1 to start from beginning)
    private findNextAliveEnemy(afterIndex: number): number {
        for (let i = afterIndex + 1; i < this.battleState.enemies.length; i++) {
            if (this.battleState.enemies[i].hp > 0) {
                return i;
            }
        }
        return -1; // No more alive enemies
    }

    // Check if all enemies are dead or continue battle
    private checkVictoryOrContinue(): void {
        const allDead = this.battleState.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.targetIndicator.setVisible(false);

            // Check if this is a boss with more phases
            if (this.isBoss && this.currentBossPhase < this.bossPhases.length - 1) {
                this.triggerBossPhaseTransition();
            } else {
                this.setPhase('victory');
            }
        } else {
            // Select next alive enemy and update indicator
            this.getCurrentEnemyIndex();
            this.updateTargetIndicator();
            this.setPhase('enemy_turn');
        }
    }

    /**
     * Get the correct animation key for a boss enemy, respecting phase overrides
     */
    private getBossAnimKey(idx: number, slot: 'idle' | 'attack' | 'hurt' | 'death'): string {
        const prefix = this.enemyAnimPrefixes[idx];
        if (this.isBoss && idx === 0) {
            const o = this.bossPhaseAnimOverrides;
            if (slot === 'idle' && o.idleAnim) return o.idleAnim;
            if (slot === 'attack' && o.attackAnim) return o.attackAnim;
        }
        if (slot === 'attack') return `${prefix}-attack`;
        return `${prefix}-${slot}`;
    }

    /**
     * Get the animation definition key for enemy attack movement data
     */
    private getBossAttackAnimDefKey(idx: number): string {
        if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.attackAnim) {
            return this.bossPhaseAnimOverrides.attackAnim;
        }
        return `${this.enemyAnimPrefixes[idx]}-attack-anim`;
    }

    /**
     * Apply animation overrides from a boss phase config
     */
    private applyBossPhaseOverrides(phase: typeof this.bossPhases[0]): void {
        this.bossPhaseAnimOverrides = {
            idleAnim: phase.idleAnim,
            attackAnim: phase.attackAnim,
            tint: phase.tint ? parseInt(phase.tint, 16) : undefined,
            deathSequence: phase.deathSequence,
        };
    }

    /**
     * Play a chained sequence of animations for boss death
     */
    private playBossDeathSequence(
        idx: number,
        sprite: Phaser.GameObjects.Sprite,
        onComplete: () => void
    ): void {
        const sequence = [...this.bossPhaseAnimOverrides.deathSequence!];
        const playNext = () => {
            if (sequence.length === 0) {
                this.tweens.add({
                    targets: this.enemyContainers[idx],
                    alpha: 0,
                    duration: 500,
                    onComplete: () => onComplete(),
                });
                return;
            }
            const animKey = sequence.shift()!;
            if (this.anims.exists(animKey)) {
                sprite.play(animKey);
                sprite.once('animationcomplete', playNext);
            } else {
                console.warn(`[BattleScene] Boss death sequence anim missing: ${animKey}`);
                playNext();
            }
        };
        playNext();
    }

    /**
     * Trigger boss phase transition
     */
    private triggerBossPhaseTransition(): void {
        // Get the current (just defeated) phase's healPercent before advancing
        const currentPhase = this.bossPhases[this.currentBossPhase];
        const healPercent = currentPhase?.healPercent ?? 0;
        const player = this.gameState.getPlayer();
        const healAmount = healPercent > 0 ? Math.floor(player.maxHp * (healPercent / 100)) : 0;

        // Advance to next phase
        this.currentBossPhase++;
        const nextPhase = this.bossPhases[this.currentBossPhase];

        // Setup ability tracking for the new phase
        this.currentPhaseAbility = nextPhase.ability || null;
        this.lastStandTriggered = false; // Reset for new phase

        console.log(`[BattleScene] Boss phase transition! Phase ${this.currentBossPhase + 1}: ${nextPhase.nameCs}, ability: ${this.currentPhaseAbility}, heal: ${healAmount} (${healPercent}%), transitionAnim: ${nextPhase.transitionAnim || 'none'}`);

        // Make boss visible again before transition animation
        this.enemyContainers[0].setAlpha(1);
        this.enemies[0].setAlpha(1);

        // Play transition animation if defined, then show overlay
        const showOverlay = () => {
            this.showBossPhaseOverlay(nextPhase, healAmount, healPercent);
        };

        if (nextPhase.transitionAnim && this.anims.exists(nextPhase.transitionAnim)) {
            this.enemies[0].play(nextPhase.transitionAnim);
            this.enemies[0].once('animationcomplete', showOverlay);
        } else {
            showOverlay();
        }
    }

    /**
     * Show the phase transition overlay UI and apply phase changes
     */
    private showBossPhaseOverlay(
        nextPhase: typeof this.bossPhases[0],
        healAmount: number,
        healPercent: number
    ): void {
        // Show phase transition overlay
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setDepth(100);

        // Phase transition text
        const phaseText = this.add.text(640, 280, `⚔️ ${nextPhase.nameCs} ⚔️`, {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6644',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(101).setAlpha(0);

        // Heal player text (percentage-based)
        let healText: Phaser.GameObjects.Text | null = null;
        if (healAmount > 0) {
            healText = this.add.text(640, 350, `💚 +${healAmount} HP (${healPercent}%)`, {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#44ff44',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(101).setAlpha(0);
        }

        // Ability preview text
        let abilityText: Phaser.GameObjects.Text | null = null;
        if (nextPhase.ability) {
            const abilityNames: Record<string, string> = {
                'vengeful_strike': '💢 Watch out for Vengeful Strike!',
                'last_stand': '🛡️ Beware of Last Stand!'
            };
            const abilityHint = abilityNames[nextPhase.ability] || '';
            if (abilityHint) {
                abilityText = this.add.text(640, 420, abilityHint, {
                    fontSize: '24px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffaa44',
                    fontStyle: 'italic',
                    stroke: '#000000',
                    strokeThickness: 3
                }).setOrigin(0.5).setDepth(101).setAlpha(0);
            }
        }

        // Animate phase text in
        this.tweens.add({
            targets: phaseText,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 500,
            ease: 'Back.out'
        });

        if (healText) {
            this.tweens.add({
                targets: healText,
                alpha: 1,
                duration: 500,
                delay: 300
            });
        }

        if (abilityText) {
            this.tweens.add({
                targets: abilityText,
                alpha: 1,
                duration: 500,
                delay: 500
            });
        }

        // After delay, apply phase changes and continue battle
        this.time.delayedCall(2500, () => {
            // Heal player (percentage-based)
            const player = this.gameState.getPlayer();
            if (healAmount > 0) {
                this.battleState.playerHp = Math.min(
                    this.battleState.playerHp + healAmount,
                    player.maxHp
                );
                this.updatePlayerHpBar();
            }

            // Reset boss HP and attack for new phase
            const boss = this.battleState.enemies[0];
            boss.hp = nextPhase.hp;
            boss.maxHp = nextPhase.hp;
            boss.attack = nextPhase.atk;
            boss.name = `${this.enemyDefs[0].name.split(' - ')[0]} - ${nextPhase.nameCs}`;

            // Update HP bar
            this.updateHpBar(this.enemyHpBars[0], boss.hp, boss.maxHp);

            // Make sure boss is visible
            this.enemyContainers[0].setAlpha(1);
            this.enemies[0].setAlpha(1);

            // Apply new phase animation overrides
            this.applyBossPhaseOverrides(nextPhase);

            // Apply persistent tint if set, or clear
            if (this.bossPhaseAnimOverrides.tint) {
                this.enemies[0].setTint(this.bossPhaseAnimOverrides.tint);
            } else {
                this.enemies[0].clearTint();
            }

            // Play new idle animation
            const idleAnim = this.getBossAnimKey(0, 'idle');
            if (this.anims.exists(idleAnim)) {
                this.enemies[0].play(idleAnim);
            }

            // Compensate scale for frame size differences between spritesheets
            // Keep visual size consistent across phase transitions
            const origFrameW = this.enemyContainers[0]?.getData('origFrameW') as number | undefined;
            const currentFrameW = this.enemies[0].width;
            if (origFrameW && currentFrameW && origFrameW !== currentFrameW && this.enemyDefs[0]?.scale) {
                const compensatedScale = this.enemyDefs[0].scale * (origFrameW / currentFrameW);
                this.enemies[0].setScale(compensatedScale);
            }

            // Fade out overlay
            this.tweens.add({
                targets: [overlay, phaseText, healText, abilityText].filter(Boolean),
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    overlay.destroy();
                    phaseText.destroy();
                    healText?.destroy();
                    abilityText?.destroy();

                    // Continue battle - enemy turn (boss attacks first in new phase)
                    this.targetIndicator.setVisible(true);
                    this.updateTargetIndicator();
                    this.setPhase('enemy_turn');
                }
            });
        });
    }

    /**
     * Update player HP bar display
     */
    private updatePlayerHpBar(): void {
        const player = this.gameState.getPlayer();
        this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);
    }

    private finishEnemyAttack(): void {
        const idx = this.currentAttackingEnemyIndex;

        // Get the cached enemy position (set during create())
        const enemyPos = this.cachedSpawnPoints?.enemies[idx];
        const startX = enemyPos?.x ?? 900;
        const startY = enemyPos?.y ?? 480;

        // Slide back to starting position
        this.tweens.add({
            targets: this.enemyContainers[idx],
            x: startX,
            y: startY,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Reset depth
                this.enemyContainers[idx].setDepth(0);

                if (this.battleState.playerHp <= 0) {
                    this.setPhase('defeat');
                } else {
                    // Check if there are more enemies to attack
                    const nextEnemyIdx = this.findNextAliveEnemy(idx);
                    if (nextEnemyIdx >= 0) {
                        // More enemies to attack
                        this.currentAttackingEnemyIndex = nextEnemyIdx;
                        this.time.delayedCall(300, () => this.playEnemyAttack());
                    } else {
                        // All enemies have attacked, back to player turn
                        this.battleState.turnCount++;
                        this.setPhase('player_turn');
                    }
                }
            }
        });
    }

    private playHeroAttack(): void {
        const idx = this.getCurrentEnemyIndex();
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const enemyHpBar = this.enemyHpBars[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];

        const startX = this.heroContainer.x;
        const startY = this.heroContainer.y;
        // Move to enemy's actual position (offset slightly to the left)
        const targetX = enemyContainer.x - 50;
        const targetY = enemyContainer.y;

        // Hero appears on top during attack
        this.heroContainer.setDepth(10);

        // Start animation immediately
        this.hero.play(this.playerSpriteConfig.attackAnim);

        // Get movement data from animation definition
        const attackAnim = this.animationDefs[this.playerSpriteConfig.attackAnim];
        const movement = attackAnim?.movement;
        const jumpDuration = movement?.duration || 400;
        const jumpOffsetY = movement?.offsetY || 0;
        const jumpEase = movement?.ease || 'Power1';
        const returnEase = movement?.returnEase || 'Power2';

        // X movement (horizontal dash to enemy)
        this.tweens.add({
            targets: this.heroContainer,
            x: targetX,
            duration: jumpDuration,
            ease: jumpEase,
        });

        // Y movement with jump arc (if movement type is 'jump')
        if (movement?.type === 'jump' && jumpOffsetY !== 0) {
            // Jump up during first half, land at target during second half
            this.tweens.add({
                targets: this.heroContainer,
                y: startY + jumpOffsetY,  // Jump up (negative offset = up)
                duration: jumpDuration / 2,
                ease: jumpEase,
                onComplete: () => {
                    this.tweens.add({
                        targets: this.heroContainer,
                        y: targetY,
                        duration: jumpDuration / 2,
                        ease: returnEase,
                    });
                }
            });
        } else {
            // No jump - just move directly to target Y
            this.tweens.add({
                targets: this.heroContainer,
                y: targetY,
                duration: jumpDuration,
                ease: jumpEase,
            });
        }

        // After reaching enemy position, apply damage
        this.time.delayedCall(jumpDuration, () => {
            // Apply damage (damageDealt from math problems)
            const damage = this.battleState.damageDealt;
            const enemy = this.battleState.enemies[idx];
            enemy.hp -= damage;

            // Check for Last Stand ability (boss survives with 1 HP once)
            if (this.isBoss && enemy.hp <= 0 &&
                this.currentPhaseAbility === 'last_stand' && !this.lastStandTriggered) {
                enemy.hp = 1;
                this.lastStandTriggered = true;
                this.showAbilityText('🛡️ Last Stand! Survived with 1 HP!');
            }

            this.updateHpBar(enemyHpBar, enemy.hp, enemy.maxHp);

            // Show damage number (use container position for world coords)
            const dmgText = this.add.text(enemyContainer.x, enemyContainer.y - 50, `-${damage}`, {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#ff4444',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5);

            this.tweens.add({
                targets: dmgText,
                y: dmgText.y - 40,
                alpha: 0,
                duration: 800,
                onComplete: () => dmgText.destroy(),
            });

            // Enemy hit effect
            const hurtAnimKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'hurt') : `${animPrefix}-hurt`;
            enemySprite.play(hurtAnimKey);
            enemySprite.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.tint) {
                    enemySprite.setTint(this.bossPhaseAnimOverrides.tint);
                } else {
                    enemySprite.clearTint();
                }
            });
            enemySprite.once('animationcomplete', () => {
                if (enemy.hp > 0) {
                    const idleAnimKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
                    enemySprite.play(idleAnimKey);
                }
            });

            // Wait for animation to finish
            this.hero.once('animationcomplete', () => {
                this.hero.play(this.playerSpriteConfig.idleAnim);

                // Return: jump arc back to start
                if (movement?.type === 'jump' && jumpOffsetY !== 0) {
                    // Jump up then land at start
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
                        }
                    });
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroReturn(idx, enemy, enemySprite, animPrefix)
                    });
                } else {
                    // Slide back (move container)
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX,
                        y: startY,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroReturn(idx, enemy, enemySprite, animPrefix)
                    });
                }
            });
        });
    }

    private finishHeroReturn(idx: number, enemy: BattleEnemy, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string): void {
        // Reset depth
        this.heroContainer.setDepth(0);

        // Check if ANY enemy is alive (not just the target) and pet is equipped
        const anyEnemyAlive = this.battleState.enemies.some(e => e.hp > 0);
        if (anyEnemyAlive && this.equippedPetDef && this.petContainer) {
            // If the targeted enemy died, play its death animation before pet turn
            if (enemy.hp <= 0) {
                this.playEnemyDeathAndFade(idx, enemySprite, animPrefix, () => {
                    this.setPhase('pet_turn');
                });
            } else {
                this.setPhase('pet_turn');
            }
        } else {
            this.continueAfterAttack(idx, enemy, enemySprite, animPrefix);
        }
    }

    private playEnemyDeathAndFade(idx: number, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string, onComplete: () => void): void {
        if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
            this.playBossDeathSequence(idx, enemySprite, onComplete);
        } else {
            const deathKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
            enemySprite.play(deathKey);
            enemySprite.once('animationcomplete', () => {
                this.tweens.add({
                    targets: this.enemyContainers[idx],
                    alpha: 0,
                    duration: 500,
                    onComplete: () => onComplete(),
                });
            });
        }
    }

    private continueAfterAttack(idx: number, enemy: BattleEnemy, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string): void {
        if (enemy.hp <= 0) {
            if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
                this.playBossDeathSequence(idx, enemySprite, () => {
                    this.checkVictoryOrContinue();
                });
            } else {
                const deathKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
                enemySprite.play(deathKey);
                enemySprite.once('animationcomplete', () => {
                    this.time.delayedCall(1000, () => {
                        this.tweens.add({
                            targets: this.enemyContainers[idx],
                            alpha: 0,
                            duration: 500,
                            onComplete: () => {
                                this.checkVictoryOrContinue();
                            }
                        });
                    });
                });
            }
        } else {
            this.setPhase('enemy_turn');
        }
    }

    private playHeroMiss(): void {
        // Show "MISS" text
        const missText = this.add.text(this.heroContainer.x, this.heroContainer.y - 50, 'VEDLE!', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: missText,
            y: missText.y - 40,
            alpha: 0,
            duration: 800,
            onComplete: () => {
                missText.destroy();
                this.setPhase('enemy_turn');
            }
        });
    }

    private playEnemyAttack(): void {
        const idx = this.currentAttackingEnemyIndex;
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];
        const enemyDef = this.battleState.enemies[idx];

        const startX = enemyContainer.x;
        const startY = enemyContainer.y;
        const targetX = this.heroContainer.x + 50;
        const targetY = this.heroContainer.y;

        // Store start position for return after attack
        this.enemyAttackStartPosition = { x: startX, y: startY };

        // Get enemy attack animation movement data
        const attackDefKey = (this.isBoss && idx === 0) ? this.getBossAttackAnimDefKey(0) : `${animPrefix}-attack-anim`;
        const attackAnim = this.animationDefs[attackDefKey];
        const movement = attackAnim?.movement;
        const moveDuration = movement?.duration || 400;
        const moveEase = movement?.ease || 'Power1';

        // Enemy appears on top
        enemyContainer.setDepth(10);

        // Play attack animation immediately during approach
        const attackAnimName = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'attack') : `${animPrefix}-attack`;
        if (this.anims.exists(attackAnimName)) {
            enemySprite.play(attackAnimName);
        }

        // Clear previous tweens array
        this.enemyAttackTweens = [];

        // Horizontal movement to hero
        const xTween = this.tweens.add({
            targets: enemyContainer,
            x: targetX,
            duration: moveDuration,
            ease: moveEase,
        });
        this.enemyAttackTweens.push(xTween);

        // Vertical movement based on movement type
        if (movement?.type === 'jump') {
            // Jump arc - simplified for pausable tween
            const jumpOffsetY = movement.offsetY || -40;
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: [startY + jumpOffsetY, targetY],
                duration: moveDuration,
                ease: 'Sine.easeInOut',
            });
            this.enemyAttackTweens.push(yTween);
        } else if (movement?.type === 'bounce') {
            // Bouncy hop - simplified
            const bounceOffsetY = movement.offsetY || -30;
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: [startY + bounceOffsetY, targetY],
                duration: moveDuration,
                ease: 'Bounce.easeOut',
            });
            this.enemyAttackTweens.push(yTween);
        } else {
            // Default/dash: direct movement
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: targetY,
                duration: moveDuration,
                ease: moveEase,
            });
            this.enemyAttackTweens.push(yTween);
        }

        // Mid-attack: pause and show block phase (100ms into movement)
        this.time.delayedCall(100, () => {
            // Pause all attack tweens
            this.enemyAttackTweens.forEach(t => t.pause());

            // Pause enemy sprite animation
            enemySprite.anims.pause();

            // Pause hero sprite animation
            this.hero.anims.pause();

            // Store resume callback for after block phase
            this.blockPhaseResumeCallback = () => {
                // Resume tweens
                this.enemyAttackTweens.forEach(t => t.resume());

                // Resume animations
                enemySprite.anims.resume();
                this.hero.anims.resume();

                // After remaining movement completes, brief pause then return
                this.time.delayedCall(moveDuration - 100, () => {
                    // Brief pause at hero (100ms), then return to idle and go back
                    this.time.delayedCall(100, () => {
                        const returnIdleKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
                        enemySprite.play(returnIdleKey);
                        // Return enemy to start position
                        this.returnEnemyToPosition(idx);
                    });
                });
            };

            // Calculate enemy damage with Vengeful Strike ability
            let damage = enemyDef.attack;
            if (this.currentPhaseAbility === 'vengeful_strike' && !this.lastAnswerCorrect) {
                damage += 1;
                this.showAbilityText('💢 Vengeful Strike! +1 damage');
            }

            // Start block phase
            this.startBlockPhase(damage);
        });
    }

    /**
     * Show ability text announcement
     */
    private showAbilityText(text: string): void {
        const abilityText = this.add.text(640, 200, text, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6644',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

        // Animate in
        abilityText.setAlpha(0);
        abilityText.setScale(0.5);
        this.tweens.add({
            targets: abilityText,
            alpha: 1,
            scale: 1,
            duration: 300,
            ease: 'Back.out',
            onComplete: () => {
                // Hold then fade out
                this.time.delayedCall(1000, () => {
                    this.tweens.add({
                        targets: abilityText,
                        alpha: 0,
                        y: abilityText.y - 30,
                        duration: 400,
                        onComplete: () => abilityText.destroy()
                    });
                });
            }
        });
    }

    /**
     * Return enemy to their starting position after attack
     */
    private returnEnemyToPosition(idx: number): void {
        const enemyContainer = this.enemyContainers[idx];

        // Use cached spawn points for accurate return position
        const enemyPos = this.cachedSpawnPoints?.enemies[idx];
        const startX = enemyPos?.x ?? this.enemyAttackStartPosition.x;
        const startY = enemyPos?.y ?? this.enemyAttackStartPosition.y;

        this.tweens.add({
            targets: enemyContainer,
            x: startX,
            y: startY,
            duration: 300,
            ease: 'Power1',
            onComplete: () => {
                enemyContainer.setDepth(0);

                // Check if player was defeated
                if (this.battleState.playerHp <= 0) {
                    this.setPhase('defeat');
                } else {
                    // Check if there are more enemies to attack
                    const nextEnemyIdx = this.findNextAliveEnemy(idx);
                    if (nextEnemyIdx >= 0) {
                        // More enemies to attack
                        this.currentAttackingEnemyIndex = nextEnemyIdx;
                        this.time.delayedCall(300, () => this.playEnemyAttack());
                    } else {
                        // All enemies have attacked, back to player turn
                        this.battleState.turnCount++;
                        this.setPhase('player_turn');
                    }
                }
            }
        });
    }

    private onVictory(): void {
        // Record fight end for mastery system (updates fightsSinceSeen counters)
        MasterySystem.getInstance().recordFightEnd();

        // Victory fanfare
        const victoryText = this.add.text(640, 300, 'VÍTĚZSTVÍ!', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: victoryText,
            alpha: 1,
            scale: 1,
            duration: 500,
            ease: 'Back.out'
        });

        // Calculate rewards
        const player = this.gameState.getPlayer();

        // Calculate total coins from all defeated enemies
        let totalCoins = 0;
        this.enemyDefs.forEach(def => {
            // goldReward is [min, max], for fixed values they're equal
            const minReward = def.goldReward[0];
            const maxReward = def.goldReward[1];
            totalCoins += Phaser.Math.Between(minReward, maxReward);
        });

        // Update player state - award coins
        ProgressionSystem.awardBattleCoin(player, totalCoins);  // Award coins from all enemies
        player.hp = this.battleState.playerHp; // Persist HP loss

        // === CRYSTAL DROPS (arena + non-arena) ===
        const crystalDrops: Crystal[] = [];
        const crystalLabels: string[] = [];
        let crystalOverflow = false;

        if (this.fromArena) {
            // Determine if this was a perfect wave (no wrong answers)
            const isPerfect = this.waveWrongAnswerCount === 0;

            // Initialize waveResults array if needed
            if (!player.arena.waveResults) {
                player.arena.waveResults = [];
            }

            // Get previous best result for this wave (if any)
            const prevResult = player.arena.waveResults[this.arenaWave];
            const wasCompletedBefore = prevResult?.completed || false;
            const wasPerfectBefore = prevResult?.perfectWave || false;

            // Calculate crystal reward based on IMPROVEMENT only:
            // - First completion: +1 base crystal
            // - First perfect: +1 bonus crystal
            let crystalsToAward = 0;
            if (!wasCompletedBefore) {
                crystalsToAward += 1;  // Base crystal for first completion

                // Track town progression - only on first-time wave completions
                if (!player.townProgress) player.townProgress = createInitialTownProgress();
                player.townProgress.totalWavesCompleted += 1;
            }
            if (isPerfect && !wasPerfectBefore) {
                crystalsToAward += 1;  // Bonus crystal for achieving perfect
            }

            // Update wave result - store BEST result (perfectWave = true if ever achieved)
            const newPerfectStatus = isPerfect || wasPerfectBefore;
            const totalCrystalsEarned = (prevResult?.crystalsEarned || 0) + crystalsToAward;

            player.arena.waveResults[this.arenaWave] = {
                completed: true,
                perfectWave: newPerfectStatus,
                crystalsEarned: totalCrystalsEarned
            };

            // Debug: Log what we're saving
            console.log('[BattleScene] Wave result:', {
                wave: this.arenaWave,
                isPerfect,
                wasCompletedBefore,
                wasPerfectBefore,
                crystalsToAward,
                totalCrystalsEarned,
                waveResults: JSON.stringify(player.arena.waveResults)
            });

            // Wave crystal drops (after each wave except the last)
            // Generate SEPARATE crystals for base and perfect rewards
            if (this.arenaWave < 4) {
                if (!wasCompletedBefore) {
                    const baseCrystal = CrystalSystem.generateCrystal('shard', 1);
                    const added = CrystalSystem.addToInventory(player, baseCrystal);
                    if (added) { crystalDrops.push(baseCrystal); crystalLabels.push('Za první porážku'); }
                    else { CrystalSystem.addToGroundDrops(player, [baseCrystal]); crystalOverflow = true; }
                }
                if (isPerfect && !wasPerfectBefore) {
                    const perfectCrystal = CrystalSystem.generateCrystal('shard', 1);
                    const added = CrystalSystem.addToInventory(player, perfectCrystal);
                    if (added) { crystalDrops.push(perfectCrystal); crystalLabels.push('Za bezchybný souboj!'); }
                    else { CrystalSystem.addToGroundDrops(player, [perfectCrystal]); crystalOverflow = true; }
                }
            }

            // Arena completion crystal (wave 5, index 4)
            if (this.arenaWave >= 4) {
                // Completion bonus crystal
                const completionCrystal = CrystalSystem.generateCrystal('shard', Phaser.Math.Between(4, 6));
                const added = CrystalSystem.addToInventory(player, completionCrystal);
                if (added) {
                    crystalDrops.push(completionCrystal);
                    crystalLabels.push('Za dokončení arény');
                } else {
                    CrystalSystem.addToGroundDrops(player, [completionCrystal]);
                    crystalOverflow = true;
                }

                // Arena 2 special: only the special porcupine crystal for pet_porcupine2 binding
                if (this.arenaLevel === 2) {
                    const specialCrystal = CrystalSystem.generateCrystal('special_porcupine' as CrystalTier, 1);
                    const addedSpecial = CrystalSystem.addToInventory(player, specialCrystal);
                    if (addedSpecial) {
                        crystalDrops.push(specialCrystal);
                        crystalLabels.push('Speciální krystal');
                    } else {
                        CrystalSystem.addToGroundDrops(player, [specialCrystal]);
                        crystalOverflow = true;
                    }
                }
            }

        }

        // === FIRST DEFEAT & PERFECT TRACKING ===
        const primaryEnemy = this.enemyDefs[0];
        const isFirstDefeat = !player.unlockedPets.includes(primaryEnemy.id);
        const isPerfectDefeat = this.waveWrongAnswerCount === 0;
        player.perfectDefeats ??= [];
        const wasPerfectBefore = player.perfectDefeats.includes(primaryEnemy.id);

        // Check for pet unlocks from defeated enemies
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const newPetUnlocks: string[] = [];
        let unlockedPetData: { name: string; spriteKey: string; animPrefix: string } | null = null;

        this.enemyDefs.forEach(def => {
            if (!player.unlockedPets.includes(def.id)) {
                player.unlockedPets.push(def.id);
                // Find corresponding pet
                const pet = petsData.find(p => p.unlockedByEnemy === def.id);
                if (pet) {
                    newPetUnlocks.push(pet.name);
                    if (!unlockedPetData) {
                        unlockedPetData = {
                            name: pet.name,
                            spriteKey: pet.spriteKey,
                            animPrefix: pet.animPrefix
                        };
                    }
                }
            }
        });

        // === NON-ARENA CRYSTAL REWARDS ===
        if (!this.fromArena) {
            // Base crystal for first defeat
            if (isFirstDefeat) {
                const baseCrystal = CrystalSystem.generateCrystal('shard', 1);
                const added = CrystalSystem.addToInventory(player, baseCrystal);
                if (added) { crystalDrops.push(baseCrystal); crystalLabels.push('Za první porážku'); }
                else { CrystalSystem.addToGroundDrops(player, [baseCrystal]); crystalOverflow = true; }
            }
            // Bonus crystal for first perfect (including on repeat if perfect wasn't achieved before)
            if (isPerfectDefeat && !wasPerfectBefore) {
                const bonusCrystal = CrystalSystem.generateCrystal('shard', 1);
                const added = CrystalSystem.addToInventory(player, bonusCrystal);
                if (added) { crystalDrops.push(bonusCrystal); crystalLabels.push('Za bezchybný souboj!'); }
                else { CrystalSystem.addToGroundDrops(player, [bonusCrystal]); crystalOverflow = true; }
                player.perfectDefeats.push(primaryEnemy.id);
            }
        }

        // Save game
        this.gameState.save();

        this.time.delayedCall(2000, () => {
            console.log('[BattleScene] Victory transition:', {
                fromArena: this.fromArena,
                journeyMode: this.journeyMode,
                returnScene: this.returnScene,
                arenaLevel: this.arenaLevel,
                arenaWave: this.arenaWave
            });
            if (this.fromArena) {
                // Check if this was the last wave (wave 5, index 4)
                if (this.arenaWave >= 4) {
                    // Track arena level completion
                    if (!player.arena.completedArenaLevels) {
                        player.arena.completedArenaLevels = [];
                    }
                    if (!player.arena.completedArenaLevels.includes(this.arenaLevel)) {
                        player.arena.completedArenaLevels.push(this.arenaLevel);

                        // Award arena completion coin bonus
                        const arenaBonus: Record<number, number> = { 1: 15, 2: 30, 3: 45 };
                        const bonus = arenaBonus[this.arenaLevel] ?? 15;
                        ProgressionSystem.awardBattleCoin(player, bonus);

                        // Always add arena_level_X unlock key when completing arena X
                        const arenaUnlockKey = `arena_level_${this.arenaLevel}`;
                        if (!player.unlockedPets.includes(arenaUnlockKey)) {
                            player.unlockedPets.push(arenaUnlockKey);
                        }

                        // Check for pet unlocks by arena level completion
                        petsData.forEach(pet => {
                            if (pet.unlockedByArenaLevel === this.arenaLevel) {
                                newPetUnlocks.push(pet.name);
                            }
                            if (pet.unlockedByArenaLevels) {
                                const allLevelsCompleted = pet.unlockedByArenaLevels.every(
                                    level => player.unlockedPets.includes(`arena_level_${level}`)
                                );
                                if (allLevelsCompleted && pet.unlockedByArenaLevels.includes(this.arenaLevel)) {
                                    newPetUnlocks.push(pet.name);
                                }
                            }
                        });

                        this.gameState.save();
                    }

                    // Arena completed! Go to VictoryScene
                    this.scene.start('VictoryScene', {
                        returnScene: 'TownScene',
                        returnData: {},
                        goldReward: totalCoins,
                        isFirstDefeat,
                        isPerfectDefeat,
                        wasPerfectBefore,
                        unlockedPet: unlockedPetData,
                        enemySpriteKey: primaryEnemy.spriteKey,
                        enemyAnimPrefix: primaryEnemy.animPrefix,
                        crystalDrops,
                        crystalLabels,
                        crystalOverflow,
                        arenaCompleted: true,
                        arenaLevel: this.arenaLevel,
                        nextArenaLevel: this.arenaLevel + 1
                    });
                } else {
                    // Find next wave that isn't already perfected (skip perfect waves)
                    let nextWave: number | null = null;
                    for (let i = this.arenaWave + 1; i < 5; i++) {
                        const r = player.arena.waveResults?.[i];
                        if (!r?.completed || !r?.perfectWave) {
                            nextWave = i;
                            break;
                        }
                    }

                    if (nextWave !== null) {
                        // More waves to play — advance to next non-perfect wave
                        this.scene.start('VictoryScene', {
                            returnScene: 'ArenaScene',
                            returnData: {
                                arenaLevel: this.arenaLevel,
                                wave: nextWave,
                                fromBattle: true
                            },
                            goldReward: totalCoins,
                            isFirstDefeat,
                            isPerfectDefeat,
                            wasPerfectBefore,
                            unlockedPet: unlockedPetData,
                            enemySpriteKey: primaryEnemy.spriteKey,
                            enemyAnimPrefix: primaryEnemy.animPrefix,
                            crystalDrops,
                            crystalLabels,
                            crystalOverflow
                        });
                    } else {
                        // All remaining waves already perfect — arena run complete, return to town
                        this.scene.start('VictoryScene', {
                            returnScene: 'TownScene',
                            returnData: {},
                            goldReward: totalCoins,
                            isFirstDefeat,
                            isPerfectDefeat,
                            wasPerfectBefore,
                            unlockedPet: unlockedPetData,
                            enemySpriteKey: primaryEnemy.spriteKey,
                            enemyAnimPrefix: primaryEnemy.animPrefix,
                            crystalDrops,
                            crystalLabels,
                            crystalOverflow
                        });
                    }
                }
            } else {
                // Route ALL non-arena victories through VictoryScene
                this.scene.start('VictoryScene', {
                    returnScene: this.returnScene,
                    returnData: { battleWon: true, ...this.returnData },
                    goldReward: totalCoins,
                    enemyName: primaryEnemy.name,
                    isFirstDefeat,
                    isPerfectDefeat,
                    wasPerfectBefore,
                    unlockedPet: unlockedPetData,
                    enemySpriteKey: primaryEnemy.spriteKey,
                    enemyAnimPrefix: primaryEnemy.animPrefix,
                    crystalDrops,
                    crystalLabels,
                    crystalOverflow
                });
            }
        });
    }

    /**
     * Show crystal drop notification after arena wave
     */
    private showCrystalDropNotification(crystals: Crystal[], overflow: boolean): void {
        if (crystals.length === 0) return;

        const displayStrings = crystals.map(c => CrystalSystem.getCrystalDisplay(c));
        const text = `+${displayStrings.join(' ')}`;

        const notification = this.add.text(640, 400, text, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

        this.tweens.add({
            targets: notification,
            y: 350,
            alpha: 0,
            duration: 1500,
            delay: 500,
            ease: 'Power2',
            onComplete: () => notification.destroy()
        });

        // Show overflow warning if inventory was full
        if (overflow) {
            const warningText = this.add.text(640, 450, '⚠️ Inventář plný! Krystal zůstal na zemi.', {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffaa44',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setDepth(100);

            this.tweens.add({
                targets: warningText,
                alpha: 0,
                duration: 1000,
                delay: 1500,
                onComplete: () => warningText.destroy()
            });
        }
    }

    private onDefeat(): void {
        // Record fight end for mastery system
        MasterySystem.getInstance().recordFightEnd();

        // Defeat text
        const defeatText = this.add.text(640, 300, 'PORÁŽKA...', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: defeatText,
            alpha: 1,
            scale: 1,
            duration: 500,
            ease: 'Back.out'
        });

        // Penalty
        const player = this.gameState.getPlayer();
        player.hp = 1; // Survive with 1 HP
        player.status = 'přizabitý'; // Injured status
        this.gameState.save();

        this.time.delayedCall(3000, () => {
            // For journey mode, return to map (will handle fail state)
            // Otherwise return to town
            this.scene.start(this.journeyMode ? 'ForestMapScene' : 'TownScene');
        });
    }
}

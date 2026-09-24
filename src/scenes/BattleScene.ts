import { sfx, voice, gameAudio } from '../audio/AudioDirector';
import { getPetAttackPower } from '../systems/CatacombPetProgress';
import Phaser from 'phaser';
import { DEV_TOOLS_ENABLED } from '../config/buildVariant';
import { BattleState, BattlePhase, BattleEnemy, EnemyDefinition, ItemDefinition, PetDefinition, MathProblem, Crystal, PlayerState, PreparationKind } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard, MathBoardRemoteSnapshot } from '../ui/MathBoard';
import { MasterySystem } from '../systems/MasterySystem';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem, createInitialTownProgress } from '../systems/ProgressionSystem';
import { CrystalSystem } from '../systems/CrystalSystem';
import { awardArenaRewardMana } from '../systems/ArenaRewardSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig, PlayerSpriteConfig } from '../utils/characterUtils';
import { PauseMenu, PauseMenuLayout } from '../ui/PauseMenu';
import { TrialFeedbackVisualizer } from '../ui/TrialFeedbackVisualizer';
import { formatMathProblem } from '../utils/formatMathProblem';
import { SpeedChargeBar } from '../ui/SpeedChargeBar';
import { BattleActorStatusHud } from '../ui/BattleActorStatusHud';
import { BattleActionDock, BattleHudPoint } from '../ui/BattleActionDock';
import { BattlePreparationHud } from '../ui/BattlePreparationHud';
import { TurnManager, BattleSceneCallbacks } from '../battle/TurnManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { MasteryData } from '../types';
import { RemoteInputService } from '../remote/RemoteInputService';
import { RemoteAction, RemoteCommand } from '../remote/types';
import { createEncounterCatalog, EncounterCatalog } from '../systems/EncounterCatalog';
import type {
    ArenaCompletionReward,
    ArenaEncounter,
    BossPhaseDefinition,
    ResolvedArenaWave,
    ResolvedJourneyEncounter,
} from '../types/encounters';
import {
    getArenaEncounterResult,
    setArenaEncounterResult,
} from '../systems/ArenaProgressSystem';
import {
    findNextArenaWaveForChoice,
    getArenaChoiceKind,
    type ArenaChoiceKind,
} from '../systems/ArenaChoiceSystem';
import { PREPARATION_CONFIG, PreparationSystem } from '../systems/PreparationSystem';
import { resolveEnemyBattlePresentation } from '../systems/EnemyPresentationSystem';
import {
    damageBonusWouldHelp,
    resolveDamageAfterDefense,
} from '../systems/CombatDamageSystem';
import { applyAttackPowerDistribution as applyConfiguredAttackPower } from '../systems/CombatAttackSystem';
import { JourneySystem } from '../systems/JourneySystem';
import { completeForestGuardianJourneyProgress } from '../systems/ForestCrystalProgression';
import { completeUnderwaterEncounter, hasUnderwaterBlessing } from '../systems/UnderwaterProgressSystem';
import { resolveTidalWave } from '../systems/UnderwaterTidalWave';
import { UnderwaterBossHud } from '../ui/UnderwaterBossHud';
import { StorySystem } from '../systems/StorySystem';
import { applyProblemComplexityDamage } from '../systems/ProblemComplexity';
import { markComparisonStageIntroSeen } from '../systems/ComparisonLearningSystem';
import { calculateShieldAnswerBlock } from '../systems/ShieldBlockSystem';

export class BattleScene extends Phaser.Scene implements BattleSceneCallbacks {
    // Turn management
    private turnManager!: TurnManager;

    // Character containers (sprite + HP bar)
    private heroContainer!: Phaser.GameObjects.Container;
    private enemyContainers: Phaser.GameObjects.Container[] = [];
    private hero!: Phaser.GameObjects.Sprite;
    private enemies: Phaser.GameObjects.Sprite[] = [];
    private heroHpBar!: BattleActorStatusHud;
    private enemyHpBars: BattleActorStatusHud[] = [];

    // UI Components
    private mathBoard!: MathBoard;
    private attackButton!: Phaser.GameObjects.Container;
    private potionButton!: Phaser.GameObjects.Container;
    private blockUI!: Phaser.GameObjects.Container;
    private blockDamageText!: Phaser.GameObjects.Text;
    private blockResultText: Phaser.GameObjects.Text | null = null;
    private blockTimerText!: Phaser.GameObjects.Text;
    private blockAttemptsText!: Phaser.GameObjects.Text;
    private targetIndicator!: Phaser.GameObjects.Image;
    private battleActionDock!: BattleActionDock;
    private battleActionDockFrame: Phaser.GameObjects.Image | null = null;

    // Wrong answer feedback
    private feedbackOverlay!: Phaser.GameObjects.Container;
    private feedbackVisualizer: TrialFeedbackVisualizer | null = null;

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
    private blockTimerEvent: Phaser.Time.TimerEvent | null = null;
    private pendingDamage: number = 0;
    private currentBlockPower: number = 1;
    private mathBoardContext: 'attack' | 'block' | 'pet' | null = null;

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
    private remoteInput = RemoteInputService.getInstance();
    private unsubscribeRemoteCommand: (() => void) | null = null;
    private remoteFeedbackDismiss: (() => void) | null = null;

    // Cached spawn points for battle positioning
    private cachedSpawnPoints: {
        player: { x: number; y: number };
        pet: { x: number; y: number };
        enemies: { x: number; y: number }[];
    } | null = null;

    // Y-based depth sorting for 2.5D visual layering
    private static readonly ATTACK_DEPTH = 45;
    private entityRestingDepths: Map<Phaser.GameObjects.Container, number> = new Map();

    // Pet companion
    private petContainer: Phaser.GameObjects.Container | null = null;
    private petSprite: Phaser.GameObjects.Sprite | null = null;
    private equippedPetDef: PetDefinition | null = null;

    // Pet turn system
    private petTargetIndex: number = 0;
    private petMathProblem: MathProblem | null = null;
    private petAttackDamage = 0;
    private petAttackButton!: Phaser.GameObjects.Container;
    private petTargetIndicator: Phaser.GameObjects.Image | null = null;
    private petTargetIndicatorTween: Phaser.Tweens.Tween | null = null;

    // Active character highlighting
    private activeHighlight: Phaser.GameObjects.Graphics | null = null;
    private activeHighlightTween: Phaser.Tweens.Tween | null = null;

    // Co-op: Player B state
    private currentEnemyAttackTarget: 'A' | 'B' = 'A';  // Which player the enemy is attacking
    private isCoopMode: boolean = false;
    private coopSession: CoopSessionManager | null = null;
    private coopMasteryA: MasteryData | null = null;
    private coopMasteryB: MasteryData | null = null;
    private heroBContainer: Phaser.GameObjects.Container | null = null;
    private heroB: Phaser.GameObjects.Sprite | null = null;
    private heroBHpBar: BattleActorStatusHud | null = null;
    private heroBSpriteConfig: PlayerSpriteConfig | null = null;
    private coopTurnLabel: Phaser.GameObjects.Text | null = null;
    private petBContainer: Phaser.GameObjects.Container | null = null;
    private petBSprite: Phaser.GameObjects.Sprite | null = null;
    private equippedPetBDef: PetDefinition | null = null;
    private speedChargeBarB: SpeedChargeBar | null = null;
    private preparationIndicatorA: BattlePreparationHud | null = null;
    private preparationIndicatorB: BattlePreparationHud | null = null;
    private playerBFallen: boolean = false;

    constructor() {
        super({ key: 'BattleScene' });
    }

    // Arena mode data
    private fromArena: boolean = false;
    private arenaLevel: number = 1;
    private arenaWave: number = 0;
    private waveWrongAnswerCount: number = 0;
    private encounterCatalog: EncounterCatalog | null = null;
    private arenaDefinition: ArenaEncounter | null = null;
    private resolvedEncounter: ResolvedArenaWave | null = null;
    private resolvedJourneyEncounter: ResolvedJourneyEncounter | null = null;
    private encounterId: string | null = null;
    private arenaChoiceId: string | null = null;
    private arenaChoiceKind: ArenaChoiceKind | null = null;
    private arenaExitScene: string = 'TownScene';
    private arenaStory: 'silverpond-lake-fairy' | null = null;

    // Speed charge bar (accumulates charges from fast answers, +1 damage per 4 charges)
    private speedChargeBar!: SpeedChargeBar;

    // Enemy attack tween tracking for mid-attack pause
    private enemyAttackTweens: Phaser.Tweens.Tween[] = [];
    private blockPhaseResumeCallback?: () => void;
    private enemyAttackStartPosition: { x: number; y: number } = { x: 0, y: 0 };

    // Journey mode data
    private journeyMode: boolean = false;
    private returnScene: string = 'TownScene';
    private returnData: Record<string, unknown> = {};
    private backgroundKey: string | null = null;
    private mockMode: boolean = false;
    private storyVictory: 'forest-crystal' | null = null;
    private ritualBossAttackReduction: number = 0;
    private mockProblemCursor: number = 0;

    // Boss battle data
    private isBoss: boolean = false;
    private bossPhases: BossPhaseDefinition[] = [];
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
    private depthBossHud?: UnderwaterBossHud;
    private tidalAttacks = { A: 0, B: 0 };
    private tidalBlessing = { A: false, B: false };
    private depthPlayerMaxHp = 0;

    init(data: { 
        enemyId?: string; 
        enemyDefs?: EnemyDefinition[]; 
        fromArena?: boolean; 
        arenaLevel?: number; 
        wave?: number;
        encounterId?: string;
        arenaChoiceId?: string | null;
        arenaExitScene?: string;
        arenaStory?: 'silverpond-lake-fairy';
        mode?: string;
        returnScene?: string;
        returnData?: Record<string, unknown>;
        backgroundKey?: string;
        enemy?: string;
        mockMode?: boolean;
        storyVictory?: 'forest-crystal';
        ritualBossAttackReduction?: number;
        comparisonTest?: boolean;
    }): void {
        // Get global game state
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();
        this.mockMode = data.mockMode === true;
        this.storyVictory = data.storyVictory ?? null;
        this.ritualBossAttackReduction = Math.max(0, data.ritualBossAttackReduction ?? 0);
        this.mockProblemCursor = 0;

        // Detect co-op mode
        this.coopSession = CoopSessionManager.getInstance();
        this.isCoopMode = !this.mockMode && this.coopSession.isCoopActive();
        this.playerBFallen = false;

        // Store journey mode data
        this.journeyMode = data.mode === 'journey';
        this.returnScene = data.returnScene || 'TownScene';
        this.returnData = data.returnData || {};
        this.backgroundKey = data.backgroundKey || null;

        // Store arena data if coming from arena
        this.fromArena = data.fromArena === true;
        this.arenaLevel = data.arenaLevel ?? 1;
        this.arenaWave = data.wave ?? 0;
        this.waveWrongAnswerCount = 0;
        this.encounterCatalog = null;
        this.arenaDefinition = null;
        this.resolvedEncounter = null;
        this.resolvedJourneyEncounter = null;
        this.encounterId = data.encounterId ?? null;
        this.arenaChoiceId = data.arenaChoiceId ?? null;
        this.arenaChoiceKind = getArenaChoiceKind(this.arenaChoiceId);
        this.arenaExitScene = data.arenaExitScene ?? 'TownScene';
        this.arenaStory = data.arenaStory ?? null;

        // Reset boss state (in case previous battle was a boss)
        this.isBoss = false;
        this.bossPhases = [];
        this.currentBossPhase = 0;
        this.bossPhaseHealPlayer = 0;
        this.bossPhaseAnimOverrides = {};
        this.currentPhaseAbility = null;
        this.lastAnswerCorrect = true;
        this.lastStandTriggered = false;

        this.depthBossHud = undefined;
        this.tidalAttacks = { A: 0, B: 0 };
        this.tidalBlessing = { A: false, B: false };

        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        this.encounterCatalog = createEncounterCatalog(this.cache.json.get('encounters'), {
            core: enemies,
        });

        // Every arena battle resolves from encounters.json. Legacy callers may
        // still provide arenaLevel + wave, but never their own enemy roster.
        if (this.fromArena) {
            const wave = this.encounterId
                ? this.encounterCatalog.getWaveById(this.encounterId)
                : this.encounterCatalog.getWave(this.arenaLevel, this.arenaWave);
            const arena = this.encounterId
                ? this.encounterCatalog.getArenaLevels()
                    .map(level => this.encounterCatalog!.getArena(level))
                    .find(candidate => candidate.waves.some(candidateWave => candidateWave.id === wave.id))
                : this.encounterCatalog.getArena(this.arenaLevel);
            if (!arena) {
                throw new Error(`Encounter ${wave.id} is not part of an arena`);
            }

            this.encounterId = wave.id;
            this.arenaDefinition = arena;
            this.arenaLevel = arena.level;
            this.arenaWave = wave.index;
            this.resolvedEncounter = this.encounterCatalog.resolveArenaWave({
                arenaLevel: arena.level,
                waveIndex: wave.index,
                mode: this.isCoopMode ? 'coop' : 'solo',
            });
            this.enemyDefs = this.resolvedEncounter.enemies;
        } else if (this.encounterId) {
            this.resolvedJourneyEncounter = this.encounterCatalog.resolveJourneyEncounter(
                this.encounterId,
                this.isCoopMode ? 'coop' : 'solo',
            );
            this.enemyDefs = this.resolvedJourneyEncounter.enemies;
            const boss = this.resolvedJourneyEncounter.boss;
            if (boss) {
                this.isBoss = true;
                this.bossPhases = [...boss.phases];
                this.bossPhaseHealPlayer = boss.phaseHealPlayer;
                const firstPhase = this.bossPhases[0];
                this.currentPhaseAbility = firstPhase.ability || null;
                this.applyBossPhaseOverrides(firstPhase);
                console.log(
                    `[BattleScene] Encounter boss ${this.encounterId}: ${this.bossPhases.length} phases, starting ${firstPhase.nameCs}`,
                );
            }
        // Non-arena battles may still supply pre-resolved or single-enemy data.
        } else if (data.enemyDefs && data.enemyDefs.length > 0) {
            this.enemyDefs = data.enemyDefs;
        } else {
            const enemyId = data.enemyId || data.enemy || 'slime_green';
            const enemy = enemies?.find(e => e.id === enemyId);
            this.enemyDefs = [enemy || enemies?.[0]];
        }

        // Co-op: scale enemies for 2-player difficulty
        if (!this.resolvedEncounter && !this.resolvedJourneyEncounter && this.isCoopMode && this.coopSession) {
            this.enemyDefs = this.coopSession.getCoopEnemyDefs(this.enemyDefs, this.isBoss);
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
            attack: Math.max(0, def.attack - (index === 0 ? this.ritualBossAttackReduction : 0)),
            defense: def.defense,
        }));

        // Initialize battle state
        this.battleState = {
            phase: 'start',
            playerHp: this.mockMode ? player.maxHp : player.hp,
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
        } else if (this.fromArena) {
            const arenaTextureKey = `arena-${this.arenaLevel}-bg`;
            if (this.textures.exists(arenaTextureKey)) {
                const bg = this.add.image(640, 360, arenaTextureKey);
                bg.setDepth(-5);
                bg.setDisplaySize(1280, 720);
            }
        }
        if (this.mockMode) {
            this.cameras.main.fadeIn(260, 0, 0, 0);
        }

        const player = this.gameState.getPlayer();

        // Get spawn points from scene-layouts.json (preferred) or fallback to zones
        const enemyCount = this.battleState.enemies.length;
        const spawnPoints = this.sceneBuilder.getSpawnPoints(undefined, enemyCount, this.isCoopMode);
        const referenceSpawnPoints = this.sceneBuilder.getSpawnPoints(undefined, 3, true);

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

        // Create the hero independently from the UI-layer status plate. The
        // plate follows this container during attacks and knockback.
        this.heroContainer = this.add.container(heroX, heroY);
        this.hero = this.add.sprite(0, 0, this.playerSpriteConfig.idleTexture)
            .setScale(heroScale)
            .play(this.playerSpriteConfig.idleAnim);
        this.heroContainer.add(this.hero);
        const referencePlayer = referenceSpawnPoints?.player ?? { x: 239, y: 445 };
        this.heroHpBar = this.createActorStatusHud(
            'battlePlayerStatusHostA',
            this.heroContainer,
            this.hero,
            referencePlayer,
            this.battleState.playerHp,
            player.maxHp,
            0x50d95b,
            'player',
            true,
            0xffb52c,
            200,
        );
        this.speedChargeBar = this.heroHpBar.speedChargeBar!;

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

        // Co-op: Create Player B's hero and pet
        this.heroBContainer = null;
        this.heroB = null;
        this.heroBHpBar = null;
        this.heroBSpriteConfig = null;
        this.petBContainer = null;
        this.petBSprite = null;
        this.equippedPetBDef = null;
        this.speedChargeBarB = null;
        this.preparationIndicatorA = null;
        this.preparationIndicatorB = null;

        if (this.isCoopMode && this.coopSession) {
            this.createPlayerBHero(spawnPoints, referenceSpawnPoints);
            this.coopMasteryA = this.coopSession.getPlayerAMasteryData();
            this.coopMasteryB = this.coopSession.getPlayerBMasteryData();
        }

        this.createPreparationIndicators();

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

            const presentation = resolveEnemyBattlePresentation(def, { x, y });

            // Use the texture that actually exists (might be fallback)
            const actualSpriteKey = this.textures.exists(def.spriteKey) ? def.spriteKey : 'slime-sheet';

            const container = this.add.container(presentation.x, presentation.y);
            const idleAnimKey = (this.isBoss && index === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
            const sprite = this.add.sprite(0, 0, actualSpriteKey).setScale(presentation.scale).play(idleAnimKey);
            sprite.setData('frameTopInset', def.frameTopInset ?? 0);
            container.add(sprite);
            container.setData('origFrameW', sprite.width);

            const referenceEnemy = referenceSpawnPoints?.enemies[index] ?? { x, y };
            const hpBar = this.createActorStatusHud(
                `battleEnemyStatusHost${index + 1}`,
                container,
                sprite,
                referenceEnemy,
                enemy.hp,
                enemy.maxHp,
                0xf05b64,
                'enemy',
                false,
                undefined,
                200,
            );

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

        // Scene-editor hosts represent every supported layout. Remove the
        // variants that are inactive in this concrete battle so they never
        // leak through as empty decorative frames.
        if (!this.isCoopMode) {
            this.sceneBuilder.get('battlePlayerStatusHostB')?.destroy();
        }
        for (let index = enemyCount; index < 4; index++) {
            this.sceneBuilder.get(`battleEnemyStatusHost${index + 1}`)?.destroy();
        }

        // Assign Y-based depths for correct 2.5D layering
        this.assignYBasedDepths();

        // The approved sword marker remains bound to the selected status plate.
        const markerHost = this.sceneBuilder.get<Phaser.GameObjects.Image>('battleTargetSwordHost');
        this.targetIndicator = markerHost ?? this.add.image(0, 0, 'prep-sword-normal-v2');
        this.targetIndicator
            .setDisplaySize(markerHost?.displayWidth || 58, markerHost?.displayHeight || 58)
            .setAngle(markerHost?.angle ?? 135)
            .setDepth(markerHost?.depth ?? 83);
        this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followTargetIndicator, this);

        this.updateTargetIndicator();

        // Create pet target indicator (green-tinted sword for pet's target)
        this.petTargetIndicator = this.add.image(0, 0, 'prep-sword-active-v2')
            .setDisplaySize(52, 52)
            .setAngle(135)
            .setTint(0x8cff79)
            .setDepth(83)
            .setVisible(false);

        // Set player level in registry for MathEngine's adaptive difficulty
        this.registry.set('playerLevel', player.level);

        // Initialize systems
        this.mathEngine = new MathEngine(this.registry);

        // One shared board owns each complete attack batch; pets can still use showSingle.
        this.mathBoard = new MathBoard(this, this.onMathComplete.bind(this));
        this.mathBoard.setActiveProblemChangedCallback((snapshot) => {
            // A previous block's floating result must not cover a new question.
            if (this.blockResultText) {
                this.tweens.killTweensOf(this.blockResultText);
                this.blockResultText.destroy();
                this.blockResultText = null;
            }
            this.publishRemoteMathState(snapshot);
        });
        this.unsubscribeRemoteCommand = this.remoteInput.onCommand((command) => {
            this.handleRemoteCommand(command);
        });

        // Speed charge bar callback: MathBoard delegates charge management to BattleScene
        this.mathBoard.setSpeedChargeCallback((charges, _type) => {
            // Don't accumulate charges during block phase — block has its own quick-block bonus
            if (this.isBlockPhase) return 0;

            // Use the correct player's speed charge bar in co-op
            const isPlayerB = this.isCoopMode && this.coopSession?.getActivePlayer() === 'B';
            const activeBar = (isPlayerB && this.speedChargeBarB) ? this.speedChargeBarB : this.speedChargeBar;
            const result = activeBar.addCharges(charges);
            if (result.bonusDamage > 0) {
                this.showChargeBarFilledEffect(result.bonusDamage);
            }
            return result.bonusDamage;
        });

        // Wrong answer feedback overlay
        this.createFeedbackOverlay();
        this.mathBoard.setOnWrongAnswer((problem: MathProblem, onDismiss: () => void) => {
            this.showWrongAnswerFeedback(problem, onDismiss);
        });
        this.events.on('shutdown', () => {
            this.closeFeedbackOverlay();
            this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followTargetIndicator, this);
            this.unsubscribeRemoteCommand?.();
            this.unsubscribeRemoteCommand = null;
            // Clear mastery data override so MasterySystem reverts to GameStateManager default
            MasterySystem.getInstance().setActiveData(null);
        });

        this.createBattleActionDock();
        this.createBlockUI();

        if (this.resolvedJourneyEncounter?.boss?.tidalWave) {
            this.depthBossHud = new UnderwaterBossHud(this);
            this.depthPlayerMaxHp = player.maxHp;
            this.tidalBlessing.A = hasUnderwaterBlessing(player);
            if (this.isCoopMode && this.coopSession) {
                this.coopSession.activatePlayerB();
                this.tidalBlessing.B = hasUnderwaterBlessing(this.gameState.getPlayer());
                this.coopSession.activatePlayerA();
            }
            this.refreshDepthBossHud();
            this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncDepthBossHud, this);
            this.events.once('shutdown', () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncDepthBossHud, this));
        }

        // Initialize TurnManager
        this.turnManager = new TurnManager(this.battleState, this);

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

    private createActorStatusHud(
        hostId: string,
        anchor: Phaser.GameObjects.Container,
        sprite: Phaser.GameObjects.Sprite,
        referencePoint: { x: number; y: number },
        hp: number,
        maxHp: number,
        color: number,
        kind: 'player' | 'enemy',
        showSpeed: boolean,
        speedTint: number | undefined,
        referenceDisplayHeight: number,
    ): BattleActorStatusHud {
        const authoredHost = this.sceneBuilder.get<Phaser.GameObjects.GameObject & {
            x: number;
            y: number;
            depth: number;
            displayWidth?: number;
            displayHeight?: number;
        }>(hostId);
        const defaultOffsetY = kind === 'enemy'
            ? -121
            : hostId.endsWith('B') ? -169 : -133;
        const x = authoredHost?.x ?? referencePoint.x;
        const y = authoredHost?.y ?? referencePoint.y + defaultOffsetY;
        const depth = authoredHost?.depth ?? 80;
        const frameWidth = authoredHost?.displayWidth || (kind === 'player' ? 150 : 118);
        const frameHeight = authoredHost?.displayHeight || (kind === 'player' ? 34 : 28);
        authoredHost?.destroy();

        return new BattleActorStatusHud(this, {
            anchor,
            sprite,
            x,
            y,
            depth,
            offsetX: x - referencePoint.x,
            offsetY: y - referencePoint.y,
            referenceDisplayHeight,
            kind,
            hp,
            maxHp,
            color,
            showSpeed,
            speedTint,
            frameWidth,
            frameHeight,
            trackWidth: kind === 'player' ? 115 : 86,
            trackHeight: kind === 'player' ? 9 : 7,
            name: hostId,
        });
    }

    private updateHpBar(hpBar: BattleActorStatusHud, hp: number, maxHp: number): void {
        hpBar.setHp(hp, maxHp);
    }

    private consumeHudPoint(id: string, fallback: BattleHudPoint): BattleHudPoint {
        const authored = this.sceneBuilder.get<Phaser.GameObjects.GameObject & {
            x: number;
            y: number;
            depth: number;
            displayWidth?: number;
            displayHeight?: number;
            angle?: number;
            scaleX?: number;
        }>(id);
        const point: BattleHudPoint = {
            x: authored?.x ?? fallback.x,
            y: authored?.y ?? fallback.y,
            depth: authored?.depth ?? fallback.depth,
            width: authored?.displayWidth || fallback.width,
            height: authored?.displayHeight || fallback.height,
            rotation: authored?.angle ?? fallback.rotation,
        };
        authored?.destroy();
        return point;
    }

    private createBattleActionDock(): void {
        this.battleActionDockFrame = this.sceneBuilder.get<Phaser.GameObjects.Image>('battleActionDockFrame') ?? null;
        const layout = {
            potion: this.consumeHudPoint('battlePotionActionHost', {
                x: 499, y: 664, depth: 83, width: 50, height: 50,
            }),
            potionBadge: this.consumeHudPoint('battlePotionBadgeHost', {
                x: 534, y: 677, depth: 84, width: 32, height: 32,
            }),
            attack: this.consumeHudPoint('battleSwordActionHost', {
                x: 640, y: 648, depth: 84, width: 84, height: 84,
            }),
            pet: this.consumeHudPoint('battlePetActionHost', {
                x: 782, y: 660, depth: 83, width: 60, height: 60,
            }),
            petBadge: this.consumeHudPoint('battlePetBadgeHost', {
                x: 822, y: 677, depth: 84, width: 32, height: 32,
            }),
        };
        this.battleActionDock = new BattleActionDock(this, layout, {
            onAttack: () => this.onAttackClicked(),
            onPotion: () => this.usePotion(),
            onPet: () => this.onPetAttackClicked(),
        });
        this.attackButton = this.battleActionDock.attackRoot;
        this.potionButton = this.battleActionDock.potionRoot;
        this.petAttackButton = this.battleActionDock.petRoot;
        this.renderBattleActionDock();
    }

    private renderBattleActionDock(): void {
        if (!this.battleActionDock || !this.battleState) return;
        const phase = this.battleState.phase;
        const visible = phase !== 'victory' && phase !== 'defeat';
        const isPlayerTurn = phase === 'player_turn' || phase === 'player_b_turn';
        const isPetTurn = phase === 'pet_turn' || phase === 'pet_b_turn';
        const activeB = phase.includes('_b_')
            || (this.isCoopMode && this.coopSession?.getActivePlayer() === 'B');
        const petDef = activeB ? this.equippedPetBDef : this.equippedPetDef;
        const petSprite = activeB ? this.petBSprite : this.petSprite;
        const player = this.gameState.getPlayer();

        this.battleActionDockFrame?.setVisible(visible);
        this.battleActionDock.render({
            visible,
            attackEnabled: isPlayerTurn,
            attackEmphasized: isPlayerTurn,
            potionEnabled: isPlayerTurn && !this.mockMode && player.potions > 0,
            potionCount: this.mockMode ? 0 : player.potions,
            petEnabled: isPetTurn,
            petTexture: petDef?.spriteKey ?? null,
            petFrame: petSprite?.frame?.name ?? 0,
            petDamage: petDef?.damageMultiplier ?? 0,
        });
    }

    private createPetCompanion(player: PlayerState, petX: number, petY: number): void {
        // Reset pet references
        this.petContainer = null;
        this.petSprite = null;
        this.equippedPetDef = null;

        if (this.mockMode) return;
        if (!player.activePet) return;

        // Get pet definition
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const petDef = petsData.find(p => p.id === player.activePet);
        if (!petDef) return;

        this.equippedPetDef = { ...petDef, damageMultiplier: getPetAttackPower(petDef, player) };

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
    }

    /**
     * Co-op: Create Player B's hero and pet.
     * Swaps to Player B's context, reads their data, creates sprites, swaps back.
     */
    private createPlayerBHero(spawnPoints: any, referenceSpawnPoints: any): void {
        if (!this.coopSession) return;

        // Swap to Player B to read their data
        this.coopSession.activatePlayerB();
        const playerB = this.gameState.getPlayer();

        // Player B spawn position
        const heroBX = spawnPoints?.playerB?.x ?? 230;
        const heroBY = spawnPoints?.playerB?.y ?? 520;

        // Get Player B's sprite config
        this.heroBSpriteConfig = getPlayerSpriteConfig(playerB.characterType);
        const charactersData = this.cache.json.get('characters') as Array<{ id: string; scale?: number }>;
        const charDefB = charactersData?.find(c => c.id === playerB.characterType);
        const heroScale = (charDefB?.scale ?? 1.0) * 1.0;

        // Store Player B's battle HP
        this.battleState.playerBHp = playerB.hp;
        this.battleState.playerBMaxHp = playerB.maxHp;
        this.coopSession.playerBBattleHp = playerB.hp;
        this.coopSession.playerBMaxHp = playerB.maxHp;

        // Create Player B hero container
        this.heroBContainer = this.add.container(heroBX, heroBY);
        this.heroB = this.add.sprite(0, 0, this.heroBSpriteConfig.idleTexture)
            .setScale(heroScale)
            .play(this.heroBSpriteConfig.idleAnim);
        this.heroBContainer.add(this.heroB);
        const referencePlayerB = referenceSpawnPoints?.playerB ?? { x: 340, y: 539 };
        this.heroBHpBar = this.createActorStatusHud(
            'battlePlayerStatusHostB',
            this.heroBContainer,
            this.heroB,
            referencePlayerB,
            playerB.hp,
            playerB.maxHp,
            0x57cfea,
            'player',
            true,
            0x72ddff,
            270,
        );
        this.speedChargeBarB = this.heroBHpBar.speedChargeBar;

        // Create Player B's pet — use spawn points if available, else offset from hero
        const petBX = spawnPoints?.petB?.x ?? (heroBX - 60);
        const petBY = spawnPoints?.petB?.y ?? (heroBY + 40);
        this.createPlayerBPet(playerB, petBX, petBY);

        // Swap back to Player A
        this.coopSession.activatePlayerA();
        const playerA = this.gameState.getPlayer();

        // Also store Player A's battle HP in coop session
        this.coopSession.playerABattleHp = this.battleState.playerHp;
        this.coopSession.playerAMaxHp = playerA.maxHp;
    }

    private createPreparationIndicators(): void {
        const host = this.consumeHudPoint('battlePreparationHost', {
            x: 96,
            y: 640,
            depth: 80,
            width: 112,
            height: 116,
        });
        this.preparationIndicatorA = new BattlePreparationHud(this, {
            ...host,
            name: 'battlePreparationStatusA',
        });
        this.renderPreparationIndicator(this.preparationIndicatorA, this.gameState.getPlayer());

        if (!this.isCoopMode || !this.coopSession) return;

        this.preparationIndicatorB = new BattlePreparationHud(this, {
            ...host,
            name: 'battlePreparationStatusB',
        });

        this.coopSession.activatePlayerB();
        this.renderPreparationIndicator(this.preparationIndicatorB, this.gameState.getPlayer());
        this.coopSession.activatePlayerA();
        this.syncPreparationIndicatorVisibility();
    }

    private renderPreparationIndicator(
        indicator: BattlePreparationHud | null,
        player: PlayerState,
    ): void {
        if (!indicator) return;
        const state = PreparationSystem.getState(player);
        indicator.setState(state.kind, state.charges, false);
    }

    private refreshActivePreparationIndicator(): void {
        const activeIndicator = this.isCoopMode && this.coopSession?.getActivePlayer() === 'B'
            ? this.preparationIndicatorB
            : this.preparationIndicatorA;
        this.renderPreparationIndicator(activeIndicator, this.gameState.getPlayer());
        this.syncPreparationIndicatorVisibility();
    }

    private syncPreparationIndicatorVisibility(): void {
        const activeB = this.isCoopMode && this.coopSession?.getActivePlayer() === 'B';
        this.preparationIndicatorA?.setVisible(!activeB);
        this.preparationIndicatorB?.setVisible(Boolean(activeB));
    }

    private showPreparationEffect(kind: PreparationKind, bonus: number): void {
        const isSword = kind === 'sword';
        const effectText = this.add.text(
            640,
            135,
            isSword ? `OSTRÝ MEČ  +${bonus}` : `NABITÝ ŠTÍT  +${bonus}`,
            {
                fontSize: '27px',
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                color: isSword ? '#ffd37a' : '#71e5ff',
                fontStyle: 'bold',
                stroke: '#1a1008',
                strokeThickness: 5,
            },
        ).setOrigin(0.5).setDepth(210).setAlpha(0).setScale(0.72);

        this.tweens.add({
            targets: effectText,
            alpha: 1,
            scale: 1,
            y: 115,
            duration: 240,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: effectText,
                    alpha: 0,
                    y: 85,
                    duration: 650,
                    delay: 420,
                    onComplete: () => effectText.destroy(),
                });
            },
        });
    }

    /**
     * Co-op: Create Player B's pet companion.
     */
    private createPlayerBPet(playerB: PlayerState, petX: number, petY: number): void {
        this.petBContainer = null;
        this.petBSprite = null;
        this.equippedPetBDef = null;

        if (!playerB.activePet) return;

        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const petDef = petsData.find(p => p.id === playerB.activePet);
        if (!petDef) return;

        this.equippedPetBDef = { ...petDef, damageMultiplier: getPetAttackPower(petDef, playerB) };

        this.petBContainer = this.add.container(petX, petY);
        const PET_BASE_SCALE = 0.5;
        const petScale = (petDef.scale ?? 1.0) * PET_BASE_SCALE;

        this.petBSprite = this.add.sprite(0, 0, petDef.spriteKey, 0)
            .setScale(petScale)
            .setFlipX(true);

        const idleAnim = `${petDef.animPrefix}-idle`;
        if (this.anims.exists(idleAnim)) {
            this.petBSprite.play(idleAnim);
        }

        this.petBContainer.add(this.petBSprite);
    }

    /**
     * Return pet to its starting position after attack
     */
    private returnPetToPosition(startX: number, startY: number, onComplete: () => void): void {
        const activePet = this.getActivePet();
        const container = activePet.container;
        if (!container) {
            onComplete();
            return;
        }

        this.tweens.add({
            targets: container,
            x: startX,
            y: startY,
            duration: 300,
            ease: 'Quad.easeIn',
            onComplete: () => {
                container.setDepth(this.getRestingDepth(container));
                onComplete();
            }
        });
    }

    /**
     * Compute resting depth from Y position.
     * Higher Y = higher depth = visually in front (2.5D perspective).
     * Maps Y range [400..700] to depth range [1..30], below UI at 50+.
     */
    private computeRestingDepth(y: number): number {
        return Phaser.Math.Clamp(Math.floor((y - 400) / 10) + 1, 1, 40);
    }

    /**
     * Compute and assign resting depths for all battle entities based on Y position.
     * Called once after all entities (heroes, pets, enemies) are created.
     */
    private assignYBasedDepths(): void {
        this.entityRestingDepths.clear();

        const entities: Phaser.GameObjects.Container[] = [this.heroContainer];
        if (this.petContainer) entities.push(this.petContainer);
        if (this.heroBContainer) entities.push(this.heroBContainer);
        if (this.petBContainer) entities.push(this.petBContainer);
        this.enemyContainers.forEach(c => entities.push(c));

        for (const container of entities) {
            const depth = this.computeRestingDepth(container.y);
            this.entityRestingDepths.set(container, depth);
            container.setDepth(depth);
        }
    }

    /**
     * Get stored resting depth for an entity container.
     * Falls back to computing from current Y if not found.
     */
    private getRestingDepth(container: Phaser.GameObjects.Container): number {
        return this.entityRestingDepths.get(container) ?? this.computeRestingDepth(container.y);
    }

    /** Get the active pet's definition, container, and sprite based on whose turn it is */
    private getActivePet(): { def: PetDefinition | null; container: Phaser.GameObjects.Container | null; sprite: Phaser.GameObjects.Sprite | null } {
        const isPetB = this.battleState.phase === 'pet_b_turn' || this.battleState.phase === 'pet_b_math' || this.battleState.phase === 'pet_b_attack';
        if (isPetB) {
            return { def: this.equippedPetBDef, container: this.petBContainer, sprite: this.petBSprite };
        }
        return { def: this.equippedPetDef, container: this.petContainer, sprite: this.petSprite };
    }

    /**
     * Show pet's dedicated math problem
     */
    private showPetMathProblem(): void {
        const activePet = this.getActivePet();
        if (!activePet.def) {
            this.transitionAfterPetAction();
            return;
        }

        // Show active highlight on pet
        if (activePet.container) {
            this.showActiveHighlight(activePet.container.x, activePet.container.y + 30, 'green');
        }

        // Generate pet's single problem from mastery pool
        this.petMathProblem = this.generatePetProblemFromPool(activePet.def);

        if (!this.petMathProblem) {
            this.transitionAfterPetAction();
            return;
        }

        // Show in MathBoard with pet styling
        this.mathBoardContext = 'pet';
        this.mathBoard.showSingle(this.petMathProblem, this.onPetMathComplete.bind(this),
            this.getComparisonBoardOptions(this.getCoopSafeMasterySystem()));
    }

    /**
     * Handle pet math problem completion
     */
    private onPetMathComplete(isCorrect: boolean, responseTimeMs: number, assisted = false, damage = this.petMathProblem?.damageMultiplier ?? 1): void {
        this.petAttackDamage = damage;
        this.mathBoardContext = null;
        this.mathBoard.hide();
        this.hideActiveHighlight();

        if (this.petMathProblem && !this.mockMode) {
            this.mathEngine.recordResultForProblem(this.petMathProblem.id, isCorrect);

            // Record to mastery system if this was a mastery problem
            if (this.petMathProblem.masteryKey) {
                this.getCoopSafeMasterySystem().recordSolve(
                    this.petMathProblem.masteryKey,
                    isCorrect,
                    responseTimeMs,
                    'battle_pet'
                );
            }
            if (this.petMathProblem.comparisonMeta) {
                this.getCoopSafeMasterySystem().recordComparisonSolve(this.petMathProblem, isCorrect, responseTimeMs, assisted);
                if (!this.isCoopMode) this.gameState.save();
            }
            if (this.isCoopMode) this.coopSession?.persistActiveMasteryProgress();
        }

        // Track wrong answers for arena perfect wave calculation
        if (this.fromArena && !isCorrect) {
            this.waveWrongAnswerCount++;
            if (this.isCoopMode && this.coopSession) {
                if (this.coopSession.getActivePlayer() === 'A') {
                    this.coopSession.playerAWrongCount++;
                } else {
                    this.coopSession.playerBWrongCount++;
                }
            }
        }

        const isPetB = this.battleState.phase === 'pet_b_math';
        if (isCorrect) {
            this.setPhase(isPetB ? 'pet_b_attack' : 'pet_attack');
        } else {
            // Pet misses turn
            this.showPetMissMessage();
            if (isPetB) {
                this.time.delayedCall(500, () => this.setPhase(this.turnManager.nextPhaseAfterPetBAction()));
            } else {
                this.time.delayedCall(500, () => this.transitionAfterPetAction());
            }
        }
    }

    /**
     * Show "miss" message for pet
     */
    private showPetMissMessage(): void {
        const activePet = this.getActivePet();
        if (!activePet.container) return;

        const missText = this.add.text(activePet.container.x, activePet.container.y - 50, 'VEDLE!', {
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
        const activePet = this.getActivePet();
        if (!activePet.def || !this.petMathProblem) {
            this.transitionAfterPetAction();
            return;
        }

        // The problem already carries this owner's complete pet attack, including training.
        const damage = this.petAttackDamage;
        const targetIdx = this.petTargetIndex;

        // Check for spell attack effect (like Bodlina's lightning)
        if (activePet.def.attackEffect) {
            this.playPetSpellAttack(targetIdx, damage, () => {
                this.transitionAfterPetAction();
            });
        } else {
            this.playPetMeleeAttack(targetIdx, damage, () => {
                this.transitionAfterPetAction();
            });
        }
    }

    /**
     * Play pet melee attack (same as original playPetAttack but with damage)
     */
    private playPetMeleeAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        const activePet = this.getActivePet();
        if (!activePet.sprite || !activePet.def || !activePet.container) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = activePet.def.animPrefix;
        const startX = activePet.container.x;
        const startY = activePet.container.y;

        // Target position - offset slightly to the left of enemy
        const targetX = enemyContainer.x - 40;
        const targetY = enemyContainer.y;

        // Get movement data from pet's attack animation definition
        const attackAnimDef = this.animationDefs[`${animPrefix}-attack`];
        const movement = attackAnimDef?.movement;
        const moveDuration = movement?.duration || 300;

        // Pet appears on top during attack
        activePet.container.setDepth(BattleScene.ATTACK_DEPTH);

        // Play attack animation immediately during approach
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            activePet.sprite.play(attackAnim);
        }

        // Move to enemy position
        this.tweens.add({
            targets: activePet.container,
            x: targetX,
            y: targetY,
            duration: moveDuration,
            ease: movement?.ease || 'Quad.easeOut',
            onComplete: () => {
                // Apply damage
                this.applyPetDamageToEnemy(targetIdx, damage);

                // Brief pause at enemy (100ms), then return
                this.time.delayedCall(100, () => {
                    activePet.sprite!.play(`${animPrefix}-idle`);
                    this.returnPetToPosition(startX, startY, onComplete);
                });
            }
        });
    }

    /**
     * Play pet spell attack (lightning for Bodlina)
     */
    private playPetSpellAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        const activePet = this.getActivePet();
        if (!activePet.sprite || !activePet.def || !activePet.container) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = activePet.def.animPrefix;
        const attackEffect = activePet.def.attackEffect;

        // Play attack animation in place (pet doesn't move for spells)
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            activePet.sprite.play(attackAnim);
        }

        // Play effect based on type
        if (attackEffect?.type === 'lightning') {
            const tintColor = attackEffect.tint ? parseInt(attackEffect.tint, 16) : 0x44ff44;
            this.playLightningEffect(
                activePet.container.x,
                activePet.container.y - 30,
                enemyContainer.x,
                enemyContainer.y,
                tintColor,
                () => {
                    // Apply damage after effect
                    this.applyPetDamageToEnemy(targetIdx, damage);

                    // Return to idle
                    this.time.delayedCall(200, () => {
                        activePet.sprite!.play(`${animPrefix}-idle`);
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
    private applyPetDamageToEnemy(targetIdx: number, rawDamage: number): void {
        const enemy = this.battleState.enemies[targetIdx];
        const enemyContainer = this.enemyContainers[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];
        const damage = resolveDamageAfterDefense(rawDamage, enemy.defense).damage;

        enemy.hp -= damage;
        if (damage > 0) sfx(this, 'combat.hit');

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
    private transitionAfterPetAction(): void {
        const targetIdx = this.petTargetIndex;
        const enemy = this.battleState.enemies[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];

        // Determine next phase based on whether this is Pet A or Pet B
        const isPetB = this.battleState.phase === 'pet_b_attack' || this.battleState.phase === 'pet_b_math';
        const nextPhase = isPetB
            ? this.turnManager.nextPhaseAfterPetBAction()
            : this.turnManager.nextPhaseAfterPetAction();

        // Check if target enemy died from pet attack
        if (enemy.hp <= 0) {
            const allDead = this.battleState.enemies.every(e => e.hp <= 0);

            const afterDeath = () => {
                if (allDead) {
                    this.targetIndicator.setVisible(false);
                    if (this.isBoss && this.currentBossPhase < this.bossPhases.length - 1) {
                        this.triggerBossPhaseTransition();
                    } else {
                        this.setPhase('victory');
                    }
                } else {
                    // Enemies remain — use correct pet phase routing (not always enemy_turn)
                    this.getCurrentEnemyIndex();
                    this.updateTargetIndicator();
                    this.setPhase(nextPhase);
                }
            };

            if (this.isBoss && targetIdx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
                this.playBossDeathSequence(targetIdx, enemySprite, afterDeath);
            } else {
                const deathKey = (this.isBoss && targetIdx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
                enemySprite.play(deathKey);
                enemySprite.once('animationcomplete', () => {
                    this.time.delayedCall(1000, () => {
                        this.tweens.add({
                            targets: this.enemyContainers[targetIdx],
                            alpha: 0,
                            duration: 500,
                            onComplete: afterDeath,
                        });
                    });
                });
            }
        } else {
            this.setPhase(nextPhase);
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
        const isTargetB = this.isCoopMode && this.currentEnemyAttackTarget === 'B';
        const targetHero = (isTargetB && this.heroB) ? this.heroB : this.hero;
        const targetConfig = (isTargetB && this.heroBSpriteConfig) ? this.heroBSpriteConfig : this.playerSpriteConfig;

        targetHero.play(targetConfig.defendAnim);

        // Blue tint for defense effect
        targetHero.setTint(0x4488ff);
        this.time.delayedCall(200, () => targetHero.clearTint());

        // Return to idle when animation completes
        targetHero.once('animationcomplete', () => {
            targetHero.play(targetConfig.idleAnim);
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'BattleScene');

        // Create pause menu (ESC key to toggle)
        this.pauseMenu = new PauseMenu(this, undefined, {
            variant: 'medieval',
            showTvPairing: true,
            showFullscreen: true,
            layout: this.consumePauseMenuLayout(),
        });

        // Visible pause button (for mobile + desktop convenience)
        const builtPause = this.sceneBuilder.get('pauseButton');
        let pauseBtn: Phaser.GameObjects.Image;
        if (builtPause instanceof Phaser.GameObjects.Image) {
            pauseBtn = builtPause;
        } else {
            const x = (builtPause as any)?.x ?? 1225;
            const y = (builtPause as any)?.y ?? 54;
            const depth = (builtPause as any)?.depth ?? 95;
            builtPause?.destroy();
            pauseBtn = this.add.image(x, y, 'battle-hud-pause-v1')
                .setDisplaySize(96, 99)
                .setDepth(depth);
        }
        const hoverHost = this.consumeHudPoint('battlePauseHoverHost', {
            x: pauseBtn.x,
            y: pauseBtn.y,
            depth: pauseBtn.depth - 1,
            width: 82,
            height: 82,
        });
        const hoverRadius = Math.min(hoverHost.width ?? 82, hoverHost.height ?? 82) / 2;
        const hoverRing = this.add.circle(hoverHost.x, hoverHost.y, hoverRadius, 0xffd271, 0)
            .setStrokeStyle(3, 0xffedaa, 1)
            .setAlpha(0)
            .setDepth(hoverHost.depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScrollFactor(0);
        pauseBtn.setInteractive({ useHandCursor: true }).setScrollFactor(0);
        pauseBtn.on('pointerover', () => hoverRing.setAlpha(0.5));
        pauseBtn.on('pointerout', () => {
            hoverRing.setAlpha(0);
            pauseBtn.setAlpha(1);
        });
        pauseBtn.on('pointerdown', () => pauseBtn.setAlpha(0.76));
        pauseBtn.on('pointerup', () => {
            pauseBtn.setAlpha(1);
            this.pauseMenu.toggle();
        });

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
        if (DEV_TOOLS_ENABLED) {
            this.input.keyboard?.on('keydown-K', () => this.debugKillEnemy());
        }
    }

    private consumePauseMenuLayout(): PauseMenuLayout {
        const consume = (
            id: string,
            fallback: { x: number; y: number; depth: number; width: number; height: number },
        ) => {
            const host = this.consumeHudPoint(id, fallback);
            return {
                x: host.x,
                y: host.y,
                depth: host.depth,
                width: host.width ?? fallback.width,
                height: host.height ?? fallback.height,
            };
        };

        return {
            overlay: consume('battlePauseOverlayHost', {
                x: 640, y: 360, depth: 9998, width: 1280, height: 720,
            }),
            panel: consume('battlePausePanelHost', {
                x: 640, y: 360, depth: 9999, width: 430, height: 460,
            }),
            title: consume('battlePauseTitleHost', {
                x: 640, y: 180, depth: 10000, width: 320, height: 50,
            }),
            resumeButton: consume('battlePauseResumeHost', {
                x: 640, y: 260, depth: 10000, width: 300, height: 52,
            }),
            fullscreenButton: consume('battlePauseFullscreenHost', {
                x: 640, y: 330, depth: 10000, width: 300, height: 52,
            }),
            tvButton: consume('battlePauseTvHost', {
                x: 640, y: 400, depth: 10000, width: 300, height: 52,
            }),
            quitButton: consume('battlePauseQuitHost', {
                x: 640, y: 470, depth: 10000, width: 300, height: 52,
            }),
        };
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
        // Only allow selecting alive enemies during a player's turn
        if (this.battleState.phase !== 'player_turn' && this.battleState.phase !== 'player_b_turn') return;
        if (this.battleState.enemies[index].hp <= 0) return;

        this.battleState.selectedEnemyIndex = index;
        this.updateTargetIndicator();
        this.publishRemoteBattleTurnState('Tvůj tah', 'Vyber cíl a spusť útok.');
    }

    private updateTargetIndicator(): void {
        const idx = this.battleState.selectedEnemyIndex;
        this.enemyHpBars.forEach((bar, index) => bar.setSelected(index === idx));

        // Hide indicator if target is dead
        if (this.battleState.enemies[idx].hp <= 0) {
            this.targetIndicator.setVisible(false);
        } else {
            this.targetIndicator.setVisible(true);
            this.followTargetIndicator();
        }
    }

    private followTargetIndicator(): void {
        if (!this.targetIndicator?.visible || !this.battleState) return;
        const idx = this.battleState.selectedEnemyIndex;
        const status = this.enemyHpBars[idx];
        if (!status || this.battleState.enemies[idx]?.hp <= 0) return;
        const bob = Math.sin(this.time.now / 150) * 4;
        this.targetIndicator.setPosition(
            status.root.x,
            status.getTopY() - this.targetIndicator.displayHeight / 2 - 3 + bob,
        );
    }

    private createBlockUI(): void {
        const host = this.consumeHudPoint('battleBlockBannerHost', {
            x: 640,
            y: 82,
            depth: 90,
            width: 380,
            height: 72,
        });
        this.blockUI = this.add.container(host.x, host.y);
        this.blockUI.setVisible(false);
        this.blockUI.setDepth(host.depth);

        const bg = this.add.graphics();
        bg.fillStyle(0x17110d, 0.96);
        bg.fillRoundedRect(-190, -36, 380, 72, 18);
        bg.lineStyle(4, 0x80542d, 1);
        bg.strokeRoundedRect(-190, -36, 380, 72, 18);
        bg.lineStyle(1, 0xd49b54, 0.85);
        bg.strokeRoundedRect(-182, -28, 364, 56, 13);
        const shield = this.add.image(-155, 0, 'prep-shield-active-v2')
            .setDisplaySize(54, 54);
        this.blockUI.add([bg, shield]);

        this.blockDamageText = this.add.text(-108, -13, '⚔ 5', {
            fontSize: '17px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#ff9a86',
            fontStyle: 'bold',
            stroke: '#221108',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockDamageText);

        this.blockTimerText = this.add.text(-108, 14, 'ČAS: 10S', {
            fontSize: '13px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#f6d8a1',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockTimerText);

        this.blockAttemptsText = this.add.text(18, 14, '🛡 0', {
            fontSize: '13px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#9cf4ff',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockAttemptsText);
    }

    private onPetAttackClicked(): void {
        if (this.battleState.phase === 'pet_turn') {
            this.petAttackButton.setVisible(false);
            this.hidePetTargetIndicator();
            this.setPhase('pet_math');
        } else if (this.battleState.phase === 'pet_b_turn') {
            this.petAttackButton.setVisible(false);
            this.hidePetTargetIndicator();
            this.setPhase('pet_b_math');
        }
    }

    private selectPetTarget(index: number): void {
        if (this.battleState.phase !== 'pet_turn' && this.battleState.phase !== 'pet_b_turn') return;
        if (this.battleState.enemies[index].hp <= 0) return;

        this.petTargetIndex = index;
        this.updatePetTargetIndicator();
        this.publishRemoteBattleTurnState('Tah mazlíčka', 'Vyber cíl a spusť útok mazlíčka.');
    }

    private updatePetTargetIndicator(): void {
        const idx = this.petTargetIndex;
        const container = this.enemyContainers[idx];
        const status = this.enemyHpBars[idx];

        if (!container || !status || this.battleState.enemies[idx].hp <= 0) {
            this.hidePetTargetIndicator();
            return;
        }

        const baseY = status.getTopY() - (this.petTargetIndicator?.displayHeight ?? 52) / 2 - 3;
        this.petTargetIndicator?.setPosition(status.root.x, baseY);
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
        const isPlayerA = this.battleState.phase === 'player_turn';
        const isPlayerB = this.battleState.phase === 'player_b_turn';
        if (!isPlayerA && !isPlayerB) return;

        const player = this.gameState.getPlayer();
        if (player.potions <= 0) return;

        // Use potion - heal to full
        player.potions = 0;

        if (isPlayerB && this.heroBContainer && this.heroBHpBar) {
            // Heal Player B
            this.battleState.playerBHp = this.battleState.playerBMaxHp ?? player.maxHp;
            this.updateHpBar(this.heroBHpBar, this.battleState.playerBHp, this.battleState.playerBMaxHp ?? player.maxHp);
        } else {
            // Heal Player A
            this.battleState.playerHp = player.maxHp;
            this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);
        }

        sfx(this, 'item.potion');
        // Save state (potion used)
        this.gameState.save();
        this.renderBattleActionDock();
        this.publishRemoteBattleTurnState(isPlayerB ? 'Tah hráče 2' : 'Tvůj tah', 'Lektvar použit.');

        // Visual feedback
        const targetContainer = isPlayerB ? this.heroBContainer! : this.heroContainer;
        const healText = this.add.text(targetContainer.x, targetContainer.y - 80, 'VYLÉČEN!', {
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
        const healedHero = isPlayerB && this.heroB ? this.heroB : this.hero;
        healedHero.setTint(0x44ff44);
        this.time.delayedCall(200, () => {
            healedHero.clearTint();
        });
    }

    /**
     * Transition to a new battle phase. Delegates to TurnManager.
     */
    private setPhase(phase: BattlePhase): void {
        this.turnManager.setPhase(phase);
        this.syncPreparationIndicatorVisibility();
        this.renderBattleActionDock();
    }

    // --- BattleSceneCallbacks implementation ---
    // These are called by TurnManager when entering each phase.

    onEnterPlayerTurn(): void {
        voice(this, 'vo.battle.sword', true);
        // Swap to Player A's context
        if (this.isCoopMode && this.coopSession) {
            this.coopSession.activatePlayerA();
            // Safety: if Player A is fallen, skip directly to Player B
            if (this.battleState.playerHp <= 0) {
                this.setPhase('player_b_turn');
                return;
            }
        }
        this.attackButton.setVisible(true);
        const playerForTurn = this.gameState.getPlayer();
        this.potionButton.setVisible(!this.mockMode && playerForTurn.potions > 0);
        this.hideActiveHighlight();

        // Retarget indicator to next alive enemy (fixes stuck indicator on dead enemy)
        this.getCurrentEnemyIndex();
        this.updateTargetIndicator();
        this.publishRemoteBattleTurnState('Tvůj tah', 'Vyber cíl a spusť útok.');
    }

    onEnterPlayerMath(): void {
        gameAudio().stopVoice();
        this.attackButton.setVisible(false);
        this.potionButton.setVisible(false);
        // Ensure MathEngine uses the correct player's level and stats
        this.registry.set('playerLevel', this.gameState.getPlayer().level);
        if (!this.mockMode) {
            this.mathEngine.reloadStats();
            this.mathEngine.initializeLevelPool();
        }
        if (this.isCoopMode) {
            const p = this.gameState.getPlayer();
            console.log(`[MATH-DEBUG] Player A math: name=${p.name}, level=${p.level}, registryLevel=${this.registry.get('playerLevel')}`);
            this.showCoopTurnLabel(p.name || 'Hráč 1', '#44cc44');
        }
        this.showAttackProblems();
    }

    onEnterPlayerAttack(): void {
        this.hideCoopTurnLabel();
        this.publishRemoteWaitingState('Útok', 'Sleduj TV obrazovku.');
        this.playHeroAttack();
    }

    onEnterPlayerMiss(): void {
        this.hideCoopTurnLabel();
        this.publishRemoteWaitingState('Vedle', 'Sleduj TV obrazovku.');
        this.playHeroMiss();
    }

    onEnterPetTurn(): void {
        const petId = this.equippedPetDef?.id ?? '';
        sfx(this, petId.includes('slime') ? 'creature.slime' : petId.includes('catacomb') ? 'creature.fox' : 'creature.forest');
        // Swap to Player A for A's pet
        if (this.isCoopMode && this.coopSession) {
            this.coopSession.activatePlayerA();
        }

        // Safety: skip if pet doesn't exist
        if (!this.equippedPetDef || !this.petContainer) {
            this.setPhase(this.turnManager.nextPhaseAfterPetAction());
            return;
        }

        this.petAttackButton.setVisible(true);
        this.targetIndicator.setVisible(false);
        this.showActiveHighlight(this.petContainer.x, this.petContainer.y + 30, 'green');
        this.petTargetIndex = this.battleState.enemies.findIndex(e => e.hp > 0);
        this.updatePetTargetIndicator();
        this.publishRemoteBattleTurnState('Tah mazlíčka', 'Vyber cíl a spusť útok mazlíčka.');
    }

    onEnterPetMath(): void {
        // Co-op: ensure MathEngine has correct player context for pet math
        if (this.isCoopMode) {
            this.registry.set('playerLevel', this.gameState.getPlayer().level);
            this.mathEngine.reloadStats();
        }
        this.showPetMathProblem();
    }

    onEnterPetAttack(): void {
        sfx(this, 'combat.spell');
        this.publishRemoteWaitingState('Mazlíček útočí', 'Sleduj TV obrazovku.');
        this.executePetAttack();
    }

    // --- Co-op Player B callbacks ---

    onEnterPlayerBTurn(): void {
        // Swap to Player B's context
        if (this.coopSession) this.coopSession.activatePlayerB();

        this.attackButton.setVisible(true);
        const playerB = this.gameState.getPlayer();
        this.potionButton.setVisible(!this.mockMode && playerB.potions > 0);

        // Highlight Player B's hero
        if (this.heroBContainer) {
            this.showActiveHighlight(this.heroBContainer.x, this.heroBContainer.y + 30, 'green');
        }

        // Retarget indicator to next alive enemy (fixes stuck indicator on dead enemy)
        this.getCurrentEnemyIndex();
        this.updateTargetIndicator();
        this.publishRemoteBattleTurnState('Tah hráče 2', 'Vyber cíl a spusť útok.');
    }

    onEnterPlayerBMath(): void {
        this.attackButton.setVisible(false);
        this.potionButton.setVisible(false);
        // Ensure MathEngine uses Player B's level and stats (context already swapped to B)
        this.registry.set('playerLevel', this.gameState.getPlayer().level);
        this.mathEngine.reloadStats();
        this.mathEngine.initializeLevelPool();
        this.showCoopTurnLabel(this.gameState.getPlayer().name || 'Hráč 2', '#4488cc');
        this.showAttackProblems();
    }

    onEnterPlayerBAttack(): void {
        this.hideCoopTurnLabel();
        this.publishRemoteWaitingState('Útok hráče 2', 'Sleduj TV obrazovku.');
        this.playHeroBAttack();
    }

    onEnterPlayerBMiss(): void {
        this.hideCoopTurnLabel();
        this.publishRemoteWaitingState('Hráč 2 minul', 'Sleduj TV obrazovku.');
        this.playHeroBMiss();
    }

    onEnterPetBTurn(): void {
        // Swap to Player B's context for pet
        if (this.coopSession) this.coopSession.activatePlayerB();

        // Safety: skip if pet B doesn't exist
        if (!this.equippedPetBDef || !this.petBContainer) {
            this.setPhase(this.turnManager.nextPhaseAfterPetBAction());
            return;
        }

        this.petAttackButton.setVisible(true);
        this.targetIndicator.setVisible(false);
        this.showActiveHighlight(this.petBContainer.x, this.petBContainer.y + 30, 'green');
        this.petTargetIndex = this.battleState.enemies.findIndex(e => e.hp > 0);
        this.updatePetTargetIndicator();
        this.publishRemoteBattleTurnState('Tah mazlíčka hráče 2', 'Vyber cíl a spusť útok.');
    }

    onEnterPetBMath(): void {
        // Co-op: ensure MathEngine has correct player context for Player B's pet
        if (this.isCoopMode) {
            this.registry.set('playerLevel', this.gameState.getPlayer().level);
            this.mathEngine.reloadStats();
        }
        this.showPetMathProblem();
    }

    onEnterPetBAttack(): void {
        sfx(this, 'combat.spell');
        this.publishRemoteWaitingState('Mazlíček útočí', 'Sleduj TV obrazovku.');
        this.executePetAttack();
    }

    onEnterEnemyTurn(): void {
        this.hideActiveHighlight();
        this.publishRemoteWaitingState('Útok nepřítele', 'Sleduj TV obrazovku.');

        // Co-op: determine which player all enemies attack this round
        if (this.isCoopMode && this.coopSession) {
            this.currentEnemyAttackTarget = this.coopSession.getNextEnemyTarget();
            // Swap to target player's context (for shield lookup during block)
            if (this.currentEnemyAttackTarget === 'B') {
                this.coopSession.activatePlayerB();
            } else {
                this.coopSession.activatePlayerA();
            }
        } else {
            this.currentEnemyAttackTarget = 'A';
        }

        this.currentAttackingEnemyIndex = this.findNextAliveEnemy(-1);
        if (this.currentAttackingEnemyIndex >= 0) {
            this.time.delayedCall(500, () => this.playEnemyAttack());
        } else {
            this.setPhase('player_turn');
        }
    }

    onEnterVictory(): void {
        gameAudio().stopVoice();
        // The 2.48 s victory tail continues across the existing 2 s scene transition.
        sfx(gameAudio(), 'reward.victory');
        this.time.delayedCall(600, () => voice(this, 'vo.common.complete', true));
        this.hideActiveHighlight();
        this.publishRemoteWaitingState('Vítězství', 'Sleduj TV obrazovku.');
        this.onVictory();
    }

    onEnterDefeat(): void {
        gameAudio().stopVoice();
        sfx(this, 'combat.retreat');
        this.hideActiveHighlight();
        this.publishRemoteWaitingState('Porážka', 'Sleduj TV obrazovku.');
        this.onDefeat();
    }

    // --- BattleSceneCallbacks state queries ---

    hasPet(): boolean {
        return !!(this.equippedPetDef && this.petContainer);
    }

    hasPetB(): boolean {
        return !!(this.equippedPetBDef && this.petBContainer);
    }

    hasAliveEnemies(): boolean {
        return this.battleState.enemies.some(e => e.hp > 0);
    }

    isPlayerDefeated(): boolean {
        return this.battleState.playerHp <= 0;
    }

    isPlayerBDefeated(): boolean {
        return this.playerBFallen || (this.battleState.playerBHp ?? 0) <= 0;
    }

    isCoopModeActive(): boolean {
        return this.isCoopMode;
    }

    private isRemoteSessionActive(): boolean {
        return this.remoteInput.getRoom() !== null;
    }

    private handleRemoteCommand(command: RemoteCommand): void {
        if (!this.isRemoteSessionActive()) return;

        switch (command.type) {
            case 'attack':
                if (this.battleState.phase === 'pet_turn' || this.battleState.phase === 'pet_b_turn') {
                    this.onPetAttackClicked();
                } else {
                    this.onAttackClicked();
                }
                break;
            case 'answerChoice':
                this.mathBoard.submitChoice(command.index);
                break;
            case 'selectEnemy':
                if (this.battleState.phase === 'pet_turn' || this.battleState.phase === 'pet_b_turn') {
                    this.selectPetTarget(command.index);
                } else {
                    this.selectTarget(command.index);
                }
                break;
            case 'usePotion':
                this.usePotion();
                break;
            case 'continue':
                this.remoteFeedbackDismiss?.();
                break;
            case 'back':
                this.scene.start('TvPairingScene');
                break;
            case 'startTrainingBattle':
                break;
        }
    }

    private publishRemoteBattleTurnState(title: string, subtitle?: string): void {
        if (!this.isRemoteSessionActive()) return;

        const activePetTurn = this.battleState.phase === 'pet_turn' || this.battleState.phase === 'pet_b_turn';
        const selectedIndex = activePetTurn ? this.petTargetIndex : this.battleState.selectedEnemyIndex;
        const enemies = this.battleState.enemies.map((enemy, index) => ({
            index,
            name: enemy.name,
            hp: enemy.hp,
            maxHp: enemy.maxHp,
            selected: index === selectedIndex,
        }));

        const actions: RemoteAction[] = [
            {
                id: 'attack',
                label: activePetTurn ? 'Mazlíček útočí' : 'ÚTOK',
                command: { type: 'attack' },
            },
        ];

        if (!activePetTurn && this.gameState.getPlayer().potions > 0) {
            actions.push({
                id: 'usePotion',
                label: 'Použít lektvar',
                command: { type: 'usePotion' },
            });
        }

        this.remoteInput.publishState({
            screen: 'battleTurn',
            title,
            subtitle,
            enemies,
            actions,
        });
    }

    private publishRemoteMathState(snapshot: MathBoardRemoteSnapshot | null): void {
        if (!this.isRemoteSessionActive()) return;

        if (!snapshot) {
            this.publishRemoteWaitingState('Sleduj TV', 'Čekám na další herní krok.');
            return;
        }

        this.remoteInput.publishState({
            screen: 'math',
            title: this.mathBoardContext === 'block' ? 'Blokuj útok' : 'Vyber odpověď',
            subtitle: this.isCoopMode ? this.gameState.getPlayer().name : undefined,
            problem: snapshot.problem,
            choices: snapshot.choices,
            comparison: snapshot.comparison,
        });
    }

    private publishRemoteFeedbackState(title: string, subtitle?: string, actionLabel = 'Pokračovat'): void {
        if (!this.isRemoteSessionActive()) return;
        this.remoteInput.publishState({
            screen: 'feedback',
            title,
            subtitle,
            actions: [
                {
                    id: 'continue',
                    label: actionLabel,
                    command: { type: 'continue' },
                },
            ],
        });
    }

    private publishRemoteWaitingState(title: string, subtitle?: string): void {
        if (!this.isRemoteSessionActive()) return;
        this.remoteInput.publishState({
            screen: 'waiting',
            title,
            subtitle,
        });
    }

    /**
     * Show a floating label above the math board indicating whose turn it is.
     * Positioned at (640, 120) — above the math board container at (640, 200).
     */
    private showCoopTurnLabel(name: string, color: string): void {
        this.hideCoopTurnLabel();
        this.coopTurnLabel = this.add.text(640, 80, `⚔ ${name}`, {
            fontSize: '24px', fontFamily: 'Arial, sans-serif',
            color, fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 4,
            shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
        }).setOrigin(0.5).setDepth(1000);
    }

    private hideCoopTurnLabel(): void {
        if (this.coopTurnLabel) {
            this.coopTurnLabel.destroy();
            this.coopTurnLabel = null;
        }
    }

    /**
     * Get MasterySystem with the correct player's mastery data active.
     * In co-op, each player has their own independent MasteryData loaded at battle start.
     * This sets which player's data the singleton reads from.
     */
    private getCoopSafeMasterySystem(): MasterySystem {
        const ms = MasterySystem.getInstance();
        if (this.isCoopMode && this.coopSession) {
            const isB = this.coopSession.getActivePlayer() === 'B';
            ms.setActiveData(isB ? this.coopMasteryB : this.coopMasteryA);
        }
        return ms;
    }

    private getAttackProblemCount(masterySystem: MasterySystem): number {
        if (this.isCoopMode && this.coopSession) {
            return this.coopSession.getSharedAttackCount();
        }
        return masterySystem.getProblemsPerTurn();
    }

    private generateFallbackAttackProblems(playerLevel: number, count: number, equippedSword: ItemDefinition | null): MathProblem[] {
        const problems: MathProblem[] = [];

        while (problems.length < count) {
            const batch = this.mathEngine.generateAttackProblems(playerLevel, null, null)
                .filter(problem => problem.source !== 'sword' && problem.source !== 'pet');

            if (batch.length === 0) {
                break;
            }

            problems.push(...batch);
        }

        const normalized = problems.slice(0, count);
        if (equippedSword && equippedSword.mathProblemType) {
            normalized.push(this.generateSwordProblem(equippedSword));
        }

        return normalized;
    }

    /** Advance and persist each co-op player's real mastery track. */
    private applyCoopSessionPromotions(): Array<{ type: string; targetId: string }> {
        if (!this.isCoopMode || !this.coopSession) return [];
        return this.coopSession.applyAndPersistMasteryProgress().map(promotion => ({
            type: promotion.type,
            targetId: String(promotion.targetId),
        }));
    }

    private recordCoopFightEnd(): void {
        if (!this.isCoopMode || !this.coopSession) {
            this.getCoopSafeMasterySystem().recordFightEnd();
            return;
        }

        const masterySystem = MasterySystem.getInstance();

        this.coopSession.activatePlayerA();
        masterySystem.setActiveData(this.coopMasteryA);
        masterySystem.recordFightEnd();

        this.coopSession.activatePlayerB();
        masterySystem.setActiveData(this.coopMasteryB);
        masterySystem.recordFightEnd();

        masterySystem.setActiveData(null);
        this.coopSession.activatePlayerA();
    }

    private onAttackClicked(): void {
        gameAudio().cancel(this);
        if (this.battleState.phase === 'player_turn') {
            this.setPhase('player_math');
        } else if (this.battleState.phase === 'player_b_turn') {
            this.setPhase('player_b_math');
        }
    }

    private showAttackProblems(): void {
        if (this.mockMode) {
            const problems = this.createMockProblems(2);
            this.battleState.currentProblems = problems;
            this.mathBoardContext = 'attack';
            this.mathBoard.show(problems);
            return;
        }

        const player = this.gameState.getPlayer();

        // Get equipped sword definition
        let equippedSword: ItemDefinition | null = null;
        if (player.equippedWeapon) {
            const itemsData = this.cache.json.get('items') as ItemDefinition[];
            equippedSword = itemsData.find(i => i.id === player.equippedWeapon && i.type === 'weapon') || null;
        }

        // Get mastery system with co-op safety (ensures correct player context)
        const masterySystem = this.getCoopSafeMasterySystem();

        const comparisonProblems = masterySystem.generateComparisonBattleProblems(this.getAttackProblemCount(masterySystem));
        if (comparisonProblems) {
            const problems = comparisonProblems;
            if (equippedSword?.mathProblemType) problems.push(this.generateSwordProblem(equippedSword));
            this.applyAttackPowerDistribution(problems);
            this.battleState.currentProblems = problems;
            this.mathBoardContext = 'attack';
            this.showComparisonLessonThenProblems(problems, masterySystem);
            return;
        }

        // Check if we're in a boss fight with phase-specific math
        if (this.isBoss && this.bossPhases[this.currentBossPhase]) {
            const phase = this.bossPhases[this.currentBossPhase];
            const phaseUsesComparison = phase.mathType === 'comparison';
            if (phase.mathType && (!phaseUsesComparison || masterySystem.isComparisonChapterComplete())) {
                const problemCount = this.getAttackProblemCount(masterySystem);
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

                this.applyAttackPowerDistribution(problems);
                this.battleState.currentProblems = problems;
                this.mathBoardContext = 'attack';
                this.mathBoard.show(problems);
                return;
            }
        }

        // Generate problems from mastery pool
        const count = this.getAttackProblemCount(masterySystem);
        const problemKeys = masterySystem.drawFromPool(count);

        // Co-op debug: verify correct player context for problem generation
        if (this.isCoopMode) {
            const activePlayer = this.coopSession?.getActivePlayer() || '?';
            const frontier = masterySystem.getFrontierSubAtom();
            console.log(`[COOP-MATH] Player ${activePlayer} (${player.name}, lvl=${player.level}): frontier=${frontier}, count=${count}, keys=${problemKeys.slice(0, 3).join(', ')}`);
        }

        const problems: MathProblem[] = [];
        for (const key of problemKeys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) {
                problems.push(problem);
            }
        }

        // Fallback: if mastery system returned no problems, use legacy generation
        if (problems.length === 0) {
            const legacyProblems = this.generateFallbackAttackProblems(player.level, count, equippedSword);
            problems.push(...legacyProblems);
        } else {
            // Add sword bonus problem if equipped (drawn from mastery master pool)
            if (equippedSword && equippedSword.mathProblemType) {
                problems.push(this.generateSwordProblem(equippedSword));
            }
        }

        this.applyAttackPowerDistribution(problems);
        this.battleState.currentProblems = problems;
        this.mathBoardContext = 'attack';
        this.mathBoard.show(problems);
    }

    private showComparisonLessonThenProblems(problems: MathProblem[], masterySystem: MasterySystem): void {
        this.mathBoard.show(problems, { presentation: 'sequential', ...this.getComparisonBoardOptions(masterySystem) });
    }

    private getComparisonBoardOptions(masterySystem: MasterySystem) {
        const chapter = masterySystem.getComparisonChapterState();
        const stage = masterySystem.getCurrentComparisonStage();
        const owner = this.coopSession?.getActivePlayer();
        return {
            introduction: masterySystem.needsComparisonStageIntro() ? stage ?? undefined : undefined,
            support: chapter.stages.find(progress => progress.stage === 'number_symbol'),
            onIntroComplete: () => {
                if (this.isCoopMode && owner !== this.coopSession?.getActivePlayer()) return;
                markComparisonStageIntroSeen(chapter);
                if (this.isCoopMode) this.coopSession?.persistActiveMasteryProgress();
                else this.gameState.save();
            },
        };
    }

    private createMockProblems(count: number): MathProblem[] {
        const bank: Array<Pick<MathProblem, 'operand1' | 'operand2' | 'operator' | 'answer' | 'choices'>> = [
            { operand1: 8, operand2: 7, operator: '+', answer: 15, choices: [14, 15, 16] },
            { operand1: 13, operand2: 5, operator: '-', answer: 8, choices: [7, 8, 9] },
            { operand1: 4, operand2: 3, operator: '*', answer: 12, choices: [10, 11, 12] },
            { operand1: 9, operand2: 6, operator: '+', answer: 15, choices: [13, 14, 15] },
            { operand1: 17, operand2: 8, operator: '-', answer: 9, choices: [8, 9, 10] },
            { operand1: 5, operand2: 3, operator: '*', answer: 15, choices: [12, 15, 18] },
        ];

        const startIndex = this.mockProblemCursor;
        this.mockProblemCursor += count;
        return Array.from({ length: count }, (_, offset) => {
            const bankIndex = (startIndex + offset) % bank.length;
            const source = bank[bankIndex];
            return {
                id: `guardian_mock_${startIndex + offset}`,
                ...source,
                showVisualHint: false,
                hintType: 'none' as const,
                source: 'player' as const,
            };
        });
    }

    private onMathComplete(mathBoardDamage: number, results: boolean[], timings: number[], assisted: boolean[] = []): void {
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
            const masterySystem = this.getCoopSafeMasterySystem();

            results.forEach((isCorrect, index) => {
                const problem = this.battleState.currentProblems[index];
                if (problem && !this.mockMode) {
                    this.mathEngine.recordResultForProblem(problem.id, isCorrect);
                    // Mastery recording: feeds into [retry]/[slow] pools
                    if (problem.masteryKey) {
                        const rt = timings[index] || 0;
                        masterySystem.recordSolve(problem.masteryKey, isCorrect, rt, 'battle_block');
                    }
                    if (problem.comparisonMeta) {
                        masterySystem.recordComparisonSolve(problem, isCorrect, timings[index] || 0, assisted[index] === true);
                        if (!this.isCoopMode) this.gameState.save();
                    }
                }
                if (isCorrect) {
                    const masteryRT = masterySystem.getMasteryRTThreshold(problem?.masteryKey);
                    correctCount = calculateShieldAnswerBlock(
                        this.currentBlockPower,
                        this.pendingDamage,
                        true,
                        Boolean(timings[index] && timings[index] < masteryRT),
                        assisted[index] === true,
                    );
                }
            });

            // A shield charge is smart protection: consume it only if it
            // actually prevents damage that the player's answers did not.
            if (this.isCoopMode && !this.mockMode) this.coopSession?.persistActiveMasteryProgress();
            const unblockedDamage = Math.max(0, this.pendingDamage - correctCount);
            if (!this.mockMode && unblockedDamage > 0) {
                const preparedBlock = PreparationSystem.consume(this.gameState.getPlayer(), 'shield');
                if (preparedBlock.applied) {
                    correctCount += Math.min(preparedBlock.bonus, unblockedDamage);
                    this.gameState.save();
                    this.refreshActivePreparationIndicator();
                    this.showPreparationEffect('shield', preparedBlock.bonus);
                    sfx(this, 'prep.consume');
                }
            }

            this.blockCorrectCount = correctCount;
            // Update UI with final count
            const currentBlock = Math.min(this.blockCorrectCount, this.pendingDamage);
            this.blockAttemptsText.setText(`🛡 ${currentBlock}`);

            // End block phase
            this.endBlockPhase();
            return;
        }

        // ---- ATTACK PHASE ---- (context === 'attack')
        this.mathBoard.hide();

        // Record mastery data and track arena wrong answers
        const masterySystem = this.getCoopSafeMasterySystem();

        let recordedComparisonAttempt = false;
        results.forEach((isCorrect, index) => {
            const problem = this.battleState.currentProblems[index];
            if (problem) {
                // Record results for stats (legacy) — reload stats first in co-op
                // to prevent cross-contamination between players
                if (!this.mockMode) {
                    if (this.isCoopMode) this.mathEngine.reloadStats();
                    this.mathEngine.recordResultForProblem(problem.id, isCorrect);
                }

                // Record to mastery system (for mastery problems only)
                if (!this.mockMode && problem.masteryKey) {
                    const responseTimeMs = timings[index] || 0;
                    const ctx = problem.source === 'sword' ? 'battle_sword' : 'battle';
                    masterySystem.recordSolve(problem.masteryKey, isCorrect, responseTimeMs, ctx);
                }
                if (problem.comparisonMeta) {
                    recordedComparisonAttempt = true;
                    masterySystem.recordComparisonSolve(
                        problem,
                        isCorrect,
                        timings[index] || 0,
                        assisted[index] === true,
                    );
                }

                if (!isCorrect && this.fromArena) {
                    // Track wrong answers for arena perfect wave calculation
                    this.waveWrongAnswerCount++;
                    // Co-op: also track per-player
                    if (this.isCoopMode && this.coopSession) {
                        if (this.coopSession.getActivePlayer() === 'A') {
                            this.coopSession.playerAWrongCount++;
                        } else {
                            this.coopSession.playerBWrongCount++;
                        }
                    }
                }
            }
        });
        if (recordedComparisonAttempt && !this.isCoopMode) this.gameState.save();

        // Use MathBoard's damage total (includes multipliers + speed charge bar fill bonuses)
        if (this.isCoopMode && !this.mockMode) this.coopSession?.persistActiveMasteryProgress();
        let totalDamage = mathBoardDamage;
        if (totalDamage > 0) {
            const player = this.gameState.getPlayer();
            const preparation = PreparationSystem.getState(player);
            const target = this.battleState.enemies[this.getCurrentEnemyIndex()];
            const swordBonus = PREPARATION_CONFIG.effects.sword.damagePerCharge;
            const preparationWouldHelp = !this.mockMode
                && preparation.kind === 'sword'
                && preparation.charges > 0
                && damageBonusWouldHelp(
                    totalDamage,
                    swordBonus,
                    target.defense,
                );

            if (preparationWouldHelp) {
                const preparedHit = PreparationSystem.consume(player, 'sword');
                totalDamage += preparedHit.bonus;
                this.gameState.save();
                this.refreshActivePreparationIndicator();
                this.showPreparationEffect('sword', preparedHit.bonus);
                sfx(this, 'prep.consume');
            }
        }
        this.battleState.damageDealt = totalDamage;

        // Track if last answer was correct for Vengeful Strike ability
        // Consider it "wrong" if any answer in the batch was wrong, or if total damage is 0
        const anyWrong = results.some(r => !r);
        this.lastAnswerCorrect = !anyWrong && totalDamage > 0;

        // Route to correct attack/miss phase based on who was solving
        const isPlayerB = this.battleState.phase === 'player_b_math';
        if (totalDamage > 0) {
            this.setPhase(isPlayerB ? 'player_b_attack' : 'player_attack');
        } else {
            this.setPhase(isPlayerB ? 'player_b_miss' : 'player_miss');
        }
    }

    /** Compress solo attack power into three problems; preserve co-op for now. */
    private applyAttackPowerDistribution(problems: MathProblem[]): void {
        applyConfiguredAttackPower(
            problems,
            this.gameState.getPlayer().attack,
            this.isCoopMode ? 'coop' : 'solo',
        );
        problems.forEach(applyProblemComplexityDamage);
    }

    /** Generate a sword problem from mastery master pool, with fallbacks */
    private generateSwordProblem(sword: ItemDefinition): MathProblem {
        const masterySystem = this.getCoopSafeMasterySystem();

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
        if (this.mockMode) return this.createMockProblems(count);

        const masterySystem = this.getCoopSafeMasterySystem();
        const problems: MathProblem[] = [];

        const comparison = masterySystem.generateComparisonBattleProblems(count);
        if (comparison) return comparison;

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
        const masterySystem = this.getCoopSafeMasterySystem();

        const comparison = masterySystem.generateComparisonBattleProblems(1)?.[0];
        if (comparison) {
            comparison.source = 'pet';
            comparison.damageMultiplier = pet.damageMultiplier || 1;
            return applyProblemComplexityDamage(comparison);
        }

        // 1. Try review pool (Fluent sub-atoms) — same as shield block
        const reviewKeys = masterySystem.drawFromReviewPool(1);
        if (reviewKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(reviewKeys[0]);
            if (problem) {
                problem.damageMultiplier = pet.damageMultiplier || 1;
                problem.source = 'pet';
                return applyProblemComplexityDamage(problem);
            }
        }

        // 2. Fallback: standard mastery pool
        const poolKeys = masterySystem.drawFromPool(1);
        if (poolKeys.length > 0) {
            const problem = this.mathEngine.generateProblemFromKey(poolKeys[0]);
            if (problem) {
                problem.damageMultiplier = pet.damageMultiplier || 1;
                problem.source = 'pet';
                return applyProblemComplexityDamage(problem);
            }
        }

        // 3. Last resort: legacy pet problem generation
        return applyProblemComplexityDamage(this.mathEngine.generatePetTurnProblem(pet));
    }

    /** Show effect when speed charge bar fills and grants bonus damage */
    private showChargeBarFilledEffect(bonusDamage: number): void {
        const heroX = this.heroContainer.x;
        const heroY = this.heroContainer.y;

        const effectText = this.add.text(heroX, heroY - 130, `⚡ +${bonusDamage}`, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffcc00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(200).setScale(0.5).setAlpha(0);

        // Pop-in then float up and fade
        this.tweens.add({
            targets: effectText,
            scale: 1,
            alpha: 1,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: effectText,
                    y: heroY - 190,
                    alpha: 0,
                    duration: 1500,
                    ease: 'Sine.easeIn',
                    onComplete: () => effectText.destroy(),
                });
            },
        });

        // Brief gold glow on hero
        if (this.hero) {
            this.hero.setTint(0xffdd88);
            this.time.delayedCall(200, () => {
                this.hero.clearTint();
            });
        }
    }

    private getEquippedShield(): ItemDefinition | null {
        const player = this.gameState.getPlayer();
        if (!player.equippedShield) return null;

        const items = this.cache.json.get('items') as ItemDefinition[];
        return items.find(item => item.id === player.equippedShield) || null;
    }

    private startBlockPhase(damage: number): void {
        if (damage <= 0) {
            this.applyDamageToPlayer(0);
            if (this.blockPhaseResumeCallback) {
                this.blockPhaseResumeCallback();
                this.blockPhaseResumeCallback = undefined;
            }
            return;
        }
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
        this.currentBlockPower = shield.blockPower ?? shield.blockAttempts ?? 1;

        // The common board carries the shield and incoming attack in its footer.
        // Keep the former top banner hidden so it cannot cover the lesson header.
        this.blockUI.setVisible(false);
        this.blockDamageText.setText(`⚔ ${damage}`);
        this.blockTimerText.setVisible(false); // Timer removed; block ends on completion
        this.blockAttemptsText.setText(`🛡 0`);

        // Generate block problems from mastery review pool (Fluent sub-atoms)
        const problems = this.generateBlockProblemsFromPool(1);
        if (problems.length === 0) {
            // Fresh/imported saves may not have a populated mastery pool yet.
            // A shield turn must still contain exactly one answerable problem.
            problems.push(this.mathEngine.generateBlockProblem(shield));
        }
        this.battleState.currentProblems = problems;

        // DEBUG: Log block phase setup
        console.log('[BattleScene] Block phase started:', {
            shieldId: shield?.id,
            blockPower: this.currentBlockPower,
            mathProblemTypes: shield?.mathProblemTypes,
            problems: problems.map(p => ({ answer: p.answer, choices: p.choices }))
        });

        this.mathBoardContext = 'block';
        this.mathBoard.show(problems, {
            ...this.getComparisonBoardOptions(this.getCoopSafeMasterySystem()),
            defense: { power: this.currentBlockPower, incomingDamage: damage },
        });
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

        // One answer supplies the shield's configured block power; incoming damage remains the cap.
        const damageBlocked = Math.min(this.blockCorrectCount, this.pendingDamage);
        const finalDamage = this.pendingDamage - damageBlocked;

        // Play defense animation if player blocked at least 1 damage
        if (damageBlocked > 0) {
            this.playHeroDefense();
            sfx(this, 'combat.block');
        }

        // Show block result only if player actually blocked something
        if (damageBlocked > 0) {
            const blockMessage = finalDamage === 0
                ? 'ZABLOKOVÁNO!'
                : `-${damageBlocked}`;

            const blockText = this.add.text(640, 180, blockMessage.toUpperCase(), {
                resolution: 2,
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#4488ff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4,
            }).setOrigin(0.5).setDepth(200);
            this.blockResultText = blockText;

            this.tweens.add({
                targets: blockText,
                alpha: 0,
                y: 100,
                duration: 1500,
                onComplete: () => {
                    if (this.blockResultText === blockText) this.blockResultText = null;
                    blockText.destroy();
                },
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
        if (damage <= 0) return;
        sfx(this, 'combat.hit');

        const isTargetB = this.isCoopMode && this.currentEnemyAttackTarget === 'B';

        if (isTargetB && this.heroBHpBar && this.heroB) {
            // Damage Player B
            this.battleState.playerBHp = (this.battleState.playerBHp ?? 0) - damage;
            const maxHp = this.battleState.playerBMaxHp ?? this.gameState.getPlayer().maxHp;
            this.updateHpBar(this.heroBHpBar, Math.max(0, this.battleState.playerBHp), maxHp);

            this.heroB.setTint(0xff0000);
            this.time.delayedCall(100, () => this.heroB?.clearTint());
        } else {
            // Damage Player A
            this.battleState.playerHp -= damage;
            const player = this.gameState.getPlayer();
            this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);

            this.hero.setTint(0xff0000);
            this.time.delayedCall(100, () => this.hero.clearTint());
        }
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
            this.setPhase(this.turnManager.nextPhaseWhenEnemiesRemain());
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
        sfx(this, 'combat.phase');
        // Get the current (just defeated) phase's healPercent before advancing
        const currentPhase = this.bossPhases[this.currentBossPhase];
        const healPercent = currentPhase?.healPercent ?? 0;
        const player = this.gameState.getPlayer();
        const healAmount = healPercent > 0 ? Math.floor(player.maxHp * (healPercent / 100)) : 0;

        // Advance to next phase
        this.currentBossPhase++;
        this.tidalAttacks = { A: 0, B: 0 };
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
        if (this.depthBossHud) {
            this.depthBossHud.transition(nextPhase, healPercent, () => {
                if (this.battleState.playerHp > 0) this.battleState.playerHp = Math.min(this.depthPlayerMaxHp,
                    this.battleState.playerHp + Math.floor(this.depthPlayerMaxHp * healPercent / 100));
                this.updateHpBar(this.heroHpBar, this.battleState.playerHp, this.depthPlayerMaxHp);
                // Heal each living participant from their own max HP, without switching the active profile.
                if (this.heroBHpBar && (this.battleState.playerBHp ?? 0) > 0) {
                    const max = this.battleState.playerBMaxHp!;
                    this.battleState.playerBHp = Math.min(max, this.battleState.playerBHp! + Math.floor(max * healPercent / 100));
                    this.updateHpBar(this.heroBHpBar, this.battleState.playerBHp, max);
                }
                const boss = this.battleState.enemies[0];
                boss.hp = boss.maxHp = nextPhase.hp;
                boss.attack = nextPhase.attack; boss.defense = nextPhase.defense;
                boss.name = `${this.enemyDefs[0].name} - ${nextPhase.nameCs}`;
                this.updateHpBar(this.enemyHpBars[0], boss.hp, boss.maxHp);
                this.applyBossPhaseOverrides(nextPhase);
                this.enemies[0].play(this.getBossAnimKey(0, 'idle'));
                this.refreshDepthBossHud();
                this.targetIndicator.setVisible(true); this.updateTargetIndicator();
                this.setPhase('enemy_turn');
            });
            return;
        }
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
            boss.attack = Math.max(0, nextPhase.attack - this.ritualBossAttackReduction);
            boss.defense = nextPhase.defense;
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
                this.enemyContainers[idx].setDepth(this.getRestingDepth(this.enemyContainers[idx]));

                // Check if targeted player was defeated
                const isTargetB = this.isCoopMode && this.currentEnemyAttackTarget === 'B';
                const targetDefeated = isTargetB
                    ? (this.battleState.playerBHp ?? 0) <= 0
                    : this.battleState.playerHp <= 0;

                if (targetDefeated) {
                    if (this.isCoopMode && this.coopSession) {
                        if (isTargetB) {
                            this.playerBFallen = true;
                            this.coopSession.playerBFallen = true;
                            this.heroBContainer?.setAlpha(0.4);
                        } else {
                            this.coopSession.playerAFallen = true;
                            this.heroContainer?.setAlpha(0.4);
                        }
                        const aDefeated = this.battleState.playerHp <= 0;
                        const bDefeated = (this.battleState.playerBHp ?? 0) <= 0;
                        if (aDefeated && bDefeated) {
                            this.setPhase('defeat');
                            return;
                        }
                    } else {
                        this.setPhase('defeat');
                        return;
                    }
                }

                const nextEnemyIdx = this.findNextAliveEnemy(idx);
                if (nextEnemyIdx >= 0) {
                    this.currentAttackingEnemyIndex = nextEnemyIdx;
                    this.time.delayedCall(300, () => this.playEnemyAttack());
                } else {
                    this.battleState.turnCount++;
                    this.setPhase(this.turnManager.nextPhaseAfterEnemies());
                }
            }
        });
    }

    private playHeroAttack(): void {
        sfx(this, 'combat.swing');
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
        this.heroContainer.setDepth(BattleScene.ATTACK_DEPTH);

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
            const enemy = this.battleState.enemies[idx];
            const damage = resolveDamageAfterDefense(
                this.battleState.damageDealt,
                enemy.defense,
            ).damage;
            enemy.hp -= damage;
        if (damage > 0) sfx(this, 'combat.hit');

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
        // Reset depth to Y-based resting depth
        this.heroContainer.setDepth(this.getRestingDepth(this.heroContainer));

        // Check if ANY enemy is alive (not just the target) and pet is equipped
        const anyEnemyAlive = this.battleState.enemies.some(e => e.hp > 0);
        const nextPhase = this.turnManager.nextPhaseAfterPlayerAttack();

        if (anyEnemyAlive && this.equippedPetDef && this.petContainer) {
            // If the targeted enemy died, play its death animation before next phase
            if (enemy.hp <= 0) {
                this.playEnemyDeathAndFade(idx, enemySprite, animPrefix, () => {
                    this.setPhase(nextPhase);
                });
            } else {
                this.setPhase(nextPhase);
            }
        } else {
            this.continueAfterAttack(idx, enemy, enemySprite, animPrefix);
        }
    }

    private playEnemyDeathAndFade(idx: number, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string, onComplete: () => void): void {
        sfx(this, 'combat.release');
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
            const allDead = this.battleState.enemies.every(e => e.hp <= 0);

            const afterDeath = () => {
                if (allDead) {
                    this.targetIndicator.setVisible(false);
                    if (this.isBoss && this.currentBossPhase < this.bossPhases.length - 1) {
                        this.triggerBossPhaseTransition();
                    } else {
                        this.setPhase('victory');
                    }
                } else {
                    // Enemies remain — use correct phase routing (not always enemy_turn)
                    this.getCurrentEnemyIndex();
                    this.updateTargetIndicator();
                    this.setPhase(this.turnManager.nextPhaseAfterPlayerAttack());
                }
            };

            if (this.isBoss && idx === 0 && this.bossPhaseAnimOverrides.deathSequence?.length) {
                this.playBossDeathSequence(idx, enemySprite, afterDeath);
            } else {
                const deathKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'death') : `${animPrefix}-death`;
                enemySprite.play(deathKey);
                enemySprite.once('animationcomplete', () => {
                    this.time.delayedCall(1000, () => {
                        this.tweens.add({
                            targets: this.enemyContainers[idx],
                            alpha: 0,
                            duration: 500,
                            onComplete: afterDeath,
                        });
                    });
                });
            }
        } else {
            // No pet equipped, go to next phase after player attack
            this.setPhase(this.turnManager.nextPhaseAfterPlayerAttack());
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
                this.setPhase(this.turnManager.nextPhaseAfterPlayerAttack());
            }
        });
    }

    // --- Player B attack/miss (reuses Player A's animation logic) ---

    private playHeroBAttack(): void {
        sfx(this, 'combat.swing');
        if (!this.heroBContainer || !this.heroB || !this.heroBSpriteConfig) {
            this.setPhase(this.turnManager.nextPhaseAfterPlayerB());
            return;
        }

        const idx = this.getCurrentEnemyIndex();
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];
        const enemy = this.battleState.enemies[idx];

        const startX = this.heroBContainer.x;
        const startY = this.heroBContainer.y;
        const targetX = enemyContainer.x - 50;
        const targetY = enemyContainer.y;

        this.heroBContainer.setDepth(BattleScene.ATTACK_DEPTH);

        // Use same animation pipeline as Player A
        this.heroB.play(this.heroBSpriteConfig.attackAnim);

        const attackAnim = this.animationDefs[this.heroBSpriteConfig.attackAnim];
        const movement = attackAnim?.movement;
        const jumpDuration = movement?.duration || 400;
        const jumpOffsetY = movement?.offsetY || 0;
        const jumpEase = movement?.ease || 'Power1';
        const returnEase = movement?.returnEase || 'Power2';

        // X movement (same as Player A)
        this.tweens.add({
            targets: this.heroBContainer,
            x: targetX,
            duration: jumpDuration,
            ease: jumpEase,
        });

        // Y movement with jump arc (same as Player A)
        if (movement?.type === 'jump' && jumpOffsetY !== 0) {
            this.tweens.add({
                targets: this.heroBContainer,
                y: startY + jumpOffsetY,
                duration: jumpDuration / 2,
                ease: jumpEase,
                onComplete: () => {
                    this.tweens.add({
                        targets: this.heroBContainer,
                        y: targetY,
                        duration: jumpDuration / 2,
                        ease: returnEase,
                    });
                }
            });
        } else {
            this.tweens.add({
                targets: this.heroBContainer,
                y: targetY,
                duration: jumpDuration,
                ease: jumpEase,
            });
        }

        // After reaching enemy, apply damage (same timing as Player A)
        this.time.delayedCall(jumpDuration, () => {
            const damage = resolveDamageAfterDefense(
                this.battleState.damageDealt,
                enemy.defense,
            ).damage;
            enemy.hp -= damage;
        if (damage > 0) sfx(this, 'combat.hit');
            this.updateHpBar(this.enemyHpBars[idx], Math.max(0, enemy.hp), enemy.maxHp);

            // Show damage number
            const dmgText = this.add.text(enemyContainer.x, enemyContainer.y - 50, `-${damage}`, {
                fontSize: '28px', fontFamily: 'Arial, sans-serif',
                color: '#ff4444', fontStyle: 'bold',
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5);
            this.tweens.add({
                targets: dmgText,
                y: dmgText.y - 40, alpha: 0, duration: 800,
                onComplete: () => dmgText.destroy(),
            });

            // Enemy hit effect (same as Player A)
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

            // Wait for attack animation to finish, then return (same as Player A)
            this.heroB!.once('animationcomplete', () => {
                this.heroB!.play(this.heroBSpriteConfig!.idleAnim);

                // Return: jump arc back to start (same as Player A)
                if (movement?.type === 'jump' && jumpOffsetY !== 0) {
                    this.tweens.add({
                        targets: this.heroBContainer,
                        y: targetY + jumpOffsetY,
                        duration: 200,
                        ease: jumpEase,
                        onComplete: () => {
                            this.tweens.add({
                                targets: this.heroBContainer,
                                y: startY,
                                duration: 200,
                                ease: returnEase,
                            });
                        }
                    });
                    this.tweens.add({
                        targets: this.heroBContainer,
                        x: startX,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroBReturn(idx, enemy, enemySprite, animPrefix)
                    });
                } else {
                    this.tweens.add({
                        targets: this.heroBContainer,
                        x: startX, y: startY,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroBReturn(idx, enemy, enemySprite, animPrefix),
                    });
                }
            });
        });
    }

    private finishHeroBReturn(idx: number, enemy: BattleEnemy, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string): void {
        if (this.heroBContainer) this.heroBContainer.setDepth(this.getRestingDepth(this.heroBContainer));

        const anyEnemyAlive = this.battleState.enemies.some(e => e.hp > 0);
        const nextPhase = this.turnManager.nextPhaseAfterPlayerB();

        if (enemy.hp <= 0) {
            // Enemy died — play death, then check victory or continue
            if (anyEnemyAlive) {
                this.playEnemyDeathAndFade(idx, enemySprite, animPrefix, () => {
                    this.setPhase(nextPhase);
                });
            } else {
                this.playEnemyDeathAndFade(idx, enemySprite, animPrefix, () => {
                    this.checkVictoryOrContinue();
                });
            }
        } else {
            this.setPhase(nextPhase);
        }
    }

    private playHeroBMiss(): void {
        if (!this.heroBContainer) {
            this.setPhase(this.turnManager.nextPhaseAfterPlayerB());
            return;
        }

        const missText = this.add.text(this.heroBContainer.x, this.heroBContainer.y - 50, 'VEDLE!', {
            fontSize: '28px', fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: missText,
            y: missText.y - 40, alpha: 0, duration: 800,
            onComplete: () => {
                missText.destroy();
                this.setPhase(this.turnManager.nextPhaseAfterPlayerB());
            }
        });
    }

    private syncDepthBossHud(): void {
        this.depthBossHud?.setVisible(!this.mathBoard.getContainer().visible);
    }

    private refreshDepthBossHud(): void {
        const config = this.resolvedJourneyEncounter?.boss?.tidalWave;
        const targets: ('A' | 'B')[] = this.isCoopMode ? ['A', 'B'] : ['A'];
        const nextWave = config && this.currentPhaseAbility === 'tidal_wave'
            ? targets.filter(target => resolveTidalWave(config, this.tidalAttacks[target] + 1, false).wave) : [];
        const warning = nextWave.length ? `Příště silná vlna${this.isCoopMode ? `: ${nextWave.join(' + ')}` : ''}` : '';
        this.depthBossHud?.update(this.currentBossPhase, this.bossPhases.length, warning);
    }

    private playEnemyAttack(): void {
        sfx(this, 'combat.swing');
        const idx = this.currentAttackingEnemyIndex;
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];
        const enemyDef = this.battleState.enemies[idx];

        // Co-op: determine attack target (alternating per round, decided at enemy_turn start)
        const targetContainer = (this.isCoopMode && this.currentEnemyAttackTarget === 'B' && this.heroBContainer)
            ? this.heroBContainer
            : this.heroContainer;

        const startX = enemyContainer.x;
        const startY = enemyContainer.y;
        const targetX = targetContainer.x + 50;
        const targetY = targetContainer.y;

        // Store start position for return after attack
        this.enemyAttackStartPosition = { x: startX, y: startY };

        // Get enemy attack animation movement data
        const attackDefKey = (this.isBoss && idx === 0) ? this.getBossAttackAnimDefKey(0) : `${animPrefix}-attack-anim`;
        const attackAnim = this.animationDefs[attackDefKey];
        const movement = attackAnim?.movement;
        const moveDuration = movement?.duration || 400;
        const moveEase = movement?.ease || 'Power1';

        // Enemy appears on top during attack
        enemyContainer.setDepth(BattleScene.ATTACK_DEPTH);

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

            // Pause target hero sprite animation
            const targetHero = (this.isCoopMode && this.currentEnemyAttackTarget === 'B' && this.heroB)
                ? this.heroB : this.hero;
            targetHero.anims.pause();

            // Swap to target player's context for shield/block
            if (this.isCoopMode && this.coopSession) {
                if (this.currentEnemyAttackTarget === 'B') {
                    this.coopSession.activatePlayerB();
                } else {
                    this.coopSession.activatePlayerA();
                }
            }

            // Store resume callback for after block phase
            this.blockPhaseResumeCallback = () => {
                // Resume tweens
                this.enemyAttackTweens.forEach(t => t.resume());

                // Resume animations
                enemySprite.anims.resume();
                targetHero.anims.resume();

                // After remaining movement completes, brief pause then return
                this.time.delayedCall(moveDuration - 100, () => {
                    const returnAfterAttack = () => {
                        const returnIdleKey = (this.isBoss && idx === 0) ? this.getBossAnimKey(0, 'idle') : `${animPrefix}-idle`;
                        enemySprite.play(returnIdleKey);
                        this.returnEnemyToPosition(idx);
                    };
                    // Video-sourced attacks can outlast the approach. Opt in per animation;
                    // leave legacy enemy timing unchanged and respect block/pause/resume.
                    if (attackAnim?.holdUntilComplete && enemySprite.anims.isPlaying
                        && enemySprite.anims.currentAnim?.key === attackAnimName) {
                        enemySprite.once(`animationcomplete-${attackAnimName}`, returnAfterAttack);
                    } else this.time.delayedCall(100, returnAfterAttack);
                });
            };

            // Calculate enemy damage with phase abilities
            let damage = enemyDef.attack;
            if (this.currentPhaseAbility === 'vengeful_strike' && !this.lastAnswerCorrect) {
                damage += 1;
                this.showAbilityText('💢 Vengeful Strike! +1 damage');
            }
            if (this.currentPhaseAbility === 'last_stand' && !this.lastAnswerCorrect) {
                damage += 1;
                this.showAbilityText('🛡️ Last Stand! +1 damage');
            }

            // Start block phase
            const tidal = this.resolvedJourneyEncounter?.boss?.tidalWave;
            if (this.currentPhaseAbility === 'tidal_wave' && tidal) {
                const target = this.isCoopMode ? this.currentEnemyAttackTarget : 'A';
                const wave = resolveTidalWave(tidal, ++this.tidalAttacks[target], this.tidalBlessing[target]);
                damage += wave.bonusDamage;
                if (wave.blessingUsed) this.tidalBlessing[target] = false;
                this.refreshDepthBossHud();
            }
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
                enemyContainer.setDepth(this.getRestingDepth(enemyContainer));

                // Check if targeted player was defeated
                const isTargetB = this.isCoopMode && this.currentEnemyAttackTarget === 'B';
                const targetDefeated = isTargetB
                    ? (this.battleState.playerBHp ?? 0) <= 0
                    : this.battleState.playerHp <= 0;

                if (targetDefeated) {
                    if (this.isCoopMode) {
                        // Mark fallen player, dim their sprite
                        if (isTargetB) {
                            this.playerBFallen = true;
                            this.heroBContainer?.setAlpha(0.4);
                        } else {
                            // Player A fell — mark as fallen (skip A's turns going forward)
                            // For now, still check if BOTH are defeated
                        }

                        // Check if BOTH players are defeated
                        const aDefeated = this.battleState.playerHp <= 0;
                        const bDefeated = (this.battleState.playerBHp ?? 0) <= 0;
                        if (aDefeated && bDefeated) {
                            this.setPhase('defeat');
                            return;
                        }
                        // One still alive — continue
                    } else {
                        // Solo: defeat
                        this.setPhase('defeat');
                        return;
                    }
                }

                // Check if there are more enemies to attack
                const nextEnemyIdx = this.findNextAliveEnemy(idx);
                if (nextEnemyIdx >= 0) {
                    this.currentAttackingEnemyIndex = nextEnemyIdx;
                    this.time.delayedCall(300, () => this.playEnemyAttack());
                } else {
                    // All enemies have attacked — next round
                    this.battleState.turnCount++;
                    this.setPhase(this.turnManager.nextPhaseAfterEnemies());
                }
            }
        });
    }

    private getEncounterIdForWave(waveIndex: number): string {
        const encounterId = this.arenaDefinition?.waves[waveIndex]?.id;
        if (!encounterId) {
            throw new Error(`Arena ${this.arenaLevel} has no wave at index ${waveIndex}`);
        }
        return encounterId;
    }

    private isArenaCompletionWave(): boolean {
        if (!this.arenaDefinition || !this.encounterId) {
            throw new Error('Arena completion requested without a resolved encounter');
        }
        return this.arenaDefinition.metadata.completionEncounterId === this.encounterId;
    }

    private getNextArenaLevel(): number | undefined {
        const nextArenaId = this.arenaDefinition?.metadata.nextArenaId;
        if (!nextArenaId || !this.encounterCatalog) return undefined;
        return this.encounterCatalog.getArenaById(nextArenaId).level;
    }

    private getNextCityArenaLevel(): number | undefined {
        const nextArenaId = this.arenaDefinition?.metadata.nextArenaId;
        if (!nextArenaId || !this.encounterCatalog) return undefined;
        return this.encounterCatalog.getArenaById(nextArenaId).cityArenaLevel;
    }

    private getArenaCompletionReward(): ArenaCompletionReward {
        if (!this.arenaDefinition) {
            throw new Error('Arena completion bonus requested without an encounter definition');
        }
        return this.arenaDefinition.metadata.completionBonus;
    }

    private countArenaRewardCrystals(reward: ArenaCompletionReward): number {
        return reward.crystals.reduce((total, crystal) => total + crystal.count, 0);
    }

    private awardArenaReward(
        player: PlayerState,
        reward: ArenaCompletionReward,
        crystalDrops: Crystal[],
        crystalLabels: string[],
        label: string,
    ): boolean {
        if (reward.coins > 0) {
            ProgressionSystem.awardBattleCoin(player, reward.coins);
        }
        awardArenaRewardMana(player, reward);

        let overflow = false;
        for (const definition of reward.crystals) {
            for (let count = 0; count < definition.count; count += 1) {
                const value = Phaser.Math.Between(definition.valueMin, definition.valueMax);
                const crystal = CrystalSystem.generateCrystal(definition.tier, value);
                if (CrystalSystem.addToInventory(player, crystal)) {
                    crystalDrops.push(crystal);
                    crystalLabels.push(
                        definition.tier === 'special_porcupine'
                            ? 'Speciální krystal'
                            : label,
                    );
                } else {
                    CrystalSystem.addToGroundDrops(player, [crystal]);
                    overflow = true;
                }
            }
        }
        return overflow;
    }

    private getArenaProgressPlayers(): PlayerState[] {
        const players = [this.gameState.getPlayer()];
        if (this.isCoopMode && this.coopSession) {
            this.coopSession.activatePlayerB();
            players.push(this.gameState.getPlayer());
            this.coopSession.activatePlayerA();
        }
        return players;
    }

    private getNextArenaWaveForCurrentChoice(players: readonly PlayerState[]): number | null {
        if (!this.encounterCatalog) {
            throw new Error('Arena routing requested without an encounter catalog');
        }
        return findNextArenaWaveForChoice(
            this.encounterCatalog,
            players,
            this.arenaLevel,
            this.arenaWave,
            this.arenaChoiceKind,
        );
    }

    private finishArenaRunWithoutCompletion(): void {
        if (this.isCoopMode && this.coopSession) {
            this.coopSession.forBothPlayers(() => {
                const player = this.gameState.getPlayer();
                player.arena.isActive = false;
                player.arena.currentBattle = 0;
            });
            this.coopSession.activatePlayerA();
            return;
        }

        const player = this.gameState.getPlayer();
        player.arena.isActive = false;
        player.arena.currentBattle = 0;
        this.gameState.save();
    }

    /** Roll rewards from policy metadata so a virtual co-op enemy never changes combat geometry. */
    private rollBattleCoinReward(): number {
        if (this.resolvedEncounter) {
            const coreEnemies = this.cache.json.get('enemies') as EnemyDefinition[];
            const coreById = new Map(coreEnemies.map(enemy => [enemy.id, enemy]));
            return this.resolvedEncounter.rewardMetadata.sources.reduce((total, source) => {
                const enemy = coreById.get(source.enemyId);
                if (!enemy) {
                    throw new Error(`Reward source references missing enemy ${source.enemyId}`);
                }
                return total + Phaser.Math.Between(enemy.goldReward[0], enemy.goldReward[1]);
            }, 0);
        }

        return this.enemyDefs.reduce((total, def) => (
            total + Phaser.Math.Between(def.goldReward[0], def.goldReward[1])
        ), 0);
    }

    private finishMockBattle(result: 'victory' | 'defeat'): void {
        this.mathBoard?.hide();
        this.attackButton?.setVisible(false);
        this.potionButton?.setVisible(false);

        const victory = result === 'victory';
        const resultText = this.add.text(640, 300, victory ? 'VÍTĚZSTVÍ!' : 'PORÁŽKA...', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: victory ? '#ffd700' : '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setDepth(300).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: resultText,
            alpha: 1,
            scale: 1,
            duration: 500,
            ease: 'Back.out',
        });

        this.time.delayedCall(1900, () => {
            if (victory && this.storyVictory === 'forest-crystal') {
                this.scene.start('ForestCrystalRewardScene', {
                    testMode: true,
                    goldReward: 0,
                });
                return;
            }

            this.scene.start(this.returnScene, {
                ...this.returnData,
                mockBattleResult: result,
            });
        });
    }

    private completeForestGuardianJourney(): void {
        if (
            this.mockMode
            || !this.journeyMode
            || this.storyVictory !== 'forest-crystal'
        ) {
            return;
        }

        completeForestGuardianJourneyProgress(
            JourneySystem.getInstance(),
            this.returnData
        );
    }

    private onVictory(): void {
        if (this.mockMode) {
            this.finishMockBattle('victory');
            return;
        }

        if (this.isCoopMode && this.coopSession) {
            this.onCoopVictory();
            return;
        }

        // Record fight end for mastery system (updates fightsSinceSeen counters)
        this.getCoopSafeMasterySystem().recordFightEnd();

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
        // Capture this before recording any result/unlock from the completed wave.
        // Completion-only drops are awarded once per profile, while wave
        // completion/perfect improvements remain independently awardable.
        const isFirstArenaCompletion = this.fromArena
            && this.isArenaCompletionWave()
            && !player.arena.completedArenaLevels?.includes(this.arenaLevel);

        // Calculate total coins from all defeated enemies
        const totalCoins = this.rollBattleCoinReward();

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
            const encounterId = this.encounterId ?? this.getEncounterIdForWave(this.arenaWave);

            // Get previous best result for this wave (if any)
            const prevResult = getArenaEncounterResult(
                player,
                this.arenaLevel,
                this.arenaWave,
                encounterId,
            );
            const wasCompletedBefore = prevResult?.completed || false;
            const wasPerfectBefore = prevResult?.perfectWave || false;
            const waveCompletionBonus = this.arenaDefinition.waves[this.arenaWave].completionBonus;

            // Calculate crystal reward based on IMPROVEMENT only:
            // amounts and tiers come from encounters.json.
            let crystalsToAward = 0;
            if (!wasCompletedBefore) {
                crystalsToAward += this.countArenaRewardCrystals(
                    waveCompletionBonus.firstCompletion,
                );

                // Track town progression - only on first-time wave completions
                if (!player.townProgress) player.townProgress = createInitialTownProgress();
                player.townProgress.totalWavesCompleted += 1;
            }
            if (isPerfect && !wasPerfectBefore) {
                crystalsToAward += this.countArenaRewardCrystals(
                    waveCompletionBonus.firstPerfect,
                );
            }

            // Update wave result - store BEST result (perfectWave = true if ever achieved)
            const newPerfectStatus = isPerfect || wasPerfectBefore;
            const totalCrystalsEarned = (prevResult?.crystalsEarned || 0) + crystalsToAward;

            const savedResult = setArenaEncounterResult(
                player,
                this.arenaLevel,
                this.arenaWave,
                encounterId,
                {
                completed: true,
                perfectWave: newPerfectStatus,
                crystalsEarned: totalCrystalsEarned
                },
            );

            // Debug: Log what we're saving
            console.log('[BattleScene] Wave result:', {
                wave: this.arenaWave,
                isPerfect,
                wasCompletedBefore,
                wasPerfectBefore,
                crystalsToAward,
                totalCrystalsEarned,
                encounterId,
                savedResult,
                waveResults: JSON.stringify(player.arena.waveResults),
                encounterResults: JSON.stringify(player.arena.encounterResults),
            });

            if (!wasCompletedBefore) {
                crystalOverflow = this.awardArenaReward(
                    player,
                    waveCompletionBonus.firstCompletion,
                    crystalDrops,
                    crystalLabels,
                    'První dokončené kolo',
                ) || crystalOverflow;
            }
            if (isPerfect && !wasPerfectBefore) {
                crystalOverflow = this.awardArenaReward(
                    player,
                    waveCompletionBonus.firstPerfect,
                    crystalDrops,
                    crystalLabels,
                    'Za bezchybný souboj!',
                ) || crystalOverflow;
            }

            // Extra reward for the completion encounter of this arena level.
            if (this.isArenaCompletionWave() && isFirstArenaCompletion) {
                crystalOverflow = this.awardArenaReward(
                    player,
                    this.getArenaCompletionReward(),
                    crystalDrops,
                    crystalLabels,
                    'Za dokončení arény',
                ) || crystalOverflow;
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

        // Commit exploration completion with rewards, not after the victory screen.
        if (this.returnScene === 'UnderwaterRoomScene' && this.encounterId) {
            completeUnderwaterEncounter(player, this.encounterId);
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
            if (this.storyVictory === 'forest-crystal') {
                this.completeForestGuardianJourney();
                this.scene.start('ForestCrystalRewardScene', {
                    testMode: false,
                    goldReward: totalCoins,
                    crystalDrops,
                    crystalLabels,
                    crystalOverflow,
                });
                return;
            }

            if (this.fromArena) {
                // Completion is identified by encounter metadata, not a hardcoded array index.
                if (this.isArenaCompletionWave()) {
                    // Track arena level completion
                    if (!player.arena.completedArenaLevels) {
                        player.arena.completedArenaLevels = [];
                    }
                    if (!player.arena.completedArenaLevels.includes(this.arenaLevel)) {
                        player.arena.completedArenaLevels.push(this.arenaLevel);

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

                    const grantsLakeFairyReward = this.arenaStory === 'silverpond-lake-fairy'
                        && this.arenaDefinition?.cityId === 'silverpond'
                        && this.arenaDefinition.cityArenaLevel === 3
                        && isFirstArenaCompletion;
                    if (grantsLakeFairyReward) {
                        StorySystem.getInstance().completeLakeFairyQuest();
                    }

                    // Arena completed! Go to VictoryScene, then show the story
                    // reward before returning to the Silverpond hub.
                    this.scene.start('VictoryScene', {
                        returnScene: grantsLakeFairyReward
                            ? 'SilverpondFairyRewardScene'
                            : this.arenaExitScene,
                        returnData: grantsLakeFairyReward
                            ? { returnScene: this.arenaExitScene }
                            : {},
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
                        cityArenaLevel: this.arenaDefinition.cityArenaLevel,
                        nextArenaLevel: this.getNextArenaLevel(),
                        nextCityArenaLevel: this.getNextCityArenaLevel(),
                    });
                } else {
                    const nextWave = this.getNextArenaWaveForCurrentChoice([player]);

                    if (nextWave !== null) {
                        // Continue only within the goal the player explicitly selected.
                        this.scene.start('VictoryScene', {
                            returnScene: this.returnScene,
                            returnData: {
                                arenaLevel: this.arenaLevel,
                                wave: nextWave,
                                encounterId: this.getEncounterIdForWave(nextWave),
                                arenaChoiceId: this.arenaChoiceId,
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
                        // The selected progression/practice goal is done; do not force other waves.
                        this.finishArenaRunWithoutCompletion();
                        this.scene.start('VictoryScene', {
                            returnScene: this.arenaExitScene,
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
     * Co-op victory: calculate and apply rewards for both players.
     * Each player gets full coins, crystals based on their own improvement history.
     */
    private onCoopVictory(): void {
        const coop = this.coopSession!;
        const primaryEnemy = this.enemyDefs[0];
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const casualProgress = coop.recordCoopVictory();

        // Calculate coins once (same for both players)
        const totalCoins = this.rollBattleCoinReward();

        // Perfect wave requires BOTH players zero mistakes
        const isPerfect = this.waveWrongAnswerCount === 0;

        // Victory fanfare
        const victoryText = this.add.text(640, 300, 'VÍTĚZSTVÍ!', {
            fontSize: '64px', fontFamily: 'Arial, sans-serif',
            color: '#ffd700', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);
        this.tweens.add({ targets: victoryText, alpha: 1, scale: 1, duration: 500, ease: 'Back.out' });

        // Helper: apply rewards for a single player (called in their context)
        const applyPlayerRewards = (): { crystalDrops: Crystal[]; crystalLabels: string[]; crystalOverflow: boolean; unlockedPet: any } => {
            const player = this.gameState.getPlayer();
            const crystalDrops: Crystal[] = [];
            const crystalLabels: string[] = [];
            let crystalOverflow = false;
            let unlockedPetData: any = null;
            // This helper runs once in each co-op profile context. Capture the
            // first-completion state before setArenaEncounterResult or arena
            // unlock bookkeeping mutates that profile.
            const isFirstArenaCompletion = this.fromArena
                && this.isArenaCompletionWave()
                && !player.arena.completedArenaLevels?.includes(this.arenaLevel);

            // Award coins
            ProgressionSystem.awardBattleCoin(player, totalCoins);

            // Persist HP (use co-op tracked HP)
            if (coop.getActivePlayer() === 'A') {
                player.hp = Math.max(0, this.battleState.playerHp);
            } else {
                player.hp = Math.max(0, this.battleState.playerBHp ?? player.hp);
            }

            // Arena crystals
            if (this.fromArena) {
                const encounterId = this.encounterId ?? this.getEncounterIdForWave(this.arenaWave);
                const prevResult = getArenaEncounterResult(
                    player,
                    this.arenaLevel,
                    this.arenaWave,
                    encounterId,
                );
                const wasCompletedBefore = prevResult?.completed || false;
                const wasPerfectBefore = prevResult?.perfectWave || false;
                const waveCompletionBonus = this.arenaDefinition.waves[this.arenaWave].completionBonus;

                let crystalsToAward = 0;
                if (!wasCompletedBefore) {
                    crystalsToAward += this.countArenaRewardCrystals(
                        waveCompletionBonus.firstCompletion,
                    );
                    if (!player.townProgress) player.townProgress = createInitialTownProgress();
                    player.townProgress.totalWavesCompleted += 1;
                }
                if (isPerfect && !wasPerfectBefore) {
                    crystalsToAward += this.countArenaRewardCrystals(
                        waveCompletionBonus.firstPerfect,
                    );
                }

                setArenaEncounterResult(
                    player,
                    this.arenaLevel,
                    this.arenaWave,
                    encounterId,
                    {
                        completed: true,
                        perfectWave: isPerfect || wasPerfectBefore,
                        crystalsEarned: (prevResult?.crystalsEarned || 0) + crystalsToAward,
                    },
                );

                if (!wasCompletedBefore) {
                    crystalOverflow = this.awardArenaReward(
                        player,
                        waveCompletionBonus.firstCompletion,
                        crystalDrops,
                        crystalLabels,
                        'První dokončené kolo',
                    ) || crystalOverflow;
                }
                if (isPerfect && !wasPerfectBefore) {
                    crystalOverflow = this.awardArenaReward(
                        player,
                        waveCompletionBonus.firstPerfect,
                        crystalDrops,
                        crystalLabels,
                        'Za bezchybný souboj!',
                    ) || crystalOverflow;
                }
            }

            // Pet unlocks — both players get the unlock
            this.enemyDefs.forEach(def => {
                if (!player.unlockedPets.includes(def.id)) {
                    player.unlockedPets.push(def.id);
                    const pet = petsData.find(p => p.unlockedByEnemy === def.id);
                    if (pet && !unlockedPetData) {
                        unlockedPetData = { name: pet.name, spriteKey: pet.spriteKey, animPrefix: pet.animPrefix };
                    }
                }
            });

            // Non-arena crystal rewards (first defeat + perfect)
            if (!this.fromArena) {
                const isFirstDefeat = !player.unlockedPets.includes(primaryEnemy.id + '_defeated');
                player.perfectDefeats ??= [];
                const wasPerfectBefore = player.perfectDefeats.includes(primaryEnemy.id);

                if (isFirstDefeat) {
                    player.unlockedPets.push(primaryEnemy.id + '_defeated');
                    const c = CrystalSystem.generateCrystal('shard', 1);
                    if (CrystalSystem.addToInventory(player, c)) { crystalDrops.push(c); crystalLabels.push('Za první porážku'); }
                    else { CrystalSystem.addToGroundDrops(player, [c]); crystalOverflow = true; }
                }
                if (isPerfect && !wasPerfectBefore) {
                    const c = CrystalSystem.generateCrystal('shard', 1);
                    if (CrystalSystem.addToInventory(player, c)) { crystalDrops.push(c); crystalLabels.push('Za bezchybný souboj!'); }
                    else { CrystalSystem.addToGroundDrops(player, [c]); crystalOverflow = true; }
                    player.perfectDefeats.push(primaryEnemy.id);
                }
            }

            // Arena wave-5 completion rewards
            if (this.fromArena && this.isArenaCompletionWave()) {
                if (!player.arena.completedArenaLevels) player.arena.completedArenaLevels = [];

                if (isFirstArenaCompletion) {
                    crystalOverflow = this.awardArenaReward(
                        player,
                        this.getArenaCompletionReward(),
                        crystalDrops,
                        crystalLabels,
                        'Za dokončení arény',
                    ) || crystalOverflow;

                    player.arena.completedArenaLevels.push(this.arenaLevel);
                    const arenaUnlockKey = `arena_level_${this.arenaLevel}`;
                    if (!player.unlockedPets.includes(arenaUnlockKey)) {
                        player.unlockedPets.push(arenaUnlockKey);
                    }
                }
            }

            if (this.returnScene === 'UnderwaterRoomScene' && this.encounterId) {
                completeUnderwaterEncounter(player, this.encounterId);
            }
            // Record fight end for mastery
            this.getCoopSafeMasterySystem().recordFightEnd();
            this.gameState.save();

            return { crystalDrops, crystalLabels, crystalOverflow, unlockedPet: unlockedPetData };
        };

        this.time.delayedCall(2000, () => {
            // Apply rewards for Player A
            coop.activatePlayerA();
            const rewardsA = applyPlayerRewards();

            // Apply rewards for Player B
            coop.activatePlayerB();
            const rewardsB = applyPlayerRewards();

            // Advance and save both players' learning tracks.
            this.applyCoopSessionPromotions();

            // Switch back to A for VictoryScene display
            coop.activatePlayerA();

            // Build combined VictoryScene data
            const arenaCompleted = this.fromArena && this.isArenaCompletionWave();
            const playerAName = (() => { coop.activatePlayerA(); return this.gameState.getPlayer().name; })();
            const playerBName = (() => { coop.activatePlayerB(); const n = this.gameState.getPlayer().name; coop.activatePlayerA(); return n; })();
            const nextArenaWave = this.fromArena && !arenaCompleted
                ? this.getNextArenaWaveForCurrentChoice(this.getArenaProgressPlayers())
                : null;
            if (this.fromArena && !arenaCompleted && nextArenaWave === null) {
                this.finishArenaRunWithoutCompletion();
            }

            const victoryData: any = {
                returnScene: arenaCompleted || (this.fromArena && nextArenaWave === null)
                    ? this.arenaExitScene
                    : this.returnScene,
                returnData: arenaCompleted || (this.fromArena && nextArenaWave === null) ? {} : (this.fromArena ? {
                    arenaLevel: this.arenaLevel,
                    wave: nextArenaWave,
                    encounterId: this.getEncounterIdForWave(nextArenaWave!),
                    arenaChoiceId: this.arenaChoiceId,
                    fromBattle: true,
                } : { battleWon: true, ...this.returnData }),
                goldReward: totalCoins,
                isFirstDefeat: false,
                isPerfectDefeat: isPerfect,
                wasPerfectBefore: false,
                unlockedPet: rewardsA.unlockedPet || rewardsB.unlockedPet,
                enemySpriteKey: primaryEnemy.spriteKey,
                enemyAnimPrefix: primaryEnemy.animPrefix,
                crystalDrops: [...rewardsA.crystalDrops, ...rewardsB.crystalDrops],
                crystalLabels: [...rewardsA.crystalLabels, ...rewardsB.crystalLabels],
                crystalOverflow: rewardsA.crystalOverflow || rewardsB.crystalOverflow,
                // Co-op specific
                coopMode: true,
                playerAName,
                playerBName,
                goldRewardA: totalCoins,
                goldRewardB: totalCoins,
                sharedAttackCount: casualProgress.sharedAttackCount,
                sharedAttackCountLeveledUp: casualProgress.leveledUp,
            };

            // Handle arena completion / next wave routing
            if (arenaCompleted) {
                victoryData.arenaCompleted = true;
                victoryData.arenaLevel = this.arenaLevel;
                victoryData.cityArenaLevel = this.arenaDefinition?.cityArenaLevel;
                victoryData.nextArenaLevel = this.getNextArenaLevel();
                victoryData.nextCityArenaLevel = this.getNextCityArenaLevel();
                victoryData.returnScene = this.arenaExitScene;
                victoryData.returnData = {};
            }

            this.scene.start('VictoryScene', victoryData);
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
        if (this.mockMode) {
            this.finishMockBattle('defeat');
            return;
        }

        // Record fight end for mastery system
        this.recordCoopFightEnd();

        // Advance co-op session mastery before defeat handling
        this.applyCoopSessionPromotions();

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

        // Penalty — apply to both players in co-op
        if (this.isCoopMode && this.coopSession) {
            this.coopSession.forBothPlayers(() => {
                const p = this.gameState.getPlayer();
                p.hp = 1;
                p.status = 'přizabitý';
            });
        } else {
            const player = this.gameState.getPlayer();
            player.hp = 1;
            player.status = 'přizabitý';
            this.gameState.save();
        }

        let leavingDefeat = false;
        const leaveDefeat = () => {
            if (leavingDefeat) return;
            leavingDefeat = true;
            this.remoteFeedbackDismiss = null;

            if (this.isRemoteSessionActive()) {
                this.scene.start('TvPairingScene');
                return;
            }

            if (this.returnScene === 'UnderwaterRoomScene') {
                this.scene.start(this.returnScene, { ...this.returnData, battleLost: true });
                return;
            }
            // For journey mode, return to map. Arena variants return to their
            // own town instead of always falling back to Mathoria.
            this.scene.start(
                this.journeyMode
                    ? 'ForestMapScene'
                    : this.fromArena
                        ? this.arenaExitScene
                        : 'TownScene',
            );
        };

        if (this.isRemoteSessionActive()) {
            this.remoteFeedbackDismiss = leaveDefeat;
            this.publishRemoteFeedbackState(
                'Porážka',
                'Hrdina se zotaví a může boj zkusit znovu.',
                'Zpět do TV menu',
            );
        }

        this.time.delayedCall(3000, leaveDefeat);
    }

    // === Wrong Answer Feedback ===

    private createFeedbackOverlay(): void {
        this.feedbackOverlay = this.add.container(640, 360);
        this.feedbackOverlay.setDepth(250);
        this.feedbackOverlay.setVisible(false);

        // Dark semi-transparent backdrop
        const backdrop = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7);
        this.feedbackOverlay.add(backdrop);

        // Parchment-style panel
        const panelW = 620;
        const panelH = 480;
        const panel = this.add.rectangle(0, 0, panelW, panelH, 0x3b2a1a, 0.95);
        panel.setStrokeStyle(4, 0x8b6914);
        this.feedbackOverlay.add(panel);

        // Inner border for depth
        const innerBorder = this.add.rectangle(0, 0, panelW - 16, panelH - 16);
        innerBorder.setStrokeStyle(2, 0x5c4a2a);
        innerBorder.setFillStyle(0x2a1e0f, 0.5);
        this.feedbackOverlay.add(innerBorder);

        // Corner ornaments
        const cornerSize = 12;
        const corners = [
            { x: -panelW / 2 + 12, y: -panelH / 2 + 12 },
            { x: panelW / 2 - 12, y: -panelH / 2 + 12 },
            { x: -panelW / 2 + 12, y: panelH / 2 - 12 },
            { x: panelW / 2 - 12, y: panelH / 2 - 12 },
        ];
        for (const c of corners) {
            const diamond = this.add.rectangle(c.x, c.y, cornerSize, cornerSize, 0xc9a84c);
            diamond.setAngle(45);
            this.feedbackOverlay.add(diamond);
        }
    }

    private showWrongAnswerFeedback(problem: MathProblem, onDismiss: () => void): void {
        voice(this, 'vo.common.retry', true);
        // Clear previous feedback content (keep static panel elements: backdrop, panel, inner border, 4 corner diamonds)
        const staticCount = 7;
        while (this.feedbackOverlay.length > staticCount) {
            this.feedbackOverlay.removeAt(staticCount, true);
        }
        if (this.feedbackVisualizer) {
            this.feedbackVisualizer.destroy();
            this.feedbackVisualizer = null;
        }

        this.feedbackOverlay.setVisible(true);

        // Build equation string showing the correct answer
        const equationStr = formatMathProblem(problem, 'answer');
        this.publishRemoteFeedbackState('Špatná odpověď', equationStr);

        const correctLabel = this.add.text(0, -160, equationStr, {
            fontSize: '38px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: '#e8d44d',
            fontStyle: 'bold',
            stroke: '#1a0e00',
            strokeThickness: 5,
        }).setOrigin(0.5);
        this.feedbackOverlay.add(correctLabel);

        // Decorative line under equation
        const lineW = Math.min(correctLabel.width + 40, 400);
        const decoLine = this.add.rectangle(0, -132, lineW, 2, 0x8b6914, 0.6);
        this.feedbackOverlay.add(decoLine);

        const visualContainer = this.add.container(0, 40);
        this.feedbackOverlay.add(visualContainer);

        // Show skip button immediately — changes to ROZUMÍM after animation
        const btnBg = this.add.rectangle(0, 220, 210, 48, 0x5a3a1a)
            .setStrokeStyle(2, 0xc9a84c);
        this.feedbackOverlay.add(btnBg);

        const btnText = this.add.text(0, 220, 'PŘESKOČIT', {
            fontSize: '20px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: '#e8d44d',
            fontStyle: 'bold',
            stroke: '#1a0e00',
            strokeThickness: 2,
        }).setOrigin(0.5);
        this.feedbackOverlay.add(btnText);

        btnBg.setAlpha(0);
        btnText.setAlpha(0);
        this.tweens.add({
            targets: [btnBg, btnText],
            alpha: 1,
            duration: 300,
            ease: 'Power2',
        });

        let animationDone = false;
        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            animationDone = true;
            this.remoteFeedbackDismiss = null;
            this.closeFeedbackOverlay();
            onDismiss();
        };
        this.remoteFeedbackDismiss = dismiss;

        btnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => {
                btnBg.setFillStyle(0x6b4a2a);
                btnText.setColor('#ffe066');
            })
            .on('pointerout', () => {
                btnBg.setFillStyle(0x5a3a1a);
                btnText.setColor('#e8d44d');
            })
            .on('pointerdown', () => {
                dismiss();
            });

        const showTime = Date.now();
        this.feedbackVisualizer = new TrialFeedbackVisualizer(this, visualContainer, () => {
            if (animationDone) return;
            animationDone = true;
            const elapsed = Date.now() - showTime;
            const remaining = Math.max(0, 3000 - elapsed);
            this.time.delayedCall(remaining, () => {
                if (btnText.active) btnText.setText('ROZUMÍM');
            });
        });
        this.feedbackVisualizer.show(problem);
    }

    private closeFeedbackOverlay(): void {
        gameAudio().cancel(this);
        this.remoteFeedbackDismiss = null;
        this.feedbackOverlay.setVisible(false);
        if (this.feedbackVisualizer) {
            this.feedbackVisualizer.destroy();
            this.feedbackVisualizer = null;
        }
    }
}

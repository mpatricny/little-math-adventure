import Phaser from 'phaser';
import { DEV_TOOLS_ENABLED } from '../config/buildVariant';
import { EnemyDefinition, PetDefinition, PlayerState } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { PauseMenu } from '../ui/PauseMenu';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { createEncounterCatalog, EncounterCatalog } from '../systems/EncounterCatalog';
import type { ArenaEncounter, ResolvedArenaWave } from '../types/encounters';
import {
    getArenaResultsForEncounters,
    selectArenaEncounterProgress,
} from '../systems/ArenaProgressSystem';
import {
    getArenaChoiceOptions,
    type ArenaChoiceKind,
    type ArenaChoiceOption,
} from '../systems/ArenaChoiceSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { PreparationSystem } from '../systems/PreparationSystem';
import { resolveEnemyBattlePresentation } from '../systems/EnemyPresentationSystem';
import { ArenaPlayerStatusPod } from '../ui/ArenaPlayerStatusPod';
import { TownResourceHud } from '../ui/TownResourceHud';
import { MedievalActionButton } from '../ui/MedievalActionButton';

type ArenaHudHost = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
};

export interface ArenaSceneOptions {
    key?: string;
    backSceneKey?: string;
    layoutSceneKey?: string;
    backgroundTexture?: string;
    battleBackgroundTexture?: string;
    battleBackgroundTextures?: Readonly<Partial<Record<number, string>>>;
    previewArenaLevels?: readonly number[];
    /** One-based wave number selected when entering each configured preview arena. */
    previewArenaWaves?: Readonly<Partial<Record<number, number>>>;
    titleText?: string;
    showArenaLevelInTitle?: boolean;
    persistChanges?: boolean;
    /** Restricts progression and practice choices to this city's three arenas. */
    cityId?: string;
    arenaStory?: 'silverpond-lake-fairy';
}

/**
 * ArenaScene - Wave Preview / Interlude Screen
 *
 * Shows upcoming wave enemies (idling), player stats, and navigation buttons.
 * No fighting happens here - battles happen in BattleScene.
 *
 * Flow:
 * - TownScene → ArenaScene (preview) → BattleScene (fight) → ArenaScene (next wave) → ...
 * - Player can leave at any time between waves
 */
export class ArenaScene extends Phaser.Scene {
    private static readonly ARENA_FRAME_ID = 'ARENA WITH TITLE';
    private static readonly ARENA_TITLE_TEXT_AREA_ID = '1769790265029-1mry456tk';
    private readonly sceneKey: string;
    private readonly backSceneKey: string;
    private readonly layoutSceneKey: string;
    private readonly backgroundTexture?: string;
    private readonly battleBackgroundTexture?: string;
    private readonly battleBackgroundTextures?: Readonly<Partial<Record<number, string>>>;
    private readonly previewArenaLevels?: readonly number[];
    private readonly previewArenaWaves?: Readonly<Partial<Record<number, number>>>;
    private readonly titleText?: string;
    private readonly showArenaLevelInTitle: boolean;
    private readonly persistChanges: boolean;
    private readonly cityId: string;
    private readonly arenaStory?: 'silverpond-lake-fairy';

    // Sprites
    private hero!: Phaser.GameObjects.Sprite;
    private petSprite: Phaser.GameObjects.Sprite | null = null;
    private enemies: Phaser.GameObjects.Container[] = [];  // Containers with sprite + label

    // UI Components
    private playerAStatusPod?: ArenaPlayerStatusPod;
    private playerBStatusPod?: ArenaPlayerStatusPod;
    private resourceHud?: TownResourceHud;
    private waveText!: Phaser.GameObjects.Text;
    private startBattleButton!: Phaser.GameObjects.Container;
    private leaveButton!: Phaser.GameObjects.Container;
    private arenaOptionPrevious?: Phaser.GameObjects.GameObject;
    private arenaOptionNext?: Phaser.GameObjects.GameObject;
    private arenaOptionStatus?: Phaser.GameObjects.Text;
    private arenaCompletionText?: Phaser.GameObjects.Text;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Pause menu
    private pauseMenu!: PauseMenu;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;
    private arenaFrame?: Phaser.GameObjects.Container;

    // Wave Progress UI
    private waveProgressContainer!: Phaser.GameObjects.Container;

    // State
    private gameState!: GameStateManager;
    private enemyDefs: EnemyDefinition[] = [];
    private baseEnemyDefs: EnemyDefinition[] = []; // Unscaled defs for passing to BattleScene
    private arenaLevel: number = 1;
    private currentWave: number = 0;
    private encounterCatalog!: EncounterCatalog;
    private arenaDefinition!: ArenaEncounter;
    private resolvedEncounter!: ResolvedArenaWave;
    private encounterId: string | null = null;
    private arenaChoices: ArenaChoiceOption[] = [];
    private arenaChoiceId: string | null = null;
    private arenaChoiceKind: ArenaChoiceKind | null = null;

    constructor(options: ArenaSceneOptions = {}) {
        const sceneKey = options.key ?? 'ArenaScene';
        super({ key: sceneKey });
        this.sceneKey = sceneKey;
        this.backSceneKey = options.backSceneKey ?? 'TownScene';
        this.layoutSceneKey = options.layoutSceneKey ?? sceneKey;
        this.backgroundTexture = options.backgroundTexture;
        this.battleBackgroundTexture = options.battleBackgroundTexture;
        this.battleBackgroundTextures = options.battleBackgroundTextures;
        this.previewArenaLevels = options.previewArenaLevels
            ? [...options.previewArenaLevels]
            : undefined;
        this.previewArenaWaves = options.previewArenaWaves
            ? { ...options.previewArenaWaves }
            : undefined;
        this.titleText = options.titleText;
        this.showArenaLevelInTitle = options.showArenaLevelInTitle ?? false;
        this.persistChanges = options.persistChanges ?? true;
        this.cityId = options.cityId ?? 'mathoria';
        this.arenaStory = options.arenaStory;
    }

    init(data: {
        arenaLevel?: number;
        wave?: number;
        encounterId?: string;
        arenaChoiceId?: string;
        fromBattle?: boolean;
        mockBattleResult?: 'victory' | 'defeat';
    } = {}): void {
        this.gameState = GameStateManager.getInstance();
        this.captureTransientState();
        const player = this.gameState.getPlayer();

        // Debug: Log incoming data
        console.log('[ArenaScene.init] Received data:', {
            dataArenaLevel: data.arenaLevel,
            dataWave: data.wave,
            fromBattle: data.fromBattle,
            playerArenaWaveResults: JSON.stringify(player.arena.waveResults),
            playerArenaCurrentBattle: player.arena.currentBattle,
            playerArenaIsActive: player.arena.isActive
        });

        const allEnemies = this.cache.json.get('enemies') as EnemyDefinition[];
        this.encounterCatalog = createEncounterCatalog(this.cache.json.get('encounters'), {
            core: allEnemies,
        });

        const choicePlayers = this.getArenaChoicePlayers();
        this.arenaChoices = this.previewArenaLevels
            ? this.createPreviewArenaChoices(this.previewArenaLevels)
            : getArenaChoiceOptions(this.encounterCatalog, choicePlayers, this.cityId);
        const requestedChoice = data.arenaChoiceId
            ? this.arenaChoices.find(choice => choice.id === data.arenaChoiceId)
            : undefined;
        const hasExplicitTarget = data.encounterId !== undefined
            || data.arenaLevel !== undefined
            || data.wave !== undefined;
        // BattleScene returns an explicit next encounter. Keep the choice ID only
        // as the run goal (progression/improvement); a recomputed first choice may
        // still point at an earlier wave that was not perfected on this attempt.
        const selectedChoice = hasExplicitTarget
            ? undefined
            : requestedChoice ?? this.arenaChoices[0];

        const requestedArenaLevel = selectedChoice?.arenaLevel
            ?? data.arenaLevel
            ?? player.arena.arenaLevel
            ?? 1;
        const requestedWave = selectedChoice?.waveIndex
            ?? data.wave
            ?? player.arena.currentBattle
            ?? 0;
        const requestedEncounterId = selectedChoice?.encounterId ?? data.encounterId;

        if (requestedEncounterId) {
            const requestedEncounter = this.encounterCatalog.getWaveById(requestedEncounterId);
            const matchingArena = this.encounterCatalog.getArenaLevels()
                .map(level => this.encounterCatalog.getArena(level))
                .find(arena => arena.waves.some(wave => wave.id === requestedEncounter.id));
            if (!matchingArena) {
                throw new Error(`Encounter ${requestedEncounterId} is not part of an arena`);
            }
            this.arenaLevel = matchingArena.level;
            this.currentWave = requestedEncounter.index;
        } else {
            this.arenaLevel = requestedArenaLevel;
            this.arenaDefinition = this.encounterCatalog.getArena(this.arenaLevel);
            this.currentWave = Phaser.Math.Clamp(requestedWave, 0, this.arenaDefinition.waves.length - 1);
        }

        this.arenaDefinition = this.encounterCatalog.getArena(this.arenaLevel);
        const coop = CoopSessionManager.getInstance();
        const mode = this.isCoopPreview() ? 'coop' : 'solo';
        const soloEncounter = this.encounterCatalog.resolveArenaWave({
            arenaLevel: this.arenaLevel,
            waveIndex: this.currentWave,
            mode: 'solo',
        });
        this.resolvedEncounter = this.encounterCatalog.resolveArenaWave({
            arenaLevel: this.arenaLevel,
            waveIndex: this.currentWave,
            mode,
        });
        this.encounterId = this.resolvedEncounter.encounterId;
        const matchingChoice = requestedChoice ?? selectedChoice ?? this.arenaChoices.find(choice => (
            choice.arenaLevel === this.arenaLevel
            && choice.waveIndex === this.currentWave
        ));
        this.arenaChoiceId = matchingChoice?.id ?? data.arenaChoiceId ?? null;
        this.arenaChoiceKind = matchingChoice?.kind ?? null;
        this.baseEnemyDefs = soloEncounter.enemies;
        this.enemyDefs = mode === 'solo'
            ? [...this.baseEnemyDefs]
            : this.resolvedEncounter.enemies;

        if (this.isCoopPreview()) {
            coop.forBothPlayers(() => {
                const p = this.gameState.getPlayer();
                selectArenaEncounterProgress(
                    p,
                    this.arenaLevel,
                    this.resolvedEncounter.encounterId,
                    this.currentWave,
                );
                p.arena.isActive = true;
            });
            coop.activatePlayerA();
        } else {
            selectArenaEncounterProgress(
                player,
                this.arenaLevel,
                this.resolvedEncounter.encounterId,
                this.currentWave,
            );
            player.arena.isActive = true;
            this.saveState();
        }

        console.log('[ArenaScene.init] Set currentWave to:', this.currentWave);
    }

    private getArenaChoicePlayers(): PlayerState[] {
        const coop = CoopSessionManager.getInstance();
        const players = [this.gameState.getPlayer()];
        if (this.isCoopPreview()) {
            coop.activatePlayerB();
            players.push(this.gameState.getPlayer());
            coop.activatePlayerA();
        }
        return players;
    }

    private createPreviewArenaChoices(levels: readonly number[]): ArenaChoiceOption[] {
        return levels.map(level => {
            const arena = this.encounterCatalog.getArena(level);
            const requestedWaveNumber = Math.trunc(this.previewArenaWaves?.[level] ?? 1);
            const waveIndex = Phaser.Math.Clamp(requestedWaveNumber - 1, 0, arena.waves.length - 1);
            const previewWave = arena.waves[waveIndex];

            return {
                id: `progression:${arena.id}`,
                kind: 'progression',
                arenaId: arena.id,
                arenaLevel: arena.level,
                waveIndex: previewWave.index,
                encounterId: previewWave.id,
            };
        });
    }

    private captureTransientState(): void {
        if (this.persistChanges) return;

        const player = this.gameState.getPlayer();
        const playerSnapshot = this.cloneState(player);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            Object.assign(player, this.cloneState(playerSnapshot));
        });
    }

    private cloneState<T>(state: T): T {
        return JSON.parse(JSON.stringify(state)) as T;
    }

    private saveState(): void {
        if (this.persistChanges) {
            this.gameState.save();
        }
    }

    private isCoopPreview(): boolean {
        return this.persistChanges && CoopSessionManager.getInstance().isCoopActive();
    }

    create(): void {
        const player = this.gameState.getPlayer();

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register event handlers before building
        this.sceneBuilder.registerHandler('startBattle', () => this.startBattle());
        this.sceneBuilder.registerHandler('leaveArena', () => this.leaveArena());
        this.sceneBuilder.registerHandler('selectPreviousArena', () => this.cycleArenaChoice(-1));
        this.sceneBuilder.registerHandler('selectNextArena', () => this.cycleArenaChoice(1));

        this.sceneBuilder.buildScene(this.layoutSceneKey);
        this.applyBackgroundTexture();

        this.arenaFrame = this.sceneBuilder.get<Phaser.GameObjects.Container>(ArenaScene.ARENA_FRAME_ID);
        this.updateArenaTitle();

        // Get wave text from builder and update it
        this.waveText = this.sceneBuilder.get('waveText') as Phaser.GameObjects.Text;
        if (this.waveText) {
            this.waveText.setText(`VLNA ${this.currentWave + 1}/${this.arenaDefinition.waves.length}`);
        }

        // Get buttons from builder
        this.createStartBattleButton();
        this.leaveButton = this.sceneBuilder.get('leaveButton') as Phaser.GameObjects.Container;
        this.arenaOptionPrevious = this.sceneBuilder.get('arenaOptionPrevious');
        this.arenaOptionNext = this.sceneBuilder.get('arenaOptionNext');
        this.arenaOptionStatus = this.sceneBuilder.get('arenaOptionStatus') as Phaser.GameObjects.Text;
        this.arenaCompletionText = this.sceneBuilder.get('arenaCompletionText') as Phaser.GameObjects.Text;
        this.updateArenaChoiceControls();

        // A completed arena remains replayable until every wave is perfect.
        // In co-op, both profiles must have perfected every wave before replay is hidden.
        const coop = CoopSessionManager.getInstance();
        const encounterIds = this.arenaDefinition.waves.map(wave => wave.id);
        const playerAResults = getArenaResultsForEncounters(
            player,
            this.arenaLevel,
            encounterIds,
        );
        const playerAPerfect = playerAResults.every(result => (
            result?.completed === true && result.perfectWave === true
        ));
        let isFullyPerfect = playerAPerfect;
        if (this.isCoopPreview()) {
            coop.activatePlayerB();
            const playerBResults = getArenaResultsForEncounters(
                this.gameState.getPlayer(),
                this.arenaLevel,
                encounterIds,
            );
            coop.activatePlayerA();
            isFullyPerfect = playerAPerfect && playerBResults.every(result => (
                result?.completed === true && result.perfectWave === true
            ));
        }

        // Get spawn points from scene-layouts.json for positioning
        const enemyCount = this.enemyDefs.length;
        const spawnPoints = this.sceneBuilder.getSpawnPoints(
            this.layoutSceneKey,
            enemyCount,
            this.isCoopPreview(),
        );

        if (isFullyPerfect) {
            // Nothing remains to improve — show completion message, hide start button, no enemies.
            if (this.waveText) {
                this.waveText.setText('ARÉNA DOKONČENA!');
            }
            if (this.startBattleButton) this.startBattleButton.setVisible(false);

            this.arenaCompletionText?.setVisible(true);
        } else {
            // Create enemy previews (idling) - pass spawn points for positioning
            this.createEnemyPreviews(spawnPoints);
        }

        // Hero - use spawn points if available, otherwise fallback
        const heroX = spawnPoints?.player.x ?? 235;
        const heroY = spawnPoints?.player.y ?? 575;
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        // Get hero scale from character definition
        const charactersData = this.cache.json.get('characters') as Array<{ id: string; scale?: number }>;
        const characterDef = charactersData?.find(c => c.id === player.characterType);
        const HERO_BASE_SCALE = 1.0;
        const heroScale = (characterDef?.scale ?? 1.0) * HERO_BASE_SCALE;

        this.hero = this.add.sprite(heroX, heroY, spriteConfig.idleTexture)
            .setScale(heroScale)
            .play(spriteConfig.idleAnim);

        let playerB: PlayerState | null = null;

        // Co-op: show Player B's hero + pet in arena preview
        if (this.isCoopPreview()) {
            coop.activatePlayerB();
            playerB = this.gameState.getPlayer();
            const spriteBConfig = getPlayerSpriteConfig(playerB.characterType);
            const charDefB = charactersData?.find(c => c.id === playerB.characterType);
            const heroScaleB = (charDefB?.scale ?? 1.0) * HERO_BASE_SCALE;
            const heroBX = spawnPoints?.playerB?.x ?? (heroX - 100);
            const heroBY = spawnPoints?.playerB?.y ?? (heroY + 45);
            this.add.sprite(heroBX, heroBY, spriteBConfig.idleTexture)
                .setScale(heroScaleB)
                .play(spriteBConfig.idleAnim)
                .setDepth(-1);

            // Player B's pet
            if (playerB.activePet) {
                const petsData = this.cache.json.get('pets') as PetDefinition[];
                const petDefB = petsData.find(p => p.id === playerB.activePet);
                if (petDefB) {
                    const petScaleB = (petDefB.scale ?? 1.0) * 0.5;
                    const petBX = spawnPoints?.petB?.x ?? (heroBX - 50);
                    const petBY = spawnPoints?.petB?.y ?? (heroBY + 30);
                    const petBSprite = this.add.sprite(petBX, petBY, petDefB.spriteKey, 0)
                        .setScale(petScaleB)
                        .setFlipX(true)
                        .setDepth(-2);
                    const idleAnim = `${petDefB.animPrefix}-idle`;
                    if (this.anims.exists(idleAnim)) petBSprite.play(idleAnim);
                }
            }

            coop.activatePlayerA();
        }

        // Create pet companion if player has one equipped
        this.createPetCompanion(player, spawnPoints);

        // Create the approved compact per-player status and shared resources.
        this.createArenaStatusHud(player, playerB);

        // Create Wave Progress Table inside the existing frame
        this.createWaveProgressContent();

        // Setup debugger
        this.setupDebugger();
    }

    private applyBackgroundTexture(): void {
        if (!this.backgroundTexture) return;

        const background = this.sceneBuilder.get<Phaser.GameObjects.Image>('bg');
        background?.setTexture(this.backgroundTexture).setDisplaySize(1280, 720);
    }

    private updateArenaTitle(): void {
        const textObjects = this.arenaFrame?.getData('textObjects') as Map<
            string,
            { text: Phaser.GameObjects.Text; parentLayerId: string | null }
        > | undefined;
        const title = textObjects?.get(ArenaScene.ARENA_TITLE_TEXT_AREA_ID)?.text;

        if (!title) {
            console.warn('[ArenaScene] Arena title text area was not found');
            return;
        }

        const configuredTitle = this.titleText
            ? `${this.titleText}${this.showArenaLevelInTitle ? ` ${this.arenaDefinition.cityArenaLevel}` : ''}`
            : `ARÉNA ${this.arenaDefinition.cityArenaLevel}`;
        title.setText(configuredTitle);
    }

    private updateArenaChoiceControls(): void {
        const hasAlternatives = this.arenaChoices.length > 1;
        this.arenaOptionPrevious?.setVisible(hasAlternatives);
        this.arenaOptionNext?.setVisible(hasAlternatives);

        if (!this.arenaOptionStatus) return;
        const selectedIndex = Math.max(
            0,
            this.arenaChoices.findIndex(choice => choice.id === this.arenaChoiceId),
        );
        const position = `${selectedIndex + 1}/${Math.max(1, this.arenaChoices.length)}`;
        const label = this.arenaChoiceKind === 'improvement'
            ? 'DOPILOVAT ★'
            : this.arenaChoiceKind === 'complete'
                ? 'VŠECHNY VLNY PERFEKTNÍ'
                : 'POKRAČOVAT V PŘÍBĚHU';
        this.arenaOptionStatus.setText(`${label}  •  ${position}`).setVisible(true);
    }

    private cycleArenaChoice(offset: -1 | 1): void {
        if (this.arenaChoices.length < 2) return;
        const currentIndex = Math.max(
            0,
            this.arenaChoices.findIndex(choice => choice.id === this.arenaChoiceId),
        );
        const nextIndex = (
            currentIndex + offset + this.arenaChoices.length
        ) % this.arenaChoices.length;
        const nextChoice = this.arenaChoices[nextIndex];

        this.scene.restart({
            arenaChoiceId: nextChoice.id,
            arenaLevel: nextChoice.arenaLevel,
            wave: nextChoice.waveIndex,
            encounterId: nextChoice.encounterId,
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, this.layoutSceneKey);

        // Create pause menu (ESC key to toggle)
        this.pauseMenu = new PauseMenu(this);

        // Register moveable elements
        this.debugger.register('hero', this.hero);
        if (this.waveText) this.debugger.register('waveText', this.waveText);
        if (this.startBattleButton) this.debugger.register('startBattleButton', this.startBattleButton);
        if (this.leaveButton) this.debugger.register('leaveButton', this.leaveButton);

        // Register enemy sprites
        this.enemies.forEach((enemy, index) => {
            this.debugger.register(`enemy${index}`, enemy);
        });

        // Debug shortcuts (W to skip to victory, N to skip wave)
        this.debugger.setBattleCallbacks(
            () => this.debugSkipArena(),
            () => this.debugFullHeal()
        );

        if (DEV_TOOLS_ENABLED) {
            this.input.keyboard?.on('keydown-N', () => this.debugSkipWave());
        }
        this.input.keyboard?.on('keydown-LEFT', () => this.cycleArenaChoice(-1));
        this.input.keyboard?.on('keydown-RIGHT', () => this.cycleArenaChoice(1));
    }

    private debugSkipArena(): void {
        console.log('[DEBUG] Skip arena');
        const player = this.gameState.getPlayer();
        player.arena.isActive = false;
        ProgressionSystem.fullHeal(player);
        this.saveState();
        this.scene.start(this.backSceneKey);
    }

    private debugSkipWave(): void {
        console.log('[DEBUG] Skip wave');
        if (this.currentWave < this.arenaDefinition.waves.length - 1) {
            const nextWave = this.arenaDefinition.waves[this.currentWave + 1];
            this.scene.start(this.sceneKey, {
                arenaLevel: this.arenaLevel,
                wave: this.currentWave + 1,
                encounterId: nextWave.id,
                arenaChoiceId: this.arenaChoiceId ?? undefined,
            });
        } else {
            this.debugSkipArena();
        }
    }

    private debugFullHeal(): void {
        console.log('[DEBUG] Full heal');
        const player = this.gameState.getPlayer();
        ProgressionSystem.fullHeal(player);
        this.playerAStatusPod?.setHp(player.hp, player.maxHp);
    }

    private createPetCompanion(
        player: { activePet: string | null },
        spawnPoints: { player: { x: number; y: number }; pet: { x: number; y: number }; enemies: { x: number; y: number }[] } | null
    ): void {
        this.petSprite = null;

        if (!player.activePet) return;

        // Get pet definition
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const petDef = petsData.find(p => p.id === player.activePet);
        if (!petDef) return;

        // Pet position from spawn points or default relative to hero
        const petX = spawnPoints?.pet.x ?? 135;
        const petY = spawnPoints?.pet.y ?? 575;

        // Get pet scale from definition
        const PET_BASE_SCALE = 0.5;
        const petScale = (petDef.scale ?? 1.0) * PET_BASE_SCALE;

        // Create pet sprite - flipped horizontally (facing right like hero)
        this.petSprite = this.add.sprite(petX, petY, petDef.spriteKey, 0)
            .setScale(petScale)
            .setFlipX(true)  // Face right like hero
            .setDepth(-1);  // Behind hero

        // Play idle animation if it exists
        const idleAnim = `${petDef.animPrefix}-idle`;
        if (this.anims.exists(idleAnim)) {
            this.petSprite.play(idleAnim);
        }
    }

    private createEnemyPreviews(spawnPoints: { player: { x: number; y: number }; pet: { x: number; y: number }; enemies: { x: number; y: number }[] } | null): void {
        // Default enemy positions (fallback)
        const defaultPositions = [
            { x: 850, y: 425 },
            { x: 950, y: 525 },
            { x: 1050, y: 425 }
        ];

        this.enemies = [];

        this.enemyDefs.forEach((def, index) => {
            // Use spawn points if available, otherwise use defaults
            let x: number, y: number;
            if (spawnPoints && spawnPoints.enemies[index]) {
                x = spawnPoints.enemies[index].x;
                y = spawnPoints.enemies[index].y;
            } else if (defaultPositions[index]) {
                x = defaultPositions[index].x;
                y = defaultPositions[index].y;
            } else {
                const centerX = 850;
                const spacing = 140;
                x = centerX + (index - 1) * spacing;
                y = 425;
            }

            const presentation = resolveEnemyBattlePresentation(def, { x, y });

            // Create sprite (idling) - position relative to container
            const sprite = this.add.sprite(0, 0, def.spriteKey)
                .setScale(presentation.scale);

            // Play idle animation
            const idleAnim = `${def.animPrefix}-idle`;
            if (this.anims.exists(idleAnim)) {
                sprite.play(idleAnim);
            }

            // Create label above sprite (bound to container)
            const label = this.add.text(0, -90, def.name.toUpperCase(), {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffcc00',
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5);

            // Create container with sprite and label
            const container = this.add.container(presentation.x, presentation.y, [sprite, label]);
            this.enemies.push(container);
        });
    }

    private createArenaStatusHud(playerA: PlayerState, playerB: PlayerState | null): void {
        const resourceHost = this.getHudHost('arenaResourceHudHost', {
            x: 1120,
            y: 42,
            depth: 72,
            width: 258,
            height: 74,
        });
        this.resourceHud = new TownResourceHud(this, resourceHost);
        this.resourceHud.setValues(
            ManaSystem.getMana(playerA),
            ProgressionSystem.getTotalCoinValue(playerA.coins),
        );

        const playerAHost = this.getHudHost(
            playerB ? 'arenaPlayerACoopPodHost' : 'arenaPlayerASinglePodHost',
            playerB
                ? { x: 470, y: 500, depth: 72, width: 178, height: 78 }
                : { x: 368, y: 547, depth: 72, width: 178, height: 78 },
        );
        this.playerAStatusPod = this.createPlayerStatusPod(
            playerA,
            playerAHost,
            'A',
            'left',
        );

        if (!playerB) return;

        const playerBHost = this.getHudHost('arenaPlayerBPodHost', {
            x: 89,
            y: 630,
            depth: 72,
            width: 176,
            height: 77,
        });
        this.playerBStatusPod = this.createPlayerStatusPod(
            playerB,
            playerBHost,
            'B',
            'right',
        );
    }

    private createStartBattleButton(): void {
        const host = this.getHudHost('startBattleButton', {
            x: 980,
            y: 654,
            depth: 80,
            width: 276,
            height: 110,
        });
        this.startBattleButton = new MedievalActionButton(this, {
            x: host.x,
            y: host.y,
            depth: host.depth,
            width: host.width ?? 276,
            height: host.height ?? 110,
            label: 'ZAČÍT BOJ',
            labelFontSize: 20,
            accent: 0xf0b447,
            frameTexture: 'arena-entry-start-v1',
            normalIcon: { texture: 'arena-entry-crossed-swords-normal-v1' },
            activeIcon: { texture: 'arena-entry-crossed-swords-active-v1' },
            iconSize: 70,
            iconCenterRatio: 0.19,
            labelCenterRatio: 0.65,
            name: 'arena-start-battle-button',
            onClick: () => this.startBattle(),
        }).root;
    }

    private createPlayerStatusPod(
        player: PlayerState,
        host: ArenaHudHost,
        playerLabel: 'A' | 'B',
        pointerSide: 'left' | 'right',
    ): ArenaPlayerStatusPod {
        const preparation = PreparationSystem.getState(player);
        return new ArenaPlayerStatusPod(this, {
            ...host,
            width: host.width ?? 178,
            height: host.height ?? 78,
            playerLabel,
            pointerSide,
            hp: player.hp,
            maxHp: player.maxHp,
            potionCount: player.potions,
            preparationKind: preparation.kind,
            preparationCharges: preparation.charges,
        });
    }

    private getHudHost(id: string, fallback: ArenaHudHost): ArenaHudHost {
        const element = this.sceneBuilder.get<Phaser.GameObjects.GameObject & {
            x: number;
            y: number;
            depth: number;
            displayWidth?: number;
            displayHeight?: number;
        }>(id);
        const definition = this.sceneBuilder.getElementDef(id);
        return {
            x: element?.x ?? fallback.x,
            y: element?.y ?? fallback.y,
            depth: element?.depth ?? fallback.depth,
            width: definition?.width ?? (element?.displayWidth || fallback.width),
            height: definition?.height ?? (element?.displayHeight || fallback.height),
        };
    }

    /**
     * Create Wave Progress Table content inside the existing "ARENA WITH TITLE" frame
     * Shows 5 wave rows with enemy icons and completion/perfect indicators
     */
    private createWaveProgressContent(): void {
        const player = this.gameState.getPlayer();
        const waveResults = getArenaResultsForEncounters(
            player,
            this.arenaLevel,
            this.arenaDefinition.waves.map(wave => wave.id),
        );

        // Debug: Log wave progress state
        console.log('[ArenaScene] Wave progress:', {
            currentWave: this.currentWave,
            waveResults: JSON.stringify(waveResults),
            isActive: player.arena.isActive
        });

        // Get the frame element position from sceneBuilder
        const frameElement = this.arenaFrame;
        const frameX = frameElement?.x ?? 227;
        const frameY = frameElement?.y ?? 238;
        const frameDepth = frameElement?.depth ?? 10;

        // Create container for wave progress content
        // Position relative to frame center
        this.waveProgressContainer = this.add.container(frameX, frameY);
        this.waveProgressContainer.setDepth(frameDepth + 1);

        // Row layout constants
        const rowHeight = 60;
        const startY = -141;  // Fine-tuned position within frame
        const iconScale = 0.22;
        const iconSpacing = 35;

        // Create one row per configured wave (currently validated to exactly five).
        for (let waveIdx = 0; waveIdx < this.arenaDefinition.waves.length; waveIdx++) {
            const rowY = startY + waveIdx * rowHeight;
            const waveResult = waveResults[waveIdx];
            const isCurrentWave = waveIdx === this.currentWave;
            const isFutureWave = waveIdx > this.currentWave;
            const isCompleted = waveResult?.completed || false;
            const isPerfect = waveResult?.perfectWave || false;

            // Row container
            const rowContainer = this.add.container(0, rowY);

            // Current wave highlight (golden border effect)
            if (isCurrentWave) {
                const highlight = this.add.rectangle(0, 0, 360, 52, 0xffd700, 0.15)
                    .setStrokeStyle(2, 0xffd700);
                rowContainer.add(highlight);

                // Add ">>>" indicator
                const arrow = this.add.text(-165, 0, '»', {
                    fontSize: '24px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffd700',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
                rowContainer.add(arrow);

                // Pulse animation for current wave
                this.tweens.add({
                    targets: highlight,
                    alpha: { from: 0.1, to: 0.25 },
                    duration: 800,
                    yoyo: true,
                    repeat: -1
                });
            }

            // Wave number
            const waveNum = this.add.text(-140, 0, `${waveIdx + 1}`, {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: isCurrentWave ? '#ffd700' : '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5);
            rowContainer.add(waveNum);

            // Enemy icons (static sprites, first frame only)
            const displayConfig = this.encounterCatalog.resolveArenaWave({
                arenaLevel: this.arenaLevel,
                waveIndex: waveIdx,
                mode: this.isCoopPreview() ? 'coop' : 'solo',
            }).enemies;
            const enemyIconsStartX = -100;
            displayConfig.forEach((enemyDef, enemyIdx) => {
                // Create static image from enemy spritesheet (frame 0)
                const icon = this.add.image(
                    enemyIconsStartX + enemyIdx * iconSpacing,
                    0,
                    enemyDef.spriteKey,
                    0  // First frame
                ).setScale(iconScale);

                rowContainer.add(icon);
            });

            // Completion indicator (✓ or ○)
            const completionX = 80;
            const completionIcon = this.add.text(completionX, 0, isCompleted ? '✓' : '○', {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: isCompleted ? '#44ff44' : '#666666',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            rowContainer.add(completionIcon);

            // Perfect indicator (★ or ☆)
            const perfectX = 120;
            const perfectIcon = this.add.text(perfectX, 0, isPerfect ? '★' : '☆', {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: isPerfect ? '#ffd700' : '#666666',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            rowContainer.add(perfectIcon);

            // Future waves are dimmed
            if (isFutureWave) {
                rowContainer.setAlpha(0.4);
            }

            this.waveProgressContainer.add(rowContainer);
        }

        // Header labels (positioned above rows)
        const headerY = startY - 35;

        const headerDone = this.add.text(80, headerY, '✓', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        const headerPerfect = this.add.text(120, headerY, '★', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        this.waveProgressContainer.add([headerDone, headerPerfect]);
    }

    private startBattle(): void {
        const battleBackgroundTexture = this.battleBackgroundTextures?.[this.arenaLevel]
            ?? this.battleBackgroundTexture;

        // BattleScene resolves this stable ID once; passing pre-resolved defs would risk double co-op scaling.
        this.scene.start('BattleScene', {
            arenaLevel: this.arenaLevel,
            wave: this.currentWave,
            encounterId: this.encounterId,
            arenaChoiceId: this.arenaChoiceId,
            fromArena: true,
            mockMode: !this.persistChanges,
            backgroundKey: battleBackgroundTexture,
            returnScene: this.sceneKey,
            arenaExitScene: this.backSceneKey,
            arenaStory: this.arenaStory,
            returnData: {
                arenaLevel: this.arenaLevel,
                wave: this.currentWave,
                encounterId: this.encounterId ?? undefined,
                arenaChoiceId: this.arenaChoiceId ?? undefined,
            },
        });
    }

    private leaveArena(): void {
        const coop = CoopSessionManager.getInstance();
        if (this.isCoopPreview()) {
            coop.forBothPlayers(() => {
                const p = this.gameState.getPlayer();
                selectArenaEncounterProgress(
                    p,
                    this.arenaLevel,
                    this.arenaDefinition.waves[0].id,
                    0,
                );
                p.arena.isActive = false;
                ProgressionSystem.fullHeal(p);
            });
            coop.activatePlayerA();
        } else {
            const player = this.gameState.getPlayer();
            selectArenaEncounterProgress(
                player,
                this.arenaLevel,
                this.arenaDefinition.waves[0].id,
                0,
            );
            player.arena.isActive = false;
            ProgressionSystem.fullHeal(player);
            this.saveState();
        }

        this.scene.start(this.backSceneKey);
    }

}

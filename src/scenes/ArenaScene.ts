import Phaser from 'phaser';
import { EnemyDefinition, PetDefinition } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { PauseMenu } from '../ui/PauseMenu';

// Arena enemy configurations per arena level
// Level 1: 5 waves progressing in difficulty
const ARENA_WAVES: Record<number, string[][]> = {
    1: [['slime_green'], ['purple_demon'], ['slime_green', 'slime_green'], ['purple_demon', 'slime_green'], ['purple_demon', 'purple_demon']],
    2: [['pink_beast'], ['pink_beast', 'slime_green'], ['pink_beast', 'pink_beast'], ['leafy'], ['leafy', 'slime_green']],
    3: [['leafy'], ['leafy', 'pink_beast'], ['leafy', 'leafy'], ['purple_demon', 'leafy'], ['purple_demon', 'purple_demon', 'slime_green']],
};

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
    // Sprites
    private hero!: Phaser.GameObjects.Sprite;
    private petSprite: Phaser.GameObjects.Sprite | null = null;
    private enemies: Phaser.GameObjects.Container[] = [];  // Containers with sprite + label

    // UI Components
    private hpBar!: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };
    private coinDisplay!: Phaser.GameObjects.Text;
    private potionDisplay!: Phaser.GameObjects.Text;
    private waveText!: Phaser.GameObjects.Text;
    private startBattleButton!: Phaser.GameObjects.Container;
    private leaveButton!: Phaser.GameObjects.Container;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Pause menu
    private pauseMenu!: PauseMenu;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;

    // State
    private gameState!: GameStateManager;
    private enemyDefs: EnemyDefinition[] = [];
    private arenaLevel: number = 1;
    private currentWave: number = 0;

    constructor() {
        super({ key: 'ArenaScene' });
    }

    init(data: { arenaLevel?: number; wave?: number; fromBattle?: boolean }): void {
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();

        this.arenaLevel = data.arenaLevel || player.arena.arenaLevel || 1;
        this.currentWave = data.wave ?? player.arena.currentBattle ?? 0;

        // Get enemy definitions for this wave
        const allEnemies = this.cache.json.get('enemies') as EnemyDefinition[];
        const waveConfig = ARENA_WAVES[this.arenaLevel]?.[this.currentWave] || ['slime'];
        this.enemyDefs = waveConfig.map(id => allEnemies.find(e => e.id === id) || allEnemies[0]);

        // Update arena state
        player.arena.isActive = true;
        player.arena.arenaLevel = this.arenaLevel;
        player.arena.currentBattle = this.currentWave;
        this.gameState.save();
    }

    create(): void {
        const player = this.gameState.getPlayer();

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register event handlers before building
        this.sceneBuilder.registerHandler('startBattle', () => this.startBattle());
        this.sceneBuilder.registerHandler('leaveArena', () => this.leaveArena());

        this.sceneBuilder.buildScene();

        // Get wave text from builder and update it
        this.waveText = this.sceneBuilder.get('waveText') as Phaser.GameObjects.Text;
        if (this.waveText) {
            this.waveText.setText(`VLNA ${this.currentWave + 1}/5`);
        }

        // Get buttons from builder
        this.startBattleButton = this.sceneBuilder.get('startBattleButton') as Phaser.GameObjects.Container;
        this.leaveButton = this.sceneBuilder.get('leaveButton') as Phaser.GameObjects.Container;

        // Get spawn points from scene-layouts.json for positioning
        const enemyCount = this.enemyDefs.length;
        const spawnPoints = this.sceneBuilder.getSpawnPoints(undefined, enemyCount);

        // Create enemy previews (idling) - pass spawn points for positioning
        this.createEnemyPreviews(spawnPoints);

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

        // Create pet companion if player has one equipped
        this.createPetCompanion(player, spawnPoints);

        // Create UI
        this.createPlayerHpBar();
        this.createCoinDisplay();
        this.createPotionDisplay();

        // Setup debugger
        this.setupDebugger();
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'ArenaScene');

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

        this.input.keyboard?.on('keydown-N', () => this.debugSkipWave());
    }

    private debugSkipArena(): void {
        console.log('[DEBUG] Skip arena');
        const player = this.gameState.getPlayer();
        player.arena.isActive = false;
        ProgressionSystem.fullHeal(player);
        this.gameState.save();
        this.scene.start('TownScene');
    }

    private debugSkipWave(): void {
        console.log('[DEBUG] Skip wave');
        if (this.currentWave < 4) {
            this.scene.start('ArenaScene', {
                arenaLevel: this.arenaLevel,
                wave: this.currentWave + 1,
            });
        } else {
            this.debugSkipArena();
        }
    }

    private debugFullHeal(): void {
        console.log('[DEBUG] Full heal');
        const player = this.gameState.getPlayer();
        ProgressionSystem.fullHeal(player);
        this.updatePlayerHpBar();
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

            // Get animation prefix
            const animPrefix = def.spriteKey.includes('-') ? def.spriteKey.split('-')[0] : def.spriteKey;

            // Get enemy scale from definition
            const ENEMY_BASE_SCALE = 1.0;
            const enemyScale = (def.scale ?? 1.0) * ENEMY_BASE_SCALE;

            // Create sprite (idling) - position relative to container
            const sprite = this.add.sprite(0, 0, def.spriteKey)
                .setScale(enemyScale);

            // Play idle animation
            const idleAnim = `${animPrefix}-idle`;
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
            const container = this.add.container(x, y, [sprite, label]);
            this.enemies.push(container);
        });
    }

    private createPlayerHpBar(): void {
        const player = this.gameState.getPlayer();
        // Positioned in top-right area for 1280x720
        const x = 1100;
        const y = 40;
        const width = 200;
        const height = 24;

        const bg = this.add.rectangle(x, y, width + 4, height + 4, 0x333333).setOrigin(0.5);
        const fill = this.add.rectangle(x - width / 2, y, width * (player.hp / player.maxHp), height, 0x44cc44).setOrigin(0, 0.5);
        const text = this.add.text(x, y, `HP: ${player.hp}/${player.maxHp}`, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.hpBar = { bg, fill, text };
    }

    private updatePlayerHpBar(): void {
        const player = this.gameState.getPlayer();
        const percent = Math.max(0, player.hp / player.maxHp);
        this.hpBar.fill.setScale(percent, 1);
        this.hpBar.text.setText(`HP: ${player.hp}/${player.maxHp}`);

        if (percent > 0.5) {
            this.hpBar.fill.setFillStyle(0x44cc44);
        } else if (percent > 0.25) {
            this.hpBar.fill.setFillStyle(0xcccc44);
        } else {
            this.hpBar.fill.setFillStyle(0xcc4444);
        }
    }

    private createCoinDisplay(): void {
        const player = this.gameState.getPlayer();
        const totalCoins = ProgressionSystem.getTotalCoinValue(player.coins);

        // Positioned below HP bar
        this.coinDisplay = this.add.text(1100, 75, `💰 ${totalCoins}`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);
    }

    private createPotionDisplay(): void {
        const player = this.gameState.getPlayer();

        // Positioned below coins
        this.potionDisplay = this.add.text(1100, 105, `🧪 ${player.potions}`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff88ff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5);
    }

    private startBattle(): void {
        // Pass arena/wave data to BattleScene
        this.scene.start('BattleScene', {
            arenaLevel: this.arenaLevel,
            wave: this.currentWave,
            enemyDefs: this.enemyDefs,
            fromArena: true,
        });
    }

    private leaveArena(): void {
        const player = this.gameState.getPlayer();

        // Reset arena progress when leaving
        player.arena.isActive = false;
        player.arena.currentBattle = 0;

        // Full heal when returning to town
        ProgressionSystem.fullHeal(player);
        this.gameState.save();

        this.scene.start('TownScene');
    }
}

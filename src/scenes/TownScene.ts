import Phaser from 'phaser';
import { DEV_TOOLS_ENABLED } from '../config/buildVariant';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CrystalSystem } from '../systems/CrystalSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { ProgressionSystem, createInitialTownProgress } from '../systems/ProgressionSystem';
import { MasterySystem } from '../systems/MasterySystem';
import { JourneySystem } from '../systems/JourneySystem';
import { PlacementInitializer } from '../systems/PlacementInitializer';
import { LocalizationService } from '../systems/LocalizationService';
import { uiTemplateLoader } from '../systems/UiTemplateLoader';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { Crystal, PlayerState, TownProgress, BandId, EnemyDefinition } from '../types';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { createEncounterCatalog, EncounterCatalog } from '../systems/EncounterCatalog';
import {
    selectArenaEncounterProgress,
} from '../systems/ArenaProgressSystem';
import { getArenaChoiceOptions } from '../systems/ArenaChoiceSystem';
import { WalkingSceneHud } from '../ui/WalkingSceneHud';

/** Building unlock order — condition checked against player state */
const BUILDING_UNLOCK_CONFIG: {
    buildingId: string;
    labelId: string;
    condition: (p: PlayerState) => boolean;
}[] = [
    { buildingId: 'arena-building', labelId: 'arena-label', condition: () => true },
    { buildingId: 'shop', labelId: 'shop-label', condition: (p) => ProgressionSystem.getTotalCoinValue(p.coins) >= 3 },
    { buildingId: 'witch', labelId: 'workshop-label', condition: (p) => (p.townProgress?.totalWavesCompleted ?? 0) >= 1 },
    { buildingId: 'guild', labelId: 'guild-label', condition: () => MasterySystem.getInstance().getAvailableExams().length > 0 },
    { buildingId: 'Crystal Forge small', labelId: 'forge-label', condition: (p) => p.arena?.completedArenaLevels?.includes(1) ?? false },
];

export class TownScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private debugger!: SceneDebugger;
    private player!: Phaser.GameObjects.Sprite;
    private playerBSprite?: Phaser.GameObjects.Sprite;
    private debugArrow?: Phaser.GameObjects.Container;
    private debugPanel?: Phaser.GameObjects.Container;
    private isDebugMode: boolean = false;
    private groundCrystalsContainer?: Phaser.GameObjects.Container;
    private zyxGuides: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private newBadges: Map<string, Phaser.GameObjects.Container> = new Map();
    private encounterCatalog!: EncounterCatalog;

    constructor() {
        super({ key: 'TownScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.encounterCatalog = createEncounterCatalog(this.cache.json.get('encounters'), {
            core: this.cache.json.get('enemies') as EnemyDefinition[],
        });

        // Town entry: heal player(s) and regenerate potion(s)
        const gameState = GameStateManager.getInstance();
        const coop = CoopSessionManager.getInstance();

        if (coop.isCoopActive()) {
            // Co-op: heal both players
            coop.forBothPlayers(() => {
                const p = gameState.getPlayer();
                p.hp = p.maxHp;
                p.status = 'healthy';
                if (p.hasPotionSubscription && p.potions === 0) p.potions = 1;
            });
            coop.activatePlayerA(); // A is lead for town
        } else {
            const p = gameState.getPlayer();
            if (p.hp < p.maxHp || p.status !== 'healthy') {
                p.hp = p.maxHp;
                p.status = 'healthy';
                gameState.save();
            }
            if (p.hasPotionSubscription && p.potions === 0) {
                p.potions = 1;
                gameState.save();
            }
        }

        const player = gameState.getPlayer();

        // Register quit to menu handler
        this.sceneBuilder.registerHandler('onQuitToMenu', () => this.quitToMenu());

        // Build the scene from JSON
        this.sceneBuilder.buildScene('TownScene');

        // Clear scene re-entry state
        this.zyxGuides = new Map();
        this.newBadges = new Map();

        // Ensure townProgress exists
        if (!player.townProgress) {
            player.townProgress = createInitialTownProgress();
            gameState.save();
        }

        // Apply building visibility (hides locked buildings, detects new unlocks)
        const newlyUnlocked = this.applyBuildingVisibility(player);

        // Spawn the player character with dynamic sprite based on selection
        const playerSpawn = this.sceneBuilder.getZone('playerSpawn');
        let playerX = playerSpawn?.x ?? 80;
        const playerY = playerSpawn?.y ?? 675;

        // Check if returning from a building - spawn at that building's position
        const lastBuildingId = player.lastBuildingId;
        if (lastBuildingId) {
            const lastBuilding = this.sceneBuilder.get<Phaser.GameObjects.Image>(lastBuildingId);
            if (lastBuilding) {
                playerX = lastBuilding.x;
            }
            // Clear the lastBuildingId so next time we use default spawn
            player.lastBuildingId = undefined;
            gameState.save();
        }

        const spriteConfig = getPlayerSpriteConfig(player.characterType);
        this.player = this.add.sprite(playerX, playerY, spriteConfig.idleTexture)
            .setScale(0.6)
            .setDepth(5)
            .play(spriteConfig.idleAnim);

        // Co-op: spawn Player B behind Player A
        if (coop.isCoopActive()) {
            coop.activatePlayerB();
            const playerB = gameState.getPlayer();
            const spriteBConfig = getPlayerSpriteConfig(playerB.characterType);
            this.playerBSprite = this.add.sprite(playerX - 70, playerY, spriteBConfig.idleTexture)
                .setScale(0.55)
                .setDepth(4)
                .play(spriteBConfig.idleAnim);
            coop.activatePlayerA();
        }

        // Override building click handlers with walk animation
        this.setupBuildingTransitions();

        // Replace the legacy menu/resource/gear controls with the shared
        // editor-positioned walking HUD and production character book.
        ['btnQuitToMenu', 'money mana', 'characterButton'].forEach((id) => {
            const object = this.sceneBuilder.get(id) as
                | (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)
                | undefined;
            object?.setVisible(false);
        });
        new WalkingSceneHud(this, {
            onMenu: () => this.quitToMenu(),
        });

        // Show guild notification if mastery exams are available AND guild is unlocked
        const guildNotification = this.sceneBuilder.get<Phaser.GameObjects.Container>('guild-notification');
        if (guildNotification) {
            const isGuildRevealed = player.townProgress!.revealedBuildings.includes('guild');
            const hasAvailableExams = MasterySystem.getInstance().getAvailableExams().length > 0;
            guildNotification.setVisible(hasAvailableExams && isGuildRevealed);
        }

        // Show forest exit if Arena Level 2 is complete
        this.createForestExit();

        // Show Zyx guides + NEW badges for unlocked-but-not-visited buildings
        this.showPersistentGuides(player);

        // Play unlock animation for any newly unlocked buildings
        if (newlyUnlocked.length > 0) {
            gameState.save();
            this.playUnlockSequence(newlyUnlocked);
        }

        // Show ground crystals if any
        this.showGroundCrystals();

        // Check for struggling after battle return
        const mastery = MasterySystem.getInstance();
        const struggleResult = mastery.checkPlayerStruggling();
        if (struggleResult?.struggling) {
            this.showStruggleDialog(struggleResult.suggestedBand);
        }

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'TownScene');

        // Register elements with debugger
        const bg = this.sceneBuilder.get('bg');
        if (bg) this.debugger.register('bg', bg);

        ['witch', 'guild', 'Crystal Forge small', 'shop', 'arena-building'].forEach(id => {
            const el = this.sceneBuilder.get(id);
            if (el) this.debugger.register(id, el);
        });

        if (DEV_TOOLS_ENABLED) {
            // Debug shortcuts
            this.input.keyboard!.on('keydown-M', () => {
                this.scene.start('MathBoardDebugScene');
            });

            // Create debug arrow for Testing scene (hidden by default)
            this.createDebugArrow();
            this.createDebugPanel();

            // Toggle debug visibility when D is pressed
            this.input.keyboard!.on('keydown-D', () => {
                this.isDebugMode = !this.isDebugMode;
                this.debugArrow?.setVisible(this.isDebugMode);
                this.debugPanel?.setVisible(this.isDebugMode);
            });

            // Debug: Forest Journey entrance (press F)
            this.input.keyboard!.on('keydown-F', () => {
                console.log('Debug: Starting Forest Journey');
                this.scene.start('ForestAdventureStartScene', { debugMode: true });
            });

            // Exercise the complete post-guardian story transition without
            // touching the active save.
            this.input.keyboard!.on('keydown-G', () => this.startGuardianStoryTest());
        }
    }

    private startGuardianStoryTest(): void {
        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        const guardian = enemies.find(enemy => enemy.id === 'verdant_guardian');
        if (!guardian) {
            console.error('[TownScene] Verdant Guardian is missing from enemies.json');
            return;
        }

        this.scene.start('BattleScene', {
            enemyDefs: [{
                ...guardian,
                hp: 1,
                attack: 0,
                defense: 0,
                goldReward: [0, 0] as [number, number],
            }],
            mode: 'journey',
            backgroundKey: 'guardian-lair-mock-bg',
            mockMode: true,
            storyVictory: 'forest-crystal',
            returnScene: 'TownScene',
        });
    }

    private createDebugArrow(): void {
        // Create arrow on left side pointing left, hidden by default
        const arrowX = 40;
        const arrowY = 360;

        // Left-pointing triangle
        const arrow = this.add.triangle(0, 0,
            20, -25,   // top right
            20, 25,    // bottom right
            -10, 0,    // tip (pointing left)
            0xffff00
        );

        // Label below arrow
        const label = this.add.text(0, 40, 'TEST', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.debugArrow = this.add.container(arrowX, arrowY, [arrow, label]);
        this.debugArrow.setVisible(false);
        this.debugArrow.setDepth(1000);
        this.debugArrow.setSize(50, 80);
        this.debugArrow.setInteractive({ useHandCursor: true });

        // Hover effects
        this.debugArrow.on('pointerover', () => {
            arrow.setFillStyle(0xffff88);
            this.tweens.add({
                targets: this.debugArrow,
                x: arrowX - 5,
                duration: 150,
                ease: 'Back.easeOut'
            });
        });

        this.debugArrow.on('pointerout', () => {
            arrow.setFillStyle(0xffff00);
            this.tweens.add({
                targets: this.debugArrow,
                x: arrowX,
                duration: 150
            });
        });

        this.debugArrow.on('pointerdown', () => {
            this.scene.start('TestingTownScene');
        });

        // Pulsing animation
        this.tweens.add({
            targets: arrow,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private createDebugPanel(): void {
        const gameState = GameStateManager.getInstance();
        const panelX = 120;
        const panelY = 400;

        this.debugPanel = this.add.container(panelX, panelY);
        this.debugPanel.setVisible(false);
        this.debugPanel.setDepth(1000);

        // Background (expanded height for all buttons)
        const bg = this.add.rectangle(0, 0, 180, 380, 0x000000, 0.8);
        bg.setStrokeStyle(2, 0xffff00);
        this.debugPanel.add(bg);

        // Title
        const title = this.add.text(0, -155, 'DEBUG', {
            fontSize: '14px',
            color: '#ffff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.debugPanel.add(title);

        // Button helper
        const createBtn = (y: number, label: string, onClick: () => void) => {
            const btn = this.add.text(0, y, label, {
                fontSize: '12px',
                color: '#ffffff',
                backgroundColor: '#444444',
                padding: { x: 8, y: 4 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setBackgroundColor('#666666'));
            btn.on('pointerout', () => btn.setBackgroundColor('#444444'));
            btn.on('pointerdown', onClick);
            return btn;
        };

        // +50 Gold button
        const goldBtn = createBtn(-130, '+50 Gold', () => {
            const player = gameState.getPlayer();
            player.coins.gold += 50;
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(goldBtn);

        // +50 Mana button
        const manaBtn = createBtn(-105, '+50 Mana', () => {
            const player = gameState.getPlayer();
            ManaSystem.add(player, 50);
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(manaBtn);

        // +10 Shards button
        const shardBtn = createBtn(-80, '+10 Shards (value 12)', () => {
            const player = gameState.getPlayer();
            for (let i = 0; i < 10; i++) {
                const crystal = CrystalSystem.generateCrystal('shard', 12);
                CrystalSystem.addToInventory(player, crystal);
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(shardBtn);

        // +3 Fragments button (for testing splitFragment)
        const fragmentBtn = createBtn(-55, '+3 Fragments (value 15)', () => {
            const player = gameState.getPlayer();
            for (let i = 0; i < 3; i++) {
                const crystal = CrystalSystem.generateCrystal('fragment', 15);
                CrystalSystem.addToInventory(player, crystal);
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(fragmentBtn);

        // +3 Prisms button (for testing refine and prism operations)
        const prismBtn = createBtn(-30, '+3 Prisms (value 30)', () => {
            const player = gameState.getPlayer();
            for (let i = 0; i < 3; i++) {
                const crystal = CrystalSystem.generateCrystal('prism', 30);
                CrystalSystem.addToInventory(player, crystal);
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(prismBtn);

        // Toggle Boss I defeat (unlocks forge advanced operations)
        const player = gameState.getPlayer();
        const hasBossI = player.defeatedBosses?.includes('slime_king') ?? false;
        const bossILabel = hasBossI ? '✓ Boss I (Slime)' : '✗ Boss I (Slime)';
        const bossIBtn = createBtn(5, bossILabel, () => {
            const p = gameState.getPlayer();
            if (!p.defeatedBosses) {
                p.defeatedBosses = [];
            }
            if (p.defeatedBosses.includes('slime_king')) {
                // Remove boss defeat
                p.defeatedBosses = p.defeatedBosses.filter(id => id !== 'slime_king');
            } else {
                // Add boss defeat
                p.defeatedBosses.push('slime_king');
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(bossIBtn);

        // Toggle Boss II defeat (unlocks refine operation)
        const hasBossII = player.defeatedBosses?.includes('verdant_guardian') ?? false;
        const bossIILabel = hasBossII ? '✓ Boss II (Guardian)' : '✗ Boss II (Guardian)';
        const bossIIBtn = createBtn(30, bossIILabel, () => {
            const p = gameState.getPlayer();
            if (!p.defeatedBosses) {
                p.defeatedBosses = [];
            }
            if (p.defeatedBosses.includes('verdant_guardian')) {
                p.defeatedBosses = p.defeatedBosses.filter(id => id !== 'verdant_guardian');
            } else {
                p.defeatedBosses.push('verdant_guardian');
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(bossIIBtn);

        // Toggle Boss III defeat (unlocks createPrism operation)
        const hasBossIII = player.defeatedBosses?.includes('crystal_serpent') ?? false;
        const bossIIILabel = hasBossIII ? '✓ Boss III (Serpent)' : '✗ Boss III (Serpent)';
        const bossIIIBtn = createBtn(55, bossIIILabel, () => {
            const p = gameState.getPlayer();
            if (!p.defeatedBosses) {
                p.defeatedBosses = [];
            }
            if (p.defeatedBosses.includes('crystal_serpent')) {
                p.defeatedBosses = p.defeatedBosses.filter(id => id !== 'crystal_serpent');
            } else {
                p.defeatedBosses.push('crystal_serpent');
            }
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(bossIIIBtn);

        // Unlock All Buildings button
        const unlockBtn = createBtn(90, 'Unlock All', () => {
            const p = gameState.getPlayer();
            if (!p.townProgress) p.townProgress = createInitialTownProgress();
            p.townProgress.totalWavesCompleted = 20;
            p.townProgress.wavesAfterForgeUnlock = 5;
            const allBuildingIds = BUILDING_UNLOCK_CONFIG.map(c => c.buildingId);
            p.townProgress.unlockedBuildings = [...allBuildingIds, 'forest-exit'];
            p.townProgress.revealedBuildings = [...allBuildingIds, 'forest-exit'];
            if (!p.unlockedPets.includes('pink_beast')) p.unlockedPets.push('pink_beast');
            if (!p.arena.completedArenaLevels.includes(1)) p.arena.completedArenaLevels.push(1);
            if (!p.arena.completedArenaLevels.includes(2)) p.arena.completedArenaLevels.push(2);
            gameState.save();
            this.scene.restart();
        });
        this.debugPanel.add(unlockBtn);

        // Reload UI button
        const reloadBtn = createBtn(115, 'Reload UI (U)', async () => {
            await uiTemplateLoader.reload();
            this.scene.restart();
        });
        this.debugPanel.add(reloadBtn);
    }

    private createArenaButton(): void {
        // Use the label from JSON as anchor if available
        const label = this.sceneBuilder.get<Phaser.GameObjects.Text>('arena-label');
        const buttonX = label ? label.x : 1220;
        const buttonY = label ? label.y - 50 : 360;

        // Battle button on the right side with arrow
        const button = this.add.container(buttonX, buttonY).setDepth(50);

        // Arrow shape (pointing right)
        const arrow = this.add.triangle(0, 0,
            -20, -30,  // top left
            -20, 30,   // bottom left
            20, 0,     // tip
            0xff6600
        );

        // Arena progress indicator
        const player = GameStateManager.getInstance().getPlayer();
        const arenaWaveCount = this.encounterCatalog.getArena(player.arena.arenaLevel || 1).waves.length;
        const arenaProgress = player.arena.isActive
            ? `${player.arena.currentBattle}/${arenaWaveCount}`
            : 'Nový';

        const progressText = this.add.text(0, 70, arenaProgress, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        button.add([arrow, progressText]);
        button.setSize(60, 120);
        button.setInteractive({ useHandCursor: true });

        // Hover effects
        button.on('pointerover', () => {
            arrow.setFillStyle(0xff8833);
            this.tweens.add({
                targets: button,
                x: buttonX + 10,
                duration: 200,
                ease: 'Back.easeOut'
            });
        });

        button.on('pointerout', () => {
            arrow.setFillStyle(0xff6600);
            this.tweens.add({
                targets: button,
                x: buttonX,
                duration: 200
            });
        });

        button.on('pointerdown', () => {
            this.walkToArena(buttonX);
        });

        // Pulsing animation
        this.tweens.add({
            targets: arrow,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Override building click handlers to add walk animation before scene transition
     */
    private setupBuildingTransitions(): void {
        const buildings = [
            { id: 'witch', scene: 'PythiaWorkshopScene' },
            { id: 'guild', scene: 'GuildScene' },
            { id: 'Crystal Forge small', scene: 'CrystalForgeScene' },
            { id: 'shop', scene: 'ShopScene' }
        ];

        buildings.forEach(({ id, scene }) => {
            const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(id);
            if (building) {
                building.removeAllListeners('pointerdown');
                building.on('pointerdown', () => this.walkToBuilding(building.x, scene, id));
            }
        });

        // Arena building has special handling (different from regular scene transitions)
        const arenaBuilding = this.sceneBuilder.get<Phaser.GameObjects.Image>('arena-building');
        if (arenaBuilding) {
            arenaBuilding.removeAllListeners('pointerdown');
            arenaBuilding.on('pointerdown', () => this.walkToArena(arenaBuilding.x));
        }
    }

    /**
     * Walk player to building, fade out, then transition to scene
     */
    private walkToBuilding(targetX: number, targetScene: string, buildingId: string): void {
        this.input.enabled = false;

        // Save the building ID for return position
        const gameState = GameStateManager.getInstance();
        const playerState = gameState.getPlayer();
        playerState.lastBuildingId = buildingId;

        // Mark building as visited (clears NEW badge / Zyx on next load)
        this.markBuildingVisited(buildingId);
        gameState.save();

        const startX = this.player.x;
        const distance = Math.abs(targetX - startX);
        const walkSpeed = 350;
        const duration = (distance / walkSpeed) * 1000;

        // Flip sprite based on direction (flipX=true faces left)
        this.player.setFlipX(targetX < startX);

        // Play walk animation
        const spriteConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        this.player.play(spriteConfig.walkAnim);

        // Player B follows
        this.walkPlayerBFollow(targetX, duration);

        // Walk tween
        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);

                // Fade out then transition
                this.tweens.add({
                    targets: [this.player, this.playerBSprite].filter(Boolean),
                    alpha: 0,
                    duration: 300,
                    onComplete: () => this.scene.start(targetScene)
                });
            }
        });
    }

    /**
     * Walk player to arena button, fade out, then start arena
     */
    private walkToArena(targetX: number): void {
        this.input.enabled = false;

        // Mark arena as visited + save building ID for return spawn position
        this.markBuildingVisited('arena-building');
        const gameState = GameStateManager.getInstance();
        gameState.getPlayer().lastBuildingId = 'arena-building';
        gameState.save();

        const startX = this.player.x;
        const distance = Math.abs(targetX - startX);
        const duration = (distance / 350) * 1000;

        this.player.setFlipX(targetX < startX);

        const spriteConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        this.player.play(spriteConfig.walkAnim);

        // Player B follows
        this.walkPlayerBFollow(targetX, duration);

        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);

                this.tweens.add({
                    targets: [this.player, this.playerBSprite].filter(Boolean),
                    alpha: 0,
                    duration: 300,
                    onComplete: () => {
                        const player = GameStateManager.getInstance().getPlayer();
                        const coopRef = CoopSessionManager.getInstance();
                        const choicePlayers = [player];
                        if (coopRef.isCoopActive()) {
                            coopRef.activatePlayerB();
                            choicePlayers.push(GameStateManager.getInstance().getPlayer());
                            coopRef.activatePlayerA();
                        }

                        // New content is always the recommended first option. Completed
                        // imperfect waves remain separate, voluntary practice choices.
                        const arenaChoices = getArenaChoiceOptions(
                            this.encounterCatalog,
                            choicePlayers,
                            'mathoria',
                        );
                        const selectedChoice = arenaChoices[0];

                        console.log('[TownScene] Entering arena:', {
                            isActive: player.arena.isActive,
                            currentBattle: player.arena.currentBattle,
                            selectedChoice,
                            arenaChoices,
                        });

                        if (coopRef.isCoopActive()) {
                            coopRef.forBothPlayers(() => {
                                const activePlayer = GameStateManager.getInstance().getPlayer();
                                selectArenaEncounterProgress(
                                    activePlayer,
                                    selectedChoice.arenaLevel,
                                    selectedChoice.encounterId,
                                    selectedChoice.waveIndex,
                                );
                                activePlayer.arena.isActive = true;
                                activePlayer.arena.playerHpAtStart = activePlayer.hp;
                            });
                            coopRef.activatePlayerA();
                        } else {
                            selectArenaEncounterProgress(
                                player,
                                selectedChoice.arenaLevel,
                                selectedChoice.encounterId,
                                selectedChoice.waveIndex,
                            );
                            player.arena.isActive = true;
                            player.arena.playerHpAtStart = player.hp;
                            GameStateManager.getInstance().save();
                        }

                        this.scene.start('ArenaScene', {
                            arenaChoiceId: selectedChoice.id,
                            arenaLevel: selectedChoice.arenaLevel,
                            wave: selectedChoice.waveIndex,
                            encounterId: selectedChoice.encounterId,
                        });
                    }
                });
            }
        });
    }

    // ========== BUILDING UNLOCK SYSTEM ==========

    /**
     * Check each building's unlock condition and apply visibility.
     * Uses three-state model: unlocked → revealed → visited.
     * Only one building is revealed at a time to prevent multiple Zyx guides.
     * Returns list of building IDs that were newly revealed this frame.
     */
    private applyBuildingVisibility(player: PlayerState): string[] {
        const tp = player.townProgress!;

        // Step 1: Update unlockedBuildings (conditions met)
        // Co-op: building is unlocked if EITHER player meets the condition
        const coop = CoopSessionManager.getInstance();
        for (const config of BUILDING_UNLOCK_CONFIG) {
            let conditionMet = config.condition(player);

            // Co-op keeps Guild available because the shared mana-collection mode lives there
            if (config.buildingId === 'guild' && coop.isCoopActive()) {
                conditionMet = true;
            } else if (!conditionMet && coop.isCoopActive()) {
                coop.activatePlayerB();
                conditionMet = config.condition(GameStateManager.getInstance().getPlayer());
                coop.activatePlayerA();
            }

            if (conditionMet && !tp.unlockedBuildings.includes(config.buildingId)) {
                tp.unlockedBuildings.push(config.buildingId);
            }
        }

        // Co-op fix: any building that's unlocked AND already visited must be
        // in revealedBuildings — prevents "NEW" badge on already-visited buildings
        for (const config of BUILDING_UNLOCK_CONFIG) {
            if (tp.unlockedBuildings.includes(config.buildingId)
                && tp.visitedBuildings.includes(config.buildingId)
                && !tp.revealedBuildings.includes(config.buildingId)) {
                tp.revealedBuildings.push(config.buildingId);
            }
        }

        // Co-op keeps Guild immediately visible because it is the shared entry point
        // for mana collection even when exam progression is read-only there.
        if (coop.isCoopActive()
            && tp.unlockedBuildings.includes('guild')
            && !tp.revealedBuildings.includes('guild')) {
            tp.revealedBuildings.push('guild');
        }

        // Step 2: Determine which buildings should be revealed next
        const pendingReveals = this.getPendingReveals(tp);
        const newlyRevealed: string[] = [];

        // Only reveal next building if no revealed-but-unvisited building exists
        const hasUnvisitedRevealed = tp.revealedBuildings.some(
            id => id !== 'arena-building' && !tp.visitedBuildings.includes(id)
        );

        if (!hasUnvisitedRevealed && pendingReveals.length > 0) {
            const nextReveal = pendingReveals[0];
            tp.revealedBuildings.push(nextReveal);
            newlyRevealed.push(nextReveal);
        }

        // Step 3: Apply visibility based on revealedBuildings
        for (const config of BUILDING_UNLOCK_CONFIG) {
            const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(config.buildingId);
            const label = this.sceneBuilder.get<Phaser.GameObjects.GameObject>(config.labelId);
            const isRevealed = tp.revealedBuildings.includes(config.buildingId);

            if (!isRevealed) {
                // Not revealed: hide building + label
                if (building) {
                    (building as any).setVisible(false);
                    building.disableInteractive();
                }
                if (label) {
                    (label as any).setVisible(false);
                    if ((label as any).disableInteractive) (label as any).disableInteractive();
                }
            } else if (newlyRevealed.includes(config.buildingId)) {
                // Newly revealed: start hidden, will animate in
                if (building) {
                    (building as any).setVisible(false);
                    building.disableInteractive();
                }
                if (label) {
                    (label as any).setVisible(false);
                }
            }
            // Already revealed: leave visible (SceneBuilder already created it)
        }

        return newlyRevealed;
    }

    /**
     * Get buildings that are unlocked but not yet revealed, in unlock order.
     */
    private getPendingReveals(tp: TownProgress): string[] {
        return BUILDING_UNLOCK_CONFIG
            .filter(c => tp.unlockedBuildings.includes(c.buildingId)
                      && !tp.revealedBuildings.includes(c.buildingId))
            .map(c => c.buildingId);
    }

    /**
     * Show Zyx guide + NEW badge for buildings that are unlocked but not yet visited.
     * Called once during create() for persistent guides (not animated unlocks).
     */
    private showPersistentGuides(player: PlayerState): void {
        const tp = player.townProgress!;

        for (const config of BUILDING_UNLOCK_CONFIG) {
            if (config.buildingId === 'arena-building') continue; // Arena never gets guide
            const isRevealed = tp.revealedBuildings.includes(config.buildingId);
            const isVisited = tp.visitedBuildings.includes(config.buildingId);

            if (isRevealed && !isVisited) {
                const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(config.buildingId);
                if (building) {
                    this.showZyxAtBuilding(config.buildingId, building.x, building.y);
                    this.showNewBadge(config.buildingId, building.x, building.y);
                }
            }
        }

        // Forest exit guide (arrow is on right side at x=1220)
        if (tp.revealedBuildings.includes('forest-exit') && !tp.visitedBuildings.includes('forest-exit')) {
            this.showZyxAtBuilding('forest-exit', 1140, 559);
            this.showNewBadge('forest-exit', 1220, 520);
        }
    }

    /**
     * Play staggered unlock animations for newly unlocked buildings.
     */
    private playUnlockSequence(buildingIds: string[]): void {
        buildingIds.forEach((buildingId, index) => {
            const delay = index * 1500;
            const config = BUILDING_UNLOCK_CONFIG.find(c => c.buildingId === buildingId);
            if (!config) return;

            const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(config.buildingId);
            const label = this.sceneBuilder.get<Phaser.GameObjects.GameObject>(config.labelId);
            if (!building) return;

            // Save original scale
            const origScaleX = building.scaleX;
            const origScaleY = building.scaleY;

            this.time.delayedCall(delay, () => {
                // Make visible at scale 0
                (building as any).setVisible(true);
                building.setScale(0);

                // Bounce in animation
                this.tweens.add({
                    targets: building,
                    scaleX: origScaleX,
                    scaleY: origScaleY,
                    duration: 600,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        // Re-enable interaction
                        building.setInteractive({ useHandCursor: true });

                        // Show label with fade
                        if (label) {
                            (label as any).setVisible(true);
                            (label as any).setAlpha(0);
                            this.tweens.add({
                                targets: label,
                                alpha: 1,
                                duration: 300
                            });
                        }

                        // Re-wire click handler (setupBuildingTransitions already ran but building was disabled)
                        this.rewireClickHandler(config.buildingId);

                        // Show Zyx + NEW badge
                        this.showZyxAtBuilding(config.buildingId, building.x, building.y);
                        this.showNewBadge(config.buildingId, building.x, building.y);
                    }
                });
            });
        });
    }

    /**
     * Re-wire click handler for a specific building after unlock animation
     */
    private rewireClickHandler(buildingId: string): void {
        const buildingScenes: Record<string, string> = {
            'witch': 'PythiaWorkshopScene',
            'guild': 'GuildScene',
            'Crystal Forge small': 'CrystalForgeScene',
            'shop': 'ShopScene'
        };

        const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(buildingId);
        if (!building) return;

        if (buildingId === 'arena-building') {
            building.removeAllListeners('pointerdown');
            building.on('pointerdown', () => this.walkToArena(building.x));
        } else if (buildingScenes[buildingId]) {
            building.removeAllListeners('pointerdown');
            building.on('pointerdown', () => this.walkToBuilding(building.x, buildingScenes[buildingId], buildingId));
        }
    }

    /**
     * Show Zyx guide sprite near a building
     */
    private showZyxAtBuilding(buildingId: string, buildingX: number, _buildingY: number): void {
        if (this.zyxGuides.has(buildingId)) return;

        // Place Zyx at ground level (player Y + 5px) and to the right of building
        // so the player doesn't walk through him when entering
        const groundY = (this.player?.y ?? 615) + 5;
        const zyx = this.add.sprite(buildingX + 80, groundY, 'spritesheet-zyx-sheet')
            .setScale(0.3)
            .setDepth(50)
            .play('zyx-idle');

        // Gentle floating animation
        this.tweens.add({
            targets: zyx,
            y: zyx.y - 8,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.zyxGuides.set(buildingId, zyx);
    }

    /**
     * Show NEW badge near a building
     */
    private showNewBadge(buildingId: string, buildingX: number, buildingY: number): void {
        if (this.newBadges.has(buildingId)) return;

        const badge = this.add.container(buildingX + 40, buildingY - 60);
        badge.setDepth(55);

        const circle = this.add.circle(0, 0, 18, 0xff2222);
        const text = this.add.text(0, 0, 'NEW', {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        badge.add([circle, text]);

        // Pulsing animation
        this.tweens.add({
            targets: badge,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.newBadges.set(buildingId, badge);
    }

    /**
     * Mark a building as visited — destroys Zyx guide + NEW badge
     */
    private markBuildingVisited(buildingId: string): void {
        // Mark visited for current player
        const player = GameStateManager.getInstance().getPlayer();
        if (!player.townProgress) return;

        if (!player.townProgress.visitedBuildings.includes(buildingId)) {
            player.townProgress.visitedBuildings.push(buildingId);
        }

        // Co-op: also mark visited for the other player
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            const current = coop.getActivePlayer();
            if (current === 'A') coop.activatePlayerB(); else coop.activatePlayerA();
            const otherPlayer = GameStateManager.getInstance().getPlayer();
            if (otherPlayer.townProgress && !otherPlayer.townProgress.visitedBuildings.includes(buildingId)) {
                otherPlayer.townProgress.visitedBuildings.push(buildingId);
            }
            GameStateManager.getInstance().save();
            // Restore original context
            if (current === 'A') coop.activatePlayerA(); else coop.activatePlayerB();
        }

        // Destroy visual indicators
        const zyx = this.zyxGuides.get(buildingId);
        if (zyx) {
            this.tweens.killTweensOf(zyx);
            zyx.destroy();
            this.zyxGuides.delete(buildingId);
        }

        const badge = this.newBadges.get(buildingId);
        if (badge) {
            this.tweens.killTweensOf(badge);
            badge.destroy();
            this.newBadges.delete(buildingId);
        }
    }

    /**
     * Show forest exit arrow if Arena Level 2 is complete.
     * Uses the "arrow forest" template element from scenes.json.
     */
    private createForestExit(): void {
        const player = GameStateManager.getInstance().getPlayer();
        const hasArena2 = player.arena?.completedArenaLevels?.includes(2) ?? false;
        const hasCampReturn = JourneySystem.getInstance().getTownReturnWaypoint('verdant_forest') !== null;
        if (!hasArena2 && !hasCampReturn) return;

        // Ensure it's tracked as unlocked and revealed
        if (!player.townProgress!.unlockedBuildings.includes('forest-exit')) {
            player.townProgress!.unlockedBuildings.push('forest-exit');
        }
        if (!player.townProgress!.revealedBuildings.includes('forest-exit')) {
            player.townProgress!.revealedBuildings.push('forest-exit');
        }
        GameStateManager.getInstance().save();

        // The "arrow forest" element is created by SceneBuilder from scenes.json
        const arrowElement = this.sceneBuilder.get('arrow forest');
        if (!arrowElement) return;

        arrowElement.setVisible(true);

        this.sceneBuilder.bindClick('arrow forest', () => {
            this.markBuildingVisited('forest-exit');
            GameStateManager.getInstance().save();
            this.walkToForest();
        });
    }

    /**
     * Walk player to right edge then transition to Forest
     */
    private walkToForest(): void {
        this.input.enabled = false;

        const spriteConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        this.player.setFlipX(false);
        this.player.play(spriteConfig.walkAnim);

        const targetX = 1300;
        const duration = (Math.abs(targetX - this.player.x) / 350) * 1000;

        // Player B follows
        this.walkPlayerBFollow(targetX, duration);

        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.scene.start('ForestAdventureStartScene');
            }
        });
    }

    /**
     * Co-op: Make Player B follow Player A to a target position.
     * Player B walks with a 200ms delay and stays offset behind A.
     */
    private walkPlayerBFollow(targetX: number, duration: number): void {
        if (!this.playerBSprite) return;

        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) return;

        // Get Player B's walk animation
        coop.activatePlayerB();
        const spriteBConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        coop.activatePlayerA();

        // Walk to the same target (building entrance) — both arrive at the same spot
        this.playerBSprite.setFlipX(targetX < this.playerBSprite.x);

        // B starts 200ms later, walks slightly faster to catch up
        this.time.delayedCall(200, () => {
            if (!this.playerBSprite) return;
            this.playerBSprite.play(spriteBConfig.walkAnim);

            // Slightly shorter duration so B arrives at roughly the same time as A
            const bDuration = Math.max(duration - 200, 100);

            this.tweens.add({
                targets: this.playerBSprite,
                x: targetX,
                duration: bDuration,
                ease: 'Linear',
                onComplete: () => {
                    this.playerBSprite?.play(spriteBConfig.idleAnim);
                }
            });
        });
    }

    /**
     * Display ground crystals that couldn't fit in inventory
     */
    private showGroundCrystals(): void {
        const gameState = GameStateManager.getInstance();
        const player = gameState.getPlayer();

        if (!player.groundCrystals || player.groundCrystals.length === 0) return;

        // Remove old container if exists
        if (this.groundCrystalsContainer) {
            this.groundCrystalsContainer.destroy();
        }

        // Create container for ground crystals at bottom of screen
        const startX = 500;
        const startY = 650;
        this.groundCrystalsContainer = this.add.container(startX, startY);
        this.groundCrystalsContainer.setDepth(50);

        // Label
        const label = this.add.text(0, -40, '💎 Krystaly na zemi:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);
        this.groundCrystalsContainer.add(label);

        // Display each ground crystal
        player.groundCrystals.forEach((crystal, index) => {
            const x = (index % 5) * 50 - 100;
            const y = Math.floor(index / 5) * 40;

            const config = CrystalSystem.getTierConfig(crystal.tier);

            // Crystal container
            const crystalContainer = this.add.container(x, y);

            // Background
            const bg = this.add.rectangle(0, 0, 44, 36, 0x333366, 0.8)
                .setStrokeStyle(2, 0x4466aa);

            // Emoji
            const emoji = this.add.text(0, -6, config.emoji, {
                fontSize: '20px'
            }).setOrigin(0.5);

            // Value
            const value = this.add.text(0, 12, `(${crystal.value})`, {
                fontSize: '10px',
                fontFamily: 'Arial, sans-serif',
                color: config.color
            }).setOrigin(0.5);

            crystalContainer.add([bg, emoji, value]);
            this.groundCrystalsContainer.add(crystalContainer);

            // Make clickable
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0x445588))
                .on('pointerout', () => bg.setFillStyle(0x333366))
                .on('pointerdown', () => this.pickupCrystal(crystal.id));

            // Bounce animation to attract attention
            this.tweens.add({
                targets: crystalContainer,
                y: y - 5,
                duration: 500 + index * 50,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        });
    }

    /**
     * Try to pick up a ground crystal
     */
    private pickupCrystal(crystalId: string): void {
        const gameState = GameStateManager.getInstance();
        const player = gameState.getPlayer();

        if (CrystalSystem.collectFromGround(player, crystalId)) {
            gameState.save();

            // Show pickup animation
            const floatText = this.add.text(640, 600, '+1 💎', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#88ccff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5).setDepth(100);

            this.tweens.add({
                targets: floatText,
                y: 550,
                alpha: 0,
                duration: 800,
                onComplete: () => floatText.destroy()
            });

            // Refresh display
            this.showGroundCrystals();
        } else {
            // Inventory full - show message
            this.showToast('Inventář plný! Zajdi do kovárny.');
        }
    }

    /**
     * Show a temporary toast message
     */
    private showToast(message: string): void {
        const toast = this.add.text(640, 300, message, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#aa4444',
            padding: { x: 16, y: 8 }
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: toast,
            alpha: 0,
            y: 260,
            duration: 2000,
            delay: 1000,
            onComplete: () => toast.destroy()
        });
    }

    private showStruggleDialog(_suggestedBand: BandId): void {
        const loc = LocalizationService.getInstance();
        const gameState = GameStateManager.getInstance();
        const data = gameState.getMasteryData();

        // Dark overlay
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
            .setDepth(900)
            .setInteractive(); // block clicks through

        // Dialog container
        const dialog = this.add.container(640, 360).setDepth(1000);

        // Dialog background
        const bg = this.add.rectangle(0, 0, 500, 280, 0x2a2a3e)
            .setStrokeStyle(3, 0x6a6a7e)
            .setOrigin(0.5);
        dialog.add(bg);

        // Title
        const titleText = loc.t('struggle.title') || 'ZYX ADVISES';
        const title = this.add.text(0, -100, titleText, {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        dialog.add(title);

        // Message
        const msgText = loc.t('struggle.message') || 'These numbers seem tough! Want to try easier ones?';
        const message = this.add.text(0, -40, msgText, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            wordWrap: { width: 420 },
            align: 'center',
        }).setOrigin(0.5);
        dialog.add(message);

        // Accept button
        const acceptBg = this.add.rectangle(-120, 60, 200, 50, 0x2d7d2d)
            .setStrokeStyle(2, 0x4dbd4d)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        dialog.add(acceptBg);

        const acceptText = loc.t('struggle.accept') || 'Yes';
        const accept = this.add.text(-120, 60, acceptText, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        dialog.add(accept);

        // Decline button
        const declineBg = this.add.rectangle(120, 60, 200, 50, 0x7d2d2d)
            .setStrokeStyle(2, 0xbd4d4d)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        dialog.add(declineBg);

        const declineText = loc.t('struggle.decline') || 'No';
        const decline = this.add.text(120, 60, declineText, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        dialog.add(decline);

        // Button hover effects
        acceptBg.on('pointerover', () => acceptBg.setFillStyle(0x3d9d3d));
        acceptBg.on('pointerout', () => acceptBg.setFillStyle(0x2d7d2d));
        declineBg.on('pointerover', () => declineBg.setFillStyle(0x9d3d3d));
        declineBg.on('pointerout', () => declineBg.setFillStyle(0x7d2d2d));

        const cleanup = () => {
            overlay.destroy();
            dialog.destroy();
        };

        // Accept: drop one band
        acceptBg.on('pointerdown', () => {
            const currentBand = MasterySystem.getInstance().getCurrentBand();
            PlacementInitializer.dropOneBand(currentBand, gameState);
            cleanup();
        });

        // Decline: just record the fight count so we don't nag again for 5 fights
        declineBg.on('pointerdown', () => {
            data.lastStruggleOfferFight = data.fightCount;
            gameState.save();
            cleanup();
        });

        // Entrance animation
        dialog.setScale(0.8).setAlpha(0);
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 0.7, duration: 200 });
        this.tweens.add({ targets: dialog, scale: 1, alpha: 1, duration: 250, ease: 'Back.easeOut' });
    }

    private quitToMenu(): void {
        // End co-op session if active
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            coop.endSession();
        }

        // Auto-save before leaving
        GameStateManager.getInstance().save();
        this.scene.start('MenuScene');
    }

    update(): void {
        // Parallax could be re-implemented if needed, but for now static is fine
        // The new SceneBuilder creates TileSprites for bg, so we could access them
        const bg = this.sceneBuilder.get<Phaser.GameObjects.TileSprite>('bg');
        const bgGrass = this.sceneBuilder.get<Phaser.GameObjects.TileSprite>('bgGrass');

        if (bg && bgGrass) {
            const scrollX = this.cameras.main.scrollX;
            bg.tilePositionX = scrollX * 0.3;
            bgGrass.tilePositionX = scrollX;
        }
    }
}

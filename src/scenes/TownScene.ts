import Phaser from 'phaser';
import { CharacterUI } from '../ui/CharacterUI';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CrystalSystem } from '../systems/CrystalSystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { Crystal } from '../types';

export class TownScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private characterUI!: CharacterUI;
    private debugger!: SceneDebugger;
    private player!: Phaser.GameObjects.Sprite;
    private debugArrow?: Phaser.GameObjects.Container;
    private isDebugMode: boolean = false;
    private groundCrystalsContainer?: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'TownScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Town entry: heal player and regenerate potion
        const gameState = GameStateManager.getInstance();
        const player = gameState.getPlayer();

        // Full heal on town entry
        if (player.hp < player.maxHp || player.status !== 'healthy') {
            player.hp = player.maxHp;
            player.status = 'healthy';
            gameState.save();
        }

        // Regenerate potion if player has subscription and used their potion
        if (player.hasPotionSubscription && player.potions === 0) {
            player.potions = 1;
            gameState.save();
        }

        // Register quit to menu handler
        this.sceneBuilder.registerHandler('onQuitToMenu', () => this.quitToMenu());

        // Build the scene from JSON
        this.sceneBuilder.buildScene('TownScene');

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

        // Override building click handlers with walk animation
        this.setupBuildingTransitions();

        // Create UI Overlays
        this.characterUI = new CharacterUI(this);

        // Show guild notification if player is ready to promote
        const guildNotification = this.sceneBuilder.get<Phaser.GameObjects.Container>('guild-notification');
        if (guildNotification) {
            const player = GameStateManager.getInstance().getPlayer();
            guildNotification.setVisible(player.readyToPromote);
        }

        // Create arena button (dynamic element)
        this.createArenaButton();

        // Show ground crystals if any
        this.showGroundCrystals();

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'TownScene');

        // Register elements with debugger
        const bg = this.sceneBuilder.get('bg');
        if (bg) this.debugger.register('bg', bg);

        ['witch', 'guild', 'tavern', 'shop'].forEach(id => {
            const el = this.sceneBuilder.get(id);
            if (el) this.debugger.register(id, el);
        });

        // Debug shortcuts
        this.input.keyboard!.on('keydown-M', () => {
            this.scene.start('MathBoardDebugScene');
        });

        // Create debug arrow for Testing scene (hidden by default)
        this.createDebugArrow();

        // Toggle debug arrow visibility when D is pressed (same as debug mode toggle)
        this.input.keyboard!.on('keydown-D', () => {
            this.isDebugMode = !this.isDebugMode;
            if (this.debugArrow) {
                this.debugArrow.setVisible(this.isDebugMode);
            }
        });

        // Debug: Forest Journey entrance (press F)
        this.input.keyboard!.on('keydown-F', () => {
            console.log('Debug: Starting Forest Journey');
            this.scene.start('ForestGateScene', { debugMode: true });
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
        const arenaProgress = player.arena.isActive
            ? `${player.arena.currentBattle}/5`
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
            { id: 'witch', scene: 'WitchHutScene' },
            { id: 'guild', scene: 'GuildScene' },
            { id: 'tavern', scene: 'CrystalForgeScene' },  // Crystal Forge replaces Tavern
            { id: 'shop', scene: 'ShopScene' }
        ];

        buildings.forEach(({ id, scene }) => {
            const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(id);
            if (building) {
                building.removeAllListeners('pointerdown');
                building.on('pointerdown', () => this.walkToBuilding(building.x, scene, id));
            }
        });
    }

    /**
     * Walk player to building, fade out, then transition to scene
     */
    private walkToBuilding(targetX: number, targetScene: string, buildingId: string): void {
        this.input.enabled = false;

        // Save the building ID for return position
        const gameState = GameStateManager.getInstance();
        gameState.getPlayer().lastBuildingId = buildingId;
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
                    targets: this.player,
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

        const startX = this.player.x;
        const distance = Math.abs(targetX - startX);
        const duration = (distance / 350) * 1000;

        this.player.setFlipX(targetX < startX);

        const spriteConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType
        );
        this.player.play(spriteConfig.walkAnim);

        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);

                this.tweens.add({
                    targets: this.player,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => {
                        const player = GameStateManager.getInstance().getPlayer();
                        const arenaLevel = player.arena.arenaLevel || 1;

                        // Check if arena level has changed - if so, reset waveResults
                        const previousArenaLevel = player.arena.waveResultsArenaLevel;
                        const arenaLevelChanged = previousArenaLevel !== undefined && previousArenaLevel !== arenaLevel;

                        console.log('[TownScene] Entering arena:', {
                            isActive: player.arena.isActive,
                            currentBattle: player.arena.currentBattle,
                            arenaLevel,
                            previousArenaLevel,
                            arenaLevelChanged,
                            waveResults: JSON.stringify(player.arena.waveResults)
                        });

                        // Reset waveResults when entering a DIFFERENT arena level
                        // (waveResults are per-arena, not shared across arenas)
                        if (arenaLevelChanged || !player.arena.waveResults) {
                            player.arena.waveResults = [];
                            console.log('[TownScene] Reset waveResults for new arena level:', arenaLevel);
                        }

                        // Track which arena level these waveResults belong to
                        player.arena.waveResultsArenaLevel = arenaLevel;

                        // Always start from wave 0 (players must complete all waves each run)
                        const wave = 0;
                        console.log('[TownScene] Starting arena level', arenaLevel, 'from wave 0');

                        player.arena.isActive = true;
                        player.arena.playerHpAtStart = player.hp;
                        GameStateManager.getInstance().save();

                        this.scene.start('ArenaScene', { arenaLevel, wave });
                    }
                });
            }
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

    private quitToMenu(): void {
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

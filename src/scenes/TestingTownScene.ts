import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

export class TestingTownScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private debugger!: SceneDebugger;
    private player!: Phaser.GameObjects.Sprite;

    constructor() {
        super({ key: 'TestingTownScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register back handler
        this.sceneBuilder.registerHandler('onBackToTown', () => this.scene.start('TownScene'));

        // Build the scene from JSON (same as TownScene but with testing elements)
        this.sceneBuilder.buildScene('TestingTownScene');

        // Create the large TESTING label in the center
        this.createTestingLabel();

        // Spawn the player character
        this.spawnPlayer();

        // Setup building transitions (only witch is enterable)
        this.setupBuildingTransitions();

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'TestingTownScene');

        // Register elements with debugger
        const bg = this.sceneBuilder.get('bg');
        if (bg) this.debugger.register('bg', bg);

        ['witch', 'guild', 'tavern', 'shop'].forEach(id => {
            const el = this.sceneBuilder.get(id);
            if (el) this.debugger.register(id, el);
        });
    }

    private spawnPlayer(): void {
        const gameState = GameStateManager.getInstance();
        const playerState = gameState.getPlayer();

        // Get spawn position from zone
        const playerSpawn = this.sceneBuilder.getZone('playerSpawn');
        let playerX = playerSpawn?.x ?? 80;
        const playerY = playerSpawn?.y ?? 675;

        // Check if returning from a building - spawn at that building's position
        const lastBuildingId = playerState.lastTestingBuildingId;
        if (lastBuildingId) {
            const lastBuilding = this.sceneBuilder.get<Phaser.GameObjects.Image>(lastBuildingId);
            if (lastBuilding) {
                playerX = lastBuilding.x;
            }
            // Clear the lastBuildingId so next time we use default spawn
            playerState.lastTestingBuildingId = undefined;
            gameState.save();
        }

        const spriteConfig = getPlayerSpriteConfig(playerState.characterType);
        this.player = this.add.sprite(playerX, playerY, spriteConfig.idleTexture)
            .setScale(0.6)
            .setDepth(10)
            .play(spriteConfig.idleAnim);
    }

    private setupBuildingTransitions(): void {
        // Only witch building is enterable for now
        const witchBuilding = this.sceneBuilder.get<Phaser.GameObjects.Image>('witch');
        if (witchBuilding) {
            witchBuilding.removeAllListeners('pointerdown');
            witchBuilding.on('pointerdown', () => this.walkToBuilding(witchBuilding.x, 'TestingWitchHutScene', 'witch'));
        }

        // Disable other buildings (remove click handlers, optionally show "coming soon")
        ['guild', 'tavern', 'shop'].forEach(id => {
            const building = this.sceneBuilder.get<Phaser.GameObjects.Image>(id);
            if (building) {
                building.removeAllListeners('pointerdown');
                // Optionally dim them or show they're not available
                building.on('pointerdown', () => {
                    this.showComingSoon(building.x, building.y - 100);
                });
            }
        });
    }

    private showComingSoon(x: number, y: number): void {
        const text = this.add.text(x, y, 'PŘIPRAVUJEME...', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(1000);

        // Fade out and destroy
        this.tweens.add({
            targets: text,
            alpha: 0,
            y: y - 30,
            duration: 1500,
            onComplete: () => text.destroy()
        });
    }

    private walkToBuilding(targetX: number, targetScene: string, buildingId: string): void {
        this.input.enabled = false;

        // Save the building ID for return position (using testing-specific field)
        const gameState = GameStateManager.getInstance();
        gameState.getPlayer().lastTestingBuildingId = buildingId;
        gameState.save();

        const startX = this.player.x;
        const distance = Math.abs(targetX - startX);
        const walkSpeed = 350;
        const duration = (distance / walkSpeed) * 1000;

        // Flip sprite based on direction
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

    private createTestingLabel(): void {
        // Get position from scene builder if available, otherwise use center
        const testingLabel = this.sceneBuilder.get('testingLabel');
        const x = testingLabel?.x ?? 640;
        const y = testingLabel?.y ?? 360;
        const depth = this.sceneBuilder.getLayoutOverride('testingLabel')?.depth ?? 500;

        const text = this.add.text(x, y, 'TESTING', {
            fontSize: '96px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(depth);

        // Add subtle pulsing animation
        this.tweens.add({
            targets: text,
            alpha: 0.7,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    update(): void {
        // Parallax effect (same as TownScene)
        const bg = this.sceneBuilder.get<Phaser.GameObjects.TileSprite>('bg');
        const bgGrass = this.sceneBuilder.get<Phaser.GameObjects.TileSprite>('bgGrass');

        if (bg && bgGrass) {
            const scrollX = this.cameras.main.scrollX;
            bg.tilePositionX = scrollX * 0.3;
            bgGrass.tilePositionX = scrollX;
        }
    }
}

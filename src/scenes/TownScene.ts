import Phaser from 'phaser';
import { CharacterUI } from '../ui/CharacterUI';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

export class TownScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private characterUI!: CharacterUI;
    private debugger!: SceneDebugger;
    private player!: Phaser.GameObjects.Sprite;

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

        // Build the scene from JSON
        this.sceneBuilder.buildScene('TownScene');

        // Spawn the player character
        const playerSpawn = this.sceneBuilder.getZone('playerSpawn');
        const playerX = playerSpawn?.x ?? 80;
        const playerY = playerSpawn?.y ?? 675;
        this.player = this.add.sprite(playerX, playerY, 'knight-idle-sheet')
            .setScale(0.4)
            .setDepth(5)
            .play('knight-idle');

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
            // Start arena
            const player = GameStateManager.getInstance().getPlayer();
            const arenaLevel = player.arena.arenaLevel || 1;
            const wave = player.arena.isActive ? player.arena.currentBattle : 0;

            player.arena.isActive = true;
            player.arena.playerHpAtStart = player.hp;
            GameStateManager.getInstance().save();

            this.scene.start('ArenaScene', { arenaLevel, wave });
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

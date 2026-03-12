import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { CrystalSystem } from '../systems/CrystalSystem';
import { StorySystem } from '../systems/StorySystem';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { PictureDialog, DialogContentItem } from '../ui/PictureDialog';

/**
 * Scene initialization data
 */
interface CrashSiteSceneData {
    battleWon?: boolean;       // Returning from battle victory
    defeatedEnemyId?: string;  // Which enemy was defeated
    phase?: number;            // For returning to specific state
}

/**
 * Tutorial phase enum for state tracking
 */
enum TutorialPhase {
    INITIAL = 0,           // Player just entered, walk toward Zyx
    DIALOG_1_SHOWN = 1,    // First dialog shown, Zyx moves aside
    SLIME_VISIBLE = 2,     // Slime is now visible, player can approach
    BATTLE_STARTED = 3,    // Player triggered battle
    BATTLE_WON = 4,        // Returned from victorious battle
    DIALOG_2_SHOWN = 5,    // Second dialog shown
    TUTORIAL_COMPLETE = 6, // Player can exit to town
}

/**
 * CrashSiteScene - Tutorial area introducing the game's story
 *
 * This scene takes place at Zyx's crashed spaceship. The player:
 * 1. Walks toward Zyx (who blocks the path initially)
 * 2. Sees a picture dialog explaining the mission (fight confused creatures)
 * 3. Zyx moves aside, revealing an angry slime
 * 4. Player walks close to slime, triggering first battle
 * 5. After victory, returns here and walks to Zyx again
 * 6. Sees second dialog pointing to the arena
 * 7. Zyx disappears, exit to town becomes available
 *
 * Movement System:
 * - Same click-to-walk as ForestRiddleScene
 * - Y constrained by getPathY(x) for 2.5D effect
 * - No backtracking after certain points
 *
 * Design Philosophy:
 * - No text-based dialog - all communication through PictureDialog
 * - Visual storytelling for pre-readers
 * - Gentle tutorial with forgiving first battle
 */
export class CrashSiteScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private storySystem = StorySystem.getInstance();

    // Scene state
    private phase: TutorialPhase = TutorialPhase.INITIAL;
    private battleWon = false;

    // Game objects
    private player!: Phaser.GameObjects.Sprite;
    private zyx: Phaser.GameObjects.Sprite | null = null;
    private slime: Phaser.GameObjects.Sprite | null = null;
    private exitArrow: Phaser.GameObjects.Container | null = null;

    // Movement
    private isWalking = false;
    private isDialogOpen = false;  // Block movement while dialog is shown
    private currentTween: Phaser.Tweens.Tween | null = null;

    // Positions (X coordinates for key locations)
    private static readonly PLAYER_SPAWN_X = 100;
    private static readonly ZYX_INITIAL_X = 450;     // Blocks path initially
    private static readonly ZYX_MOVED_X = 350;       // After moving aside
    private static readonly ZYX_EXIT_X = 1100;       // Near exit (after battle)
    private static readonly SLIME_X = 750;
    private static readonly EXIT_X = 1200;
    private static readonly AGGRO_RADIUS = 150;      // Slime aggro distance

    // Asset keys
    private static readonly BG_KEY = 'crash-site-background';
    private static readonly BG_FALLBACK = 'New_game_background-1280';
    private static readonly SLIME_ANGRY_KEY = 'green-slime-angry';
    private static readonly SLIME_HAPPY_KEY = 'green-slime-happy';

    constructor() {
        super({ key: 'CrashSiteScene' });
    }

    init(data: CrashSiteSceneData): void {
        this.battleWon = data.battleWon || false;
        this.isWalking = false;
        this.currentTween = null;

        // Determine phase based on state
        if (data.phase !== undefined) {
            this.phase = data.phase;
        } else if (this.battleWon && data.defeatedEnemyId === 'tutorial_slime') {
            this.phase = TutorialPhase.BATTLE_WON;
        } else {
            this.phase = TutorialPhase.INITIAL;
        }
    }

    create(): void {
        // Create background
        this.createBackground();

        // Create player
        this.createPlayer();

        // Create Zyx (position depends on phase)
        this.createZyx();

        // Create slime (only visible after first dialog)
        if (this.phase >= TutorialPhase.SLIME_VISIBLE && this.phase < TutorialPhase.BATTLE_WON) {
            this.createSlime();
        }

        // Create exit arrow (only after tutorial complete)
        if (this.phase >= TutorialPhase.TUTORIAL_COMPLETE) {
            this.createExitArrow();
        }

        // Setup click-to-move
        this.setupClickToMove();

        // Create UI
        this.createUI();

        // Handle post-battle state
        if (this.phase === TutorialPhase.BATTLE_WON) {
            // Player spawns where slime was
            this.player.x = CrashSiteScene.SLIME_X;
            this.player.y = this.getPathY(CrashSiteScene.SLIME_X);

            // Award first crystal for tutorial victory (only if player has no crystals yet)
            const player = this.gameState.getPlayer();
            if (!player.crystals?.crystals.length) {
                const shard = CrystalSystem.generateCrystal('shard', 1);
                CrystalSystem.addToInventory(player, shard);
                this.gameState.save();
            }

            // Zyx appears near exit
            this.createZyxAtExit();
        }

        // Fade in
        this.cameras.main.fadeIn(400, 0, 0, 0);

        // Show title
        this.add.text(640, 40, 'Místo havárie', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100);
    }

    /**
     * Create the background (crash site or fallback)
     */
    private createBackground(): void {
        const bgKey = this.textures.exists(CrashSiteScene.BG_KEY)
            ? CrashSiteScene.BG_KEY
            : CrashSiteScene.BG_FALLBACK;

        if (this.textures.exists(bgKey)) {
            const bg = this.add.image(640, 360, bgKey)
                .setOrigin(0.5)
                .setDepth(-10);

            // Scale to fit
            const scaleX = 1280 / bg.width;
            const scaleY = 720 / bg.height;
            bg.setScale(Math.max(scaleX, scaleY));
        } else {
            // Fallback: gradient background
            this.createFallbackBackground();
        }
    }

    /**
     * Create fallback gradient background (only used if crash-site-background missing)
     */
    private createFallbackBackground(): void {
        const graphics = this.add.graphics().setDepth(-10);

        // Simple forest gradient
        for (let y = 0; y < 720; y++) {
            const ratio = y / 720;
            const r = Math.floor(40 + ratio * 30);
            const g = Math.floor(80 + ratio * 40);
            const b = Math.floor(50 + ratio * 20);
            graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b));
            graphics.fillRect(0, y, 1280, 1);
        }

        // Note: The proper crash-site-background asset should be used instead
        console.warn('[CrashSiteScene] Using fallback background - crash-site-background asset not loaded');
    }

    /**
     * Create the player sprite
     */
    private createPlayer(): void {
        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        // Spawn position depends on phase
        let spawnX = CrashSiteScene.PLAYER_SPAWN_X;
        if (this.phase >= TutorialPhase.BATTLE_WON) {
            spawnX = CrashSiteScene.SLIME_X;
        }

        const spawnY = this.getPathY(spawnX);

        this.player = this.add.sprite(spawnX, spawnY, spriteConfig.idleTexture)
            .setScale(1.0)
            .setDepth(10)
            .play(spriteConfig.idleAnim);
    }

    /**
     * Create Zyx character using the Zyx1 library sprite
     */
    private createZyx(): void {
        if (this.phase >= TutorialPhase.BATTLE_WON) {
            return; // Zyx appears at exit position instead
        }

        const zyxX = this.phase >= TutorialPhase.DIALOG_1_SHOWN
            ? CrashSiteScene.ZYX_MOVED_X
            : CrashSiteScene.ZYX_INITIAL_X;
        const zyxY = this.getPathY(zyxX) + 5;

        if (this.textures.exists('spritesheet-zyx-sheet')) {
            this.zyx = this.add.sprite(zyxX, zyxY, 'spritesheet-zyx-sheet')
                .setScale(0.35)
                .setDepth(8)
                .setInteractive({ useHandCursor: true })
                .play('zyx-idle');
        } else {
            // Fallback: simple alien shape
            this.zyx = this.createPlaceholderZyx(zyxX, zyxY);
        }
    }

    /**
     * Create Zyx at exit position (after battle)
     */
    private createZyxAtExit(): void {
        const zyxY = this.getPathY(CrashSiteScene.ZYX_EXIT_X) + 5;

        if (this.textures.exists('spritesheet-zyx-sheet')) {
            this.zyx = this.add.sprite(CrashSiteScene.ZYX_EXIT_X, zyxY, 'spritesheet-zyx-sheet')
                .setScale(0.35)
                .setDepth(8)
                .setInteractive({ useHandCursor: true })
                .play('zyx-idle');
        } else {
            this.zyx = this.createPlaceholderZyx(CrashSiteScene.ZYX_EXIT_X, zyxY);
        }

        // Entrance animation
        if (this.zyx) {
            this.zyx.setAlpha(0);
            this.zyx.x = CrashSiteScene.ZYX_EXIT_X + 100;
            this.tweens.add({
                targets: this.zyx,
                x: CrashSiteScene.ZYX_EXIT_X,
                alpha: 1,
                duration: 500,
                ease: 'Power2.easeOut',
            });
        }
    }

    /**
     * Create placeholder Zyx sprite
     */
    private createPlaceholderZyx(x: number, y: number): Phaser.GameObjects.Sprite {
        // Create a simple alien shape using graphics
        const graphics = this.add.graphics();
        graphics.fillStyle(0x66cc99);
        graphics.fillEllipse(0, 0, 60, 80);  // Body
        graphics.fillStyle(0x88ddbb);
        graphics.fillCircle(-15, -25, 12);   // Left eye
        graphics.fillCircle(15, -25, 12);    // Right eye
        graphics.fillStyle(0x222222);
        graphics.fillCircle(-15, -25, 5);    // Left pupil
        graphics.fillCircle(15, -25, 5);     // Right pupil

        // Convert to texture
        graphics.generateTexture('zyx-placeholder', 80, 100);
        graphics.destroy();

        return this.add.sprite(x, y, 'zyx-placeholder').setDepth(8).setInteractive({ useHandCursor: true });
    }

    /**
     * Create the slime enemy using the green-slime-angry image asset
     */
    private createSlime(): void {
        const textureKey = CrashSiteScene.SLIME_ANGRY_KEY;
        const hasTexture = this.textures.exists(textureKey);

        // Slime should be at ground level (same as player path)
        const slimeY = this.getPathY(CrashSiteScene.SLIME_X);

        if (hasTexture) {
            // Use the proper angry slime image from library
            this.slime = this.add.sprite(CrashSiteScene.SLIME_X, slimeY, textureKey)
                .setScale(0.5)
                .setDepth(8)
                .setFlipX(true)  // Face left (toward player)
                .setInteractive({ useHandCursor: true });

            // Angry bobbing animation (bob up from ground level)
            this.tweens.add({
                targets: this.slime,
                y: slimeY - 10,
                duration: 400,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        } else {
            // Fallback: use slime spritesheet if angry image not available
            const fallbackKey = 'slime-sheet';
            if (this.textures.exists(fallbackKey)) {
                this.slime = this.add.sprite(CrashSiteScene.SLIME_X, slimeY, fallbackKey, 0)
                    .setScale(1.2)
                    .setDepth(8)
                    .setFlipX(true)
                    .setTint(0xff8888)  // Red tint for "angry"
                    .setInteractive({ useHandCursor: true });

                this.tweens.add({
                    targets: this.slime,
                    y: slimeY - 10,
                    duration: 400,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            } else {
                console.warn('[CrashSiteScene] No slime texture available');
            }
        }
    }

    /**
     * Create exit arrow to town
     */
    private createExitArrow(): void {
        const arrowY = this.getPathY(CrashSiteScene.EXIT_X) - 30;
        const container = this.add.container(CrashSiteScene.EXIT_X, arrowY).setDepth(100)
            .setSize(80, 100)
            .setInteractive({ useHandCursor: true });

        // Arrow pointing right
        const arrow = this.add.text(0, 0, '→', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ff88',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Label below
        const label = this.add.text(0, 50, 'Do města', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaffaa',
        }).setOrigin(0.5);

        container.add([arrow, label]);

        // Pulsing animation
        this.tweens.add({
            targets: arrow,
            scale: 1.2,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Slide-in animation
        container.setAlpha(0);
        container.x = CrashSiteScene.EXIT_X + 50;
        this.tweens.add({
            targets: container,
            x: CrashSiteScene.EXIT_X,
            alpha: 1,
            duration: 500,
            ease: 'Back.easeOut',
        });

        this.exitArrow = container;
    }

    /**
     * Get Y position based on X (path constraint for 2.5D movement)
     */
    private getPathY(x: number): number {
        // Simple sloped terrain: slightly higher on left, lower on right
        const baseY = 580;
        const slope = 0.02;  // Gentle slope
        return baseY + (x - 640) * slope;
    }

    /**
     * Setup click-to-move input handling
     */
    private setupClickToMove(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Ignore clicks while dialog is open (dialog handles its own dismiss)
            if (this.isDialogOpen) return;

            // Ignore clicks during walking
            if (this.isWalking) return;

            // Ignore clicks on UI area (top)
            if (pointer.y < 80) return;

            // Get target X position
            let targetX = pointer.x;

            // Clamp to valid range
            targetX = Math.max(50, Math.min(1230, targetX));

            // Check phase-specific movement restrictions
            if (this.phase === TutorialPhase.INITIAL) {
                // Can't pass Zyx until dialog shown — stop 150px before him
                if (targetX > CrashSiteScene.ZYX_INITIAL_X - 150) {
                    targetX = CrashSiteScene.ZYX_INITIAL_X - 150;
                    this.walkTo(targetX, () => this.onReachZyx());
                    return;
                }
            }

            // After battle: stop 150px before Zyx at exit
            if (this.phase === TutorialPhase.BATTLE_WON) {
                const stopX = CrashSiteScene.ZYX_EXIT_X - 150;
                if (targetX > stopX) {
                    targetX = stopX;
                    this.walkTo(targetX, () => this.checkInteractions());
                    return;
                }
            }

            this.walkTo(targetX, () => this.checkInteractions());
        });
    }

    /**
     * Walk player to target X position
     */
    private walkTo(targetX: number, onComplete?: () => void): void {
        if (this.isWalking) return;
        this.isWalking = true;

        // Stop any current movement
        if (this.currentTween) {
            this.currentTween.stop();
        }

        const player = this.gameState.getPlayer();
        const spriteConfig = getPlayerSpriteConfig(player.characterType);

        const dx = targetX - this.player.x;
        const distance = Math.abs(dx);
        const duration = (distance / 350) * 1000;  // 350 px/sec

        // Face direction
        this.player.setFlipX(dx < 0);

        // Play walk animation
        this.player.play(spriteConfig.walkAnim);

        // Tween X position, update Y via onUpdate
        this.currentTween = this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                this.player.y = this.getPathY(this.player.x);

                // Check slime aggro during movement
                if (this.checkSlimeAggro()) {
                    this.currentTween?.stop();
                    this.player.play(spriteConfig.idleAnim);
                    this.isWalking = false;
                    this.startBattle();
                }
            },
            onComplete: () => {
                this.player.play(spriteConfig.idleAnim);
                this.isWalking = false;
                this.currentTween = null;

                if (onComplete) {
                    onComplete();
                }
            },
        });
    }

    /**
     * Check if player reached Zyx (triggers first dialog)
     */
    private onReachZyx(): void {
        if (this.phase !== TutorialPhase.INITIAL) return;

        this.showFirstDialog();
    }

    /**
     * Show first picture dialog (explains fighting confused creatures)
     * Uses proper library assets: angry slime → fight icon → happy slime
     */
    private showFirstDialog(): void {
        this.isDialogOpen = true;  // Block movement while dialog is shown

        const content: DialogContentItem[] = [
            { type: 'image', key: 'green-slime-angry', scale: 0.4 },   // Angry/confused slime
            { type: 'arrow' },
            { type: 'image', key: 'math-fight-icon', scale: 0.35 },   // Math fight icon
            { type: 'arrow' },
            { type: 'image', key: 'green-slime-happy', scale: 0.4 },  // Happy/calmed slime
        ];

        new PictureDialog(this, {
            content,
            onDismiss: () => {
                this.isDialogOpen = false;  // Re-enable movement
                this.afterFirstDialog();
            },
        });
    }

    /**
     * After first dialog: Zyx moves aside, slime appears
     */
    private afterFirstDialog(): void {
        this.phase = TutorialPhase.DIALOG_1_SHOWN;

        // Animate Zyx moving aside
        if (this.zyx) {
            this.tweens.add({
                targets: this.zyx,
                x: CrashSiteScene.ZYX_MOVED_X,
                duration: 500,
                ease: 'Power2.easeInOut',
                onComplete: () => {
                    // After Zyx moves, show slime
                    this.phase = TutorialPhase.SLIME_VISIBLE;
                    this.createSlime();

                    // Hint text
                    this.showFloatingText('Přibliž se k nepříteli!', '#ffff88', 640, 300);
                },
            });
        }
    }

    /**
     * Check if player is in slime aggro range
     */
    private checkSlimeAggro(): boolean {
        if (this.phase < TutorialPhase.SLIME_VISIBLE) return false;
        if (this.phase >= TutorialPhase.BATTLE_WON) return false;
        if (!this.slime) return false;

        // Check horizontal distance to slime (Y is roughly same since both on path)
        const dx = Math.abs(this.player.x - CrashSiteScene.SLIME_X);

        return dx <= CrashSiteScene.AGGRO_RADIUS;
    }

    /**
     * Start battle with slime
     */
    private startBattle(): void {
        this.phase = TutorialPhase.BATTLE_STARTED;

        // Exclamation effect
        this.showExclamation();

        // Short delay then start battle
        this.time.delayedCall(500, () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);

            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('BattleScene', {
                    mode: 'tutorial',
                    enemyId: 'slime_tutorial',
                    returnScene: 'CrashSiteScene',
                    returnData: {
                        battleWon: true,
                        defeatedEnemyId: 'tutorial_slime',
                        phase: TutorialPhase.BATTLE_WON,
                    },
                    backgroundKey: 'bg-battle',
                    isBoss: false,
                });
            });
        });
    }

    /**
     * Show exclamation mark when enemy aggros
     */
    private showExclamation(): void {
        const exclaim = this.add.text(this.player.x, this.player.y - 80, '!', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: exclaim,
            y: this.player.y - 120,
            alpha: 0,
            duration: 500,
            ease: 'Power2.easeOut',
            onComplete: () => exclaim.destroy(),
        });
    }

    /**
     * Check for interactions based on player position
     */
    private checkInteractions(): void {
        // Check if near Zyx after battle
        if (this.phase === TutorialPhase.BATTLE_WON && this.zyx) {
            const dx = Math.abs(this.player.x - CrashSiteScene.ZYX_EXIT_X);
            if (dx <= 150) {
                this.showSecondDialog();
                return;
            }
        }

        // Check if at exit
        if (this.phase >= TutorialPhase.TUTORIAL_COMPLETE) {
            if (this.player.x > CrashSiteScene.EXIT_X - 50) {
                this.exitToTown();
            }
        }
    }

    /**
     * Show second picture dialog (points to arena)
     */
    private showSecondDialog(): void {
        if (this.phase !== TutorialPhase.BATTLE_WON) return;

        this.isDialogOpen = true;  // Block movement while dialog is shown

        const content: DialogContentItem[] = [
            { type: 'icon', text: '→' },
            { type: 'image', key: 'arena-building', scale: 0.3 },  // Arena building
        ];

        new PictureDialog(this, {
            content,
            onDismiss: () => {
                this.isDialogOpen = false;  // Re-enable movement
                this.afterSecondDialog();
            },
        });
    }

    /**
     * After second dialog: Zyx disappears, exit becomes available
     */
    private afterSecondDialog(): void {
        this.phase = TutorialPhase.DIALOG_2_SHOWN;

        // Fade out Zyx
        if (this.zyx) {
            this.tweens.add({
                targets: this.zyx,
                alpha: 0,
                duration: 500,
                ease: 'Power2.easeIn',
                onComplete: () => {
                    this.zyx?.destroy();
                    this.zyx = null;

                    // Tutorial complete!
                    this.phase = TutorialPhase.TUTORIAL_COMPLETE;

                    // Mark story progress
                    this.storySystem.completeIntro();

                    // Show exit arrow
                    this.createExitArrow();

                    // Hint text
                    this.showFloatingText('Pokračuj do města!', '#88ff88', 900, 300);
                },
            });
        }
    }

    /**
     * Exit to TownScene
     */
    private exitToTown(): void {
        this.isWalking = true;  // Prevent further input

        this.cameras.main.fadeOut(400, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TownScene');
        });
    }

    /**
     * Create UI elements
     */
    private createUI(): void {
        // HP display
        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        // HP bar background
        this.add.rectangle(100, 30, 150, 20, 0x333333)
            .setStrokeStyle(2, 0x666666)
            .setDepth(100);

        // HP bar fill
        this.add.rectangle(27, 30, 146 * hpPercent, 16, 0x44aa44)
            .setOrigin(0, 0.5)
            .setDepth(100);

        // HP text
        this.add.text(100, 30, `HP: ${player.hp}/${player.maxHp}`, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(101);
    }

    /**
     * Show floating text that rises and fades
     */
    private showFloatingText(text: string, color: string, x: number, y: number): void {
        const textObj = this.add.text(x, y, text, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: textObj,
            y: y - 40,
            alpha: 0,
            duration: 2000,
            delay: 1000,
            ease: 'Power2.easeOut',
            onComplete: () => textObj.destroy(),
        });
    }
}

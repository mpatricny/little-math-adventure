import Phaser from 'phaser';
import { SceneDebugger } from '../systems/SceneDebugger';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { UiElementBuilder } from '../systems/UiElementBuilder';
import { Crystal } from '../types';

interface VictoryData {
    // Navigation after dismiss
    returnScene: string;
    returnData: Record<string, unknown>;

    // Rewards
    goldReward: number;
    enemyName?: string;

    // First-defeat tracking
    isFirstDefeat: boolean;
    isPerfectDefeat: boolean;
    wasPerfectBefore: boolean;

    // Pet unlock with sprite data
    unlockedPet?: {
        name: string;
        spriteKey: string;
        animPrefix: string;
    } | null;

    // Enemy sprite for transformation display
    enemySpriteKey?: string;
    enemyAnimPrefix?: string;

    // Crystal rewards
    crystalDrops: Crystal[];
    crystalLabels: string[];
    crystalOverflow: boolean;

    // Arena-specific
    arenaCompleted?: boolean;
    arenaLevel?: number;
    nextArenaLevel?: number;

}

export class VictoryScene extends Phaser.Scene {
    private victoryData!: VictoryData;
    private debugger!: SceneDebugger;
    private gameState!: GameStateManager;

    // Nine-slice grey frame (same as PictureDialog)
    private static readonly FRAME_TEXTURE = '991bb46f-0417-4c22-8e3e-04cea0a3079a';

    constructor() {
        super({ key: 'VictoryScene' });
    }

    init(data: VictoryData): void {
        this.victoryData = data;
        this.gameState = GameStateManager.getInstance();

        // Handle arena completion
        if (data.arenaCompleted) {
            const player = this.gameState.getPlayer();

            // Mark current arena as complete, prepare for next
            player.arena.isActive = false;
            player.arena.currentBattle = 0;

            // Advance to next arena level if available
            if (data.nextArenaLevel && data.nextArenaLevel <= 3) {
                player.arena.arenaLevel = data.nextArenaLevel;
            }

            // Full heal after completing arena
            ProgressionSystem.fullHeal(player);
            this.gameState.save();
        }
    }

    create(): void {
        const isArenaComplete = this.victoryData.arenaCompleted;
        const hasPet = !!this.victoryData.unlockedPet;
        const crystalDrops = this.victoryData.crystalDrops || [];
        const hasCrystals = crystalDrops.length > 0;
        const hasEnemyName = !isArenaComplete && !!this.victoryData.enemyName;

        // === COMPUTE LAYOUT ===
        // Each section: height of its content + gap after it.
        // yOffset tracks the TOP edge of the next section.
        // All text origins are (0.5, 0) so y is the top of the text.
        const SECTION_GAP = 18;
        const TOP_MARGIN = 40;
        const BOTTOM_MARGIN = 35;

        // Section heights (measured from top of section to bottom of its last element)
        const titleH = 44 + SECTION_GAP;                         // 44px font
        const enemyNameH = hasEnemyName ? 20 + SECTION_GAP : 0;  // 20px font
        const rewardsH = 45 + SECTION_GAP;                       // coin sprite ~45px at 0.18 scale
        const petH = hasPet ? 115 + SECTION_GAP : 0;             // title(18) + gap(8) + sprite(80) + gap(4) + name(16) + gap(2) + hint(12) = ~140 but squished
        const crystalH = hasCrystals ? 90 + SECTION_GAP : 0;     // holders(~65) + labels(~25)
        const arenaH = isArenaComplete ? 50 + SECTION_GAP : 0;
        const buttonH = 50;

        const totalContentH = titleH + enemyNameH + rewardsH + petH + crystalH + arenaH + buttonH;
        const panelHeight = Math.max(totalContentH + TOP_MARGIN + BOTTOM_MARGIN, 260);

        // Dark overlay
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
            .setDepth(99).setAlpha(0);

        // Nine-slice grey frame panel — sized to content
        const panel = this.add.nineslice(
            640, 360,
            VictoryScene.FRAME_TEXTURE, undefined,
            680, panelHeight,
            41, 57, 45, 50
        ).setOrigin(0.5).setDepth(100).setScale(0).setAlpha(0);

        // Content container at depth 101
        const content = this.add.container(640, 360).setDepth(101).setAlpha(0);

        // yOffset = top of content area (container-local, 0 = panel center)
        let yOffset = -(panelHeight / 2) + TOP_MARGIN;

        // === TITLE ===
        const titleText = isArenaComplete ? 'ARÉNA DOKONČENA!' : 'VÍTĚZSTVÍ!';
        const title = this.add.text(0, yOffset + 22, titleText, {
            fontSize: '44px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 5, fill: true }
        }).setOrigin(0.5).setScale(0);
        content.add(title);
        yOffset += titleH;

        // === ENEMY NAME (non-arena only) ===
        if (hasEnemyName) {
            const defeated = this.add.text(0, yOffset + 10, `PORAZIL JSI: ${this.victoryData.enemyName!.toUpperCase()}`, {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#dddddd'
            }).setOrigin(0.5).setAlpha(0);
            content.add(defeated);
            yOffset += enemyNameH;
        }

        // === REWARDS ROW (Coin sprite) ===
        const rewardsContainer = this.add.container(0, yOffset + 13);

        if (this.victoryData.goldReward) {
            // Copper coin sprite from shop spritesheet (frame 1, 241px → ~43px at 0.18)
            const coinSprite = this.add.image(55, 0, 'shop-coins-sheet', 1)
                .setScale(0.18).setOrigin(0.5);
            const coinAmount = this.add.text(80, 0, `+${this.victoryData.goldReward}`, {
                fontSize: '26px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffaa00',
                fontStyle: 'bold'
            }).setOrigin(0, 0.5);
            rewardsContainer.add([coinSprite, coinAmount]);
        }

        rewardsContainer.setScale(0);
        content.add(rewardsContainer);
        yOffset += rewardsH;

        // === CREATURE FREED (pet image + name, NO enemy sprite or arrow) ===
        let petContainer: Phaser.GameObjects.Container | null = null;
        if (hasPet) {
            const pet = this.victoryData.unlockedPet!;
            // Container y = top of section. Layout top-down within container.
            petContainer = this.add.container(0, yOffset);

            // "TVOR OSVOBOZEN!" label at top
            const freedTitle = this.add.text(0, 10, 'TVOR OSVOBOZEN!', {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#88ff88',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5, 0);
            petContainer.add(freedTitle);

            // Pet sprite (static frame 0, scale 0.4 = 80x80px)
            const petSprite = this.add.image(0, 55, pet.spriteKey, 0).setScale(0.4);
            petContainer.add(petSprite);

            // Pet name
            const petName = this.add.text(0, 100, pet.name, {
                fontSize: '15px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5, 0);
            petContainer.add(petName);

            petContainer.setScale(0);
            content.add(petContainer);
            yOffset += petH;
        }

        // === CRYSTAL REWARDS ===
        let crystalContainer: Phaser.GameObjects.Container | null = null;

        if (hasCrystals) {
            // Container y = top of section. Holders centered in section.
            crystalContainer = this.add.container(0, yOffset);

            const holderSpacing = 150;
            const startX = -(crystalDrops.length - 1) * holderSpacing / 2;

            crystalDrops.forEach((crystal, index) => {
                const holderX = startX + index * holderSpacing;

                // Crystal holder from forge template (scale 0.5 → ~65px)
                const holder = this.createCrystalHolder(holderX, 35, 0.5);
                this.updateCrystalHolder(holder, crystal);
                crystalContainer!.add(holder);

                // Label below holder (from BattleScene-provided labels)
                const labelText = (this.victoryData.crystalLabels || [])[index] || '';

                if (labelText) {
                    const label = this.add.text(holderX, 75, labelText, {
                        fontSize: '14px',
                        fontFamily: 'Arial, sans-serif',
                        color: '#ccccff',
                        align: 'center'
                    }).setOrigin(0.5, 0);
                    crystalContainer!.add(label);
                }
            });

            // Overflow warning
            if (this.victoryData.crystalOverflow) {
                const warning = this.add.text(0, 88, '⚠️ Inventář plný! Krystaly zůstaly na zemi.', {
                    fontSize: '12px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffaa44',
                    fontStyle: 'bold'
                }).setOrigin(0.5, 0);
                crystalContainer.add(warning);
            }

            crystalContainer.setScale(0);
            content.add(crystalContainer);
            yOffset += crystalH;
        }

        // === ARENA COMPLETION INFO ===
        let arenaContainer: Phaser.GameObjects.Container | null = null;
        if (isArenaComplete) {
            arenaContainer = this.add.container(0, yOffset);
            const arenaLevel = this.victoryData.arenaLevel || 1;
            const nextLevel = this.victoryData.nextArenaLevel || arenaLevel + 1;

            const completeMsg = this.add.text(0, 5, `🏆 ARÉNA ${arenaLevel} DOKONČENA! 🏆`, {
                fontSize: '22px',
                fontFamily: 'Arial, sans-serif',
                color: '#00ff00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5, 0);
            arenaContainer.add(completeMsg);

            if (nextLevel <= 3) {
                const nextMsg = this.add.text(0, 32, `ARÉNA ${nextLevel} JE ODEMČENA!`, {
                    fontSize: '16px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffcc00',
                    fontStyle: 'bold'
                }).setOrigin(0.5, 0);
                arenaContainer.add(nextMsg);
            } else {
                const finalMsg = this.add.text(0, 32, 'VSE ARÉNY DOKONČENY!', {
                    fontSize: '16px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ff88ff',
                    fontStyle: 'bold'
                }).setOrigin(0.5, 0);
                arenaContainer.add(finalMsg);
            }

            arenaContainer.setAlpha(0);
            content.add(arenaContainer);
            yOffset += arenaH;
        }

        // === CONTINUE BUTTON ===
        const button = this.add.container(0, yOffset + 25);

        const bg = this.add.rectangle(0, 0, 200, 50, 0x444444)
            .setStrokeStyle(2, 0xffffff);
        const btnText = this.add.text(0, 0, 'POKRAČOVAT', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);
        button.add([bg, btnText]);
        button.setAlpha(0);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x666666))
            .on('pointerout', () => bg.setFillStyle(0x444444))
            .on('pointerdown', () => this.returnToNextScene());

        content.add(button);

        // === STAGGERED ANIMATION SEQUENCE ===

        // 0ms: Overlay + panel
        this.tweens.add({ targets: overlay, alpha: 1, duration: 300 });
        this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 400, ease: 'Back.out' });
        this.tweens.add({ targets: content, alpha: 1, duration: 200 });

        // 300ms: Title
        this.tweens.add({ targets: title, scale: 1, duration: 500, delay: 300, ease: 'Back.out' });

        // 600ms: Rewards
        this.tweens.add({ targets: rewardsContainer, scale: 1, duration: 400, delay: 600, ease: 'Back.out' });

        // 900ms: Pet section
        if (petContainer) {
            this.tweens.add({ targets: petContainer, scale: 1, duration: 500, delay: 900, ease: 'Back.out' });
        }

        // 1200ms: Crystal holders
        if (crystalContainer) {
            this.tweens.add({ targets: crystalContainer, scale: 1, duration: 400, delay: 1200, ease: 'Back.out' });
        }

        // Arena info fade
        if (arenaContainer) {
            this.tweens.add({ targets: arenaContainer, alpha: 1, duration: 500, delay: 1000 });
        }

        // 1500ms: Continue button
        this.tweens.add({ targets: button, alpha: 1, duration: 500, delay: 1500 });

        // Spacebar shortcut (delayed to match button appearance)
        this.time.delayedCall(1500, () => {
            this.input.keyboard!.once('keydown-SPACE', () => this.returnToNextScene());
        });

        // Setup debugger
        this.debugger = new SceneDebugger(this, 'VictoryScene');
    }

    /**
     * Creates a crystal holder from the UI template (same as CrystalForgeScene).
     */
    private createCrystalHolder(x: number, y: number, scale: number): Phaser.GameObjects.Container {
        const builder = new UiElementBuilder(this);
        const templateId = '1770150302226-gb3gzlbpa';
        const container = builder.buildFromTemplate(templateId, x, y, [0.5, 0.5]);
        if (!container) {
            console.warn('[VictoryScene] Failed to create crystal holder from template');
            return this.add.container(x, y);
        }
        container.setScale(scale);
        return container;
    }

    /**
     * Updates a crystal holder's visual state (simplified version, no selection/usability logic).
     */
    private updateCrystalHolder(container: Phaser.GameObjects.Container, crystal: Crystal): void {
        const layerObjects = container.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;

        const crystalLayer = layerObjects?.get('1770150364402-twzxmxrgz');
        const valueTextInfo = textObjects?.get('1770150398556-n42xyxo4u');

        // Frame indices: shard=1, fragment=3, prism=5
        const tierFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };

        if (crystalLayer && this.textures.exists('gemstone-icons')) {
            crystalLayer.setTexture('gemstone-icons', tierFrames[crystal.tier] ?? 1);
            crystalLayer.setVisible(true);
            // Offset crystal for better centering (matching forge pattern)
            if (crystalLayer.getData('originalX') === undefined) {
                crystalLayer.setData('originalX', crystalLayer.x);
                crystalLayer.setData('originalY', crystalLayer.y);
            }
            crystalLayer.setPosition(
                (crystalLayer.getData('originalX') as number) - 6,
                (crystalLayer.getData('originalY') as number) - 12
            );
        }
        valueTextInfo?.text.setText(String(crystal.value));
    }

    private returnToNextScene(): void {
        this.scene.start(this.victoryData.returnScene, this.victoryData.returnData);
    }
}

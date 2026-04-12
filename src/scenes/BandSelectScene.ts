import Phaser from 'phaser';
import { BandId, ALL_BANDS } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { PlacementInitializer } from '../systems/PlacementInitializer';
import { LocalizationService } from '../systems/LocalizationService';

interface BandSelectData {
    slotIndex: number;
    isReturningPlayer: boolean;
    /** If set, confirm returns to this scene instead of ComicScene/TownScene */
    returnScene?: string;
    /** Pre-select this band (when returning from CharacterSelect) */
    selectedBand?: BandId;
    /** Data to pass back to returnScene along with selectedBand */
    returnData?: Record<string, unknown>;
}

/** Band config for the staircase steps */
const BAND_CONFIG: { band: BandId; labelKey: string; descKey: string }[] = [
    { band: 'A', labelKey: 'band_select.band_A', descKey: 'band_select.band_A_desc' },
    { band: 'B', labelKey: 'band_select.band_B', descKey: 'band_select.band_B_desc' },
    { band: 'C', labelKey: 'band_select.band_C', descKey: 'band_select.band_C_desc' },
    { band: 'D', labelKey: 'band_select.band_D', descKey: 'band_select.band_D_desc' },
    { band: 'E', labelKey: 'band_select.band_E', descKey: 'band_select.band_E_desc' },
];

/**
 * BandSelectScene: Medieval staircase for picking starting difficulty.
 * Shown between CharacterSelectNewScene and ComicScene/TownScene.
 * Each step represents a band (A-E), higher = harder.
 *
 * Supports "return mode": when returnScene is set, confirm goes back
 * to that scene with the selectedBand in the data payload.
 */
export class BandSelectScene extends Phaser.Scene {
    private isReturningPlayer: boolean = false;
    private selectedBand: BandId = 'A';
    private stepContainers: Phaser.GameObjects.Container[] = [];
    private torch!: Phaser.GameObjects.Container;
    private confirmButton!: Phaser.GameObjects.Container;
    private returnScene: string | null = null;
    private returnData: Record<string, unknown> = {};
    private slotIndex: number = 0;

    constructor() {
        super({ key: 'BandSelectScene' });
    }

    init(data: BandSelectData): void {
        this.isReturningPlayer = data.isReturningPlayer ?? false;
        this.selectedBand = data.selectedBand ?? 'A';
        this.returnScene = data.returnScene ?? null;
        this.returnData = data.returnData ?? {};
        this.slotIndex = data.slotIndex ?? 0;
        this.stepContainers = [];
    }

    create(): void {
        const loc = LocalizationService.getInstance();

        // Dark medieval background
        this.add.rectangle(640, 360, 1280, 720, 0x1a1a2e).setOrigin(0.5);

        // Stone wall texture effect (subtle grid lines)
        for (let y = 0; y < 720; y += 60) {
            this.add.rectangle(640, y, 1280, 1, 0x2a2a3e, 0.3);
        }
        for (let x = 0; x < 1280; x += 80) {
            this.add.rectangle(x, 360, 1, 720, 0x2a2a3e, 0.2);
        }

        // Title
        const titleText = loc.t('band_select.title') || 'CHOOSE YOUR LEVEL';
        this.add.text(640, 50, titleText, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Description
        const descText = loc.t('band_select.description') || 'Where do you want to start?';
        this.add.text(640, 95, descText, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
            fontStyle: 'italic',
        }).setOrigin(0.5);

        // Create staircase steps (ascending left-to-right)
        this.createStaircase(loc);

        // Create torch indicator
        this.createTorch();

        // Create confirm button
        this.createConfirmButton(loc);

        // Apply initial selection
        this.selectBand(this.selectedBand);
    }

    private createStaircase(loc: LocalizationService): void {
        const startX = 120;
        const startY = 520;
        const stepWidth = 240;
        const stepHeight = 65;
        const risePerStep = 80;

        for (let i = 0; i < BAND_CONFIG.length; i++) {
            const config = BAND_CONFIG[i];
            const x = startX + i * stepWidth;
            const y = startY - i * risePerStep;

            const container = this.add.container(x, y);

            // Stone step (rectangle with border)
            const step = this.add.rectangle(0, 0, stepWidth - 10, stepHeight, 0x4a4a5e)
                .setStrokeStyle(3, 0x6a6a7e)
                .setOrigin(0.5);
            container.add(step);

            // Step number in top-left corner
            const stepNum = this.add.text(-stepWidth / 2 + 18, -stepHeight / 2 + 8, `${i + 1}`, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#6a6a8a',
                fontStyle: 'bold',
            }).setOrigin(0, 0);
            container.add(stepNum);

            // Band label — centered in step
            const label = loc.t(config.labelKey) || config.band;
            const labelText = this.add.text(0, -10, label, {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5, 0.5);
            container.add(labelText);

            // Band description — centered below label
            const desc = loc.t(config.descKey) || '';
            const descText = this.add.text(0, 14, desc, {
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaacc',
            }).setOrigin(0.5, 0.5);
            container.add(descText);

            // Vertical riser (connecting to step below) - except for first step
            if (i > 0) {
                const riserHeight = risePerStep - stepHeight;
                const riser = this.add.rectangle(
                    -stepWidth / 2 + 2, stepHeight / 2 + riserHeight / 2,
                    stepWidth - 10, riserHeight,
                    0x3a3a4e
                ).setStrokeStyle(2, 0x5a5a6e).setOrigin(0.5);
                container.add(riser);
                container.sendToBack(riser);
            }

            // Make interactive
            container.setSize(stepWidth - 10, stepHeight);
            container.setInteractive({ useHandCursor: true });
            container.on('pointerdown', () => this.selectBand(config.band));
            container.on('pointerover', () => {
                if (config.band !== this.selectedBand) {
                    step.setFillStyle(0x5a5a6e);
                }
            });
            container.on('pointerout', () => {
                if (config.band !== this.selectedBand) {
                    step.setFillStyle(0x4a4a5e);
                }
            });

            // Store references
            container.setData('step', step);
            container.setData('band', config.band);
            this.stepContainers.push(container);
        }
    }

    private createTorch(): void {
        // Torch indicator (flame-like marker above selected step)
        this.torch = this.add.container(0, 0);

        // Flame body (triangle)
        const flame = this.add.triangle(0, -15, 0, -20, -12, 10, 12, 10, 0xff8800);
        this.torch.add(flame);

        // Inner flame
        const innerFlame = this.add.triangle(0, -10, 0, -12, -6, 6, 6, 6, 0xffcc00);
        this.torch.add(innerFlame);

        // Glow effect
        const glow = this.add.circle(0, -5, 25, 0xff8800, 0.2);
        this.torch.add(glow);

        this.torch.setDepth(10);

        // Flicker animation
        this.tweens.add({
            targets: [flame, innerFlame],
            scaleX: { from: 0.9, to: 1.1 },
            scaleY: { from: 0.95, to: 1.05 },
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        this.tweens.add({
            targets: glow,
            alpha: { from: 0.15, to: 0.3 },
            scale: { from: 0.9, to: 1.2 },
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private createConfirmButton(loc: LocalizationService): void {
        const btnX = 640;
        const btnY = 650;

        this.confirmButton = this.add.container(btnX, btnY);

        // Button background
        const bg = this.add.rectangle(0, 0, 250, 55, 0x2d7d2d)
            .setStrokeStyle(3, 0x4dbd4d)
            .setOrigin(0.5);
        this.confirmButton.add(bg);

        // Button text
        const text = loc.t('band_select.confirm') || 'CONFIRM';
        const btnText = this.add.text(0, 0, text, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.confirmButton.add(btnText);

        // Interactive
        this.confirmButton.setSize(250, 55);
        this.confirmButton.setInteractive({ useHandCursor: true });

        this.confirmButton.on('pointerover', () => {
            bg.setFillStyle(0x3d9d3d);
        });
        this.confirmButton.on('pointerout', () => {
            bg.setFillStyle(0x2d7d2d);
        });
        this.confirmButton.on('pointerdown', () => {
            this.confirmSelection();
        });
    }

    private selectBand(band: BandId): void {
        this.selectedBand = band;
        const index = ALL_BANDS.indexOf(band);

        // Update step visuals
        for (const container of this.stepContainers) {
            const step = container.getData('step') as Phaser.GameObjects.Rectangle;
            const stepBand = container.getData('band') as BandId;

            if (stepBand === band) {
                step.setFillStyle(0x7a6a2e); // Golden highlight
                step.setStrokeStyle(3, 0xffd700);
            } else {
                step.setFillStyle(0x4a4a5e);
                step.setStrokeStyle(3, 0x6a6a7e);
            }
        }

        // Move torch above selected step
        const selectedContainer = this.stepContainers[index];
        if (selectedContainer) {
            this.tweens.killTweensOf(this.torch);
            this.tweens.add({
                targets: this.torch,
                x: selectedContainer.x,
                y: selectedContainer.y - 55,
                duration: 200,
                ease: 'Power2.easeOut',
            });
        }
    }

    private confirmSelection(): void {
        // Return mode: go back to the calling scene with the selected band
        if (this.returnScene) {
            this.scene.start(this.returnScene, {
                ...this.returnData,
                selectedBand: this.selectedBand,
                slotIndex: this.slotIndex,
            });
            return;
        }

        // Default mode: apply band selection and proceed to game
        const gameState = GameStateManager.getInstance();
        PlacementInitializer.applyBandSelection(this.selectedBand, gameState);

        import('../systems/MasterySystem').then(({ MasterySystem }) => {
            MasterySystem.getInstance().updatePlayerLevel();
        }).catch(() => { /* ok */ });

        if (this.isReturningPlayer) {
            this.scene.start('TownScene');
        } else {
            this.scene.start('ComicScene');
        }
    }
}

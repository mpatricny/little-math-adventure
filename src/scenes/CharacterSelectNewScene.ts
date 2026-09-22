import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { StorySystem } from '../systems/StorySystem';
import { PlacementInitializer } from '../systems/PlacementInitializer';
import { CharacterType, BandId } from '../types';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

/** Band-to-display-range mapping */
const BAND_RANGE_LABELS: Record<BandId, string> = {
    A: '0–5',
    B: '0–8',
    C: '0–10',
    D: '0–20 (bez přechodu)',
    E: '0–20 (přes desítku)',
};

interface CharacterSelectData {
    slotIndex?: number;
    characterName?: string;
    selectedCharacter?: CharacterType;
    /** Returned from BandSelectScene */
    selectedBand?: BandId;
}

/**
 * New Character Select Scene - Uses UI templates from scene editor
 * Displays character options in themed frames with animated previews
 */
export class CharacterSelectNewScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private selectedCharacter: CharacterType = 'girl_knight';
    private targetSlotIndex: number = 0;
    private characterName: string = 'Hrdina';
    private selectedBand: BandId = 'A';

    // Sprites and frame layer references
    private girlPreview!: Phaser.GameObjects.Sprite;
    private boyPreview!: Phaser.GameObjects.Sprite;
    private leftFrame?: Phaser.GameObjects.Image;
    private rightFrame?: Phaser.GameObjects.Image;
    private nameInputElement: Phaser.GameObjects.DOMElement | null = null;

    // Level display (stored for potential future updates)
    private levelText: Phaser.GameObjects.Text | null = null;

    constructor() {
        super({ key: 'CharacterSelectNewScene' });
    }

    init(data: CharacterSelectData): void {
        this.targetSlotIndex = data.slotIndex ?? 0;
        this.characterName = data.characterName ?? 'Hrdina';
        this.selectedCharacter = data.selectedCharacter ?? 'girl_knight';
        // Preserve band selection when returning from BandSelectScene
        this.selectedBand = data.selectedBand ?? 'A';
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onConfirm', () => this.confirmSelection());
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuNewScene'));

        // Build the scene from JSON
        this.sceneBuilder.buildScene('CharacterSelectNewScene');

        // Create character previews inside the frames
        this.createCharacterPreviews();

        // Create name input over the Text 4 area
        this.createNameInput();

        // Create level display + "Změnit" button
        this.createLevelDisplay();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    }

    private createCharacterPreviews(): void {
        // Access frame layers from the CharacterNew template container
        const characterContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('CharacterNew');
        const layerObjects = characterContainer?.getData('layerObjects') as
            Map<string, Phaser.GameObjects.Image> | undefined;

        // Frame layer IDs from CharacterNew template
        this.leftFrame = layerObjects?.get('1769720600506-f7j78jt2b') as Phaser.GameObjects.Image | undefined;
        this.rightFrame = layerObjects?.get('1769720697747-ny4v9kkg6') as Phaser.GameObjects.Image | undefined;

        // Disable template-built-in hover/pressed on frame layers (we handle it ourselves)
        this.leftFrame?.disableInteractive();
        this.rightFrame?.disableInteractive();

        // Frame centers in screen coordinates
        // Template 500x500 at (638, 378), origin (0.5, 0.5), offset (-250, -250)
        // Left frame: bounds(20, 38, 248, 248) → center (532, 290)
        // Right frame: bounds(231, 38, 248, 248) → center (743, 290)
        const girlX = 532;
        const girlY = 290;
        const boyX = 743;
        const boyY = 290;

        const girlConfig = getPlayerSpriteConfig('girl_knight');
        const boyConfig = getPlayerSpriteConfig('boy_knight');
        const characterScale = 0.85;

        // Create character sprites (non-interactive — zones handle input)
        this.girlPreview = this.add.sprite(girlX, girlY, girlConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(20)
            .play(girlConfig.idleAnim);

        this.boyPreview = this.add.sprite(boyX, boyY, boyConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(20)
            .play(boyConfig.idleAnim);

        // Interactive zones covering entire frame areas for consistent hover/click
        const frameSize = 248;
        this.setupFrameZone(girlX, girlY, frameSize, 'girl_knight');
        this.setupFrameZone(boyX, boyY, frameSize, 'boy_knight');

        // Apply initial selection visuals
        this.updateSelectionVisuals();
    }

    private setupFrameZone(x: number, y: number, size: number, type: CharacterType): void {
        const zone = this.add.zone(x, y, size, size)
            .setInteractive({ useHandCursor: true })
            .setDepth(21);

        zone.on('pointerover', () => this.onFrameHover(type));
        zone.on('pointerout', () => this.onFrameHoverOut(type));
        zone.on('pointerdown', () => this.selectCharacter(type));
    }

    private onFrameHover(type: CharacterType): void {
        const frame = type === 'girl_knight' ? this.leftFrame : this.rightFrame;
        const sprite = type === 'girl_knight' ? this.girlPreview : this.boyPreview;

        // Scale up sprite
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
            targets: sprite,
            scaleX: 0.92,
            scaleY: 0.92,
            duration: 150,
            ease: 'Power2.easeOut'
        });

        // Apply hover glow to frame via postFX
        if (frame && (frame as any).postFX) {
            (frame as any).postFX.clear();
            if (type === this.selectedCharacter) {
                // Selected + hover: intensified golden glow
                (frame as any).postFX.addGlow(0xffd700, 3, 0, false);
                (frame as any).postFX.addColorMatrix().brightness(1.3);
            } else {
                // Non-selected hover: subtle yellow glow
                (frame as any).postFX.addGlow(0xffff00, 1.5, 0, false);
                (frame as any).postFX.addColorMatrix().brightness(1.2);
            }
        }
    }

    private onFrameHoverOut(type: CharacterType): void {
        const frame = type === 'girl_knight' ? this.leftFrame : this.rightFrame;
        const sprite = type === 'girl_knight' ? this.girlPreview : this.boyPreview;

        // Scale down sprite
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
            targets: sprite,
            scaleX: 0.85,
            scaleY: 0.85,
            duration: 150,
            ease: 'Power2.easeOut'
        });

        // Restore frame: clear then re-apply selection glow if needed
        if (frame && (frame as any).postFX) {
            (frame as any).postFX.clear();
            if (type === this.selectedCharacter) {
                this.applySelectedGlow(frame);
            }
        }
    }

    private updateSelectionVisuals(): void {
        // Clear both frames
        if (this.leftFrame && (this.leftFrame as any).postFX) {
            (this.leftFrame as any).postFX.clear();
        }
        if (this.rightFrame && (this.rightFrame as any).postFX) {
            (this.rightFrame as any).postFX.clear();
        }

        // Apply golden glow to selected frame
        const selectedFrame = this.selectedCharacter === 'girl_knight' ? this.leftFrame : this.rightFrame;
        if (selectedFrame) {
            this.applySelectedGlow(selectedFrame);
        }
    }

    private applySelectedGlow(frame: Phaser.GameObjects.Image): void {
        if ((frame as any).postFX) {
            (frame as any).postFX.addGlow(0xffd700, 2, 0, false);
            (frame as any).postFX.addColorMatrix().brightness(1.15);
        }
    }

    private createNameInput(): void {
        const host = this.sceneBuilder.get<Phaser.GameObjects.Container>('characterNameInputHost');
        const layout = this.sceneBuilder.getElementDef('characterNameInputHost');
        const input = document.createElement('input');
        input.id = 'characterNameInput';
        input.type = 'text';
        input.maxLength = 12;
        input.placeholder = 'Hrdina';
        input.value = this.characterName;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.enterKeyHint = 'done';
        input.setAttribute('aria-label', 'Jméno');
        input.style.cssText = `
            box-sizing: border-box;
            width: ${layout?.width ?? 216}px;
            height: ${layout?.height ?? 90}px;
            font: 28px Arial, sans-serif;
            text-align: center;
            padding: 0 8px;
            border: none;
            background: transparent;
            color: #ffffff;
            outline: none;
            caret-color: #ffd700;
        `;
        this.nameInputElement = this.add.dom(host?.x ?? 641, host?.y ?? 538, input)
            .setDepth(host?.depth ?? 100);

        input.addEventListener('input', () => { this.characterName = input.value; });
        // Replacing the default name needs one tap, not a long-press selection.
        input.addEventListener('focus', () => {
            if (input.value === 'Hrdina') input.select();
        });
        input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                // "Done" closes the keyboard; the framed play button starts play.
                input.blur();
            }
        });
    }

    // ============ LEVEL DISPLAY + ZMĚNIT BUTTON ============

    private createLevelDisplay(): void {
        const centerX = 641;
        const y = 598;

        // "Úroveň: 0–5" text
        const rangeLabel = BAND_RANGE_LABELS[this.selectedBand];
        this.levelText = this.add.text(centerX - 50, y, `Úroveň: ${rangeLabel}`, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(50);

        // Green "Změnit" button
        const btnX = centerX + 70;
        const btn = this.add.container(btnX, y).setDepth(50);

        const bg = this.add.rectangle(0, 0, 90, 30, 0x2a6a2a)
            .setStrokeStyle(2, 0x4daa4d);
        const btnText = this.add.text(0, 0, 'Změnit', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#88dd88',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        btn.add([bg, btnText]);
        btn.setSize(90, 30);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => {
            bg.setFillStyle(0x3a8a3a);
            btnText.setColor('#aaffaa');
        });
        btn.on('pointerout', () => {
            bg.setFillStyle(0x2a6a2a);
            btnText.setColor('#88dd88');
        });
        btn.on('pointerdown', () => {
            this.openBandSelect();
        });
    }

    private openBandSelect(): void {
        const storySystem = StorySystem.getInstance();
        this.scene.start('BandSelectScene', {
            slotIndex: this.targetSlotIndex,
            isReturningPlayer: storySystem.hasCompletedIntro(),
            returnScene: 'CharacterSelectNewScene',
            selectedBand: this.selectedBand,
            returnData: {
                slotIndex: this.targetSlotIndex,
                characterName: this.characterName,
                selectedCharacter: this.selectedCharacter,
            },
        });
    }

    private selectCharacter(type: CharacterType): void {
        this.selectedCharacter = type;
        this.updateSelectionVisuals();
    }

    private confirmSelection(): void {
        const finalName = this.characterName.trim() || 'Hrdina';

        const gameState = GameStateManager.getInstance();
        gameState.setActiveSlotIndex(this.targetSlotIndex);
        gameState.reset(this.selectedCharacter, finalName, this.targetSlotIndex);

        // Apply band selection directly (no longer routing to BandSelectScene)
        PlacementInitializer.applyBandSelection(this.selectedBand, gameState);

        import('../systems/MasterySystem').then(({ MasterySystem }) => {
            MasterySystem.getInstance().updatePlayerLevel();
        }).catch(() => { /* ok */ });

        // Proceed to game
        const storySystem = StorySystem.getInstance();
        if (storySystem.hasCompletedIntro()) {
            this.scene.start('TownScene');
        } else {
            this.scene.start('ComicScene');
        }
    }

    shutdown(): void {
        if (this.nameInputElement) {
            // Phaser may already have destroyed the display list on shutdown.
            if (this.nameInputElement.node instanceof HTMLInputElement) this.nameInputElement.node.blur();
            this.nameInputElement.destroy();
            this.nameInputElement = null;
        }
    }
}

import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { StorySystem } from '../systems/StorySystem';
import { CharacterType } from '../types';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

interface CharacterSelectData {
    slotIndex?: number;
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

    // Sprites and frame layer references
    private girlPreview!: Phaser.GameObjects.Sprite;
    private boyPreview!: Phaser.GameObjects.Sprite;
    private leftFrame?: Phaser.GameObjects.Image;
    private rightFrame?: Phaser.GameObjects.Image;
    private nameInputElement: Phaser.GameObjects.DOMElement | null = null;

    constructor() {
        super({ key: 'CharacterSelectNewScene' });
    }

    init(data: CharacterSelectData): void {
        this.targetSlotIndex = data.slotIndex ?? 0;
        this.characterName = 'Hrdina';
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
        // Centered in the name frame layer: bounds(113, 360, 280, 100) in template
        // Template at (638, 378), origin (0.5, 0.5) → frame center = (641, 538)
        const inputX = 641;
        const inputY = 538;

        // Create HTML input element - transparent to blend with UI
        const inputHtml = `
            <input type="text"
                   id="characterNameInput"
                   maxlength="12"
                   placeholder="Hrdina"
                   value="Hrdina"
                   style="
                       width: 200px;
                       font-size: 22px;
                       text-align: center;
                       padding: 4px 8px;
                       border: none;
                       background: transparent;
                       color: #ffffff;
                       font-family: Arial, sans-serif;
                       outline: none;
                       caret-color: #ffd700;
                   "
            />
        `;

        this.nameInputElement = this.add.dom(inputX, inputY).createFromHTML(inputHtml);
        this.nameInputElement.setDepth(100);

        // Listen for input changes
        const inputEl = this.nameInputElement.getChildByID('characterNameInput') as HTMLInputElement;
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.characterName = target.value || 'Hrdina';
            });

            // Handle Enter key to confirm
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.confirmSelection();
                }
            });
        }
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

        // Check if player has completed the intro story
        const storySystem = StorySystem.getInstance();

        if (storySystem.hasCompletedIntro()) {
            // Returning player - skip intro, go directly to town
            this.scene.start('TownScene');
        } else {
            // New player - show intro comic first
            this.scene.start('ComicScene');
        }
    }

    shutdown(): void {
        if (this.nameInputElement) {
            this.nameInputElement.destroy();
            this.nameInputElement = null;
        }
    }
}

import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
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

    // Sprites and selectors
    private girlPreview!: Phaser.GameObjects.Sprite;
    private boyPreview!: Phaser.GameObjects.Sprite;
    private girlSelector!: Phaser.GameObjects.Rectangle;
    private boySelector!: Phaser.GameObjects.Rectangle;
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
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('SaveSlotScene'));

        // Build the scene from JSON
        this.sceneBuilder.buildScene('CharacterSelectNewScene');

        // Create character previews inside the frames
        this.createCharacterPreviews();

        // Create name input over the Text 4 area
        this.createNameInput();
    }

    private createCharacterPreviews(): void {
        // CharacterNew template (500x500) positioned at (638, 378) with default origin (0.5, 0.5)
        // Template origin offset: (250, 250)
        // Left frame center: template (20+124, 38+124) = (144, 162) -> screen (638-250+144, 378-250+162) = (532, 290)
        // Right frame center: template (231+124, 38+124) = (355, 162) -> screen (638-250+355, 378-250+162) = (743, 290)
        // Adjusted: moved up 15px to better fit inside frames
        const girlX = 532;
        const girlY = 275;
        const boyX = 743;
        const boyY = 275;

        const girlConfig = getPlayerSpriteConfig('girl_knight');
        const boyConfig = getPlayerSpriteConfig('boy_knight');

        // Character scale - slightly smaller to fit better in frames
        const characterScale = 0.85;
        const characterScaleHover = characterScale * 1.0625;

        // Create sprites with idle animations
        this.girlPreview = this.add.sprite(girlX, girlY, girlConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(20)
            .play(girlConfig.idleAnim)
            .setInteractive({ useHandCursor: true });

        this.boyPreview = this.add.sprite(boyX, boyY, boyConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(20)
            .play(boyConfig.idleAnim)
            .setInteractive({ useHandCursor: true });

        // Selection indicators (positioned behind sprites, adjusted for smaller sprites)
        this.girlSelector = this.add.rectangle(girlX, girlY, 180, 200, 0x000000, 0)
            .setStrokeStyle(4, 0xffd700)
            .setDepth(19);

        this.boySelector = this.add.rectangle(boyX, boyY, 180, 200, 0x000000, 0)
            .setStrokeStyle(4, 0x666666)
            .setDepth(19);

        // Click handlers
        this.girlPreview.on('pointerdown', () => this.selectCharacter('girl_knight'));
        this.boyPreview.on('pointerdown', () => this.selectCharacter('boy_knight'));

        // Hover effects
        this.girlPreview.on('pointerover', () => this.girlPreview.setScale(characterScaleHover));
        this.girlPreview.on('pointerout', () => this.girlPreview.setScale(characterScale));
        this.boyPreview.on('pointerover', () => this.boyPreview.setScale(characterScaleHover));
        this.boyPreview.on('pointerout', () => this.boyPreview.setScale(characterScale));
    }

    private createNameInput(): void {
        // Text 4 area: template (151+98, 390+15) = (249, 405) -> screen (638-250+249, 378-250+405) = (637, 533)
        const inputX = 637;
        const inputY = 533;

        // Create HTML input element - transparent to blend with UI
        const inputHtml = `
            <input type="text"
                   id="characterNameInput"
                   maxlength="12"
                   placeholder="Hrdina"
                   value="Hrdina"
                   style="
                       width: 180px;
                       font-size: 16px;
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

        // Update selection visuals
        if (type === 'girl_knight') {
            this.girlSelector.setStrokeStyle(4, 0xffd700);
            this.boySelector.setStrokeStyle(4, 0x666666);
        } else {
            this.girlSelector.setStrokeStyle(4, 0x666666);
            this.boySelector.setStrokeStyle(4, 0xffd700);
        }
    }

    private confirmSelection(): void {
        const finalName = this.characterName.trim() || 'Hrdina';

        const gameState = GameStateManager.getInstance();
        gameState.setActiveSlotIndex(this.targetSlotIndex);
        gameState.reset(this.selectedCharacter, finalName, this.targetSlotIndex);

        this.scene.start('TownScene');
    }

    shutdown(): void {
        if (this.nameInputElement) {
            this.nameInputElement.destroy();
            this.nameInputElement = null;
        }
    }
}

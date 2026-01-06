import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CharacterType } from '../types';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

interface CharacterSelectData {
    slotIndex?: number;
}

export class CharacterSelectScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private selectedCharacter: CharacterType = 'girl_knight';
    private targetSlotIndex: number = 0;

    // Preview sprites
    private girlPreview!: Phaser.GameObjects.Sprite;
    private boyPreview!: Phaser.GameObjects.Sprite;

    // Selection indicators
    private girlSelector!: Phaser.GameObjects.Rectangle;
    private boySelector!: Phaser.GameObjects.Rectangle;

    // Name input
    private nameInputElement: Phaser.GameObjects.DOMElement | null = null;
    private characterName: string = 'Hrdina';

    constructor() {
        super({ key: 'CharacterSelectScene' });
    }

    init(data: CharacterSelectData): void {
        // Get slot index from scene data (passed from SaveSlotScene)
        this.targetSlotIndex = data.slotIndex ?? 0;
        this.characterName = 'Hrdina'; // Reset to default
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onConfirm', () => this.confirmSelection());
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('SaveSlotScene'));

        // Build the scene from JSON
        this.sceneBuilder.buildScene('CharacterSelectScene');

        // Create character previews programmatically (reading positions from sceneBuilder)
        this.createCharacterPreviews();

        // Create name input
        this.createNameInput();
    }

    private createCharacterPreviews(): void {
        // Get positions from sceneBuilder placeholders
        const girlPos = this.sceneBuilder.get('girlKnightPreview');
        const boyPos = this.sceneBuilder.get('boyKnightPreview');

        // Get depths from layout overrides
        const girlDepth = this.sceneBuilder.getLayoutOverride('girlKnightPreview')?.depth ?? 10;
        const boyDepth = this.sceneBuilder.getLayoutOverride('boyKnightPreview')?.depth ?? 10;

        const girlX = girlPos?.x ?? 400;
        const girlY = girlPos?.y ?? 400;
        const boyX = boyPos?.x ?? 880;
        const boyY = boyPos?.y ?? 400;

        // Get sprite configs for scale multipliers
        const girlConfig = getPlayerSpriteConfig('girl_knight');
        const boyConfig = getPlayerSpriteConfig('boy_knight');

        // Scale for character select screen (same for both since frames are now unified at 200px)
        const characterScale = 1.2;
        const characterScaleHover = characterScale * 1.0625;

        // Girl knight preview
        this.girlPreview = this.add.sprite(girlX, girlY, girlConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(girlDepth)
            .play(girlConfig.idleAnim)
            .setInteractive({ useHandCursor: true });

        // Boy knight preview
        this.boyPreview = this.add.sprite(boyX, boyY, boyConfig.idleTexture)
            .setScale(characterScale)
            .setDepth(boyDepth)
            .play(boyConfig.idleAnim)
            .setInteractive({ useHandCursor: true });

        // Selection indicators (highlight boxes)
        this.girlSelector = this.add.rectangle(girlX, girlY, 200, 280, 0x000000, 0)
            .setStrokeStyle(4, 0xffd700)
            .setDepth(girlDepth - 1);

        this.boySelector = this.add.rectangle(boyX, boyY, 200, 280, 0x000000, 0)
            .setStrokeStyle(4, 0x666666)
            .setDepth(boyDepth - 1);

        // Click handlers
        this.girlPreview.on('pointerdown', () => this.selectCharacter('girl_knight'));
        this.boyPreview.on('pointerdown', () => this.selectCharacter('boy_knight'));

        // Hover effects
        this.girlPreview.on('pointerover', () => this.girlPreview.setScale(characterScaleHover));
        this.girlPreview.on('pointerout', () => this.girlPreview.setScale(characterScale));
        this.boyPreview.on('pointerover', () => this.boyPreview.setScale(characterScaleHover));
        this.boyPreview.on('pointerout', () => this.boyPreview.setScale(characterScale));

        // Default selection visual
        this.updateSelectionVisuals();
    }

    private createNameInput(): void {
        // Get position from sceneBuilder
        const inputContainer = this.sceneBuilder.get('nameInputContainer');
        const x = inputContainer?.x ?? 640;
        const y = inputContainer?.y ?? 605;
        const depth = this.sceneBuilder.getLayoutOverride('nameInputContainer')?.depth ?? 10;

        // Create HTML input element
        const inputHtml = `
            <input type="text"
                   id="characterNameInput"
                   maxlength="12"
                   placeholder="Hrdina"
                   value="Hrdina"
                   style="
                       width: 200px;
                       font-size: 20px;
                       text-align: center;
                       padding: 8px 12px;
                       border: 2px solid #ffd700;
                       border-radius: 4px;
                       background: rgba(0, 0, 0, 0.7);
                       color: #ffffff;
                       font-family: Arial, sans-serif;
                   "
            />
        `;

        this.nameInputElement = this.add.dom(x, y).createFromHTML(inputHtml);
        this.nameInputElement.setDepth(depth + 100); // Ensure it's above other elements

        // Listen for input changes
        const inputEl = this.nameInputElement.getChildByID('characterNameInput') as HTMLInputElement;
        if (inputEl) {
            inputEl.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.characterName = target.value || 'Hrdina';
            });

            // Also handle Enter key to confirm
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

    private updateSelectionVisuals(): void {
        if (this.selectedCharacter === 'girl_knight') {
            this.girlSelector.setStrokeStyle(4, 0xffd700);
            this.boySelector.setStrokeStyle(4, 0x666666);
        } else {
            this.girlSelector.setStrokeStyle(4, 0x666666);
            this.boySelector.setStrokeStyle(4, 0xffd700);
        }
    }

    private confirmSelection(): void {
        // Get name from input (use default if empty)
        const finalName = this.characterName.trim() || 'Hrdina';

        // Get GameStateManager and set up the new game
        const gameState = GameStateManager.getInstance();
        gameState.setActiveSlotIndex(this.targetSlotIndex);
        gameState.reset(this.selectedCharacter, finalName, this.targetSlotIndex);

        // Start the game
        this.scene.start('TownScene');
    }

    shutdown(): void {
        // Clean up DOM element when leaving scene
        if (this.nameInputElement) {
            this.nameInputElement.destroy();
            this.nameInputElement = null;
        }
    }
}

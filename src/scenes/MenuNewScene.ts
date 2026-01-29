import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { SaveSlotMeta, CharacterType } from '../types';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

/**
 * MenuNewScene - Save slot selection screen using UI templates
 * Displays character preview in LoadGame frame with slot navigation
 */
export class MenuNewScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private currentSlotIndex: number = 0;
    private slotsMeta: SaveSlotMeta[] = [];
    private filledSlotIndices: number[] = []; // Only non-empty slots

    // Dynamic character sprite
    private characterSprite: Phaser.GameObjects.Sprite | null = null;

    constructor() {
        super({ key: 'MenuNewScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers BEFORE building the scene
        this.sceneBuilder.registerHandler('onPrevSlot', () => this.navigateSlot(-1));
        this.sceneBuilder.registerHandler('onNextSlot', () => this.navigateSlot(1));
        this.sceneBuilder.registerHandler('onLoad', () => this.onLoadClicked());
        this.sceneBuilder.registerHandler('onDelete', () => this.onDeleteClicked());
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuScene'));

        // Build the scene from JSON
        this.sceneBuilder.buildScene('MenuNewScene');

        // Load slot data
        this.slotsMeta = SaveSystem.getSlotsMeta();
        this.filledSlotIndices = this.slotsMeta
            .filter(slot => !slot.isEmpty)
            .map(slot => slot.slotIndex);

        // Start on first filled slot (or 0 if none)
        this.currentSlotIndex = this.filledSlotIndices.length > 0 ? this.filledSlotIndices[0] : 0;

        // Create character sprite (initially hidden)
        this.createCharacterSprite();

        // Update display for current slot
        this.updateSlotDisplay();

        // Add keyboard navigation
        this.setupKeyboardNavigation();
    }

    private createCharacterSprite(): void {
        // LoadGame template at (974, 315) with origin (0.5, 0.5)
        // Template size: 450x560
        // Origin offset: (-225, -280)
        // CharacterFrame bounds: (22, 26, 400, 400) - center at (222, 226)
        // Screen position: (974 - 225 + 222, 315 - 280 + 226) = (971, 261)
        const spriteX = 971;
        const spriteY = 261;

        // Create sprite with girl knight as default (will be updated)
        const config = getPlayerSpriteConfig('girl_knight');
        this.characterSprite = this.add.sprite(spriteX, spriteY, config.idleTexture)
            .setScale(0.85)
            .setDepth(20)
            .setVisible(false);
    }

    private navigateSlot(direction: number): void {
        // Only navigate if there are filled slots
        if (this.filledSlotIndices.length === 0) return;

        // Find current position in filled slots array
        const currentPos = this.filledSlotIndices.indexOf(this.currentSlotIndex);
        const len = this.filledSlotIndices.length;

        // Navigate within filled slots only
        const newPos = (currentPos + direction + len) % len;
        this.currentSlotIndex = this.filledSlotIndices[newPos];

        this.updateSlotDisplay();
    }

    private updateSlotDisplay(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];

        // Update slot counter text (show position in filled slots)
        const filledCount = this.filledSlotIndices.length;
        const currentPos = this.filledSlotIndices.indexOf(this.currentSlotIndex) + 1;
        this.updateSlotText(filledCount > 0 ? `Slot ${currentPos}/${filledCount}` : 'Zadne ulozene hry');

        // Get LoadGame container to access text children
        const loadGameContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('LoadGame');

        if (slot.isEmpty) {
            // Hide sprite, show empty slot info
            this.characterSprite?.setVisible(false);
            this.updateLoadGameTexts(loadGameContainer, 'PRAZDNY SLOT', '', '');
        } else {
            // Show character sprite with animation
            this.showCharacterSprite(slot.characterType);
            this.updateLoadGameTexts(
                loadGameContainer,
                slot.characterName || 'Hrdina',
                `Uroven: ${slot.level}`,
                `Priklady: ${slot.totalProblemsSolved}`
            );
        }
    }

    private showCharacterSprite(characterType: CharacterType): void {
        if (!this.characterSprite) return;

        const config = getPlayerSpriteConfig(characterType);
        this.characterSprite
            .setTexture(config.idleTexture)
            .setVisible(true);

        // Play idle animation if it exists
        if (this.anims.exists(config.idleAnim)) {
            this.characterSprite.play(config.idleAnim);
        }
    }

    private updateSlotText(text: string): void {
        // Get Slot container and update its text
        const slotContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Slot');
        if (!slotContainer) return;

        // Text objects are stored in a map on the container
        const textObjects = slotContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (!textObjects) return;

        // Slot template has one text area with id "1769727176013-ccwobrd3f"
        const textInfo = textObjects.get('1769727176013-ccwobrd3f');
        if (textInfo) {
            textInfo.text.setText(text);
        }
    }

    private updateLoadGameTexts(
        container: Phaser.GameObjects.Container | null,
        name: string,
        level: string,
        problems: string
    ): void {
        if (!container) return;

        // Text objects are stored in a map on the container
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (!textObjects) return;

        // LoadGame template text areas:
        // "1769723257544-snpzul05b" - Character name (Text 1)
        // "1769723295262-fnkpq11bl" - Level info (Text 2)
        // "1769723312530-w6j7kezib" - Problems solved (Text 3)

        const nameText = textObjects.get('1769723257544-snpzul05b');
        if (nameText) nameText.text.setText(name);

        const levelText = textObjects.get('1769723295262-fnkpq11bl');
        if (levelText) levelText.text.setText(level);

        const problemsText = textObjects.get('1769723312530-w6j7kezib');
        if (problemsText) problemsText.text.setText(problems);
    }

    private onLoadClicked(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];

        if (slot.isEmpty) {
            // Empty slot - go to character select
            this.scene.start('CharacterSelectNewScene', { slotIndex: this.currentSlotIndex });
        } else {
            // Load existing save
            const gameState = GameStateManager.getInstance();
            gameState.loadSlot(this.currentSlotIndex);
            this.scene.start('TownScene');
        }
    }

    private onDeleteClicked(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];
        if (slot.isEmpty) return;

        // Delete slot and refresh data
        SaveSystem.deleteSlot(this.currentSlotIndex);
        this.slotsMeta = SaveSystem.getSlotsMeta();
        this.filledSlotIndices = this.slotsMeta
            .filter(s => !s.isEmpty)
            .map(s => s.slotIndex);

        // Navigate to next available slot or show empty state
        if (this.filledSlotIndices.length > 0) {
            // Stay on same position or go to last if we were at the end
            const newPos = Math.min(
                this.filledSlotIndices.indexOf(this.currentSlotIndex),
                this.filledSlotIndices.length - 1
            );
            this.currentSlotIndex = this.filledSlotIndices[Math.max(0, newPos)];
        }

        this.updateSlotDisplay();
    }

    private setupKeyboardNavigation(): void {
        // Arrow keys for navigation
        this.input.keyboard?.on('keydown-LEFT', () => this.navigateSlot(-1));
        this.input.keyboard?.on('keydown-RIGHT', () => this.navigateSlot(1));

        // Enter to load/select
        this.input.keyboard?.on('keydown-ENTER', () => this.onLoadClicked());

        // Escape to go back
        this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
    }

    shutdown(): void {
        // Clean up keyboard listeners
        this.input.keyboard?.off('keydown-LEFT');
        this.input.keyboard?.off('keydown-RIGHT');
        this.input.keyboard?.off('keydown-ENTER');
        this.input.keyboard?.off('keydown-ESC');
    }
}

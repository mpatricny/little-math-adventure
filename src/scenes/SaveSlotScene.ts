import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { SaveSlotMeta, CharacterType } from '../types';

/**
 * Save slot selection scene with carousel UI
 * Allows players to select, create, or delete save slots
 */
export class SaveSlotScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private currentSlotIndex: number = 0;
    private slotsMeta: SaveSlotMeta[] = [];

    // UI elements (text objects that need updating)
    private slotNumberText!: Phaser.GameObjects.Text;
    private characterNameText!: Phaser.GameObjects.Text;
    private characterLevelText!: Phaser.GameObjects.Text;
    private problemsSolvedText!: Phaser.GameObjects.Text;
    private emptySlotText!: Phaser.GameObjects.GameObject;
    private characterPreviewContainer!: Phaser.GameObjects.Container;
    private characterSprite: Phaser.GameObjects.Sprite | null = null;

    // Buttons that need visibility toggling
    private btnPlay!: Phaser.GameObjects.Container;
    private btnDelete!: Phaser.GameObjects.Container;

    // Delete confirmation dialog elements
    private deleteOverlay!: Phaser.GameObjects.GameObject;
    private deleteDialog!: Phaser.GameObjects.GameObject;
    private deleteTitle!: Phaser.GameObjects.GameObject;
    private btnConfirmDelete!: Phaser.GameObjects.GameObject;
    private btnCancelDelete!: Phaser.GameObjects.GameObject;

    constructor() {
        super({ key: 'SaveSlotScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register event handlers
        this.sceneBuilder.registerHandler('onPrevSlot', () => this.navigateSlot(-1));
        this.sceneBuilder.registerHandler('onNextSlot', () => this.navigateSlot(1));
        this.sceneBuilder.registerHandler('onPlay', () => this.onPlayClicked());
        this.sceneBuilder.registerHandler('onDelete', () => this.showDeleteConfirmation());
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuScene'));
        this.sceneBuilder.registerHandler('onConfirmDelete', () => this.confirmDelete());
        this.sceneBuilder.registerHandler('onCancelDelete', () => this.hideDeleteConfirmation());

        // Build the scene from JSON
        this.sceneBuilder.buildScene('SaveSlotScene');

        // Get references to UI elements that need updating
        this.slotNumberText = this.sceneBuilder.get<Phaser.GameObjects.Text>('slotNumber')!;
        this.characterNameText = this.sceneBuilder.get<Phaser.GameObjects.Text>('characterName')!;
        this.characterLevelText = this.sceneBuilder.get<Phaser.GameObjects.Text>('characterLevel')!;
        this.problemsSolvedText = this.sceneBuilder.get<Phaser.GameObjects.Text>('problemsSolved')!;
        this.emptySlotText = this.sceneBuilder.get('emptySlotText')!;
        this.characterPreviewContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('characterPreview') ||
            this.add.container(640, 280);

        this.btnPlay = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnPlay')!;
        this.btnDelete = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnDelete')!;

        // Delete confirmation elements
        this.deleteOverlay = this.sceneBuilder.get('deleteOverlay')!;
        this.deleteDialog = this.sceneBuilder.get('deleteDialog')!;
        this.deleteTitle = this.sceneBuilder.get('deleteTitle')!;
        this.btnConfirmDelete = this.sceneBuilder.get('btnConfirmDelete')!;
        this.btnCancelDelete = this.sceneBuilder.get('btnCancelDelete')!;

        // Load slot metadata
        this.slotsMeta = SaveSystem.getSlotsMeta();

        // Setup keyboard navigation
        this.setupKeyboardNavigation();

        // Display initial slot
        this.updateSlotDisplay();
    }

    private setupKeyboardNavigation(): void {
        this.input.keyboard!.on('keydown-LEFT', () => this.navigateSlot(-1));
        this.input.keyboard!.on('keydown-RIGHT', () => this.navigateSlot(1));
        this.input.keyboard!.on('keydown-ESC', () => this.scene.start('MenuScene'));
    }

    private navigateSlot(direction: number): void {
        // Wrap around navigation
        this.currentSlotIndex = (this.currentSlotIndex + direction + 8) % 8;
        this.updateSlotDisplay();

        // Simple slide animation could be added here
    }

    private updateSlotDisplay(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];

        // Update slot number
        if (this.slotNumberText && this.slotNumberText.setText) {
            this.slotNumberText.setText(`SLOT ${this.currentSlotIndex + 1}/8`);
        }

        // Clear previous character sprite
        if (this.characterSprite) {
            this.characterSprite.destroy();
            this.characterSprite = null;
        }

        if (slot.isEmpty) {
            // Empty slot
            this.showEmptySlot();
        } else {
            // Slot with save data
            this.showFilledSlot(slot);
        }
    }

    private showEmptySlot(): void {
        // Show empty slot text
        if (this.emptySlotText && (this.emptySlotText as any).setVisible) {
            (this.emptySlotText as any).setVisible(true);
        }

        // Hide character info
        if (this.characterNameText && this.characterNameText.setVisible) {
            this.characterNameText.setVisible(false);
        }
        if (this.characterLevelText && this.characterLevelText.setVisible) {
            this.characterLevelText.setVisible(false);
        }
        if (this.problemsSolvedText && this.problemsSolvedText.setVisible) {
            this.problemsSolvedText.setVisible(false);
        }

        // Update play button text to "NOVA HRA"
        this.updateButtonText(this.btnPlay, 'NOVA HRA');

        // Hide delete button for empty slots
        if (this.btnDelete && (this.btnDelete as any).setVisible) {
            (this.btnDelete as any).setVisible(false);
        }
    }

    private showFilledSlot(slot: SaveSlotMeta): void {
        // Hide empty slot text
        if (this.emptySlotText && (this.emptySlotText as any).setVisible) {
            (this.emptySlotText as any).setVisible(false);
        }

        // Show and update character info
        if (this.characterNameText) {
            this.characterNameText.setVisible(true);
            this.characterNameText.setText(slot.characterName);
        }
        if (this.characterLevelText) {
            this.characterLevelText.setVisible(true);
            this.characterLevelText.setText(`Uroven: ${slot.level}`);
        }
        if (this.problemsSolvedText) {
            this.problemsSolvedText.setVisible(true);
            this.problemsSolvedText.setText(`Priklady: ${slot.totalProblemsSolved}`);
        }

        // Update play button text to "HRAT"
        this.updateButtonText(this.btnPlay, 'HRAT');

        // Show delete button
        if (this.btnDelete && (this.btnDelete as any).setVisible) {
            (this.btnDelete as any).setVisible(true);
        }

        // Create character preview sprite
        this.createCharacterPreview(slot.characterType);
    }

    private createCharacterPreview(characterType: CharacterType): void {
        const previewContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('characterPreview');
        const x = previewContainer?.x ?? 640;
        const y = previewContainer?.y ?? 280;

        // Determine which sprite to use based on character type
        const textureKey = characterType === 'boy_knight' ? 'boy-knight-idle-sheet' : 'knight-idle-sheet';
        const animKey = characterType === 'boy_knight' ? 'boy-knight-idle' : 'knight-idle';

        // Create sprite
        this.characterSprite = this.add.sprite(x, y, textureKey)
            .setScale(0.5)
            .setDepth(15);

        // Play idle animation if available
        if (this.anims.exists(animKey)) {
            this.characterSprite.play(animKey);
        }
    }

    private updateButtonText(button: Phaser.GameObjects.Container, newText: string): void {
        if (!button) return;

        // Find the text child in the button container
        const children = button.list as Phaser.GameObjects.GameObject[];
        for (const child of children) {
            if (child instanceof Phaser.GameObjects.Text) {
                child.setText(newText);
                break;
            }
        }
    }

    private onPlayClicked(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];

        if (slot.isEmpty) {
            // Go to CharacterSelectNewScene with slot index
            this.scene.start('CharacterSelectNewScene', { slotIndex: this.currentSlotIndex });
        } else {
            // Load slot and go to TownScene
            const gameState = GameStateManager.getInstance();
            gameState.loadSlot(this.currentSlotIndex);
            this.scene.start('TownScene');
        }
    }

    private showDeleteConfirmation(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];
        if (slot.isEmpty) return; // Can't delete empty slot

        // Show overlay and dialog
        if (this.deleteOverlay && (this.deleteOverlay as any).setVisible) {
            (this.deleteOverlay as any).setVisible(true);
            (this.deleteOverlay as any).setDepth(100);
        }
        if (this.deleteDialog && (this.deleteDialog as any).setVisible) {
            (this.deleteDialog as any).setVisible(true);
            (this.deleteDialog as any).setDepth(101);
        }
        if (this.deleteTitle && (this.deleteTitle as any).setVisible) {
            (this.deleteTitle as any).setVisible(true);
            (this.deleteTitle as any).setDepth(102);
        }
        if (this.btnConfirmDelete && (this.btnConfirmDelete as any).setVisible) {
            (this.btnConfirmDelete as any).setVisible(true);
            (this.btnConfirmDelete as any).setDepth(102);
        }
        if (this.btnCancelDelete && (this.btnCancelDelete as any).setVisible) {
            (this.btnCancelDelete as any).setVisible(true);
            (this.btnCancelDelete as any).setDepth(102);
        }
    }

    private hideDeleteConfirmation(): void {
        // Hide all delete confirmation elements
        if (this.deleteOverlay && (this.deleteOverlay as any).setVisible) {
            (this.deleteOverlay as any).setVisible(false);
        }
        if (this.deleteDialog && (this.deleteDialog as any).setVisible) {
            (this.deleteDialog as any).setVisible(false);
        }
        if (this.deleteTitle && (this.deleteTitle as any).setVisible) {
            (this.deleteTitle as any).setVisible(false);
        }
        if (this.btnConfirmDelete && (this.btnConfirmDelete as any).setVisible) {
            (this.btnConfirmDelete as any).setVisible(false);
        }
        if (this.btnCancelDelete && (this.btnCancelDelete as any).setVisible) {
            (this.btnCancelDelete as any).setVisible(false);
        }
    }

    private confirmDelete(): void {
        // Delete the slot
        SaveSystem.deleteSlot(this.currentSlotIndex);

        // Refresh slot metadata
        this.slotsMeta = SaveSystem.getSlotsMeta();

        // Hide confirmation dialog
        this.hideDeleteConfirmation();

        // Update display
        this.updateSlotDisplay();
    }

    shutdown(): void {
        // Clean up keyboard listeners to prevent them from persisting to the next scene
        this.input.keyboard?.off('keydown-LEFT');
        this.input.keyboard?.off('keydown-RIGHT');
        this.input.keyboard?.off('keydown-ESC');
    }
}

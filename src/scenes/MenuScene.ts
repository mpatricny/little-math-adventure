import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

export class MenuScene extends Phaser.Scene {
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        // Run migration for old save format (only affects first run after update)
        SaveSystem.migrateOldSave();

        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onContinue', () => {
            // Go to save slot selection
            this.scene.start('SaveSlotScene');
        });

        this.sceneBuilder.registerHandler('onNewGame', () => {
            // Find first empty slot
            const firstEmptySlot = SaveSystem.findFirstEmptySlot();

            if (firstEmptySlot >= 0) {
                // Go directly to character select with the empty slot
                this.scene.start('CharacterSelectScene', { slotIndex: firstEmptySlot });
            } else {
                // All slots full - show save slot scene to let user manage slots
                this.scene.start('SaveSlotScene');
            }
        });

        // Build the scene from JSON
        this.sceneBuilder.buildScene('MenuScene');

        // Handle dynamic state (Continue button visibility and positioning)
        const hasSave = SaveSystem.hasSave();
        const btnContinue = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnContinue');
        const btnNewGame = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnNewGame');

        if (hasSave) {
            if (btnContinue) btnContinue.setVisible(true);
        } else {
            // If no save, move New Game button up to where Continue would be
            if (btnNewGame && btnContinue) {
                btnNewGame.y = btnContinue.y;
            }
        }

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'MenuScene');
    }
}

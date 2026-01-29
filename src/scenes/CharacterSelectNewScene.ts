import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';

/**
 * New Character Select Scene - Uses UI templates from scene editor
 */
export class CharacterSelectNewScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'CharacterSelectNewScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onBack', () => {
            this.scene.start('MenuScene');
        });

        // Build the scene from JSON
        this.sceneBuilder.buildScene('CharacterSelectNewScene');
    }
}

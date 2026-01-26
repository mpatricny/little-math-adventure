import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';

/**
 * Test scene for verifying the Asset Factory integration.
 *
 * This scene demonstrates that:
 * 1. scenes.json uses dot-notation asset paths (e.g., "environments.backgrounds.arena")
 * 2. scene-layouts.json uses texture keys (e.g., "bg-arena")
 * 3. SceneBuilder resolves asset paths via AssetFactory
 * 4. The background renders correctly in the game
 *
 * Used for AF-011 integration test verification.
 */
export class AssetFactoryTestScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'AssetFactoryTestScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handler for back button
        this.sceneBuilder.registerHandler('onBack', () => {
            this.scene.start('MenuScene');
        });

        // Build the scene from JSON
        // This will:
        // 1. Read scenes.json for element definitions with dot-notation asset paths
        // 2. Read scene-layouts.json for position/scale overrides
        // 3. Use AssetFactory to resolve "environments.backgrounds.arena" -> creates image with "bg-arena" texture
        this.sceneBuilder.buildScene('AssetFactoryTestScene');

        // Log success message to console for verification
        console.log('[AssetFactoryTestScene] Scene built successfully. If you see the arena background, the Asset Factory integration is working!');
    }
}

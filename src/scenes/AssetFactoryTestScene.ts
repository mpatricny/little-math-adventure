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

        // Make the Spin frame clickable to test the SpinLockPuzzleScene
        this.sceneBuilder.bindClick('Spin frame', () => {
            this.scene.launch('SpinLockPuzzleScene', {
                riddle: 'Má čtyři nohy, ale nechodí. Co to je?',
                riddleEn: 'Has four legs but doesn\'t walk. What is it?',
                answer: 'STUL',
                reward: { gold: 35, diamonds: 1 },
                objectId: 'chest_locked_test',
                roomId: 'test_room',
                parentScene: 'AssetFactoryTestScene'
            });
            this.scene.pause();
        });

        // Resume when puzzle closes
        this.events.on('puzzleSolved', () => {
            console.log('[AssetFactoryTestScene] Puzzle solved!');
        });

        console.log('[AssetFactoryTestScene] Scene built. Click the Spin frame to test the puzzle overlay.');
    }
}

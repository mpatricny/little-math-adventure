import Phaser from 'phaser';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

/**
 * Testing version of WitchHutScene.
 * Shows the same interior but returns to TestingTownScene instead of TownScene.
 * Used for UI testing in the isolated testing environment.
 */
export class TestingWitchHutScene extends Phaser.Scene {
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'TestingWitchHutScene' });
    }

    create(): void {
        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('TestingWitchHutScene');

        // Create TESTING label to distinguish from real scene
        this.createTestingLabel();

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'TestingWitchHutScene');
    }

    private createTestingLabel(): void {
        const text = this.add.text(640, 100, 'TESTING - WITCH HUT', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(500);

        // Pulsing animation
        this.tweens.add({
            targets: text,
            alpha: 0.7,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
}

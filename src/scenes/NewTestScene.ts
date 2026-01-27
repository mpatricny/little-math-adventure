import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';

export class NewTestScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'NewTestScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuScene'));
        this.sceneBuilder.buildScene('NewTestScene');
    }
}

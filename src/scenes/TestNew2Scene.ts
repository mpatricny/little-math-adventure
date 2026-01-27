import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';

export class TestNew2Scene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'TestNew2Scene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuScene'));
        this.sceneBuilder.buildScene('TestNew2Scene');
    }
}

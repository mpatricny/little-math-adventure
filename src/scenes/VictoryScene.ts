import Phaser from 'phaser';

export class VictoryScene extends Phaser.Scene {
    constructor() {
        super({ key: 'VictoryScene' });
    }

    create(): void {
        this.add.text(400, 300, 'Victory! (Placeholder)', { fontSize: '32px', color: '#ffd700' }).setOrigin(0.5);

        this.input.on('pointerdown', () => {
            this.scene.start('MenuScene');
        });
    }
}

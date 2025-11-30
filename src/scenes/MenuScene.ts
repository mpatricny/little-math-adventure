import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.add.text(width / 2, height / 3, 'Little Math Adventure', {
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const startText = this.add.text(width / 2, height / 2, 'Click to Start', {
            fontSize: '32px',
            color: '#44aa44',
        }).setOrigin(0.5);

        startText.setInteractive({ useHandCursor: true });
        startText.on('pointerdown', () => {
            this.scene.start('BattleScene', { enemyId: 'slime_green' });
        });
    }
}

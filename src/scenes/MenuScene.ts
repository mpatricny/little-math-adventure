import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        this.add.text(width / 2, height / 4, 'Little Math Adventure', {
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Town button
        const townBtn = this.add.text(width / 2, height / 2 - 30, 'Město', {
            fontSize: '32px',
            color: '#44aa44',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        townBtn.on('pointerover', () => townBtn.setColor('#88ff88'));
        townBtn.on('pointerout', () => townBtn.setColor('#44aa44'));
        townBtn.on('pointerdown', () => {
            this.scene.start('TownScene');
        });

        // Battle button
        const battleBtn = this.add.text(width / 2, height / 2 + 30, 'Souboj', {
            fontSize: '32px',
            color: '#aa4444',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        battleBtn.on('pointerover', () => battleBtn.setColor('#ff8888'));
        battleBtn.on('pointerout', () => battleBtn.setColor('#aa4444'));
        battleBtn.on('pointerdown', () => {
            this.scene.start('BattleScene', { enemyId: 'slime_green' });
        });
    }
}

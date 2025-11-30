import Phaser from 'phaser';

export class TownScene extends Phaser.Scene {
    constructor() {
        super({ key: 'TownScene' });
    }

    create(): void {
        this.add.text(400, 300, 'Town Scene (Placeholder)', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);
    }
}

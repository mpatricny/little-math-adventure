import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload(): void {
        // Show loading progress
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0x44aa44, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        // === SPRITES ===
        // Knight: 8 frames, each 256x256
        this.load.spritesheet('knight', 'assets/sprites/knight-attack.png', {
            frameWidth: 256,
            frameHeight: 256,
        });

        // Slime: 8 frames (attack animation used as base)
        this.load.spritesheet('slime', 'assets/sprites/slime.png', {
            frameWidth: 256,
            frameHeight: 256,
        });

        // Visual hints for math (8 items: apple, sword, hammer, stone, coin, shield, potion, coin)
        this.load.spritesheet('hints', 'assets/sprites/hint-items.png', {
            frameWidth: 200,
            frameHeight: 200,
        });

        // === BACKGROUNDS ===
        this.load.image('bg-battle', 'assets/backgrounds/field.png');

        // === TOWN ASSETS ===
        this.load.image('town-bg', 'assets/town/background.png');
        this.load.image('town-grass', 'assets/town/grass.png');
        this.load.image('building-witch', 'assets/town/witch-hut.png');
        this.load.image('building-guild', 'assets/town/guild.png');
        this.load.image('building-tavern', 'assets/town/tavern.png');
        this.load.image('building-shop', 'assets/town/weapon-shop.png');

        // === UI ===
        this.load.image('math-board', 'assets/ui/math-board.png');
        this.load.image('btn-answer', 'assets/ui/small_board_button.png');
        this.load.image('btn-answer-pressed', 'assets/ui/small_board_button_pressed.png');
        // this.load.spritesheet('buttons', 'assets/ui/buttons.png', {
        //   frameWidth: 120,
        //   frameHeight: 50,
        // });
        // this.load.spritesheet('icons', 'assets/ui/icons.png', {
        //   frameWidth: 32,
        //   frameHeight: 32,
        // });

        // === AUDIO ===
        // this.load.audio('sfx-hit', 'assets/audio/hit.wav');
        // this.load.audio('sfx-miss', 'assets/audio/miss.wav');
        // this.load.audio('sfx-victory', 'assets/audio/victory.wav');
        // this.load.audio('sfx-correct', 'assets/audio/correct.wav');
        // this.load.audio('sfx-wrong', 'assets/audio/wrong.wav');

        // === DATA ===
        this.load.json('enemies', 'assets/data/enemies.json');
        this.load.json('items', 'assets/data/items.json');
    }

    create(): void {
        // Create global animations
        this.createAnimations();

        // Go to menu
        this.scene.start('MenuScene');
    }

    private createAnimations(): void {
        // Knight attack animation (8 frames)
        this.anims.create({
            key: 'knight-attack',
            frames: this.anims.generateFrameNumbers('knight', { start: 0, end: 7 }),
            frameRate: 12,
            repeat: 0,
        });

        // Knight idle (first frame)
        this.anims.create({
            key: 'knight-idle',
            frames: [{ key: 'knight', frame: 0 }],
            frameRate: 1,
        });

        // Slime idle animation (2 frames, looping)
        this.anims.create({
            key: 'slime-idle',
            frames: this.anims.generateFrameNumbers('slime', { start: 0, end: 1 }),
            frameRate: 3,
            repeat: -1,
        });

        // Slime hurt (flash effect handled in code)
        this.anims.create({
            key: 'slime-hurt',
            frames: [{ key: 'slime', frame: 0 }],
            frameRate: 1,
        });
    }
}

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

        // Purple Demon: attack spritesheet (12 frames)
        this.load.spritesheet('purple-attack', 'assets/sprites/Purple-attack.png', {
            frameWidth: 300,
            frameHeight: 320,
        });

        // Purple Demon: hit/death spritesheet (6 frames)
        this.load.spritesheet('purple-hit', 'assets/sprites/purple-hit-fall.png', {
            frameWidth: 300,
            frameHeight: 300,
        });

        // Knight idle: 10 frames (5x2 grid, 300x300 each)
        this.load.spritesheet('knight-idle-sheet', 'assets/sprites/knight-idle.png', {
            frameWidth: 300,
            frameHeight: 300,
        });

        // Pink Monster: idle (8 frames, 4x2 grid, 320x304 each)
        this.load.spritesheet('pink-idle', 'assets/sprites/pink-idle.png', {
            frameWidth: 320,
            frameHeight: 304,
        });

        // Pink Monster: attack (6 frames, 320x300 each)
        this.load.spritesheet('pink-attack', 'assets/sprites/pink-attack.png', {
            frameWidth: 320,
            frameHeight: 300,
        });

        // Pink Monster: hit (6 frames, 320x304 each)
        this.load.spritesheet('pink-hit', 'assets/sprites/pink-hit.png', {
            frameWidth: 320,
            frameHeight: 304,
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
        this.load.image('witch-hut-interior', 'assets/town/witch-hut-interior.png');
        this.load.image('building-witch', 'assets/town/witch-hut.png');
        this.load.image('building-guild', 'assets/town/guild.png');
        this.load.image('building-tavern', 'assets/town/tavern.png');
        this.load.image('building-shop', 'assets/town/weapon-shop.png');

        // === SHOP ASSETS ===
        this.load.image('shop-interior', 'assets/town/shop/shop-interior.png');
        this.load.image('shop-blacksmith', 'assets/town/shop/blacksmith.png');
        this.load.image('shop-inventory', 'assets/town/shop/empty inventory.png');
        // Shop items: swords (7x2 grid), shields (4x3 grid), helmets (4x3 grid)
        this.load.spritesheet('shop-swords', 'assets/town/shop/sword-set.png', {
            frameWidth: 192,
            frameHeight: 448,
        });
        this.load.spritesheet('shop-shields', 'assets/town/shop/shield-set.png', {
            frameWidth: 283,
            frameHeight: 284,
        });
        this.load.spritesheet('shop-helmets', 'assets/town/shop/helmet-set.png', {
            frameWidth: 336,
            frameHeight: 298,
        });

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

        // Knight idle (10 frames, breathing animation with ping-pong)
        this.anims.create({
            key: 'knight-idle',
            frames: this.anims.generateFrameNumbers('knight-idle-sheet', { start: 0, end: 9 }),
            frameRate: 8,
            repeat: -1,
        });

        // Slime idle (static - TODO: add proper idle sprites)
        this.anims.create({
            key: 'slime-idle',
            frames: [{ key: 'slime', frame: 0 }],
            frameRate: 1,
        });

        // Slime hurt (flash effect handled in code)
        this.anims.create({
            key: 'slime-hurt',
            frames: [{ key: 'slime', frame: 0 }],
            frameRate: 1,
        });

        // Slime attack (uses idle frames - slime just bounces)
        this.anims.create({
            key: 'slime-attack-anim',
            frames: this.anims.generateFrameNumbers('slime', { start: 0, end: 1 }),
            frameRate: 6,
            repeat: 0,
        });

        // Slime death (simple fade, uses frame 0)
        this.anims.create({
            key: 'slime-death',
            frames: [{ key: 'slime', frame: 0 }],
            frameRate: 1,
        });

        // Purple Demon idle (static - TODO: add proper idle sprites)
        this.anims.create({
            key: 'purple-idle',
            frames: [{ key: 'purple-attack', frame: 0 }],
            frameRate: 1,
        });

        // Purple Demon attack (full sequence 0-11)
        this.anims.create({
            key: 'purple-attack-anim',
            frames: this.anims.generateFrameNumbers('purple-attack', { start: 0, end: 11 }),
            frameRate: 12,
            repeat: 0,
        });

        // Purple Demon hurt (ping-pong: 0,1,2,1,0)
        this.anims.create({
            key: 'purple-hurt',
            frames: [
                { key: 'purple-hit', frame: 0 },
                { key: 'purple-hit', frame: 1 },
                { key: 'purple-hit', frame: 2 },
                { key: 'purple-hit', frame: 1 },
                { key: 'purple-hit', frame: 0 },
            ],
            frameRate: 10,
            repeat: 0,
        });

        // Purple Demon death (frames 3-5)
        this.anims.create({
            key: 'purple-death',
            frames: this.anims.generateFrameNumbers('purple-hit', { start: 3, end: 5 }),
            frameRate: 6,
            repeat: 0,
        });

        // Pink Monster idle (8 frames looping)
        this.anims.create({
            key: 'pink-idle',
            frames: this.anims.generateFrameNumbers('pink-idle', { start: 0, end: 7 }),
            frameRate: 8,
            repeat: -1,
        });

        // Pink Monster attack (6 frames)
        this.anims.create({
            key: 'pink-attack-anim',
            frames: this.anims.generateFrameNumbers('pink-attack', { start: 0, end: 5 }),
            frameRate: 10,
            repeat: 0,
        });

        // Pink Monster hurt (ping-pong through first 3 frames)
        this.anims.create({
            key: 'pink-hurt',
            frames: [
                { key: 'pink-hit', frame: 0 },
                { key: 'pink-hit', frame: 1 },
                { key: 'pink-hit', frame: 2 },
                { key: 'pink-hit', frame: 1 },
                { key: 'pink-hit', frame: 0 },
            ],
            frameRate: 10,
            repeat: 0,
        });

        // Pink Monster death (frames 3-5, falling down)
        this.anims.create({
            key: 'pink-death',
            frames: this.anims.generateFrameNumbers('pink-hit', { start: 3, end: 5 }),
            frameRate: 6,
            repeat: 0,
        });
    }
}

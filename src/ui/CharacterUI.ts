import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';

export class CharacterUI {
    private scene: Phaser.Scene;
    private container!: Phaser.GameObjects.Container;
    private isVisible: boolean = false;
    private gameState: GameStateManager;

    // UI Elements
    private levelText!: Phaser.GameObjects.Text;
    private xpText!: Phaser.GameObjects.Text;
    private hpText!: Phaser.GameObjects.Text;
    private goldText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private attackText!: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.gameState = GameStateManager.getInstance();
        this.createUI();
        this.setupInput();
    }

    private createUI(): void {
        this.container = this.scene.add.container(400, 300).setDepth(1000).setScrollFactor(0).setVisible(false);

        // Background
        const bg = this.scene.add.rectangle(0, 0, 500, 400, 0x222222, 0.95)
            .setStrokeStyle(4, 0x444444);
        this.container.add(bg);

        // Title
        const title = this.scene.add.text(0, -170, 'POSTAVA', {
            fontSize: '32px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(title);

        // Stats Column (Left)
        const leftX = -200;
        const startY = -100;
        const spacing = 40;

        this.levelText = this.createStatText(leftX, startY, 'Úroveň: 1');
        this.xpText = this.createStatText(leftX, startY + spacing, 'XP: 0/100');
        this.hpText = this.createStatText(leftX, startY + spacing * 2, 'HP: 10/10');
        this.goldText = this.createStatText(leftX, startY + spacing * 3, 'Zlato: 0');
        this.statusText = this.createStatText(leftX, startY + spacing * 4, 'Stav: Zdravý');
        this.attackText = this.createStatText(leftX, startY + spacing * 5, 'Útok: 1');

        // Inventory Placeholder (Right)
        const rightX = 50;
        const invTitle = this.scene.add.text(rightX, startY, 'INVENTÁŘ', {
            fontSize: '24px',
            color: '#aaaaaa',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        this.container.add(invTitle);

        // Inventory Grid (Placeholder)
        for (let i = 0; i < 9; i++) {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const slot = this.scene.add.rectangle(
                rightX + 25 + (col * 60),
                startY + 50 + (row * 60),
                50, 50, 0x333333
            ).setStrokeStyle(2, 0x555555);
            this.container.add(slot);
        }

        // Close Button
        const closeBtn = this.scene.add.text(0, 170, 'Zavřít (I)', {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#444444',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => this.toggle());
        this.container.add(closeBtn);
    }

    private createStatText(x: number, y: number, text: string): Phaser.GameObjects.Text {
        const txt = this.scene.add.text(x, y, text, {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0, 0.5);
        this.container.add(txt);
        return txt;
    }

    private setupInput(): void {
        this.scene.input.keyboard!.on('keydown-I', () => {
            this.toggle();
        });

        // Also C for Character
        this.scene.input.keyboard!.on('keydown-C', () => {
            this.toggle();
        });
    }

    public toggle(): void {
        this.isVisible = !this.isVisible;
        this.container.setVisible(this.isVisible);

        if (this.isVisible) {
            this.updateStats();
        }
    }

    private updateStats(): void {
        const player = this.gameState.getPlayer();

        this.levelText.setText(`Úroveň: ${player.level}`);
        this.xpText.setText(`XP: ${player.xp}/${player.xpToNextLevel}`);
        this.hpText.setText(`HP: ${player.hp}/${player.maxHp}`);
        this.goldText.setText(`Zlato: ${player.gold}`);
        this.statusText.setText(`Stav: ${player.status === 'healthy' ? 'Zdravý' : 'Přizabitý'}`);
        this.statusText.setColor(player.status === 'healthy' ? '#00ff00' : '#ff0000');
        this.attackText.setText(`Útok: ${player.attack}`);
    }
}

import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ItemDefinition } from '../types';

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
    private defenseText!: Phaser.GameObjects.Text;

    // Equipment slots
    private equipmentContainer!: Phaser.GameObjects.Container;

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
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(title);

        // Stats Column (Left)
        const leftX = -200;
        const startY = -100;
        const spacing = 35;

        this.levelText = this.createStatText(leftX, startY, 'ÚROVEŇ: 1');
        this.xpText = this.createStatText(leftX, startY + spacing, 'XP: 0/100');
        this.hpText = this.createStatText(leftX, startY + spacing * 2, 'HP: 10/10');
        this.goldText = this.createStatText(leftX, startY + spacing * 3, 'ZLATO: 0');
        this.statusText = this.createStatText(leftX, startY + spacing * 4, 'STAV: ZDRAVÝ');
        this.attackText = this.createStatText(leftX, startY + spacing * 5, 'ÚTOK: 1');
        this.defenseText = this.createStatText(leftX, startY + spacing * 6, 'OBRANA: 0');

        // Equipment Section (Right)
        const rightX = 80;
        const invTitle = this.scene.add.text(rightX, startY, 'VÝBAVA', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(invTitle);

        // Equipment container (will be rebuilt on update)
        this.equipmentContainer = this.scene.add.container(0, 0);
        this.container.add(this.equipmentContainer);

        // Close Button
        const closeBtn = this.scene.add.text(0, 170, 'ZAVŘÍT (I)', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
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
            fontFamily: 'Arial, sans-serif',
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

        this.levelText.setText(`ÚROVEŇ: ${player.level}`);
        this.xpText.setText(`XP: ${player.xp}/${player.xpToNextLevel}`);
        this.hpText.setText(`HP: ${player.hp}/${player.maxHp}`);
        this.goldText.setText(`ZLATO: ${ProgressionSystem.getTotalCoinValue(player.coins)}`);
        this.statusText.setText(`STAV: ${player.status === 'healthy' ? 'ZDRAVÝ' : 'ZRANĚNÝ'}`);
        this.statusText.setColor(player.status === 'healthy' ? '#00ff00' : '#ff0000');
        this.attackText.setText(`ÚTOK: ${player.attack}`);
        this.defenseText.setText(`OBRANA: ${player.defense}`);

        // Update equipment display
        this.updateEquipment();
    }

    private updateEquipment(): void {
        // Clear existing equipment display
        this.equipmentContainer.removeAll(true);

        const player = this.gameState.getPlayer();
        const items = this.scene.cache.json.get('items') as ItemDefinition[];

        const rightX = 80;
        const startY = -60;
        const slotSpacing = 70;

        // Equipment slots
        const slots = [
            { label: 'MEČ', itemId: player.equippedWeapon, type: 'weapon' },
            { label: 'ŠTÍT', itemId: player.equippedShield, type: 'shield' },
            { label: 'HELMA', itemId: player.equippedHelmet, type: 'helmet' },
        ];

        slots.forEach((slot, index) => {
            const y = startY + index * slotSpacing;

            // Slot background
            const bg = this.scene.add.rectangle(rightX, y, 55, 55, 0x333333)
                .setStrokeStyle(2, 0x555555);
            this.equipmentContainer.add(bg);

            // Label
            const label = this.scene.add.text(rightX, y - 35, slot.label, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#888888',
            }).setOrigin(0.5);
            this.equipmentContainer.add(label);

            // Item icon or empty
            if (slot.itemId) {
                const item = items.find(i => i.id === slot.itemId);
                if (item && item.spriteKey) {
                    const icon = this.scene.add.image(rightX, y, item.spriteKey, item.iconFrame);
                    if (slot.type === 'weapon') {
                        icon.setDisplaySize(35, 50);
                    } else {
                        icon.setDisplaySize(45, 45);
                    }
                    this.equipmentContainer.add(icon);

                    // Item name below
                    const name = this.scene.add.text(rightX + 45, y, item.name.toUpperCase(), {
                        fontSize: '14px',
                        fontFamily: 'Arial, sans-serif',
                        color: '#aaffaa',
                    }).setOrigin(0, 0.5);
                    this.equipmentContainer.add(name);
                }
            } else {
                const empty = this.scene.add.text(rightX, y, '—', {
                    fontSize: '20px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#555555',
                }).setOrigin(0.5);
                this.equipmentContainer.add(empty);

                const emptyText = this.scene.add.text(rightX + 45, y, 'PRÁZDNÉ', {
                    fontSize: '14px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#666666',
                }).setOrigin(0, 0.5);
                this.equipmentContainer.add(emptyText);
            }
        });
    }
}

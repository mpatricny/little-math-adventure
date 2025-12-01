import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';

export class WitchHutScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private healCost: number = 10;

    constructor() {
        super({ key: 'WitchHutScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();

        // Background Image
        this.add.image(400, 300, 'witch-hut-interior').setDisplaySize(800, 600);

        // Semi-transparent overlay for readability
        this.add.rectangle(400, 300, 800, 600, 0x000000, 0.4);

        // Title
        this.add.text(400, 50, 'CHALOUPKA ČARODĚJNICE', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa55ff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Player Stats
        this.add.text(200, 400, `HP: ${player.hp}/${player.maxHp}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff5555'
        }).setOrigin(0.5);

        this.add.text(600, 400, `ZLATO: ${player.gold}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700'
        }).setOrigin(0.5);

        // Status Text
        const statusColor = player.status === 'healthy' ? '#00ff00' : '#ff0000';
        const statusText = player.status === 'healthy' ? 'ZDRAVÝ' : 'ZRANĚNÝ!';
        this.add.text(400, 350, `STAV: ${statusText}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: statusColor,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Heal Button
        this.createHealButton(player);

        // Leave Button
        this.createLeaveButton();
    }

    private createHealButton(player: any): void {
        const canHeal = player.hp < player.maxHp || player.status === 'přizabitý';

        // Free healing if HP <= 3
        const currentCost = player.hp <= 3 ? 0 : this.healCost;

        const canAfford = player.gold >= currentCost;
        const btnColor = (canHeal && canAfford) ? 0x00aa00 : 0x555555;

        const button = this.add.container(400, 480);

        const bg = this.add.rectangle(0, 0, 200, 60, btnColor)
            .setStrokeStyle(2, 0xffffff);

        const costText = currentCost === 0 ? 'ZDARMA' : `${currentCost} ZLATA`;
        const text = this.add.text(0, 0, `VYLÉČIT (${costText})`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        button.add([bg, text]);

        if (canHeal && canAfford) {
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0x00cc00))
                .on('pointerout', () => bg.setFillStyle(0x00aa00))
                .on('pointerdown', () => this.healPlayer(currentCost));
        } else {
            button.setAlpha(0.7);
            if (!canHeal) text.setText('JSI ZDRAVÝ');
            else if (!canAfford) text.setText('NEDOSTATEK ZLATA');
        }
    }

    private createLeaveButton(): void {
        const button = this.add.container(400, 550);

        const bg = this.add.rectangle(0, 0, 200, 50, 0x444444)
            .setStrokeStyle(2, 0xffffff);

        const text = this.add.text(0, 0, 'ODEJÍT', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        button.add([bg, text]);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x666666))
            .on('pointerout', () => bg.setFillStyle(0x444444))
            .on('pointerdown', () => this.scene.start('TownScene'));
    }

    private healPlayer(cost: number): void {
        const player = this.gameState.getPlayer();
        const success = ProgressionSystem.heal(player, cost);

        if (success) {
            this.gameState.save();
            this.scene.restart(); // Refresh UI
        }
    }
}

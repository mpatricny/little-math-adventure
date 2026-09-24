import Phaser from 'phaser';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GameStateManager } from '../systems/GameStateManager';

/**
 * Reusable co-op player switch UI component.
 * Shows a player name label + "Switch" button next to the Back button.
 * Used in all building scenes (Shop, Guild, Workshop, Forge).
 *
 * Only visible when co-op mode is active.
 */
export class CoopSwitchUI {
    private container: Phaser.GameObjects.Container;
    private nameText: Phaser.GameObjects.Text;
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        const coop = CoopSessionManager.getInstance();

        if (!coop.isCoopActive()) {
            // Not in co-op — create invisible placeholder
            this.container = scene.add.container(x, y).setVisible(false);
            this.nameText = scene.add.text(0, 0, '').setVisible(false);
            return;
        }

        const playerName = GameStateManager.getInstance().getPlayer().name || 'Hráč';

        // Background panel
        const bg = scene.add.rectangle(0, 0, 260, 45, 0x16213e, 0.9)
            .setStrokeStyle(2, 0x4466aa);

        // Player name
        this.nameText = scene.add.text(-50, 0, playerName, {
            fontSize: '18px', fontFamily: 'Arial, sans-serif',
            color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);

        // Switch button
        const switchBg = scene.add.rectangle(80, 0, 90, 35, 0x886600, 0.9)
            .setStrokeStyle(1, 0xffcc00)
            .setInteractive({ useHandCursor: true });

        const switchText = scene.add.text(80, 0, 'Vyměnit', {
            fontSize: '14px', fontFamily: 'Arial, sans-serif',
            color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);

        switchBg.on('pointerdown', () => {
            // Swap to the other player and restart the scene
            const activePlayer = coop.getActivePlayer();
            if (activePlayer === 'A') {
                coop.activatePlayerB();
            } else {
                coop.activatePlayerA();
            }
            scene.scene.restart();
        });

        switchBg.on('pointerover', () => switchBg.setFillStyle(0xaa8800));
        switchBg.on('pointerout', () => switchBg.setFillStyle(0x886600));

        this.container = scene.add.container(x, y, [bg, this.nameText, switchBg, switchText]);
        this.container.setDepth(200);
    }

    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }
}

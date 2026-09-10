import Phaser from 'phaser';
import type { WaterHost } from './UnderwaterUI';
import { waterArtwork } from './UnderwaterTheme';

/** The actual forest SpinLock artwork and masked two-phase drum animation. */
export class UnderwaterSpinWheel {
    readonly root: Phaser.GameObjects.Container;
    readonly label: Phaser.GameObjects.Text;
    animating = false;

    constructor(private scene: Phaser.Scene, modal: Phaser.GameObjects.Container, private host: WaterHost & { id: string },
        position: 'left' | 'middle' | 'right', value: string, onTurn: (step: number) => void) {
        this.root = scene.add.container(0, 0).setDepth(host.depth).setName(host.id);
        const artHost = { ...host, width: host.height };
        const frame = waterArtwork(scene, `underwater-lock-${position}`, artHost);
        this.root.add(frame);
        const roller = scene.add.container(0, 0).setDepth(host.depth + 1);
        const plate = waterArtwork(scene, 'underwater-lock-drum', artHost);
        this.label = scene.add.text(host.x, host.y, value, {
            resolution: 2, fontFamily: 'Georgia', fontSize: '32px', color: '#302619',
        }).setOrigin(0.5).setName(`${host.id}-letter`);
        roller.add([plate, this.label]);
        const maskGraphics = scene.make.graphics();
        maskGraphics.fillStyle(0xffffff).fillRect(host.x - host.height * 0.245, host.y - host.height * 0.26, host.height * 0.49, host.height * 0.52);
        const mask = maskGraphics.createGeometryMask(); roller.setMask(mask);
        const hit = scene.add.container(host.x, host.y).setSize(host.width, host.height * 0.85)
            .setInteractive({ useHandCursor: true }).setData('waterControl', true);
        this.root.add(hit);
        hit.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.animating) onTurn(p.worldY < host.y - 18 ? -1 : 1); });
        hit.on('pointerover', () => frame.setAlpha(0.9));
        hit.on('pointerout', () => frame.setAlpha(1));
        hit.setData('roller', roller); hit.setData('plate', plate);
        this.root.setData('roller', roller); this.root.setData('plate', plate);
        modal.once('destroy', () => {
            scene.tweens.killTweensOf([plate, this.label]);
            this.root.destroy(); roller.destroy(); mask.destroy(); maskGraphics.destroy();
        });
    }

    turn(value: string, step: number): void {
        if (this.animating) return;
        this.animating = true;
        const plate = this.root.getData('plate') as Phaser.GameObjects.Image;
        const original = this.host.y, distance = this.host.height * 0.56 * step;
        this.scene.tweens.killTweensOf([plate, this.label]);
        this.scene.tweens.add({ targets: [plate, this.label], y: original + distance, duration: 100, ease: 'Power2',
            onComplete: () => {
                this.label.setText(value).setColor('#302619');
                plate.y = this.label.y = original - distance * 0.4;
                this.scene.tweens.add({ targets: [plate, this.label], y: original, duration: 90, ease: 'Power2',
                    onComplete: () => { this.animating = false; } });
            } });
    }
}

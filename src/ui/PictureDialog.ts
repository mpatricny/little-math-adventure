import Phaser from 'phaser';
import { gameAudio } from '../audio/AudioDirector';
import { SceneBuilder } from '../systems/SceneBuilder';
import { waterHost } from './SceneLayoutHost';
import { GuideConfirmButton, blockGuidePointer } from './GuideConfirmButton';
import { createImageNineSlice } from './MedievalPanel';

export interface DialogContentItem {
    type: 'image' | 'sprite' | 'icon' | 'arrow';
    key?: string;
    frame?: number;
    scale?: number;
    text?: string;
    tint?: number;
}

export interface PictureDialogConfig {
    voiceId?: string;
    content: DialogContentItem[];
    onDismiss?: () => void;
}

/** Picture-led storytelling with one explicit acknowledgement. The overlay is
 * an input shield, never an alternate dismiss target. Audio is optional.
 */
export class PictureDialog {
    private readonly container: Phaser.GameObjects.Container;
    private readonly confirm: GuideConfirmButton;
    private readonly layout: SceneBuilder;
    private timers: Phaser.Time.TimerEvent[] = [];
    private tweens: Phaser.Tweens.Tween[] = [];
    private closing = false;
    private destroyed = false;

    constructor(private readonly scene: Phaser.Scene, private readonly config: PictureDialogConfig) {
        this.layout = new SceneBuilder(scene);
        this.layout.buildScene('PictureDialogOverlay');
        const shield = waterHost(this.layout, 'pictureDialogShieldHost');
        const panel = waterHost(this.layout, 'pictureDialogPanelHost');
        const contentHost = waterHost(this.layout, 'pictureDialogContentHost');
        this.container = scene.add.container(0, 0).setDepth(shield.depth).setName('pictureDialog');
        this.container.setData('safeArea', waterHost(this.layout, 'pictureDialogSafeAreaHost'));
        this.container.add(blockGuidePointer(scene.add.rectangle(shield.x, shield.y, shield.width, shield.height, 0x08080d, 0.75)));
        // This is the existing authored nine-slice, so its ornaments retain shape.
        const frame = createImageNineSlice(scene, panel.x, panel.y, panel.width, panel.height,
            '991bb46f-0417-4c22-8e3e-04cea0a3079a', { left: 41, right: 57, top: 45, bottom: 50 })
            .setName('pictureDialogFrame');
        this.container.add(frame);
        const pictures = scene.add.container(contentHost.x, contentHost.y).setName('pictureDialogContent');
        this.container.add(pictures);
        const entries = config.content.map(item => this.createItem(item));
        const naturalWidth = entries.reduce((total, item) => total + item.width, 0) + Math.max(0, entries.length - 1) * 28;
        const naturalHeight = Math.max(1, ...entries.map(item => item.height));
        const fit = Math.min(1, contentHost.width / Math.max(1, naturalWidth), contentHost.height / naturalHeight);
        let x = -naturalWidth * fit / 2;
        entries.forEach(({ object, width }, i) => {
            object.setScale(object.scaleX * fit).setPosition(x + width * fit / 2, 0).setAlpha(0);
            pictures.add(object);
            x += (width + 28) * fit;
            this.tweens.push(scene.tweens.add({ targets: object, alpha: 1, delay: 180 + i * 280, duration: 350 }));
        });
        this.confirm = new GuideConfirmButton(scene, {
            ...waterHost(this.layout, 'pictureDialogConfirmHost'), name: 'pictureDialogConfirm', enabled: false,
            onConfirm: () => this.dismiss(),
        });
        this.container.add(this.confirm.root);
        this.timers.push(scene.time.delayedCall(650 + entries.length * 280, () => {
            if (!this.destroyed && !this.closing) this.confirm.setEnabled(true);
        }));
        if (config.voiceId) void gameAudio().speak(config.voiceId, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    private createItem(item: DialogContentItem): {
        object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
        width: number; height: number;
    } {
        let object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
        if ((item.type === 'image' || item.type === 'sprite') && item.key && this.scene.textures.exists(item.key)) {
            object = item.type === 'sprite'
                ? this.scene.add.sprite(0, 0, item.key, item.frame ?? 0)
                : this.scene.add.image(0, 0, item.key);
            object.setScale(item.scale ?? 0.5);
            if (item.tint !== undefined) object.setTint(item.tint);
        } else {
            object = this.scene.add.text(0, 0, item.type === 'arrow' ? '→' : item.text ?? '✦', {
                resolution: 2, fontFamily: 'Arial, sans-serif', fontSize: item.type === 'arrow' ? '64px' : '52px',
                fontStyle: 'bold', color: '#b9edff', stroke: '#122031', strokeThickness: 2,
            }).setOrigin(0.5);
        }
        return { object, width: object.displayWidth, height: object.displayHeight };
    }

    dismiss(): void {
        if (this.destroyed || this.closing) return;
        this.closing = true;
        this.confirm.setEnabled(false);
        this.stopMotion();
        this.tweens.push(this.scene.tweens.add({ targets: this.container, alpha: 0, duration: 160,
            onComplete: () => {
                if (this.destroyed) return;
                this.destroy();
                this.config.onDismiss?.();
            } }));
    }

    private stopMotion(): void {
        gameAudio().cancel(this);
        this.timers.forEach(timer => timer.remove()); this.timers = [];
        this.tweens.forEach(tween => tween.remove()); this.tweens = [];
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stopMotion();
        this.confirm.destroy();
        this.container.destroy(true);
        for (const id of ['pictureDialogShieldHost', 'pictureDialogPanelHost', 'pictureDialogSafeAreaHost', 'pictureDialogContentHost', 'pictureDialogConfirmHost']) {
            this.layout.get(id)?.destroy();
        }
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    isVisible(): boolean { return !this.destroyed && !this.closing; }
    getContainer(): Phaser.GameObjects.Container { return this.container; }
}

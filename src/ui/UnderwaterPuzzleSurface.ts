import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { UnderwaterUI, waterHost, type WaterHost } from './UnderwaterUI';
import { fitWaterText } from './UnderwaterTheme';
import { waterPearl } from './UnderwaterPearls';

/** Shared lifecycle for authored water puzzles, including cancellation during animation. */
export class UnderwaterPuzzleSurface {
    readonly builder: SceneBuilder;
    readonly modal: Phaser.GameObjects.Container;
    private timers: Phaser.Time.TimerEvent[] = [];
    private tweens: Phaser.Tweens.Tween[] = [];

    constructor(readonly scene: Phaser.Scene, readonly ui: UnderwaterUI, layout: string) {
        ui.open(''); this.modal = ui.modal!;
        this.builder = new SceneBuilder(scene); this.builder.buildScene(layout);
        this.modal.once('destroy', () => {
            this.timers.forEach(timer => timer.remove(false));
            this.tweens.forEach(tween => tween.remove());
            scene.cache.json.get('scenes').scenes[layout].elements.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }
    host(id: string): WaterHost { return waterHost(this.builder, id); }
    label(id: string, value: string, size = 25, color = '#e9fff0'): Phaser.GameObjects.Text {
        const host = this.host(id);
        const text = this.scene.add.text(host.x, host.y, value, {
            resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color, align: 'center',
        }).setOrigin(0.5).setDepth(host.depth).setName(id);
        fitWaterText(text, host, size); this.modal.add(text); return text;
    }
    later(delay: number, callback: () => void): void { this.timers.push(this.scene.time.delayedCall(delay, callback)); }
    tween(config: Phaser.Types.Tweens.TweenBuilderConfig): void { this.tweens.push(this.scene.tweens.add(config)); }
    conduit(paths: Phaser.Curves.Path[], depth: number): Phaser.GameObjects.Graphics {
        const graphic = this.scene.add.graphics().setDepth(depth);
        paths.forEach(path => {
            graphic.lineStyle(17, 0x071e29, 0.95); path.draw(graphic);
            graphic.lineStyle(11, 0x658f8e); path.draw(graphic);
            graphic.lineStyle(5, 0x173f50); path.draw(graphic);
            [0.15, 0.5, 0.85].forEach(t => {
                const point = path.getPoint(t), direction = path.getTangent(t);
                graphic.lineStyle(2, 0xcbe8dc, 0.8).beginPath()
                    .moveTo(point.x - 5 * direction.x + 4 * direction.y, point.y - 5 * direction.y - 4 * direction.x)
                    .lineTo(point.x + 3 * direction.x, point.y + 3 * direction.y)
                    .lineTo(point.x - 5 * direction.x - 4 * direction.y, point.y - 5 * direction.y + 4 * direction.x).strokePath();
            });
        });
        this.modal.add(graphic); return graphic;
    }
    flow(path: Phaser.Curves.Path, duration: number, color = 0x9fffe4, update?: (fraction: number) => void): void {
        const root = this.scene.add.container(0, 0).setDepth(809);
        root.add([this.scene.add.circle(0, 0, 18, color, 0.2), waterPearl(this.scene, 0, 0, 25)]);
        this.modal.add(root); this.modal.sort('depth');
        this.tweens.push(this.scene.tweens.addCounter({ from: 0, to: 1, duration,
            onUpdate: tween => {
                const fraction = tween.getValue() ?? 0, point = path.getPoint(fraction);
                root.setPosition(point.x, point.y); update?.(fraction);
            }, onComplete: () => root.destroy() }));
    }
}

export const signedWaterValue = (value: number): string => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;

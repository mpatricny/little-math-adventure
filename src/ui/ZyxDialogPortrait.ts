import type Phaser from 'phaser';
import type { WaterHost } from './SceneLayoutHost';

/** Mean alpha-weighted centre of all 30 idle frames on their shared 341px canvas.
 * The portrait host represents the visible character centre, not empty canvas.
 * Keep one origin for the complete animation: per-frame recentering would erase
 * its authored lean and wave. Measurements are recorded in the R2 revision audit.
 */
const ZYX_OPTICAL_ORIGIN = { x: 168.3677 / 341, y: 182.7697 / 341 };

export function createZyxDialogPortrait(scene: Phaser.Scene, host: WaterHost): Phaser.GameObjects.Sprite {
    const portrait = scene.add.sprite(host.x, host.y, 'spritesheet-zyx-transparent2-sheet', 0)
        .setName('zyxDialogPortrait').setDepth(host.depth)
        .setOrigin(ZYX_OPTICAL_ORIGIN.x, ZYX_OPTICAL_ORIGIN.y);
    portrait.setScale(Math.min(host.width / portrait.width, host.height / portrait.height));
    if (scene.anims.exists('zyx-idle')) portrait.play('zyx-idle');
    return portrait;
}

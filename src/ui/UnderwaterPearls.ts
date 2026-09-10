import type Phaser from 'phaser';
import { waterArtwork } from './UnderwaterTheme';

/** One canonical nacre sprite for inventory, motion and progress; glow is a separate layer. */
export function waterPearl(scene: Phaser.Scene, x: number, y: number, size: number) {
    return waterArtwork(scene, 'underwater-pearl-nacre', { x, y, width: size, height: size });
}

import type Phaser from 'phaser';
import type { TexturesFile } from '../types/assets';

/** Cards use the original first frame; live actors keep their animation sheet. */
export function actorPortraitKey(scene: Phaser.Scene, spriteKey: string): string {
    const catalog = scene.cache.json.get('textures') as TexturesFile;
    const portrait = spriteKey + '-portrait';
    return catalog.images[portrait] ? portrait : spriteKey;
}

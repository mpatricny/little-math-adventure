import type Phaser from 'phaser';

export type WaterBox = { x: number; y: number; width: number; height: number; depth?: number };

/** Complete artwork always keeps its source aspect ratio. */
export function waterArtwork(scene: Phaser.Scene, texture: string, box: WaterBox): Phaser.GameObjects.Image {
    const image = scene.add.image(box.x, box.y, texture).setDepth(box.depth ?? 0);
    image.setScale(Math.min(box.width / image.width, box.height / image.height));
    image.setData('waterArtwork', true);
    return image;
}

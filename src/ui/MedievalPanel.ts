import Phaser from 'phaser';

/** Deliberate nine-slice of the canonical hero frame, using Images for Canvas + WebGL parity.
 * Corner plates keep their proportions; only the center and straight rails expand.
 * Content must stay at least `corner + 8` pixels inside the outer bounds.
 */
export function createMedievalPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, corner = 32): Phaser.GameObjects.Container {
    return createImageNineSlice(scene, x, y, width, height, 'Select_hero_frame-cropped',
        { left: 200, right: 200, top: 200, bottom: 200 },
        { left: corner, right: corner, top: corner, bottom: corner });
}

type SliceInsets = { left: number; right: number; top: number; bottom: number };

/** The same authored nine-slice geometry in both renderers. Phaser's native
 * NineSlice has no Canvas renderer, so keep the nine pieces as ordinary Images.
 */
export function createImageNineSlice(scene: Phaser.Scene, x: number, y: number, width: number, height: number,
    key: string, sourceInsets: SliceInsets, displayInsets = sourceInsets): Phaser.GameObjects.Container {
    const texture = scene.textures.get(key);
    const source = texture.getSourceImage() as HTMLImageElement;
    const xs = [0, sourceInsets.left, source.width - sourceInsets.right, source.width];
    const ys = [0, sourceInsets.top, source.height - sourceInsets.bottom, source.height];
    const dx = [-width / 2, -width / 2 + displayInsets.left, width / 2 - displayInsets.right, width / 2];
    const dy = [-height / 2, -height / 2 + displayInsets.top, height / 2 - displayInsets.bottom, height / 2];
    const root = scene.add.container(x, y);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const name = `panel-${sourceInsets.left}-${sourceInsets.right}-${sourceInsets.top}-${sourceInsets.bottom}-${row}-${col}`;
        if (!texture.has(name)) texture.add(name, 0, xs[col], ys[row], xs[col + 1] - xs[col], ys[row + 1] - ys[row]);
        root.add(scene.add.image(dx[col], dy[row], key, name).setOrigin(0)
            .setDisplaySize(dx[col + 1] - dx[col], dy[row + 1] - dy[row]));
    }
    root.setSize(width, height);
    return root;
}

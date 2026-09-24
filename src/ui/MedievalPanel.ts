import Phaser from 'phaser';

/** Deliberate nine-slice of the canonical hero frame, using Images for Canvas + WebGL parity.
 * Corner plates keep their proportions; only the center and straight rails expand.
 * Content must stay at least `corner + 8` pixels inside the outer bounds.
 */
export function createMedievalPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, corner = 32): Phaser.GameObjects.Container {
    const key = 'Select_hero_frame-cropped';
    const texture = scene.textures.get(key);
    const source = texture.getSourceImage() as HTMLImageElement;
    const cap = 200;
    const xs = [0, cap, source.width - cap, source.width];
    const ys = [0, cap, source.height - cap, source.height];
    const dx = [-width / 2, -width / 2 + corner, width / 2 - corner, width / 2];
    const dy = [-height / 2, -height / 2 + corner, height / 2 - corner, height / 2];
    const root = scene.add.container(x, y);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const name = `guide-panel-${row}-${col}`;
        if (!texture.has(name)) texture.add(name, 0, xs[col], ys[row], xs[col + 1] - xs[col], ys[row + 1] - ys[row]);
        root.add(scene.add.image(dx[col], dy[row], key, name).setOrigin(0)
            .setDisplaySize(dx[col + 1] - dx[col], dy[row + 1] - dy[row]));
    }
    root.setSize(width, height);
    return root;
}

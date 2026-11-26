import Phaser from 'phaser';

type Body = { left: number; top: number; right: number; bottom: number };
type CanonicalBody = Body & { mirrorX: number; mirrorY: number };
const bodies = new WeakMap<Phaser.Textures.Texture, Map<string | number, Body>>();

/** Measure the canonical idle silhouette once. Transparent video padding must
 * not become extra distance between a creature and its health bar/effects. */
export function captureBattleBody(sprite: Phaser.GameObjects.Sprite): CanonicalBody {
    const saved = sprite.getData('battleBody') as CanonicalBody | undefined;
    if (saved) return saved;
    const frame = sprite.frame, texture = sprite.texture;
    let frames = bodies.get(texture);
    if (!frames) { frames = new Map(); bodies.set(texture, frames); }
    let pixels = frames.get(frame.name);
    if (!pixels) {
        const canvas = document.createElement('canvas');
        canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY,
            frame.cutWidth, frame.cutHeight, 0, 0, canvas.width, canvas.height);
        const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Ignore disconnected bubbles, motes and detached shadows. They belong
        // to the animation, not to the creature's head or health-bar anchor.
        const width = canvas.width, height = canvas.height;
        const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
        let largest = 0;
        pixels = { left: 0, top: 0, right: sprite.width, bottom: sprite.height };
        for (let start = 0; start < seen.length; start++) {
            if (seen[start] || alpha[start * 4 + 3] < 32) continue;
            let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0;
            queue[0] = start; seen[start] = 1;
            const visit = (index: number) => {
                if (!seen[index] && alpha[index * 4 + 3] >= 32) { seen[index] = 1; queue[tail++] = index; }
            };
            while (head < tail) {
                const index = queue[head++], x = index % width, y = Math.floor(index / width);
                left = Math.min(left, x); right = Math.max(right, x + 1);
                top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
                if (x > 0) visit(index - 1);
                if (x < width - 1) visit(index + 1);
                if (y > 0) visit(index - width);
                if (y < height - 1) visit(index + width);
            }
            if (tail > largest) { largest = tail; pixels = { left, top, right, bottom }; }
        }
        frames.set(frame.name, pixels);
    }
    const body = { left: pixels.left + frame.x - sprite.displayOriginX,
        right: pixels.right + frame.x - sprite.displayOriginX,
        top: pixels.top + frame.y - sprite.displayOriginY,
        bottom: pixels.bottom + frame.y - sprite.displayOriginY,
        mirrorX: frame.customPivot ? 0 : frame.realWidth - 2 * sprite.displayOriginX,
        mirrorY: frame.customPivot ? 0 : frame.realHeight - 2 * sprite.displayOriginY };
    sprite.setData('battleBody', body);
    return body;
}

export function battleBodyBounds(sprite: Phaser.GameObjects.Sprite): Phaser.Geom.Rectangle {
    const b = captureBattleBody(sprite), matrix = sprite.getWorldTransformMatrix();
    // Phaser applies flip in its renderer, outside getWorldTransformMatrix().
    const left = sprite.flipX ? b.mirrorX - b.right : b.left;
    const right = sprite.flipX ? b.mirrorX - b.left : b.right;
    const top = sprite.flipY ? b.mirrorY - b.bottom : b.top;
    const bottom = sprite.flipY ? b.mirrorY - b.top : b.bottom;
    const corners = [matrix.transformPoint(left, top), matrix.transformPoint(right, top),
        matrix.transformPoint(left, bottom), matrix.transformPoint(right, bottom)];
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    return new Phaser.Geom.Rectangle(x, y, Math.max(...corners.map(p => p.x)) - x,
        Math.max(...corners.map(p => p.y)) - y);
}

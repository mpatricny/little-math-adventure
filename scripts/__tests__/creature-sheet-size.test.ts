import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';

type Sheet = { path: string; frameWidth: number; frameHeight: number; frameCount?: number };
const catalog: { spritesheets: Record<string, Sheet> } = JSON.parse(await fs.readFile('public/assets/data/textures.json', 'utf8'));
const pathFor = (path: string) => `public/assets/${path.startsWith('library:') ? `library/${path.slice(8)}` : path}`;

test('all registered spritesheets fit the supported GPU budget, with a stricter underwater budget', async () => {
    // Includes NPCs and existing non-underwater atlases, not only the two new species.
    for (const [key, sheet] of Object.entries(catalog.spritesheets)) {
        const image = await sharp(pathFor(sheet.path)).metadata();
        assert.ok(image.width && image.height, `${key}: missing image dimensions`);
        const limit = key.startsWith('silverpond-') ? 2048 : 4096;
        assert.ok(image.width <= limit && image.height <= limit,
            `${key}: ${image.width}×${image.height} exceeds ${limit}px; decode/exists() cannot detect GPU upload failure`);
        // Older non-underwater sheets may deliberately include margins/spacing.
        if (key.startsWith('silverpond-')) {
            assert.equal(image.width % sheet.frameWidth, 0, `${key}: incomplete frame column`);
            assert.equal(image.height % sheet.frameHeight, 0, `${key}: incomplete frame row`);
            if (sheet.frameCount) assert.ok(sheet.frameCount <= image.width / sheet.frameWidth * image.height / sheet.frameHeight, key);
        }
    }
});

for (const prefix of ['armored-seahorse', 'rune-nautilus']) for (const action of ['idle', 'attack', 'defend', 'defeat']) {
    test(`${prefix}/${action}: packed frame order and every RGBA pixel equal the approved source`, async () => {
        const sheet = catalog.spritesheets[`silverpond-${prefix}-${action}-sheet`];
        assert.match(sheet.path, /-gpu2048\.webp$/, 'new URL must bypass cached oversized sheets');
        const sourcePath = pathFor(sheet.path.replace('-gpu2048.webp', '.webp'));
        const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const packed = await sharp(pathFor(sheet.path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const originalColumns = source.info.width / 512, columns = packed.info.width / 512;
        assert.ok(sheet.frameCount, 'complete frame count is required');
        for (let frame = 0; frame < sheet.frameCount; frame++) for (let y = 0; y < 512; y++) {
            const from = ((Math.floor(frame / originalColumns) * 512 + y) * source.info.width + frame % originalColumns * 512) * 4;
            const to = ((Math.floor(frame / columns) * 512 + y) * packed.info.width + frame % columns * 512) * 4;
            assert.deepEqual(packed.data.subarray(to, to + 512 * 4), source.data.subarray(from, from + 512 * 4), `${prefix}/${action}/${frame}/${y}`);
        }
    });
}

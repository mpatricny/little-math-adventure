import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url).pathname;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'public/assets/data', name + '.json'), 'utf8'));
const catalog = read('textures');
const actors = [...read('pets'), ...read('enemies')];

test('every static actor portrait preserves the source first frame size, alpha and visible pixels', async () => {
    for (const key of new Set(actors.map(actor => actor.spriteKey))) {
        const sheet = catalog.spritesheets[key];
        if (!sheet) continue;
        assert.ok(catalog.images[key + '-portrait'], key);
        const source = sheet.path.startsWith('library:') ? 'library/' + sheet.path.slice(8) : sheet.path;
        const original = await sharp(path.join(root, 'public/assets', source))
            .extract({ left: 0, top: 0, width: sheet.frameWidth, height: sheet.frameHeight }).ensureAlpha().raw().toBuffer();
        const portrait = sharp(path.join(root, 'public/assets', catalog.images[key + '-portrait']));
        const metadata = await portrait.metadata();
        assert.equal(metadata.width, sheet.frameWidth, key);
        assert.equal(metadata.height, sheet.frameHeight, key);
        const pixels = await portrait.ensureAlpha().raw().toBuffer();
        for (let i = 0; i < original.length; i += 4) {
            assert.equal(pixels[i + 3], original[i + 3], `${key} alpha ${i}`);
            if (original[i + 3]) {
                assert.equal(pixels[i], original[i], `${key} red ${i}`);
                assert.equal(pixels[i + 1], original[i + 1], `${key} green ${i}`);
                assert.equal(pixels[i + 2], original[i + 2], `${key} blue ${i}`);
            }
        }
    }
});

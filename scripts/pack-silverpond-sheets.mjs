import fs from 'node:fs';
import sharp from 'sharp';

/** Preserve every approved video frame pixel and index while fitting small WebGL devices. */
const catalogPath = 'public/assets/data/textures.json';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
for (const [key, sheet] of Object.entries(catalog.spritesheets)) {
    if (!key.startsWith('silverpond-')) continue;
    const filename = `public/assets/${sheet.path}`;
    const { data, info } = await sharp(filename).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width <= 2048 && info.height <= 2048) continue;
    const oldColumns = info.width / sheet.frameWidth;
    const count = sheet.frameCount ?? oldColumns * info.height / sheet.frameHeight;
    if (!Number.isInteger(oldColumns) || !Number.isInteger(count)) throw new Error(`Invalid sheet ${key}`);
    const columns = Math.min(count, 4), rows = Math.ceil(count / columns);
    const width = columns * sheet.frameWidth, height = rows * sheet.frameHeight;
    const packed = Buffer.alloc(width * height * 4);
    for (let frame = 0; frame < count; frame++) {
        for (let y = 0; y < sheet.frameHeight; y++) {
            const from = ((Math.floor(frame / oldColumns) * sheet.frameHeight + y) * info.width
                + frame % oldColumns * sheet.frameWidth) * 4;
            const to = ((Math.floor(frame / columns) * sheet.frameHeight + y) * width
                + frame % columns * sheet.frameWidth) * 4;
            data.copy(packed, to, from, from + sheet.frameWidth * 4);
        }
    }
    const temporary = filename.replace(/\.webp$/, '.packed.webp');
    await sharp(packed, { raw: { width, height, channels: 4 } })
        .webp({ lossless: true, effort: 4 }).toFile(temporary);
    const output = await sharp(temporary).ensureAlpha().raw().toBuffer();
    // WebP may discard invisible RGB. Every visible pixel must remain unchanged.
    for (let i = 0; i < packed.length; i += 4) {
        if (packed[i + 3] !== output[i + 3] || (packed[i + 3] > 0
            && (packed[i] !== output[i] || packed[i + 1] !== output[i + 1] || packed[i + 2] !== output[i + 2]))) {
            throw new Error(`Frame pixels changed: ${key}`);
        }
    }
    fs.renameSync(temporary, filename);
    sheet.frameCount = count;
    console.log(`${key}: ${info.width}×${info.height} → ${width}×${height}; ${count} frames, visible pixels identical`);
}
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 4) + '\n');

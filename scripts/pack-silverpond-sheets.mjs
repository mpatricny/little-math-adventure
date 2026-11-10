import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

/** Repack approved frames, including invisible RGB, without resizing or re-encoding lossily. */
const catalogPath = 'public/assets/data/textures.json';
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const receiptPath = process.argv[2] ?? 'artifacts/underwater/sheet-packing.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { limit: 2048, framesPreserved: 'exact decoded RGBA, row-major order', sheets: {} };
for (const [key, sheet] of Object.entries(catalog.spritesheets)) {
    if (!key.startsWith('silverpond-')) continue;
    const filename = `public/assets/${sheet.path}`;
    const source = await fs.readFile(filename);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width <= 2048 && info.height <= 2048) continue;
    const oldColumns = info.width / sheet.frameWidth;
    const count = sheet.frameCount ?? oldColumns * info.height / sheet.frameHeight;
    if (!Number.isInteger(oldColumns) || !Number.isInteger(count)) throw new Error(`Invalid sheet ${key}`);
    const columns = Math.min(count, Math.floor(2048 / sheet.frameWidth)), rows = Math.ceil(count / columns);
    const width = columns * sheet.frameWidth, height = rows * sheet.frameHeight;
    if (!columns || height > 2048) throw new Error(`Needs multiple atlases: ${key}`);
    const packed = Buffer.alloc(width * height * 4);
    const frameHashes = [];
    for (let frame = 0; frame < count; frame++) {
        const pixels = Buffer.alloc(sheet.frameWidth * sheet.frameHeight * 4);
        for (let y = 0; y < sheet.frameHeight; y++) {
            const from = ((Math.floor(frame / oldColumns) * sheet.frameHeight + y) * info.width
                + frame % oldColumns * sheet.frameWidth) * 4;
            const to = ((Math.floor(frame / columns) * sheet.frameHeight + y) * width
                + frame % columns * sheet.frameWidth) * 4;
            data.copy(packed, to, from, from + sheet.frameWidth * 4);
            data.copy(pixels, y * sheet.frameWidth * 4, from, from + sheet.frameWidth * 4);
        }
        frameHashes.push(hash(pixels));
    }
    // A new URL evicts cached oversized images. Keep the approved source immutable.
    const destination = filename.replace(/\.webp$/, '-gpu2048.webp');
    const encoded = await sharp(packed, { raw: { width, height, channels: 4 } })
        .webp({ lossless: true, effort: 4, exact: true }).toBuffer();
    const output = await sharp(encoded).ensureAlpha().raw().toBuffer();
    if (!packed.equals(output)) throw new Error(`Frame RGBA changed: ${key}`);
    await fs.writeFile(destination, encoded);
    receipt.sheets[key] = { source: filename, sourceSha256: hash(source), sourceSize: [info.width, info.height],
        destination, sha256: hash(encoded), size: [width, height], frameCount: count, columns, rows, frameRgbaSha256: frameHashes };
    sheet.path = destination.replace(/^public\/assets\//, '');
    sheet.frameCount = count;
    console.log(`${key}: ${info.width}×${info.height} → ${width}×${height}; ${count} exact RGBA frames`);
}
if (Object.keys(receipt.sheets).length) {
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 4) + '\n');
}

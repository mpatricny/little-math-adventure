import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const source = 'docs/design-drafts/battle-dock-v3/sources';
const out = 'public/assets/ui/battle-dock-v3';
await mkdir(out, { recursive: true });
const report = {};
async function pixels(file, cell) {
    return sharp(file).extract(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function bounds(cells) {
    let left = Infinity, top = Infinity, right = 0, bottom = 0;
    for (const { data, info } of cells) for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
async function output(cell, crop, filename, width, height, padding = 2) {
    await sharp(cell.data, { raw: cell.info }).extract(crop)
        .resize(width - padding * 2, height - padding * 2, { fit: 'contain', background: '#00000000' })
        .extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#00000000' })
        .webp({ quality: 95, alphaQuality: 100 }).toFile(`${out}/${filename}.webp`);
}
for (const [name, cell, size] of [
    ['round', { left: 0, top: 0, width: 768, height: 580 }, [256, 256]],
    ['square', { left: 840, top: 0, width: 696, height: 580 }, [256, 256]],
    ['tab', { left: 0, top: 580, width: 900, height: 444 }, [600, 208]],
    ['gem', { left: 900, top: 580, width: 636, height: 444 }, [96, 96]],
]) {
    const data = await pixels(`${source}/frames.png`, cell);
    const crop = bounds([data]);
    await output(data, crop, name, ...size);
    report[name] = { sourceCell: cell, crop, size };
}
// The generated sheet's equal cells start at x48 and x512. Every normal/active
// pair shares a single union crop, scale, translation and transparent canvas.
for (const [row, name] of ['shield', 'heal', 'strike'].entries()) {
    const cells = await Promise.all([48, 512].map(left => pixels(`${source}/ability-pairs.png`,
        { left, top: row * 512, width: 464, height: 512 })));
    const crop = bounds(cells);
    for (const [index, state] of ['normal', 'active'].entries()) await output(cells[index], crop, `${name}-${state}`, 256, 256, 12);
    report[name] = { crop, size: [256, 256], sharedPairTransform: true };
}
await writeFile(`${source}/normalization.json`, JSON.stringify(report, null, 2));
console.log('Normalized 4 structural assets and 3 aligned icon pairs.');
// The lock is a separate simple gold icon, with its full silhouette retained.
const lock = await pixels(`${source}/lock.png`, { left: 0, top: 0, width: 1536, height: 1024 });
const lockCrop = bounds([lock]);
await output(lock, lockCrop, 'lock', 128, 128, 3);
// Exact head crop of the accepted in-game portrait; no redrawing the fox.
const portrait = 'public/assets/sprites/companions/companion-fox-01-portrait.webp';
const headCrop = { left: 18, top: 26, width: 90, height: 90 };
await sharp(portrait).extract(headCrop).resize(192,192).webp({ quality: 95, alphaQuality: 100 }).toFile(`${out}/fox-01-head.webp`);
report.lock = { crop: lockCrop, size: [128, 128] };
report.foxHead = { source: portrait, crop: headCrop, size: [192, 192] };
await writeFile(`${source}/normalization.json`, JSON.stringify(report, null, 2));

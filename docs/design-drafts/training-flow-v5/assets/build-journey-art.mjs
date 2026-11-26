import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const sources = path.join(here, 'journey-sources');
const railCrop = { left: 48, top: 184, width: 2077, height: 344 };
await sharp(path.join(sources, 'rail-refined.png')).extract(railCrop)
  .resize({ width: 1600 }).webp({ quality: 94 }).toFile(path.join(here, 'journey-rail-v2.webp'));
// Pre-filter the approved fox for its small reward slot; avoid aliasing when
// a 900px sprite is composited at 58 CSS pixels on the tablet.
await sharp(path.join(here, 'fox-reward.webp')).resize({ width: 256 })
  .webp({ quality: 94 }).toFile(path.join(here, 'journey-fox.webp'));

// One common crop and scale for all four cells, including the open shackle.
const cell = 627;
const crop = { left: 78, top: 36, width: 471, height: 565 };
for (const [name, column, row] of [
  ['closed', 0, 0], ['closed-active', 1, 0], ['open', 0, 1], ['open-active', 1, 1],
]) {
  await sharp(path.join(sources, 'locks.png'))
    .extract({ ...crop, left: column * cell + crop.left, top: row * cell + crop.top })
    .resize({ width: 256, height: 256, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 94 }).toFile(path.join(here, 'journey-lock-' + name + '.webp'));
}
await fs.writeFile(path.join(here, 'journey-normalization.json'), JSON.stringify({
  rail: { source: 'journey-sources/rail-refined.png', crop: railCrop,
    rule: 'Complete frame, uniformly resized and rendered with object-fit: contain. No slicing or stretching.',
    safeContentInset: { left: 42, right: 42, top: 25, bottom: 25 } },
  locks: { source: 'journey-sources/locks.png', cell: [cell, cell], sharedCrop: crop,
    canvas: [256, 256], scale: 256 / crop.height, independentTrimming: false },
  fox: { source: 'fox-reward.webp', width: 256, uniformResize: true, redrawn: false },
}, null, 2) + '\n');

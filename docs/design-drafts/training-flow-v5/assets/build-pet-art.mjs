import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'pet-sources');
const cell = 627;
const crop = { left: 62, top: 20, width: 535, height: 585 };
for (const [name, row] of [['paw', 0], ['amulet', 1]]) {
  for (const [suffix, column] of [['normal', 0], ['active', 1]]) {
    await sharp(path.join(source, 'icons.png'))
      .extract({ ...crop, left: crop.left + column * cell, top: crop.top + row * cell })
      .resize({ width: 384, height: 384, fit: 'contain', background: '#00000000' })
      .webp({ quality: 94 }).toFile(path.join(here, `pet-${name}-${suffix}.webp`));
  }
}
// Trim only a single structural frame, never normal/active icons separately.
await sharp(path.join(source, 'power-frame.png')).trim({ threshold: 12 })
  .resize({ width: 1200 }).webp({ quality: 94 }).toFile(path.join(here, 'pet-power-frame.webp'));
await sharp(path.join(source, 'catacombs-clean.png'))
  .webp({ quality: 95 }).toFile(path.join(here, '../../catacombs-access-v1/detail-clean.webp'));
// The complete doorway isolated by the image model; no fragments of the source UI.
await sharp(path.join(source, 'doorway.png')).trim({ threshold: 12 })
  .resize({ width: 468 }).webp({ quality: 94 }).toFile(path.join(here, 'pet-doorway.webp'));
await fs.writeFile(path.join(here, 'pet-normalization.json'), JSON.stringify({
  icons: { source: 'pet-sources/icons.png', cell: [cell, cell], sharedCrop: crop,
    canvas: [384, 384], independentTrimming: false,
    activeState: 'Generated active variants have small geometry drift. Runtime deliberately reuses the canonical normal image for light animation instead of swapping silhouettes.' },
  powerFrame: { source: 'pet-sources/power-frame.png', width: 1200, uniformResize: true, fullFrame: true },
  background: { source: 'pet-sources/catacombs-clean.png', dimensions: [1672, 941], edits: 'Removed only four baked locks/backplates.' },
}, null, 2) + '\n');

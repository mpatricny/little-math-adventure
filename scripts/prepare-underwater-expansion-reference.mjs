// Deterministic padding only; this never synthesizes motion or changes anatomy.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const [slug, source] = process.argv.slice(2);
if (!['seahorse', 'nautilus'].includes(slug) || !source) throw new Error('Usage: node scripts/prepare-underwater-expansion-reference.mjs seahorse|nautilus source.png');
const root = new URL('../artifacts/sorceress/underwater-expansion/', import.meta.url);
await fs.mkdir(root, { recursive: true });
const cropped = await sharp(source).trim({ background: '#00000000' }).toBuffer();
const padded = await sharp(cropped).resize({ width: 650, height: 650, fit: 'inside' }).png().toBuffer();
const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#00ff00' } })
    .composite([{ input: padded, gravity: 'centre' }]).png().toBuffer();
await fs.writeFile(new URL(`${slug}-canonical-green.png`, root), image);
console.log(`${slug}: canonical uniformly fitted inside 650×650, centered on 1024×1024 green; inspect before approving.`);

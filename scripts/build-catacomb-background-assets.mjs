import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// One continuous scene per state. Keep the approved shell and central artwork;
// only the missing surrounding masonry/floor comes from ImageGen outpainting.
const root = process.cwd();
const source = path.join(root, 'docs/design-drafts/shared/catacomb-background-v3/source');
const output = path.join(root, 'public/assets/ui/catacomb-background-v3');
await fs.mkdir(output, { recursive: true });
const patch = { left: 517, top: 159, width: 1053, height: 821 };
const shell = path.join(source, 'catacombs.webp');
const outpaint = async name => sharp(path.join(source, name + '-outpaint.png'))
    .resize(patch.width, patch.height, { fit: 'cover', position: 'centre' }).png().toBuffer();
const speed = await outpaint('speed');
const shield = await outpaint('shield');
async function retainedCenter(input, featherX, featherY) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const tx = featherX ? Math.min(x, info.width - 1 - x) / featherX : 1;
        const ty = Math.min(y, info.height - 1 - y) / featherY;
        const t = Math.max(0, Math.min(1, tx, ty));
        data[(y * info.width + x) * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t));
    }
    return sharp(data, { raw: info }).png().toBuffer();
}

for (const state of ['open', 'closed']) {
    const center = await sharp(path.join(source, `axis-hall-${state}.webp`))
        .resize(1053, 500, { fit: 'inside' }).png().toBuffer();
    const retained = await retainedCenter(center, 0, 24);
    const plate = await sharp(speed).composite([{ input: retained, left: 0, top: 150 }]).png().toBuffer();
    await sharp(shell).composite([{ input: plate, left: patch.left, top: patch.top }])
        .webp({ quality: 92 }).toFile(path.join(output, `speed-panel-${state}.webp`));
}
const illustration = await sharp(path.join(source, 'shield-demonstration.webp'))
    .resize(969, 373, { fit: 'inside' }).png().toBuffer();
// Retain the actors/effect core. The outpaint owns the two side pillars all the
// way down, so a slightly displaced old torch bracket cannot appear twice.
const actorMatte = Buffer.from('<svg width="969" height="373"><defs><filter id="edge"><feGaussianBlur stdDeviation="8"/></filter></defs><path fill="white" filter="url(#edge)" d="M-20 110L155 82L280 20L320-30H640L700 135L750 190L880 170L990 200V400H-20Z"/></svg>');
const retained = await sharp(await retainedCenter(illustration, 30, 32))
    .composite([{ input: actorMatte, blend: 'dest-in' }]).png().toBuffer();
const plate = await sharp(shield).composite([{ input: retained, left: 46, top: 186 }]).png().toBuffer();
await sharp(shell).composite([{ input: plate, left: patch.left, top: patch.top }])
    .webp({ quality: 92 }).toFile(path.join(output, 'shield-panel.webp'));
console.log('Exported three continuous 1584×993 catacomb panels.');

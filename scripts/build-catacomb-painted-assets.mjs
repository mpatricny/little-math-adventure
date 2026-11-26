import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Deterministic export of approved ImageGen sources. Runtime text and interaction remain in Phaser.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'docs/design-drafts/shared/catacomb-painted-v2/source');
const output = path.resolve(root, process.argv[2] ?? 'public/assets/ui/catacomb-painted-v2');
await fs.mkdir(output, { recursive: true });
for (const [from, to] of [['catacombs-clean.png', 'catacombs.webp'], ['fox-room-clean.png', 'fox-room.webp']]) {
    await sharp(path.join(source, from)).resize(1584, 1008, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 91 }).toFile(path.join(output, to));
}
const frames = [
    {name: 'title', left: 20, top: 150, width: 744, height: 202,
        polygon: '30,120 52,74 71,74 91,47 292,47 383,7 448,47 650,47 678,74 701,74 736,120 700,161 677,161 648,194 92,194 69,170 52,170'},
    {name: 'card', left: 794, top: 137, width: 706, height: 238,
        polygon: '44,7 660,7 699,44 699,192 662,231 44,231 7,192 7,44'},
    {name: 'action', left: 43, top: 665, width: 692, height: 175,
        polygon: '71,7 611,7 684,87 611,168 71,168 7,87'},
    {name: 'portrait-ring', left: 968, top: 571, width: 360, height: 360},
];
for (const {name, polygon, ...crop} of frames) {
    const shape = polygon ? `<polygon points="${polygon}" fill="white"/>`
        : '<circle cx="180" cy="180" r="171" fill="none" stroke="white" stroke-width="24"/>';
    const mask = Buffer.from(`<svg width="${crop.width}" height="${crop.height}">${shape}</svg>`);
    await sharp(path.join(source, 'frame-atlas.png')).extract(crop).ensureAlpha()
        .composite([{input: mask, blend: 'dest-in'}]).webp({quality: 93, alphaQuality: 100}).toFile(path.join(output, name + '.webp'));
}
await sharp(path.join(source, 'shield-reference.png')).extract({left: 530, top: 360, width: 1040, height: 400})
    .webp({quality: 93}).toFile(path.join(output, 'shield-demonstration.webp'));

// One alpha rule and one crop/translation for both icon states. No independent trimming.
const {data, info} = await sharp(path.join(source, 'door-pair.png')).ensureAlpha().raw().toBuffer({resolveWithObject: true});
for (let i = 0; i < data.length; i += 4) {
    const excess = data[i + 1] - Math.max(data[i], data[i + 2]);
    if (excess > 25 && data[i + 1] > 90) data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (65 - excess) / 40)));
    if (data[i + 3]) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]) + 12);
}
const half = Math.floor(info.width / 2);
for (const [index, state] of ['open', 'closed'].entries()) {
    await sharp(data, {raw: info}).extract({left: index * half + 20, top: 90, width: half - 40, height: 810})
        .resize(512, 552, {fit: 'contain', background: '#00000000'})
        .webp({quality: 93, alphaQuality: 100}).toFile(path.join(output, `door-${state}.webp`));
}
// Restore the shut door on the very same plate, preserving every layout anchor.
const hall = path.join(source, 'axis-hall-open.png');
const patchWidth = 341, patchHeight = 650;
const patch = await sharp(path.join(source, 'axis-locked-door.png')).resize(patchWidth, patchHeight, {fit: 'fill'}).raw().removeAlpha().toBuffer();
const matte = Buffer.alloc(patchWidth * patchHeight);
for (let y = 0; y < patchHeight; y++) {
    for (let x = 0; x < patchWidth; x++) {
        matte[y * patchWidth + x] = Math.round(255 * Math.min(1, x / 26, y / 12, (patchHeight - 1 - y) / 55));
    }
}
const closedDoor = await sharp(patch, {raw: {width: patchWidth, height: patchHeight, channels: 3}})
    .joinChannel(matte, {raw: {width: patchWidth, height: patchHeight, channels: 1}})
    .png().toBuffer();
const closedHall = await sharp(hall).composite([{input: closedDoor, left: 1480, top: 0}]).png().toBuffer();
for (const [state, art] of [['open', hall], ['closed', closedHall]]) {
    await sharp(art).resize({width: 1224}).webp({quality: 90}).toFile(path.join(output, `axis-hall-${state}.webp`));
}
// Keep the painted gold band and its two turquoise finials. Replace only the five
// overprinted example ticks with the adjacent material before adding the alpha edge.
const strip = await sharp(path.join(source, 'speed-rail-strip.png')).removeAlpha().raw().toBuffer();
for (const column of [78, 206, 464, 636, 722]) {
    for (let y = 24; y <= 40; y++) {
        const clean = (y * 807 + column - 6) * 3;
        for (let x = column - 3; x <= column + 3; x++) strip.copy(strip, (y * 807 + x) * 3, clean, clean + 3);
    }
}
const railEdge = Buffer.from('<svg width="807" height="65"><path fill="white" d="M11 32 Q12 30 29 14 Q32 11 35 13 L48 25.5 H754 L772 13 Q775 11 778 13 L796 31 Q797 33 795 35 L778 51 Q775 54 773 52 L757 38.5 H49 L35 51 Q32 54 29 51 L13 36 Q10 33 11 32Z"/></svg>');
const rail = await sharp(strip, {raw: {width: 807, height: 65, channels: 3}}).ensureAlpha()
    .composite([{input: railEdge, blend: 'dest-in'}]).png().toBuffer();
await sharp(rail).extract({left: 10, top: 10, width: 788, height: 46})
    .webp({lossless: true}).toFile(path.join(output, 'speed-rail.webp'));

// Isolate the exact apples in the approved index. The tight crops exclude the
// surrounding frame and live lettering. Keep the pale ghost and the motion arrow.
const appleSheet = path.join(source, 'module-pictograms.png');
for (const [id, left, top, width, height] of [
    ['add', 19, 321, 201, 89], ['subtract', 17, 38, 211, 83],
    ['mix', 28, 170, 150, 96], ['apple', 20, 321, 77, 88],
]) {
    const data = await sharp(appleSheet).extract({left, top, width, height}).ensureAlpha().raw().toBuffer();
    const paleApple = id === 'subtract' ? await sharp(Buffer.from(
        `<svg width="${width}" height="${height}"><path fill="white" d="M113 52 Q123 58 137 58 L135 52 Q141 55 147 60 L134 69 L136 63 Q125 65 113 57 Q111 55 113 52Z M180 19 C182 13 185 9 200 8 Q199 22 183 24 L181 27 C196 20 206 29 207 42 C208 55 199 71 190 76 Q184 79 175 75 Q170 73 166 75 C156 77 152 66 150 58 C143 42 150 26 161 24 Q170 20 178 27 Q176 19 169 13 Q167 9 171 10 Q177 12 180 19Z"/></svg>`
    )).ensureAlpha().raw().toBuffer() : null;
    for (let p = 0; p < data.length; p += 4) {
        const [red, green, blue] = data.subarray(p, p + 3);
        const x = (p / 4) % width;
        const y = Math.floor(p / 4 / width);
        const fruitAlpha = Math.max(0, Math.min(255, (Math.max(red - blue, green - blue) + 1) * 19));
        data[p + 3] = paleApple && x >= 110 ? paleApple[p + 3] : x + y < 14 ? 0 : fruitAlpha;
    }
    await sharp(data, {raw: {width, height, channels: 4}}).webp({lossless: true}).toFile(path.join(output, `operation-${id}.webp`));
}
// Portrait buttons use a facial close-up. Use the same enamel medallion and inner
// aperture for each form, with an authored face crop on its original painting.
const pets = path.join(root, 'public/assets/ui');
const medallion = await sharp(path.join(pets, 'battle-dock-v3/round.webp')).resize(192, 192).png().toBuffer();
const aperture = Buffer.from('<svg width="192" height="192"><circle cx="96" cy="96" r="81" fill="white"/></svg>');
for (const [i, crop] of [[25, 41, 111], [29, 44, 97], [29, 44, 101], [155, 52, 101], [33, 39, 100]].entries()) {
    const form = String(i + 1).padStart(2, '0');
    const file = path.join(pets, 'catacomb-progress-v1', `fox-${form}.${form === '04' ? 'webp' : 'png'}`);
    const {width} = await sharp(file).metadata();
    const [left, top, size] = crop.map(n => Math.round(n * width / 256));
    const faceRegion = await sharp(file).extract({left, top, width: size, height: size}).png().toBuffer();
    const face = sharp(faceRegion);
    if (form === '04') face.flop();
    const portrait = await face.resize(192, 192).ensureAlpha().composite([{input: aperture, blend: 'dest-in'}]).png().toBuffer();
    await sharp(medallion).composite([{input: portrait}]).webp({quality: 94, alphaQuality: 100}).toFile(path.join(output, `fox-head-${form}.webp`));
}
// Use the actual reward plaque from the fox painting. Opening and closing the
// gate changes only the arch interior, so the bevels and foliage stay aligned.
const portal = path.join(source, 'journey-portal.png');
const portalEdge = Buffer.from('<svg width="420" height="225"><path fill="white" d="M9 96L59 42H143Q162 19 209 10Q251 18 272 42H357L406 95V171L357 222H60L9 170Z"/></svg>');
const insideArch = Buffer.from('<svg width="420" height="225"><path fill="white" d="M122 172V99Q125 52 158 34Q209 5 260 35Q292 57 294 103V173Q293 180 279 181L134 179Q125 178 122 172Z"/></svg>');
const shut = await sharp(path.join(source, 'journey-portal-locked.png')).resize(420, 225).ensureAlpha()
    .composite([{input: insideArch, blend: 'dest-in'}]).png().toBuffer();
for (const state of ['open', 'closed']) {
    const layers = state === 'closed' ? [{input: shut}] : [];
    await sharp(portal).ensureAlpha().composite([...layers, {input: portalEdge, blend: 'dest-in'}])
        .webp({quality: 94, alphaQuality: 100}).toFile(path.join(output, `journey-door-${state}.webp`));
}
console.log(`Exported painted UI assets to ${output}`);

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// The two inputs are the top strips of the approved tablet paintings at native size.
const sources = 'docs/design-drafts/shared/catacomb-header-v4';
const output = 'public/assets/ui/catacomb-header-v4';
await fs.mkdir(output, { recursive: true });
const crop = (name, left, top, width, height) => sharp(path.join(sources, name + '.png')).extract({ left, top, width, height }).png().toBuffer();
const svg = (w, h, content) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
const polygon = points => `<polygon points="${points}" fill="white"/>`;

async function exportPart(name, image, silhouette, overlays = []) {
    const { width, height } = await sharp(image).metadata();
    await sharp(image).ensureAlpha().composite([...overlays,
        { input: svg(width, height, silhouette), blend: 'dest-in' },
    ]).webp({ quality: 96, alphaQuality: 100 }).toFile(path.join(output, name + '.webp'));
}

// Remove lettering by continuing the same unlettered enamel at the same height.
async function replaceEnamel(image, {left, top, width, height}, sampleX, sampleWidth) {
    const {data, info} = await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const original = Buffer.from(data);
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
        const fold = (x - left) % (sampleWidth * 2);
        const sample = sampleX + (fold < sampleWidth ? fold : sampleWidth * 2 - fold - 1);
        const blend = Math.min(1, (x - left + 1) / 5, (left + width - x) / 5, (y - top + 1) / 3, (top + height - y) / 3);
        for (let c = 0; c < 3; c++) {
            const index = (y * info.width + x) * 3 + c;
            data[index] = original[index] * (1 - blend) + original[(y * info.width + sample) * 3 + c] * blend;
        }
    }
    return sharp(data, {raw: info}).png().toBuffer();
}

const catTitle = await crop('catacombs', 491, 0, 605, 134);
let withoutTitle = await replaceEnamel(catTitle, {left:153,top:56,width:298,height:54}, 83, 55);
for (const left of [150, 327]) withoutTitle = await replaceEnamel(withoutTitle, {left,top:48,width:126,height:15}, 83, 55);
await exportPart('title-catacombs', withoutTitle,
    polygon('1,78 31,43 47,42 71,23 220,23 231,17 263,17 279,10 300,0 306,0 326,12 343,17 374,17 387,23 535,23 558,42 571,43 603,77 573,114 561,114 540,132 69,132 44,115 30,114'));
const foxTitle = await crop('fox', 497, 0, 573, 144);
await exportPart('title-fox', await replaceEnamel(foxTitle, {left:147,top:57,width:285,height:59}, 72, 58),
    polygon('2,63 29,42 49,25 237,25 252,17 273,0 298,0 320,19 338,25 523,25 541,42 571,63 571,102 545,118 520,142 51,142 31,123 2,104'));

const back = await crop('fox', 30, 29, 113, 91);
const button = polygon('2,27 26,2 85,2 110,25 110,66 87,87 25,87 2,66');
await exportPart('back', back, button);
const enamelFace = await sharp(foxTitle).extract({left:73,top:49,width:67,height:49}).png().toBuffer();
const blank = await sharp(back).composite([{input:enamelFace,left:22,top:19}]).png().toBuffer();
// Same socket and highlights as Back, with a symmetrical gilded close mark.
const cross = 'M39 29 L72 61 M72 29 L39 61';
await exportPart('close', blank, button, [{input: svg(113,91,`<defs><linearGradient id="g" x2=".3" y2="1"><stop stop-color="#fff7a2"/><stop offset=".44" stop-color="#ffc930"/><stop offset="1" stop-color="#e89416"/></linearGradient></defs><g fill="none" stroke-linecap="square"><path d="${cross}" transform="translate(0 2)" stroke="#4e2501" stroke-width="10"/><path d="${cross}" stroke="#f3b43b" stroke-width="9"/><path d="${cross}" stroke="url(#g)" stroke-width="6"/></g>`)}]);

const pin = await crop('fox',1140,51,42,58);
await exportPart('map-pin',pin,'<path d="M20 1 C1 1 -2 20 8 34 L22 55 L36 29 C46 9 32 0 20 1Z" fill="white"/>');
// Both owner states share the existing portrait ring and its registration.
await sharp('public/assets/ui/catacomb-painted-v2/portrait-ring.webp').grayscale().tint({r:168,g:186,b:206})
    .webp({quality:95,alphaQuality:100}).toFile(path.join(output,'owner-silver.webp'));
const rail = await crop('catacombs', 405, 147, 770, 13);
await sharp(rail).flop().extend({right:770, extendWith:'mirror'}).webp({quality:95}).toFile(path.join(output,'header-rule.webp'));
const shade = svg(150,24,'<defs><linearGradient id="v"><stop stop-color="#061429" stop-opacity="0"/><stop offset=".13" stop-color="#061429" stop-opacity=".88"/><stop offset=".87" stop-color="#061429" stop-opacity=".88"/><stop offset="1" stop-color="#061429" stop-opacity="0"/></linearGradient></defs><rect x="0" y="1" width="150" height="22" rx="10" fill="url(#v)"/>');
await sharp(shade).webp({lossless:true}).toFile(path.join(output,'name-shade.webp'));
await exportPart('badge-sun',await crop('fox',205,109,50,53),polygon('1,7 12,5 25,0 37,4 48,7 47,27 39,39 25,50 12,43 4,31'));
await exportPart('badge-crystal',await crop('fox',359,109,50,52),polygon('2,7 14,4 26,0 38,5 48,7 47,28 40,40 25,50 12,41 4,30'));

// A portrait is a bust in a circular medallion; keep this same crop for both heroes.
for (const hero of ['hero','heroine']) {
    const face = await sharp('public/assets/ui/town-hud-a/portraits/'+hero+'-portrait.png').trim().resize({width:170}).png().toBuffer();
    const height = (await sharp(face).metadata()).height;
    const bust = await sharp(face).extract({left:8,top:0,width:154,height:Math.min(149,height)}).png().toBuffer();
    const enamel = svg(168,168,'<defs><radialGradient id="b"><stop stop-color="#284f69"/><stop offset="1" stop-color="#09172e"/></radialGradient></defs><circle cx="84" cy="84" r="82" fill="url(#b)"/>');
    await exportPart(hero, await sharp(enamel).png().toBuffer(), '<circle cx="84" cy="84" r="81" fill="white"/>', [{input:bust,left:7,top:13}]);
}

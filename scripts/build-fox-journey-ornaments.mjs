import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Masks are in coordinates of the 1100-pixel-wide design proof. Sample the
// actual painting at its native resolution; the runtime supplies all lettering.
const source = process.argv[2] ?? 'artifacts/katakomby-malovane-v2/moje-liska.png';
const output = 'public/assets/ui/fox-journey-ornaments';
const { width } = await sharp(source).metadata();
const factor = width / 1100;
await fs.mkdir(output, { recursive: true });

async function ornament(name, box, shape) {
    const [x, y, w, h] = box;
    const crop = { left: Math.round(x * factor), top: Math.round(y * factor),
        width: Math.round(w * factor), height: Math.round(h * factor) };
    const mask = Buffer.from(`<svg width="${crop.width}" height="${crop.height}" viewBox="${x} ${y} ${w} ${h}">
        <path d="${shape}" fill="white"/></svg>`);
    await sharp(source).extract(crop).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }])
        .webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(output, name + '.webp'));
}

await ornament('scroll', [763, 351, 54, 47],
    'M773 354 Q779 352 782 355 Q794 358 804 354 Q811 353 811 361 Q810 367 807 371 L802 384 Q809 383 809 389 Q809 396 802 395 L769 395 Q764 393 766 387 L773 366 Q767 367 767 361 Q767 357 773 354Z');
await ornament('rune-link', [468, 450, 31, 24],
    'M468 460 L474 460 L483 451 L493 460 L498 460 L498 465 L492 465 L483 472 L474 465 L468 465Z');
await ornament('shield', [45, 409, 87, 95],
    'M88.4 410.3 Q104 424 129 428.2 Q131 469 109 487 Q99 497 88.8 501.2 Q71 493 58 475 Q47 458 47.4 428.5 Q72 422 88.4 410.3Z');
await ornament('heal', [31, 504, 112, 80],
    'M89 517.8 C75 497 53 503 51 525 Q49 537 63 548 Q45 539 43.3 522 Q26 542 37.7 561 Q47 576 70 575 Q79 577 86.2 582.5 Q85 567 63 552 Q76 559 89.2 570.3 Q99 554 111 550 Q95 563 90.6 582 Q97 575 106 574.5 Q141 575 140.8 545 Q141.6 539 136 528 Q135 539 119 547 Q131 529 123 515 C115 500 99 500 89 517.8Z');
await ornament('strike', [50, 584, 75, 96],
    'M80.4 589.2 L122.2 585 L96 615.7 L122.4 614.5 L60.5 676 L82 634 L52.5 640Z');
await ornament('paw', [479, 286, 66, 64],
    'M493.7 300 Q496 292 503 289.5 Q507 288 512 291.5 Q518 287.4 523 291 Q528 293 530 300 Q538 302 541.5 309 Q545 320 537 326 Q535 338 526 343.3 Q520 347.5 512 345.4 Q503 348 496 343 Q489 340 488.3 327 Q480.7 324 481.8 313.3 Q482.8 303 493.7 300Z');
const unlitPaw = path.join(output, 'paw.webp');
const { data: bronze, info: paw } = await sharp(unlitPaw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const lit = Buffer.from(bronze);
for (let i = 0; i < bronze.length; i += 4) {
    const light = bronze[i] / 255;
    const metal = Math.max(0, Math.min(1, (light - .59) * 4));
    const enamel = [18 + 80 * light, 82 + 223 * light, 111 + 194 * light];
    for (let c = 0; c < 3; c++) lit[i + c] = Math.min(255, bronze[i + c] * metal + enamel[c] * (1 - metal));
}
await sharp(lit, { raw: paw }).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(output, 'paw-lit.webp'));

// Gold on the blue banner is a static part of the room. Its perimeter is
// masked by colour to avoid copying any blue from the original background.
const crest = { left: Math.round(611 * factor), top: Math.round(107 * factor),
    width: Math.round(85 * factor), height: Math.round(85 * factor) };
const { data, info } = await sharp(source).extract(crest).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.max(0, Math.min(255, (data[i] - data[i + 2] - 12) * 3.4));
}
await sharp(data, { raw: info }).webp({ quality: 95, alphaQuality: 100 }).toFile(path.join(output, 'guild-crest.webp'));

// The transparent leading pocket makes the picture and plate one touch target.
const rail = await sharp('public/assets/ui/catacomb-crafted-v3/skill.webp')
    .resize(550, 130, { fit: 'inside' }).png().toBuffer();
await sharp({ create: { width: 710, height: 176, channels: 4, background: '#00000000' } })
    .composite([{ input: rail, left: 151, top: 28 }]).webp({ quality: 94, alphaQuality: 100 })
    .toFile(path.join(output, 'ability-rail.webp'));

// A separate halo follows the alpha of the real socket. Registration is
// shared with the normal frame, including its transparent padding.
const { data: alpha, info: socket } = await sharp('public/assets/ui/catacomb-crafted-v3/socket.webp')
    .extractChannel('alpha').threshold(160).raw().toBuffer({ resolveWithObject: true });
const mask = { raw: { width: socket.width, height: socket.height, channels: 1 } };
// libvips erodes dark pixels, which expands the white silhouette.
const rim = await sharp(alpha, mask).erode(6).greyscale().raw().toBuffer();
const halo = await sharp(alpha, mask).blur(5).greyscale().raw().toBuffer();
const rgba = Buffer.alloc(alpha.length * 4);
for (let i = 0; i < alpha.length; i++) {
    rgba[4 * i] = rim[i] > 180 ? 166 : 36;
    rgba[4 * i + 1] = 255;
    rgba[4 * i + 2] = 247;
    rgba[4 * i + 3] = alpha[i] ? 0 : Math.min(255, rim[i] + halo[i]);
}
await sharp(rgba, { raw: { ...mask.raw, channels: 4 } }).webp({ quality: 95, alphaQuality: 100 })
    .toFile(path.join(output, 'socket-halo.webp'));

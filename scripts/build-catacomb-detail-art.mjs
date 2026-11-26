import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Trace the approved paintings in their 1080-wide review coordinate system.
// Cut at native resolution; no captions or numbers are part of the controls.
const source = process.argv[2] ?? 'artifacts/katakomby-malovane-v2';
const destination = 'public/assets/ui/catacomb-detail';
await fs.mkdir(destination, { recursive: true });
const speed = await sharp(path.join(source, 'katakomby-cas.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const shield = await sharp(path.join(source, 'katakomby.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

async function cut(image, name, box, silhouette, options = {}) {
    const factor = image.info.width / 1080;
    const [left, top, width, height] = box.map(n => Math.round(n * factor));
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box.join(' ')}"><path d="${silhouette}" fill="white" /></svg>`);
    const {data} = await sharp(image.data, {raw: image.info}).extract({left,top,width,height}).raw().toBuffer({resolveWithObject: true});
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const i = 4 * (width * row + col);
        if (options.goldOnly) {
            // Gold branches on cool blue enamel. Matte the spaces between leaves.
            data[i+3] = Math.round(255 * Math.max(0, Math.min(1, (data[i] - data[i+2] - 8) / 35)));
        }

    }
    // Interpolate only the printed glyphs and the emblem cut separately for
    // runtime, retaining the original paint and bevel around the cleared areas.
    let unknown = new Set();
    for (const [x1,y1,x2,y2] of options.enamel ?? []) {
        for (let y = Math.ceil(y1*factor)-top; y <= Math.floor(y2*factor)-top; y++) {
            for (let x = Math.ceil(x1*factor)-left; x <= Math.floor(x2*factor)-left; x++) {
                const i = width*y+x;
                if (data[4*i] <= 65 || data[4*i] <= data[4*i+2]*.6) continue;
                for (let dy=-3;dy<=3;dy++) for (let dx=-3;dx<=3;dx++) {
                    if (x+dx>=0 && x+dx<width && y+dy>=0 && y+dy<height) unknown.add(i+dy*width+dx);
                }
            }
        }
    }
    while(unknown.size) {
        const fill = [];
        for (const i of unknown) {
            const around = [-width-1,-width,-width+1,-1,1,width-1,width,width+1]
                .map(d => i+d).filter(n => n>=0 && n<width*height && !unknown.has(n));
            if (around.length) fill.push([i,around]);
        }
        for (const [i,around] of fill) {
            for (let c=0;c<3;c++) data[4*i+c] = Math.round(around.reduce((v,n) => v+data[4*n+c],0)/around.length);
            unknown.delete(i);
        }
    }
    if (options.copyEnamel) {
        // Both controls have a symmetric bevel. Reflect their unprinted face
        // under the independent apple/door, feathering into the painted center.
        for (let y=0;y<height;y++) for (let x=0;x<width/2;x++) {
            const sourceX=width-1-x, i=4*(y*width+x), j=4*(y*width+sourceX);
            const t=Math.min(1,(width/2-x)/(width*.08));
            for(let c=0;c<3;c++) data[i+c]=Math.round(data[i+c]*(1-t)+data[j+c]*t);
        }
    }
    const bounds = {width,height,channels:4};
    const clipped = await sharp(data,{raw:bounds}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    let bitmap = sharp(clipped);
    if (options.rays) {
        // The shield's cyan sparks are part of its silhouette. Extract their
        // light from the original masonry and feather the outer crop.
        for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
            const i=4*(width*y+x);
            const glow=Math.min((data[i+1]-81)/96, (data[i+2]-126)/89, (data[i+1]-data[i]-17)/55);
            const edge=Math.min(x,width-1-x,y,height-1-y)/7;
            data[i+3]=x<width/2 && y>height/2 ? 0 : Math.round(255 * Math.max(0, Math.min(1,glow,edge)));
        }
        bitmap=sharp(data,{raw:bounds}).composite([{input:clipped}]);
    }
    const cutout = await bitmap.webp({quality:94,alphaQuality:100}).toBuffer();
    if (!options.intermediate) await fs.writeFile(path.join(destination,name+'.webp'), cutout);
    return cutout;
}

await cut(speed, 'laurels', [393,445,285,80], 'M393 445 L428 445 L428 493 L450 511 L458 521 L412 523 L393 496 Z M675 445 L644 445 L628 507 L617 520 L649 522 L675 506 Z', {goldOnly:true});
await cut(speed, 'planted-sword', [584,429,58,99], 'M586 509 L603 468 L598 465 L592 467 L590 459 L602 455 L614 458 L622 444 L620 440 L620 435 L630 430 L637 435 L636 442 L630 446 L622 462 L628 468 L633 468 L637 478 L631 481 L627 475 L618 474 L601 514 L589 525 Z');
const lock = await cut(speed, 'silver-lock', [416,378,23,31], 'M419 392 L419 386 Q420 379 427 379 Q434 379 435 386 L435 392 L437 393 L437 405 Q437 407 434 407 L419 407 Q417 407 417 404 L417 394 Z M423 391 L431 391 L431 386 Q431 382 427 382 Q423 382 423 386 Z', {intermediate:true});
await cut(shield, 'shield-reward', [926,115,143,129], 'M946 142 Q976 135 1001 122 Q1024 134 1054 141 L1052 170 Q1051 202 1034 222 Q1033 237 1023 237 L1017 236 Q1010 241 998 244 Q946 219 946 163 Z', {rays:true,enamel:[[1018,213,1027,229]]});
await cut(shield, 'lesson-rune', [637,109,112,65], 'M638 116 L643 112 L676 112 L679 109 L710 109 L715 112 L743 112 L748 116 L731 171 L663 172 Z');
await cut(shield, 'lesson-title', [530,177,328,68], 'M532 196 L549 179 L837 179 L855 196 L855 226 L837 242 L549 242 L532 226 Z', {enamel:[[581,191,811,230]]});
await cut(speed, 'module-title', [551,111,295,91], 'M553 153 L577 134 L645 134 L653 130 L668 129 L682 122 L697 112 L712 120 L720 128 L731 129 L740 134 L819 134 L844 152 L840 158 L840 190 L823 200 L578 200 L553 189 Z', {enamel:[[582,152,814,185]]});
await cut(speed, 'reward-title', [684,455,184,62], 'M686 476 L706 457 L846 457 L865 476 L865 497 L846 514 L706 514 L686 497 Z', {enamel:[[729,467,829,505]]});
await cut(speed, 'practice-frame', [366,553,275,85], 'M368 579 L393 555 L616 555 L639 578 L639 612 L617 636 L392 636 L368 612 Z', {copyEnamel:true,enamel:[[464,579,613,610]]});
await cut(speed, 'entrance-frame', [652,546,368,101], 'M655 576 L683 548 L988 548 L1017 577 L1017 616 L989 644 L683 644 L655 618 Z', {copyEnamel:true,enamel:[[820,578,958,611]]});
await cut(speed, 'entrance', [695,556,96,76], 'M698 578 Q716 557 743 557 Q768 557 788 578 L788 630 L758 621 L728 621 L698 630 Z');
// Uniform canvases separate the compact painted milestone from its finger-sized target.
for (const [name, file, width, height] of [
    ['stage-locked',lock,48,55],
    ['stage-ready',path.join(destination,'entrance.webp'),62,55],
    ['stage-cleared','public/assets/ui/catacomb-progress-v1/rune-active.webp',57,55],
]) {
    const {data,info} = await sharp(file).resize(width,height,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
    await sharp({create:{width:128,height:102,channels:4,background:'#00000000'}})
        .composite([{input:data,left:Math.floor((128-info.width)/2),top:Math.floor((102-info.height)/2)}])
        .webp({quality:94,alphaQuality:100}).toFile(path.join(destination,name+'.webp'));
}

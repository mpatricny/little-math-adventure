// Shared transparent badge normalization; no text or per-state artwork variants.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const source='public/assets/images/concepts/underwater-expansion/deep-rank-badge-canonical.png';
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=0,bottom=0;
for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>=8){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
}
left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(info.width,right+2);bottom=Math.min(info.height,bottom+2);
const normalized=await sharp(source).extract({left,top,width:right-left,height:bottom-top})
    .resize({width:244,height:244,fit:'inside'}).png().toBuffer();
const canvas=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
    .composite([{input:normalized,gravity:'centre'}]).webp({lossless:true,effort:6}).toBuffer();
await fs.mkdir('public/assets/ui/underwater',{recursive:true});
await fs.writeFile('public/assets/ui/underwater/elite-rank-badge.webp',canvas);
const tiles=[];
for(const [row,color] of ['#132c42','#eceade','#777777'].entries()) for(const [column,size] of [40,48].entries()){
    const badge=await sharp(canvas).resize(size,size).toBuffer();
    const tile=await sharp({create:{width:96,height:96,channels:4,background:color}})
        .composite([{input:badge,gravity:'centre'}]).png().toBuffer();
    tiles.push({input:tile,left:column*96,top:row*96});
}
await fs.mkdir('artifacts/sorceress/underwater-expansion',{recursive:true});
await sharp({create:{width:192,height:288,channels:4,background:'#00000000'}}).composite(tiles)
    .png().toFile('artifacts/sorceress/underwater-expansion/rank-badge-40-48-review.png');
console.log('Normalized one transparent 256px badge; review columns 40px/48px on dark, light and gray.');

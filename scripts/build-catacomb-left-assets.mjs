import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'docs/design-drafts/shared/catacomb-left-v4/source/atlas.png');
const output = path.join(root, 'public/assets/ui/catacomb-left-v4');
await fs.mkdir(output, {recursive:true});
const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
// One generated canonical family; remove only the green key and its edge spill.
for (let i=0;i<data.length;i+=4) {
    const [r,g,b]=data.subarray(i,i+3), excess=g-Math.max(r,b);
    if (g>135 && excess>70 && r<130 && b<130) data[i+3]=0;
    else if (excess>25 && r<180 && b<180) {
        data[i+3]=Math.round(255*Math.max(0,1-(excess-25)/180));
        data[i+1]=Math.min(g,Math.max(r,b)+6);
    }
}
const cells = {
    module:{left:30,top:70,width:1040,height:350},
    pin:{left:30,top:490,width:1040,height:240},
    footer:{left:25,top:795,width:1055,height:215},
    divider:{left:1110,top:65,width:90,height:950},
    previous:{left:440,top:1050,width:140,height:150},
};
const boxes={};
for(const [name,cell] of Object.entries(cells)) {
    let l=cell.left+cell.width,t=cell.top+cell.height,r=cell.left,b=cell.top;
    for(let y=cell.top;y<cell.top+cell.height;y++)for(let x=cell.left;x<cell.left+cell.width;x++)
        if(data[(y*info.width+x)*4+3]>24){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}
    const box=boxes[name]={left:l-6,top:t-6,width:r-l+12,height:b-t+12};
    await sharp(data,{raw:info}).extract(box).webp({quality:94,alphaQuality:100}).toFile(path.join(output,name+'.webp'));
}
await sharp(path.join(output,'previous.webp')).flop().webp({lossless:true}).toFile(path.join(output,'next.webp'));

// The same card silhouette supplies focus. It is an inlay, not another frame
// or a full-card tint, and therefore never shifts the artwork or hit target.
const card=await sharp(path.join(output,'module.webp')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width,height}=card.info,focus=Buffer.alloc(width*height*4);
const neighbors=[[-5,0],[5,0],[0,-5],[0,5],[-4,-4],[-4,4],[4,-4],[4,4]];
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,a=card.data[i+3];if(a<24)continue;
    if(neighbors.every(([dx,dy])=>x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height&&card.data[((y+dy)*width+x+dx)*4+3]>128))continue;
    focus[i]=117;focus[i+1]=255;focus[i+2]=246;focus[i+3]=a;
}
await sharp(focus,{raw:{width,height,channels:4}}).webp({lossless:true}).toFile(path.join(output,'module-focus.webp'));

// A deliberately authored three-slice divider: diamond caps keep their exact
// proportions; only the plain, straight middle rail extends to the column height.
const divider=path.join(output,'divider.webp'),meta=await sharp(divider).metadata();
const cap=70,w=12,h=580,capHeight=Math.round(cap*w/meta.width);
const top=await sharp(divider).extract({left:0,top:0,width:meta.width,height:cap}).resize(w,capHeight).toBuffer();
const bottom=await sharp(divider).extract({left:0,top:meta.height-cap,width:meta.width,height:cap}).resize(w,capHeight).toBuffer();
const middle=await sharp(divider).extract({left:0,top:cap,width:meta.width,height:meta.height-2*cap}).resize(w,h-2*capHeight,{fit:'fill'}).toBuffer();
await sharp({create:{width:w,height:h,channels:4,background:'#00000000'}}).composite([
    {input:top,left:0,top:0},{input:middle,left:0,top:capHeight},{input:bottom,left:0,top:h-capHeight},
]).webp({lossless:true}).toFile(path.join(output,'column-divider.webp'));
await fs.writeFile(path.join(root,'docs/design-drafts/shared/catacomb-left-v4/source/normalization.json'),JSON.stringify({sourceSize:[info.width,info.height],boxes,divider:{width:w,height:h,capSource:cap,capHeight}},null,2)+'\n');
console.log('Exported canonical left-column frames, focus inlay, scroll, arrows and three-slice divider.');

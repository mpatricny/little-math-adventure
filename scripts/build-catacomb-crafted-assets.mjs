import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd(), source=path.join(root,'docs/design-drafts/shared/catacomb-crafted-v3/source');
const output=path.join(root,'public/assets/ui/catacomb-crafted-v3');
await fs.mkdir(output,{recursive:true});

async function matte(file){
    const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const {width:w,height:h}=info,clear=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
    const green=i=>{const p=i*4;return data[p+1]>135&&data[p+1]-Math.max(data[p],data[p+2])>70&&data[p]<130&&data[p+2]<130;};
    const add=i=>{if(!clear[i]&&green(i)){clear[i]=1;queue[end++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    for(let i=0;i<w*h;i++){const p=i*4;if(data[p+1]>230&&data[p]<35&&data[p+2]<35)add(i);}
    for(let n=0;n<end;n++){const i=queue[n],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    for(let i=0;i<clear.length;i++){
        const p=i*4,g=data[p+1],r=data[p],b=data[p+2],x=i%w,y=Math.floor(i/w);
        // Pure key inside a padlock shackle is background too; leaf greens are protected.
        if(clear[i]||(g>230&&r<35&&b<35)){data[p+3]=0;continue;}
        const edge=(x&&clear[i-1])||(x<w-1&&clear[i+1])||(y&&clear[i-w])||(y<h-1&&clear[i+w]);
        if(edge&&g>55&&g-Math.max(r,b)>10){data[p+3]=Math.round(255*Math.max(.2,1-(g-Math.max(r,b)-10)/240));data[p+1]=Math.min(g,Math.max(r,b)+4);}
    }
    return {data,info};
}
function bounds(data,info,cell){
    let left=cell.width,top=cell.height,right=0,bottom=0;
    for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++)if(data[((y+cell.top)*info.width+x+cell.left)*4+3]>32){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
    return {left:Math.max(0,left-8),top:Math.max(0,top-8),right:Math.min(cell.width,right+8),bottom:Math.min(cell.height,bottom+8)};
}
async function save(sheet,cell,b,name,size){
    let image=sharp(sheet.data,{raw:sheet.info}).extract({left:cell.left+b.left,top:cell.top+b.top,width:b.right-b.left,height:b.bottom-b.top});
    if(size)image=image.resize(size,size,{fit:'contain',background:'#00000000'});
    await image.webp({quality:94,alphaQuality:100}).toFile(path.join(output,name+'.webp'));
}
const frames=await matte(path.join(source,'frames.png'));
for(const [i,name] of ['title','label','skill','module','action','socket'].entries()){
    const cell={left:i%2*768,top:Math.floor(i/2)*341,width:768,height:i<4?341:342};
    await save(frames,cell,bounds(frames.data,frames.info,cell),name);
}
// Focus is a thin turquoise inlay following the original card silhouette. Keep
// the painted navy field, gold bevel, text and hit area intact on both renderers.
const card = await sharp(path.join(output, 'module.webp')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width, height} = card.info;
const inlay = Buffer.alloc(width * height * 4);
const insetSamples = [[-6, 0], [6, 0], [0, -6], [0, 6], [-4, -4], [-4, 4], [4, -4], [4, 4]];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = (y * width + x) * 4;
    const alpha = card.data[pixel + 3];
    if (alpha < 16) continue;
    const inner = insetSamples.every(([dx,dy]) => {
        const u = x + dx, v = y + dy;
        return u >= 0 && u < width && v >= 0 && v < height && card.data[(v * width + u) * 4 + 3] > 128;
    });
    if (inner) continue;
    inlay[pixel] = 123;
    inlay[pixel + 1] = 255;
    inlay[pixel + 2] = 253;
    inlay[pixel + 3] = alpha;
}
await sharp(inlay, {raw:{width, height, channels:4}}).webp({lossless:true}).toFile(path.join(output, 'module-focus.webp'));
for(const [file,names] of [['abilities.png',['shield','heal','strike']],['progress.png',['lock','paw','swords']]]){
    const sheet=await matte(path.join(source,file));
    for(const [row,name] of names.entries()){
        const cells=[0,1].map(col=>({left:col*512,top:row*512,width:512,height:512}));
        const boxes=cells.map(cell=>bounds(sheet.data,sheet.info,cell));
        const shared={left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))};
        for(const [col,state] of ['normal','active'].entries())await save(sheet,cells[col],shared,name+'-'+state,256);
    }
}
console.log('Exported six canonical frames and six paired icons.');

import sharp from 'sharp';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const forms=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const records=[];
for(const form of forms){
  const {data,info}=await sharp(form.source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=0,bottom=0,cleared=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const i=(y*info.width+x)*4;
    if(data[i+3]<8){if(data[i+3]>0)cleared++;data.fill(0,i,i+4);continue;}
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  const bounds={left,top,width:right-left+1,height:bottom-top+1};
  const crop=await sharp(data,{raw:info}).extract(bounds).resize(1056,1056,{fit:'inside'}).png().toBuffer();
  const size=await sharp(crop).metadata();
  const normalized=await sharp({create:{width:1200,height:1200,channels:4,background:'#00000000'}})
    .composite([{input:crop,left:Math.round((1200-size.width)/2),top:1140-size.height}]).png().toBuffer();
  await writeFile(path.join(root,form.master),normalized);
  await sharp(normalized).webp({quality:94,alphaQuality:100,effort:6}).toFile(path.join(root,form.asset));
  records.push({id:form.id,source:form.source,width:info.width,height:info.height,bounds,clearedNearTransparentPixels:cleared,canvas:1200,fit:1056,bottomPadding:60,master:form.master,preview:form.asset});
}
await writeFile(path.join(root,'assets/normalization.json'),JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify(records.map(({id,width,height,bounds})=>({id,width,height,bounds}))));

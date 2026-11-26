import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const dir=path.dirname(fileURLToPath(import.meta.url));
const metadata={tool:'built-in image_gen; deterministic Sharp normalization',chroma:{key:'#00ff00',transparentThreshold:18,opaqueThreshold:180,despill:true,edgeContract:1},output:[512,512],independentTrimming:false};
// Equivalent green-matte/edge cleanup to imagegen's remove_chroma_key.py;
// no painted edits, color grading, or individual subject transforms.
async function key(file){
 const {data,info}=await sharp(path.join(dir,`sources/${file}-key.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Protect enclosed cyan/gold rune artwork: only green connected to the
 // outside can be background. A global color key erases cyan edge accents.
 const count=info.width*info.height,exterior=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=0;
 const isKey=p=>{const i=p*4,r=data[i],g=data[i+1],b=data[i+2];return Math.max(r,255-g,b)<=32||g-Math.max(r,b)>=16;};
 const enqueue=p=>{if(!exterior[p]&&isKey(p)){exterior[p]=1;queue[tail++]=p;}};
 // Also seed unmistakable pure key inside enclosed holes (tail/neck gap).
 for(let p=0;p<count;p++)if(data[p*4]<65&&data[p*4+2]<65&&data[p*4+1]>160)enqueue(p);
 for(let x=0;x<info.width;x++){enqueue(x);enqueue((info.height-1)*info.width+x);}
 for(let y=0;y<info.height;y++){enqueue(y*info.width);enqueue(y*info.width+info.width-1);}
 while(head<tail){const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);if(x)enqueue(p-1);if(x<info.width-1)enqueue(p+1);if(y)enqueue(p-info.width);if(y<info.height-1)enqueue(p+info.width);}
 for(let i=0;i<data.length;i+=4){
  const [r,g,b]=data.subarray(i,i+3),m=Math.max(r,b),distance=Math.max(r,255-g,b),keyLike=!!exterior[i/4];
  const t=Math.max(0,Math.min(1,(distance-18)/162));
  const soft=t*t*(3-2*t)*255,dominance=g<=m?255:255*(1-Math.min(1,(g-m)/Math.max(1,255-m)));
  let a=Math.round((keyLike?Math.min(soft,dominance):255)*data[i+3]/255);
  if(a<=8)a=0;
  if(a===0){data[i]=data[i+1]=data[i+2]=data[i+3]=0;continue;}
  if(keyLike&&a<252)data[i+1]=Math.min(g,Math.max(0,Math.round(r*.65+b*.35)));
  data[i+3]=a;
 }
 const original=Buffer.from(data);
 for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){
  const offset=(y*info.width+x)*4;let min=255;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)min=Math.min(min,original[((y+dy)*info.width+x+dx)*4+3]);
  data[offset+3]=min;if(!min)data[offset]=data[offset+1]=data[offset+2]=0;
 }
 // Remove green reflections at the extracted contour, never inside runes.
 const contracted=Buffer.from(data);
 for(let y=3;y<info.height-3;y++)for(let x=3;x<info.width-3;x++){
  const i=(y*info.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
  if(!data[i+3]||g<=b+12||g<=r*.88)continue;
  let nearEdge=false;
  for(let dy=-3;dy<=3&&!nearEdge;dy++)for(let dx=-3;dx<=3;dx++)if(contracted[((y+dy)*info.width+x+dx)*4+3]<240){nearEdge=true;break;}
  if(nearEdge)data[i+1]=Math.min(g,Math.round(r*.65+b*.35));
 }
 const out=path.join(dir,`sources/${file}-alpha.png`);
 await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(out);
 return {out,width:info.width,height:info.height};
}
async function bounds(file){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=0,bottom=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return {left,top,right,bottom};
}
const forms=await key('forms'),cell=forms.width/3;
if(cell!==forms.height/2||!Number.isInteger(cell))throw new Error('Forms sheet must have 3x2 equal square cells');
const formBounds=[];
for(let i=0;i<5;i++){
 const file=path.join(dir,`body-${i}.webp`);
 await sharp(forms.out).extract({left:(i%3)*cell,top:Math.floor(i/3)*cell,width:cell,height:cell}).resize(432,432).extend({top:40,bottom:40,left:40,right:40,background:'#00000000'}).webp({quality:96}).toFile(file);
 formBounds.push(await bounds(file));
}
const expressions=await key('expressions'),expressionCell=expressions.width/3;
if(expressionCell!==expressions.height)throw new Error('Expressions sheet must have three square cells');
for(let i=0;i<3;i++)await sharp(expressions.out).extract({left:i*expressionCell,top:0,width:expressionCell,height:expressionCell}).resize(464,464).extend({top:24,bottom:24,left:24,right:24,background:'#00000000'}).webp({quality:96}).toFile(path.join(dir,`expression-${i}.webp`));
await sharp(expressions.out).extract({left:expressionCell,top:0,width:expressionCell,height:expressionCell}).png().toFile(path.join(dir,'canonical-friendly-clean.png'));
metadata.forms={source:'sources/forms-key.png',grid:[3,2],cell,sharedCrop:[0,0,cell,cell],sharedResize:[432,432],padding:40,bounds:formBounds};
metadata.expressions={source:'sources/expressions-key.png',grid:[3,1],cell:expressionCell,sharedResize:[464,464],padding:24,recommended:1};
metadata.runtime={frame:512,scale:0.25,logicalFramePixels:128};
metadata.status='Static concepts. Common crop/scale preserves small source pose differences; not interchangeable animation frames.';
await fs.writeFile(path.join(dir,'normalization.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));

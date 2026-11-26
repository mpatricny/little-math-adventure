import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const dir=path.dirname(fileURLToPath(import.meta.url));
const crop={left:62,top:50,width:620,height:620};
for(let i=0;i<3;i++)await sharp(path.join(dir,'sources/evolution.png'))
  .extract({...crop,left:i*724+crop.left}).resize(512,512)
  .webp({quality:94}).toFile(path.join(dir,`body-${i}.webp`));
// The image model placed rows unevenly. Each family uses one shared band/scale
// across all ranks; the complete ornaments are retained, never individually trimmed.
const bands=[{top:0,height:388},{top:390,height:380},{top:772,height:451}];
for(const [row,family] of ['shield','heal','strike'].entries())for(let rank=1;rank<=3;rank++){
  await sharp(path.join(dir,'sources/abilities.png'))
    .extract({left:(rank-1)*428,top:bands[row].top,width:428,height:bands[row].height})
    .resize({width:384,height:384,fit:'contain',background:'#00000000'})
    .webp({quality:94}).toFile(path.join(dir,`${family}-${rank}.webp`));
}
await sharp(path.join(dir,'sources/arena-clean.png')).resize({width:1672})
 .webp({quality:92}).toFile(path.join(dir,'arena-clean.webp'));
await sharp(path.join(dir,'sources/rune-frame.png')).trim({threshold:12})
 .resize({width:384,height:384,fit:'contain',background:'#00000000'})
 .webp({quality:94}).toFile(path.join(dir,'rune-frame.webp'));
await fs.writeFile(path.join(dir,'normalization.json'),JSON.stringify({
  bodies:{source:'sources/evolution.png',cell:[724,724],sharedCrop:crop,output:[512,512],baseline:418,independentTrimming:false},
  abilities:{source:'sources/abilities.png',columnWidth:428,sharedBands:bands,output:[384,384],independentTrimming:false},
  runtimeScale:{source:'src/scenes/BattleScene.ts:createPetCompanion',frame:512,catalogScale:0.5,PET_BASE_SCALE:0.5,result:0.25,logicalFramePixels:128},
  status:'Concept artwork, not approved production sprites. Body pose and proportion still need reconciliation with canonical production frame before video generation.'
},null,2)+'\n');

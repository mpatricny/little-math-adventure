async (page) => {
 const base='http://localhost:8013/docs/design-drafts/fox-battle-v5/index.html';
 const out='/Users/datamole/little-math-adventure/docs/design-drafts/fox-battle-v5/review/effect-recordings';
 await page.setViewportSize({width:1024,height:850});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(base);
 await page.waitForFunction(()=>window.foxBattle&&window.foxBattle.foxSprites.A.snapshot().animated);
 await page.evaluate(async()=>{await document.fonts.ready;});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const recordings=[];
 async function capture(name,action,limit=4000){
  await page.locator('#reset').click();
  await page.evaluate(()=>{for(const f of ['shield','heal','strike'])window.foxBattle.state.taught.add(f);});
  const frames=[];let fired=false,finishedAt=null;
  const start=Date.now();
  while(Date.now()-start<limit){
   if(!fired&&frames.length>=2){await action();fired=true;}
   const filename=out+'/'+name+'/'+String(frames.length).padStart(3,'0')+'.png';
   const at=Date.now()-start;
   await page.locator('#stage').screenshot({path:filename,animations:'allow'});
   frames.push({path:filename,at});
   const state=await page.evaluate(()=>window.foxBattle.snapshot());
   if(fired&&!state.busy&&finishedAt===null)finishedAt=Date.now();
   if(finishedAt!==null&&Date.now()-finishedAt>450)break;
   await page.waitForTimeout(45);
  }
  recordings.push({name,frames,state:await page.evaluate(()=>window.foxBattle.snapshot())});
 }
 await capture('healing',()=>page.locator('#heal').click());
 await capture('instant-strike',async()=>{await page.locator('#strike').click();await page.locator('#enemy2').click();});
 await page.locator('#reset').click();
 await page.locator('#shield').click();
 await page.waitForFunction(()=>!window.foxBattle.snapshot().busy);
 // Keep the shield applied for the whole blocked-hit recording. Reset in the
 // general capture helper would remove it, so capture this run explicitly.
 const frames=[];const start=Date.now();let fired=false,finishedAt=null;
 while(Date.now()-start<4000){
  if(!fired&&frames.length>=3){await page.locator('#hitShield').click();fired=true;}
  const filename=out+'/air-shield-block/'+String(frames.length).padStart(3,'0')+'.png',at=Date.now()-start;
  await page.locator('#stage').screenshot({path:filename,animations:'allow'});frames.push({path:filename,at});
  const state=await page.evaluate(()=>window.foxBattle.snapshot());
  if(fired&&!state.busy&&finishedAt===null)finishedAt=Date.now();
  if(finishedAt!==null&&Date.now()-finishedAt>500)break;
  await page.waitForTimeout(45);
 }
 recordings.push({name:'air-shield-block',frames,state:await page.evaluate(()=>window.foxBattle.snapshot())});
 return {recordings,errors};
}

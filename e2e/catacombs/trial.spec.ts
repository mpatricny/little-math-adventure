import { test,expect,openSeededGame,waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';
async function click(page:Page,id:string){
 const p=await page.evaluate(id=>{const h=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.sceneBuilder.get(id);return {x:h.x,y:h.y};},id);
 const b=(await page.locator('canvas').boundingBox())!;
 await page.mouse.click(b.x+p.x/1280*b.width,b.y+p.y/720*b.height);
}
async function screenshotPair(page:Page,name:string){
 await page.screenshot({path:`artifacts/catacombs/${name}.png`});
 await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(100);
 await page.screenshot({path:`artifacts/catacombs/${name}-tablet.png`});
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
}
for(const renderer of ['canvas','webgl'])test(`fox trial ${renderer}`,async({page})=>{
 if(renderer==='canvas')await page.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:any[]){if(type.includes('webgl'))return null;return (old as any).call(this,type,...args);} as typeof old;});
 await openSeededGame(page);
 await page.evaluate(()=>{(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',{examType:'fluency_challenge',subAtomId:'A1'});});
 await waitForScene(page,'CatacombTrialScene');await page.waitForTimeout(500);
 for(const width of [1280,1024]){
  await page.setViewportSize({width,height:width===1280?720:768});await page.waitForTimeout(250);
  await page.screenshot({path:`artifacts/catacombs/${renderer}-${width}-intro.png`});
 }
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(200);
 const bounds=await page.evaluate(()=>{
  const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
  return ['catacombTitle','catacombBody','catacombStats'].map(id=>{
   const t=s.mathBoard.modal.list.find((o:any)=>o.name===id);const h=s.sceneBuilder.getElementDef(id);const b=t.getBounds();
   return {id,fits:b.width<=h.width&&b.height<=h.height,resolution:t.frame.source.resolution};
  });
 });
 expect(bounds.every(b=>b.fits&&b.resolution===2)).toBe(true);
 await click(page,'catacombPrimary');
 let answered=0;
 const end=Date.now()+100000;
 while(Date.now()<end){
  const state=await page.evaluate(()=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;return {phase:s.phase,answered:s.mathBoard.answered,answer:s.currentProblem?.choices.indexOf(s.currentProblem.answer),hp:s.creatureHp,lives:s.playerLives};});
  if(['victory','defeat'].includes(state.phase))break;
  if(state.phase==='charging'&&!state.answered){
   if(answered===0)await screenshotPair(page,`${renderer}-question`);
   const index=answered===0?(state.answer+1)%3:state.answer;
   await click(page,`catacombAnswer${index+1}`);answered++;
   if(answered<=2)await screenshotPair(page,`${renderer}-${answered===1?'wrong':'correct'}`);
  }
  await page.waitForTimeout(250);
 }
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)).toBe('victory');
 await page.waitForTimeout(700);
 await screenshotPair(page,`${renderer}-victory`);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!));
 expect(saved.player.unlockedPets).toContain('catacomb_creature_A');
 expect(saved.mathStats.masteryData.globalSolveSequence).toBe(answered);
 await click(page,'catacombPrimary');await waitForScene(page,'GuildScene');
});

test('timeout, wrong answers, defeat and retry preserve working controls',async({page})=>{
 await openSeededGame(page);
 await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',{examType:'fluency_challenge',subAtomId:'A1'}));
 await waitForScene(page,'CatacombTrialScene');
 const b=(await page.locator('canvas').boundingBox())!;
 await page.mouse.move(b.x+797*b.width/1280,b.y+573*b.height/720);
 await page.waitForTimeout(200);await page.screenshot({path:'artifacts/catacombs/button-hover.png'});
 await page.mouse.down();await page.screenshot({path:'artifacts/catacombs/button-pressed.png'});
 await page.mouse.move(0,0);await page.mouse.up();await page.waitForTimeout(200);
 await page.screenshot({path:'artifacts/catacombs/button-pointer-out.png'});
 // Depending on pointer-up semantics, the previous press may already have started the trial.
 if(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)==='intro')await click(page,'catacombPrimary');
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)).toBe('charging');
 // Let one full production timer expire without touching scene state.
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.wrongCount),{timeout:25000}).toBe(1);
 for(let n=1;n<3;n++){
  await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase),{timeout:10000}).toBe('charging');
  const i=await page.evaluate(()=>{const p=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.currentProblem;return (p.choices.indexOf(p.answer)+1)%3;});
  await click(page,`catacombAnswer${i+1}`);
 }
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase),{timeout:15000}).toBe('defeat');
 await page.waitForTimeout(300);await page.screenshot({path:'artifacts/catacombs/defeat.png'});
 await click(page,'catacombSecondary');
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)).toBe('intro');
 await click(page,'catacombPrimary');
 await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)).toBe('charging');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets)).not.toContain('catacomb_creature_A');
});

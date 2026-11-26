import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { mkdir } from 'node:fs/promises';
import type { Page } from 'playwright/test';
const out='artifacts/mathboard-runtime/review';
const errors=new WeakMap<Page,string[]>();
test.afterEach(({page})=>expect(errors.get(page)??[]).toEqual([]));
async function start(page:Page,renderer:string){
 errors.set(page,[]);page.on('pageerror',error=>errors.get(page)!.push(error.stack??error.message));
 await mkdir(out,{recursive:true});await openSeededGame(page,false,{}, {},{equippedWeapon:'sword_wooden',seenGuides:['shop.intro.v1','shop.sword.v1','shop.shield.v1']});
 if(renderer==='canvas'){await page.goto('/?renderer=canvas');await waitForScene(page,'MenuScene');}
 expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer==='canvas'?1:2);
 await page.evaluate(async()=>{
  const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
  const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
  const g=GameStateManager.getInstance();g.loadSlot(0);const m=g.getMasteryData();
  m.comparisonChapter=createInitialComparisonChapterState('complete');m.subAtoms.A1.state='secure';g.save();
 });
}
async function choose(page:Page,correct=true,touch=false){
 await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
 const point=await page.evaluate(correct=>{
  const b=(window as any).__board,p=b.problems[b.currentProblemIndex];
  const i=p.choices.findIndex((v:number)=>correct?v===p.answer:v!==p.answer);
  const r=b.sequentialView.buttons[i].root;return r.getWorldTransformMatrix().transformPoint(0,0);
 },correct);
 const box=(await page.locator('#game-container canvas').boundingBox())!;
 const x=box.x+point.x/1280*box.width,y=box.y+point.y/720*box.height;
 if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
}
async function next(page:Page){
 await page.waitForFunction(()=>(window as any).__board.sequentialView.state.pendingNext);
 const point=await page.evaluate(()=>{const r=(window as any).__board.sequentialView.next.root;return r.getWorldTransformMatrix().transformPoint(0,0);});
 const box=(await page.locator('#game-container canvas').boundingBox())!;
 await page.mouse.click(box.x+point.x/1280*box.width,box.y+point.y/720*box.height);
}
async function screenshot(page:Page,name:string){await page.waitForTimeout(250);await page.locator('#game-container canvas').screenshot({path:`${out}/${name}.png`});}

for(const renderer of ['webgl','canvas']){
 test(`production comparison presentation keeps full expressions and stable touch controls — ${renderer}`,async({page})=>{
  await start(page,renderer);await page.setViewportSize({width:768,height:576});
  await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene',{fromArena:true,arenaLevel:1,wave:0}));
  await waitForScene(page,'BattleScene');
  await page.evaluate(async()=>{
   const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
   const {createComparisonDemoProblems}=await import('/src/systems/ComparisonLearningSystem.ts');
   const common={source:'player',showVisualHint:false,hintType:'none',damageMultiplier:4};
   const counted={...createComparisonDemoProblems('number_crocodile')[0],...common,id:'counted-production'};
   const expression={...common,id:'full-expression',operand1:12,operand2:8,operator:'+',operand3:19,operator3:'-',operand4:7,answer:2,choices:[0,1,2],problemType:'comparison_eq_vs_eq'};
   const three={...common,id:'three-terms',operand1:17,operator:'-',operand2:8,operand3:4,operator2:'+',operand4:13,answer:1,choices:[0,1,2],problemType:'comparison'};
   b.show([expression,counted,three]);(window as any).__board=b;(window as any).__visualComplete=[];
   b.onComplete=(...args:any[])=>(window as any).__visualComplete.push(args);
  });
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  await screenshot(page,`${renderer}-comparison-ready-tablet`);
  const first=await page.evaluate(()=>{
   const b=(window as any).__board,v=b.sequentialView,visibleText=v.question.list.filter((o:any)=>o.type==='Text');
   return{texts:visibleText.map((o:any)=>o.text),resolution:visibleText.map((o:any)=>[o.style.resolution,o.frame.source.resolution]),
    empty:v.relation.list[0].name,targets:v.buttons.map((o:any)=>[o.root.width,o.root.height])};
  });
  expect(first.texts).toEqual(['12 + 8','19 − 7']);expect(first.empty).toBe('emptyComparisonSlot');
  expect(first.resolution.every((r:number[])=>r[0]===2&&r[1]===2)).toBe(true);
  expect(first.targets.every((r:number[])=>r[0]*.6>=44&&r[1]*.6>=44)).toBe(true);
  const point=await page.evaluate(()=> (window as any).__board.sequentialView.buttons[0].root.getWorldTransformMatrix().transformPoint(0,0));
  const box=(await page.locator('#game-container canvas').boundingBox())!,x=box.x+point.x/1280*box.width,y=box.y+point.y/720*box.height;
  await page.mouse.move(x,y);await screenshot(page,`${renderer}-comparison-hover`);
  await page.mouse.down();await screenshot(page,`${renderer}-comparison-pressed`);
  await page.mouse.move(2,2);await page.mouse.up();await screenshot(page,`${renderer}-comparison-pointer-out`);
  expect(await page.evaluate(()=>(window as any).__board.results.length)).toBe(0);
  await choose(page,false);await page.waitForTimeout(1700);await screenshot(page,`${renderer}-comparison-wrong`);await next(page);
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);await screenshot(page,`${renderer}-count-numerals`);
  await choose(page,true,true);await next(page);await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  await screenshot(page,`${renderer}-comparison-three-terms`);await choose(page);await next(page);
  await page.waitForFunction(()=>(window as any).__visualComplete.length===1);
  expect(await page.evaluate(()=>(window as any).__visualComplete[0][1])).toEqual([false,true,true]);
  // Equipment can still generate factors up to 12 outside the mastery decks.
  await page.evaluate(()=>(window as any).__board.show([{id:'large-product',source:'pet',operator:'*',operand1:12,operand2:12,
    answer:144,choices:[132,144,156],damageMultiplier:4,showVisualHint:false,hintType:'none'}]));
  await choose(page,false);await page.waitForFunction(()=>(window as any).__board.sequentialView.state.pendingNext);
  const feedback=await page.evaluate(()=>{
   const v=(window as any).__board.sequentialView;return {bounds:v.feedback.getBounds(),area:v.h('feedback')};
  });
  expect(feedback.bounds.width).toBeLessThanOrEqual(feedback.area.width);
  expect(feedback.bounds.height).toBeLessThanOrEqual(feedback.area.height);
  await screenshot(page,`${renderer}-large-product-feedback`);
 });
 test(`guild answers once and preserves active timing — ${renderer}`,async({page})=>{
  await start(page,renderer);
  await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene'));
  await waitForScene(page,'GuildScene');
  await page.evaluate(()=>{
   const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
   g.currentMasteryExamType='sub_atom';g.currentMasteryExamTarget='A1';g.startTrial();(window as any).__board=g.illustratedTrialBoard;
  });
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  await screenshot(page,`${renderer}-guild-ready`);
  await page.evaluate(()=>(window as any).__board.activeTimeMs=1200);
  await choose(page,false);
  const before=await page.evaluate(()=>{const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;return{count:g.trialState.results.length,time:g.trialState.results[0].timeSpent,wrong:g.trialState.wrongCount};});
  expect(before.count).toBe(1);expect(before.wrong).toBe(1);expect(before.time).toBeLessThan(2);
  await page.evaluate(()=>(window as any).__board.submitChoice(0));
  await screenshot(page,`${renderer}-guild-wrong`);await next(page);
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.results.length)).toBe(1);
  await choose(page);await next(page);
  expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.correctCount)).toBe(1);
 });
 test(`catacomb timer stops at first answer and timeout cancels continuation — ${renderer}`,async({page})=>{
  await start(page,renderer);
  await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',{examType:'fluency_challenge',subAtomId:'A1'}));
  await waitForScene(page,'CatacombTrialScene');
  await page.evaluate(()=>{const c=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;c.startBattle();(window as any).__board=c.mathBoard.board;});
  await screenshot(page,`${renderer}-catacomb-ready`);await choose(page);
  const elapsed=await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.chargeElapsed);
  await page.waitForTimeout(2200);
  expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.chargeElapsed)).toBe(elapsed);
  await screenshot(page,`${renderer}-catacomb-feedback`);await next(page);
  await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.correctCount===1);
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  await page.evaluate(()=>{const c=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;c.onTimeout();(window as any).__board.submitChoice(0);});
  expect(await page.evaluate(()=>{const c=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;return[c.correctCount,c.wrongCount,(window as any).__board.acceptingAnswer];})).toEqual([1,1,false]);
 });
 test(`shop retains one rune per correct answer and adds a fresh problem after failure — ${renderer}`,async({page})=>{
  await start(page,renderer);await page.setViewportSize({width:1024,height:768});
  await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ShopScene'));
  await waitForScene(page,'ShopScene');
  await page.evaluate(()=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene;s.preparationOverlay.open('sword');(window as any).__board=s.preparationOverlay.mathBoard;});
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);await screenshot(page,`${renderer}-prep-ready`);await choose(page,false);await next(page);
  await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay.attemptsCompleted===1);
  expect(await page.evaluate(()=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;return[s.earnedCharges,s.plannedAttempts];})).toEqual([0,4]);
  for(let i=0;i<3;i++){await choose(page);await next(page);}
  await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay.root.getData('phase')==='complete');
  expect(await page.evaluate(()=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;return[s.earnedCharges,s.attemptsCompleted];})).toEqual([3,4]);
  await screenshot(page,`${renderer}-prep-complete`);
  const done=await page.evaluate(()=>{
   const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;
   return s.doneButton.root.getWorldTransformMatrix().transformPoint(0,0);
  });
  const box=(await page.locator('#game-container canvas').boundingBox())!;
  await page.touchscreen.tap(box.x+done.x/1280*box.width,box.y+done.y/720*box.height);
  expect(await page.evaluate(async()=>{
   const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene;
   const {PreparationSystem}=await import('/src/systems/PreparationSystem.ts');
   const state=PreparationSystem.getState(s.gameState.getPlayer());
   return [s.preparationOverlay.root.getData('phase'),state.kind,state.charges];
  })).toEqual(['closed','sword',3]);
 });
}

for (const [renderer, width, height] of [['webgl', 1280, 720], ['canvas', 768, 576]] as const) {
 test(`four numeric choices share one row and commit the fourth choice once — ${renderer}`, async ({page}) => {
  await page.setViewportSize({width, height});
  await start(page, renderer);
  await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene'));
  await waitForScene(page, 'GuildScene');
  await page.evaluate(() => {
   const guild=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
   guild.currentMasteryExamType='sub_atom';
   guild.currentMasteryExamTarget='A1';
   guild.startTrial();
   const common={showVisualHint:false, hintType:'none', operator:'+', source:'player'};
   guild.trialProblems=[
    {...common,id:'large-fourth',operand1:85,operand2:15,answer:100,choices:[80,85,95,100]},
    {...common,id:'miss-fourth',operand1:16,operand2:8,answer:24,choices:[22,24,25,26]},
    {...common,id:'legacy-three',operand1:3,operand2:2,answer:5,choices:[4,5,6]},
   ];
   guild.showCurrentProblem();
   (window as any).__board=guild.illustratedTrialBoard;
  });
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  const geometry=await page.evaluate(() => {
   const b=(window as any).__board, v=b.sequentialView;
   return {targets:v.buttons.map(({root}:any)=>({center:root.getWorldTransformMatrix().transformPoint(0,0),width:root.width,height:root.height})),
    remote:b.getActiveProblemSnapshot().choices};
  });
  expect(geometry.remote[3]).toEqual({index:3,label:'100'});
  const canvas=(await page.locator('#game-container canvas').boundingBox())!;
  const scale=canvas.width/1280;
  expect(geometry.targets.length).toBe(4);
  for(const [index,target] of geometry.targets.entries()){
   expect(target.center.y).toBe(geometry.targets[0].center.y);
   expect(target.height*scale).toBeGreaterThanOrEqual(44);
   expect(target.width*scale).toBeGreaterThanOrEqual(44);
   if(index)expect(target.center.x-geometry.targets[index-1].center.x).toBeGreaterThan(target.width);
  }
  const last=geometry.targets[3].center;
  const x=canvas.x+last.x*scale, y=canvas.y+last.y*canvas.height/720;
  await screenshot(page,`${renderer}-four-ready`);
  await page.mouse.move(x,y);await screenshot(page,`${renderer}-four-hover`);
  await page.mouse.down();await screenshot(page,`${renderer}-four-pressed`);
  await page.mouse.move(1,1);await page.mouse.up();await screenshot(page,`${renderer}-four-out`);
  expect(await page.evaluate(()=>(window as any).__board.results.length)).toBe(0);
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>(window as any).__board.sequentialView.state.pendingNext);
  await screenshot(page,`${renderer}-four-correct`);
  expect(await page.evaluate(()=>{
   const b=(window as any).__board, cp=b.exportCheckpoint();
   b.restoreCheckpoint(cp); b.submitChoice(3);
   return [cp.feedback[0].choiceIndex,cp.results,b.results];
  })).toEqual([3,[true],[true]]);
  await next(page);
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  await page.evaluate(()=>(window as any).__board.submitChoice(3));
  await page.waitForFunction(()=>(window as any).__board.sequentialView.state.pendingNext);
  await screenshot(page,`${renderer}-four-wrong`);
  const feedback=await page.evaluate(()=>{
   const view=(window as any).__board.sequentialView;
   return {width:view.feedback.getBounds().width,height:view.feedback.getBounds().height,area:view.h('feedback')};
  });
  expect(feedback.width).toBeLessThanOrEqual(feedback.area.width);
  expect(feedback.height).toBeLessThanOrEqual(feedback.area.height);
  await next(page);
  await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
  expect(await page.evaluate(()=>{
   const b=(window as any).__board; b.submitChoice(3);
   return [b.sequentialView.buttons.length,b.acceptingAnswer,b.getActiveProblemSnapshot().choices.length];
  })).toEqual([3,true,3]);
 });
}

test('four numeric choices fit the phone controller and send index three',async({page})=>{
 await page.setViewportSize({width:360,height:640});
 const commands:unknown[]=[];
 await page.routeWebSocket('**/test-relay', ws=>{
  ws.onMessage(raw=>{
   const msg=JSON.parse(String(raw));
   if(msg.kind==='hello'){
    ws.send(JSON.stringify({kind:'welcome',clientId:'fixture',role:'controller',room:'DEMO'}));
    ws.send(JSON.stringify({kind:'state',state:{screen:'math',title:'Spočítej',problem:'85 + 15 = ?',choices:[80,85,95,100].map((n,index)=>({index,label:String(n)}))}}));
   }else if(msg.kind==='command')commands.push(msg.command);
  });
 });
 await page.goto('/controller?room=DEMO&relay=ws://127.0.0.1/test-relay');
 const buttons=page.locator('.remote-four-answers button');
 await expect(buttons).toHaveCount(4);
 const boxes=await buttons.evaluateAll(items=>items.map(el=>el.getBoundingClientRect().toJSON()));
 expect(boxes.every(box=>box.y===boxes[0].y&&box.height>=44&&box.width>=44&&box.right<=360)).toBe(true);
 await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/four-phone.png`});
 await buttons.nth(3).click();
 await expect.poll(()=>commands).toEqual([{type:'answerChoice',index:3}]);
 await expect(buttons.nth(3)).toHaveText('100');
});

test('first advanced battle shows the tens transfer before scoring the first question',async({page})=>{
 await page.setViewportSize({width:768,height:576});
 await start(page,'canvas');
 await page.evaluate(async()=>{
  const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
  const {ensureAdvancedLearningBands}=await import('/src/systems/LearningProgress.ts');
  const g=GameStateManager.getInstance(),m=g.getMasteryData();
  for(const id of ['A','B','C','D','E']){
   m.bands[id].state='secure';m.bands[id].gateExamBestMedal='bronze';
   for(let i=1;i<=4;i++)m.subAtoms[id+i].state='secure';
  }
  m.practice={mode:'progress',introductionSeen:true};
  ensureAdvancedLearningBands(m);g.save();
  (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene',{enemyId:'slime_green',returnScene:'TownScene'});
 });
 await waitForScene(page,'BattleScene');
 await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice);
 const confirm=await page.evaluate(()=>{
  const battle=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
  const find=(obj:any):any=>obj.name==='practiceChoiceConfirm'?obj:obj.list?.map(find).find(Boolean);
  return find(battle.children).getWorldTransformMatrix().transformPoint(0,0);
 });
 const canvas=(await page.locator('#game-container canvas').boundingBox())!;
 await page.touchscreen.tap(canvas.x+confirm.x/1280*canvas.width,canvas.y+confirm.y/720*canvas.height);
 await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='player_turn');
 const opening=await page.evaluate(()=>{
  const battle=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
  (window as any).__board=battle.mathBoard;battle.onAttackClicked();
  const b=battle.mathBoard;
  return {phase:b.sequentialView.state.phase,opacity:b.container.alpha,choices:b.sequentialView.buttons.length,remote:b.getActiveProblemSnapshot()};
 });
 expect(opening).toEqual({phase:'demo',opacity:0,choices:0,remote:null});
 async function inspectDemo(name:string){
  await page.waitForFunction(()=>{
   const v=(window as any).__board.sequentialView;
   return v.state.phase==='demo' && v.numberDemoTransfer.list[0]?.alpha>=.99;
  });
  const demo=await page.evaluate(()=>{
   const b=(window as any).__board,v=b.sequentialView;
   const read=(o:any)=>o.list[0].list.map((token:any)=>token.text??'=').join(' ');
   return {accepting:b.acceptingAnswer,results:b.results,time:b.activeTimeMs,first:read(v.question),next:read(v.numberDemoTransfer),
    firstBox:v.question.getBounds(),nextBox:v.numberDemoTransfer.getBounds(),safeWidth:v.h('numberDemoTransfer').width};
  });
  await page.locator('#game-container canvas').screenshot({path:`${out}/${name}.png`});
  expect(demo.firstBox.y+demo.firstBox.height).toBeLessThan(demo.nextBox.y);
  expect(demo.nextBox.width).toBeLessThanOrEqual(demo.safeWidth);
  return demo;
 }
 const first=await inspectDemo('canvas-four-battle-F1-demo');
 expect([first.first,first.next,first.accepting,first.results,first.time]).toEqual(['1 + 2 = 3','10 + 20 = 30',false,[],0]);
 const replay=await page.evaluate(()=>{
  const battle=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,b=battle.mathBoard;
  const data=battle.gameState.getMasteryData();
  const saved=JSON.parse(JSON.stringify(b.exportCheckpoint()));
  const sequence=data.globalSolveSequence;
  const seen=data.advancedStages.F1.stages['add-tens'].introSeen;
  b.hide();
  const restored=b.restoreCheckpoint(saved);
  b.submitChoice(0);
  return {seen,restored,phase:b.sequentialView.state.phase,remote:b.getActiveProblemSnapshot(),
   seenAfter:data.advancedStages.F1.stages['add-tens'].introSeen,earned:data.globalSolveSequence-sequence,
   results:b.results,attemptTimes:b.timings,damage:b.damageDealt,elapsed:b.activeTimeMs,
   savedBatch:saved.problems,restoredBatch:b.problems};
 });
 expect(replay.restoredBatch).toEqual(replay.savedBatch);
 expect(replay.savedBatch[0].choices).toHaveLength(4);
 expect([replay.seen,replay.restored,replay.phase,replay.remote,replay.seenAfter,replay.earned,
  replay.results,replay.attemptTimes,replay.damage,replay.elapsed]).toEqual([false,true,'demo',null,false,0,[],[],0,0]);
 const repeated=await inspectDemo('canvas-four-battle-F1-restored-demo');
 expect([repeated.first,repeated.next,repeated.accepting,repeated.results,repeated.time]).toEqual(
  [first.first,first.next,false,[],0]);
 await page.waitForFunction(()=>(window as any).__board.acceptingAnswer);
 expect(await page.evaluate(()=>(window as any).__board.getActiveProblemSnapshot().choices.map((choice:any)=>Number(choice.label))))
  .toEqual(replay.savedBatch[0].choices);
 expect(await page.evaluate(async()=>{
  const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
  const stage=GameStateManager.getInstance().getMasteryData().advancedStages.F1.stages['add-tens'];
  const b=(window as any).__board;
  return [stage.introSeen,b.problems[0].masteryKey.startsWith('F1:'),b.sequentialView.buttons.length];
 })).toEqual([true,true,4]);
 await screenshot(page,'canvas-four-battle-F1-ready');
 await choose(page,true,true);
 await page.waitForFunction(()=>(window as any).__board.sequentialView.state.pendingNext);
 expect(await page.evaluate(()=>(window as any).__board.results)).toEqual([true]);

 // The longest transfer equation uses the same production hosts at tablet scale.
 await page.evaluate(async()=>{
  const {ADVANCED_NODES}=await import('/src/systems/AdvancedCurriculum.ts');
  const b=(window as any).__board;b.sequentialView.playNumberDemo(ADVANCED_NODES.H4.stages[1].demo,()=>{});
 });
 const longest=await inspectDemo('canvas-four-battle-H4-demo');
 expect(longest.next).toBe('36 + 27 − 14 = 49');
});

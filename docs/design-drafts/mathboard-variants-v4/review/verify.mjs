import {chromium} from 'playwright';
import fs from 'node:fs';
const dir='docs/design-drafts/mathboard-variants-v4/review';
const url='http://localhost:8013/docs/design-drafts/mathboard-variants-v4/index.html';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']}),page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(/api\/|supabase|telemetry/.test(r.url())&&!r.url().includes('/src/'))requests.push(r.url());});
const report={errors,requests,formats:[],modes:[],impacts:[],screens:[],tablet:[]};
function assert(condition,message){if(!condition)throw Error(message);}
async function ready(){await page.waitForFunction(()=>window.variants?.state.accepting);await page.waitForTimeout(240);}
async function state(){return page.evaluate(()=>window.variants.state);}
async function shot(name){await page.locator('#game').screenshot({path:`${dir}/${name}.png`});report.screens.push(name);}
async function choose(sample='addition',mode='attack',count=1){await page.evaluate(v=>window.variants.choose(...v),[sample,mode,count]);await ready();}
async function point(kind,index=0){const p=await page.evaluate(({kind,index})=>{const v=window.variants.view,o=kind==='answer'?v.buttons[index].root:kind==='demo'?v.demo.root:v.next.root,m=o.getWorldTransformMatrix();return{x:m.tx,y:m.ty};},{kind,index});const b=await page.locator('canvas').boundingBox();return{x:b.x+p.x*b.width/1326,y:b.y+p.y*b.height/941};}
async function click(kind,index=0){const p=await point(kind,index);await page.mouse.click(p.x,p.y,{delay:35});}
async function answer(correct=true){const i=await page.evaluate(correct=>{const s=window.variants.board.getActiveProblemSnapshot();const p=window.variants.samples.find(p=>s.problemId?.startsWith(p.id)||window.variants.state.problem.startsWith(p.id+'-'))?.problem;return p.choices.findIndex(v=>correct?v===p.answer:v!==p.answer);},correct);await click('answer',i);await page.waitForFunction(()=>window.variants.state.pendingNext);return state();}
await page.goto(url);await ready();report.webgl=await page.evaluate(()=>window.variants.scene.game.renderer.type);assert(report.webgl===2,'WebGL was replaced by a Canvas fallback');await shot('01-ready');
const p=await point('answer',0);await page.mouse.move(p.x,p.y);await page.waitForTimeout(130);await shot('02-hover');await page.mouse.down();await page.waitForTimeout(130);await shot('03-pressed');await page.mouse.move(2,2);await page.mouse.up();await page.waitForTimeout(150);await shot('04-pointer-out');assert((await state()).results.length===0,'Pointer-out submitted answer');
await answer(false);await shot('05-wrong');assert((await state()).damage===0,'Wrong answer earned damage');
await choose('addition','attack',3);await click('answer',1);await page.waitForFunction(()=>window.variants.state.phase==='quick');await shot('06-quick-transfer');await page.waitForFunction(()=>window.variants.state.pendingNext);await shot('07-correct-total');
assert((await state()).damage===5,'Expected production personal quick +1');await click('next');await ready();await shot('08-next-accumulated');assert((await state()).displayedTotal===5,'Accumulated attack lost between problems');
await click('answer',1);await page.waitForFunction(()=>window.variants.state.pendingNext);await click('next');await ready();await click('answer',1);await page.waitForFunction(()=>window.variants.state.pendingNext);await click('next');await page.waitForFunction(()=>window.variants.state.impact.phase==='done');
report.batch=await state();assert(report.batch.completions===1&&report.batch.damage===15&&report.batch.impact.hpAfter===8,'Batch completion or once-per-attack defense incorrect');await shot('09-complete-impact');
await choose();await page.waitForTimeout(8200);await answer();assert((await state()).damage===4,'Slow correct answer should retain base damage');await shot('slow-correct');
await choose('addition','defense');await page.waitForTimeout(8200);await answer();assert((await state()).blocked===3,'Slow shield answer should block base power');await shot('slow-defense');
const samples=await page.evaluate(()=>window.variants.samples.map(s=>s.id));
for(const sample of samples){
  await choose(sample);await shot(`format-${sample}-ready`);const good=await answer();await shot(`format-${sample}-correct`);
  assert(good.results.length===1&&good.results[0]===true,'Correct choice failed: '+sample);assert(good.displayedTotal===good.damage,'Counter mismatch: '+sample);
  await choose(sample);const bad=await answer(false);await shot(`format-${sample}-wrong`);assert(bad.damage===0&&bad.results.length===1&&!bad.results[0],'Wrong answer awarded: '+sample);
  report.formats.push({sample,good:good.damage,bad:bad.damage});console.log('format',sample);
}
for(const mode of await page.evaluate(()=>window.variants.modes.map(m=>m.id))){
  await choose(mode==='exam'?'expression-expression':'addition',mode,mode==='defense'?6:3);await shot(`mode-${mode}-ready`);const result=await answer();await shot(`mode-${mode}-correct`);
  if(mode==='defense'){assert(result.blocked===6,'Quick shield result wrong');await click('next');await page.waitForFunction(()=>window.variants.state.impact.phase==='done');assert((await state()).impact.target==='hero','Defense targets wrong character');await shot('mode-defense-impact');}
  report.modes.push({mode,damage:result.damage,blocked:result.blocked,displayedTotal:result.displayedTotal});console.log('mode',mode);
}
for(const which of ['normal','blocked','zero','last']){
  await page.evaluate(v=>window.variants.showImpact(v),which);await page.waitForFunction(()=>window.variants.state.impact.phase==='block');await shot(`impact-${which}-block`);await page.waitForFunction(()=>window.variants.state.impact.phase==='done');await shot(`impact-${which}-done`);const impact=(await state()).impact;
  assert(impact.raw-impact.blocked===impact.damage,'False damage equation');assert(impact.hpBefore-impact.hpLost===impact.hpAfter,'Incorrect HP loss');
  if(which==='blocked')assert(impact.blocked===2&&impact.defense===8&&impact.damage===0,'Defense capacity confused with actual blocked amount');
  if(which==='last')assert(impact.damage===10&&impact.hpLost===6&&impact.hpAfter===0,'Overkill HP incorrect');report.impacts.push({which,...impact});
}
await choose('size');await click('demo');await page.waitForFunction(()=>window.variants.state.teaching);await shot('demo-size');await page.waitForFunction(()=>window.variants.state.accepting&&!window.variants.state.teaching,{timeout:20000});assert((await state()).results.length===0&&(await state()).damage===0,'Demo awarded damage');
await choose('numbered');await click('demo');await page.waitForFunction(()=>window.variants.state.teaching);await choose();await page.waitForTimeout(2500);assert((await state()).results.length===0,'Demo leaked after restart');
await choose('symbols');await page.waitForTimeout(10300);assert(await page.evaluate(()=>window.variants.view.hints.every(h=>h.visible)),'Delayed hints not shown');await shot('comparison-hints');await answer();
await choose('addition','attack',6);await shot('six-problems');
for(const viewport of [{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(viewport);await choose('missing-three');await shot(`tablet-${viewport.width}-missing`);await answer(false);await shot(`tablet-${viewport.width}-wrong`);
  await choose('numbered');await shot(`tablet-${viewport.width}-comparison`);
  const geometry=await page.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),v=window.variants.view;return{overflow:document.documentElement.scrollWidth>innerWidth,targets:[...v.buttons.map(b=>b.root),v.next.root,v.demo.root].map(o=>({w:o.width*r.width/1326,h:o.height*r.height/941}))};});
  assert(!geometry.overflow&&geometry.targets.every(t=>t.w>=44&&t.h>=44),'Tablet touch geometry failed');report.tablet.push({viewport,...geometry});
}
await page.setViewportSize({width:1440,height:1080});await page.goto(url+'?renderer=canvas');await ready();report.canvas=await page.evaluate(()=>window.variants.scene.game.renderer.type);assert(report.canvas===1,'Canvas fixture did not use Canvas');
for(const sample of ['addition','missing-three','expression-expression','size','numbered','symbols']){await choose(sample);await shot(`canvas-${sample}-ready`);await answer();await shot(`canvas-${sample}-correct`);}
report.text=await page.evaluate(()=>{const out=[];const visit=o=>{if(o.type==='Text')out.push({style:o.style.resolution,source:o.frame.source.resolution});if(o.list)o.list.forEach(visit);};visit(window.variants.view.root);return out;});
assert(report.text.every(t=>t.style===2&&t.source===2),'Canvas text resolution mismatch');
await page.locator('#words').click();await shot('no-words');report.storage=await page.evaluate(()=>Object.keys(localStorage));
await choose();await click('answer',1);await choose();await page.waitForTimeout(2000);assert((await state()).results.length===0,'Stale answer animation after reset');
// Keep the completed desktop report even if a fresh mobile process cannot boot.
// Release the long-running software GL context before allocating the touch device.
fs.writeFileSync(`${dir}/functional-review.json`,JSON.stringify(report,null,2));await browser.close();
const touchBrowser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']});
const context=await touchBrowser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true}),tp=await context.newPage();await tp.goto(url);await tp.waitForFunction(()=>window.variants?.state.accepting);
const box=await tp.locator('canvas').boundingBox();await tp.touchscreen.tap(box.x+663*box.width/1326,box.y+499*box.height/941);await tp.waitForFunction(()=>window.variants.state.pendingNext);assert(await tp.evaluate(()=>window.variants.state.results[0]),'Touch answer failed');await tp.locator('#game').screenshot({path:`${dir}/tablet-touch.png`});await context.close();
report.touch=true;fs.writeFileSync(`${dir}/functional-review.json`,JSON.stringify(report,null,2));await touchBrowser.close();console.log(JSON.stringify({formats:report.formats.length,modes:report.modes.length,impacts:report.impacts,errors,requests},null,2));assert(!errors.length&&!requests.length,'Errors or external write requests');

import {chromium} from 'playwright';
import fs from 'node:fs';
const dir='docs/design-drafts/mathboard-reference-v3/review';
const url='http://localhost:8013/docs/design-drafts/mathboard-reference-v3/index.html';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/api\/|supabase|telemetry/.test(r.url())&&!r.url().includes('/src/'))requests.push(r.url());});
const report={errors,requests,states:[],tablet:[]};
async function ready(){await page.waitForFunction(()=>window.referencePreview?.state.accepting);}
async function shot(name){await page.locator('#game').screenshot({path:`${dir}/${name}.png`});report.states.push(name);}
async function point(kind,i=0){const p=await page.evaluate(({kind,i})=>{const v=window.referencePreview.view,o=kind==='answer'?v.buttons[i].root:v.next,m=o.getWorldTransformMatrix();return {x:m.tx,y:m.ty};},{kind,i});const b=await page.locator('canvas').boundingBox();return{x:b.x+p.x*b.width/1326,y:b.y+p.y*b.height/941};}
async function click(kind,i=0){const p=await point(kind,i);await page.mouse.click(p.x,p.y,{delay:35});}
async function answer(i){await click('answer',i);await page.waitForFunction(()=>window.referencePreview.state.pendingNext);await page.waitForTimeout(230);}
async function restart(){await page.locator('#replay').click();await ready();}
await page.goto(url);await ready();await shot('01-ready');
const p=await point('answer',0);await page.mouse.move(p.x,p.y);await page.waitForTimeout(150);await shot('02-hover');
await page.mouse.down();await page.waitForTimeout(130);await shot('03-pressed');
await page.mouse.move(3,3);await page.mouse.up();await page.waitForTimeout(150);await shot('04-pointer-out');
if((await page.evaluate(()=>window.referencePreview.state.results.length))!==0)throw Error('Pointer-out submitted an answer');
await answer(0);await shot('05-wrong');if((await page.evaluate(()=>window.referencePreview.state.damage))!==0)throw Error('Wrong answer earned damage');
await restart();await answer(1);await shot('06-correct');await click('next');await ready();
await page.waitForTimeout(5300);await answer(1);await shot('07-slow-correct');await click('next');await ready();
await answer(1);await shot('08-quick');
const batch=await page.evaluate(()=>window.referencePreview.state);if(batch.damage!==13||JSON.stringify(batch.results)!=='[true,true,true]')throw Error('Expected real 4+4+5 = 13 damage: '+JSON.stringify(batch));
await click('next');await page.waitForFunction(()=>window.referencePreview.state.completed);await shot('09-complete');
report.batch=await page.evaluate(()=>window.referencePreview.state);if(report.batch.completions!==1)throw Error('Completion callback repeated');
await page.locator('#words').click();await shot('10-no-words');
for(const size of [{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(size);await restart();await shot(`tablet-${size.width}-ready`);await answer(1);await shot(`tablet-${size.width}-correct`);
  const geometry=await page.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),v=window.referencePreview.view;return {overflow:document.documentElement.scrollWidth>innerWidth,targets:[...v.buttons.map(b=>b.root),v.next].map(b=>({w:b.width*r.width/1326,h:b.height*r.height/941}))};});
  if(geometry.overflow||geometry.targets.some(t=>t.w<44||t.h<44))throw Error('Tablet layout failed');report.tablet.push({size,...geometry});
}
await page.setViewportSize({width:1440,height:1080});await page.goto(url+'?renderer=canvas');await ready();await shot('canvas-ready');await answer(1);await shot('canvas-correct');
report.text=await page.evaluate(()=>window.referencePreview.view.buttons.map(b=>({style:b.label.style.resolution,source:b.label.frame.source.resolution,rootScale:b.root.scaleX,surfaceY:b.surface.y})));
if(report.text.some(t=>t.style!==2||t.source!==2||t.rootScale!==1||t.surfaceY!==0))throw Error('Text or surface contract failed');
report.storage=await page.evaluate(()=>Object.keys(localStorage));
await restart();await click('answer',1);await restart();await page.waitForTimeout(1700);
if((await page.evaluate(()=>window.referencePreview.state.results.length))!==0)throw Error('Stale answer after reset');
await page.locator('#reference').click();await page.waitForTimeout(100);report.referencePaused=await page.evaluate(()=>window.referencePreview.scene.scene.isPaused());await page.locator('#reference').click();
if(!report.referencePaused)throw Error('Clock runs under reference image');
const touch=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true});const tp=await touch.newPage();await tp.goto(url);await tp.waitForFunction(()=>window.referencePreview?.state.accepting);
const b=await tp.locator('canvas').boundingBox();await tp.touchscreen.tap(b.x+663*b.width/1326,b.y+478*b.height/941);await tp.waitForFunction(()=>window.referencePreview.state.pendingNext);report.touch=await tp.evaluate(()=>window.referencePreview.state.results[0]);
await tp.locator('#game').screenshot({path:`${dir}/tablet-touch.png`});await touch.close();
fs.writeFileSync(`${dir}/functional-review.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));if(errors.length||requests.length)process.exitCode=1;

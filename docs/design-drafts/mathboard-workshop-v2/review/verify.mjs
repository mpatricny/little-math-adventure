import {chromium} from 'playwright';
import fs from 'node:fs';
const dir='docs/design-drafts/mathboard-workshop-v2/review';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const report={formats:[],modes:[],batch:null,hover:null,tablet:[],canvas:[],errors};
const url='http://localhost:8013/docs/design-drafts/mathboard-workshop-v2/index.html';
await page.goto(url);await ready();
async function ready(){await page.waitForFunction(()=>!!window.workshop?.board?.getActiveProblemSnapshot());await page.waitForTimeout(90);}
async function shot(name){await page.locator('#game').screenshot({path:`${dir}/${name}.png`});}
async function coords(kind,i){const v=await page.evaluate(({kind,i})=>{const v=window.workshop.view;const item=kind==='answer'?v.buttons[i].root:v[kind].root;const m=item.getWorldTransformMatrix();return {x:m.tx,y:m.ty};},{kind,i});const box=await page.locator('canvas').boundingBox();return {x:box.x+v.x*box.width/1280,y:box.y+v.y*box.height/720};}
async function click(kind,i=0){const p=await coords(kind,i);await page.mouse.click(p.x,p.y,{delay:45});}
async function answer(good){const i=await page.evaluate(good=>{const p=window.workshop.view.problem;return p.choices.findIndex(v=>good?v===p.answer:v!==p.answer);},good);await click('answer',i);await page.waitForFunction(()=>window.workshop.state.pendingNext);return await page.evaluate(()=>window.workshop.state);}
async function next(){await click('next');}
const ids=await page.evaluate(()=>window.workshop.samples.map(x=>x.id));
for(const id of ids){await page.locator(`[data-sample="${id}"]`).click();await ready();await shot(`${id}-ready`);const good=await answer(true);if(good.results.length!==1||good.results[0]!==true)throw Error(id+' correct failed');await shot(`${id}-correct`);await next();await page.waitForFunction(()=>window.workshop.state.completions===1);
 await page.locator('#replay').click();await ready();const bad=await answer(false);if(bad.results.length!==1||bad.results[0]!==false||bad.damage!==0)throw Error(id+' wrong failed');await shot(`${id}-wrong`);report.formats.push({id,correct:true,wrong:true,completionOnce:true});console.log('format',id);fs.writeFileSync(`${dir}/functional-results.json`,JSON.stringify(report,null,2));}
await page.locator('[data-sample="addition"]').click();await ready();const pos=await coords('answer',0);await page.mouse.move(pos.x,pos.y);await page.waitForTimeout(160);await shot('answer-hover');const hover=await page.evaluate(()=>window.workshop.view.buttons[0].surface.y);
await page.mouse.down();await page.waitForTimeout(150);await shot('answer-pressed');const press=await page.evaluate(()=>window.workshop.view.buttons[0].surface.y);
await page.mouse.move(5,5);await page.mouse.up();await page.waitForTimeout(160);const out=await page.evaluate(()=>({y:window.workshop.view.buttons[0].surface.y,n:window.workshop.state.results.length}));if(hover!==-4||press!==1||out.y!==0||out.n!==0)throw Error('pointer states failed');report.hover={hover,press,out};
const modes=await page.evaluate(()=>window.workshop.modes.map(m=>m.id));for(const mode of modes){await page.locator(`[data-mode="${mode}"]`).click();await ready();await shot('mode-'+mode);await answer(true);await shot('mode-'+mode+'-correct');report.modes.push(mode);}
await page.locator('[data-mode="attack"]').click();await page.locator('#count').selectOption('3');await ready();await answer(true);await next();await ready();await answer(false);await next();await ready();await answer(true);await shot('batch-mixed');await next();await page.waitForFunction(()=>window.workshop.state.completions===1);report.batch=await page.evaluate(()=>window.workshop.state);if(JSON.stringify(report.batch.results)!=='[true,false,true]')throw Error('batch failed');
await page.locator('#count').selectOption('1');await page.locator('[data-sample="size"]').click();await ready();await click('demo');await page.waitForFunction(()=>window.workshop.state.teaching);await shot('demo-mid');await page.waitForFunction(()=>!window.workshop.state.teaching&&!!window.workshop.board.getActiveProblemSnapshot(),{timeout:30000});if((await page.evaluate(()=>window.workshop.state.results.length))!==0)throw Error('demo awarded credit');report.demo=true;
// Real tablet viewport, with both orientations and the same rendered components.
for(const viewport of [{width:1024,height:768},{width:768,height:1024}]){await page.setViewportSize(viewport);await page.locator('[data-sample="expression-expression"]').click();await ready();await shot(`tablet-${viewport.width}-expressions`);await answer(true);await shot(`tablet-${viewport.width}-correct`);
 const targets=await page.evaluate(()=>{const rect=document.querySelector('canvas').getBoundingClientRect(),v=window.workshop.view;return [...v.buttons,v.demo,v.next].map(b=>({w:b.root.width*rect.width/1280,h:b.root.height*rect.height/720}));});if(targets.some(t=>t.w<44||t.h<44))throw Error('tablet target <44px');report.tablet.push({viewport,targets});}
await page.locator('[data-sample="numbered"]').click();await page.locator('#words').click();await ready();await shot('tablet-no-words');
await page.goto(url+'?renderer=canvas');await ready();for(const id of ['addition','missing-three','expression-expression','size','numbered','symbols']){await page.locator(`[data-sample="${id}"]`).click();await ready();await shot(`canvas-${id}`);await answer(false);report.canvas.push(id);}
await page.goto(url+'?mode=catacomb');await ready();await page.waitForFunction(()=>window.workshop.state.results.length===1,{timeout:20000});const timeout=await page.evaluate(()=>window.workshop.state);if(timeout.results[0]!==false)throw Error('timeout did not fail');report.timeout=true;
fs.writeFileSync(`${dir}/functional-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({formats:report.formats.length,modes:report.modes.length,errors}));await browser.close();if(errors.length)process.exitCode=1;

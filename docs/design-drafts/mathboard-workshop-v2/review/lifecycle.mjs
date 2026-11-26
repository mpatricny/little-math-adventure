import {chromium} from 'playwright';import fs from 'node:fs';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1024,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const result={};try{
 await page.goto('http://localhost:8013/docs/design-drafts/mathboard-workshop-v2/index.html');await ready();
 await page.evaluate(()=>{window.workshop.board.submitChoice(1);window.workshop.board.submitChoice(1);});
 await page.waitForTimeout(1000);result.doubleAnswer=await page.evaluate(()=>window.workshop.state.results.length);if(result.doubleAnswer!==1)throw Error('duplicate answer');
 await page.locator('[data-sample="size"]').click();await ready();await page.evaluate(()=>window.workshop.view.demo.root.emit('pointerdown'));await page.evaluate(()=>window.workshop.view.demo.root.emit('pointerup'));await page.waitForTimeout(900);
 await page.locator('[data-sample="addition"]').click();await ready();await page.waitForTimeout(1300);result.switchDuringDemo=await page.evaluate(()=>({id:window.workshop.state.problem,teaching:window.workshop.state.teaching,results:window.workshop.state.results.length,transients:window.workshop.view.transient.length}));
 if(result.switchDuringDemo.id!=='addition-0'||result.switchDuringDemo.teaching||result.switchDuringDemo.results)throw Error('stale demo');
 await page.locator('[data-mode="defense"]').click();await ready();await page.waitForTimeout(5300);await page.evaluate(()=>window.workshop.board.submitChoice(1));await page.waitForTimeout(900);result.slowShield=await page.evaluate(()=>window.workshop.view.blocked);if(result.slowShield!==3)throw Error('slow shield');
 await page.locator('[data-mode="coop"]').click();await ready();await page.evaluate(()=>window.workshop.board.submitChoice(1));await page.waitForTimeout(950);await continueNext();await page.waitForTimeout(450);await continueNext();await ready();result.coopOwner=await page.evaluate(()=>window.workshop.view.player);if(result.coopOwner!==2)throw Error('coop ownership');
 await page.locator('[data-sample="symbols"]').click();await ready();await page.waitForTimeout(10200);result.reminders=await page.evaluate(()=>window.workshop.view.hints.every(h=>h.visible));if(!result.reminders)throw Error('reminders missing');
 await page.locator('[data-mode="exam"]').click();await ready();await page.waitForTimeout(10200);result.examNoReminders=await page.evaluate(()=>window.workshop.view.hints.every(h=>!h.visible));if(!result.examNoReminders)throw Error('exam hint');
 result.textureResolutions=await page.evaluate(()=>{const list=[];function visit(o){if(o.type==='Text')list.push({style:o.style.resolution,source:o.frame.source.resolution});if(o.list)o.list.forEach(visit);}visit(window.workshop.view.root);return list;});
 if(result.textureResolutions.some(t=>t.style!==2||t.source!==2))throw Error('text resolution');
 result.storage=await page.evaluate(()=>Object.keys(localStorage));if(result.storage.some(k=>/save|slot|progress/i.test(k)))throw Error('unexpected save write');
 result.errors=errors;if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync('docs/design-drafts/mathboard-workshop-v2/review/lifecycle-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
async function ready(){await page.waitForFunction(()=>!!window.workshop?.board?.getActiveProblemSnapshot());await page.waitForTimeout(100);}
async function continueNext(){await page.evaluate(()=>{const b=window.workshop.view.next.root;b.emit('pointerdown');b.emit('pointerup');});}

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const out='docs/design-drafts/catacombs-access-v1/review';
const browser=await chromium.launch({headless:true});
const errors=[],checks=[];
try {
 const context=await browser.newContext({viewport:{width:1280,height:940}});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8001/docs/design-drafts/catacombs-access-v1/index.html');
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);
 for(const width of [1280,1024,768]){
  await page.setViewportSize({width,height:Math.round(width*9/16)+230});
  await page.waitForTimeout(150);
  await page.locator('#fit').screenshot({path:`${out}/overview-${width}.png`});
  const sizes=await page.locator('button:visible').evaluateAll(bs=>bs.map(b=>({label:b.getAttribute('aria-label')||b.textContent.trim(),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})));
  const small=sizes.filter(b=>b.width<44||b.height<44);if(small.length)throw new Error(JSON.stringify(small));
  await page.locator('#more').click();await page.locator('#fit').screenshot({path:`${out}/requirements-${width}.png`});
  await page.locator('#back').click();checks.push({width,minimumTarget:Math.min(...sizes.flatMap(s=>[s.width,s.height]))});
 }
 await page.setViewportSize({width:1280,height:940});
 await page.locator('#words').click();await page.locator('#fit').screenshot({path:`${out}/overview-no-words.png`});
 await page.locator('#words').click();await page.locator('#ready').click();await page.waitForTimeout(700);
 await page.locator('#fit').screenshot({path:`${out}/ready.png`});
 await page.locator('#more').click();await page.locator('#fit').screenshot({path:`${out}/trial-preview.png`});
 await page.locator('#trialBack').click();await page.locator('[data-view="entrance"]').click();
 await page.locator('#fit').screenshot({path:`${out}/entrance.png`});
 await page.locator('#door').click();if(!await page.locator('#overview').isVisible())throw new Error('Door does not open overview');
 const storage=await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}));
 await writeFile(`${out}/review.json`,JSON.stringify({errors,checks,storage},null,2));
 console.log(JSON.stringify({errors,checks,storage}));
}finally{await browser.close();}

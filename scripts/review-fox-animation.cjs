async (page) => {
 const root='/Users/datamole/little-math-adventure/docs/design-drafts/fox-animation-v1';
 const output=root+'/review';
 const checks=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://localhost:8013/docs/design-drafts/fox-animation-v1/index.html');
 await page.waitForFunction(()=>window.foxAnimationReview?.snapshot().loaded);
 const manifest=await page.evaluate(()=>fetch('./manifest.json').then(r=>r.json()));
 for(const [id,form]of Object.entries(manifest.forms)){
  await page.locator(`[data-id="${id}"]`).click();
  for(const [motion,clip]of Object.entries(form.motions)){
   await page.locator(`[data-motion="${motion}"]`).click();
   await page.waitForFunction(({id,motion})=>{const s=window.foxAnimationReview.snapshot();return s.loaded&&s.id===id&&s.motion===motion;},{id,motion});
   const state=await page.evaluate(()=>window.foxAnimationReview.snapshot());
   check(id+'/'+motion+' forward',state.entry.playback.every((n,i)=>n===i),state.entry.playback);
   check(id+'/'+motion+' bounded atlas',clip.width<=2048&&clip.height<=2048,{width:clip.width,height:clip.height});
   const pixels=await page.evaluate(()=>{const c=document.getElementById('preview');const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let visible=0,edge=0;for(let i=3;i<a.length;i+=4){if(a[i]>32){visible++;const p=(i-3)/4,x=p%c.width,y=Math.floor(p/c.width);if(x<3||y<3||x>c.width-4||y>c.height-4)edge++;}}return{visible,edge};});
   check(id+'/'+motion+' visible, clear edges',pixels.visible>10000&&pixels.edge===0,pixels);
  }
  await page.locator('[data-motion="idle"]').click();await page.waitForFunction(()=>window.foxAnimationReview.snapshot().loaded);
  await page.evaluate(()=>window.foxAnimationReview.showFrame(0));
  await page.locator('#canvasHost').screenshot({path:output+`/fox-${id}-dark.png`});
 }
 await page.locator('[data-id="01"]').click();await page.locator('[data-motion="attack"]').click();await page.waitForFunction(()=>window.foxAnimationReview.snapshot().loaded);
 await page.evaluate(()=>window.foxAnimationReview.showFrame(3));
 await page.screenshot({path:output+'/gallery-desktop-light-effect.png',fullPage:true});
 for(const motion of ['attack','cast']){
  await page.locator(`[data-motion="${motion}"]`).click();await page.waitForFunction(()=>window.foxAnimationReview.snapshot().loaded);
  const count=await page.evaluate(()=>window.foxAnimationReview.snapshot().entry.frames);
  const dir=output+'/fox-01-'+motion+'-light-frames';
  for(let n=0;n<count;n++){
   await page.evaluate(n=>window.foxAnimationReview.showFrame(n),n);
   await page.locator('#preview').screenshot({path:dir+'/'+String(n).padStart(2,'0')+'.png'});
  }
 }
 await page.locator('#backdrop').click();await page.evaluate(()=>window.foxAnimationReview.showFrame(3));
 await page.locator('#canvasHost').screenshot({path:output+'/fox-01-light-background.png'});
 await page.setViewportSize({width:1024,height:768});
 await page.screenshot({path:output+'/gallery-tablet.png',fullPage:true});
 const sizes=await page.locator('button').evaluateAll(buttons=>buttons.map(b=>({text:b.textContent.trim(),w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));
 check('tablet touch targets',sizes.every(s=>s.w>=44&&s.h>=44),sizes);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 check('no horizontal overflow',!overflow,overflow);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>window.foxAnimationReview?.snapshot().loaded);
 check('reduced motion starts paused',!(await page.evaluate(()=>window.foxAnimationReview.snapshot().playing)));
 await page.emulateMedia({reducedMotion:'no-preference'});
 check('no runtime errors',errors.length===0,errors);
 return{date:new Date().toISOString(),checks,passed:checks.filter(c=>c.pass).length,forms:Object.keys(manifest.forms),errors,output};
}

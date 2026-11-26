import { expect, test, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import type { Page, CDPSession } from 'playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve(__dirname, '../../artifacts/catacomb-left-review');
async function frame(page: Page) {
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}
async function point(page: Page, name: string) {
    const p = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const scan = (o: any): any => !o || o.visible === false ? null : o.name === name ? o : o.list?.map(scan).find(Boolean);
        const o = scene.children.list.map(scan).find(Boolean);
        if (!o) throw Error('Missing control ' + name);
        const m = o.getWorldTransformMatrix(); return {x:m.tx, y:m.ty};
    }, name);
    const box = (await page.locator('canvas').boundingBox())!;
    return {x:box.x+p.x*box.width/1280, y:box.y+p.y*box.height/720};
}
async function tap(page: Page, name: string) {
    const p=await point(page,name);
    if(page.viewportSize()!.width>=1280)await page.mouse.click(p.x,p.y);
    else await page.touchscreen.tap(p.x,p.y);
    await frame(page);
}
async function settled(page: Page, name: string, y: number) {
    await page.waitForFunction(({name,y})=>{
        const scene=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const root=scene.children.getByName('catacombProgress');
        return root.getAll()[1].getByName(name)?.getByName('surface')?.y===y;
    },{name,y});
}
async function saved(page: Page) {
    return page.evaluate(() => [0,1].map(slot => {
        const s=JSON.parse(localStorage.getItem('littleMathAdventure_slot_'+slot)!);
        return {pin:s.mathStats.masteryData.practice?.pinnedTargetId, pet:s.player.activePet, fox:s.player.catacombFoxJourney, bonus:s.player.catacombFoxBonus};
    }));
}
async function model(page: Page) {
    return page.evaluate(() => {
        const scene=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const root=scene.children.getByName('catacombProgress'), content=root.getAll()[1];
        const controls=content.list.filter((o:any)=>o.name==='catacombPinned'||o.name==='catacombFoxLesson'||/^catacombModule:|^catacombModules:/.test(o.name));
        const canvas=scene.game.canvas.getBoundingClientRect();
        const errors:any[]=[], ink:any[]=[], missing:string[]=[], rows:any[]=[];
        for(const control of controls){
            const surface=control.getByName('surface'), frame=surface.getByName('frame');
            const texts=surface.list.filter((o:any)=>o.type==='Text'&&o.text);
            const bounds=texts.map((o:any)=>({text:o.text,...o.getBounds()}));
            const illustration=surface.list.find((o:any)=>/^catacomb-painted-operation-/.test(o.texture?.key??''));
            if(illustration&&control.name.startsWith('catacombModule:')){
                const art=illustration.getBounds();
                for(const line of texts){
                    const b=line.getBounds();
                    if(Math.min(art.bottom,b.bottom)>Math.max(art.top,b.top)&&b.left<art.right+6)
                        errors.push({control:control.name,illustrationGap:b.left-art.right,text:line.text});
                }
            }
            for(const line of texts){
                const region=line.getData('safeRegion');
                if(line.displayWidth>region.width+1||line.displayHeight>region.height+1)errors.push({control:control.name,text:line.text,w:line.displayWidth,h:line.displayHeight,region});
                let enamel=true;
                for(const dx of [-1,1])for(const dy of [-1,1]){
                    const x=frame.displayOriginX+(line.x+dx*(line.displayWidth/2+2))/frame.scaleX;
                    const y=frame.displayOriginY+(line.y+dy*(line.displayHeight/2+2))/frame.scaleY;
                    const color=scene.textures.getPixel(Math.floor(x),Math.floor(y),frame.texture.key);
                    if(!color||color.alpha<240||color.blue<=color.red)enamel=false;
                }
                ink.push({control:control.name,text:line.text,enamel});
            }
            for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
                const a=bounds[i],b=bounds[j];
                if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1)
                    errors.push({control:control.name,collision:[a.text,b.text]});
            }
            rows.push({name:control.name,selected:!!control.getData('selected'),pinned:control.getData('pinned'),enabled:!!control.input?.enabled,
                alpha:surface.alpha,pressed:!!control.getData('pressed'),x:control.x,y:control.y,surfaceY:surface.y,
                hitWidth:control.width*canvas.width/1280,hitHeight:control.height*canvas.height/720,
                pinMarker:!!surface.getByName('pinnedModuleMarker'),focus:!!surface.getByName('viewedModuleOutline'),
                frame:frame.texture.key,texts:texts.map((o:any)=>o.text)});
        }
        const scan=(o:any)=>{if(o.visible===false)return;if(o.texture?.key==='__MISSING')missing.push(o.name||o.type);o.list?.forEach(scan)};scan(root);
        return {page:root.getData('modulePage'),pages:root.getData('modulePages'),count:root.getData('moduleCount'),target:root.getData('target'),pinned:root.getData('pinned'),rows,errors,ink,missing};
    });
}
async function capture(page: Page, name: string, hideWords=false) {
    const result=await model(page);
    if(hideWords)await page.evaluate(()=>{
        const scene=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;scene.game.sound.mute=true;
        const scan=(o:any)=>{if(o.type==='Text'&&o.getData('word'))o.setVisible(false);o.list?.forEach(scan)};scan(scene.children.getByName('catacombProgress'));
    });
    await frame(page);await fs.mkdir(out,{recursive:true});
    await page.screenshot({path:path.join(out,name+'.png')});
    await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2));
    expect(result.errors).toEqual([]); expect(result.missing).toEqual([]);
    expect(result.ink.filter(o=>!o.enamel),'All left captions sit on blue enamel').toEqual([]);
    for(const row of result.rows.filter(r=>r.enabled)){
        expect(row.hitWidth).toBeGreaterThanOrEqual(44);expect(row.hitHeight).toBeGreaterThanOrEqual(44);
    }
    return result;
}
async function open(page: Page, canvas: boolean, firstPlayer: Record<string, unknown> = {}) {
    const pets={level:12, unlockedPets:['catacomb_creature_A','silverpond_mill_turtle'], ownedPets:['pet_catacomb_A','pet_silverpond_mill_turtle'],activePet:'pet_silverpond_mill_turtle'};
    await openSeededGame(page,true,{}, {},{...pets,name:'Maxmiliánka',catacombFoxBonus:4,...firstPlayer},{...pets,name:'Alexandřinka',catacombFoxBonus:3});
    if(canvas){await page.goto('/?renderer=canvas');await waitForScene(page,'MenuScene');}
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {ProblemDatabase}=await import('/src/systems/ProblemDatabase.ts');
        const state=GameStateManager.getInstance(),db=ProblemDatabase.getInstance();
        for(const slot of [0,1]){
            state.loadSlot(slot);const data=state.getMasteryData()!;
            data.selectedStartBand='D';data.practice={mode:'progress',pinnedTargetId:slot===0?'E4':'D1'};
            for(const [id,band] of Object.entries(data.bands))band.state=(slot===0?'DE':'D').includes(id)?'training':'locked';
            for(const [id,atom] of Object.entries(data.subAtoms)){
                const open=(slot===0?'DE'.includes(id[0]):['D1','D2','D3'].includes(id));
                atom.state=!open?'locked':id==='D1'?'mastery':['E1','E2'].includes(id)?'secure':'fluent';
                atom.successfulSolves=open?65:0;atom.examBestMedal=open?'gold':null;
                atom.fluencyChallengeResult=['fluent','mastery'].includes(atom.state)?'pass':null;
                atom.masteryChallengeResult=atom.state==='mastery'?'pass':null;
                if(!open)continue;
                const pool=['result_unknown','missing_part'].flatMap(form=>db.getProblemsForForm(id,form).slice(0,8));
                for(let n=0;n<40&&pool.length;n++){
                    const p=pool[n%pool.length],rec=data.problemRecords[p.key]??={problemKey:p.key,subAtomId:id,form:p.form,attempts:[]};
                    rec.attempts.push({correct:true,responseTimeMs:['E1','E2'].includes(id)?2000:14200,timestamp:Date.now()-3600000+n,context:'battle',sequenceIndex:++data.globalSolveSequence});
                }
            }
            state.save();
        }
        state.loadSlot(0);
    });
    await activateCoopSession(page);
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start('GuildScene'));
    await waitForScene(page,'GuildScene');await tap(page,'catacombDoorway');
}

for(const canvas of [true,false])for(const viewport of [{width:1024,height:600,name:'tablet'},{width:1280,height:800,name:'desktop'}])
test(`module cards, pin and paging ${canvas?'Canvas':'WebGL'} ${viewport.name}`,async({page})=>{
    await page.setViewportSize(viewport);await open(page,canvas);
    const tag=(canvas?'canvas':'webgl')+'-'+viewport.name, before=await saved(page);
    const initial=await capture(page,tag+'-first');
    expect(initial.count).toBe(8);expect(initial.pages).toBe(3);expect(initial.page).toBe(0);
    expect(initial.rows.find(o=>o.name==='catacombFoxLesson')?.texts).toContain('Zkouška\nštítu');
    expect(initial.rows.find(o=>o.name==='catacombModules:previous')).toMatchObject({enabled:false,alpha:.28});
    const target=initial.rows.find(o=>o.name.startsWith('catacombModule:'))!.name;
    await tap(page,target);
    const selected=await capture(page,tag+'-viewed');
    expect(selected.rows.find(o=>o.name===target)).toMatchObject({selected:true,focus:true,pinned:false});
    const p=await point(page,target);
    let touch: CDPSession | undefined;
    if(viewport.name==='desktop'){
        await page.mouse.move(10,10);await frame(page);await page.mouse.move(p.x,p.y);await settled(page,target,-3);
        const hovered=await capture(page,tag+'-hover');
        expect(hovered.rows.find(o=>o.name===target)).toMatchObject({surfaceY:-3});
        await page.mouse.down();
    } else {
        touch=await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:0}]});
    }
    await settled(page,target,2);
    const pressed=await capture(page,tag+'-pressed');
    expect(pressed.rows.find(o=>o.name===target)).toMatchObject({pressed:true,surfaceY:2});
    if(touch){
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:10,y:10,id:0}]});
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
    }else{await page.mouse.move(10,10);await page.mouse.up();}
    await settled(page,target,0);
    const released=await capture(page,tag+'-pointer-out');
    expect(released.rows.find(o=>o.name===target)).toMatchObject({pressed:false,surfaceY:0});
    await tap(page,'catacombModules:next');
    const middle=await capture(page,tag+'-middle');expect(middle.page).toBe(1);
    expect(middle.rows.filter(o=>o.name.startsWith('catacombModules:')).every(o=>o.enabled)).toBe(true);
    await tap(page,'catacombModules:next');
    const last=await capture(page,tag+'-last');expect(last.page).toBe(2);
    expect(last.rows.find(o=>o.name==='catacombModules:next')).toMatchObject({enabled:false,alpha:.28});
    await tap(page,'catacombModules:previous');await tap(page,'catacombPinned');
    const pin=await capture(page,tag+'-pinned');
    expect(pin.target).toBe('E4');expect(pin.rows.find(o=>o.name==='catacombModule:E4')).toMatchObject({pinned:true,pinMarker:true,selected:true,focus:true});
    await tap(page,'catacombOwner:1');
    const single=await capture(page,tag+'-single');expect(single.count).toBe(3);expect(single.pages).toBe(1);
    expect(single.rows.some(o=>o.name.startsWith('catacombModules:'))).toBe(false);
    await tap(page,'catacombModule:D1');await capture(page,tag+'-without-words',true);
    expect(await saved(page)).toEqual(before);
    if(canvas&&viewport.name==='desktop'){
        await page.evaluate(async()=>{
            const {CatacombProgressOverlay}=await import('/src/ui/CatacombProgressOverlay.ts');
            const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
            const scene=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            const overlay:any=CatacombProgressOverlay.forScene(scene),data=overlay.profiles[overlay.profileIndex].stats.masteryData;
            data.selectedStartBand='A';data.comparisonChapter=createInitialComparisonChapterState('complete');
            for(const band of Object.values(data.bands) as any[])band.state='training';
            for(const atom of Object.values(data.subAtoms) as any[]){atom.state='secure';atom.examBestMedal='gold';atom.fluencyChallengeResult=null;atom.masteryChallengeResult=null;}
            overlay.prepareSnapshot();overlay.page=0;overlay.target='A1';overlay.lesson=false;overlay.render();
        });
        const catalogTargets:string[]=[];
        for(let n=0;;n++){
            const all=await capture(page,tag+'-catalog-'+String(n+1).padStart(2,'0'));
            expect(all.rows.some(o=>o.name==='catacombFoxLesson')).toBe(false);
            expect(all.pages).toBe(Math.ceil(all.count / 4));
            catalogTargets.push(...all.rows.filter(o=>o.name.startsWith('catacombModule:')).map(o=>o.name));
            if(all.page+1>=all.pages)break;
            await tap(page,'catacombModules:next');
        }
        expect(new Set(catalogTargets).size).toBe(33);
        expect(catalogTargets).toHaveLength(33);
        for(const target of ['A3','D3','D4','E4','F4','G4','H4','comparison_symbols']){
            await page.evaluate(async target=>{
                const {CatacombProgressOverlay}=await import('/src/ui/CatacombProgressOverlay.ts');
                const scene=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene,overlay:any=CatacombProgressOverlay.forScene(scene);
                overlay.profiles[overlay.profileIndex].stats.masteryData.practice.pinnedTargetId=target;
                overlay.target=target;overlay.page=overlay.pageForTarget(target);overlay.render();
            },target);
            await capture(page,tag+'-pin-'+target);
        }
    }
    const audit=isolatedDevProfileAudit(page);expect(audit.observed.filter(url=>!audit.intercepted.includes(url))).toEqual([]);
});

test('all powers learned leaves four practice cards and a single fox header entry',async({page})=>{
    await page.setViewportSize({width:1024,height:600});
    const lessons=Object.fromEntries(['shield','heal','strike'].map(id=>[id,{targetId:'D1',earnedAt:1,evidenceId:id}]));
    await open(page,true,{catacombFoxJourney:{version:1,awards:{},lessons}});
    await tap(page,'catacombOwner:0');
    const initial=await capture(page,'tablet-all-powers-learned');
    expect(initial.rows.some(o=>o.name==='catacombFoxLesson')).toBe(false);
    expect(initial.rows.filter(o=>o.name.startsWith('catacombModule:'))).toHaveLength(4);
    expect(initial.pages).toBe(2);
    const first=initial.rows.find(o=>o.name.startsWith('catacombModule:'))!;
    await tap(page,first.name);
    expect((await model(page)).target).toBe(first.name.split(':')[1]);
    await tap(page,'catacombModules:next');
    await tap(page,'catacombPinned');
    expect((await model(page)).rows.find(o=>o.name==='catacombModule:E4')).toMatchObject({selected:true,pinMarker:true});
    await tap(page,'catacombJourney');
    await tap(page,'catacombJourneyBack');
    expect((await model(page)).rows.some(o=>o.name==='catacombFoxLesson')).toBe(false);
});

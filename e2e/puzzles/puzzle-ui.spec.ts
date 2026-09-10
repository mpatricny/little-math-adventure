import { solveBridge } from './helpers/bridge-harness';
import { test, expect, openSeededGame } from '../arena/helpers/arena-harness';
import { tap } from '../underwater/hands-on-helpers';
import type { Page } from 'playwright/test';
async function waterTap(page: Page, field: string, id: string) {
    const pos=await page.evaluate(({field,id})=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene,h=s[field].builder.get(id);return{x:h.x,y:h.y};},{field,id});
    await tap(page,pos.x,pos.y);await page.waitForTimeout(270);
}
async function waterSelection(page:Page,field:string,wrong=false){
    const config=await page.evaluate(async({field,wrong})=>{
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene,p=s[field],c=s.activePuzzle.payload;
        if(field==='bellPuzzle'||field==='currentPuzzle'){
            const solution=c.solutions[0];let target=[...solution];
            if(wrong){
                const mod=field==='bellPuzzle'?await import('/src/systems/UnderwaterBellProblems.ts'):await import('/src/systems/UnderwaterCurrentProblems.ts');
                const evaluate=(mod as any).evaluatePearlFlow??(mod as any).evaluateCurrents;
                outer:for(let a=0;a<c.cards.length;a++)for(let b=0;b<c.cards.length;b++)for(let d=0;d<c.cards.length;d++){
                    const pick=field==='bellPuzzle'?[a,b]:[a,b,d];
                    if(new Set(pick).size===pick.length&&!evaluate(c,pick).correct){target=pick;break outer;}
                }
            }
            return{kind:'cards',current:p.selected.filter((i:any)=>i!==null),target,prefix:field==='bellPuzzle'?'flow':'current'};
        }
        if(field==='pumpPuzzle')return{kind:'cycles',current:[...p.selected],target:c.solution.map((v:number,i:number)=>wrong&&i===0?(v+1)%c.options[i].length:v),lengths:c.options.map((a:any[])=>a.length),prefix:'pumpRotor'};
        if(field==='routingPuzzle')return{kind:'cycles',current:p.selected.map(Number),target:c.solution.map((v:boolean,i:number)=>Number(wrong&&i===0?!v:v)),lengths:[2,2,2],prefix:'routingSwitch'};
        if(field==='reversePuzzle')return{kind:'one',index:wrong?(c.answerIndex+1)%c.cards.length:c.answerIndex};
        if(field==='lightPuzzle'){
            const {lightSolutions,traceUnderwaterLight}=await import('/src/systems/UnderwaterLightPuzzle.ts');
            const allowed=c.allowedTurns??[0,1,2,3],solution=lightSolutions(c).find((s:number[])=>s.every(v=>allowed.includes(v)));
            let target=solution;
            if(wrong)for(let i=0;i<solution.length;i++){
                const changed=[...solution];changed[i]=allowed[(allowed.indexOf(changed[i])+1)%allowed.length];
                if(!traceUnderwaterLight(changed,c).solved){target=changed;break;}
            }
            return{kind:'cycles',current:p.turns.map((v:number)=>allowed.indexOf(v)),target:target.map((v:number)=>allowed.indexOf(v)),lengths:[0,1,2,3].map(()=>allowed.length),prefix:'lightMirror'};
        }
        if(field==='wordChest')return{kind:'cycles',current:[...p.indexes],target:p.options.map((a:string[],i:number)=>(a.indexOf(c.word[i])+(wrong&&i===0?1:0))%a.length),lengths:p.options.map((a:any[])=>a.length),prefix:'wordWheel'};
        throw new Error(field);
    },{field,wrong});
    if(config.kind==='cards'){
        for(const i of config.current!)await waterTap(page,field,`${config.prefix}Card${i}Host`);
        for(const i of config.target!)await waterTap(page,field,`${config.prefix}Card${i}Host`);
    }else if(config.kind==='one')await waterTap(page,field,`reverseCard${config.index}Host`);
    else for(let i=0;i<config.target!.length;i++){
        const steps=(config.target![i]-config.current![i]+config.lengths![i])%config.lengths![i];
        for(let n=0;n<steps;n++)await waterTap(page,field,`${config.prefix}${i}Host`);
    }
}
const waterRun:Record<string,string>={bellPuzzle:'bellInstrumentHost',currentPuzzle:'iconCurrentRunHost',pumpPuzzle:'iconPumpRunHost',reversePuzzle:'iconReverseRunHost',routingPuzzle:'iconRoutingRunHost',lightPuzzle:'lightRunHost',wordChest:'iconUnlockHost'};


async function startScene(page: Page, key: string, data: Record<string,unknown> = {}) {
    await page.evaluate(({key,data}) => {
        const g=(globalThis as any).__LITTLE_MATH_GAME__;
        g.scene.getScenes(true).forEach((s:any)=>g.scene.stop(s.scene.key)); g.scene.start(key,data);
    },{key,data});
    await page.waitForFunction(key=>(globalThis as any).__LITTLE_MATH_GAME__.scene.isActive(key),key);
    await page.waitForFunction(key=>!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys[key].cameras.main.fadeEffect?.isRunning,key);
    await page.waitForTimeout(250);
}
async function snap(page:Page,prefix:string,phase:string){await page.screenshot({path:`artifacts/puzzles/${prefix}-${phase}.png`});}
async function host(page:Page,scene:string,id:string,field='sceneBuilder'){
    return page.evaluate(({scene,id,field})=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys[scene];const h=s[field].get(id);return{x:h.x,y:h.y};},{scene,id,field});
}

for(const setup of [
    {band:'A',canvas:true,width:1280,height:720}, {band:'E',canvas:false,width:1280,height:720},
    {band:'A',canvas:false,width:1024,height:768}, {band:'E',canvas:true,width:1024,height:768},
])test(`puzzle surfaces, real controls and generated solutions ${JSON.stringify(setup)}`,async({page})=>{
    await page.setViewportSize({width:setup.width,height:setup.height});
    if(setup.canvas)await page.addInitScript(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(kind:string,...args:any[]){
            if(['webgl','webgl2','experimental-webgl'].includes(kind))return null;
            return (original as any).call(this,kind,...args);
        } as typeof original;
    });
    await openSeededGame(page);
    await page.evaluate(async band=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {JourneySystem}=await import('/src/systems/JourneySystem.ts');
        const {UNDERWATER_ROOMS}=await import('/src/systems/UnderwaterProgressSystem.ts');
        const gs=GameStateManager.getInstance();gs.beginUnderwaterPreview();
        const m=gs.getMasteryData(),bands=['A','B','C','D','E'];
        for(const b of bands) {
            m.bands[b].state=b===band?'training':bands.indexOf(b)<bands.indexOf(band)?'mastery':'locked';
            for(const n of [1,2,3,4])m.subAtoms[`${b}${n}`].state=bands.indexOf(b)<=bands.indexOf(band)?'training':'locked';
        }
        if(band==='A')for(const n of [2,3,4])m.subAtoms[`A${n}`].state='locked';
        const p=gs.getPlayer();p.maxHp=p.hp=99;p.mana=20;
        p.underwaterProgress={schemaVersion:1,active:true,introSeen:true,roomId:'sp_bell_hub',entryId:'shallows',visitedRooms:[],openedChests:[],bellNotes:0,puzzleAttempts:0,
            defeatedEncounters:Object.values(UNDERWATER_ROOMS).flatMap((r:any)=>r.encounter?[r.encounter.id]:[])};
        JourneySystem.getInstance().startRoomJourney('verdant_forest','forest_riddle',true);
    },setup.band);
    const prefix=`${setup.band}-${setup.canvas?'canvas':'webgl'}-${setup.width}`;
    expect(await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(setup.canvas?1:2);
    // Rocket: six distinct selectable objects, including equal values, and an actual pointer submission.
    await startScene(page,'ZyxCrystalMachineScene',{testMode:true});
    await snap(page,prefix,'rocket-normal');
    const solution=await page.evaluate(()=>{
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene,c=s.puzzleInstance.payload;
        for(let a=0;a<c.values.length;a++)for(let b=a+1;b<c.values.length;b++)for(let d=b+1;d<c.values.length;d++)
            if(c.values[a]+c.values[b]+c.values[d]===c.target)return[a,b,d];
        throw new Error('No rocket solution');
    });
    for(const i of solution){const p=await host(page,'ZyxCrystalMachineScene',`machineNumber${i+1}Host`);await tap(page,p.x,p.y);}
    await page.waitForFunction(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.phase==='calibrated');
    await snap(page,prefix,'rocket-correct');
    // Bridge: both physical gaps must be filled; returning keeps all seven numbers.
    await startScene(page,'ForestRiddleScene',{roomId:'forest_riddle'});
    await snap(page,prefix,'bridge-normal');
    const bridge=await page.evaluate(()=>({payload:JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.puzzleInstance.payload)}));
    await solveBridge(page);
    await snap(page,prefix,'bridge-correct');
    await startScene(page,'ForestRiddleScene',{roomId:'forest_riddle'});
    expect(await page.evaluate(()=>JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.puzzleInstance.payload))).toBe(bridge.payload);
    await snap(page,prefix,'bridge-return');
    // Existing generic forest overlays remain on their production rendering paths.
    for(const puzzleId of ['number_bridge','balance_scale','path_choice','crystal_offering']) {
        await startScene(page,'ForestPuzzleScene',{puzzleId,objectId:puzzleId,returnScene:'ForestRoomScene',returnData:{roomId:'deep_forest'}});
        await snap(page,prefix,`${puzzleId}-normal`);
        const correct=await page.evaluate(()=>{
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestPuzzleScene;
            return s.currentTemplate;
        });
        expect(correct).toBeTruthy();
        const points=await page.evaluate(()=>{
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestPuzzleScene,c=s.currentTemplate;
            let ids:number[];
            if(s.puzzleConfig.type==='sum_to_target'){
                ids=[];outer:for(let a=0;a<c.items.length;a++)for(let b=a+1;b<c.items.length;b++)for(let d=b+1;d<c.items.length;d++)
                    if(c.items[a].value+c.items[b].value+c.items[d].value===c.target){ids=[a,b,d];break outer;}
            }else ids=s.requiredAnswers.map((v:number)=>s.optionButtons.findIndex((o:any)=>o.getData('value')===v));
            return ids.map(i=>({x:s.optionButtons[i].x,y:s.optionButtons[i].y}));
        });
        for(const p of points)await tap(page,p.x,p.y);
        if(puzzleId==='crystal_offering')await tap(page,640,550);
        await page.waitForFunction(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestPuzzleScene.puzzleInstance.completed);
        await snap(page,prefix,`${puzzleId}-correct`);
    }
    await startScene(page,'GuardianLairScene');
    await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.openRitual());
    await page.waitForTimeout(800);await snap(page,prefix,'offering-normal');
    const crystals=await page.evaluate(()=>{
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene,c=s.puzzleInstance.payload;
        for(let a=0;a<c.values.length;a++)for(let b=a+1;b<c.values.length;b++)for(let d=b+1;d<c.values.length;d++)
            if(c.values[a]+c.values[b]+c.values[d]===c.target)return[a,b,d].map(i=>({x:s.crystals[i].root.x,y:s.crystals[i].root.y}));
        throw new Error('No ritual solution');
    });
    for(const p of crystals)await tap(page,p.x,p.y);
    const ritualButton=await host(page,'GuardianLairScene','ritualButtonHost');await tap(page,ritualButton.x,ritualButton.y);
    await page.waitForFunction(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.puzzleInstance.completed);
    await snap(page,prefix,'offering-correct');
    for(const scene of ['SpinLockPuzzleScene','LetterLockPuzzleScene']) {
        await startScene(page,scene,{roomId:'deep_forest',objectId:scene,parentScene:'ForestRoomScene'});
        await snap(page,prefix,`${scene}-normal`);
        const wheelPlan=await page.evaluate(scene=>{
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys[scene];
            return s.wheelOptions.map((options:string[],i:number)=>{
                const current=s.currentIndices?.[i]??s.wheels[i].optionIndex;
                const steps=(options.indexOf(s.answer[i])-current+options.length)%options.length;
                if(s.wheelLayers){const b=s.wheelLayers[i].getBounds();return{steps,x:b.centerX,y:b.centerY};}
                return{steps,x:s.wheels[i].text.x,y:350};
            });
        },scene);
        for(const w of wheelPlan)for(let n=0;n<w.steps;n++){await tap(page,w.x,w.y);await page.waitForTimeout(350);}
        const button=await page.evaluate(scene=>{
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys[scene];
            if(scene==='LetterLockPuzzleScene')return{x:640,y:510};
            const zone=s.children.list.find((o:any)=>o.type==='Zone'&&o.depth===20);return{x:zone.x,y:zone.y};
        },scene);
        await tap(page,button.x,button.y);
        await page.waitForFunction(scene=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys[scene].isSolved,scene);
        await snap(page,prefix,`${scene}-correct`);
    }
    // Open each water puzzle via the real room hotspot after granting only its world prerequisites.
    for(const [room,field] of [['sp_bell_hub','bellPuzzle'],['sp_reed_garden','currentPuzzle'],['sp_sunken_canal','pumpPuzzle'],['sp_shell_shrine','reversePuzzle'],['sp_current_chamber','routingPuzzle'],['sp_glow_grotto','lightPuzzle'],['sp_shallows','wordChest']] as const) {
        await startScene(page,'UnderwaterRoomScene',{roomId:room});
        await page.waitForFunction(() => {const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;return s.party.length>0&&!s.revealing;});
        const id=field==='bellPuzzle'?'bellHost':field==='wordChest'?'chestHost':'mechanismHost';
        const pos=await host(page,'UnderwaterRoomScene',id,'builder');await tap(page,pos.x,pos.y);
        await page.waitForFunction(field=>Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene[field]),field);
        await snap(page,prefix,`${field}-normal`);
        await waterSelection(page,field,true);
        await page.waitForTimeout(450);
        const saved=await page.evaluate(()=>JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.state));
        const allocated=await page.evaluate(()=>JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.payload));
        await page.evaluate(()=> (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.closePuzzle());
        await tap(page,pos.x,pos.y);
        await page.waitForFunction(field=>Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene[field]),field);
        expect(await page.evaluate(()=>JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.payload))).toBe(allocated);
        expect(await page.evaluate(()=>JSON.stringify((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.state))).toBe(saved);
        await snap(page,prefix,`${field}-restored`);
        await waterTap(page,field,waterRun[field]);
        await page.waitForTimeout(field==='routingPuzzle'?2000:350);
        expect(await page.evaluate(()=> (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.firstCorrect)).toBe(false);
        await snap(page,prefix,`${field}-wrong`);
        await page.waitForFunction(field=>{const p=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene[field];return p&&!p.phase||p?.phase==='building';},field);
        await waterSelection(page,field);
        await snap(page,prefix,`${field}-selected`);
        await waterTap(page,field,waterRun[field]);
        expect(await page.evaluate(()=> (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.completed)).toBe(true);
        await page.waitForTimeout(field==='routingPuzzle'?2000:350);
        await snap(page,prefix,`${field}-correct`);
    }
});

test('second bridge and longest riddle fit the production layouts', async ({page}) => {
    await openSeededGame(page);
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {JourneySystem}=await import('/src/systems/JourneySystem.ts');
        GameStateManager.getInstance().beginUnderwaterPreview();
        JourneySystem.getInstance().startRoomJourney('verdant_forest','ancient_bridge',true);
    });
    await startScene(page,'ForestRiddleScene',{roomId:'ancient_bridge'});
    await solveBridge(page);
    await snap(page,'final','ancient-bridge-correct');
    await startScene(page,'GuardianLairScene');
    await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.openRitual());
    await page.waitForFunction(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.crystals.every((c:any)=>c.root.alpha>0.95));
    expect(await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.hintText.getBounds().top)).toBeGreaterThan(100);
    await snap(page,'final','guardian-desktop');
    await page.setViewportSize({width:1024,height:768});await snap(page,'final','guardian-tablet');
    await page.setViewportSize({width:1280,height:720});
    await startScene(page,'SpinLockPuzzleScene',{roomId:'ancient_bridge',objectId:'long-riddle',parentScene:'ForestRoomScene'});
    const audit=await page.evaluate(async()=>{
        const {wordPools}=await import('/src/systems/puzzles/WordPuzzles.ts');
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene;
        const texts=s.sceneBuilder.get('Spin frame').getData('textObjects');
        const text=texts.get('1770852558035-agtscuz25').text,title=texts.get('1770852383215-0rdg3l638').text;
        const wheelTop=Math.min(...s.wheelLayers.map((w:any)=>w.getBounds().top));
        let largest={riddle:'',height:0};const failures:string[]=[];
        for(const r of wordPools.riddles){
            text.setText(r.riddle);const b=text.getBounds();
            if(b.bottom>=wheelTop||b.top<=title.getBounds().bottom)failures.push(r.id);
            if(b.height>largest.height||(b.height===largest.height&&r.riddle.length>largest.riddle.length))largest={riddle:r.riddle,height:b.height};
        }
        text.setText(largest.riddle);return{failures,largest};
    });
    expect(audit.failures).toEqual([]);
    await snap(page,'final','long-riddle-desktop');
    await page.setViewportSize({width:1024,height:768});await snap(page,'final','long-riddle-tablet');
});

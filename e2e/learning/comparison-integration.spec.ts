import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/comparison-integration/${name}.png` });
async function click(page: Page, point: {x:number; y:number}) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
}
async function clickHost(page: Page, scene: string, id: string) {
    await click(page, await page.evaluate(({scene,id}) => {
        const h = (window as any).__LITTLE_MATH_GAME__.scene.keys[scene].sceneBuilder.get(id);
        return {x:h.x,y:h.y};
    }, {scene,id}));
}
async function boardReady(page: Page) {
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
}

for (const renderer of ['canvas', 'webgl']) test(`comparison speed damage, fifth hint boundary, shield and pet: ${renderer}`, async ({page}) => {
    await page.setViewportSize({width:renderer === 'canvas' ? 1024:1280,height:800});
    await openSeededGame(page, false, {}, {}, {equippedShield:'shield_reinforced',ownedPets:['pet_catacomb_A'],activePet:'pet_catacomb_A',unlockedPets:['catacomb_creature_A']});
    if(renderer==='canvas'){await page.goto('/?renderer=canvas');await waitForScene(page,'MenuScene');}
    await page.evaluate(async () => {
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
        const m=GameStateManager.getInstance().getMasteryData();m.subAtoms.A2.state='fluent';
        const c=m.comparisonChapter=createInitialComparisonChapterState('training');c.currentStageIndex=3;
        Object.assign(c.stages[3],{symbolAnswers:4,introSeen:true,introVersionSeen:2});
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene',{fromArena:true,arenaLevel:1,wave:0});
    });
    await waitForScene(page,'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='player_turn');
    await page.evaluate(() => {
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.battleState.enemies.forEach((e:any)=>{e.hp=e.maxHp=1000;e.defense=0;});b.speedChargeBar.reset();
        const original=b.mathBoard.originalOnComplete;
        b.mathBoard.originalOnComplete=(...args:any[])=>{(window as any).__completed=args;original(...args);};
        b.onAttackClicked();
    });await boardReady(page);
    const count=await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.problems.length);
    expect(count).toBeGreaterThan(1);
    for(let i=0;i<count;i++) {
        await boardReady(page);
        const before=await page.evaluate(() => {
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            const p=b.problems[b.currentProblemIndex];
            return {hints:b.sequentialView.hints.every((h:any)=>h.visible),key:p.masteryKey,slot:b.sequentialView.comparison.relation.list[0].name};
        });
        expect(before.hints).toBe(i===0);expect(before.key).toBeUndefined();expect(before.slot).toBe('emptyComparisonSlot');
        if(i===1) {
            expect(await page.evaluate(() => {
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                b.activeTimeMs=9999;b.updateActiveTime(0,0);const before=b.sequentialView.hints.some((h:any)=>h.visible);
                b.updateActiveTime(0,1);return [before,b.sequentialView.hints.every((h:any)=>h.visible),b.problems[1].comparisonMeta.assisted];
            })).toEqual([false,true,false]);
            await shot(page,`${renderer}-ten-second-hints`);
        }
        const point=await page.evaluate(() => {
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard,p=b.problems[b.currentProblemIndex];
            b.activeTimeMs=100;
            const r=b.sequentialView.buttons[p.choices.indexOf(p.answer)].getBounds();return {x:r.centerX,y:r.centerY};
        });await click(page,point);
        await shot(page,`${renderer}-speed-${i}`);
        if(i<count-1)await page.waitForFunction(i=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex===i+1,i);
    }
    await page.waitForFunction(()=>(window as any).__completed!==undefined);
    const attack=await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return {damage:(window as any).__completed[0],base:b.battleState.currentProblems.reduce((n:number,p:any)=>n+(p.damageMultiplier||1),0),saved:GameStateManager.getInstance().getMasteryData().comparisonChapter.stages[3].symbolAnswers};
    });expect(attack.damage).toBe(attack.base+Math.floor(count/2));expect(attack.saved).toBe(4+count);
    await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies[0].hp)).toBe(1000-attack.damage);
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='pet_turn');
    await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.speedChargeBar.reset();b.onPetAttackClicked();
    });await boardReady(page);
    const pet=await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,p=b.petMathProblem;
        const r=b.mathBoard.sequentialView.buttons[p.choices.indexOf(p.answer)].getBounds();
        return {chapter:!!p.comparisonMeta,context:b.mathBoardContext,power:p.damageMultiplier,hp:b.battleState.enemies[0].hp,x:r.centerX,y:r.centerY};
    });expect(pet.chapter).toBe(true);expect(pet.context).toBe('pet');await shot(page,`${renderer}-pet-question`);await click(page,pet);
    await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies[0].hp)).toBe(pet.hp-pet.power);
    // Let the real enemy sequence enter the equipped shield's response.
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
    await boardReady(page);
    const shield=await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,p=b.mathBoard.problems[0];
        const r=b.mathBoard.sequentialView.buttons[p.choices.indexOf(p.answer)].getBounds();
        return {chapter:!!p.comparisonMeta,context:b.mathBoardContext,hp:b.battleState.playerHp,x:r.centerX,y:r.centerY};
    });expect(shield.chapter).toBe(true);expect(shield.context).toBe('block');await shot(page,`${renderer}-shield-question`);await click(page,shield);
    await page.waitForFunction(()=>!(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
    expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.playerHp)).toBe(shield.hp);
    await page.evaluate(()=>sessionStorage.setItem('lma-e2e-preserve-saves','true'));await page.reload();await waitForScene(page,'MenuScene');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).mathStats.masteryData.comparisonChapter.stages[3].symbolAnswers)).toBe(6+count);
});

for(const renderer of ['canvas','webgl']) test(`earned comparison exam and both catacomb challenges survive reload: ${renderer}`,async({page})=>{
    await page.setViewportSize({width:renderer==='canvas'?1024:1280,height:800});
    await openSeededGame(page);
    if(renderer==='canvas'){await page.goto('/?renderer=canvas');await waitForScene(page,'MenuScene');}
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {MasterySystem}=await import('/src/systems/MasterySystem.ts');
        const g=GameStateManager.getInstance(),m=g.getMasteryData();m.subAtoms.A2.state='fluent';
        const system=MasterySystem.getInstance();
        for(const count of [6,6,6,9,6,9])for(const p of system.generateComparisonBattleProblems(count)!)system.recordComparisonSolve(p,true,1000,false);
        g.save();(window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene');
    });await waitForScene(page,'GuildScene');
    expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.currentMasteryExamType)).toBe('comparison_chapter');
    await clickHost(page,'GuildScene','challengeActionHost');
    await shot(page,`${renderer}-exam-overview`);
    // The production overview button starts the naturally selected exam.
    await clickHost(page,'GuildScene','trialOverviewActionHost');
    for(let i=0;i<8;i++){
        await page.waitForFunction(i=>{const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;return g.trialState.phase==='problem'&&g.trialState.currentProblemIndex===i},i);
        const point=await page.evaluate(()=>{
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene,p=g.currentTrialProblem;
            const r=g.answerButtons[p.choices.indexOf(p.answer)].root.getBounds();return {x:r.centerX,y:r.centerY};
        });await shot(page,`${renderer}-exam-${i}`);await click(page,point);
    }
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.phase==='results');
    await shot(page,`${renderer}-exam-pass`);
    await clickHost(page,'GuildScene','trialResultsActionHost');await waitForScene(page,'GuildScene');
    for(const [index,type] of ['fluency_challenge','mastery_challenge'].entries()){
        await page.waitForFunction(type=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.catacombExam?.type===type,type);
        expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.catacombExam.targetId)).toBe('comparison_symbols');
        await clickHost(page,'GuildScene','catacombDoorHost');await waitForScene(page,'CatacombTrialScene');
        await shot(page,`${renderer}-catacomb-intro-${index}`);await clickHost(page,'CatacombTrialScene','catacombPrimary');
        for(let i=0;i<10;i++){
            await page.waitForFunction(i=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;return s.phase==='charging'&&s.correctCount===i},i);
            const state=await page.evaluate(()=>{
                const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene,p=s.currentProblem,v=s.mathBoard.comparison;
                const objects=[v.left,v.right];const panel=s.sceneBuilder.getElementDef('catacombQuestionPanel');
                return {answer:p.choices.indexOf(p.answer)+1,rep:p.comparisonMeta.representation,exam:p.comparisonMeta.exam,slot:v.relation.list[0].name,
                    bounds:objects.every((o:any)=>{const r=o.getBounds();return r.top>panel.y-panel.height/2&&r.bottom<591;})};
            });expect(state.exam).toBe(true);expect(state.slot).toBe('emptyComparisonSlot');expect(state.bounds).toBe(true);
            await shot(page,`${renderer}-catacomb-${index}-${state.rep}`);
            await clickHost(page,'CatacombTrialScene',`catacombAnswer${state.answer}`);
        }
        await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase==='victory');
        await shot(page,`${renderer}-catacomb-win-${index}`);
        expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxBonus)).toBe(index+1);
        await clickHost(page,'CatacombTrialScene','catacombPrimary');await waitForScene(page,'GuildScene');
    }
    await page.evaluate(()=>sessionStorage.setItem('lma-e2e-preserve-saves','true'));await page.reload();await waitForScene(page,'MenuScene');
    expect(await page.evaluate(()=>{
        const c=JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).mathStats.masteryData.comparisonChapter;
        return [c.status,c.fluencyChallengeResult,c.masteryChallengeResult,c.attempts.filter((a:any)=>a.exam).length];
    })).toEqual(['complete','pass','pass',28]);
});

test('co-op chapter pets and shields use their owner’s hints, damage and save', async({page})=>{
    const pet={equippedShield:'shield_reinforced',ownedPets:['pet_catacomb_A'],activePet:'pet_catacomb_A',unlockedPets:['catacomb_creature_A']};
    await openSeededGame(page,true,{}, {},pet,{...pet,catacombFoxBonus:3});
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
        const g=GameStateManager.getInstance();
        for(let slot=0;slot<2;slot++){
            g.loadSlot(slot);const m=g.getMasteryData();m.subAtoms.A2.state='fluent';
            const c=m.comparisonChapter=createInitialComparisonChapterState('training');c.currentStageIndex=3;
            Object.assign(c.stages[3],{symbolAnswers:slot?0:4,introSeen:true,introVersionSeen:2});g.save();
        }g.loadSlot(0);
    });await activateCoopSession(page);
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('BattleScene',{fromArena:true,arenaLevel:1,wave:0}));
    await waitForScene(page,'BattleScene');
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='player_turn');
    await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.battleState.enemies.forEach((e:any)=>{e.hp=e.maxHp=1000;e.defense=0;});
        b.speedChargeBar.addCharges(2);b.setPhase('pet_turn');
    });
    for(const owner of ['A','B']){
        await page.waitForFunction(owner=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase===(owner==='A'?'pet_turn':'pet_b_turn'),owner);
        await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onPetAttackClicked());await boardReady(page);
        const input=await page.evaluate(()=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,p=b.petMathProblem;
            const r=b.mathBoard.sequentialView.buttons[p.choices.indexOf(p.answer)].getBounds();b.mathBoard.activeTimeMs=100;
            return {owner:b.coopSession.getActivePlayer(),hp:b.battleState.enemies[0].hp,power:p.damageMultiplier,chapter:!!p.comparisonMeta,hints:b.mathBoard.getActiveProblemSnapshot().comparison.showReminders,x:r.centerX,y:r.centerY};
        });expect(input.owner).toBe(owner);expect(input.chapter).toBe(true);expect(input.hints).toBe(true);expect(input.power).toBe(owner==='A'?6:9);
        await shot(page,`coop-${owner}-pet`);await click(page,input);
        await expect.poll(()=>page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies[0].hp)).toBe(input.hp-input.power-(owner==='A'?1:0));
    }
    const enemyCount=await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies.length);
    for(const owner of ['A','B']){
        if(owner==='B'){
            await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='player_turn');
            await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('enemy_turn'));
        }
        for(let enemy=0;enemy<enemyCount;enemy++){
        await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);await boardReady(page);
        const input=await page.evaluate(()=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,p=b.mathBoard.problems[0];
            const r=b.mathBoard.sequentialView.buttons[p.choices.indexOf(p.answer)].getBounds();b.mathBoard.activeTimeMs=100;
            return {owner:b.coopSession.getActivePlayer(),hints:b.mathBoard.getActiveProblemSnapshot().comparison.showReminders,x:r.centerX,y:r.centerY};
        });expect(input.owner).toBe(owner);expect(input.hints).toBe(owner==='B');await shot(page,`coop-${owner}-shield`);await click(page,input);
        await page.waitForFunction(()=>!(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
        }
    }
    expect(await page.evaluate(()=>[0,1].map(slot=>{
        const c=JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.masteryData.comparisonChapter;
        return [c.stages[3].symbolAnswers,c.attempts.length,c.attempts.every((a:any)=>a.correct&&!a.assisted)];
    }))).toEqual([[5+enemyCount,1+enemyCount,true],[1+enemyCount,1+enemyCount,true]]);
});

test('catacomb wrong answers and timeout record once, fail safely and grant no fox bonus',async({page})=>{
    await openSeededGame(page);
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {MasterySystem}=await import('/src/systems/MasterySystem.ts');
        GameStateManager.getInstance().getMasteryData().subAtoms.A2.state='fluent';
        const system=MasterySystem.getInstance();
        for(const count of [6,6,6,9,6,9])for(const p of system.generateComparisonBattleProblems(count)!)system.recordComparisonSolve(p,true,1000,false);
        for(const p of system.generateComparisonExamProblems())system.recordComparisonSolve(p,true,1000,false);
        system.applyComparisonExamResult(8);
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',{examType:'fluency_challenge',subAtomId:'comparison_symbols'});
    });await waitForScene(page,'CatacombTrialScene');await clickHost(page,'CatacombTrialScene','catacombPrimary');
    for(let i=0;i<3;i++){
        await page.waitForFunction(i=>{const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;return s.phase==='charging'&&s.wrongCount===i},i);
        if(i===1){await page.evaluate(()=>{
            const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            s.onTimeout();s.onTimeout(); // Timer/answer races may only record the first event.
        });}else{
            const wrong=await page.evaluate(()=>{
                const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene,p=s.currentProblem;
                return (p.choices.indexOf(p.answer)+1)%3+1;
            });await clickHost(page,'CatacombTrialScene',`catacombAnswer${wrong}`);
        }
        await shot(page,`catacomb-wrong-${i}`);
    }
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase==='defeat');
    await shot(page,'catacomb-failed');
    expect(await page.evaluate(()=>{
        const save=JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!);const c=save.mathStats.masteryData.comparisonChapter;
        return {bonus:save.player.catacombFoxBonus??0,status:c.status,result:c.fluencyChallengeResult,attempts:c.attempts.slice(-3).map((a:any)=>[a.correct,a.selectedRelation===null])};
    })).toEqual({bonus:0,status:'complete',result:'fail',attempts:[[false,false],[false,true],[false,false]]});
});

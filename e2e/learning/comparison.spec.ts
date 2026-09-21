import { test, expect, openSeededGame, waitForScene, activateCoopSession, startDefaultArenaPreview, startBattleFromPreview, winBattleToVictory } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

async function ready(page: Page) {
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
}

async function openBattle(page: Page, renderer = 'webgl', stage = 3, intro = false, sword = false) {
    await openSeededGame(page);
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await page.evaluate(async ({ stage, intro, sword }) => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const g = GameStateManager.getInstance(), m = g.getMasteryData();
        m.subAtoms.A2.state = 'fluent';
        m.comparisonChapter = createInitialComparisonChapterState('training');
        m.comparisonChapter.currentStageIndex = stage;
        m.comparisonChapter.stages[stage].introSeen = !intro;
        m.comparisonChapter.stages[stage].introVersionSeen = intro ? 0 : 2;
        if (sword) {
            const items = (window as any).__LITTLE_MATH_GAME__.cache.json.get('items');
            g.getPlayer().equippedWeapon = items.find((item:any) => item.type === 'weapon' && item.mathProblemType).id;
        }
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
    }, { stage, intro, sword });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
}

async function screenshot(page: Page, name: string) { await page.screenshot({ path: `artifacts/comparison-game/${name}.png` }); }

for (const renderer of ['canvas', 'webgl']) {
    test(`whole parchment survives shield, comparison and subsequent arena battles — ${renderer}`, async ({ page }) => {
        await page.setViewportSize({ width: renderer === 'canvas' ? 1024 : 1280, height: 800 });
        await openSeededGame(page, false, {}, {}, { equippedShield: 'shield_reinforced' });
        if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
        await startDefaultArenaPreview(page);

        for (let wave = 0; wave < 3; wave++) {
            await startBattleFromPreview(page);
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
            await ready(page);
            const parchment = await page.evaluate(() => {
                const game = (window as any).__LITTLE_MATH_GAME__, battle = game.scene.keys.BattleScene;
                const board = battle.mathBoard.getContainer().getByName('board');
                const texture = game.textures.get('ui-math-board'), base = texture.get('__BASE');
                return { wave: battle.arenaWave, sequential: battle.mathBoard.sequential, visible: board.visible,
                    whole: board.frame === base, defaultWhole: texture.get() === base,
                    source: [base.width, base.height], displayedSource: [board.frame.width, board.frame.height] };
            });
            await screenshot(page, `${renderer}-parchment-arena-${wave + 1}`);
            expect(parchment.wave).toBe(wave);
            expect(parchment.sequential).toBe(false);
            expect(parchment.visible).toBe(true);
            expect.soft(parchment.whole, 'A new battle must use the complete parchment, not a cached corner').toBe(true);
            expect.soft(parchment.defaultWhole, 'Adding named slices must preserve the shared default frame').toBe(true);
            expect.soft(parchment.displayedSource).toEqual(parchment.source);

            if (wave === 1) {
                await page.evaluate(async () => {
                    const { createInitialComparisonChapterState, generateComparisonTrainingProblems } = await import('/src/systems/ComparisonLearningSystem.ts');
                    const board = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                    board.show(generateComparisonTrainingProblems(createInitialComparisonChapterState('training'), 1));
                });
            } else {
                await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.startBlockPhase(1));
            }
            await ready(page);
            const slices = await page.evaluate(() => {
                const game = (window as any).__LITTLE_MATH_GAME__, texture = game.textures.get('ui-math-board');
                const base = texture.get('__BASE');
                const parts = game.scene.keys.BattleScene.mathBoard.sequentialView.root.list
                    .filter((part: any) => part.texture === texture);
                return { defaultWhole: texture.get() === base, count: parts.length,
                    valid: parts.every((part: any) => part.frame.cutWidth > 0 && part.frame.cutHeight > 0
                        && part.frame.cutX >= 0 && part.frame.cutY >= 0
                        && part.frame.cutX + part.frame.cutWidth <= base.width
                        && part.frame.cutY + part.frame.cutHeight <= base.height),
                    lastCorner: [parts[8].frame.cutX + parts[8].frame.cutWidth, parts[8].frame.cutY + parts[8].frame.cutHeight],
                    source: [base.width, base.height], frameCount: texture.frameTotal };
            });
            await screenshot(page, `${renderer}-parchment-${wave === 1 ? 'comparison' : 'shield'}-${wave + 1}`);
            expect.soft(slices.defaultWhole).toBe(true);
            expect(slices.count).toBe(9);
            expect(slices.valid).toBe(true);
            expect(slices.lastCorner).toEqual(slices.source);
            expect(slices.frameCount).toBe(10);

            if (wave !== 1) {
                await page.evaluate(() => {
                    const board = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                    board.submitChoice(board.problems[0].choices.indexOf(board.problems[0].answer));
                });
                await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
            }
            // Exercise shutdown and recreation through the real victory / arena flow;
            // the texture cache survives all three battles without a page reload.
            if (wave < 2) {
                await winBattleToVictory(page);
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.remoteContinueReady);
                await page.keyboard.press('Space');
                await waitForScene(page, 'ArenaScene');
            }
        }
    });
}

for (const renderer of ['canvas', 'webgl']) {
    test(`four illustrated stages and control states — ${renderer}`, async ({ page }) => {
        await page.setViewportSize({ width: renderer === 'canvas' ? 1024 : 1280, height: 800 });
        await openBattle(page, renderer, 0, true);
        // An introduction cannot publish active answers or earn a scored attempt.
        await page.waitForTimeout(450);
        expect(await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            return [b.getActiveProblemSnapshot(), b.results.length, b.getDamageDealt()];
        })).toEqual([null, 0, 0]);
        await screenshot(page, `${renderer}-intro-empty`);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.comparison?.relation.list.some((c:any) => c.name === 'filledComparisonRelation'));
        await screenshot(page, `${renderer}-intro-mouth`);
        await ready(page);
        expect(await page.evaluate(async () => {
            const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            return GameStateManager.getInstance().getMasteryData().comparisonChapter.stages[0].introVersionSeen;
        })).toBe(2);
        for (let stage = 0; stage < 4; stage++) {
            await page.evaluate(async stage => {
                const { createInitialComparisonChapterState, generateComparisonTrainingProblems } = await import('/src/systems/ComparisonLearningSystem.ts');
                const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                const state = createInitialComparisonChapterState('training'); state.currentStageIndex = stage;
                b.mathBoard.show(generateComparisonTrainingProblems(state, 3));
                b.mathBoard.onComplete = () => undefined; // Presentation checks; the next test runs the real attack.
            }, stage);
            await ready(page);
            const geometry = await page.evaluate(() => {
                const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard, v = b.sequentialView;
                const rect = (o:any) => { const r=o.getBounds(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
                const texts:any[]=[]; const visit=(o:any)=>{ if(o.type==='Text')texts.push(o); if(o.list)o.list.forEach(visit); }; visit(v.root);
                return { left: rect(v.comparison.left), right: rect(v.comparison.right), buttons: v.buttons.map(rect), slot: v.comparison.relation.list.map((c:any)=>c.name),
                    leftItems:v.comparison.left.list.filter((c:any)=>c.type==='Image').length,
                    resolutions:texts.every(t=>t.style.resolution===t.frame.source.resolution),
                    overflow:texts.filter(t=>t.visible).some(t=>{const r=t.getBounds();return r.x<315||r.right>970||r.y<38||r.bottom>308;}) };
            });
            expect(geometry.resolutions).toBe(true); expect(geometry.overflow).toBe(false);
            expect(geometry.slot).toEqual(['emptyComparisonSlot']);
            expect(geometry.right.right).toBeLessThan(geometry.buttons[0].x);
            expect(geometry.buttons.every((r:any)=>r.w>=44&&r.h>=44)).toBe(true);
            if (stage === 0) expect(Math.max(geometry.left.w, geometry.right.w) / Math.min(geometry.left.w, geometry.right.w)).toBeGreaterThanOrEqual(1.9);
            if (stage === 2) expect(geometry.leftItems).toBe(1);
            await screenshot(page, `${renderer}-stage-${stage + 1}`);
            const screen = await page.locator('canvas').boundingBox();
            const target = geometry.buttons[0];
            const x=screen!.x+(target.x+target.w/2)*screen!.width/1280,y=screen!.y+(target.y+target.h/2)*screen!.height/720;
            await page.mouse.move(x,y); await screenshot(page, `${renderer}-hover-${stage}`);
            expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.buttons[0].getData('surface').y)).toBe(-2);
            await page.mouse.move(0,0);
            await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.buttons[0].getData('surface').y === 0);
            // A wrong first answer is one result; duplicate input during correction is ignored.
            await page.evaluate(() => {
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                b.submitChoice(1); b.submitChoice(0);
            });
            await screenshot(page, `${renderer}-wrong-${stage}`);
            expect(await page.evaluate(() => {
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                return [b.results,b.damageDealt,b.getActiveProblemSnapshot()];
            })).toEqual([[false],0,null]);
            await ready(page);
            expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex)).toBe(1);
            // Inspect actual pointer activation, locked feedback, equality and the completed batch.
            for (let question = 1; question < 3; question++) {
                await ready(page);
                const index = await page.evaluate(() => {
                    const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                    return b.problems[b.currentProblemIndex].choices.indexOf(b.problems[b.currentProblemIndex].answer);
                });
                const answer = geometry.buttons[index];
                await page.mouse.move(screen!.x + (answer.x + answer.w / 2) * screen!.width / 1280,
                    screen!.y + (answer.y + answer.h / 2) * screen!.height / 720);
                await page.mouse.down();
                if (question === 1) await screenshot(page, `${renderer}-pressed-disabled-${stage}`);
                await page.mouse.up();
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.comparison?.relation.list.some((c:any) => c.name === 'filledComparisonRelation'));
                await screenshot(page, `${renderer}-${question === 1 ? 'equal' : 'correct'}-${stage}`);
                expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.getActiveProblemSnapshot())).toBeNull();
                await page.waitForFunction(question => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex === question + 1, question);
            }
            expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.results)).toEqual([false, true, true]);
            await screenshot(page, `${renderer}-batch-complete-${stage}`);
        }
    });
}

test('actual attack, sword batch and persisted hint progression', async ({page}) => {
    await openBattle(page, 'webgl', 3, false, true); await ready(page);
    const input = await page.evaluate(() => {
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const old = b.mathBoard.onComplete;
        b.mathBoard.onComplete = (...args:any[]) => { (window as any).__comparisonCompletions = [...((window as any).__comparisonCompletions||[]),args]; old(...args); };
        return b.battleState.currentProblems.map((p:any)=>({source:p.source,multiplier:p.damageMultiplier||1}));
    });
    expect(input.some((p:any)=>p.source==='sword')).toBe(true);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.hints.some((h:any)=>h.visible))).toBe(false);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.hints.every((h:any)=>h.visible));
    await screenshot(page,'hints');
    for(let i=0;i<input.length;i++) {
        await ready(page);
        await page.evaluate(i => {
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            const p=b.problems[b.currentProblemIndex], correct=p.choices.indexOf(p.answer);
            b.submitChoice(i===1?(correct+1)%3:correct);
        }, i);
        if(i<input.length-1) await page.waitForFunction(i=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex===i+1,i);
    }
    await page.waitForFunction(() => (window as any).__comparisonCompletions?.length===1);
    const result=await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        return {calls:(window as any).__comparisonCompletions,state:GameStateManager.getInstance().getMasteryData().comparisonChapter};
    });
    expect(result.calls[0][1]).toEqual(input.map((_p:any,i:number)=>i!==1));
    expect(result.calls[0][0]).toBe(input.reduce((sum:number,p:any,i:number)=>sum+(i===1?0:p.multiplier),0));
    expect(result.calls[0][3][0]).toBe(true); expect(result.calls[0][3][1]).toBe(false);
    expect(result.state.attempts.length).toBe(input.length-1);
    expect(result.state.attempts[1].correct).toBe(false);
    await screenshot(page,'attack');
    await page.evaluate(()=>sessionStorage.setItem('lma-e2e-preserve-saves','true'));
    await page.reload(); await waitForScene(page,'MenuScene');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).mathStats.masteryData.comparisonChapter.stages[3].hintLevel)).toBe(result.state.stages[3].hintLevel);
});

test('active-time reminders, cancellation, and support isolation in co-op', async ({page})=>{
    await openSeededGame(page,true);
    await page.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
        const g=GameStateManager.getInstance();
        for(let i=0;i<2;i++) {g.loadSlot(i);const m=g.getMasteryData();m.subAtoms.A2.state='fluent';m.comparisonChapter=createInitialComparisonChapterState('training');m.comparisonChapter.currentStageIndex=3;
            Object.assign(m.comparisonChapter.stages[3],{introSeen:true,introVersionSeen:2,hintLevel:i?0:3});g.save();}g.loadSlot(0);
    });
    await activateCoopSession(page);
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('BattleScene',{fromArena:true,arenaLevel:1,wave:0}));
    await waitForScene(page,'BattleScene');
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase==='player_turn');
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked()); await ready(page);
    expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.support.hintLevel)).toBe(3);
    const paused=await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
        const before=b.activeTimeMs;b.updateActiveTime(0,40000);return {before,after:b.activeTimeMs,hints:b.sequentialView.hints.some((h:any)=>h.visible)};
    });
    expect(paused.after).toBe(paused.before);expect(paused.hints).toBe(false);
    await page.evaluate(()=>{
        delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.mathBoard.hide();b.setPhase('player_b_turn');b.onAttackClicked();
    });await ready(page);
    expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.support.hintLevel)).toBe(0);
    await screenshot(page,'coop');
    await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
        b.updateActiveTime(0,3990-b.activeTimeMs); // just below the production 4-second boundary
    });
    await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.hints.every((h:any)=>h.visible));
    await page.evaluate(()=>{const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;b.hide();b.updateActiveTime(0,40000);});
    expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.getActiveProblemSnapshot())).toBeNull();
    await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('TownScene'));
    await waitForScene(page,'TownScene');
});

for (const renderer of ['canvas','webgl']) {
    test(`exam keeps the shared pictures and large signs without reminders — ${renderer}`, async ({page}) => {
        await openSeededGame(page);
        if(renderer==='canvas'){await page.goto('/?renderer=canvas');await waitForScene(page,'MenuScene');}
        await page.evaluate(async()=>{
            const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
            const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
            const m=GameStateManager.getInstance().getMasteryData();m.subAtoms.A2.state='fluent';m.comparisonChapter=createInitialComparisonChapterState('exam_ready');
            (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene');
        });await waitForScene(page,'GuildScene');
        await page.evaluate(()=>{
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            g.currentMasteryExamType='comparison_chapter';g.currentMasteryExamTarget='comparison_symbols';g.startTrial();
        });
        expect(await page.evaluate(()=>['comparison-apple','comparison-crocodile','comparison-equal','comparison-greater'].every(key=>(window as any).__LITTLE_MATH_GAME__.textures.exists(key)))).toBe(true);
        for(let i=0;i<8;i++){
            await page.waitForFunction(i=>{const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;return g.trialState.currentProblemIndex===i&&g.trialState.phase==='problem'},i);
            const state=await page.evaluate(()=>{
                const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
                return {slot:g.comparisonProblemVisual.relation.list.map((c:any)=>c.name),meta:g.currentTrialProblem.comparisonMeta,signs:g.answerButtons.map((b:any)=>{const glyph=b.root.getData('comparisonGlyph');return {w:glyph.displayWidth,h:glyph.displayHeight,sameSurface:glyph.parentContainer===b.label.parentContainer}})};
            });
            expect(state.slot).toEqual(['emptyComparisonSlot']);expect(state.meta.showCrocodile).toBe(false);expect(state.meta.exam).toBe(true);
            expect(state.signs.every((s:any)=>Math.abs(s.w-64.8)<0.1&&s.h>54&&s.sameSurface)).toBe(true);
            await screenshot(page,`${renderer}-exam-${state.meta.representation}`);
            await page.evaluate(i=>{const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;const p=g.currentTrialProblem;const correct=p.choices.indexOf(p.answer);g.checkTrialAnswer(i===0?(correct+1)%3:correct)},i);
            if(i===0){await page.waitForTimeout(2400);await screenshot(page,`${renderer}-exam-feedback`);await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.closeFeedback());}
        }
        await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.phase==='results');
        const results=await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.results);
        expect(results.map((r:any)=>r.wasCorrect)).toEqual([false,true,true,true,true,true,true,true]);
        expect(await page.evaluate(()=>{
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            return {prose:g.resultEntryTexts.some((entry:any)=>entry.visible)||g.resultsZyxText.visible,cards:g.comparisonResultGrid.list.length/3};
        })).toEqual({prose:false,cards:8});
        await screenshot(page,`${renderer}-exam-results`);
    });
}

test('mobile controller preserves pictures, all three reminders and picture choices after retry',async({page})=>{
    await openBattle(page);await ready(page);
    const snapshot=await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.getActiveProblemSnapshot());
    expect(snapshot.comparison).not.toHaveProperty('relation');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async snapshot=>{
        const {RemoteInputService}=await import('/src/remote/RemoteInputService.ts');
        const {mountRemoteControllerApp}=await import('/src/remote/controllerApp.ts');
        const service=RemoteInputService.getInstance() as any;
        service.connectController=async()=>({role:'controller',room:'TEST',clientId:'qa'});
        service.sendCommand=(command:any)=>{(window as any).__remoteChoice=command};
        service.currentState={screen:'math',title:'Vyber znaménko',...snapshot};
        history.replaceState(null,'','/?room=TEST');mountRemoteControllerApp();
    },snapshot);
    await expect(page.locator('.remote-comparison-slot')).toBeVisible();
    await expect(page.locator('.remote-comparison-reminder')).toHaveCount(3);
    await screenshot(page,'remote-number');
    await page.evaluate(()=>{
        const state=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.getActiveProblemSnapshot();
        return import('/src/remote/RemoteInputService.ts').then(({RemoteInputService})=>{
            const service=RemoteInputService.getInstance() as any;
            service.stateListeners.forEach((listener:any)=>listener({screen:'math',title:'Vyber znaménko',...state,comparison:{...state.comparison,showReminders:true}}));
        });
    });
    await screenshot(page,'remote-hints');
    expect(await page.locator('.remote-comparison-reminder').evaluateAll(images=>images.every(i=>getComputedStyle(i).visibility==='visible'))).toBe(true);
    const choice=page.locator('.remote-comparison-answers button').first();await choice.click();
    await expect(choice.locator('img')).toHaveCount(1);await page.waitForTimeout(1900);await expect(choice.locator('img')).toHaveCount(1);
    expect(await page.evaluate(()=>(window as any).__remoteChoice)).toEqual({type:'answerChoice',index:0});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.evaluate(()=>import('/src/remote/RemoteInputService.ts').then(({RemoteInputService})=>{
        const service=RemoteInputService.getInstance() as any;
        service.stateListeners.forEach((listener:any)=>listener({screen:'math',title:'Vyber tlamu',problem:'',choices:[{index:0,label:'<'},{index:1,label:'='},{index:2,label:'>'}],comparison:{representation:'count',left:5,right:3,numberedObjects:true,crocodileChoices:true,showReminders:false}}));
    }));
    await expect(page.locator('.remote-comparison-pieces img')).toHaveCount(8);await screenshot(page,'remote-objects');
});

test('rows and sequential arithmetic return identical batches, interrupted single callback cannot leak',async({page})=>{
    await openBattle(page);await ready(page);
    const outputs=[];
    for(const presentation of ['rows','sequential']){
        await page.evaluate(presentation=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            const problems=[0,1,2].map(i=>({id:'parity_'+i,operand1:i+1,operand2:1,operator:'+',answer:i+2,choices:[i+2,i+3,i+4],showVisualHint:false,hintType:'none',damageMultiplier:i+1}));
            b.show(problems,{presentation});b.setOnWrongAnswer((_problem:any,done:()=>void)=>done());b.onComplete=(...args:any[])=>{(window as any).__parityResult=args};
        },presentation);await ready(page);
        for(let i=0;i<3;i++){
            await page.evaluate(i=>{const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;b.submitChoice(i===1?1:0);b.submitChoice(0)},i);
            if(i<2){await page.waitForFunction(i=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex===i+1,i);await ready(page);}
        }
        await page.waitForFunction(()=>(window as any).__parityResult!==undefined);
        outputs.push(await page.evaluate(()=>{const out=(window as any).__parityResult;delete (window as any).__parityResult;return [out[0],out[1],out[3]]}));
    }
    expect(outputs).toEqual([[4,[true,false,true],[false,false,false]],[4,[true,false,true],[false,false,false]]]);
    await page.evaluate(()=>{
        const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard,p=b.problems[0];
        b.originalOnComplete=(...args:any[])=>{(window as any).__afterSingle=args};
        b.showSingle(p,()=>{(window as any).__staleSingle=true});b.show([p]);
    });await ready(page);await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.submitChoice(0));
    await page.waitForFunction(()=>(window as any).__afterSingle!==undefined);
    expect(await page.evaluate(()=>(window as any).__staleSingle)).toBeUndefined();
});

for (const renderer of ['canvas', 'webgl']) {
    test(`speed feedback and one-question shield use the shared board — ${renderer}`, async ({page}) => {
        await page.setViewportSize({width: renderer === 'canvas' ? 1024 : 1280, height: 800});
        await openBattle(page, renderer); await ready(page);
        await page.evaluate(() => {
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            const problems=[0,1].map(i=>b.mathEngine.generateProblemFromKey(`A1:${i+1}+1:result_unknown`));
            if(problems.some((p:any)=>!p)) throw new Error('Missing ordinary speed-bonus problem');
            b.speedChargeBar.reset();
            b.mathBoard.show(problems,{presentation:'sequential'});
            b.mathBoard.onComplete=(damage:number)=>{(window as any).__speedDamage=damage};
        });
        for(let i=0;i<2;i++) {
            await ready(page);
            await page.evaluate(()=>{
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
                b.activeTimeMs=100;b.submitChoice(b.problems[b.currentProblemIndex].choices.indexOf(b.problems[b.currentProblemIndex].answer));
            });
            const feedback=await page.evaluate(()=>{
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene, v=b.mathBoard.sequentialView;
                return {text:v.bonus.text,charges:b.speedChargeBar.getCharges(),bonus:v.bonus.getBounds(),demo:v.demo.getBounds(),source:v.source.getBounds()};
            });
            expect(feedback.text).toBe('⚡ +2');expect(feedback.charges).toBe(i===0?2:0);
            expect(feedback.bonus.x+feedback.bonus.width).toBeLessThan(feedback.demo.x);
            expect(feedback.source.x+feedback.source.width).toBeLessThan(feedback.bonus.x);
            await screenshot(page,`${renderer}-speed-bonus-${i}`);
            if(i===0)await page.waitForFunction(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex===1);
        }
        await page.waitForFunction(()=>(window as any).__speedDamage!==undefined);
        expect(await page.evaluate(()=>(window as any).__speedDamage)).toBe(3);

        await page.evaluate(async()=>{
            const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
            GameStateManager.getInstance().getPlayer().equippedShield='shield_reinforced';
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            b.mathBoard.setOnWrongAnswer((_problem:any,done:()=>void)=>done());
        });
        for(const state of [{name:'quick',time:100,correct:true,block:6},{name:'slow',time:50000,correct:true,block:3},{name:'wrong',time:100,correct:false,block:0}]) {
            await page.evaluate(()=>{
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                b.battleState.playerHp=20;b.startBlockPhase(9);
            });await ready(page);
            expect(await page.evaluate(()=>{
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,v=b.mathBoard.sequentialView;
                return {count:b.battleState.currentProblems.length,title:v.heading.text,oldBanner:b.blockUI.visible,defense:b.mathBoard.defense,chapter:Boolean(b.battleState.currentProblems[0].comparisonMeta)};
            })).toEqual({count:1,title:'Braň se',oldBanner:false,defense:{power:3,incomingDamage:9},chapter:false});
            expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.blockResultText)).toBeNull();
            await screenshot(page,`${renderer}-shield-${state.name}-question`);
            await page.evaluate(state=>{
                const board=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard,p=board.problems[0],correct=p.choices.indexOf(p.answer);
                board.activeTimeMs=state.time;board.submitChoice(state.correct?correct:(correct+1)%3);board.submitChoice(correct);
            },state);
            expect(await page.evaluate(()=>{
                const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                return {power:b.mathBoard.sequentialView.power.text,bonus:b.mathBoard.sequentialView.bonus.text,attack:b.mathBoard.damageDealt,charges:b.speedChargeBar.getCharges(),results:b.mathBoard.results};
            })).toEqual({power:`🛡 ${state.block}`,bonus:state.name==='quick'?'🛡 ×2':'',attack:0,charges:0,results:[state.correct]});
            await screenshot(page,`${renderer}-shield-${state.name}-answer`);
            await page.waitForFunction(()=>!(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
            expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.playerHp)).toBe(20-(9-state.block));
        }
        await page.evaluate(()=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            b.mathBoard.show(b.battleState.currentProblems,{presentation:'sequential'});
        });await ready(page);
        expect(await page.evaluate(()=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            return [b.defense,b.sequentialView.heading.text,b.sequentialView.bonus.text];
        })).toEqual([null,'Spočítej','']);
    });
}

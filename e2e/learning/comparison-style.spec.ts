import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/comparison-style/${name}.png` });
const ready = (page: Page) => page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);

async function start(page: Page, renderer: string) {
    await page.setViewportSize({ width: renderer === 'canvas' ? 1024 : 1280, height: 800 });
    await openSeededGame(page);
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 }));
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
    await ready(page);
}

async function mixed(page: Page, advanced = false) {
    await page.evaluate(async advanced => {
        const game = (window as any).__LITTLE_MATH_GAME__, scene = game.scene.keys.BattleScene, board = scene.mathBoard;
        const base = { id: 'style', operand1: 2, operand2: 1, operator: '+', answer: 3, choices: [2,3,4], showVisualHint: false, hintType: 'none' };
        const comparison = advanced
            ? { ...base, operand1: 12, operand2: 8, operand3: 19, operator3: '-', operand4: 7, answer: 2, choices: [0,1,2], problemType: 'comparison_eq_vs_eq' }
            : { ...base, operand3: 4, answer: 0, choices: [0,1,2], problemType: 'comparison' };
        const three = { ...base, operand1: 17, operator: '-', operand2: 8, operand3: 4, operator2: '+', operand4: 13, answer: 1, choices: [0,1,2], problemType: 'comparison' };
        (window as any).__styleProblems = [comparison, base, advanced ? three : base, { ...base, operand2: 4, problemType: 'missing_operand', answer: 2, choices: [1,2,3] }];
        (window as any).__styleResults = [];
        board.originalOnComplete = (...args: any[]) => (window as any).__styleResults.push(args);
        board.setOnWrongAnswer((_problem: any, done: () => void) => done());
        board.show((window as any).__styleProblems);
    }, advanced);
    await ready(page);
}

for (const renderer of ['canvas', 'webgl']) {
    test(`mixed rows, full advanced expressions, controls and shield — ${renderer}`, async ({ page }) => {
        await start(page, renderer);
        await mixed(page);
        expect(await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            return { sequential: b.sequential, rows: b.problemRows.length, slot: b.problemRows[0].comparison.relation.list[0].name };
        })).toEqual({ sequential: false, rows: 4, slot: 'emptyComparisonSlot' });
        await shot(page, `${renderer}-mixed-four`);
        await mixed(page, true);
        const bounds = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            return b.problemRows.filter((r:any) => r.comparison).map((r:any) => {
                const v = r.comparison, first = r.buttons[0].getBounds(), text = v.right.getBounds();
                return { left: v.left.text, right: v.right.text, overlap: text.right > first.left - 8,
                    signs: r.buttons.map((button:any) => {
                        const surface = button.getData('surface'), glyph = surface.getByName('comparisonChoiceGlyph'), frame = button.getData('bg');
                        return { width: glyph.displayWidth, height: glyph.displayHeight, frameW: frame.displayWidth, frameH: frame.displayHeight,
                            hitHeight: button.input.hitArea.height * document.querySelector('canvas')!.getBoundingClientRect().width / 1280,
                            sameSurface: glyph.parentContainer === frame.parentContainer };
                    }), resolution: [v.left.style.resolution, v.left.frame.source.resolution] };
            });
        });
        expect(bounds.map((b:any)=>[b.left,b.right])).toEqual([['12+8','19-7'],['17-8+4','13']]);
        expect(bounds.every((b:any)=>!b.overlap && b.resolution.every((r:number)=>r===2))).toBe(true);
        expect(bounds.every((b:any)=>b.signs.every((s:any)=>s.width>35&&s.width<s.frameW*0.8&&s.height<s.frameH*0.85&&s.sameSurface&&s.hitHeight>=44))).toBe(true);
        await shot(page, `${renderer}-advanced-four`);
        const point = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.problemRows[0].buttons[2];
            const r=b.getBounds(), c=document.querySelector('canvas')!.getBoundingClientRect();
            return { x:c.left+r.centerX*c.width/1280, y:c.top+r.centerY*c.height/720 };
        });
        await page.mouse.move(point.x,point.y); await page.waitForTimeout(150); await shot(page, `${renderer}-hover`);
        await page.mouse.move(1,1); await shot(page, `${renderer}-pointer-out`);
        await page.mouse.move(point.x,point.y); await page.mouse.down(); await shot(page, `${renderer}-pressed-correct`); await page.mouse.up();
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex===1);
        for (let i=1;i<4;i++) {
            await ready(page);
            await page.evaluate(i=>{const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard,p=b.problems[i];b.submitChoice(i===2?0:p.choices.indexOf(p.answer));},i);
            if (i===2) await shot(page, `${renderer}-wrong-equality`);
            await page.waitForTimeout(450);
        }
        await page.waitForFunction(()=>(window as any).__styleResults.length===1);
        expect(await page.evaluate(()=>(window as any).__styleResults[0][1])).toEqual([true,true,false,true]);
        await shot(page, `${renderer}-complete`);
        await page.evaluate(()=>{
            const b=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            b.show([(window as any).__styleProblems[0]], { defense: { power:3,incomingDamage:6 } });
        }); await ready(page);
        expect(await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.expression.relation.list[0].name)).toBe('emptyComparisonSlot');
        await shot(page, `${renderer}-shield`);
    });

    test(`advanced Guild and catacomb questions use empty relations — ${renderer}`, async ({page})=>{
        await start(page,renderer); await mixed(page,true);
        await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('GuildScene'));
        await waitForScene(page,'GuildScene');
        await page.evaluate(async()=>{
            const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
            const {createInitialComparisonChapterState}=await import('/src/systems/ComparisonLearningSystem.ts');
            const m=GameStateManager.getInstance().getMasteryData();
            m.bands.E.state='training';m.subAtoms.E4.state='training';m.comparisonChapter=createInitialComparisonChapterState('complete');
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            g.currentMasteryExamType='sub_atom';g.currentMasteryExamTarget='E4';g.startTrial();
            g.trialProblems=(window as any).__styleProblems;g.trialState.currentProblemIndex=0;g.showCurrentProblem();
        });
        expect(await page.evaluate(()=>{
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene,v=g.comparisonExpressionVisual;
            return [v.left.text,v.right.text,v.relation.list[0].name,g.problemText.visible];
        })).toEqual(['12 + 8','19 - 7','emptyComparisonSlot',false]);
        expect(await page.evaluate(()=>{const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;return g.trialOverlay.visible&&!g.resultsOverlay.visible;})).toBe(true);
        await shot(page,`${renderer}-guild`);
        await page.evaluate(()=>{
            const g=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;g.trialTimer?.remove();
            g.scene.start('CatacombTrialScene',{examType:'fluency_challenge',subAtomId:'E4'});
        });
        await waitForScene(page,'CatacombTrialScene');
        await page.evaluate(()=>{
            const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            s.problemQueue=[...(window as any).__styleProblems];s.startBattle();s.stopChargeTimer();
            (window as any).__styleCatacomb=s.mathBoard;
        });
        expect(await page.evaluate(()=>(window as any).__styleCatacomb.comparison.relation.list[0].name)).toBe('emptyComparisonSlot');
        await shot(page,`${renderer}-catacomb`);
        await page.evaluate(()=>(window as any).__styleCatacomb.comparison.reveal());
        await shot(page,`${renderer}-catacomb-revealed`);
    });
}

test('mobile ordinary comparison keeps both expressions, empty slot and image choices',async({page})=>{
    await start(page,'webgl');await mixed(page,true);
    const snapshot=await page.evaluate(()=>(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.getActiveProblemSnapshot());
    expect(snapshot.comparison).toEqual({representation:'arithmetic',leftExpression:'12 + 8',rightExpression:'19 - 7',crocodileChoices:false,showReminders:false});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async snapshot=>{
        const {RemoteInputService}=await import('/src/remote/RemoteInputService.ts');
        const {mountRemoteControllerApp}=await import('/src/remote/controllerApp.ts');
        const service=RemoteInputService.getInstance() as any;
        service.connectController=async()=>({role:'controller',room:'TEST',clientId:'qa'});
        service.sendCommand=(command:any)=>{(window as any).__styleRemoteCommand=command};
        service.currentState={screen:'math',title:'Vyber znaménko',...snapshot};
        history.replaceState(null,'','/?room=TEST');mountRemoteControllerApp();
    },snapshot);
    await expect(page.locator('.remote-comparison-slot')).toBeVisible();
    await expect(page.locator('.remote-comparison-side')).toHaveText(['12+8','19-7']);
    await expect(page.locator('.remote-comparison-answers button img')).toHaveCount(3);
    await shot(page,'mobile-advanced');
    await page.locator('.remote-comparison-answers button').last().click();
    expect(await page.evaluate(()=>(window as any).__styleRemoteCommand)).toEqual({type:'answerChoice',index:2});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

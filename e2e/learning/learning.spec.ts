import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';

for (const renderer of ['canvas', 'webgl']) {
    test(`learning map touch and comparison chapter — ${renderer}`, async ({ page, context }) => {
        await page.setViewportSize({ width: 1024, height: 768 });
        await openSeededGame(page, true);
        if (renderer === 'canvas') {
            await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene');
        }
        const menuImages = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\.(png|webp|jpg)/.test(r.name)).length);
        expect(menuImages).toBeLessThan(35);
        await page.evaluate(async () => {
            const {GameStateManager} = await import('/src/systems/GameStateManager.ts');
            const g = GameStateManager.getInstance(), m = g.getMasteryData();
            m.subAtoms.A1.state = 'secure'; m.subAtoms.A2.state = 'fluent'; m.subAtoms.A3.state = 'fluent'; m.subAtoms.A4.state = 'training';
            g.getPlayer().name = 'Eli QA';
            (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene');
        });
        await waitForScene(page, 'GuildScene');
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.show());
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getContent().getByName('comparisonMapNode') !== null)).toBe(true);
        await page.screenshot({path:`artifacts/learning-qa/map-${renderer}-tablet.png`});
        const cdp = await context.newCDPSession(page);
        const box = (await page.locator('canvas').boundingBox())!;
        const touch = (x:number,y:number) => ({x:box.x+x*box.width/1280,y:box.y+y*box.height/720});
        await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[touch(950,530)]});
        for(let y=505;y>=230;y-=25) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[touch(950,y)]});
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getScrollOffset())).toBeGreaterThan(200);
        await page.screenshot({path:`artifacts/learning-qa/map-${renderer}-scrolled.png`});
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.setScrollOffset(0));
        const node = await page.evaluate(() => {
            const root=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getContent().getByName('comparisonMapNode');
            const p=root.getWorldTransformMatrix().transformPoint(0,0);return {x:p.x,y:p.y};
        });
        const point=touch(node.x,node.y);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getContent().getByName('comparisonMapDetail') !== null)).toBe(true);
        await page.screenshot({path:`artifacts/learning-qa/map-${renderer}-detail.png`});
        const resolutions = await page.evaluate(() => {
            const content=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getContent();
            const texts:any[]=[];const visit=(o:any)=>{if(o.type==='Text')texts.push(o);if(o.list)o.list.forEach(visit)};visit(content);
            return texts.every(t=>t.style.resolution===t.frame.source.resolution);
        });
        expect(resolutions).toBe(true);
        const arithmeticNode = await page.evaluate(() => {
            const node=(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.scrollPanel.getContent().getByName('masteryMapNode:A1');
            const p=node.getWorldTransformMatrix().transformPoint(0,0);return {x:p.x,y:p.y};
        });
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(arithmeticNode.x,arithmeticNode.y)]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => [...(window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.expandedSubAtoms])).toEqual(['A1']);
    });
}

test('per-scene textures arrive before battle, forest, mana and chapter creation', async ({page}) => {
    await openSeededGame(page, true);
    const initial = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.textures.getTextureKeys().length);
    for (const [key, data] of [
        ['TownScene', {}], ['ArenaScene', {}],
        ['BattleScene', {fromArena:true,arenaLevel:1,wave:0}],
        ['ManaCollectionScene', {}], ['ForestRoomScene', {roomId:'forest_edge'}],
        ['UnderwaterRoomScene', {preview:true}],
    ] as const) {
        await page.evaluate(async ({key,data}) => {
            if (key === 'ForestRoomScene') {
                const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
                JourneySystem.getInstance().startRoomJourney('verdant_forest', 'forest_edge', true);
            }
            const game=(window as any).__LITTLE_MATH_GAME__;game.scene.getScenes(true).at(-1).scene.start(key,data);
        }, {key,data});
        await waitForScene(page, key);
        await page.waitForTimeout(250);
        await page.screenshot({path:`artifacts/learning-qa/lazy-${key}.png`});
    }
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.textures.getTextureKeys().length)).toBeGreaterThan(initial);
});

test('co-op keeps advanced arithmetic and the new lesson separate through combat, mana and reload', async ({page}) => {
    await openSeededGame(page, true);
    await page.evaluate(async () => {
        const {GameStateManager} = await import('/src/systems/GameStateManager.ts');
        const {PlacementInitializer} = await import('/src/systems/PlacementInitializer.ts');
        const g = GameStateManager.getInstance();
        g.loadSlot(0); g.getPlayer().name = 'Kitten QA'; g.getPlayer().attack = 5;
        PlacementInitializer.applyBandSelection('E', g);
        g.getMathStats().totalAttempts = 324;
        g.getMasteryData().bands.A.state = 'training';
        g.getMasteryData().subAtoms.A1.state = 'training';
        g.save();
        g.loadSlot(1); g.getPlayer().name = 'Eli QA';
        const data = g.getMasteryData();
        data.subAtoms.A1.state = 'secure'; data.subAtoms.A2.state = 'fluent';
        data.subAtoms.A3.state = 'fluent'; data.subAtoms.A4.state = 'training';
        g.save(); g.loadSlot(0);
        sessionStorage.setItem('lma-e2e-preserve-saves', 'true');
    });
    await activateCoopSession(page);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('BattleScene', {fromArena:true,arenaLevel:1,wave:0}));
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    const first = await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        battle.onAttackClicked(); return battle.battleState.currentProblems;
    });
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((problem:any) => problem.masteryKey?.startsWith('E1:'))).toBe(true);
    const second = await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        battle.mathBoard.hide(); battle.setPhase('player_b_turn'); battle.onAttackClicked();
        return battle.battleState.currentProblems;
    });
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((problem:any) => problem.comparisonMeta?.stage === 'size_crocodile')).toBe(true);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('ManaCollectionScene'));
    await waitForScene(page, 'ManaCollectionScene');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.startGame());
    await page.screenshot({path:'artifacts/learning-qa/coop-mana.png'});
    const pools = await page.evaluate(() => {
        const mana = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        return [mana.laneA.manaPool, mana.laneB.manaPool].map(pool=>pool.map((problem:any)=>problem.masteryKey));
    });
    expect(pools[0]).toHaveLength(20); expect(pools[1]).toHaveLength(20);
    expect(pools[0].every((key:string)=>key.startsWith('E1:'))).toBe(true);
    expect(pools[1].every((key:string)=>/^A[12]:/.test(key))).toBe(true);
    await page.evaluate(async () => {
        const {CoopSessionManager} = await import('/src/systems/CoopSessionManager.ts');
        CoopSessionManager.getInstance().endSession();
    });
    await page.reload(); await waitForScene(page, 'MenuScene');
    const saved = await page.evaluate(() => [0,1].map(slot=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_'+slot)!)));
    expect(saved[0].player.attack).toBe(5);
    expect(saved[0].mathStats.totalAttempts).toBe(324);
    expect(saved[0].mathStats.masteryData.selectedStartBand).toBe('E');
    expect(saved[0].mathStats.masteryData.bands.A.state).toBe('secure');
    expect(saved[1].mathStats.masteryData.comparisonChapter.status).toBe('training');
    expect(saved[1].mathStats.masteryData.subAtoms.A3.state).toBe('fluent');
});

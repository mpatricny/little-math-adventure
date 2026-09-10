import {test,expect,openSeededGame,waitForScene} from '../arena/helpers/arena-harness';

test('first forest wolf victory makes the single wolf available in the workshop',async({page})=>{
    // Extra health isolates liberation from combat balance; all answers use real controls.
    await openSeededGame(page,false,{}, {},{hp:100,maxHp:100});
    await page.evaluate(()=>{
        const game=(window as any).__LITTLE_MATH_GAME__;
        game.scene.keys.MenuScene.scene.start('BattleScene',{encounterId:'forest-room-edge-wolf',returnScene:'PythiaWorkshopScene'});
    });
    await waitForScene(page,'BattleScene');
    const deadline=Date.now()+90000;
    while(Date.now()<deadline){
        const state=await page.evaluate(()=>{
            const game=(window as any).__LITTLE_MATH_GAME__;
            const s=game.scene.keys.BattleScene;
            if(!game.scene.isActive('BattleScene')||s.battleState.phase==='victory')return {done:true};
            const b=s.mathBoard;const row=b?.problemRows[b.currentProblemIndex];
            const button=row?.buttons.find((o:any)=>o.getData('isCorrect')&&o.getData('bg')?.input?.enabled);
            if(b?.container.visible&&button){const r=button.getBounds();return{x:r.centerX,y:r.centerY};}
            if(s.battleState.phase==='player_turn')return{x:s.battleActionDock.attackRoot.x,y:s.battleActionDock.attackRoot.y};
            return{};
        });
        if(state.done)break;
        if(state.x!==undefined){const b=(await page.locator('canvas').boundingBox())!;await page.mouse.click(b.x+state.x*b.width/1280,b.y+state.y!*b.height/720);}
        await page.waitForTimeout(400);
    }
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets)).toContain('forest_wolf');
    await page.evaluate(()=>{const game=(window as any).__LITTLE_MATH_GAME__;game.scene.getScenes(true).at(-1).scene.start('PythiaWorkshopScene');});
    await waitForScene(page,'PythiaWorkshopScene');
    const wolves=await page.evaluate(()=>{
        const s=(window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        return s.getSortedUnlockedPets(s.cache.json.get('pets'),s.gameState.getPlayer()).filter((p:any)=>p.animPrefix==='wolf').map((p:any)=>p.id);
    });
    expect(wolves).toEqual(['pet_wolf']);
    await page.screenshot({path:'artifacts/catacombs/workshop-wolf.png'});
});

import { test, expect, openSeededGame, activateCoopSession } from '../arena/helpers/arena-harness';
import { tap, answerPearl, solveOpenChest } from '../underwater/hands-on-helpers';
import type { Page } from 'playwright/test';

async function openRoom(page: Page, room: string, host: string, field: string) {
    await page.evaluate(room=>{
        const g=(globalThis as any).__LITTLE_MATH_GAME__;
        g.scene.getScenes(true).forEach((s:any)=>g.scene.stop(s.scene.key));g.scene.start('UnderwaterRoomScene',{roomId:room});
    },room);
    await page.waitForFunction(room=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;return s.scene.isActive()&&s.roomId===room&&s.party.length>0&&!s.revealing;},room);
    await page.waitForTimeout(400);
    const pos=await page.evaluate(host=>{const h=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get(host);return{x:h.x,y:h.y};},host);
    await tap(page,pos.x,pos.y);
    await page.waitForFunction(field=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene[field],field);
}
async function prepare(page: Page, coop: boolean) {
    await page.addInitScript(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(kind:string,...args:any[]){return kind.includes('webgl')?null:(original as any).call(this,kind,...args);} as typeof original;
    });
    await openSeededGame(page,coop);
    if(coop)await activateCoopSession(page);
    await page.evaluate(async coop=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');
        const {CoopSessionManager}=await import('/src/systems/CoopSessionManager.ts');
        const {UNDERWATER_ROOMS}=await import('/src/systems/UnderwaterProgressSystem.ts');
        const gs=GameStateManager.getInstance(),session=CoopSessionManager.getInstance();
        for(const id of coop?['A','B']:['A']){
            if(coop){if(id==='A')session.activatePlayerA();else session.activatePlayerB();}
            const data=coop?(id==='A'?session.getPlayerAMasteryData():session.getPlayerBMasteryData()):gs.getMasteryData();
            const selected=id==='A'?'E':'A';
            for(const band of ['A','B','C','D','E']){
                data.bands[band].state=band===selected?'training':band<selected?'mastery':'locked';
                for(const n of [1,2,3,4])data.subAtoms[`${band}${n}`].state=band<=selected&&(selected!=='A'||n===1)?'training':'locked';
            }
            gs.getMathStats().masteryData=JSON.parse(JSON.stringify(data));
            const p=gs.getPlayer();p.hp=p.maxHp=80;
            p.storyProgress={...p.storyProgress,hasCompletedIntro:true,hasUnlockedSilverpond:true,hasWaterBreathingScale:true};
            p.puzzleProgress={version:1,active:{},results:{pump:{tier:id==='A'?3:1,attempts:[]}}};
            p.underwaterProgress={schemaVersion:1,active:true,introSeen:true,roomId:'sp_bell_hub',entryId:'shallows',visitedRooms:[],openedChests:[],bellNotes:1,puzzleAttempts:0,
                defeatedEncounters:Object.values(UNDERWATER_ROOMS).flatMap((r:any)=>r.encounter?[r.encounter.id]:[])};
            gs.save();
        }
        if(coop)session.activatePlayerA();
    },coop);
}

test('mixed co-op uses the shared lower profile and credits only the bell solver',async({page})=>{
    await prepare(page,true);
    await openRoom(page,'sp_sunken_canal','mechanismHost','pumpPuzzle');
    expect(await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.profile)).toMatchObject({band:'A',max:5,subtraction:false,tier:1});
    await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.closePuzzle());
    await openRoom(page,'sp_bell_hub','bellHost','bellPuzzle');
    expect(await page.evaluate(()=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;return{owner:s.puzzleOwner,profile:s.activePuzzle.profile};})).toMatchObject({owner:'B',profile:{band:'A',subtraction:false}});
    const before=await page.evaluate(()=>[0,1].map(i=>JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!).mathStats.totalAttempts));
    await answerPearl(page,true,false);
    const after=await page.evaluate(()=>[0,1].map(i=>JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!)));
    expect(after.map(s=>s.mathStats.totalAttempts)).toEqual(before);
    expect(after[0].player.puzzleProgress.results.bell).toBeUndefined();
    expect(after[1].player.puzzleProgress.results.bell.attempts).toHaveLength(1);
    expect(after.map(s=>s.player.underwaterProgress.bellNotes)).toEqual([2,2]);
    await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.closePuzzle());
});

test('a serialized unfinished puzzle restores its payload and controls after full application reload',async({page})=>{
    await prepare(page,false);
    await openRoom(page,'sp_sunken_canal','mechanismHost','pumpPuzzle');
    const pos=await page.evaluate(()=>{const p=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle,h=p.builder.get('pumpRotor0Host');return{x:h.x,y:h.y};});
    await tap(page,pos.x,pos.y);await page.waitForTimeout(700);
    const state=await page.evaluate(()=>{
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return{payload:s.activePuzzle.payload,selected:[...s.pumpPuzzle.selected],storage:Object.fromEntries(Object.entries(localStorage))};
    });
    // The seed helper runs at document start; restoring this snapshot after it models real persisted storage.
    await page.addInitScript(storage=>{localStorage.clear();Object.entries(storage).forEach(([k,v])=>localStorage.setItem(k,String(v)));},state.storage);
    await page.reload();await page.waitForFunction(()=>(globalThis as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    await openRoom(page,'sp_sunken_canal','mechanismHost','pumpPuzzle');
    expect(await page.evaluate(()=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;return{payload:s.activePuzzle.payload,selected:s.pumpPuzzle.selected};})).toEqual({payload:state.payload,selected:state.selected});
});

test('generated practice keeps mechanism rewards single-use and postal chests use a generated word', async ({page}) => {
    await prepare(page,false);
    const solvePump = async () => {
        const plan = await page.evaluate(() => {
            const p=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle;
            return p.selected.map((n:number,i:number)=>{
                const h=p.builder.get(`pumpRotor${i}Host`);
                return {x:h.x,y:h.y,turns:(p.challenge.solution[i]-n+p.challenge.options[i].length)%p.challenge.options[i].length};
            });
        });
        for(const step of plan)for(let i=0;i<step.turns;i++){await tap(page,step.x,step.y);await page.waitForTimeout(250);}
        const run=await page.evaluate(()=>{const h=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle.builder.get('iconPumpRunHost');return{x:h.x,y:h.y};});
        await tap(page,run.x,run.y);
        await page.waitForFunction(()=>!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal);
    };
    const resources=()=>page.evaluate(()=>{const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;return{mana:s.player().mana,coins:{...s.player().coins}};});
    await openRoom(page,'sp_sunken_canal','mechanismHost','pumpPuzzle');
    const first = await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.startedAt);
    await solvePump();const earned=await resources();
    await openRoom(page,'sp_sunken_canal','mechanismHost','pumpPuzzle');
    expect(await page.evaluate(()=>(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.activePuzzle.startedAt)).toBeGreaterThan(first);
    await solvePump();expect(await resources()).toEqual(earned);
    await openRoom(page,'sp_wreck_hold','chestHost','wordChest');
    const word=await page.evaluate(async()=>{
        const {wordPools}=await import('/src/systems/puzzles/WordPuzzles.ts');
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return {word:s.activePuzzle.payload.word,pool:wordPools.cipherWords,postal:s.room.chest.postal};
    });
    expect(word.postal).toBe(true);expect(word.pool).toContain(word.word);
    await page.screenshot({path:'artifacts/puzzles/final-postal-chest-normal.png'});
    await solveOpenChest(page);
    const chestReward=await resources();
    const chest=await page.evaluate(()=>{const h=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('chestHost');return{x:h.x,y:h.y};});
    await tap(page,chest.x,chest.y);await page.waitForTimeout(400);
    expect(await resources()).toEqual(chestReward);
    expect(await page.evaluate(()=>Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal))).toBe(false);
});

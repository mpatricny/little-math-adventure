import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import { isolateDevProfile } from '../helpers/isolated-dev-profile';
import { tap } from './hands-on-helpers';
import encounters from '../../public/assets/data/encounters.json';
import enemies from '../../public/assets/data/enemies.json';
import rooms from '../../public/assets/data/underwater-rooms.json';
import { createEncounterCatalog } from '../../src/systems/EncounterCatalog';
import type { EnemyDefinition } from '../../src/types';

const catalog=createEncounterCatalog(encounters,{core:enemies as EnemyDefinition[]});

for (const scenario of [
    { canvas: false, coop: false }, { canvas: true, coop: false }, { canvas: true, coop: true },
]) test(`stronger underwater creatures share a visible read-free crest, Canvas=${scenario.canvas}, coop=${scenario.coop}`, async ({ page }) => {
    const { canvas, coop } = scenario;
    test.setTimeout(120_000);
    await isolateDevProfile(page);
    await page.setViewportSize(canvas ? { width: 1024, height: 768 } : { width: 1280, height: 720 });
    if (canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    await openSeededGame(page, coop, {}, {}, {
        hp: 55, maxHp: 55, attack: 8, defense: 2,
        storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
        underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_shallows', entryId: 'surface',
            visitedRooms: [], defeatedEncounters: [], openedChests: [], restoredMechanisms: [], litHubSeals: [] },
    }, {
        hp: 20, maxHp: 20, attack: 5, defense: 0,
        storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
        underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_shallows', entryId: 'surface',
            visitedRooms: [], defeatedEncounters: [], openedChests: [], restoredMechanisms: [], litHubSeals: [] },
    });
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    await page.evaluate(() => {
        const game=(globalThis as any).__LITTLE_MATH_GAME__;
        const active=game.scene.getScenes(true);active[active.length-1].scene.start('UnderwaterRoomScene');
    });
    await waitForScene(page, 'UnderwaterRoomScene');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party.length > 0);
    await page.waitForTimeout(500);
    const world = await page.evaluate(() => {
        const scene = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return scene.children.list.filter((o: any) => o.getData?.('enemyRank') === 'elite').map((o: any) => ({
            id: o.getData('enemyId'), width: o.displayWidth, height: o.displayHeight,
            texture: o.texture.key, interactive: Boolean(o.input), x: o.x, y: o.y,
        }));
    });
    expect(world).toHaveLength(2);
    expect(world.every((o: any) => o.width === 48 && o.height === 48 && !o.interactive)).toBe(true);
    await page.screenshot({ path: `artifacts/underwater/expansion-ranks-${canvas}-${coop}-world.png` });
    for (const roomId of ['sp_reed_garden','sp_sunken_canal','sp_current_chamber','sp_post_wreck','sp_glow_grotto','sp_depth_gate']) {
        await page.evaluate(roomId => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId, entryId:'gate' }), roomId);
        await page.waitForFunction(roomId => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.roomId===roomId && s.party.length>0;
        }, roomId);
        // See the full living cycle around the configured crest/body gap.
        for (const [index, delay] of [300,600,900].entries()) {
            await page.waitForTimeout(delay);
            await page.screenshot({ path:`artifacts/underwater/expansion-ranks-${canvas}-${coop}-${roomId}-${index}.png` });
        }
        const definition=(rooms.rooms as Record<string,any>)[roomId];
        const expected=catalog.resolveJourneyEncounter(definition.encounter.id,'solo').enemies.filter(enemy=>enemy.rank==='elite').length;
        expect(await page.evaluate(() => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.children.list.filter((o:any)=>o.getData?.('enemyRank')==='elite').length;
        })).toBe(expected);
    }
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId:'sp_shallows',entryId:'surface' }));
    await page.waitForFunction(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.roomId==='sp_shallows'&&s.party.length>0;
    });
    if (!canvas && !coop) {
        await page.evaluate(async () => {
            const game=(globalThis as any).__LITTLE_MATH_GAME__;game.sound.mute=true;
            const {gameAudio}=await import('/src/audio/AudioDirector.ts');
            for(const channel of ['music','voice','effects'] as const)gameAudio().setVolume(channel,0);
            const hide=(object:any)=>{if(typeof object.text==='string'&&/\p{L}/u.test(object.text))object.setVisible(false);object.list?.forEach(hide);};
            game.scene.keys.UnderwaterRoomScene.children.list.forEach(hide);
        });
        await page.screenshot({path:'artifacts/underwater/expansion-pre-reader-world.png'});
        expect(await page.evaluate(async () => {
            const {gameAudio}=await import('/src/audio/AudioDirector.ts');return gameAudio().snapshot().settings;
        })).toEqual({music:0,voice:0,effects:0});
    }
    const host = await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h=s.builder.get('guardianHost');return { x:h.x, y:h.y };
    });
    await tap(page, host.x, host.y);
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.enemies.length === 2);
    await page.waitForTimeout(500);
    const runtimeRoster=await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return s.battleState.enemies.map((enemy:any,index:number)=>({id:s.enemyDefs[index].id,hp:enemy.hp,maxHp:enemy.maxHp}));
    });
    expect(runtimeRoster).toEqual(catalog.resolveJourneyEncounter(rooms.rooms.sp_shallows.encounter.id,coop?'coop':'solo')
        .enemies.map(enemy=>({id:enemy.id,hp:enemy.hp,maxHp:enemy.hp})));
    const combat = await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return s.children.list.filter((o: any) => o.getData?.('enemyRank') === 'elite').map((o: any, index: number) => ({
            id:o.getData('enemyId'),width:o.displayWidth,height:o.displayHeight,texture:o.texture.key,
            dx:o.x-s.enemyHpBars[index]?.root.x,
        }));
    });
    expect(combat.map((o: any) => o.id)).toEqual(world.map((o: any) => o.id));
    expect(combat.every((o: any) => o.width === 48 && o.height === 48 && o.dx === 87)).toBe(true);
    await page.screenshot({ path: `artifacts/underwater/expansion-ranks-${canvas}-${coop}-battle.png` });
    if (!canvas && !coop) {
        const action=await page.evaluate(() => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene,b=s.attackButton.getBounds();
            return {x:b.centerX,y:b.centerY};
        });
        await tap(page,action.x,action.y);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
        await page.evaluate(() => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            const hide=(object:any)=>{if(typeof object.text==='string'&&/\p{L}/u.test(object.text))object.setVisible(false);object.list?.forEach(hide);};
            s.children.list.forEach(hide);
        });
        await page.screenshot({path:'artifacts/underwater/expansion-pre-reader-battle.png'});
        expect(await page.evaluate(() => {
            const b=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard,p=b.problems[b.currentProblemIndex];
            const before=b.results.length;b.submitChoice(p.choices.indexOf(p.answer));return b.results.length>before;
        })).toBe(true);
    }
    // The crest follows actor movement and fading without changing its geometry.
    await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        s.enemyContainers[0].x += 25; s.enemyContainers[0].y -= 12; s.enemyContainers[0].alpha = .4;
    });
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const badge=s.children.list.find((o: any)=>o.name===`enemy-rank-${s.enemyDefs[0].id}`);
        return { dx:badge.x-s.enemyHpBars[0].root.x, dy:badge.y-s.enemyHpBars[0].root.y, alpha:badge.alpha, scale:badge.scaleX===badge.scaleY };
    })).toEqual({ dx:87, dy:0, alpha:.4, scale:true });
    await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        s.enemyHpBars[0].destroy();
    });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => {
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return s.children.list.find((o: any)=>o.name===`enemy-rank-${s.enemyDefs[0].id}`).visible;
    })).toBe(false);
});

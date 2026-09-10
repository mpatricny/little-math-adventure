import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';

for (const canvas of [false, true]) test(`video creature artwork and full motion playback, Canvas=${canvas}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(canvas ? { width:1024, height:768 } : { width:1280, height:720 });
    if (canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            if (kind.includes('webgl')) return null;
            return original.call(this,kind as any,...args);
        } as typeof original;
    });
    await openSeededGame(page, false, {}, {}, {
        hp:55,maxHp:55,attack:8,defense:2,
        storyProgress:{ hasCompletedIntro:true,hasUnlockedSilverpond:true,hasWaterBreathingScale:true },
        underwaterProgress:{ schemaVersion:1,active:true,introSeen:true,roomId:'sp_glow_grotto',entryId:'canal',
            visitedRooms:[],defeatedEncounters:[],openedChests:[],bellNotes:3,puzzleAttempts:3,
            restoredMechanisms:['shrine-memory','chamber-routes'],litHubSeals:['shell','current'] },
    });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    for (const [roomId,prefix,actions] of [
        ['sp_glow_grotto','pearl-jellyfish',['idle','attack','hurt','death']],
        ['sp_lake_heart','depth-guardian',['idle','attack','attack-tide','attack-crystal','hurt','death']],
    ] as const) {
        await waitForScene(page,'UnderwaterRoomScene');
        if (roomId === 'sp_lake_heart') await page.evaluate(roomId => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.scene.restart({roomId,entryId:'gate'});
        },roomId);
        await page.waitForFunction(roomId => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.roomId===roomId && s.party.length && !s.revealing && !s.transitioning;
        },roomId);
        await page.waitForTimeout(400);
        await page.screenshot({path:`artifacts/underwater/creature-${prefix}-${canvas}-world.png`});
        const host=await page.evaluate(() => {
            const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const h=s.builder.get('guardianHost');return {x:h.x,y:h.y};
        });
        await tap(page,host.x,host.y);await waitForScene(page,'BattleScene');
        await page.waitForTimeout(600);
        for (const action of actions) {
            const key=`${prefix}-${action}`;
            await page.evaluate(key => {
                const b=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                const sprite=b.enemies[0];
                b.__motionComplete=false;
                const record=() => { b.__motionComplete=true; };
                sprite.once(key.endsWith('-idle')?'animationrepeat':`animationcomplete-${key}`,record);
                sprite.play(key);
            },key);
            await page.waitForTimeout(action==='attack-crystal'?1050:600);
            expect(await page.evaluate(() => {
                const b=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                const sprite=b.enemies[0],bounds=sprite.getBounds();
                return {square:sprite.width===512&&sprite.height===512,uniform:sprite.scaleX===sprite.scaleY,
                    visible:bounds.left>=0&&bounds.right<=1280&&bounds.top>=0&&bounds.bottom<=720};
            })).toEqual({square:true,uniform:true,visible:true});
            await page.screenshot({path:`artifacts/underwater/creature-${prefix}-${canvas}-${action}.png`});
            await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.__motionComplete);
        }
        await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('UnderwaterRoomScene'); });
    }
});

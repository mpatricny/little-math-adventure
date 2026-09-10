import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, activateCoopSession } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';

async function ready(page: Page, roomId: string) {
    await page.waitForFunction(roomId => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.scene.isActive() && s.roomId === roomId && s.party.length && !s.transitioning && !s.ui.modal && !s.revealing;
    }, roomId);
}
async function hit(page: Page, id: string, puzzle?: string) {
    const point = await page.evaluate(({ id, puzzle }) => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = (puzzle ? s[puzzle].builder : s.builder).get(id); return { x: h.x, y: h.y };
    }, { id, puzzle });
    await tap(page, point.x, point.y);
}
async function solve(page: Page, shrine: boolean) {
    await hit(page, 'mechanismHost');
    const field = shrine ? 'reversePuzzle' : 'routingPuzzle';
    await page.waitForFunction(field => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene[field], field);
    if (shrine) {
        for (let stage = 0; stage < 3; stage++) {
            await page.waitForFunction(stage => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle?.challenge.stage === stage, stage);
            const index = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle.challenge.answerIndex);
            await hit(page, `reverseCard${index}Host`, field); await hit(page, 'iconReverseRunHost', field);
        }
    } else {
        const switches = await page.evaluate(() => {
            const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle;
            return p.selected.flatMap((n: boolean, i: number) => n === p.challenge.solution[i] ? [] : [i]);
        });
        for (const i of switches) { await hit(page, `routingSwitch${i}Host`, field); await page.waitForTimeout(250); }
        await hit(page, 'iconRoutingRunHost', field);
    }
    await ready(page, shrine ? 'sp_shell_shrine' : 'sp_current_chamber');
}

for (const config of [
    { width: 1280, height: 720, canvas: false, coop: false },
    { width: 1024, height: 768, canvas: true, coop: false },
    { width: 1280, height: 800, canvas: true, coop: false },
    { width: 1280, height: 720, canvas: false, coop: true },
]) test(`map passages, real seal unlock and one-way arrivals ${JSON.stringify(config)}`, async ({ page }) => {
    test.setTimeout(160_000);
    await page.setViewportSize({ width: config.width, height: config.height });
    if (config.canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
            return (original as any).call(this, kind, ...args);
        } as typeof original;
    });
    const hero = {
        storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
        underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_bell_hub', entryId: 'shallows',
            visitedRooms: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
            restoredMechanisms: ['garden-current', 'canal-pump'],
            // Fight rendering/rewards are covered by underwater-seals; this test exercises door unlocks through the actual puzzles.
            defeatedEncounters: ['silverpond-shallows-guardian', 'silverpond-garden-patrol', 'silverpond-canal-blockade', 'silverpond-chamber-keepers'] },
    };
    await openSeededGame(page, config.coop, {}, {}, hero, hero);
    if (config.coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, 'sp_bell_hub');
    const prefix = `artifacts/underwater/passages-${config.width}x${config.height}-${config.coop ? 'coop' : 'solo'}`;
    const shot = async (name: string) => {
        await page.waitForTimeout(650);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
        await page.screenshot({ path: `${prefix}-${name}.png` });
    };
    await shot('hub');
    await hit(page, 'exitDepthsHost'); await page.waitForTimeout(650); await ready(page, 'sp_bell_hub');
    for (const shrine of [true, false]) {
        const roomId = shrine ? 'sp_shell_shrine' : 'sp_current_chamber';
        const parent = shrine ? 'sp_reed_garden' : 'sp_sunken_canal';
        await hit(page, shrine ? 'exitGardenHost' : 'branchRightHost'); await ready(page, parent);
        await shot(parent);
        if (!shrine) {
            await hit(page, 'exitGrottoHost'); await ready(page, 'sp_glow_grotto');
            await shot('grotto-side-route');
            await hit(page, 'exitCanalHost'); await ready(page, parent);
        }
        await hit(page, shrine ? 'exitShrineHost' : 'exitChamberHost'); await ready(page, roomId);
        await hit(page, 'exitReturnHost'); await page.waitForTimeout(500); await ready(page, roomId);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.exits.find((e: any) => e.id === 'bell-shortcut').blocker.visible)).toBe(true);
        await shot(`${roomId}-locked`);
        await solve(page, shrine);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.exits.find((e: any) => e.id === 'bell-shortcut').blocker.visible)).toBe(false);
        await shot(`${roomId}-open`);
        await hit(page, 'exitReturnHost'); await ready(page, 'sp_bell_hub');
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.entryId)).toBe(shrine ? 'shrine_return' : 'chamber_return');
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBe(shrine ? 205 : 1100);
        await shot(shrine ? 'shell-arrival' : 'current-arrival');
        const saves = await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
        for (const save of saves) expect(save.player.underwaterProgress.entryId).toBe(shrine ? 'shrine_return' : 'chamber_return');
        const host = shrine ? 'arrivalShellHost' : 'arrivalCurrentHost';
        expect(await page.evaluate(host => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.children.list.filter((o: any) => o.name === host).every((o: any) => !o.input?.enabled);
        }, host)).toBe(true);
        await hit(page, host); await page.waitForTimeout(650); await ready(page, 'sp_bell_hub');
    }
    await hit(page, 'exitLeftHost'); await ready(page, 'sp_shallows'); await shot('shallows');
});

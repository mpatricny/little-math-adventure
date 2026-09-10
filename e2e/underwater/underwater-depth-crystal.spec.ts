import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';
import type { Page } from 'playwright/test';

const hero = {
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true,
        hasInstalledForestCrystal: true },
    underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_lake_heart', entryId: 'gate',
        visitedRooms: ['sp_lake_heart'], defeatedEncounters: ['silverpond-depth-guardian'], openedChests: [],
        bellNotes: 3, puzzleAttempts: 3, position: { roomId: 'sp_lake_heart', x: 838 } },
};
async function touchHost(page: Page, scene: string, id: string, builder = 'sceneBuilder') {
    const h = await page.evaluate(({ scene, id, builder }) => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys[scene];
        const h = builder === 'ui' ? s.ui.builder.get(id) : s[builder].get(id);
        return { x: h.x, y: h.y };
    }, { scene, id, builder });
    await tap(page, h.x, h.y);
}
async function resume(page: Page, coop: boolean, expected: string) {
    if (coop) await activateCoopSession(page, expected);
    else {
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('SaveSlotScene'));
        await waitForScene(page, 'SaveSlotScene');
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.SaveSlotScene.onPlayClicked());
        await waitForScene(page, expected);
    }
}
async function reloadSaves(page: Page, coop: boolean, expected: string) {
    const saves = await page.evaluate(() => [0, 1].map(i => localStorage.getItem(`littleMathAdventure_slot_${i}`)));
    await page.addInitScript(saves => saves.forEach((save, i) => {
        if (save) localStorage.setItem(`littleMathAdventure_slot_${i}`, save);
    }), saves);
    await page.reload(); await waitForScene(page, 'MenuScene'); await resume(page, coop, expected);
}

for (const mode of ['desktop', 'tablet', 'coop-tablet'] as const) test(`second crystal: lake → ship → calibration → unlock (${mode})`, async ({ page }) => {
    test.setTimeout(130_000);
    const coop = mode === 'coop-tablet';
    await page.setViewportSize(mode === 'tablet' ? { width: 1024, height: 768 } : { width: 1280, height: coop ? 800 : 720 });
    if (mode !== 'desktop') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    const shot = async (state: string) => {
        expect(await page.evaluate(async () => {
            const scene = (globalThis as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
            if (!['ZyxRocketInterludeScene', 'ZyxCrystalMachineScene'].includes(scene.sys.settings.key)) return [];
            const { auditUnderwaterLayout } = await import('/src/ui/UnderwaterTheme.ts');
            return auditUnderwaterLayout(scene);
        })).toEqual([]);
        await page.screenshot({ path: `artifacts/underwater/depth-crystal-${mode}-${state}.png` });
    };
    await openSeededGame(page, coop, {}, {}, hero);
    await resume(page, coop, 'UnderwaterRoomScene');
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing);
    await touchHost(page, 'UnderwaterRoomScene', 'depthCrystalHost', 'builder');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal);
    await touchHost(page, 'UnderwaterRoomScene', 'modalNextHost', 'ui');
    await waitForScene(page, 'ZyxRocketInterludeScene');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.children.getByName('depthShipHatch')?.input?.enabled);
    await page.waitForTimeout(450); await shot('ship');
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipHatchHost');
    await waitForScene(page, 'ZyxCrystalMachineScene'); await page.waitForTimeout(500);
    await shot('normal');
    expect(await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return { depth: s.depthCrystal, first: !!s.children.getByName('installedForestCrystal'),
            socket: s.questSlotHost.x, firstSocket: s.sceneBuilder.get('machineQuestSlotHost').x };
    })).toMatchObject({ depth: true, first: true, socket: 638, firstSocket: 450 });

    // Wrong choices stay a retry; they must not grant or insert the story crystal.
    const wrong = await page.evaluate(() => {
        const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.puzzleInstance.payload;
        for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++)
            if (p.values[a] + p.values[b] + p.values[c] !== p.target) return [a, b, c];
        throw new Error('No distractors');
    });
    for (const i of wrong) await touchHost(page, 'ZyxCrystalMachineScene', `machineNumber${i + 1}Host`);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.titleText.text === 'ZKUS TO ZNOVU');
    await shot('wrong');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.phase === 'selecting');
    const solution = await page.evaluate(() => {
        const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.puzzleInstance.payload;
        for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++)
            if (p.values[a] + p.values[b] + p.values[c] === p.target) return [a, b, c];
        throw new Error('No solution');
    });
    await touchHost(page, 'ZyxCrystalMachineScene', `machineNumber${solution[0] + 1}Host`);
    const puzzle = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.puzzleInstance.payload);
    // A real reload resumes at the ship, then restores the same puzzle and its chosen chip.
    await reloadSaves(page, coop, 'ZyxRocketInterludeScene');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.children.getByName('depthShipHatch')?.input?.enabled);
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipHatchHost');
    await waitForScene(page, 'ZyxCrystalMachineScene');
    expect(await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return s.crystalImage.texture.key;
    })).toBe('underwater-depth-crystal');
    expect(await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return { payload: s.puzzleInstance.payload, selection: s.selectedValues };
    })).toEqual({ payload: puzzle, selection: [solution[0]] });
    for (const i of solution.slice(1)) await touchHost(page, 'ZyxCrystalMachineScene', `machineNumber${i + 1}Host`);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.phase === 'calibrated');
    await shot('calibrated');
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineCrystalHost');
    await shot('socket');
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineDepthSlotHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.actionEnabled);
    await shot('ready');
    expect(await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return { key: s.crystalImage.texture.key, x: s.crystalRoot.x, y: s.crystalRoot.y };
    })).toEqual({ key: 'underwater-depth-crystal', x: 638, y: 165 });
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineActionHost');
    await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return s.phase === 'activated' && s.actionEnabled; });
    await shot('installed');
    const results = await page.evaluate(coop => Array.from({ length: coop ? 2 : 1 }, (_, i) => {
        const p = JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!).player;
        return { claimed: p.underwaterProgress.depthCrystalClaimed, installed: p.underwaterProgress.depthCrystalInstalled,
            first: p.storyProgress.hasInstalledForestCrystal, active: p.underwaterProgress.active,
            puzzleCompleted: p.puzzleProgress?.active['zyx:depth-machine']?.completed ?? false };
    }), coop);
    results.forEach((r, i) => expect(r).toEqual({ claimed: true, installed: true, first: true, active: false, puzzleCompleted: i === 0 }));
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineActionHost');
    await waitForScene(page, 'ZyxRocketInterludeScene'); await page.waitForTimeout(650); await shot('unlocked');
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipNextCityHost');
    await page.waitForTimeout(250); await shot('next-city');
    await reloadSaves(page, coop, 'ZyxRocketInterludeScene');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.machineCompleted)).toBe(true);
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipReturnHost');
    await waitForScene(page, 'SilverpondTownMockScene'); await page.waitForTimeout(650); await shot('town');
    await touchHost(page, 'SilverpondTownMockScene', 'depthShipEntryHost');
    await waitForScene(page, 'ZyxRocketInterludeScene');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.machineCompleted)).toBe(true);
});

async function finishMachine(page: Page, depth: boolean): Promise<void> {
    await waitForScene(page, 'ZyxCrystalMachineScene');
    const solution = await page.evaluate(() => {
        const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.puzzleInstance.payload;
        for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++)
            if (p.values[a] + p.values[b] + p.values[c] === p.target) return [a, b, c];
        throw new Error('No solution');
    });
    for (const i of solution) await touchHost(page, 'ZyxCrystalMachineScene', `machineNumber${i + 1}Host`);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.phase === 'calibrated');
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineCrystalHost');
    await touchHost(page, 'ZyxCrystalMachineScene', depth ? 'machineDepthSlotHost' : 'machineQuestSlotHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene.actionEnabled);
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineActionHost');
    await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxCrystalMachineScene;
        return s.phase === 'activated' && s.actionEnabled; });
}

test('first forest crystal still installs in the first socket without granting the second', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { storyProgress: { hasCompletedIntro: true, hasClaimedForestCrystal: true } });
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ZyxCrystalMachineScene'));
    await finishMachine(page, false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player);
    expect(saved.storyProgress.hasInstalledForestCrystal).toBe(true);
    expect(saved.underwaterProgress?.depthCrystalInstalled).not.toBe(true);
    expect(saved.puzzleProgress.active['zyx:machine'].completed).toBe(true);
    expect(saved.puzzleProgress.active['zyx:depth-machine']).toBeUndefined();
});

test('underwater menu preview can finish at the ship without writing the real save', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, hero);
    const before = await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0'));
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene', { preview: true, fromSurface: true }));
    await waitForScene(page, 'UnderwaterRoomScene');
    await page.evaluate(progress => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        Object.assign(s.progress(), progress, { depthCrystalClaimed: true, active: false });
        s.scene.start('ZyxRocketInterludeScene');
    }, hero.underwaterProgress);
    await waitForScene(page, 'ZyxRocketInterludeScene');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.children.getByName('depthShipHatch')?.input?.enabled);
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipHatchHost');
    await finishMachine(page, true);
    await touchHost(page, 'ZyxCrystalMachineScene', 'machineActionHost');
    await waitForScene(page, 'ZyxRocketInterludeScene');
    await touchHost(page, 'ZyxRocketInterludeScene', 'depthShipReturnHost');
    await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0'))).toBe(before);
});

for (const canvas of [false, true]) test(`ship controls retain their geometry in pointer states (${canvas ? 'tablet' : 'desktop'})`, async ({ page }) => {
    if (canvas) {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
                return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
            } as typeof original;
        });
    }
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...hero.underwaterProgress,
        active: false, depthCrystalClaimed: true, depthCrystalInstalled: true, depthCrystalShipActive: true } });
    await resume(page, false, 'ZyxRocketInterludeScene'); await page.waitForTimeout(600);
    const box = (await page.locator('canvas').boundingBox())!;
    const point = (x: number, y: number) => ({ x: box.x + x / 1280 * box.width, y: box.y + y / 720 * box.height });
    const home = point(1040, 254), outside = point(720, 380);
    const geometry: unknown[] = [];
    for (const state of ['normal', 'hover', 'pressed', 'pointer-out']) {
        if (state === 'hover') await page.mouse.move(home.x, home.y);
        if (state === 'pressed') await page.mouse.down();
        if (state === 'pointer-out') { await page.mouse.move(outside.x, outside.y); await page.mouse.up(); }
        await page.screenshot({ path: `artifacts/underwater/depth-ship-controls-${canvas ? 'tablet' : 'desktop'}-${state}.png` });
        geometry.push(await page.evaluate(() => {
            const root = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ZyxRocketInterludeScene.children.getByName('depthShipNextCity');
            return { x: root.x, y: root.y, width: root.width, height: root.height, scaleX: root.scaleX, scaleY: root.scaleY };
        }));
    }
    geometry.forEach(shape => expect(shape).toEqual(geometry[0]));
});

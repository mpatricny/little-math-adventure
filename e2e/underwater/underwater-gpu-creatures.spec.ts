import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { constrainTextureUploads, renderedCreatureFrame } from '../helpers/constrained-gpu';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import { tap } from './hands-on-helpers';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'artifacts/underwater/gpu-20261109';
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const profile = {
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_sunken_canal', entryId: 'garden',
        visitedRooms: [], defeatedEncounters: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
        restoredMechanisms: ['shrine-memory', 'chamber-routes', 'grotto-light'], litHubSeals: ['shell', 'current'] },
};

for (const canvas of [false, true]) test(`creatures render their real alpha through a 4096px GPU limit, Canvas=${canvas}`, async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir(directory, { recursive: true });
    await page.setViewportSize({ width: 1024, height: 768 });
    if (canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    else await constrainTextureUploads(page, 4096);
    // openSeededGame installs all API/dev-save/diagnostic mocks before navigation.
    await openSeededGame(page, !canvas, {}, {}, profile);
    if (!canvas) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(canvas ? 1 : 2);
    const renderer = canvas ? 'canvas' : 'gpu4096';
    const checkedMotions = new Set<string>();
    for (const roomId of ['sp_sunken_canal', 'sp_current_chamber', 'sp_depth_gate']) {
        await waitForScene(page, 'UnderwaterRoomScene');
        await page.evaluate(roomId => (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId, entryId: 'gate' }), roomId);
        await page.waitForFunction(roomId => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.roomId === roomId && s.party.length && !s.revealing && !s.transitioning;
        }, roomId);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${directory}/${renderer}-${roomId}-world.png` });
        await writeFile(`${directory}/${renderer}-upload-audit.json`, JSON.stringify(
            await page.evaluate(() => (window as any).__textureUploadAudit ?? null), null, 2));
        const keys = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.children.list.filter((o: any) => o.getData?.('waterArtwork')
                && /silverpond-(bubble-crab|armored-seahorse|rune-nautilus)-idle-sheet/.test(o.texture?.key))
                .map((o: any) => o.texture.key) as string[];
        });
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            const { png, ...pixels } = await renderedCreatureFrame(page, 'UnderwaterRoomScene', key, 0);
            await writeFile(`${directory}/${renderer}-${key}-gpu.png`, Buffer.from(png.split(',')[1], 'base64'));
            await writeFile(`${directory}/${renderer}-${key}-pixels.json`, JSON.stringify(pixels, null, 2));
            console.log('Rendered creature:', pixels);
            expect(pixels.exists).toBe(true); // Deliberately insufficient by itself.
            expect(pixels.cornerAlpha).toEqual([0, 0]);
            expect(pixels.alphaIoU).toBeGreaterThan(.98);
            expect(pixels.coloredFraction).toBeGreaterThan(.95);
        }
        const host = await page.evaluate(() => {
            const h = (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('guardianHost');
            return { x: h.x, y: h.y };
        });
        await tap(page, host.x, host.y); await waitForScene(page, 'BattleScene');
        await page.waitForTimeout(250);
        const motions = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            return s.enemyDefs.filter((e: any) => /armored-seahorse|rune-nautilus/.test(e.animPrefix)).flatMap((e: any) =>
                ['idle', 'attack', 'defend', 'defeat'].map(action => {
                    const texture = s.textures.get(`silverpond-${e.animPrefix}-${action}-sheet`);
                    return { key: texture.key, last: texture.frameTotal - 2 };
                }));
        });
        expect(motions.length).toBeGreaterThanOrEqual(4);
        for (const motion of motions) for (const index of [0, motion.last]) {
            checkedMotions.add(motion.key);
            const { png: _png, ...pixels } = await renderedCreatureFrame(page, 'BattleScene', motion.key, index);
            expect(pixels.cornerAlpha, `${motion.key}/${index}`).toEqual([0, 0]);
            expect(pixels.alphaIoU, `${motion.key}/${index}`).toBeGreaterThan(.98);
            expect(pixels.coloredFraction, `${motion.key}/${index}`).toBeGreaterThan(.95);
        }
        await page.screenshot({ path: `${directory}/${renderer}-${roomId}-battle.png` });
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('UnderwaterRoomScene'));
    }
    const uploads = await page.evaluate(() => (window as any).__textureUploadAudit ?? null);
    await writeFile(`${directory}/${renderer}-upload-audit.json`, JSON.stringify(uploads, null, 2));
    if (!canvas) expect(uploads.rejected).toEqual([]);
    expect(checkedMotions.size).toBe(8);
    const network = isolatedDevProfileAudit(page);
    await writeFile(`${directory}/${renderer}-network-audit.json`, JSON.stringify(network, null, 2));
    expect(network.observed.filter(path => !network.intercepted.includes(path))).toEqual([]);
});

import { writeFile } from 'node:fs/promises';
import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';

const KEY = '__LITTLE_MATH_GAME__';
const OUTPUT = 'artifacts/ui-refresh-v2/guides';
const frame = (page: Page) => page.evaluate(key => new Promise<void>(resolve => (window as any)[key].events.once('poststep', () => resolve())), KEY);
async function start(page: Page, scene: string, data = {}) {
    await page.evaluate(({ key, scene, data }) => (window as any)[key].scene.getScenes(true).at(-1).scene.start(scene, data), { key: KEY, scene, data });
    await waitForScene(page, scene);
}
async function buttonPoint(page: Page, sceneKey: string, name: string) {
    return page.evaluate(({ key, sceneKey, name }) => {
        const s = (window as any)[key].scene.keys[sceneKey];
        const find = (o: any): any => o.name === name ? o : o.list?.map(find).find(Boolean);
        const b = s.children.list.map(find).find(Boolean), m = b?.getWorldTransformMatrix();
        return b && { x: m.tx, y: m.ty, ready: b.getData('ready') && b.visible && b.alpha > .99,
            state: b.getData('confirmState'), width: b.width, height: b.height };
    }, { key: KEY, sceneKey, name });
}
async function ready(page: Page, sceneKey: string, name: string) {
    await expect.poll(() => buttonPoint(page, sceneKey, name)).toMatchObject({ ready: true });
}
async function moveToButton(page: Page, sceneKey: string, name: string) {
    const p = (await buttonPoint(page, sceneKey, name))!, canvas = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(canvas.x + p.x * canvas.width / 1280, canvas.y + p.y * canvas.height / 720);
    await frame(page);
}
async function tap(page: Page, sceneKey: string, name: string) {
    await moveToButton(page, sceneKey, name); await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}

/** Compare rendered character alpha with the actual dark medallion interior.
 * These measurements do not use the new portrait host/origin as their target.
 */
async function measurePortrait(page: Page, sceneKey: string) {
    return page.evaluate(({ key, sceneKey }) => {
        const s = (window as any)[key].scene.keys[sceneKey];
        const find = (o: any, name: string): any => o.name === name ? o : o.list?.map((x: any) => find(x, name)).find(Boolean);
        const portrait = s.children.list.map((o: any) => find(o, 'zyxDialogPortrait')).find(Boolean);
        const border = s.children.list.map((o: any) => find(o, 'zyxDialogFrame')).find(Boolean);
        const canvas = document.createElement('canvas');
        const image = border.texture.getSourceImage(); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Flood only the portrait's dark fill; the continuous gold border separates it from the dialogue.
        const visited = new Uint8Array(canvas.width * canvas.height), queue = [[142, 170]];
        let left = 1200, right = 0, top = 320, bottom = 0;
        for (let q = 0; q < queue.length; q++) {
            const [x, y] = queue[q], index = y * canvas.width + x;
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || visited[index]) continue;
            visited[index] = 1; const i = index * 4;
            if (pixels[i + 3] < 200 || Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) >= 65) continue;
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
            queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        }
        const borderMatrix = border.getWorldTransformMatrix();
        const centre = borderMatrix.transformPoint((left + right) / 2 - border.displayOriginX, (top + bottom) / 2 - border.displayOriginY);
        const radiusX = (right - left) / 2 * border.scaleX, radiusY = (bottom - top) / 2 * border.scaleY;
        const spriteMatrix = portrait.getWorldTransformMatrix(), spriteSource = portrait.texture.getSourceImage();
        canvas.width = spriteSource.width; canvas.height = spriteSource.height; ctx.drawImage(spriteSource, 0, 0);
        const centres = []; let outermost = 0;
        for (let n = 0; n < 30; n++) {
            const f = portrait.texture.get(n), data = ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
            let weight = 0, sumX = 0, sumY = 0;
            for (let y = 0; y < f.cutHeight; y++) for (let x = 0; x < f.cutWidth; x++) {
                const a = data[(y * f.cutWidth + x) * 4 + 3]; if (a <= 32) continue;
                weight += a; sumX += x * a; sumY += y * a;
                const p = spriteMatrix.transformPoint(x - portrait.displayOriginX, y - portrait.displayOriginY);
                outermost = Math.max(outermost, Math.hypot((p.x - centre.x) / radiusX, (p.y - centre.y) / radiusY));
            }
            const p = spriteMatrix.transformPoint(sumX / weight - portrait.displayOriginX, sumY / weight - portrait.displayOriginY);
            centres.push({ frame: n, x: p.x, y: p.y });
        }
        const average = centres.reduce((a, p) => ({ x: a.x + p.x / 30, y: a.y + p.y / 30 }), { x: 0, y: 0 });
        const b = border.getBounds();
        return { centre, average, centres, outermost, origin: [portrait.originX, portrait.originY],
            scale: [portrait.scaleX, portrait.scaleY], frameBounds: { x: b.x, y: b.y, width: b.width, height: b.height } };
    }, { key: KEY, sceneKey });
}
async function portraitShots(page: Page, sceneKey: string, prefix: string) {
    const metrics = await measurePortrait(page, sceneKey);
    await writeFile(`${OUTPUT}/${prefix}-alpha-audit.json`, JSON.stringify(metrics, null, 2));
    expect(Math.abs(metrics.average.x - metrics.centre.x)).toBeLessThan(1);
    expect(Math.abs(metrics.average.y - metrics.centre.y)).toBeLessThan(1);
    expect(metrics.scale[0]).toBe(metrics.scale[1]);
    expect(metrics.outermost, 'Every drawn idle-frame pixel retains a clear gap inside the medallion').toBeLessThan(.86);
    for (const c of metrics.centres) expect(Math.hypot(c.x - metrics.centre.x, c.y - metrics.centre.y)).toBeLessThan(8);
    for (const n of [0, 5, 10, 23]) {
        const origin = await page.evaluate(({ key, sceneKey, n }) => {
            const find = (o: any): any => o.name === 'zyxDialogPortrait' ? o : o.list?.map(find).find(Boolean);
            const portrait = (window as any)[key].scene.keys[sceneKey].children.list.map(find).find(Boolean);
            portrait.anims.pause(); portrait.setFrame(n); return [portrait.originX, portrait.originY];
        }, { key: KEY, sceneKey, n });
        expect(origin).toEqual(metrics.origin); await frame(page);
        await page.screenshot({ path: `${OUTPUT}/${prefix}-frame-${n}.png` });
        const canvas = (await page.locator('canvas').boundingBox())!, b = metrics.frameBounds;
        await page.screenshot({ path: `${OUTPUT}/${prefix}-portrait-${n}.png`, clip: {
            x: canvas.x + b.x * canvas.width / 1280, y: canvas.y + b.y * canvas.height / 720,
            width: 290 * (b.width / 1200) * canvas.width / 1280, height: b.height * canvas.height / 720,
        } });
    }
}
async function interactionShots(page: Page, sceneKey: string, name: string, prefix: string) {
    const original = (await buttonPoint(page, sceneKey, name))!;
    await moveToButton(page, sceneKey, name); await page.waitForTimeout(160);
    await page.screenshot({ path: `${OUTPUT}/${prefix}-hover.png` });
    await page.mouse.down(); await frame(page); await page.waitForTimeout(90);
    expect(await buttonPoint(page, sceneKey, name)).toMatchObject({ x: original.x, y: original.y, width: original.width, height: original.height, state: 'pressed' });
    await page.screenshot({ path: `${OUTPUT}/${prefix}-pressed.png` });
    await page.mouse.move(2, 2); await frame(page); await page.mouse.up(); await frame(page);
    expect(await buttonPoint(page, sceneKey, name)).toMatchObject({ state: 'normal' });
    await page.screenshot({ path: `${OUTPUT}/${prefix}-out.png` });
}

test.beforeEach(async ({ page }, info) => {
    // Read package/migrations and fixture harness before testing: this is frontend-only,
    // using isolated local saves; no API migration dependency and no real player save.
    await page.route('**/v1/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"authenticated":false}' }));
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (get as any).call(this, kind, ...args);
        } as typeof get;
    });
});

async function seed(page: Page) {
    await openSeededGame(page, false, {}, {}, { seenGuides: [] });
    await page.evaluate(async key => {
        (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().loadSlot(0);
        (window as any)[key].sound.mute = true;
        (await import('/src/audio/AudioDirector.ts')).gameAudio().setVolume('voice', 0);
    }, KEY);
}

test('Zyx follows one optical origin across the actual medallion and all idle frames', async ({ page }, info) => {
    await seed(page);
    const prefix = info.project.name;
    await start(page, 'SilverpondGuildMockScene'); await ready(page, 'SilverpondGuildMockScene', 'silverpondQuestAction');
    await tap(page, 'SilverpondGuildMockScene', 'silverpondQuestAction'); await ready(page, 'SilverpondGuildMockScene', 'silverpondQuestAction');
    await portraitShots(page, 'SilverpondGuildMockScene', `${prefix}-quest`);
    await interactionShots(page, 'SilverpondGuildMockScene', 'silverpondQuestAction', `${prefix}-quest`);

    await start(page, 'ZyxRocketInterludeScene', { testMode: true }); await ready(page, 'ZyxRocketInterludeScene', 'zyxDialogueActionButton');
    await portraitShots(page, 'ZyxRocketInterludeScene', `${prefix}-rocket`);
    await interactionShots(page, 'ZyxRocketInterludeScene', 'zyxDialogueActionButton', `${prefix}-rocket`);
});

test('dialogue actions clear the guild and underwater ornate borders', async ({ page }, info) => {
    await seed(page);
    const prefix = info.project.name;
    await start(page, 'GuildScene');
    await page.evaluate(key => (window as any)[key].scene.keys.GuildScene.showFeedback({ id: 'portrait-review', operand1: 2, operand2: 1, operator: '+', answer: 3, options: [2, 3, 4], problemType: 'standard' }, 4), KEY);
    await ready(page, 'GuildScene', 'trialFeedbackConfirm');
    await page.screenshot({ path: `${OUTPUT}/${prefix}-guild-normal.png` });
    await interactionShots(page, 'GuildScene', 'trialFeedbackConfirm', `${prefix}-guild`);

    await page.evaluate(async () => {
        const p = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer();
        p.storyProgress ??= {};
        p.storyProgress.hasWaterBreathingScale = true; delete p.underwaterProgress;
    });
    await start(page, 'UnderwaterRoomScene'); await ready(page, 'UnderwaterRoomScene', 'underwaterGuideConfirm');
    await page.screenshot({ path: `${OUTPUT}/${prefix}-underwater-normal.png` });
    await interactionShots(page, 'UnderwaterRoomScene', 'underwaterGuideConfirm', `${prefix}-underwater`);
});

test('PictureDialog retains its frame and the reusable underwater portrait stays aligned', async ({ page }, info) => {
    await seed(page);
    await start(page, 'CrashSiteScene');
    await page.evaluate(key => (window as any)[key].scene.keys.CrashSiteScene.showFirstDialog(), KEY);
    await ready(page, 'CrashSiteScene', 'pictureDialogConfirm');
    // Native Phaser NineSlice silently draws nothing in Canvas. Check an actual
    // border pixel against the same scene with only that frame hidden.
    const paintedBorderDifference = await page.evaluate(async key => {
        const game = (window as any)[key];
        const panel = game.scene.keys.CrashSiteScene.children.getByName('pictureDialog').getByName('pictureDialogFrame');
        const pixel = () => new Promise<number[]>(resolve => game.renderer.snapshotPixel(panel.x,
            panel.y - panel.height / 2 + 10, (c: any) => resolve([c.red, c.green, c.blue])));
        const visible = await pixel();
        panel.setVisible(false);
        const hidden = await pixel();
        panel.setVisible(true);
        await new Promise<void>(resolve => game.events.once('poststep', () => resolve()));
        return visible.reduce((sum, value, i) => sum + Math.abs(value - hidden[i]), 0);
    }, KEY);
    expect(paintedBorderDifference, 'The authored frame is actually painted by the current renderer').toBeGreaterThan(80);
    await page.screenshot({ path: `${OUTPUT}/${info.project.name}-picture-dialog.png` });
    await interactionShots(page, 'CrashSiteScene', 'pictureDialogConfirm', `${info.project.name}-picture-dialog`);

    await page.evaluate(async () => {
        const p = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer();
        p.storyProgress ??= {}; p.storyProgress.hasWaterBreathingScale = true;
    });
    await start(page, 'UnderwaterRoomScene');
    await page.evaluate(key => (window as any)[key].scene.keys.UnderwaterRoomScene.ui.dialog(
        'KRYSTAL ZACHRÁNĚN', '💎 → 🚀', 'K LODI', () => {}, () => {}, 'JEŠTĚ PROZKOUMAT'), KEY);
    await frame(page);
    await page.screenshot({ path: `${OUTPUT}/${info.project.name}-underwater-choice-portrait.png` });
});

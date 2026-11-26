import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
const KEY = '__LITTLE_MATH_GAME__';
const frame = (page: Page) => page.evaluate(key => new Promise<void>(resolve => (window as any)[key].events.once('poststep', () => resolve())), KEY);
async function at(page: Page, x: number, y: number) {
    const box = (await page.locator('#game-container canvas').boundingBox())!;
    return { x: box.x + x * box.width / 1280, y: box.y + y * box.height / 720 };
}
async function tap(page: Page, x: number, y: number) {
    const p = await at(page, x, y);
    await page.mouse.move(p.x, p.y); await frame(page); await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}
async function start(page: Page, scene: string, data = {}) {
    await page.evaluate(({ key, scene, data }) => (window as any)[key].scene.getScenes(true).at(-1).scene.start(scene, data), { key: KEY, scene, data });
    await waitForScene(page, scene);
}
async function seed(page: Page, overrides = {}) {
    await openSeededGame(page, false, {}, {}, { seenGuides: [], equippedWeapon: 'sword_wooden', equippedShield: 'shield_wooden', ...overrides });
    await page.evaluate(async key => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        GameStateManager.getInstance().loadSlot(0);
        (window as any)[key].sound.mute = true;
        (await import('/src/audio/AudioDirector.ts')).gameAudio().setVolume('voice', 0);
    }, KEY);
}
async function guide(page: Page) {
    return page.evaluate(key => {
        const s = (window as any)[key].scene.getScenes(true).at(-1);
        const root = s.children.list.find((o: any) => o.active && o.name?.startsWith('guide:'));
        const button = root?.list.find((o: any) => o.getData?.('guideConfirm'));
        if (!root || !button) return null;
        const surface = button.getByName('guideConfirmSurface'), art = surface.getByName('guideConfirmFrame');
        const label = surface.getByName('guideConfirmLabel');
        return { id: root.getData('guideId'), ready: root.getData('ready') === true, buttonCount: root.list.filter((o: any) => o.getData?.('guideConfirm')).length,
            state: button.getData('confirmState'), x: button.x, y: button.y, scale: [button.scaleX, button.scaleY],
            size: [button.width, button.height], surfaceY: surface.y, texture: art.texture.key, artScale: [art.scaleX, art.scaleY],
            label: label.text, textResolution: [label.style.resolution, label.frame.source.resolution],
            together: art.parentContainer === surface.getByName('guideConfirmCheck').parentContainer && label.parentContainer === art.parentContainer,
        };
    }, KEY);
}
async function waitGuide(page: Page, id: string, ready = false) {
    await expect.poll(() => guide(page)).toMatchObject({ id, ready });
}
async function finish(page: Page, id: string) {
    await waitGuide(page, id, true); const g = (await guide(page))!; await tap(page, g.x, g.y);
    await expect.poll(async () => (await guide(page))?.id).not.toBe(id);
}
async function unchangedPlayer(page: Page) {
    return page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const state = GameStateManager.getInstance(), p = structuredClone(state.getPlayer()); delete p.seenGuides;
        return { player: p, stats: state.getMathStats() };
    });
}

test.beforeEach(async ({ page }, info) => {
    // Frontend-only isolated local saves: no API or unapplied DB migrations required.
    await page.route('**/v1/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) }));
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (get as any).call(this, kind, ...args);
        } as typeof get;
    });
});

test('shop: one acknowledgement, stable interaction and no gameplay effect', async ({ page }, info) => {
    await seed(page); await start(page, 'ShopScene'); await waitGuide(page, 'shop.intro.v1');
    const before = await unchangedPlayer(page), disabled = (await guide(page))!;
    expect(disabled).toMatchObject({ buttonCount: 1, state: 'disabled', label: 'OK', scale: [1, 1], size: [260, 104], texture: 'guide-confirm-frame-v1', textResolution: [2, 2], together: true });
    expect(disabled.artScale[0]).toBe(disabled.artScale[1]);
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-shop-disabled.png` });
    await tap(page, disabled.x, disabled.y); expect((await guide(page))!.id).toBe('shop.intro.v1');
    await waitGuide(page, 'shop.intro.v1', true);
    await page.evaluate(key => { const s = (window as any)[key].scene.keys.ShopScene; s.__guideLeaks = 0; s.input.on('pointerdown', () => s.__guideLeaks++); }, KEY);
    const p = await at(page, disabled.x, disabled.y);
    await page.mouse.move(p.x, p.y); await frame(page);
    await expect.poll(async () => (await guide(page))!.state).toBe('hover');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-shop-hover.png` });
    await page.mouse.down(); await frame(page); await page.waitForTimeout(90);
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-shop-pressed.png` });
    const pressed = (await guide(page))!;
    expect(pressed).toMatchObject({ x: disabled.x, y: disabled.y, scale: [1, 1], size: [260, 104], state: 'pressed', together: true });
    await page.mouse.move(5, 5); await frame(page); await page.mouse.up(); await frame(page);
    expect(await guide(page)).toMatchObject({ state: 'normal', surfaceY: 0, id: 'shop.intro.v1' });
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-shop-out.png` });
    await page.evaluate(key => { const s = (window as any)[key].scene.keys.ShopScene; s.__guideLeaks = 0; }, KEY);
    await tap(page, disabled.x, disabled.y);
    await waitGuide(page, 'shop.sword.v1');
    await tap(page, disabled.x, disabled.y); // A double tap cannot skip the next visual lesson.
    expect((await guide(page))!.id).toBe('shop.sword.v1');
    await finish(page, 'shop.sword.v1');
    await waitGuide(page, 'shop.shield.v1', true);
    await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.ShopScene, root = s.children.list.find((o: any) => o.name?.startsWith('guide:'));
        const hide = (o: any) => { if (o.type === 'Text' && /[A-Za-zÀ-ž]/.test(o.text)) o.setVisible(false); o.list?.forEach(hide); }; hide(root);
    }, KEY);
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-shop-no-words-muted.png` });
    await finish(page, 'shop.shield.v1');
    expect(await guide(page)).toBeNull();
    expect(await unchangedPlayer(page)).toEqual(before);
    expect(await page.evaluate(key => (window as any)[key].scene.keys.ShopScene.__guideLeaks, KEY)).toBe(0);
    await start(page, 'TownScene'); await start(page, 'ShopScene'); await page.waitForTimeout(600);
    expect(await guide(page)).toBeNull();
});

test('guide shutdown does not acknowledge and reopening starts cleanly', async ({ page }) => {
    await seed(page); await start(page, 'CrystalForgeScene'); await waitGuide(page, 'forge.merge.v1');
    await start(page, 'TownScene');
    expect(await page.evaluate(async () => (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().seenGuides)).toEqual([]);
    await start(page, 'CrystalForgeScene'); await waitGuide(page, 'forge.merge.v1');
    await finish(page, 'forge.merge.v1'); await finish(page, 'forge.split.v1');
    await expect.poll(() => guide(page)).toBeNull();
});

test('crash-site picture dialogue only responds to its OK and has no stale listeners', async ({ page }, info) => {
    await seed(page); await start(page, 'CrashSiteScene');
    await page.evaluate(key => (window as any)[key].scene.keys.CrashSiteScene.showFirstDialog(), KEY);
    const root = () => page.evaluate(key => {
        const s = (window as any)[key].scene.keys.CrashSiteScene, r = s.children.getByName('pictureDialog');
        const b = r?.getByName('pictureDialogConfirm');
        return r ? { ready: b.getData('ready'), x: b.x, y: b.y, count: r.list.filter((o: any) => o.getData?.('guideConfirm')).length, playerX: s.player.x } : null;
    }, KEY);
    await expect.poll(root).toMatchObject({ count: 1 });
    const beforeX = (await root())!.playerX;
    await tap(page, 30, 30); await tap(page, 640, 300);
    await expect.poll(root).not.toBeNull();
    await expect.poll(root).toMatchObject({ ready: true, playerX: beforeX });
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-picture-dialog.png` });
    const p = (await root())!; await tap(page, p.x, p.y);
    await expect.poll(root).toBeNull();
    await page.evaluate(key => (window as any)[key].scene.keys.CrashSiteScene.showSecondDialog(), KEY);
    // Destroy a still-running dialog by leaving the scene, then reopen with no ghost callbacks.
    await start(page, 'TownScene'); await start(page, 'CrashSiteScene');
    await page.evaluate(key => (window as any)[key].scene.keys.CrashSiteScene.showFirstDialog(), KEY);
    await expect.poll(root).toMatchObject({ count: 1, ready: false });
    await expect.poll(root).toMatchObject({ ready: true });
});

async function confirmation(page: Page, sceneKey: string, name: string) {
    return page.evaluate(({ key, sceneKey, name }) => {
        const scene = (window as any)[key].scene.keys[sceneKey];
        const find = (o: any): any => o.name === name ? o : o.list?.map(find).find(Boolean);
        const b = scene.children.list.map(find).find(Boolean);
        if (!b) return null;
        const matrix = b.getWorldTransformMatrix(), surface = b.getByName('guideConfirmSurface');
        return { ready: b.getData('ready') && b.visible && b.alpha > 0.9, x: matrix.tx, y: matrix.ty,
            label: surface.getByName('guideConfirmLabel').text, texture: surface.getByName('guideConfirmFrame').texture.key,
            state: b.getData('confirmState') };
    }, { key: KEY, sceneKey, name });
}
async function acknowledge(page: Page, sceneKey: string, name: string) {
    await expect.poll(() => confirmation(page, sceneKey, name)).toMatchObject({ ready: true, label: 'OK' });
    const b = (await confirmation(page, sceneKey, name))!; await tap(page, b.x, b.y);
}
async function expectConfirmationInside(page: Page, sceneKey: string, name: string, safeHost: string) {
    const inside = await page.evaluate(({ key, sceneKey, name, safeHost }) => {
        const scene = (window as any)[key].scene.keys[sceneKey];
        const find = (o: any): any => o.name === name ? o : o.list?.map(find).find(Boolean);
        const b = scene.children.list.map(find).find(Boolean), safe = scene.sceneBuilder.getElementDef(safeHost);
        const matrix = b.getWorldTransformMatrix();
        return Math.abs(matrix.tx - safe.x) + b.width / 2 <= safe.width / 2
            && Math.abs(matrix.ty - safe.y) + b.height / 2 <= safe.height / 2;
    }, { key: KEY, sceneKey, name, safeHost });
    expect(inside, `${name} hit geometry must fit its frame's safe content inset`).toBe(true);
}

test('other production explanations retain their pictures and share the acknowledgement', async ({ page }, info) => {
    await seed(page);
    for (const [sceneKey, id] of [['ArenaScene', 'arena.free.v1'], ['PythiaWorkshopScene', 'pythia.intro.v1']] as const) {
        await start(page, sceneKey); await waitGuide(page, id, true);
        await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-${sceneKey}.png` });
        const before = await unchangedPlayer(page); await finish(page, id); expect(await unchangedPlayer(page)).toEqual(before);
    }
    await start(page, 'GuildScene');
    await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.GuildScene;
        s.__advances = 0; s.advanceToNextProblem = () => { s.__advances++; };
        s.showFeedback({ id: 'guide-test', operand1: 2, operand2: 1, operator: '+', answer: 3, options: [2, 3, 4], problemType: 'standard' }, 4);
    }, KEY);
    const beforeFeedback = await unchangedPlayer(page);
    await expect.poll(() => confirmation(page, 'GuildScene', 'trialFeedbackConfirm')).toMatchObject({ ready: true });
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-guild-correction.png` });
    await acknowledge(page, 'GuildScene', 'trialFeedbackConfirm');
    expect(await page.evaluate(key => (window as any)[key].scene.keys.GuildScene.__advances, KEY)).toBe(1);
    expect(await unchangedPlayer(page)).toEqual(beforeFeedback);

    await start(page, 'SilverpondGuildMockScene');
    for (let i = 0; i < 3; i++) {
        await expect.poll(() => confirmation(page, 'SilverpondGuildMockScene', 'silverpondQuestAction')).toMatchObject({ ready: true, texture: 'silverpond-fairy-action-normal' });
        await expectConfirmationInside(page, 'SilverpondGuildMockScene', 'silverpondQuestAction', 'silverpondQuestContentSafeHost');
        await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-silverpond-quest-${i + 1}.png` });
        await acknowledge(page, 'SilverpondGuildMockScene', 'silverpondQuestAction');
        await page.waitForTimeout(350);
    }
    await expect.poll(() => page.evaluate(key => (window as any)[key].scene.keys.SilverpondGuildMockScene.children.getByName('silverpondQuestDialog').visible, KEY)).toBe(false);

    await start(page, 'SilverpondFairyRewardScene', { testMode: true, returnScene: 'TownScene' });
    for (let i = 0; i < 3; i++) {
        await expect.poll(() => confirmation(page, 'SilverpondFairyRewardScene', 'fairyRewardAction')).toMatchObject({ ready: true, texture: 'silverpond-fairy-action-normal' });
        await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-fairy-${i + 1}.png` });
        await acknowledge(page, 'SilverpondFairyRewardScene', 'fairyRewardAction');
        await page.waitForTimeout(350);
    }
    await waitForScene(page, 'TownScene');

    await start(page, 'ZyxRocketInterludeScene', { testMode: true });
    for (let i = 0; i < 3; i++) {
        await expect.poll(() => confirmation(page, 'ZyxRocketInterludeScene', 'zyxDialogueActionButton')).toMatchObject({ ready: true });
        await expectConfirmationInside(page, 'ZyxRocketInterludeScene', 'zyxDialogueActionButton', 'zyxDialogueSafeHost');
        await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-rocket-${i + 1}.png` });
        await acknowledge(page, 'ZyxRocketInterludeScene', 'zyxDialogueActionButton');
        await page.waitForTimeout(400);
    }
    await waitForScene(page, 'ZyxCrystalMachineScene');
    await page.evaluate(async () => {
        const p = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer();
        p.storyProgress.hasWaterBreathingScale = true;
        delete p.underwaterProgress;
    });
    await start(page, 'UnderwaterRoomScene');
    await expect.poll(() => confirmation(page, 'UnderwaterRoomScene', 'underwaterGuideConfirm')).toMatchObject({ ready: true, texture: 'silverpond-fairy-action-normal' });
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-underwater-intro.png` });
    await acknowledge(page, 'UnderwaterRoomScene', 'underwaterGuideConfirm');
    await expect.poll(() => page.evaluate(async () => (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().underwaterProgress.introSeen)).toBe(true);
});

test('comic has one explicit action and can be reopened after completing', async ({ page }, info) => {
    await seed(page); await start(page, 'ComicScene', { skipToPanel: 5 });
    await expect.poll(() => confirmation(page, 'ComicScene', 'comicConfirm')).toMatchObject({ ready: true });
    await page.waitForFunction(key => {
        const scene = (window as any)[key].scene.keys.ComicScene;
        return !scene.cameras.main.fadeEffect.isRunning && scene.currentPanel?.alpha === 1;
    }, KEY);
    await tap(page, 40, 40);
    expect(await page.evaluate(key => (window as any)[key].scene.keys.ComicScene.currentPanelIndex, KEY)).toBe(5);
    await page.screenshot({ path: `artifacts/ui-refresh/guides/${info.project.name}-comic.png` });
    await acknowledge(page, 'ComicScene', 'comicConfirm'); await waitForScene(page, 'CrashSiteScene');
    await start(page, 'ComicScene', { skipToPanel: 0 });
    await acknowledge(page, 'ComicScene', 'comicConfirm');
    await expect.poll(() => page.evaluate(key => (window as any)[key].scene.keys.ComicScene.currentPanelIndex, KEY)).toBe(1);
});

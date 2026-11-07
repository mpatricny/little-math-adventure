import { expect, test, type Page } from 'playwright/test';
import { openSeededGame } from '../arena/helpers/arena-harness';

const GUILD = 'SilverpondGuildMockScene';
const FAIRY = 'SilverpondFairyRewardScene';
const story = { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasSeenSilverpondQuest: false,
    hasInstalledForestCrystal: true, hasClaimedForestCrystal: true, hasDefeatedVerdantGuardian: true };
const snapshot = (page: Page) => page.evaluate(async () => (await import('/src/audio/AudioDirector.ts' as string)).gameAudio().snapshot());
const dialogState = (page: Page) => page.evaluate(() => {
    const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondGuildMockScene;
    const root = s.children.getByName('silverpondQuestDialog');
    const d = root?.getData('dialog');
    return { visible: root?.visible, marker: s.children.getByName('silverpondQuestMarker')?.visible,
        enabled: d?.actionButton.enabled, page: d?.pageIndex, stage: d?.displayedStage };
});
async function ready(page: Page, scene = GUILD) {
    await page.waitForFunction(key => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys[key];
        if (!s?.scene.isActive()) return false;
        if (key === 'SilverpondFairyRewardScene') return s.actionButton?.enabled && !s.transitioning;
        const root = s.children.getByName('silverpondQuestDialog');
        return root?.visible && root.getData('dialog')?.actionButton.enabled;
    }, scene);
}
async function start(page: Page, scene: string, data: Record<string, unknown> = {}) {
    await page.evaluate(({ scene, data }) => (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start(scene, data), { scene, data });
    await page.waitForFunction(key => (window as any).__LITTLE_MATH_GAME__.scene.isActive(key), scene);
}
async function tapAction(page: Page, scene = GUILD) {
    const at = await page.evaluate(key => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys[key];
        const button = key === 'SilverpondFairyRewardScene' ? s.actionButton
            : s.children.getByName('silverpondQuestDialog').getData('dialog').actionButton;
        return { x: button.root.x, y: button.root.y };
    }, scene);
    const b = (await page.locator('canvas').boundingBox())!;
    const frame = () => page.evaluate(() => new Promise<void>(resolve => (window as any).__LITTLE_MATH_GAME__.events.once('poststep', resolve)));
    await page.mouse.move(b.x + at.x * b.width / 1280, b.y + at.y * b.height / 720);
    await frame(); await page.mouse.down(); await frame(); await page.mouse.up(); await frame();
}
async function audit(page: Page) {
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondGuildMockScene;
        const errors: string[] = [];
        const safe = s.sceneBuilder.getElementDef('silverpondQuestContentSafeHost');
        const d = s.children.getByName('silverpondQuestDialog').getData('dialog');
        const visit = (o: any) => {
            if (!o.visible || o.alpha < .1) return;
            if (o.texture?.key === '__MISSING') errors.push('missing texture');
            if (o.type === 'Text') {
                if (o.text.includes('\n') || o.text.trim().split(/\s+/).length > 4) errors.push('long text');
                if (o.style.resolution !== o.texture.source[0].resolution) errors.push('text resolution');
                const safe = o.getData('waterTextBox');
                const b = o.getBounds();
                if (safe && (b.left < safe.x - safe.width / 2 || b.right > safe.x + safe.width / 2
                    || b.top < safe.y - safe.height / 2 || b.bottom > safe.y + safe.height / 2)) errors.push('text inset');
            }
            if ((o.getData('waterArtwork') || o.texture?.key === 'zyx-dialog-action-frame-story')
                && Math.abs(o.scaleX - o.scaleY) > .001) errors.push('stretched art');
            o.list?.forEach(visit);
        };
        visit(s.children.getByName('silverpondQuestDialog'));
        for (const o of [d.title, ...d.symbolRoot.list]) {
            if (typeof o.getBounds !== 'function') continue; // Graphics are reviewed in the captured image.
            const b = o.getBounds();
            if (b.left < safe.x - safe.width / 2 || b.right > safe.x + safe.width / 2
                || b.top < safe.y - safe.height / 2 || b.bottom > safe.y + safe.height / 2) errors.push('frame content inset');
        }
        return errors;
    })).toEqual([]);
}

test.beforeEach(async ({ page }, info) => {
    // These local save and audio checks have no database/migration dependency.
    await page.route(/\/(?:api|v1)\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.route('**/__dev-saves/api', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":1,"serverId":null,"records":[]}' }));
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (original as any).call(this, kind, ...args);
        } as typeof original;
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    (page as any).__storyErrors = errors;
});
test.afterEach(async ({ page }) => expect((page as any).__storyErrors).toEqual([]));

test('Zyx speaks, acknowledges only viewed stages, and persists attention after reload', async ({ page }, info) => {
    await openSeededGame(page, false, {}, {}, { storyProgress: story });
    await page.mouse.click(3, 3);
    await start(page, GUILD); await ready(page);
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.silverpond.quest.crystal' && e.type === 'voice')).toBe(true);
    expect((await dialogState(page)).marker).toBe(true);
    await audit(page);
    const prefix = `artifacts/silverpond/story-${info.project.name}`;
    await page.screenshot({ path: `${prefix}-crystal.png` });
    const button = await page.evaluate(() => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondGuildMockScene.children.getByName('silverpondQuestDialog').getData('dialog').actionButton.root;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + button.x * box.width / 1280, box.y + button.y * box.height / 720);
    await page.waitForTimeout(180); await audit(page); await page.screenshot({ path: `${prefix}-hover.png` });
    await page.mouse.down(); await page.waitForTimeout(90); await audit(page); await page.screenshot({ path: `${prefix}-pressed.png` });
    await page.mouse.move(3, 3); await page.mouse.up(); await page.waitForTimeout(180);
    await audit(page); await page.screenshot({ path: `${prefix}-pointer-out.png` });
    expect(await page.evaluate(() => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondGuildMockScene.children.getByName('silverpondQuestDialog').getData('dialog').actionButton.root;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    })).toEqual(button);
    for (const id of ['vo.silverpond.quest.fairy', 'vo.silverpond.quest.scale']) {
        await tapAction(page);
        if (id.endsWith('.fairy')) await page.screenshot({ path: `${prefix}-disabled.png` });
        await ready(page);
        await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === id && e.type === 'voice')).toBe(true);
        expect((await snapshot(page)).voiceCount).toBe(1);
        await audit(page); await page.screenshot({ path: `${prefix}-${id.split('.').at(-1)}.png` });
    }
    await tapAction(page);
    await expect.poll(async () => (await dialogState(page)).visible).toBe(false);
    expect((await dialogState(page)).marker).toBe(false);
    expect((await snapshot(page)).voiceCount).toBe(0);
    // Leave before a newly displayed stage is acknowledged: it must still be new on re-entry.
    await page.evaluate(async () => (await import('/src/systems/StorySystem.ts' as string)).StorySystem.getInstance().completeLakeFairyQuest());
    await start(page, 'MenuScene'); await start(page, GUILD); await ready(page);
    expect((await dialogState(page)).stage).toBe('dive');
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.silverpond.quest.dive' && e.type === 'voice')).toBe(true);
    await start(page, 'MenuScene'); await start(page, GUILD); await ready(page);
    expect((await dialogState(page)).marker).toBe(true);
    await page.evaluate(async () => (await import('/src/audio/AudioDirector.ts' as string)).gameAudio().setVolume('voice', 0));
    await page.evaluate(() => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondGuildMockScene.children.getByName('silverpondQuestDialog');
        const texts: any[] = [];
        const visit = (o: any) => { if (o.type === 'Text') { texts.push([o, o.text]); o.setText(o.text.replace(/[\p{L}\p{M}]+/gu, '')); } o.list?.forEach(visit); };
        visit(root); (window as any).__storyTexts = texts;
    });
    await page.screenshot({ path: `${prefix}-dive-muted-no-words.png` });
    await page.evaluate(() => (window as any).__storyTexts.forEach(([o, t]: any) => o.setText(t)));
    await tapAction(page); await expect.poll(async () => (await dialogState(page)).visible).toBe(false);
    expect((await dialogState(page)).marker).toBe(false);
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload();
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    await start(page, GUILD); await page.waitForTimeout(750);
    expect(await dialogState(page)).toMatchObject({ visible: false, marker: false });
    await page.screenshot({ path: `${prefix}-seen.png` });
    await page.evaluate(async () => {
        const state = (await import('/src/systems/GameStateManager.ts' as string)).GameStateManager.getInstance();
        const { getUnderwaterProgress } = await import('/src/systems/UnderwaterProgressSystem.ts' as string);
        getUnderwaterProgress(state.getPlayer()).depthCrystalClaimed = true;
        state.save();
        (await import('/src/audio/AudioDirector.ts' as string)).gameAudio().setVolume('voice', 1);
    });
    await page.mouse.click(3, 3);
    await start(page, 'MenuScene'); await start(page, GUILD); await ready(page);
    expect((await dialogState(page)).stage).toBe('crystal');
    expect((await dialogState(page)).marker).toBe(true);
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.silverpond.quest.complete' && e.type === 'voice')).toBe(true);
    await audit(page); await page.screenshot({ path: `${prefix}-complete.png` });
    await tapAction(page); await expect.poll(async () => (await dialogState(page)).visible).toBe(false);
    expect((await dialogState(page)).marker).toBe(false);
});

test('fairy pages play real files, pause, replace pending speech, mute and exit safely', async ({ page }, info) => {
    await openSeededGame(page, true, {}, {}, { storyProgress: story });
    await page.mouse.click(3, 3);
    await page.evaluate(async () => (await import('/src/systems/CoopSessionManager.ts' as string)).CoopSessionManager.getInstance().startSession(0, 1));
    await start(page, FAIRY, { testMode: true, returnScene: 'MenuScene' }); await ready(page, FAIRY);
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.fairy.thanks' && e.type === 'voice')).toBe(true);
    await page.evaluate(async () => {
        const a = (await import('/src/audio/AudioDirector.ts' as string)).gameAudio();
        a.setPaused((window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene, true);
    });
    await expect.poll(async () => (await snapshot(page)).unlocked).toBe(false);
    expect((await snapshot(page)).voiceCount).toBe(1);
    await page.waitForTimeout(700);
    await page.evaluate(async () => (await import('/src/audio/AudioDirector.ts' as string)).gameAudio().setPaused((window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene, false));
    await expect.poll(async () => (await snapshot(page)).unlocked).toBe(true);
    // Delay the second file while its page is skipped. A late response must stay silent.
    await page.route('**/vo.fairy.scale.wav', async route => { await new Promise(resolve => setTimeout(resolve, 5000)); await route.continue(); });
    await tapAction(page, FAIRY); await ready(page, FAIRY);
    await page.screenshot({ path: `artifacts/silverpond/story-${info.project.name}-fairy-gift.png` });
    await tapAction(page, FAIRY); await ready(page, FAIRY);
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.fairy.dive' && e.type === 'voice')).toBe(true);
    await page.waitForTimeout(4500);
    expect((await snapshot(page)).events.some((e: any) => e.id === 'vo.fairy.scale' && e.type === 'voice')).toBe(false);
    await tapAction(page, FAIRY);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    expect((await snapshot(page)).voiceCount).toBe(0);
    // A missing voice never holds the reward animation or action button.
    await page.route('**/vo.fairy.thanks.wav', route => route.abort());
    await page.reload();
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    await page.mouse.click(3, 3);
    await start(page, FAIRY, { testMode: true, returnScene: 'MenuScene' }); await ready(page, FAIRY);
    await expect.poll(async () => (await snapshot(page)).events.some((e: any) => e.id === 'vo.fairy.thanks' && e.type === 'unavailable')).toBe(true);
    await tapAction(page, FAIRY); await ready(page, FAIRY);
    await page.evaluate(async () => (await import('/src/audio/AudioDirector.ts' as string)).gameAudio().setVolume('voice', 0));
    await tapAction(page, FAIRY); await ready(page, FAIRY);
    expect((await snapshot(page)).voiceCount).toBe(0);
    await tapAction(page, FAIRY);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
});

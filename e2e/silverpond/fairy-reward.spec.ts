import { openSeededGame } from '../arena/helpers/arena-harness';
import { expect, test } from 'playwright/test';
import type { Page } from 'playwright/test';

const SCENE = 'SilverpondFairyRewardScene';
const story = { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasFreedLakeFairy: false,
    hasWaterBreathingScale: false, hasSeenLakeFairyReward: false, hasDefeatedVerdantGuardian: true,
    hasCollectedForestCrystal: true, hasInstalledForestCrystal: true, hasSeenSilverpondQuest: true };

async function ready(page: Page) {
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene;
        return s.scene.isActive() && s.actionButton?.enabled && !s.transitioning;
    });
}
async function open(page: Page, testMode: boolean) {
    await page.evaluate(({ scene, testMode }) => (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1)
        .scene.start(scene, { testMode, returnScene: 'MenuScene' }), { scene: SCENE, testMode });
    await ready(page);
}
async function buttonPoint(page: Page) {
    const at = await page.evaluate(() => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene.actionButton.root;
        return { x: root.x, y: root.y };
    });
    const b = (await page.locator('canvas').boundingBox())!;
    return { x: b.x + at.x * b.width / 1280, y: b.y + at.y * b.height / 720 };
}
async function tap(page: Page) {
    const p = await buttonPoint(page);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(30);
    await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
}
async function audit(page: Page) {
    expect(await page.evaluate(async () => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const s = game.scene.keys.SilverpondFairyRewardScene;
        const { auditUnderwaterLayout } = await import('/src/ui/UnderwaterTheme.ts' as string);
        const errors = auditUnderwaterLayout(s);
        const visible = (o: any): boolean => o.visible && o.alpha > .1 && (!o.parentContainer || visible(o.parentContainer));
        const visit = (o: any) => {
            if (!visible(o)) return;
            if (o.texture?.key === '__MISSING') errors.push(`${o.name}: missing texture`);
            if (o.type === 'Text' && (o.text.includes('\n') || o.text.trim().split(/\s+/).length > 4)) errors.push(`${o.name}: reading required`);
            o.list?.forEach(visit);
        };
        s.children.list.forEach(visit);
        if (s.pageIndex === 0) {
            const characters = [s.fairy.getBounds(), s.player.getBounds()];
            const regions = [s.titleFrame.getBounds(), s.dialogueFrame.getBounds(), s.actionButton.root.getBounds()];
            const intersects = (a: any, b: any) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            characters.forEach(b => regions.forEach(r => { if (intersects(b, r)) errors.push('character overlaps UI'); }));
        } else {
            const safe = s.sceneBuilder.getElementDef('fairyRewardCardSafeHost');
            for (const o of [s.rewardTitle, s.rewardScale, ...s.demonstration.list]) {
                if (!visible(o)) continue;
                const b = o.getBounds();
                if (b.left < safe.x - safe.width / 2 || b.right > safe.x + safe.width / 2
                    || b.top < safe.y - safe.height / 2 || b.bottom > safe.y + safe.height / 2) errors.push(`${o.name}: card inset`);
            }
            if (s.actionButton.root.y - s.actionButton.root.height / 2 < s.rewardFrame.getBounds().bottom) errors.push('action overlaps card');
        }
        const root = s.actionButton.root;
        const cssScale = game.canvas.getBoundingClientRect().width / 1280;
        if (root.width * cssScale < 44 || root.height * cssScale < 44) errors.push('small touch target');
        return errors;
    })).toEqual([]);
}
async function shot(page: Page, prefix: string, state: string) {
    await page.screenshot({ path: `artifacts/silverpond/${prefix}-${state}.png` });
}
async function noWords(page: Page, prefix: string, state: string) {
    await page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__; game.sound.mute = true;
        const texts: any[] = [];
        const visit = (o: any) => { if (o.type === 'Text') { texts.push([o, o.text]); o.setText(o.text.replace(/[\p{L}\p{M}]+/gu, '')); } o.list?.forEach(visit); };
        game.scene.keys.SilverpondFairyRewardScene.children.list.forEach(visit);
        (window as any).__fairyTexts = texts;
    });
    await shot(page, prefix, `${state}-no-words`);
    await page.evaluate(() => (window as any).__fairyTexts.forEach(([o, t]: any) => o.setText(t)));
}

test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    (page as any).__fairyRuntimeErrors = errors;
    // Local fixtures plus mocked APIs never touch the analytics DB or need migrations0005–0009.
    await page.route(/\/(?:api|v1)\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.route('**/__dev-saves/api', r => r.fulfill({ status: 200, contentType: 'application/json',
        body: '{"version":1,"serverId":null,"records":[]}' }));
});

test.afterEach(async ({ page }) => {
    expect((page as any).__fairyRuntimeErrors).toEqual([]);
});

for (const variant of ['solo', 'coop', 'wide'] as const) test(`fairy gift remains visual and touchable throughout ${variant}`, async ({ page }, info) => {
    if (variant === 'wide') await page.setViewportSize({ width: 1280, height: 800 });
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (original as any).call(this, kind, ...args);
        } as typeof original;
    });
    await openSeededGame(page, variant === 'coop', {}, {}, { storyProgress: story });
    if (variant === 'coop') expect(await page.evaluate(async () =>
        (await import('/src/systems/CoopSessionManager.ts' as string)).CoopSessionManager.getInstance().startSession(0, 1))).toBe(true);
    // Test mode must preserve the complete save, including both profiles during co-op.
    const saves = () => page.evaluate(() => [0, 1].map(i => localStorage.getItem(`littleMathAdventure_slot_${i}`)));
    const before = await saves();
    await open(page, true);
    const prefix = `fairy-${info.project.name}-${variant}`;
    await audit(page); await shot(page, prefix, 'intro'); await noWords(page, prefix, 'intro');
    const rootBefore = await page.evaluate(() => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene.actionButton.root;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const p = await buttonPoint(page);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(200); await audit(page); await shot(page, prefix, 'hover');
    await page.mouse.down(); await page.waitForTimeout(100); await audit(page); await shot(page, prefix, 'pressed');
    await page.mouse.move(5, 5); await page.mouse.up(); await page.waitForTimeout(200); await audit(page); await shot(page, prefix, 'pointer-out');
    expect(await page.evaluate(() => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.SilverpondFairyRewardScene.actionButton.root;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    })).toEqual(rootBefore);
    await tap(page); await page.waitForTimeout(80); await shot(page, prefix, 'disabled');
    await ready(page); await page.mouse.move(5, 5); await audit(page); await shot(page, prefix, 'reward'); await noWords(page, prefix, 'reward');
    await tap(page); await ready(page); await page.mouse.move(5, 5); await audit(page);
    await shot(page, prefix, 'complete'); await noWords(page, prefix, 'complete');
    // Completion is held until an explicit exit, so small children can inspect the result.
    await page.waitForTimeout(1800); expect(await saves()).toEqual(before);
    await tap(page); await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
    if (variant === 'solo') {
        await open(page, false);
        const flags = () => page.evaluate(async () => (await import('/src/systems/StorySystem.ts' as string)).StorySystem.getInstance().getProgress());
        expect(await flags()).toMatchObject({ hasFreedLakeFairy: true, hasWaterBreathingScale: true, hasSeenLakeFairyReward: false });
        await tap(page); await ready(page); await tap(page); await ready(page);
        expect(await flags()).toMatchObject({ hasFreedLakeFairy: true, hasWaterBreathingScale: true, hasSeenLakeFairyReward: true });
        await tap(page); await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('MenuScene'));
        await open(page, false); expect(await flags()).toMatchObject({ hasWaterBreathingScale: true, hasSeenLakeFairyReward: true });
    }
});

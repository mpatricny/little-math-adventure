import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';
import textures from '../../public/assets/data/textures.json';

const foxPath = textures.spritesheets['rune-fox-sheet'].path;

test.beforeEach(async ({ page }) => {
    await page.route('**/v1/me', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
    }));
});

async function clickHost(page: Page, id: string) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const point = await page.evaluate(id => {
        const host = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.sceneBuilder.get(id);
        return { x: host.x, y: host.y };
    }, id);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
}

async function answerCorrectly(page: Page) {
    const index = await page.evaluate(() => {
        const p = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.currentProblem;
        return p.choices.indexOf(p.answer) + 1;
    });
    await clickHost(page, `catacombAnswer${index}`);
}

async function forceCanvas(page: Page) {
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
            if (type.includes('webgl')) return null;
            return (original as any).call(this, type, ...args);
        } as typeof original;
    });
}

for (const renderer of ['canvas', 'webgl']) test(`cold fox preload and first answer ${renderer}`, async ({ page }) => {
    if (renderer === 'canvas') await forceCanvas(page);
    let requested = false;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/${foxPath}`, async route => {
        requested = true;
        await held;
        await route.continue();
    });
    await openSeededGame(page);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer === 'canvas' ? 1 : 2);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.textures.exists('rune-fox-sheet'))).toBe(false);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
    await expect.poll(() => requested).toBe(true);
    expect(await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        return { active: g.scene.isActive('CatacombTrialScene'), creatureCreated: !!g.scene.keys.CatacombTrialScene.creatureSprite };
    })).toEqual({ active: false, creatureCreated: false });
    release();
    await waitForScene(page, 'CatacombTrialScene');
    const loaded = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        const sheet = s.cache.json.get('textures').spritesheets['rune-fox-sheet'];
        const texture = s.textures.get('rune-fox-sheet');
        const definitions = Object.entries(s.animationDefs).filter(([key]) => key.startsWith('rune-fox-'));
        return {
            key: s.creatureSprite.texture.key,
            allFrames: Array.from({ length: sheet.frameCount }, (_, index) => texture.has(index)).every(Boolean),
            noPaddingFrame: !texture.has(sheet.frameCount),
            canonical: definitions.every(([key, definition]: [string, any]) => {
                const expected = definition.frames.sequence ?? Array.from({ length: definition.frames.end - definition.frames.start + 1 }, (_, n) => definition.frames.start + n);
                const actual = s.anims.get(key).frames.map((frame: any) => Number(frame.textureFrame));
                return JSON.stringify(actual) === JSON.stringify(expected);
            }),
        };
    });
    expect(loaded).toEqual({ key: 'rune-fox-sheet', allFrames: true, noPaddingFrame: true, canonical: true });
    await page.screenshot({ path: `artifacts/catacombs/loading-${renderer}-intro.png` });
    await clickHost(page, 'catacombPrimary');
    await answerCorrectly(page);
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return s.phase === 'charging' && s.correctCount === 1 && !s.mathBoard.answered;
    });
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return { hp: s.creatureHp, maxHp: s.creatureMaxHp, heroAtHome: Math.abs(s.heroContainer.x - s.sceneBuilder.getSpawnPoints().player.x) < 1 };
    })).toMatchObject({ hp: 9, maxHp: 10, heroAtHome: true });
    await page.screenshot({ path: `artifacts/catacombs/loading-${renderer}-next-question.png` });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `artifacts/catacombs/loading-${renderer}-tablet.png` });
});

test('an attack finishing before travel cannot strand the trial in resolve', async ({ page }) => {
    await forceCanvas(page);
    await openSeededGame(page);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
    await waitForScene(page, 'CatacombTrialScene');
    await clickHost(page, 'catacombPrimary');
    await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        s.heroSprite.anims.timeScale = 32;
        (window as any).__foxCompletionTrace = [];
        s.heroSprite.once('animationcomplete-' + s.playerSpriteConfig.attackAnim, () => (window as any).__foxCompletionTrace.push('attack'));
        const original = s.updateHpBar.bind(s);
        s.updateHpBar = () => { (window as any).__foxCompletionTrace.push('impact'); original(); };
    });
    await answerCorrectly(page);
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return s.phase === 'charging' && s.correctCount === 1 && !s.mathBoard.answered;
    });
    expect(await page.evaluate(() => (window as any).__foxCompletionTrace)).toEqual(['attack', 'impact']);
});

test('all ten hits, victory, another visit and a wrong answer keep advancing', async ({ page }) => {
    await forceCanvas(page);
    await openSeededGame(page);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
    await waitForScene(page, 'CatacombTrialScene');
    await clickHost(page, 'catacombPrimary');
    for (let hits = 1; hits <= 10; hits++) {
        await answerCorrectly(page);
        await page.waitForFunction(hits => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            return s.correctCount === hits && (hits === 10 ? s.phase === 'victory' : s.phase === 'charging' && !s.mathBoard.answered);
        }, hits);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.creatureHp)).toBe(10 - hits);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!));
    expect(saved.player.unlockedPets).toContain('catacomb_creature_A');
    expect(saved.player.catacombFoxBonus).toBe(0);
    expect(saved.mathStats.masteryData.globalSolveSequence).toBe(10);
    await page.screenshot({ path: 'artifacts/catacombs/loading-canvas-victory.png' });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: 'artifacts/catacombs/loading-canvas-victory-tablet.png' });
    await clickHost(page, 'catacombPrimary');
    await waitForScene(page, 'GuildScene');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
    await waitForScene(page, 'CatacombTrialScene');
    await clickHost(page, 'catacombPrimary');
    const wrongChoice = await page.evaluate(() => {
        const p = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.currentProblem;
        return (p.choices.indexOf(p.answer) + 1) % p.choices.length + 1;
    });
    await clickHost(page, `catacombAnswer${wrongChoice}`);
    await page.screenshot({ path: 'artifacts/catacombs/loading-canvas-wrong.png' });
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return s.phase === 'charging' && s.wrongCount === 1 && !s.mathBoard.answered;
    });
    await answerCorrectly(page);
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return s.phase === 'charging' && s.correctCount === 1 && !s.mathBoard.answered;
    });
});

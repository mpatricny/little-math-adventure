import { test, expect, type Page } from 'playwright/test';
import { activateCoopSession, openSeededGame, startArenaBattleFromCoordinates } from '../arena/helpers/arena-harness';
import sharp from 'sharp';

const KEY = '__LITTLE_MATH_GAME__';
test.beforeEach(async ({ page }) => {
    // Browser-only recovery and local catalogs; no DB migration or real save access.
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/(api|v1)\//, route => route.fulfill({
        status: 200, contentType: 'application/json', body: '{"authenticated":false}',
    }));
    await page.route('**/__dev-saves/api', route => route.fulfill({ status: 200, contentType: 'application/json',
        body: '{"version":1,"serverId":null,"records":[]}' }));
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (input, init) => init?.priority === 'low'
            ? Promise.resolve(new Response('', { status: 503 })) : original(input, init);
    });
});

async function ready(page: Page) {
    await page.waitForFunction(key => (window as any)[key]?.canvas.dataset.scene === 'MenuScene', KEY);
}
async function lose(page: Page) {
    await page.evaluate(key => {
        const game = (window as any)[key];
        (window as any).__lostContext = game.renderer.gl.getExtension('WEBGL_lose_context');
        (window as any).__lostContext.loseContext();
    }, KEY);
    await page.waitForFunction(key => (window as any)[key].renderer.contextLost, KEY);
}
async function restore(page: Page) {
    await page.evaluate(() => (window as any).__lostContext.restoreContext());
    await page.waitForFunction(key => !(window as any)[key].renderer.contextLost, KEY);
}
async function save(page: Page) { return page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')); }
async function shot(page: Page, prefix: string, name: string) {
    await page.screenshot({ path: `artifacts/device-recovery/${prefix}-${name}.png` });
}

async function paused(page: Page, expected: boolean) {
    await expect.poll(() => page.evaluate(key => (window as any)[key].isPaused, KEY)).toBe(expected);
    expect(await page.evaluate(key => (window as any)[key].input.enabled, KEY)).toBe(!expected);
}

test('local diagnostics preserve the previous scene across reload and leave saves untouched', async ({ page }) => {
    const events: Record<string, any>[] = [];
    await page.route('**/__device-diagnostics', route => {
        events.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
    });
    await openSeededGame(page);
    await ready(page);
    await expect.poll(() => events.filter(event => event.kind === 'boot').length).toBe(1);
    const original = await save(page);
    await page.evaluate(() => {
        sessionStorage.setItem('lma-e2e-preserve-saves', 'true');
        window.dispatchEvent(new ErrorEvent('error', { message: 'Diagnostic probe', error: new Error('Diagnostic probe') }));
        window.dispatchEvent(new Event('cislokraj-save-reload'));
    });
    await expect.poll(() => events.some(event => event.kind === 'error' && event.message.includes('Diagnostic probe'))).toBe(true);
    await expect.poll(() => events.some(event => event.kind === 'save_reload' && event.scene === 'MenuScene')).toBe(true);
    expect(await save(page)).toBe(original);
    await page.reload(); await ready(page);
    await expect.poll(() => events.filter(event => event.kind === 'boot').length).toBe(2);
    const second = events.filter(event => event.kind === 'boot')[1];
    expect(second.navigation).toBe('reload');
    expect(JSON.parse(second.previous).scene).toBe('MenuScene');
    expect(await save(page)).toBe(original);
    expect(events.every(event => !('player' in event) && !('mathStats' in event))).toBe(true);
});

test('an arena battle keeps other waves out of its combat textures and accepts an answer after idle', async ({ page }, info) => {
    const errors: string[] = [];
    let navigations = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await openSeededGame(page, false, { arenaLevel: 5, completedArenaLevels: [1, 2, 3, 4] }, undefined, {
        equippedWeapon: 'sword_silverpond_tide', equippedShield: 'shield_silverpond_tide',
    });
    await startArenaBattleFromCoordinates(page, { arenaLevel: 5, wave: 4 }, 'slime_green');
    const unexpected = await page.evaluate(key => {
        const battle = (window as any)[key].scene.keys.BattleScene;
        const required = battle.sceneAssets.getSceneTextureKeys();
        const usedPrefixes = new Set(battle.enemyDefs.map((enemy: any) => enemy.animPrefix));
        const definitions = battle.registry.get('animationDefs');
        const unusedEnemies = battle.cache.json.get('enemies').filter((enemy: any) => (
            enemy.animPrefix && !usedPrefixes.has(enemy.animPrefix)
        ));
        return unusedEnemies.flatMap((enemy: any) => Object.entries(definitions)
            .filter(([name]) => name.startsWith(`${enemy.animPrefix}-`) && !/-idle(?:-|$)/.test(name))
            // The shared slime atlas is the renderer's explicit missing-art fallback.
            .filter(([, animation]: any) => animation.texture !== 'slime-sheet' && required.has(animation.texture))
            .map(([name]) => name));
    }, KEY);
    expect(unexpected).toEqual([]);
    expect(await page.evaluate(key => {
        const battle = (window as any)[key].scene.keys.BattleScene;
        return [...battle.sceneAssets.getSceneTextureKeys()].filter((texture: any) =>
            /silverpond-lake-fairy-.*-sheet|spritesheet-zyx-transparent2-sheet|rune-fox-sheet/.test(texture));
    }, KEY)).toEqual([]);
    await page.evaluate(key => (window as any)[key].scene.keys.BattleScene.onAttackClicked(), KEY);
    await page.waitForFunction(key => (window as any)[key].scene.keys.BattleScene.mathBoard.acceptingAnswer, KEY);
    await page.clock.install();
    await page.clock.fastForward('30:00');
    const point = await page.evaluate(key => {
        const game = (window as any)[key], board = game.scene.keys.BattleScene.mathBoard;
        const problem = board.problems[board.currentProblemIndex];
        const index = problem.choices.indexOf(problem.answer);
        const button = board.sequential ? board.sequentialView.buttons[index] : board.problemRows[board.currentProblemIndex].buttons[index];
        const bounds = button.getBounds(), canvas = game.canvas.getBoundingClientRect();
        return { x: canvas.x + bounds.centerX * canvas.width / 1280, y: canvas.y + bounds.centerY * canvas.height / 720 };
    }, KEY);
    if (info.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(800);
    expect(await page.evaluate(key => (window as any)[key].scene.isActive('BattleScene'), KEY)).toBe(true);
    expect(navigations).toBe(1);
    expect(errors).toEqual([]);
    await shot(page, info.project.name, 'battle-after-idle');
});

test('portrait and GPU recovery preserve the same co-op battle, regardless of interruption order', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openSeededGame(page, true);
    await activateCoopSession(page);
    // The production catalog supplies both enemies and co-op policy.
    await startArenaBattleFromCoordinates(page, { arenaLevel: 1, wave: 0 }, 'slime_green');
    const snapshot = () => page.evaluate(key => {
        const game = (window as any)[key];
        const battle = game.scene.keys.BattleScene;
        return {
            battle: JSON.stringify(battle.battleState),
            saves: [0, 1].map(slot => localStorage.getItem(`littleMathAdventure_slot_${slot}`)),
        };
    }, KEY);
    const original = await snapshot();
    for (const first of ['portrait', 'gpu']) {
        if (first === 'portrait') {
            await page.setViewportSize({ width: 768, height: 1024 });
            await paused(page, true);
            await lose(page);
            await restore(page);
            await paused(page, true); // The portrait cover still owns its pause.
        } else {
            await lose(page);
            await page.setViewportSize({ width: 768, height: 1024 });
            await page.setViewportSize(info.project.use.viewport!);
            await paused(page, true); // The GPU is still unavailable.
        }
        const clock = await page.evaluate(key => (window as any)[key].scene.keys.BattleScene.time.now, KEY);
        await page.waitForTimeout(700);
        expect(await page.evaluate(key => (window as any)[key].scene.keys.BattleScene.time.now, KEY)).toBe(clock);
        expect(await snapshot()).toEqual(original);
        if (first === 'portrait') await page.setViewportSize(info.project.use.viewport!);
        else await restore(page);
        await paused(page, false);
        expect(await snapshot()).toEqual(original);
        await expect.poll(() => page.evaluate(key => (window as any)[key].scene.keys.BattleScene.time.now, KEY)).toBeGreaterThan(clock);
    }
    await shot(page, info.project.name, 'battle-rotation-restored');
    expect(errors).toEqual([]);
});

test('hidden pages stay paused until visible, and a pre-existing pause survives rotation', async ({ page }, info) => {
    await openSeededGame(page);
    await ready(page);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await paused(page, true);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.evaluate(() => {
        delete (document as any).hidden;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await paused(page, true); // pageshow has not arrived yet.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await paused(page, false);
    await page.evaluate(key => { const game = (window as any)[key]; game.pause(); game.input.enabled = false; }, KEY);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.setViewportSize(info.project.use.viewport!);
    await paused(page, true);
});

test('GPU loss pauses play, shows an independent control, and restores the same scene and save', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openSeededGame(page, false, { completedArenaLevels: [1, 2, 3, 4] }, undefined,
        { equippedWeapon: 'sword_silverpond_tide', ownedPets: ['pet_silverpond_mill_turtle'] });
    await ready(page);
    await page.evaluate(key => {
        (window as any).__sceneUpdates = 0;
        (window as any)[key].scene.keys.MenuScene.events.on('update', () => (window as any).__sceneUpdates++);
    }, KEY);
    const saved = await save(page);
    await lose(page);
    await expect(page.locator('#renderer-recovery')).toBeVisible();
    expect(await page.evaluate(key => [(window as any)[key].isPaused, (window as any)[key].input.enabled], KEY)).toEqual([true, false]);
    const updates = await page.evaluate(() => (window as any).__sceneUpdates);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as any).__sceneUpdates)).toBe(updates);
    const button = page.getByRole('button', { name: 'Obnovit hru' });
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await button.press('Tab'); await expect(button).toBeFocused();
    await shot(page, info.project.name, 'normal');
    await page.evaluate(key => { (window as any)[key].sound.mute = true; }, KEY);
    await page.getByText('Znovu', { exact: true }).evaluate(label => label.style.visibility = 'hidden');
    await shot(page, info.project.name, 'no-words');
    await page.getByText('Znovu', { exact: true }).evaluate(label => label.style.visibility = '');
    await button.hover(); await shot(page, info.project.name, 'hover');
    await page.mouse.down(); await shot(page, info.project.name, 'pressed');
    await page.mouse.move(5, 5); await page.mouse.up(); await shot(page, info.project.name, 'pointer-out');
    await button.evaluate(button => { (button as HTMLButtonElement).disabled = true; });
    await shot(page, info.project.name, 'disabled');
    await button.evaluate(button => { (button as HTMLButtonElement).disabled = false; });
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot(page, info.project.name, 'portrait');
    await page.setViewportSize(info.project.use.viewport!);
    await restore(page);
    await expect(page.locator('#renderer-recovery')).toHaveCount(0);
    expect(await page.evaluate(key => [(window as any)[key].isPaused, (window as any)[key].input.enabled], KEY)).toEqual([false, true]);
    await expect.poll(() => page.evaluate(() => (window as any).__sceneUpdates)).toBeGreaterThan(updates);
    expect(await save(page)).toBe(saved);
    await shot(page, info.project.name, 'restored');
    expect((await sharp(await page.screenshot()).stats()).entropy).toBeGreaterThan(3);
    // A pre-existing pause/input lock belongs to its owner, even after recovery.
    await page.evaluate(key => { const g = (window as any)[key]; g.pause(); g.input.enabled = false; }, KEY);
    await lose(page); await restore(page);
    expect(await page.evaluate(key => [(window as any)[key].isPaused, (window as any)[key].input.enabled], KEY)).toEqual([true, false]);
    expect(errors).toEqual([]);
});

for (const fullscreen of ['game-container', 'canvas']) test(`recovery from ${fullscreen} fullscreen keeps the same save and opens Canvas`, async ({ page }, info) => {
    await openSeededGame(page, false, {}, {}, { ownedPets: ['pet_silverpond_mill_turtle'], equippedShield: 'shield_silverpond_tide' });
    await ready(page);
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    const saved = await save(page);
    await page.evaluate(target => {
        const button = document.createElement('button'); button.id = 'test-fullscreen'; button.textContent = 'Fullscreen';
        button.style.cssText = 'position:fixed;top:0;left:0;z-index:200000;';
        button.onclick = () => { void (target === 'canvas' ? document.querySelector('canvas')! : document.getElementById(target)!).requestFullscreen(); button.remove(); };
        document.body.append(button);
    }, fullscreen);
    await page.locator('#test-fullscreen').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await lose(page);
    await expect(page.getByRole('button', { name: 'Obnovit hru' })).toBeVisible();
    await shot(page, info.project.name, `fullscreen-${fullscreen}`);
    await page.getByRole('button', { name: 'Obnovit hru' }).click();
    await page.waitForURL(/renderer=canvas/); await ready(page);
    expect(await page.evaluate(key => (window as any)[key].renderer.type, KEY)).toBe(1);
    expect(await save(page)).toBe(saved);
    await shot(page, info.project.name, 'canvas-recovered');
});

test('Canvas survives rotation and refreshes a changed visual viewport on pageshow', async ({ page }, info) => {
    await page.goto('/?renderer=canvas'); await ready(page);
    for (let i = 0; i < 3; i++) {
        await page.setViewportSize({ width: 768, height: 1024 });
        await paused(page, true);
        await page.setViewportSize(info.project.use.viewport!);
        await paused(page, false);
    }
    await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'width', { configurable: true, value: 768 });
        visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
        delete (visualViewport as any).width;
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect.poll(() => page.evaluate(key => (window as any)[key].canvas.getBoundingClientRect().width, KEY)).toBe(info.project.use.viewport!.width);
    await expect(page.locator('#portrait-overlay')).toBeHidden();
    await expect(page.locator('#renderer-recovery')).toHaveCount(0);
    await shot(page, info.project.name, 'canvas-rotated-back');
});

import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';

test.beforeEach(async ({ page }) => {
    await page.route('**/v1/me', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
    }));
});

for (const renderer of ['canvas', 'webgl']) test(`workshop fox portrait and observatory return ${renderer}`, async ({ page }) => {
    if (renderer === 'canvas') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
            if (type.includes('webgl')) return null;
            return (original as any).call(this, type, ...args);
        } as typeof original;
    });
    await openSeededGame(page, false, {}, {}, {
        unlockedPets: ['catacomb_creature_A'],
        // This case reviews the pet portrait, after the separate first-visit
        // demonstration. Never let that overlay conceal the screenshot target.
        seenGuides: ['pythia.intro.v1'],
        // A usable amulet keeps the forge explanation from hiding the selected
        // portrait during the actual visual review.
        crystals: { crystals: [{ id: 'fox-review-amulet', tier: 'shard', value: 5, locked: false }], maxCapacity: 60 },
    });
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer === 'canvas' ? 1 : 2);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('PythiaWorkshopScene'));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('PythiaWorkshopScene'), undefined, { timeout: 35_000 });
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene.children.list
        .some((o: any) => o.name?.startsWith('guide:')))).toBe(false);
    const portrait = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        const pet = s.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A');
        const find = (nodes: any[]): any => { for (const o of nodes) { if (o.texture?.key === `${pet.spriteKey}-portrait`) return o; const child = o.list && find(o.list); if (child) return child; } };
        const p = find(s.children.list);
        return { width: p.displayWidth, height: p.displayHeight, scaleX: p.scaleX, scaleY: p.scaleY };
    });
    expect(portrait.width).toBeLessThanOrEqual(110);
    expect(portrait.height).toBeLessThanOrEqual(110);
    expect(portrait.scaleX).toBe(portrait.scaleY);
    for (const width of [1280, 1024]) {
        await page.setViewportSize({ width, height: width === 1280 ? 720 : 768 });
        await page.waitForTimeout(200);
        await page.screenshot({ path: `artifacts/coop-difficulty/fox-${renderer}-${width}.png` });
    }
    await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        s.onPetClick(s.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A'));
    });
    const selected = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        const pet = s.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A');
        const sprite = s.bindingPetDisplay.list.find((o: any) => o.texture?.key === `${pet.spriteKey}-portrait`);
        const name = s.bindingPetDisplay.list.find((o: any) => typeof o.text === 'string');
        return { bottom: sprite.getBounds().bottom, nameTop: name.getBounds().top, scaleX: sprite.scaleX, scaleY: sprite.scaleY };
    });
    expect(selected.bottom).toBeLessThan(selected.nameTop);
    expect(selected.scaleX).toBe(selected.scaleY);
    await page.screenshot({ path: `artifacts/coop-difficulty/fox-${renderer}-selected.png` });
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        g.scene.keys.PythiaWorkshopScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' });
    });
    await waitForScene(page, 'CatacombTrialScene');
    await page.waitForFunction(() => !!(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round?.board.getActiveProblemSnapshot());
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.art.mural.gems.length)).toBe(10);
});

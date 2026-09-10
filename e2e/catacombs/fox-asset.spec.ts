import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';

for (const renderer of ['canvas', 'webgl']) test(`fox portrait and empty-animation recovery ${renderer}`, async ({ page }) => {
    if (renderer === 'canvas') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
            if (type.includes('webgl')) return null;
            return (original as any).call(this, type, ...args);
        } as typeof original;
    });
    await openSeededGame(page, false, {}, {}, { unlockedPets: ['catacomb_creature_A'] });
    const atlas = await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        const t = g.textures.get('rune-fox-sheet');
        return { key: t.key, width: t.source[0].width, height: t.source[0].height, frames: g.anims.get('rune-fox-idle').frames.length };
    });
    expect(atlas.key).toBe('rune-fox-sheet');
    expect(Math.max(atlas.width, atlas.height)).toBeLessThanOrEqual(4096);
    expect(atlas.frames).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('PythiaWorkshopScene'));
    await waitForScene(page, 'PythiaWorkshopScene');
    const portrait = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        const find = (nodes: any[]): any => { for (const o of nodes) { if (o.texture?.key === 'rune-fox-sheet') return o; const child = o.list && find(o.list); if (child) return child; } };
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
        const sprite = s.bindingPetDisplay.list.find((o: any) => o.texture?.key === 'rune-fox-sheet');
        const name = s.bindingPetDisplay.list.find((o: any) => typeof o.text === 'string');
        return { bottom: sprite.getBounds().bottom, nameTop: name.getBounds().top, scaleX: sprite.scaleX, scaleY: sprite.scaleY };
    });
    expect(selected.bottom).toBeLessThan(selected.nameTop);
    expect(selected.scaleX).toBe(selected.scaleY);
    await page.screenshot({ path: `artifacts/coop-difficulty/fox-${renderer}-selected.png` });
    // Reproduce the reported failure shape: exists() is true but there is no first frame.
    await page.evaluate(() => {
        const g = (window as any).__LITTLE_MATH_GAME__;
        g.anims.get('rune-fox-idle').frames.length = 0;
        g.scene.keys.PythiaWorkshopScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' });
    });
    await waitForScene(page, 'CatacombTrialScene');
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return { phase: s.phase, frames: s.creatureSprite.anims.currentAnim.frames.length };
    })).toEqual({ phase: 'intro', frames: 1 });
});

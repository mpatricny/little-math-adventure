import { activateCoopSession, expect, openSeededGame, test, waitForScene } from '../arena/helpers/arena-harness';

for (const renderer of ['canvas', 'webgl']) test(`guild door follows the partner’s fox trial and always opens the overview (${renderer})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await openSeededGame(page, true, {}, {}, {}, {
        unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'], catacombFoxBonus: 0,
    });
    await page.goto('/?renderer=' + renderer);
    await waitForScene(page, 'MenuScene');
    await activateCoopSession(page);
    await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const coop = CoopSessionManager.getInstance();
        coop.getPlayerBMasteryData()!.subAtoms.A1.state = 'mastery';
        coop.persistMasteryProgress();
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.scene.getScenes(true).at(-1).scene.start('GuildScene');
    });
    await waitForScene(page, 'GuildScene');
    const ready = () => page.evaluate(() =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.children.getByName('catacombTrialReady')?.visible);
    await expect.poll(ready).toBe(false);

    // Record the actual touch route and owner without depending on the overlay's drawing technology.
    const door = await page.evaluate(async () => {
        const { CatacombProgressOverlay } = await import('/src/ui/CatacombProgressOverlay.ts');
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const overlay = CatacombProgressOverlay.forScene(scene);
        const show = overlay.show.bind(overlay);
        overlay.show = (target, slot) => { scene.lastDoorSlot = slot; show(target, slot); };
        const point = scene.children.getByName('catacombDoorway');
        return { x: point.x, y: point.y };
    });
    const box = (await page.locator('canvas').boundingBox())!;
    const open = () => page.mouse.click(box.x + box.width * door.x / 1280, box.y + box.height * door.y / 720);
    const profile = () => page.evaluate(() =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.lastDoorSlot);
    await open();
    await expect.poll(profile).toBe(0);

    await page.evaluate(async () => {
        const { CatacombProgressOverlay } = await import('/src/ui/CatacombProgressOverlay.ts');
        const { SaveSystem } = await import('/src/systems/SaveSystem.ts');
        CatacombProgressOverlay.forScene((window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene).hide();
        const partner = SaveSystem.readSnapshot(1)!;
        partner.player.catacombFoxBonus = 1;
        SaveSystem.save(1, partner.player, partner.mathStats);
    });
    await expect.poll(ready).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('partner-ready-tablet.png') });
    const slotsBefore = await page.evaluate(() => [0, 1].map(i => localStorage.getItem('littleMathAdventure_slot_' + i)));
    await open();
    await expect.poll(profile).toBe(1);
    expect(await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        return [GameStateManager.getInstance().getActiveSlotIndex(), CoopSessionManager.getInstance().getActivePlayer()];
    })).toEqual([0, 'A']);
    expect(await page.evaluate(() => [0, 1].map(i => localStorage.getItem('littleMathAdventure_slot_' + i)))).toEqual(slotsBefore);
    await page.evaluate(async () => {
        const { CatacombProgressOverlay } = await import('/src/ui/CatacombProgressOverlay.ts');
        const { SaveSystem } = await import('/src/systems/SaveSystem.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const { admitFoxLesson, completeFoxLesson } = await import('/src/systems/FoxLessons.ts');
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        CatacombProgressOverlay.forScene(scene).hide();
        const partner = SaveSystem.readSnapshot(1)!;
        const data = CoopSessionManager.getInstance().getPlayerBMasteryData()!;
        const admission = admitFoxLesson(partner.player, data, 'A1', 'shield', 'door-test')!;
        if (!completeFoxLesson(admission, ['a', 'b', 'c', 'd', 'e', 'f'].map(problemKey => ({
            problemKey, correct: true, assisted: false,
        })), true)) throw new Error('An eligible first fox lesson must award the shield');
        SaveSystem.save(1, partner.player, partner.mathStats);
    });
    await expect.poll(ready).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('practice-tablet.png') });
    await open();
    await expect.poll(profile).toBe(0);
});

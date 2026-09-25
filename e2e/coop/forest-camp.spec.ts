import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';

async function screenPoint(page: Page, sceneKey: string, elementName: string) {
    const bounds = await page.evaluate(({ sceneKey, elementName }) => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys[sceneKey];
        const element = scene.children.getByName(elementName) ?? scene.sceneBuilder.get(elementName)
            ?? scene.modalContainer?.list.find((o: any) => o.name === elementName);
        const r = element.getBounds();
        return { x: r.centerX, y: r.centerY, width: r.width, height: r.height };
    }, { sceneKey, elementName });
    const box = (await page.locator('canvas').boundingBox())!;
    return { x: box.x + bounds.x * box.width / 1280, y: box.y + bounds.y * box.height / 720,
        width: bounds.width * box.width / 1280, height: bounds.height * box.height / 720 };
}

async function townSnapshot(page: Page) {
    return page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
        const player = GameStateManager.getInstance().getPlayer();
        return { paused: player.suspendedForestJourney, coins: player.coins, hp: player.hp, maxHp: player.maxHp,
            active: JourneySystem.getInstance().hasActiveJourney() };
    });
}

for (const coop of [false, true]) {
    test(`camp to town and back preserves the run through reload — ${coop ? 'co-op tablet Canvas' : 'solo desktop WebGL'}`, async ({ page }) => {
        await page.route(url => /^\/(?:api|v1)(?:\/|$)/.test(url.pathname), route => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
        }));
        if (coop) await page.setViewportSize({ width: 1024, height: 768 });
        await openSeededGame(page, coop, { arenaLevel: 3, completedArenaLevels: [1, 2] });
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        if (coop) {
            await page.goto('/?renderer=canvas');
            await waitForScene(page, 'MenuScene');
            await activateCoopSession(page);
        }
        await page.evaluate(() => {
            const game = (window as any).__LITTLE_MATH_GAME__;
            game.scene.getScenes(true).at(-1).scene.start('ForestAdventureStartScene', { debugMode: true });
        });
        await waitForScene(page, 'ForestAdventureStartScene');
        await page.evaluate(async () => {
            const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
            const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            const journey = JourneySystem.getInstance();
            journey.startRoomJourney('verdant_forest', 'forest_camp', true);
            journey.setObjectState('forest_edge', 'wolf_1', { interacted: true, defeated: true });
            journey.setObjectState('forest_riddle', 'bridge', { interacted: true, completed: true });
            journey.setObjectState('forest_camp', 'chest_simple', { interacted: true, looted: true });
            journey.addRewards(0, 40);
            GameStateManager.getInstance().getPlayer().hp = 7;
            (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestAdventureStartScene.scene.start('ForestCampScene', { roomId: 'forest_camp' });
        });
        await waitForScene(page, 'ForestCampScene');
        await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene.cameras.main.fadeEffect.isRunning);
        const prefix = `artifacts/forest-town/${coop ? 'tablet-canvas-coop' : 'desktop-webgl-solo'}`;
        const button = await screenPoint(page, 'ForestCampScene', 'campTownButtonHost-button');
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: `${prefix}-normal.png` });
        await page.mouse.move(button.x, button.y);
        await page.screenshot({ path: `${prefix}-hover.png` });
        await page.mouse.down();
        await page.screenshot({ path: `${prefix}-pressed.png` });
        await page.mouse.move(10, 10); await page.mouse.up();
        await waitForScene(page, 'ForestCampScene');
        await page.screenshot({ path: `${prefix}-pointer-out.png` });
        await page.mouse.click(button.x, button.y);
        await waitForScene(page, 'TownScene');
        const town = await townSnapshot(page);
        expect(town.active).toBe(false);
        expect(town.paused).toMatchObject({ currentRoom: 'forest_camp', totalGold: 40, completed: false });
        expect(town.hp).toBe(town.maxHp);

        await page.reload();
        await waitForScene(page, 'MenuScene');
        if (coop) await activateCoopSession(page);
        else {
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('TownScene'));
            await waitForScene(page, 'TownScene');
        }
        expect((await townSnapshot(page)).paused).toEqual(town.paused);
        const arrow = await screenPoint(page, 'TownScene', 'arrow forest');
        await page.mouse.click(arrow.x, arrow.y);
        await waitForScene(page, 'ForestCampScene');
        await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene.cameras.main.fadeEffect.isRunning);
        const returned = await page.evaluate(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            return { run: camp.journeySystem.getJourneyState(), chestVisible: camp.sceneBuilder.get('chest-forest').visible,
                paused: camp.gameState.getPlayer().suspendedForestJourney ?? null, hp: camp.gameState.getPlayer().hp,
                coins: camp.gameState.getPlayer().coins };
        });
        expect(returned.run.roomStates).toEqual(town.paused!.roomStates);
        expect(returned.run.startedAt).toBe(town.paused!.startedAt);
        expect(returned.run.totalGold).toBe(40);
        expect(returned.chestVisible).toBe(false);
        expect(returned.paused).toBeNull();
        expect(returned.coins).toEqual(town.coins); // No second entry fee.
        expect(returned.hp).toBe(town.hp); // No checkpoint HP rollback.
        await page.screenshot({ path: `${prefix}-returned.png` });

        // The tent's town action must have the same non-destructive behavior.
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene.openRestModal());
        const modalLayout = await page.evaluate(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            const safe = camp.sceneBuilder.getElementDef('campModalContentHost');
            return { safe, bounds: camp.modalContainer.list.map((o: any) => {
                const b = o.getBounds();
                return { name: o.name, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
            }), depth: camp.modalContainer.depth, overlayDepth: camp.modalOverlay.depth };
        });
        for (const bounds of modalLayout.bounds) {
            expect(bounds.left, bounds.name).toBeGreaterThanOrEqual(modalLayout.safe.x - modalLayout.safe.width / 2);
            expect(bounds.right, bounds.name).toBeLessThanOrEqual(modalLayout.safe.x + modalLayout.safe.width / 2);
            expect(bounds.top, bounds.name).toBeGreaterThanOrEqual(modalLayout.safe.y - modalLayout.safe.height / 2);
            expect(bounds.bottom, bounds.name).toBeLessThanOrEqual(modalLayout.safe.y + modalLayout.safe.height / 2);
        }
        expect(modalLayout.depth).toBeGreaterThan(modalLayout.overlayDepth);
        expect(modalLayout.overlayDepth).toBeGreaterThan(180); // Also blocks the walking HUD.
        await page.screenshot({ path: `${prefix}-tent.png` });
        await page.mouse.click(button.x, button.y); // Covered main town button must not fire.
        await waitForScene(page, 'ForestCampScene');

        const closeButton = await screenPoint(page, 'ForestCampScene', 'campModalCloseButtonHost-button');
        expect(closeButton.height).toBeGreaterThanOrEqual(44);
        await page.mouse.click(closeButton.x, closeButton.y);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene.modalOpen)).toBe(false);
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene.openRestModal());
        // Phaser inserts newly created controls into its input list on the next
        // scene update. Do not click the replacement modal before it can listen.
        await page.waitForFunction(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            const rest = camp.modalContainer.list.find((o: any) => o.name === 'campModalRestButtonHost-button');
            return camp.input._list.includes(rest);
        });
        const restButton = await screenPoint(page, 'ForestCampScene', 'campModalRestButtonHost-button');
        expect(restButton.height).toBeGreaterThanOrEqual(44);
        await page.mouse.click(restButton.x, restButton.y);
        await page.waitForFunction(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            return camp.modalOpen && camp.hasRested;
        });
        expect(await page.evaluate(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            return camp.modalContainer.list.find((o: any) => o.name === 'campModalRestButtonHost-button').input?.enabled ?? false;
        })).toBe(false);
        await page.screenshot({ path: `${prefix}-tent-rested.png` });

        const modalButton = await page.evaluate(() => {
            const camp = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCampScene;
            const button = camp.modalContainer.list.find((o: any) => o.name === 'campModalTownButtonHost-button');
            const r = button.getBounds();
            return { x: r.centerX, y: r.centerY, height: r.height };
        });
        const box = (await page.locator('canvas').boundingBox())!;
        expect(modalButton.height * box.height / 720).toBeGreaterThanOrEqual(44);
        await page.mouse.move(box.x + modalButton.x * box.width / 1280, box.y + modalButton.y * box.height / 720);
        await page.screenshot({ path: `${prefix}-tent-hover.png` });
        await page.mouse.down();
        await page.screenshot({ path: `${prefix}-tent-pressed.png` });
        await page.mouse.move(10, 10); await page.mouse.up();
        await page.screenshot({ path: `${prefix}-tent-pointer-out.png` });
        await page.mouse.click(box.x + modalButton.x * box.width / 1280, box.y + modalButton.y * box.height / 720);
        await waitForScene(page, 'TownScene');
        const second = await townSnapshot(page);
        expect(second.paused!.roomStates).toEqual(town.paused!.roomStates);
        expect(second.paused!.totalGold).toBe(40);
    });
}

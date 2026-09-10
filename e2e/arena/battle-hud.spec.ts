import {
    activateCoopSession,
    expect,
    openSeededGame,
    startArenaPreview,
    startBattleFromPreview,
    test,
    waitForScene,
} from './helpers/arena-harness';
import { getRepresentativeCoopWaves } from './helpers/production-encounters';

const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

test.describe('production battle HUD', () => {
    test('co-op three-enemy status plates and target marker follow their actors', async ({ page }) => {
        const scenario = getRepresentativeCoopWaves()
            .find(candidate => candidate.baseRoster.length === 3);
        if (!scenario) throw new Error('No production three-enemy encounter found');

        await openSeededGame(page, true);
        await activateCoopSession(page);
        await startArenaPreview(page, scenario.target);
        await startBattleFromPreview(page);

        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene?.battleState?.phase === 'player_turn';
        }, GAME_GLOBAL);

        const before = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            battle.battleState.selectedEnemyIndex = 1;
            battle.updateTargetIndicator();
            const heroOffset = {
                x: battle.heroHpBar.root.x - battle.heroContainer.x,
                y: battle.heroHpBar.root.y - battle.heroContainer.y,
            };
            const enemyOffset = {
                x: battle.enemyHpBars[1].root.x - battle.enemyContainers[1].x,
                y: battle.enemyHpBars[1].root.y - battle.enemyContainers[1].y,
            };

            battle.heroContainer.x += 35;
            battle.heroContainer.y -= 15;
            battle.enemyContainers[1].x -= 28;
            battle.enemyContainers[1].y += 12;

            return {
                heroOffset,
                enemyOffset,
                playerSizes: [battle.heroHpBar, battle.heroBHpBar]
                    .map((status: any) => [status.frameWidth, status.frameHeight]),
                enemySizes: battle.enemyHpBars
                    .map((status: any) => [status.frameWidth, status.frameHeight]),
                speedSlots: [
                    battle.speedChargeBar.getContainer().list.length,
                    battle.speedChargeBarB.getContainer().list.length,
                ],
            };
        }, GAME_GLOBAL);

        await page.waitForTimeout(80);

        const after = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            const countTexture = (items: any[], textureKey: string): number => items.reduce(
                (count, child) => count
                    + (child.texture?.key === textureKey ? 1 : 0)
                    + (Array.isArray(child.list) ? countTexture(child.list, textureKey) : 0),
                0,
            );
            return {
                heroOffset: {
                    x: battle.heroHpBar.root.x - battle.heroContainer.x,
                    y: battle.heroHpBar.root.y - battle.heroContainer.y,
                },
                enemyOffset: {
                    x: battle.enemyHpBars[1].root.x - battle.enemyContainers[1].x,
                    y: battle.enemyHpBars[1].root.y - battle.enemyContainers[1].y,
                },
                targetX: battle.targetIndicator.x,
                selectedStatusX: battle.enemyHpBars[1].root.x,
                targetGap: battle.enemyHpBars[1].getTopY() - battle.targetIndicator.y,
                targetHeight: battle.targetIndicator.displayHeight,
                statusFrameCount: countTexture(battle.children.list, 'battle-hud-status-frame-v2'),
                actionDockFrameCount: countTexture(battle.children.list, 'battle-hud-action-dock-v1'),
            };
        }, GAME_GLOBAL);

        expect(before.playerSizes).toEqual([[150, 34], [150, 34]]);
        expect(before.enemySizes).toEqual([[118, 28], [118, 28], [118, 28]]);
        // Each speed slot has an empty and charged layer: 4 * 2.
        expect(before.speedSlots).toEqual([8, 8]);
        expect(after.heroOffset.x).toBeCloseTo(before.heroOffset.x, 4);
        expect(after.heroOffset.y).toBeCloseTo(before.heroOffset.y, 4);
        expect(after.enemyOffset.x).toBeCloseTo(before.enemyOffset.x, 4);
        expect(after.enemyOffset.y).toBeCloseTo(before.enemyOffset.y, 4);
        expect(after.targetX).toBeCloseTo(after.selectedStatusX, 4);
        expect(after.targetGap).toBeGreaterThan(after.targetHeight / 2 - 6);
        expect(after.targetGap).toBeLessThan(after.targetHeight / 2 + 10);
        expect(after.statusFrameCount).toBe(5);
        expect(after.actionDockFrameCount).toBe(1);

        const canvas = page.locator('#game-container canvas');
        const canvasBox = await canvas.boundingBox();
        if (!canvasBox) throw new Error('Phaser canvas is not visible');
        await page.mouse.click(
            canvasBox.x + (640 / 1280) * canvasBox.width,
            canvasBox.y + (648 / 720) * canvasBox.height,
        );
        await expect.poll(() => page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene.battleState.phase;
        }, GAME_GLOBAL)).toBe('player_math');

        const pausePoint = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const pause = game.scene.keys.BattleScene.sceneBuilder.get('pauseButton');
            const bounds = pause.getBounds();
            return { x: bounds.centerX, y: bounds.centerY };
        }, GAME_GLOBAL);
        await page.mouse.click(
            canvasBox.x + (pausePoint.x / 1280) * canvasBox.width,
            canvasBox.y + (pausePoint.y / 720) * canvasBox.height,
        );
        await expect.poll(() => page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene.pauseMenu.isPaused();
        }, GAME_GLOBAL)).toBe(true);
    });

    test('catacomb trial uses one actor-bound status plate without standard battle controls', async ({ page }) => {
        await openSeededGame(page, false);
        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const source = game.scene.getScenes(true).at(-1);
            source.scene.start('CatacombTrialScene', {
                examType: 'fluency_challenge',
                subAtomId: 'A1',
                returnScene: 'GuildScene',
            });
        }, GAME_GLOBAL);
        await waitForScene(page, 'CatacombTrialScene');

        const before = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const trial = game.scene.keys.CatacombTrialScene as any;
            const countTexture = (items: any[], textureKey: string): number => items.reduce(
                (count, child) => count
                    + (child.texture?.key === textureKey ? 1 : 0)
                    + (Array.isArray(child.list) ? countTexture(child.list, textureKey) : 0),
                0,
            );
            const offset = {
                x: trial.enemyHpBar.root.x - trial.creatureContainer.x,
                y: trial.enemyHpBar.root.y - trial.creatureContainer.y,
            };
            trial.creatureContainer.x -= 42;
            trial.creatureContainer.y += 17;
            return {
                offset,
                statusFrameCount: countTexture(trial.children.list, 'battle-hud-status-frame-v2'),
                actionDockFrameCount: countTexture(trial.children.list, 'battle-hud-action-dock-v1'),
            };
        }, GAME_GLOBAL);
        await page.waitForTimeout(80);
        const after = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const trial = game.scene.keys.CatacombTrialScene as any;
            return {
                x: trial.enemyHpBar.root.x - trial.creatureContainer.x,
                y: trial.enemyHpBar.root.y - trial.creatureContainer.y,
            };
        }, GAME_GLOBAL);

        expect(before.statusFrameCount).toBe(1);
        expect(before.actionDockFrameCount).toBe(0);
        expect(after.x).toBeCloseTo(before.offset.x, 4);
        expect(after.y).toBeCloseTo(before.offset.y, 4);
    });
});

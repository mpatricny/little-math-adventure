import { test, expect, openSeededGame, waitForScene, startArenaPreview, startBattleFromPreview } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

async function click(page: Page, x: number, y: number) {
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + x * box.width / 1280, box.y + y * box.height / 720);
}

test('different starting bands survive preparation, player switches, combat and reload', async ({ page }) => {
    await openSeededGame(page, true);
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { PlacementInitializer } = await import('/src/systems/PlacementInitializer.ts');
        const gs = GameStateManager.getInstance();
        sessionStorage.setItem('lma-e2e-preserve-saves', 'true');
        for (const [slot, band] of [[0, 'A'], [1, 'D']] as const) {
            gs.loadSlot(slot);
            PlacementInitializer.applyBandSelection(band, gs);
            gs.getPlayer().equippedWeapon = 'sword_wooden';
            gs.getPlayer().hp = gs.getPlayer().maxHp = 100;
            gs.save();
        }
    });
    // Start from hydrated saves, including the real placement field and base combat level 1.
    await page.reload();
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'), undefined, { timeout: 30_000 });
    await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        CoopSessionManager.getInstance().startSession(0, 1);
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ShopScene');
    });
    await waitForScene(page, 'ShopScene');
    for (const band of ['A', 'D']) {
        const point = await page.evaluate(() => {
            const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.prepButtons.sword.root.getBounds();
            return { x: r.centerX, y: r.centerY };
        });
        await click(page, point.x, point.y);
        for (let n = 0; n < 3; n++) {
            await page.waitForFunction(n => {
                const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;
                return o.root.getData('phase') === 'training' && o.root.getData('activeProblemIndex') === n;
            }, n);
            const key = await page.evaluate(() => {
                const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;
                return o.sampleProblems[o.attemptsCompleted].masteryKey;
            });
            expect(key).toMatch(new RegExp(`^${band}1:`));
            if (n === 0) await page.screenshot({ path: `artifacts/coop-difficulty/preparation-${band}.png` });
            await page.evaluate(() => {
                const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay;
                const p = o.sampleProblems[o.attemptsCompleted];
                o.mathBoard.submitChoice(p.choices.indexOf(p.answer));
            });
        }
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay.root.getData('phase') === 'complete');
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.preparationOverlay.close(true));
        if (band === 'A') {
            await click(page, 380, 640);
            await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ShopScene.gameState.getPlayer().name === 'Borek');
            // The switch loads the slot synchronously, then restarts Phaser on
            // the next frame. Wait for the replacement controls before clicking.
            await page.waitForTimeout(350);
        }
    }
    await startArenaPreview(page, { arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1' });
    await startBattleFromPreview(page);
    const seen = new Set<string>();
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && seen.size < 2) {
        const state = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            const b = s.mathBoard;
            const row = b?.problemRows[b.currentProblemIndex];
            const button = row?.buttons.find((o: any) => o.getData('isCorrect') && o.getData('bg')?.input?.enabled);
            if (b?.container.visible && button) {
                const r = button.getBounds();
                return { x: r.centerX, y: r.centerY, player: s.coopSession.getActivePlayer(), key: b.problems[b.currentProblemIndex].masteryKey, phase: s.battleState.phase };
            }
            if (['player_turn', 'player_b_turn'].includes(s.battleState.phase)) return { x: s.battleActionDock.attackRoot.x, y: s.battleActionDock.attackRoot.y };
            return {};
        });
        if (state.key && ['player_math', 'player_b_math'].includes(state.phase)) {
            expect(state.key).toMatch(new RegExp(`^${state.player === 'A' ? 'A' : 'D'}1:`));
            if (!seen.has(state.player)) await page.screenshot({ path: `artifacts/coop-difficulty/battle-${state.player}.png` });
            seen.add(state.player);
        }
        if (state.x !== undefined) await click(page, state.x, state.y!);
        await page.waitForTimeout(400);
    }
    expect([...seen].sort()).toEqual(['A', 'B']);
    await page.reload();
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'), undefined, { timeout: 30_000 });
    expect(await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.masteryData.selectedStartBand))).toEqual(['A', 'D']);
});

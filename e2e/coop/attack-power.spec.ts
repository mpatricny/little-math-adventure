import type { Page } from 'playwright/test';
import {
    test, expect, openSeededGame, waitForScene, activateCoopSession,
    startArenaPreview, startBattleFromPreview, winBattleToVictory,
} from '../arena/helpers/arena-harness';

async function startEncounter(page: Page, area: 'arena' | 'forest') {
    if (area === 'arena') {
        await startArenaPreview(page, { arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1' });
        await startBattleFromPreview(page);
    } else {
        await page.evaluate(async () => {
            const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
            if (!JourneySystem.getInstance().hasActiveJourney()) {
                JourneySystem.getInstance().startRoomJourney('verdant_forest', 'forest_edge', true);
            }
            const game = (window as any).__LITTLE_MATH_GAME__;
            game.scene.getScenes(true).at(-1).scene.start('ForestRoomScene', { roomId: 'forest_edge' });
        });
        await waitForScene(page, 'ForestRoomScene');
        await page.evaluate(() => {
            const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestRoomScene;
            scene.startBattle(scene.currentRoom.objects.find((object: any) => object.id === 'wolf_1'));
        });
        await waitForScene(page, 'BattleScene');
    }
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn', null, { timeout: 30_000 });
}

async function assertHeroAttack(page: Page, owner: 'A' | 'B', screenshot?: string) {
    const snapshot = await page.evaluate(owner => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        scene.mathBoard.hide();
        scene.setPhase(owner === 'A' ? 'player_turn' : 'player_b_turn');
        scene.onAttackClicked();
        return {
            owner: scene.coopSession.getActivePlayer(),
            attack: scene.gameState.getPlayer().attack,
            powers: scene.battleState.currentProblems.map((p: any) => p.damageMultiplier),
            sources: scene.battleState.currentProblems.map((p: any) => p.source ?? 'player'),
            countOnBoard: scene.mathBoard.problems.length,
        };
    }, owner);
    expect(snapshot).toEqual(owner === 'A' ? {
        owner, attack: 4, powers: [2, 1, 1, 3],
        sources: ['player', 'player', 'player', 'sword'], countOnBoard: 4,
    } : {
        owner, attack: 2, powers: [1, 1, 1],
        sources: ['player', 'player', 'sword'], countOnBoard: 3,
    });
    if (screenshot) {
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
        await page.screenshot({ path: `artifacts/coop-attack/${screenshot}.png` });
    }
}

for (const renderer of ['webgl', 'canvas'] as const) {
    test(`hero attacks survive arena/forest victories, restart and solo — ${renderer}`, async ({ page }) => {
        await page.route(url => /^\/(?:api|v1)(?:\/|$)/.test(url.pathname), route => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
        }));
        await page.setViewportSize(renderer === 'canvas' ? { width: 1024, height: 768 } : { width: 1280, height: 800 });
        await openSeededGame(page, true, {}, {},
            { attack: 4, equippedWeapon: 'sword_reinforced' },
            { attack: 2, equippedWeapon: 'sword_wooden' });
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        if (renderer === 'canvas') {
            await page.goto('/?renderer=canvas');
            await waitForScene(page, 'MenuScene');
        }
        await activateCoopSession(page);
        for (const area of ['arena', 'arena', 'forest'] as const) {
            await startEncounter(page, area);
            await assertHeroAttack(page, 'A', `${renderer}-${area}-A`);
            await assertHeroAttack(page, 'B', `${renderer}-${area}-B`);
            // Real victory bookkeeping, including two wins (the old counter's growth boundary).
            await winBattleToVictory(page);
            const status = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.children.list
                .find((o: any) => o.name === 'victoryStatusHost' && typeof o.text === 'string').text);
            expect(status).not.toContain('Společný útok');
        }
        await page.screenshot({ path: `artifacts/coop-attack/${renderer}-victory.png` });

        // A reload used to reset both heroes to one base problem.
        await page.reload();
        await waitForScene(page, 'MenuScene');
        await activateCoopSession(page);
        await startEncounter(page, 'forest');
        await assertHeroAttack(page, 'A');
        await assertHeroAttack(page, 'B');

        // Leaving co-op must not change either saved hero's attack in solo.
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('MenuScene'));
        await waitForScene(page, 'MenuScene');
        for (const slot of [0, 1]) {
            await page.evaluate(async slot => {
                const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
                GameStateManager.getInstance().loadSlot(slot);
            }, slot);
            await startEncounter(page, slot === 0 ? 'arena' : 'forest');
            const attack = await page.evaluate(() => {
                const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                scene.onAttackClicked();
                return { coop: scene.isCoopMode, powers: scene.battleState.currentProblems.map((p: any) => p.damageMultiplier) };
            });
            expect(attack).toEqual({ coop: false, powers: slot === 0 ? [2, 1, 1, 3] : [1, 1, 1] });
        }
    });
}

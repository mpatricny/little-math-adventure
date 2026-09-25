import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';

test('co-op guardian victory completes the journey and opens the claimable forest crystal', async ({ page }) => {
    await page.route(url => /^\/(?:api|v1)(?:\/|$)/.test(url.pathname), route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
    }));
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSeededGame(page, true);
    await page.goto('/?renderer=canvas');
    await waitForScene(page, 'MenuScene');
    await activateCoopSession(page);
    await page.evaluate(async () => {
        const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
        const journey = JourneySystem.getInstance();
        journey.startRoomJourney('verdant_forest', 'guardian_lair', true);
        journey.setObjectState('guardian_lair', 'puzzle_offering', { interacted: true, completed: true });
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.scene.keys.TownScene.scene.start('GuardianLairScene');
    });
    await waitForScene(page, 'GuardianLairScene');
    // Keep the production lair's battle configuration, including storyVictory.
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.startRealBattle());
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn', null, { timeout: 30_000 });
    const battle = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const info = { coop: b.isCoopMode, story: b.storyVictory, mock: b.mockMode, phases: b.bossPhases.length };
        // Focused end-of-battle fixture: B defeats the last phase. Do not bypass
        // the real victory decision, per-player rewards or scene transition.
        b.setPhase('player_b_turn');
        b.currentBossPhase = b.bossPhases.length - 1;
        b.battleState.enemies.forEach((enemy: any) => { enemy.hp = 0; });
        b.checkVictoryOrContinue();
        return info;
    });
    expect(battle).toMatchObject({ coop: true, story: 'forest-crystal', mock: false });
    expect(battle.phases).toBeGreaterThan(1);
    await waitForScene(page, 'ForestCrystalRewardScene');
    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCrystalRewardScene.cameras.main.fadeEffect.isRunning);
    const reward = await page.evaluate(async () => {
        const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const { SaveSystem } = await import('/src/systems/SaveSystem.ts');
        const game = (window as any).__LITTLE_MATH_GAME__;
        const scene = game.scene.keys.ForestCrystalRewardScene;
        return {
            active: game.scene.getScenes(true).map((s: any) => s.scene.key),
            completed: JourneySystem.getInstance().getJourneyState()!.completed,
            guardian: JourneySystem.getInstance().getObjectState('guardian_lair', 'boss_guardian'),
            owner: CoopSessionManager.getInstance().getActivePlayer(),
            coop: CoopSessionManager.getInstance().isCoopActive(),
            testMode: scene.testMode, goldReward: scene.goldReward,
            players: [0, 1].map(slot => SaveSystem.load(slot)!.player),
        };
    });
    expect(reward.active).toEqual(['ForestCrystalRewardScene']);
    expect(reward.completed).toBe(true);
    expect(reward.guardian).toEqual({ interacted: true, defeated: true });
    expect(reward).toMatchObject({ owner: 'A', coop: true, testMode: false });
    expect(reward.goldReward).toBeGreaterThan(0);
    expect(reward.players[0].coins).toEqual(reward.players[1].coins);
    for (const player of reward.players) {
        expect(player.unlockedPets).toContain('verdant_guardian_defeated');
        expect(player.crystals.crystals.length).toBeGreaterThan(0);
    }
    await page.screenshot({ path: 'artifacts/forest-guardian/coop-crystal.png' });

    const point = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCrystalRewardScene.claimButton.root.getBounds();
        return { x: b.centerX, y: b.centerY };
    });
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(canvas.x + point.x * canvas.width / 1280, canvas.y + point.y * canvas.height / 720);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCrystalRewardScene.hasClaimed);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.storyProgress))
        .toMatchObject({ hasDefeatedVerdantGuardian: true, hasClaimedForestCrystal: true });
    await page.waitForTimeout(1_400); // Let the existing crystal-to-inventory animation finish.
    await page.screenshot({ path: 'artifacts/forest-guardian/coop-crystal-claimed.png' });
});

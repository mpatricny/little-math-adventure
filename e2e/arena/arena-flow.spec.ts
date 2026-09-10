import type { Page } from 'playwright/test';
import {
    activateCoopSession,
    expect,
    getArenaSnapshot,
    getBattleSnapshot,
    getCoopProgress,
    getSoloProgress,
    getVictorySnapshot,
    markBattleAttemptImperfect,
    openSeededGame,
    startArenaBattleFromCoordinates,
    startDefaultArenaPreview,
    startArenaPreview,
    startBattleFromPreview,
    switchArenaChoice,
    test,
    waitForScene,
    winBattleAndContinue,
    winBattleToVictory,
} from './helpers/arena-harness';
import {
    getFirstEnemyIdOutside,
    getNextProductionEncounterId,
    getProductionBossExpectation,
    getProductionWaveExpectation,
    getRepresentativeCoopWaves,
} from './helpers/production-encounters';

const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

async function clickSceneElement(page: Page, sceneKey: string, elementId: string): Promise<void> {
    const point = await page.evaluate(({ globalName, scene, id }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const element = game.scene.keys[scene].sceneBuilder.get(id);
        if (!element?.visible) throw new Error(`${scene}.${id} is not visible`);
        const bounds = element.getBounds();
        return { x: bounds.centerX, y: bounds.centerY };
    }, { globalName: GAME_GLOBAL, scene: sceneKey, id: elementId });

    const canvas = page.locator('#game-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Phaser canvas is not visible');
    await page.mouse.click(
        box.x + (point.x / 1280) * box.width,
        box.y + (point.y / 720) * box.height,
    );
}

test.describe('scene-first arena flow', () => {
    test('new progress is default while an older imperfect arena stays optional', async ({ page }) => {
        const arena1Results = [
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: false, crystalsEarned: 1 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
        ];
        await openSeededGame(page, false, {
            arenaProgressVersion: 2,
            arenaLevel: 2,
            currentBattle: 0,
            currentEncounterId: 'arena-2-wave-1',
            waveResultsArenaLevel: 1,
            completedArenaLevels: [1],
            waveResults: arena1Results,
            encounterResults: Object.fromEntries(arena1Results.map((result, index) => (
                [`arena-1-wave-${index + 1}`, result]
            ))),
        });

        await startDefaultArenaPreview(page);
        const progression = await getArenaSnapshot(page);
        expect(progression.arenaChoiceId).toBe('progression:arena-2');
        expect(progression.arenaChoiceIds).toEqual([
            'progression:arena-2',
            'improvement:arena-1',
        ]);
        expect(progression.arenaLevel).toBe(2);
        expect(progression.currentWave).toBe(0);
        expect(progression.arenaChoiceStatus).toContain('POKRAČOVAT V PŘÍBĚHU');

        await switchArenaChoice(page, 'next');
        const improvement = await getArenaSnapshot(page);
        expect(improvement.arenaChoiceId).toBe('improvement:arena-1');
        expect(improvement.arenaLevel).toBe(1);
        expect(improvement.currentWave).toBe(1);
        expect(improvement.highestUnlockedArenaLevel).toBe(2);
        expect(improvement.arenaChoiceStatus).toContain('DOPILOVAT ★');
        if (process.env.ARENA_CHOICE_SCREENSHOT) {
            await page.screenshot({ path: process.env.ARENA_CHOICE_SCREENSHOT });
        }

        await switchArenaChoice(page, 'next');
        expect((await getArenaSnapshot(page)).arenaChoiceId).toBe('progression:arena-2');
    });

    test('co-op improvement ends after the missing star and keeps the next arena unlocked', async ({ page }) => {
        const arena1Results = [
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: false, crystalsEarned: 1 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
        ];
        const overrides = {
            arenaProgressVersion: 2,
            arenaLevel: 2,
            currentBattle: 0,
            currentEncounterId: 'arena-2-wave-1',
            waveResultsArenaLevel: 1,
            completedArenaLevels: [1],
            waveResults: arena1Results,
            encounterResults: Object.fromEntries(arena1Results.map((result, index) => (
                [`arena-1-wave-${index + 1}`, result]
            ))),
        };
        await openSeededGame(page, true, overrides);
        await activateCoopSession(page);
        await startDefaultArenaPreview(page);
        await switchArenaChoice(page, 'next');

        const improvement = await getArenaSnapshot(page);
        expect(improvement.arenaChoiceId).toBe('improvement:arena-1');
        expect(improvement.currentWave).toBe(1);

        await startBattleFromPreview(page);
        await getBattleSnapshot(page); // Captures the active co-op session for post-victory inspection.
        await winBattleToVictory(page);
        await page.waitForTimeout(1_600);
        await page.keyboard.press('Space');
        await waitForScene(page, 'TownScene');

        const progress = await getCoopProgress(page, 'arena-1-wave-2', 1);
        expect(progress.playerA.arenaLevel).toBe(2);
        expect(progress.playerB.arenaLevel).toBe(2);
        expect(progress.playerA.currentBattle).toBe(0);
        expect(progress.playerB.currentBattle).toBe(0);
        expect(progress.playerA.result).toEqual(expect.objectContaining({ perfectWave: true }));
        expect(progress.playerB.result).toEqual(expect.objectContaining({ perfectWave: true }));
    });

    test('an imperfect replay advances to the next optional wave selected by BattleScene', async ({ page }) => {
        const arena1Results = [
            { completed: true, perfectWave: false, crystalsEarned: 1 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: false, crystalsEarned: 1 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
        ];
        await openSeededGame(page, false, {
            arenaProgressVersion: 2,
            arenaLevel: 2,
            currentBattle: 0,
            currentEncounterId: 'arena-2-wave-1',
            waveResultsArenaLevel: 1,
            completedArenaLevels: [1],
            waveResults: arena1Results,
            encounterResults: Object.fromEntries(arena1Results.map((result, index) => (
                [`arena-1-wave-${index + 1}`, result]
            ))),
        });

        await startDefaultArenaPreview(page);
        await switchArenaChoice(page, 'next');
        expect((await getArenaSnapshot(page)).encounterId).toBe('arena-1-wave-1');

        await startBattleFromPreview(page);
        await markBattleAttemptImperfect(page);
        await winBattleAndContinue(page);

        const nextPracticeWave = await getArenaSnapshot(page);
        expect(nextPracticeWave.arenaChoiceId).toBe('improvement:arena-1');
        expect(nextPracticeWave.encounterId).toBe('arena-1-wave-3');
        expect(nextPracticeWave.currentWave).toBe(2);
        expect(nextPracticeWave.highestUnlockedArenaLevel).toBe(2);
    });

    test('solo Arena 1 preview starts BattleScene and returns with wave progress', async ({ page }) => {
        const source = getProductionWaveExpectation(1, 0, 'solo');
        await openSeededGame(page);
        await startArenaPreview(page, source.target);

        const preview = await getArenaSnapshot(page);
        expect(preview.encounterId).toBe(source.target.encounterId);
        expect(preview.currentWave).toBe(0);
        expect(preview.roster).toEqual(source.resolvedRoster);

        await startBattleFromPreview(page);
        const battle = await getBattleSnapshot(page);
        expect(battle.encounterId).toBe(source.target.encounterId);
        expect(battle.fromArena).toBe(true);
        expect(battle.arenaLevel).toBe(1);
        expect(battle.arenaWave).toBe(0);
        expect(battle.coinReward).toBeGreaterThanOrEqual(source.coinReward.min);
        expect(battle.coinReward).toBeLessThanOrEqual(source.coinReward.max);
        expect(battle.roster).toEqual(source.resolvedRoster.map(enemy => ({
            ...enemy,
            battleHp: enemy.hp,
            battleMaxHp: enemy.hp,
        })));

        await winBattleAndContinue(page);

        const progress = await getSoloProgress(page, source.target.encounterId, source.target.wave);
        expect(progress.previewEncounterId).toBe(
            getNextProductionEncounterId(source.target.arenaLevel, source.target.wave),
        );
        expect(progress.currentBattle).toBe(1);
        expect(progress.result).toEqual(expect.objectContaining({ completed: true }));
        expect(progress.totalWavesCompleted).toBe(1);
    });

    test('coordinate-only arena entry ignores a passed roster and resolves encounters.json', async ({ page }) => {
        const representative = getRepresentativeCoopWaves().at(-1)!;
        const source = getProductionWaveExpectation(
            representative.target.arenaLevel,
            representative.target.wave,
            'solo',
        );
        const decoyEnemyId = getFirstEnemyIdOutside(source.baseRoster);

        await openSeededGame(page);
        await startArenaBattleFromCoordinates(page, source.target, decoyEnemyId);

        const battle = await getBattleSnapshot(page);
        expect(battle.encounterId).toBe(source.target.encounterId);
        expect(battle.arenaLevel).toBe(source.target.arenaLevel);
        expect(battle.arenaWave).toBe(source.target.wave);
        expect(battle.roster.map(enemy => ({ id: enemy.id, hp: enemy.hp })))
            .toEqual(source.resolvedRoster);
    });

    test('completed arena remains replayable while a wave is not perfect', async ({ page }) => {
        const results = [
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: false, crystalsEarned: 1 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
        ];
        const encounterResults = Object.fromEntries(results.map((result, index) => (
            [`arena-1-wave-${index + 1}`, result]
        )));

        await openSeededGame(page, false, {
            arenaProgressVersion: 2,
            arenaLevel: 2,
            currentBattle: 1,
            currentEncounterId: 'arena-1-wave-2',
            waveResultsArenaLevel: 1,
            completedArenaLevels: [1],
            waveResults: results,
            encounterResults,
        });
        await startArenaPreview(page, {
            arenaLevel: 1,
            wave: 1,
            encounterId: 'arena-1-wave-2',
        });

        const preview = await getArenaSnapshot(page);
        expect(preview.encounterId).toBe('arena-1-wave-2');
        expect(preview.roster.length).toBeGreaterThan(0);

        // This clicks the real SceneBuilder button and fails if ArenaScene hid it.
        await startBattleFromPreview(page);
        const battle = await getBattleSnapshot(page);
        expect(battle.encounterId).toBe('arena-1-wave-2');
    });

    test('arena title follows the arena resolved from encounterId', async ({ page }) => {
        await openSeededGame(page);
        await startArenaPreview(page, {
            // The stable encounter ID is authoritative when legacy coordinates disagree.
            arenaLevel: 1,
            wave: 0,
            encounterId: 'arena-2-wave-4',
        });

        const preview = await getArenaSnapshot(page);
        expect(preview.encounterId).toBe('arena-2-wave-4');
        expect(preview.arenaLevel).toBe(2);
        expect(preview.currentWave).toBe(3);
        expect(preview.arenaTitle).toBe('ARÉNA 2');
    });

    test('replaying completed Arena 2 does not duplicate completion crystals', async ({ page }) => {
        const results = [
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: true, crystalsEarned: 2 },
            { completed: true, perfectWave: false, crystalsEarned: 1 },
        ];
        const encounterResults = Object.fromEntries(results.map((result, index) => (
            [`arena-2-wave-${index + 1}`, result]
        )));

        await openSeededGame(page, false, {
            arenaProgressVersion: 2,
            arenaLevel: 3,
            currentBattle: 4,
            currentEncounterId: 'arena-2-wave-5',
            waveResultsArenaLevel: 2,
            completedArenaLevels: [1, 2],
            waveResults: results,
            encounterResults,
        });
        await startArenaPreview(page, {
            arenaLevel: 2,
            wave: 4,
            encounterId: 'arena-2-wave-5',
        });
        await startBattleFromPreview(page);
        await winBattleToVictory(page);

        const victory = await getVictorySnapshot(page);
        expect(victory.arenaCompleted).toBe(true);
        expect(victory.completedArenaLevels).toEqual([1, 2]);
        expect(victory.crystalLabels).not.toContain('Za dokončení arény');
        expect(victory.crystalLabels).not.toContain('Speciální krystal');
        expect(victory.crystalDropCount).toBe(0);
    });

    test('completed Arena 2 opens the forest gate and loads the first forest room', async ({ page }) => {
        await openSeededGame(
            page,
            false,
            {
                arenaProgressVersion: 2,
                arenaLevel: 3,
                currentBattle: 0,
                currentEncounterId: 'arena-3-wave-1',
                waveResultsArenaLevel: 2,
                completedArenaLevels: [1, 2],
                waveResults: [],
                encounterResults: {},
            },
            {},
            {
                level: 5,
                coins: { copper: 50, silver: 0, gold: 0, pouch: 0 },
            },
        );

        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            game.scene.getScenes(true).at(-1).scene.start('TownScene');
        }, GAME_GLOBAL);
        await waitForScene(page, 'TownScene');
        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.TownScene.sceneBuilder.get('arrow forest')?.visible === true;
        }, GAME_GLOBAL);

        await clickSceneElement(page, 'TownScene', 'arrow forest');
        await waitForScene(page, 'ForestAdventureStartScene');

        const gate = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const scene = game.scene.keys.ForestAdventureStartScene as any;
            return {
                journeyId: scene.journeyConfig?.id,
                journeyLoaded: game.cache.json.has('forestJourney'),
                enemiesLoaded: game.cache.json.has('enemies'),
                roomsLoaded: game.cache.json.has('forestRooms'),
                startRoom: game.cache.json.get('forestRooms')?.startRoom,
            };
        }, GAME_GLOBAL);
        expect(gate).toEqual({
            journeyId: 'verdant_forest',
            journeyLoaded: true,
            enemiesLoaded: true,
            roomsLoaded: true,
            startRoom: 'forest_edge',
        });

        await clickSceneElement(page, 'ForestAdventureStartScene', 'Arrow-forest');
        await waitForScene(page, 'ForestRoomScene');

        const room = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const scene = game.scene.keys.ForestRoomScene as any;
            return {
                roomId: scene.roomId,
                coins: scene.gameState.getPlayer().coins,
            };
        }, GAME_GLOBAL);
        expect(room.roomId).toBe('forest_edge');
        expect(room.coins).toEqual({ copper: 0, silver: 0, gold: 0, pouch: 0 });

        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const scene = game.scene.keys.ForestRoomScene as any;
            const wolf = scene.currentRoom.objects.find((object: any) => object.id === 'wolf_1');
            scene.startBattle(wolf);
        }, GAME_GLOBAL);
        await waitForScene(page, 'BattleScene');
        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene?.battleState?.phase === 'player_turn';
        }, GAME_GLOBAL);

        const forestBattle = await getBattleSnapshot(page);
        expect(forestBattle.encounterId).toBe('forest-room-edge-wolf');
        expect(forestBattle.fromArena).toBe(false);
        // Forest combat uses the canonical enemies.json definition.
        expect(forestBattle.roster).toEqual([
            { id: 'forest_wolf', hp: 15, battleHp: 15, battleMaxHp: 15 },
        ]);
    });

    test('co-op forest boss resolves and scales every encounter-defined phase', async ({ page }) => {
        const sourceBoss = getProductionBossExpectation('forest-room-guardian-boss', 'coop');
        await openSeededGame(page, true);
        await activateCoopSession(page);
        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const source = game.scene.getScenes(true).at(-1);
            source.scene.start('BattleScene', {
                mode: 'journey',
                encounterId: 'forest-room-guardian-boss',
                returnScene: 'ForestRoomScene',
                returnData: { roomId: 'guardian_lair', defeatedObjectId: 'boss_guardian' },
                backgroundKey: 'guardian-lair',
            });
        }, GAME_GLOBAL);
        await waitForScene(page, 'BattleScene');
        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene?.battleState?.phase === 'player_turn';
        }, GAME_GLOBAL);

        const boss = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            return {
                encounterId: battle.encounterId,
                fromArena: battle.fromArena,
                isBoss: battle.isBoss,
                adjustment: battle.resolvedJourneyEncounter?.coopAdjustment,
                phaseHp: battle.bossPhases.map((phase: any) => phase.hp),
                phaseAttack: battle.bossPhases.map((phase: any) => phase.attack),
                phaseDefense: battle.bossPhases.map((phase: any) => phase.defense),
                battleHp: battle.battleState.enemies[0].hp,
                battleMaxHp: battle.battleState.enemies[0].maxHp,
                battleDefense: battle.battleState.enemies[0].defense,
            };
        }, GAME_GLOBAL);

        expect(boss).toEqual({
            encounterId: sourceBoss.encounterId,
            fromArena: false,
            isBoss: true,
            adjustment: 'scale-all-phases',
            phaseHp: sourceBoss.phases.map(phase => phase.hp),
            phaseAttack: sourceBoss.phases.map(phase => phase.attack),
            phaseDefense: sourceBoss.phases.map(phase => phase.defense),
            battleHp: sourceBoss.phases[0].hp,
            battleMaxHp: sourceBoss.phases[0].hp,
            battleDefense: sourceBoss.phases[0].defense,
        });
    });

    test('enemy defense is subtracted once from the complete pet attack', async ({ page }) => {
        await openSeededGame(page);
        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const source = game.scene.getScenes(true).at(-1);
            source.scene.start('BattleScene', {
                mode: 'journey',
                encounterId: 'forest-room-guardian-boss',
                returnScene: 'ForestRoomScene',
                returnData: { roomId: 'guardian_lair', defeatedObjectId: 'boss_guardian' },
                backgroundKey: 'guardian-lair',
            });
        }, GAME_GLOBAL);
        await waitForScene(page, 'BattleScene');
        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.BattleScene?.battleState?.phase === 'player_turn';
        }, GAME_GLOBAL);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            const enemy = battle.battleState.enemies[0];
            enemy.defense = 3;
            const startingHp = enemy.hp;

            battle.applyPetDamageToEnemy(0, 5);
            const afterPartiallyBlockedAttack = enemy.hp;
            battle.applyPetDamageToEnemy(0, 3);

            return {
                startingHp,
                afterPartiallyBlockedAttack,
                afterFullyBlockedAttack: enemy.hp,
            };
        }, GAME_GLOBAL);

        expect(result.afterPartiallyBlockedAttack).toBe(result.startingHp - 2);
        expect(result.afterFullyBlockedAttack).toBe(result.afterPartiallyBlockedAttack);
    });

    const coopCases = getRepresentativeCoopWaves();

    for (const scenario of coopCases) {
        test(`co-op resolved roster: ${scenario.name}`, async ({ page }) => {
            await openSeededGame(page, true);
            await activateCoopSession(page);
            await startArenaPreview(page, scenario.target);

            const preview = await getArenaSnapshot(page);
            expect(preview.encounterId).toBe(scenario.target.encounterId);
            expect(preview.baseRoster).toEqual(scenario.baseRoster);
            expect(preview.roster).toEqual(scenario.resolvedRoster);

            await startBattleFromPreview(page);
            const battle = await getBattleSnapshot(page);
            expect(battle.encounterId).toBe(scenario.target.encounterId);
            expect(battle.fromArena).toBe(true);
            expect(battle.roster.map(enemy => ({ id: enemy.id, hp: enemy.hp })))
                .toEqual(scenario.resolvedRoster);
            expect(battle.roster.map(enemy => enemy.battleHp))
                .toEqual(scenario.resolvedRoster.map(enemy => enemy.hp));
            expect(battle.roster.map(enemy => enemy.battleMaxHp))
                .toEqual(scenario.resolvedRoster.map(enemy => enemy.hp));
            expect(battle.coinReward).toBeGreaterThanOrEqual(scenario.coinReward.min);
            expect(battle.coinReward).toBeLessThanOrEqual(scenario.coinReward.max);
        });
    }
});

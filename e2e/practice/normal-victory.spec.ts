import { mkdir } from 'node:fs/promises';
import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, startDefaultArenaPreview, activateCoopSession, waitForScene, winBattleToVictory } from '../arena/helpers/arena-harness';
import { tapPracticeControl as tap } from './controls';
import { tap as tapAt } from '../underwater/hands-on-helpers';

const review = 'artifacts/normal-victory-review';
const canvas = (page: Page) => page.locator('#game-container canvas');
test.beforeAll(() => mkdir(review, { recursive: true }).then(() => undefined));

async function prepare(page: Page, { coop = false, final = false, trainB = false } = {}): Promise<void> {
    await openSeededGame(page, coop, {}, {}, { attack: 38, seenGuides: ['arena.free.v1'] });
    await page.evaluate(async ({ coop, final, trainB }) => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const { setArenaEncounterResult } = await import('/src/systems/ArenaProgressSystem.ts');
        const game = GameStateManager.getInstance();
        const waves = (window as any).__LITTLE_MATH_GAME__.cache.json.get('encounters').scenes.ArenaScene.arenas[1].waves;
        for (const slot of coop ? [0, 1] : [0]) {
            game.loadSlot(slot);
            const data = game.getMasteryData();
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            data.practice = { mode: 'progress', defaultMode: 'progress', introductionSeen: true };
            if (trainB && slot === 1) {
                data.subAtoms.A1.state = 'training';
                data.practice.pinnedTargetId = 'A1';
            }
            const p = game.getPlayer();
            if (final || slot === 1) {
                p.unlockedPets.push('slime_green', 'purple_demon');
                waves.slice(0, final ? -1 : 1).forEach((wave: any, i: number) => setArenaEncounterResult(p, 1, i, wave.id,
                    { completed: true, perfectWave: true, crystalsEarned: 2 }));
            }
            game.save();
        }
        game.loadSlot(0);
    }, { coop, final, trainB });
    if (coop) await activateCoopSession(page);
}

async function confirmBattle(page: Page, trainB = false): Promise<void> {
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => !!(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice);
    if (trainB) await tap(page, 'practiceChoicePracticeB');
    await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
}

async function receipt(page: Page) {
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.remoteContinueReady);
    return page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
        const result = s.children.getByName('battleVictoryResult');
        const all: any[] = [];
        const visit = (object: any) => { all.push(object); object.list?.forEach(visit); };
        visit(result);
        return { audit: s.auditLayout(), data: s.victoryData, owner: result.getData('owner'),
            waves: all.filter(o => o.name.startsWith('victoryWave')).map(o => o.getData('done')),
            next: all.find(o => o.name.startsWith('victoryWave') && o.getData('next'))?.name,
            heading: result.getByName('victoryRouteTitle').text, friend: all.some(o => o.text === 'Nový přítel'),
            place: all.find(o => o.name === 'victoryPlace')?.text, landmark: all.find(o => o.name === 'victoryDestinationArt')?.texture.key,
            art: all.filter(o => o.texture).map(o => o.texture.key), words: all.filter(o => o.text).map(o => o.text) };
    });
}

for (const area of ['forest', 'bridge', 'underwater', 'tutorial'] as const) {
    test('victory leads back to the pictured ' + area + ' location', async ({ page }) => {
        if (area === 'underwater') await page.setViewportSize({ width: 1024, height: 768 });
        await prepare(page);
        const target = area === 'underwater' ? 'UnderwaterRoomScene' : area === 'bridge' ? 'ForestRiddleScene' : area === 'forest' ? 'ForestRoomScene' : 'CrashSiteScene';
        let forestDestination: string[] = [];
        if (area === 'forest' || area === 'bridge') {
            await page.evaluate(async roomId => {
                const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
                JourneySystem.getInstance().startRoomJourney('verdant_forest', roomId, true);
                (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ForestRoomScene', { roomId });
            }, area === 'bridge' ? 'forest_riddle' : 'forest_edge');
            await waitForScene(page, target);
            forestDestination = await page.evaluate(target => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys[target];
                if (target === 'ForestRiddleScene') {
                    const backdrop = s.sceneBuilder.get('Forest Riddle').list.find((o: any) => o.getData('layerConfig')?.name === 'bg');
                    s.startMushroomBattle();
                    return [s.roomData.nameCs, backdrop.texture.key];
                }
                s.startBattle(s.currentRoom.objects.find((o: any) => o.id === 'wolf_1'));
                return [s.currentRoom.nameCs, s.currentRoom.background];
            }, target);
        } else if (area === 'underwater') {
            await page.evaluate(async () => {
                const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
                const { visitUnderwaterRoom, getUnderwaterProgress } = await import('/src/systems/UnderwaterProgressSystem.ts');
                const p = GameStateManager.getInstance().getPlayer();
                p.storyProgress = { ...p.storyProgress, hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true };
                visitUnderwaterRoom(p, 'sp_post_wreck', 'garden');
                getUnderwaterProgress(p).introSeen = true;
                (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene', { roomId: 'sp_post_wreck', entryId: 'garden' });
            });
            await waitForScene(page, target);
            await page.waitForFunction(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
                return s.party.length > 0 && !s.busy();
            });
            const point = await page.evaluate(() => {
                const h = (window as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('guardianHost');
                return { x: h.x, y: h.y };
            });
            await tapAt(page, point.x, point.y);
        } else {
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CrashSiteScene'));
            await waitForScene(page, target);
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CrashSiteScene.startBattle());
        }
        await confirmBattle(page);
        await winBattleToVictory(page);
        const view = await receipt(page);
        expect(view.audit).toEqual([]);
        expect(view.data.returnScene).toBe(target);
        expect(view.data.returnData.battleWon).toBe(true);
        expect(view.waves).toEqual([]);
        const room = { bridge: forestDestination, forest: forestDestination, underwater: ['Vrak poštovní lodi', 'underwater-post-wreck-bg'],
            tutorial: ['Zyxova loď', 'crash-site-background'] }[area];
        expect([view.place, view.landmark]).toEqual(room);
        expect(view.friend).toBe(!!view.data.unlockedPet);
        if (area === 'bridge') expect(view.words).toContain('Houbový obr');
        expect(view.words).toContain('+' + view.data.goldReward);
        expect(view.art).not.toContain('__MISSING');
        await canvas(page).screenshot({ path: review + '/' + area + '.png' });
        await tap(page, 'victoryContinueHost');
        await waitForScene(page, target);
        expect(await page.evaluate(target => (window as any).__LITTLE_MATH_GAME__.scene.keys[target].sys.settings.data, target)).toMatchObject(view.data.returnData);
    });
}

for (const mode of ['coop', 'final'] as const) {
    test('arena victory shows the saved ' + mode + ' result and next destination', async ({ page }) => {
        await prepare(page, { coop: mode === 'coop', final: mode === 'final' });
        await startDefaultArenaPreview(page);
        await tap(page, 'startBattleButton');
        await confirmBattle(page);
        await winBattleToVictory(page);
        const view = await receipt(page);
        expect(view.audit).toEqual([]);
        expect(view.waves).toHaveLength(5);
        expect(view.waves[view.data.arenaWave]).toBe(true);
        if (mode === 'coop') {
            expect(view.next).toBe('victoryWave' + view.data.returnData.wave);
            expect(view.friend).toBe(true);
            expect(view.art).toContain('mana-icon');
            await canvas(page).screenshot({ path: review + '/arena-coop-a.png' });
            await tap(page, 'practiceVictoryOwner1');
            const second = await receipt(page);
            expect(second.audit).toEqual([]);
            expect(second.owner).toBe(1);
            expect(second.waves).toEqual(view.data.personalLoot[1].completedWaves);
            expect(second.words).toContain('Dva slizové');
            expect(second.art).not.toContain('mana-icon');
            expect(second.friend).toBe(false);
            await canvas(page).screenshot({ path: review + '/arena-coop-b.png' });
        } else {
            expect(view.data.arenaCompleted).toBe(true);
            expect(view.heading).toBe('Otevřena aréna ' + view.data.nextCityArenaLevel);
            expect(view.waves.every(Boolean)).toBe(true);
            await canvas(page).screenshot({ path: review + '/arena-complete.png' });
        }
        await page.keyboard.press('Space');
        await waitForScene(page, view.data.returnScene);
    });
}

test('partners can switch between a training result and the ordinary reward for the same fight', async ({ page }) => {
    await prepare(page, { coop: true, trainB: true });
    await startDefaultArenaPreview(page);
    await tap(page, 'startBattleButton');
    await confirmBattle(page, true);
    await winBattleToVictory(page);
    await page.waitForFunction(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
        return s.remoteContinueReady && s.children.getByName('practiceVictoryResult')?.getData('owner') === 1;
    });
    await tap(page, 'practiceVictoryOwner0');
    const result = await receipt(page);
    expect(result.owner).toBe(0);
    expect(result.audit).toEqual([]);
    expect(result.art).toContain('green-slime-happy');
    expect(result.waves).toEqual(result.data.personalLoot[0].completedWaves);
    await tap(page, 'practiceVictoryOwner1');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene
        .children.getByName('practiceVictoryResult').getData('targetId'))).toBe('A1');
    await tap(page, 'victoryContinueHost');
    await waitForScene(page, result.data.returnScene);
});

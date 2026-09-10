import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap, solveChest, answerPearl } from './hands-on-helpers';

const WORLD = '__LITTLE_MATH_GAME__';

async function waterReady(page: Page, room = 'sp_shallows'): Promise<void> {
    await page.waitForFunction(({ name, room }) => {
        const scene = (globalThis as any)[name].scene.keys.UnderwaterRoomScene;
        return scene.scene.isActive() && scene.roomId === room && scene.party.length > 0 && !scene.transitioning && !scene.revealing && !scene.ui.modal;
    }, { name: WORLD, room });
}

async function snapshot(page: Page) {
    return page.evaluate(name => {
        const s = (globalThis as any)[name].scene.keys.UnderwaterRoomScene;
        return { progress: structuredClone(s.progress()), player: structuredClone(s.player()), partyCount: s.party.length, partyX: s.party[0]?.x };
    }, WORLD);
}

async function startFish(page: Page): Promise<void> {
    await tap(page, 845, 505);
    await waitForScene(page, 'BattleScene');
}

async function winWithAnswers(page: Page): Promise<number> {
    let answers = 0;
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
        const result = await page.evaluate(name => {
            const game = (globalThis as any)[name];
            const battle = game.scene.keys.BattleScene;
            if (!battle.scene.isActive()) return { done: true };
            battle.time.timeScale = 4;
            battle.tweens.timeScale = 4;
            const board = battle.mathBoard;
            const row = board.problemRows[board.currentProblemIndex];
            if (board.getContainer().visible && row && !row.solved) {
                board.submitChoice(row.problem.choices.indexOf(row.problem.answer));
                return { answered: true };
            }
            if (battle.battleState.phase === 'player_turn') battle.onAttackClicked();
            return {};
        }, WORLD);
        if (result.answered) answers++;
        if (result.done) break;
        await page.waitForTimeout(150);
    }
    await waitForScene(page, 'VictoryScene');
    await page.waitForTimeout(1650);
    await page.keyboard.press('Space');
    await waterReady(page);
    return answers;
}

test('menu preview: touch, real combat, puzzle, chest idempotence and unchanged real save', async ({ page }) => {
    await openSeededGame(page);
    await page.waitForTimeout(150);
    const original = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await tap(page, 1060, 650);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui?.modal, WORLD);
    await tap(page, 960, 510);
    await waterReady(page);
    await tap(page, 975, 364); // Forward exit must remain gated.
    expect((await snapshot(page)).progress.roomId).toBe('sp_shallows');
    await solveChest(page);
    const chest = await snapshot(page);
    expect(chest.partyX).toBeCloseTo(400);
    await tap(page, 480, 555);
    await page.waitForTimeout(600);
    expect((await snapshot(page)).player.coins).toEqual(chest.player.coins);
    await startFish(page);
    expect(await winWithAnswers(page)).toBeGreaterThan(0);
    expect((await snapshot(page)).progress.defeatedEncounters).toEqual(['silverpond-shallows-guardian']);
    expect((await snapshot(page)).partyX).toBeCloseTo(845);
    await tap(page, 975, 364);
    await waterReady(page, 'sp_bell_hub');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'artifacts/underwater/bell-hub.png' });
    await tap(page, 658, 316);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui.modal, WORLD);
    await answerPearl(page, false);
    expect((await snapshot(page)).progress.bellNotes).toBe(0);
    for (let note = 1; note <= 3; note++) {
        await answerPearl(page, true);
        expect((await snapshot(page)).progress.bellNotes).toBe(note);
    }
    expect((await snapshot(page)).progress.puzzleAttempts).toBe(4);
    await page.evaluate(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.leaveToMenu(), WORLD);
    await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(original);
});

const story = { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true };

test('production co-op: guest protection, per-player learning and persistent room/chest/puzzle progress', async ({ page }) => {
    await openSeededGame(page, true, {}, {}, { storyProgress: story }, { storyProgress: { ...story, hasWaterBreathingScale: false } });
    await activateCoopSession(page, 'SilverpondTownMockScene');
    await page.evaluate(name => {
        const source = (globalThis as any)[name].scene.getScenes(true).at(-1);
        source.scene.start('UnderwaterRoomScene', { fromSurface: true });
    }, WORLD);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui?.modal, WORLD);
    await tap(page, 960, 510);
    await waterReady(page);
    expect((await snapshot(page)).partyCount).toBe(2);
    await solveChest(page);
    await startFish(page);
    await page.evaluate(name => (globalThis as any)[name].scene.keys.BattleScene.debugInstantWin(), WORLD);
    await waitForScene(page, 'VictoryScene');
    await page.waitForTimeout(1650);
    await page.keyboard.press('Space');
    await waterReady(page);
    await tap(page, 975, 364);
    await waterReady(page, 'sp_bell_hub');
    await tap(page, 658, 316);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui.modal, WORLD);
    await answerPearl(page, true);
    expect(await page.evaluate(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui.modal.getByName('activePuzzleSolver').getData('solverId'), WORLD)).toBe('B');
    await answerPearl(page, true);
    await tap(page, 1060, 165);
    const slots = await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!)));
    for (const slot of slots) {
        expect(slot.player.underwaterProgress).toMatchObject({ roomId: 'sp_bell_hub', bellNotes: 2, openedChests: ['shallows-chest'] });
        const attempts = Object.values(slot.mathStats.masteryData.problemRecords).flatMap((r: any) => r.attempts).filter((a: any) => a.context === 'underwater_bell');
        expect(attempts).toHaveLength(0);
        expect(slot.player.puzzleProgress.results.bell.attempts).toHaveLength(1);
    }
    expect(slots[1].player.storyProgress.hasWaterBreathingScale).toBe(false);
    // Preserve snapshots across a reload (the shared arena harness seeds at each navigation).
    await page.addInitScript(saves => saves.forEach((save, i) => localStorage.setItem(`littleMathAdventure_slot_${i}`, JSON.stringify(save))), slots);
    await page.reload();
    await waitForScene(page, 'MenuScene');
    await page.evaluate(name => (globalThis as any)[name].scene.keys.MenuScene.scene.start('UnderwaterRoomScene'), WORLD);
    await waterReady(page, 'sp_bell_hub');
    expect((await snapshot(page)).progress.bellNotes).toBe(2);
    expect((await snapshot(page)).partyCount).toBe(1);
});

test('losing a production fight recovers in the shallows without replaying looted chests', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { storyProgress: story });
    await page.evaluate(name => (globalThis as any)[name].scene.keys.MenuScene.scene.start('UnderwaterRoomScene', { fromSurface: true }), WORLD);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui?.modal, WORLD);
    await tap(page, 960, 510);
    await waterReady(page);
    await solveChest(page);
    await startFish(page);
    await page.evaluate(name => (globalThis as any)[name].scene.keys.BattleScene.onDefeat(), WORLD);
    await waterReady(page);
    const state = await snapshot(page);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.progress.openedChests).toEqual(['shallows-chest']);
    expect(state.progress.defeatedEncounters).toEqual([]);
});

test('repair and hints advance the mechanism without manufacturing independent correct answers', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { storyProgress: story, coins: { copper: 5, silver: 0, gold: 0, pouch: 0 } });
    await page.evaluate(name => (globalThis as any)[name].scene.keys.MenuScene.scene.start('UnderwaterRoomScene', { roomId: 'sp_bell_hub' }), WORLD);
    await page.waitForFunction(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.ui?.buttons.some((b: any) => b.root.name === 'iconDiveHost'), WORLD);
    await tap(page, 960, 510);
    await waterReady(page);
    await page.evaluate(name => (globalThis as any)[name].scene.keys.UnderwaterRoomScene.scene.restart({ roomId: 'sp_bell_hub' }), WORLD);
    await waterReady(page, 'sp_bell_hub');
    await tap(page, 658, 316);
    const attempts = () => page.evaluate(() => {
        const save = JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!);
        return save.player.puzzleProgress?.results.bell?.attempts ?? [];
    });
    await answerPearl(page, false);
    expect(await attempts()).toHaveLength(1);
    await answerPearl(page, true);
    expect(await attempts()).toHaveLength(1);
    expect((await snapshot(page)).progress.bellNotes).toBe(1);
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.events.emit('update', 0, 30000); });
    await tap(page, 840, 169);
    await answerPearl(page, true);
    expect(await attempts()).toHaveLength(2);
    expect((await attempts())[1]).toMatchObject({firstCorrect:true,assisted:true});
    expect((await snapshot(page)).progress).toMatchObject({ bellNotes: 2, assistedPuzzleAttempts: 1 });
    await tap(page, 1060, 165);
});

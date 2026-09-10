import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap, solveOpenChest } from './hands-on-helpers';
import rooms from '../../public/assets/data/underwater-rooms.json';

const story = { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true };
const garden = 'sp_reed_garden', canal = 'sp_sunken_canal';
const seedProgress = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_bell_hub', entryId: 'shallows',
    visitedRooms: ['sp_shallows', 'sp_bell_hub'], defeatedEncounters: ['silverpond-shallows-guardian'],
    openedChests: [], bellNotes: 3, puzzleAttempts: 3 };
const hero = { storyProgress: story, underwaterProgress: seedProgress, attack: 8, defense: 2, hp: 40, maxHp: 40,
    equippedWeapon: 'sword_iron', equippedShield: 'shield_iron', potions: 3 };

async function ready(page: Page, roomId: string) {
    await page.waitForFunction(room => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.scene.isActive() && s.roomId === room && s.party.length > 0 && !s.transitioning && !s.revealing && !s.ui.modal;
    }, roomId, { timeout: 15_000 }).catch(async error => {
        const state = await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return { room: s.roomId, transitioning: s.transitioning, revealing: s.revealing,
                modal: Boolean(s.ui.modal), progress: s.progress(), position: s.party[0]?.x };
        });
        throw new Error(`Room ${roomId} did not become ready: ${JSON.stringify(state)}; ${error}`);
    });
    // Let Phaser refresh pointer targets after the arrival/reveal animation's final frame.
    await page.waitForTimeout(500);
}
async function hostTap(page: Page, id: string, puzzle = false) {
    const point = await page.evaluate(({ id, puzzle }) => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = (puzzle ? s.currentPuzzle.builder : s.builder).get(id); return { x: h.x, y: h.y };
    }, { id, puzzle });
    await tap(page, point.x, point.y);
}
async function start(page: Page, coop = false) {
    await openSeededGame(page, coop, {}, {}, hero);
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await ready(page, 'sp_bell_hub');
}
async function saves(page: Page) {
    return page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
}
async function reloadSave(page: Page, roomId: string) {
    await page.addInitScript(saved => saved.forEach((save, i) => localStorage.setItem(`littleMathAdventure_slot_${i}`, JSON.stringify(save))), await saves(page));
    await page.reload(); await waitForScene(page, 'MenuScene');
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await ready(page, roomId);
}
async function fight(page: Page, room: string, prefix: string) {
    await hostTap(page, 'guardianHost'); await waitForScene(page, 'BattleScene');
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${prefix}-battle.png` });
    let answers = 0;
    // Real co-op combat can require 100+ answers; renderer/load timing is not a game rule.
    const until = Date.now() + 120_000;
    while (Date.now() < until) {
        const state = await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (!b.scene.isActive()) return { done: true };
            b.time.timeScale = 5; b.tweens.timeScale = 5;
            const board = b.mathBoard, row = board.problemRows[board.currentProblemIndex];
            if (board.getContainer().visible && row && !row.solved) {
                board.submitChoice(row.problem.choices.indexOf(row.problem.answer)); return { answer: true };
            }
            if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) b.onAttackClicked();
            return {};
        });
        if (state.answer) answers++;
        if (state.done) break;
        await page.waitForTimeout(130);
    }
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.getScenes(true).map((s: any) => s.scene.key)), `Combat ended after ${answers} answers`).toContain('VictoryScene');
    await page.waitForTimeout(1650); await page.keyboard.press('Space'); await ready(page, room);
    expect(answers).toBeGreaterThan(5);
    return answers;
}
async function currentPlan(page: Page, correct: boolean) {
    const plan = await page.evaluate(correct => {
        const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle;
        const c = p.challenge;
        return { clear: p.selected.flatMap((v: number | null, i: number) => v === null ? [] : [i]),
            cards: correct ? c.solutions[0] : c.cards.flatMap((_: number, a: number) => c.cards.flatMap((__: number, b: number) =>
                c.cards.map((___: number, d: number) => [a, b, d])))
                .find((v: number[]) => new Set(v).size === 3 && !c.solutions.some((s: number[]) => s.every((n, i) => n === v[i]))) };
    }, correct);
    for (const i of plan.clear) await hostTap(page, `currentStep${i}Host`, true);
    for (const i of plan.cards) await hostTap(page, `currentCard${i}Host`, true);
    await hostTap(page, 'iconCurrentRunHost', true);
}
async function mechanism(page: Page, room: string, prefix: string) {
    await hostTap(page, 'mechanismHost');
    if (room === garden) {
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle);
        await hostTap(page, 'iconCurrentRunHost', true); // Incomplete is not an attempt.
        expect((await saves(page))[0].player.underwaterProgress.mechanismAttempts?.['garden-current']).toBeUndefined();
        await currentPlan(page, false);
        await page.screenshot({ path: `${prefix}-wrong-plan.png` });
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle?.phase === 'building');
        // Real hint delays are covered by underwater-interactions; this test covers branch rewards.
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.events.emit('update', 0, 30000));
        await hostTap(page, 'iconCurrentHintHost', true);
        await hostTap(page, 'iconCurrentHintHost', true);
        await currentPlan(page, true);
        await page.screenshot({ path: `${prefix}-correct-plan.png` });
    } else {
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle);
        const turns = await page.evaluate(() => {
            const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle;
            return p.selected.map((n: number, i: number) => ({
                count: (p.challenge.solution[i] - n + 4) % 4, x: p.builder.get(`pumpRotor${i}Host`).x, y: p.builder.get(`pumpRotor${i}Host`).y }));
        });
        for (const t of turns) for (let i = 0; i < t.count; i++) { await tap(page, t.x, t.y); await page.waitForTimeout(240); }
        await page.screenshot({ path: `${prefix}-valves.png` });
        await tap(page, 1060, 550);
    }
    const id = room === garden ? 'garden-current' : 'canal-pump';
    await page.waitForFunction(id => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().restoredMechanisms?.includes(id), id);
    await ready(page, room);
    await page.screenshot({ path: `${prefix}-restored.png` });
    if (room === canal) {
        await hostTap(page, 'chestHost');
        await solveOpenChest(page);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().openedChests.includes('canal-cache'));
    }
    const previous = await saves(page);
    await hostTap(page, 'mechanismHost');
    await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return Boolean(s.currentPuzzle || s.pumpPuzzle);
    });
    await tap(page, 1060, 165); // Restored mechanisms can be replayed, without repeat rewards.
    if (room === canal) await hostTap(page, 'chestHost');
    await page.waitForTimeout(500);
    const now = await saves(page);
    now.forEach((save, i) => {
        expect(save.player.mana).toBe(previous[i].player.mana);
        expect(save.player.coins).toEqual(previous[i].player.coins);
    });
}

for (const first of [garden, canal]) test(`two real fights, either-order loop, application and saved rewards: ${first} first`, async ({ page }) => {
    test.setTimeout(210_000);
    await start(page);
    const prefix = `artifacts/underwater/branches-${first}`;
    await hostTap(page, first === garden ? 'exitGardenHost' : 'branchRightHost'); await ready(page, first);
    await hostTap(page, 'mechanismHost');
    expect(await page.evaluate(() => Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal))).toBe(false);
    await hostTap(page, 'exitRightHost'); await ready(page, first); // Sealed until either mechanism is restored.
    if (first === canal) {
        await hostTap(page, 'chestHost');
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest);
        expect((await saves(page))[0].player.underwaterProgress.openedChests).toEqual([]);
        await tap(page, 1060, 165);
    }
    let answers = await fight(page, first, `${prefix}-first`);
    await reloadSave(page, first); // Victory persists before the mechanism is solved.
    expect(await page.evaluate(() => Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.guardianHotspot))).toBe(false);
    await mechanism(page, first, `${prefix}-first`);
    await reloadSave(page, first);
    const second = first === garden ? canal : garden;
    const crossWreck = async (target: string) => {
        await hostTap(page, 'exitRightHost'); await ready(page, 'sp_post_wreck');
        await hostTap(page, target === garden ? 'exitGardenHost' : 'exitCanalHost'); await ready(page, target);
    };
    await crossWreck(second);
    // A shortcut never traps the player on its still-unsolved side.
    await crossWreck(first);
    await crossWreck(second);
    answers += await fight(page, second, `${prefix}-second`);
    await mechanism(page, second, `${prefix}-second`);
    await hostTap(page, 'exitLeftHost'); await ready(page, 'sp_bell_hub');
    const save = (await saves(page))[0];
    expect(save.player.underwaterProgress.restoredMechanisms.sort()).toEqual(['canal-pump', 'garden-current']);
    expect(save.player.underwaterProgress.defeatedEncounters).toEqual(expect.arrayContaining([
        rooms.rooms.sp_reed_garden.encounter.id, rooms.rooms.sp_sunken_canal.encounter.id]));
    const attempts = Object.values(save.mathStats.masteryData.problemRecords).flatMap((r: any) => r.attempts).filter((a: any) => a.context.startsWith('battle'));
    expect(attempts.length).toBeGreaterThan(5);
    expect(save.player.underwaterProgress.mechanismAttempts['garden-current']).toEqual({ attempts: 2, assisted: 1 });
    console.log(`Branches ${first} first: ${answers} actual submitted combat answers; ${attempts.length} retained battle history entries`);
});

test('co-op branch battle records both players; pump and chest rewards persist independently', async ({ page }) => {
    test.setTimeout(190_000);
    await start(page, true);
    await hostTap(page, 'branchRightHost'); await ready(page, canal);
    await fight(page, canal, 'artifacts/underwater/branches-coop');
    await mechanism(page, canal, 'artifacts/underwater/branches-coop');
    for (const save of await saves(page)) {
        expect(save.player.underwaterProgress.restoredMechanisms).toContain('canal-pump');
        expect(save.player.underwaterProgress.openedChests).toContain('canal-cache');
        const attempts = Object.values(save.mathStats.masteryData.problemRecords).flatMap((r: any) => r.attempts).filter((a: any) => a.context.startsWith('battle'));
        expect(attempts.length).toBeGreaterThan(0);
        expect(save.mathStats.dailyAttempts).toBeGreaterThan(0);
    }
});

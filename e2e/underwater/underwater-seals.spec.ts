import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';

const shrine = 'sp_shell_shrine', chamber = 'sp_current_chamber';
const progress = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_bell_hub', entryId: 'shallows',
    visitedRooms: [], defeatedEncounters: ['silverpond-shallows-guardian', 'silverpond-garden-patrol', 'silverpond-canal-blockade'],
    openedChests: [], bellNotes: 3, puzzleAttempts: 3, restoredMechanisms: ['garden-current', 'canal-pump'] };
const hero = { hp: 40, maxHp: 40, attack: 8, defense: 2, equippedWeapon: 'sword_iron', equippedShield: 'shield_iron', potions: 3,
    coins: { copper: 8, silver: 0, gold: 0, pouch: 0 },
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true }, underwaterProgress: progress };

async function ready(page: Page, roomId: string) {
    await page.waitForFunction(roomId => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.scene.isActive() && s.roomId === roomId && s.party.length && !s.ui.modal && !s.transitioning && !s.revealing;
    }, roomId);
    await page.waitForTimeout(100);
}
async function hit(page: Page, id: string, puzzle?: 'reversePuzzle' | 'routingPuzzle') {
    if (id.includes('HintHost')) await page.waitForFunction(id => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.ui.modal.list.find((o: any) => o.name === id)?.getData('waterState') === 'normal';
    }, id, { timeout: 35_000 });
    const p = await page.evaluate(({ id, puzzle }) => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = (puzzle ? s[puzzle].builder : s.builder).get(id); return { x: h.x, y: h.y };
    }, { id, puzzle });
    await tap(page, p.x, p.y);
}
async function audit(page: Page) {
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
}
async function saves(page: Page) {
    return page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
}
async function start(page: Page, coop = false) {
    await openSeededGame(page, coop, {}, {}, hero, { ...hero, underwaterProgress: { ...progress,
        restoredMechanisms: [...progress.restoredMechanisms, 'shrine-memory'], mechanismStages: { 'shrine-memory': 3 } } });
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, 'sp_bell_hub');
}
async function reloadSave(page: Page, roomId: string) {
    await page.addInitScript(saved => saved.forEach((save, i) => localStorage.setItem(`littleMathAdventure_slot_${i}`, JSON.stringify(save))), await saves(page));
    await page.reload(); await waitForScene(page, 'MenuScene');
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, roomId);
}
async function solveReverse(page: Page, reload: boolean) {
    await hit(page, 'mechanismHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle);
    for (let stage = 0; stage < 3; stage++) {
        await page.waitForFunction(stage => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle?.challenge.stage === stage, stage);
        if (stage === 0) {
            await hit(page, 'reverseCard0Host', 'reversePuzzle');
            await hit(page, 'iconReverseRunHost', 'reversePuzzle');
            await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle.phase === 'building');
            await hit(page, 'iconReverseHintHost', 'reversePuzzle');
            await page.waitForTimeout(900); await audit(page);
            await hit(page, 'iconCloseHost', 'reversePuzzle'); // Close while inverse flow is moving.
            await page.waitForTimeout(1600);
            await hit(page, 'mechanismHost');
            await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle);
        }
        const choice = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle.challenge.answerIndex);
        await hit(page, `reverseCard${choice}Host`, 'reversePuzzle');
        await hit(page, 'iconReverseRunHost', 'reversePuzzle'); await audit(page);
        if (stage < 2) {
            await page.waitForFunction(stage => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle?.challenge.stage === stage + 1, stage);
            if (stage === 0 && reload) {
                await hit(page, 'iconCloseHost', 'reversePuzzle'); await reloadSave(page, shrine);
                expect((await saves(page))[0].player.underwaterProgress.mechanismStages['shrine-memory']).toBe(1);
                await hit(page, 'mechanismHost');
            }
        }
    }
    await ready(page, shrine);
}
async function fight(page: Page) {
    await hit(page, 'guardianHost'); await waitForScene(page, 'BattleScene');
    await page.waitForTimeout(650);
    await page.screenshot({ path: 'artifacts/underwater/seals-real-chamber-battle.png' });
    let answers = 0;
    const end = Date.now() + 150_000;
    while (Date.now() < end) {
        const status = await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (!b.scene.isActive()) return 'done';
            b.time.timeScale = b.tweens.timeScale = 5;
            const board = b.mathBoard, row = board.problemRows[board.currentProblemIndex];
            if (board.getContainer().visible && row && !row.solved) { board.submitChoice(row.problem.choices.indexOf(row.problem.answer)); return 'answer'; }
            if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) b.onAttackClicked();
            return '';
        });
        if (status === 'answer') answers++;
        if (status === 'done') break;
        await page.waitForTimeout(130);
    }
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.isActive('VictoryScene'))).toBe(true);
    expect(answers).toBeGreaterThan(5);
    console.log(`Chamber battle: ${answers} real submitted answers`);
    await page.waitForTimeout(1650); await page.keyboard.press('Space'); await ready(page, chamber);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBe(580);
}
async function solveRouting(page: Page) {
    await hit(page, 'mechanismHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle);
    await hit(page, 'iconRoutingRunHost', 'routingPuzzle'); // A complete but wrong initial plan is an attempt.
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle.phase === 'building');
    const changes = await page.evaluate(() => {
        const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle;
        return p.selected.flatMap((value: boolean, i: number) => value === p.challenge.solution[i] ? [] : [i]);
    });
    for (const i of changes) { await hit(page, `routingSwitch${i}Host`, 'routingPuzzle'); await page.waitForTimeout(250); }
    await audit(page); await hit(page, 'iconRoutingRunHost', 'routingPuzzle');
    await ready(page, chamber);
}

for (const [first, coop] of [[shrine, false], [chamber, false], [shrine, true]] as const) {
    test(`physical doorways, two seals, persistent stages, real fight: ${first}, coop ${coop}`, async ({ page }) => {
        test.setTimeout(270_000);
        await start(page, coop);
        for (const room of first === shrine ? [shrine, chamber] : [chamber, shrine]) {
            const parent = room === shrine ? 'sp_reed_garden' : 'sp_sunken_canal';
            await hit(page, room === shrine ? 'exitGardenHost' : 'branchRightHost'); await ready(page, parent);
            await hit(page, room === shrine ? 'exitShrineHost' : 'exitChamberHost'); await ready(page, room);
            // Entry is next to the matching LEFT opening, not a generic room spawn.
            expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.entryId)).toBe(room === shrine ? 'garden' : 'canal');
            expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBe(335);
            await page.screenshot({ path: `artifacts/underwater/seals-entry-${room}-${coop}.png` });
            if (room === chamber) { await hit(page, 'mechanismHost'); await ready(page, chamber); await fight(page); }
            const before = await saves(page);
            if (room === shrine) await solveReverse(page, !coop); else await solveRouting(page);
            const after = await saves(page);
            const id = room === shrine ? 'shrine-memory' : 'chamber-routes';
            after.forEach((save, i) => {
                expect(save.player.underwaterProgress.restoredMechanisms).toContain(id);
                const alreadyHad = before[i].player.underwaterProgress.restoredMechanisms.includes(id);
                expect(save.player.mana).toBe(before[i].player.mana + (alreadyHad ? 0 : 5));
                expect(save.mathStats.masteryData.globalSolveSequence).toBe(before[i].mathStats.masteryData.globalSolveSequence);
            });
            await hit(page, 'exitLeftHost'); await ready(page, parent);
            expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBe(room === shrine ? 650 : 890);
            await page.screenshot({ path: `artifacts/underwater/seals-return-${parent}-${coop}.png` });
            await hit(page, 'exitLeftHost'); await ready(page, 'sp_bell_hub');
        }
        for (const save of await saves(page)) {
            expect(save.player.underwaterProgress.restoredMechanisms).toEqual(expect.arrayContaining(['shrine-memory', 'chamber-routes']));
            expect(save.mathStats.dailyAttempts).toBeGreaterThan(0);
        }
        await page.screenshot({ path: `artifacts/underwater/seals-both-${first}-${coop}.png` });
    });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
    test(`seal puzzles Canvas tablet layout and animation cancellation ${viewport.width}x${viewport.height}`, async ({ page }) => {
        test.setTimeout(200_000);
        await page.setViewportSize(viewport);
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
                if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
                return (original as any).call(this, kind, ...args);
            } as typeof original;
        });
        await start(page);
        const prefix = `artifacts/underwater/seals-canvas-${viewport.width}x${viewport.height}`;
        await hit(page, 'exitGardenHost'); await ready(page, 'sp_reed_garden');
        await page.screenshot({ path: `${prefix}-garden-door.png` });
        await hit(page, 'exitShrineHost'); await ready(page, shrine);
        await page.screenshot({ path: `${prefix}-shrine.png` });
        await hit(page, 'mechanismHost'); await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle);
        await audit(page); await page.screenshot({ path: `${prefix}-reverse.png` });
        const box = (await page.locator('canvas').boundingBox())!;
        const xy = (x: number, y: number) => ({ x: box.x + x / 1280 * box.width, y: box.y + y / 720 * box.height });
        const from = xy(255, 527), to = xy(285, 335);
        await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle.selected)).toBe(0);
        await hit(page, 'iconReverseRunHost', 'reversePuzzle'); await audit(page);
        await page.screenshot({ path: `${prefix}-reverse-wrong.png` });
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle.phase === 'building');
        await hit(page, 'iconReverseHintHost', 'reversePuzzle'); await page.waitForTimeout(1600);
        await audit(page); await page.screenshot({ path: `${prefix}-inverse-hint.png` });
        await hit(page, 'iconCloseHost', 'reversePuzzle'); await page.waitForTimeout(750);
        await solveReverse(page, false);
        await hit(page, 'mechanismHost'); await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.reversePuzzle);
        // Restored puzzles replay voluntarily; close without resetting the earned seal.
        await hit(page, 'iconCloseHost', 'reversePuzzle');
        await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.progress().defeatedEncounters.push('silverpond-chamber-keepers'); s.scene.restart({ roomId: 'sp_current_chamber', entryId: 'canal' });
        });
        await ready(page, chamber); await hit(page, 'mechanismHost');
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle);
        await audit(page); await page.screenshot({ path: `${prefix}-routing.png` });
        await hit(page, 'routingSwitch0Host', 'routingPuzzle');
        await hit(page, 'iconCloseHost', 'routingPuzzle'); await page.waitForTimeout(600); // No tween touches destroyed art.
        await hit(page, 'mechanismHost'); await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.routingPuzzle);
        await hit(page, 'iconRoutingHintHost', 'routingPuzzle'); await page.waitForTimeout(1000);
        await audit(page); await page.screenshot({ path: `${prefix}-routing-flow.png` });
        await hit(page, 'iconCloseHost', 'routingPuzzle'); await page.waitForTimeout(1800);
        await solveRouting(page);
        await page.screenshot({ path: `${prefix}-current-seal.png` });
    });
}

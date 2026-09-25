import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap, solveOpenChest } from './hands-on-helpers';
import type { Page } from 'playwright/test';
import rooms from '../../public/assets/data/underwater-rooms.json';
import enemies from '../../public/assets/data/enemies.json';

const progress = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_post_wreck', entryId: 'garden',
    visitedRooms: [], defeatedEncounters: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
    restoredMechanisms: ['garden-current'] };
const hero = { storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    underwaterProgress: progress, attack: 8, defense: 2, hp: 55, maxHp: 55, equippedWeapon: 'sword_iron', equippedShield: 'shield_iron', potions: 3 };
async function ready(page: Page, id: string) {
    await page.waitForFunction(id => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.scene.isActive() && s.roomId === id && s.party.length && !s.transitioning && !s.ui.modal;
    }, id);
    await page.waitForTimeout(400);
}
async function hostTap(page: Page, id: string) {
    const p = await page.evaluate(id => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = s.builder.get(id); return { x: h.x, y: h.y };
    }, id); await tap(page, p.x, p.y);
}
for (const coop of [false, true]) test(`wreck corridor, real optional fight, two treasures and saved return: ${coop ? 'coop' : 'solo'}`, async ({ page }) => {
    test.setTimeout(210_000);
    await openSeededGame(page, coop, {}, {}, hero);
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await ready(page, 'sp_post_wreck');
    await hostTap(page, 'exitHoldHost'); await hostTap(page, 'chestHost');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.roomId)).toBe('sp_post_wreck');
    await hostTap(page, 'exitCanalHost'); await ready(page, 'sp_sunken_canal');
    await hostTap(page, 'exitRightHost'); await ready(page, 'sp_post_wreck');
    await hostTap(page, 'exitGardenHost'); await ready(page, 'sp_reed_garden');
    await hostTap(page, 'exitRightHost'); await ready(page, 'sp_post_wreck');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().defeatedEncounters)).toEqual([]);
    await hostTap(page, 'guardianHost'); await waitForScene(page, 'BattleScene');
    let answers = 0;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const state = await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (!b.scene.isActive()) return 'done';
            b.time.timeScale = 6; b.tweens.timeScale = 6;
            const board = b.mathBoard, row = board.problemRows[board.currentProblemIndex];
            if (board.getContainer().visible && row && !row.solved) { board.submitChoice(row.problem.choices.indexOf(row.problem.answer)); return 'answer'; }
            if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) b.onAttackClicked();
            return 'wait';
        });
        if (state === 'answer') answers++;
        if (state === 'done') break;
        await page.waitForTimeout(120);
    }
    await waitForScene(page, 'VictoryScene'); await page.waitForTimeout(1650);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.auditLayout())).toEqual([]);
    await page.screenshot({ path: `artifacts/underwater/wreck-${coop ? 'coop' : 'solo'}-victory.png` });
    await page.keyboard.press('Space'); await ready(page, 'sp_post_wreck');
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene; return s.party[0].x - s.builder.get('guardianHost').x; })).toBeCloseTo(0);
    await hostTap(page, 'chestHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().openedChests.includes('wreck-satchel'));
    await hostTap(page, 'exitHoldHost'); await ready(page, 'sp_wreck_hold');
    await hostTap(page, 'chestHost'); await solveOpenChest(page);
    const snapshots = await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
    for (const save of snapshots) {
        expect(save.player.underwaterProgress.openedChests).toEqual(expect.arrayContaining(['wreck-satchel', 'postal-strongbox']));
        expect(save.player.underwaterProgress.defeatedEncounters).toContain('silverpond-wreck-watch');
        expect(save.mathStats.dailyAttempts).toBeGreaterThan(0);
    }
    await hostTap(page, 'chestHost'); await page.waitForTimeout(250);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.coins)).toEqual(snapshots[0].player.coins);
    await page.addInitScript(saved => saved.forEach((s: any, i: number) => localStorage.setItem(`littleMathAdventure_slot_${i}`, JSON.stringify(s))), snapshots);
    await page.reload(); await waitForScene(page, 'MenuScene');
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await ready(page, 'sp_wreck_hold');
    const x = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x);
    expect(x).toBeCloseTo(snapshots[0].player.underwaterProgress.position.x);
    await hostTap(page, 'exitWreckHost'); await ready(page, 'sp_post_wreck');
    expect(await page.evaluate(() => Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.guardianHotspot))).toBe(false);
    expect(answers).toBeGreaterThan(5);
    console.log(`Wreck ${coop ? 'coop' : 'solo'}: ${answers} real combat answers`);
});

test('newly joined co-op guest shares a new chest, not the host historical battle or old loot', async ({ page }) => {
    test.setTimeout(90_000);
    const a = { ...hero, underwaterProgress: { ...progress, roomId: 'sp_wreck_hold', entryId: 'wreck', defeatedEncounters: ['silverpond-wreck-watch'], openedChests: ['wreck-satchel'] } };
    const b = { ...hero, underwaterProgress: { ...progress, defeatedEncounters: [], openedChests: [] } };
    await openSeededGame(page, true, {}, {}, a, b); await activateCoopSession(page, 'UnderwaterRoomScene');
    await ready(page, 'sp_wreck_hold'); await hostTap(page, 'chestHost'); await solveOpenChest(page);
    const saves = await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!)));
    for (const save of saves) expect(save.player.underwaterProgress.openedChests).toContain('postal-strongbox');
    expect(saves[1].player.underwaterProgress.openedChests).not.toContain('wreck-satchel');
    expect(saves[1].player.underwaterProgress.defeatedEncounters).toEqual([]);
    expect(saves[1].mathStats.dailyAttempts).toBe(0);
});

for (const viewport of [{ width: 1280, height: 720, canvas: false }, { width: 1024, height: 768, canvas: true }, { width: 1280, height: 800, canvas: true }]) {
    test(`enamel lock and complete victory states ${viewport.width}x${viewport.height}`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewport);
        if (viewport.canvas) await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
                return ['webgl', 'webgl2', 'experimental-webgl'].includes(kind) ? null : (original as any).call(this, kind, ...args);
            } as typeof original;
        });
        await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...progress, roomId: 'sp_wreck_hold', entryId: 'wreck', defeatedEncounters: ['silverpond-wreck-watch'] } });
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
        await ready(page, 'sp_wreck_hold');
        const prefix = `artifacts/underwater/enamel-${viewport.width}x${viewport.height}`;
        await page.screenshot({ path: `${prefix}-hold.png` });
        await hostTap(page, 'chestHost');
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest);
        const audit = async () => expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
        await audit(); await page.screenshot({ path: `${prefix}-lock-normal.png` });
        const b = (await page.locator('canvas').boundingBox())!;
        const move = (x: number, y: number) => page.mouse.move(b.x + x / 1280 * b.width, b.y + y / 720 * b.height);
        for (const [id, x, y] of [['unlock', 640, 552], ['close', 1060, 165], ['hint', 980, 525]] as const) {
            await move(x, y); await page.waitForTimeout(160); await audit(); await page.screenshot({ path: `${prefix}-${id}-hover.png` });
            await page.mouse.down(); await page.waitForTimeout(100); await page.screenshot({ path: `${prefix}-${id}-pressed.png` });
            await move(1150, 670); await page.mouse.up();
            await page.waitForTimeout(170); await audit(); await page.screenshot({ path: `${prefix}-${id}-out.png` });
        }
        await tap(page, 640, 552); await audit(); await page.screenshot({ path: `${prefix}-lock-wrong.png` });
        for (let i = 0; i < 5; i++) await tap(page, 980, 525);
        await page.waitForTimeout(1400); await audit(); await page.screenshot({ path: `${prefix}-lock-hinted-disabled.png` });
        await solveOpenChest(page, async () => {
            await audit(); await page.screenshot({ path: `${prefix}-lock-complete.png` });
        }); await ready(page, 'sp_wreck_hold');
        expect(await page.evaluate(async () => {
            const { wordPools } = await import('/src/systems/puzzles/WordPuzzles.ts');
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return wordPools.cipherWords.includes(s.player().puzzleProgress.active[`${s.roomId}:${s.room.chest.id}`]?.payload.word);
        })).toBe(true);
        const pet = enemies.find(e => e.id === 'silverpond_bubble_crab')!;
        await page.evaluate(pet => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.scene.start('VictoryScene', { returnScene: 'UnderwaterRoomScene', returnData: { roomId: 'sp_wreck_hold', entryId: 'wreck' },
                goldReward: 18, goldRewardA: 18, goldRewardB: 24, coopMode: true, playerAName: 'Alexandra Dlouhé Jméno', playerBName: 'Bartoloměj Druhý Hráč',
                arenaCompleted: true, nextArenaLevel: 2, cityArenaLevel: 1, nextCityArenaLevel: 2,
                crystalOverflow: true, unlockedPet: { name: pet.name, spriteKey: pet.spriteKey, animPrefix: pet.animPrefix },
                crystalDrops: Array.from({ length: 7 }, (_, i) => ({ tier: 'shard', value: i + 1 })),
                crystalLabels: Array.from({ length: 7 }, (_, i) => i % 2 ? 'Za bezchybný souboj!' : 'Za první dokončení vlny'),
            });
        }, pet);
        await waitForScene(page, 'VictoryScene');
        await page.screenshot({ path: `${prefix}-victory-disabled.png` });
        await page.waitForTimeout(1650);
        const vaudit = async () => expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.auditLayout())).toEqual([]);
        await vaudit(); await page.screenshot({ path: `${prefix}-victory-normal.png` });
        await move(640, 556); await page.waitForTimeout(160); await vaudit(); await page.screenshot({ path: `${prefix}-victory-hover.png` });
        await page.mouse.down(); await page.screenshot({ path: `${prefix}-victory-pressed.png` });
        await move(1180, 680); await page.mouse.up(); await vaudit();
        await tap(page, 1044, 397); await vaudit(); await page.screenshot({ path: `${prefix}-victory-page2.png` });
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.children.list
            .find((o: any) => o.name === 'victoryPageHost' && typeof o.text === 'string').text)).toBe('2/2');
        await tap(page, 640, 556); await ready(page, 'sp_wreck_hold');
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.start('VictoryScene', {
            returnScene: 'UnderwaterRoomScene', returnData: { roomId: 'sp_wreck_hold', entryId: 'wreck' },
            goldReward: 5, enemyName: 'Hlídka vraku', crystalDrops: [], crystalLabels: [], crystalOverflow: false,
        }));
        await waitForScene(page, 'VictoryScene'); await page.waitForTimeout(1600); await vaudit();
        await page.screenshot({ path: `${prefix}-victory-repeat.png` });
        await tap(page, 640, 556); await ready(page, 'sp_wreck_hold');
    });
}

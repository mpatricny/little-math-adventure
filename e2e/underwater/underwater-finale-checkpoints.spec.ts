import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';
import rooms from '../../public/assets/data/underwater-rooms.json';

const base = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_depth_gate', entryId: 'bell',
    visitedRooms: ['sp_bell_hub'], defeatedEncounters: ['silverpond-depth-watch'], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
    restoredMechanisms: ['garden-current', 'canal-pump', 'shrine-memory', 'chamber-routes'] };
const hero = { storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    attack: 8, defense: 2, hp: 55, maxHp: 55, equippedWeapon: 'sword_iron', equippedShield: 'shield_iron', potions: 3 };

test('all eleven room exits: idle, hover, pressed, out and locked', async ({ page }) => {
    test.setTimeout(140_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: base });
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await waitForScene(page, 'UnderwaterRoomScene');
    for (const [id, room] of Object.entries(rooms.rooms)) {
        await page.evaluate(id => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.scene.restart({ roomId: id, entryId: 'default' });
        }, id);
        await page.waitForFunction(id => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.roomId === id && s.party.length > 0 && !s.transitioning; }, id);
        await page.waitForTimeout(450);
        await page.screenshot({ path: `artifacts/underwater/finale-map-${id}-idle.png` });
        const h = await page.evaluate(host => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const o = s.builder.get(host); return { x: o.x, y: o.y }; }, room.exits[0].host);
        const b = (await page.locator('canvas').boundingBox())!;
        await page.mouse.move(b.x + b.width * h.x / 1280, b.y + b.height * h.y / 720);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `artifacts/underwater/finale-map-${id}-hover.png` });
        const alpha = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const r = s.exits[0].hotspot.root; return r.getData('waterHoverGlow').alpha; });
        expect(alpha).toBeGreaterThan(.5);
        await page.mouse.down(); await page.waitForTimeout(220);
        await page.screenshot({ path: `artifacts/underwater/finale-map-${id}-pressed.png` });
        await page.mouse.move(b.x + b.width / 2, b.y + b.height * .98); await page.mouse.up();
        await page.waitForTimeout(220);
        await page.screenshot({ path: `artifacts/underwater/finale-map-${id}-out.png` });
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.roomId)).toBe(id);
    }
});

test('interrupted descent, skip, defeat checkpoint and reloaded pending reward', async ({ page }) => {
    test.setTimeout(120_000);
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...base, restPoint: { roomId: 'sp_depth_gate', entryId: 'heart' } } });
    const enter = async () => {
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
        await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(700);
    };
    const retainSaves = async () => {
        const saved = await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')!);
        await page.addInitScript(saved => localStorage.setItem('littleMathAdventure_slot_0', saved), saved);
    };
    await enter(); await tap(page, 1052, 364); await waitForScene(page, 'UnderwaterDescentScene');
    await page.waitForTimeout(1400); await retainSaves(); await page.reload(); await waitForScene(page, 'MenuScene'); await enter();
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.roomId)).toBe('sp_depth_gate');
    await tap(page, 1052, 364); await waitForScene(page, 'UnderwaterDescentScene'); await page.waitForTimeout(800);
    await tap(page, 1030, 660); await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(800);
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { id: s.roomId, defeated: s.progress().defeatedEncounters, seen: s.progress().descentSeen }; }))
        .toEqual({ id: 'sp_lake_heart', defeated: ['silverpond-depth-watch'], seen: true });
    // Exercise the production defeat-return entry independently of combat balance.
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ battleLost: true }));
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.roomId)).toBe('sp_depth_gate');
});

for (const roomId of ['sp_glow_grotto', 'sp_depth_gate']) test(`real new guardian encounter: ${roomId}`, async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...base, roomId, defeatedEncounters: [] } });
    await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
    await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(700);
    const host = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = s.builder.get('guardianHost'); return { x: h.x, y: h.y }; });
    await tap(page, host.x, host.y); await waitForScene(page, 'BattleScene');
    let answers = 0;
    for (let i = 0; i < 800; i++) {
        const state = await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (!b.scene.isActive()) return 'done'; b.time.timeScale = 5; b.tweens.timeScale = 5;
            const board = b.mathBoard, row = board.problemRows[board.currentProblemIndex];
            if (board.getContainer().visible && row && !row.solved) { board.submitChoice(row.problem.choices.indexOf(row.problem.answer)); return 'answer'; }
            if (b.battleState.phase === 'player_turn') b.onAttackClicked(); return 'wait';
        });
        if (state === 'done') break; if (state === 'answer') answers++;
        await page.waitForTimeout(120);
    }
    await waitForScene(page, 'VictoryScene'); await page.waitForTimeout(1500); await page.keyboard.press('Space');
    await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(500);
    expect(answers).toBeGreaterThan(3);
    const snapshot = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { won: s.progress().defeatedEncounters.includes(s.room.encounter.id), x: s.party[0].x, target: s.builder.get('guardianHost').x }; });
    expect(snapshot.won).toBe(true); expect(snapshot.x).toBeCloseTo(snapshot.target);
});

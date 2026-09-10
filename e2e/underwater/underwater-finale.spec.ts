import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';
import type { Page } from 'playwright/test';

const progress = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_depth_gate', entryId: 'bell',
    visitedRooms: ['sp_bell_hub'], defeatedEncounters: ['silverpond-depth-watch', 'silverpond-grotto-keeper'], openedChests: [],
    bellNotes: 3, puzzleAttempts: 3, restoredMechanisms: ['shrine-memory', 'chamber-routes', 'grotto-light'] };
const hero = { storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    underwaterProgress: progress, attack: 8, defense: 2, hp: 55, maxHp: 55, equippedWeapon: 'sword_iron', equippedShield: 'shield_iron', potions: 3 };
async function ready(page: Page, roomId: string) {
    await page.waitForFunction(id => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.scene.isActive() && s.roomId === id && s.party.length && !s.transitioning && !s.revealing; }, roomId);
    await page.waitForTimeout(500);
}
async function hostTap(page: Page, id: string) {
    const p = await page.evaluate(id => { const h = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get(id);
        return { x: h.x, y: h.y }; }, id); await tap(page, p.x, p.y);
}
async function audit(page: Page) {
    expect(await page.evaluate(async () => {
        const { auditUnderwaterLayout } = await import('/src/ui/UnderwaterTheme.ts');
        const g = (globalThis as any).__LITTLE_MATH_GAME__;
        return auditUnderwaterLayout(g.scene.getScenes(true).at(-1));
    })).toEqual([]);
}

for (const coop of [false, true]) test(`continuous descent and three-phase guardian, ${coop ? 'coop' : 'solo'}`, async ({ page, runtimeErrors }) => {
    test.setTimeout(240_000);
    if (coop) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
                return ['webgl', 'webgl2', 'experimental-webgl'].includes(kind) ? null : (original as any).call(this, kind, ...args);
            } as typeof original;
        });
    }
    // The optional blessing must not gate victory: test co-op without it.
    const profile = coop ? { ...hero, underwaterProgress: { ...progress, restoredMechanisms: ['shrine-memory', 'chamber-routes'] } } : hero;
    await openSeededGame(page, coop, {}, {}, profile);
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, 'sp_depth_gate');
    await hostTap(page, 'restHost'); await page.waitForTimeout(1400);
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-gate.png` });
    await hostTap(page, 'exitHeartHost'); await waitForScene(page, 'UnderwaterDescentScene');
    await page.waitForTimeout(1800); await audit(page);
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-descent-top.png` });
    await page.waitForTimeout(6500);
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-descent-middle.png` });
    await page.waitForTimeout(6500);
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-descent-bottom.png` });
    await ready(page, 'sp_lake_heart');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().defeatedEncounters)).not.toContain('silverpond-depth-guardian');
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-heart.png` });
    await hostTap(page, 'guardianHost'); await waitForScene(page, 'BattleScene');
    await page.evaluate(() => {
        const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.__finishedAttacks = [];
        b.enemies[0].on('animationcomplete', (a: any) => {
            if (a.key.includes('depth-guardian-attack')) b.__finishedAttacks.push(a.key);
        });
    });
    await page.waitForTimeout(700); await audit(page);
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-battle.png` });
    const phases = new Set<number>(); let answers = 0;
    const until = Date.now() + 140_000;
    while (Date.now() < until) {
        expect(runtimeErrors).toEqual([]);
        const state = await page.evaluate(() => {
            const b = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            if (!b.scene.isActive()) return { done: true, phase: -1, answer: false };
            b.time.timeScale = 5; b.tweens.timeScale = 5;
            const board = b.mathBoard, row = board.problemRows[board.currentProblemIndex];
            let answer = false;
            if (board.getContainer().visible && row && !row.solved) { board.submitChoice(row.problem.choices.indexOf(row.problem.answer)); answer = true; }
            if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) b.onAttackClicked();
            return { done: false, phase: b.currentBossPhase, answer, overlay: Boolean(b.children.getByName('depthPhaseTransition')) };
        });
        if (state.done) break;
        if (!phases.has(state.phase) && state.overlay) {
            await page.waitForTimeout(90);
            await audit(page); await page.screenshot({ path: `artifacts/underwater/finale-${coop}-phase${state.phase}.png` });
        }
        phases.add(state.phase); if (state.answer) answers++;
        await page.waitForTimeout(120);
    }
    await waitForScene(page, 'VictoryScene'); await page.waitForTimeout(1600);
    expect([...phases].sort()).toEqual([0, 1, 2]); expect(answers).toBeGreaterThan(10);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.__finishedAttacks))
        .toEqual(expect.arrayContaining(['depth-guardian-attack', 'depth-guardian-attack-tide', 'depth-guardian-attack-crystal']));
    await page.keyboard.press('Space'); await ready(page, 'sp_lake_heart');
    expect(await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const guardian = s.children.getByName('friendlyDepthGuardian');
        const g = guardian.getBounds();
        return { freshVictory: s.entry.guardianFreed, animation: guardian.anims.currentAnim?.key,
            clear: s.party.every((actor: any) => g.bottom + 2 < actor.getBounds().top) };
    })).toEqual({ freshVictory: true, animation: 'depth-guardian-friendly-idle', clear: true });
    const pending = await page.evaluate(() => [0, 1].map(i => localStorage.getItem(`littleMathAdventure_slot_${i}`)));
    await page.addInitScript(saves => saves.forEach((saved, i) => { if (saved) localStorage.setItem(`littleMathAdventure_slot_${i}`, saved); }), pending);
    await page.reload(); await waitForScene(page, 'MenuScene');
    if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
    else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, 'sp_lake_heart');
    await page.screenshot({ path: `artifacts/underwater/finale-${coop}-freed.png` });
    await hostTap(page, 'depthCrystalHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().depthCrystalClaimed);
    await audit(page); await page.screenshot({ path: `artifacts/underwater/finale-${coop}-reward.png` });
    const saves = await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
    for (const save of saves) { expect(save.player.underwaterProgress.depthCrystalClaimed).toBe(true);
        expect(save.player.underwaterProgress.descentSeen).toBe(true); expect(save.mathStats.dailyAttempts).toBeGreaterThan(0); }
    console.log(`Finale ${coop ? 'coop' : 'solo'}: ${answers} real answers`);
});

for (const canvas of [false, true]) test(`grotto optical puzzle and vivid exits, ${canvas ? 'tablet Canvas' : 'desktop WebGL'}`, async ({ page }) => {
    test.setTimeout(100_000);
    if (canvas) { await page.setViewportSize({ width: 1024, height: 768 }); await page.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return ['webgl', 'webgl2', 'experimental-webgl'].includes(kind) ? null : (orig as any).call(this, kind, ...args);
        } as typeof orig;
    }); }
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...progress, roomId: 'sp_glow_grotto', entryId: 'canal', restoredMechanisms: [] } });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await ready(page, 'sp_glow_grotto');
    const prefix = `artifacts/underwater/finale-${canvas}`;
    await page.screenshot({ path: `${prefix}-grotto-normal.png` });
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 155 / 1280, box.y + box.height * 365 / 720);
    await page.waitForTimeout(300); await page.screenshot({ path: `${prefix}-door-hover.png` });
    await page.mouse.down(); await page.waitForTimeout(100); await page.screenshot({ path: `${prefix}-door-pressed.png` });
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .95); await page.mouse.up();
    await hostTap(page, 'mechanismHost');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.lightPuzzle);
    await audit(page); await page.screenshot({ path: `${prefix}-light-normal.png` });
    const mirror = await page.evaluate(() => {
        const m = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.lightPuzzle.mirrors[0];
        return { x: m.x, y: m.y };
    });
    for (const [name, x, y] of [['run', 640, 552], ['hint', 980, 525], ['close', 1060, 165], ['mirror', mirror.x, mirror.y]] as const) {
        await page.mouse.move(box.x + box.width * x / 1280, box.y + box.height * y / 720);
        await page.waitForTimeout(200); await audit(page);
        await page.screenshot({ path: `${prefix}-light-${name}-hover.png` });
        await page.mouse.down(); await page.waitForTimeout(120);
        await page.screenshot({ path: `${prefix}-light-${name}-pressed.png` });
        await page.mouse.move(box.x + box.width * .95, box.y + box.height * .93); await page.mouse.up();
        await page.waitForTimeout(200); await audit(page);
        await page.screenshot({ path: `${prefix}-light-${name}-out.png` });
    }
    await tap(page, 640, 552); await audit(page); await page.screenshot({ path: `${prefix}-light-wrong.png` });
    const steps = await page.evaluate(async () => {
        const { lightSolutions } = await import('/src/systems/UnderwaterLightPuzzle.ts');
        const s=(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene,p=s.lightPuzzle,c=s.activePuzzle.payload;
        const allowed=c.allowedTurns??[0,1,2,3],solution=lightSolutions(c)[0];
        return solution.map((value:number,i:number)=>({x:p.mirrors[i].x,y:p.mirrors[i].y,
            count:(allowed.indexOf(value)-allowed.indexOf(p.turns[i])+allowed.length)%allowed.length}));
    });
    for (const step of steps) for(let i=0;i<step.count;i++)await tap(page,step.x,step.y);
    await tap(page, 640, 552); await audit(page); await page.screenshot({ path: `${prefix}-light-solved.png` });
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().restoredMechanisms)).toContain('grotto-light');
});

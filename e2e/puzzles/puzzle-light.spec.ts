import { test, expect, openSeededGame } from '../arena/helpers/arena-harness';
import { tap } from '../underwater/hands-on-helpers';
import type { Page } from 'playwright/test';

const key = 'sp_glow_grotto:grotto-light';
async function openLight(page: Page) {
    await page.evaluate(() => {
        (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene');
    });
    await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s?.scene.isActive() && s.party.length && !s.transitioning && !s.revealing;
    });
    await page.waitForTimeout(500);
    const host = await page.evaluate(() => {
        const h = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('mechanismHost');
        return { x: h.x, y: h.y };
    });
    await tap(page, host.x, host.y);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.lightPuzzle);
}

for (const canvas of [false, true]) test(`four necessary mirrors, saved-board repair and real controls: ${canvas ? 'tablet Canvas' : 'desktop WebGL'}`, async ({ page }) => {
    const tier = canvas ? 3 : 1;
    if (canvas) {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
                return kind.includes('webgl') ? null : (original as any).call(this, kind, ...args);
            } as typeof original;
        });
    }
    // A real pre-fix save: only two mirrors lie on the useful route; stale angles
    // and hint state must not leak into its replacement. This context owns its saves.
    const old = { version: 1, family: 'light', startedAt: 123, completed: false, assisted: true,
        profile: { band: 'A', max: 5, subtraction: false, crossing: false, tier },
        payload: { width: 8, height: 4, source: { x: 0, y: 2 }, target: { x: 8, y: 0 }, direction: { x: 1, y: 0 },
            mirrors: [{ x: 2, y: 2 }, { x: 2, y: 0 }, { x: 4, y: 4 }, { x: 6, y: 3 }],
            lamps: [{ x: 3, y: 0 }, { x: 5, y: 0 }], initial: [0, 0, 0, 0] },
        state: { turns: [3, 3, 3, 3], assisted: true, revealed: 2 } };
    await openSeededGame(page, false, {}, {}, {
        mana: 20,
        storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
        puzzleProgress: { version: 1, active: { [key]: old }, results: { light: { tier, attempts: [] } } },
        underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_glow_grotto', entryId: 'canal',
            visitedRooms: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3,
            defeatedEncounters: ['silverpond-grotto-keeper'], restoredMechanisms: canvas ? ['grotto-light'] : [] },
    });
    await openLight(page);
    const prefix = `artifacts/puzzles/light-route-${canvas ? 'tablet-canvas' : 'desktop-webgl'}`;
    const inspect = () => page.evaluate(async () => {
        const { lightSolutions, traceUnderwaterLight } = await import('/src/systems/UnderwaterLightPuzzle.ts');
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const p = s.lightPuzzle, c = p.challenge;
        const solution = lightSolutions(c)[0];
        return { c, solution, turns: [...p.turns], assisted: p.assisted, state: s.activePuzzle.state,
            renderer: (globalThis as any).__LITTLE_MATH_GAME__.renderer.type,
            minChanges: solution.filter((v: number, i: number) => v !== p.turns[i]).length,
            trace: traceUnderwaterLight(p.turns, c), completed: s.activePuzzle.completed, mana: s.player().mana,
            restored: s.progress().restoredMechanisms,
            mirrors: p.mirrors.map((m: any) => ({ x: m.x, y: m.y })) };
    });
    const initial = await inspect();
    expect(initial.renderer).toBe(canvas ? 1 : 2);
    expect(initial.c.layoutVersion).toBe(2);
    expect(initial.minChanges).toBe(tier + 1);
    expect(initial.turns).toEqual(initial.c.initial);
    expect(initial.assisted).toBe(false);
    expect(initial.state.revealed).toBeUndefined();
    expect(initial.restored.includes('grotto-light')).toBe(canvas);
    await page.screenshot({ path: `${prefix}-normal.png` });

    const audit = async () => expect(await page.evaluate(async () => {
        const { auditUnderwaterLayout } = await import('/src/ui/UnderwaterTheme.ts');
        return auditUnderwaterLayout((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene);
    })).toEqual([]);
    await audit();
    const box = (await page.locator('canvas').boundingBox())!;
    const mirror = initial.mirrors[0];
    await page.mouse.move(box.x + mirror.x / 1280 * box.width, box.y + mirror.y / 720 * box.height);
    await page.screenshot({ path: `${prefix}-hover.png` });
    await page.mouse.down(); await page.screenshot({ path: `${prefix}-pressed.png` });
    await page.mouse.move(box.x + box.width * .95, box.y + box.height * .95); await page.mouse.up();
    await page.screenshot({ path: `${prefix}-pointer-out.png` });
    expect((await inspect()).turns).toEqual(initial.turns);

    // Correct exactly one distinct mirror through real pointer events, then submit.
    const turnMirror = async (index: number) => {
        const current = await inspect(), allowed = current.c.allowedTurns;
        const clicks = (allowed.indexOf(current.solution[index]) - allowed.indexOf(current.turns[index]) + allowed.length) % allowed.length;
        for (let i = 0; i < clicks; i++) await tap(page, current.mirrors[index].x, current.mirrors[index].y);
    };
    const firstWrong = initial.turns.findIndex((turn: number, i: number) => turn !== initial.solution[i]);
    await turnMirror(firstWrong);
    await tap(page, 640, 552);
    expect((await inspect()).completed).toBe(false);
    expect((await inspect()).trace.solved).toBe(false);
    await audit(); await page.screenshot({ path: `${prefix}-one-mirror-still-wrong.png` });

    const saved = await inspect();
    const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    await page.addInitScript(storage => { localStorage.clear(); Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v)); }, storage);
    await page.reload(); await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    await openLight(page);
    expect((await inspect()).c).toEqual(saved.c);
    expect((await inspect()).turns).toEqual(saved.turns);

    for (let i = 0; i < initial.mirrors.length; i++) await turnMirror(i);
    const aligned = await inspect();
    expect(aligned.trace.solved).toBe(true);
    expect(aligned.c.mirrors.every((m: any) => aligned.trace.points.some((p: any) => p.x === m.x && p.y === m.y))).toBe(true);
    await tap(page, 640, 552); await audit();
    await page.screenshot({ path: `${prefix}-solved.png` });
    const final = await inspect();
    expect(final.completed).toBe(true);
    expect(final.restored).toContain('grotto-light');
    if (canvas) expect(final.mana).toBe(initial.mana); // Previously earned blessing is not awarded twice.
    await tap(page, final.mirrors[0].x, final.mirrors[0].y);
    expect((await inspect()).turns).toEqual(final.turns);
    await page.screenshot({ path: `${prefix}-disabled.png` });
});

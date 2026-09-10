import { test, expect, openSeededGame } from '../arena/helpers/arena-harness';
import { fillBridgeGap } from './helpers/bridge-harness';
import type { Page } from 'playwright/test';

async function enterBridge(page: Page, roomId: string) {
    await page.evaluate(roomId => {
        const game = (globalThis as any).__LITTLE_MATH_GAME__;
        game.scene.getScenes(true).forEach((s: any) => game.scene.stop(s.scene.key));
        game.scene.start('ForestRiddleScene', { roomId });
    }, roomId);
    await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene;
        return s?.scene.isActive() && s.steppingStones.length === 2 && !s.cameras.main.fadeEffect.isRunning;
    });
    await page.waitForTimeout(250);
}

async function bridgeState(page: Page) {
    return page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene;
        const labels = s.sceneBuilder.get('Forest Riddle').getData('textObjects');
        const instruction = s.children.getByName('bridgeInstruction');
        return { payload: s.puzzleInstance.payload, solved: s.puzzleSolved, unlocked: s.bridgeUnlocked,
            fixed: [...labels.values()].map((entry: any) => entry.text.text),
            gaps: s.steppingStones.map((stone: any) => stone.currentValue),
            placed: s.floatingRocks.map((rock: any) => rock.placedInSlot),
            saved: s.puzzleInstance.state.placed, mana: s.gameState.getPlayer().mana,
            firstCorrect: s.puzzleInstance.firstCorrect,
            instruction: instruction ? { text: instruction.text,
                bounds: { x: instruction.getBounds().x, y: instruction.getBounds().y, width: instruction.getBounds().width },
                textureResolution: instruction.frame.source.resolution, styleResolution: instruction.style.resolution } : null };
    });
}

for (const canvas of [false, true]) test(`all seven bridge positions, two required stones and re-entry: ${canvas ? 'ancient tablet Canvas' : 'forest desktop WebGL'}`, async ({ page }) => {
    const roomId = canvas ? 'ancient_bridge' : 'forest_riddle';
    const full = canvas ? [4, 5, 6, 7, 8, 9, 10] : [1, 2, 1, 2, 1, 2, 1];
    const prefix = `artifacts/puzzles/bridge-two-${canvas ? 'tablet-canvas' : 'desktop-webgl'}`;
    if (canvas) {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
                return kind.includes('webgl') ? null : (original as any).call(this, kind, ...args);
            } as typeof original;
        });
    }
    await openSeededGame(page);
    await page.evaluate(async roomId => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
        const gs = GameStateManager.getInstance(); gs.beginUnderwaterPreview();
        const mastery = gs.getMasteryData();
        for (const band of ['A', 'B', 'C', 'D', 'E']) {
            mastery.bands[band].state = band === 'A' ? 'training' : 'locked';
            for (const n of [1, 2, 3, 4]) mastery.subAtoms[`${band}${n}`].state = band === 'A' && n === 1 ? 'training' : 'locked';
        }
        const journey = JourneySystem.getInstance(); journey.startRoomJourney('verdant_forest', roomId, true);
        // A cached pre-fix bridge must be replaced together with its obsolete one-gap selection.
        journey.getPuzzleStore()[`${roomId}:bridge`] = { version: 1, family: 'sequence', profile: {}, startedAt: 1,
            completed: false, assisted: false, state: { placed: [2] },
            payload: { full: [1, 2, 3], stoneDisplayValues: [1, 3, null, null, null],
                dropZoneConfig: [{ expectedValue: 2, sequenceIndex: 1, gap: 0 }], floatingRockValues: [1, 2, 3, 4, 5] } };
    }, roomId);
    await enterBridge(page, roomId);
    const repaired = await bridgeState(page);
    expect(repaired.payload.layoutVersion).toBe(2);
    expect(repaired.fixed).toHaveLength(5);
    expect(repaired.fixed.every((text: string) => /^\d+$/.test(text))).toBe(true);
    expect(repaired.gaps).toEqual([null, null]);
    expect(repaired.solved).toBe(false);

    // Exercise equal-valued answer rocks and the explicit beginner counting-to-ten exception.
    await page.evaluate(async ({ roomId, full }) => {
        const { bridgePool, bridgePuzzle } = await import('/src/systems/puzzles/PuzzleCatalog.ts');
        const { bandProfile } = await import('/src/systems/puzzles/PuzzleDifficulty.ts');
        const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
        const profile = { ...bandProfile('A', 1), subtraction: false }, pool = bridgePool(profile);
        const index = pool.findIndex(c => JSON.stringify(c.full) === JSON.stringify(full));
        if (index < 0) throw new Error('Required bridge pattern missing from production pool');
        const instance = JourneySystem.getInstance().getPuzzleStore()[`${roomId}:bridge`];
        instance.payload = bridgePuzzle(profile, () => (index + .5) / pool.length); instance.state = {};
    }, { roomId, full });
    await enterBridge(page, roomId);
    const initial = await bridgeState(page);
    expect(initial.payload.full).toEqual(full);
    expect(initial.fixed).toEqual([0, 2, 3, 4, 6].map(i => String(full[i])));
    expect(initial.instruction!.text).toContain('Doplň oba kameny.');
    expect(initial.instruction!.bounds.x).toBeGreaterThan(0);
    expect(initial.instruction!.bounds.x + initial.instruction!.bounds.width).toBeLessThan(1280);
    expect(initial.instruction!.bounds.y).toBeGreaterThan(110);
    expect(initial.instruction!.textureResolution).toBe(initial.instruction!.styleResolution);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(canvas ? 1 : 2);
    await page.screenshot({ path: `${prefix}-normal.png` });

    await fillBridgeGap(page, 0);
    const partial = await bridgeState(page);
    expect(partial.solved).toBe(false); expect(partial.unlocked).toBe(false);
    expect(partial.firstCorrect).toBeUndefined();
    expect(partial.gaps).toEqual([full[1], null]);
    await page.screenshot({ path: `${prefix}-one-filled.png` });
    await enterBridge(page, roomId);
    expect((await bridgeState(page)).payload).toEqual(initial.payload);
    expect((await bridgeState(page)).gaps).toEqual(partial.gaps);

    const wrong = initial.payload.floatingRockValues.find((n: number) => !initial.payload.answers.includes(n));
    await fillBridgeGap(page, 1, wrong);
    expect((await bridgeState(page)).firstCorrect).toBe(false);
    await page.screenshot({ path: `${prefix}-wrong.png` });
    await page.waitForTimeout(700);
    expect((await bridgeState(page)).gaps).toEqual([null, null]);
    expect((await bridgeState(page)).saved).toEqual([null, null]);
    await fillBridgeGap(page, 0); await fillBridgeGap(page, 1);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.puzzleSolved);
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.cameras.main.flashEffect.isRunning);
    const complete = await bridgeState(page);
    expect(complete.gaps).toEqual([full[1], full[5]]);
    expect(complete.placed.filter((slot: number | null) => slot !== null).sort()).toEqual([0, 1]);
    await page.screenshot({ path: `${prefix}-solved.png` });
    await enterBridge(page, roomId);
    const returned = await bridgeState(page);
    expect(returned.solved).toBe(true); expect(returned.unlocked).toBe(true);
    expect(returned.gaps).toEqual([full[1], full[5]]);
    expect(returned.fixed).toEqual(initial.fixed);
    expect(returned.mana).toBe(complete.mana);
    const rockPositions = await page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene;
        return [0, 1].map(i => {
            const gap = s.sceneBuilder.get(`bridgeGap${i}Host`);
            return s.children.list.filter((c: any) => c.type === 'Container' && c.getData('textObjects') && c.x === gap.x && c.y === gap.y).length;
        });
    });
    expect(rockPositions).toEqual([1, 1]);
    await page.screenshot({ path: `${prefix}-return.png` });
});

import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';
import type { Page } from 'playwright/test';

const hero = {
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
    underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_lake_heart', entryId: 'gate',
        visitedRooms: ['sp_lake_heart'], defeatedEncounters: ['silverpond-depth-guardian'], openedChests: [],
        bellNotes: 3, puzzleAttempts: 3, position: { roomId: 'sp_lake_heart', x: 838 } },
};

async function snapshot(page: Page) {
    return page.evaluate(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const guardian = s.children.getByName('friendlyDepthGuardian'), g = guardian.getBounds();
        const crystal = s.builder.get('depthCrystalHost');
        return { x: guardian.x, y: guardian.y, frame: guardian.frame.name, flipX: guardian.flipX,
            animation: guardian.anims.currentAnim?.key, playing: guardian.anims.isPlaying,
            uniform: guardian.scaleX === guardian.scaleY,
            clear: s.party.every((actor: any) => { const p = actor.getBounds();
                return g.bottom + 2 < p.top || g.right + 2 < p.left || g.left - 2 > p.right; }),
            crystalClear: g.right + 8 < crystal.x - crystal.width / 2,
            inView: g.left >= 0 && g.right <= 1280 && g.top >= 0 && g.bottom <= 720,
            targetX: s.builder.get('calmGuardianHost').x, targetY: s.builder.get('calmGuardianHost').y,
            leaderX: s.party[0].x, savedX: s.progress().position?.x,
        };
    });
}

function audit(state: Awaited<ReturnType<typeof snapshot>>) {
    expect(state.animation).toBe('depth-guardian-friendly-idle');
    expect(state.playing).toBe(true); expect(state.uniform).toBe(true);
    expect(state.clear).toBe(true); expect(state.crystalClear).toBe(true); expect(state.inView).toBe(true);
}

for (const mode of ['desktop', 'tablet', 'coop-tablet'] as const) test(`freed guardian leaves the player and crystal clear: ${mode}`, async ({ page }) => {
    test.setTimeout(90_000);
    const coop = mode === 'coop-tablet';
    await page.setViewportSize(mode === 'tablet' ? { width: 1024, height: 768 } : { width: 1280, height: coop ? 800 : 720 });
    if (mode !== 'desktop') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    await openSeededGame(page, coop, {}, {}, hero);
    const enter = async () => {
        if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
        else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
        await waitForScene(page, 'UnderwaterRoomScene');
        await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.party.length && !s.revealing && s.children.getByName('friendlyDepthGuardian'); });
    };
    await enter();
    // An old completed save keeps the exact player position and starts in friendly idle.
    const loaded = await snapshot(page); audit(loaded);
    expect(loaded.leaderX).toBe(838); expect(loaded.savedX).toBe(838);
    expect(loaded.flipX).toBe(true);
    expect(loaded.x).toBe(loaded.targetX); expect(loaded.y).toBe(loaded.targetY);
    await page.screenshot({ path: `artifacts/underwater/friendly-${mode}-loaded.png` });

    // Exercise the fresh-victory presentation, without changing the saved checkpoint.
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({
        roomId: 'sp_lake_heart', entryId: 'gate', resumeX: 838, guardianFreed: true }); });
    await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.entry.guardianFreed && s.children.getByName('friendlyDepthGuardian'); });
    const frames = new Set<string | number>(), positions = new Set<number>();
    for (let i = 0; i < 13; i++) {
        await page.waitForTimeout(260);
        const state = await snapshot(page); audit(state); frames.add(state.frame); positions.add(Math.round(state.x));
        expect(state.leaderX).toBe(838); expect(state.savedX).toBe(838);
        if (i === 2 || i === 12) await page.screenshot({ path: `artifacts/underwater/friendly-${mode}-${i === 2 ? 'departing' : 'resting'}.png` });
    }
    expect(frames.size).toBeGreaterThan(5); expect(positions.size).toBeGreaterThan(3);
    const settled = await snapshot(page); expect(settled.x).toBeCloseTo(settled.targetX); expect(settled.y).toBeCloseTo(settled.targetY);
    // Crossing directly below the guardian must not put either hero inside its art.
    await tap(page, settled.targetX, 630); await page.waitForTimeout(900); audit(await snapshot(page));
    await page.screenshot({ path: `artifacts/underwater/friendly-${mode}-swim-under.png` });
    await tap(page, settled.targetX - 170, 630); await page.waitForTimeout(1100);
    expect((await snapshot(page)).flipX).toBe(false);
    await page.screenshot({ path: `artifacts/underwater/friendly-${mode}-facing-left.png` });

    const crystal = await page.evaluate(() => { const h = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.builder.get('depthCrystalHost');
        return { x: h.x, y: h.y }; });
    await tap(page, crystal.x, crystal.y);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().depthCrystalClaimed);
    await page.screenshot({ path: `artifacts/underwater/friendly-${mode}-reward.png` });
    const saved = await page.evaluate(() => [0, 1].map(i => localStorage.getItem(`littleMathAdventure_slot_${i}`)));
    await page.addInitScript(saves => saves.forEach((save, i) => { if (save) localStorage.setItem(`littleMathAdventure_slot_${i}`, save); }), saved);
    await page.reload(); await waitForScene(page, 'MenuScene'); await enter();
    audit(await snapshot(page));
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { claimed: s.progress().depthCrystalClaimed, departure: Boolean(s.entry.guardianFreed) }; }))
        .toEqual({ claimed: true, departure: false });
});

import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/player-feedback/${name}.png` });
async function boot(page: Page, renderer: string, coop = false) {
    // These are isolated test saves. They must never reach the gameplay API.
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await openSeededGame(page, coop);
    await page.goto(`/?renderer=${renderer}`);
    await waitForScene(page, 'MenuScene');
    if (coop) await activateCoopSession(page);
}
async function startScene(page: Page, key: string, data = {}) {
    await page.evaluate(({ key, data }) => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.scene.getScenes(true).at(-1).scene.start(key, data);
    }, { key, data });
    await waitForScene(page, key);
}
async function clickHost(page: Page, key: string, id: string) {
    const point = await page.evaluate(({ key, id }) => {
        const h = (window as any).__LITTLE_MATH_GAME__.scene.keys[key].sceneBuilder.get(id);
        return { x: h.x, y: h.y };
    }, { key, id });
    const box = (await page.locator('canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
}

for (const renderer of ['canvas', 'webgl']) {
    test(`comparison statistics, readable exam progress and persistent doorway light: ${renderer}`, async ({ page }) => {
        await boot(page, renderer);
        await page.evaluate(async () => {
            const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
            const { createInitialComparisonChapterState, generateComparisonTrainingProblems, recordComparisonAttempt } = await import('/src/systems/ComparisonLearningSystem.ts');
            const m = GameStateManager.getInstance().getMasteryData();
            m.subAtoms.A2.state = 'fluent';
            const chapter = m.comparisonChapter = createInitialComparisonChapterState('training');
            let sequence = 0;
            for (let s = 0; s < 6; s++) {
                chapter.currentStageIndex = s;
                generateComparisonTrainingProblems(chapter, s === 5 ? 4 : 6).forEach((p, i) =>
                    recordComparisonAttempt(chapter, p, i !== 5, 2000 + i * 250, false, ++sequence));
            }
            chapter.currentStageIndex = 5;
            chapter.status = 'training';
            // Availability is covered by mastery tests; isolate the two visual states here.
            MasterySystem.getInstance().getAvailableExams = () => [{ type: 'fluency_challenge', targetId: 'A1', label: 'Plynulost A1' }];
        });
        await startScene(page, 'GuildScene');
        const info = () => page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            const panel = s.children.getByName('nextExamProgressPanel').getBounds();
            const labels = ['nextExamTitle', 'nextExamTarget', 'nextExamValue'].map(name => s.children.getByName(name));
            const glow = s.children.getByName('catacombDoorway');
            return { normal: glow.getData('waterGlow').alpha, hover: glow.getData('waterHoverGlow').alpha,
                labels: labels.map(t => ({ text: t.text, font: parseInt(t.style.fontSize), resolution: t.frame.source.resolution,
                    fits: panel.contains(t.getBounds().left, t.getBounds().top) && panel.contains(t.getBounds().right, t.getBounds().bottom) })) };
        });
        for (const [device, viewport] of Object.entries({ desktop: { width: 1280, height: 720 }, tablet: { width: 1024, height: 768 }, mobile: { width: 844, height: 390 } })) {
            await page.setViewportSize(viewport); await page.waitForTimeout(250);
            const state = await info();
            expect(state.normal).toBeGreaterThan(.8);
            expect(state.labels.every(t => t.fits && t.resolution === 2)).toBe(true);
            expect(state.labels[1].font).toBeGreaterThanOrEqual(26);
            await shot(page, `${renderer}-guild-${device}`);
        }
        await page.setViewportSize({ width: 1024, height: 768 });
        for (const [event, name, threshold] of [['pointerover', 'hover', .6], ['pointerdown', 'pressed', .8], ['pointerout', 'out', 0]] as const) {
            await page.evaluate(event => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.children.getByName('catacombDoorway').emit(event), event);
            await expect.poll(async () => (await info()).hover).toBe(threshold === 0 ? 0 : event === 'pointerdown' ? .9 : .65);
            const state = await info();
            expect(state.normal).toBeGreaterThan(.8);
            if (threshold) expect(state.hover).toBeGreaterThan(threshold); else expect(state.hover).toBe(0);
            await shot(page, `${renderer}-door-${name}`);
        }
        await page.evaluate(() => {
            const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay;
            o.expandedSubAtoms.add('comparison_symbols'); o.show();
            o.scrollPanel.setScrollOffset(o.scrollPanel.getContent().getByName('comparisonMapDetail').y - 12);
        });
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.container.alpha === 1);
        const detail = await page.evaluate(() => {
            const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay;
            const d = o.scrollPanel.getContent().getByName('comparisonMapDetail');
            return { stats: d.getData('statistics'), fits: d.list.filter(t => t.type === 'Text').every(t =>
                t.x - t.width * t.originX >= 0 && t.x + t.width * (1 - t.originX) < d.width && t.y + t.height < d.height && t.frame.source.resolution === 2) };
        });
        expect(detail.fits).toBe(true);
        expect(detail.stats).toMatchObject({ total: 34, correct: 29, wrong: 5, recentAccuracy: .85, medianMs: 2500 });
        await shot(page, `${renderer}-comparison-tablet`);
        await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(250);
        await shot(page, `${renderer}-comparison-mobile`);
        await page.evaluate(async () => {
            const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
            MasterySystem.getInstance().getAvailableExams = () => [];
        });
        await startScene(page, 'GuildScene');
        await page.waitForTimeout(250);
        expect((await info()).normal).toBeLessThan(.05);
        await shot(page, `${renderer}-door-disabled`);
        await clickHost(page, 'GuildScene', 'catacombDoorHost');
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('CatacombTrialScene'))).toBe(false);
    });

    test(`mana waits on floors, stops once and preserves wrong-answer feedback: ${renderer}`, async ({ page }) => {
        await boot(page, renderer);
        await startScene(page, 'ManaCollectionScene');
        await shot(page, `${renderer}-mana-demo`);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.introOverlay.getByName('manaIntroReward').alpha > 0,
            undefined, { timeout: 30000 });
        await shot(page, `${renderer}-mana-demo-success`);
        await clickHost(page, 'ManaCollectionScene', 'manaIntroPlayHost');
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA?.isGameActive);
        const samples = await page.evaluate(() => new Promise<number[]>(resolve => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene, l = s.laneA, ys: number[] = [];
            const tick = () => { ys.push(l.problemText.y); if (l.currentRow < 2) requestAnimationFrame(tick); else resolve(ys); }; tick();
        }));
        const rows = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.answerSlots.map(s => s.y));
        expect(samples.every(y => rows.includes(y))).toBe(true);
        expect(new Set(samples).size).toBeGreaterThanOrEqual(2);
        expect(new Set(samples).size).toBeLessThanOrEqual(4);
        await shot(page, `${renderer}-mana-floor`);
        // Stop on an actual correct answer floor via the production touch control.
        for (const correct of [true, false]) {
            await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.isResolving);
            await page.evaluate(correct => {
                const l = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA;
                l.stopRowTimer(); const slot = l.answerSlots.find(s => s.isCorrect === correct);
                l.currentRow = l.answerSlots.indexOf(slot) / 2; l.problemText.setY(slot.y); l.scheduleRowStep();
            }, correct);
            await clickHost(page, 'ManaCollectionScene', 'manaLanesoloButtonHost');
            const state = await page.evaluate(() => {
                const l = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA;
                return { correct: l.correctCount, wrong: l.wrongCount, timer: l.rowTimer === null, y: l.problemText.y };
            });
            expect(state).toMatchObject({ correct: 1, wrong: correct ? 0 : 1, timer: true });
            await shot(page, `${renderer}-mana-${correct ? 'correct' : 'wrong'}`);
            // A second tap during feedback cannot record another answer.
            await clickHost(page, 'ManaCollectionScene', 'manaLanesoloButtonHost');
            expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.problemCount)).toBe(correct ? 1 : 2);
            await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.isResolving);
        }
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.stopGame());
        const stopped = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.problemText.y);
        await page.waitForTimeout(1200);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.problemText.y)).toBe(stopped);
    });

    test(`first fox rescue stays at base strength, later win upgrades, defeat never upgrades: ${renderer}`, async ({ page }) => {
        await boot(page, renderer);
        const base = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.cache.json.get('pets').find(p => p.id === 'pet_catacomb_A').damageMultiplier);
        for (const win of [1, 2]) {
            await startScene(page, 'CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' });
            await clickHost(page, 'CatacombTrialScene', 'catacombPrimary');
            for (;;) {
                await page.waitForFunction(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
                    return s.phase === 'victory' || (s.phase === 'charging' && !s.mathBoard.answered); });
                const step = await page.evaluate(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
                    return { victory: s.phase === 'victory', choice: s.currentProblem.choices.indexOf(s.currentProblem.answer) + 1 }; });
                if (step.victory) break;
                await clickHost(page, 'CatacombTrialScene', `catacombAnswer${step.choice}`);
            }
            const reward = await page.evaluate(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
                s.onVictory(); s.onVictory();
                return { text: s.mathBoard.modal.list.find(o => o.name === 'catacombBody').text,
                    bonus: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxBonus ?? 0 }; });
            expect(reward).toEqual({ text: win === 1 ? `Síla ${base}` : `Útok +1\n${base} → ${base + 1}`, bonus: win - 1 });
            await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(200);
            await shot(page, `${renderer}-fox-win-${win}`);
        }
        await startScene(page, 'CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' });
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.onDefeat());
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxBonus)).toBe(1);
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        await page.reload(); await waitForScene(page, 'MenuScene');
        expect(await page.evaluate(async () => { const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            return GameStateManager.getInstance().getPlayer().catacombFoxBonus; })).toBe(1);
    });
}

test('co-op mana floor timers are independent', async ({ page }) => {
    await boot(page, 'webgl', true);
    await startScene(page, 'ManaCollectionScene');
    await clickHost(page, 'ManaCollectionScene', 'manaIntroPlayHost');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneB?.isGameActive);
    const before = await page.evaluate(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        s.laneA.stopGame(); return [s.laneA.currentRow, s.laneB.currentRow]; });
    await page.waitForFunction(row => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneB.currentRow > row,
        before[1], { timeout: 30000 });
    const after = await page.evaluate(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        return [s.laneA.currentRow, s.laneB.currentRow]; });
    expect(after[0]).toBe(before[0]); expect(after[1]).toBeGreaterThan(before[1]);
    await shot(page, 'coop-mana-independent');
});

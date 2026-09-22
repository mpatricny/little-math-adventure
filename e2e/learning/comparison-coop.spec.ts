import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const ready = (page: Page) => page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/comparison-coop/${name}.png` });

async function setup(page: Page, renderer: string, chapterB = false) {
    await page.setViewportSize({ width: renderer === 'canvas' ? 1024 : 1280, height: 800 });
    await openSeededGame(page, true, {}, {}, { equippedShield: 'shield_reinforced' });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await page.evaluate(async chapterB => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState, generateComparisonTrainingProblems, recordComparisonAttempt, applyComparisonExamResult } = await import('/src/systems/ComparisonLearningSystem.ts');
        const { ProblemDatabase } = await import('/src/systems/ProblemDatabase.ts');
        const g = GameStateManager.getInstance(), db = ProblemDatabase.getInstance();
        for (const [slot, band] of [[0, 'A'], [1, chapterB ? 'A' : 'E']] as const) {
            g.loadSlot(slot);
            const m = g.getMasteryData();
            m.selectedStartBand = band;
            m.bands[band].state = 'training';
            for (const num of [1, 2, 3, 4]) m.subAtoms[`${band}${num}`].state = 'secure';
            // A real completed chapter has learning history; empty synthetic
            // completions in band A are correctly reopened during save hydration.
            const chapter = m.comparisonChapter = createInitialComparisonChapterState('training');
            for (let stage = 0; stage < 6; stage++) {
                for (const problem of generateComparisonTrainingProblems(chapter, stage === 3 || stage === 5 ? 9 : 6)) {
                    recordComparisonAttempt(chapter, problem, true, 1000, false, chapter.attempts.length + 1);
                }
            }
            applyComparisonExamResult(chapter, 'bronze');
            if (slot === 1 && chapterB) {
                m.comparisonChapter = createInitialComparisonChapterState('training');
                m.comparisonChapter.currentStageIndex = 3;
                Object.assign(m.comparisonChapter.stages[3], { introSeen: true, introVersionSeen: 2, symbolAnswers: 0 });
            }
            const choose = (num: number, form: any) => db.getProblemsForForm(`${band}${num}`, form)[0].key;
            const compare = choose(band === 'A' ? 2 : 4, band === 'A' ? 'compare_equation_vs_number' : 'compare_equation_vs_equation');
            m.currentPool = [compare, choose(1, 'result_unknown'), choose(3, 'compare_equation_vs_number'), choose(2, 'missing_part'), ...Array(12).fill(compare)];
            m.currentPoolIndex = 0;
            g.save();
        }
        g.loadSlot(0);
    }, chapterB);
    await activateCoopSession(page);
    const controllerUrl = await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const { RemoteInputService } = await import('/src/remote/RemoteInputService.ts');
        const coop = CoopSessionManager.getInstance();
        while (coop.getSharedAttackCount() < 4) coop.recordCoopVictory();
        const remote = RemoteInputService.getInstance();
        await remote.startHostSession('ws://127.0.0.1:8876');
        (window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
        return remote.getControllerUrl()!;
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        // Keep the encounter alive through both players' attacks; retain its real
        // roster, attack sequence, shield callbacks and player switching.
        b.battleState.enemies.forEach((e: any) => e.hp = e.maxHp = 1000);
        const complete = b.mathBoard.originalOnComplete;
        (window as any).__coopCompletions = [];
        b.mathBoard.originalOnComplete = (...args: any[]) => {
            (window as any).__coopCompletions.push({ owner: b.coopSession.getActivePlayer(), context: b.mathBoardContext, args });
            complete(...args);
        };
    });
    const phone = await page.context().newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(controllerUrl);
    await expect(phone.getByRole('button', { name: 'ÚTOK', exact: true })).toBeVisible();
    return phone;
}

test('co-op switches from mixed arithmetic to the other player’s chapter and saves only their hints', async ({ page }) => {
    const phone = await setup(page, 'webgl', true);
    const chapterA = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).mathStats.masteryData.comparisonChapter);
    await phone.getByRole('button', { name: 'ÚTOK', exact: true }).click();
    for (let i = 0; i < 4; i++) {
        await page.waitForFunction(i => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex === i, i);
        await answer(page, phone);
    }
    await expect(phone.getByRole('button', { name: 'ÚTOK', exact: true })).toBeVisible();
    await phone.getByRole('button', { name: 'ÚTOK', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return [b.coopSession.getActivePlayer(), b.mathBoard.sequential, b.mathBoard.support.symbolAnswers,
            b.mathBoard.sequentialView.comparison.relation.list[0].name];
    })).toEqual(['B', true, 0, 'emptyComparisonSlot']);
    await expect(phone.locator('.remote-header p')).toHaveText('Borek');
    await expect(phone.locator('.remote-comparison-reminder').first()).toBeVisible();
    await shot(page, 'webgl-B-chapter-hints'); await shot(phone, 'webgl-B-chapter-phone-hints');
    const firstChoice = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard, p = b.problems[0];
        return p.choices.indexOf(p.answer);
    });
    await phone.locator('[data-layout="answers"] button').nth(firstChoice).click();
    for (let i = 1; i < 4; i++) {
        await page.waitForFunction(i => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex === i, i);
        await answer(page, phone);
    }
    await page.waitForFunction(() => (window as any).__coopCompletions.some((c: any) => c.owner === 'B' && c.context === 'attack'));
    const saved = await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.masteryData.comparisonChapter));
    expect(saved[0]).toEqual(chapterA);
    expect(saved[1].attempts.map((a: any) => [a.correct, a.assisted])).toEqual([[true, false], [true, false], [true, false], [true, false]]);
    expect(saved[1].stages[3].symbolAnswers).toBe(4);
    await phone.close();
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.masteryData.comparisonChapter))).toEqual(saved);
});

async function answer(page: Page, phone: Page, correct = true, quick = true) {
    await ready(page);
    await expect(phone.locator('#remote-controller-root')).toHaveAttribute('data-screen', 'math');
    const choice = await page.evaluate(({ correct, quick }) => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
        const p = b.problems[b.currentProblemIndex], index = p.choices.indexOf(p.answer);
        // Deterministic speed qualification, without replacing the real timers,
        // speed bar, damage calculation or command transport.
        b.activeTimeMs = quick ? 100 : 50000;
        return correct ? index : (index + 1) % 3;
    }, { correct, quick });
    await phone.locator('[data-layout="answers"] button').nth(choice).click();
    if (!correct) {
        await expect(phone.locator('#remote-controller-root')).toHaveAttribute('data-screen', 'feedback');
        await phone.getByRole('button', { name: 'Pokračovat', exact: true }).click();
    }
}

for (const renderer of ['canvas', 'webgl']) {
    test(`co-op mixed batches, real mobile answers, both shields and separate saves — ${renderer}`, async ({ page }) => {
        const phone = await setup(page, renderer);
        for (const [owner, band] of [['A', 'A'], ['B', 'E']] as const) {
            await expect(phone.getByRole('button', { name: 'ÚTOK', exact: true })).toBeVisible();
            await phone.getByRole('button', { name: 'ÚTOK', exact: true }).click();
            await ready(page);
            const state = await page.evaluate(() => {
                const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                return { owner: b.coopSession.getActivePlayer(), sequential: b.mathBoard.sequential,
                    rows: b.mathBoard.problemRows.length, keys: b.battleState.currentProblems.map((p: any) => p.masteryKey),
                    slots: b.mathBoard.problemRows.filter((r: any) => r.comparison).map((r: any) => r.comparison.relation.list[0].name),
                    label: b.coopTurnLabel.text };
            });
            expect(state.owner).toBe(owner); expect(state.sequential).toBe(false); expect(state.rows).toBe(4);
            expect(state.keys.every((k: string) => k.startsWith(band))).toBe(true);
            expect(state.slots).toEqual(['emptyComparisonSlot', 'emptyComparisonSlot']);
            expect(state.label).toContain(owner === 'A' ? 'Ada' : 'Borek');
            await expect(phone.locator('.remote-comparison-slot')).toBeVisible();
            await expect(phone.locator('.remote-header p')).toHaveText(owner === 'A' ? 'Ada' : 'Borek');
            await expect(phone.locator('.remote-comparison-answers button img')).toHaveCount(3);
            await shot(page, `${renderer}-${owner}-mixed`); await shot(phone, `${renderer}-${owner}-phone`);
            for (let i = 0; i < 4; i++) {
                await page.waitForFunction(i => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.currentProblemIndex === i, i);
                await answer(page, phone, !(owner === 'A' && i === 2), owner === 'A' || i === 0);
                if (i === 0) {
                    expect(await page.evaluate(() => {
                        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                        return [b.speedChargeBar.getCharges(), b.speedChargeBarB.getCharges()];
                    })).toEqual(owner === 'A' ? [2, 0] : [2, 2]);
                }
            }
            await page.waitForFunction(owner => (window as any).__coopCompletions.some((c: any) => c.owner === owner && c.context === 'attack'), owner);
        }
        const attackSummary = await page.evaluate(() => {
            const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            return { calls: (window as any).__coopCompletions.filter((c: any) => c.context === 'attack'),
                wrong: [b.coopSession.playerAWrongCount, b.coopSession.playerBWrongCount],
                charges: [b.speedChargeBar.getCharges(), b.speedChargeBarB.getCharges()] };
        });
        expect(attackSummary.calls.map((c: any) => [c.owner, c.args[1]])).toEqual([
            ['A', [true, true, false, true]], ['B', [true, true, true, true]],
        ]);
        expect(attackSummary.wrong).toEqual([1, 0]); expect(attackSummary.charges).toEqual([2, 2]);

        const enemyCount = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies.length);
        let expectedBHp = 20;
        for (const owner of ['A', 'B'] as const) {
            if (owner === 'B') {
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
                // Start the next enemy round to cover its alternating B target.
                await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.setPhase('enemy_turn'));
            }
            for (let i = 0; i < enemyCount; i++) {
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
                await ready(page);
                const shield = await page.evaluate(() => {
                    const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                    return { owner: b.coopSession.getActivePlayer(), target: b.currentEnemyAttackTarget,
                        slot: b.mathBoard.sequentialView.expression.relation.list[0].name, damage: b.pendingDamage };
                });
                expect(shield.owner).toBe(owner); expect(shield.target).toBe(owner); expect(shield.slot).toBe('emptyComparisonSlot');
                if (i === 0) await shot(page, `${renderer}-${owner}-shield`);
                const correct = owner === 'A' || i !== 0;
                if (!correct) expectedBHp -= shield.damage;
                await answer(page, phone, correct);
                await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.isBlockPhase);
                expect(await page.evaluate(() => {
                    const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                    return [b.battleState.playerHp, b.battleState.playerBHp, b.speedChargeBar.getCharges(), b.speedChargeBarB.getCharges()];
                })).toEqual([20, expectedBHp, 2, 2]);
            }
        }
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
        const saved = await page.evaluate(() => [0, 1].map(slot => {
            const s = JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!);
            return { attempts: s.mathStats.totalAttempts, correct: s.mathStats.correctAnswers,
                records: Object.values(s.mathStats.masteryData.problemRecords).flatMap((r: any) => r.attempts.map((a: any) => ({ key: r.problemKey, context: a.context, correct: a.correct }))) };
        }));
        for (let i = 0; i < 2; i++) {
            expect(saved[i].attempts).toBe(4 + enemyCount);
            expect(saved[i].correct).toBe(3 + enemyCount);
            expect(saved[i].records).toHaveLength(4 + enemyCount);
            expect(saved[i].records.every((r: any) => r.key.startsWith(i ? 'E' : 'A'))).toBe(true);
            expect(saved[i].records.filter((r: any) => r.context === 'battle_block')).toHaveLength(enemyCount);
        }
        await phone.close();
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        await page.reload(); await waitForScene(page, 'MenuScene');
        expect(await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.totalAttempts))).toEqual(saved.map(s => s.attempts));
    });
}

import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import type { Page } from 'playwright/test';

const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve =>
    (window as any).__LITTLE_MATH_GAME__.events.once('poststep', () => resolve())));
async function clickNamed(page: Page, name: string): Promise<void> {
    const point = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const find = (objects: any[]): any => {
            for (const object of objects) {
                if (object.visible === false) continue;
                if (object.name === name) return object;
                const child = object.list && find(object.list); if (child) return child;
            }
        };
        const object = find(scene.children.list); if (!object) throw new Error(`Missing control ${name}`);
        const p = object.getWorldTransformMatrix().transformPoint(0, 0); return { x: p.x, y: p.y };
    }, name);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720); await frame(page);
    await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}
async function readDay(page: Page) {
    return page.evaluate(() => {
        const overlay = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.dailyProgressOverlay;
        const root = overlay.contentRoot;
        const text = (name: string) => root.getByName(name)?.text;
        return { slot: overlay.getSelectedSlotIndex(), day: root.getData('day'), summary: root.getData('summary'),
            training: root.getData('training'), date: text('daily:date'), playTime: text('dailyPlayTime'),
            average: text('daily:averageValue'), total: text('daily:summaryAttempts'),
            previousEnabled: root.getByName('dailyWeekPrevious').input.enabled,
            nextEnabled: root.getByName('dailyWeekNext').input.enabled,
            todayEnabled: root.getByName('dailyToday').input.enabled };
    });
}
async function capture(page: Page, name: string): Promise<void> {
    const issues = await page.evaluate(() => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene;
        const issues: string[] = [];
        const visit = (object: any) => {
            if (object.visible === false || object.alpha === 0) return;
            if (object.texture?.key === '__MISSING') issues.push(`Missing texture: ${object.name}`);
            object.list?.forEach(visit);
        };
        scene.children.list.forEach(visit);
        const root = scene.dailyProgressOverlay?.contentRoot;
        root?.list.filter((object: any) => object.type === 'Text').forEach((text: any) => {
            const bounds = text.getBounds();
            if (bounds.left < 165 || bounds.right > 1115 || bounds.top < 158 || bounds.bottom > 590) {
                issues.push(`Text outside content: ${text.name || text.text}`);
            }
            if (text.style.resolution !== 2 || text.frame.source.resolution !== 2) issues.push(`Text resolution: ${text.name}`);
        });
        return issues;
    });
    expect(issues).toEqual([]);
    await page.screenshot({ path: `artifacts/daily-history-2026-11-17/${name}.png` });
}

async function seedHistory(page: Page): Promise<{ today: string; oldDate: string }> {
    return page.evaluate(async () => {
        const { createLearningProfileSnapshot } = await import('/src/systems/LearningProfileView.ts');
        const { DailyProgressSystem } = await import('/src/systems/DailyProgressSystem.ts');
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const today = new Date(); today.setHours(12, 0, 0, 0);
        const old = new Date(today); old.setDate(old.getDate() - 21);
        const todayKey = DailyProgressSystem.dateKey(today.getTime()), oldKey = DailyProgressSystem.dateKey(old.getTime());
        for (const slot of [0, 1]) {
            const save = JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!);
            const data = createLearningProfileSnapshot(slot, save.player, save.mathStats).stats.masteryData;
            const makeDay = (date: Date, count: number, correct: number) => Array.from({ length: count }, (_, index) => ({
                source: 'mastery' as const, problemKey: `isolated-history:${slot}:${date.getTime()}:${index}`,
                timestamp: date.getTime() + index * 1000, correct: index < correct,
                responseTimeMs: slot === 0 ? 4200 : 2800, subAtomId: slot === 0 ? 'B2' as const : 'A2' as const,
                form: 'result_unknown' as const,
            }));
            const archived = [...makeDay(old, slot === 0 ? 800 : 1170, slot === 0 ? 696 : 995),
                ...makeDay(today, slot === 0 ? 5 : 6, slot === 0 ? 3 : 5)];
            data.learningHistory = { version: 1, attempts: archived };
            const tail = archived.at(-1)!;
            data.problemRecords = { window: { problemKey: tail.problemKey, subAtomId: tail.subAtomId, form: tail.form,
                attempts: [{ timestamp: tail.timestamp, correct: tail.correct, responseTimeMs: tail.responseTimeMs,
                    context: 'battle', sequenceIndex: 1 }] } };
            data.comparisonChapter!.attempts = [];
            if (slot === 0) {
                data.selectedStartBand = 'B'; data.requiredBand = 'B';
                data.bands.B.state = 'training'; data.bands.C.state = 'secure'; data.bands.D.state = 'training';
                data.subAtoms.B1.state = 'secure'; data.subAtoms.B2.state = 'training'; data.subAtoms.D1.state = 'training';
                data.comparisonChapter!.status = 'complete';
            } else {
                data.subAtoms.A1.state = 'secure'; data.subAtoms.A2.state = 'secure';
                data.comparisonChapter!.status = 'training'; data.comparisonChapter!.currentStageIndex = 3;
            }
            save.mathStats.masteryData = data;
            // Deliberately unrelated legacy counters must never become CELKEM.
            save.mathStats.totalAttempts = 999999; save.mathStats.correctAnswers = 999998;
            save.player.level = 22;
            save.player.name = slot === 0 ? 'Anastázie-Dominika' : 'Borek';
            save.player.playTime = { version: 1, days: { [todayKey]: slot === 0 ? 75 * 60000 : 9 * 60000 } };
            localStorage.setItem(`littleMathAdventure_slot_${slot}`, JSON.stringify(save));
        }
        const state = GameStateManager.getInstance(); state.loadSlot(0);
        const coop = CoopSessionManager.getInstance(); coop.startSession(0, 1); coop.activatePlayerB();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.restart();
        return { today: todayKey, oldDate: oldKey };
    });
}

for (const renderer of ['webgl', 'canvas']) test(`dated personal history, measured play and answer average — ${renderer}`, async ({ page }) => {
    if (renderer === 'canvas') await page.setViewportSize({ width: 1024, height: 768 });
    await openSeededGame(page, true);
    if (renderer === 'canvas') {
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene');
    }
    const dates = await seedHistory(page); await waitForScene(page, 'MenuScene');
    await clickNamed(page, 'btnContinueMedievalButton'); await waitForScene(page, 'MenuNewScene');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.content.getByName('hubSummaryTotal').text)).toBe('✎ 805');
    await capture(page, `hub-${renderer}`);
    await clickNamed(page, 'hubDay');
    expect(await readDay(page)).toMatchObject({ slot: 0, day: { date: dates.today, attempts: 5, correct: 3, averageResponseTimeMs: 4200 },
        summary: { attempts: 805, correct: 699 }, training: { range: '0–8', label: 'Odčítání' },
        playTime: '1 h 15 min', average: '4,2 s', total: '✎ 805', nextEnabled: false, todayEnabled: false });
    await capture(page, `today-${renderer}`);
    if (renderer === 'canvas') {
        await page.evaluate(() => {
            const game = (window as any).__LITTLE_MATH_GAME__; game.sound.mute = true;
            const words: { object: any; text: string }[] = [];
            const hideWords = (object: any) => {
                if (object.type === 'Text' && /\p{L}/u.test(object.text)) {
                    words.push({ object, text: object.text });
                    object.setText(object.text.replace(/[\p{L}\p{M}]+/gu, ''));
                }
                object.list?.forEach(hideWords);
            };
            hideWords(game.scene.keys.MenuNewScene.dailyProgressOverlay.container);
            (window as any).__dailyHiddenWords = words;
        });
        await capture(page, 'today-no-prose-canvas');
        await page.evaluate(() => (window as any).__dailyHiddenWords.forEach(({ object, text }: any) => object.setText(text)));
    }
    for (let week = 0; week < 3; week++) await clickNamed(page, 'dailyWeekPrevious');
    expect(await readDay(page)).toMatchObject({ slot: 0, day: { date: dates.oldDate, attempts: 800, correct: 696, playTimeMs: null },
        summary: { attempts: 805, correct: 699 }, training: { range: '0–8', label: 'Odčítání' },
        playTime: 'Neměřeno', average: '4,2 s', previousEnabled: false, todayEnabled: true });
    await capture(page, `old-day-${renderer}`);
    await clickNamed(page, 'learningProfileNext');
    expect(await readDay(page)).toMatchObject({ slot: 1, day: { date: dates.oldDate, attempts: 1170, correct: 995 },
        summary: { attempts: 1176, correct: 1000 }, training: { range: '0–5', label: 'Porovnávání' },
        playTime: 'Neměřeno', average: '2,8 s', total: '✎ 1176' });
    await capture(page, `other-player-${renderer}`);
    const emptyDay = await page.evaluate(oldDate => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.dailyProgressOverlay.contentRoot;
        return root.list.find((object: any) => object.name.startsWith('dailyHistory:') && object.getData('date') !== oldDate).name;
    }, dates.oldDate);
    await clickNamed(page, emptyDay);
    expect(await readDay(page)).toMatchObject({ day: { attempts: 0, playTimeMs: null }, playTime: 'Neměřeno', average: '—' });
    await capture(page, `empty-day-${renderer}`);
    await clickNamed(page, 'dailyToday');
    expect(await readDay(page)).toMatchObject({ slot: 1, day: { date: dates.today, attempts: 6, correct: 5 },
        playTime: '9 min', average: '2,8 s', nextEnabled: false, todayEnabled: false });
    const future = await page.evaluate(today => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuNewScene.dailyProgressOverlay.contentRoot;
        return root.list.filter((object: any) => object.name.startsWith('dailyHistory:') && object.getData('date') > today)
            .map((object: any) => ({ enabled: object.input.enabled }));
    }, dates.today);
    expect(future.every(day => !day.enabled)).toBe(true);
    await clickNamed(page, 'learningClose');
    expect(await page.evaluate(async () => {
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const c = CoopSessionManager.getInstance();
        return { active: c.isCoopActive(), owner: c.getActivePlayer(), slot: GameStateManager.getInstance().getActiveSlotIndex(),
            aHistory: c.getPlayerAMasteryData()!.learningHistory!.attempts.length,
            bHistory: c.getPlayerBMasteryData()!.learningHistory!.attempts.length };
    })).toEqual({ active: true, owner: 'B', slot: 1, aHistory: 805, bHistory: 1176 });
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.every(request => audit.intercepted.includes(request))).toBe(true);
});

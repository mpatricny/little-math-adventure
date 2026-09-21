import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

async function shot(page: Page, name: string) {
    await page.screenshot({ path: `artifacts/mana-qa/${name}.png` });
}

async function answer(page: Page, id: 'A' | 'B', correct = true) {
    await page.waitForFunction(id => {
        const lane = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene[`lane${id}`];
        return lane?.isGameActive && !lane.isResolving;
    }, id);
    await page.evaluate(({ id, correct }) => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        const lane = scene[`lane${id}`];
        lane.fallingTween?.pause();
        lane.problemText.y = lane.answerSlots.find((slot: any) => slot.isCorrect === correct).y;
        lane.resolveButton.emit('pointerdown');
        lane.resolveButton.emit('pointerdown'); // One physical answer must count once.
    }, { id, correct });
}

for (const renderer of ['canvas', 'webgl']) {
    for (const coop of [false, true]) {
        test(`mana thresholds, named players, effects and saved results — ${renderer} ${coop ? 'coop' : 'solo'}`, async ({ page }) => {
            await page.setViewportSize({ width: renderer === 'canvas' ? 1024 : 1280, height: 800 });
            await openSeededGame(page, coop);
            if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
            await page.evaluate(async coop => {
                const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
                const state = GameStateManager.getInstance();
                state.getPlayer().name = 'Alžběta Marie'; state.getPlayer().mana = 7; state.save();
                if (coop) { state.loadSlot(1); state.getPlayer().name = 'Matěj'; state.getPlayer().mana = 11; state.save(); state.loadSlot(0); }
            }, coop);
            if (coop) await activateCoopSession(page);
            await page.evaluate(() => {
                const g = (window as any).__LITTLE_MATH_GAME__;
                g.scene.getScenes(true).at(-1).scene.start('ManaCollectionScene');
            });
            await waitForScene(page, 'ManaCollectionScene');
            await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.introOverlay
                ?.list.some((o: any) => o.name === 'manaIntroReward' && o.alpha === 1));
            await shot(page, `${renderer}-${coop ? 'coop' : 'solo'}-intro`);
            await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
                s.startGame();
                for (const lane of [s.laneA, s.laneB]) lane?.fallingTween?.pause();
                // Freeze newly generated falling problems, while retaining the real
                // resolve handlers, score updates, feedback timers and persistence.
                for (const lane of [s.laneA, s.laneB].filter(Boolean)) {
                    const next = lane.nextProblem.bind(lane);
                    lane.nextProblem = () => { next(); lane.fallingTween?.pause(); };
                }
            });
            expect(await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
                return [s.laneA.config.playerLabel, s.laneB?.config.playerLabel ?? null];
            })).toEqual(['Alžběta Marie', coop ? 'Matěj' : null]);
            expect(await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
                return [s.laneA, s.laneB].filter(Boolean).every(lane => lane.problemText.getBounds().y >= lane.config.channelTop
                    && (!s.isCoopMode || lane.nextProblemLabel.getBounds().y > lane.config.channelBottom));
            })).toBe(true);
            await shot(page, `${renderer}-${coop ? 'coop' : 'solo'}-playing`);

            const expected = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6];
            for (let correct = 1; correct <= 20; correct++) {
                const id = coop && correct > 5 ? 'B' : 'A';
                if (coop && correct === 6) {
                    // A has finished, but must still receive the shared mana earned by B.
                    for (let i = 0; i < 3; i++) await answer(page, 'A', false);
                    await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.laneA.isGameActive);
                    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.isGameOverVisible)).toBe(false);
                }
                await answer(page, id);
                const actual = await page.evaluate(() => {
                    const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
                    return { reward: [s.laneA.manaDisplayText.text, s.laneB?.manaDisplayText.text ?? null],
                        correct: s.laneA.correctCount + (s.laneB?.correctCount ?? 0),
                        effects: [s.laneA.rewardEffect?.getData('added') ?? 0, s.laneB?.rewardEffect?.getData('added') ?? 0] };
                });
                expect(actual.correct).toBe(correct);
                expect(actual.reward).toEqual([`${expected[correct]}`, coop ? `${expected[correct]}` : null]);
                if ([1, 3, 6, 10, 15, 20].includes(correct)) {
                    expect(actual.effects).toEqual([1, coop ? 1 : 0]);
                    if (correct === 1 || correct === 6) await shot(page, `${renderer}-${coop ? 'coop' : 'solo'}-gain-${correct}`);
                }
            }
            const finalLane = coop ? 'B' : 'A';
            for (let i = 0; i < 3; i++) await answer(page, finalLane, false);
            await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.isGameOverVisible);
            await shot(page, `${renderer}-${coop ? 'coop' : 'solo'}-results`);
            const results = await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
                const objects = s.gameOverOverlay.list;
                const texts = objects.filter((o: any) => o.type === 'Text');
                return { labels: Object.fromEntries(texts.map((o: any) => [o.name, o.text])),
                    resolutions: texts.every((o: any) => o.style.resolution === 2 && o.frame.source.resolution === 2),
                    boundsFit: texts.every((o: any) => { const r = o.getBounds(); return r.x >= 285 && r.right <= 995 && r.y >= 92 && r.bottom < 530; }),
                    mana: [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`) || 'null')?.player.mana ?? null),
                    icons: objects.filter((o: any) => o.texture?.key === 'mana-icon').map((o: any) => [o.displayWidth, o.displayHeight, o.scaleX === o.scaleY]),
                    cardsFit: (s.isCoopMode ? ['A', 'B'] : ['solo']).every((id: string) => {
                        const card = s.popupHost(`manaResult${id}CardHost`), safe = s.popupHost('manaResultsSafeHost');
                        return card.x - card.width / 2 >= safe.x - safe.width / 2 && card.x + card.width / 2 <= safe.x + safe.width / 2
                            && card.y - card.height / 2 >= safe.y - safe.height / 2 && card.y + card.height / 2 <= safe.y + safe.height / 2;
                    }),
                    oldFinishedVisible: Boolean(s.laneA.laneFinishedText?.visible || s.laneB?.laneFinishedText?.visible),
                    effectCount: s.children.list.filter((o: any) => o.name.startsWith('manaRewardGain-')).length };
            });
            const prefix = coop ? 'A' : 'solo';
            expect(results.labels[`manaResult${prefix}NameHost`]).toBe('Alžběta Marie');
            expect(results.labels[`manaResult${prefix}CorrectValueHost`]).toBe(coop ? '5' : '20');
            expect(results.labels[`manaResult${prefix}ManaValueHost`]).toBe('+6');
            if (coop) {
                expect(results.labels.manaResultBNameHost).toBe('Matěj');
                expect(results.labels.manaResultBCorrectValueHost).toBe('15');
                expect(results.labels.manaResultBManaValueHost).toBe('+6');
            }
            expect(results.resolutions).toBe(true); expect(results.boundsFit).toBe(true);
            expect(results.mana).toEqual([13, coop ? 17 : null]);
            expect(results.effectCount).toBe(0);
            expect(results.cardsFit).toBe(true); expect(results.oldFinishedVisible).toBe(false);
            expect(results.icons.every(([, h, uniform]: any) => h >= 100 && uniform)).toBe(true);
            // Repeated callbacks and a reload cannot grant the already shown reward twice.
            await page.evaluate(() => {
                (window as any).__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene.showGameOver();
                sessionStorage.setItem('lma-e2e-preserve-saves', 'true');
            });
            await page.reload(); await waitForScene(page, 'MenuScene');
            expect(await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`) || 'null')?.player.mana ?? null))).toEqual(results.mana);
        });
    }
}

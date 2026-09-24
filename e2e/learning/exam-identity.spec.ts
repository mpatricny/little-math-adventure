import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/exam-identity/${name}.png` });
async function tap(page: Page, id: string) {
    const point = await page.evaluate(id => {
        const h = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.sceneBuilder.get(id);
        return { x: h.x, y: h.y };
    }, id);
    const b = (await page.locator('canvas').boundingBox())!;
    await page.touchscreen.tap(b.x + point.x * b.width / 1280, b.y + point.y * b.height / 720);
}
async function offer(page: Page, targetId: string, type = 'sub_atom', key = 'GuildScene') {
    await page.evaluate(async ({ targetId, type, key }) => {
        const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
        MasterySystem.getInstance().getAvailableExams = () => targetId ? [{ targetId, type, label: `Internal ${targetId}` }] : [];
        const g = (window as any).__LITTLE_MATH_GAME__;
        g.scene.getScenes(true).at(-1).scene.start(key);
    }, { targetId, type, key });
    await waitForScene(page, key);
    await page.waitForFunction(({ key, targetId }) => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys[key];
        return s.currentMasteryExamTarget === (targetId || null) && !!s.children.getByName('challengeTitle');
    }, { key, targetId });
}

for (const renderer of ['canvas', 'webgl']) {
    test(`exam identity and unchanged first-answer flow: ${renderer}`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.route(/^http:\/\/127\.0\.0\.1:\d+\/v1\//, r => r.fulfill({status: 200, contentType: 'application/json', body: '{}'}));
        await openSeededGame(page);
        await page.goto(`/?renderer=${renderer}`);
        await waitForScene(page, 'MenuScene');
        await page.evaluate(async () => {
            const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            const { gameAudio } = await import('/src/audio/AudioDirector.ts');
            GameStateManager.getInstance().getMasteryData().subAtoms.A2.state = 'training';
            gameAudio().setVolume('music', 0); gameAudio().setVolume('voice', 0); gameAudio().setVolume('effects', 0);
        });
        await offer(page, 'A2');
        await page.setViewportSize({ width: 1280, height: 720 });
        await shot(page, `${renderer}-hall-desktop`);
        await page.setViewportSize({ width: 1024, height: 768 });
        await shot(page, `${renderer}-hall-tablet`);
        await tap(page, 'challengeActionHost');
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.overviewOverlay.visible);
        await shot(page, `${renderer}-overview-tablet`);
        for (const [event, name] of [['pointerover', 'hover'], ['pointerdown', 'pressed'], ['pointerout', 'out']]) {
            await page.evaluate(event => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.overviewStartButton.root.emit(event), event);
            await shot(page, `${renderer}-start-${name}`);
        }
        await tap(page, 'trialOverviewActionHost');
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.phase === 'problem');
        const active = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            const a = s.trialIdentityText, b = s.trialQuestionCounter;
            return { title: a.text, count: b.text, fits: a.getBounds().bottom < b.getBounds().top, total: s.trialState.totalProblems };
        });
        expect(active).toMatchObject({ title: 'Odčítání do 5', count: '1 / 8', fits: true, total: 8 });
        await shot(page, `${renderer}-active-tablet`);
        for (let index = 0; index < active.total; index++) {
            await page.waitForFunction(index => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
                return s.trialState.phase === 'problem' && s.trialState.currentProblemIndex === index;
            }, index);
            const choice = await page.evaluate(wrong => {
                const p = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.currentTrialProblem;
                return p.choices.findIndex(c => wrong ? c !== p.answer : c === p.answer) + 1;
            }, index === 0);
            await tap(page, `answerButton${choice}`);
            if (index === 0) {
                await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.trialState.phase === 'feedback');
                await shot(page, `${renderer}-wrong-tablet`);
                await tap(page, 'trialFeedbackActionHost');
            }
        }
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.resultsOverlay.visible);
        expect(await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            return { count: s.trialState.correctCount, wrong: s.trialState.wrongCount, title: s.resultsZyxText.text };
        })).toEqual({ count: 7, wrong: 1, title: 'Odčítání do 5' });
        await shot(page, `${renderer}-results-tablet`);

        for (const [target, type, title] of [
            ['A', 'band_gate', 'Počítání do 5'], ['A3', 'sub_atom', 'Tři čísla'],
            ['D1', 'sub_atom', 'Sčítání do 20'], ['E1', 'sub_atom', 'Sčítání přes 10'],
            ['E2', 'sub_atom', 'Odčítání přes 10'], ['comparison_symbols', 'comparison_chapter', 'Porovnávání'],
        ]) {
            await offer(page, target, type);
            const hall = await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
                return ['challengeKind', 'challengeTitle', 'challengePreview', 'challengeRequirement', 'nextExamTarget'].map(id => {
                    const t = s.children.getByName(id), h = s.sceneBuilder.getElementDef(`${id}Host`);
                    return { text: t.text, fits: t.width <= h.width && t.height <= h.height, resolution: t.frame.source.resolution };
                });
            });
            expect(hall[1].text).toBe(title);
            expect(hall.every(t => t.fits && t.resolution === 2)).toBe(true);
            await tap(page, 'challengeActionHost');
            const preview = await page.evaluate(() => {
                const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.overviewOverlay;
                const texts = ['identity', 'kind', 'dialog', 'desc'].map(id => o.getData(id));
                return texts.map(t => ({ text: t.text, bounds: {left:t.getBounds().left,right:t.getBounds().right,top:t.getBounds().top,bottom:t.getBounds().bottom}, resolution: t.frame.source.resolution }));
            });
            expect(preview[0].text).toBe(title);
            expect(preview.every(t => t.bounds.left >= 120 && t.bounds.right <= 1160 && t.bounds.top >= 80 && t.bounds.bottom <= 630 && t.resolution === 2)).toBe(true);
            expect(preview.map(t => t.text).join(' ')).not.toMatch(/\b[A-E][1-4]?\b/);
            await shot(page, `${renderer}-overview-${target}`);
            if (target === 'A') {
                await page.evaluate(() => {
                    const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.overviewOverlay;
                    for (const key of ['identity', 'kind', 'desc']) o.getData(key).setVisible(false);
                    const hideWords = (container: any) => container.list?.forEach((child: any) => {
                        if (child.type === 'Text' && /\p{L}/u.test(child.text)) child.setVisible(false);
                        if (child.list) hideWords(child);
                    });
                    hideWords(o);
                });
                await shot(page, `${renderer}-gate-no-prose`);
            }
        }
        await offer(page, 'A', 'band_gate', 'SilverpondGuildMockScene');
        await shot(page, `${renderer}-silverpond-gate`);
        await offer(page, '');
        await tap(page, 'challengeActionHost');
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.overviewOverlay.visible)).toBe(false);
        await shot(page, `${renderer}-hall-disabled`);
    });
}

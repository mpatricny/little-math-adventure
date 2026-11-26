import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import type { Page } from 'playwright/test';
import { measurePedestalMotion } from './helpers/pedestal-motion';
import { foxPanel } from './helpers/observatory';
import fs from 'node:fs/promises';
import path from 'node:path';

const turtle = 'pet_silverpond_mill_turtle';
test.use({ hasTouch: true });
const scene = 'FoxLessonScene';
async function frame(page: Page) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function pointTap(page: Page, p: {x: number; y: number}) {
    await frame(page);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + p.x * box.width / 1280, box.y + p.y * box.height / 720);
    await frame(page);
}
async function tap(page: Page, name: string) {
    const point = await page.evaluate(name => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const find = (o: any): any => o.visible === false || o.alpha === 0 ? null : o.name === name ? o : o.list?.map(find).find(Boolean);
        const o = s.children.list.map(find).find(Boolean);
        if (!o) throw Error('Missing control ' + name);
        const m = o.getWorldTransformMatrix(); return {x: m.tx, y: m.ty};
    }, name);
    await pointTap(page, point);
}
async function snapshot(page: Page, name: string, hideWords = false) {
    if (name.endsWith('-question')) await waitForPrompt(page);
    const missing = await page.evaluate(hide => {
        const game = (window as any).__LITTLE_MATH_GAME__, missing: string[] = [];
        game.sound.mute = true;
        const visit = (o: any) => {
            if (o.visible === false || o.alpha === 0) return;
            if (o.texture?.key === '__MISSING') missing.push(o.name || o.type);
            if (hide && o.getData?.('word')) o.setVisible(false);
            o.list?.forEach(visit);
        };
        game.scene.getScenes(true).forEach((s: any) => s.children.list.forEach(visit));
        return missing;
    }, hideWords);
    expect(missing).toEqual([]);
    await frame(page);
    await page.screenshot({path: `artifacts/catacomb-observatory-review/lessons/${name}.png`});
}
async function records(page: Page) {
    return page.evaluate(() => [0, 1].map(n => JSON.parse(localStorage.getItem('littleMathAdventure_slot_' + n)!)));
}
async function openGuild(page: Page, renderer: string, secondFox: Record<string, unknown> = {}, pinSecondMasteredModule = false, paceMs?: number) {
    const pets = { unlockedPets: ['catacomb_creature_A', 'silverpond_mill_turtle'], ownedPets: ['pet_catacomb_A', turtle], activePet: turtle, level: 12 };
    await openSeededGame(page, true, {}, {}, {...pets, name: 'Kitten', catacombFoxBonus: 4}, {...pets, name: 'Eli', catacombFoxBonus: 3, characterType: 'girl_knight', ...secondFox});
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer === 'canvas' ? 1 : 2);
    await page.evaluate(async ({pinSecondMasteredModule, paceMs}) => {
        const {GameStateManager} = await import('/src/systems/GameStateManager.ts');
        const {createInitialComparisonChapterState} = await import('/src/systems/ComparisonLearningSystem.ts');
        const state = GameStateManager.getInstance();
        for (const slot of [0, 1]) {
            if (!state.loadSlot(slot)) throw Error('Missing fixture slot');
            const data = state.getMasteryData()!;
            data.selectedStartBand = 'A'; data.practice = {mode: 'progress', pinnedTargetId: 'A1'};
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            for (const [id, band] of Object.entries(data.bands)) band.state = 'ABC'.includes(id) ? 'training' : 'locked';
            for (const [id, atom] of Object.entries(data.subAtoms)) atom.state = ['A', 'B', 'C'].includes(id[0]) ? 'training' : 'locked';
            const mastered = slot === 1 && pinSecondMasteredModule ? ['C1', 'C2'] as const : ['C1'] as const;
            for (const target of mastered) {
                const atom = data.subAtoms[target];
                atom.state = 'mastery'; atom.examBestMedal = 'gold';
                atom.fluencyChallengeResult = 'pass'; atom.masteryChallengeResult = 'pass';
            }
            if (slot === 1 && pinSecondMasteredModule) data.practice.pinnedTargetId = 'C2';
            if (slot === 1 && paceMs) data.learningHistory = {version: 1, attempts: Array.from({length: 20}, (_, i) => ({
                source: 'mastery', subAtomId: 'A1', form: 'result_unknown', problemKey: 'A1:2+3:result_unknown',
                responseTimeMs: paceMs, correct: true, timestamp: 1700000000000 + i * 6000,
            }))};
            state.save();
        }
        state.loadSlot(0);
    }, {pinSecondMasteredModule, paceMs});
    await activateCoopSession(page);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start('GuildScene'));
    await waitForScene(page, 'GuildScene');
}
async function waitForPrompt(page: Page) {
    await page.waitForFunction(() => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.round;
        return r?.board.getActiveProblemSnapshot() && r.board.getContainer().alpha >= .999;
    });
}
async function answer(page: Page, correct: boolean) {
    await waitForPrompt(page);
    const result = await page.evaluate(correct => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        const p = s.round.questions[s.answers.length];
        const index = p.choices.findIndex((n: number) => correct ? n === p.answer : n !== p.answer);
        return {index, id: p.masteryKey ?? p.id, count: s.answers.length};
    }, correct);
    await tap(page, 'observatoryChoice' + result.index);
    await page.waitForFunction(count =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length === count + 1, result.count);
    return result;
}
async function exitRound(page: Page) {
    await waitForPrompt(page);
    await tap(page, 'observatoryPauseButton');
    await tap(page, 'observatoryExitButton');
    await waitForScene(page, 'GuildScene');
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.filter(url => !audit.intercepted.includes(url))).toEqual([]);
}

for (const renderer of ['canvas', 'webgl']) test(`both foxes move on their painted pedestals: ${renderer}`, async ({page}, info) => {
    const abilities = ['shield', 'heal', 'strike'];
    const lessons = Object.fromEntries(abilities.map(id => [id, {targetId: 'C1', evidenceId: id, earnedAt: 1}]));
    const awards = Object.fromEntries(['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2'].map((id, i) =>
        [id, Object.fromEntries(['I','II'].map(tier => [tier, {
            evidenceId: id + tier, earnedAt: 2, allocation: i === 9 ? null : abilities[i % 3],
        }]))]));
    await openGuild(page, renderer, {catacombFoxJourney: {version: 1, awards, lessons}});
    await tap(page, 'catacombDoorway');
    await tap(page, 'catacombJourney');
    const badgeInk = await page.evaluate(() => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const content = scene.children.getByName('catacombProgress').getAll()[1];
        const surface = content.getByName('catacombPinned').getByName('surface');
        const frame = surface.getByName('frame');
        // Text and frame share a surface. Check the painted enamel beneath each
        // line, including a small margin; the outer bounds also include gold.
        return surface.list.filter((item: any) => item.type === 'Text' && item.text).map((line: any) => {
            for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
                const x = frame.displayOriginX + (line.x + dx * (line.displayWidth / 2 + 2)) / frame.scaleX;
                const y = frame.displayOriginY + (line.y + dy * (line.displayHeight / 2 + 2)) / frame.scaleY;
                const color = scene.textures.getPixel(Math.floor(x), Math.floor(y), frame.texture.key);
                if (!color || color.alpha < 240 || color.blue <= color.red) return false;
            }
            return true;
        });
    });
    expect(badgeInk, 'Caption, module name and problem fit inside the blue enamel').toEqual([true, true, true]);
    for (const [slot, forms] of [['01','02'], ['04','05']].entries()) {
        if (slot === 1) await tap(page, 'catacombOwner:1');
        const record = process.env.LMA_CAPTURE_FOX_MOTION === '1' && renderer === 'canvas' && slot === 0;
        const sample = await measurePedestalMotion(page, forms, record);
        const preview = info.outputPath(`fox-${slot}.png`);
        await page.screenshot({path: preview});
        await info.attach(`fox-${slot}`, {path: preview, contentType: 'image/png'});
        if (sample.pictures.length) {
            const dir = info.outputPath('motion');
            await fs.mkdir(dir, {recursive: true});
            for (const [i, jpeg] of sample.pictures.entries()) {
                await fs.writeFile(path.join(dir, `${String(i).padStart(2,'0')}.jpg`), Buffer.from(jpeg, 'base64'));
            }
        }
        const measurements = sample.footprints.map(p => ({
            frames: new Set(p.map(f => f.frame)).size,
            minX: Math.min(...p.map(f => f.x)), maxX: Math.max(...p.map(f => f.x)),
            minY: Math.min(...p.map(f => f.y)), maxY: Math.max(...p.map(f => f.y)),
        }));
        await info.attach(`pedestal-measurements-${slot}`, {body: JSON.stringify(measurements), contentType: 'application/json'});
        for (const [i, m] of measurements.entries()) {
            expect(m.frames, `fox ${forms[i]} advances its actual source frames`).toBeGreaterThan(2);
            // UV ranges are the moss tops on the painted room, measured independently of actor hosts.
            expect(m.minX).toBeGreaterThan(i === 0 ? .08 : .64);
            expect(m.maxX).toBeLessThan(i === 0 ? .35 : .93);
            expect(m.minY).toBeGreaterThan(.443);
            expect(m.maxY).toBeLessThan(.502);
        }
    }
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.filter(url => !audit.intercepted.includes(url))).toEqual([]);
});

for (const renderer of ['canvas', 'webgl']) test(`Eli learns all three powers in her pinned A1 with actual touches: ${renderer}`, async ({page}) => {
    await openGuild(page, renderer);
    const initial = await records(page);
    for (const [index, ability] of ['shield', 'heal', 'strike'].entries()) {
        await tap(page, 'catacombDoorway');
        await tap(page, 'catacombOwner:1');
        await snapshot(page, `${renderer}-${ability}-overview`);
        const overview = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
            const active: any[] = [];
            function visit(o: any) {
                if (!o.visible || o.alpha === 0) return;
                active.push(o); o.list?.forEach(visit);
            }
            s.children.list.forEach(visit);
            const painting = active.find(o => o.name === 'foxLessonPainting');
            const light = active.find(o => o.name === 'foxLessonPaintedLight');
            const title = active.find(o => o.texture?.key === 'catacomb-detail-lesson-title');
            const siblings = painting?.parentContainer?.list ?? [];
            return {dots: active.filter(o => o.name === 'foxLessonGoalDot').length,
                painting: painting?.texture.key, lightPlaying: light?.anims.isPlaying,
                titleAbovePainting: !!light && !!title && siblings.indexOf(painting) < siblings.indexOf(light)
                    && siblings.indexOf(light) < siblings.indexOf(title),
                obsolete: active.filter(o => o.name?.startsWith('foxLessonModule:') ||
                    ['lessonPrevious', 'lessonNext', 'catacombDemoReplay'].includes(o.name) || o.text === 'Bez času').length};
        });
        expect(overview).toMatchObject({dots: 6, obsolete: 0});
        if (ability !== 'shield') expect(overview).toMatchObject({
            painting: `catacomb-${ability}-painting`, lightPlaying: true, titleAbovePainting: true,
        });
        if (index === 0) {
            await tap(page, 'catacombJourney');
            await tap(page, 'foxNextLesson');
        } else await tap(page, 'catacombEnter');
        await waitForScene(page, scene);
        expect(await page.evaluate(async () => {
            const {GameStateManager} = await import('/src/systems/GameStateManager.ts');
            return GameStateManager.getInstance().getActiveSlotIndex();
        })).toBe(1);
        await snapshot(page, `${renderer}-${ability}-question`);
        const questions = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene
            .round.questions.map((p: { masteryKey: string; choices: number[] }) => [p.masteryKey, Math.max(...p.choices)]));
        expect(questions).toHaveLength(6);
        for (const [key, biggestChoice] of questions) {
            expect(key).toMatch(/^A1:.*:result_unknown$/);
            expect(biggestChoice).toBeLessThanOrEqual(5);
        }
        if (index === 0) {
            const wrong = await answer(page, false);
            await snapshot(page, `${renderer}-wrong`);
            await waitForPrompt(page);
            expect(await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
                return s.answers.filter((a: any) => a.correct).length;
            })).toBe(0);
            expect(wrong.id).not.toBe(await page.evaluate(() => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
                const p = s.round.questions[s.answers.length];
                return p.masteryKey ?? p.id;
            }));
        }
        for (let i = index === 0 ? 1 : 0; i < 6; i++) await answer(page, true);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'demo');
        expect(await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
            return { distinct: new Set(s.answers.map((a: any) => a.problemKey)).size,
                correct: s.answers.filter((a: any) => a.correct).length, facesTarget: s.fox.flipX };
        })).toEqual({distinct: 6, correct: index === 0 ? 5 : 6, facesTarget: true});
        // Solving alone has not awarded the ability; the child must use it once.
        expect((await records(page))[1].player.catacombFoxJourney?.lessons?.[ability]).toBeUndefined();
        await snapshot(page, `${renderer}-${ability}-demo`);
        await tap(page, `foxLessonUse:${ability}`);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'victory');
        await snapshot(page, `${renderer}-${ability}-victory`);
        if (ability === 'strike') await snapshot(page, `${renderer}-victory-no-words`, true);
        const saved = await records(page);
        // Local play time belongs to both co-op participants; gameplay progress must remain untouched.
        const withoutClock = ({playTime: _clock, ...player}: Record<string, unknown>) => player;
        expect(withoutClock(saved[0].player)).toEqual(withoutClock(initial[0].player));
        expect(saved[1].player).toMatchObject({activePet: turtle, catacombFoxBonus: 3});
        expect(saved[1].player.catacombFoxJourney.lessons[ability]).toMatchObject({targetId: 'A1'});
        expect(saved[1].mathStats.masteryData.practice.pinnedTargetId).toBe('A1');
        expect(saved[1].mathStats.masteryData.problemRecords).toEqual(initial[1].mathStats.masteryData.problemRecords);
        const receipt = saved[1].player.catacombFoxJourney.lessons[ability];
        await page.evaluate(() => { const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene; s.useAbility(); s.useAbility(); });
        expect((await records(page))[1].player.catacombFoxJourney.lessons[ability]).toEqual(receipt);
        await tap(page, 'foxLessonDone'); await waitForScene(page, 'GuildScene');
        await expect.poll(() => foxPanel(page)).toMatchObject({ slot: 1, labels: { ['foxPowerGained:' + ability]: '0 → 1', foxAttackPower: '9' } });
        await tap(page, 'catacombProgressClose');
        expect(await page.evaluate(async () => {
            const {GameStateManager} = await import('/src/systems/GameStateManager.ts');
            return GameStateManager.getInstance().getActiveSlotIndex();
        })).toBe(0);
    }
    expect(await page.evaluate(async () => {
        const {getFoxJourney} = await import('/src/systems/FoxAbilitySystem.ts');
        return getFoxJourney(JSON.parse(localStorage.getItem('littleMathAdventure_slot_1')!).player);
    })).toMatchObject({points: 0, availablePoints: 0, powers: {shield: 1, heal: 1, strike: 1}});
    const completed = (await records(page))[1].player.catacombFoxJourney;
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombJourney');
    await snapshot(page, `${renderer}-journey`);
    await snapshot(page, `${renderer}-journey-no-words`, true);
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    expect((await records(page))[1].player.catacombFoxJourney).toEqual(completed);
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.filter(url => !audit.intercepted.includes(url))).toEqual([]);
});

test('exhausted independent examples offer an explicit new attempt without granting a lesson', async ({page}) => {
    await openGuild(page, 'webgl', {}, true);
    await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        const fill = s.fillQueue;
        // Simulate an undersupplied bank once, before the real trial draws its deck.
        s.fillQueue = function() { this.fillQueue = fill; };
    });
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombEnter');
    await waitForScene(page, scene);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.args))
        .toMatchObject({ownerSlot: 1, ability: 'shield', targetId: 'C2'});
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'retry');
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
    await snapshot(page, 'webgl-retry');
    await snapshot(page, 'webgl-retry-no-words', true);
    await tap(page, 'foxLessonRetry');
    await waitForPrompt(page);
    const keys = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.round.questions
        .map((p: any) => p.masteryKey));
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key).toMatch(/^C2:.*:result_unknown$/);
    await exitRound(page);
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
});

test('the second mistake ends a fox lesson early and allows a fresh trial without a reward', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await openGuild(page, 'canvas');
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombEnter');
    await waitForScene(page, scene);
    await snapshot(page, 'desktop-canvas-first-question');
    await tap(page, 'observatoryPauseButton');
    const before = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.round.batch.elapsedMs);
    await tap(page, 'observatoryChoice2');
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        return { elapsed: s.round.batch.elapsedMs, count: s.answers.length };
    })).toEqual({elapsed: before, count: 0});
    await tap(page, 'observatoryPauseButton');
    const results = [true, false, true, true, false];
    for (const correct of results) await answer(page, correct);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'retry');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length)).toBe(5);
    await snapshot(page, 'canvas-second-mistake-retry');
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
    await tap(page, 'foxLessonRetry');
    await waitForPrompt(page);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length)).toBe(0);
    await exitRound(page);
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
});

test('when the planet leaves, an unfinished constellation records only actual answers', async ({page}) => {
    await openGuild(page, 'canvas', {}, false, 700);
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombEnter');
    await waitForScene(page, scene);
    await answer(page, true);
    await waitForPrompt(page);
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        return {budget: s.round.batch.rules.budgetMs, states: s.round.art.mural.gems.map((gem: any) => gem.state)};
    })).toEqual({budget: 49000, states: ['earned', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting']});
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'retry', undefined, {timeout: 65000});
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.length)).toBe(1);
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
    await tap(page, 'foxLessonBack'); await waitForScene(page, 'GuildScene');
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.filter(url => !audit.intercepted.includes(url))).toEqual([]);
});

test('the planet lights exactly the missed star after a five-of-six win', async ({page}) => {
    await openGuild(page, 'webgl');
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombEnter');
    await waitForScene(page, scene);
    await waitForPrompt(page);
    const gems = await page.evaluateHandle(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.round.art.mural.gems);
    const answers = [true, true, false, true, true, true];
    for (const correct of answers) await answer(page, correct);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'demo');
    expect(await gems.evaluate(items => items.map((gem: any) => gem.state)))
        .toEqual(['earned', 'earned', 'assisted', 'earned', 'earned', 'earned']);
    await gems.dispose();
    expect(await page.evaluate(() =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.answers.map((a: any) => a.correct))).toEqual(answers);
    expect((await records(page))[1].player.catacombFoxJourney?.lessons?.shield).toBeUndefined();
    await tap(page, 'foxLessonBack'); await waitForScene(page, 'GuildScene');
    const audit = isolatedDevProfileAudit(page);
    expect(audit.observed.filter(url => !audit.intercepted.includes(url))).toEqual([]);
});

test('every mastered module can supply six different lesson questions', async ({page}, info) => {
    await openGuild(page, 'canvas');
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombOwner:1'); await tap(page, 'catacombEnter');
    await waitForScene(page, scene);
    const counts = await page.evaluate(async () => {
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const { getFoxLessonProgress } = await import('/src/systems/FoxLessons.ts');
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        const data = s.owner.data;
        for (const band of Object.values(data.bands) as any[]) band.state = 'training';
        for (const atom of Object.values(data.subAtoms) as any[]) atom.state = 'mastery';
        function count(target: string) {
            s.args.targetId = target;
            s.fillQueue();
            return new Set(s.queue.map((p: any) => p.masteryKey ?? p.id)).size;
        }
        data.comparisonChapter = createInitialComparisonChapterState('training');
        const early = { A1: count('A1'), A2: count('A2'), comparison: count('comparison_symbols') };
        const earlyRepresentations = [...new Set(s.queue.map((p: any) => p.comparisonMeta.representation))];
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.comparisonChapter.masteryChallengeResult = 'pass';
        const chapterBefore = JSON.stringify(data.comparisonChapter);
        const modules = Object.fromEntries(getFoxLessonProgress(s.owner.player, data).targets.map(id => [id, count(id)]));
        return { early, earlyRepresentations, modules, comparisonUnchanged: JSON.stringify(data.comparisonChapter) === chapterBefore };
    });
    await info.attach('available-questions', { body: JSON.stringify(counts), contentType: 'application/json' });
    expect(Object.keys(counts.modules)).toHaveLength(33);
    expect(counts.comparisonUnchanged).toBe(true);
    expect(counts.earlyRepresentations).toEqual(['size']);
    for (const [id, count] of [...Object.entries(counts.modules), ...Object.entries(counts.early)]) {
        expect(count, id).toBeGreaterThanOrEqual(6);
    }
});

test('an unpinned band E shield lesson gives six direct E1 sums and time for the whole set', async ({page}, info) => {
    await openSeededGame(page, false, {}, {}, { name: 'Tester', level: 6, catacombFoxBonus: 4,
        unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'] });
    const fluentMs = await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { getThresholdsForSubAtom } = await import('/src/systems/MasteryThresholds.ts');
        const state = GameStateManager.getInstance();
        state.loadSlot(0);
        const data = state.getMasteryData()!;
        data.selectedStartBand = 'E';
        delete data.practice;
        data.bands.E.state = 'training';
        for (const target of ['E1', 'E2', 'E3', 'E4'] as const) data.subAtoms[target].state = 'mastery';
        data.learningHistory = {version: 1, attempts: Array.from({ length: 20 }, (_, i) => ({
            source: 'mastery', subAtomId: 'E1', problemKey: 'E1:8+7:result_unknown', form: 'result_unknown',
            correct: true, responseTimeMs: 1750, timestamp: Date.now() - (20 - i) * 4000,
        }))};
        state.save();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuildScene');
        return getThresholdsForSubAtom('E1').fluentRT;
    });
    await waitForScene(page, 'GuildScene');
    await tap(page, 'catacombDoorway'); await tap(page, 'catacombJourney'); await tap(page, 'foxNextLesson');
    await waitForScene(page, scene); await waitForPrompt(page);
    const entry = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
        return { target: s.args.targetId, ability: s.args.ability, rules: s.round.batch.rules };
    });
    expect(entry).toMatchObject({ target: 'E1', ability: 'shield', rules: { total: 6, required: 5 } });
    expect(entry.rules.paceMs).toBe(fluentMs);
    expect(entry.rules.budgetMs).toBe((entry.rules.total + 1) * fluentMs);
    const dealt = new Set<string>();
    for (let i = 0; i < entry.rules.total; i++) {
        await waitForPrompt(page);
        const prompt = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene;
            const dock = s.round.board.getContainer().getByName('observatoryMathDock');
            return dock.list.find((o: any) => o.type === 'Text')?.text;
        });
        expect(prompt).toMatch(/^\d+ \+ \d+$/);
        if (i === 0) await info.attach('shield-question', { body: await page.screenshot(), contentType: 'image/png' });
        dealt.add((await answer(page, i !== 1)).id);
    }
    expect(dealt.size).toBe(6);
    for (const key of dealt) expect(key).toMatch(/^E1:.*:result_unknown$/);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'demo');
    await tap(page, 'foxLessonUse:shield');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.FoxLessonScene.phase === 'victory');
    expect((await records(page))[0].player.catacombFoxJourney.lessons.shield.targetId).toBe('E1');
});

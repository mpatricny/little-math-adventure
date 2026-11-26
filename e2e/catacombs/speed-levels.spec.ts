import { foxPanel, solve, tapNamed, waitForQuestion } from './helpers/observatory';
import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

async function assertUiTextures(page: Page) {
    const missing = await page.evaluate(() => {
        const found: string[] = [];
        const visit = (o: any) => {
            if (!o.visible || o.alpha === 0) return;
            if (o.texture?.key === '__MISSING') found.push(o.name || o.type);
            o.list?.forEach(visit);
        };
        (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).forEach((scene: any) => scene.children.list.forEach(visit));
        return found;
    });
    expect(missing, 'Visible UI must never use Phaser missing-image placeholders').toEqual([]);
}

async function click(page: Page, name: string) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const point = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        function find(objects: any[]): any {
            for (const o of objects) {
                if (!o.visible) continue;
                if (o.name === name) return o;
                if (o.list) { const found = find(o.list); if (found) return found; }
            }
        }
        const o = find(scene.children.list); if (!o) throw new Error(`Missing ${name}`);
        const matrix = o.getWorldTransformMatrix(); return { x: matrix.tx, y: matrix.ty };
    }, name);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function overviewState(page: Page) {
    return page.evaluate(() => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.children.getByName('catacombProgress');
        const controls: Record<string, { enabled: boolean; ready: boolean }> = {};
        const labels: string[] = [];
        const gateArt: string[] = [];
        const visit = (o: any) => {
            if (!o.visible || o.alpha === 0) return;
            if (o.texture?.key?.startsWith('catacomb-painted-speed-panel-')) gateArt.push(o.texture.key);
            if (o.name && o.getData?.('enabled') !== undefined) controls[o.name] = {
                enabled: o.getData('enabled'), ready: o.getData('ready'),
            };
            if (o.type === 'Text' && o.alpha > 0) labels.push(o.text);
            o.list?.forEach(visit);
        };
        visit(root);
        return { visible: root.visible, lesson: root.getData('lesson'), slot: root.getData('slot'),
            pinned: root.getData('pinned'), target: root.getData('target'), controls, labels, gateArt };
    });
}

async function seedEvidence(page: Page, seedPartner = false) {
    await page.evaluate(async seedPartner => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { ProblemDatabase } = await import('/src/systems/ProblemDatabase.ts');
        const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const state = GameStateManager.getInstance();
        if (!state.loadSlot(0)) throw Error('Missing primary fixture');
        const data = state.getMasteryData()!;
        data.practice = { mode: 'progress', pinnedTargetId: 'A1' };
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.subAtoms.A1.state = 'mastery'; data.subAtoms.A2.state = 'training'; data.problemRecords = {}; data.learningHistory = undefined;
        const db = ProblemDatabase.getInstance();
        const problems = ['result_unknown', 'missing_part'].flatMap(form => db.getProblemsForForm('A1', form as any).slice(0, 8));
        const today = new Date(); today.setHours(12, 0, 0, 0);
        for (let n = 0; n < 40; n++) {
            const p = problems[n % problems.length];
            const record = data.problemRecords[p.key] ??= { problemKey: p.key, subAtomId: 'A1', form: p.form, attempts: [] };
            record.attempts.push({ correct: true, responseTimeMs: 1600, timestamp: today.getTime() - (n < 20 ? 2 : 1) * 86400000 + n,
                context: 'battle', sequenceIndex: ++data.globalSolveSequence });
        }
        MasterySystem.destroyInstance(); state.save();
        if (seedPartner) {
            // The inspected player has a genuinely open trial and a different pin.
            // Both buttons would change state if the read-only ownership check failed.
            const { SaveSystem } = await import('/src/systems/SaveSystem.ts');
            const partner = SaveSystem.readSnapshot(1)!;
            partner.mathStats.masteryData = structuredClone(data);
            partner.mathStats.masteryData.practice = { mode: 'progress', pinnedTargetId: 'A2' };
            SaveSystem.save(1, partner.player, partner.mathStats);
        }
        (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start('GuildScene');
    }, seedPartner);
    await waitForScene(page, 'GuildScene');
}

for (const renderer of ['webgl', 'canvas']) test(`real door, map, new trial and saved rune: ${renderer}`, async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { name: 'Kitten', unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'], activePet: 'pet_catacomb_A', catacombFoxBonus: 4 });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    await seedEvidence(page);
    await click(page, 'catacombDoorway');
    await expect.poll(() => overviewState(page)).toMatchObject({ visible: true, lesson: true, slot: 0, pinned: 'A1' });
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-overview.png` });
    await click(page, 'catacombModule:A2');
    const locked = await overviewState(page);
    expect(locked).toMatchObject({ lesson: false, target: 'A2', pinned: 'A1', controls: { catacombEnter: { enabled: false, ready: false } } });
    expect(locked.labels).toContain('Nejdřív zkouška');
    expect(locked.gateArt).toEqual(['catacomb-painted-speed-panel-closed-v3']);
    await click(page, 'catacombEnter');
    expect((await overviewState(page)).visible).toBe(true);
    await assertUiTextures(page);
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-exam-lock.png` });
    await click(page, 'catacombChooseTraining');
    expect(await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts'); return GameStateManager.getInstance().getMasteryData()!.practice;
    })).toMatchObject({ mode: 'progress', lastTargetId: 'A2', pinnedTargetId: 'A2' });
    await click(page, 'catacombModule:A1'); await click(page, 'catacombStage:grandmaster');
    expect(await overviewState(page)).toMatchObject({ target: 'A1', pinned: 'A2',
        gateArt: ['catacomb-painted-speed-panel-open-v3'], controls: { catacombEnter: { enabled: true, ready: true } } });
    expect((await overviewState(page)).labels).toContain('✓ 7/8');
    await click(page, 'catacombEnter'); await waitForScene(page, 'CatacombTrialScene');
    await waitForQuestion(page);
    await assertUiTextures(page);
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-trial.png` });
    for (let n = 0; n < 8; n++) await solve(page, n !== 3);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown);
    await assertUiTextures(page);
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch;
        return { correct: b.correctCount, passed: b.passed };
    })).toEqual({ correct: 7, passed: true });
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-reward.png` });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player);
    expect(saved.catacombFoxBonus).toBe(4);
    expect(saved.catacombFoxJourney.awards.A1.I.evidenceId).toBeTruthy();
    expect(saved.catacombFoxJourney.awards.A1.I.allocation).toBeNull();
    expect(await page.evaluate(async () => {
        const { getFoxJourney } = await import('/src/systems/FoxAbilitySystem.ts');
        return getFoxJourney(JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player);
    })).toMatchObject({ points: 1, availablePoints: 0, tiers: { A1: 1 }, powers: { shield: 0, heal: 0, strike: 0 } });
    await click(page, 'catacombPrimary'); await waitForScene(page, 'GuildScene');
    await expect.poll(() => foxPanel(page)).toMatchObject({ slot: 0, labels: { foxRewardPoints: '+1', foxAttackPower: '10' }, choices: [] });
    await click(page, 'catacombProgressClose');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.masteryMapOverlay.showNode('A1'));
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-learning-map.png` });
    await page.mouse.move(850, 430); await page.mouse.wheel(0, 360);
    await page.waitForTimeout(200);
    await click(page, 'learningCatacombs'); await click(page, 'catacombJourney');
    expect((await overviewState(page)).controls['foxAllocate:shield']).toBeUndefined();
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.children.getByName('catacombProgress')?.getData('journey'))).toBe(true);
    expect(await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { getPetAttackPower } = await import('/src/systems/CatacombPetProgress.ts');
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const panel = scene.children.getByName('catacombProgress');
        const power = panel.list.flatMap((o: any) => o.list ?? []).find((o: any) => o.name === 'foxAttackPower');
        return power?.text === String(getPetAttackPower(scene.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A'), GameStateManager.getInstance().getPlayer()));
    })).toBe(true);
    await page.setViewportSize({ width: 1024, height: 768 });
    await assertUiTextures(page);
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-journey-tablet.png` });
    await page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.sound.mute = true;
        const root = game.scene.keys.GuildScene.children.getByName('catacombProgress');
        const visit = (o: any) => { if (o.getData?.('word')) o.setVisible(false); o.list?.forEach(visit); }; visit(root);
    });
    await page.screenshot({ path: `artifacts/catacomb-speed/${renderer}-journey-no-words.png` });
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxJourney)).toEqual(saved.catacombFoxJourney);
});

test('an open Grandmaster retry uses the last ten solves and freezes its slower pace on entry', async ({ page }) => {
    await openSeededGame(page);
    await seedEvidence(page);
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const data = GameStateManager.getInstance().getMasteryData()!;
        data.openedCatacombSpeed = { A1: 1 };
        const result = Object.values(data.problemRecords).find(r => r.form === 'result_unknown')!;
        const end = Date.now();
        [35000, ...Array(9).fill(5000), 10000].forEach((responseTimeMs, i) => result.attempts.push({
            correct: true, responseTimeMs, timestamp: end - (11 - i) * 40000,
            context: 'battle', sequenceIndex: ++data.globalSolveSequence,
        }));
    });
    await click(page, 'catacombDoorway');
    await click(page, 'catacombModule:A1');
    await click(page, 'catacombStage:grandmaster');
    await click(page, 'catacombEnter');
    await waitForQuestion(page);
    const entryRules = () => page.evaluate(() =>
        (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.rules);
    const admission = await entryRules();
    expect(admission).toMatchObject({ total: 8, required: 7, paceMs: 5500 });
    await solve(page);
    await waitForQuestion(page);
    expect(await entryRules()).toEqual(admission);
});

test.describe('Silverpond tablet', () => {
    test.use({ hasTouch: true, viewport: { width: 1024, height: 600 } });
    test('the winning partner spends a real Grandmaster point on the fox and keeps it after reload', async ({ page }) => {
        const abilities = ['shield', 'heal', 'strike'];
        const lessons = Object.fromEntries(abilities.map(ability => [ability,
            { evidenceId: 'learned-' + ability, earnedAt: Date.now() - 1000, targetId: 'A1' }]));
        await openSeededGame(page, true, {}, {}, { name: 'Kitten' }, { name: 'Eli', catacombFoxBonus: 3,
            unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'], catacombFoxJourney: { version: 1, awards: {}, lessons } });
        await seedEvidence(page, true);
        await activateCoopSession(page);
        const guild = 'SilverpondGuildMockScene';
        await page.evaluate(key => (window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start(key), guild);
        await waitForScene(page, guild);
        await tapNamed(page, 'catacombDoorway'); await tapNamed(page, 'catacombOwner:1');
        await tapNamed(page, 'catacombModule:A1'); await tapNamed(page, 'catacombStage:grandmaster'); await tapNamed(page, 'catacombEnter');
        await waitForScene(page, 'CatacombTrialScene');
        for (let i = 0; i < 8; i++) await solve(page, i !== 2);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown);
        await tapNamed(page, 'catacombPrimary');
        await waitForScene(page, guild);
        const choices = abilities.map(ability => 'foxAllocate:' + ability);
        await expect.poll(() => foxPanel(page)).toMatchObject({ slot: 1, target: 'A1', labels: { foxRewardPoints: '+1' }, choices });
        await page.screenshot({ path: 'artifacts/observatory-review/fox-choose-point-tablet.png' });
        await tapNamed(page, 'foxAllocate:heal');
        expect(await foxPanel(page)).toMatchObject({ slot: 1, labels: { 'foxPowerGained:heal': '1 → 2', foxAttackPower: '9' }, choices: [] });
        await page.screenshot({ path: 'artifacts/observatory-review/fox-heal-upgraded-tablet.png' });
        await tapNamed(page, 'catacombOwner:0');
        expect((await foxPanel(page))?.labels['foxPowerGained:heal']).toBeUndefined();
        await tapNamed(page, 'catacombProgressClose'); await tapNamed(page, 'catacombDoorway');
        expect(await foxPanel(page)).toBeNull();
        await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
        await page.reload(); await waitForScene(page, 'MenuScene');
        const saved = await page.evaluate(async () => {
            const { getFoxJourney } = await import('/src/systems/FoxAbilitySystem.ts');
            return [0,1].map(slot => getFoxJourney(JSON.parse(localStorage.getItem('littleMathAdventure_slot_' + slot)!).player));
        });
        expect(saved[0]).toMatchObject({ points: 0, powers: { shield: 0, heal: 0, strike: 0 } });
        expect(saved[1]).toMatchObject({ points: 1, availablePoints: 0, powers: { shield: 1, heal: 2, strike: 1 } });
    });
});

test('a banked speed point becomes one explicit choice after the third fox lesson', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, {
        unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'], catacombFoxBonus: 3,
    });
    await seedEvidence(page);
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { awardFoxRune, getFoxJourney } = await import('/src/systems/FoxAbilitySystem.ts');
        const { admitFoxLesson, completeFoxLesson, FOX_LESSON_ORDER, FOX_LESSON_QUESTIONS } = await import('/src/systems/FoxLessons.ts');
        const state = GameStateManager.getInstance(), player = state.getPlayer(), data = state.getMasteryData()!;
        if (!awardFoxRune(player, 'A1', 1, { evidenceId: 'speed-before-lessons', earnedAt: Date.now() })) throw new Error('Failed to seed the earned point');
        const answers = Object.keys(data.problemRecords).slice(0, FOX_LESSON_QUESTIONS).map(problemKey => ({ problemKey, correct: true, assisted: false }));
        for (const ability of FOX_LESSON_ORDER) {
            if (getFoxJourney(player).availablePoints) throw new Error('The point was offered before all three lessons');
            const admission = admitFoxLesson(player, data, 'A1', ability, 'lesson-' + ability);
            if (!admission || !completeFoxLesson(admission, answers, true)) throw new Error('Failed to seed lesson ' + ability);
        }
        state.save();
    });
    await click(page, 'catacombDoorway');
    await click(page, 'catacombJourney');
    expect((await overviewState(page)).controls).toMatchObject({
        'foxAllocate:shield': { enabled: true }, 'foxAllocate:heal': { enabled: true }, 'foxAllocate:strike': { enabled: true },
    });
    await click(page, 'foxAllocate:heal');
    expect((await overviewState(page)).controls['foxAllocate:heal']).toBeUndefined();
    await click(page, 'foxNextLesson');
    await waitForScene(page, 'CatacombTrialScene');
    expect(await page.evaluate(() => {
        const trial = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return { target: trial.args.subAtomId, stage: trial.args.speedStage };
    })).toEqual({ target: 'A1', stage: 'legend' });
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload();
    await waitForScene(page, 'MenuScene');
    const result = await page.evaluate(async () => {
        const { getFoxJourney } = await import('/src/systems/FoxAbilitySystem.ts');
        const save = JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!);
        return { receipt: save.player.catacombFoxJourney.awards.A1.I, journey: getFoxJourney(save.player),
            attackBonus: save.player.catacombFoxBonus, pin: save.mathStats.masteryData.practice.pinnedTargetId };
    });
    expect(result).toMatchObject({ receipt: { evidenceId: 'speed-before-lessons', allocation: 'heal' },
        journey: { availablePoints: 0, points: 1, powers: { shield: 1, heal: 2, strike: 1 } }, attackBonus: 3, pin: 'A1' });
});

test('inactive profile stays read-only and the HTTP tablet can initialize a trial', async ({ page }) => {
    await openSeededGame(page, true);
    await seedEvidence(page, true);
    await page.evaluate(async () => {
        const { CatacombProgressOverlay } = await import('/src/ui/CatacombProgressOverlay.ts');
        CatacombProgressOverlay.forScene((window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene).show('A1', 1);
    });
    const before = await page.evaluate(() => [localStorage.getItem('littleMathAdventure_slot_0'), localStorage.getItem('littleMathAdventure_slot_1')]);
    expect(await overviewState(page)).toMatchObject({ visible: true, slot: 1, target: 'A1', pinned: 'A2',
        controls: { catacombEnter: { enabled: false, ready: true }, catacombChooseTraining: { enabled: false } } });
    await click(page, 'catacombChooseTraining'); await click(page, 'catacombEnter');
    expect(await page.evaluate(() => [localStorage.getItem('littleMathAdventure_slot_0'), localStorage.getItem('littleMathAdventure_slot_1')])).toEqual(before);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.children.getByName('catacombProgress').getData('slot'))).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('littleMathAdventure_activeSlot'))).toBe('0');
    await page.evaluate(() => {
        Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
        (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.scene.start('CatacombTrialScene', { examType: 'mastery_challenge', subAtomId: 'A1', speedStage: 'grandmaster' });
    });
    await waitForScene(page, 'CatacombTrialScene');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.trialEvidenceId.length)).toBeGreaterThan(20);
});

test('running out of planet time in Legend preserves previously won runes', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { unlockedPets: ['catacomb_creature_A'], catacombFoxBonus: 4 });
    await seedEvidence(page);
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { awardFoxRune } = await import('/src/systems/FoxAbilitySystem.ts');
        const state = GameStateManager.getInstance();
        if (!awardFoxRune(state.getPlayer(), 'A1', 1, { evidenceId: 'fixture-first-tier', earnedAt: Date.now() }))
            throw Error('Missing previously earned grandmaster rune');
        state.save();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.scene.start('CatacombTrialScene', { examType: 'mastery_challenge', subAtomId: 'A1', speedStage: 'legend' });
    });
    await waitForScene(page, 'CatacombTrialScene');
    await solve(page);
    await waitForQuestion(page);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown,
        undefined, {timeout: 45000});
    expect(await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch;
        return { correct: b.correctCount, expired: b.expired, passed: b.passed };
    })).toEqual({ correct: 1, expired: true, passed: false });
    await assertUiTextures(page);
    await page.screenshot({ path: 'artifacts/catacomb-speed/slow-legend-result.png' });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player);
    expect(saved.catacombFoxJourney.awards.A1.I).toMatchObject({ evidenceId: 'fixture-first-tier', allocation: null });
    expect(saved.catacombFoxJourney.awards.A1.II).toBeUndefined(); expect(saved.catacombFoxBonus).toBe(4);
});

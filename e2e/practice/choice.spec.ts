import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { isolatedDevProfileAudit } from '../helpers/isolated-dev-profile';
import { mkdir } from 'node:fs/promises';
import type { Page } from 'playwright/test';

const review = 'artifacts/practice-choice-review';

async function prepare(page: Page, coop: boolean, intro = false, mastered = false): Promise<void> {
    await page.evaluate(async ({ coop, intro, mastered }) => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const game = GameStateManager.getInstance();
        for (const slot of coop ? [0, 1] : [0]) {
            game.loadSlot(slot);
            const data = game.getMasteryData();
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            for (const id of ['A1', 'A2', 'A3', 'A4']) data.subAtoms[id].state = mastered ? 'mastery' : 'secure';
            if (mastered) data.comparisonChapter.masteryChallengeResult = 'pass';
            data.practice = { mode: slot ? 'practice' : 'progress', targetId: slot ? 'A2' : undefined, pinnedTargetId: slot ? 'A2' : undefined,
                lastTargetId: 'A1', introductionSeen: !intro };
            for (const form of ['result_unknown', 'missing_part', 'comparison']) {
                const key = `A1:2+2:${form}`;
                data.problemRecords[key] = { problemKey: key, subAtomId: 'A1', form, attempts: [] };
                for (let i = 0; i < 10; i++) data.problemRecords[key].attempts.push({ correct: true,
                    responseTimeMs: slot ? 1000 : 6000, context: 'battle', timestamp: Date.now() - 50000 + i,
                    sequenceIndex: ++data.globalSolveSequence });
            }
            game.save();
        }
        game.loadSlot(0);
    }, { coop, intro, mastered });
    if (coop) await activateCoopSession(page);
}

async function battle(page: Page, arena = false, expectChoice = true): Promise<void> {
    await page.evaluate(arena => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const source = game.scene.getScenes(true).at(-1);
        source.scene.start('BattleScene', arena ? { fromArena: true, arenaLevel: 1, wave: 0 }
            : { enemyId: 'slime_green', returnScene: 'TownScene' });
    }, arena);
    await waitForScene(page, 'BattleScene');
    if (expectChoice) await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice);
}

async function point(page: Page, name: string) {
    const p = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const find = (obj: any): any => obj.name === name ? obj : obj.list?.map(find).find(Boolean);
        const obj = find(scene.children);
        if (!obj) throw new Error('Missing control: ' + name);
        return obj.getWorldTransformMatrix().transformPoint(0, 0);
    }, name);
    const box = (await page.locator('#game-container canvas').boundingBox())!;
    return { x: box.x + p.x / 1280 * box.width, y: box.y + p.y / 720 * box.height };
}
async function tap(page: Page, name: string) {
    const p = await point(page, name); await page.touchscreen.tap(p.x, p.y);
}
async function capture(page: Page, name: string) {
    await page.locator('#game-container canvas').screenshot({ path: `${review}/${name}.png` });
}
async function snapshot(page: Page) {
    return page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return { phase: b.battleState.phase, ui: b.practiceChoice?.state ?? null,
            snapshotA: b.personalBonuses.A?.practiceTarget ?? null, snapshotB: b.personalBonuses.B?.practiceTarget ?? null,
            bonusCreated: !!b.personalBonuses.A, problems: b.battleState.currentProblems.length,
            accepting: b.mathBoard.acceptingAnswer, activeMs: b.mathBoard.activeTimeMs,
            actionVisible: b.attackButton.visible && b.attackButton.parentContainer?.visible !== false };
    });
}
async function auditLayout(page: Page) {
    const errors = await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const root = battle.practiceChoice.root;
        const errors: string[] = [];
        const visit = (o: any) => {
            if (o.type === 'Image' && o.texture?.key === '__MISSING') errors.push('missing texture ' + o.name);
            if (o.name === 'practiceChoiceBattleIcon') {
                if (!battle.textures.exists('arena-entry-crossed-swords-normal-v1')) errors.push('battle icon was not preloaded');
                if (o.texture?.key !== 'arena-entry-crossed-swords-normal-v1') errors.push('wrong battle icon texture');
            }
            if (o.texture && o.type === 'Image' && Math.abs(o.scaleX - o.scaleY) > .00001) errors.push('stretched ' + o.name);
            if (o.type === 'Text') {
                if (o.style.resolution !== 2 || o.frame.source.resolution !== 2) errors.push('text resolution ' + o.text);
                const safe = o.getData('safeRegion'), b = o.getBounds();
                if (safe && (b.width > safe.width + 1 || b.height > safe.height + 1)) errors.push('text overflow ' + o.text);
            }
            if (o.name?.startsWith('practiceChoice') && o.input?.enabled) {
                const b = o.getBounds(); if (b.x < 0 || b.right > 1280 || b.y < 0 || b.bottom > 720) errors.push('outside viewport ' + o.name);
            }
            o.list?.forEach(visit);
        }; visit(root); return errors;
    });
    expect(errors).toEqual([]);
}

for (const renderer of ['webgl', 'canvas']) test(`independent choices gate the real arena and freeze the confirmed bonuses — ${renderer}`, async ({ page }) => {
    await mkdir(review, { recursive: true });
    if (renderer === 'canvas') await page.setViewportSize({ width: 1024, height: 768 });
    await openSeededGame(page, true);
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer === 'canvas' ? 1 : 2);
    await prepare(page, true); await battle(page, true);
    await auditLayout(page); await capture(page, `coop-${renderer}-normal`);
    const before = await snapshot(page);
    expect(before).toMatchObject({ phase: 'start', bonusCreated: false, problems: 0, accepting: false, actionVisible: false });
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
    expect((await snapshot(page)).phase).toBe('start');
    expect((await snapshot(page)).ui?.ready).toBe(true);
    expect((await snapshot(page)).ui?.choices.map((c: any) => c.mode)).toEqual(['progress', 'practice']);

    const control = await point(page, 'practiceChoicePracticeA');
    await page.mouse.move(control.x, control.y); await page.waitForTimeout(160);
    await capture(page, `coop-${renderer}-hover`);
    await page.mouse.down(); await page.waitForTimeout(150); await capture(page, `coop-${renderer}-pressed`);
    await page.mouse.move(2, 2); await page.mouse.up();
    expect((await snapshot(page)).ui?.choices.map((c: any) => c.mode)).toEqual(['progress', 'practice']);
    await tap(page, 'practiceChoicePracticeA');
    expect((await snapshot(page)).ui?.confirmed).toEqual([true, true]);
    expect((await snapshot(page)).bonusCreated).toBe(false);
    expect((await snapshot(page)).phase).toBe('start');
    await tap(page, 'practiceChoiceProgressB');
    await auditLayout(page); await capture(page, `coop-${renderer}-selected`);
    await page.evaluate(() => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice.root;
        const hide = (o: any) => { if (o.getData?.('practiceWord')) o.setVisible(false); o.list?.forEach(hide); }; hide(root);
    });
    await capture(page, `coop-${renderer}-no-words`);
    await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect(await snapshot(page)).toMatchObject({ ui: null, snapshotA: 'A1', snapshotB: null, bonusCreated: true, problems: 0 });
    const saved = await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).mathStats.masteryData.practice));
    expect(saved[0]).toMatchObject({ mode: 'practice', targetId: 'A1' }); expect(saved[1].mode).toBe('progress');
    // The real attack starts after confirmation and still uses the one MathBoard first-answer latch.
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
    const answer = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene, board = b.mathBoard;
        const p = board.problems[board.currentProblemIndex];
        const start = b.personalBonuses.A.answers;
        board.activeTimeMs = 1800;
        const choice = p.choices.indexOf(p.answer); board.submitChoice(choice); board.submitChoice(choice);
        return { key: p.masteryKey, count: board.results.length, evidence: b.personalBonuses.A.answers - start,
            damage: board.damageDealt, base: p.damageMultiplier || 1 };
    });
    expect(answer.key.startsWith('A1:')).toBe(true); expect(answer.count).toBe(1); expect(answer.evidence).toBe(1);
    expect(answer.damage).toBe(answer.base + 1);
    await capture(page, `battle-${renderer}-first-answer`);
    const network = isolatedDevProfileAudit(page); expect(network.observed).toEqual(network.intercepted);
});

for (const key of ['GuildScene', 'SilverpondGuildMockScene']) test(`Zyx saves the default on a guild card tap and a battle override lasts one fight: ${key}`, async ({ page }) => {
    await mkdir(review, { recursive: true });
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSeededGame(page); await prepare(page, false, true);
    // A child who has just reached the milestone can fight without Zyx's lesson.
    await battle(page);
    expect((await snapshot(page)).ui?.screen).toBe('choice');
    const prefs = () => page.evaluate(async () => (await import('/src/systems/PracticeSystem.ts')).PracticeSystem.getOverview()!);
    expect((await prefs()).introductionSeen).toBe(false);
    await page.evaluate(async key => {
        const { StorySystem } = await import('/src/systems/StorySystem.ts');
        StorySystem.getInstance().markSilverpondQuestSeen('fairy');
        (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start(key);
    }, key);
    await waitForScene(page, key);
    await tap(page, key === 'GuildScene' ? 'guildZyx' : 'silverpondQuestZyx');
    await page.waitForFunction(key => (window as any).__LITTLE_MATH_GAME__.scene.keys[key].practiceChoice?.state.screen === 'guild', key);
    expect(await page.evaluate(key => (window as any).__LITTLE_MATH_GAME__.scene.keys[key].practiceChoice.content.getByName('practiceChoiceDemoHand') != null, key)).toBe(false);
    expect((await prefs()).introductionSeen).toBe(false);
    await tap(page, 'practiceChoiceIntroPractice');
    expect(await prefs()).toMatchObject({ introductionSeen: true, selection: { mode: 'practice', targetId: 'A1' } });
    await capture(page, `zyx-${key}-selected`);
    await tap(page, 'practiceChoiceConfirm');
    await battle(page);
    expect((await snapshot(page)).ui?.choices[0].mode).toBe('practice');
    await tap(page, 'practiceChoiceProgressSolo'); await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect((await snapshot(page)).snapshotA).toBeNull();
    await battle(page); expect((await snapshot(page)).ui?.choices[0].mode).toBe('practice');
});

test('mastered training remains selectable and scene shutdown leaves no modal or callback', async ({ page }) => {
    await openSeededGame(page); await prepare(page, false, false, true); await battle(page);
    await tap(page, 'practiceChoicePracticeSolo');
    expect((await snapshot(page)).ui?.ready).toBe(true);
    await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect((await snapshot(page)).snapshotA).toBe('A1');
    await battle(page);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('MenuScene'));
    await waitForScene(page, 'MenuScene');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice)).toBeNull();
});

test('before the first milestone no pre-battle modal is shown', async ({ page }) => {
    await openSeededGame(page);
    await battle(page, false, false);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect((await snapshot(page)).ui).toBeNull();
});

test('one confirmation resumes both saved choices without selecting either card again', async ({ page }) => {
    await openSeededGame(page, true); await prepare(page, true); await battle(page, true);
    const before = await snapshot(page);
    expect(before.ui?.choices.map((c: any) => c.mode)).toEqual(['progress', 'practice']);
    expect(before.bonusCreated).toBe(false);
    await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect(await snapshot(page)).toMatchObject({ ui: null, snapshotA: null, snapshotB: 'A2', bonusCreated: true, problems: 0 });
});

test('an old practice profile resumes the lowest accessible module when its old target is unavailable', async ({ page }) => {
    await openSeededGame(page); await prepare(page, false);
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const state = GameStateManager.getInstance();
        state.getMasteryData().practice = { mode: 'practice', targetId: 'E4', lastTargetId: 'E4', introductionSeen: true };
        state.save();
    });
    await battle(page);
    expect((await snapshot(page)).ui?.choices[0]).toMatchObject({ mode:'practice', targetId:'A1' });
    await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    expect((await snapshot(page)).snapshotA).toBe('A1');
});

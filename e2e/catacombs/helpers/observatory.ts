import type { Page } from 'playwright/test';
import type { BandId, PracticeTargetId } from '../../../src/types';
import type { CatacombChallenge } from '../../../src/systems/PracticeProgress';
import { openSeededGame, waitForScene } from '../../arena/helpers/arena-harness';

export async function openModule(page: Page, renderer = 'webgl', target: PracticeTargetId = 'A1',
    examType: CatacombChallenge = 'fluency_challenge') {
    await openSeededGame(page);
    if (renderer === 'canvas') {
        await page.goto('/?renderer=canvas');
        await waitForScene(page, 'MenuScene');
    }
    await page.evaluate(async ({ target, examType }) => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const state = GameStateManager.getInstance();
        state.loadSlot(0);
        const data = state.getMasteryData()!;
        if (target !== 'A1') {
            const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            if (target !== 'comparison_symbols') {
                const band = target[0] as BandId;
                data.selectedStartBand = band;
                data.bands[band].state = 'training';
            }
        }
        if (target !== 'comparison_symbols') {
            data.subAtoms[target].state = examType === 'mastery_challenge' ? 'fluent' : 'secure';
            data.subAtoms[target].examBestMedal = 'gold';
        }
        state.save();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene',
            { examType, subAtomId: target });
    }, { target, examType });
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.isActive('CatacombTrialScene'), undefined, { timeout: 45_000 });
    await waitForQuestion(page);
}
export async function waitForQuestion(page: Page) {
    await page.waitForFunction(() => !!(window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round?.board.getActiveProblemSnapshot(), undefined, { timeout: 30_000 });
}
export async function foxPanel(page: Page) {
    return page.evaluate(() => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const root = scene.children.getByName('catacombProgress');
        if (!root?.visible || !root.getData('journey')) return null;
        const labels: Record<string, string> = {};
        const choices: string[] = [];
        const collect = (o: any) => {
            if (!o.visible || !o.alpha) return;
            if (o.type === 'Text' && o.name) labels[o.name] = o.text;
            if (o.name?.startsWith('foxAllocate:') && o.input?.enabled) choices.push(o.name);
            o.list?.forEach(collect);
        };
        collect(root);
        return { slot: root.getData('slot'), target: root.getData('target'), labels, choices };
    });
}
export async function tapNamed(page: Page, name: string) {
    // Phaser commits the new display list and hit areas at the end of the frame.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const position = await page.evaluate(name => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const find = (o: any): any => o.visible === false || o.alpha === 0 ? null :
            o.name === name && o.input?.enabled ? o : o.list?.map(find).find(Boolean);
        const target = scene.children.list.map(find).find(Boolean);
        if (!target) throw Error('Missing interactive ' + name);
        const matrix = target.getWorldTransformMatrix();
        return { x: matrix.tx, y: matrix.ty };
    }, name);
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    const x = canvas.x + position.x / 1280 * canvas.width, y = canvas.y + position.y / 720 * canvas.height;
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
}
export async function solve(page: Page, correct = true) {
    await waitForQuestion(page);
    const { index, count } = await page.evaluate(correct => {
        const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        const count = r.batch.answers.length, p = r.questions[count];
        return { index: p.choices.findIndex((v: number) => (v === p.answer) === correct), count };
    }, correct);
    await tapNamed(page, 'observatoryChoice' + index);
    await page.waitForFunction(count => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.answers.length > count, count);
}

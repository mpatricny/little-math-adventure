import type { Page } from 'playwright/test';

export async function tap(page: Page, x: number, y: number): Promise<void> {
    await page.waitForTimeout(90);
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('Missing game canvas');
    await page.touchscreen.tap(box.x + x / 1280 * box.width, box.y + y / 720 * box.height);
}

export async function solveChest(page: Page): Promise<void> {
    await tap(page, 480, 555);
    await solveOpenChest(page);
}

export async function solveOpenChest(page: Page, onSolved?: () => Promise<void>): Promise<void> {
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest);
    const length = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest.clues.length);
    for (let i = 0; i < length; i++) {
        const wheel = await page.evaluate(i => {
            const chest = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest;
            const choices = chest.options[i];
            const answer = [...chest.clues].sort((a: any, b: any) => a.value - b.value).map((clue: any) => clue.letter);
            const host = chest.builder.get(`wordWheel${i}Host`);
            return { x: host.x, y: host.y, turns: (choices.indexOf(answer[i]) - choices.indexOf(chest.letters[i]) + choices.length) % choices.length };
        }, i);
        for (let turn = 0; turn < wheel.turns; turn++) {
            await tap(page, wheel.x, wheel.y);
            await page.waitForFunction(i => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest.wheels[i].animating, i);
        }
    }
    await tap(page, 640, 550);
    await onSolved?.();
    await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.progress().openedChests.includes(s.room.chest.id) && !s.ui.modal;
    });
}

export async function answerPearl(page: Page, correct: boolean, waitForNext = true): Promise<void> {
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle?.phase === 'building');
    const data = await page.evaluate(correct => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const p = s.bellPuzzle, c = p.challenge;
        let plan = c.solutions[0];
        if (!correct) {
            plan = c.cards.flatMap((_: number, i: number) => c.cards.map((__: number, j: number) => [i, j]))
                .find(([i, j]: number[]) => i !== j && !c.solutions.some(([a, b]: number[]) => a === i && b === j));
        }
        const point = (id: string) => { const h = p.builder.get(id); return { x: h.x, y: h.y }; };
        return { attempt: s.progress().puzzleAttempts,
            clear: p.selected.flatMap((v: number | null, i: number) => v === null ? [] : [point(`flowStep${i}Host`)]),
            cards: plan.map((i: number) => point(`flowCard${i}Host`)), bell: point('bellInstrumentHost') };
    }, correct);
    for (const point of [...data.clear, ...data.cards]) await tap(page, point.x, point.y);
    await tap(page, data.bell.x, data.bell.y);
    await page.waitForFunction(attempt => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().puzzleAttempts === attempt + 1, data.attempt);
    if (waitForNext) await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return !s.bellPuzzle || s.bellPuzzle.phase === 'building';
    });
}

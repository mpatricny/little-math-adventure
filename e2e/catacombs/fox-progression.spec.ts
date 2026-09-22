import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

const foxOwner = { unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'], activePet: 'pet_catacomb_A' };
const shot = (page: Page, name: string) => page.screenshot({ path: `artifacts/fox-progression/${name}.png` });

async function clickPoint(page: Page, point: { x: number; y: number }) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
}

async function clickHost(page: Page, id: string) {
    await clickPoint(page, await page.evaluate(id => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        const host = s.sceneBuilder.get(id);
        return { x: host.x, y: host.y };
    }, id));
}

async function startTrial(page: Page, examType: string) {
    await page.evaluate(examType => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.scene.getScenes(true).at(-1).scene.start('CatacombTrialScene', { examType, subAtomId: 'A1' });
    }, examType);
    await waitForScene(page, 'CatacombTrialScene');
    await clickHost(page, 'catacombPrimary');
}

async function passTrial(page: Page) {
    while (true) {
        await page.waitForFunction(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            return s.phase === 'victory' || (s.phase === 'charging' && !s.mathBoard.answered);
        });
        const state = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            return { phase: s.phase, answer: s.currentProblem.choices.indexOf(s.currentProblem.answer) + 1 };
        });
        if (state.phase === 'victory') break;
        await clickHost(page, `catacombAnswer${state.answer}`);
    }
}

async function startBattle(page: Page) {
    await page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        game.scene.getScenes(true).at(-1).scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
    });
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.battleState.enemies.forEach((e: any) => { e.hp = e.maxHp = 1000; e.defense = 2; });
    });
}

async function petAttack(page: Page, owner: 'A' | 'B', power: number, name: string) {
    await page.evaluate(async owner => {
        const { ProblemDatabase } = await import('/src/systems/ProblemDatabase.ts');
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        b.setPhase(owner === 'A' ? 'pet_turn' : 'pet_b_turn');
        // Fix only the exercise draw after switching owner; exercise the complete attack path.
        const key = ProblemDatabase.getInstance().getProblemsForForm('A1', 'result_unknown')[0].key;
        b.getCoopSafeMasterySystem().drawFromReviewPool = () => [key];
    }, owner);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleActionDock.petBadge.text.text)).toBe(String(power));
    await shot(page, `${name}-dock`);
    await clickPoint(page, await page.evaluate(() => {
        const root = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleActionDock.petRoot;
        return { x: root.x, y: root.y };
    }));
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
    const before = await page.evaluate(() => {
        const b = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const p = b.petMathProblem;
        const bounds = b.mathBoard.problemRows[0].buttons[p.choices.indexOf(p.answer)].getBounds();
        return { hp: b.battleState.enemies[0].hp, power: p.damageMultiplier, x: bounds.centerX, y: bounds.centerY };
    });
    expect(before.power).toBe(power);
    await shot(page, `${name}-problem`);
    await clickPoint(page, before);
    await expect.poll(() => page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.enemies[0].hp)).toBe(before.hp - (power - 2));
    // Wait for the real attack return before starting the next owner's turn.
    await page.waitForFunction(() => !['pet_attack', 'pet_b_attack', 'pet_math', 'pet_b_math'].includes((window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase));
}

for (const renderer of ['canvas', 'webgl']) test(`fox gains +1 on repeated fluency/mastery runs, reloads and attacks: ${renderer}`, async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { ...foxOwner, catacombPetUpgrades: { A: 2, B: 4 } });
    if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
    for (const [index, exam] of ['fluency_challenge', 'mastery_challenge'].entries()) {
        await startTrial(page, exam);
        await passTrial(page);
        const reward = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            const body = s.mathBoard.modal.list.find((o: any) => o.name === 'catacombBody');
            const stats = s.mathBoard.modal.list.find((o: any) => o.name === 'catacombStats');
            return { body: body.text, fits: [body, stats].every(t => {
                const host = s.sceneBuilder.getElementDef(t.name), bounds = t.getBounds();
                return bounds.width <= host.width && bounds.height <= host.height && t.frame.source.resolution === 2;
            }), saved: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxBonus };
        });
        expect(reward).toEqual({ body: `Útok +1\n${10 + index} → ${11 + index}`, fits: true, saved: 5 + index });
        await shot(page, `${renderer}-reward-${index + 1}`);
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.waitForTimeout(250);
        await shot(page, `${renderer}-reward-${index + 1}-tablet`);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            s.onVictory(); s.onVictory(); // Duplicate animation completion cannot pay twice.
        });
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.catacombFoxBonus)).toBe(5 + index);
        await clickHost(page, 'catacombPrimary');
        await waitForScene(page, 'GuildScene');
    }

    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    expect(await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        return GameStateManager.getInstance().getPlayer().catacombFoxBonus;
    })).toBe(6);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('PythiaWorkshopScene'));
    await waitForScene(page, 'PythiaWorkshopScene');
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene;
        const row = s.petRows.find((r: any) => r.pet?.id === 'pet_catacomb_A');
        return row.container.getData('textObjects').get('1770151305912-jgyluh2pg').text.text;
    })).toBe('12x');
    await shot(page, `${renderer}-workshop`);
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.PythiaWorkshopScene.scene.start('TownScene'));
    await waitForScene(page, 'TownScene');
    const book = await page.evaluate(async () => {
        const { WalkingSceneHud } = await import('/src/ui/WalkingSceneHud.ts');
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        return (WalkingSceneHud.prototype as any).createPlayerView.call({ scene: (window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene }, GameStateManager.getInstance().getPlayer());
    });
    expect(book.petAttack).toBe(12);
    await startBattle(page);
    await petAttack(page, 'A', 12, `${renderer}-trained-fox`);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.cache.json.get('pets').find((p: any) => p.id === 'pet_catacomb_A').damageMultiplier)).toBe(6);
});

test('co-op foxes keep their owners’ saved attack and subtract enemy defense once', async ({ page }) => {
    await openSeededGame(page, true, {}, {}, { ...foxOwner, catacombFoxBonus: 2 }, { ...foxOwner, catacombFoxBonus: 7 });
    await activateCoopSession(page);
    await startBattle(page);
    await petAttack(page, 'A', 8, 'coop-A');
    await petAttack(page, 'B', 13, 'coop-B');
    expect(await page.evaluate(() => [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).player.catacombFoxBonus))).toEqual([2, 7]);
});

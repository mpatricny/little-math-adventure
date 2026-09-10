import { test, expect, openSeededGame, activateCoopSession, startArenaPreview, startBattleFromPreview, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';
import { writeFile } from 'node:fs/promises';

const out = 'artifacts/coop-guild';
async function clickGame(page: Page, p: {x: number; y: number}) {
    const box = await page.locator('#game-container canvas').boundingBox();
    if (!box) throw new Error('Missing canvas');
    await page.mouse.click(box.x + p.x * box.width / 1280, box.y + p.y * box.height / 720);
}
async function texts(page: Page) {
    return page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const walk = (nodes: any[], visible = true): string[] => nodes.flatMap(o => {
            const shown = visible && o.visible !== false && o.alpha !== 0;
            return shown ? [typeof o.text === 'string' ? o.text : '', ...walk(o.list ?? [], shown)].filter(Boolean) : [];
        });
        return walk(game.scene.getScenes(true).at(-1).children.list);
    });
}
async function hostClick(page: Page, id: string) {
    await clickGame(page, await page.evaluate(id => {
        const scene = (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const object = scene.sceneBuilder.get(id);
        return {x: object.x, y: object.y};
    }, id));
}

test('real co-op answers appear for both players in the guild', async ({page}) => {
    page.on('pageerror', error => console.log('LIVE_PAGE_ERROR', error.message));
    const buildings = ['arena-building', 'guild'];
    await openSeededGame(page, true, {}, {}, {
        townProgress: { unlockedBuildings: buildings, revealedBuildings: buildings, visitedBuildings: buildings, totalWavesCompleted: 0, wavesAfterForgeUnlock: 0 },
    });
    await activateCoopSession(page);
    const clicked: Record<string, number> = { A: 0, B: 0 };
    const answerLog: any[] = [];
    for (let wave = 0; wave < 2; wave++) {
        await startArenaPreview(page, { arenaLevel: 1, wave, encounterId: `arena-1-wave-${wave + 1}` });
        await startBattleFromPreview(page);
        console.log('BATTLE_STARTED', wave + 1);
        const deadline = Date.now() + 70_000;
        while (Date.now() < deadline) {
            const state = await page.evaluate(() => {
                const game = (window as any).__LITTLE_MATH_GAME__;
                if (game.scene.isActive('VictoryScene')) return {done: true};
                const b = game.scene.keys.BattleScene;
                const board = b.mathBoard;
                const row = board?.problemRows[board.currentProblemIndex];
                const button = row?.buttons.find((o: any) => o.getData('isCorrect') && o.getData('bg')?.input?.enabled);
                if (board?.container.visible && button) {
                    const bounds = button.getBounds();
                    return {kind: 'answer', x: bounds.centerX, y: bounds.centerY, player: b.coopSession.getActivePlayer(), problem: board.problems[board.currentProblemIndex], phase: b.battleState.phase};
                }
                if (['player_turn', 'player_b_turn'].includes(b.battleState.phase)) {
                    const root = b.battleActionDock.attackRoot;
                    return {kind: 'attack', x: root.x, y: root.y};
                }
                return {phase: b.battleState.phase};
            });
            if (state.done) break;
            if (state.kind) {
                console.log('ACTION', state.kind, state.player, state.phase);
                await clickGame(page, state as {x:number; y:number});
                if (state.kind === 'answer') {
                    clicked[state.player!]++;
                    answerLog.push({player: state.player, phase: state.phase, problem: state.problem});
                }
            }
            await page.waitForTimeout(550);
        }
        await waitForScene(page, 'VictoryScene');
        console.log('VICTORY', wave + 1, clicked);
        await page.waitForTimeout(2100);
        await page.screenshot({path: `${out}/victory-${wave + 1}.png`});
        console.log('VICTORY_TEXT', await texts(page));
        await page.keyboard.press('Space');
        console.log('AFTER_CONTINUE', await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.getScenes(true).map((s: any) => s.scene.key)));
        await waitForScene(page, 'ArenaScene');
    }
    expect(clicked.A).toBeGreaterThan(0);
    expect(clicked.B).toBeGreaterThan(0);
    // Return to the guild after real battles; scene navigation does not modify learning data.
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.ArenaScene.scene.start('GuildScene'));
    await waitForScene(page, 'GuildScene');
    await page.waitForTimeout(700);
    const guildA = await texts(page);
    await page.screenshot({path: `${out}/guild-ada.png`});
    expect(guildA).toContain('Ada');
    expect(guildA.some(t => t.includes(`${clicked.A}/20 správně`))).toBe(true);
    const switchHost = await page.evaluate(() => {
        const host = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.sceneBuilder.get('coopSwitchHost');
        return {x: host.x + 80, y: host.y};
    });
    await clickGame(page, switchHost);
    await expect.poll(() => texts(page)).toContain('Borek');
    await page.waitForTimeout(700);
    const guildB = await texts(page);
    await page.screenshot({path: `${out}/guild-borek.png`});
    expect(guildB.some(t => t.includes(`${clicked.B}/20 správně`))).toBe(true);
    await hostClick(page, 'dailyProgressButtonHost');
    await page.waitForTimeout(700);
    const daily = await texts(page);
    await page.screenshot({path: `${out}/daily-coop.png`});
    expect(daily).toContain('DNES · CO-OP');
    expect(daily).toContain(String(clicked.A + clicked.B));
    const saves = await page.evaluate(() => [0,1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!)));
    for (const [i, player] of ['A','B'].entries()) {
        expect(saves[i].mathStats.totalAttempts).toBe(clicked[player]);
        expect(saves[i].mathStats.masteryData.globalSolveSequence).toBe(clicked[player]);
    }
    await writeFile(`${out}/report.json`, JSON.stringify({clicked, answerLog, guildA, guildB, daily, stats: saves.map(s => s.mathStats)}, null, 2));
    console.log('COOP_GUILD_VERIFIED', JSON.stringify({clicked, guildA, guildB, daily}));
});

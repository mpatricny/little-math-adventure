import type { Page } from 'playwright/test';
import {
    activateCoopSession,
    expect,
    openSeededGame,
    test,
    waitForScene,
} from '../arena/helpers/arena-harness';

const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

async function startShop(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const source = game.scene.getScenes(true).at(-1);
        source.scene.start('ShopScene');
    }, GAME_GLOBAL);
    await waitForScene(page, 'ShopScene');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const shop = game.scene.keys.ShopScene as any;
        return Boolean(shop?.preparationOverlay && shop?.prepButtons?.sword);
    }, GAME_GLOBAL);
}

async function startBattle(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const source = game.scene.getScenes(true).at(-1);
        const baseEnemy = source.cache.json.get('enemies')[0];
        source.scene.start('BattleScene', {
            enemyDefs: [{ ...baseEnemy, hp: 20, attack: 2, goldReward: [0, 0] }],
        });
    }, GAME_GLOBAL);
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        return game.scene.keys.BattleScene?.battleState?.phase === 'player_turn';
    }, GAME_GLOBAL);
}

async function clickGamePoint(page: Page, point: { x: number; y: number }): Promise<void> {
    const canvas = page.locator('#game-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Phaser canvas is not visible');
    await page.mouse.click(
        box.x + (point.x / 1280) * box.width,
        box.y + (point.y / 720) * box.height,
    );
}

async function clickShopPrepButton(page: Page, kind: 'sword' | 'shield'): Promise<void> {
    const point = await page.evaluate(({ globalName, prepKind }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const root = game.scene.keys.ShopScene.prepButtons[prepKind].root;
        const bounds = root.getBounds();
        return { x: bounds.centerX, y: bounds.centerY };
    }, { globalName: GAME_GLOBAL, prepKind: kind });
    await clickGamePoint(page, point);
}

async function answerCurrentPreparationCorrectly(page: Page): Promise<void> {
    await page.waitForTimeout(25);
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const overlay = game.scene.keys.ShopScene.preparationOverlay as any;
        const problem = overlay.sampleProblems[overlay.attemptsCompleted];
        const correctChoice = problem.choices.findIndex((choice: number) => choice === problem.answer);
        overlay.mathBoard.submitChoice(correctChoice);
    }, GAME_GLOBAL);
}

async function answerCurrentPreparationWrongly(page: Page): Promise<void> {
    await page.waitForTimeout(25);
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const overlay = game.scene.keys.ShopScene.preparationOverlay as any;
        const problem = overlay.sampleProblems[overlay.attemptsCompleted];
        const wrongChoice = problem.choices.findIndex((choice: number) => choice !== problem.answer);
        overlay.mathBoard.submitChoice(wrongChoice);
    }, GAME_GLOBAL);
}

async function finishCurrentBattleAttackCorrectly(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        game.scene.keys.BattleScene.turnManager.setPhase('player_math');
    }, GAME_GLOBAL);

    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        return game.scene.keys.BattleScene?.battleState?.currentProblems?.length > 0;
    }, GAME_GLOBAL);

    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        const problems = battle.battleState.currentProblems;
        const baseDamage = problems.reduce(
            (sum: number, problem: any) => sum + (problem.damageMultiplier || 1),
            0,
        );
        battle.onMathComplete(
            baseDamage,
            problems.map(() => true),
            problems.map(() => 1000),
        );
    }, GAME_GLOBAL);
}

test.describe('shop battle preparation', () => {
    test('gear gates preparation and three correct attempts persist three sword charges', async ({ page }) => {
        await openSeededGame(page, false, {}, {}, {
            equippedWeapon: 'sword_wooden',
            equippedShield: null,
        });
        await startShop(page);

        const availability = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const shop = game.scene.keys.ShopScene as any;
            return {
                sword: shop.prepButtons.sword.enabled,
                shield: shop.prepButtons.shield.enabled,
            };
        }, GAME_GLOBAL);
        expect(availability).toEqual({ sword: true, shield: false });

        await clickShopPrepButton(page, 'sword');
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.waitForFunction(({ globalName, expectedAttempt }) => {
                const game = (globalThis as Record<string, any>)[globalName];
                const root = game.scene.keys.ShopScene.preparationOverlay.root;
                return root.getData('phase') === 'training'
                    && root.getData('attemptsCompleted') === expectedAttempt - 1
                    && root.getData('activeProblemIndex') === expectedAttempt - 1;
            }, { globalName: GAME_GLOBAL, expectedAttempt: attempt });
            await answerCurrentPreparationCorrectly(page);
        }

        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.ShopScene.preparationOverlay.root.getData('phase') === 'complete';
        }, GAME_GLOBAL);

        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            game.scene.keys.ShopScene.preparationOverlay.close(true);
        }, GAME_GLOBAL);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const shop = game.scene.keys.ShopScene as any;
            const attempts = Object.values(shop.gameState.getMasteryData().problemRecords)
                .flatMap((record: any) => record.attempts)
                .filter((attempt: any) => attempt.context === 'shop_prep_sword');
            return {
                preparation: shop.gameState.getPlayer().preparation,
                buttonEnabled: shop.prepButtons.sword.enabled,
                indicatorCount: shop.prepStatus.sword.root.getData('count'),
                attempts: attempts.map((attempt: any) => ({
                    correct: attempt.correct,
                    responseTimeMs: attempt.responseTimeMs,
                })),
            };
        }, GAME_GLOBAL);

        expect(result.preparation).toEqual({ kind: 'sword', charges: 3 });
        expect(result.buttonEnabled).toBe(false);
        expect(result.indicatorCount).toBe(3);
        expect(result.attempts).toHaveLength(3);
        expect(result.attempts.every((attempt) => attempt.correct)).toBe(true);
        expect(result.attempts.every((attempt) => attempt.responseTimeMs > 0)).toBe(true);

        if (process.env.PREPARATION_SCREENSHOT) {
            await page.screenshot({ path: process.env.PREPARATION_SCREENSHOT });
        }
    });

    test('a sword charge adds one damage and is persisted as consumed', async ({ page }) => {
        await openSeededGame(page, false, {}, {}, {
            attack: 1,
            equippedWeapon: 'sword_wooden',
            preparation: { kind: 'sword', charges: 3 },
        });
        await startBattle(page);
        await finishCurrentBattleAttackCorrectly(page);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            return {
                damage: battle.battleState.damageDealt,
                preparation: battle.gameState.getPlayer().preparation,
                indicatorCount: battle.preparationIndicatorA.root.getData('count'),
            };
        }, GAME_GLOBAL);

        // One base problem + one wooden-sword problem + one preparation damage.
        expect(result.damage).toBe(3);
        expect(result.preparation).toEqual({ kind: 'sword', charges: 2 });
        expect(result.indicatorCount).toBe(2);
    });

    test('wrong answers add fresh attempts without granting a corrected solve or free charge', async ({ page }) => {
        await openSeededGame(page, false, {}, {}, {
            equippedShield: 'shield_wooden',
        });
        await startShop(page);
        await clickShopPrepButton(page, 'shield');

        for (let attempt = 1; attempt <= 5; attempt++) {
            await page.waitForFunction(({ globalName, expectedAttempt }) => {
                const game = (globalThis as Record<string, any>)[globalName];
                const root = game.scene.keys.ShopScene.preparationOverlay.root;
                return root.getData('phase') === 'training'
                    && root.getData('attemptsCompleted') === expectedAttempt - 1
                    && root.getData('activeProblemIndex') === expectedAttempt - 1;
            }, { globalName: GAME_GLOBAL, expectedAttempt: attempt });
            await answerCurrentPreparationWrongly(page);
        }

        await page.waitForFunction((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            return game.scene.keys.ShopScene.preparationOverlay.root.getData('phase') === 'complete';
        }, GAME_GLOBAL);
        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            game.scene.keys.ShopScene.preparationOverlay.close(true);
        }, GAME_GLOBAL);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const shop = game.scene.keys.ShopScene as any;
            const attempts = Object.values(shop.gameState.getMasteryData().problemRecords)
                .flatMap((record: any) => record.attempts)
                .filter((attempt: any) => attempt.context === 'shop_prep_shield');
            return {
                preparation: shop.gameState.getPlayer().preparation,
                attempts: attempts.map((attempt: any) => attempt.correct),
                plannedAttempts: shop.preparationOverlay.root.getData('plannedAttempts'),
                resultCharges: shop.preparationOverlay.resultCharges,
            };
        }, GAME_GLOBAL);

        expect(result.preparation).toEqual({ kind: null, charges: 0 });
        expect(result.attempts).toEqual([false, false, false, false, false]);
        expect(result.plannedAttempts).toBe(5);
        expect(result.resultCharges).toBe(0);
    });

    test('a shield charge blocks one otherwise unblocked damage', async ({ page }) => {
        await openSeededGame(page, false, {}, {}, {
            equippedShield: 'shield_wooden',
            preparation: { kind: 'shield', charges: 3 },
        });
        await startBattle(page);

        await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            battle.startBlockPhase(2);
            battle.onMathComplete(0, [false], [1200]);
        }, GAME_GLOBAL);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            return {
                hp: battle.battleState.playerHp,
                blocked: battle.blockCorrectCount,
                preparation: battle.gameState.getPlayer().preparation,
                indicatorCount: battle.preparationIndicatorA.root.getData('count'),
            };
        }, GAME_GLOBAL);

        expect(result.hp).toBe(19);
        expect(result.blocked).toBe(1);
        expect(result.preparation).toEqual({ kind: 'shield', charges: 2 });
        expect(result.indicatorCount).toBe(2);
    });

    test('co-op keeps each player preparation and HUD indicator isolated', async ({ page }) => {
        await openSeededGame(
            page,
            true,
            {},
            {},
            {
                equippedWeapon: 'sword_wooden',
                preparation: { kind: 'sword', charges: 2 },
            },
            {
                equippedShield: 'shield_wooden',
                preparation: { kind: 'shield', charges: 3 },
            },
        );
        await activateCoopSession(page);
        await startBattle(page);

        const result = await page.evaluate((globalName) => {
            const game = (globalThis as Record<string, any>)[globalName];
            const battle = game.scene.keys.BattleScene as any;
            return {
                playerA: {
                    kind: battle.preparationIndicatorA.root.getData('kind'),
                    count: battle.preparationIndicatorA.root.getData('count'),
                },
                playerB: {
                    kind: battle.preparationIndicatorB.root.getData('kind'),
                    count: battle.preparationIndicatorB.root.getData('count'),
                },
            };
        }, GAME_GLOBAL);

        expect(result.playerA).toEqual({ kind: 'sword', count: 2 });
        expect(result.playerB).toEqual({ kind: 'shield', count: 3 });
    });
});

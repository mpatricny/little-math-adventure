import { expect, test as base, type Page } from 'playwright/test';

type RuntimeErrorFixtures = {
    runtimeErrors: string[];
};

/**
 * Every arena test fails on browser exceptions and console.error calls.
 * Warnings stay visible in Playwright output but do not fail the test.
 */
export const test = base.extend<RuntimeErrorFixtures>({
    runtimeErrors: [async ({ page }, use) => {
        const errors: string[] = [];
        const knownBaselineErrors = [
            'Failed to process file: %s "%s" image 301427c3-4d83-42de-9657-a98dd8ea53cf',
            'Failed to process file: %s "%s" spritesheet knight-walk-sheet',
            'Failed to process file: %s "%s" spritesheet knight-defend-sheet',
            'Failed to process file: %s "%s" spritesheet boy-knight-defend-sheet',
            'Texture key already in use: gemstone-icons-cropped-cropped',
        ];

        page.on('pageerror', error => {
            errors.push(`pageerror: ${error.message}`);
        });
        page.on('console', message => {
            if (message.type() === 'error') {
                if (knownBaselineErrors.some(known => message.text().includes(known))) {
                    return;
                }
                const location = message.location();
                const suffix = location.url
                    ? ` (${location.url}${location.lineNumber ? `:${location.lineNumber}` : ''})`
                    : '';
                errors.push(`console.error: ${message.text()}${suffix}`);
            }
        });

        await use(errors);

        expect(errors, `Unexpected browser/runtime errors:\n${errors.join('\n')}`).toEqual([]);
    }, { auto: true }],
});

export { expect };

export interface ArenaTarget {
    arenaLevel: number;
    wave: number;
    encounterId: string;
}

export interface RosterEntry {
    id: string;
    hp: number;
    battleHp?: number;
    battleMaxHp?: number;
}

interface SaveSlotFixture {
    player: Record<string, unknown>;
    mathStats: Record<string, unknown>;
    timestamp: number;
}

const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

function makeSaveSlot(
    name: string,
    characterType: 'girl_knight' | 'boy_knight',
    arenaOverrides: Record<string, unknown> = {},
    playerOverrides: Record<string, unknown> = {},
): SaveSlotFixture {
    const maxHp = 20;

    return {
        player: {
            name,
            characterType,
            level: 1,
            hp: maxHp,
            maxHp,
            coins: { copper: 0, silver: 0, gold: 0, pouch: 0 },
            diamonds: { common: 0, red: 0, green: 0 },
            status: 'healthy',
            attack: 5,
            attackPowerVersion: 1,
            defense: 0,
            equippedWeapon: null,
            equippedArmor: null,
            equippedShield: null,
            equippedHelmet: null,
            potions: 0,
            hasPotionSubscription: false,
            pet: null,
            unlockedPets: [],
            perfectDefeats: [],
            ownedPets: [],
            activePet: null,
            arena: {
                isActive: false,
                arenaLevel: 1,
                currentBattle: 0,
                playerHpAtStart: maxHp,
                completedArenaLevels: [],
                waveResults: [],
                ...arenaOverrides,
            },
            crystals: { crystals: [], maxCapacity: 60 },
            mana: 0,
            groundCrystals: [],
            defeatedBosses: [],
            townProgress: {
                unlockedBuildings: ['arena-building'],
                revealedBuildings: ['arena-building'],
                visitedBuildings: ['arena-building'],
                totalWavesCompleted: 0,
                wavesAfterForgeUnlock: 0,
            },
            ...playerOverrides,
        },
        mathStats: {
            totalAttempts: 0,
            correctAnswers: 0,
            recentResults: [],
            currentDifficulty: 1,
            highestDifficulty: 1,
            problemStats: {},
            currentPool: [],
            poolCycle: 0,
            dailyAttempts: 0,
            lastAttemptDate: '',
        },
        timestamp: Date.now(),
    };
}

/** Seeds deterministic saves before application JavaScript constructs its singletons. */
export async function openSeededGame(
    page: Page,
    coop = false,
    arenaOverrides: Record<string, unknown> = {},
    playerBArenaOverrides: Record<string, unknown> = arenaOverrides,
    playerOverrides: Record<string, unknown> = {},
    playerBOverrides: Record<string, unknown> = playerOverrides,
): Promise<void> {
    const slots = [makeSaveSlot('Ada', 'girl_knight', arenaOverrides, playerOverrides)];
    if (coop) slots.push(makeSaveSlot('Borek', 'boy_knight', playerBArenaOverrides, playerBOverrides));

    await page.addInitScript(({ seededSlots }) => {
        // A reload regression can opt into retaining the saves it just exercised.
        if (sessionStorage.getItem('lma-e2e-preserve-saves') === 'true') return;
        localStorage.clear();
        seededSlots.forEach((slot, index) => {
            localStorage.setItem(`littleMathAdventure_slot_${index}`, JSON.stringify(slot));
        });
        localStorage.setItem('littleMathAdventure_activeSlot', '0');
    }, { seededSlots: slots });

    await page.goto('/');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        return Boolean(game?.isBooted && game.scene?.isActive('MenuScene'));
    }, GAME_GLOBAL, { timeout: 30_000 });
}

export async function waitForScene(page: Page, sceneKey: string): Promise<void> {
    await page.waitForFunction(({ globalName, key }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        return Boolean(game?.scene?.keys?.[key] && game.scene.isActive(key));
    }, { globalName: GAME_GLOBAL, key: sceneKey });
}

/**
 * Starts the real co-op singleton through CoopSetupScene. This deliberately keeps
 * the private setup detail in one helper until a narrow public E2E bootstrap exists.
 */
export async function activateCoopSession(page: Page, resumeScene = 'TownScene'): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const activeScenes = game.scene.getScenes(true);
        const source = activeScenes[activeScenes.length - 1];
        if (!source) throw new Error('No active Phaser scene can open CoopSetupScene');
        source.scene.start('CoopSetupScene');
    }, GAME_GLOBAL);
    await waitForScene(page, 'CoopSetupScene');

    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const setup = game.scene.keys.CoopSetupScene as any;
        setup.player1Slot = 0;
        setup.player2Slot = 1;
        setup.onStartClicked();
    }, GAME_GLOBAL);
    await waitForScene(page, resumeScene);
}

/** Starts an arena preview through Phaser's SceneManager, with ID plus legacy coordinates. */
export async function startArenaPreview(page: Page, target: ArenaTarget): Promise<void> {
    await page.evaluate(({ globalName, arenaTarget }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const activeScenes = game.scene.getScenes(true);
        const source = activeScenes[activeScenes.length - 1];
        if (!source) throw new Error('No active Phaser scene can open ArenaScene');
        source.scene.start('ArenaScene', {
            arenaLevel: arenaTarget.arenaLevel,
            wave: arenaTarget.wave,
            encounterId: arenaTarget.encounterId,
        });
    }, { globalName: GAME_GLOBAL, arenaTarget: target });

    await waitForScene(page, 'ArenaScene');
    await page.waitForFunction(({ globalName, expectedId }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        return arena?.encounterId === expectedId && Array.isArray(arena.enemyDefs);
    }, { globalName: GAME_GLOBAL, expectedId: target.encounterId });
}

/** Opens ArenaScene without a forced target so the production choice selector decides. */
export async function startDefaultArenaPreview(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const activeScenes = game.scene.getScenes(true);
        const source = activeScenes[activeScenes.length - 1];
        if (!source) throw new Error('No active Phaser scene can open ArenaScene');
        source.scene.start('ArenaScene', {});
    }, GAME_GLOBAL);

    await waitForScene(page, 'ArenaScene');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        return Boolean(arena?.arenaChoiceId && Array.isArray(arena.arenaChoices));
    }, GAME_GLOBAL);
}

/**
 * Exercises the legacy arenaLevel + wave entry path without an encounterId.
 * The decoy roster must be ignored; BattleScene has to resolve encounters.json.
 */
export async function startArenaBattleFromCoordinates(
    page: Page,
    target: Pick<ArenaTarget, 'arenaLevel' | 'wave'>,
    decoyEnemyId: string,
): Promise<void> {
    await page.evaluate(({ globalName, arenaTarget, decoyId }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const activeScenes = game.scene.getScenes(true);
        const source = activeScenes[activeScenes.length - 1];
        const decoy = source?.cache.json.get('enemies')
            ?.find((enemy: any) => enemy.id === decoyId);
        if (!source || !decoy) throw new Error('Cannot start coordinate-only arena battle');
        source.scene.start('BattleScene', {
            fromArena: true,
            arenaLevel: arenaTarget.arenaLevel,
            wave: arenaTarget.wave,
            enemyDefs: [decoy],
        });
    }, { globalName: GAME_GLOBAL, arenaTarget: target, decoyId: decoyEnemyId });

    await waitForScene(page, 'BattleScene');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        return battle?.battleState?.phase === 'player_turn';
    }, GAME_GLOBAL);
}

export async function getArenaSnapshot(page: Page): Promise<{
    encounterId: string | null;
    arenaLevel: number | null;
    arenaTitle: string | null;
    arenaChoiceId: string | null;
    arenaChoiceKind: string | null;
    arenaChoiceIds: string[];
    arenaChoiceStatus: string | null;
    highestUnlockedArenaLevel: number | null;
    currentWave: number | null;
    baseRoster: RosterEntry[];
    roster: RosterEntry[];
}> {
    return page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        const baseDefs = arena.baseEnemyDefs
            ?? arena.resolvedEncounter?.baseEnemyDefs
            ?? arena.resolvedEncounter?.baseEnemies
            ?? [];
        const defs = arena.enemyDefs ?? arena.resolvedEncounter?.enemyDefs ?? [];
        const frame = arena.sceneBuilder?.get('ARENA WITH TITLE');
        const titleEntries = frame?.getData('textObjects') as Map<string, { text: { text: string } }> | undefined;
        const arenaTitle = titleEntries
            ? Array.from(titleEntries.values())[0]?.text.text ?? null
            : null;
        const status = arena.sceneBuilder?.get('arenaOptionStatus');
        const player = arena.gameState?.getPlayer?.();

        return {
            encounterId: arena.encounterId
                ?? arena.currentEncounterId
                ?? arena.resolvedEncounter?.encounterId
                ?? arena.resolvedEncounter?.id
                ?? null,
            arenaLevel: Number.isInteger(arena.arenaLevel) ? arena.arenaLevel : null,
            arenaTitle,
            arenaChoiceId: arena.arenaChoiceId ?? null,
            arenaChoiceKind: arena.arenaChoiceKind ?? null,
            arenaChoiceIds: (arena.arenaChoices ?? []).map((choice: any) => choice.id),
            arenaChoiceStatus: status?.text ?? null,
            highestUnlockedArenaLevel: Number.isInteger(player?.arena?.arenaLevel)
                ? player.arena.arenaLevel
                : null,
            currentWave: Number.isInteger(arena.currentWave) ? arena.currentWave : null,
            baseRoster: baseDefs.map((def: any) => ({ id: def.id, hp: def.hp })),
            roster: defs.map((def: any) => ({ id: def.id, hp: def.hp })),
        };
    }, GAME_GLOBAL);
}

/** Clicks the real SceneBuilder carousel arrow and waits for ArenaScene to restart. */
export async function switchArenaChoice(
    page: Page,
    direction: 'previous' | 'next' = 'next',
): Promise<void> {
    const target = await page.evaluate(({ globalName, arrowId }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        const arrow = arena.sceneBuilder?.get(arrowId);
        if (!arrow?.visible) throw new Error(`Arena choice arrow ${arrowId} is missing or hidden`);
        const bounds = arrow.getBounds?.();
        return {
            previousChoiceId: arena.arenaChoiceId,
            x: bounds ? bounds.centerX : arrow.x,
            y: bounds ? bounds.centerY : arrow.y,
            gameWidth: Number(game.scale.width),
            gameHeight: Number(game.scale.height),
        };
    }, {
        globalName: GAME_GLOBAL,
        arrowId: direction === 'next' ? 'arenaOptionNext' : 'arenaOptionPrevious',
    });

    const canvas = page.locator('#game-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Phaser canvas is not visible');
    await page.mouse.click(
        box.x + (target.x / target.gameWidth) * box.width,
        box.y + (target.y / target.gameHeight) * box.height,
    );

    await page.waitForFunction(({ globalName, previousChoiceId }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        return Boolean(
            game.scene.isActive('ArenaScene')
            && arena?.arenaChoiceId
            && arena.arenaChoiceId !== previousChoiceId,
        );
    }, { globalName: GAME_GLOBAL, previousChoiceId: target.previousChoiceId });
}

/** Clicks the real SceneBuilder start button at its runtime position on the canvas. */
export async function startBattleFromPreview(page: Page): Promise<void> {
    const clickTarget = await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        const button = arena.sceneBuilder?.get('startBattleButton') ?? arena.startBattleButton;
        if (!button?.visible) throw new Error('Arena start button is missing or hidden');

        const bounds = button.getBounds?.();
        return {
            x: bounds ? bounds.centerX : button.x,
            y: bounds ? bounds.centerY : button.y,
            gameWidth: Number(game.scale.width),
            gameHeight: Number(game.scale.height),
        };
    }, GAME_GLOBAL);

    const canvas = page.locator('#game-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Phaser canvas is not visible');

    await page.mouse.click(
        box.x + (clickTarget.x / clickTarget.gameWidth) * box.width,
        box.y + (clickTarget.y / clickTarget.gameHeight) * box.height,
    );

    await waitForScene(page, 'BattleScene');
    await page.waitForFunction((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        return battle?.battleState?.phase === 'player_turn';
    }, GAME_GLOBAL);
}

export async function getBattleSnapshot(page: Page): Promise<{
    encounterId: string | null;
    fromArena: boolean;
    arenaLevel: number;
    arenaWave: number;
    roster: RosterEntry[];
    coinReward: number;
}> {
    return page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        const defs = battle.enemyDefs ?? battle.resolvedEncounter?.enemyDefs ?? [];
        const battleEnemies = battle.battleState?.enemies ?? [];

        // Retain a test-only reference so progress can be inspected after BattleScene shuts down.
        if (battle.coopSession) {
            (globalThis as Record<string, any>).__ARENA_E2E_COOP_SESSION__ = battle.coopSession;
        }

        return {
            encounterId: battle.encounterId
                ?? battle.resolvedEncounter?.encounterId
                ?? battle.resolvedEncounter?.id
                ?? null,
            fromArena: Boolean(battle.fromArena),
            arenaLevel: battle.arenaLevel,
            arenaWave: battle.arenaWave,
            coinReward: battle.rollBattleCoinReward(),
            roster: defs.map((def: any, index: number) => ({
                id: def.id,
                hp: def.hp,
                battleHp: battleEnemies[index]?.hp,
                battleMaxHp: battleEnemies[index]?.maxHp,
            })),
        };
    }, GAME_GLOBAL);
}

/** Uses BattleScene's built-in debug victory path after the real battle has started. */
export async function winBattleToVictory(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        if (!battle?.scene?.isActive()) throw new Error('BattleScene is not active');
        battle.debugInstantWin();
    }, GAME_GLOBAL);
    await waitForScene(page, 'VictoryScene');
}

/** Records a non-perfect attempt without bypassing BattleScene's real reward flow. */
export async function markBattleAttemptImperfect(page: Page): Promise<void> {
    await page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const battle = game.scene.keys.BattleScene as any;
        if (!battle?.scene?.isActive()) throw new Error('BattleScene is not active');
        battle.waveWrongAnswerCount = Math.max(1, battle.waveWrongAnswerCount ?? 0);
    }, GAME_GLOBAL);
}

export async function getVictorySnapshot(page: Page): Promise<{
    arenaCompleted: boolean;
    crystalLabels: string[];
    crystalDropCount: number;
    completedArenaLevels: number[];
}> {
    return page.evaluate((globalName) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const victory = game.scene.keys.VictoryScene as any;
        const player = victory.gameState.getPlayer();
        return {
            arenaCompleted: Boolean(victory.victoryData?.arenaCompleted),
            crystalLabels: [...(victory.victoryData?.crystalLabels ?? [])],
            crystalDropCount: victory.victoryData?.crystalDrops?.length ?? 0,
            completedArenaLevels: [...(player.arena.completedArenaLevels ?? [])],
        };
    }, GAME_GLOBAL);
}

/** Wins the active battle and follows VictoryScene's real continue shortcut. */
export async function winBattleAndContinue(page: Page): Promise<void> {
    await winBattleToVictory(page);

    // VictoryScene intentionally enables its Space shortcut after the reveal animation.
    await page.waitForTimeout(1_600);
    await page.keyboard.press('Space');
    await waitForScene(page, 'ArenaScene');
}

export async function getSoloProgress(
    page: Page,
    completedEncounterId: string,
    legacyWave: number,
): Promise<{
    previewEncounterId: string | null;
    currentBattle: number;
    result: any;
    totalWavesCompleted: number;
}> {
    return page.evaluate(({ globalName, encounterId, wave }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        const player = arena.gameState.getPlayer();
        const arenaState = player.arena;
        const result = arenaState.encounterResults?.[encounterId]
            ?? arenaState.waveResultsByEncounterId?.[encounterId]
            ?? arenaState.waveResults?.[wave]
            ?? null;

        return {
            previewEncounterId: arena.encounterId ?? arena.currentEncounterId ?? null,
            currentBattle: arenaState.currentBattle,
            result,
            totalWavesCompleted: player.townProgress?.totalWavesCompleted ?? 0,
        };
    }, {
        globalName: GAME_GLOBAL,
        encounterId: completedEncounterId,
        wave: legacyWave,
    });
}

export async function getCoopProgress(
    page: Page,
    completedEncounterId: string,
    legacyWave: number,
): Promise<{ playerA: any; playerB: any }> {
    return page.evaluate(({ globalName, encounterId, wave }) => {
        const game = (globalThis as Record<string, any>)[globalName];
        const arena = game.scene.keys.ArenaScene as any;
        const coop = (globalThis as Record<string, any>).__ARENA_E2E_COOP_SESSION__;
        if (!coop) throw new Error('Co-op session reference was not captured from BattleScene');

        const snapshotActivePlayer = () => {
            const player = arena.gameState.getPlayer();
            const state = player.arena;
            return {
                arenaLevel: state.arenaLevel,
                currentBattle: state.currentBattle,
                result: state.encounterResults?.[encounterId]
                    ?? state.waveResultsByEncounterId?.[encounterId]
                    ?? state.waveResults?.[wave]
                    ?? null,
                totalWavesCompleted: player.townProgress?.totalWavesCompleted ?? 0,
            };
        };

        coop.activatePlayerA();
        const playerA = snapshotActivePlayer();
        coop.activatePlayerB();
        const playerB = snapshotActivePlayer();
        coop.activatePlayerA();

        return { playerA, playerB };
    }, {
        globalName: GAME_GLOBAL,
        encounterId: completedEncounterId,
        wave: legacyWave,
    });
}

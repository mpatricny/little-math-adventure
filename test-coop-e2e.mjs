/**
 * Co-op browser regression harness.
 *
 * Verifies:
 * - co-op town keeps the Guild visible and exposes the mana collection entry
 * - co-op battle uses each hero's own attack, capped at three base problems
 * - mixed pets stay stable across Player A / Player B math turns
 * - casual co-op battle restores the original extra-enemy scaling for regular fights
 * - mana co-op uses lane-local fixed levels plus keyboard controls (X left / M right)
 * - mana lane actions restore the original active co-op player context
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

async function wait(ms) {
    await page.waitForTimeout(ms);
}

async function waitForGame() {
    await page.waitForFunction(() => !!globalThis.__LITTLE_MATH_GAME__);
}

async function waitForScene(sceneKey) {
    await page.waitForFunction((key) => {
        const game = globalThis.__LITTLE_MATH_GAME__;
        return !!game?.scene?.keys?.[key] && game.scene.isActive(key);
    }, sceneKey);
}

async function clickCanvas(x, y) {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) fail('Canvas not available');
    await canvas.click({ position: { x, y } });
}

async function getTownSnapshot() {
    return page.evaluate(() => {
        const town = globalThis.__LITTLE_MATH_GAME__.scene.keys.TownScene;
        return {
            guildVisible: town.sceneBuilder.get('guild')?.visible ?? false,
            guildLabelVisible: town.sceneBuilder.get('guild-label')?.visible ?? false,
        };
    });
}

async function openGuildFromTown() {
    await page.evaluate(() => {
        globalThis.__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('GuildScene');
    });
    await waitForScene('GuildScene');
}

async function getGuildSnapshot() {
    return page.evaluate(() => {
        const guild = globalThis.__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        const manaCollectionButton = guild.manaCollectionButton;
        const hasManaCollectionLabel = !!manaCollectionButton?.list?.some(
            (obj) => typeof obj?.text === 'string' && obj.text.includes('Sbírání many'),
        );

        return {
            hasManaCollectionButton: !!manaCollectionButton,
            hasManaCollectionLabel,
        };
    });
}

async function getBattleSnapshot() {
    return page.evaluate(() => {
        const battle = globalThis.__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        globalThis.__coopSession = battle.coopSession;
        return {
            playerAPet: battle.equippedPetDef?.id ?? null,
            playerBPet: battle.equippedPetBDef?.id ?? null,
            enemyCount: battle.enemyDefs.length,
            enemyHp: battle.enemyDefs[0]?.hp ?? null,
            phase: battle.battleState.phase,
        };
    });
}

async function getMathTurnSnapshot(turn) {
    return page.evaluate((targetTurn) => {
        const battle = globalThis.__LITTLE_MATH_GAME__.scene.keys.BattleScene;

        if (targetTurn === 'A') {
            battle.onAttackClicked();
        } else {
            battle.setPhase('player_b_turn');
            battle.onAttackClicked();
        }

        return {
            phase: battle.battleState.phase,
            activePlayer: battle.coopSession?.getActivePlayer(),
            problemCount: battle.battleState.currentProblems.length,
            playerAPet: battle.equippedPetDef?.id ?? null,
            playerBPet: battle.equippedPetBDef?.id ?? null,
        };
    }, turn);
}

async function startBattleFromTown() {
    await page.evaluate(() => {
        const game = globalThis.__LITTLE_MATH_GAME__;
        const town = game.scene.keys.TownScene;
        const enemy = town.cache.json.get('enemies').find(e => e.id === 'slime_green');
        town.scene.start('BattleScene', {
            enemyDefs: [enemy],
            returnScene: 'TownScene',
            returnData: {},
        });
    });
    await waitForScene('BattleScene');
    await page.waitForFunction(() => {
        const battle = globalThis.__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        return battle?.battleState?.phase === 'player_turn';
    });
}

async function startManaSceneFromGuild() {
    await page.evaluate(() => {
        const guild = globalThis.__LITTLE_MATH_GAME__.scene.keys.GuildScene;
        guild.scene.start('ManaCollectionScene', { returnScene: 'GuildScene' });
    });
    await waitForScene('ManaCollectionScene');
}

async function prepareManaLanes() {
    return page.evaluate(() => {
        const mana = globalThis.__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        mana.startGame();

        const laneA = mana.laneA;
        const laneB = mana.laneB;

        laneA.fallingTween?.stop();
        laneB.fallingTween?.stop();

        const correctA = laneA.answerSlots.find(slot => slot.isCorrect);
        const correctB = laneB.answerSlots.find(slot => slot.isCorrect);
        laneA.problemText.y = correctA.y;
        laneB.problemText.y = correctB.y;

        globalThis.__coopSession.activatePlayerA();
        const playerLevelA = mana.gameState.getPlayer().level;
        globalThis.__coopSession.activatePlayerB();
        const playerLevelB = mana.gameState.getPlayer().level;
        globalThis.__coopSession.activatePlayerB();

        return {
            playerLevelA,
            playerLevelB,
            fixedLevelA: laneA.mathEngine.fixedLevel,
            fixedLevelB: laneB.mathEngine.fixedLevel,
            firstPoolProblemA: laneA.manaPool[0]?.masteryKey ?? laneA.manaPool[0]?.id ?? null,
            firstPoolProblemB: laneB.manaPool[0]?.masteryKey ?? laneB.manaPool[0]?.id ?? null,
            activeBefore: globalThis.__coopSession.getActivePlayer(),
            laneAResults: laneA.getResults(),
            laneBResults: laneB.getResults(),
        };
    });
}

async function getManaSnapshot() {
    return page.evaluate(() => {
        const mana = globalThis.__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        return {
            activePlayer: globalThis.__coopSession.getActivePlayer(),
            laneAResults: mana.laneA.getResults(),
            laneBResults: mana.laneB.getResults(),
        };
    });
}

async function alignManaProblemsToCorrectSlots() {
    return page.evaluate(() => {
        const mana = globalThis.__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        for (const lane of [mana.laneA, mana.laneB]) {
            lane?.fallingTween?.stop();
            const correctSlot = lane?.answerSlots?.find(slot => slot.isCorrect);
            if (correctSlot) {
                lane.problemText.y = correctSlot.y;
            }
        }
    });
}

async function triggerManaGameOver() {
    return page.evaluate(() => {
        const mana = globalThis.__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;

        mana.laneA.fallingTween?.stop();
        mana.laneB.fallingTween?.stop();
        mana.laneA.lives = 1;
        mana.laneB.lives = 1;
        mana.laneA.onWrongAnswer();
        mana.laneB.onWrongAnswer();
    });
}

async function getManaGameOverSnapshot() {
    return page.evaluate(() => {
        const mana = globalThis.__LITTLE_MATH_GAME__.scene.keys.ManaCollectionScene;
        const overlayTexts = mana.gameOverOverlay?.list
            ?.filter(obj => typeof obj?.text === 'string')
            ?.map(obj => obj.text) ?? [];
        return {
            overlayExists: !!mana.gameOverOverlay,
            overlayChildren: mana.gameOverOverlay?.list?.length ?? 0,
            isGameOverVisible: mana.isGameOverVisible ?? false,
            laneAAlive: mana.laneA?.isAlive() ?? null,
            laneBAlive: mana.laneB?.isAlive() ?? null,
            overlayTexts,
        };
    });
}

console.log('[E2E] Opening app');
await page.goto('http://localhost:8001');
await waitForGame();
await wait(1000);

console.log('[E2E] Injecting mixed-level, mixed-pet saves');
await page.evaluate(() => {
    const ALL_BANDS = ['A', 'B', 'C', 'D', 'E'];
    const ALL_SUB_ATOM_NUMBERS = [1, 2, 3, 4];

    const createMasteryData = () => {
        const bands = {};
        const subAtoms = {};

        for (const band of ALL_BANDS) {
            bands[band] = {
                id: band,
                state: band === 'A' ? 'training' : 'locked',
                gateExamBestMedal: null,
                bandMasteryChallengeResult: null,
            };

            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const subAtomId = `${band}${num}`;
                subAtoms[subAtomId] = {
                    id: subAtomId,
                    state: band === 'A' && num === 1 ? 'training' : 'locked',
                    successfulSolves: 0,
                    examBestMedal: null,
                    fluencyChallengeResult: null,
                    masteryChallengeResult: null,
                    fightsSinceSeen: 0,
                };
            }
        }

        return {
            bands,
            subAtoms,
            problemRecords: {},
            globalSolveSequence: 0,
            fightCount: 0,
            retryPool: [],
            slowPool: [],
            currentPool: [],
            currentPoolIndex: 0,
            lastPoolProblems: [],
            lastStruggleOfferFight: 0,
            coopAutoPromotionBases: {},
        };
    };

    const setCurrentBand = (data, band, frontierNum) => {
        const bandIndex = ALL_BANDS.indexOf(band);

        for (let i = 0; i < ALL_BANDS.length; i++) {
            const currentBand = ALL_BANDS[i];
            data.bands[currentBand].state = i < bandIndex ? 'secure' : (currentBand === band ? 'training' : 'locked');
            data.bands[currentBand].gateExamBestMedal = i < bandIndex ? 'bronze' : null;
            data.bands[currentBand].bandMasteryChallengeResult = null;

            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const subAtomId = `${currentBand}${num}`;
                const subAtom = data.subAtoms[subAtomId];

                if (i < bandIndex) {
                    subAtom.state = 'secure';
                    subAtom.successfulSolves = 20;
                    subAtom.examBestMedal = 'bronze';
                } else if (currentBand === band) {
                    if (num < frontierNum) {
                        subAtom.state = 'secure';
                        subAtom.successfulSolves = 20;
                        subAtom.examBestMedal = 'silver';
                    } else if (num === frontierNum) {
                        subAtom.state = 'training';
                        subAtom.successfulSolves = 6;
                        subAtom.examBestMedal = null;
                    } else {
                        subAtom.state = 'locked';
                        subAtom.successfulSolves = 0;
                        subAtom.examBestMedal = null;
                    }
                } else {
                    subAtom.state = 'locked';
                    subAtom.successfulSolves = 0;
                    subAtom.examBestMedal = null;
                }

                subAtom.fluencyChallengeResult = null;
                subAtom.masteryChallengeResult = null;
                subAtom.fightsSinceSeen = 0;
            }
        }
    };

    const makePlayer = (name, characterType, level, activePet) => ({
        name,
        characterType,
        level,
        hp: 10 + level,
        maxHp: 10 + level,
        attack: 5 + level,
        defense: 0,
        status: 'healthy',
        equippedWeapon: null,
        equippedArmor: null,
        equippedShield: null,
        equippedHelmet: null,
        coins: { copper: 20, silver: 2, gold: 3, pouch: 0 },
        diamonds: { common: 0, red: 0, green: 0 },
        potions: 1,
        hasPotionSubscription: false,
        pet: null,
        activePet,
        ownedPets: [activePet],
        unlockedPets: [],
        arena: {
            isActive: false,
            arenaLevel: 1,
            currentBattle: 0,
            playerHpAtStart: 10 + level,
            completedArenaLevels: [],
            waveResults: [],
        },
        defeatedBosses: [],
        crystals: { crystals: [], maxCapacity: 60 },
        mana: 0,
        groundCrystals: [],
        townProgress: {
            unlockedBuildings: ['arena-building', 'guild-building', 'shop'],
            revealedBuildings: ['arena-building', 'guild-building', 'shop'],
            visitedBuildings: ['arena-building', 'guild-building', 'shop'],
            totalWavesCompleted: 1,
            totalCoinsEarned: 20,
        },
    });

    const makeStats = (correctAnswers, masteryData) => ({
        totalAttempts: 100,
        correctAnswers,
        recentResults: [],
        currentDifficulty: 1,
        highestDifficulty: 1,
        problemStats: {
            seed_problem: {
                correctCount: correctAnswers,
                wrongCount: 0,
                lastAttempt: Date.now(),
                mastered: true,
                manaCollected: 0,
            },
        },
        currentPool: [],
        poolCycle: 0,
        dailyAttempts: 0,
        lastAttemptDate: '',
        masteryData,
    });

    const masteryA = createMasteryData();
    const masteryB = createMasteryData();
    setCurrentBand(masteryA, 'E', 3);
    setCurrentBand(masteryB, 'A', 1);

    localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify({
        player: makePlayer('Katka', 'girl_knight', 5, 'pet_slime'),
        mathStats: makeStats(80, masteryA),
        timestamp: Date.now(),
    }));
    localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify({
        player: makePlayer('Tomas', 'boy_knight', 2, 'pet_demon'),
        mathStats: makeStats(20, masteryB),
        timestamp: Date.now(),
    }));
});

await page.reload();
await waitForGame();
await wait(4000);

console.log('[E2E] Starting co-op through the UI');
await clickCanvas(640, 540);
await wait(1500);
await clickCanvas(501, 510);
await wait(700);
await clickCanvas(501, 510);
await wait(700);
await clickCanvas(870, 640);
await waitForScene('TownScene');
await wait(1000);

const townSnapshot = await getTownSnapshot();
assert(townSnapshot.guildVisible, 'Expected Guild building to stay visible in co-op town');
assert(townSnapshot.guildLabelVisible, 'Expected Guild label to stay visible in co-op town');

console.log('[E2E] Opening Guild to check mana collection access');
await openGuildFromTown();
const guildSnapshot = await getGuildSnapshot();
assert(guildSnapshot.hasManaCollectionButton, 'Expected Guild co-op view to build the mana collection button');
assert(guildSnapshot.hasManaCollectionLabel, 'Expected Guild co-op view to expose the mana collection entry');

await page.evaluate(() => {
    globalThis.__LITTLE_MATH_GAME__.scene.keys.GuildScene.scene.start('TownScene');
});
await waitForScene('TownScene');
await wait(500);

console.log('[E2E] Jumping into a controlled co-op battle');
await startBattleFromTown();

const battleStart = await getBattleSnapshot();
assert(battleStart.playerAPet === 'pet_slime', `Expected Player A pet_slime, got ${battleStart.playerAPet}`);
assert(battleStart.playerBPet === 'pet_demon', `Expected Player B pet_demon, got ${battleStart.playerBPet}`);
assert(battleStart.enemyCount === 2, `Expected casual co-op to add one extra slime, got ${battleStart.enemyCount}`);
assert(battleStart.enemyHp === 5, `Expected regular co-op slime HP to stay at 5, got ${battleStart.enemyHp}`);

const playerAMath = await getMathTurnSnapshot('A');
assert(playerAMath.phase === 'player_math', `Expected Player A math phase, got ${playerAMath.phase}`);
assert(playerAMath.activePlayer === 'A', `Expected Player A to stay active, got ${playerAMath.activePlayer}`);
assert(playerAMath.problemCount === 3, `Expected Player A to receive 3 problems, got ${playerAMath.problemCount}`);
assert(playerAMath.playerAPet === 'pet_slime', `Player A pet changed during A turn: ${playerAMath.playerAPet}`);
assert(playerAMath.playerBPet === 'pet_demon', `Player B pet changed during A turn: ${playerAMath.playerBPet}`);

const playerBMath = await getMathTurnSnapshot('B');
assert(playerBMath.phase === 'player_b_math', `Expected Player B math phase, got ${playerBMath.phase}`);
assert(playerBMath.activePlayer === 'B', `Expected Player B to be active, got ${playerBMath.activePlayer}`);
assert(playerBMath.problemCount === 3, `Expected Player B to receive 3 problems, got ${playerBMath.problemCount}`);
assert(playerBMath.playerAPet === 'pet_slime', `Player A pet changed during B turn: ${playerBMath.playerAPet}`);
assert(playerBMath.playerBPet === 'pet_demon', `Player B pet changed during B turn: ${playerBMath.playerBPet}`);

console.log('[E2E] Opening Guild mana co-op scene and checking keyboard lanes');
await page.evaluate(() => {
    globalThis.__LITTLE_MATH_GAME__.scene.keys.BattleScene.scene.start('GuildScene');
});
await waitForScene('GuildScene');
await wait(300);
await startManaSceneFromGuild();
const manaPrep = await prepareManaLanes();
assert(manaPrep.playerLevelA !== manaPrep.playerLevelB, `Expected mixed co-op levels, got A=${manaPrep.playerLevelA}, B=${manaPrep.playerLevelB}`);
assert(manaPrep.fixedLevelA === manaPrep.playerLevelA, `Expected lane A fixed level ${manaPrep.playerLevelA}, got ${manaPrep.fixedLevelA}`);
assert(manaPrep.fixedLevelB === manaPrep.playerLevelB, `Expected lane B fixed level ${manaPrep.playerLevelB}, got ${manaPrep.fixedLevelB}`);
assert(/^E/.test(manaPrep.firstPoolProblemA), `Expected lane A mastery pool to use advanced frontier band, got ${manaPrep.firstPoolProblemA}`);
assert(/^A/.test(manaPrep.firstPoolProblemB), `Expected lane B mastery pool to use beginner frontier band, got ${manaPrep.firstPoolProblemB}`);
assert(manaPrep.activeBefore === 'B', `Expected active co-op player to be forced to B before keyboard test, got ${manaPrep.activeBefore}`);

await page.keyboard.press('X');
await wait(150);
const afterX = await getManaSnapshot();
assert(afterX.laneAResults.problemCount === 1, `Expected X to resolve lane A once, got ${afterX.laneAResults.problemCount}`);
assert(afterX.laneBResults.problemCount === 0, `Expected X to leave lane B untouched, got ${afterX.laneBResults.problemCount}`);
assert(afterX.activePlayer === 'B', `Expected active co-op player to restore to B after X, got ${afterX.activePlayer}`);

await page.keyboard.press('M');
await wait(150);
const afterM = await getManaSnapshot();
assert(afterM.laneAResults.problemCount === 1, `Expected lane A to stay at one resolved problem after M, got ${afterM.laneAResults.problemCount}`);
assert(afterM.laneBResults.problemCount === 1, `Expected M to resolve lane B once, got ${afterM.laneBResults.problemCount}`);
assert(afterM.activePlayer === 'B', `Expected active co-op player to restore to B after M, got ${afterM.activePlayer}`);

console.log('[E2E] Repeating mana resolves to cover midgame save path');
for (let expectedCount = 2; expectedCount <= 3; expectedCount++) {
    await wait(1200);
    await alignManaProblemsToCorrectSlots();
    await page.keyboard.press('X');
    await wait(150);
    await page.keyboard.press('M');
    await wait(150);

    const roundSnapshot = await getManaSnapshot();
    assert(roundSnapshot.laneAResults.problemCount === expectedCount, `Expected lane A problem count ${expectedCount}, got ${roundSnapshot.laneAResults.problemCount}`);
    assert(roundSnapshot.laneBResults.problemCount === expectedCount, `Expected lane B problem count ${expectedCount}, got ${roundSnapshot.laneBResults.problemCount}`);
    assert(roundSnapshot.activePlayer === 'B', `Expected active co-op player to stay B after round ${expectedCount}, got ${roundSnapshot.activePlayer}`);
}

console.log('[E2E] Forcing both mana lanes to fail and return to Guild');
await triggerManaGameOver();
await wait(1600);
const manaGameOver = await getManaGameOverSnapshot();
assert(manaGameOver.overlayExists, 'Expected mana game-over overlay after both lanes fail');
assert(manaGameOver.overlayChildren > 0, 'Expected mana game-over overlay to contain controls');
assert(manaGameOver.isGameOverVisible, 'Expected mana scene to latch game-over state');
assert(manaGameOver.laneAAlive === false, `Expected lane A to be dead, got ${manaGameOver.laneAAlive}`);
assert(manaGameOver.laneBAlive === false, `Expected lane B to be dead, got ${manaGameOver.laneBAlive}`);
assert(manaGameOver.overlayTexts.some(text => text.includes('Dohromady správně: 6')), `Expected combined correct summary, got ${manaGameOver.overlayTexts.join(' | ')}`);
assert(manaGameOver.overlayTexts.some(text => text.includes('oba hráči získali ⚡ 1')), `Expected shared mana reward summary, got ${manaGameOver.overlayTexts.join(' | ')}`);

await clickCanvas(640, 520);
await wait(300);
const afterManaReturn = await page.evaluate(() => ({
    activeScenes: globalThis.__LITTLE_MATH_GAME__.scene.getScenes(true).map(scene => scene.scene.key),
    guildActive: globalThis.__LITTLE_MATH_GAME__.scene.isActive('GuildScene'),
    manaActive: globalThis.__LITTLE_MATH_GAME__.scene.isActive('ManaCollectionScene'),
    slot0Mana: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')).player.mana,
    slot1Mana: JSON.parse(localStorage.getItem('littleMathAdventure_slot_1')).player.mana,
}));
assert(afterManaReturn.guildActive, `Expected GuildScene to be active after leaving mana collection, got ${afterManaReturn.activeScenes.join(', ')}`);
assert(!afterManaReturn.manaActive, 'Expected ManaCollectionScene to stop after continue');
assert(afterManaReturn.slot0Mana === 1, `Expected Player A to earn shared mana reward 1, got ${afterManaReturn.slot0Mana}`);
assert(afterManaReturn.slot1Mana === 1, `Expected Player B to earn shared mana reward 1, got ${afterManaReturn.slot1Mana}`);

if (errors.length > 0) {
    fail(`Browser errors:\n${errors.join('\n')}`);
}

console.log('[E2E] PASS');
await browser.close();

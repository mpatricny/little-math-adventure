import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8012';
const menuOnly = process.argv.includes('--menu-only');
const rootDir = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(rootDir, 'public/assets/images/screenshots');
const temporaryDir = path.join(tmpdir(), `cislokraj-landing-${process.pid}`);
const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

await mkdir(outputDir, { recursive: true });
await mkdir(temporaryDir, { recursive: true });

const comparisonConfig = JSON.parse(await readFile(path.join(rootDir, 'src/data/comparison-learning.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('response', response => {
  if (response.status() >= 400 && response.url().includes('/assets/')) errors.push(`asset: ${response.url()}`);
});
// Isolated screenshot fixture: no account requests and no changes to a real player's saves.
await page.route(`${new URL(baseUrl).origin}/v1/**`, route => route.fulfill({
  status: 401, contentType: 'application/json', body: '{}',
}));
// The production bundle intentionally has no debug global. Expose the existing game
// only in this browser response so captures use the real pilot, without dev controls.
await page.route('**/assets/index-*.js', async route => {
  const response = await route.fetch();
  const body = await response.text();
  const exposed = body.replace(/new [\w$]+\.Game\([\w$]+\)/, match => `(globalThis.${GAME_GLOBAL}=${match})`);
  assert.notEqual(exposed, body, 'Could not expose the production game for screenshots');
  await route.fulfill({ response, body: exposed });
});

await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('littleMathAdventure_activeSlot', '0');
  localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify({
    player: {
      name: 'Ada',
      characterType: 'girl_knight',
      level: 2,
      hp: 20,
      maxHp: 20,
      attack: 6,
      defense: 1,
      status: 'healthy',
      coins: { copper: 8, silver: 1, gold: 0, pouch: 0 },
      diamonds: { common: 2, red: 0, green: 0 },
      crystals: { crystals: [], maxCapacity: 60 },
      mana: 3,
      groundCrystals: [],
      equippedWeapon: 'sword_wooden',
      equippedArmor: null,
      equippedShield: 'shield_wooden',
      equippedHelmet: null,
      potions: 0,
      hasPotionSubscription: false,
      pet: null,
      activePet: null,
      ownedPets: [],
      unlockedPets: [],
      perfectDefeats: [],
      defeatedBosses: [],
      seenGuides: ['shop.intro.v1', 'shop.sword.v1', 'shop.shield.v1', 'arena.free.v1'],
      arena: {
        isActive: false,
        arenaLevel: 1,
        currentBattle: 0,
        playerHpAtStart: 20,
        completedArenaLevels: [],
        waveResults: [],
      },
      townProgress: {
        unlockedBuildings: ['arena-building', 'shop', 'witch'],
        revealedBuildings: ['arena-building', 'shop', 'witch'],
        visitedBuildings: ['arena-building'],
        totalWavesCompleted: 2,
        totalCoinsEarned: 28,
        wavesAfterForgeUnlock: 0,
      },
    },
    mathStats: {
      totalAttempts: 18,
      correctAnswers: 15,
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
  }));
});

async function waitForScene(sceneKey) {
  try {
    await page.waitForFunction(({ globalName, key }) => {
      const game = globalThis[globalName];
      return Boolean(game?.isBooted && game.scene?.isActive(key));
    }, { globalName: GAME_GLOBAL, key: sceneKey }, { timeout: 45_000 });
  } catch (error) {
    const state = await page.evaluate(globalName => ({
      body: document.body.innerText,
      gameCreated: Boolean(globalThis[globalName]),
      activeScenes: globalThis[globalName]?.scene?.getScenes(true).map(scene => scene.scene.key) ?? [],
    }), GAME_GLOBAL);
    throw new Error(`Waiting for ${sceneKey} failed. ${JSON.stringify(state)}\n${errors.join('\n')}`, { cause: error });
  }
  await page.waitForTimeout(1_200);
}

async function startScene(sceneKey, data = {}) {
  await page.evaluate(({ globalName, key, sceneData }) => {
    const game = globalThis[globalName];
    const active = game.scene.getScenes(true);
    const source = active.at(-1);
    if (!source) throw new Error(`No active scene can start ${key}`);
    source.scene.start(key, sceneData);
  }, { globalName: GAME_GLOBAL, key: sceneKey, sceneData: data });
  await waitForScene(sceneKey);
}

async function capture(name) {
  const missing = await page.evaluate(globalName => {
    const missing = [];
    const visit = (object, visible = true) => {
      visible = visible && object.visible !== false && object.alpha !== 0;
      if (visible && object.texture?.key === '__MISSING') missing.push(object.name || object.type);
      object.list?.forEach(child => visit(child, visible));
    };
    globalThis[globalName].scene.getScenes(true).forEach(scene => scene.children.list.forEach(object => visit(object)));
    return missing;
  }, GAME_GLOBAL);
  assert.deepEqual(missing, [], `Missing textures in ${name}`);
  const png = path.join(temporaryDir, `${name}.png`);
  const webp = path.join(outputDir, `${name}.webp`);
  await page.locator('canvas').screenshot({ path: png });
  await sharp(png).webp({ quality: 84, smartSubsample: true }).toFile(webp);
  return webp;
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (menuOnly) {
    await page.locator('canvas').waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForTimeout(5_000);
    const files = [await capture('landing-menu')];
    if (errors.length > 0) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ baseUrl, files }, null, 2));
  } else {
    await waitForScene('MenuScene');
    const files = [await capture('landing-menu')];

    await page.evaluate(globalName => {
      globalThis[globalName].scene.keys.CrystalForgeScene.gameState.loadSlot(0);
    }, GAME_GLOBAL);
    await startScene('ShopScene');
    files.push(await capture('landing-shop'));

    await startScene('ForestAdventureStartScene', { debugMode: true });
    await page.evaluate((globalName) => {
      globalThis[globalName].scene.keys.ForestAdventureStartScene.startJourney();
    }, GAME_GLOBAL);
    await waitForScene('ForestRoomScene');
    await startScene('ForestRiddleScene', { roomId: 'forest_riddle', fromDirection: 'left' });
    // The mushroom appears only after both stones have been placed correctly.
    // Use that real completed-puzzle state instead of adding it to an unsolved bridge.
    await page.evaluate(globalName => {
      const scene = globalThis[globalName].scene.keys.ForestRiddleScene;
      for (const stone of scene.steppingStones.filter(stone => stone.isDropZone)) {
        const rock = scene.floatingRocks.find(rock => rock.placedInSlot === null && rock.value === stone.expectedValue);
        if (!rock) throw new Error('Bridge answer stone is missing');
        scene.placeRockInSlot(rock, stone);
      }
    }, GAME_GLOBAL);
    await page.waitForFunction(globalName => Boolean(globalThis[globalName].scene.keys.ForestRiddleScene.mushroomSprite), GAME_GLOBAL);
    await page.waitForTimeout(4_000);
    files.push(await capture('landing-river-puzzle'));

    await page.evaluate(({ globalName, introVersion }) => {
      const gameState = globalThis[globalName].scene.keys.CrystalForgeScene.gameState;
      const mastery = gameState.getMasteryData();
      mastery.subAtoms.A2.state = 'fluent';
      const chapter = mastery.comparisonChapter;
      chapter.status = 'training';
      chapter.currentStageIndex = 1; // Actual count-and-crocodile lesson, before answering.
      Object.assign(chapter.stages[1], { introSeen: true, introVersionSeen: introVersion, attempts: 2 });
    }, { globalName: GAME_GLOBAL, introVersion: comparisonConfig.introVersion });
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
    await page.waitForFunction(globalName => globalThis[globalName].scene.keys.BattleScene.battleState.phase === 'player_turn', GAME_GLOBAL);
    await page.evaluate(globalName => globalThis[globalName].scene.keys.BattleScene.onAttackClicked(), GAME_GLOBAL);
    await page.waitForFunction(globalName => globalThis[globalName].scene.keys.BattleScene.mathBoard.acceptingAnswer, GAME_GLOBAL);
    await page.waitForTimeout(400);
    files.push(await capture('landing-arena-comparison'));

    if (errors.length > 0) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ baseUrl, files }, null, 2));
  }
} finally {
  await browser.close();
  await rm(temporaryDir, { recursive: true, force: true });
}

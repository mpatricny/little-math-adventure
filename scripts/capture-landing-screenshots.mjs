import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8002';
const menuOnly = process.argv.includes('--menu-only');
const rootDir = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(rootDir, 'public/assets/images/screenshots');
const temporaryDir = path.join(tmpdir(), `cislokraj-landing-${process.pid}`);
const GAME_GLOBAL = '__LITTLE_MATH_GAME__';

await mkdir(outputDir, { recursive: true });
await mkdir(temporaryDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
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
      equippedWeapon: null,
      equippedArmor: null,
      equippedShield: null,
      equippedHelmet: null,
      potions: 0,
      hasPotionSubscription: false,
      pet: null,
      activePet: null,
      ownedPets: [],
      unlockedPets: [],
      perfectDefeats: [],
      defeatedBosses: [],
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

    await startScene('TownScene');
    files.push(await capture('landing-town'));

    await startScene('ForestAdventureStartScene', { debugMode: true });
    await page.evaluate((globalName) => {
      globalThis[globalName].scene.keys.ForestAdventureStartScene.startJourney();
    }, GAME_GLOBAL);
    await waitForScene('ForestRoomScene');
    files.push(await capture('landing-forest'));

    if (errors.length > 0) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ baseUrl, files }, null, 2));
  }
} finally {
  await browser.close();
  await rm(temporaryDir, { recursive: true, force: true });
}

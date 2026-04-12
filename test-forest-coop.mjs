import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:8001');
await page.waitForTimeout(1000);

await page.evaluate(() => {
    const makePlayer = (name, charType, level) => ({
        name, characterType: charType, level, hp: 10 + level, maxHp: 10 + level,
        attack: 5 + level, defense: 0, status: 'healthy',
        equippedWeapon: null, equippedArmor: null, equippedShield: null, equippedHelmet: null,
        coins: { copper: 4, silver: 1, gold: 10, pouch: 0 },
        potions: 1, hasPotionSubscription: false,
        activePet: null, ownedPets: [], unlockedPets: [],
        arena: { isActive: false, arenaLevel: 2, currentBattle: 0,
                 playerHpAtStart: 10 + level, completedArenaLevels: [1, 2], waveResults: [] },
        defeatedBosses: [],
        townProgress: {
            unlockedBuildings: ['arena-building', 'shop'],
            revealedBuildings: ['arena-building', 'shop'],
            visitedBuildings: ['arena-building', 'shop'],
            totalWavesCompleted: 5, totalCoinsEarned: 100,
        },
    });
    const makeStats = () => ({
        totalAttempts: 200, correctAnswers: 160, recentResults: [],
        currentDifficulty: 1, highestDifficulty: 1, problemStats: {},
        currentPool: [], poolCycle: 0, dailyAttempts: 0, lastAttemptDate: '',
    });
    localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify({
        player: makePlayer('Katka', 'girl_knight', 5),
        mathStats: makeStats(), timestamp: Date.now()
    }));
    localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify({
        player: makePlayer('Tomáš', 'boy_knight', 3),
        mathStats: makeStats(), timestamp: Date.now()
    }));
});

await page.reload();
await page.waitForTimeout(5000);

const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
const sx = box.width / 1280;
const sy = box.height / 720;

// Co-op setup
await canvas.click({ position: { x: 640 * sx, y: 540 * sy } });
await page.waitForTimeout(2000);
await canvas.click({ position: { x: 501 * sx, y: 510 * sy } });
await page.waitForTimeout(1000);
await canvas.click({ position: { x: 501 * sx, y: 510 * sy } });
await page.waitForTimeout(1000);
await canvas.click({ position: { x: 870 * sx, y: 640 * sy } });
await page.waitForTimeout(5000);

await page.screenshot({ path: '/tmp/forest-01-town.png' });

// Press F key to start forest journey in debug mode
await page.keyboard.press('f');
await page.waitForTimeout(5000);

await page.screenshot({ path: '/tmp/forest-02-adventure-start.png' });

console.log('JS errors:', errors.length > 0 ? errors.join('\n') : 'NONE');
await browser.close();

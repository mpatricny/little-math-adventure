import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://localhost:8001');
await page.waitForTimeout(1000);

// Inject two saves
await page.evaluate(() => {
    const makePlayer = (name, charType, level) => ({
        name, characterType: charType, level, hp: 10 + level, maxHp: 10 + level,
        attack: 5 + level, defense: 0, status: 'healthy',
        equippedWeapon: null, equippedArmor: null, equippedShield: null, equippedHelmet: null,
        coins: { copper: 4, silver: 1, gold: level, pouch: 0 },
        potions: 1, hasPotionSubscription: false,
        activePet: null, ownedPets: [], unlockedPets: [],
        arena: { isActive: false, arenaLevel: 1, currentBattle: 0, playerHpAtStart: 10, completedArenaLevels: [], waveResults: [] },
        defeatedBosses: [],
    });
    const makeStats = () => ({
        totalAttempts: 100, correctAnswers: 80, recentResults: [],
        currentDifficulty: 1, highestDifficulty: 1, problemStats: {},
        currentPool: [], poolCycle: 0, dailyAttempts: 0, lastAttemptDate: '',
    });
    localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify({
        player: makePlayer('Katka', 'girl_knight', 5), mathStats: makeStats(), timestamp: Date.now()
    }));
    localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify({
        player: makePlayer('Tomáš', 'boy_knight', 3), mathStats: makeStats(), timestamp: Date.now()
    }));
});

await page.reload();
await page.waitForTimeout(5000);

const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
const sx = box.width / 1280;
const sy = box.height / 720;

// Click Co-op button (640, 540)
await canvas.click({ position: { x: 640 * sx, y: 540 * sy } });
await page.waitForTimeout(2500);

// Screenshot: slot 1 with Katka showing
await page.screenshot({ path: '/tmp/coop-01-slot1.png' });

// Click ZVOLIT (501, 510) to select Katka as Player 1
await canvas.click({ position: { x: 501 * sx, y: 510 * sy } });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/coop-02-p1-selected.png' });

// Click right arrow (NewArrow_1 at 556, 330) to go to slot 2
await canvas.click({ position: { x: 556 * sx, y: 330 * sy } });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/coop-03-slot2.png' });

// Click ZVOLIT for Player 2 (Tomáš)
await canvas.click({ position: { x: 501 * sx, y: 510 * sy } });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/coop-04-both-selected.png' });

console.log('Screenshots saved');
await browser.close();

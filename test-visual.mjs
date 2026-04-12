import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:8001');
await page.waitForTimeout(1000);

await page.evaluate(() => {
    const makePlayer = (name, charType, level, pet) => ({
        name, characterType: charType, level, hp: 10 + level, maxHp: 10 + level,
        attack: 5 + level, defense: 0, status: 'healthy',
        equippedWeapon: null, equippedArmor: null, equippedShield: null, equippedHelmet: null,
        coins: { copper: 4, silver: 1, gold: level, pouch: 0 },
        potions: 1, hasPotionSubscription: false,
        activePet: pet, ownedPets: pet ? [pet] : [], unlockedPets: [],
        arena: { isActive: false, arenaLevel: 1, currentBattle: 0,
                 playerHpAtStart: 10 + level, completedArenaLevels: [], waveResults: [] },
        defeatedBosses: [],
        townProgress: {
            unlockedBuildings: ['arena-building', 'shop', 'witch', 'guild'],
            revealedBuildings: ['arena-building', 'shop', 'witch', 'guild'],
            visitedBuildings: ['arena-building', 'shop', 'witch', 'guild'],
            totalWavesCompleted: 3, totalCoinsEarned: 50,
        },
    });
    const makeStats = () => ({
        totalAttempts: 100, correctAnswers: 80, recentResults: [],
        currentDifficulty: 1, highestDifficulty: 1, problemStats: {},
        currentPool: [], poolCycle: 0, dailyAttempts: 0, lastAttemptDate: '',
    });
    localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify({
        player: makePlayer('Katka', 'girl_knight', 5, 'pet_slime'),
        mathStats: makeStats(), timestamp: Date.now()
    }));
    localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify({
        player: makePlayer('Tomáš', 'boy_knight', 3, null),
        mathStats: makeStats(), timestamp: Date.now()
    }));
});

await page.reload();
await page.waitForTimeout(5000);

const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
const sx = box.width / 1280;
const sy = box.height / 720;

async function click(x, y) { await canvas.click({ position: { x: x * sx, y: y * sy } }); }
async function shot(name) { await page.screenshot({ path: `/tmp/vis-${name}.png` }); }
async function wait(ms) { await page.waitForTimeout(ms); }

// 1. Menu with Co-op button
await shot('01-menu');

// 2. Co-op setup - initial
await click(640, 540);
await wait(2000);
await shot('02-coop-setup-initial');

// 3. Co-op setup - both selected
await click(501, 510); // P1
await wait(1000);
await click(501, 510); // P2
await wait(1000);
await shot('03-coop-both-selected');

// 4. Start co-op → Town
await click(870, 640);
await wait(5000);
await shot('04-town-dual-chars');

// 5. Shop with switch UI
await click(382, 665);
await wait(8000);
await shot('05-shop-switch-ui');

// 6. Back to town
await click(74, 639);
await wait(4000);

// 7. Arena preview
await click(108, 600);
await wait(8000);
await shot('06-arena-preview-coop');

// 8. Battle with 2 heroes + 2 enemies
await click(890, 655);
await wait(3000);
await shot('07-battle-dual-heroes');

// 9. Player A math board
await click(640, 660);
await wait(2000);
await shot('08-player-a-math');

console.log('JS errors:', errors.length > 0 ? errors.join('\n') : 'NONE');
console.log('Visual screenshots saved to /tmp/vis-*.png');
await browser.close();

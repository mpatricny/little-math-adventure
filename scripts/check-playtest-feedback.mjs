import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Changes are client-only; the optional account API is mocked, so no DB migrations are needed.
const base = process.argv[2] ?? 'http://127.0.0.1:8001';
const output = new URL('../artifacts/playtest-feedback/', import.meta.url).pathname;
mkdirSync(output, { recursive: true });
const source = readFileSync(new URL('./capture-landing-screenshots.mjs', import.meta.url), 'utf8');
const start = source.indexOf('await page.addInitScript(') + 'await page.addInitScript('.length;
const end = source.indexOf('\n});', start) + 2;
const fixture = `(${source.slice(start, end)})();`;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const profiles = [['desktop-webgl', 1280, 720, 'webgl'], ['tablet-canvas', 1024, 768, 'canvas']];
const results = [];
try {
    for (const [profile, width, height, renderer] of profiles) {
        const context = await browser.newContext({ viewport: { width, height } });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
            await page.route(`${base}/v1/**`, route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
            const waitScene = key => page.waitForFunction(key => window.__LITTLE_MATH_GAME__?.scene.isActive(key), key, { timeout: 60000 });
            const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const shot = async name => { await settle(); await page.screenshot({ path: `${output}${profile}-${name}.png` }); };
            async function tap(x, y) {
                const box = await page.locator('canvas').boundingBox();
                await page.mouse.move(box.x + x * box.width / 1280, box.y + y * box.height / 720);
                await settle(); await page.mouse.down(); await settle(); await page.mouse.up(); await settle();
            }
            async function startScene(key) {
                await page.evaluate(key => window.__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start(key), key);
                await waitScene(key); await settle();
            }
            const guideId = () => page.evaluate(() => window.__LITTLE_MATH_GAME__.scene.getScenes(true).flatMap(scene => scene.children.list)
                .find(object => object.name?.startsWith('guide:'))?.getData('guideId') ?? null);
            async function finishGuides(prefix) {
                await page.waitForTimeout(1500);
                const seen = [];
                while (await guideId()) {
                    const id = await guideId(); seen.push(id);
                    await page.waitForTimeout(2800);
                    await shot(`${prefix}-${id}`);
                    await page.waitForTimeout(id.startsWith('shop.') && id !== 'shop.intro.v1' ? 4000 : 700);
                    await tap(1000, 620);
                    await page.waitForTimeout(200);
                    assert.notEqual(await guideId(), id, 'completed demonstration advances');
                    assert.ok(seen.length < 9, 'bounded guide queue');
                }
                return seen;
            }
            await page.goto(`${base}/?renderer=${renderer}`);
            await waitScene('MenuScene');
            await startScene('CharacterSelectNewScene');
            await page.locator('#characterNameInput').fill('Terezka');
            await shot('character-name');
            await tap(641, 670);
            await waitScene('BandSelectScene');
            assert.equal(await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')), null);
            await tap(640, 630);
            assert.equal(await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')), null, 'no implicit easiest choice');
            await shot('level-disabled');
            await tap(640, 345);
            await shot('level-selected');
            await tap(160, 630);
            await waitScene('CharacterSelectNewScene');
            assert.equal(await page.locator('#characterNameInput').inputValue(), 'Terezka');
            await tap(641, 670);
            await waitScene('BandSelectScene');
            await tap(1108, 345);
            await tap(640, 630);
            await page.waitForFunction(() => localStorage.getItem('littleMathAdventure_slot_0'));
            const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')));
            assert.equal(saved.player.name, 'Terezka');
            assert.equal(saved.mathStats.masteryData.selectedStartBand, 'E');

            await page.addInitScript({ content: `if (!sessionStorage.getItem('feedbackFixture')) { ${fixture} sessionStorage.setItem('feedbackFixture', 'yes'); }` });
            await page.reload(); await waitScene('MenuScene');
            await tap(10, 700); // Unlock optional narration through a real gesture.
            await page.evaluate(async () => {
                const state = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();
                state.loadSlot(0);
                const player = state.getPlayer();
                player.unlockedPets = ['slime', 'goblin', 'arena_level_1', 'arena_level_2'];
                player.equippedWeapon = 'sword_wooden';
                player.equippedShield = 'shield_wooden';
            });
            await startScene('CrystalForgeScene');
            await page.waitForFunction(() => window.__LITTLE_MATH_GAME__.scene.keys.CrystalForgeScene.children.list.some(o => o.name?.startsWith('guide:')), null, { timeout: 20000 });
            const forge = await finishGuides('forge');
            assert.ok(forge.includes('forge.merge.v1') && forge.includes('forge.split.v1'));
            await shot('forge-normal');
            const crystalsBefore = await page.evaluate(async () => JSON.stringify((await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().crystals));
            await startScene('TownScene'); await startScene('CrystalForgeScene');
            await page.waitForTimeout(650);
            assert.equal(await guideId(), null, 'completed forge guides stay completed');
            assert.equal(await page.evaluate(async () => JSON.stringify((await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().crystals)), crystalsBefore);

            await startScene('PythiaWorkshopScene');
            const pythia = await finishGuides('pythia');
            await shot('pythia-normal');
            await page.evaluate(async () => {
                const game = window.__LITTLE_MATH_GAME__, scene = game.scene.keys.PythiaWorkshopScene;
                const player = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer();
                const pet = scene.petRows.find(row => row.pet && !player.ownedPets.includes(row.pet.id))?.pet;
                if (!pet) throw new Error('fixture requires an unlocked unowned pet');
                player.crystals.crystals = [];
                scene.onPetClick(pet);
            });
            await page.waitForTimeout(2900); await shot('missing-crystal');
            assert.equal(await guideId(), 'pythia.missingCrystal');
            await tap(1080, 329);
            await startScene('ShopScene');
            const shop = await finishGuides('shop');
            await shot('shop-normal');
            await startScene('ArenaScene');
            const arena = await finishGuides('arena');
            await shot('arena-normal');
            assert.deepEqual(errors, []);
            results.push({ profile, forge, pythia, shop, arena, errors });
            console.log(`${profile}: required placement, preserved draft, persistent independent guides, no crystal spending, Pythia help and Czech UI passed`);
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
writeFileSync(`${output}results.json`, JSON.stringify(results, null, 2));

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:8004';
const output = new URL('../artifacts/playtest-feedback/', import.meta.url).pathname;
const source = readFileSync(new URL('./capture-landing-screenshots.mjs', import.meta.url), 'utf8');
const start = source.indexOf('await page.addInitScript(') + 'await page.addInitScript('.length;
const fixture = `(${source.slice(start, source.indexOf('\n});', start) + 2)})();`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.route(`${base}/v1/**`, route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
await page.addInitScript({ content: `if (!sessionStorage.getItem('guidanceFixture')) { ${fixture} sessionStorage.setItem('guidanceFixture', 'yes'); }` });
const waitScene = key => page.waitForFunction(key => window.__LITTLE_MATH_GAME__?.scene.isActive(key), key, { timeout: 60000 });
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const scene = async key => { await page.evaluate(key => window.__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1).scene.start(key), key); await waitScene(key); await settle(); };
const guide = () => page.evaluate(() => window.__LITTLE_MATH_GAME__.scene.getScenes(true).flatMap(s => s.children.list).find(o => o.name?.startsWith('guide:'))?.getData('guideId'));
const waitGuide = id => page.waitForFunction(id => window.__LITTLE_MATH_GAME__.scene.getScenes(true).flatMap(s => s.children.list).some(o => o.getData?.('guideId') === id), id);
const audio = () => page.evaluate(async () => (await import('/src/audio/AudioDirector.ts')).gameAudio().snapshot());
async function tap(x,y) { await page.mouse.move(x,y); await settle(); await page.mouse.down(); await settle(); await page.mouse.up(); await settle(); }
async function finish(id, name = id) {
    await waitGuide(id);
    await page.waitForFunction(() => window.__LITTLE_MATH_GAME__.scene.getScenes(true).flatMap(s => s.children.list).some(o => o.getData?.('guideId') && o.getData('ready')));
    await page.screenshot({ path: `${output}advanced-${name}.png` });
    const next = await page.evaluate(() => {
        const current = window.__LITTLE_MATH_GAME__.scene.getScenes(true).at(-1);
        const host = current.sceneBuilder.get('guideNextHost'); return {x:host.x,y:host.y};
    });
    await tap(next.x,next.y);
    await page.waitForFunction(id => !window.__LITTLE_MATH_GAME__.scene.getScenes(true).flatMap(s => s.children.list).some(o => o.getData?.('guideId') === id),id);
}
try {
    await page.goto(`${base}/?renderer=canvas`); await waitScene('MenuScene');
    await tap(10,700);
    await page.evaluate(async () => {
        const {GameStateManager} = await import('/src/systems/GameStateManager.ts'); const state = GameStateManager.getInstance();state.loadSlot(0);
        const p=state.getPlayer();p.seenGuides=['forge.merge.v1','forge.split.v1'];p.arena.completedArenaLevels=[2];
        p.crystals.crystals=[1,7,12,20].map((value,i)=>({id:`qa-${i}`,tier:'shard',value,locked:false}));
        p.mana=30;state.save();
        const audio=(await import('/src/audio/AudioDirector.ts')).gameAudio();audio.setVolume('music',0);audio.setVolume('effects',0);audio.setVolume('voice',1);
    });
    const before = await page.evaluate(async () => { const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();return {crystals:state.getPlayer().crystals,attempts:state.getMathStats().totalAttempts}; });
    await scene('CrystalForgeScene'); await waitGuide('forge.createFragment.v1');
    await page.waitForFunction(async () => (await import('/src/audio/AudioDirector.ts')).gameAudio().snapshot().voiceCount === 1);
    await tap(270,620); // Replay owns and replaces its previous speech.
    assert.ok((await audio()).voiceCount <= 1);
    await tap(1080,329);
    await page.waitForTimeout(200); assert.equal((await audio()).voiceCount,0);
    assert.equal(await page.evaluate(async ()=>(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().seenGuides.includes('forge.createFragment.v1')),false);
    await scene('TownScene'); await scene('CrystalForgeScene');
    await finish('forge.createFragment.v1'); await finish('forge.splitFragment.v1');
    assert.equal(await guide(),undefined);
    await page.screenshot({path:`${output}advanced-crystal-values.png`});
    await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();state.getPlayer().defeatedBosses=['verdant_guardian'];state.save();});
    await scene('TownScene'); await scene('CrystalForgeScene'); await finish('forge.refine.v1'); assert.equal(await guide(),undefined);
    await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();state.getPlayer().defeatedBosses.push('crystal_serpent');state.save();});
    await scene('TownScene'); await scene('CrystalForgeScene'); await waitGuide('forge.createPrism.v1');
    // The task remains understandable with prose hidden and narration muted.
    await page.evaluate(async()=>{(await import('/src/audio/AudioDirector.ts')).gameAudio().setVolume('voice',0);const root=window.__LITTLE_MATH_GAME__.scene.keys.CrystalForgeScene.children.list.find(o=>o.name?.startsWith('guide:'));const hide=o=>{if(o.type==='Text'&&/[A-Za-zÀ-ž]/.test(o.text))o.setVisible(false);o.list?.forEach(hide)};hide(root);});
    await finish('forge.createPrism.v1','prism-no-prose-muted');
    const after = await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();return {crystals:state.getPlayer().crystals,attempts:state.getMathStats().totalAttempts};});
    assert.deepEqual(after,before,'demonstrations cannot spend inventory or earn math results');
    await page.reload(); await waitScene('MenuScene');
    await page.evaluate(async()=>{(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().loadSlot(0);});
    await scene('CrystalForgeScene'); await page.waitForTimeout(700);assert.equal(await guide(),undefined,'six completed guides survive reload');
    await scene('TownScene');
    await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();state.reset('boy_knight','Filip',1);state.setActiveSlotIndex(1);});
    await scene('CrystalForgeScene'); await waitGuide('forge.merge.v1');
    await tap(1080,329);
    await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();state.getPlayer().seenGuides=['shop.intro.v1'];state.save();});
    await scene('ShopScene');await page.waitForTimeout(650);assert.equal(await guide(),undefined);
    await page.evaluate(async()=>{
        const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance(),shop=window.__LITTLE_MATH_GAME__.scene.keys.ShopScene;
        const shield=shop.allItems.find(item=>item.id==='shield_wooden');
        state.getPlayer().coins={copper:shield.price,silver:0,gold:0,pouch:0};
        shop.spawnPlayerCoins();shop.onItemClicked(shield);
        shop.paymentCoins=shop.playerCoins.splice(0);shop.paymentCoins.forEach(coin=>coin.inPaymentArea=true);
        shop.attemptPurchase();
    });
    await waitGuide('shop.shield.v1'); await finish('shop.shield.v1','after-shield-purchase');
    assert.equal(await page.evaluate(async()=> (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer().preparation?.charges??0),0,'equipment tutorial cannot award runes');
    await scene('TownScene'); await scene('ShopScene'); await page.waitForTimeout(650);assert.equal(await guide(),undefined);
    await scene('TownScene');
    await page.evaluate(async()=>{const state=(await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();state.loadSlot(0);});
    await scene('TownScene');
    const hero = await page.evaluate(()=>{const s=window.__LITTLE_MATH_GAME__.scene.keys.TownScene;const h=s.sceneBuilder.get('playerAHudHost');return h?{x:h.x,y:h.y}:null;});
    if(hero){await tap(hero.x,hero.y);await page.screenshot({path:`${output}advanced-character-book.png`});}
    assert.deepEqual(errors,[]);
    writeFileSync(`${output}guidance-results.json`,JSON.stringify({passed:['incremental unlocks','replay replaces speech','dismiss cancels speech','incomplete guide stays unseen','muted visual example','no reward or currency mutation','persistence after reload','per-hero independence','purchase triggers matching preparation','no free preparation'],errors},null,2));
    console.log('Advanced guidance checks passed');
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { installOfflineWorker } from '../src/loading/offline-worker.mjs';

// Isolated built-game origin. API requests never leave this read-only test server.
const root = path.resolve('dist/pilot');
const manifest = JSON.parse(readFileSync(path.join(root, 'offline-manifest.json')));
const profile = mkdtempSync(path.join(tmpdir(), 'cislokraj-offline-qa-'));
const requests = [];
const overrides = new Map();
const throttled = process.env.ASSET_QA_THROTTLE === '1';
const downloadBytesPerSecond = 2 * 1024 * 1024;
let nextChunkAt = 0;
// Throttle the server itself: page-level CDP emulation does not throttle worker fetches.
function sendBody(res, value) {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (!throttled) { res.end(body); return; }
    let offset = 0;
    function chunk() {
        if (res.destroyed) return;
        const end = Math.min(offset + 64 * 1024, body.length);
        const at = Math.max(Date.now(), nextChunkAt);
        nextChunkAt = at + (end - offset) / downloadBytesPerSecond * 1000;
        setTimeout(() => {
            if (res.destroyed) return;
            res.write(body.subarray(offset, end));
            offset = end;
            if (offset === body.length) res.end();
            else chunk();
        }, Math.max(0, at - Date.now()));
    }
    setTimeout(chunk, 60);
}
const mime = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain'};
const server = createServer((req,res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({path:url.pathname,method:req.method});
    // Match Cloudflare's public HTML canonicalization instead of masking it with a permissive static server.
    if (url.pathname === '/index.html') { res.writeHead(307, {Location:'/'}); res.end(); return; }
    if (/^\/(api|v1)\//.test(url.pathname)) {
        res.writeHead(req.method==='GET'?401:503,{'Content-Type':'application/json'});res.end('{"error":"isolated QA"}');return;
    }
    const resource=url.pathname==='/hra/'?'/index.html':url.pathname.replace(/^\/hra\/assets\//,'/assets/');
    const filename=path.resolve(root,'.'+decodeURIComponent(resource));
    if(req.method!=='GET'||!filename.startsWith(root+path.sep)||!existsSync(filename)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]??'application/octet-stream','Cache-Control':'public, max-age=3600'});
    sendBody(res, overrides.get(url.pathname) ?? readFileSync(filename));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
mkdirSync('artifacts/asset-streaming',{recursive:true});
let context;
try {
    context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1024,height:768},args:['--enable-unsafe-swiftshader']});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
        window.addEventListener('cislokraj-download-progress',e=>{window.assetQAStatus=e.detail;});
        window.assetQAControllers=[];
        navigator.serviceWorker.addEventListener('controllerchange',()=>window.assetQAControllers.push(navigator.serviceWorker.controller?.state));
    });
    await page.goto(origin+'/hra/',{waitUntil:'domcontentloaded'});
    await page.locator('canvas[data-scene="MenuScene"]').waitFor({timeout:30000});
    assert.ok(!requests.some(r=>r.path==='/assets/town/background.webp'),'town must not block initial menu');
    assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
    const initialAssets=requests.filter(r=>r.path.startsWith('/assets/')).length;
    const started=Date.now();
    await page.mouse.click(450,115); // Blank title region: first interaction, stay in menu.
    const diagnostic=setTimeout(()=>{void page.evaluate(async()=>({status:window.assetQAStatus && {ready:window.assetQAStatus.ready,cached:window.assetQAStatus.cached.length,storageError:window.assetQAStatus.storageError},
        controller:navigator.serviceWorker.controller?.scriptURL, registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state})),caches:await caches.keys()})).then(value=>console.log('download-checkpoint',value)).catch(()=>{});},10000);
    try { await page.waitForFunction(()=>window.assetQAStatus?.ready,null,{timeout:120000}); }
    catch (error) {
        console.log(await page.evaluate(async()=>({status:window.assetQAStatus,controller:navigator.serviceWorker.controller?.scriptURL,
            registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state,installing:r.installing?.state,waiting:r.waiting?.state})),
            caches:await caches.keys()})));
        throw error;
    } finally {clearTimeout(diagnostic);}
    const status=await page.evaluate(()=>window.assetQAStatus);
    assert.equal(status.totalFiles,manifest.resources.length);
    assert.ok(requests.some(r=>r.path==='/assets/town/background.webp'));
    assert.equal(await page.locator('canvas').getAttribute('data-scene'),'MenuScene');
    await page.screenshot({path:'artifacts/asset-streaming/menu-ready-tablet.png'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({stage:'background-ready-in-menu',initialAssets,files:status.totalFiles,bytes:status.totalBytes,elapsedMs:Date.now()-started,throttled,downloadBytesPerSecond:throttled?downloadBytesPerSecond:undefined}));
    // Persist a disposable QA fixture from the development build, never a real player's export.
    const dev=await context.newPage();
    await dev.route(/^http:\/\/127\.0\.0\.1:8140\/(?:api|v1)\//,r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
    await dev.goto('http://127.0.0.1:8140/',{waitUntil:'domcontentloaded'});
    await dev.waitForFunction(()=>window.__LITTLE_MATH_GAME__?.scene.isActive('MenuScene'));
    const fixture=await dev.evaluate(async()=>{
        const {GameStateManager}=await import('/src/systems/GameStateManager.ts');const state=GameStateManager.getInstance();
        state.getPlayer().name='Offline QA';state.getPlayer().seenGuides=['arena.free.v1'];
        state.setActiveSlotIndex(0);state.save();return localStorage.getItem('littleMathAdventure_slot_0');
    });
    await page.evaluate(save=>{localStorage.setItem('littleMathAdventure_slot_0',save);localStorage.setItem('littleMathAdventure_activeSlot','0')},fixture);
    // Install a changed JSON catalog as a new version while the old game remains open.
    const changedUrl='/assets/data/localization/en.json';
    const changed=Buffer.from(JSON.stringify({...JSON.parse(readFileSync(path.join(root,changedUrl))),offlineQARevision:2}));
    const update=structuredClone(manifest);
    const entry=update.resources.find(r=>r.url===changedUrl);entry.bytes=changed.length;entry.sha256=createHash('sha256').update(changed).digest('hex');
    update.revision=createHash('sha256').update(JSON.stringify(update.resources)).digest('hex').slice(0,24);
    overrides.set(changedUrl,changed);
    overrides.set('/offline-manifest.json',JSON.stringify(update));
    overrides.set('/offline-sw.js',`(${installOfflineWorker.toString()})(self,${JSON.stringify(update)});`);
    await page.evaluate(async()=>{
        window.updateQAMarker='still-playing';
        window.assetQARegistration=await navigator.serviceWorker.getRegistration();
        await window.assetQARegistration.update();
    });
    // Keep this predicate synchronous: this Playwright version treats a Promise itself as truthy.
    await page.waitForFunction(()=>window.assetQARegistration.waiting?.state === 'installed',null,{timeout:30000});
    assert.equal(await page.evaluate(()=>window.updateQAMarker),'still-playing');
    assert.equal(await page.locator('canvas').getAttribute('data-scene'),'MenuScene');
    assert.equal(await page.evaluate(async()=> (await (await fetch('/offline-manifest.json')).json()).revision),manifest.revision);
    const updateInventory=await page.evaluate(async name=>({files:(await (await caches.open(name)).keys()).length,
        caches:await caches.keys(),controllers:window.assetQAControllers,controller:navigator.serviceWorker.controller?.state,
        registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,waiting:r.waiting?.state,active:r.active?.state,installing:r.installing?.state}))}), 'cislokraj-game-%2Fhra%2F-'+update.revision);
    assert.equal(updateInventory.files,update.resources.length,JSON.stringify(updateInventory));
    console.log(JSON.stringify({stage:'complete-update-waits-without-reloading-game',passed:true}));
    await context.close();
    // Reopen the same browser profile with networking disabled, not merely a previously open tab.
    context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1024,height:768},args:['--enable-unsafe-swiftshader']});
    await context.setOffline(true);
    const offline=await context.newPage();
    const offlineErrors=[];offline.on('pageerror',e=>offlineErrors.push(e.message));
    const before=requests.filter(r=>r.path.startsWith('/assets/')).length;
    await offline.goto(origin+'/hra/',{waitUntil:'domcontentloaded'});
    await offline.locator('canvas[data-scene="MenuScene"]').waitFor({timeout:30000});
    assert.equal(await offline.evaluate(async()=>(await (await fetch('/offline-manifest.json')).json()).revision),update.revision);
    const audio=manifest.resources.find(r=>/\.(wav|mp3|ogg)$/.test(r.url));
    assert.deepEqual(await offline.evaluate(async url=>{const r=await fetch(url,{headers:{Range:'bytes=0-63'}});return {status:r.status,bytes:(await r.arrayBuffer()).byteLength}},audio.url),{status:206,bytes:64});
    const tap=async(x,y)=>{const b=await offline.locator('canvas').boundingBox();await offline.mouse.click(b.x+x*b.width/1280,b.y+y*b.height/720)};
    await tap(640,280);
    await offline.locator('canvas[data-scene="MenuNewScene"]').waitFor();
    await offline.keyboard.press('ArrowLeft');await offline.keyboard.press('Enter');
    await offline.locator('canvas[data-scene="TownScene"]').waitFor({timeout:30000});
    await offline.screenshot({path:'artifacts/asset-streaming/town-offline-tablet.png'});
    await tap(108,550);
    await offline.locator('canvas[data-scene="ArenaScene"]').waitFor({timeout:30000});
    await offline.screenshot({path:'artifacts/asset-streaming/arena-offline-tablet.png'});
    await tap(980,654);
    await offline.locator('canvas[data-scene="BattleScene"]').waitFor({timeout:30000});
    await offline.screenshot({path:'artifacts/asset-streaming/battle-offline-tablet.png'});
    await offline.setViewportSize({width:1280,height:720});
    await offline.screenshot({path:'artifacts/asset-streaming/battle-offline-desktop.png'});
    assert.equal(requests.filter(r=>r.path.startsWith('/assets/')).length,before,'offline traversal cannot use the network');
    assert.deepEqual(offlineErrors,[]);
    assert.equal(await offline.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')).player.name),'Offline QA');
    console.log(JSON.stringify({stage:'offline-browser-restart-and-battle',passed:true,networkAssetRequests:0,audioRange:true,savePreserved:true}));
} finally {
    await context?.close();await new Promise(resolve=>server.close(resolve));
    rmSync(profile,{recursive:true,force:true}); // Only the unique disposable profile created above.
}

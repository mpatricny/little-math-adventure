import assert from 'node:assert/strict';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import { createDatabase } from '../server/src/db/database.js';
import { requireAppliedMigrations } from '../server/src/db/preflight.js';
import { provisionFamily,familySaveStore } from '../server/src/domain/familySaves.js';
import { createApp } from '../server/src/app.js';
import { createLogger } from '../server/src/logger.js';
import { DevSaveStore } from './dev-save-store.mjs';
import { syncFamilyBridge } from './family-save-bridge.mjs';

const url = new URL(process.env.FAMILY_TEST_DATABASE_URL ?? 'about:blank');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/cislokraj_family_test');
const db=createDatabase(url.href);
await requireAppliedMigrations(db,resolve('server/migrations'));
const [actual]=await db`select current_database() as name`; assert.equal(actual.name,'cislokraj_family_test');
const familyId=randomUUID(), token=randomBytes(32).toString('hex'), family=familySaveStore(db);
const profiles=[0,1,6].map(slot=>({id:randomUUID(),slot}));
const parents=['north','south'].map(name=>({provider:'google' as const,providerSubject:randomUUID(),
    email:`${name}-${familyId}@example.invalid`,emailVerified:true}));
const grant=JSON.stringify({familyId,profiles,members:parents.map(p=>p.email),bridgeDigest:createHash('sha256').update(token).digest('hex')});
await provisionFamily(db,grant);await provisionFamily(db,grant);
assert.equal(await family.member({...parents[0],emailVerified:false}),null);
assert.equal(await family.member({...parents[0],email:'other@example.invalid',providerSubject:randomUUID()}),null);
assert.deepEqual(await family.member(parents[0]),{familyId,bridge:false});
assert.equal(await family.member({...parents[0],providerSubject:randomUUID()}),null);
assert.deepEqual(await family.member(parents[1]),{familyId,bridge:false});
const scratch=await mkdtemp(resolve(tmpdir(),'cislokraj-family-e2e-')), local=new DevSaveStore(scratch);
const saves=profiles.map(({id},i)=>({player:{name:'Test '+i,gameplayProfileId:id,characterType:'girl_knight',
 level:1,hp:10,maxHp:10,attack:1,defense:0,coins:{copper:3,silver:0,gold:0,pouch:0},diamonds:{common:0,red:0,green:0},
 ownedPets:[],unlockedPets:[],activePet:null,defeatedBosses:[],groundCrystals:[],
 arena:{isActive:false,arenaLevel:1,currentBattle:0,completedArenaLevels:[],waveResults:[]},
 townProgress:{unlockedBuildings:['arena-building'],revealedBuildings:['arena-building'],visitedBuildings:[],totalWavesCompleted:0,wavesAfterForgeUnlock:0}},timestamp:Date.now(),
 mathStats:{totalAttempts:10+i,correctAnswers:9,recentResults:[],problemStats:{},currentDifficulty:1,highestDifficulty:1,
 currentPool:[],poolCycle:0,dailyAttempts:0,lastAttemptDate:''}}));
const unrelated={...saves[0],player:{...saves[0].player,name:'Private guest',gameplayProfileId:randomUUID()}};
const seeded=await local.commit([...saves,unrelated].map((save,i)=>({sourceSlot:i,baseRevision:0,save})),'fixture',null);
assert.equal(seeded.ok,true);
await writeFile(resolve(scratch,'family-bridge.json'),JSON.stringify({token,familyId,profileIds:profiles.map(p=>p.id)}),{mode:0o600});
const origins=new Set<string>();
const sessions=new Map(parents.map(p=>[randomUUID(),p]));
const cookie=(headers:Headers)=>headers.get('cookie')?.match(/family_fixture=([\w-]+)/)?.[1]??'';
const app=createApp({config:{port:0,corsOrigins:origins,nodeEnv:'test',databaseUrl:url.href,auth:null,appRelease:'family-test',logLevel:'error'},
 auth:{getPrincipal:async headers=>sessions.get(cookie(headers))??null,close:async()=>{},
 handler:async req=>req.url.endsWith('/sign-out')?Response.json({success:true},{headers:{'Set-Cookie':'family_fixture=; Max-Age=0; Path=/'}}):new Response(null,{status:404})},
 checkDatabase:async()=>{},resolvePlayerAccount:async p=>({id:p.providerSubject}),logger:createLogger('error'),familySaves:family});
const dist=resolve('dist/pilot');
const mime:Record<string,string>={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.ogg':'audio/ogg','.woff2':'font/woff2','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
 try{
 const pathname=new URL(req.url??'/','http://localhost').pathname,base='http://'+req.headers.host;
 if(pathname.startsWith('/v1/')||pathname.startsWith('/api/')){
    const parts=[];for await(const part of req)parts.push(part);const r=await app.request(base+pathname,{method:req.method,headers:req.headers as any,...(parts.length?{body:Buffer.concat(parts)}:{})});
    res.writeHead(r.status,Object.fromEntries(r.headers));if(r.body)Readable.fromWeb(r.body as any).pipe(res);else res.end();return;
 }
 const asset=resolve(dist,'.'+(pathname==='/hra/'?'/index.html':pathname.replace(/^\/hra\//,'/')));
 if(!asset.startsWith(dist+sep)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',mime[extname(asset)]??'application/octet-stream');
 const stream=createReadStream(asset);stream.on('error',()=>res.writeHead(404).end());stream.pipe(res);
 }catch{res.writeHead(500).end();}
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+((server.address() as any).port);origins.add(base);
const bridgeFetch=(input:string,init:any)=>fetch(base+new URL(input).pathname,init);
const bridge=()=>syncFamilyBridge(local,scratch,bridgeFetch);
const browser=await chromium.launch({headless:true});
try{
 await bridge();
 const index=await family.list(familyId);assert.deepEqual(index.profiles.map(p=>Number(p.revision)),[1,1,1]);
 const endpoint=base+'/v1/family-saves',sessionKeys=[...sessions.keys()];
 assert.equal((await fetch(endpoint)).status,401);
 const getHeaders={cookie:'family_fixture='+sessionKeys[0]};
 assert.equal((await fetch(endpoint+'/'+unrelated.player.gameplayProfileId,{headers:getHeaders})).status,404);
 assert.equal((await fetch(endpoint+'/'+profiles[0].id,{method:'PUT',headers:{...getHeaders,'Content-Type':'application/json',Origin:'https://wrong.invalid'},body:'{}'})).status,403);
 const parent=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'});
 const second=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 await parent.addCookies([{name:'family_fixture',value:sessionKeys[0],url:base}]);
 await second.addCookies([{name:'family_fixture',value:sessionKeys[1],url:base}]);
 await parent.addInitScript(save=>{ if(!localStorage.getItem('littleMathAdventure_slot_0'))localStorage.setItem('littleMathAdventure_slot_0',JSON.stringify(save)); },unrelated);
 const a=await parent.newPage(),b=await second.newPage();
 const errors:string[]=[];for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 const keys=profiles.map(p=>'littleMathAdventure_family_'+familyId+'_slot_'+p.slot);
 await Promise.all([a.goto(base+'/hra/?renderer=canvas'),b.goto(base+'/hra/')]);
 await Promise.all([a,b].map(p=>p.locator('.game-account[data-auth-state="authenticated"]').waitFor({timeout:45000})));
 for(const page of [a,b])assert.deepEqual(await page.evaluate(keys=>keys.map(k=>JSON.parse(localStorage.getItem(k)!).player.name),keys),saves.map(s=>s.player.name));
 assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.name),'Private guest');
 const scene=JSON.parse(await readFile('public/assets/data/scenes.json','utf8')).scenes.MenuScene;
 const host=scene.ui.find((x:any)=>x.id==='btnContinue'),canvas=(await a.locator('canvas').boundingBox())!;
 await a.bringToFront();
 await a.mouse.click(canvas.x+host.x*canvas.width/1280,canvas.y+host.y*canvas.height/720);
 await a.locator('.game-account').waitFor({state:'detached'});
 const activeKey='littleMathAdventure_family_'+familyId+'_activeSlot';
 for(let attempt=0;attempt<20 && !(await a.evaluate(k=>localStorage.getItem(k),activeKey));attempt++){
    await a.waitForTimeout(150);await a.keyboard.press('Enter');
 }
 const activeSlot=await a.evaluate(k=>localStorage.getItem(k),activeKey);assert.notEqual(activeSlot,null);
 const active=profiles.find(p=>p.slot===Number(activeSlot))!;
 // Gameplay checkpoints time while the hero is active; observe its real save over the API.
 await a.waitForFunction(async id=>{
    const r=await fetch('/v1/family-saves/'+id);return r.ok && (await r.json()).revision>1;
 },active.id,{timeout:35000,polling:500});
 // A durable, offline save is replayed via the same bootstrap path after reconnecting.
 await a.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k)!);s.player.coins.copper=47;
   s.mathStats.totalAttempts+=2;s.timestamp=Date.now();localStorage.setItem(k,JSON.stringify(s));},keys[0]);
 await a.reload();await a.locator('.game-account[data-auth-state="authenticated"]').waitFor({timeout:45000});
 assert.equal((await family.read(familyId,profiles[0].id))!.save.player.coins.copper,47);
 await b.reload();await b.waitForFunction(k=>JSON.parse(localStorage.getItem(k)??'null')?.player.coins.copper===47,keys[0]);
 await bridge();
 const mac=(await local.catalog()).records.find((r:any)=>r.profileId===profiles[0].id);
 assert.equal(mac.save.player.coins.copper,47);
 const next=structuredClone(mac.save);next.mathStats.totalAttempts++;next.timestamp++;
 assert.equal((await local.commit([{sourceSlot:mac.sourceSlot,baseRevision:mac.revision,save:next}],'fixture',(await local.catalog()).serverId)).ok,true);
 await bridge();await b.reload();await b.waitForFunction(({key,attempts})=>JSON.parse(localStorage.getItem(key)!).mathStats.totalAttempts===attempts,{key:keys[0],attempts:next.mathStats.totalAttempts});
 const other=profiles[2], before=(await family.read(familyId,other.id))!;
 const put=(save:any)=>fetch(endpoint+'/'+other.id,{method:'PUT',headers:{...getHeaders,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({baseRevision:before.revision,save})});
 const left=structuredClone(before.save),right=structuredClone(before.save);left.player.hp=8;right.player.hp=9;
 const pair=await Promise.all([put(left),put(right)]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);assert.equal((await put(pair[0].ok?left:right)).status,200);
 await a.locator('[data-google-sign-in]').click();
 await a.locator('.game-account[data-auth-state="anonymous"]').waitFor({timeout:45000});
 assert.equal((await a.request.get(endpoint)).status(),401);
 assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.name),'Private guest');
 assert.deepEqual(errors,[]);
 console.log('PASS: both parents, 3 whole profiles, guest and unverified isolation, tablet menu and resume, browser-to-browser plus both directions of the private Mac bridge, stale writes, retry, sign-out.');
}finally{await browser.close();server.closeAllConnections();server.close();await db.end();}

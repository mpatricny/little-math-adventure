import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { installOfflineWorker } from '../../src/loading/offline-worker.mjs';
const cachePrefix = 'cislokraj-game-%2Fhra%2F-';

function harness(options = {}) {
    const files = options.files ?? {'/index.html':'<html>game</html>', '/assets/a.png':'123456789', '/assets/b.wav':'abcdefghij', '/assets/c.json':'{"ok":true}'};
    const resources = Object.entries(files).map(([url, body]) => ({url,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}));
    const manifest={revision:options.revision??'test-v1',entry:'/assets/a.png',shell:['/index.html'],resources};
    const caches = options.caches ?? new Map(), events = new Map(), requests = [], messages = [];
    let quota = false, active = 0, maxActive = 0, skip = 0, online = true;
    const api = {
        async open(name) {
            if(!caches.has(name))caches.set(name,new Map());const cache=caches.get(name);
            return {keys:async()=>[...cache.keys()].map(url=>new Request(url)),
                match:async url=>cache.get(typeof url==='string'?url:url.url)?.clone(),
                put:async(url,response)=>{if(quota)throw new DOMException('full','QuotaExceededError');cache.set(url,response.clone())}};
        },keys:async()=>[...caches.keys()],delete:async name=>caches.delete(name),
    };
    const scope={location:new URL('https://game.test/offline-sw.js'),registration:{scope:'https://game.test/hra/'},caches:api,crypto:webcrypto,
        clients:{claim:async()=>{},matchAll:async()=>[{postMessage:value=>messages.push(value)}]},
        skipWaiting(){skip++},addEventListener:(name,listener)=>events.set(name,listener),
        fetch:async(url,init)=>{
            requests.push({url,init});active++;maxActive=Math.max(maxActive,active);
            try{await new Promise(resolve=>setTimeout(resolve,2));if(!online)throw new TypeError('offline');
                const resource=new URL(url).pathname==='/hra/'?'/index.html':new URL(url).pathname;
                return options.response ? options.response(url,init) : new Response(files[resource]??'missing',{status:resource in files?200:404});
            }finally{active--}
        }};
    installOfflineWorker(scope,manifest);
    const emit=async(name,event={})=>{let result;const waiting=[];events.get(name)({...event,waitUntil:p=>waiting.push(p),respondWith:p=>{result=p}});await Promise.all(waiting);return result?await result:undefined};
    const message=(urls=[],online=false)=>emit('message',{source:{url:'https://game.test/hra/'},data:{type:'ASSET_PRIORITIZE',revision:manifest.revision,urls,online}});
    return {files,manifest,caches,api,requests,messages,scope,emit,message,get maxActive(){return maxActive},get skip(){return skip},set quota(v){quota=v},set online(v){online=v}};
}

test('installs only the shell; media waits for interaction; fetches at most two in the background',async()=>{
    const h=harness();await h.emit('install');assert.deepEqual(h.requests.map(r=>new URL(r.url).pathname),['/hra/']);
    await h.message(['/assets/b.wav','/assets/a.png']);
    assert.equal(h.requests[1].url,'https://game.test/assets/b.wav');assert.ok(h.maxActive<=2);
    assert.equal(h.messages.at(-1).ready,true);assert.equal(h.skip,0);
});
test('offline game navigation, /hra asset aliases and audio byte ranges use verified complete files',async()=>{
    const h=harness();await h.emit('install');await h.message();h.online=false;const count=h.requests.length;
    const navigation=await h.emit('fetch',{request:{method:'GET',url:'https://game.test/hra/?renderer=canvas',mode:'navigate',headers:new Headers()}});
    assert.equal(await navigation.text(),h.files['/index.html']);
    const image=await h.emit('fetch',{request:new Request('https://game.test/hra/assets/a.png')});assert.equal(await image.text(),'123456789');
    for(const [range,status,body] of [['bytes=2-5',206,'cdef'],['bytes=-3',206,'hij'],['bytes=99-',416,'']]){
        const response=await h.emit('fetch',{request:new Request('https://game.test/assets/b.wav',{headers:{Range:range}})});
        assert.equal(response.status,status);assert.equal(await response.text(),body);
    }assert.equal(h.requests.length,count);
});
test('never intercepts API/auth, posts, outside URLs, unknown assets or arbitrary navigation',async()=>{
    const h=harness();
    for(const url of ['/api/auth/get-session','/v1/me','/v1/gameplay/batch','/__learning-repair','/assets/missing.png','/other']){
        assert.equal(await h.emit('fetch',{request:new Request('https://game.test'+url)}),undefined);
    }
    assert.equal(await h.emit('fetch',{request:new Request('https://external.test/assets/a.png')}),undefined);
    assert.equal(await h.emit('fetch',{request:new Request('https://game.test/assets/a.png',{method:'POST'})}),undefined);
    assert.equal(h.requests.length,0);
});
test('rejects wrong-version and HTML fallback bytes, then retries after reconnect',async()=>{
    let broken=true;const h=harness({response:url=>new Response(broken?'<html>fallback</html>':new URL(url).pathname==='/assets/a.png'?'123456789':url.endsWith('/hra/')?'<html>game</html>':url.endsWith('.wav')?'abcdefghij':'{"ok":true}')});
    await h.message();assert.equal(h.messages.at(-1).ready,false);assert.equal(h.messages.at(-1).cached.length,0);
    broken=false;await h.message([],true);assert.equal(h.messages.at(-1).ready,true);
});
test('foreground requests share a concurrent background transfer',async()=>{
    const h=harness();await h.emit('install');const background=h.message(['/assets/a.png']);
    const foreground=h.emit('fetch',{request:new Request('https://game.test/assets/a.png')});
    assert.equal(await (await foreground).text(),'123456789');await background;
    assert.equal(h.requests.filter(r=>r.url.endsWith('/a.png')).length,1);
});
test('a cached partial audio response is retried as a complete network file before offline storage',async()=>{
    const h=harness({response:(url,init)=>new Response(init.cache==='force-cache'?'abc':'abcdefghij',{status:init.cache==='force-cache'?206:200})});
    const response=await h.emit('fetch',{request:new Request('https://game.test/assets/b.wav')});
    assert.equal(await response.text(),'abcdefghij');
    assert.deepEqual(h.requests.map(r=>r.init.cache),['force-cache','reload']);
    assert.equal(await (await h.api.open(cachePrefix+'test-v1')).match('https://game.test/assets/b.wav').then(r=>r.text()),'abcdefghij');
});
for (const failure of ['network', 'abort', 'interrupted-body', '304']) {
    test(`${failure} on the first transfer gets one uncached retry and a verified offline copy`,async()=>{
        const h=harness({response:(_url,init)=>{
            if(init.cache==='reload')return new Response('123456789');
            if(failure==='network')throw new TypeError('Failed to fetch');
            if(failure==='abort')throw new DOMException('timed out','AbortError');
            if(failure==='304')return new Response(null,{status:304});
            return new Response(new ReadableStream({start(controller){controller.error(new TypeError('connection lost'));}}));
        }});
        const request=new Request('https://game.test/assets/a.png');
        const response=await h.emit('fetch',{request});
        assert.equal(await response.text(),'123456789');
        assert.deepEqual(h.requests.map(r=>r.init.cache),['force-cache','reload']);
        assert.notEqual(h.requests[0].init.signal,h.requests[1].init.signal);
        h.online=false;
        assert.equal(await (await h.emit('fetch',{request})).text(),'123456789');
        assert.equal(h.requests.length,2);
    });
}
test('two failed attempts do not store partial data or readiness; reconnect resumes the background queue',async()=>{
    let broken=true;
    const files={'/index.html':'<html>game</html>','/assets/a.png':'123456789'};
    const h=harness({files,response:url=>{
        if(broken)throw new TypeError('offline');
        return new Response(url.endsWith('/hra/')?files['/index.html']:files['/assets/a.png']);
    }});
    await h.message();
    assert.equal(h.messages.at(-1).ready,false);
    assert.equal(h.messages.at(-1).cached.length,0);
    for(const url of new Set(h.requests.map(r=>r.url))) {
        assert.deepEqual(h.requests.filter(r=>r.url===url).map(r=>r.init.cache),['force-cache','reload']);
    }
    broken=false;await h.message([],true);
    assert.equal(h.messages.at(-1).ready,true);
    h.online=false;
    assert.equal(await (await h.emit('fetch',{request:new Request('https://game.test/assets/a.png')})).text(),'123456789');
});
test('large-file deadlines allow slow transfers but stay bounded',async t=>{
    const delays=[],schedule=setTimeout;
    t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{
        if(delay>2)delays.push(delay);
        return schedule(callback,delay,...args);
    });
    const h=harness();
    const entry=h.manifest.resources.find(r=>r.url==='/assets/a.png');
    // Only the declared size changes: no large allocation or wall-clock wait.
    entry.bytes=8*1024*1024;
    await assert.rejects(h.emit('fetch',{request:new Request('https://game.test/assets/a.png')}),/version mismatch/);
    assert.deepEqual(delays,[84_000,84_000]);
    delays.length=0;entry.bytes=256*1024*1024;
    await assert.rejects(h.emit('fetch',{request:new Request('https://game.test/assets/a.png')}),/version mismatch/);
    assert.deepEqual(delays,[120_000,120_000]);
});
test('quota failure degrades honestly; cached/saved player data and unrelated caches are never removed',async()=>{
    const h=harness();await h.api.open('unrelated-cache');await h.emit('install');await h.api.open(cachePrefix+'old');
    await h.api.open('cislokraj-game-%2F-another-scope');
    await h.emit('activate');assert.ok(h.caches.has('unrelated-cache'));assert.ok(!h.caches.has(cachePrefix+'old'));
    assert.ok(h.caches.has('cislokraj-game-%2F-another-scope'));
    h.quota=true;await h.message();assert.equal(h.messages.at(-1).ready,false);assert.equal(h.messages.at(-1).storageError,true);
    assert.ok(h.caches.has('unrelated-cache'));
});
test('an update is fully cached before install completes; unchanged files are reused and current clients keep their version',async()=>{
    const old=harness();await old.emit('install');await old.message();
    const update=harness({caches:old.caches,revision:'test-v2',files:{...old.files,'/assets/c.json':'{"ok":false}'}});
    await update.emit('install');
    assert.equal(update.caches.get(cachePrefix+'test-v2').size,4);
    assert.deepEqual(update.requests.map(r=>new URL(r.url).pathname),['/assets/c.json']);
    assert.ok(update.caches.has(cachePrefix+'test-v1'));assert.equal(update.skip,0);
    const original=await old.emit('fetch',{request:new Request('https://game.test/assets/c.json')});assert.equal(await original.text(),'{"ok":true}');
    update.online=false;await update.emit('activate');
    assert.equal(update.caches.has(cachePrefix+'test-v1'),false);
    const fresh=await update.emit('fetch',{request:new Request('https://game.test/assets/c.json')});assert.equal(await fresh.text(),'{"ok":false}');
});
test('an interrupted update removes only its incomplete cache and retains the offline-ready release',async()=>{
    const old=harness();await old.emit('install');await old.message();
    const update=harness({caches:old.caches,revision:'test-v2',files:{...old.files,'/assets/c.json':'{"ok":false}'}});update.online=false;
    await assert.rejects(update.emit('install'));
    assert.equal(update.caches.has(cachePrefix+'test-v2'),false);assert.equal(update.caches.get(cachePrefix+'test-v1').size,4);
});
test('cache inventory detects eviction; foreign or wrong-version messages cannot trigger downloads',async()=>{
    const h=harness();await h.emit('message',{source:{url:'https://other.test'},data:{type:'ASSET_PRIORITIZE',revision:'test-v1'}});
    await h.emit('message',{source:{url:'https://game.test/hra/'},data:{type:'ASSET_PRIORITIZE',revision:'old'}});assert.equal(h.requests.length,0);
    await h.message();h.caches.get(cachePrefix+'test-v1').delete('https://game.test/assets/a.png');
    let status;await h.emit('message',{source:{url:'https://game.test/hra/'},data:{type:'ASSET_STATUS',revision:'test-v1'},ports:[{postMessage:value=>status=value}]});assert.equal(status.ready,false);
    await h.message();assert.equal(h.messages.at(-1).ready,true);
});

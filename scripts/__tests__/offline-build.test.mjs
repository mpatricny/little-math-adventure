import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createOfflineManifest } from '../offline-build.mjs';

function fixture(run) {
    const root=mkdtempSync(path.join(tmpdir(),'offline-manifest-test-'));
    mkdirSync(path.join(root,'assets/data'),{recursive:true});
    writeFileSync(path.join(root,'index.html'),'<script type="module" src="/assets/index-abc.js"></script>');
    writeFileSync(path.join(root,'assets/index-abc.js'),'/*game*/');
    writeFileSync(path.join(root,'assets/data/scenes.json'),'{"v":1}');
    try{return run(root)}finally{rmSync(root,{recursive:true,force:true})}
}
test('manifest pins both mutable JSON and built entry code by content, deterministically',()=>fixture(root=>{
    const plan={all:['/assets/data/scenes.json','/assets/data/scenes.json']};
    const one=createOfflineManifest(root,plan,['assets/index-abc.js']);
    assert.equal(one.entry,'/assets/index-abc.js');assert.equal(one.resources.length,3);
    assert.deepEqual(one,createOfflineManifest(root,plan,['assets/index-abc.js']));
    writeFileSync(path.join(root,'assets/data/scenes.json'),'{"v":2}');
    const two=createOfflineManifest(root,plan,['assets/index-abc.js']);assert.notEqual(one.revision,two.revision);
    assert.deepEqual(one.shell,['/assets/index-abc.js','/index.html']);
}));
test('private endpoints, outside paths and non-existent dependencies cannot enter a release cache',()=>fixture(root=>{
    for(const url of ['/api/auth/get-session','/v1/me','/../secret','/assets/%2e%2e%2fsecret','https://other.test/a','/assets/missing.png']){
        assert.throws(()=>createOfflineManifest(root,{all:[url]},['assets/index-abc.js']));
    }
}));
test('spaces in historical sprite filenames have exactly the browser URL used by cache inventory and offline fetch',()=>fixture(root=>{
    writeFileSync(path.join(root,'assets/spritesheet (23).webp'),'sprite');
    const manifest=createOfflineManifest(root,{all:['/assets/spritesheet (23).webp','/assets/spritesheet%20(23).webp']},['assets/index-abc.js']);
    const sprites=manifest.resources.filter(r=>r.url.includes('spritesheet'));
    assert.equal(sprites.length,1);assert.equal(sprites[0].url,'/assets/spritesheet%20(23).webp');
}));

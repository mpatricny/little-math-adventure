import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validDevSave } from './dev-save-store.mjs';

const endpoint = 'https://cislokraj.cz/v1/family-saves';

async function readOptional(file) {
    try { return JSON.parse(await readFile(file,'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export async function syncFamilyBridge(store, directory, fetcher = fetch) {
    const config = await readOptional(path.join(directory,'family-bridge.json'));
    if (!config) return;
    if (!/^[a-f0-9]{64}$/.test(config.token) || !Array.isArray(config.profileIds) ||
        !config.profileIds.length || new Set(config.profileIds).size !== config.profileIds.length)
        throw new Error('Invalid private bridge configuration');
    const headers = { Authorization: 'Bearer '+config.token };
    const request = (suffix, init={}) => fetcher(endpoint+suffix,{
        ...init, headers:{...headers,...init.headers},redirect:'error',signal:AbortSignal.timeout(12000),
    });
    const response = await request('');
    if (!response.ok) throw new Error('Family index unavailable');
    const index = await response.json();
    if (index.familyId !== config.familyId || !Array.isArray(index.profiles) ||
        index.profiles.length !== config.profileIds.length ||
        config.profileIds.some(id=>!index.profiles.some(p=>p.id===id))) throw new Error('Family scope mismatch');
    const catalog = await store.catalog();
    const file = path.join(directory,'family-bridge-state.json');
    const state = await readOptional(file) ?? {familyId:index.familyId,serverId:catalog.serverId,profiles:{}};
    if (state.familyId !== index.familyId || state.serverId !== catalog.serverId) throw new Error('Local catalog identity changed');
    const conflicts=[];
    for (const profile of index.profiles) {
        const local = catalog.records.find(r=>r.profileId===profile.id);
        const prior = state.profiles[profile.id];
        if (local && prior?.local === local.revision && prior?.remote === profile.revision) continue;
        const localChanged = local && (!prior || local.revision !== prior.local);
        if (localChanged && (prior || profile.revision===0)) {
            const put = await request('/'+profile.id,{method:'PUT',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({baseRevision:prior?.remote ?? 0,save:local.save})});
            if (put.ok) {
                const {revision} = await put.json();
                if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid cloud receipt');
                state.profiles[profile.id]={local:local.revision,remote:revision};
                continue;
            }
            if (put.status!==409) throw new Error('Family upload deferred');
        }
        if (!profile.revision) continue;
        const get = await request('/'+profile.id);
        if (!get.ok) throw new Error('Family download deferred');
        const {revision,save} = await get.json();
        if (!validDevSave(save) || save.player.gameplayProfileId!==profile.id ||
            !Number.isSafeInteger(revision) || revision < profile.revision) throw new Error('Invalid family snapshot');
        if (local && isDeepStrictEqual(local.save,save)) {
            state.profiles[profile.id]={local:local.revision,remote:revision};
            continue;
        }
        if (localChanged) { conflicts.push(profile.id); continue; }
        const update = await store.commit([{sourceSlot:local?.sourceSlot ?? profile.slot,
            baseRevision:local?.revision ?? 0,save}],'family-cloud',catalog.serverId);
        if (!update.ok) { conflicts.push(profile.id); continue; }
        state.profiles[profile.id]={local:update.records.find(r=>r.profileId===profile.id).revision,remote:revision};
    }
    const before = await readOptional(file);
    if (!isDeepStrictEqual(state,before)) {
        const temp = file+'.'+randomUUID()+'.tmp';
        await writeFile(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});
        await rename(temp,file);
    }
    if (conflicts.length) throw new Error('Concurrent family progress preserved on both sides');
}

export function startFamilyBridge(store, directory) {
    let busy=false, lastError='';
    const run=async()=>{
        if (busy) return;
        busy=true;
        try { await syncFamilyBridge(store,directory); lastError=''; }
        catch(e) { if (e.message!==lastError) console.warn('[FamilySaves]',e.message); lastError=e.message; }
        finally { busy=false; }
    };
    void run();
    const timer=setInterval(run,15000);
    timer.unref();
    return ()=>clearInterval(timer);
}

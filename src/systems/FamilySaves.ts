import type { SaveSlotData } from '../types';
import { SaveSystem } from './SaveSystem';

const endpoint = '/v1/family-saves';
const authEvent = 'cislokraj-auth-changed';
const logoutKey = 'cislokraj-family-logout';
type Profile = {id: string; slot: number; revision: number};
type Catalog = {familyId: string; profiles: Profile[]};
type Marker = {revision: number; digest: string};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

async function call(path = '', init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        return await fetch(endpoint + path, {credentials:'same-origin', cache:'no-store', ...init, signal:controller.signal});
    } finally { clearTimeout(timer); }
}

function catalog(value: Catalog): Catalog {
    if (!value || !uuid.test(value.familyId) || !Array.isArray(value.profiles) || value.profiles.length > 8
        || value.profiles.some(p => !uuid.test(p.id) || !Number.isInteger(p.slot) || p.slot < 0 || p.slot > 7 ||
            !Number.isSafeInteger(p.revision) || p.revision < 0)
        || new Set(value.profiles.map(p => p.id)).size !== value.profiles.length) throw new Error('Invalid family index');
    return value;
}

async function digest(raw: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,'0')).join('');
}

// Keep an independently played branch before restoring the shared version. If storage is full, keep the local game untouched.
async function archiveBranch(family: string, id: string, hash: string, save: SaveSlotData): Promise<void> {
    await new Promise<void>((resolve,reject) => {
        const open = indexedDB.open('cislokraj-family-conflicts',1);
        open.onupgradeneeded = () => open.result.createObjectStore('copies');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction('copies','readwrite');
            tx.objectStore('copies').put(save,[family,id,hash]);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
        };
    });
}

export async function startFamilySaves(atMenu: () => boolean): Promise<() => void> {
    let stopped = false, busy = false, timer: ReturnType<typeof setTimeout> | undefined;
    let family: Catalog | undefined;
    let retryMembership = false;
    const pending = new Set<string>();
    const bases = new Map<string,Marker>();
    const markerKey = (id: string) => `cislokraj-family-sync:${family!.familyId}:${id}`;
    const mark = (id: string, revision: number, hash: string) => {
        const next = {revision,digest:hash};
        localStorage.setItem(markerKey(id),JSON.stringify(next));
        bases.set(id,next);
    };
    const slots = () => Array.from({length:8},(_,slot)=>SaveSystem.readSnapshot(slot));

    async function reconcile(profile: Profile, atBoot: boolean): Promise<boolean> {
        const base = bases.get(profile.id);
        if (!atBoot && !pending.has(profile.id) && base?.revision === profile.revision) return false;
        const entries = slots();
        const localSlot = entries.findIndex(save => save?.player.gameplayProfileId === profile.id);
        const local = entries[localSlot];
        let restoreConflict = false;
        // An unrelated, newly created hero in this workspace is never published to the other parent.
        if (local && (atBoot || pending.has(profile.id))) {
            const raw = JSON.stringify(local), hash = await digest(raw);
            if (base && hash !== base.digest) {
                const response = await call('/'+profile.id,{method:'PUT',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({baseRevision:base.revision,save:local})});
                if (response.ok) {
                    const {revision} = await response.json();
                    if (!Number.isSafeInteger(revision) || revision < base.revision) throw new Error('Invalid revision');
                    mark(profile.id,revision,hash);
                    if (JSON.stringify(SaveSystem.readSnapshot(localSlot)) === raw) pending.delete(profile.id);
                    return false;
                }
                if (response.status !== 409) throw new Error('Family upload deferred');
                if (!atBoot) return atMenu();
                await archiveBranch(family!.familyId,profile.id,hash,local);
                restoreConflict = true;
            } else if (base) pending.delete(profile.id);
            else if (atBoot) await archiveBranch(family!.familyId,profile.id,hash,local);
        }
        if (!profile.revision || (!restoreConflict && local && base?.revision === profile.revision)) return false;
        const slot = localSlot >= 0 ? localSlot : entries[profile.slot] === null ? profile.slot : entries.indexOf(null);
        if (slot < 0) return false;
        if (!atBoot) return atMenu();
        const response = await call('/'+profile.id);
        if (!response.ok) throw new Error('Family download deferred');
        const record = await response.json();
        if (!SaveSystem.isValidSaveData(record.save) || record.save.player.gameplayProfileId !== profile.id ||
            !Number.isSafeInteger(record.revision) || record.revision < profile.revision) throw new Error('Invalid family save');
        const hash = await digest(JSON.stringify(record.save));
        SaveSystem.restoreFamilySnapshot(slot,record.save);
        mark(profile.id,record.revision,hash);
        return false;
    }

    async function refresh(boot = false): Promise<void> {
        if (busy || stopped) return;
        busy = true;
        try {
            const response = await call();
            if ([401,403].includes(response.status)) {
                retryMembership = false;
                if (family) location.reload();
                return;
            }
            if (!response.ok) throw new Error('Family index unavailable');
            const index = catalog(await response.json());
            if (stopped) return;
            if (!family) {
                if (!boot) { location.reload(); return; }
                family = index;
                SaveSystem.useFamilyStorage(index.familyId);
                for (const p of index.profiles) {
                    const raw = localStorage.getItem(markerKey(p.id));
                    if (raw) {
                        try { const b = JSON.parse(raw); if (Number.isSafeInteger(b.revision) && /^[a-f\d]{64}$/.test(b.digest)) bases.set(p.id,b); }
                        catch { /* Keep an untracked local branch before downloading. */ }
                    }
                }
            } else if (index.familyId !== family.familyId) { location.reload(); return; }
            family = index;
            retryMembership = false;
            const results = await Promise.allSettled(index.profiles.map(p => reconcile(p,boot)));
            if (!boot && !stopped && results.some(r => r.status === 'fulfilled' && r.value)) location.reload();
            if (results.some(r => r.status === 'rejected')) console.warn('[FamilySaves] Transfer deferred');
        } catch {
            retryMembership = !family;
        } finally { busy = false; }
    }
    if (navigator.onLine) await refresh(true);
    else retryMembership=true;
    function changed() {
        if (!family) return;
        for (const p of family.profiles) pending.add(p.id);
        if (timer === undefined) timer = setTimeout(() => { timer = undefined; void refresh(); },600);
    }
    const unsubscribe = SaveSystem.observeChanges(changed);
    const tick = () => { if (family || retryMembership) void refresh(); };
    const interval = setInterval(tick,15000);
    const focus = () => { if (document.visibilityState === 'visible') tick(); };
    const logOut = () => {
        if (!family) return;
        stopped = true; localStorage.setItem(logoutKey,String(Date.now())); location.reload();
    };
    const otherTab = (e: StorageEvent) => { if (e.key === logoutKey && family) { stopped=true; location.reload(); } };
    const returned = (e: PageTransitionEvent) => { if (e.persisted) void refresh(); };
    window.addEventListener(authEvent,logOut);
    window.addEventListener('storage',otherTab);
    window.addEventListener('pageshow',returned);
    window.addEventListener('online',tick);
    document.addEventListener('visibilitychange',focus);
    return () => {
        stopped=true; clearTimeout(timer); clearInterval(interval); unsubscribe();
        window.removeEventListener(authEvent,logOut); window.removeEventListener('storage',otherTab);
        window.removeEventListener('pageshow',returned); window.removeEventListener('online',tick);
        document.removeEventListener('visibilitychange',focus);
    };
}

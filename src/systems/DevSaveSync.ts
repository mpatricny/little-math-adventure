import type { SaveSlotData } from '../types';
import { SaveSystem } from './SaveSystem';
import { devSaveRollbackReasons } from './devSaveProgress.mjs';

const endpoint = '/__dev-saves/api';
const prefix = 'littleMathAdventure_slot_';
const stateKey = 'littleMathAdventure_devSync_v1';
type Entry = { sourceSlot: number; save: SaveSlotData };
export type DevSaveRecord = Entry & { profileId: string; revision: number; receivedAt: number };
export type DevSaveCatalog = { version: 1; serverId: string | null; records: DevSaveRecord[] };
type SyncState = { serverId: string | null; profiles: Record<string, { revision: number; fingerprint: string }>; deleted: string[]; restoreEpoch?: string };
type Write = Entry & { baseRevision: number };

// Dirty detection only; server revision checks protect writes independently of this hash.
function fingerprint(save: SaveSlotData): string {
    const json = JSON.stringify(save); let a = 2166136261, b = 5381;
    for (let index = 0; index < json.length; index++) {
        const value = json.charCodeAt(index); a = Math.imul(a ^ value, 16777619); b = Math.imul(b, 33) ^ value;
    }
    return `${json.length}:${a >>> 0}:${b >>> 0}`;
}

function state(): SyncState {
    try {
        const saved = JSON.parse(localStorage.getItem(stateKey) ?? 'null');
        if (saved && typeof saved.profiles === 'object' && saved.profiles !== null && Array.isArray(saved.deleted)
            && (saved.serverId === null || typeof saved.serverId === 'string')
            && Object.values(saved.profiles).every((entry: any) => Number.isSafeInteger(entry?.revision)
                && entry.revision > 0 && typeof entry.fingerprint === 'string')) return saved;
    } catch { /* A damaged sync marker never authorizes replacing a local game. */ }
    return { serverId: null, profiles: {}, deleted: [] };
}

function validateCatalog(value: unknown): DevSaveCatalog {
    const catalog = value as DevSaveCatalog;
    if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.records) || catalog.records.length > 64
        || !(catalog.serverId === null || typeof catalog.serverId === 'string')) throw new Error('Neplatná záloha');
    const ids = new Set<string>();
    for (const record of catalog.records) {
        if (!SaveSystem.isValidSaveData(record.save) || typeof record.profileId !== 'string'
            || !/^[a-zA-Z0-9_-]{8,100}$/.test(record.profileId) || ['__proto__', 'prototype', 'constructor'].includes(record.profileId) || ids.has(record.profileId)
            || record.profileId !== record.save.player.gameplayProfileId || !Number.isSafeInteger(record.revision)
            || record.revision < 1 || !Number.isInteger(record.sourceSlot) || record.sourceSlot < 0 || record.sourceSlot > 7) {
            throw new Error('Neplatná záloha');
        }
        ids.add(record.profileId);
    }
    return catalog;
}

async function request(fetcher: typeof fetch, mode?: 'commit' | 'archive', writes?: Write[], serverId = state().serverId): Promise<Response> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3000);
    try {
        return await fetcher(endpoint, { signal: controller.signal, credentials: 'same-origin',
            ...(mode ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, serverId, writes }) } : {}),
        });
    } finally { clearTimeout(timeout); }
}

export function readDevSaves(): Entry[] {
    const entries: Entry[] = [];
    for (let sourceSlot = 0; sourceSlot < 8; sourceSlot++) {
        const save = SaveSystem.load(sourceSlot);
        if (save && SaveSystem.isValidSaveData(save)) entries.push({ sourceSlot, save });
    }
    return entries;
}

export async function fetchDevCatalog(fetcher: typeof fetch = fetch): Promise<DevSaveCatalog> {
    const response = await request(fetcher);
    if (!response.ok) throw new Error('Mac nedostupný');
    return validateCatalog(await response.json());
}

function acknowledge(catalog: DevSaveCatalog, entries: Entry[]): void {
    const next = state();
    if (next.serverId && next.serverId !== catalog.serverId) next.profiles = {};
    next.serverId = catalog.serverId;
    for (const entry of entries) {
        const id = entry.save.player.gameplayProfileId!;
        const remote = catalog.records.find(record => record.profileId === id);
        if (!remote || JSON.stringify(remote.save) !== JSON.stringify(entry.save)) throw new Error('Neověřená záloha');
        next.profiles[id] = { revision: remote.revision, fingerprint: fingerprint(entry.save) };
        next.deleted = next.deleted.filter(deleted => deleted !== id);
    }
    localStorage.setItem(stateKey, JSON.stringify(next));
}

/** Parent-initiated capture chooses the tablet's version, with a revision guard and server history. */
export async function captureDevSaves(entries: Entry[], catalog: DevSaveCatalog, fetcher: typeof fetch = fetch): Promise<DevSaveCatalog> {
    if (!entries.length) throw new Error('Žádné uložené hry');
    const response = await request(fetcher, 'commit', entries.map(entry => ({ ...entry,
        baseRevision: catalog.records.find(remote => remote.profileId === entry.save.player.gameplayProfileId)?.revision ?? 0,
    })), catalog.serverId);
    if (!response.ok) {
        if (response.status === 409 && (await response.json()).error === 'older_progress') throw new Error('Starší uložená hra');
        throw new Error(response.status === 409 ? 'Dvě verze hry' : 'Záloha selhala');
    }
    const result = validateCatalog(await response.json());
    acknowledge(result, entries);
    return result;
}

/** Explicit restore by identity. Archive the browser before any replacement; roll back failed writes. */
export async function restoreDevSaves(records: DevSaveRecord[], serverId: string | null,
    fetcher: typeof fetch = fetch, preserveActive = false): Promise<number[]> {
    validateCatalog({ version: 1, serverId, records });
    if (!records.length || records.length > 8) throw new Error('Vyber uložené hry');
    const originals = Array.from({ length: 8 }, (_, slot) => localStorage.getItem(prefix + slot));
    const oldState = localStorage.getItem(stateKey), oldActive = localStorage.getItem('littleMathAdventure_activeSlot');
    const local = readDevSaves();
    // Identity backfill during a read must be included in the rollback and concurrency check.
    originals.forEach((_, slot) => { originals[slot] = localStorage.getItem(prefix + slot); });
    const reserved = new Set(originals.flatMap((raw, slot) => raw !== null ? [slot] : []));
    const assignments = records.map(remote => {
        const matching = local.filter(entry => entry.save.player.gameplayProfileId === remote.profileId);
        if (matching.length > 1) throw new Error('Duplicitní profil');
        if (matching[0] && devSaveRollbackReasons(matching[0].save, remote.save).length) throw new Error('Starší uložená hra');
        let target = matching[0]?.sourceSlot;
        if (target === undefined) {
            target = !reserved.has(remote.sourceSlot) ? remote.sourceSlot : originals.findIndex((raw, slot) => raw === null && !reserved.has(slot));
            if (target < 0) throw new Error('Není volné místo');
        }
        reserved.add(target);
        return { sourceSlot: target, save: remote.save };
    });
    if (local.length) {
        const archived = await request(fetcher, 'archive', local.map(entry => ({ ...entry, baseRevision: 0 })));
        if (!archived.ok) throw new Error('Záloha selhala');
    }
    if (originals.some((raw, slot) => localStorage.getItem(prefix + slot) !== raw)
        || localStorage.getItem(stateKey) !== oldState) throw new Error('Hra se změnila');
    try {
        for (const entry of assignments) localStorage.setItem(prefix + entry.sourceSlot, JSON.stringify(entry.save));
        acknowledge({ version: 1, serverId, records }, assignments);
        const restoredState = state();
        restoredState.restoreEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(stateKey, JSON.stringify(restoredState));
        if (!preserveActive || oldActive === null) localStorage.setItem('littleMathAdventure_activeSlot', String(assignments[0].sourceSlot));
        for (const entry of assignments) {
            if (localStorage.getItem(prefix + entry.sourceSlot) !== JSON.stringify(entry.save)) throw new Error('Uložení selhalo');
        }
    } catch (error) {
        for (const entry of assignments) localStorage.removeItem(prefix + entry.sourceSlot);
        localStorage.removeItem(stateKey); localStorage.removeItem('littleMathAdventure_activeSlot');
        for (const entry of assignments) {
            const raw = originals[entry.sourceSlot];
            if (raw !== null) localStorage.setItem(prefix + entry.sourceSlot, raw);
        }
        if (oldState === null) localStorage.removeItem(stateKey); else localStorage.setItem(stateKey, oldState);
        if (oldActive === null) localStorage.removeItem('littleMathAdventure_activeSlot'); else localStorage.setItem('littleMathAdventure_activeSlot', oldActive);
        throw error;
    }
    return assignments.map(entry => entry.sourceSlot);
}

export class DevSaveSync {
    private busy = false;
    private blocked = new Set<string>();
    private knownIds = new Set<string>();
    private restoreEpoch = state().restoreEpoch;
    constructor(private fetcher: typeof fetch = fetch) {}

    async initialize(): Promise<void> {
        const local = readDevSaves();
        this.knownIds = new Set(local.map(entry => entry.save.player.gameplayProfileId!));
        try {
            const catalog = await fetchDevCatalog(this.fetcher), previous = state();
            if (previous.serverId !== null && previous.serverId !== catalog.serverId) {
                previous.profiles = {}; previous.serverId = catalog.serverId;
                localStorage.setItem(stateKey, JSON.stringify(previous));
            }
            const updates = catalog.records.filter(remote => {
                const matches = local.filter(entry => entry.save.player.gameplayProfileId === remote.profileId);
                if (matches.length > 1) { this.blocked.add(remote.profileId); return false; }
                const entry = matches[0];
                if (!entry) return !previous.deleted.includes(remote.profileId);
                if (JSON.stringify(entry.save) === JSON.stringify(remote.save)) {
                    acknowledge(catalog, [entry]); return false;
                }
                const known = previous.profiles[remote.profileId];
                // Only a known, unchanged local copy can be replaced automatically.
                return !!known && known.revision <= remote.revision && known.fingerprint === fingerprint(entry.save);
            });
            if (updates.length) await restoreDevSaves(updates, catalog.serverId, this.fetcher, true);
            await this.flush();
        } catch (error) { console.warn('[DevSaveSync] Local saves remain available; backup will retry.', error); }
        finally {
            this.knownIds = new Set(readDevSaves().map(entry => entry.save.player.gameplayProfileId!));
            this.restoreEpoch = state().restoreEpoch;
        }
    }

    acceptsWrites(): boolean { return state().restoreEpoch === this.restoreEpoch; }

    changed(): void {
        if (!this.acceptsWrites()) return;
        const ids = new Set(readDevSaves().map(entry => entry.save.player.gameplayProfileId!)), next = state();
        for (const id of this.knownIds) if (!ids.has(id) && !next.deleted.includes(id)) next.deleted.push(id);
        localStorage.setItem(stateKey, JSON.stringify(next));
        this.knownIds = ids;
        void this.flush();
    }

    async flush(): Promise<void> {
        if (this.busy || !this.acceptsWrites()) return;
        this.busy = true;
        try {
            const current = readDevSaves(), known = state();
            const counts = new Map<string, number>();
            for (const entry of current) { const id = entry.save.player.gameplayProfileId!; counts.set(id, (counts.get(id) ?? 0) + 1); }
            const dirty = current.filter(entry => {
                const id = entry.save.player.gameplayProfileId!;
                return counts.get(id) === 1 && !this.blocked.has(id) && known.profiles[id]?.fingerprint !== fingerprint(entry.save);
            });
            if (!dirty.length) return;
            const writes = dirty.map(entry => ({ ...entry, baseRevision: known.profiles[entry.save.player.gameplayProfileId!]?.revision ?? 0 }));
            const response = await request(this.fetcher, 'commit', writes);
            if (!this.acceptsWrites()) return; // A response from an old tab cannot change the restore checkpoint.
            if (response.status === 409) {
                const result = await response.json();
                for (const id of result.conflicts ?? []) this.blocked.add(id);
                console.warn('[DevSaveSync] Two versions preserved. Resolve at /__dev-saves/.');
                return;
            }
            if (!response.ok) throw new Error('Backup unavailable');
            acknowledge(validateCatalog(await response.json()), dirty);
        } catch (error) { console.warn('[DevSaveSync] Backup will retry.', error); }
        finally { this.busy = false; }
    }
}

export async function startDevSaveSync(): Promise<() => void> {
    SaveSystem.migrateOldSave();
    const sync = new DevSaveSync();
    await sync.initialize();
    const unsubscribe = SaveSystem.observeChanges(() => sync.changed());
    const unguard = SaveSystem.guardWrites(() => {
        if (sync.acceptsWrites()) return true;
        // An old game tab must reload before it can save over a parent's explicit restore.
        window.dispatchEvent(new Event('cislokraj-save-reload'));
        window.location.reload();
        return false;
    });
    const flush = () => { void sync.flush(); };
    const timer = window.setInterval(flush, 5000);
    window.addEventListener('online', flush); window.addEventListener('pagehide', flush);
    return () => { unsubscribe(); unguard(); clearInterval(timer); window.removeEventListener('online', flush); window.removeEventListener('pagehide', flush); };
}

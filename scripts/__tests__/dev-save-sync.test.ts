import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
// @ts-ignore Native Vite middleware is also exercised by this browser-client integration.
import { DevSaveStore } from '../dev-save-store.mjs';
import type { SaveSlotData } from '../../src/types';
import { DevSaveSync, captureDevSaves, fetchDevCatalog, readDevSaves, restoreDevSaves } from '../../src/systems/DevSaveSync';
import { SaveSystem } from '../../src/systems/SaveSystem';

function storage() {
    const data = new Map<string, string>();
    const result = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
        removeItem: (key: string) => { data.delete(key); }, clear: () => { data.clear(); }, key: (index: number) => [...data.keys()][index] ?? null,
        get length() { return data.size; } };
    Object.defineProperty(globalThis, 'localStorage', { value: result, configurable: true });
    return result;
}
function save(id = 'profile-ada', attempts = 42): SaveSlotData {
    return { player: { name: id, gameplayProfileId: id, level: 5, hp: 15, maxHp: 15, attack: 7, defense: 2,
        storyProgress: { hasClaimedForestCrystal: true }, seenGuides: ['forge.merge.v1'] },
    mathStats: { totalAttempts: attempts, correctAnswers: 38, recentResults: [true, false], problemStats: { a: { correct: 3 } } }, timestamp: attempts } as unknown as SaveSlotData;
}
const put = (data: SaveSlotData, slot = 0) => localStorage.setItem('littleMathAdventure_slot_' + slot, JSON.stringify(data));
function evidencedSave(id: string, name: string, count: number): SaveSlotData {
    const data = save(id, count); data.player.name = name; data.mathStats.correctAnswers = count;
    data.mathStats.masteryData = { problemRecords: {}, learningHistory: { version: 1,
        attempts: Array.from({ length: count }, (_, i) => ({ source: 'mastery', problemKey: name + ':' + i,
            timestamp: 1788000000000 + i, correct: true, responseTimeMs: 3500, subAtomId: 'A1', form: 'result_unknown' })) } } as any;
    return data;
}
let directory: string, store: any, fetcher: typeof fetch;
beforeEach(async () => {
    storage(); directory = await mkdtemp(path.join(tmpdir(), 'dev-save-client-')); store = new DevSaveStore(directory);
    fetcher = (async (_url: unknown, init?: RequestInit) => {
        if (!init?.method) return Response.json(await store.catalog());
        const body = JSON.parse(String(init.body));
        const result = body.mode === 'archive' ? await store.archive(body.writes, 'test') : await store.commit(body.writes, 'test', body.serverId);
        return Response.json(result, { status: result.ok === false ? 409 : 200 });
    }) as typeof fetch;
    vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

describe('development saves across origins', () => {
    it('persists answers immediately and backs up the latest answer without scanning slots on each tap', async () => {
        put(save());
        const sync = new DevSaveSync(fetcher);
        await sync.initialize();
        const unsubscribe = SaveSystem.observeChanges(change => sync.changed(change));
        const loads = vi.spyOn(SaveSystem, 'load');
        try {
            for (const attempts of [43, 44]) {
                const next = save('profile-ada', attempts);
                SaveSystem.save(0, next.player, next.mathStats);
                expect(SaveSystem.readSnapshot(0)?.mathStats.totalAttempts).toBe(attempts);
            }
            expect(loads).not.toHaveBeenCalled();
            expect((await store.catalog()).records[0].save.mathStats.totalAttempts).toBe(42);
            await sync.flush();
            const backedUp = (await store.catalog()).records[0];
            expect(backedUp.save.mathStats.totalAttempts).toBe(44);
            expect(backedUp.revision).toBe(2);
        } finally { unsubscribe(); }
    });

    it('restores a new address, uploads more play, then updates the unchanged old address without duplicate heroes', async () => {
        const home = localStorage; put(save()); await new DevSaveSync(fetcher).initialize();
        storage(); await new DevSaveSync(fetcher).initialize();
        expect(readDevSaves()).toHaveLength(1); expect(SaveSystem.load(0)).toEqual(save());
        const cottage = new DevSaveSync(fetcher); await cottage.initialize(); put(save('profile-ada', 80)); await cottage.flush();
        Object.defineProperty(globalThis, 'localStorage', { value: home, configurable: true });
        await new DevSaveSync(fetcher).initialize();
        expect(readDevSaves()).toHaveLength(1); expect(SaveSystem.load(0)).toEqual(save('profile-ada', 80));
    });

    it('does not replace divergent offline progress and archives the rejected branch', async () => {
        const home = localStorage; put(save()); await new DevSaveSync(fetcher).initialize();
        storage(); await new DevSaveSync(fetcher).initialize(); put(save('profile-ada', 80)); await new DevSaveSync(fetcher).flush();
        Object.defineProperty(globalThis, 'localStorage', { value: home, configurable: true }); put(save('profile-ada', 60));
        await new DevSaveSync(fetcher).initialize();
        expect(SaveSystem.load(0)).toEqual(save('profile-ada', 60));
        expect((await store.catalog()).records[0].save).toEqual(save('profile-ada', 80));
        expect((await readdir(path.join(directory, 'history'))).some(name => name.startsWith('conflict-'))).toBe(true);
    });

    it('keeps local progress during an outage and retries a committed save after a lost receipt', async () => {
        put(save()); const broken = vi.fn().mockRejectedValue(new Error('offline'));
        await new DevSaveSync(broken as typeof fetch).initialize(); expect(SaveSystem.load(0)).toEqual(save());
        let lost = true;
        const lossy = (async (url, init) => { const result = await fetcher(url, init); if (init?.method && lost) { lost = false; throw new Error('lost receipt'); } return result; }) as typeof fetch;
        const sync = new DevSaveSync(lossy); await sync.flush(); await sync.flush();
        expect((await store.catalog()).records[0].revision).toBe(1);
        expect(JSON.parse(localStorage.getItem('littleMathAdventure_devSync_v1')!).profiles['profile-ada'].revision).toBe(1);
    });

    it('preserves an unknown legacy branch until a parent explicitly restores the server version', async () => {
        await store.commit([{ sourceSlot: 0, baseRevision: 0, save: save('profile-ada', 80) }], 'cottage');
        put(save('profile-ada', 42)); await new DevSaveSync(fetcher).initialize();
        expect(SaveSystem.load(0)).toEqual(save('profile-ada', 42));
        const catalog = await fetchDevCatalog(fetcher); await restoreDevSaves(catalog.records, catalog.serverId, fetcher);
        expect(SaveSystem.load(0)).toEqual(save('profile-ada', 80)); expect(readDevSaves()).toHaveLength(1);
        const files = await readdir(path.join(directory, 'history'));
        const archived = await Promise.all(files.filter(file => file.startsWith('browser-')).map(async file =>
            JSON.parse(gunzipSync(await readFile(path.join(directory, 'history', file))).toString())));
        expect(archived.some(archive => archive.writes[0].save.mathStats.totalAttempts === 42)).toBe(true);
    });

    it('archives both co-op profiles before an identity-based restore and retains unrelated slots', async () => {
        put(save('profile-ada', 80), 1); put(save('profile-eli', 90), 6);
        const captured = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        storage(); put(save('profile-ada', 30), 3); put(save('profile-local', 20), 1);
        const slots = await restoreDevSaves(captured.records, captured.serverId, fetcher);
        expect(slots).toEqual([3, 6]); expect(SaveSystem.load(3)).toEqual(save('profile-ada', 80));
        expect(SaveSystem.load(1)).toEqual(save('profile-local', 20)); expect(SaveSystem.load(6)).toEqual(save('profile-eli', 90));
    });

    it('rolls back all replaced slots when browser storage fails halfway through a restore', async () => {
        put(save('profile-ada', 80), 0); put(save('profile-eli', 90), 1);
        const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        const browser = storage(); put(save('profile-ada', 10), 0); put(save('profile-eli', 20), 1);
        const original = browser.setItem; let failed = false;
        vi.spyOn(browser, 'setItem').mockImplementation((key, value) => { if (key.endsWith('_1') && !failed) { failed = true; throw new Error('quota'); } original(key, value); });
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher)).rejects.toThrow('quota');
        expect(SaveSystem.load(0)).toEqual(save('profile-ada', 10)); expect(SaveSystem.load(1)).toEqual(save('profile-eli', 20));
    });

    it('does not resurrect a deliberately deleted local hero when reopening that address', async () => {
        put(save()); const sync = new DevSaveSync(fetcher); await sync.initialize();
        SaveSystem.deleteSlot(0); sync.changed(); await new DevSaveSync(fetcher).initialize();
        expect(readDevSaves()).toHaveLength(0); expect((await store.catalog()).records).toHaveLength(1);
    });

    it('blocks a still-open game tab from saving over an explicit parent restore', async () => {
        put(save()); const staleGame = new DevSaveSync(fetcher); await staleGame.initialize();
        const unguard = SaveSystem.guardWrites(() => staleGame.acceptsWrites());
        try {
            const head = await store.catalog();
            await store.commit([{ sourceSlot: 0, baseRevision: 1, save: save('profile-ada', 80) }], 'cottage', head.serverId);
            const latest = await fetchDevCatalog(fetcher); await restoreDevSaves(latest.records, latest.serverId, fetcher);
            SaveSystem.save(0, save('profile-ada', 43).player, save('profile-ada', 43).mathStats);
            await staleGame.flush();
            expect(SaveSystem.load(0)).toEqual(save('profile-ada', 80));
            expect((await store.catalog()).records[0].save).toEqual(save('profile-ada', 80));
        } finally { unguard(); }
    });

    it('refuses duplicate identities and insufficient space before changing local saves', async () => {
        put(save()); const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        put(save(), 1); await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher)).rejects.toThrow('Duplicitní profil');
        storage(); for (let slot = 0; slot < 8; slot++) put(save('local-profile-' + slot), slot);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher)).rejects.toThrow('Není volné místo');
        expect(readDevSaves()).toHaveLength(8);
    });

    it('refuses the original failure: an older server snapshot must not overwrite a more advanced tablet', async () => {
        put(save('profile-ada', 80)); const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        storage(); const newer = save('profile-ada', 120); newer.player.level = 7;
        newer.player.ownedPets = ['pet_turtle'];
        newer.player.equippedWeapon = 'better-sword';
        newer.player.arena = { completedArenaLevels: [1, 2, 3, 4] } as any;
        put(newer);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher)).rejects.toThrow('Starší uložená hra');
        expect(SaveSystem.load(0)).toEqual(newer);
    });

    it('restores the preserved pre-rollback game even after an old version acquired a newer auto-save timestamp', async () => {
        const recovered = save('profile-ada', 120); recovered.player.level = 7;
        recovered.player.ownedPets = ['pet_turtle'];
        put(recovered); const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        storage(); const old = save('profile-ada', 80); old.timestamp = Date.now(); put(old);
        await restoreDevSaves(catalog.records, catalog.serverId, fetcher);
        expect(SaveSystem.load(0)).toEqual(recovered);
    });

    it('explicitly replaces two verified legacy identities in full slots, archives originals and keeps other heroes', async () => {
        put(evidencedSave('canonical-kitten', 'Kitten', 8), 1); put(evidencedSave('canonical-eli', 'Eli', 12), 6);
        const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        storage(); for (let slot = 0; slot < 8; slot++) put(save('unrelated-' + slot), slot);
        put(evidencedSave('legacy-kitten', 'Kitten', 3), 1); put(evidencedSave('legacy-eli', 'Eli', 4), 6);
        localStorage.setItem('littleMathAdventure_activeSlot', '6');
        const replacements = [{ profileId: 'canonical-kitten', sourceSlot: 1, replacedProfileId: 'legacy-kitten' },
            { profileId: 'canonical-eli', sourceSlot: 6, replacedProfileId: 'legacy-eli' }];
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true)).rejects.toThrow('Není volné místo');
        expect(await restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacements)).toEqual([1, 6]);
        expect(readDevSaves()).toHaveLength(8);
        expect(SaveSystem.load(1)).toEqual(catalog.records[0].save); expect(SaveSystem.load(6)).toEqual(catalog.records[1].save);
        expect(SaveSystem.load(2)).toEqual(save('unrelated-2'));
        expect(localStorage.getItem('littleMathAdventure_activeSlot')).toBe('6');
        const sync = JSON.parse(localStorage.getItem('littleMathAdventure_devSync_v1')!);
        expect(sync.deleted).toEqual(expect.arrayContaining(['legacy-kitten', 'legacy-eli']));
        const files = await readdir(path.join(directory, 'history'));
        const archives = await Promise.all(files.filter(file => file.startsWith('browser-')).map(async file =>
            JSON.parse(gunzipSync(await readFile(path.join(directory, 'history', file))).toString())));
        expect(archives.some(archive => archive.writes.some((entry: any) => entry.save.player.gameplayProfileId === 'legacy-eli'))).toBe(true);
    });

    it('refuses an identity replacement if an old answer, time or newer progress would disappear', async () => {
        put(evidencedSave('canonical-eli', 'Eli', 4));
        const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        storage(); const old = evidencedSave('legacy-eli', 'Eli', 3);
        const replacement = [{ profileId: 'canonical-eli', sourceSlot: 0, replacedProfileId: 'legacy-eli' }];
        old.mathStats.masteryData!.learningHistory!.attempts[0].problemKey = 'unique-local-answer'; put(old);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacement)).rejects.toThrow('Chybí místní odpovědi');
        expect(SaveSystem.load(0)).toEqual(old);
        const timed = evidencedSave('legacy-eli', 'Eli', 3); timed.player.playTime = { version: 1, days: { '2026-11-17': 5000 } }; put(timed);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacement)).rejects.toThrow('Chybí místní čas');
        const advanced = evidencedSave('legacy-eli', 'Eli', 3); advanced.player.level = 8; put(advanced);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacement)).rejects.toThrow('Starší uložená hra');
        expect(SaveSystem.load(0)).toEqual(advanced);
    });

    it('rolls back explicit replacements on storage failure and rejects a changed target identity', async () => {
        put(evidencedSave('canonical-kitten', 'Kitten', 8), 1); put(evidencedSave('canonical-eli', 'Eli', 12), 6);
        const catalog = await captureDevSaves(readDevSaves(), await fetchDevCatalog(fetcher), fetcher);
        const browser = storage(); const kitten = evidencedSave('legacy-kitten', 'Kitten', 3), eli = evidencedSave('legacy-eli', 'Eli', 4);
        put(kitten, 1); put(eli, 6);
        const replacements = [{ profileId: 'canonical-kitten', sourceSlot: 1, replacedProfileId: 'legacy-kitten' },
            { profileId: 'canonical-eli', sourceSlot: 6, replacedProfileId: 'legacy-eli' }];
        const original = browser.setItem; let failed = false;
        vi.spyOn(browser, 'setItem').mockImplementation((key, value) => { if (key.endsWith('_6') && !failed) { failed = true; throw new Error('quota'); } original(key, value); });
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacements)).rejects.toThrow('quota');
        expect(SaveSystem.load(1)).toEqual(kitten); expect(SaveSystem.load(6)).toEqual(eli);
        put(evidencedSave('someone-else', 'Eli', 4), 6);
        await expect(restoreDevSaves(catalog.records, catalog.serverId, fetcher, true, replacements)).rejects.toThrow('Profil se změnil');
        expect(SaveSystem.load(1)).toEqual(kitten);
    });

    it('updates known heroes even when the archive contains more profiles than a full device can hold', async () => {
        put(save('known-hero', 42)); const sync = new DevSaveSync(fetcher); await sync.initialize();
        let catalog = await store.catalog();
        await store.commit([{ sourceSlot: 0, baseRevision: 1, save: save('known-hero', 80) }], 'other-device', catalog.serverId);
        for (let slot = 1; slot < 8; slot++) put(save('local-hero-' + slot), slot);
        catalog = await store.catalog();
        await store.commit([{ sourceSlot: 3, baseRevision: 0, save: save('extra-archived-hero', 20) }], 'other-device', catalog.serverId);
        await new DevSaveSync(fetcher).initialize();
        expect(SaveSystem.load(0)).toEqual(save('known-hero', 80));
        expect(readDevSaves()).toHaveLength(8); expect(SaveSystem.load(3)).toEqual(save('local-hero-3'));
        storage(); await new DevSaveSync(fetcher).initialize();
        expect(readDevSaves()).toHaveLength(8); expect(SaveSystem.load(0)).toEqual(save('known-hero', 80));
    });
});

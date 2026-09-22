import type { SaveSlotData } from '../types';
import { captureGameplay, type CapturedGameplay } from './gameplayData';
import { observeGameplaySaves } from './gameplayBridge';
import { openGameplayStore, type GameplayStore } from './GameplayStore';

export class GameplaySync {
    private busy = false;
    private retryAt = 0;
    private failures = 0;
    constructor(private store: GameplayStore, private release: string, private fetcher: typeof fetch = fetch) {}

    async capture(data: CapturedGameplay): Promise<void> { await this.store.capture(data); }
    wake(): void { this.retryAt = 0; }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const fetcher = this.fetcher; // Native window.fetch must not receive this class as its receiver.
        try { return await fetcher(path, { ...init, credentials: 'include', signal: controller.signal,
            headers: { Accept: 'application/json', ...init.headers } }); }
        finally { clearTimeout(timer); }
    }

    async flush(): Promise<void> {
        if (this.busy || Date.now() < this.retryAt) return;
        this.busy = true;
        try {
            const work = [];
            for (const profile of await this.store.profiles()) {
                const attempts = await this.store.pending(profile.id);
                if (attempts.length || profile.revision > profile.acknowledgedRevision) work.push({ profile, attempts });
            }
            if (!work.length) return;
            const deviceId = await this.store.deviceId();
            const token = await this.store.browserToken();
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
            const session = await this.request('/v1/gameplay/session', {
                method: 'POST', headers, body: JSON.stringify({ deviceId }),
            });
            if (!session.ok) throw new Error('Account unavailable');
            const identity = await session.json();
            if (typeof identity.accountId !== 'string') throw new Error('No browser identity');
            let matched = false;
            for (const { profile, attempts } of work) {
                // Collection identity is stable across anonymous play and Google sign-in/out.
                if (!await this.store.bind(profile.id, identity.accountId)) continue;
                matched = true;
                const response = await this.request('/v1/gameplay/batch', {
                    method: 'POST', headers,
                    body: JSON.stringify({ version: 1, accountId: identity.accountId,
                        profileId: profile.id, deviceId, slotNumber: profile.slotNumber,
                        revision: profile.revision, savedAt: profile.savedAt, release: this.release,
                        progress: profile.progress, attempts }),
                });
                if (!response.ok) throw new Error('Upload not acknowledged');
                const receipt = await response.json();
                if (receipt.stored !== true || receipt.profileId !== profile.id || receipt.revision !== profile.revision
                    || !Array.isArray(receipt.eventKeys) || receipt.eventKeys.length !== attempts.length
                    || !attempts.every(a => receipt.eventKeys.includes(a.eventKey))) throw new Error('Invalid receipt');
                await this.store.acknowledge(profile.id, profile.revision, receipt.eventKeys);
            }
            this.failures = 0;
            if (!matched) this.retryAt = Date.now() + 60_000;
        } catch (error) {
            // Durable records stay queued, including when the server committed but its response was lost.
            if (this.failures === 0) console.warn('[GameplaySync] Upload deferred:', error instanceof Error ? error.message : 'unavailable');
            this.retryAt = Date.now() + Math.min(60_000, 5000 * 2 ** this.failures++);
        } finally { this.busy = false; }
    }
}

/** Starts once per game, survives scene changes, and never blocks local/offline play. */
export function startGameplaySync(readSaves: () => Array<{ slot: number; save: SaveSlotData }>): () => void {
    let disposed = false;
    let sync: GameplaySync | undefined;
    let store: GameplayStore | undefined;
    const ready = openGameplayStore().then(value => {
        store = value;
        sync = new GameplaySync(value, import.meta.env.VITE_APP_RELEASE ?? 'development');
        return sync;
    });
    const capture = (slot: number, save: SaveSlotData) => {
        const snapshot = captureGameplay(slot, save); // Copy before gameplay mutates its objects.
        void ready.then(client => client.capture(snapshot)).catch(() => {
            console.warn('[GameplaySync] Local queue unavailable; saved progress will be retried on restart');
        });
    };
    observeGameplaySaves(capture);
    for (const entry of readSaves()) capture(entry.slot, entry.save);
    void ready.then(client => disposed ? undefined : client.flush()).catch(() => {});
    const flush = () => { if (!disposed) void sync?.flush(); };
    const wake = () => { sync?.wake(); flush(); };
    const timer = window.setInterval(flush, 5000);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('cislokraj-auth-changed', wake);
    document.addEventListener('visibilitychange', flush);
    return () => {
        disposed = true; observeGameplaySaves(undefined); window.clearInterval(timer);
        window.removeEventListener('online', wake); window.removeEventListener('focus', wake);
        window.removeEventListener('cislokraj-auth-changed', wake);
        document.removeEventListener('visibilitychange', flush);
        void ready.then(() => store?.close()).catch(() => {});
    };
}

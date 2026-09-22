import { describe, it, expect } from 'vitest';
import { GameplaySync } from './GameplaySync';
import { captureGameplay, type CapturedGameplay, type GameplayAttempt } from './gameplayData';
import type { GameplayStore, PendingProfile } from './GameplayStore';
import type { SaveSlotData } from '../types';

class MemoryStore implements GameplayStore {
    records = new Map<string, PendingProfile>();
    events = new Map<string, { attempt: GameplayAttempt; profile: string; sent: boolean }>();
    async deviceId() { return 'device'; }
    async browserToken() { return 'a'.repeat(64); }
    async capture({ attempts, ...snapshot }: CapturedGameplay) {
        const old = this.records.get(snapshot.id);
        this.records.set(snapshot.id, { ...snapshot, owner: old?.owner ?? null,
            revision: (old?.revision ?? 0) + 1, acknowledgedRevision: old?.acknowledgedRevision ?? 0 });
        for (const attempt of attempts) {
            const key = `${snapshot.id}|${attempt.eventKey}`;
            if (!this.events.has(key)) this.events.set(key, { attempt, profile: snapshot.id, sent: false });
        }
    }
    async profiles() { return [...this.records.values()]; }
    async bind(id: string, owner: string) {
        const p = this.records.get(id)!;
        if (p.owner && p.owner !== owner) return false;
        p.owner = owner; return true;
    }
    async pending(id: string) { return [...this.events.values()].filter(e => e.profile === id && !e.sent).slice(0, 100).map(e => e.attempt); }
    async acknowledge(id: string, revision: number, keys: string[]) {
        this.records.get(id)!.acknowledgedRevision = revision;
        keys.forEach(key => { this.events.get(`${id}|${key}`)!.sent = true; });
    }
    close() {}
}
const snapshot: CapturedGameplay = { id: 'profile', slotNumber: 1, savedAt: 1,
    progress: { player: { name: 'A' }, mathStats: {} },
    attempts: [{ eventKey: '1', source: 'mastery', sequenceIndex: 1, timestamp: 1,
        problemKey: '10+1', context: 'battle', correct: true, responseTimeMs: 1500, assisted: false, details: {} }],
};
const receipt = (body: any) => Response.json({ stored: true, profileId: body.profileId,
    revision: body.revision, eventKeys: body.attempts.map((a: GameplayAttempt) => a.eventKey) });

describe('gameplay upload recovery', () => {
    it('retries a lost receipt after restart and keeps a newer answer queued', async () => {
        const store = new MemoryStore(); let fail = true; const requests: any[] = [];
        const fetcher: typeof fetch = async (url, init) => {
            if (url === '/v1/gameplay/session') return Response.json({ accountId: 'browser' });
            const body = JSON.parse(init!.body as string); requests.push(body);
            if (fail) throw new Error('lost acknowledgement');
            await store.capture({ ...snapshot, attempts: [...snapshot.attempts, { ...snapshot.attempts[0], eventKey: '2', sequenceIndex: 2 }] });
            return receipt(body);
        };
        const sync = new GameplaySync(store, 'test', fetcher);
        await sync.capture(snapshot); await sync.flush();
        expect(await store.pending('profile')).toHaveLength(1);
        fail = false;
        await new GameplaySync(store, 'test', fetcher).flush();
        expect(requests[0].attempts).toEqual(requests[1].attempts);
        expect((await store.pending('profile')).map(a => a.eventKey)).toEqual(['2']);
        expect(store.records.get('profile')!.revision).toBeGreaterThan(store.records.get('profile')!.acknowledgedRevision);
    });
    it('uploads anonymous play and waits for a valid browser identity before sending answers', async () => {
        const store = new MemoryStore(); let identity: string | null = null; let posts = 0;
        const fetcher: typeof fetch = async (url, init) => {
            if (url === '/v1/gameplay/session') return identity ? Response.json({ accountId: identity }) : new Response('', { status: 503 });
            posts++; return receipt(JSON.parse(init!.body as string));
        };
        const sync = new GameplaySync(store, 'test', fetcher);
        await sync.capture(snapshot); await sync.flush(); expect(posts).toBe(0);
        await store.bind('profile', 'browser-A'); identity = 'browser-B'; sync.wake();
        await sync.flush(); expect(posts).toBe(0);
        identity = 'browser-A'; sync.wake(); await sync.flush(); expect(posts).toBe(1);
    });
    it('extracts real answers and crocodile assistance but excludes placement and diagnostic data', () => {
        const save = { timestamp: 1, player: { name: 'A', gameplayProfileId: 'profile' }, mathStats: {
            masteryData: { subAtoms: { A1: { successfulSolves: 20 } }, problemRecords: {
                p: { problemKey: 'p', subAtomId: 'D1', form: 'missing_part', attempts: [
                    { timestamp: 1, sequenceIndex: 1, correct: true, responseTimeMs: 1000, context: 'battle' },
                    { timestamp: 2, sequenceIndex: 2, correct: true, responseTimeMs: 5000, context: 'battle', synthetic: true },
                ] },
            }, comparisonChapter: { attempts: [
                { timestamp: 3, sequenceIndex: 3, stage: 'number_symbol', leftValue: 3, rightValue: 5,
                    correct: false, responseTimeMs: 12000, assisted: true, selectedRelation: 'greater', context: 'battle' },
                { timestamp: 4, sequenceIndex: 4, diagnosticMode: true },
            ] } },
        } } as unknown as SaveSlotData;
        const data = captureGameplay(0, save);
        expect(data.attempts).toHaveLength(2);
        expect(data.attempts[1]).toMatchObject({ assisted: true, correct: false, details: { selectedRelation: 'greater' } });
        expect((data.progress.mathStats.masteryData as any).problemRecords).toBeUndefined();
    });
});

import { gameplayId, type CapturedGameplay, type GameplayAttempt } from './gameplayData';

export type PendingProfile = Omit<CapturedGameplay, 'attempts'> & {
    owner: string | null; revision: number; acknowledgedRevision: number;
};
type StoredAttempt = GameplayAttempt & { id: string; profileId: string; sent: number };
export interface GameplayStore {
    deviceId(): Promise<string>;
    browserToken(): Promise<string>;
    capture(data: CapturedGameplay): Promise<void>;
    profiles(): Promise<PendingProfile[]>;
    bind(profileId: string, accountId: string): Promise<boolean>;
    pending(profileId: string): Promise<GameplayAttempt[]>;
    acknowledge(profileId: string, revision: number, keys: string[]): Promise<void>;
    close(): void;
}

const result = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
const finished = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Gameplay storage transaction failed'));
});

/** Atomic transactions keep two tabs, uploads and new answers from overwriting one another. */
export async function openGameplayStore(): Promise<GameplayStore> {
    const request = indexedDB.open('cislokraj-gameplay-v1', 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('profiles', { keyPath: 'id' });
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('pending', ['profileId', 'sent']);
        db.createObjectStore('meta');
    };
    const db = await result(request);
    db.onversionchange = () => db.close();
    return {
        async browserToken() {
            const tx = db.transaction('meta', 'readwrite'); const done = finished(tx);
            const meta = tx.objectStore('meta');
            const token = await result(meta.get('browserToken')) as string | undefined
                ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
            meta.put(token, 'browserToken'); await done; return token;
        },
        async deviceId() {
            const tx = db.transaction('meta', 'readwrite'); const done = finished(tx);
            const meta = tx.objectStore('meta');
            const id = await result(meta.get('deviceId')) as string | undefined ?? gameplayId();
            meta.put(id, 'deviceId'); await done; return id;
        },
        async capture(data) {
            const tx = db.transaction(['profiles', 'events'], 'readwrite'); const done = finished(tx);
            const profiles = tx.objectStore('profiles'); const events = tx.objectStore('events');
            const prior = await result(profiles.get(data.id)) as PendingProfile | undefined;
            const { attempts, ...snapshot } = data;
            profiles.put({ ...snapshot, owner: prior?.owner ?? null,
                revision: (prior?.revision ?? 0) + 1, acknowledgedRevision: prior?.acknowledgedRevision ?? 0 });
            // Retain acknowledged keys too: backfill/import/reload must not create another answer.
            await Promise.all(attempts.map(async attempt => {
                const id = `${data.id}|${attempt.eventKey}`;
                if (await result(events.getKey(id)) === undefined) {
                    events.put({ ...attempt, id, profileId: data.id, sent: 0 });
                }
            }));
            await done;
        },
        async profiles() {
            return result(db.transaction('profiles').objectStore('profiles').getAll());
        },
        async bind(id, owner) {
            const tx = db.transaction('profiles', 'readwrite'); const done = finished(tx);
            const profiles = tx.objectStore('profiles');
            const profile = await result(profiles.get(id)) as PendingProfile;
            const allowed = profile.owner === null || profile.owner === owner;
            if (allowed) profiles.put({ ...profile, owner });
            await done; return allowed;
        },
        async pending(profileId) {
            const events = await result(db.transaction('events').objectStore('events').index('pending')
                .getAll(IDBKeyRange.only([profileId, 0]), 100)) as StoredAttempt[];
            return events.map(({ id: _id, profileId: _profileId, sent: _sent, ...attempt }) => attempt);
        },
        async acknowledge(id, revision, keys) {
            const tx = db.transaction(['profiles', 'events'], 'readwrite'); const done = finished(tx);
            const profiles = tx.objectStore('profiles'); const events = tx.objectStore('events');
            const profile = await result(profiles.get(id)) as PendingProfile;
            profiles.put({ ...profile, acknowledgedRevision: Math.max(profile.acknowledgedRevision, revision) });
            await Promise.all(keys.map(async key => {
                const event = await result(events.get(`${id}|${key}`)) as StoredAttempt | undefined;
                if (event) events.put({ ...event, sent: 1 });
            }));
            await done;
        },
        close() { db.close(); },
    };
}

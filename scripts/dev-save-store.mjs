import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { devSaveRollbackReasons } from '../src/systems/devSaveProgress.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const slot = value => Number.isInteger(value) && value >= 0 && value < 8;
const profileId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value)
    && !['__proto__', 'prototype', 'constructor'].includes(value);
export function validDevSave(save) {
    if (!record(save) || !record(save.player) || !record(save.mathStats) || !Number.isFinite(save.timestamp)) return false;
    const player = save.player, stats = save.mathStats;
    return typeof player.name === 'string' && player.name.length <= 100 && profileId(player.gameplayProfileId)
        && ['level', 'hp', 'maxHp', 'attack', 'defense'].every(key => Number.isFinite(player[key]))
        && Number.isFinite(stats.totalAttempts) && Number.isFinite(stats.correctAnswers)
        && Array.isArray(stats.recentResults) && record(stats.problemStats);
}

export function validateWrites(writes) {
    if (!Array.isArray(writes) || !writes.length || writes.length > 8) throw new Error('invalid_writes');
    const identities = new Set(), slots = new Set();
    for (const entry of writes) {
        if (!record(entry) || !slot(entry.sourceSlot) || !validDevSave(entry.save)
            || !Number.isSafeInteger(entry.baseRevision) || entry.baseRevision < 0
            || identities.has(entry.save.player.gameplayProfileId) || slots.has(entry.sourceSlot)) throw new Error('invalid_save');
        identities.add(entry.save.player.gameplayProfileId); slots.add(entry.sourceSlot);
    }
}

/** Private, development-only family saves. Atomic catalog + immutable compressed history. */
export class DevSaveStore {
    #queue = Promise.resolve();
    constructor(directory) { this.directory = directory; }
    async catalog() {
        await mkdir(this.directory, { recursive: true });
        try {
            const result = JSON.parse(await readFile(path.join(this.directory, 'catalog.json'), 'utf8'));
            if (result.version !== 1 || !Array.isArray(result.records) || typeof result.serverId !== 'string'
                || result.records.some(entry => !validDevSave(entry.save)
                    || entry.profileId !== entry.save.player.gameplayProfileId
                    || !slot(entry.sourceSlot) || !Number.isSafeInteger(entry.revision) || entry.revision < 1)
                || new Set(result.records.map(entry => entry.profileId)).size !== result.records.length) {
                throw new Error('damaged_dev_save_catalog');
            }
            return result;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error; // Never replace an unreadable catalog with an empty one.
            return { version: 1, serverId: null, records: [] };
        }
    }
    #serial(action) {
        const operation = this.#queue.then(action);
        this.#queue = operation.catch(() => {});
        return operation;
    }
    async #archive(data, purpose) {
        const bytes = Buffer.from(JSON.stringify(data));
        const hash = createHash('sha256').update(bytes).digest('hex');
        const folder = path.join(this.directory, 'history');
        await mkdir(folder, { recursive: true });
        const filename = `${purpose}-${hash}.json.gz`;
        try { await writeFile(path.join(folder, filename), gzipSync(bytes), { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        return filename;
    }
    archive(writes, origin) {
        validateWrites(writes);
        return this.#serial(async () => ({ archive: await this.#archive({ version: 1, origin, writes }, 'browser') }));
    }
    commit(writes, origin, expectedServerId) {
        validateWrites(writes);
        return this.#serial(async () => {
            const catalog = await this.catalog();
            const matches = writes.map(entry => catalog.records.find(existing => existing.profileId === entry.save.player.gameplayProfileId));
            const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
            const conflicts = writes.filter((entry, index) => {
                if (matches[index] && same(matches[index].save, entry.save)) return false;
                if (expectedServerId !== undefined && expectedServerId !== catalog.serverId) return true;
                return matches[index] ? matches[index].revision !== entry.baseRevision : entry.baseRevision !== 0;
            });
            if (conflicts.length) {
                const archive = await this.#archive({ version: 1, origin, writes }, 'conflict');
                return { ok: false, conflicts: conflicts.map(entry => entry.save.player.gameplayProfileId), archive, ...catalog };
            }
            const regressions = writes.filter((entry, index) => matches[index]
                && devSaveRollbackReasons(matches[index].save, entry.save).length > 0);
            if (regressions.length) {
                const archive = await this.#archive({ version: 1, origin, writes }, 'rollback');
                return { ok: false, error: 'older_progress', conflicts: regressions.map(entry => entry.save.player.gameplayProfileId), archive, ...catalog };
            }
            const changed = writes.filter((entry, index) => !matches[index] || !same(matches[index].save, entry.save));
            if (!changed.length) return { ok: true, ...catalog };
            // Both incoming data and the previous head survive an interrupted commit.
            await this.#archive({ version: 1, origin, writes }, 'incoming');
            if (catalog.records.length) await this.#archive(catalog, 'catalog');
            const next = structuredClone(catalog);
            next.serverId ??= randomUUID();
            for (const entry of changed) {
                const index = next.records.findIndex(existing => existing.profileId === entry.save.player.gameplayProfileId);
                const previous = next.records[index];
                const updated = { profileId: entry.save.player.gameplayProfileId, sourceSlot: entry.sourceSlot,
                    revision: (previous?.revision ?? 0) + 1, receivedAt: Date.now(), save: entry.save };
                if (index < 0) next.records.push(updated); else next.records[index] = updated;
            }
            if (next.records.length > 64) throw new Error('dev_profile_limit');
            const temporary = path.join(this.directory, `.catalog-${randomUUID()}.tmp`);
            await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
            await rename(temporary, path.join(this.directory, 'catalog.json'));
            return { ok: true, ...next };
        });
    }
}

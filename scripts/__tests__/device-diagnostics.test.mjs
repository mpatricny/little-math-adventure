import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deviceDiagnosticsPlugin } from '../device-diagnostics.mjs';

async function fixture(run) {
    const folder = await mkdtemp(path.join(tmpdir(), 'device-diagnostics-'));
    let middleware;
    deviceDiagnosticsPlugin(folder).configureServer({ middlewares: { use: value => { middleware = value; } } });
    const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try { await run({ url, folder, post: (body, origin = url) => fetch(url + '/__device-diagnostics', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) }); } finally { await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true }); }
}
const event = { version: 1, kind: 'error', run: 'test-device-1', at: 1, scene: 'BattleScene',
    encounter: 'silverpond-arena-2-wave-5', phase: 'player_math', message: 'Example failure' };

test('writes bounded runtime events privately without accepting gameplay payloads', async () => fixture(async ({ post, folder }) => {
    const response = await post({ ...event, player: { name: 'Private hero' }, mathStats: { totalAttempts: 5 } });
    assert.equal(response.status, 204);
    const directory = path.join(folder, '.local-saves/development/diagnostics');
    const files = await readdir(directory);
    const saved = JSON.parse((await readFile(path.join(directory, files[0]), 'utf8')).trim());
    assert.equal(saved.encounter, event.encounter);
    assert.equal(saved.message, event.message);
    assert.equal(saved.player, undefined); assert.equal(saved.mathStats, undefined);
}));
test('rejects foreign origins and invalid event kinds', async () => fixture(async ({ post }) => {
    assert.equal((await post(event, 'http://foreign.invalid')).status, 403);
    assert.equal((await post({ ...event, kind: '../../save' })).status, 400);
}));
test('limits stored strings and rejects oversized input', async () => fixture(async ({ post, folder }) => {
    assert.equal((await post({ ...event, message: 'x'.repeat(4000) })).status, 204);
    const directory = path.join(folder, '.local-saves/development/diagnostics');
    const saved = JSON.parse((await readFile(path.join(directory, (await readdir(directory))[0]), 'utf8')).trim());
    assert.equal(saved.message.length, 1000);
    assert.equal((await post({ ...event, message: 'x'.repeat(17000) })).status, 413);
}));

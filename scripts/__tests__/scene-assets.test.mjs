import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectSceneAssets } from '../scene-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = collectSceneAssets(root);

test('menu loads its artwork without combat and later-region assets', () => {
    assert.ok(manifest.MenuScene.includes('bg-menu-mathoria'));
    assert.ok(manifest.MenuScene.includes('menu-icon-coop'));
    assert.ok(manifest.MenuScene.length < 30);
    assert.ok(!manifest.MenuScene.some(key => /underwater|slime|arena-\d-bg|silverpond/.test(key)));
});

test('destination scenes include helper UI, character animations and editor layouts', () => {
    assert.ok(manifest.TownScene.includes('bg-town'));
    assert.ok(manifest.TownScene.includes('boy-knight-walk-sheet'));
    assert.ok(manifest.BattleScene.includes('battle-hud-status-frame-v2'));
    assert.ok(manifest.GuildScene.includes('knight-idle-sheet'));
    assert.ok(manifest.UnderwaterRoomScene.includes('underwater-shallows-bg'));
    assert.ok(manifest.UnderwaterRoomScene.includes('underwater-bell-instrument'));
});

test('each scene queues every texture once', () => {
    for (const keys of Object.values(manifest)) assert.equal(new Set(keys).size, keys.length);
});

test('forecast also finds scene-specific spoken guides without putting audio in texture queues', () => {
    const resources = collectSceneAssets(root, undefined, ['vo.arena.free']);
    assert.ok(resources.ArenaScene.includes('vo.arena.free'));
    assert.ok(!resources.MenuScene.includes('vo.arena.free'));
    assert.ok(!manifest.ArenaScene.includes('vo.arena.free'));
});

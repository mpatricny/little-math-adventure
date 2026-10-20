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

test('progress checks do not pull the forest boss or catacomb fox into walking HUDs', () => {
    for (const scene of ['SilverpondTownMockScene', 'SilverpondPythiaWorkshopMockScene', 'SilverpondCrystalForgeMockScene']) {
        assert.ok(!manifest[scene].includes('rune-fox-sheet'), scene);
        for (const key of ['spritesheet--38--sheet', 'spritesheet--39--sheet', 'spritesheet--40--sheet']) {
            assert.ok(!manifest[scene].includes(key), `${scene}: ${key}`);
        }
    }
    assert.ok(manifest.CatacombTrialScene.includes('rune-fox-sheet'));
    assert.ok(manifest.GuardianLairScene.includes('spritesheet--38--sheet'));
});

test('the first Silverpond transition prepares town art without decoding every underwater creature', () => {
    assert.ok(manifest.SilverpondTownMockScene.includes('silverpond-town-hub-mock-bg'));
    assert.ok(manifest.ZyxRocketInterludeScene.includes('forest-crystal-story'));
    for (const scene of ['SilverpondTownMockScene', 'ZyxRocketInterludeScene']) {
        assert.ok(!manifest[scene].some(key => /silverpond-(bubble-crab|bubble-fish|mill-turtle|ruin-axolotl|pearl-jellyfish|depth-guardian).*-sheet/.test(key)));
    }
});

test('forecast also finds scene-specific spoken guides without putting audio in texture queues', () => {
    const resources = collectSceneAssets(root, undefined, ['vo.arena.free']);
    assert.ok(resources.ArenaScene.includes('vo.arena.free'));
    assert.ok(!resources.MenuScene.includes('vo.arena.free'));
    assert.ok(!manifest.ArenaScene.includes('vo.arena.free'));
});

test('navigation targets do not load town buildings inside the shop or battle', () => {
    for (const scene of ['SilverpondShopMockScene', 'BattleScene']) {
        for (const key of ['bg-town', 'building-shop', 'building-guild', 'building-witch-hut',
            'silverpond-town-hub-mock-bg']) {
            assert.ok(!manifest[scene].includes(key), `${scene}: unrelated ${key}`);
        }
    }
    // The regional shop deliberately uses the shared ShopScene layout.
    assert.ok(manifest.SilverpondShopMockScene.includes('silverpond-shop-interior-mock-bg'));
    assert.ok(manifest.SilverpondShopMockScene.includes('shop-coins-sheet'));
    assert.ok(!manifest.BattleScene.includes('spritesheet-zyx-transparent2-sheet'));
    assert.ok(manifest.GuildScene.includes('spritesheet-zyx-transparent2-sheet'));
});

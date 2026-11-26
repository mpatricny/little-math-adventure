import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { collectSceneAssets, sceneAssetsPlugin } from '../scene-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = collectSceneAssets(root);

test('catacomb entry and trial preload their shared frames and illustrated locks', () => {
    for (const key of ['mathboard-plaque-v4', 'mathboard-answer-v4', 'catacomb-painted-door-closed', 'catacomb-crafted-paw-active', 'catacomb-crafted-module']) {
        assert.ok(manifest.CatacombTrialScene.includes(key), key);
    }
    for (const key of ['catacomb-painted-door-open', 'catacomb-painted-door-closed', 'catacomb-progress-journey-lock-closed']) {
        assert.ok(manifest.GuildScene.includes(key), key);
    }
    for (const key of ['mathboard-plaque-v4', 'mathboard-answer-v4', 'catacomb-rune-chamber', 'battle-dock-shield-normal-v3']) {
        assert.ok(manifest.FoxLessonScene.includes(key), key);
    }
});

test('source changes invalidate the next page load even when HMR is disabled', () => {
    const watcher = new EventEmitter(), httpServer = new EventEmitter();
    const module = { id: '\0virtual:scene-assets' }, invalidated = [];
    sceneAssetsPlugin(root).configureServer({ watcher, httpServer, config: { server: { hmr: false } },
        moduleGraph: { getModuleById: id => id === module.id ? module : undefined,
            invalidateModule: value => invalidated.push(value) } });
    watcher.emit('change', '/src/ui/CatacombTrialUI.ts');
    watcher.emit('add', '/src/data/fox-speed-levels.json');
    watcher.emit('unlink', '/src/ui/RemovedPanel.ts');
    watcher.emit('change', '/unrelated.png');
    assert.deepEqual(invalidated, [module, module, module]);
    httpServer.emit('close');
    watcher.emit('change', '/src/ui/CatacombTrialUI.ts');
    assert.equal(invalidated.length, 3);
});

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
    assert.ok(!manifest.CatacombTrialScene.includes('rune-fox-sheet'));
    assert.ok(manifest.GuardianLairScene.includes('spritesheet--38--sheet'));
});

test('the first Silverpond transition prepares town art without decoding every underwater creature', () => {
    assert.ok(manifest.SilverpondTownMockScene.includes('silverpond-town-hub-mock-bg'));
    assert.ok(manifest.ZyxRocketInterludeScene.includes('forest-crystal-story'));
    for (const scene of ['SilverpondTownMockScene', 'ZyxRocketInterludeScene']) {
        assert.ok(!manifest[scene].some(key => /silverpond-(bubble-crab|bubble-fish|mill-turtle|ruin-axolotl|pearl-jellyfish|depth-guardian).*-sheet/.test(key)));
    }
});

test('pet availability checks do not preload underwater combat sheets in either workshop', () => {
    const readData = filename => JSON.parse(readFileSync(new URL(`../../public/assets/data/${filename}`, import.meta.url), 'utf8'));
    const prefixes = new Set(readData('enemies.json').filter(enemy => enemy.id.startsWith('silverpond_')).map(enemy => enemy.animPrefix));
    const sheets = new Set(Object.entries(readData('animations.json').enemies)
        .filter(([prefix]) => prefixes.has(prefix))
        .flatMap(([, motions]) => Object.values(motions).map(motion => motion.texture)));
    assert.ok(sheets.size > 0);
    for (const scene of ['PythiaWorkshopScene', 'SilverpondPythiaWorkshopMockScene']) {
        assert.deepEqual(manifest[scene].filter(key => sheets.has(key)), [], scene);
    }
});

test('guild portraits and fox previews avoid importing the alternate hero combat animation bundle', () => {
    for (const scene of ['GuildScene', 'SilverpondGuildMockScene']) {
        // Quest diagrams use portraits; the new practical fox preview additionally
        // needs idle, but never the boy's attack/walk/defend animation bundle.
        assert.deepEqual(manifest[scene].filter(key => /^boy-knight-(?:attack|walk|defend)-sheet$/.test(key)), [], scene);
        assert.ok(manifest[scene].includes('town-hud-hero-portrait'), scene);
        assert.ok(manifest[scene].includes('town-hud-heroine-portrait'), scene);
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

test('every guide entry point preloads the shared confirmation and picture frame', () => {
    for (const scene of ['ShopScene', 'ArenaScene', 'PythiaWorkshopScene', 'CrystalForgeScene',
        'CrashSiteScene', 'ComicScene', 'GuildScene', 'ZyxRocketInterludeScene']) {
        assert.ok(manifest[scene].includes('guide-confirm-frame-v1'), scene);
    }
    assert.ok(manifest.CrashSiteScene.includes('991bb46f-0417-4c22-8e3e-04cea0a3079a'));
    for (const scene of ['SilverpondGuildMockScene', 'SilverpondFairyRewardScene', 'UnderwaterRoomScene']) {
        assert.ok(manifest[scene].includes('silverpond-fairy-action-normal'), scene);
    }
});

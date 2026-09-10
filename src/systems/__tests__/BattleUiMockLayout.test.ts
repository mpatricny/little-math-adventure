import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import animationsJson from '../../../public/assets/data/animations.json';
import assetsJson from '../../../public/assets/data/assets.json';
import scenesJson from '../../../public/assets/data/scenes.json';
import texturesJson from '../../../public/assets/data/textures.json';
import {
    BATTLE_MOCK_ENEMY_SPRITES,
    BATTLE_MOCK_LAYOUT_SCENE,
    BATTLE_MOCK_PLAYER_SPRITES,
    BATTLE_MOCK_TARGET_ROTATION,
    type BattleMockSpriteSpec,
} from '../../data/battle-ui-mock';

type JsonObject = Record<string, any>;

const mockScene = (scenesJson.scenes as JsonObject).BattleUiMockScene;
const battleScene = (scenesJson.scenes as JsonObject)[BATTLE_MOCK_LAYOUT_SCENE];
const menuScene = (scenesJson.scenes as JsonObject).MenuScene;
const elements = [...mockScene.elements, ...mockScene.ui] as JsonObject[];
const byId = new Map(elements.map(element => [element.id, element]));
const productionElements = [...battleScene.elements, ...battleScene.ui] as JsonObject[];
const productionById = new Map(productionElements.map(element => [element.id, element]));
const menuElements = [...menuScene.elements, ...menuScene.ui] as JsonObject[];
const menuById = new Map(menuElements.map(element => [element.id, element]));

const getAssetDefinition = (path: string): JsonObject | undefined => {
    let node: unknown = assetsJson;
    for (const segment of path.split('.')) {
        if (!node || typeof node !== 'object') return undefined;
        node = (node as JsonObject)[segment];
    }
    return node && typeof node === 'object' ? node as JsonObject : undefined;
};

const hasAnimation = (node: unknown, animationKey: string): boolean => {
    if (!node || typeof node !== 'object') return false;
    return Object.entries(node as JsonObject).some(([key, value]) => (
        key === animationKey
        || hasAnimation(value, animationKey)
    ));
};

const allSpriteSpecs: BattleMockSpriteSpec[] = [
    ...Object.values(BATTLE_MOCK_PLAYER_SPRITES),
    ...BATTLE_MOCK_ENEMY_SPRITES,
];

describe('BattleUiMockScene layout contract', () => {
    it('keeps the production Silverpond arena on the non-overlapping main-menu shortcut', () => {
        const shortcut = menuById.get('btnSilverpondBattleMock');
        const guildShortcut = menuById.get('btnUnderwaterAdventure');
        expect(shortcut).toMatchObject({
            asset: 'ui.containers.empty',
            x: 1060,
            y: 580,
            width: 350,
            height: 62,
        });

        ['btnContinue', 'btnNewGame', 'btnCoop'].forEach(id => {
            const primary = menuById.get(id);
            const overlapsX = Math.abs(shortcut.x - primary.x) < (shortcut.width + 380) / 2;
            const overlapsY = Math.abs(shortcut.y - primary.y) < (shortcut.height + 92) / 2;
            expect(overlapsX && overlapsY, `${id} overlaps the Silverpond shortcut`).toBe(false);
        });

        const overlapsGuildX = Math.abs(shortcut.x - guildShortcut.x)
            < (shortcut.width + guildShortcut.width) / 2;
        const overlapsGuildY = Math.abs(shortcut.y - guildShortcut.y)
            < (shortcut.height + guildShortcut.height) / 2;
        expect(overlapsGuildX && overlapsGuildY).toBe(false);

        const menuSource = readFileSync(resolve('src/scenes/MenuScene.ts'), 'utf8');
        expect(menuSource).toContain("this.scene.start('SilverpondArenaMockScene', {");
        expect(menuSource).toContain("encounterId: 'silverpond-arena-1-wave-1'");
        expect(menuSource).toContain("label: 'SILVERPOND: VODNÍ ARÉNA'");
        expect(menuSource).toContain("hostId: 'btnSilverpondBattleMock'");
    });

    it('stages the Silverpond wave-one frog against the hero', () => {
        expect(byId.get('battleMockBackground')?.asset)
            .toBe('library.image.silverpond-water-arena-1-battle');
        expect(BATTLE_MOCK_ENEMY_SPRITES[0]).toMatchObject({
            hostId: 'battleMockEnemy',
            texture: 'silverpond-frog-enemy-idle-sheet',
            animation: 'silverpond-frog-enemy-idle',
        });
    });

    it('uses BattleScene as the only spawn-point source for single, co-op and 1-3 enemies', () => {
        expect(BATTLE_MOCK_LAYOUT_SCENE).toBe('BattleScene');
        expect(mockScene.spawnPoints).toBeUndefined();
        expect(battleScene.spawnPoints.players.single.player).toBeDefined();
        expect(battleScene.spawnPoints.players.single.pet).toBeDefined();
        expect(battleScene.spawnPoints.players.coop.player).toBeDefined();
        expect(battleScene.spawnPoints.players.coop.playerB).toBeDefined();
        expect(battleScene.spawnPoints.players.coop.pet).toBeDefined();
        expect(battleScene.spawnPoints.players.coop.petB).toBeDefined();
        expect(battleScene.spawnPoints.enemies['1']).toHaveLength(1);
        expect(battleScene.spawnPoints.enemies['2']).toHaveLength(2);
        expect(battleScene.spawnPoints.enemies['3']).toHaveLength(3);
    });

    it('keeps transform hosts editable while runtime sprites use real animations', () => {
        const spritesheets = texturesJson.spritesheets as JsonObject;

        for (const spec of allSpriteSpecs) {
            const host = byId.get(spec.hostId);
            expect(host, `${spec.hostId} must stay editable in scenes.json`).toBeDefined();

            const asset = getAssetDefinition(host!.asset);
            expect(['sprite', 'animatedSprite'], spec.hostId).toContain(asset?.type);
            expect(asset?.defaultTexture, spec.hostId).toBe(spec.texture);
            expect(spritesheets[spec.texture], spec.texture).toBeDefined();
            expect(hasAnimation(animationsJson, spec.animation), spec.animation).toBe(true);
        }

        expect(byId.get('battleMockPet')?.scale).toBe(0.5);
        expect(byId.get('battleMockPetB')?.scale).toBe(0.5);
    });

    it('keeps target direction protected by a runtime fallback', () => {
        expect(BATTLE_MOCK_TARGET_ROTATION).toBeGreaterThanOrEqual(90);
        expect(BATTLE_MOCK_TARGET_ROTATION).toBeLessThanOrEqual(225);

        const marker = byId.get('battleMockTargetSword');
        expect(marker).toBeDefined();
        if (marker!.rotation !== undefined) {
            expect(marker!.rotation).toBe(BATTLE_MOCK_TARGET_ROTATION);
        }
    });

    it('uses one player size and one lighter enemy size for HP fills', () => {
        const playerHpHostIds = [
            'battleMockPlayerHpHost',
            'battleMockPlayerBHpHost',
        ];
        const enemyHpHostIds = [
            'battleMockEnemyHpHost',
            'battleMockEnemyGroup2HpHost',
            'battleMockEnemyGroup3HpHost',
        ];
        const dimensionsFor = (ids: string[]) => ids.map(id => {
            const host = byId.get(id);
            expect(host, `${id} must stay editable in scenes.json`).toBeDefined();
            return [host!.width, host!.height];
        });

        expect(new Set(dimensionsFor(playerHpHostIds).map(size => size.join('x'))))
            .toEqual(new Set(['115x9']));
        expect(new Set(dimensionsFor(enemyHpHostIds).map(size => size.join('x'))))
            .toEqual(new Set(['86x7']));
    });

    it('uses lighter enemy frames and exposes both mock switches', () => {
        const playerFrameIds = [
            'battleMockPlayerVitalsFrame',
            'battleMockPlayerBVitalsFrame',
        ];
        const enemyFrameIds = [
            'battleMockEnemyVitalsFrame',
            'battleMockEnemyGroup2VitalsFrame',
            'battleMockEnemyGroup3VitalsFrame',
        ];
        expect(playerFrameIds.map(id => byId.get(id)?.width)).toEqual([150, 150]);
        expect(enemyFrameIds.map(id => byId.get(id)?.width)).toEqual([118, 118, 118]);
        [...playerFrameIds, ...enemyFrameIds].forEach(id => {
            expect(byId.get(id)?.asset).toBe('misc.battle-hud.status-frame-v2');
        });

        const requiredControlHosts = [
            'battleMockModePanelHost',
            'battleMockSingleModeHost',
            'battleMockCoopModeHost',
            'battleMockEnemyCountPanelHost',
            'battleMockEnemyCount1Host',
            'battleMockEnemyCount2Host',
            'battleMockEnemyCount3Host',
        ];
        requiredControlHosts.forEach(id => {
            expect(byId.has(id), `${id} must stay editable in scenes.json`).toBe(true);
        });
    });

    it('authors each vitals frame directly above its actor reference position', () => {
        const pairs = [
            ['battleMockHero', 'battleMockPlayerVitalsFrame'],
            ['battleMockHeroB', 'battleMockPlayerBVitalsFrame'],
            ['battleMockEnemy', 'battleMockEnemyVitalsFrame'],
            ['battleMockEnemy2', 'battleMockEnemyGroup2VitalsFrame'],
            ['battleMockEnemy3', 'battleMockEnemyGroup3VitalsFrame'],
        ];

        pairs.forEach(([actorId, frameId]) => {
            const actor = byId.get(actorId)!;
            const frame = byId.get(frameId)!;
            expect(frame.x, frameId).toBe(actor.x);
            expect(frame.y, frameId).toBeLessThan(actor.y);
        });
    });
});

describe('production BattleScene HUD contract', () => {
    it('uses the approved mock assets and keeps every static control editable', () => {
        const expectedAssets: Record<string, string> = {
            battlePlayerStatusHostA: 'misc.battle-hud.status-frame-v2',
            battlePlayerStatusHostB: 'misc.battle-hud.status-frame-v2',
            battleEnemyStatusHost1: 'misc.battle-hud.status-frame-v2',
            battleEnemyStatusHost2: 'misc.battle-hud.status-frame-v2',
            battleEnemyStatusHost3: 'misc.battle-hud.status-frame-v2',
            battleActionDockFrame: 'misc.battle-hud.action-dock-frame',
            battlePreparationHost: 'misc.battle-hud.preparation-frame',
            pauseButton: 'misc.battle-hud.pause-button',
            battleTargetSwordHost: 'misc.prep-sword-normal-v2',
        };
        Object.entries(expectedAssets).forEach(([id, asset]) => {
            expect(productionById.get(id)?.asset, id).toBe(asset);
        });
        [
            'battlePotionActionHost',
            'battlePotionBadgeHost',
            'battleSwordActionHost',
            'battlePetActionHost',
            'battlePetBadgeHost',
            'battlePauseHoverHost',
            'battlePauseOverlayHost',
            'battlePausePanelHost',
            'battlePauseTitleHost',
            'battlePauseResumeHost',
            'battlePauseFullscreenHost',
            'battlePauseTvHost',
            'battlePauseQuitHost',
            'battleBlockBannerHost',
        ].forEach(id => expect(productionById.has(id), id).toBe(true));
    });

    it('keeps equal player bars and equal lightweight enemy bars', () => {
        expect(productionById.get('battlePlayerStatusHostA')).toMatchObject({ width: 150, height: 34 });
        expect(productionById.get('battlePlayerStatusHostB')).toMatchObject({ width: 150, height: 34 });
        for (let index = 1; index <= 4; index++) {
            expect(productionById.get(`battleEnemyStatusHost${index}`)).toMatchObject({
                width: 118,
                height: 28,
            });
        }
    });

    it('authors status anchors above the canonical co-op actors', () => {
        const coop = battleScene.spawnPoints.players.coop;
        const enemies = battleScene.spawnPoints.enemies['3'];
        expect(productionById.get('battlePlayerStatusHostA')?.x).toBe(coop.player.x);
        expect(productionById.get('battlePlayerStatusHostA')?.y).toBeLessThan(coop.player.y);
        expect(productionById.get('battlePlayerStatusHostB')?.x).toBe(coop.playerB.x);
        expect(productionById.get('battlePlayerStatusHostB')?.y).toBeLessThan(coop.playerB.y);
        enemies.forEach((enemy: JsonObject, index: number) => {
            const host = productionById.get(`battleEnemyStatusHost${index + 1}`);
            expect(host?.x).toBe(enemy.x);
            expect(host?.y).toBeLessThan(enemy.y);
        });
    });

    it('does not restore the legacy rectangular action buttons', () => {
        expect(productionById.has('attackBtn')).toBe(false);
        expect(productionById.has('potionBtn')).toBe(false);
        expect(productionById.has('preparationStatusHostA')).toBe(false);
        expect(productionById.has('preparationStatusHostB')).toBe(false);
    });

    it('gives the catacomb battle its own scene definition and actor status host', () => {
        const catacomb = (scenesJson.scenes as JsonObject).CatacombTrialScene;
        expect(catacomb.elements.some((element: JsonObject) => element.id === 'catacombBattleBackground')).toBe(true);
        expect(catacomb.ui).toContainEqual(expect.objectContaining({
            id: 'catacombCreatureStatusHost',
            asset: 'misc.battle-hud.status-frame-v2',
            width: 118,
            height: 28,
        }));
    });
});

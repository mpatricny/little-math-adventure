import { describe, expect, it } from 'vitest';
import encountersJson from '../../../public/assets/data/encounters.json';
import enemiesJson from '../../../public/assets/data/enemies.json';
import forestRoomsJson from '../../../public/assets/data/forest-rooms.json';
import scenesJson from '../../../public/assets/data/scenes.json';
import type { EnemyDefinition } from '../../types';
import { createEncounterCatalog } from '../EncounterCatalog';
import {
    resolveEnemyBattlePresentation,
    resolveEnemyScenePresentation,
} from '../EnemyPresentationSystem';

type JsonObject = Record<string, any>;

function forestEnemyPlacements(): Array<{ roomId: string; object: JsonObject }> {
    const rooms = (forestRoomsJson as JsonObject).rooms as Record<string, JsonObject>;
    return Object.values(rooms).flatMap(room => (
        (room.objects ?? [])
            .filter((object: JsonObject) => object.type === 'enemy' || object.type === 'boss')
            .map((object: JsonObject) => ({ roomId: room.id, object }))
    ));
}

describe('enemy presentation data flow', () => {
    it('keeps mushroom and treant presentation explicit for world and battle contexts', () => {
        const enemies = new Map(
            (enemiesJson as EnemyDefinition[]).map(enemy => [enemy.id, enemy]),
        );

        expect(enemies.get('forest_wolf')?.scale).toBe(0.5);
        expect(enemies.get('giant_mushroom')).toMatchObject({
            worldScale: 0.5,
            battleScale: 0.5,
            battleOffsetX: 30,
            battleOffsetY: 20,
        });
        expect(enemies.get('ancient_treant')).toMatchObject({
            worldScale: 0.5,
            battleScale: 0.5,
            battleOffsetX: 35,
            battleOffsetY: 25,
        });
        expect(enemies.get('giant_mushroom')).not.toHaveProperty('scale');
        expect(enemies.get('ancient_treant')).not.toHaveProperty('scale');
        expect(enemies.get('verdant_guardian')?.scale).toBe(1.2);
    });

    it('keeps room placement separate from encounter rosters and artwork definitions', () => {
        const catalog = createEncounterCatalog(encountersJson, {
            core: enemiesJson as EnemyDefinition[],
        });
        const enemyIds = new Set((enemiesJson as EnemyDefinition[]).map(enemy => enemy.id));

        forestEnemyPlacements().forEach(({ roomId, object }) => {
            expect(object.x, `${roomId}/${object.id} x`).toBeTypeOf('number');
            expect(object.y, `${roomId}/${object.id} y`).toBeTypeOf('number');
            expect(object.depth, `${roomId}/${object.id} depth`).toBeTypeOf('number');
            expect(object.visualEnemyId, `${roomId}/${object.id} visualEnemyId`).toBeTypeOf('string');
            expect(enemyIds.has(object.visualEnemyId), `${roomId}/${object.id} visual enemy`).toBe(true);
            expect(object, `${roomId}/${object.id} must not duplicate spriteKey`).not.toHaveProperty('sprite');

            const encounter = catalog.getForestRoomEncounter(roomId, object.id);
            expect(
                encounter.enemies.some(enemy => enemy.enemyId === object.visualEnemyId),
                `${roomId}/${object.id} visual enemy belongs to encounter`,
            ).toBe(true);
        });
    });

    it('uses world scale unless a room placement explicitly overrides it', () => {
        const enemy = (enemiesJson as EnemyDefinition[])
            .find(candidate => candidate.id === 'giant_mushroom')!;
        const canonical = resolveEnemyScenePresentation({
            visualEnemyId: enemy.id,
            x: 1040,
            y: 550,
            depth: 8,
        }, enemy, { depth: 5 });
        const overridden = resolveEnemyScenePresentation({
            visualEnemyId: enemy.id,
            x: 1040,
            y: 550,
            scale: 0.4,
            depth: 9,
        }, enemy, { depth: 5 });

        expect(canonical).toMatchObject({ x: 1040, y: 550, scale: 0.5, depth: 8 });
        expect(overridden).toMatchObject({ scale: 0.4, depth: 9 });
    });

    it('stores tuned room anchors for both mushrooms and the treant', () => {
        const rooms = (forestRoomsJson as JsonObject).rooms as Record<string, JsonObject>;
        const find = (roomId: string, objectId: string) => (
            rooms[roomId].objects.find((object: JsonObject) => object.id === objectId)
        );

        expect(find('forest_riddle', 'mushroom_1')).toMatchObject({ x: 1040, y: 550 });
        expect(find('deep_forest', 'mushroom_2')).toMatchObject({ x: 520, y: 575 });
        expect(find('ancient_grove', 'treant_1')).toMatchObject({ x: 900, y: 560 });
    });

    it('applies battle scale and offsets relative to the scene spawn point', () => {
        const enemies = enemiesJson as EnemyDefinition[];
        const mushroom = enemies.find(enemy => enemy.id === 'giant_mushroom')!;
        const treant = enemies.find(enemy => enemy.id === 'ancient_treant')!;

        expect(resolveEnemyBattlePresentation(mushroom, { x: 899, y: 484 }))
            .toEqual({ x: 929, y: 504, scale: 0.5 });
        expect(resolveEnemyBattlePresentation(treant, { x: 899, y: 484 }))
            .toEqual({ x: 934, y: 509, scale: 0.5 });
    });

    it('stores Guardian Lair state scales in scenes.json hosts', () => {
        const elements = ((scenesJson as JsonObject).scenes.GuardianLairScene.elements as JsonObject[]);
        const byId = new Map(elements.map(element => [element.id, element]));

        expect(byId.get('roomGuardianHost')?.scale).toBe(0.66);
        expect(byId.get('roomGuardianAwakenedHost')?.scale).toBe(0.82);
        expect(byId.get('battleGuardianHost')?.scale).toBe(0.82);
    });
});

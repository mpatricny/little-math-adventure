import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import forestRoomsJson from '../../../public/assets/data/forest-rooms.json';
import scenesJson from '../../../public/assets/data/scenes.json';
import { resolveForestRoomSceneKey } from '../ForestRoomRouting';

type JsonObject = Record<string, any>;

const forestRooms = forestRoomsJson as JsonObject;
const guardianRoom = forestRooms.rooms.guardian_lair as JsonObject;
const guardianScene = (scenesJson.scenes as JsonObject).GuardianLairScene as JsonObject;
const guardianElements = [
    ...(guardianScene.elements ?? []),
    ...(guardianScene.ui ?? []),
] as JsonObject[];
const guardianElementsById = new Map(
    guardianElements.map(element => [element.id, element]),
);

describe('Guardian Lair production contract', () => {
    it('routes the room to its custom scene from forest-rooms.json', () => {
        expect(guardianRoom.sceneClass).toBe('GuardianLairScene');
        expect(resolveForestRoomSceneKey(forestRooms, 'guardian_lair'))
            .toBe('GuardianLairScene');
        expect(resolveForestRoomSceneKey(forestRooms, 'ancient_grove'))
            .toBe('ForestRoomScene');
    });

    it('does not carry the legacy crystal-altar sprite into the generic room renderer', () => {
        const offering = guardianRoom.objects.find(
            (object: JsonObject) => object.id === 'puzzle_offering',
        );

        expect(offering).toMatchObject({
            type: 'puzzle',
            puzzleId: 'crystal_offering',
        });
        expect(offering).not.toHaveProperty('sprite');
    });

    it('keeps the approved shrine layout and ritual controls editor-driven', () => {
        expect(guardianElementsById.get('background')).toMatchObject({
            asset: 'library.image.guardian-lair-mock',
            x: 640,
            y: 360,
        });
        expect(guardianElementsById.get('ritualButtonHost')).toMatchObject({
            asset: 'ui.containers.empty',
            x: 720,
            y: 635,
            width: 300,
            height: 62,
            depth: 50,
        });
        expect(guardianElementsById.has('ritualButton')).toBe(false);
        expect(guardianElementsById.has('ritualTargetHost')).toBe(true);
        for (let index = 0; index < 6; index++) {
            expect(guardianElementsById.has(`ritualCrystal${index}Host`)).toBe(true);
        }
    });

    it('uses the layered action button instead of the legacy UI template', () => {
        const guardianSource = readFileSync(
            resolve('src/scenes/GuardianLairMockScene.ts'),
            'utf8',
        );
        const roomSource = readFileSync(
            resolve('src/scenes/ForestRoomScene.ts'),
            'utf8',
        );
        const riddleSource = readFileSync(
            resolve('src/scenes/ForestRiddleScene.ts'),
            'utf8',
        );

        expect(guardianSource).toContain('new MedievalActionButton');
        expect(guardianSource).toContain("getHost('ritualButtonHost'");
        expect(guardianSource).not.toContain("getData('textObjects')");
        expect(guardianSource).not.toContain("bindClick('ritualButton'");
        expect(roomSource).toContain('resolveForestRoomSceneKey(this.roomsData, this.roomId)');
        expect(riddleSource).toContain('resolveForestRoomSceneKey(forestRooms, targetRoom)');
    });
});

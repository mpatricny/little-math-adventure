import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';

type JsonObject = Record<string, any>;

const scene = (scenesJson.scenes as JsonObject).ArenaUiMockScene;
const entries = [...scene.elements, ...scene.ui] as JsonObject[];
const byId = new Map(entries.map(entry => [entry.id, entry]));

describe('ArenaUiMockScene entrance layout', () => {
    it('keeps the five-wave board and uses editable Silverpond-style selection hosts', () => {
        expect(byId.get('arenaMockFrame')).toMatchObject({
            asset: 'misc.arena-with-title',
            uiElement: { templateId: '1769790026152-n7qtn1nyx' },
        });
        expect(byId.get('arenaMockWaveListHost')).toMatchObject({ x: 227, y: 255 });
        expect(byId.has('arenaMockProgressHost')).toBe(false);
        expect(byId.has('arenaMockEnemyTitleHost')).toBe(false);
        expect(byId.get('arenaMockChoiceStatusHost')).toMatchObject({ x: 805, y: 144 });
        expect(byId.get('arenaMockWaveTitleHost')).toMatchObject({ x: 805, y: 190 });
        expect(byId.get('arenaMockPreviousButton')).toMatchObject({
            asset: 'misc.newarrow',
            events: { click: 'arenaMockPrevious' },
        });
        expect(byId.get('arenaMockNextButton')).toMatchObject({
            asset: 'misc.newarrow-1',
            events: { click: 'arenaMockNext' },
        });
    });

    it('keeps global resources separate from editable per-player status pods', () => {
        expect(byId.get('arenaMockResourceHost')).toMatchObject({
            width: 258,
            height: 74,
        });
        expect(byId.has('arenaMockHpHost')).toBe(false);
        expect(byId.has('arenaMockPotionHost')).toBe(false);
        expect(byId.has('arenaMockPreparationHost')).toBe(false);
        expect(byId.get('arenaMockPlayerAPodHost')).toMatchObject({
            x: 470,
            y: 500,
            width: 178,
            height: 78,
        });
        expect(byId.get('arenaMockPlayerBPodHost')).toMatchObject({
            x: 89,
            y: 630,
            width: 176,
            height: 77,
        });
        expect(byId.get('arenaMockStartHost')).toMatchObject({
            width: 276,
            height: 110,
        });
    });

    it('uses the production ArenaScene co-op spawn points for players and pets', () => {
        const expectedActors: Record<string, { x: number; y: number; scale: number }> = {
            arenaMockHeroAHost: { x: 318, y: 516, scale: 1 },
            arenaMockPetAHost: { x: 423, y: 598, scale: 0.5 },
            arenaMockHeroBHost: { x: 176, y: 572, scale: 1.35 },
            arenaMockPetBHost: { x: 276, y: 659, scale: 0.5 },
        };
        Object.entries(expectedActors).forEach(([id, transform]) => {
            expect(byId.get(id), id).toMatchObject({
                asset: 'ui.containers.empty',
                ...transform,
            });
        });
    });

    it('keeps opponent preview transforms editable', () => {
        const expectedScales: Record<string, number> = {
            arenaMockEnemyAHost: 0.86,
            arenaMockEnemyBHost: 0.82,
        };

        Object.entries(expectedScales).forEach(([id, scale]) => {
            expect(byId.get(id), id).toMatchObject({
                asset: 'ui.containers.empty',
                scale,
            });
        });
    });

    it('uses the canonical building back control instead of a gray placeholder', () => {
        expect(byId.get('arenaMockBackButton')).toMatchObject({
            asset: 'Back button',
            scale: 0.68,
            uiElement: { templateId: '1768730825297-e6lnuaoyj' },
            events: { click: 'arenaMockBack' },
        });
    });
});

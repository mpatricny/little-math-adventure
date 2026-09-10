import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import scenesJson from '../../../public/assets/data/scenes.json';

type JsonObject = Record<string, any>;

const arena = (scenesJson.scenes as JsonObject).ArenaScene;
const entries = [...arena.elements, ...arena.ui] as JsonObject[];
const byId = new Map(entries.map(entry => [entry.id, entry]));

describe('production arena status HUD', () => {
    it('keeps resources and all single/co-op status positions editable', () => {
        expect(byId.get('arenaResourceHudHost')).toMatchObject({
            asset: 'ui.containers.empty',
            x: 1120,
            y: 42,
            width: 258,
            height: 74,
            depth: 72,
        });
        expect(byId.get('arenaPlayerASinglePodHost')).toMatchObject({
            x: 368,
            y: 547,
            width: 178,
            height: 78,
        });
        expect(byId.get('arenaPlayerACoopPodHost')).toMatchObject({
            x: 470,
            y: 500,
            width: 178,
            height: 78,
        });
        expect(byId.get('arenaPlayerBPodHost')).toMatchObject({
            x: 89,
            y: 630,
            width: 176,
            height: 77,
        });
    });

    it('reuses ArenaScene layout and implementation in the Silverpond arena', () => {
        const silverpondSource = readFileSync(
            new URL('../../scenes/SilverpondArenaMockScene.ts', import.meta.url),
            'utf8',
        );
        expect(silverpondSource).toContain("extends ArenaScene");
        expect(silverpondSource).toContain("layoutSceneKey: 'ArenaScene'");
        expect(silverpondSource).toContain("cityId: 'silverpond'");
        expect(silverpondSource).toContain("4: 'silverpond-water-arena-1-battle-bg'");
        expect(silverpondSource).toContain("6: 'silverpond-water-arena-3-battle-bg'");
    });

    it('uses the compact runtime components instead of arena rectangle placeholders', () => {
        const arenaSource = readFileSync(
            new URL('../../scenes/ArenaScene.ts', import.meta.url),
            'utf8',
        );
        expect(arenaSource).toContain('new ArenaPlayerStatusPod');
        expect(arenaSource).toContain('new TownResourceHud');
        expect(arenaSource).toContain('new MedievalActionButton');
        expect(arenaSource).toContain('`${def.animPrefix}-idle`');
        expect(arenaSource).not.toContain("def.spriteKey.split('-')[0]");
        expect(arenaSource).not.toContain('createPlayerHpBar');
        expect(arenaSource).not.toContain('🧪');
        expect(byId.get('startBattleButton')).toMatchObject({
            asset: 'ui.containers.empty',
            x: 980,
            y: 654,
            width: 276,
            height: 110,
        });
        expect(byId.get('leaveButton')).toMatchObject({
            asset: 'Back button',
            x: 1188,
            y: 650,
            scale: 0.68,
            events: { click: 'leaveArena' },
        });
    });
});

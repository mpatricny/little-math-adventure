import { describe, expect, it } from 'vitest';
import enemiesJson from '../../../public/assets/data/enemies.json';
import scenesJson from '../../../public/assets/data/scenes.json';
import roomsJson from '../../../public/assets/data/underwater-rooms.json';
import encountersJson from '../../../public/assets/data/encounters.json';
import texturesJson from '../../../public/assets/data/textures.json';
import type { EnemyDefinition } from '../../types';
import { createEncounterCatalog } from '../EncounterCatalog';

describe('read-free underwater creature ranks', () => {
    const enemies = enemiesJson as EnemyDefinition[];
    const catalog = createEncounterCatalog(encountersJson, { core: enemies });
    it('keeps stronger forms explicitly linked to the same canonical artwork and freed species', () => {
        const variants = enemies.filter(enemy => enemy.rank === 'elite');
        expect(variants.length).toBeGreaterThanOrEqual(5);
        for (const variant of variants) {
            const base = enemies.find(enemy => enemy.id === variant.baseEnemyId);
            expect(base, variant.id).toBeDefined();
            expect(base?.rank).toBeUndefined();
            expect(variant.spriteKey).toBe(base?.spriteKey);
            expect(variant.animPrefix).toBe(base?.animPrefix);
        }
    });
    it('provides editor-controlled 48px crest hosts for every visible encounter slot', () => {
        for (const room of Object.values(roomsJson.rooms) as any[]) {
            if (!room.encounter) continue;
            const scene = (scenesJson.scenes as Record<string, any>)[room.layout];
            const roster = catalog.resolveJourneyEncounter(room.encounter.id, 'solo').enemies;
            roster.forEach((enemy, index) => {
                const actorId=index===0?room.encounter.host:'guardianEscortHost';
                const rankId=index===0?'guardianRankHost':'guardianEscortRankHost';
                expect(scene.elements.find((e: any) => e.id === actorId), `${room.id}/${actorId}`).toBeDefined();
                if (enemy.rank !== 'elite') return;
                const host=scene.elements.find((e: any) => e.id === rankId);
                expect(host, `${room.id}/${rankId}`).toMatchObject({ width:48,height:48,asset:'ui.containers.empty' });
                expect(host.x-host.width/2).toBeGreaterThanOrEqual(0);
                expect(host.x+host.width/2).toBeLessThanOrEqual(1280);
                expect(host.y-host.height/2).toBeGreaterThanOrEqual(0);
            });
        }
    });
    it('keeps every battle crest beside its status plate with a safe gap', () => {
        const elements=scenesJson.scenes.BattleScene.ui;
        for(let i=1;i<=4;i++) {
            const status=elements.find(e=>e.id===`battleEnemyStatusHost${i}`)!;
            const crest=elements.find(e=>e.id===`battleEnemyRankHost${i}`)!;
            expect(crest.width).toBe(48);expect(crest.height).toBe(48);
            expect(crest.x-crest.width/2-(status.x+status.width/2)).toBeGreaterThanOrEqual(4);
            expect(crest.y).toBe(status.y);
        }
        expect(texturesJson.images['underwater-elite-rank-badge']).toBe('ui/underwater/elite-rank-badge.webp');
    });
});

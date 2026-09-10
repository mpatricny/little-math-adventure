import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import enemies from '../../../public/assets/data/enemies.json';
import textures from '../../../public/assets/data/textures.json';
import animations from '../../../public/assets/data/animations.json';
import encounters from '../../../public/assets/data/encounters.json';
import assets from '../../../public/assets/data/assets.json';
import layouts from '../../../public/assets/data/scenes.json';
import rooms from '../../../public/assets/data/underwater-rooms.json';

describe('production underwater creature animations', () => {
    it('registers a real friendly NPC idle separately from the corrupted combat family', () => {
        const family = (animations.npcs as Record<string, any>)['depth-guardian-friendly'];
        const idle = family['depth-guardian-friendly-idle'];
        const sheet = (textures.spritesheets as Record<string, any>)[idle.texture];
        expect(sheet.frameWidth).toBe(512); expect(sheet.frameHeight).toBe(512);
        expect(sheet.frameCount).toBeGreaterThan(1);
        expect(existsSync(`public/assets/${sheet.path}`)).toBe(true);
        expect(idle.frameRate).toBe(6); expect(idle.repeat).toBe(-1);
        const sequence = idle.frames.sequence as number[];
        expect(sequence.every((v, i) => v !== sequence[(i + 1) % sequence.length])).toBe(true);
        expect(sequence.every(v => v >= 0 && v < sheet.frameCount)).toBe(true);
        const editor = (assets.characters.npcs as Record<string, any>).depth_guardian_friendly;
        expect(editor.category).toBe('npc'); expect(editor.defaultTexture).toBe(idle.texture);
        expect(editor.animations.idle).toBe('depth-guardian-friendly-idle');
        expect(idle.texture).not.toBe(enemies.find(e => e.id === 'silverpond_depth_guardian')!.spriteKey);
    });
    it('the friendly guardian stays above the entire player path and clear of the crystal', () => {
        const room = layouts.scenes.UnderwaterLakeHeart;
        const finale = rooms.rooms.sp_lake_heart.finale;
        const host = (id: string) => room.elements.find(e => e.id === id)!;
        const party = host('partyHost'), crystal = host(finale.crystalHost);
        // Include the full swim bubble, its 5px idle lift, and a safety gap.
        const pathTop = Math.min(...room.zones.filter(z => z.id.startsWith('path')).map(z => z.y)) - party.height * .93 - 5;
        for (const id of [finale.guardianHost, finale.guardianArrivalHost]) {
            const guardian = host(id);
            expect(guardian.width).toBe(guardian.height);
            expect(guardian.y + guardian.height / 2 + 2).toBeLessThan(pathTop);
            expect(guardian.x + guardian.width / 2 + 8).toBeLessThan(crystal.x - crystal.width / 2);
            expect(guardian.depth).toBeLessThan(party.depth);
        }
        expect(host(finale.guardianHost).x).toBeLessThan(host(finale.guardianArrivalHost).x);
    });
    for (const [id, prefix, asset] of [
        ['silverpond_pearl_jellyfish', 'pearl-jellyfish', 'pearl_jellyfish'],
        ['silverpond_depth_guardian', 'depth-guardian', 'depth_guardian'],
    ]) it(`${prefix}: registered complete, stable-canvas video animation family`, () => {
        const enemy = enemies.find(e => e.id === id)!;
        const family = (animations.enemies as Record<string, any>)[prefix];
        expect(family).toBeDefined();
        expect(enemy.spriteKey).toBe(family[`${prefix}-idle`].texture);
        const editor = (assets.characters.enemies as Record<string, any>)[asset];
        expect(editor.defaultTexture).toBe(enemy.spriteKey);
        expect(editor.defaultAnimation).toBe('idle');
        for (const name of ['idle', 'attack', 'attack-anim', 'defend', 'hurt', 'defeat', 'death']) {
            const animation = family[`${prefix}-${name}`];
            expect(animation).toBeDefined();
            const sheet = (textures.spritesheets as Record<string, any>)[animation.texture];
            expect(sheet.frameWidth).toBe(512); expect(sheet.frameHeight).toBe(512);
            expect(sheet.frameCount).toBeGreaterThan(1);
            expect(animation.frameRate).toBe(6);
            expect(existsSync(`public/assets/${sheet.path}`)).toBe(true);
            const indices = animation.frames.sequence ?? [animation.frames.start, animation.frames.end];
            expect(indices.every((i: number) => i >= 0 && i < sheet.frameCount)).toBe(true);
        }
        expect(family[`${prefix}-hurt`].texture).toBe(family[`${prefix}-defend`].texture);
        expect(family[`${prefix}-death`].texture).toBe(family[`${prefix}-defeat`].texture);
        expect(family[`${prefix}-attack-anim`].holdUntilComplete).toBe(true);
        const sequence = family[`${prefix}-idle`].frames.sequence as number[];
        expect(sequence.every((value, i) => value !== sequence[(i + 1) % sequence.length])).toBe(true);
    });

    it('each guardian phase resolves its own complete attack with a visible follow-through', () => {
        const phases = encounters.bosses['depth-guardian-v1'].phases;
        const family = (animations.enemies as Record<string, any>)['depth-guardian'];
        const keys = phases.map(phase => (phase as { attackAnim?: string }).attackAnim);
        expect(keys).toHaveLength(3); expect(new Set(keys).size).toBe(3);
        for (const key of keys) {
            expect(key).toBeTruthy();
            expect(family[key!]?.holdUntilComplete).toBe(true);
            expect(family[key!]?.repeat).toBe(0);
        }
    });
});

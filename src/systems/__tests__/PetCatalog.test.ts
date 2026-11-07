import { describe, expect, it } from 'vitest';
import enemies from '../../../public/assets/data/enemies.json';
import pets from '../../../public/assets/data/pets.json';
import textures from '../../../public/assets/data/textures.json';
import animations from '../../../public/assets/data/animations.json';
import type { EnemyDefinition, PetDefinition, PlayerState } from '../../types';
import { isPetUnlocked } from '../PetCatalog';
import { recordDefeatedEnemy } from '../EnemyUnlockSystem';

const catalog = pets as PetDefinition[];
const enemyCatalog = enemies as EnemyDefinition[];
const species = ['silverpond_armored_seahorse', 'silverpond_rune_nautilus'];
const playerWithEvidence = (unlockedPets: string[], perfectDefeats: string[] = []) => ({
    unlockedPets, perfectDefeats, ownedPets: [],
}) as unknown as PlayerState;

describe('underwater companion catalog', () => {
    it('has one stable companion per new species using its production assets', () => {
        expect(new Set(catalog.map(pet => pet.id)).size).toBe(catalog.length);
        for (const id of species) {
            const matches = catalog.filter(pet => pet.unlockedByEnemy === id);
            expect(matches).toHaveLength(1);
            const pet = matches[0];
            const enemy = enemyCatalog.find(candidate => candidate.id === id)!;
            expect(pet.id).toBe(`pet_${id}`);
            expect(pet.spriteKey).toBe(enemy.spriteKey);
            expect(pet.animPrefix).toBe(enemy.animPrefix);
            expect(textures.spritesheets).toHaveProperty(pet.spriteKey);
            expect(JSON.stringify(animations)).toContain(`"${pet.animPrefix}-attack-anim"`);
            expect(pet.requiredAmulet.value).toBeGreaterThan(0);
        }
    });

    for (const id of species) {
        const pet = catalog.find(candidate => candidate.unlockedByEnemy === id)!;
        it(`${id}: both forms free one bindable companion without granting ownership`, () => {
            const player = playerWithEvidence([]);
            expect(isPetUnlocked(pet, player)).toBe(false);
            const stronger = enemyCatalog.find(enemy => enemy.id === `${id}_deep`)!;
            expect(recordDefeatedEnemy(player, stronger, catalog)?.id).toBe(pet.id);
            expect(isPetUnlocked(pet, player)).toBe(true);
            expect(recordDefeatedEnemy(player, enemyCatalog.find(enemy => enemy.id === id)!, catalog)).toBeUndefined();
            expect(player.unlockedPets).toEqual([`${id}_deep`, id]);
            expect(player.ownedPets).toEqual([]);
        });

        it(`${id}: recognizes saved base, stronger and perfect defeat evidence`, () => {
            for (const evidence of [id, `${id}_deep`, `${id}_defeated`, `${id}_deep_defeated`]) {
                const player = playerWithEvidence([evidence]);
                const before = JSON.stringify(player);
                expect(isPetUnlocked(pet, JSON.parse(before))).toBe(true);
                expect(JSON.stringify(player)).toBe(before);
            }
            expect(isPetUnlocked(pet, playerWithEvidence([], [`${id}_deep`]))).toBe(true);
            expect(isPetUnlocked(pet, playerWithEvidence(['silverpond_depth_guardian']))).toBe(false);
            expect(isPetUnlocked(pet, playerWithEvidence(['arena_level_6']))).toBe(false);
        });
    }

    it('keeps two co-op owners independent', () => {
        const [first, second] = species.map(id => catalog.find(pet => pet.unlockedByEnemy === id)!);
        const playerA = playerWithEvidence([species[0]]);
        const playerB = playerWithEvidence([species[1]]);
        expect([isPetUnlocked(first, playerA), isPetUnlocked(second, playerA)]).toEqual([true, false]);
        expect([isPetUnlocked(first, playerB), isPetUnlocked(second, playerB)]).toEqual([false, true]);
    });
});

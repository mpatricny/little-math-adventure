import { describe, expect, it } from 'vitest';
import enemies from '../../../public/assets/data/enemies.json';
import pets from '../../../public/assets/data/pets.json';
import type { EnemyDefinition, PetDefinition } from '../../types';
import { recordDefeatedEnemy } from '../EnemyUnlockSystem';

const catalog = pets as PetDefinition[];
const variants = (enemies as EnemyDefinition[]).filter(enemy => enemy.baseEnemyId
    && catalog.some(pet => pet.unlockedByEnemy === enemy.baseEnemyId));

describe('stronger creature pet unlocks', () => {
    it('has production variants with obtainable companions', () => expect(variants.length).toBeGreaterThan(0));
    for (const enemy of variants) {
        it(`${enemy.id}: frees its base species only once`, () => {
            const player = { unlockedPets: [] as string[] };
            const pet = recordDefeatedEnemy(player, enemy, catalog);
            expect(player.unlockedPets).toEqual([enemy.id, enemy.baseEnemyId]);
            expect(pet?.unlockedByEnemy).toBe(enemy.baseEnemyId);
            expect(recordDefeatedEnemy(player, enemy, catalog)).toBeUndefined();
            expect(player.unlockedPets).toHaveLength(2);
        });
        it(`${enemy.id}: records the form without announcing an already freed pet again`, () => {
            const player = { unlockedPets: [enemy.baseEnemyId!] };
            expect(recordDefeatedEnemy(player, enemy, catalog)).toBeUndefined();
            expect(player.unlockedPets).toEqual([enemy.baseEnemyId, enemy.id]);
        });
    }
});

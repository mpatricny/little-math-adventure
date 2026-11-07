import type { EnemyDefinition, PetDefinition, PlayerState } from '../types';

/** Keep encounter identity while stronger forms free the same underlying pet. */
export function recordDefeatedEnemy(
    player: Pick<PlayerState, 'unlockedPets'>,
    enemy: EnemyDefinition,
    pets: PetDefinition[],
): PetDefinition | undefined {
    const speciesId = enemy.baseEnemyId ?? enemy.id;
    const newlyFreed = !player.unlockedPets.includes(speciesId);
    for (const id of new Set([enemy.id, speciesId])) {
        if (!player.unlockedPets.includes(id)) player.unlockedPets.push(id);
    }
    return newlyFreed ? pets.find(pet => pet.unlockedByEnemy === speciesId) : undefined;
}

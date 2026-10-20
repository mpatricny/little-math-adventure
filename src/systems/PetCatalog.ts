import type { PetDefinition, PlayerState } from '../types';

/** Battle saves keep stable enemy IDs, so newly added pets also unlock in older saves. */
export function isPetUnlocked(pet: PetDefinition, player: PlayerState): boolean {
    if (player.ownedPets.includes(pet.id)) return true;
    if (pet.unlockedByEnemy) return player.unlockedPets.includes(pet.unlockedByEnemy);
    if (pet.unlockedByArenaLevel !== undefined) {
        return player.unlockedPets.includes(`arena_level_${pet.unlockedByArenaLevel}`);
    }
    return pet.unlockedByArenaLevels?.every(level => player.unlockedPets.includes(`arena_level_${level}`)) ?? false;
}

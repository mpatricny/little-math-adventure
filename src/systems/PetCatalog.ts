import type { PetDefinition, PlayerState } from '../types';
import enemies from '../../public/assets/data/enemies.json';

/** Battle saves keep stable enemy IDs, so newly added pets also unlock in older saves. */
export function isPetUnlocked(pet: PetDefinition, player: PlayerState): boolean {
    if (player.ownedPets.includes(pet.id)) return true;
    if (pet.unlockedByEnemy) {
        // Earlier saves can contain only a stronger form's ID. A recorded
        // defeat still frees its species when that pet joins the catalog later.
        return enemies.some(enemy => (enemy.baseEnemyId ?? enemy.id) === pet.unlockedByEnemy && (
            player.unlockedPets.includes(enemy.id)
            || player.unlockedPets.includes(`${enemy.id}_defeated`)
            || player.perfectDefeats?.includes(enemy.id)
        ));
    }
    if (pet.unlockedByArenaLevel !== undefined) {
        return player.unlockedPets.includes(`arena_level_${pet.unlockedByArenaLevel}`);
    }
    return pet.unlockedByArenaLevels?.every(level => player.unlockedPets.includes(`arena_level_${level}`)) ?? false;
}

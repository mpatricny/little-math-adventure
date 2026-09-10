import type { PlayerState } from '../types';

export const CATACOMB_FOX_ENEMY = 'catacomb_creature_A';
export const CATACOMB_FOX_PET = 'pet_catacomb_A';

/** Preserve ownership/equipment when five placeholder wolves become one fox. */
export function migrateCatacombPets(player: PlayerState): void {
    const petId = (id: string) => /^pet_catacomb_[A-E]$/.test(id) ? CATACOMB_FOX_PET : id;
    const enemyId = (id: string) => /^catacomb_creature_[A-E]$/.test(id) ? CATACOMB_FOX_ENEMY : id;
    player.unlockedPets = [...new Set((player.unlockedPets ?? []).map(enemyId))];
    player.ownedPets = [...new Set((player.ownedPets ?? []).map(petId))];
    if (player.activePet) player.activePet = petId(player.activePet);
    if (player.pet && /^pet_catacomb_[A-E]$/.test(player.pet.id)) {
        player.pet = { id: CATACOMB_FOX_PET, name: 'Runová liška' };
    }
}

/** One companion keeps the best earned band bonus, without stacking duplicate pets. */
export function getCatacombFoxBonus(player: PlayerState): number {
    return Math.min(4, Math.max(0, ...Object.values(player.catacombPetUpgrades ?? {})));
}

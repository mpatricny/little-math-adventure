import type { PetDefinition, PlayerState } from '../types';

export const CATACOMB_FOX_ENEMY = 'catacomb_creature_A';
export const CATACOMB_FOX_PET = 'pet_catacomb_A';

type FoxProgress = Pick<PlayerState, 'catacombFoxBonus' | 'catacombPetUpgrades'>;

function nonNegativeInteger(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

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
    player.catacombFoxBonus = getCatacombFoxBonus(player);
}

/** Preserve the old effective bonus once; new wins share one uncapped counter. */
export function getCatacombFoxBonus(player: FoxProgress): number {
    if (typeof player.catacombFoxBonus === 'number') {
        return nonNegativeInteger(player.catacombFoxBonus);
    }
    return Math.min(4, Math.max(0, ...Object.values(player.catacombPetUpgrades ?? {}).map(nonNegativeInteger)));
}

/** Called once for every passed catacomb trial, including repeats and the first rescue. */
export function awardCatacombFoxUpgrade(player: FoxProgress): number {
    player.catacombFoxBonus = getCatacombFoxBonus(player) + 1;
    return player.catacombFoxBonus;
}

/** Resolve a catalog pet's actual base attack for its owner, without mutating shared data. */
export function getPetAttackPower(pet: Pick<PetDefinition, 'id' | 'damageMultiplier'>, player: FoxProgress): number {
    return (pet.damageMultiplier ?? 1) + (pet.id === CATACOMB_FOX_PET ? getCatacombFoxBonus(player) : 0);
}

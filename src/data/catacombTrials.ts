import { BandId } from '../types';

/**
 * Maps each band to its catacomb creature and pet.
 * Every band trains the same rune fox; difficulty comes from its exam configuration.
 */
export const CATACOMB_BANDS: Record<BandId, {
    enemyId: string;
    backgroundKey: string;
    petId: string;
}> = {
    'A': { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' },
    'B': { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' },
    'C': { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' },
    'D': { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' },
    'E': { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' },
};

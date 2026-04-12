import { BandId } from '../types';

/**
 * Maps each band to its catacomb creature and pet.
 * All bands use wolf placeholder sprites initially — swap art by updating these entries
 * and adding corresponding entries to enemies.json / pets.json / textures.json.
 */
export const CATACOMB_BANDS: Record<BandId, {
    enemyId: string;
    backgroundKey: string;
    petId: string;
}> = {
    'A': { enemyId: 'catacomb_creature_A', backgroundKey: 'mastery-battle-bg', petId: 'pet_catacomb_A' },
    'B': { enemyId: 'catacomb_creature_B', backgroundKey: 'mastery-battle-bg', petId: 'pet_catacomb_B' },
    'C': { enemyId: 'catacomb_creature_C', backgroundKey: 'mastery-battle-bg', petId: 'pet_catacomb_C' },
    'D': { enemyId: 'catacomb_creature_D', backgroundKey: 'mastery-battle-bg', petId: 'pet_catacomb_D' },
    'E': { enemyId: 'catacomb_creature_E', backgroundKey: 'mastery-battle-bg', petId: 'pet_catacomb_E' },
};

import { BandId } from '../types';

/**
 * Maps each band to its catacomb creature and pet.
 * Every band trains the same rune fox; difficulty comes from its exam configuration.
 */
const chamber = { enemyId: 'catacomb_creature_A', backgroundKey: 'catacomb-rune-chamber', petId: 'pet_catacomb_A' };

export const CATACOMB_BANDS: Record<BandId, typeof chamber> = {
    A: chamber, B: chamber, C: chamber, D: chamber, E: chamber, F: chamber, G: chamber, H: chamber,
};

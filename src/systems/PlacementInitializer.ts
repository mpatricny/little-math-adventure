import {
    BandId, SubAtomId, SubAtomNumber,
    ALL_BANDS, ALL_SUB_ATOM_NUMBERS,
} from '../types';
import { GameStateManager } from './GameStateManager';
import { MasterySystem } from './MasterySystem';

/**
 * PlacementInitializer: Pure logic module for band selection and drop-down.
 * No Phaser dependency — operates on GameStateManager data directly.
 *
 * Used in two contexts:
 * 1. Initial band selection (after character creation)
 * 2. Struggle drop-down (when child picks too high)
 */
export class PlacementInitializer {

    /**
     * Apply the player's chosen starting band.
     * Marks all bands below targetBand as 'secure' with bronze medals,
     * awards HP for skipped exams, and sets targetBand to training.
     *
     * CRITICAL: Must be called AFTER gameState.reset() which creates fresh
     * player + mathStats. getMasteryData() lazily creates default mastery data.
     */
    static applyBandSelection(targetBand: BandId, gameState: GameStateManager): void {
        const data = gameState.getMasteryData();
        const player = gameState.getPlayer();

        for (const band of ALL_BANDS) {
            if (band === targetBand) break; // stop before target

            // Mark band as passed (secure with bronze gate exam)
            data.bands[band].state = 'secure';
            data.bands[band].gateExamBestMedal = 'bronze';

            // Mark all 4 sub-atoms as passed
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                data.subAtoms[id].state = 'secure';
                data.subAtoms[id].examBestMedal = 'bronze';
                data.subAtoms[id].successfulSolves = 20;
            }

            // Band selection sets math content only — no stat rewards
            // (player should start with base HP/attack regardless of starting band)
        }

        // Set target band to training
        if (targetBand !== 'A') {
            data.bands[targetBand].state = 'training';
            data.subAtoms[`${targetBand}1` as SubAtomId].state = 'training';
        }

        // Store which band was selected (for struggle detection reference)
        data.selectedStartBand = targetBand;

        gameState.save();

        // Force singleton re-init so MasterySystem re-reads updated data
        MasterySystem.destroyInstance();
    }

    /**
     * Drop player down one full band when struggling.
     * Locks current band and all higher bands, sets previous band to training.
     * Preserves problemRecords, retryPool, slowPool, and player HP/stats.
     */
    static dropOneBand(currentBand: BandId, gameState: GameStateManager): void {
        const currentIndex = ALL_BANDS.indexOf(currentBand);
        if (currentIndex <= 0) return; // Can't drop below A

        const prevBand = ALL_BANDS[currentIndex - 1];
        const data = gameState.getMasteryData();

        // Lock current band and all higher bands
        for (let i = currentIndex; i < ALL_BANDS.length; i++) {
            const band = ALL_BANDS[i];
            data.bands[band].state = 'locked';
            data.bands[band].gateExamBestMedal = null;
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                data.subAtoms[id].state = 'locked';
                data.subAtoms[id].successfulSolves = 0;
                data.subAtoms[id].examBestMedal = null;
                data.subAtoms[id].fluencyChallengeResult = null;
                data.subAtoms[id].masteryChallengeResult = null;
            }
        }

        // Set previous band to training (fresh start)
        data.bands[prevBand].state = 'training';
        data.bands[prevBand].gateExamBestMedal = null;
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${prevBand}${num}` as SubAtomId;
            data.subAtoms[id].state = (num as SubAtomNumber) === 1 ? 'training' : 'locked';
            data.subAtoms[id].successfulSolves = 0;
            data.subAtoms[id].examBestMedal = null;
        }

        // PRESERVE: problemRecords (child's solve history stays)
        // PRESERVE: retryPool, slowPool (still relevant)
        // PRESERVE: player HP/stats (no stat reduction - kinder for children)

        // Lower the placement floor only if it would otherwise undo this drop.
        // Earlier bands earned through play must remain earned, not become placement credit.
        if (data.selectedStartBand && ALL_BANDS.indexOf(data.selectedStartBand) >= currentIndex) {
            data.selectedStartBand = prevBand;
        }
        data.lastStruggleOfferFight = data.fightCount;

        // Clear pools since they contain problems from higher band
        data.currentPool = [];
        data.currentPoolIndex = 0;

        gameState.save();

        // Force singleton re-init so MasterySystem re-reads updated data
        MasterySystem.destroyInstance();
    }
}

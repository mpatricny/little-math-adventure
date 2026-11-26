import type { PracticeTargetId } from '../../types';
import type { FoxJourneyProgress, FoxRuneTier } from '../../types/foxAbilities';

/** Persisted family runes from before children could assign their own upgrades. */
export function legacyFoxJourney(tiers: Partial<Record<PracticeTargetId, FoxRuneTier>>): FoxJourneyProgress {
    const awards: FoxJourneyProgress['awards'] = {};
    for (const target of Object.keys(tiers) as PracticeTargetId[]) {
        awards[target] = { I: { evidenceId: target + '-I', earnedAt: 1 } };
        if (tiers[target] === 2) awards[target].II = { evidenceId: target + '-II', earnedAt: 2 };
    }
    return { version: 1, awards };
}

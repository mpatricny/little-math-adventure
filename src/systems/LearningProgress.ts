import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, MasteryData, SubAtomId } from '../types';

/** Add the three post-E bands to legacy slots and read-only inspection copies. */
export function ensureAdvancedLearningBands(data: MasteryData): void {
    for (const band of ['F', 'G', 'H'] as const) {
        data.bands[band] ??= { id: band, state: 'locked', gateExamBestMedal: null, bandMasteryChallengeResult: null };
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id: SubAtomId = `${band}${num}`;
            data.subAtoms[id] ??= { id, state: 'locked', successfulSolves: 0, examBestMedal: null,
                fluencyChallengeResult: null, masteryChallengeResult: null, fightsSinceSeen: 0 };
        }
    }
    const previous = data.bands.E;
    if (previous?.gateExamBestMedal && previous.gateExamBestMedal !== 'none'
        && ['secure', 'fluent', 'mastery'].includes(previous.state)
        && data.bands.F.state === 'locked' && !getRequiredLearningBand(data)) {
        data.bands.F.state = 'training';
        data.subAtoms.F1.state = 'training';
        data.currentPool = [];
        data.currentPoolIndex = 0;
        data.lastPoolProblems = [];
    }
}

/** Placement credit opens content but does not grant combat levels. */
export function getLearningLevel(data: MasteryData): number {
    const earned = Object.values(data.subAtoms).filter(a => ['secure', 'fluent', 'mastery'].includes(a.state)).length
        + Object.values(data.bands).filter(b => ['secure', 'fluent', 'mastery'].includes(b.state)).length;
    const placement = Math.max(0, ALL_BANDS.indexOf(data.selectedStartBand ?? 'A')) * 5;
    return Math.max(1, 1 + earned - placement);
}

/** An explicit repair may prioritize an unfinished band without resetting later achievements. */
export function getRequiredLearningBand(data: MasteryData): BandId | undefined {
    const band = data.requiredBand;
    if (!band || !ALL_BANDS.includes(band) || data.bands[band]?.state !== 'training') return undefined;
    if (data.selectedStartBand && ALL_BANDS.indexOf(band) < ALL_BANDS.indexOf(data.selectedStartBand)) return undefined;
    return band;
}

export function isLearningBandDeferred(data: MasteryData, band: BandId): boolean {
    const required = getRequiredLearningBand(data);
    return required !== undefined && ALL_BANDS.indexOf(band) > ALL_BANDS.indexOf(required);
}

/** Operates on a fresh save copy; never changes an earned state, answer, medal or counter. */
export function requireIncompleteLearningBand(data: MasteryData, band: BandId): boolean {
    if (!ALL_BANDS.includes(band) || !data.bands[band] || data.bands[band].state === 'locked'
        || (data.selectedStartBand && ALL_BANDS.indexOf(band) < ALL_BANDS.indexOf(data.selectedStartBand))) {
        throw new Error('The required band must already be open and at or above the original placement.');
    }
    if (data.bands[band].state !== 'training') return false;
    if (data.requiredBand && data.requiredBand !== band) throw new Error('A different required band is already set.');
    data.requiredBand = band;
    // These are unanswered scheduling caches, not evidence of learning.
    data.currentPool = [];
    data.currentPoolIndex = 0;
    data.lastPoolProblems = [];
    return true;
}

/** Learning difficulty is independent of combat level and of the other co-op player. */
export function getLearningBand(data: MasteryData): BandId {
    const required = getRequiredLearningBand(data);
    if (required) return required;
    // Finishing the last module must not send a player back to band A.
    return [...ALL_BANDS].reverse().find(band => {
        const state = data.bands[band]?.state;
        return state !== undefined && state !== 'locked';
    }) ?? 'A';
}

/** Recover a placement floor lost by older co-op saves without erasing history. */
export function restoreLearningPlacement(data: MasteryData): void {
    const start = data.selectedStartBand;
    if (!start || start === 'A' || !data.bands[start]) return;
    const targetIndex = ALL_BANDS.indexOf(start);
    if (targetIndex < 0) return;
    for (const band of ALL_BANDS.slice(0, targetIndex)) {
        if (['locked', 'training'].includes(data.bands[band].state)) data.bands[band].state = 'secure';
        data.bands[band].gateExamBestMedal ??= 'bronze';
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const atom = data.subAtoms[`${band}${num}` as SubAtomId];
            if (atom.state === 'training' || atom.state === 'locked') atom.state = 'secure';
            atom.examBestMedal ??= 'bronze';
        }
    }
    if (data.bands[start].state === 'locked') {
        data.bands[start].state = 'training';
        data.subAtoms[`${start}1` as SubAtomId].state = 'training';
        data.currentPool = [];
        data.currentPoolIndex = 0;
    }
}

export function getLearningFrontier(data: MasteryData): SubAtomId {
    const band = getLearningBand(data);
    const ids = ALL_SUB_ATOM_NUMBERS.map(num => `${band}${num}` as SubAtomId);
    // While learning the comparison symbols, arithmetic practice stays with A1/A2.
    const available = ids.filter(id => data.subAtoms[id]?.state !== 'locked'
        && data.subAtoms[id] !== undefined
        && !(band === 'A' && Number(id[1]) > 2 && data.comparisonChapter?.status !== 'complete'));
    return available.find(id => data.subAtoms[id].state === 'training')
        ?? available.find(id => data.subAtoms[id].state !== 'mastery')
        ?? available[available.length - 1]
        ?? `${band}1` as SubAtomId;
}

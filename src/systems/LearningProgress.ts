import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, BandId, MasteryData, SubAtomId } from '../types';

/** Learning difficulty is independent of combat level and of the other co-op player. */
export function getLearningBand(data: MasteryData): BandId {
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

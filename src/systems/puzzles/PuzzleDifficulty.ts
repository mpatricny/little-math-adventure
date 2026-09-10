import type { BandId, MasteryData } from '../../types';
import type { PuzzleProfile } from '../../types/puzzles';
import { BAND_RANGES, crossesTen } from '../MathSkillRules';
const bands: BandId[] = ['A', 'B', 'C', 'D', 'E'];
export function bandProfile(band: BandId, tier: 1 | 2 | 3 = 2): PuzzleProfile {
    return { band, max: BAND_RANGES[band].maxResult, subtraction: true, crossing: band === 'E', tier };
}
export function masteryPuzzleProfile(data: MasteryData, tier: 1 | 2 | 3 = 1): PuzzleProfile {
    const unlocked = bands.filter(b => data.bands[b]?.state !== 'locked');
    const band = [...unlocked].reverse().find(b => data.bands[b]?.state === 'training')
        ?? [...unlocked].reverse().find(b => data.bands[b]?.state !== 'mastery') ?? unlocked.at(-1) ?? 'A';
    const subtraction = unlocked.some(b => ['2', '3', '4'].some(n => {
        const state = data.subAtoms[`${b}${n}` as keyof typeof data.subAtoms]?.state;
        return state !== undefined && state !== 'locked';
    }));
    return { ...bandProfile(band, tier), subtraction };
}
export function sharedPuzzleProfile(profiles: PuzzleProfile[]): PuzzleProfile {
    if (!profiles.length) throw new Error('Puzzle requires a learner profile');
    const lowest = [...profiles].sort((a, b) => bands.indexOf(a.band) - bands.indexOf(b.band))[0];
    return { ...lowest, subtraction: profiles.every(p => p.subtraction), crossing: profiles.every(p => p.crossing),
        tier: Math.min(...profiles.map(p => p.tier)) as 1 | 2 | 3 };
}
export function allowsStep(p: PuzzleProfile, start: number, change: number): boolean {
    const end = start + change;
    return Number.isInteger(start) && Number.isInteger(change) && start >= 0 && end >= 0 && start <= p.max && end <= p.max
        && Math.abs(change) <= p.max && (change >= 0 || p.subtraction) && (p.crossing || !crossesTen(start, end));
}

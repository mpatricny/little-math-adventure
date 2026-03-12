import { MathStats, MasteryData, BandId, SubAtomId, ALL_BANDS, ALL_SUB_ATOM_NUMBERS } from '../types';

/**
 * Migrate existing level-based saves to the mastery system.
 * Maps old player level + problemStats to band/sub-atom progress.
 */
export class MasteryMigration {

    /**
     * Migrate old level-based progress into mastery data.
     * Called when loading a save that has no masteryData but has player level > 1.
     */
    static migrateFromLevel(playerLevel: number, mathStats: MathStats): MasteryData {
        const data = this.createFreshMasteryData();

        // Map old level to band/sub-atom progress
        // Level 1-2  → Band A Secure (addition mastered)
        // Level 3-4  → Band B partially (subtraction starting)
        // Level 5-6  → Band C partially
        // Level 7-8  → Band C further along
        // Level 9-10 → Band D starting

        if (playerLevel >= 2) {
            // Band A at least Training, A1 Secure
            data.bands.A.state = 'training';
            data.subAtoms.A1.state = 'secure';
            data.subAtoms.A1.successfulSolves = 20;
            data.subAtoms.A1.examBestMedal = 'bronze';
            data.subAtoms.A2.state = 'training';
        }

        if (playerLevel >= 3) {
            data.subAtoms.A2.state = 'secure';
            data.subAtoms.A2.successfulSolves = 20;
            data.subAtoms.A2.examBestMedal = 'bronze';
            data.subAtoms.A3.state = 'training';
        }

        if (playerLevel >= 4) {
            data.subAtoms.A3.state = 'secure';
            data.subAtoms.A3.successfulSolves = 20;
            data.subAtoms.A3.examBestMedal = 'bronze';
            data.subAtoms.A4.state = 'training';
        }

        if (playerLevel >= 5) {
            data.subAtoms.A4.state = 'secure';
            data.subAtoms.A4.successfulSolves = 20;
            data.subAtoms.A4.examBestMedal = 'bronze';
            // Band A complete → Secure
            data.bands.A.state = 'secure';
            data.bands.A.gateExamBestMedal = 'bronze';
            // Band B unlocks
            data.bands.B.state = 'training';
            data.subAtoms.B1.state = 'training';
        }

        if (playerLevel >= 6) {
            data.subAtoms.B1.state = 'secure';
            data.subAtoms.B1.successfulSolves = 20;
            data.subAtoms.B1.examBestMedal = 'bronze';
            data.subAtoms.B2.state = 'training';
        }

        if (playerLevel >= 7) {
            data.subAtoms.B2.state = 'secure';
            data.subAtoms.B2.successfulSolves = 20;
            data.subAtoms.B2.examBestMedal = 'bronze';
            data.subAtoms.B3.state = 'training';
        }

        if (playerLevel >= 8) {
            data.subAtoms.B3.state = 'secure';
            data.subAtoms.B3.successfulSolves = 20;
            data.subAtoms.B3.examBestMedal = 'bronze';
            data.subAtoms.B4.state = 'training';
        }

        if (playerLevel >= 9) {
            data.subAtoms.B4.state = 'secure';
            data.subAtoms.B4.successfulSolves = 20;
            data.subAtoms.B4.examBestMedal = 'bronze';
            data.bands.B.state = 'secure';
            data.bands.B.gateExamBestMedal = 'bronze';
            // Band C unlocks
            data.bands.C.state = 'training';
            data.subAtoms.C1.state = 'training';
        }

        if (playerLevel >= 10) {
            data.subAtoms.C1.state = 'secure';
            data.subAtoms.C1.successfulSolves = 20;
            data.subAtoms.C1.examBestMedal = 'bronze';
            data.subAtoms.C2.state = 'training';
        }

        // Import existing problemStats into mastery problemRecords
        if (mathStats.problemStats) {
            this.importProblemStats(data, mathStats);
        }

        return data;
    }

    /** Import old problemStats into mastery problem records */
    private static importProblemStats(data: MasteryData, mathStats: MathStats): void {
        for (const [id, stats] of Object.entries(mathStats.problemStats)) {
            // Parse old problem ID format: "add_3_5", "sub_7_2", "three_3_2_1"
            const parsed = this.parseOldProblemId(id);
            if (!parsed) continue;

            const { subAtomId, key, form } = parsed;

            if (!data.problemRecords[key]) {
                data.problemRecords[key] = {
                    problemKey: key,
                    subAtomId,
                    form,
                    attempts: [],
                };
            }

            // Create synthetic attempts from old stats
            const record = data.problemRecords[key];
            for (let i = 0; i < stats.correctCount; i++) {
                record.attempts.push({
                    timestamp: stats.lastAttempt - (stats.correctCount - i) * 60000,
                    correct: true,
                    responseTimeMs: 5000, // Default, we don't have historical RT
                    context: 'battle',
                    sequenceIndex: data.globalSolveSequence++,
                });
            }
            for (let i = 0; i < stats.wrongCount; i++) {
                record.attempts.push({
                    timestamp: stats.lastAttempt - (stats.wrongCount - i) * 60000,
                    correct: false,
                    responseTimeMs: 10000,
                    context: 'battle',
                    sequenceIndex: data.globalSolveSequence++,
                });
            }
        }
    }

    /** Parse old problem ID (e.g., "add_3_5") into mastery problem info */
    private static parseOldProblemId(id: string): { subAtomId: SubAtomId; key: string; form: 'result_unknown' | 'missing_part' } | null {
        const parts = id.split('_');

        if (parts[0] === 'add' && parts.length === 3) {
            const a = parseInt(parts[1]);
            const b = parseInt(parts[2]);
            const answer = a + b;
            const band = this.getBandForValues(a, b, answer, '+');
            if (!band) return null;
            const subAtomId = `${band}1` as SubAtomId; // Addition → sub-atom 1
            return { subAtomId, key: `${subAtomId}:${a}+${b}:result_unknown`, form: 'result_unknown' };
        }

        if (parts[0] === 'sub' && parts.length === 3) {
            const a = parseInt(parts[1]);
            const b = parseInt(parts[2]);
            const answer = a - b;
            const band = this.getBandForValues(a, b, answer, '-');
            if (!band) return null;
            const subAtomId = `${band}2` as SubAtomId; // Subtraction → sub-atom 2
            return { subAtomId, key: `${subAtomId}:${a}-${b}:result_unknown`, form: 'result_unknown' };
        }

        if (parts[0] === 'three' && parts.length === 4) {
            const a = parseInt(parts[1]);
            const b = parseInt(parts[2]);
            const maxVal = Math.max(a, b, parseInt(parts[3]));
            const band: BandId = maxVal <= 5 ? 'A' : maxVal <= 8 ? 'B' : maxVal <= 10 ? 'C' : 'D';
            const subAtomId = `${band}3` as SubAtomId; // Three-operand → sub-atom 3
            return { subAtomId, key: `${subAtomId}:${a}+${b}+${parts[3]}:result_unknown`, form: 'result_unknown' };
        }

        if (parts[0] === 'missing' && parts.length === 4) {
            const op = parts[1]; // 'add' or 'sub'
            const a = parseInt(parts[2]);
            const missing = parseInt(parts[3]);
            const band: BandId = Math.max(a, missing) <= 5 ? 'A' : Math.max(a, missing) <= 8 ? 'B' : 'C';
            const subAtomNum = op === 'add' ? 1 : 2;
            const subAtomId = `${band}${subAtomNum}` as SubAtomId;
            const opChar = op === 'add' ? '+' : '-';
            return { subAtomId, key: `${subAtomId}:${a}${opChar}?=${missing}:missing_part`, form: 'missing_part' };
        }

        return null;
    }

    /** Determine which band a problem belongs to based on values */
    private static getBandForValues(a: number, b: number, answer: number, op: '+' | '-'): BandId | null {
        const maxVal = Math.max(a, b, answer);

        if (maxVal <= 5) return 'A';
        if (maxVal <= 8) return 'B';
        if (maxVal <= 10) return 'C';
        if (maxVal <= 20) {
            // Check crossing 10
            if (op === '+' && a < 10 && answer > 10) return 'E';
            if (op === '-' && a > 10 && answer < 10) return 'E';
            return 'D';
        }
        return null;
    }

    /** Create fresh mastery data (same as GameStateManager) */
    private static createFreshMasteryData(): MasteryData {
        const bands = {} as MasteryData['bands'];
        const subAtoms = {} as MasteryData['subAtoms'];

        for (const band of ALL_BANDS) {
            bands[band] = {
                id: band,
                state: band === 'A' ? 'training' : 'locked',
                gateExamBestMedal: null,
                bandMasteryChallengeResult: null,
            };
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                subAtoms[id] = {
                    id,
                    state: (band === 'A' && num === 1) ? 'training' : 'locked',
                    successfulSolves: 0,
                    examBestMedal: null,
                    fluencyChallengeResult: null,
                    masteryChallengeResult: null,
                    fightsSinceSeen: 0,
                };
            }
        }

        return {
            bands, subAtoms, problemRecords: {},
            globalSolveSequence: 0, fightCount: 0,
            retryPool: [], slowPool: [],
            currentPool: [], currentPoolIndex: 0, lastPoolProblems: [],
        };
    }
}

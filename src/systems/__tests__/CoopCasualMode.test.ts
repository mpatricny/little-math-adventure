import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ALL_BANDS,
    ALL_SUB_ATOM_NUMBERS,
    BandId,
    EnemyDefinition,
    MasteryData,
    MathStats,
    ProblemForm,
    SubAtomId,
} from '../../types';

let CoopSessionManager: typeof import('../CoopSessionManager').CoopSessionManager;
let GameStateManager: typeof import('../GameStateManager').GameStateManager;
let MasterySystem: typeof import('../MasterySystem').MasterySystem;
let MathEngine: typeof import('../MathEngine').MathEngine;
let ProblemDatabase: typeof import('../ProblemDatabase').ProblemDatabase;
let ManaPlayerLane: typeof import('../../ui/ManaPlayerLane').ManaPlayerLane;

let uuidCounter = 0;
vi.mock('phaser', () => ({
    default: {
        Math: {
            Between: (min: number) => min,
        },
        Utils: {
            String: {
                UUID: () => `test-uuid-${++uuidCounter}`,
            },
        },
    },
}));

class MemoryStorage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

function resetSingletons(): void {
    MasterySystem?.destroyInstance();
    CoopSessionManager?.destroyInstance();
    if (GameStateManager) {
        (GameStateManager as any).instance = undefined;
    }
}

function createMasteryData(): MasteryData {
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
            const subAtomId = `${band}${num}` as SubAtomId;
            subAtoms[subAtomId] = {
                id: subAtomId,
                state: band === 'A' && num === 1 ? 'training' : 'locked',
                successfulSolves: 0,
                examBestMedal: null,
                fluencyChallengeResult: null,
                masteryChallengeResult: null,
                fightsSinceSeen: 0,
            };
        }
    }

    return {
        bands,
        subAtoms,
        problemRecords: {},
        globalSolveSequence: 0,
        fightCount: 0,
        retryPool: [],
        slowPool: [],
        currentPool: [],
        currentPoolIndex: 0,
        lastPoolProblems: [],
        lastStruggleOfferFight: 0,
        coopAutoPromotionBases: {},
    };
}

function addAttempts(
    data: MasteryData,
    subAtomId: SubAtomId,
    form: ProblemForm,
    attempts: Array<{ correct: boolean; rt: number }>,
): void {
    const problemKey = ProblemDatabase.getInstance().getProblemsForForm(subAtomId, form)[0]?.key;
    if (!problemKey) {
        throw new Error(`Missing problem for ${subAtomId} ${form}`);
    }
    data.problemRecords[problemKey] ??= {
        problemKey,
        subAtomId,
        form,
        attempts: [],
    };

    for (const { correct, rt } of attempts) {
        data.globalSolveSequence += 1;
        data.problemRecords[problemKey].attempts.push({
            timestamp: data.globalSolveSequence,
            correct,
            responseTimeMs: rt,
            context: 'battle',
            sequenceIndex: data.globalSolveSequence,
        });
        if (correct) {
            data.subAtoms[subAtomId].successfulSolves += 1;
        }
    }
}

function setCurrentBand(data: MasteryData, band: BandId, frontierNum: 1 | 2 | 3 | 4): void {
    const bandIndex = ALL_BANDS.indexOf(band);

    for (let i = 0; i < ALL_BANDS.length; i++) {
        const currentBand = ALL_BANDS[i];
        data.bands[currentBand].state = i < bandIndex ? 'secure' : (currentBand === band ? 'training' : 'locked');
        data.bands[currentBand].gateExamBestMedal = i < bandIndex ? 'bronze' : null;
        data.bands[currentBand].bandMasteryChallengeResult = null;

        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const subAtomId = `${currentBand}${num}` as SubAtomId;
            const subAtom = data.subAtoms[subAtomId];

            if (i < bandIndex) {
                subAtom.state = 'secure';
                subAtom.successfulSolves = 20;
                subAtom.examBestMedal = 'bronze';
            } else if (currentBand === band) {
                if (num < frontierNum) {
                    subAtom.state = 'secure';
                    subAtom.successfulSolves = 20;
                    subAtom.examBestMedal = 'silver';
                } else if (num === frontierNum) {
                    subAtom.state = 'training';
                    subAtom.successfulSolves = 6;
                    subAtom.examBestMedal = null;
                } else {
                    subAtom.state = 'locked';
                    subAtom.successfulSolves = 0;
                    subAtom.examBestMedal = null;
                }
            } else {
                subAtom.state = 'locked';
                subAtom.successfulSolves = 0;
                subAtom.examBestMedal = null;
            }

            subAtom.fluencyChallengeResult = null;
            subAtom.masteryChallengeResult = null;
            subAtom.fightsSinceSeen = 0;
        }
    }
}

function createMathStats(masteryData?: MasteryData): MathStats {
    return {
        totalAttempts: 0,
        correctAnswers: 0,
        recentResults: [],
        currentDifficulty: 1,
        highestDifficulty: 1,
        problemStats: {},
        currentPool: [],
        poolCycle: 0,
        dailyAttempts: 0,
        lastAttemptDate: '',
        masteryData,
    };
}

function createRegistryStub(initial: Record<string, unknown> = {}): { get: (key: string) => unknown; set: (key: string, value: unknown) => void } {
    const values = new Map<string, unknown>(Object.entries(initial));
    return {
        get: (key: string) => values.get(key),
        set: (key: string, value: unknown) => {
            values.set(key, value);
        },
    };
}

function hasZero(problem: { operand1?: number; operand2?: number; operand3?: number; operand4?: number; answer?: number }): boolean {
    return [problem.operand1, problem.operand2, problem.operand3, problem.operand4, problem.answer]
        .some(value => value === 0);
}

function isCrossingTen(problem: { operand1: number; operand2: number; operator: string; answer: number }): boolean {
    if (problem.operator === '+') {
        return problem.operand1 < 10 && problem.operand2 > 0 && problem.answer > 10 && problem.answer <= 20;
    }

    return problem.operator === '-'
        && problem.operand1 > 10
        && problem.operand2 > 0
        && problem.answer < 10
        && problem.answer >= 0;
}

describe('CoopSessionManager casual progression', () => {
    beforeEach(async () => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: new MemoryStorage(),
            configurable: true,
        });
        Object.defineProperty(globalThis, 'navigator', {
            value: { userAgent: 'vitest', maxTouchPoints: 0 },
            configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
            value: globalThis,
            configurable: true,
        });
        Object.defineProperty(globalThis, 'document', {
            value: { documentElement: {} },
            configurable: true,
        });
        ({ CoopSessionManager } = await import('../CoopSessionManager'));
        ({ GameStateManager } = await import('../GameStateManager'));
        ({ MasterySystem } = await import('../MasterySystem'));
        ({ MathEngine } = await import('../MathEngine'));
        ({ ProblemDatabase } = await import('../ProblemDatabase'));
        ({ ManaPlayerLane } = await import('../../ui/ManaPlayerLane'));
        resetSingletons();
    });

    afterEach(() => {
        resetSingletons();
    });

    it('starts at one shared attack, grows every two wins, and caps at five', () => {
        const coop = CoopSessionManager.getInstance() as any;
        coop._isActive = true;
        coop.resetCasualProgress();

        expect(coop.getSharedAttackCount()).toBe(1);
        expect(coop.getSharedVictories()).toBe(0);

        expect(coop.recordCoopVictory()).toMatchObject({ leveledUp: false, sharedAttackCount: 1, sharedVictories: 1 });
        expect(coop.recordCoopVictory()).toMatchObject({ leveledUp: true, sharedAttackCount: 2, sharedVictories: 2 });
        expect(coop.recordCoopVictory()).toMatchObject({ leveledUp: false, sharedAttackCount: 2, sharedVictories: 3 });
        expect(coop.recordCoopVictory()).toMatchObject({ leveledUp: true, sharedAttackCount: 3, sharedVictories: 4 });

        for (let i = 0; i < 6; i++) {
            coop.recordCoopVictory();
        }

        expect(coop.getSharedAttackCount()).toBe(5);
        expect(coop.getSharedVictories()).toBe(10);

        coop.resetCasualProgress();
        expect(coop.getSharedAttackCount()).toBe(1);
        expect(coop.getSharedVictories()).toBe(0);
    });

    it('restores the original co-op enemy scaling: extra regular enemy, boss HP hike', () => {
        const coop = CoopSessionManager.getInstance() as any;
        coop._isActive = true;

        const baseEnemy: EnemyDefinition = {
            id: 'slime_green',
            name: 'Slime',
            hp: 5,
            attack: 2,
            defense: 0,
            xp: 1,
            goldReward: [1, 2],
            spriteKey: 'slime-sheet',
        };

        const regularDefs = coop.getCoopEnemyDefs([baseEnemy], false);
        expect(regularDefs).toHaveLength(2);
        expect(regularDefs[0].hp).toBe(5);
        expect(regularDefs[1].hp).toBe(5);

        const bossDefs = coop.getCoopEnemyDefs([baseEnemy], true);
        expect(bossDefs).toHaveLength(1);
        expect(bossDefs[0].hp).toBe(7);
    });

    it('creates independent session mastery tracks that restart at sub-atom 1 of each player band', () => {
        const gameState = GameStateManager.getInstance();

        gameState.reset('girl_knight', 'PlayerA', 0);
        const slotAMastery = createMasteryData();
        setCurrentBand(slotAMastery, 'E', 3);
        gameState.getMathStats().masteryData = slotAMastery;
        gameState.save();

        gameState.reset('girl_knight', 'PlayerB', 1);
        const slotBMastery = createMasteryData();
        setCurrentBand(slotBMastery, 'A', 2);
        gameState.getMathStats().masteryData = slotBMastery;
        gameState.save();

        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);

        const masterySystem = MasterySystem.getInstance();
        const coopMasteryA = coop.getPlayerAMasteryData();
        const coopMasteryB = coop.getPlayerBMasteryData();

        expect(coopMasteryA).not.toBeNull();
        expect(coopMasteryB).not.toBeNull();
        expect(coopMasteryA).not.toBe(coopMasteryB);

        masterySystem.setActiveData(coopMasteryA);
        expect(masterySystem.getCurrentBand()).toBe('E');
        expect(masterySystem.getFrontierSubAtom()).toBe('E1');

        masterySystem.setActiveData(coopMasteryB);
        expect(masterySystem.getCurrentBand()).toBe('A');
        expect(masterySystem.getFrontierSubAtom()).toBe('A1');

        masterySystem.setActiveData(null);
        expect(gameState.getMasteryData().subAtoms.E3.state).toBe('training');
        expect(gameState.getMasteryData().subAtoms.E1.state).toBe('secure');
    });

    it('builds each mana lane pool from that player frontier sub-atom using result-unknown problems', () => {
        const masteryA = createMasteryData();
        const masteryB = createMasteryData();
        setCurrentBand(masteryA, 'E', 3);
        setCurrentBand(masteryB, 'A', 1);

        const engineA = new MathEngine(createRegistryStub({ playerLevel: 5 }) as any, {
            fixedLevel: 5,
            initialStats: createMathStats(masteryA),
            autoPersist: false,
        });
        const engineB = new MathEngine(createRegistryStub({ playerLevel: 2 }) as any, {
            fixedLevel: 2,
            initialStats: createMathStats(masteryB),
            autoPersist: false,
        });

        const poolA = ManaPlayerLane.buildManaPool(engineA, masteryA);
        const poolB = ManaPlayerLane.buildManaPool(engineB, masteryB);

        expect(poolA).toHaveLength(20);
        expect(poolB).toHaveLength(20);
        expect(poolA.every(problem => problem.masteryKey?.startsWith('E3:') && problem.masteryKey.endsWith(':result_unknown'))).toBe(true);
        expect(poolB.every(problem => problem.masteryKey?.startsWith('A1:') && problem.masteryKey.endsWith(':result_unknown'))).toBe(true);
        expect(poolA.every(problem => !hasZero(problem))).toBe(true);
        expect(poolB.every(problem => !hasZero(problem))).toBe(true);
    });

    it('filters zero-containing mana problems and keeps E1 pools on crossing-10 calculations', () => {
        const mastery = createMasteryData();
        setCurrentBand(mastery, 'E', 1);

        const engine = new MathEngine(createRegistryStub({ playerLevel: 5 }) as any, {
            fixedLevel: 5,
            initialStats: createMathStats(mastery),
            autoPersist: false,
        });

        const pool = ManaPlayerLane.buildManaPool(engine, mastery);

        expect(pool).toHaveLength(20);
        expect(pool.every(problem => problem.masteryKey?.startsWith('E1:') && problem.masteryKey.endsWith(':result_unknown'))).toBe(true);
        expect(pool.every(problem => !hasZero(problem))).toBe(true);
        expect(pool.every(problem => isCrossingTen(problem))).toBe(true);
    });
});

describe('MasterySystem co-op auto-promotion', () => {
    beforeEach(async () => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: new MemoryStorage(),
            configurable: true,
        });
        Object.defineProperty(globalThis, 'navigator', {
            value: { userAgent: 'vitest', maxTouchPoints: 0 },
            configurable: true,
        });
        Object.defineProperty(globalThis, 'window', {
            value: globalThis,
            configurable: true,
        });
        Object.defineProperty(globalThis, 'document', {
            value: { documentElement: {} },
            configurable: true,
        });
        ({ CoopSessionManager } = await import('../CoopSessionManager'));
        ({ GameStateManager } = await import('../GameStateManager'));
        ({ MasterySystem } = await import('../MasterySystem'));
        ({ ProblemDatabase } = await import('../ProblemDatabase'));
        resetSingletons();
    });

    afterEach(() => {
        const masterySystem = MasterySystem.getInstance();
        masterySystem.setActiveData(null);
        resetSingletons();
    });

    it('captures a baseline first and then auto-awards silver for sub-atom promotions after the extra buffer', () => {
        const masterySystem = MasterySystem.getInstance();
        const data = createMasteryData();
        masterySystem.setActiveData(data);

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 4000 })));
        addAttempts(data, 'A1', 'missing_part', Array.from({ length: 10 }, () => ({ correct: true, rt: 4200 })));

        const firstPass = masterySystem.applyCoopAutoPromotions();
        expect(firstPass).toEqual([]);
        expect(data.coopAutoPromotionBases['sub_atom:A1']).toBe(20);

        addAttempts(data, 'A1', 'result_unknown', [
            { correct: true, rt: 8000 },
            { correct: true, rt: 9000 },
            { correct: true, rt: 10000 },
            { correct: true, rt: 9000 },
            { correct: false, rt: 11000 },
        ]);
        addAttempts(data, 'A1', 'missing_part', [
            { correct: true, rt: 7000 },
            { correct: true, rt: 8000 },
            { correct: true, rt: 9000 },
            { correct: false, rt: 10000 },
            { correct: true, rt: 11000 },
        ]);

        const secondPass = masterySystem.applyCoopAutoPromotions();
        expect(secondPass).toContainEqual({ type: 'sub_atom', targetId: 'A1' });
        expect(data.subAtoms.A1.state).toBe('secure');
        expect(data.subAtoms.A1.examBestMedal).toBe('silver');
        expect(data.coopAutoPromotionBases['sub_atom:A1']).toBeUndefined();

        const player = GameStateManager.getInstance().getPlayer();
        expect(player.maxHp).toBe(11);
        expect(player.attack).toBe(2);
    });

    it('auto-awards band gate silver after a full band-scoped buffer', () => {
        const masterySystem = MasterySystem.getInstance();
        const data = createMasteryData();
        masterySystem.setActiveData(data);

        data.bands.A.state = 'training';
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            data.subAtoms[`A${num}` as SubAtomId].state = 'secure';
            data.subAtoms[`A${num}` as SubAtomId].successfulSolves = 30;
        }

        expect(masterySystem.applyCoopAutoPromotions()).toEqual([]);
        expect(data.coopAutoPromotionBases['band_gate:A']).toBe(0);

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 13 }, () => ({ correct: true, rt: 9000 })));
        addAttempts(data, 'A2', 'missing_part', Array.from({ length: 3 }, () => ({ correct: false, rt: 10000 })));

        const promotions = masterySystem.applyCoopAutoPromotions();
        expect(promotions).toContainEqual({ type: 'band_gate', targetId: 'A' });
        expect(data.bands.A.state).toBe('secure');
        expect(data.bands.A.gateExamBestMedal).toBe('silver');
    });

    it('requires the challenge buffer median RT to stay at or below 15000ms', () => {
        const masterySystem = MasterySystem.getInstance();
        const data = createMasteryData();
        masterySystem.setActiveData(data);

        data.subAtoms.A1.state = 'secure';
        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 15 }, () => ({ correct: true, rt: 5000 })));
        addAttempts(data, 'A1', 'missing_part', Array.from({ length: 15 }, () => ({ correct: true, rt: 5200 })));

        expect(masterySystem.applyCoopAutoPromotions()).toEqual([]);
        expect(data.coopAutoPromotionBases['fluency_challenge:A1']).toBe(30);

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 16000 })));
        addAttempts(data, 'A1', 'missing_part', [
            { correct: true, rt: 16000 },
            { correct: true, rt: 16000 },
        ]);

        expect(masterySystem.applyCoopAutoPromotions()).toEqual([]);
        expect(data.subAtoms.A1.state).toBe('secure');

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 12000 })));
        addAttempts(data, 'A1', 'missing_part', [
            { correct: true, rt: 12000 },
            { correct: true, rt: 12000 },
        ]);

        const promotions = masterySystem.applyCoopAutoPromotions();
        expect(promotions).toContainEqual({ type: 'fluency_challenge', targetId: 'A1' });
        expect(data.subAtoms.A1.state).toBe('fluent');
        expect(data.subAtoms.A1.fluencyChallengeResult).toBe('pass');
    });

    it('can advance co-op promotions in session-only mode without changing player stats', () => {
        const masterySystem = MasterySystem.getInstance();
        const data = createMasteryData();
        masterySystem.setActiveData(data);

        const player = GameStateManager.getInstance().getPlayer();
        const baseMaxHp = player.maxHp;
        const baseAttack = player.attack;

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 4000 })));
        addAttempts(data, 'A1', 'missing_part', Array.from({ length: 10 }, () => ({ correct: true, rt: 4200 })));
        expect(masterySystem.applyCoopAutoPromotions(true)).toEqual([]);

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 5 }, () => ({ correct: true, rt: 8000 })));
        addAttempts(data, 'A1', 'missing_part', Array.from({ length: 5 }, () => ({ correct: true, rt: 9000 })));

        const promotions = masterySystem.applyCoopAutoPromotions(true);
        expect(promotions).toContainEqual({ type: 'sub_atom', targetId: 'A1' });
        expect(data.subAtoms.A1.state).toBe('secure');
        expect(data.subAtoms.A1.examBestMedal).toBe('silver');
        expect(player.maxHp).toBe(baseMaxHp);
        expect(player.attack).toBe(baseAttack);
    });
});

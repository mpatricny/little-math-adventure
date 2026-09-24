import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyComparisonExamResult, createInitialComparisonChapterState, generateComparisonTrainingProblems, recordComparisonAttempt } from '../ComparisonLearningSystem';
import { getLearningBand, getLearningFrontier, requireIncompleteLearningBand } from '../LearningProgress';
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

function completeComparisonLesson(data: MasteryData): void {
    const chapter = data.comparisonChapter = createInitialComparisonChapterState('training');
    for (let stage = 0; stage < 6; stage++) {
        for (const problem of generateComparisonTrainingProblems(chapter, stage === 3 || stage === 5 ? 9 : 6)) {
            recordComparisonAttempt(chapter, problem, true, 3000, false, chapter.attempts.length + 1);
        }
    }
    expect(chapter.status).toBe('exam_ready');
    applyComparisonExamResult(chapter, 'bronze');
}

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
        return problem.operand1 < 10 && problem.operand2 > 0 && problem.operand2 < 10 && problem.answer > 10 && problem.answer <= 20;
    }

    return problem.operator === '-'
        && problem.operand1 > 10
        && problem.operand2 > 0
        && problem.operand2 < 10
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

    it('migrates each hero weapon contribution once across co-op swaps', () => {
        const game = GameStateManager.getInstance();
        for (const [slot, sword, bonus] of [[0, 'sword_iron', 2], [1, 'sword_reinforced', 3]] as const) {
            game.reset('girl_knight', `Player${slot}`, slot);
            const player = game.getPlayer();
            player.attack = 2 + slot + bonus;
            player.equippedWeapon = sword;
            delete player.attackPowerVersion;
            game.save();
        }
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        for (let turn = 0; turn < 3; turn++) {
            coop.activatePlayerA();
            expect(game.getPlayer()).toMatchObject({ attack: 2, equippedWeapon: 'sword_iron', attackPowerVersion: 1 });
            coop.activatePlayerB();
            expect(game.getPlayer()).toMatchObject({ attack: 3, equippedWeapon: 'sword_reinforced', attackPowerVersion: 1 });
        }
        expect(coop.getSharedAttackCount()).toBe(1);
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

    it('creates independent co-op tracks from each player\'s real frontier', () => {
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
        expect(masterySystem.getFrontierSubAtom()).toBe('E3');

        masterySystem.setActiveData(coopMasteryB);
        expect(masterySystem.getCurrentBand()).toBe('A');
        expect(masterySystem.getFrontierSubAtom()).toBe('A2');

        masterySystem.setActiveData(null);
        expect(gameState.getMasteryData().subAtoms.E3.state).toBe('training');
        expect(gameState.getMasteryData().subAtoms.E1.state).toBe('secure');
    });

    it('persists co-op promotions and derived levels to the correct save slots', () => {
        const gameState = GameStateManager.getInstance();

        gameState.reset('girl_knight', 'PlayerA', 0);
        gameState.getMathStats().masteryData = createMasteryData();
        gameState.save();

        gameState.reset('girl_knight', 'PlayerB', 1);
        gameState.getMathStats().masteryData = createMasteryData();
        gameState.save();

        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);

        const masteryA = coop.getPlayerAMasteryData()!;
        addAttempts(masteryA, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 4000 })));
        addAttempts(masteryA, 'A1', 'missing_part', Array.from({ length: 10 }, () => ({ correct: true, rt: 4200 })));
        expect(coop.applyAndPersistMasteryProgress()).toEqual([]);

        addAttempts(masteryA, 'A1', 'result_unknown', Array.from({ length: 5 }, () => ({ correct: true, rt: 8000 })));
        addAttempts(masteryA, 'A1', 'missing_part', Array.from({ length: 5 }, () => ({ correct: true, rt: 9000 })));
        expect(coop.applyAndPersistMasteryProgress()).toContainEqual({
            player: 'A',
            type: 'sub_atom',
            targetId: 'A1',
        });

        expect(gameState.loadSlot(0)).toBe(true);
        expect(gameState.getMasteryData().subAtoms.A1.state).toBe('secure');
        expect(gameState.getPlayer().level).toBe(2);

        expect(gameState.loadSlot(1)).toBe(true);
        expect(gameState.getMasteryData().subAtoms.A1.state).toBe('training');
        expect(gameState.getPlayer().level).toBe(1);
    });

    it('keeps attack, defense and pet counters on the active profile across hotseat swaps', async () => {
        const gameState = GameStateManager.getInstance();
        gameState.reset('girl_knight', 'PlayerA', 0);
        gameState.save();
        gameState.reset('girl_knight', 'PlayerB', 1);
        gameState.save();
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        // Let loadSlot's asynchronous level refresh finish, as it does before gameplay.
        await new Promise(resolve => setTimeout(resolve, 0));
        const engine = new MathEngine(createRegistryStub({ playerLevel: 1 }) as any);
        engine.recordResultForProblem('attack-a', true);
        coop.activatePlayerB();
        engine.recordResultForProblem('attack-b', true);
        coop.activatePlayerA();
        engine.recordResultForProblem('block-a', false);
        coop.activatePlayerB();
        engine.recordResultForProblem('pet-b', true);
        coop.endSession();

        gameState.loadSlot(0);
        expect(gameState.getMathStats()).toMatchObject({ totalAttempts: 2, dailyAttempts: 2, correctAnswers: 1 });
        expect(Object.keys(gameState.getMathStats().problemStats)).toEqual(['attack-a', 'block-a']);
        gameState.loadSlot(1);
        expect(gameState.getMathStats()).toMatchObject({ totalAttempts: 2, dailyAttempts: 2, correctAnswers: 2 });
        expect(Object.keys(gameState.getMathStats().problemStats)).toEqual(['attack-b', 'pet-b']);
    });

    it('rebinds a cached math engine before refilling a different co-op player pool', async () => {
        const gameState = GameStateManager.getInstance();
        gameState.reset('girl_knight', 'PlayerA', 0);
        const dataA = gameState.getMasteryData();
        setCurrentBand(dataA, 'D', 2);
        dataA.selectedStartBand = 'D';
        gameState.getMathStats().totalAttempts = 85;
        gameState.save();
        gameState.reset('girl_knight', 'PlayerB', 1);
        gameState.getMasteryData().selectedStartBand = 'A';
        gameState.getMathStats().totalAttempts = 30;
        gameState.save();
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        const engine = new MathEngine(createRegistryStub({ playerLevel: 2 }) as any);
        gameState.getMathStats().currentPool = [];
        coop.activatePlayerB();
        const statsB = gameState.getMathStats();
        engine.initializeLevelPool();
        expect(gameState.getMathStats()).toBe(statsB);
        expect(statsB.totalAttempts).toBe(30);
        expect(statsB.masteryData!.selectedStartBand).toBe('A');
        coop.endSession();
        gameState.loadSlot(0);
        expect(gameState.getMathStats().totalAttempts).toBe(85);
        expect(gameState.getMasteryData().selectedStartBand).toBe('D');
        gameState.loadSlot(1);
        expect(gameState.getMathStats().totalAttempts).toBe(30);
        expect(gameState.getMasteryData().selectedStartBand).toBe('A');
    });

    it('discards a stale engine flush after the same slot has been rehydrated', () => {
        const gameState = GameStateManager.getInstance();
        gameState.reset('girl_knight', 'PlayerA', 0);
        const engine = new MathEngine(createRegistryStub({ playerLevel: 2 }) as any);
        const stale = gameState.getMathStats();
        gameState.save();
        gameState.loadSlot(0);
        const live = gameState.getMathStats();
        live.totalAttempts = 123;
        expect(live).not.toBe(stale);
        (engine as any).saveStats();
        expect(gameState.getMathStats()).toBe(live);
        gameState.save();
        gameState.loadSlot(0);
        expect(gameState.getMathStats().totalAttempts).toBe(123);
    });

    it('checkpoints both players learning before battle completion without mixing their daily history', async () => {
        const { SaveSystem } = await import('../SaveSystem');
        const { DailyProgressSystem } = await import('../DailyProgressSystem');
        const gameState = GameStateManager.getInstance();
        gameState.reset('girl_knight', 'PlayerA', 0);
        gameState.save();
        gameState.reset('girl_knight', 'PlayerB', 1);
        gameState.save();
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        const mastery = MasterySystem.getInstance();
        const key = ProblemDatabase.getInstance().getProblemsForForm('A1', 'result_unknown')[0].key;
        for (const player of ['A', 'B'] as const) {
            if (player === 'A') coop.activatePlayerA();
            else coop.activatePlayerB();
            mastery.setActiveData(player === 'A' ? coop.getPlayerAMasteryData() : coop.getPlayerBMasteryData());
            mastery.recordSolve(key, player === 'A', 2000, 'battle');
            coop.persistActiveMasteryProgress();
            expect(coop.getActivePlayer()).toBe(player);
        }
        for (const slot of [0, 1]) {
            const saved = SaveSystem.load(slot)!;
            expect(saved.mathStats.masteryData!.globalSolveSequence).toBe(1);
            expect(saved.mathStats.masteryData!.subAtoms.A1.successfulSolves).toBe(slot === 0 ? 1 : 0);
            expect(DailyProgressSystem.getRecentDays(saved.player, saved.mathStats, 1)[0])
                .toMatchObject({ attempts: 1, correct: slot === 0 ? 1 : 0, wrong: slot === 0 ? 0 : 1 });
        }
    });

    it('unlocks the saved exam from real co-op answers and preserves it after a restart', async () => {
        const { SUB_ATOM_EXAM_REQUIREMENTS } = await import('../ExamProgress');
        const gameState = GameStateManager.getInstance();
        gameState.reset('girl_knight', 'PlayerA', 0);
        gameState.save();
        gameState.reset('girl_knight', 'PlayerB', 1);
        gameState.save();
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        const mastery = MasterySystem.getInstance();
        const keys = ['result_unknown', 'missing_part'].map(form =>
            ProblemDatabase.getInstance().getProblemsForForm('A1', form as ProblemForm)[0].key);
        for (const player of ['A', 'B'] as const) {
            if (player === 'B') coop.activatePlayerB();
            mastery.setActiveData(player === 'A' ? coop.getPlayerAMasteryData() : coop.getPlayerBMasteryData());
            for (let i = 0; i < SUB_ATOM_EXAM_REQUIREMENTS.successfulSolves; i++) {
                mastery.recordSolve(keys[i % keys.length], true, 2000, 'battle');
            }
            coop.persistActiveMasteryProgress();
        }
        coop.endSession();
        for (const slot of [0, 1]) {
            gameState.loadSlot(slot);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(MasterySystem.getInstance().checkExamEligibility('A1')).toBe(true);
            expect(gameState.getMasteryData().subAtoms.A1.successfulSolves)
                .toBe(SUB_ATOM_EXAM_REQUIREMENTS.successfulSolves);
        }
    });

    it('keeps each mana lane pool on simple two-operand addition or subtraction', () => {
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
        expect(poolA.every(problem => /^E[12]:/.test(problem.masteryKey ?? '') && problem.masteryKey?.endsWith(':result_unknown'))).toBe(true);
        expect(poolB.every(problem => problem.masteryKey?.startsWith('A1:') && problem.masteryKey.endsWith(':result_unknown'))).toBe(true);
        expect([...poolA, ...poolB].every(problem =>
            (problem.operator === '+' || problem.operator === '-')
            && problem.operator2 === undefined
            && problem.operator3 === undefined
            && problem.operand3 === undefined
            && problem.operand4 === undefined
        )).toBe(true);
        expect(poolA.every(problem => !hasZero(problem))).toBe(true);
        expect(poolB.every(problem => !hasZero(problem))).toBe(true);
    });

    it('keeps completed E learning and old retry queues away from A in combat and mana', () => {
        const data = createMasteryData();
        setCurrentBand(data, 'E', 4);
        for (const band of ALL_BANDS) {
            data.bands[band].state = 'mastery';
            for (const num of ALL_SUB_ATOM_NUMBERS) data.subAtoms[`${band}${num}` as SubAtomId].state = 'mastery';
        }
        const easy = ProblemDatabase.getInstance().getProblemsForForm('A2', 'result_unknown')[1].key;
        data.currentPool = [easy]; data.retryPool = [easy]; data.slowPool = [easy];
        const system = MasterySystem.getInstance();
        system.setActiveData(data);
        expect(system.getCurrentBand()).toBe('E');
        expect(system.getFrontierSubAtom()).toBe('E4');
        expect(system.drawFromPool(20).every(key => key.startsWith('E'))).toBe(true);
        expect(system.drawFromReviewPool(2).every(key => key.startsWith('E'))).toBe(true);
        expect(system.drawFromMasterPool(2).every(key => key.startsWith('E'))).toBe(true);
        const engine = new MathEngine(createRegistryStub({ playerLevel: 2 }) as any, {
            fixedLevel: 2, initialStats: createMathStats(data), autoPersist: false,
        });
        const mana = ManaPlayerLane.buildManaPool(engine, data);
        expect(mana).toHaveLength(20);
        expect(mana.every(problem => problem.masteryKey?.startsWith('E') && isCrossingTen(problem))).toBe(true);
    });

    function pausedLaterBand(): MasteryData {
        const data = createMasteryData();
        setCurrentBand(data, 'D', 3);
        data.selectedStartBand = 'D';
        data.subAtoms.D1.state = 'fluent';
        data.subAtoms.D2.state = 'fluent';
        data.bands.E.state = 'training';
        Object.assign(data.subAtoms.E1, { state: 'fluent', successfulSolves: 52, examBestMedal: 'gold' });
        Object.assign(data.subAtoms.E2, { state: 'training', successfulSolves: 9 });
        return data;
    }

    it('prioritizes unfinished D without resetting any earned D/E evidence', () => {
        const data = pausedLaterBand();
        addAttempts(data, 'E1', 'result_unknown', [{ correct: true, rt: 3456 }]);
        const before = structuredClone(data);
        expect(requireIncompleteLearningBand(data, 'D')).toBe(true);
        expect(getLearningBand(data)).toBe('D');
        expect(getLearningFrontier(data)).toBe('D3');
        expect(data).toEqual({ ...before, requiredBand: 'D', currentPool: [], currentPoolIndex: 0, lastPoolProblems: [] });
        expect(requireIncompleteLearningBand(data, 'D')).toBe(true);
    });

    it('pauses E queues and fight counters while D drives combat, mana and shop preparation', () => {
        const data = pausedLaterBand(); requireIncompleteLearningBand(data, 'D');
        const db = ProblemDatabase.getInstance();
        const retryE = db.getProblemsForForm('E2', 'result_unknown')[1].key;
        const slowE = db.getProblemsForForm('E1', 'result_unknown')[1].key;
        const retryD = db.getProblemsForForm('D3', 'result_unknown')[1].key;
        data.retryPool = [retryE, retryD]; data.slowPool = [slowE];
        data.currentPool = [retryE];
        const system = MasterySystem.getInstance(); system.setActiveData(data);
        const e1 = structuredClone(data.subAtoms.E1), e2 = structuredClone(data.subAtoms.E2);
        expect(system.drawFromPool(25).every(key => key.startsWith('D'))).toBe(true);
        expect(data.retryPool).toEqual([retryE, retryD]); expect(data.slowPool).toEqual([slowE]);
        expect(system.drawPreparationProblems(5)).toContain(retryD);
        expect(system.drawPreparationProblems(5).every(key => key.startsWith('D'))).toBe(true);
        system.recordFightEnd();
        expect(data.subAtoms.E1).toEqual(e1); expect(data.subAtoms.E2).toEqual(e2);
        const engine = new MathEngine(createRegistryStub({ playerLevel: 5 }) as any, {
            fixedLevel: 5, initialStats: createMathStats(data), autoPersist: false,
        });
        const mana = ManaPlayerLane.buildManaPool(engine, data);
        expect(mana).toHaveLength(20);
        expect(mana.every(problem => problem.masteryKey?.startsWith('D'))).toBe(true);
    });

    it('completes D3, D4 and the D gate, then resumes the saved E frontier and retries', () => {
        const data = pausedLaterBand(); requireIncompleteLearningBand(data, 'D');
        const retryE = ProblemDatabase.getInstance().getProblemsForForm('E2', 'result_unknown')[1].key;
        data.retryPool = [retryE];
        const later = [structuredClone(data.bands.E), ...ALL_SUB_ATOM_NUMBERS.map(n => structuredClone(data.subAtoms[`E${n}` as SubAtomId]))];
        const system = MasterySystem.getInstance(); system.setActiveData(data);
        expect(system.getBandGateEligibility('D')).toBe(false);
        system.applyExamResult('D3', 6, 'silver', true);
        expect(system.getFrontierSubAtom()).toBe('D4');
        system.applyExamResult('D4', 6, 'silver', true);
        expect(system.getBandGateEligibility('D')).toBe(true);
        system.applyBandGateResult('D', 0, 'none', true);
        expect(data.requiredBand).toBe('D'); expect(system.getCurrentBand()).toBe('D');
        system.applyBandGateResult('D', 8, 'bronze', true);
        expect(data.requiredBand).toBeUndefined();
        expect(system.getCurrentBand()).toBe('E'); expect(system.getFrontierSubAtom()).toBe('E2');
        expect(system.drawFromPool(1)).toEqual([retryE]);
        expect([data.bands.E, ...ALL_SUB_ATOM_NUMBERS.map(n => data.subAtoms[`E${n}` as SubAtomId])]).toEqual(later);
    });

    it('blocks paused E exams and co-op promotions without deleting their checkpoints', () => {
        const data = pausedLaterBand(); requireIncompleteLearningBand(data, 'D');
        for (const form of ['result_unknown', 'missing_part'] as const) {
            addAttempts(data, 'E2', form, Array.from({ length: 12 }, () => ({ correct: true, rt: 2000 })));
        }
        data.coopAutoPromotionBases['sub_atom:E2'] = 0;
        const system = MasterySystem.getInstance(); system.setActiveData(data);
        expect(system.checkExamEligibility('E2')).toBe(false);
        expect(system.checkMasteryChallengeEligibility('E1')).toBe(false);
        expect(system.getAvailableExams().every(exam => !exam.targetId.startsWith('E'))).toBe(true);
        expect(system.applyCoopAutoPromotions(true).every(exam => !exam.targetId.startsWith('E'))).toBe(true);
        expect(data.coopAutoPromotionBases['sub_atom:E2']).toBe(0);
        const before = structuredClone(data);
        expect(() => system.applyExamResult('E2', 8, 'gold', true)).toThrow(/required learning band/);
        expect(() => system.applyBandGateResult('E', 10, 'gold', true)).toThrow(/required learning band/);
        expect(() => system.applyFluencyResult('E1', 10, true)).toThrow(/required learning band/);
        expect(() => system.applyMasteryResult('E1', 10, true)).toThrow(/required learning band/);
        expect(() => system.applyBandMasteryResult('E', 14, true)).toThrow(/required learning band/);
        expect(data).toEqual(before);
    });

    it('persists the required band through reload and keeps it isolated between co-op tracks', () => {
        const game = GameStateManager.getInstance(); game.reset('girl_knight', 'Return QA', 0);
        const data = pausedLaterBand(); requireIncompleteLearningBand(data, 'D');
        game.getMathStats().masteryData = data; game.getMathStats().totalAttempts = 555;
        game.getPlayer().attack = 5; game.save(); game.loadSlot(0);
        expect(game.getMasteryData().requiredBand).toBe('D');
        expect(game.getMathStats().totalAttempts).toBe(555); expect(game.getPlayer().attack).toBe(5);
        expect(game.getMasteryData().subAtoms.E1).toEqual(data.subAtoms.E1);
        const other = createMasteryData(); setCurrentBand(other, 'E', 1);
        const system = MasterySystem.getInstance();
        for (const [track, band] of [[data, 'D'], [other, 'E'], [data, 'D']] as const) {
            system.setActiveData(track); expect(system.getCurrentBand()).toBe(band);
            expect(system.drawFromPool(10).every(key => key.startsWith(band))).toBe(true);
        }
        expect(other.requiredBand).toBeUndefined();
        system.setActiveData(null); expect(system.getCurrentBand()).toBe('D');
    });

    it('does not reopen completed D or apply an invalid required band below placement', () => {
        const data = pausedLaterBand(); data.bands.D.state = 'secure';
        const before = structuredClone(data);
        expect(requireIncompleteLearningBand(data, 'D')).toBe(false); expect(data).toEqual(before);
        expect(getLearningBand(data)).toBe('E');
        data.requiredBand = 'D'; expect(getLearningBand(data)).toBe('E');
        data.requiredBand = 'invalid' as BandId; expect(getLearningBand(data)).toBe('E');
        expect(() => requireIncompleteLearningBand(data, 'C')).toThrow(/placement/);
    });

    it('restores skipped placement bands on load without changing combat or later learning progress', () => {
        const game = GameStateManager.getInstance();
        game.reset('girl_knight', 'Placement regression', 0);
        const data = createMasteryData();
        setCurrentBand(data, 'E', 2);
        data.selectedStartBand = 'E';
        data.bands.A.state = 'training'; data.subAtoms.A1.state = 'training';
        data.bands.C.state = 'locked'; data.subAtoms.C2.state = 'locked';
        game.getMathStats().masteryData = data;
        game.getPlayer().attack = 5;
        game.getPlayer().equippedWeapon = 'sword_wooden';
        game.getMathStats().totalAttempts = 324;
        game.save(); game.loadSlot(0);
        const restored = game.getMasteryData();
        expect(restored.bands.A.state).toBe('secure');
        expect(restored.subAtoms.C2.state).toBe('secure');
        expect(restored.subAtoms.E2).toEqual(data.subAtoms.E2);
        expect(game.getPlayer().attack).toBe(5);
        expect(game.getMathStats().totalAttempts).toBe(324);
        expect(game.getPlayer().equippedWeapon).toBe('sword_wooden');
    });

    it('offers the new comparison lesson to an A-band learner with old A3/A4 progress', () => {
        const data = createMasteryData(); setCurrentBand(data, 'A', 4);
        data.subAtoms.A2.state = 'fluent'; data.subAtoms.A3.state = 'fluent';
        const system = MasterySystem.getInstance(); system.setActiveData(data);
        expect(system.shouldTrainComparisonChapter()).toBe(true);
        expect(system.generateComparisonTrainingProblems(1)[0].comparisonMeta?.stage).toBe('size_crocodile');
        expect(system.drawFromPool(20).every(key => /^A[12]:/.test(key) && !key.includes('compare'))).toBe(true);
        expect(data.subAtoms.A3.state).toBe('fluent');
        expect(system.checkMasteryChallengeEligibility('A3')).toBe(false);
        data.subAtoms.A4.state = 'secure';
        expect(system.getBandGateEligibility('A')).toBe(false);
        const chapter = system.getComparisonChapterState();
        const problem = system.generateComparisonTrainingProblems(1)[0];
        system.recordComparisonSolve(problem, true, 2000, false);
        expect(system.getComparisonChapterState()).toBe(chapter);
        expect(chapter.attempts).toHaveLength(1);
    });

    it.each([['A', 'A'], ['E', 'D']] as const)('preserves an intentional drop with original placement %s', async (start, expected) => {
        const { PlacementInitializer } = await import('../PlacementInitializer');
        const game = GameStateManager.getInstance();
        game.reset('girl_knight', 'Placement drop QA', 0);
        const data = createMasteryData(); setCurrentBand(data, 'E', 2);
        data.selectedStartBand = start;
        game.getMathStats().masteryData = data;
        PlacementInitializer.dropOneBand('E', game);
        game.loadSlot(0);
        expect(game.getMasteryData().selectedStartBand).toBe(expected);
        expect(game.getMasteryData().bands.D.state).toBe('training');
        expect(game.getMasteryData().bands.E.state).toBe('locked');
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

    it('unlocks the real comparison exam, then chapter fluency and mastery challenges', () => {
        const data = createMasteryData();
        data.subAtoms.A2.state = 'fluent';
        const system = MasterySystem.getInstance();
        system.setActiveData(data);
        expect(system.getComparisonExamProgress()?.percentage).toBe(0);
        for (const count of [6, 6, 6, 9, 6, 9]) {
            const problems = system.generateComparisonBattleProblems(count)!;
            expect(problems).toHaveLength(count);
            for (const problem of problems) system.recordComparisonSolve(problem, true, 1000, false);
        }
        expect(system.getComparisonExamProgress()?.percentage).toBe(100);
        expect(system.getAvailableExams()).toContainEqual({ type: 'comparison_chapter', targetId: 'comparison_symbols', label: 'Zkouška porovnávání' });
        for (const problem of system.generateComparisonExamProblems()) system.recordComparisonSolve(problem, true, 1000, false);
        system.applyComparisonExamResult(8, undefined, true);
        expect(system.generateComparisonBattleProblems(1)).toBeNull();
        expect(system.checkComparisonChallengeEligibility('fluency_challenge')).toBe(true);
        expect(system.checkComparisonChallengeEligibility('mastery_challenge')).toBe(false);
        const challenge = system.generateComparisonExamProblems(10);
        expect(challenge).toHaveLength(10);
        expect(new Set(challenge.map(p => p.comparisonMeta!.representation)).size).toBe(4);
        expect(challenge.every(p => p.comparisonMeta!.exam && !p.comparisonMeta!.showCrocodile)).toBe(true);
        const failed = system.applyFluencyResult('comparison_symbols', 0, true);
        expect(failed.passed).toBe(false);
        expect(system.checkComparisonChallengeEligibility('fluency_challenge')).toBe(true);
        expect(system.applyFluencyResult('comparison_symbols', 10, true).stateChanged).toBe(true);
        expect(system.checkComparisonChallengeEligibility('mastery_challenge')).toBe(true);
        expect(system.applyMasteryResult('comparison_symbols', 10, true).stateChanged).toBe(true);
        system.applyMasteryResult('comparison_symbols', 0, true);
        expect(data.comparisonChapter!.masteryChallengeResult).toBe('pass');
        expect(system.checkComparisonChallengeEligibility('mastery_challenge')).toBe(false);
    });

    it('buffers chapter challenges independently in co-op and counts later mixed comparison practice', () => {
        const data = createMasteryData();
        data.subAtoms.A2.state = 'secure';
        completeComparisonLesson(data);
        data.globalSolveSequence = data.comparisonChapter!.attempts.length;
        const system = MasterySystem.getInstance();
        system.setActiveData(data);
        expect(system.applyCoopAutoPromotions(true)).toEqual([]);
        const key = ProblemDatabase.getInstance().getProblemsForForm('A2', 'compare_equation_vs_number')[0].key;
        for (let i = 0; i < 10; i++) system.recordSolve(key, true, 1000, 'battle_pet');
        expect(system.applyCoopAutoPromotions(true)).toContainEqual({ type: 'fluency_challenge', targetId: 'comparison_symbols' });
        const other = createMasteryData();
        system.setActiveData(other);
        expect(system.getComparisonChapterState().fluencyChallengeResult).not.toBe('pass');
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
        completeComparisonLesson(data);
        masterySystem.setActiveData(data);

        data.bands.A.state = 'training';
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            data.subAtoms[`A${num}` as SubAtomId].state = 'secure';
            data.subAtoms[`A${num}` as SubAtomId].successfulSolves = 30;
        }

        expect(masterySystem.applyCoopAutoPromotions()).toEqual([]);
        expect(data.coopAutoPromotionBases['band_gate:A']).toBe(0);

        addAttempts(data, 'A1', 'result_unknown', Array.from({ length: 10 }, () => ({ correct: true, rt: 9000 })));
        addAttempts(data, 'A2', 'missing_part', Array.from({ length: 2 }, () => ({ correct: false, rt: 10000 })));

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

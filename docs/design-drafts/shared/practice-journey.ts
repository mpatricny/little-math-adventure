/** Review-only session. No save system, storage, network writes, or live profiles. */
import { MasteryMigration } from '../../../src/systems/MasteryMigration';
import { getCatacombReadiness, getPracticeTargetState, type CatacombChallenge } from '../../../src/systems/PracticeProgress';
import { PersonalBattleBonuses, type PracticeImprovementReward } from '../../../src/systems/PersonalBattleBonuses';
import { awardCatacombFoxVictory, CATACOMB_FOX_ENEMY, CATACOMB_FOX_PET, getPetAttackPower } from '../../../src/systems/CatacombPetProgress';
import { getExamPresentation } from '../../../src/ui/ExamPresentation';
import pets from '../../../public/assets/data/pets.json';
import type { MasteryData, MathStats, MathProblem, PlayerState, PracticeTargetId, ProblemForm, SubAtomId } from '../../../src/types';

export type Owner = 'A' | 'B';
export type View = 'catacombs' | 'before-battle' | 'victory' | 'pet' | 'pythia';
export type LockReason = 'exam' | 'speed' | 'evidence' | 'open' | 'complete';
export interface Route { view: View; owner: Owner; targetId: PracticeTargetId; returnTo?: View }
type SessionEvent = { type: 'change' } | { type: 'route'; route: Route };
type FoxOwner = Pick<PlayerState, 'unlockedPets' | 'ownedPets' | 'catacombFoxBonus' | 'catacombPetUpgrades'>;
interface Profile { mastery: MasteryData; pet: FoxOwner; targetId: PracticeTargetId; mode: 'practice' | 'progress' }
const fox = pets.find(p => p.id === CATACOMB_FOX_PET)!;
export const REVIEW_TARGETS: PracticeTargetId[] = ['B1', 'B2', 'comparison_symbols'];

/** The same current runtime predicate supplies both the speed bar and the door. */
export function projectJourney(data: MasteryData, pet: FoxOwner, owner: Owner, targetId: PracticeTargetId) {
    const state = getPracticeTargetState(data, targetId);
    const challenge: CatacombChallenge = state === 'fluent' || state === 'mastery' ? 'mastery_challenge' : 'fluency_challenge';
    const readiness = getCatacombReadiness(data, targetId, challenge);
    const lockReason: LockReason = state === 'mastery' ? 'complete' : readiness.ready ? 'open'
        : !readiness.prerequisiteMet ? 'exam' : !readiness.speed.met ? 'speed' : 'evidence';
    const status = pet.ownedPets.includes(CATACOMB_FOX_PET) ? 'owned' : pet.unlockedPets.includes(CATACOMB_FOX_ENEMY) ? 'at_pythia' : 'locked';
    return { owner, targetId, title: getExamPresentation(targetId).title, state, challenge,
        speed: readiness.speed, readiness, lockReason,
        fox: { status, attack: getPetAttackPower(fox, pet), baseAttack: fox.damageMultiplier },
        // Two existing trials, not arbitrary filled runes or a second percentage.
        trials: [
            { id: 'fluency_challenge', complete: state === 'fluent' || state === 'mastery' },
            { id: 'mastery_challenge', complete: state === 'mastery' },
        ],
    };
}
export type Journey = ReturnType<typeof projectJourney>;
export interface BattleResult {
    id: number; owner: Owner; targetId: PracticeTargetId; mode: 'practice' | 'progress'; coins: number;
    reward: PracticeImprovementReward; before: Journey; after: Journey;
}
export interface TrialResult {
    id: number; owner: Owner; targetId: PracticeTargetId; challenge: CatacombChallenge;
    kind: 'rescue' | 'upgrade'; attackBefore: number; attackAfter: number; after: Journey;
}

function append(data: MasteryData, target: PracticeTargetId, count: number, ms: number) {
    for (let i = 0; i < count; i++) {
        const comparison = target === 'comparison_symbols';
        const form: ProblemForm = comparison ? i % 2 ? 'compare_equation_vs_equation' : 'compare_equation_vs_number'
            : i % 2 ? 'missing_part' : 'result_unknown';
        const id: SubAtomId = comparison ? 'A3' : target;
        const key = `${id}:review-${i % 8}:${form}`;
        const record = data.problemRecords[key] ??= { problemKey: key, subAtomId: id, form, attempts: [] };
        const sequenceIndex = ++data.globalSolveSequence;
        record.attempts.push({ correct: true, responseTimeMs: ms, timestamp: 1_795_000_000_000 + sequenceIndex * 15000, sequenceIndex, context: 'battle' });
        data.subAtoms[id].successfulSolves++;
    }
}
function makeProfile(owner: Owner): Profile {
    const mastery = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    mastery.bands.B.state = 'training';
    mastery.subAtoms.B1.state = 'secure';
    mastery.subAtoms.B2.state = 'training';
    mastery.comparisonChapter!.status = 'complete';
    append(mastery, 'B1', 40, owner === 'A' ? 9200 : 11800);
    append(mastery, 'B2', 40, 6700); // Fast enough, but the basic exam is missing.
    append(mastery, 'comparison_symbols', 40, 10500);
    mastery.practice = { mode: 'practice', targetId: 'B1', introductionSeen: true };
    return { mastery, pet: { unlockedPets: [], ownedPets: [], catacombFoxBonus: 0 }, targetId: 'B1', mode: 'practice' };
}

export function createReviewSession() {
    let profiles: Record<Owner, Profile> = { A: makeProfile('A'), B: makeProfile('B') };
    let sequence = 0;
    let battles: Partial<Record<Owner, BattleResult>> = {};
    let trials: Partial<Record<Owner, TrialResult>> = {};
    const listeners = new Set<(event: SessionEvent) => void>();
    const emit = (event: SessionEvent) => listeners.forEach(fn => fn(event));
    const snapshot = (owner: Owner = 'A', targetId = profiles[owner].targetId): Journey =>
        projectJourney(profiles[owner].mastery, profiles[owner].pet, owner, targetId);
    const sync = (p: Profile) => { p.mastery.practice = { mode: p.mode, targetId: p.mode === 'practice' ? p.targetId : undefined, lastTargetId: p.targetId, introductionSeen: true }; };
    return {
        snapshot,
        modules: (owner: Owner = 'A') => REVIEW_TARGETS.map(target => snapshot(owner, target)),
        preference: (owner: Owner = 'A') => ({ mode: profiles[owner].mode, targetId: profiles[owner].targetId }),
        battle: (owner: Owner = 'A') => battles[owner] ?? null,
        trial: (owner: Owner = 'A') => trials[owner] ?? null,
        subscribe(fn: Parameters<typeof listeners.add>[0]) { listeners.add(fn); return () => listeners.delete(fn); },
        route(route: Route) { emit({ type: 'route', route }); },
        chooseTarget(owner: Owner, targetId: PracticeTargetId) {
            if (!REVIEW_TARGETS.includes(targetId)) return false;
            profiles[owner].targetId = targetId; sync(profiles[owner]); emit({ type: 'change' }); return true;
        },
        setMode(owner: Owner, mode: 'practice' | 'progress') { profiles[owner].mode = mode; sync(profiles[owner]); emit({ type: 'change' }); },
        /** Explicit review controls simulate outcomes; rendering never creates a reward. */
        demoBattle(owner: Owner = 'A', faster = true): BattleResult {
            const p = profiles[owner], before = snapshot(owner), bonus = new PersonalBattleBonuses(p.mastery);
            const ms = faster ? (before.speed.value ?? 9200) * .72 : before.speed.value ?? 9200;
            const targetId = p.targetId;
            for (let i = 0; i < 20; i++) {
                // A review summary uses actual per-form reward logic for arithmetic.
                const problem = { masteryKey: `${targetId}:review:${i % 2 ? 'missing_part' : 'result_unknown'}` } as MathProblem;
                if (targetId !== 'comparison_symbols') bonus.answer({ problem, correct: true, responseTimeMs: ms, assisted: false, defense: false });
            }
            append(p.mastery, targetId, 20, ms);
            const result = { id: ++sequence, owner, targetId, mode: p.mode, coins: 12, reward: bonus.summary(true), before, after: snapshot(owner) };
            battles[owner] = result; emit({ type: 'change' }); return result;
        },
        demoExam(owner: Owner = 'A') {
            const p = profiles[owner];
            if (p.targetId !== 'comparison_symbols' && p.mastery.subAtoms[p.targetId].state === 'training') p.mastery.subAtoms[p.targetId].state = 'secure';
            emit({ type: 'change' });
        },
        demoTrial(owner: Owner = 'A'): TrialResult | null {
            const p = profiles[owner], before = snapshot(owner);
            if (!before.readiness.ready || before.state === 'mastery') return null;
            if (p.targetId === 'comparison_symbols') {
                p.mastery.comparisonChapter![before.challenge === 'fluency_challenge' ? 'fluencyChallengeResult' : 'masteryChallengeResult'] = 'pass';
            } else {
                p.mastery.subAtoms[p.targetId].state = before.challenge === 'fluency_challenge' ? 'fluent' : 'mastery';
                p.mastery.subAtoms[p.targetId][before.challenge === 'fluency_challenge' ? 'fluencyChallengeResult' : 'masteryChallengeResult'] = 'pass';
            }
            const award = awardCatacombFoxVictory(p.pet), after = snapshot(owner);
            const result: TrialResult = { id: ++sequence, owner, targetId: p.targetId, challenge: before.challenge,
                kind: award.petUnlocked ? 'rescue' : 'upgrade', attackBefore: before.fox.attack, attackAfter: after.fox.attack, after };
            trials[owner] = result; emit({ type: 'change' }); return result;
        },
        demoBind(owner: Owner = 'A') {
            const p = profiles[owner];
            if (snapshot(owner).fox.status === 'at_pythia') p.pet.ownedPets.push(CATACOMB_FOX_PET);
            emit({ type: 'change' });
        },
        reset() { profiles = { A: makeProfile('A'), B: makeProfile('B') }; battles = {}; trials = {}; sequence = 0; emit({ type: 'change' }); },
    };
}
export type ReviewSession = ReturnType<typeof createReviewSession>;

/** Same-origin embedded previews share one memory instance, including the owner and receipts. */
export function getReviewSession(): ReviewSession {
    const root = (window.top ?? window) as Window & { __practiceJourneyReview?: ReviewSession };
    return root.__practiceJourneyReview ??= createReviewSession();
}

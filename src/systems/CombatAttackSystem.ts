import combatData from '../data/combat.json';

export interface CombatAttackConfig {
    version: number;
    playerAttack: {
        maxProblemsPerTurn: number;
    };
    coopAttack: {
        powerBonusThreshold: number;
    };
}

export interface AttackPowerProblem {
    source?: 'player' | 'pet' | 'sword';
    damageMultiplier?: number;
}

export type AttackPowerMode = 'solo' | 'coop';

export const COMBAT_ATTACK_CONFIG = combatData as CombatAttackConfig;

function normalizeNonNegativeInteger(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

/** Number of base math problems from earned hero power, excluding equipment. */
export function getPlayerAttackProblemCount(attack: number): number {
    return Math.min(
        normalizeNonNegativeInteger(attack),
        COMBAT_ATTACK_CONFIG.playerAttack.maxProblemsPerTurn,
    );
}

/**
 * Evenly compress attack power into the requested number of problems.
 * Earlier problems receive any indivisible remainder.
 */
export function distributeAttackPower(totalPower: number, problemCount: number): number[] {
    const normalizedProblemCount = normalizeNonNegativeInteger(problemCount);
    if (normalizedProblemCount === 0) return [];

    const normalizedPower = Math.max(
        normalizedProblemCount,
        normalizeNonNegativeInteger(totalPower),
    );
    const baseMultiplier = Math.floor(normalizedPower / normalizedProblemCount);
    const remainder = normalizedPower % normalizedProblemCount;

    return Array.from(
        { length: normalizedProblemCount },
        (_, index) => baseMultiplier + (index < remainder ? 1 : 0),
    );
}

/**
 * Preserve the complete attack value while showing at most three problems.
 * Attack power has no damage ceiling; higher values produce higher multipliers.
 */
export function getPlayerAttackDamageMultipliers(
    attack: number,
    problemCount: number = getPlayerAttackProblemCount(attack),
): number[] {
    const normalizedProblemCount = Math.min(
        normalizeNonNegativeInteger(problemCount),
        COMBAT_ATTACK_CONFIG.playerAttack.maxProblemsPerTurn,
    );
    const retainedPower = normalizeNonNegativeInteger(attack);

    return distributeAttackPower(retainedPower, normalizedProblemCount);
}

/** Preserve the existing co-op damage rule until co-op progression is redesigned. */
export function getCoopAttackDamageMultipliers(
    attack: number,
    problemCount: number,
): number[] {
    const normalizedProblemCount = normalizeNonNegativeInteger(problemCount);
    const bonusProblems = Math.min(
        Math.max(
            0,
            normalizeNonNegativeInteger(attack)
                - COMBAT_ATTACK_CONFIG.coopAttack.powerBonusThreshold,
        ),
        normalizedProblemCount,
    );

    return distributeAttackPower(
        normalizedProblemCount + bonusProblems,
        normalizedProblemCount,
    );
}

/**
 * Apply attack power only to base player problems. Equipment problems retain
 * their own independently configured multipliers.
 */
export function applyAttackPowerDistribution(
    problems: AttackPowerProblem[],
    attack: number,
    mode: AttackPowerMode,
): number[] {
    const playerProblems = problems.filter(
        problem => problem.source !== 'sword' && problem.source !== 'pet',
    );
    const multipliers = mode === 'coop'
        ? getCoopAttackDamageMultipliers(attack, playerProblems.length)
        : getPlayerAttackDamageMultipliers(attack, playerProblems.length);

    playerProblems.forEach((problem, index) => {
        problem.damageMultiplier = multipliers[index] ?? 1;
    });

    return multipliers;
}

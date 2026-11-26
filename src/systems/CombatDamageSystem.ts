export interface DamageResolution {
    rawDamage: number;
    defense: number;
    damage: number;
    blockedDamage: number;
}

/** Fox rune strikes are explicit direct damage, independent of ordinary attack defense. */
export function resolveDirectDamage(rawDamage: number): DamageResolution {
    return resolveDamageAfterDefense(Number.isFinite(rawDamage) ? Math.max(0, rawDamage) : 0, 0);
}

/** One order for residual incoming damage: fox protection, then one useful shop rune. */
export function resolveProtectionAfterBlock(
    damageAfterBlock: number, foxShield: number,
    preparation: { charges: number; blockPerCharge: number } | null,
) {
    const nonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
    const incoming = nonNegative(damageAfterBlock);
    const protection = nonNegative(foxShield);
    const foxBlocked = Math.min(incoming, protection);
    const remaining = incoming - foxBlocked;
    const charges = Math.floor(nonNegative(preparation?.charges ?? 0));
    const preparedBlock = charges > 0 ? Math.min(remaining, nonNegative(preparation?.blockPerCharge ?? 0)) : 0;
    return {
        damage: remaining - preparedBlock, foxBlocked, preparedBlock,
        shieldRemaining: protection - foxBlocked,
        preparationCharges: charges - Number(preparedBlock > 0),
    };
}

/**
 * Resolve one complete attack against enemy defense.
 *
 * Defense is subtracted once from the attack's total accumulated damage, not
 * once per problem or hit that contributed to that total.
 */
export function resolveDamageAfterDefense(
    rawDamage: number,
    defense: number,
): DamageResolution {
    const normalizedDamage = Math.max(0, rawDamage);
    const normalizedDefense = Math.max(0, defense);
    const damage = Math.max(0, normalizedDamage - normalizedDefense);

    return {
        rawDamage: normalizedDamage,
        defense: normalizedDefense,
        damage,
        blockedDamage: normalizedDamage - damage,
    };
}

/** Whether a consumable damage bonus changes the actual post-defense damage. */
export function damageBonusWouldHelp(
    rawDamage: number,
    bonusDamage: number,
    defense: number,
): boolean {
    return resolveDamageAfterDefense(rawDamage + Math.max(0, bonusDamage), defense).damage
        > resolveDamageAfterDefense(rawDamage, defense).damage;
}

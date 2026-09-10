export interface DamageResolution {
    rawDamage: number;
    defense: number;
    damage: number;
    blockedDamage: number;
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

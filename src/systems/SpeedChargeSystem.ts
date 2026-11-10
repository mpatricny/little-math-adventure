/** Shared arithmetic for the battle HUD and deterministic combat audit. */
export const SPEED_CHARGE_CAPACITY = 4;

export function accumulateSpeedCharges(currentCharges: number, addedCharges: number) {
    const total = currentCharges + addedCharges;
    return {
        bonusDamage: Math.floor(total / SPEED_CHARGE_CAPACITY),
        newCharges: total % SPEED_CHARGE_CAPACITY,
    };
}

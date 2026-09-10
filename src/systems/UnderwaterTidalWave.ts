import type { BossEncounterDefinition } from '../types/encounters';

export type TidalWaveConfig = NonNullable<BossEncounterDefinition['tidalWave']>;

/** Count attacks per defender, so co-op alternation cannot put every wave on B. */
export function resolveTidalWave(config: TidalWaveConfig, attackNumber: number, blessingAvailable: boolean) {
    const wave = attackNumber > 0 && attackNumber % config.everyTurns === 0;
    const blessingUsed = wave && blessingAvailable && config.blessingReduction > 0 && config.bonusDamage > 0;
    return { wave, blessingUsed, bonusDamage: wave
        ? Math.max(0, config.bonusDamage - (blessingUsed ? config.blessingReduction : 0)) : 0 };
}

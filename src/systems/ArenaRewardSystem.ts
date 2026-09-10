import type { PlayerState } from '../types';
import type { ArenaCompletionReward } from '../types/encounters';
import { ManaSystem } from './ManaSystem';

/** Applies configured arena mana to one player profile. */
export function awardArenaRewardMana(
    player: PlayerState,
    reward: ArenaCompletionReward,
): void {
    if ((reward.mana ?? 0) > 0) {
        ManaSystem.add(player, reward.mana ?? 0);
    }
}

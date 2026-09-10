import { describe, expect, it } from 'vitest';

import type { PlayerState } from '../../types';
import { awardArenaRewardMana } from '../ArenaRewardSystem';

function makePlayer(mana: number): PlayerState {
    return {
        mana,
        coins: { copper: 0, silver: 0, gold: 0, pouch: 0 },
    } as PlayerState;
}

describe('ArenaRewardSystem', () => {
    it('awards configured mana and records it in daily progress', () => {
        const player = makePlayer(2);

        awardArenaRewardMana(player, {
            coins: 0,
            mana: 3,
            crystals: [],
        });

        expect(player.mana).toBe(5);
        const rewardDay = Object.values(player.dailyProgressLog ?? {})[0];
        expect(rewardDay?.manaEarned).toBe(3);
    });

    it('treats omitted mana as a zero reward for existing encounter data', () => {
        const player = makePlayer(4);

        awardArenaRewardMana(player, {
            coins: 0,
            crystals: [],
        });

        expect(player.mana).toBe(4);
        expect(player.dailyProgressLog).toBeUndefined();
    });
});

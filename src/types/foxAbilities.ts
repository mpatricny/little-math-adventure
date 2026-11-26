import type { BattlePhase, PracticeTargetId } from './index';

export type FoxAbilityId = 'shield' | 'heal' | 'strike';
export type FoxOwnerId = 'A' | 'B';
export type FoxRuneTier = 1 | 2;

export interface FoxRuneReceipt {
    evidenceId: string;
    earnedAt: number;
}

export interface FoxSpeedReward extends FoxRuneReceipt {
    /** An absent field preserves the original module reward. Null is an earned point awaiting a choice. */
    allocation?: FoxAbilityId | null;
}

/** New rewards only. Existing fluency/mastery and attack bonuses are independent. */
export interface FoxJourneyProgress {
    version: 1;
    awards: Partial<Record<PracticeTargetId, { I?: FoxSpeedReward; II?: FoxSpeedReward }>>;
    /** Three one-time introductory lessons; independent of module runes and appearance points. */
    lessons?: Partial<Record<FoxAbilityId, FoxRuneReceipt & { targetId: PracticeTargetId }>>;
}

export type FoxAbilityPowers = Record<FoxAbilityId, number>;
export type FoxAbilityDisabledReason = 'locked' | 'not-equipped' | 'used' | 'defense'
    | 'paused' | 'busy' | 'battle-ended' | 'fallen' | 'full-health' | 'no-target';

export interface FoxAbilityState {
    unlocked: boolean;
    power: number;
    used: boolean;
    disabledReason: FoxAbilityDisabledReason | null;
}

export interface FoxBattleOwner {
    profileId: string;
    powers: FoxAbilityPowers;
    used: Record<FoxAbilityId, boolean>;
    shieldRemaining: number;
}

/** Persist receipts with the battle; restoration must not replay effects twice. */
export interface FoxAbilityEffect {
    id: string;
    owner: FoxOwnerId;
    ability: FoxAbilityId;
    amount: number;
    before: number;
    after: number;
    /** Stable enemy instance key, including the boss phase when applicable. */
    targetId?: string;
}

export interface FoxAbilityBattleSnapshot {
    version: 1;
    battleId: string;
    status: 'active' | 'closed';
    owners: Partial<Record<FoxOwnerId, FoxBattleOwner>>;
    effects: FoxAbilityEffect[];
}

/** Live combat facts; UI selection and the active singleton player are not authoritative. */
export interface FoxAbilityContext {
    phase: BattlePhase;
    paused: boolean;
    busy?: boolean;
    /** Explicit guard for defense animation edges before/after player_defend. */
    defenseActive?: boolean;
    owners: Partial<Record<FoxOwnerId, { hp: number; maxHp: number; foxEquipped: boolean }>>;
    targets: Array<{ id: string; hp: number; defense: number }>;
}

export type FoxAbilityUseResult =
    | { ok: true; effect: FoxAbilityEffect }
    | { ok: false; reason: FoxAbilityDisabledReason | 'unknown-owner' | 'invalid-target' | 'persistence-failed' };

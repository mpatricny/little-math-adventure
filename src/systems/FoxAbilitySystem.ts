import tuning from '../data/fox-abilities.json';
import type { PlayerState, PracticeTargetId } from '../types';
import type {
    FoxAbilityBattleSnapshot, FoxAbilityContext, FoxAbilityEffect, FoxAbilityId,
    FoxAbilityPowers, FoxAbilityState, FoxAbilityUseResult, FoxJourneyProgress,
    FoxOwnerId, FoxRuneReceipt, FoxRuneTier, FoxSpeedReward,
} from '../types/foxAbilities';
import { resolveDirectDamage } from './CombatDamageSystem';

export const FOX_ABILITY_IDS = ['shield', 'heal', 'strike'] as const;
export const FOX_ABILITY_CONFIG = tuning;
type FoxPlayer = Pick<PlayerState, 'catacombFoxJourney'>;
const families = tuning.moduleFamilies as Record<PracticeTargetId, FoxAbilityId>;
const copy = <T>(value: T): T => structuredClone(value);
const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;
export const isFoxRewardReceipt = (value?: FoxRuneReceipt): value is FoxRuneReceipt => Boolean(value
    && typeof value.evidenceId === 'string' && value.evidenceId.trim()
    && Number.isFinite(value.earnedAt) && value.earnedAt > 0);

function hasAllFoxLessons(progress: FoxJourneyProgress): boolean {
    return FOX_ABILITY_IDS.every(ability => isFoxRewardReceipt(progress.lessons?.[ability]));
}

function* earnedSpeedRewards(progress: FoxJourneyProgress) {
    for (const target of Object.keys(families) as PracticeTargetId[]) {
        const award = progress.awards?.[target];
        if (!isFoxRewardReceipt(award?.I)) continue;
        yield { target, tier: 1 as const, receipt: award.I };
        if (isFoxRewardReceipt(award.II) && award.II.evidenceId !== award.I.evidenceId) {
            yield { target, tier: 2 as const, receipt: award.II };
        }
    }
}

/** Reading a legacy save never awards runes or modifies its existing fox. */
export function getFoxJourney(player: FoxPlayer): {
    powers: FoxAbilityPowers; points: number; form: '01' | '02' | '03' | '04' | '05';
    tiers: Partial<Record<PracticeTargetId, FoxRuneTier>>; availablePoints: number;
} {
    const powers: FoxAbilityPowers = { shield: 0, heal: 0, strike: 0 };
    const tiers: Partial<Record<PracticeTargetId, FoxRuneTier>> = {};
    let points = 0;
    let availablePoints = 0;
    const progress = player.catacombFoxJourney;
    if (progress?.version === 1) {
        const canChoose = hasAllFoxLessons(progress);
        for (const ability of FOX_ABILITY_IDS) {
            if (isFoxRewardReceipt(progress.lessons?.[ability])) powers[ability] = 1;
        }
        for (const { target, tier, receipt } of earnedSpeedRewards(progress)) {
            tiers[target] = tier;
            points++;
            if (receipt.allocation === undefined) {
                const family = families[target];
                powers[family] += tuning.contribution[family][tier] - tuning.contribution[family][tier - 1];
            } else if (receipt.allocation === null) {
                if (canChoose) availablePoints++;
            } else if (FOX_ABILITY_IDS.includes(receipt.allocation)) {
                powers[receipt.allocation]++;
            }
        }
    }
    const formIndex = tuning.appearanceMilestones.filter(point => points >= point).length;
    return { powers, points, tiers, availablePoints, form: `0${formIndex}` as '01' | '02' | '03' | '04' | '05' };
}

/** Called only after a higher-tier trial validates new evidence; not a migration. */
export function awardFoxRune(
    player: FoxPlayer, targetId: PracticeTargetId, tier: FoxRuneTier, receipt: FoxRuneReceipt,
): boolean {
    if (!Object.prototype.hasOwnProperty.call(families, targetId)
        || (tier !== 1 && tier !== 2) || !isFoxRewardReceipt(receipt)) return false;
    if (player.catacombFoxJourney && player.catacombFoxJourney.version !== 1) return false;
    const before = getFoxJourney(player);
    if ((before.tiers[targetId] ?? 0) >= tier || (tier === 2 && before.tiers[targetId] !== 1)) return false;
    const progress: FoxJourneyProgress = copy(player.catacombFoxJourney ?? { version: 1, awards: {} });
    if (FOX_ABILITY_IDS.some(ability => progress.lessons?.[ability]?.evidenceId === receipt.evidenceId)
        || Object.values(progress.awards ?? {}).some(award =>
        award?.I?.evidenceId === receipt.evidenceId || award?.II?.evidenceId === receipt.evidenceId)) return false;
    const reward: FoxSpeedReward = { evidenceId: receipt.evidenceId, earnedAt: receipt.earnedAt, allocation: null };
    progress.awards ??= {};
    progress.awards[targetId] = { ...progress.awards[targetId], [tier === 1 ? 'I' : 'II']: reward };
    player.catacombFoxJourney = progress;
    return true;
}

/** Each completed speed trial funds one choice. Assigning it never advances the fox's form again. */
export function allocateFoxAbilityPoint(player: FoxPlayer, ability: FoxAbilityId): boolean {
    const progress = player.catacombFoxJourney;
    if (progress?.version !== 1 || !FOX_ABILITY_IDS.includes(ability) || !hasAllFoxLessons(progress)) return false;
    for (const { target, tier, receipt } of earnedSpeedRewards(progress)) {
        if (receipt.allocation !== null) continue;
        const key = tier === 1 ? 'I' : 'II';
        player.catacombFoxJourney = { ...progress, awards: { ...progress.awards,
            [target]: { ...progress.awards[target], [key]: { ...receipt, allocation: ability } } } };
        return true;
    }
    return false;
}

export interface FoxBattleOwnerSeed {
    id: FoxOwnerId;
    profileId: string;
    player: FoxPlayer;
}

/**
 * The adapter persists this snapshot and its combat effect in one checkpoint,
 * synchronously, BEFORE it starts an animation. False/throw means no consumption.
 */
export type FoxAbilityCommit = (snapshot: FoxAbilityBattleSnapshot, effect?: FoxAbilityEffect) => boolean;

/** No Phaser, global active player, save-slot swapping, animation or UI selection here. */
export class FoxAbilitySystem {
    private state: FoxAbilityBattleSnapshot;
    private committing = false;

    constructor(
        battleId: string,
        owners: readonly FoxBattleOwnerSeed[],
        private readonly commit: FoxAbilityCommit,
        saved?: FoxAbilityBattleSnapshot,
    ) {
        if (!battleId || !owners.length || owners.length > 2
            || owners.some(owner => !owner.profileId || (owner.id !== 'A' && owner.id !== 'B'))
            || new Set(owners.map(owner => owner.id)).size !== owners.length
            || new Set(owners.map(owner => owner.profileId)).size !== owners.length) {
            throw new Error('Invalid fox battle identity');
        }
        if (saved) {
            if (!FoxAbilitySystem.canRestore(saved, battleId, owners)) {
                // The adapter must disable abilities on a bad checkpoint, never refill them.
                throw new Error('Fox ability checkpoint does not match this battle');
            }
            this.state = copy(saved);
        } else {
            this.state = { version: 1, battleId, status: 'active', owners: {}, effects: [] };
            for (const owner of owners) {
                this.state.owners[owner.id] = {
                    profileId: owner.profileId, powers: getFoxJourney(owner.player).powers,
                    used: { shield: false, heal: false, strike: false }, shieldRemaining: 0,
                };
            }
        }
    }

    static canRestore(saved: FoxAbilityBattleSnapshot, battleId: string, owners: readonly FoxBattleOwnerSeed[]): boolean {
        if (saved?.version !== 1 || saved.battleId !== battleId
            || !['active', 'closed'].includes(saved.status) || !saved.owners || !Array.isArray(saved.effects)
            || Object.keys(saved.owners).length !== owners.length || saved.effects.length > owners.length * 3) return false;
        if (!owners.every(owner => {
            const value = saved.owners[owner.id];
            return value && value.profileId === owner.profileId && value.powers && value.used
                && FOX_ABILITY_IDS.every(ability => finiteNonNegative(value.powers[ability])
                    && typeof value.used[ability] === 'boolean')
                && finiteNonNegative(value.shieldRemaining)
                && value.shieldRemaining <= value.powers.shield
                && (value.used.shield || value.shieldRemaining === 0);
        })) return false;
        const receipts = new Set<string>();
        for (const effect of saved.effects) {
            if (!effect || !FOX_ABILITY_IDS.includes(effect.ability) || !saved.owners[effect.owner]
                || !saved.owners[effect.owner]!.used[effect.ability]
                || effect.id !== `${battleId}:${effect.owner}:${effect.ability}` || receipts.has(effect.id)
                || !finiteNonNegative(effect.amount) || effect.amount <= 0
                || !finiteNonNegative(effect.before) || !finiteNonNegative(effect.after)
                || effect.amount > saved.owners[effect.owner]!.powers[effect.ability]
                || (effect.ability === 'strike'
                    ? typeof effect.targetId !== 'string' || !effect.targetId
                        || effect.before - effect.after !== effect.amount
                    : effect.after - effect.before !== effect.amount)
                || (effect.ability === 'shield' && (effect.before !== 0
                    || effect.after !== saved.owners[effect.owner]!.powers.shield))) return false;
            receipts.add(effect.id);
        }
        return owners.every(owner => FOX_ABILITY_IDS.every(ability =>
            saved.owners[owner.id]!.used[ability] === receipts.has(`${battleId}:${owner.id}:${ability}`)));
    }

    snapshot(): FoxAbilityBattleSnapshot { return copy(this.state); }

    readOwner(ownerId: FoxOwnerId, context: FoxAbilityContext): Record<FoxAbilityId, FoxAbilityState> {
        const owner = this.state.owners[ownerId];
        const actor = context.owners[ownerId];
        const states = {} as Record<FoxAbilityId, FoxAbilityState>;
        for (const ability of FOX_ABILITY_IDS) {
            const power = owner?.powers[ability] ?? 0;
            const used = owner?.used[ability] ?? false;
            let disabledReason: FoxAbilityState['disabledReason'] = null;
            if (power <= 0) disabledReason = 'locked';
            else if (!actor?.foxEquipped) disabledReason = 'not-equipped';
            else if (used) disabledReason = 'used';
            else if (this.state.status === 'closed' || context.phase === 'victory' || context.phase === 'defeat') disabledReason = 'battle-ended';
            else if (context.paused) disabledReason = 'paused';
            else if (context.defenseActive || ['enemy_turn', 'enemy_attack', 'player_defend'].includes(context.phase)) disabledReason = 'defense';
            else if (context.busy || this.committing || context.phase === 'start') disabledReason = 'busy';
            else if (!Number.isFinite(actor.hp) || !Number.isFinite(actor.maxHp) || actor.hp <= 0 || actor.maxHp <= 0) disabledReason = 'fallen';
            else if (!context.targets.some(target => Number.isFinite(target.hp) && target.hp > 0)) disabledReason = 'no-target';
            else if (ability === 'heal' && actor.hp >= actor.maxHp) disabledReason = 'full-health';
            states[ability] = { unlocked: power > 0, power, used, disabledReason };
        }
        return states;
    }

    useAbility(ownerId: FoxOwnerId, ability: FoxAbilityId, context: FoxAbilityContext, targetId?: string): FoxAbilityUseResult {
        if (!this.state.owners[ownerId]) return { ok: false, reason: 'unknown-owner' };
        const state = this.readOwner(ownerId, context)[ability];
        if (state.disabledReason) return { ok: false, reason: state.disabledReason };
        const next = this.snapshot();
        const owner = next.owners[ownerId]!;
        let before: number;
        let after: number;
        if (ability === 'shield') {
            before = owner.shieldRemaining;
            after = before + state.power;
            owner.shieldRemaining = after;
        } else if (ability === 'heal') {
            before = context.owners[ownerId]!.hp;
            after = Math.min(context.owners[ownerId]!.maxHp, before + state.power);
        } else {
            const targets = context.targets.filter(target => target.id === targetId);
            const target = targets[0];
            if (targets.length !== 1 || !target || !Number.isFinite(target.hp) || target.hp <= 0) {
                return { ok: false, reason: 'invalid-target' };
            }
            before = target.hp;
            after = Math.max(0, before - resolveDirectDamage(state.power).damage);
        }
        const effect: FoxAbilityEffect = {
            id: `${next.battleId}:${ownerId}:${ability}`, owner: ownerId, ability,
            amount: Math.abs(after - before), before, after,
            ...(ability === 'strike' ? { targetId } : {}),
        };
        owner.used[ability] = true;
        next.effects.push(effect);
        if (!this.persist(next, effect)) return { ok: false, reason: 'persistence-failed' };
        return { ok: true, effect: copy(effect) };
    }

    /** Apply to damage remaining after the ordinary block, before consumable shop runes. */
    absorbDamage(ownerId: FoxOwnerId, incomingDamage: number): {
        damage: number; blocked: number; remainingShield: number; persisted: boolean;
    } {
        const damage = Number.isFinite(incomingDamage) ? Math.max(0, incomingDamage) : 0;
        const remainingShield = this.state.owners[ownerId]?.shieldRemaining ?? 0;
        const blocked = this.state.status === 'active' ? Math.min(damage, remainingShield) : 0;
        if (blocked === 0) return { damage, blocked: 0, remainingShield, persisted: true };
        const next = this.snapshot();
        next.owners[ownerId]!.shieldRemaining -= blocked;
        if (!this.persist(next)) return { damage, blocked: 0, remainingShield, persisted: false };
        return { damage: damage - blocked, blocked, remainingShield: remainingShield - blocked, persisted: true };
    }

    close(): boolean {
        if (this.state.status === 'closed') return true;
        const next = this.snapshot();
        next.status = 'closed';
        for (const owner of Object.values(next.owners)) owner!.shieldRemaining = 0;
        return this.persist(next);
    }

    private persist(next: FoxAbilityBattleSnapshot, effect?: FoxAbilityEffect): boolean {
        if (this.committing) return false;
        this.committing = true;
        try {
            if (!this.commit(copy(next), effect ? copy(effect) : undefined)) return false;
            this.state = next;
            return true;
        } catch {
            return false;
        } finally {
            this.committing = false;
        }
    }
}

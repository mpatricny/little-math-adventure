import type { FoxAbilityContext, FoxAbilityEffect, FoxAbilityId, FoxOwnerId, FoxAbilityBattleSnapshot } from '../types/foxAbilities';
import type { BattleFoxAbilityCheckpoint, BattleFoxCombatCheckpoint, BattleFoxCheckpointStore, BattleFoxCheckpointToken } from '../types/foxBattleSession';
import { FoxAbilitySystem, type FoxBattleOwnerSeed } from './FoxAbilitySystem';
import { resolveProtectionAfterBlock } from './CombatDamageSystem';
import { PREPARATION_CONFIG } from './PreparationSystem';
import { gameplayId } from '../telemetry/gameplayData';

export interface BattleFoxSessionOptions {
    /** Catalog encounter + run/wave identity; must not change when a boss changes phase. */
    encounterKey: string;
    owners: readonly FoxBattleOwnerSeed[];
    capture: () => BattleFoxCombatCheckpoint;
    store: BattleFoxCheckpointStore;
    newBattleId?: () => string;
}

const clone = <T>(value: T): T => structuredClone(value);
const token = (value: BattleFoxAbilityCheckpoint): BattleFoxCheckpointToken => ({ battleId: value.battleId, revision: value.revision });
const hp = (combat: BattleFoxCombatCheckpoint, owner: FoxOwnerId): number => owner === 'A'
    ? combat.battle.playerHp : combat.battle.playerBHp ?? 0;
function setHp(combat: BattleFoxCombatCheckpoint, owner: FoxOwnerId, value: number): void {
    if (owner === 'A') combat.battle.playerHp = value;
    else combat.battle.playerBHp = value;
}

function validCombat(value: BattleFoxCombatCheckpoint): boolean {
    if (!value?.battle || !Array.isArray(value.enemyKeys) || !Array.isArray(value.battle.enemies)
        || value.enemyKeys.length !== value.battle.enemies.length
        || new Set(value.enemyKeys).size !== value.enemyKeys.length
        || !value.enemyKeys.every(id => typeof id === 'string' && id.length > 0)
        || !value.turnToken || !value.owners?.[value.activeOwner]
        || !Number.isFinite(value.battle.playerHp) || value.battle.playerHp < 0
        || !Number.isInteger(value.battle.turnCount) || value.battle.turnCount < 0
        || !value.resumeData || typeof value.resumeData !== 'object') return false;
    if (!Object.entries(value.owners).every(([id, owner]) => (id === 'A' || id === 'B')
        && owner && Number.isFinite(owner.maxHp) && owner.maxHp > 0
        && Number.isFinite(hp(value, id)) && hp(value, id) >= 0 && hp(value, id) <= owner.maxHp
        && typeof owner.foxEquipped === 'boolean' && typeof owner.shieldEquipped === 'boolean'
        && owner.preparation && Number.isFinite(owner.preparation.charges) && owner.preparation.charges >= 0)) return false;
    return value.battle.enemies.every(enemy => Number.isFinite(enemy.hp) && enemy.hp >= 0
        && Number.isFinite(enemy.maxHp) && enemy.hp <= enemy.maxHp);
}

/** A host checkpoint pairs BOTH owners' charges with actual HP, enemy instances and resume data. */
export class BattleFoxAbilitySession {
    readonly system: FoxAbilitySystem;
    private record: BattleFoxAbilityCheckpoint;
    private pendingHit?: { owner: FoxOwnerId; damage: number };

    private constructor(private readonly options: BattleFoxSessionOptions, record: BattleFoxAbilityCheckpoint) {
        this.record = clone(record);
        this.system = new FoxAbilitySystem(record.battleId, options.owners,
            (ledger, effect) => this.commit(ledger, effect), record.ledger);
    }

    static open(options: BattleFoxSessionOptions):
        | { ok: true; session: BattleFoxAbilitySession; resumed: boolean; combat: BattleFoxCombatCheckpoint }
        | { ok: false; reason: 'invalid-checkpoint' | 'different-active-encounter' | 'persistence-failed' } {
        const saved = options.store.read();
        if (saved?.ledger?.status === 'active') {
            if (saved.encounterKey !== options.encounterKey) return { ok: false, reason: 'different-active-encounter' };
            if (saved.version !== 1 || !Number.isInteger(saved.revision) || saved.revision < 0
                || !validCombat(saved.combat)
                || !FoxAbilitySystem.canRestore(saved.ledger, saved.battleId, options.owners)) {
                return { ok: false, reason: 'invalid-checkpoint' };
            }
            return { ok: true, session: new BattleFoxAbilitySession(options, saved), resumed: true, combat: clone(saved.combat) };
        }
        if (saved && (saved.version !== 1 || saved.ledger?.status !== 'closed')) {
            return { ok: false, reason: 'invalid-checkpoint' };
        }
        const combat = clone(options.capture());
        if (!validCombat(combat) || !options.encounterKey) return { ok: false, reason: 'invalid-checkpoint' };
        const battleId = options.newBattleId?.() ?? gameplayId();
        let ledger: FoxAbilityBattleSnapshot;
        try { ledger = new FoxAbilitySystem(battleId, options.owners, () => false).snapshot(); }
        catch { return { ok: false, reason: 'invalid-checkpoint' }; }
        const record: BattleFoxAbilityCheckpoint = {
            version: 1, encounterKey: options.encounterKey, battleId, revision: 0, ledger, combat,
        };
        if (!options.store.write(clone(record), saved ? token(saved) : null)) return { ok: false, reason: 'persistence-failed' };
        return { ok: true, session: new BattleFoxAbilitySession(options, record), resumed: false, combat: clone(combat) };
    }

    snapshot(): BattleFoxAbilityCheckpoint { return clone(this.record); }

    private context(combat = this.options.capture()): FoxAbilityContext {
        const owners: FoxAbilityContext['owners'] = {};
        for (const id of ['A', 'B'] as const) {
            const actor = combat.owners[id];
            if (actor) owners[id] = { hp: hp(combat, id), maxHp: actor.maxHp, foxEquipped: actor.foxEquipped };
        }
        return { phase: combat.battle.phase, paused: combat.paused, busy: combat.busy,
            defenseActive: combat.defenseActive, owners,
            targets: combat.battle.enemies.map((enemy, index) => ({ id: combat.enemyKeys[index], hp: enemy.hp, defense: enemy.defense })) };
    }

    readOwner(owner: FoxOwnerId) { return this.system.readOwner(owner, this.context()); }

    /** On success, apply returned combat to the scene before playing the effect animation. */
    useAbility(owner: FoxOwnerId, ability: FoxAbilityId, targetId?: string) {
        const result = this.system.useAbility(owner, ability, this.context(), targetId);
        return result.ok ? { ...result, combat: clone(this.record.combat) } : result;
    }

    /** Call after ordinary HP/phase/target/MathBoard changes, not only after special abilities. */
    checkpointCombat(): boolean { return this.commit(this.system.snapshot()); }

    /** One atomic resolution after the ordinary block; do not also consume the old shop rune path. */
    applyIncomingDamage(owner: FoxOwnerId, damageAfterOrdinaryBlock: number) {
        const captured = this.options.capture();
        if (!captured.owners[owner] || !Number.isFinite(damageAfterOrdinaryBlock) || damageAfterOrdinaryBlock < 0
            || this.record.ledger.status !== 'active' || this.pendingHit) return { ok: false as const };
        const resolution = this.resolveHit(captured, this.system.snapshot(), owner, damageAfterOrdinaryBlock);
        this.pendingHit = { owner, damage: damageAfterOrdinaryBlock };
        try {
            // A hit with no fox absorption still checkpoints health and any useful shop rune.
            const absorbed = this.system.absorbDamage(owner, damageAfterOrdinaryBlock);
            const saved = absorbed.persisted && (absorbed.blocked > 0 || this.commit(this.system.snapshot()));
            if (!saved) return { ok: false as const };
            return { ok: true as const, ...resolution, combat: clone(this.record.combat) };
        } finally { this.pendingHit = undefined; }
    }

    close(): boolean { return this.system.close(); }

    private resolveHit(combat: BattleFoxCombatCheckpoint, ledger: FoxAbilityBattleSnapshot, owner: FoxOwnerId, damage: number) {
        const actor = combat.owners[owner]!;
        const prepared = actor.shieldEquipped && actor.preparation.kind === 'shield'
            ? { charges: actor.preparation.charges, blockPerCharge: PREPARATION_CONFIG.effects.shield.blockPerCharge } : null;
        return resolveProtectionAfterBlock(damage, ledger.owners[owner]?.shieldRemaining ?? 0, prepared);
    }

    private commit(ledger: FoxAbilityBattleSnapshot, effect?: FoxAbilityEffect): boolean {
        const combat = clone(this.options.capture());
        if (!validCombat(combat)) return false;
        if (effect?.ability === 'heal') {
            if (hp(combat, effect.owner) !== effect.before) return false;
            setHp(combat, effect.owner, effect.after);
        } else if (effect?.ability === 'strike') {
            const index = combat.enemyKeys.indexOf(effect.targetId!);
            if (index < 0 || combat.battle.enemies[index].hp !== effect.before) return false;
            combat.battle.enemies[index].hp = effect.after;
        }
        if (this.pendingHit) {
            const { owner, damage } = this.pendingHit;
            // Resolve from the PRE-hit ledger; the proposed ledger already contains consumption.
            const result = this.resolveHit(combat, this.record.ledger, owner, damage);
            if (ledger.owners[owner]?.shieldRemaining !== result.shieldRemaining) return false;
            setHp(combat, owner, Math.max(0, hp(combat, owner) - result.damage));
            if (result.preparedBlock > 0) {
                combat.owners[owner]!.preparation = result.preparationCharges > 0
                    ? { kind: 'shield', charges: result.preparationCharges } : { kind: null, charges: 0 };
            }
        }
        const next: BattleFoxAbilityCheckpoint = { ...this.record, revision: this.record.revision + 1, ledger: clone(ledger), combat };
        if (!this.options.store.write(clone(next), token(this.record))) return false;
        this.record = next;
        return true;
    }
}

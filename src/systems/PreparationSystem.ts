import preparationData from '../data/preparation.json';
import { PlayerState, PreparationKind, PreparationState } from '../types';

export interface PreparationConfig {
    version: number;
    initialProblems: number;
    maxProblems: number;
    maxCharges: number;
    effects: {
        sword: { damagePerCharge: number };
        shield: { blockPerCharge: number };
    };
}

export interface PreparationConsumption {
    applied: boolean;
    bonus: number;
    remainingCharges: number;
}

export const PREPARATION_CONFIG = preparationData as PreparationConfig;

const EMPTY_PREPARATION: PreparationState = {
    kind: null,
    charges: 0,
};

/** Pure preparation-state rules shared by the shop, battle runtime, and tests. */
export class PreparationSystem {
    static createInitialState(): PreparationState {
        return { ...EMPTY_PREPARATION };
    }

    static getState(player: PlayerState): PreparationState {
        const raw = player.preparation;
        const kind = raw?.kind === 'sword' || raw?.kind === 'shield' ? raw.kind : null;
        const charges = Number.isFinite(raw?.charges)
            ? Math.max(0, Math.min(PREPARATION_CONFIG.maxCharges, Math.round(raw!.charges)))
            : 0;

        player.preparation = kind && charges > 0
            ? { kind, charges }
            : this.createInitialState();
        return player.preparation;
    }

    static hasRequiredEquipment(player: PlayerState, kind: PreparationKind): boolean {
        return kind === 'sword'
            ? Boolean(player.equippedWeapon)
            : Boolean(player.equippedShield);
    }

    static prepare(player: PlayerState, kind: PreparationKind, charges: number): boolean {
        if (!this.hasRequiredEquipment(player, kind)) return false;

        const normalizedCharges = Math.max(
            0,
            Math.min(PREPARATION_CONFIG.maxCharges, Math.round(charges)),
        );
        if (normalizedCharges <= 0) return false;

        player.preparation = { kind, charges: normalizedCharges };
        return true;
    }

    static consume(player: PlayerState, kind: PreparationKind): PreparationConsumption {
        const state = this.getState(player);
        if (
            state.kind !== kind
            || state.charges <= 0
            || !this.hasRequiredEquipment(player, kind)
        ) {
            return { applied: false, bonus: 0, remainingCharges: state.charges };
        }

        const remainingCharges = state.charges - 1;
        player.preparation = remainingCharges > 0
            ? { kind, charges: remainingCharges }
            : this.createInitialState();

        const bonus = kind === 'sword'
            ? PREPARATION_CONFIG.effects.sword.damagePerCharge
            : PREPARATION_CONFIG.effects.shield.blockPerCharge;

        return { applied: true, bonus, remainingCharges };
    }
}

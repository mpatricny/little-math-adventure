import { CoopSessionManager } from './CoopSessionManager';
import { GameStateManager } from './GameStateManager';
import { MasterySystem } from './MasterySystem';

/** Only explicit entry activates a participant; browsing a panel never calls this adapter. */
export class CatacombTrialOwner {
    private state = GameStateManager.getInstance();
    private coop = CoopSessionManager.getInstance();
    private previous = this.coop.getActivePlayer();
    readonly slot: number;
    readonly participant: 'A' | 'B' | null;
    constructor(slot = GameStateManager.getInstance().getActiveSlotIndex() ?? -1) {
        this.slot = slot;
        this.participant = this.coop.isCoopActive()
            ? slot === this.coop.getPlayerASlotIndex() ? 'A' : slot === this.coop.getPlayerBSlotIndex() ? 'B' : null
            : null;
    }
    activate(): boolean {
        if (this.coop.isCoopActive()) {
            if (!this.participant) return false;
            if (this.participant === 'A') this.coop.activatePlayerA(); else this.coop.activatePlayerB();
        }
        if (!this.isCurrent()) return false;
        MasterySystem.getInstance().setActiveData(this.coop.isCoopActive() ? this.data : null);
        return true;
    }
    isCurrent(): boolean { return (this.state.getActiveSlotIndex() ?? -1) === this.slot; }
    get player() { return this.state.getPlayer(); }
    get data() { return this.coop.isCoopActive()
        ? this.participant === 'A' ? this.coop.getPlayerAMasteryData()! : this.coop.getPlayerBMasteryData()!
        : this.state.getMasteryData()!; }
    save(): boolean {
        if (!this.isCurrent()) return false;
        if (this.coop.isCoopActive()) this.coop.persistActiveMasteryProgress(); else this.state.save();
        return true;
    }
    release(): void {
        this.save();
        MasterySystem.getInstance().setActiveData(null);
        if (this.coop.isCoopActive()) {
            if (this.previous === 'A') this.coop.activatePlayerA(); else this.coop.activatePlayerB();
        }
    }
}

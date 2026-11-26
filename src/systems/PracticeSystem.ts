import type { LearningMode, MasteryData, PracticeTargetId } from '../types';
import { CoopSessionManager } from './CoopSessionManager';
import { GameStateManager } from './GameStateManager';
import { getLearningLevel } from './LearningProgress';
import { getOpenPracticeTargets, getPracticeOverview, setPracticeSelection, type PracticeOverview } from './PracticeProgress';

export type PracticePlayer = 'active' | 'A' | 'B';

/** UI adapter: inspection never swaps players; choices are saved to their actual owner. */
export class PracticeSystem {
    /** Selecting a module does not change the separately confirmed battle mode. */
    static setTarget(targetId: PracticeTargetId, player: PracticePlayer = 'active'): boolean {
        const data = this.getData(player);
        if (!data || !getOpenPracticeTargets(data).includes(targetId)) return false;
        if (data.practice?.mode === 'practice') setPracticeSelection(data, 'practice', targetId);
        else data.practice = { ...data.practice, mode: 'progress', pinnedTargetId: targetId, lastTargetId: targetId };
        this.persist(); return true;
    }
    static getOverview(player: PracticePlayer = 'active'): PracticeOverview | null {
        const data = this.getData(player);
        return data ? getPracticeOverview(data, getLearningLevel(data), CoopSessionManager.getInstance().getFoxProgressForMastery(data)) : null;
    }

    static setMode(mode: LearningMode, targetId?: PracticeTargetId, player: PracticePlayer = 'active', source?: 'guild' | 'battle'): boolean {
        const data = this.getData(player);
        if (!data) return false;
        const previousDefault = data.practice?.defaultMode ?? data.practice?.mode ?? 'progress';
        const fox = CoopSessionManager.getInstance().getFoxProgressForMastery(data);
        if (!setPracticeSelection(data, mode, targetId, fox)) return false;
        if (source === 'guild') {
            data.practice!.defaultMode = mode;
            data.practice!.introductionSeen = true;
        } else if (source === 'battle') {
            data.practice!.defaultMode = previousDefault;
        }
        this.persist();
        return true;
    }

    /** Call after the visual introduction actually completes, never while merely inspecting. */
    static markIntroductionSeen(player: PracticePlayer = 'active'): boolean {
        const data = this.getData(player);
        if (!data) return false;
        data.practice ??= { mode: 'progress' };
        data.practice.introductionSeen = true;
        this.persist();
        return true;
    }

    private static getData(player: PracticePlayer): MasteryData | null {
        if (!['active', 'A', 'B'].includes(player)) return null;
        const coop = CoopSessionManager.getInstance();
        if (!coop.isCoopActive()) return player === 'active' ? GameStateManager.getInstance().getMasteryData() : null;
        const owner = player === 'active' ? coop.getActivePlayer() : player;
        return owner === 'A' ? coop.getPlayerAMasteryData() : coop.getPlayerBMasteryData();
    }

    private static persist(): void {
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) coop.persistMasteryProgress();
        else GameStateManager.getInstance().save();
    }

}

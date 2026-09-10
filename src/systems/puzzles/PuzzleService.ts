import type { PlayerState } from '../../types';
import type { PuzzleFamily, PuzzleInstance, PuzzleProfile, PuzzleProgress } from '../../types/puzzles';
import { GameStateManager } from '../GameStateManager';
import { CoopSessionManager } from '../CoopSessionManager';
import { SaveSystem } from '../SaveSystem';
import { masteryPuzzleProfile, sharedPuzzleProfile } from './PuzzleDifficulty';
import tuning from '../../../public/assets/data/puzzles/tuning.json';

export function puzzleProgress(player: PlayerState): PuzzleProgress {
    return player.puzzleProgress ??= { version: 1, active: {}, results: {} };
}
export function puzzleProfile(family: PuzzleFamily, shared = true): PuzzleProfile {
    const game = GameStateManager.getInstance(), coop = CoopSessionManager.getInstance();
    const tier = puzzleProgress(game.getPlayer()).results[family]?.tier ?? 1;
    if (!coop.isCoopActive()) return masteryPuzzleProfile(game.getMasteryData(), tier);
    const a = coop.getPlayerAMasteryData(), b = coop.getPlayerBMasteryData();
    if (shared && a && b) {
        const otherSlot = coop.getActivePlayer() === 'A' ? coop.getPlayerBSlotIndex() : coop.getPlayerASlotIndex();
        const otherTier = SaveSystem.load(otherSlot)?.player.puzzleProgress?.results[family]?.tier ?? 1;
        const commonTier = Math.min(tier, otherTier) as PuzzleProfile['tier'];
        return sharedPuzzleProfile([masteryPuzzleProfile(a, commonTier), masteryPuzzleProfile(b, commonTier)]);
    }
    return masteryPuzzleProfile((coop.getActivePlayer() === 'A' ? a : b) ?? game.getMasteryData(), tier);
}
export function acquirePuzzle<T>(store: Record<string, PuzzleInstance>, key: string, family: PuzzleFamily,
    generate: (profile: PuzzleProfile) => T, profile = puzzleProfile(family), replayCompleted = false,
    acceptPayload: (payload: T) => boolean = () => true): PuzzleInstance<T> {
    const existing = store[key];
    if (existing?.version === 1 && existing.family === family && (!existing.completed || !replayCompleted)
        && acceptPayload(existing.payload as T)) return existing as PuzzleInstance<T>;
    const instance: PuzzleInstance<T> = { version: 1, family, profile, payload: generate(profile), startedAt: Date.now(),
        assisted: false, completed: false, state: {} };
    store[key] = instance; return instance;
}
/** Record one first answer per instance; corrections never turn a mistake into independent mastery. */
export function recordPuzzleAnswer(instance: PuzzleInstance, correct: boolean, assisted = false, player: PlayerState | null = GameStateManager.getInstance().getPlayer()): void {
    if (instance.completed) return;
    const firstAnswer = instance.firstCorrect === undefined;
    instance.firstCorrect ??= correct;
    instance.assisted ||= assisted;
    instance.completed = correct;
    if (!firstAnswer || !player) return;
    const result = puzzleProgress(player).results[instance.family] ??= { tier: 1, attempts: [] };
    result.attempts.push({ firstCorrect: instance.firstCorrect, assisted: instance.assisted, elapsedMs: Date.now() - instance.startedAt });
    if (result.attempts.length >= tuning.adaptation.window) {
        const good = result.attempts.filter(a => a.firstCorrect && !a.assisted).length;
        const errors = result.attempts.filter(a => !a.firstCorrect).length;
        if (good >= tuning.adaptation.promoteSuccesses) result.tier = Math.min(3, result.tier + 1) as 1 | 2 | 3;
        else if (errors >= tuning.adaptation.demoteErrors) result.tier = Math.max(1, result.tier - 1) as 1 | 2 | 3;
        result.attempts = [];
    }
}

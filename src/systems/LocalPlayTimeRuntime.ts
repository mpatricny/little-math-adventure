import type Phaser from 'phaser';
import { GameStateManager } from './GameStateManager';
import { CoopSessionManager } from './CoopSessionManager';
import { SaveSystem } from './SaveSystem';
import { LocalPlayTimeTracker, preservePlayTime, type PlayTimeContext } from './LocalPlayTime';
import { observeLocalPlayTime } from './LocalPlayTimeBridge';

const nonGameplayScenes = new Set([
    'BootScene', 'AssetLoaderScene', 'MenuScene', 'MenuNewScene', 'PlayersHubScene',
    'SaveSlotScene', 'CharacterSelectScene', 'CharacterSelectNewScene', 'CoopSetupScene',
    'BandSelectScene', 'PlacementScene', 'AudioSettingsScene', 'TvPairingScene',
    'TestingTownScene', 'TestingWitchHutScene', 'AssetFactoryTestScene', 'MathBoardDebugScene',
    'ArenaUiMockScene', 'BattleUiMockScene', 'GuildExamMockScene', 'GuardianLairMockScene',
]);

export function isLocalPlayTimeScene(sceneKey: string): boolean { return !nonGameplayScenes.has(sceneKey); }

/** Local-only measurement runs even when analytics and cloud sync are disabled. */
export function startLocalPlayTime(game: Phaser.Game): () => void {
    let focused = document.hasFocus();
    let pageHidden = false;
    const inactive: PlayTimeContext = { participants: [], active: false, preview: false };
    const context = (): PlayTimeContext => {
        const scenes = game.scene.getScenes(true);
        if (!scenes.length || scenes.some(scene => !isLocalPlayTimeScene(scene.sys.settings.key))) return inactive;
        const state = GameStateManager.getInstance();
        const preview = state.isPreviewActive();
        if (preview || pageHidden || document.hidden || !focused || game.isPaused
            || !scenes.some(scene => scene.sys.isVisible() && !scene.time?.paused && !scene.load?.isLoading())) {
            return { ...inactive, preview };
        }
        const coop = CoopSessionManager.getInstance();
        const activeSlot = state.getActiveSlotIndex();
        const slots = coop.isCoopActive()
            ? [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()]
            : activeSlot === null ? [] : [activeSlot];
        const participants = [...new Set(slots)].flatMap(slotIndex => {
            const player = slotIndex === activeSlot ? state.getPlayer() : SaveSystem.readSnapshot(slotIndex)?.player;
            return player?.gameplayProfileId ? [{ slotIndex, profileId: player.gameplayProfileId }] : [];
        });
        return { participants, active: participants.length > 0, preview: false };
    };
    const tracker = new LocalPlayTimeTracker((participant, days) => {
        if (!SaveSystem.addLocalPlayTime(participant.slotIndex, participant.profileId, days)) return false;
        const state = GameStateManager.getInstance();
        // Synchronize only this field. In mana co-op, current lane statistics may be
        // newer than both this singleton and the last persisted snapshot.
        if (!state.isPreviewActive() && state.getActiveSlotIndex() === participant.slotIndex) {
            preservePlayTime(state.getPlayer(), SaveSystem.readSnapshot(participant.slotIndex)?.player);
        }
        return true;
    });
    let sampling = false;
    let contextChangedDuringSave = false;
    const sample = (flush: boolean) => {
        if (sampling) { contextChangedDuringSave = true; return; }
        sampling = true;
        const wallMs = Date.now();
        const monotonicMs = performance.now();
        try {
            tracker.sample(wallMs, monotonicMs, context(), flush);
            if (contextChangedDuringSave) {
                contextChangedDuringSave = false;
                // A save observer may load another hero synchronously. Rebase at the
                // same timestamp, without persisting or counting the checkpoint twice.
                tracker.sample(wallMs, monotonicMs, context(), false);
            }
        } finally { sampling = false; }
    };
    const checkpoint = () => sample(true);
    const onBlur = () => { focused = false; checkpoint(); };
    const onFocus = () => { focused = true; checkpoint(); };
    const onPageHide = () => { pageHidden = true; checkpoint(); };
    const onPageShow = () => { pageHidden = false; focused = document.hasFocus(); checkpoint(); };
    const stopObserving = observeLocalPlayTime(checkpoint);
    const timer = window.setInterval(() => sample(false), 1000);
    document.addEventListener('visibilitychange', checkpoint);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    game.events.on('pause', checkpoint);
    game.events.on('resume', checkpoint);
    game.events.on('blur', onBlur);
    game.events.on('focus', onFocus);
    checkpoint();
    return () => {
        checkpoint();
        stopObserving();
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', checkpoint);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        game.events.off('pause', checkpoint);
        game.events.off('resume', checkpoint);
        game.events.off('blur', onBlur);
        game.events.off('focus', onFocus);
    };
}

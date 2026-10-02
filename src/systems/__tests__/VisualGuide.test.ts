import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualGuide } from '../../ui/VisualGuide';

const { state, audio } = vi.hoisted(() => ({
    state: { getPlayer: vi.fn(), save: vi.fn() },
    audio: { cancel: vi.fn() },
}));
vi.mock('phaser', () => ({ default: { Scenes: { Events: { SHUTDOWN: 'shutdown' } } } }));
vi.mock('../GameStateManager', () => ({ GameStateManager: { getInstance: () => state } }));
vi.mock('../../audio/AudioDirector', () => ({ gameAudio: () => audio }));
vi.mock('../../ui/MedievalPanel', () => ({ createMedievalPanel: vi.fn() }));
vi.mock('../../ui/MedievalActionButton', () => ({ MedievalActionButton: vi.fn() }));

// Exercise the real lifecycle without constructing Phaser's renderer. The
// browser check covers the actual × button and localStorage across a reload.
function guideFixture(persist = true) {
    const player = { seenGuides: ['shop.intro.v1'] };
    state.getPlayer.mockReturnValue(player);
    const timer = { remove: vi.fn() };
    const tween = { remove: vi.fn() };
    const root = { destroy: vi.fn() };
    const events = { off: vi.fn(), emit: vi.fn() };
    const onClose = vi.fn();
    const guide = Object.assign(Object.create(VisualGuide.prototype), {
        player, persist, pages: [{ id: 'forge.merge.v1' }, { id: 'forge.split.v1' }],
        index: 0, completed: false, destroyed: false,
        timers: [timer], tweens: [tween], root, scene: { events }, onClose,
    });
    return { guide, player, timer, tween, root, events, onClose };
}

describe('VisualGuide dismissal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('remembers only the visible page when × closes an unfinished animation', () => {
        const { guide, player, timer, tween, root, events, onClose } = guideFixture();
        guide.dismiss();
        guide.dismiss(); // A second input cannot repeat the save or callbacks.

        expect(player.seenGuides).toEqual(['shop.intro.v1', 'forge.merge.v1']);
        expect(state.save).toHaveBeenCalledTimes(1);
        expect(timer.remove).toHaveBeenCalledOnce();
        expect(tween.remove).toHaveBeenCalledOnce();
        expect(root.destroy).toHaveBeenCalledOnce();
        expect(audio.cancel).toHaveBeenCalledWith(guide);
        expect(onClose).toHaveBeenCalledOnce();
        expect(events.emit).not.toHaveBeenCalled(); // Dismissal earns no completion event.
    });

    it('does not acknowledge a guide on scene shutdown', () => {
        const { guide, player, onClose } = guideFixture();
        guide.destroy();

        expect(player.seenGuides).toEqual(['shop.intro.v1']);
        expect(state.save).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it.each(['preview', 'different hero'] as const)('never saves dismissal for %s', (mode) => {
        const { guide, player } = guideFixture(mode !== 'preview');
        const otherPlayer = { seenGuides: [] };
        if (mode === 'different hero') state.getPlayer.mockReturnValue(otherPlayer);
        guide.dismiss();

        expect(player.seenGuides).toEqual(['shop.intro.v1']);
        expect(otherPlayer.seenGuides).toEqual([]);
        expect(state.save).not.toHaveBeenCalled();
    });
});

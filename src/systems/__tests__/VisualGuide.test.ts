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
vi.mock('../../ui/GuideConfirmButton', () => ({ GuideConfirmButton: vi.fn(), blockGuidePointer: vi.fn() }));

// Lifecycle tests are intentionally renderer-free. The guide browser regression
// exercises the real button, input blocker, optional audio and local saves.
function guideFixture(persist = true) {
    const player = { seenGuides: ['shop.intro.v1'], coins: { copper: 6 }, mastery: { attempts: 2 }, preparation: { charges: 0 } };
    state.getPlayer.mockReturnValue(player);
    const timer = { remove: vi.fn() };
    const tween = { remove: vi.fn() };
    const root = { destroy: vi.fn() };
    const next = { setEnabled: vi.fn(), destroy: vi.fn() };
    const events = { off: vi.fn(), emit: vi.fn() };
    const onClose = vi.fn();
    const guide = Object.assign(Object.create(VisualGuide.prototype), {
        player, persist, pages: [{ id: 'forge.merge.v1' }, { id: 'forge.split.v1' }],
        index: 0, completed: false, destroyed: false,
        timers: [timer], tweens: [tween], root, next, scene: { events }, onClose,
    });
    return { guide, player, timer, tween, root, next, events, onClose };
}

describe('VisualGuide acknowledgement', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not acknowledge an unfinished visual demonstration', () => {
        const { guide, player, events } = guideFixture();
        guide.advance();
        expect(guide.index).toBe(0);
        expect(player.seenGuides).toEqual(['shop.intro.v1']);
        expect(state.save).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
    });

    it('acknowledges each completed page once and completes the batch once', () => {
        const { guide, player, events, onClose, next } = guideFixture();
        const before = structuredClone(player);
        const show = vi.spyOn(guide, 'show').mockImplementation(() => { guide.completed = false; });
        guide.completed = true;
        guide.advance();
        guide.advance(); // The next demonstration has not finished: double taps do nothing.
        expect(show).toHaveBeenCalledOnce();
        expect(player.seenGuides).toEqual(['shop.intro.v1', 'forge.merge.v1']);
        expect(onClose).not.toHaveBeenCalled();
        guide.completed = true;
        guide.advance(); guide.advance();
        expect(player.seenGuides).toEqual(['shop.intro.v1', 'forge.merge.v1', 'forge.split.v1']);
        expect(state.save).toHaveBeenCalledTimes(2);
        expect(events.emit.mock.calls).toEqual([['guide-completed', 'forge.merge.v1'], ['guide-completed', 'forge.split.v1']]);
        expect(onClose).toHaveBeenCalledOnce();
        expect(next.destroy).toHaveBeenCalledOnce();
        expect({ ...player, seenGuides: before.seenGuides }).toEqual(before);
    });

    it('scene shutdown cancels pending work without acknowledging the page', () => {
        const { guide, player, timer, tween, root, next, onClose } = guideFixture();
        guide.destroy(); guide.destroy();
        expect(player.seenGuides).toEqual(['shop.intro.v1']);
        expect(state.save).not.toHaveBeenCalled();
        for (const cleanup of [timer.remove, tween.remove, root.destroy, next.destroy, onClose]) expect(cleanup).toHaveBeenCalledOnce();
        expect(audio.cancel).toHaveBeenCalledWith(guide);
    });

    it.each(['preview', 'different hero'] as const)('never saves acknowledgement for %s', mode => {
        const { guide, player } = guideFixture(mode !== 'preview');
        const otherPlayer = { seenGuides: [] };
        if (mode === 'different hero') state.getPlayer.mockReturnValue(otherPlayer);
        vi.spyOn(guide, 'show').mockImplementation(() => undefined);
        guide.completed = true; guide.advance();
        expect(player.seenGuides).toEqual(['shop.intro.v1']);
        expect(otherPlayer.seenGuides).toEqual([]);
        expect(state.save).not.toHaveBeenCalled();
    });
});

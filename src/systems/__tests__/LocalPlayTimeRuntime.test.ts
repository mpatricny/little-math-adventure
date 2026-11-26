import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { SaveSystem } from '../SaveSystem';
import { GameStateManager } from '../GameStateManager';
import { CoopSessionManager } from '../CoopSessionManager';
import { startLocalPlayTime, isLocalPlayTimeScene } from '../LocalPlayTimeRuntime';
import { checkpointLocalPlayTime } from '../LocalPlayTimeBridge';
import { localPlayTimeDay } from '../LocalPlayTime';

vi.mock('phaser', () => ({ default: {
    Math: { Between: (min: number) => min },
    Utils: { String: { UUID: () => 'test-crystal' } },
} }));
vi.mock('../MasterySystem', () => ({ MasterySystem: {
    getInstance: () => ({ updatePlayerLevel() {}, setActiveData() {} }),
    destroyInstance() {},
} }));

const start = new Date(2026, 10, 17, 12).getTime();
const day = localPlayTimeDay(start);
class LifecycleEvents extends EventTarget {
    on(event: string, callback: () => void): this { this.addEventListener(event, callback); return this; }
    off(event: string, callback: () => void): this { this.removeEventListener(event, callback); return this; }
    emit(event: string): void { this.dispatchEvent(new Event(event)); }
}
let wall: number;
let mono: number;
let gameState: GameStateManager;
let stop: (() => void) | undefined;
let tick: (() => void) | undefined;
let win: EventTarget & { setInterval: ReturnType<typeof vi.fn>; clearInterval: ReturnType<typeof vi.fn> };
let doc: EventTarget & { hidden: boolean; hasFocus: () => boolean };
let scene: { sys: { settings: { key: string }; isVisible: () => boolean }; time: { paused: boolean }; load: { isLoading: () => boolean } };
let game: { events: LifecycleEvents; isPaused: boolean; scene: { getScenes: () => typeof scene[] } };

function advance(ms: number, flush = true): void {
    wall += ms; mono += ms;
    if (flush) checkpointLocalPlayTime();
    else tick?.();
}
function measured(slot: number): number | undefined { return SaveSystem.readSnapshot(slot)?.player.playTime?.days[day]; }
function startRuntime(): void { stop = startLocalPlayTime(game as unknown as Phaser.Game); }

beforeEach(() => {
    wall = start; mono = 0; tick = undefined;
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); },
        removeItem: (key: string) => data.delete(key), clear: () => data.clear(),
        key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; },
    });
    win = Object.assign(new EventTarget(), {
        setInterval: vi.fn((callback: () => void) => { tick = callback; return 1; }),
        clearInterval: vi.fn(),
    });
    doc = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    vi.spyOn(Date, 'now').mockImplementation(() => wall);
    vi.spyOn(performance, 'now').mockImplementation(() => mono);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    gameState = GameStateManager.getInstance();
    gameState.reset('girl_knight', 'Anežka', 0);
    gameState.getPlayer().gameplayProfileId = 'a'; gameState.getMasteryData(); gameState.save();
    gameState.reset('boy_knight', 'Matěj', 1);
    gameState.getPlayer().gameplayProfileId = 'b'; gameState.getMasteryData(); gameState.save();
    gameState.loadSlot(0);
    scene = { sys: { settings: { key: 'BattleScene' }, isVisible: () => true }, time: { paused: false }, load: { isLoading: () => false } };
    game = { events: new LifecycleEvents(), isPaused: false, scene: { getScenes: () => [scene] } };
});

afterEach(() => {
    stop?.(); stop = undefined;
    // Avoid unrelated mastery/session shutdown work after destroying the fake environment.
    (CoopSessionManager as unknown as { instance: unknown }).instance = undefined;
    GameStateManager.destroyInstance();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('local play-time lifecycle and persistence', () => {
    it('runs with no analytics consent and excludes setup, menus and PlayersHubScene', () => {
        expect(localStorage.getItem('cislokraj_analytics_consent')).toBeNull();
        for (const key of ['PlayersHubScene', 'MenuNewScene', 'MenuScene', 'CoopSetupScene', 'CharacterSelectScene', 'AudioSettingsScene', 'BootScene']) {
            expect(isLocalPlayTimeScene(key)).toBe(false);
        }
        scene.sys.settings.key = 'PlayersHubScene';
        startRuntime(); advance(1000); advance(1000);
        expect(measured(0)).toBeUndefined();
        scene.sys.settings.key = 'BattleScene'; checkpointLocalPlayTime();
        advance(1000);
        scene.sys.settings.key = 'MenuNewScene'; checkpointLocalPlayTime();
        advance(1000);
        expect(measured(0)).toBe(1000);
        expect(measured(1)).toBeUndefined();
    });

    it('stops for desktop blur, hidden pages and pagehide, and resumes on focus/pageshow', () => {
        startRuntime(); advance(1000);
        win.dispatchEvent(new Event('blur')); advance(1000);
        win.dispatchEvent(new Event('focus')); advance(1000);
        doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); advance(1000);
        doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); advance(1000);
        win.dispatchEvent(new Event('pagehide')); advance(1000);
        win.dispatchEvent(new Event('pageshow')); advance(1000);
        expect(measured(0)).toBe(4000);
    });

    it('excludes game pause, the pause menu clock, loading, sleeping scenes and hidden scene surfaces', () => {
        startRuntime(); advance(1000);
        game.isPaused = true; game.events.emit('pause'); advance(1000);
        game.isPaused = false; game.events.emit('resume'); advance(1000);
        scene.time.paused = true; checkpointLocalPlayTime(); advance(1000);
        scene.time.paused = false; checkpointLocalPlayTime(); advance(1000);
        scene.load.isLoading = () => true; checkpointLocalPlayTime(); advance(1000);
        scene.load.isLoading = () => false; checkpointLocalPlayTime(); advance(1000);
        game.scene.getScenes = () => []; checkpointLocalPlayTime(); advance(1000);
        game.scene.getScenes = () => [scene]; checkpointLocalPlayTime(); advance(1000);
        scene.sys.isVisible = () => false; checkpointLocalPlayTime(); advance(1000);
        expect(measured(0)).toBe(5000);
    });

    it('keeps both complete co-op durations across A/B swaps, with independent mastery objects and active role', () => {
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        const masteryA = coop.getPlayerAMasteryData();
        const masteryB = coop.getPlayerBMasteryData();
        const masteryBefore = JSON.stringify([masteryA, masteryB]);
        startRuntime(); advance(1000);
        expect(coop.getActivePlayer()).toBe('A');
        coop.activatePlayerB(); advance(1000);
        expect(coop.getActivePlayer()).toBe('B');
        coop.activatePlayerA(); advance(1000);
        expect(measured(0)).toBe(3000); expect(measured(1)).toBe(3000);
        expect(gameState.getPlayer().playTime?.days[day]).toBe(3000);
        expect(coop.getPlayerAMasteryData()).toBe(masteryA);
        expect(coop.getPlayerBMasteryData()).toBe(masteryB);
        expect(JSON.stringify([masteryA, masteryB])).toBe(masteryBefore);
        expect(SaveSystem.readSnapshot(0)?.mathStats.masteryData).not.toHaveProperty('playTime');
        coop.endSession(); advance(1000);
        expect(measured(0)).toBe(4000); expect(measured(1)).toBe(3000);
    });

    it('preserves detached mana lane progress and later merges only their stale time field', () => {
        const coop = CoopSessionManager.getInstance(); coop.startSession(0, 1);
        const laneA = SaveSystem.readSnapshot(0)!;
        const laneB = SaveSystem.readSnapshot(1)!;
        startRuntime(); advance(1000);
        laneB.player.mana = 17;
        laneB.mathStats.totalAttempts = 23;
        laneB.mathStats.masteryData!.globalSolveSequence = 23;
        SaveSystem.save(1, laneB.player, laneB.mathStats);
        advance(1000);
        expect(SaveSystem.readSnapshot(1)?.mathStats).toEqual(laneB.mathStats);
        expect(SaveSystem.readSnapshot(1)?.player.mana).toBe(17);
        expect(measured(1)).toBe(2000);
        laneA.player.mana = 9; laneA.mathStats.totalAttempts = 11;
        SaveSystem.save(0, laneA.player, laneA.mathStats);
        SaveSystem.save(1, laneB.player, laneB.mathStats);
        expect(measured(0)).toBe(2000); expect(measured(1)).toBe(2000);
        expect(laneA.player.playTime?.days[day]).toBe(2000);
        expect(laneB.player.playTime?.days[day]).toBe(2000);
        expect(SaveSystem.readSnapshot(0)?.mathStats.totalAttempts).toBe(11);
        gameState.loadSlot(0);
        expect(gameState.getPlayer().mana).toBe(9);
        expect(gameState.getMathStats().totalAttempts).toBe(11);
        expect(coop.getActivePlayer()).toBe('A');
    });

    it('flushes before reload and preserves newer stored stats and time', () => {
        startRuntime(); advance(1000, false);
        expect(measured(0)).toBeUndefined();
        const newer = SaveSystem.readSnapshot(0)!;
        newer.player.mana = 27; newer.mathStats.totalAttempts = 42;
        // Simulate a lane write which did not replace the singleton player/stats objects.
        SaveSystem.save(0, newer.player, newer.mathStats);
        advance(1000, false); gameState.reload();
        expect(gameState.getPlayer().mana).toBe(27);
        expect(gameState.getMathStats().totalAttempts).toBe(42);
        expect(gameState.getPlayer().playTime?.days[day]).toBe(2000);
        stop!(); stop = undefined; advance(60_000);
        startRuntime(); advance(1000);
        expect(measured(0)).toBe(3000);
    });

    it.each(['beginUnderwaterPreview', 'beginComparisonPreview'] as const)('never measures %s into real or disposable profiles', method => {
        startRuntime(); advance(1000, false);
        gameState[method]();
        const realSave = JSON.stringify(SaveSystem.readSnapshot(0));
        advance(1000); advance(1000); gameState.save();
        expect(JSON.stringify(SaveSystem.readSnapshot(0))).toBe(realSave);
        expect(gameState.getPlayer().playTime).toBeUndefined();
        gameState.endPreview(); advance(1000);
        expect(measured(0)).toBe(2000);
    });

    it('does not transfer time to another hero replacing a slot, and preserves per-slot independence', () => {
        startRuntime(); advance(1000);
        const other = SaveSystem.readSnapshot(1)!;
        SaveSystem.save(0, other.player, other.mathStats);
        advance(1000); // stale runtime owner a must not add time to replacement b
        expect(measured(0)).toBeUndefined(); expect(measured(1)).toBeUndefined();
        gameState.loadSlot(0); advance(1000);
        expect(measured(0)).toBe(1000); expect(measured(1)).toBeUndefined();
    });

    it('rebases a synchronous load/save observer during a time flush without recursion or double credit', () => {
        startRuntime();
        let observing = true;
        const unobserve = SaveSystem.observeChanges(() => {
            if (!observing) return;
            observing = false;
            gameState.loadSlot(1);
            gameState.save();
        });
        advance(1000);
        expect(gameState.getActiveSlotIndex()).toBe(1);
        advance(1000);
        unobserve();
        expect(measured(0)).toBe(1000); expect(measured(1)).toBe(1000);
    });

    it('retains a blocked checkpoint until writes recover without double credit', () => {
        startRuntime();
        const unguard = SaveSystem.guardWrites(() => false);
        advance(1000); expect(measured(0)).toBeUndefined();
        unguard(); advance(1000);
        expect(measured(0)).toBe(2000);
    });

    it('round-trips measured and unmeasured profiles through save export/import', () => {
        startRuntime(); advance(1000); stop!(); stop = undefined;
        const bundle = SaveSystem.exportBundle()!;
        localStorage.clear();
        expect(SaveSystem.importBundle(bundle).ok).toBe(true);
        expect(measured(0)).toBe(1000); expect(measured(1)).toBeUndefined();
    });
});

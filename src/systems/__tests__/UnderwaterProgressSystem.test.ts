import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canEnterUnderwater, canUseUnderwaterExit, claimUnderwaterChest, completeUnderwaterEncounter,
    canRestoreUnderwaterMechanism, restoreUnderwaterMechanism, recordUnderwaterMechanismAttempt, canOpenUnderwaterChest,
    getUnderwaterProgress, recordUnderwaterPuzzleAttempt, UNDERWATER_ROOMS, visitUnderwaterRoom } from '../UnderwaterProgressSystem';
import { completeUnderwaterMechanismStage, claimUnderwaterDepthCrystal, setUnderwaterRestPoint } from '../UnderwaterProgressSystem';
import { getPlayerResumeScene } from '../SilverpondProgressSystem';
import { GameStateManager } from '../GameStateManager';
import { MasterySystem } from '../MasterySystem';
import { StorySystem } from '../StorySystem';
import { ProblemDatabase } from '../ProblemDatabase';
import { SaveSystem } from '../SaveSystem';
import { createEncounterCatalog } from '../EncounterCatalog';
import { DailyProgressSystem } from '../DailyProgressSystem';
import type { EnemyDefinition, PlayerState } from '../../types';
import encounters from '../../../public/assets/data/encounters.json';
import enemies from '../../../public/assets/data/enemies.json';
import scenes from '../../../public/assets/data/scenes.json';
import { resolveProductionJourneyEncounter } from '../../simulation/ProductionEncounterAdapter';

vi.mock('phaser', () => ({ default: { Math: { Between: (min: number) => min }, Utils: { String: { UUID: () => 'test-id' } } } }));

beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
        clear: () => data.clear(),
        key: (index: number) => [...data.keys()][index] ?? null,
        get length() { return data.size; },
    });
    GameStateManager.destroyInstance();
    MasterySystem.destroyInstance();
});

function player(): PlayerState { return GameStateManager.getInstance().getPlayer(); }
const guardian = UNDERWATER_ROOMS.sp_shallows.encounter!.id;

describe('underwater exploration state', () => {
    it('hydrates a legacy save without unlocking water or overwriting story progression', () => {
        const p = player();
        const story = structuredClone(p.storyProgress);
        expect(canEnterUnderwater(p)).toBe(false);
        expect(getUnderwaterProgress(p)).toMatchObject({ active: false, introSeen: false, bellNotes: 0 });
        expect(p.storyProgress).toEqual(story);
        expect(getPlayerResumeScene(p)).not.toBe('UnderwaterRoomScene');
    });

    it('requires the fairy scale, and supports old arena-six saves', () => {
        const p = player();
        StorySystem.getInstance().getProgress().hasUnlockedSilverpond = true;
        p.arena.completedArenaLevels = [6];
        expect(canEnterUnderwater(p)).toBe(true);
        p.arena.completedArenaLevels = [];
        expect(canEnterUnderwater(p)).toBe(false);
        p.storyProgress!.hasWaterBreathingScale = true;
        expect(canEnterUnderwater(p)).toBe(true);
    });

    it('gates only the forward route, not the escape to the surface', () => {
        const p = player();
        expect(canUseUnderwaterExit(p, 'sp_shallows', 'surface')).toBe(true);
        expect(canUseUnderwaterExit(p, 'sp_shallows', 'bell')).toBe(false);
        expect(canUseUnderwaterExit(p, 'sp_shallows', 'unknown')).toBe(false);
        expect(completeUnderwaterEncounter(p, guardian)).toBe(true);
        expect(completeUnderwaterEncounter(p, guardian)).toBe(false);
        expect(completeUnderwaterEncounter(p, 'invented')).toBe(false);
        expect(canUseUnderwaterExit(p, 'sp_shallows', 'bell')).toBe(true);
    });

    it('visits both directions and preserves completed objects on return', () => {
        const p = player();
        completeUnderwaterEncounter(p, guardian);
        expect(claimUnderwaterChest(p, 'sp_shallows')).toMatchObject({ coins: 5, mana: 3 });
        visitUnderwaterRoom(p, 'sp_bell_hub', 'shallows');
        visitUnderwaterRoom(p, 'sp_shallows', 'bell');
        expect(claimUnderwaterChest(p, 'sp_shallows')).toBeNull();
        expect(getUnderwaterProgress(p).defeatedEncounters).toEqual([guardian]);
        expect(getUnderwaterProgress(p).entryId).toBe('bell');
        expect(() => visitUnderwaterRoom(p, 'unknown', 'entry')).toThrow();
    });

    it('counts mistakes once without losing notes and stops at three', () => {
        const p = player();
        [true, false, true, true, true].forEach(correct => recordUnderwaterPuzzleAttempt(p, correct));
        expect(getUnderwaterProgress(p)).toMatchObject({ bellNotes: 3, puzzleAttempts: 4 });
    });

    it('keeps rewards independent for two participants with different histories', () => {
        const a = player(), b = structuredClone(a);
        claimUnderwaterChest(a, 'sp_shallows');
        expect(claimUnderwaterChest(a, 'sp_shallows')).toBeNull();
        expect(claimUnderwaterChest(b, 'sp_shallows')).not.toBeNull();
        expect(claimUnderwaterChest(b, 'sp_shallows')).toBeNull();
    });

    it('resumes underwater only with an active checkpoint and permission', () => {
        const p = player();
        StorySystem.getInstance().getProgress().hasCompletedIntro = true;
        p.storyProgress!.hasUnlockedSilverpond = true;
        visitUnderwaterRoom(p, 'sp_bell_hub', 'shallows');
        expect(getPlayerResumeScene(p)).toBe('SilverpondTownMockScene');
        p.storyProgress!.hasWaterBreathingScale = true;
        expect(getPlayerResumeScene(p)).toBe('UnderwaterRoomScene');
        getUnderwaterProgress(p).active = false;
        expect(getPlayerResumeScene(p)).toBe('SilverpondTownMockScene');
    });

    it('roundtrips the chapter through save loading and portable export/import', () => {
        const state = GameStateManager.getInstance();
        state.reset('boy_knight', 'Test diver', 0);
        const p = state.getPlayer();
        visitUnderwaterRoom(p, 'sp_bell_hub', 'shallows');
        claimUnderwaterChest(p, 'sp_shallows');
        completeUnderwaterEncounter(p, guardian);
        recordUnderwaterPuzzleAttempt(p, true);
        completeUnderwaterEncounter(p, UNDERWATER_ROOMS.sp_reed_garden.encounter!.id);
        recordUnderwaterMechanismAttempt(p, 'sp_reed_garden', true);
        restoreUnderwaterMechanism(p, 'sp_reed_garden');
        completeUnderwaterMechanismStage(p, 'sp_shell_shrine', 0);
        completeUnderwaterEncounter(p, UNDERWATER_ROOMS.sp_current_chamber.encounter!.id);
        restoreUnderwaterMechanism(p, 'sp_current_chamber');
        completeUnderwaterEncounter(p, 'silverpond-depth-watch');
        setUnderwaterRestPoint(p, 'sp_depth_gate', 'heart');
        completeUnderwaterEncounter(p, 'silverpond-depth-guardian');
        getUnderwaterProgress(p).descentSeen = true;
        getUnderwaterProgress(p).litHubSeals = ['shell', 'current'];
        getUnderwaterProgress(p).revealedPassages = ['sp_bell_hub:depths', 'sp_reed_garden:shrine'];
        claimUnderwaterDepthCrystal(p);
        state.save();
        const expected = structuredClone(p.underwaterProgress);
        expect(SaveSystem.load(0)?.player.underwaterProgress).toEqual(expected);
        const bundle = SaveSystem.exportBundle()!;
        localStorage.clear();
        expect(SaveSystem.importBundle(bundle).ok).toBe(true);
        expect(SaveSystem.load(0)?.player.underwaterProgress).toEqual(expected);
    });

    it('isolates the menu playtest from all slot writes, rewards and active-slot metadata', () => {
        const state = GameStateManager.getInstance();
        state.reset('boy_knight', 'Original hero', 2);
        const originalPlayer = state.getPlayer();
        const originalSave = localStorage.getItem('littleMathAdventure_slot_2');
        const originalActiveSlot = SaveSystem.getActiveSlot();
        state.beginUnderwaterPreview();
        expect(state.getActiveSlotIndex()).toBeNull();
        state.getPlayer().mana = 999;
        claimUnderwaterChest(state.getPlayer(), 'sp_shallows');
        state.save();
        state.beginUnderwaterPreview(); // Double click doesn't replace the restore point.
        expect(localStorage.getItem('littleMathAdventure_slot_2')).toBe(originalSave);
        expect(SaveSystem.getActiveSlot()).toBe(originalActiveSlot);
        expect(state.endPreview()).toBe(true);
        expect(state.getPlayer()).toBe(originalPlayer);
        expect(state.getActiveSlotIndex()).toBe(2);
        expect(state.endPreview()).toBe(false);
    });

    it('records underwater arithmetic in the real daily learning history', () => {
        const mastery = MasterySystem.getInstance();
        const problem = ProblemDatabase.getInstance().getProblemsForForm('A1', 'missing_part')[0];
        mastery.recordSolve(problem.key, true, 4000, 'underwater_bell');
        const days = DailyProgressSystem.getRecentDays(player(), GameStateManager.getInstance().getMathStats(), 1);
        expect(days[0]).toMatchObject({ attempts: 1, correct: 1 });
    });

    it('keeps application timing out of retrieval speed and slow-pool scheduling', () => {
        const mastery = MasterySystem.getInstance();
        const problem = ProblemDatabase.getInstance().getProblemsForForm('A1', 'missing_part')[0];
        mastery.recordSolve(problem.key, true, 3000, 'battle');
        mastery.recordSolve(problem.key, true, 19000, 'underwater_bell');
        expect(mastery.getMedianRT('A1')).toBe(3000);
        expect(mastery.getFormMedianRT('A1', 'missing_part')).toBe(3000);
        expect(mastery.getAverageRT(problem.key)).toBe(3000);
        expect(GameStateManager.getInstance().getMasteryData().slowPool).not.toContain(problem.key);
    });

    it('allows an assisted world solution without resetting progress or faking independent arithmetic', () => {
        recordUnderwaterPuzzleAttempt(player(), true, true);
        expect(getUnderwaterProgress(player())).toMatchObject({ bellNotes: 1, assistedPuzzleAttempts: 1 });
        expect(GameStateManager.getInstance().getMasteryData().globalSolveSequence).toBe(0);
    });
});

describe('underwater content contracts', () => {
    for (const first of ['sp_reed_garden', 'sp_sunken_canal']) it(`opens a bidirectional shortcut when ${first} is completed first`, () => {
        const p = player();
        for (const exit of ['garden', 'canal']) expect(canUseUnderwaterExit(p, 'sp_bell_hub', exit)).toBe(false);
        getUnderwaterProgress(p).bellNotes = 3; // Existing saves need no replay.
        for (const exit of ['garden', 'canal']) expect(canUseUnderwaterExit(p, 'sp_bell_hub', exit)).toBe(true);
        for (const room of ['sp_reed_garden', 'sp_sunken_canal']) {
            expect(canUseUnderwaterExit(p, room, 'bell')).toBe(true);
            expect(canRestoreUnderwaterMechanism(p, room)).toBe(false);
            expect(restoreUnderwaterMechanism(p, room)).toBe(false);
        }
        expect(canOpenUnderwaterChest(p, 'sp_sunken_canal')).toBe(true);
        expect(UNDERWATER_ROOMS.sp_sunken_canal.chest?.lock).toBe('word');
        expect(canUseUnderwaterExit(p, 'sp_reed_garden', 'canal')).toBe(false);
        const rooms = [first, first === 'sp_reed_garden' ? 'sp_sunken_canal' : 'sp_reed_garden'];
        for (const room of rooms) {
            completeUnderwaterEncounter(p, UNDERWATER_ROOMS[room].encounter!.id);
            recordUnderwaterMechanismAttempt(p, room, true);
            expect(restoreUnderwaterMechanism(p, room)).toBe(true);
            expect(restoreUnderwaterMechanism(p, room)).toBe(false);
            recordUnderwaterMechanismAttempt(p, room, false);
            expect(p.underwaterProgress!.mechanismAttempts![UNDERWATER_ROOMS[room].mechanism!.id]).toEqual({ attempts: 1, assisted: 1 });
            expect(canUseUnderwaterExit(p, 'sp_reed_garden', 'canal')).toBe(true);
            expect(canUseUnderwaterExit(p, 'sp_sunken_canal', 'garden')).toBe(true);
        }
        expect(claimUnderwaterChest(p, 'sp_sunken_canal')).toMatchObject({ coins: 8, mana: 4 });
        expect(claimUnderwaterChest(p, 'sp_sunken_canal')).toBeNull();
    });

    it('uses the shared enemy catalog and the same solo/co-op roster in the simulator', () => {
        const catalog = createEncounterCatalog(encounters, { core: enemies as EnemyDefinition[] });
        for (const room of Object.values(UNDERWATER_ROOMS).filter(room => room.encounter)) for (const mode of ['solo', 'coop'] as const) {
            const runtime = catalog.resolveJourneyEncounter(room.encounter!.id, mode);
            const simulation = resolveProductionJourneyEncounter(room.encounter!.id, mode);
            expect(simulation.enemies.map(e => ({ id: e.id, hp: e.hp })))
                .toEqual(runtime.enemies.map(e => ({ id: e.id, hp: e.hp })));
            const soloSize = catalog.resolveJourneyEncounter(room.encounter!.id, 'solo').enemies.length;
            expect(runtime.enemies).toHaveLength(soloSize + (mode === 'coop' && !runtime.boss ? 1 : 0));
        }
    });

    it('still accepts v3 documents without an underwater chapter', () => {
        const old = structuredClone(encounters) as Record<string, any>;
        old.sceneOrder.pop(); delete old.scenes.UnderwaterRoomScene;
        expect(() => createEncounterCatalog(old, { core: enemies as EnemyDefinition[] })).not.toThrow();
    });

    it('resolves every room, path, return entry and object through scene-editor hosts', () => {
        const layouts = scenes.scenes as Record<string, any>;
        for (const room of Object.values(UNDERWATER_ROOMS)) {
            const layout = layouts[room.layout];
            const hosts = new Set(layout.elements.map((e: any) => e.id));
            for (const exit of room.exits) {
                expect(hosts.has(exit.host)).toBe(true);
                if (exit.target !== 'surface') {
                    const target = layouts[UNDERWATER_ROOMS[exit.target].layout];
                    expect(target.zones.some((zone: any) => zone.id === exit.entry)).toBe(true);
                }
            }
            if (room.encounter) expect(hosts.has(room.encounter.host)).toBe(true);
            if (room.chest) expect(hosts.has(room.chest.host)).toBe(true);
            if (room.puzzle) expect(hosts.has(room.puzzle.host)).toBe(true);
            if (room.mechanism) expect(hosts.has(room.mechanism.host)).toBe(true);
            for (let i = 0; i < 4; i++) expect(layout.zones.some((zone: any) => zone.id === `path${i}`)).toBe(true);
        }
    });
});

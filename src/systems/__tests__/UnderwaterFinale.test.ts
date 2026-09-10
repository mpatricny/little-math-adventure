/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import bossHudSource from '../../ui/UnderwaterBossHud.ts?raw';
import layouts from '../../../public/assets/data/scenes.json';
import type { PlayerState, EnemyDefinition } from '../../types';
import { canUseUnderwaterExit, getUnderwaterProgress, completeUnderwaterEncounter, claimUnderwaterDepthCrystal,
    setUnderwaterRestPoint, getUnderwaterRestPoint, restoreUnderwaterMechanism, hasUnderwaterBlessing } from '../UnderwaterProgressSystem';
import { LIGHT_START, traceUnderwaterLight, underwaterLightHint } from '../UnderwaterLightPuzzle';
import { resolveTidalWave } from '../UnderwaterTidalWave';
import { createEncounterCatalog } from '../EncounterCatalog';
import encounters from '../../../public/assets/data/encounters.json';
import enemies from '../../../public/assets/data/enemies.json';

describe('lake finale', () => {
    it('keeps every boss UI reference in the scene editor and provides two screen-heights of descent', () => {
        const hosts = new Set(layouts.scenes.UnderwaterBossHud.elements.map(e => e.id));
        for (const match of bossHudSource.matchAll(/'(boss\w+Host)'/g)) expect(hosts.has(match[1]), match[1]).toBe(true);
        const descent = layouts.scenes.UnderwaterDescent;
        const bg = descent.elements.find(e => e.id === 'descentBackdropHost')!;
        expect(bg.height - 720).toBeGreaterThanOrEqual(1440);
        for (let i = 1; i < descent.zones.length; i++) expect(descent.zones[i].y).toBeGreaterThan(descent.zones[i - 1].y);
    });
    it('requires both seals for the depth gate, and its guard for the descent', () => {
        const p = {} as PlayerState;
        expect(canUseUnderwaterExit(p, 'sp_bell_hub', 'depths')).toBe(false);
        getUnderwaterProgress(p).restoredMechanisms = ['shrine-memory'];
        expect(canUseUnderwaterExit(p, 'sp_bell_hub', 'depths')).toBe(false);
        getUnderwaterProgress(p).restoredMechanisms!.push('chamber-routes');
        expect(canUseUnderwaterExit(p, 'sp_bell_hub', 'depths')).toBe(true);
        expect(canUseUnderwaterExit(p, 'sp_depth_gate', 'heart')).toBe(false);
        completeUnderwaterEncounter(p, 'silverpond-depth-watch');
        expect(canUseUnderwaterExit(p, 'sp_depth_gate', 'heart')).toBe(true);
        expect(claimUnderwaterDepthCrystal(p)).toBe(false);
    });
    it('keeps the crystal pending after victory and claims it only once across reloads', () => {
        const p = {} as PlayerState, guest = {} as PlayerState;
        completeUnderwaterEncounter(p, 'silverpond-depth-guardian');
        const loaded = JSON.parse(JSON.stringify(p));
        expect(claimUnderwaterDepthCrystal(loaded)).toBe(true);
        expect(claimUnderwaterDepthCrystal(JSON.parse(JSON.stringify(loaded)))).toBe(false);
        expect(claimUnderwaterDepthCrystal(guest)).toBe(false);
        expect(getUnderwaterProgress(guest).defeatedEncounters).toEqual([]);
    });
    it('unlocks a free checkpoint only after the gate encounter', () => {
        const p = {} as PlayerState;
        setUnderwaterRestPoint(p, 'sp_depth_gate', 'heart');
        expect(getUnderwaterRestPoint(p).roomId).toBe('sp_shallows');
        completeUnderwaterEncounter(p, 'silverpond-depth-watch');
        setUnderwaterRestPoint(p, 'sp_depth_gate', 'heart');
        expect(getUnderwaterRestPoint(JSON.parse(JSON.stringify(p)))).toEqual({ roomId: 'sp_depth_gate', entryId: 'heart' });
    });
    it('shares a newly solved grotto blessing without copying historical victories', () => {
        const a = {} as PlayerState, b = {} as PlayerState;
        expect(restoreUnderwaterMechanism(a, 'sp_glow_grotto')).toBe(false);
        completeUnderwaterEncounter(a, 'silverpond-grotto-keeper');
        expect(restoreUnderwaterMechanism(a, 'sp_glow_grotto')).toBe(true);
        expect(restoreUnderwaterMechanism(b, 'sp_glow_grotto', a)).toBe(true);
        expect(hasUnderwaterBlessing(b)).toBe(true);
        expect(getUnderwaterProgress(b).defeatedEncounters).toEqual([]);
        expect(getUnderwaterProgress(b).puzzleAttempts).toBe(0);
    });
    it('has one optical solution out of 256, and does not accept a straight shortcut', () => {
        const solutions = Array.from({ length: 256 }, (_, n) => [0, 1, 2, 3].map(i => Math.floor(n / 4 ** i) % 4))
            .filter(turns => traceUnderwaterLight(turns).solved);
        expect(solutions).toHaveLength(1);
        expect(traceUnderwaterLight([3, 3, 3, 3])).toMatchObject({ reachesPearl: true, solved: false });
        expect(traceUnderwaterLight(LIGHT_START).solved).toBe(false);
        const assisted = [...LIGHT_START];
        for (let i = 0; i < 4; i++) { const hint = underwaterLightHint(assisted); if (hint) assisted[hint.index] = hint.turn; }
        expect(traceUnderwaterLight(assisted).solved).toBe(true);
    });
    it('resolves three phases and co-op HP from the encounter catalog, with one blessing per defender', () => {
        const catalog = createEncounterCatalog(encounters, { core: enemies as EnemyDefinition[] });
        const solo = catalog.resolveJourneyEncounter('silverpond-depth-guardian', 'solo').boss!;
        const coop = catalog.resolveJourneyEncounter('silverpond-depth-guardian', 'coop').boss!;
        expect(solo.phases).toEqual(encounters.bosses['depth-guardian-v1'].phases);
        expect(coop.phases.every((p, i) => p.hp > solo.phases[i].hp)).toBe(true);
        expect(coop.tidalWave).toEqual(solo.tidalWave);
        const tuning = solo.tidalWave!;
        expect(resolveTidalWave(tuning, 1, true)).toMatchObject({ wave: false, blessingUsed: false });
        expect(resolveTidalWave(tuning, tuning.everyTurns, true)).toMatchObject({ wave: true, blessingUsed: true,
            bonusDamage: Math.max(0, tuning.bonusDamage - tuning.blessingReduction) });
        expect(resolveTidalWave(tuning, tuning.everyTurns * 2, false).bonusDamage).toBe(tuning.bonusDamage);
    });
});

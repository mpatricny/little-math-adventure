import { describe, expect, it } from 'vitest';
import type { EnemyDefinition } from '../../types';
import enemiesJson from '../../../public/assets/data/enemies.json';
import encountersJson from '../../../public/assets/data/encounters.json';
import { resolveProductionArenaWave, resolveProductionJourneyEncounter, createProductionEncounterAdapter } from '../ProductionEncounterAdapter';
import { simulateCombatEncounter, summarizeCombatAudit } from '../CombatEncounterSimulator';
import { AUDIT_BUILDS, AUDIT_ANSWERS, runUnderwaterRoute } from '../UnderwaterBalanceAudit';

describe('underwater continuation balance', () => {
    it('matches final-arena pressure and duration, rejecting weak base and unadjusted two-enemy attacks', () => {
        const player = { ...AUDIT_BUILDS.tide, potion: true };
        const arena = resolveProductionArenaWave({ arenaLevel: 6, waveIndex: 4, mode: 'solo' });
        const entry = resolveProductionJourneyEncounter('silverpond-shallows-guardian', 'solo');
        const sample = (encounter: typeof entry | typeof arena) => summarizeCombatAudit(Array.from({ length: 500 }, (_, i) =>
            simulateCombatEncounter(encounter, [player], AUDIT_ANSWERS.steady, i + 1)));
        const reference = sample(arena);
        const actual = sample(entry);
        expect(actual.caps).toBe(0);
        expect(actual.rounds).toBeGreaterThan(reference.rounds * .85);
        expect(actual.rounds).toBeLessThan(reference.rounds * 1.25);
        // Similar duration alone accepted the former attack-9 interim. Require
        // comparable incoming pressure, without fixing enemy IDs or HP totals.
        expect(actual.hpLost).toBeGreaterThanOrEqual(reference.hpLost * .9);
        expect(actual.hpLost).toBeLessThan(reference.hpLost * 1.35);

        const unadjusted = sample({ ...entry, enemies: entry.enemies.map(enemy => ({ ...enemy, atk: arena.enemies[0].atk })) });
        expect(unadjusted.hpLost).toBeLessThan(reference.hpLost * .9);
        const weakBase = sample({ ...entry, enemies: entry.enemies.map(enemy => {
            const definition = enemiesJson.find(source => source.id === enemy.id)!;
            const base = enemiesJson.find(source => source.id === definition.baseEnemyId)!;
            return { ...enemy, hp: base.hp, atk: base.attack, defense: base.defense };
        }) });
        expect(weakBase.hpLost).toBeLessThan(reference.hpLost * .9);
    });

    it('keeps bounded potion-free entry continuation near the known arena challenge', () => {
        const player = { ...AUDIT_BUILDS.tide, potion: false };
        const arena = resolveProductionArenaWave({ arenaLevel: 6, waveIndex: 4, mode: 'solo' });
        const entry = resolveProductionJourneyEncounter('silverpond-shallows-guardian', 'solo');
        const boundedWinRate = (encounter: typeof entry | typeof arena) => Array.from({ length: 500 }, (_, seed) => {
            // A defeat checkpoint restores HP, never a potion. Compare at most
            // three attempts at the same uncleared fight, with independent seeds.
            return [1, 2, 3].some(attempt => simulateCombatEncounter(
                encounter, [player], AUDIT_ANSWERS.steady, (seed + 1) * 1009 + attempt,
            ).won);
        }).filter(Boolean).length / 500;
        expect(boundedWinRate(entry)).toBeGreaterThanOrEqual(boundedWinRate(arena) - .1);
    });

    it('audits a staged catalog through production validation without reading a copied fallback roster', () => {
        const stagedEnemies = structuredClone(enemiesJson);
        stagedEnemies.find(e => e.id === 'silverpond_silverfin_scalefish_deep')!.hp = 99;
        const staged = createProductionEncounterAdapter(encountersJson, stagedEnemies as unknown as EnemyDefinition[]);
        expect(staged.resolveJourneyEncounter('silverpond-shallows-guardian').enemies.map(e => e.hp)).toEqual([99, 99]);
        const production = resolveProductionJourneyEncounter('silverpond-shallows-guardian');
        expect(production.enemies.map(e => e.hp)).toEqual(production.enemies.map(e => enemiesJson.find(source => source.id === e.id)!.hp));
    });

    it('retains two combatants and solo gold rewards per co-op participant instead of adding burst damage', () => {
        for (const room of Object.values(encountersJson.scenes.UnderwaterRoomScene.rooms)) for (const encounter of room.encounters) {
            const solo = resolveProductionJourneyEncounter(encounter.id, 'solo');
            const coop = resolveProductionJourneyEncounter(encounter.id, 'coop');
            expect(coop.enemies).toHaveLength(solo.enemies.length);
            expect(coop.enemies.map(e => [e.id, e.atk, e.defense, e.coinMin, e.coinMax]))
                .toEqual(solo.enemies.map(e => [e.id, e.atk, e.defense, e.coinMin, e.coinMax]));
            if (!coop.boss) expect(coop.coopAdjustment).toBe('scale-full-roster');
        }
    });

    it('preserves each base species and avoids full-correct defense locks even for attack8 with an iron sword', () => {
        const deep = enemiesJson.filter(enemy => enemy.id.endsWith('_deep'));
        expect(deep.length).toBeGreaterThan(0);
        for (const variant of deep) {
            const base = enemiesJson.find(enemy => enemy.id === variant.baseEnemyId)!;
            expect(base, variant.id).toBeDefined();
            expect(variant.rank).toBe('elite');
            expect(variant.animPrefix).toBe(base.animPrefix);
            expect(variant.hp).toBeGreaterThanOrEqual(base.hp);
            expect(variant.defense).toBeLessThan(AUDIT_BUILDS.legacy.attack);
        }
    });

    it('carries one potion over an entire route and bounds retry attempts without refilling it', () => {
        const player = { ...AUDIT_BUILDS.tide, hp: 1 };
        const resolve: typeof resolveProductionJourneyEncounter = (id, mode = 'solo') => ({
            ...resolveProductionJourneyEncounter(id, mode), boss: null, kind: 'battle',
            enemies: [{ id: 'fixture', name: 'Fixture', hp: 1, atk: 0, defense: 0, xp: 0, coinMin: 0, coinMax: 0, difficulty: 0 }],
        });
        const result = runUnderwaterRoute([player], AUDIT_ANSWERS.perfect, 10, { maxAttempts: 3 }, resolve);
        expect(result.completed).toBe(true);
        expect(result.stages.reduce((sum, stage) => sum + stage.potionsUsed, 0)).toBe(1);
        expect(result.state[0].potion).toBe(false);
        expect(result.stages.every(stage => stage.attempt === 1)).toBe(true);
    });
});

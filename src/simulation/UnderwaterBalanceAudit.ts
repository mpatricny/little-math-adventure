import roomsJson from '../../public/assets/data/underwater-rooms.json';
import { resolveProductionArenaWave, resolveProductionJourneyEncounter } from './ProductionEncounterAdapter';
import { simulateCombatEncounter, summarizeCombatAudit, type CombatAuditPlayer, type CombatAuditAnswers } from './CombatEncounterSimulator';
export const UNDERWATER_AUDIT_IDS = [
    'silverpond-shallows-guardian', 'silverpond-garden-patrol', 'silverpond-canal-blockade',
    'silverpond-chamber-keepers', 'silverpond-wreck-watch', 'silverpond-grotto-keeper',
    'silverpond-depth-watch', 'silverpond-depth-guardian',
];
export const AUDIT_BUILDS: Record<string, CombatAuditPlayer> = {
    legacy: { maxHp: 24, attack: 8, weaponId: 'sword_iron', shieldId: 'shield_iron', petId: 'pet_wolf', potion: true },
    tide: { maxHp: 32, attack: 12, weaponId: 'sword_silverpond_tide', shieldId: 'shield_silverpond_tide', petId: 'pet_silverpond_silverfin_scalefish', potion: true },
    pearl: { maxHp: 40, attack: 18, weaponId: 'sword_silverpond_pearl', shieldId: 'shield_silverpond_pearl', petId: 'pet_silverpond_bubble_crab', potion: true },
    depth: { maxHp: 32, attack: 12, weaponId: 'sword_silverpond_depth', shieldId: 'shield_silverpond_depth', petId: 'pet_silverpond_bubble_crab', potion: true },
    oldFixture: { maxHp: 55, attack: 8, weaponId: 'sword_iron', shieldId: 'shield_iron', potion: true },
};
export const AUDIT_ANSWERS: Record<string, CombatAuditAnswers> = {
    fluent: { attack: .95, sword: .9, pet: .95, block: .95, speed: 'swift' },
    perfect: { attack: 1, sword: 1, pet: 1, block: 1, speed: 'swift' },
    careful: { attack: .9, sword: .85, pet: .9, block: .9, speed: 'slow' },
    steady: { attack: .85, sword: .8, pet: .85, block: .85, speed: 'swift' },
    learning: { attack: .7, sword: .65, pet: .7, block: .7, speed: 'slow' },
};
export const AUDIT_SCENARIOS = [
    { id: 'tide-steady', build: 'tide', answers: 'steady' },
    { id: 'tide-fluent', build: 'tide', answers: 'fluent' },
    { id: 'tide-fluent-no-potion', build: 'tide', answers: 'fluent', noPotion: true },
    { id: 'tide-careful', build: 'tide', answers: 'careful' },
    { id: 'tide-learning', build: 'tide', answers: 'learning' },
    { id: 'pearl-steady', build: 'pearl', answers: 'steady' },
    { id: 'pearl-careful', build: 'pearl', answers: 'careful' },
    { id: 'depth-steady', build: 'depth', answers: 'steady' },
    { id: 'depth-careful', build: 'depth', answers: 'careful' },
    { id: 'tide-blessed', build: 'tide', answers: 'steady', blessing: true },
    { id: 'legacy-perfect', build: 'legacy', answers: 'perfect' },
    { id: 'legacy-steady', build: 'legacy', answers: 'steady' },
    { id: 'old-fixture-perfect', build: 'oldFixture', answers: 'perfect' },
    { id: 'tide-3operand', build: 'tide', answers: 'steady', threeOperand: .25 },
    { id: 'tide-no-pet', build: 'tide', answers: 'steady', noPet: true },
    { id: 'tide-no-potion', build: 'tide', answers: 'steady', noPotion: true },
    { id: 'tide-no-charge', build: 'tide', answers: 'steady', chargeEligible: false },
] as const;

export function runUnderwaterAudit(runs = 500, resolveJourney = resolveProductionJourneyEncounter, resolveArena = resolveProductionArenaWave) {
    const rows: Record<string, unknown>[] = [];
    for (const scenario of AUDIT_SCENARIOS) {
        const player = { ...AUDIT_BUILDS[scenario.build],
            ...('blessing' in scenario ? { blessing: true } : {}), ...('noPet' in scenario ? { petId: undefined } : {}), ...('noPotion' in scenario ? { potion: false } : {}) };
        const answers = { ...AUDIT_ANSWERS[scenario.answers], ...('threeOperand' in scenario ? { threeOperand: scenario.threeOperand } : {}), ...('chargeEligible' in scenario ? { chargeEligible: scenario.chargeEligible } : {}) };
        for (const mode of ['solo', 'coop', 'asymmetric'] as const) {
            const catalogMode = mode === 'solo' ? 'solo' : 'coop';
            const players = mode === 'solo' ? [player] : [player, mode === 'asymmetric' ? { ...AUDIT_BUILDS.legacy, ...('noPotion' in scenario ? { potion: false } : {}) } : player];
            const profiles = mode === 'asymmetric' ? [answers, AUDIT_ANSWERS.learning] : answers;
            for (const encounterId of ['arena-6-wave-5', ...UNDERWATER_AUDIT_IDS]) {
                const encounter = encounterId === 'arena-6-wave-5'
                    ? resolveArena({ arenaLevel: 6, waveIndex: 4, mode: catalogMode })
                    : resolveJourney(encounterId, catalogMode);
                for (const order of ['front', 'reverse'] as const) {
                    const enemies = order === 'front' ? encounter.enemies : [...encounter.enemies].reverse();
                    const results = Array.from({ length: runs }, (_, seed) => simulateCombatEncounter({ ...encounter, enemies }, players, profiles, seed + 1));
                    rows.push({ scenario: scenario.id, mode, order, encounter: encounterId,
                        ...summarizeCombatAudit(results) });
                }
            }
        }
    }
    return rows;
}

/** No puzzle failure is assumed: this measures combat, not children's puzzle skill. */
export function runUnderwaterRoute(
    players: readonly CombatAuditPlayer[],
    answers: CombatAuditAnswers | readonly CombatAuditAnswers[],
    seed: number,
    options: { canalFirst?: boolean; optionalBattles?: boolean; descentDamage?: number; maxAttempts?: number } = {},
    resolveJourney = resolveProductionJourneyEncounter,
) {
    const mode = players.length === 1 ? 'solo' : 'coop';
    const state = players.map(player => ({ ...player, hp: player.hp ?? player.maxHp }));
    const stages: { room: string; won: boolean; rounds: number; potionsUsed: number; attempt: number }[] = [];
    const gardens = ['sp_reed_garden'];
    const canals = ['sp_sunken_canal', 'sp_current_chamber'];
    const branches = options.canalFirst ? [canals, gardens] : [gardens, canals];
    const route = ['sp_shallows', ...branches[0], ...(options.optionalBattles ? ['sp_post_wreck'] : []),
        ...branches[1], ...(options.optionalBattles ? ['sp_glow_grotto'] : []), 'sp_depth_gate', 'sp_lake_heart'];
    const rooms = roomsJson.rooms as Record<string, { encounter?: { id: string }; mechanism?: unknown; rest?: unknown }>;
    for (const [stageIndex, room] of route.entries()) {
        if (room === 'sp_lake_heart') state.forEach(p => { p.hp = Math.max(1, p.hp! - (options.descentDamage ?? 1)); });
        const encounterId = rooms[room].encounter!.id;
        const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const result = simulateCombatEncounter(resolveJourney(encounterId, mode), state, answers,
                seed * 1009 + stageIndex * 31 + attempt);
            stages.push({ room, won: result.won, rounds: result.rounds, potionsUsed: result.potionsUsed, attempt });
            state.forEach((p, index) => { p.hp = result.playerHp[index]; p.potion = result.potionRemaining[index];
                if (p.preparation) p.preparation = { ...p.preparation, charges: result.preparationRemaining[index] }; });
            if (result.won) break;
            if (attempt === maxAttempts) return { completed: false, stages, state };
            // Actual defeat return calls UnderwaterRoomScene.rest(): free full HP,
            // no potion refill; previous encounters and solved mechanisms stay cleared.
            state.forEach(player => { player.hp = player.maxHp; });
        }
        // Shallows exits into the free bell-hub spring. A solved room mechanism
        // heals in UnderwaterRoomScene.finish; the depth spring heals after its guard.
        // Wreck has neither, so a direct branch crossing carries its damage forward.
        if (room === 'sp_shallows' || rooms[room].mechanism || rooms[room].rest) {
            state.forEach(player => { player.hp = player.maxHp; });
        }
        if (room === 'sp_glow_grotto') state.forEach(player => { player.blessing = true; });
    }
    return { completed: true, stages, state };
}

export function runUnderwaterRouteAudit(runs = 500, resolveJourney = resolveProductionJourneyEncounter) {
    const rows: Record<string, unknown>[] = [];
    for (const build of ['tide', 'pearl', 'depth'] as const) for (const mode of ['solo', 'coop', 'asymmetric'] as const) {
        for (const maxAttempts of [1, 3]) for (const potion of [false, true]) for (const canalFirst of [false, true]) for (const optionalBattles of [false, true]) {
            const players = [{ ...AUDIT_BUILDS[build], potion }];
            if (mode !== 'solo') players.push({ ...AUDIT_BUILDS[mode === 'asymmetric' ? 'legacy' : build], potion });
            const answers = mode === 'asymmetric' ? [AUDIT_ANSWERS.steady, AUDIT_ANSWERS.learning] : AUDIT_ANSWERS.steady;
            const results = Array.from({ length: runs }, (_, i) => runUnderwaterRoute(players, answers, i + 1,
                { canalFirst, optionalBattles, descentDamage: 1, maxAttempts }, resolveJourney));
            rows.push({ build, mode, potion, maxAttempts, branchOrder: canalFirst ? 'canal-first' : 'garden-first', optionalBattles,
                completionRate: results.filter(r => r.completed).length / runs,
                averageRetries: results.reduce((sum, r) => sum + r.stages.filter(s => s.attempt > 1).length, 0) / runs,
                averageBattles: results.reduce((sum, r) => sum + r.stages.length, 0) / runs,
                averagePotions: results.reduce((sum, r) => sum + r.stages.reduce((total, s) => total + s.potionsUsed, 0), 0) / runs,
                // Reports which first failure stops a single uninterrupted attempt.
                failures: Object.fromEntries([...new Set(results.flatMap(r => r.completed ? [] : [r.stages.at(-1)!.room]))]
                    .map(room => [room, results.filter(r => !r.completed && r.stages.at(-1)!.room === room).length])),
            });
        }
    }
    return rows;
}

/**
 * Synthetic comparator only: the known final Silverpond wave occupies every
 * combat slot, with the exact same route heals, consumables and retry limits.
 * It never changes production encounters or represents a real game route.
 */
export function createFinalArenaRouteReference(resolveArena = resolveProductionArenaWave): typeof resolveProductionJourneyEncounter {
    return (id, mode = 'solo') => {
        const resolved = resolveArena({ arenaLevel: 6, waveIndex: 4, mode });
        return { ...resolved, encounterId: id, kind: 'battle', boss: null, rewardPolicy: 'resolved-roster' };
    };
}
export const resolveFinalArenaRouteReference = createFinalArenaRouteReference();

/** Guaranteed copper minima; optional rooms cannot fund mandatory gear assumptions. */
export function underwaterEconomyAudit(resolveJourney = resolveProductionJourneyEncounter) {
    const rooms = roomsJson.rooms as Record<string, { encounter?: { id: string }; chest?: { coins: number } }>;
    const minimumGold = (room: string) => resolveJourney(rooms[room].encounter!.id, 'solo').enemies
        .reduce((sum, enemy) => sum + enemy.coinMin, 0);
    const mandatoryBattles = ['sp_shallows', 'sp_reed_garden', 'sp_sunken_canal', 'sp_current_chamber', 'sp_depth_gate']
        .reduce((sum, room) => sum + minimumGold(room), 0);
    const mandatoryChests = rooms.sp_shallows.chest!.coins + rooms.sp_sunken_canal.chest!.coins;
    const optionalWreck = minimumGold('sp_post_wreck') + rooms.sp_post_wreck.chest!.coins + rooms.sp_wreck_hold.chest!.coins;
    const optionalGrotto = minimumGold('sp_glow_grotto');
    return { mandatoryBattleGold: mandatoryBattles, mandatoryChests,
        mandatoryPreBoss: mandatoryBattles + mandatoryChests,
        withOptionalWreck: mandatoryBattles + mandatoryChests + optionalWreck,
        withBothOptionalBattles: mandatoryBattles + mandatoryChests + optionalWreck + optionalGrotto };
}

/** Run: node --import ./server/node_modules/tsx/dist/loader.mjs scripts/underwater-balance.ts [--json] */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnemyDefinition } from '../src/types';
import { createProductionEncounterAdapter, resolveProductionJourneyEncounter, resolveProductionArenaWave } from '../src/simulation/ProductionEncounterAdapter';
import { runUnderwaterAudit, runUnderwaterRouteAudit, createFinalArenaRouteReference, underwaterEconomyAudit } from '../src/simulation/UnderwaterBalanceAudit';

if (process.argv[1]?.endsWith('underwater-balance.ts')) {
    const runs = Number(process.env.BALANCE_RUNS ?? 500);
    if (!Number.isInteger(runs) || runs < 1) throw new Error('BALANCE_RUNS must be a positive integer');
    const catalogFlag = process.argv.indexOf('--catalog-dir');
    const catalogDir = catalogFlag >= 0 ? process.argv[catalogFlag + 1] : undefined;
    if (catalogFlag >= 0 && !catalogDir) throw new Error('--catalog-dir requires a directory with encounters.json and enemies.json');
    const adapter = catalogDir ? createProductionEncounterAdapter(
        JSON.parse(readFileSync(resolve(catalogDir, 'encounters.json'), 'utf8')),
        JSON.parse(readFileSync(resolve(catalogDir, 'enemies.json'), 'utf8')) as EnemyDefinition[],
    ) : undefined;
    const resolver = adapter?.resolveJourneyEncounter ?? resolveProductionJourneyEncounter;
    const arenaResolver = adapter?.resolveArenaWave ?? resolveProductionArenaWave;
    const rows = runUnderwaterAudit(runs, resolver, arenaResolver);
    if (process.argv.includes('--json')) console.log(JSON.stringify({ schemaVersion: 1, catalog: catalogDir ?? 'production', runs, seedStart: 1, seedEnd: runs,
        economy: underwaterEconomyAudit(resolver), isolated: rows, routes: runUnderwaterRouteAudit(runs, resolver), referenceRoutes: runUnderwaterRouteAudit(runs, createFinalArenaRouteReference(arenaResolver)) }, null, 2));
    else console.table(rows.map(row => ({ ...row,
        winRate: `${(Number(row.winRate) * 100).toFixed(1)}%`, rounds: Number(row.rounds).toFixed(1),
        hpLost: Number(row.hpLost).toFixed(1), healing: Number(row.healing).toFixed(1),
        problems: Number(row.problems).toFixed(1), potionsUsed: Number(row.potionsUsed).toFixed(2) })));
}

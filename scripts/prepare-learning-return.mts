import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ALL_BANDS, type BandId, type SaveSlotData } from '../src/types/index.ts';
import { requireIncompleteLearningBand } from '../src/systems/LearningProgress.ts';
import { learningStatsHash } from './learning-save-repair.mjs';

/** Prepare only: the existing guarded repair page applies this plan on its owning device. */
export function buildLearningReturnPlan(bundle: unknown, slot: number, playerName: string, band: BandId) {
    const input = bundle as { format?: string; version?: number; saves?: Array<{ sourceSlot: number; save: SaveSlotData }> };
    if (input?.format !== 'little-math-adventure-save-bundle' || input.version !== 1
        || !Array.isArray(input.saves) || !Number.isInteger(slot) || slot < 0 || slot > 7
        || !ALL_BANDS.includes(band)) throw new Error('Invalid save bundle, slot or band.');
    const matches = input.saves.filter(entry => entry.sourceSlot === slot);
    const save = matches[0]?.save;
    if (matches.length !== 1 || !playerName || save?.player?.name !== playerName || !save.mathStats?.masteryData) {
        throw new Error('The selected slot does not contain the expected player and learning progress.');
    }
    const masteryData = structuredClone(save.mathStats.masteryData);
    if (!requireIncompleteLearningBand(masteryData, band)) throw new Error('This band is already complete; no repair is needed.');
    const beforeHash = learningStatsHash(save.mathStats);
    const afterHash = learningStatsHash({ ...save.mathStats, masteryData });
    return {
        id: `learning-return-${band}-${beforeHash.slice(0, 16)}`,
        createdAt: Date.now(),
        summary: `${playerName}: dokončí se nedokončené části pásma ${band}. Dosavadní výsledky, medaile, výbava a pokrok ve vyšších pásmech zůstanou zachované. Po závěrečné zkoušce hra naváže na uložený pokrok. Ostatní profily se nemění.`,
        entries: [{
            sourceSlot: slot, playerName,
            ...(save.player.gameplayProfileId ? { playerProfileId: save.player.gameplayProfileId } : {}),
            beforeHash, afterHash, masteryData,
        }],
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const { values } = parseArgs({ options: {
        input: { type: 'string' }, output: { type: 'string' }, slot: { type: 'string' },
        player: { type: 'string' }, band: { type: 'string' },
    } });
    if (!values.input || !values.output || values.slot === undefined || !values.player || !values.band) {
        throw new Error('Usage: tsx scripts/prepare-learning-return.mts --input snapshot.json --output new-plan.json --slot 1 --player Kitten --band D');
    }
    const plan = buildLearningReturnPlan(JSON.parse(readFileSync(values.input, 'utf8')), Number(values.slot), values.player, values.band as BandId);
    // Never overwrite an active repair plan or an existing backup accidentally.
    writeFileSync(values.output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ id: plan.id, slot: plan.entries[0].sourceSlot, output: values.output }));
}

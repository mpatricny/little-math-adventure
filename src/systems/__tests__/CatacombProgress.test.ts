import { describe, expect, it } from 'vitest';
import type { MathProblem, MathStats, PlayerState, ProblemForm, SubAtomId } from '../../types';
import { MasteryMigration } from '../MasteryMigration';
import { ProblemDatabase } from '../ProblemDatabase';
import { admitFoxSpeedTrial, catacombProgress, completeFoxSpeedTrial, FOX_SPEED_LEVELS, foxSpeedTarget, learningStage, type FoxSpeedStage } from '../CatacombProgress';
import { getFoxJourney } from '../FoxAbilitySystem';
import { getCatacombReadiness } from '../PracticeProgress';

function fixture(time = 1800, count = FOX_SPEED_LEVELS.evidence.window) {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.subAtoms.A1.state = 'mastery'; data.problemRecords = {};
    const db = ProblemDatabase.getInstance();
    const keys = ['result_unknown', 'missing_part'].flatMap(form => db.getProblemsForForm('A1', form as any).slice(0, 8));
    for (let n = 0; n < count; n++) {
        const p = keys[n % keys.length];
        const record = data.problemRecords[p.key] ??= { problemKey: p.key, subAtomId: 'A1', form: p.form, attempts: [] };
        record.attempts.push({ correct: true, responseTimeMs: time, timestamp: Date.UTC(2026, 10, 19 + Math.floor(n / 20), 12, n % 20),
            context: 'battle', sequenceIndex: n + 1 });
    }
    const player = { catacombFoxBonus: 7, catacombFoxJourney: undefined } as Pick<PlayerState, 'catacombFoxBonus' | 'catacombFoxJourney'>;
    return { data, player };
}
function questions(form: ProblemForm, count: number, module: SubAtomId = 'A1'): MathProblem[] {
    const db = ProblemDatabase.getInstance();
    const problemTypes = { result_unknown: 'standard', missing_part: 'missing_operand',
        compare_equation_vs_number: 'comparison', compare_equation_vs_equation: 'comparison_eq_vs_eq' } as const;
    return db.getProblemsForForm(module, form).slice(0, count).map(def => ({
        ...def, id: def.key, masteryKey: def.key, problemType: problemTypes[form],
        choices: db.generateChoices(def), showVisualHint: false, hintType: 'none',
    }));
}
const deck = [...questions('result_unknown', 3), ...questions('missing_part', 3),
    ...questions('compare_equation_vs_number', 1), ...questions('compare_equation_vs_equation', 1)];
const answers = (time = 1800, problems = deck) => problems.map(p => ({ problemKey: p.masteryKey!, correct: true, responseTimeMs: time }));

function playTrial({ data, player }: ReturnType<typeof fixture>, stage: FoxSpeedStage, id: string): boolean {
    const problems = stage === 'legend' ? [...deck, ...questions('result_unknown', 5).slice(3)] : deck;
    const admission = admitFoxSpeedTrial(data, player, 'A1', stage, id, problems);
    return completeFoxSpeedTrial(data, player, 'A1', stage, answers(1800, problems), id, Date.now(), admission);
}
describe('the complete catacomb speed journey', () => {
    it('ranks the fuller history closer at the same speed and reserves 100 for completed or ready trials', () => {
        const snapshots = [0, 5, 30, 40].map(count => {
            const { data, player } = fixture(1800, count);
            return catacombProgress(data, player, 'A1');
        });
        const grandmasters = snapshots.map(stages => stages.find(s => s.stage === 'grandmaster')!);
        expect(grandmasters.map(s => s.speedMs)).toEqual([null, 1800, 1800, 1800]);
        expect(grandmasters.map(s => s.readinessPercent)).toEqual([0, 12, 75, 100]);
        expect(grandmasters.map(s => s.ready)).toEqual([false, false, false, true]);
        expect(snapshots[3].find(s => s.stage === 'legend')).toMatchObject({ ready: false, readinessPercent: 99 });
        expect(snapshots[0].filter(s => s.completed).map(s => s.readinessPercent)).toEqual([100, 100]);
    });
    it('uses the same partial fluency and mastery percentages as the admission evidence', () => {
        const { data, player } = fixture(9000, 5);
        data.subAtoms.A1.state = 'secure';
        const stages = catacombProgress(data, player, 'A1');
        for (const stage of ['fluency_challenge', 'mastery_challenge'] as const) {
            expect(stages.find(s => s.stage === stage)?.readinessPercent).toBe(getCatacombReadiness(data, 'A1', stage).percentage);
        }
    });
    it('preserves legacy mastery and attack and banks two unique speed-trial rewards before the first lesson', () => {
        const { data, player } = fixture(); const old = structuredClone(player);
        expect(catacombProgress(data, player, 'A1').map(s => [s.completed, s.ready])).toEqual([[true, false], [true, false], [false, true], [false, false]]);
        expect(player).toEqual(old);
        expect(playTrial({ data, player }, 'legend', 'skip')).toBe(false);
        expect(playTrial({ data, player }, 'grandmaster', 'first')).toBe(true);
        expect(learningStage('mastery', player, 'A1')).toBe('grandmaster');
        expect(playTrial({ data, player }, 'grandmaster', 'repeat')).toBe(false);
        expect(playTrial({ data, player }, 'legend', 'second')).toBe(true);
        const saved = JSON.parse(JSON.stringify(player));
        expect(saved.catacombFoxJourney.awards.A1).toMatchObject({ I: { allocation: null }, II: { allocation: null } });
        expect(getFoxJourney(saved)).toMatchObject({ points: 2, availablePoints: 0, powers: { shield: 0, heal: 0, strike: 0 } });
        expect(learningStage('mastery', player, 'A1')).toBe('legend');
        expect(player.catacombFoxBonus).toBe(7);
    });
    it('rejects guessed speed, assisted, synthetic, sparse and one-day evidence', () => {
        for (const kind of ['synthetic', 'assisted', 'single-day', 'slow', 'few', 'uncertain']) {
            const { data, player } = fixture(kind === 'slow' ? 9000 : 1800);
            Object.values(data.problemRecords).forEach(record => record.attempts.forEach(a => {
                if (kind === 'synthetic') a.synthetic = true;
                if (kind === 'assisted') a.assisted = true;
                if (kind === 'single-day') a.timestamp = Date.UTC(2026, 10, 19, 12);
                if (kind === 'uncertain') a.observation = { answeredAt: a.timestamp, responseTimeMs: a.responseTimeMs, clockQuality: 'uncertain' } as any;
            }));
            if (kind === 'few') delete data.problemRecords[Object.keys(data.problemRecords)[0]];
            expect(catacombProgress(data, player, 'A1')[2].ready, kind).toBe(false);
        }
    });
    it('requires a complete accurate new trial inside its personal time budget', () => {
        const { data, player } = fixture();
        const admission = admitFoxSpeedTrial(data, player, 'A1', 'grandmaster', 'bad', deck);
        expect(admission).toBeTruthy();
        for (const input of [answers().slice(1), answers(5000), answers().map((a, i) => ({ ...a, correct: i >= 2 })), answers(0)])
            expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', input, 'bad', Date.now(), admission)).toBe(false);
        expect(getFoxJourney(player).points).toBe(0);
        data.subAtoms.A1.state = 'training';
        expect(catacombProgress(data, player, 'A1')[2].lock).toBe('exam');
    });
    it('accepts seven of eight, including slower individual answers, within the whole-set budget', () => {
        const { data, player } = fixture();
        const admission = admitFoxSpeedTrial(data, player, 'A1', 'grandmaster', 'whole-batch', deck)!;
        // Three sums, three missing numbers and both comparison forms weigh 11.5 units plus 11.5/8 spare.
        expect(admission.rules).toEqual({ total: 8, required: 7, paceMs: 3000, budgetMs: 38813 });
        const input = answers(2800);
        input[0].correct = false;
        input[6].responseTimeMs = 10400;
        input[7].responseTimeMs = 11612;
        expect(input.filter(a => a.responseTimeMs <= admission.targetMs)).toHaveLength(6);
        const atDeadline = input.map((a, i) => i === 7 ? { ...a, responseTimeMs: a.responseTimeMs + 1 } : a);
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', atDeadline, 'whole-batch', Date.now(), admission)).toBe(false);
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', input,
            'whole-batch', Date.now(), admission)).toBe(true);
    });
    it('binds speed rewards and their timing to the presented, enrolled module and question order', () => {
        const { data, player } = fixture();
        const admit = (plan: MathProblem[]) => admitFoxSpeedTrial(data, player, 'A1', 'grandmaster', 'ordered', plan);
        expect(admit(deck.slice(1))).toBeNull();
        expect(admit([...questions('result_unknown', 1, 'B1'), ...deck.slice(1)])).toBeNull();
        expect(admit([{ ...deck[0], problemType: 'comparison' }, ...deck.slice(1)])).toBeNull();
        const admission = admit(deck)!;
        const results = answers();
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', results, 'ordered', Date.now(), null)).toBe(false);
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', results, 'ordered', Date.now(), { ...admission })).toBe(false);
        const substitutions = [results.slice().reverse(), results.map(a => ({ ...a, problemKey: undefined })),
            [...results.slice(0, -1), results[0]]];
        for (const changed of substitutions) {
            expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', changed, 'ordered', Date.now(), admission)).toBe(false);
        }
        expect(getFoxJourney(player).points).toBe(0);
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', results, 'ordered', Date.now(), admission)).toBe(true);
    });
    it('uses module-specific thresholds and keeps owners independent', () => {
        expect(foxSpeedTarget('A1', 'grandmaster')).toBe(3000);
        expect(foxSpeedTarget('E4', 'legend')).toBe(2600);
        const a = fixture(), b = fixture();
        expect(playTrial(a, 'grandmaster', 'a')).toBe(true);
        expect(getFoxJourney(b.player).points).toBe(0);
    });
    it('keeps a previously entered trial open across retries and reloads without awarding a rune', () => {
        const { data, player } = fixture();
        const admission = admitFoxSpeedTrial(data, player, 'A1', 'grandmaster', 'window', deck);
        expect(admission?.firstEntry).toBe(true);
        Object.values(data.problemRecords).forEach(r => r.attempts.forEach(a => { a.timestamp = Date.UTC(2026, 10, 20, 13); }));
        const reloaded = JSON.parse(JSON.stringify(data));
        expect(catacombProgress(reloaded, player, 'A1').slice(2).map(s => s.ready)).toEqual([true, false]);
        expect(admitFoxSpeedTrial(reloaded, player, 'A1', 'grandmaster', 'retry', deck)?.firstEntry).toBe(false);
        expect(getFoxJourney(player).points).toBe(0);
        reloaded.selectedStartBand = 'B';
        expect(catacombProgress(reloaded, player, 'A1')[2].ready).toBe(false);
        expect(completeFoxSpeedTrial(data, {}, 'A1', 'grandmaster', answers(), 'window', Date.now(), admission)).toBe(false);
        expect(completeFoxSpeedTrial(data, player, 'A1', 'grandmaster', answers(), 'window', Date.now(), admission)).toBe(true);
    });

    it('recovers a legacy entry from a qualifying window before a failed trial, without guessing from exam rows alone', () => {
        for (const practiceMs of [1800, 6000]) {
            const { data, player } = fixture(practiceMs);
            const records = Object.values(data.problemRecords);
            for (let i = 0; i < 16; i++) {
                records[i % records.length].attempts.push({ correct: true, responseTimeMs: 8000,
                    timestamp: Date.UTC(2026, 10, 21, 12, i), context: 'mastery_challenge', sequenceIndex: i + 41 });
            }
            const stages = catacombProgress(data, player, 'A1');
            expect(stages[2]).toMatchObject({ ready: practiceMs === 1800, speedMs: 8000 });
            expect(stages[3].ready).toBe(false);
            expect(data.openedCatacombSpeed).toBeUndefined();
            expect(getFoxJourney(player).points).toBe(0);
        }
    });
});

// This art prototype can also be hosted as static files, without the game's
// TypeScript loader. session.test.ts checks the published presets against the
// lesson constants, EXAM_CONFIGS and fox-speed-levels.json in the game.
export const TRIAL_RECIPES = Object.freeze({
    lesson: { label: 'Schopnost', total: 6, required: 5 },
    fluency: { label: 'Plynulost', total: 10, required: 8 },
    mastery: { label: 'Mistrovství', total: 10, required: 9 },
    grandmaster: { label: 'Velmistr', total: 8, required: 7 },
    legend: { label: 'Legenda', total: 10, required: 10 },
});

function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// One familiar module for the preview: addition and subtraction across ten.
// A longer round may supply its own bank through createSession({ questions }).
export function makeQuestions(total, random = Math.random) {
    const facts = [];
    for (let a = 2; a <= 9; a++) {
        for (let b = 11 - a; b <= 9; b++) {
            facts.push({ id: `add-${a}-${b}`, text: `${a} + ${b}`, answer: a + b },
                { id: `sub-${a + b}-${a}`, text: `${a + b} − ${a}`, answer: b });
        }
    }
    if (!Number.isInteger(total) || total < 1 || total > facts.length) {
        throw new RangeError(`This sample module has ${facts.length} different questions.`);
    }
    return shuffle(facts, random).slice(0, total).map(fact => {
        const others = shuffle([-2, -1, 1, 2], random).map(delta => fact.answer + delta);
        return { ...fact, choices: shuffle([fact.answer, ...others.slice(0, 2)], random) };
    });
}

// The planet illuminates missed slots after the verdict, without editing the answers.
export function planetaryStars(state) {
    if (state.phase !== 'passed') return [];
    return state.history.flatMap((answer, index) => answer.correct ? [] : [index]).slice(0, 2);
}

export function createSession({ total, required, paceMs, questions = makeQuestions(total) }) {
    const budgetMs = (total + 1) * paceMs;
    if (!Number.isInteger(total) || !Number.isInteger(required) || required < 1 || required > total
        || !Number.isFinite(budgetMs) || budgetMs <= 0) {
        throw new RangeError('A round needs a positive pace and a reachable score.');
    }
    if (questions.length !== total || new Set(questions.map(q => q.id)).size !== total
        || questions.some(q => !q.id || !q.text || !Array.isArray(q.choices) || !q.choices.includes(q.answer)
            || q.choices.length < 2 || new Set(q.choices).size !== q.choices.length)) {
        throw new TypeError('Supply one distinct, playable question for each place in the round.');
    }
    const deck = questions.map(q => Object.freeze({ ...q, choices: Object.freeze([...q.choices]) }));
    const history = [];
    let phase = 'ready', correct = 0, elapsedMs = 0, lastTime = null;
    let hidden = false, paused = false;
    const blocked = () => hidden || paused;

    // Charge active thinking time up to the transition itself, even if it
    // arrives between animation frames. Browser background time is free.
    function tick(now = performance.now()) {
        if (!Number.isFinite(now)) throw new TypeError('Clock must be monotonic milliseconds.');
        if (lastTime !== null && now <= lastTime) return;
        if (lastTime !== null && phase === 'asking' && !blocked()) {
            elapsedMs = Math.min(budgetMs, elapsedMs + now - lastTime);
            if (elapsedMs === budgetMs) phase = 'timeout';
        }
        lastTime = now;
    }

    return {
        get state() {
            return {
                phase, total, required, answered: history.length, correct,
                budgetMs, elapsedMs, timeLeftMs: budgetMs - elapsedMs, history: [...history],
                question: phase === 'asking' ? deck[history.length] : null,
            };
        },
        start(now) {
            tick(now);
            if (phase !== 'ready') return false;
            phase = 'asking';
            return true;
        },
        tick,
        setHidden(value, now) { tick(now); hidden = Boolean(value); },
        setPaused(value, now) { tick(now); paused = Boolean(value); },
        answer(value, now, questionId) {
            tick(now);
            if (phase !== 'asking' || blocked()) return false;
            const q = deck[history.length];
            if ((questionId !== undefined && q.id !== questionId) || !q.choices.includes(value)) return false;
            const right = value === q.answer;
            history.push(Object.freeze({ id: q.id, value, correct: right }));
            if (right) correct++;
            // No early victory or rejection. The sixth (or Nth) submission
            // completes the batch even when a result was predictable earlier.
            if (history.length === total) phase = correct >= required ? 'passed' : 'failed';
            else phase = 'feedback';
            return true;
        },
        advance(now) {
            tick(now);
            if (phase !== 'feedback' || blocked()) return false;
            phase = 'asking';
            return true;
        },
    };
}

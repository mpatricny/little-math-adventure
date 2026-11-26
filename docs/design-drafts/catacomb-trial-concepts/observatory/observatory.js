import { createStage } from './stage.js';
import { createMural } from './mural.js';
import { createSession, planetaryStars, TRIAL_RECIPES } from './session.js';

const variants = {
    rescue: { label: 'Záchrana', icon: 'paw', color: '#ffcd81', preset: 'fluency' },
    attack: { label: 'Síla', icon: 'swords', color: '#ffc16d', preset: 'mastery' },
    shield: { label: 'Štít', icon: 'shield', color: '#82e3ff', preset: 'lesson' },
    heal: { label: 'Léčení', icon: 'heal', color: '#a2edbe', preset: 'lesson' },
    strike: { label: 'Zásah', icon: 'strike', color: '#e0adff', preset: 'lesson' },
    rune: { label: 'Bod lišky', icon: 'paw', color: '#ffce79', preset: 'grandmaster' },
};
function rewardForPreset(preferred, type) {
    if (type === 'grandmaster' || type === 'legend') return 'rune';
    if (type === 'lesson') return variants[preferred].preset === 'lesson' ? preferred : 'shield';
    if (type === 'fluency' || type === 'mastery') {
        if (preferred === 'attack' || preferred === 'rescue') return preferred;
        return type === 'fluency' ? 'rescue' : 'attack';
    }
    return preferred;
}
const $ = id => document.getElementById(id);
const world = $('observatory');
const muralHost = $('mural');
const stage = createStage($('stage'));
const mural = createMural(muralHost);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const parameters = new URLSearchParams(location.search);
let reward = Object.hasOwn(variants, parameters.get('reward')) ? parameters.get('reward') : 'shield';
let preset = Object.hasOwn(TRIAL_RECIPES, parameters.get('preset')) ? parameters.get('preset') : variants[reward].preset;
let { total, required } = TRIAL_RECIPES[preset];
reward = rewardForPreset(reward, preset);
let pace = 4;
let tuned = parameters.has('preset');
let mode = 'loading', round = null, generation = 0;
let previewTimer, tickHandle, previewStart = 0, previewStoppedAt = 0;
let feedbackReady = false;
const locked = () => document.hidden || $('configuration').open || $('pause-dialog').open;
const asset = id => id === 'rescue' ? './art/mural-rescue.webp' : '/assets/ui/catacomb-crafted-v3/' + variants[id].icon + '-normal.webp';
const worldTarget = i => {
    const pos = mural.point(i), m = muralHost.getBoundingClientRect(), w = world.getBoundingClientRect();
    return { x: (m.left - w.left + pos.x * m.width) / w.width, y: (m.top - w.top + pos.y * m.height) / w.height };
};
const current = token => token === generation;
function showMode(next) {
    mode = next;
    world.dataset.mode = next;
    world.dataset.reward = reward;
    $('lobby').hidden = next !== 'preview' && next !== 'loading';
    $('arithmetic').hidden = next !== 'play';
    $('result').hidden = next !== 'result';
    $('settings').hidden = next === 'play';
    $('pause').hidden = next !== 'play';
}
function resetScene() {
    generation++;
    clearTimeout(previewTimer);
    cancelAnimationFrame(tickHandle);
    stage.reset();
    mural.setVariant(reward, total);
    feedbackReady = false;
}
function pickVariant(id) {
    reward = id;
    if (!tuned || rewardForPreset(id, preset) !== id) {
        preset = variants[id].preset;
        ({ total, required } = TRIAL_RECIPES[preset]);
    }
    beginPreview();
}

for (const [id, variant] of Object.entries(variants)) {
    const button = document.createElement('button');
    button.className = 'reward-choice';
    button.type = 'button';
    button.dataset.key = id;
    button.setAttribute('aria-pressed', String(id === reward));
    const medal = document.createElement('span');
    medal.className = 'reward-medal';
    const icon = new Image();
    icon.src = asset(id); icon.alt = '';
    medal.append(icon);
    const label = document.createElement('span');
    label.className = 'reward-name'; label.textContent = variant.label;
    button.append(medal, label);
    button.addEventListener('click', () => pickVariant(id));
    $('reward-choices').append(button);
}
for (const [key, settings] of Object.entries(TRIAL_RECIPES)) $('preset').add(new Option(settings.label, key));
$('preset').add(new Option('Vlastní', 'custom'));

async function flashStar(index, token, assisted = false) {
    const target = worldTarget(index);
    const contact = await stage.activate(target, { color: variants[reward].color, variant: reward, assisted });
    if (!current(token) || contact === false) return false;
    mural.light(index, { assisted });
    return true;
}

function beginPreview() {
    resetScene(); round = null; showMode('preview');
    for (const b of $('reward-choices').children) b.setAttribute('aria-pressed', String(b.dataset.key === reward));
    $('start').disabled = false;
    $('goal').textContent = `✓ ${required}/${total}`;
    $('goal').setAttribute('aria-label', `Cíl: alespoň ${required} z ${total} správně`);
    const token = generation;
    previewStart = performance.now();
    previewStoppedAt = 0;
    stage.setSky(.34);
    function movePlanet(now) {
        if (!current(token) || mode !== 'preview') return;
        if (!locked() && !reduced.matches) stage.setSky(.34 + .26 * Math.min(1, (now - previewStart) / 16000));
        tickHandle = requestAnimationFrame(movePlanet);
    }
    tickHandle = requestAnimationFrame(movePlanet);
    let lit = 0;
    async function nextStar() {
        if (!current(token)) return;
        if (locked()) { previewTimer = setTimeout(nextStar, 180); return; }
        if (lit < mural.count) {
            if (!await flashStar(lit, token, lit >= Math.max(required, total - 2))) return;
            lit++;
            if (lit === mural.count) { mural.finish(); stage.finish?.(true); }
            else stage.aimAt(worldTarget(lit), { color: variants[reward].color });
        } else { beginPreview(); return; }
        previewTimer = setTimeout(nextStar, lit === mural.count ? 3400 : 450);
    }
    // Reduced motion retains one readable, fully illustrated reward in the gallery.
    if (reduced.matches) { mural.finish(); stage.aimAt(worldTarget(0)); }
    else previewTimer = setTimeout(nextStar, 450);
}

function drawHistory() {
    const box = $('attempts'), s = round.state;
    box.replaceChildren();
    box.setAttribute('aria-label', `Vyřešeno ${s.answered} z ${s.total}`);
    if (s.total > 16) {
        const counter = document.createElement('span');
        counter.className = 'attempt more'; counter.textContent = `${s.answered} / ${s.total}`; box.append(counter);
        return;
    }
    box.style.setProperty('--bead-width', `${66 / s.total}%`);
    for (let i = 0; i < s.total; i++) {
        const bead = document.createElement('span');
        bead.className = i < s.answered ? 'attempt done' : 'attempt';
        box.append(bead);
    }
}
function drawQuestion() {
    const q = round.state.question;
    if (!q) return;
    $('question').textContent = q.text;
    $('answers').replaceChildren();
    q.choices.forEach(value => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'answer';
        const face = document.createElement('span');
        face.className = 'answer-face'; face.textContent = value; b.append(face);
        b.addEventListener('click', () => choose(q.id, value, b));
        $('answers').append(b);
    });
    drawHistory();
}
function advanceFeedback() {
    if (!feedbackReady || mode !== 'play' || locked()) return;
    feedbackReady = false;
    if (round.state.phase === 'feedback') {
        if (round.advance(performance.now())) drawQuestion();
    } else showResult();
}
async function choose(id, value, button) {
    if (locked() || !round?.answer(value, performance.now(), id)) return;
    for (const option of $('answers').children) option.disabled = true;
    button.classList.add('chosen'); drawHistory();
    const s = round.state, token = generation;
    const index = s.answered - 1;
    if (s.history[index].correct) {
        if (!await flashStar(index, token)) return;
    } else {
        button.classList.add('missed');
        await new Promise(resolve => setTimeout(resolve, 420));
        if (!current(token)) return;
    }
    for (const missed of planetaryStars(s)) {
        if (!await flashStar(missed, token, true)) return;
    }
    if (s.answered < s.total) stage.aimAt(worldTarget(s.answered), { color: variants[reward].color });
    feedbackReady = true; advanceFeedback();
}
function showResult() {
    const s = round.state, passed = s.phase === 'passed';
    cancelAnimationFrame(tickHandle);
    if (passed) mural.finish({fill:false});
    stage.finish?.(passed);
    showMode('result');
    $('prize').src = asset(reward);
    $('prize').hidden = !passed;
    $('result-title').textContent = passed ? variants[reward].label : s.phase === 'timeout' ? 'Planeta zapadla' : 'Ještě jednou';
    $('score').textContent = `✓ ${s.correct} / ${s.total}`;
    const gifts = planetaryStars(s).length;
    $('gift-count').hidden = gifts === 0;
    $('gift-number').textContent = '+' + gifts;
    $('gift-count').setAttribute('aria-label', `Hvězdy od planety: ${gifts}`);
}
function beginRound() {
    resetScene(); showMode('play');
    round = createSession({ total, required, paceMs: pace * 1000 });
    round.setHidden(document.hidden);
    round.start(performance.now());
    stage.setSky(0); stage.aimAt(worldTarget(0), { color: variants[reward].color });
    drawQuestion();
    function tick(now) {
        if (mode !== 'play') return;
        round.tick(now);
        const s = round.state;
        stage.setSky(s.elapsedMs / s.budgetMs);
        if (s.phase === 'timeout') { showResult(); return; }
        tickHandle = requestAnimationFrame(tick);
    }
    tickHandle = requestAnimationFrame(tick);
}
function syncBlock() {
    stage.setPaused(locked());
    if (round) {
        round.setHidden(document.hidden);
        round.setPaused($('configuration').open || $('pause-dialog').open);
    }
    if (mode === 'preview') {
        if (locked() && !previewStoppedAt) previewStoppedAt = performance.now();
        if (!locked() && previewStoppedAt) { previewStart += performance.now() - previewStoppedAt; previewStoppedAt = 0; }
    }
    advanceFeedback();
}
document.addEventListener('visibilitychange', syncBlock);
$('start').addEventListener('click', beginRound); $('again').addEventListener('click', beginRound);
$('back').addEventListener('click', beginPreview);
$('pause').addEventListener('click', () => { $('pause-dialog').showModal(); syncBlock(); });
$('resume').addEventListener('click', () => $('pause-dialog').close());
$('pause-dialog').addEventListener('close', syncBlock);
$('settings').addEventListener('click', () => {
    $('preset').value = preset; $('length').value = total; $('threshold').max = total;
    $('threshold').value = required; $('pace').value = pace;
    $('configuration').returnValue = ''; $('configuration').showModal(); syncBlock();
});
$('preset').addEventListener('change', () => {
    const recipe = TRIAL_RECIPES[$('preset').value];
    if (recipe) { $('length').value = recipe.total; $('threshold').max = recipe.total; $('threshold').value = recipe.required; }
});
$('length').addEventListener('input', () => { $('preset').value = 'custom'; $('threshold').max = $('length').value; });
$('threshold').addEventListener('input', () => { $('preset').value = 'custom'; });
$('configuration').addEventListener('close', () => {
    if ($('configuration').returnValue === 'save') {
        tuned = true; preset = $('preset').value;
        reward = rewardForPreset(reward, preset);
        total = $('length').valueAsNumber; required = $('threshold').valueAsNumber; pace = $('pace').valueAsNumber;
        beginPreview();
    }
    syncBlock();
});
document.addEventListener('keydown', event => {
    if (event.repeat || locked() || mode !== 'play') return;
    if (['1','2','3'].includes(event.key)) $('answers').children[Number(event.key)-1]?.click();
    if (event.key === 'Escape') $('pause').click();
});
Promise.all([stage.ready, mural.ready]).then(() => {
    $('loading-note').hidden = true; world.setAttribute('aria-busy','false'); beginPreview();
}).catch(error => {
    console.error(error);
    const retry = document.createElement('button'); retry.textContent = 'Načíst znovu'; retry.className = 'sheet-button';
    retry.addEventListener('click', () => location.reload());
    $('loading-note').style.pointerEvents = 'auto'; $('loading-note').replaceChildren(retry);
});

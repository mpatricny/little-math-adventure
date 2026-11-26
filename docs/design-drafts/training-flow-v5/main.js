import { getReviewSession, REVIEW_TARGETS } from '../shared/practice-journey.ts';
import { getExamPresentation } from '../../../src/ui/ExamPresentation.ts';

const $ = selector => document.querySelector(selector);
const content = $('#content'), stage = $('#stage');
const params = new URLSearchParams(location.search);
const embedded = params.get('embedded') === '1';
document.body.classList.toggle('embedded', embedded);
const layout = await fetch('./scenes.json').then(r => r.json());
const session = getReviewSession();
const owners = ['A', 'B'];
const screens = ['zyx', 'coop', 'victory', 'pet'];
const state = {
  screen: screens.includes(params.get('screen')) ? params.get('screen') : 'zyx',
  owner: params.get('owner') === 'B' ? 'B' : 'A',
  targetId: REVIEW_TARGETS.includes(params.get('targetId')) ? params.get('targetId') : undefined,
  confirmed: [false, false], intro: null, solo: false, started: false, external: null,
};
const assets = {
  runeNormal: 'assets/rune-normal.webp', runeActive: 'assets/rune-active.webp',
  trainingCompact: 'assets/training-compact.webp', progressCompact: 'assets/progress-compact.webp',
  modal: 'assets/modal-frame.webp', choice: 'assets/choice-frame.webp', tall: 'assets/tall-frame.webp',
  training: 'assets/training-picture.webp', progress: 'assets/progress-picture.webp',
  zyx: 'assets/zyx-portrait.webp', fox: 'assets/fox-reward.webp', coin: 'assets/coin.webp',
  mana: '/assets/library/originals/c930eab1-92340540.webp',
  pythia: '/assets/library/originals/468e5fe1-b2e89f57.webp',
  girl: '/assets/ui/town-hud-a/portraits/heroine-portrait.png',
  boy: '/assets/ui/town-hud-a/portraits/hero-portrait.png',
  plaque: '../mathboard-variants-v4/assets/plaque.webp',
  powerFrame: 'assets/pet-power-frame.webp', pawMedallion: 'assets/pet-paw-normal.webp',
};
const glyph = {
  next: '<path d="M8 24h31M26 10l14 14-14 14"/>',
  check: '<path d="m8 25 11 11L40 12"/>',
  swords: '<path d="M8 8l7 2 25 27-4 4L10 15zM40 8l-7 2L8 37l4 4 26-26z"/>',
  paw: '<ellipse cx="24" cy="32" rx="12" ry="9"/><ellipse cx="10" cy="19" rx="5" ry="6"/><ellipse cx="19" cy="10" rx="5" ry="6"/><ellipse cx="30" cy="10" rx="5" ry="6"/><ellipse cx="39" cy="19" rx="5" ry="6"/>',
  clock: '<circle cx="24" cy="26" r="17"/><path d="M18 3h12M24 3v6M24 15v12l9 5"/>',
  lock: '<rect x="10" y="22" width="28" height="22" rx="4"/><path d="M16 22V13a8 8 0 0 1 16 0v9M24 30v6"/>',
  open: '<rect x="10" y="22" width="28" height="22" rx="4"/><path d="M16 22V13a8 8 0 0 1 16-1M24 30v6"/>',
  seal: '<path d="M11 4h26v30H11zM17 36l-2 9 9-4 9 4-2-9M17 18l5 5 9-11"/>',
  door: '<path d="M8 44V22a16 16 0 0 1 32 0v22zM16 44V23a8 8 0 0 1 16 0v21M24 15v29M5 44h38"/>',
};
function svg(kind) {
  const filled = kind === 'paw';
  return '<svg viewBox="0 0 48 48" fill="' + (filled ? 'currentColor' : 'none') +
    '" stroke="' + (filled ? 'none' : 'currentColor') +
    '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (glyph[kind] ?? glyph.next) + '</svg>';
}
function node(tag, cls = '', text) {
  const e = document.createElement(tag); e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function icon(kind, cls = '') { const e = node('span', 'icon ' + cls); e.innerHTML = svg(kind); return e; }
function img(key, cls = 'image') {
  const e = node('img', cls); e.src = assets[key] ?? key; e.alt = ''; e.draggable = false; return e;
}
function label(el, value, cls = 'word') { const s = node('span', cls, String(value)); el.append(s); return s; }
function host(id, tag = 'div', cls = '') {
  const scene = layout.scenes[state.screen];
  const d = (state.screen === 'coop' && state.solo ? scene.soloElements : scene.elements).find(e => e.id === id);
  if (!d) throw Error('Missing scene host: ' + id);
  const e = node(tag, 'host ' + cls); e.id = 'ui-' + id; e.dataset.host = id;
  for (const [p, v] of Object.entries({
    x: d.x / layout.width * 100 + '%', y: d.y / layout.height * 100 + '%',
    w: d.width / layout.width * 100 + '%', h: d.height / layout.height * 100 + '%', z: d.depth,
  })) e.style.setProperty('--' + p, v);
  content.append(e); return e;
}
let timers = [];
function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
function frameAndTitle(title, modal = true) {
  if (modal) host('modal').append(img('modal'));
  const h = host('title', 'div', 'title'); h.append(img('plaque', 'frame')); label(h, title);
}
function portrait(id, owner = state.owner, confirmed = null) {
  const p = host(id, 'div', 'portrait' + (confirmed === null ? '' : confirmed ? ' confirmed' : ' pending'));
  p.append(img(owner === 'B' ? 'boy' : 'girl')); label(p, owner === 'B' ? '2' : '1', 'number');
  if (confirmed) label(p, '✓', 'confirmed-mark');
}
function surface(button) { const s = node('span', 'surface'); button.append(s); return s; }
function action(title, onClick, enabled = true, kind = 'next') {
  const b = host('action', 'button', 'control action');
  b.type = 'button'; b.disabled = !enabled; b.setAttribute('aria-label', title);
  const s = surface(b); s.append(img('plaque', 'frame'));
  const l = node('span', 'label'); label(l, title); l.append(icon(kind)); s.append(l); b.onclick = onClick;
}
function choice(id, kind, selected, onClick, tall = false) {
  const b = host(id, 'button', 'control choice' + (tall ? ' tall' : ''));
  b.type = 'button'; b.setAttribute('aria-pressed', String(selected));
  b.setAttribute('aria-label', kind === 'practice' ? 'Trénovat' : 'Dál');
  // Training remains selectable after mastery. Rewards still follow the current shared model.
  const s = surface(b);
  s.append(img(tall ? 'tall' : 'choice', 'frame'),
    img(tall ? kind === 'practice' ? 'training' : 'progress' : kind === 'practice' ? 'trainingCompact' : 'progressCompact', 'picture'));
  const caption = node('span', 'caption'); label(caption, kind === 'practice' ? 'Trénovat' : 'Dál');
  s.append(caption); label(s, '✓', 'seal'); b.onclick = onClick;
}
function route(view, targetId = state.targetId ?? session.preference(state.owner).targetId) {
  session.route({ view, owner: state.owner, targetId, returnTo: state.screen === 'coop' ? 'before-battle' : state.screen === 'zyx' ? 'before-battle' : state.screen });
}
function time(ms) { return ms === null || !Number.isFinite(ms) ? '—' : (ms / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' s'; }
function moduleTile(journey) {
  const tile = node('span', 'module-tile' + (journey.targetId === 'comparison_symbols' ? ' relations' : ''));
  tile.textContent = getExamPresentation(journey.targetId).compact; return tile;
}
function trialMarks(id, journey) {
  const row = host(id, 'div', 'trial-marks'); row.dataset.targetId = journey.targetId;
  for (const trial of journey.trials) {
    const mark = node('span', 'trial-mark' + (trial.complete ? ' complete' : ''));
    mark.dataset.trial = trial.id;
    const stone = node('span', 'stone'); stone.append(img('runeNormal'));
    if (trial.complete) { stone.append(img('runeActive', 'active-stone')); label(stone, '✓', 'trial-check'); }
    mark.append(stone); label(mark, trial.id === 'fluency_challenge' ? 'Plynulost' : 'Mistrovství'); row.append(mark);
  }
}
function journeyCard(journey, before) {
  const button = host('journey', 'button', 'control journey-card');
  button.type = 'button'; button.dataset.targetId = journey.targetId;
  button.dataset.lock = journey.lockReason;
  button.setAttribute('aria-label', 'Cesta k lišce: ' + journey.title);
  const s = surface(button);
  s.append(img('assets/journey-rail-v2.webp', 'journey-frame'));
  // Every content region has an explicit safe layout in the review scene JSON.
  const definition = layout.scenes.victory.elements.find(e => e.id === 'journey');
  const region = (name, element) => {
    const r = definition.regions[name]; element.dataset.region = name; element.classList.add('journey-region');
    Object.assign(element.style, { left: r.x / definition.width * 100 + '%', top: r.y / definition.height * 100 + '%',
      width: r.width / definition.width * 100 + '%', height: r.height / definition.height * 100 + '%' });
    s.append(element); return element;
  };
  region('example', moduleTile(journey));
  region('divider', node('span', 'journey-divider'));
  label(region('title', node('span', 'journey-title')), journey.title);
  const track = region('track', node('span', 'journey-track'));
  const fill = node('span', 'journey-fill'); fill.style.width = journey.speed.progress * 100 + '%';
  fill.style.setProperty('--from', (before?.speed.progress ?? journey.speed.progress) * 100 + '%'); track.append(fill);
  const gate = region('gate', node('span', 'journey-gate')); gate.dataset.lock = journey.lockReason;
  const unlocked = ['open', 'complete'].includes(journey.lockReason);
  const lock = unlocked ? 'open' : 'closed';
  gate.append(img('assets/journey-lock-' + lock + '.webp', 'gate-normal'), img('assets/journey-lock-' + lock + '-active.webp', 'gate-active'));
  if (journey.lockReason === 'complete') gate.append(icon('check', 'gate-complete'));
  if (unlocked && before && !['open', 'complete'].includes(before.lockReason)) {
    button.classList.add('newly-open');
    gate.append(img('assets/journey-lock-closed.webp', 'gate-before'));
  }
  const numbers = region('currentTime', node('span', 'journey-times')); numbers.append(icon('clock'));
  label(numbers, time(journey.speed.value), 'current-time');
  label(region('goalTime', node('span', 'journey-time-goal')), time(journey.speed.target), 'goal-time');
  region('arrow', icon('next', 'path-arrow'));
  region('fox', node('span', 'journey-fox')).append(img('assets/journey-fox.webp'));
  button.onclick = () => route('catacombs', journey.targetId);
}
function intro() {
  frameAndTitle('Co dnes?', false); host('zyx').append(img('zyx'));
  for (const kind of ['practice', 'progress']) choice(kind, kind, state.intro === kind, () => { state.intro = kind; render(); }, true);
  // Zyx explains paths. A concrete target is selected only in the catacombs.
  action(state.intro === 'practice' ? 'Katakomby' : 'Dál', () => route(state.intro === 'practice' ? 'catacombs' : 'before-battle'), !!state.intro, state.intro === 'practice' ? 'door' : 'next');
  if (!state.intro) {
    later(450, () => $('#ui-practice')?.classList.add('demonstrate'));
    later(2050, () => { $('#ui-practice')?.classList.remove('demonstrate'); $('#ui-progress')?.classList.add('demonstrate'); });
  }
}
function startBattle() {
  const activeOwners = state.solo ? [state.owner] : owners;
  if (!activeOwners.every(owner => state.confirmed[owners.indexOf(owner)])) return;
  state.started = true;
  const detail = { players: activeOwners.map(owner => ({ owner, ...session.preference(owner) })) };
  stage.dispatchEvent(new CustomEvent('preview:battle-ready', { detail, bubbles: true }));
  openExternal('mathboard', '../mathboard-variants-v4/index.html?mode=' +
    (state.solo ? session.preference(state.owner).mode === 'practice' ? 'practice' : 'attack' : 'coop'));
}
function coop() {
  frameAndTitle('Před soubojem');
  const activeOwners = state.solo ? [state.owner] : owners;
  activeOwners.forEach((owner, row) => {
    const index = owners.indexOf(owner), pref = session.preference(owner);
    portrait('portrait' + row, owner, state.confirmed[index]);
    for (const kind of ['practice', 'progress']) choice(kind + row, kind, pref.mode === kind && state.confirmed[index], () => {
      state.confirmed[index] = true; session.setMode(owner, kind);
    });
  });
  if (!state.solo) host('divider', 'div', 'divider');
  action('Do boje', startBattle, activeOwners.every(owner => state.confirmed[owners.indexOf(owner)]), 'swords');
}
function speedComparison(receipt) {
  const h = host('speed', 'div', 'receipt-speed');
  h.append(icon('clock', 'speed-clock'));
  const bars = node('div', 'receipt-bars');
  const values = [receipt.before.speed.value, receipt.after.speed.value];
  const max = Math.max(...values.filter(Number.isFinite), receipt.after.speed.target);
  values.forEach((value, index) => {
    const row = node('div', 'receipt-bar');
    label(row, index ? 'Teď' : 'Dřív');
    const track = node('span', 'receipt-track');
    const fill = node('span', index ? 'receipt-fill now' : 'receipt-fill');
    fill.style.width = value === null ? '0%' : value / max * 100 + '%';
    fill.style.setProperty('--before-width', values[0] === null ? '0%' : values[0] / max * 100 + '%'); track.append(fill);
    row.append(track); label(row, time(value), 'time'); bars.append(row);
  });
  h.append(bars);
  // These bars are module medians. Personal bonus evidence compares per-form
  // baselines, so its percentage must not be presented as this bar's change.
}
function victory() {
  const receipt = session.battle(state.owner);
  frameAndTitle(receipt ? 'Výhra!' : 'Před soubojem'); portrait('portrait');
  if (!receipt) {
    const empty = host('empty', 'div', 'empty-result'); empty.append(icon('swords')); label(empty, 'Zatím bez výsledku');
    action('Před soubojem', () => route('before-battle'), true, 'swords'); return;
  }
  content.dataset.receiptId = String(receipt.id);
  const journey = session.snapshot(state.owner, receipt.targetId);
  const coins = host('coins', 'div', 'stat'); coins.append(img('coin')); label(coins, '+' + receipt.coins, 'number');
  host('divider', 'div', 'divider'); label(host('speedTitle', 'div', 'section-label'), 'Rychlost');
  speedComparison(receipt);
  const mana = host('mana', 'div', 'stat'); mana.append(img('mana')); label(mana, receipt.reward.mana ? '+' + receipt.reward.mana : '0', 'number');
  if (receipt.reward.mana > 0) mana.classList.add('reward-glow');
  label(host('journeyTitle', 'div', 'section-label'), 'Cesta k lišce'); journeyCard(journey, receipt.before);
  action('Dál', () => route('before-battle', receipt.targetId));
}
function pet() {
  const receipt = session.trial(state.owner);
  const targetId = receipt?.targetId ?? state.targetId ?? session.preference(state.owner).targetId;
  const journey = session.snapshot(state.owner, targetId);
  const rescued = journey.fox.status !== 'locked';
  frameAndTitle(!rescued ? 'Cesta k lišce' : receipt?.kind === 'upgrade' ? 'Silnější!' : journey.fox.status === 'owned' ? 'Tvůj parťák' : 'Zachráněna!');
  portrait('portrait');
  const fox = host('fox', 'div', rescued ? 'reward-glow' : 'fox-future'); fox.append(img('fox'));
  if (receipt) content.dataset.receiptId = String(receipt.id);
  if (rescued) {
    label(host('petTitle', 'div', 'section-label'), 'Síla');
    const stats = host('petStats', 'div', 'pet-stat pet-power');
    stats.append(img('powerFrame', 'power-frame'), img('pawMedallion', 'paw-medallion'));
    const damage = node('span', 'power-values'); stats.append(damage);
    if (receipt?.kind === 'upgrade') {
      label(damage, receipt.attackBefore, 'before number'); label(damage, '→', 'power-arrow'); label(damage, receipt.attackAfter, 'after number');
      stats.classList.add('upgraded');
    } else label(damage, journey.fox.attack, 'after number');
    trialMarks('trials', journey);
  } else {
    const empty = host('petStats', 'div', 'pet-empty'); empty.append(icon('door'), icon('next'), icon('paw'));
    label(host('petTitle', 'div', 'section-label'), 'Výzva v katakombách');
    trialMarks('trials', journey);
  }
  if (journey.fox.status === 'at_pythia') {
    const next = host('petNext', 'div', 'pythia-destination');
    next.append(img('choice', 'frame'), img('pythia', 'destination-picture')); label(next, 'U Pythie');
    action('K Pythii', () => route('pythia', targetId));
  } else {
    label(host('petNext', 'div', 'section-label'), journey.title);
    action(rescued ? 'Další výzva' : 'Katakomby', () => route('catacombs', targetId), true, 'door');
  }
}
let externalFrame = null, externalReady = false, pendingRoute = null;
function openExternal(kind, url, nextRoute = null) {
  state.external = kind; pendingRoute = nextRoute;
  const shell = $('#external'); shell.hidden = false; shell.dataset.kind = kind;
  if (kind === 'journey' && externalFrame?.dataset.kind === 'journey') url = externalFrame.getAttribute('src');
  if (!externalFrame || externalFrame.getAttribute('src') !== url) {
    externalFrame?.remove(); externalReady = false;
    externalFrame = document.createElement('iframe'); externalFrame.title = kind === 'mathboard' ? 'Ukázka MathBoardu' : 'Katakomby a Pythia';
    externalFrame.src = url; externalFrame.dataset.kind = kind;
    const frame = externalFrame;
    frame.onload = () => {
      if (externalFrame !== frame) return;
      const deliver = () => {
        if (externalFrame !== frame || !frame.isConnected) return;
        externalReady = true;
        frame.contentDocument?.body.classList.toggle('no-words', document.body.classList.contains('no-words'));
        if (pendingRoute) { const value = pendingRoute; pendingRoute = null; session.route(value); }
      };
      if (kind === 'journey' && !frame.contentWindow.catacombPreview?.ready) {
        frame.contentWindow.addEventListener('catacomb-preview-ready', deliver, { once: true });
      } else deliver();
    };
    shell.prepend(externalFrame);
  } else if (externalReady) pendingRoute = null;
}
function closeExternal() { $('#external').hidden = true; state.external = null; state.started = false; }
$('#externalBack').onclick = () => { closeExternal(); render(); };
function onRoute(value) {
  state.owner = value.owner; state.targetId = value.targetId; state.confirmed = [false, false];
  if (['catacombs', 'pythia'].includes(value.view)) {
    // The parent owns these scenes. Standalone review hosts it without losing the in-memory session.
    if (!embedded) openExternal('journey', '../catacombs-access-v1/index.html?embedded=1&owner=' + value.owner + '&targetId=' + encodeURIComponent(value.targetId), value);
    return;
  }
  closeExternal(); show(value.view === 'before-battle' ? 'coop' : value.view);
}
function render() {
  timers.forEach(clearTimeout); timers = [];
  content.replaceChildren(); delete content.dataset.receiptId; stage.className = state.screen;
  document.querySelectorAll('[data-screen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === state.screen)));
  $('#owner').value = state.owner; $('#solo-control').hidden = state.screen !== 'coop';
  const journey = session.snapshot(state.owner);
  $('#simulate-trial').disabled = !journey.readiness.ready || journey.state === 'mastery';
  $('#simulate-bind').disabled = journey.fox.status !== 'at_pythia';
  ({ zyx: intro, coop, victory, pet })[state.screen]();
  $('#review-status').textContent = state.screen === 'coop'
    ? 'Volba mění jen režim; modul zůstává z katakomb. Výsledek se simuluje výhradně tlačítky nad náhledem.'
    : state.screen === 'victory' ? 'Výhra čte přijatý výsledek. Cesta otevírá tentýž modul a profil.'
    : state.screen === 'pet' ? 'První záchrana vede k Pythii. Sílu a stav vlastníka určuje sdílený model.'
    : 'Zyx představuje směry. Konkrétní modul vybírá dítě v katakombách.';
}
function show(screen) {
  if (!screens.includes(screen)) return;
  state.screen = screen; render();
  const u = new URL(location.href); u.searchParams.set('screen', screen); u.searchParams.set('owner', state.owner); history.replaceState(null, '', u);
}
$('#screens').onclick = e => { if (e.target.dataset.screen) { closeExternal(); show(e.target.dataset.screen); } };
$('#owner').onchange = e => { state.owner = e.target.value; state.targetId = session.preference(state.owner).targetId; state.confirmed = [false, false]; render(); };
$('#solo').onchange = e => { state.solo = e.target.checked; state.confirmed = [false, false]; render(); };
$('#reset').onclick = () => { closeExternal(); state.confirmed = [false, false]; state.intro = null; state.targetId = undefined; session.reset(); };
$('#catacombs').onclick = () => route('catacombs');
for (const [id, faster] of [['simulate-win', true], ['simulate-steady', false]]) {
  $('#' + id).onclick = () => { const result = session.demoBattle(state.owner, faster); session.route({ view: 'victory', owner: state.owner, targetId: result.targetId }); };
}
$('#simulate-exam').onclick = () => session.demoExam(state.owner);
$('#simulate-trial').onclick = () => { const result = session.demoTrial(state.owner); if (result) session.route({ view: 'pet', owner: state.owner, targetId: result.targetId }); };
$('#simulate-bind').onclick = () => session.demoBind(state.owner);
$('#words').onclick = e => {
  const on = !document.body.classList.contains('no-words'); document.body.classList.toggle('no-words', on); e.currentTarget.setAttribute('aria-pressed', String(on));
  externalFrame?.contentDocument?.body.classList.toggle('no-words', on);
};
function expand(on = !document.body.classList.contains('theater')) {
  document.body.classList.toggle('theater', on); $('#full').textContent = on ? '×' : '⛶'; $('#full').setAttribute('aria-label', on ? 'Zavřít zvětšení' : 'Zvětšit náhled');
}
$('#full').onclick = () => expand(); document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (state.external) closeExternal(); else expand(false); } });
const unsubscribe = session.subscribe(event => event.type === 'route' ? onRoute(event.route) : render());
window.addEventListener('pagehide', unsubscribe, { once: true });
window.flowPreview = { state, session, show, route: onRoute, layout, embedded, ready: false };
await document.fonts.load('700 44px Gelasio');
await Promise.all(Object.values(assets).map(src => new Promise(resolve => { const i = new Image(); i.onload = i.onerror = resolve; i.src = src; })));
show(state.screen); window.flowPreview.ready = true;
window.dispatchEvent(new Event('flow-preview-ready'));

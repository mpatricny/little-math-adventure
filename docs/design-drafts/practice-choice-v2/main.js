const layout = await (await fetch('./scenes.json')).json();
const stage = document.querySelector('#stage');
const assets = '/assets/';
const art = {
  frame: 'ui/learning-refresh-v1/learning-panel-v1.png',
  zyx: 'ui/story/forest-crystal-transition/pictograms/story-icon-zyx.png',
  fox: 'sprites/portraits/rune-fox-sheet.webp',
  sword: 'ui/mock/prep-buttons/v2/prep-sword-normal-v2.png',
  heart: 'ui/town-hud-a/character-book/editor/hp-heart.png',
  playerA: 'ui/town-hud-a/portraits/heroine-portrait.png',
  playerB: 'ui/town-hud-a/portraits/hero-portrait.png',
  crab: 'sprites/portraits/silverpond-bubble-crab-idle-sheet.webp',
  enemy: 'sprites/portraits/slime-sheet.webp',
};
const modules = [{ id: 'B1', picture: '3 + 4', label: 'Sčítání do 8' },
  { id: 'B2', picture: '8 − 3', label: 'Odčítání do 8' },
  { id: 'B3', picture: '6 − 2 + 3', label: 'Tři čísla' }];
const state = { screen: ['guild','arena','board','coop'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'guild',
  A: { mode: 'practice', module: 'B1', ready: false }, B: { mode: 'progress', module: 'B2', ready: false },
  allMastered: false, words: true, started: false };
const image = (key, cls = '') => key === 'heart' ? '<span class="heart-icon">♥</span>'
  : key === 'zyx' ? '<span class="zyx-sprite"></span>'
  : `<img class="${cls}" src="${assets + art[key]}" alt="">`;
const word = text => `<span class="word">${text}</span>`;
const host = (id, content, cls = '') => {
  const h = layout.hosts[id];
  return `<div class="host ${cls}" data-host="${id}" style="left:${h.x / 12.8}%;top:${h.y / 7.2}%;width:${h.width / 12.8}%;height:${h.height / 7.2}%;z-index:${h.depth}">${content}</div>`;
};
const label = mode => mode === 'practice' ? 'Trénovat' : 'Dál';
function modeIcon(mode) {
  return mode === 'practice' ? `<span class="loop">↻</span>${image('fox')}`
    : `<span class="path">➜</span>${image('sword')}`;
}
function modeButton(player, mode, large = false) {
  const selected = state[player].mode === mode;
  const disabled = mode === 'practice' && state.allMastered;
  const module = modules.find(m => m.id === state[player].module);
  const teaching = mode === 'practice'
    ? `<span class="teach"><span class="sum">${module.picture}</span><span class="cycle">↻</span>${image('fox')}</span>`
    : `<span class="teach"><span class="steps">▁▃▅<span>➜</span></span>${image('sword')}${image('heart')}</span>`;
  return `<button class="mode ${large ? 'large' : ''} ${selected ? 'selected' : ''}" data-mode="${mode}" data-player="${player}" aria-label="${label(mode)} hráč ${player}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}><span class="surface">${large ? teaching : `<span class="mini-icon">${modeIcon(mode)}</span>`}${word(disabled ? 'Hotovo' : label(mode))}<span class="selection">${disabled || selected ? '✓' : ''}</span></span></button>`;
}
function chooser(player) {
  const p = state[player];
  const module = modules.find(m => m.id === p.module);
  return `<div class="choice-row"><span class="portrait">${image(`player${player}`)}</span><div class="segmented">${modeButton(player, 'practice')}${modeButton(player, 'progress')}</div><span class="module-badge" aria-label="${module.label}">${p.mode === 'practice' ? module.picture : '▁▃▅ ➜'}</span><button class="confirm ${p.ready ? 'confirmed' : ''}" data-ready="${player}" aria-label="Potvrdit hráč ${player}" ${p.ready ? 'disabled' : ''}><span class="surface">✓</span></button></div>`;
}
function render() {
  stage.className = `${state.screen} ${state.words ? '' : 'no-words'} ${state.started ? 'started' : ''}`;
  document.querySelectorAll('[data-screen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === state.screen)));
  let html = '';
  if (state.screen === 'guild') {
    html += host('guildPanel', image('frame'), 'art');
    html += host('zyx', image('zyx'), 'art mentor');
    html += host('guildTitle', word('Co dnes?'), 'title parchment');
    html += host('guildChoices', modeButton('A', 'practice', true) + modeButton('A', 'progress', true), 'guild-choices');
    html += host('modules', state.A.mode === 'practice' ? modules.map(m => `<button data-module="${m.id}" aria-label="${m.label}" aria-pressed="${state.A.module === m.id}" class="module ${state.A.module === m.id ? 'selected' : ''}"><span class="surface">${m.picture}</span></button>`).join('') : `<span class="reward-path">${image('sword')}<span>↑</span>${image('heart')}<span>↑</span></span>`, 'modules');
    html += host('guildConfirm', `<button class="confirm" id="leave-guild" aria-label="Potvrdit a jít do arény"><span class="surface">✓</span></button>`);
  } else {
    if (state.screen === 'board') {
      html += host('battlePanel', image('frame'), 'art');
      html += host('battleHeading', word(state.started ? 'Připraveno' : 'Do boje?'), 'title parchment');
      html += host('battlePicture', `${image('playerA')}<span class="versus">⚔</span>${image('enemy')}`, 'battle-picture');
    } else {
      html += host('arenaHeading', word(state.started ? 'Připraveno' : 'Do arény?'), 'title');
      html += host('enemies', image('enemy') + image('enemy') + image('enemy'), 'enemy-line');
    }
    if (!state.started) {
      html += state.screen === 'coop' ? host('coopChoiceA', chooser('A')) + host('coopChoiceB', chooser('B')) : host('soloChoice', chooser('A'));
    } else {
      html += host('selectedBadge', `<span class="mini-icon">${modeIcon(state.A.mode)}</span>${word(label(state.A.mode))}<span class="ready-mark">✓</span>`, 'selected-badge');
      html += host('ready', `<span class="ready-players">${image('playerA')}<span>✓</span>${state.screen === 'coop' ? image('playerB') + '<span>✓</span>' : ''}</span>`, 'ready');
    }
  }
  stage.innerHTML = html;
  document.querySelector('#caption').textContent = ({
    guild: 'U Zyxe: dva obrázkové směry. Trénování nabízí konkrétní modul. ✓ uloží volbu; krátké předvedení při prvním setkání ukáže opakování → lišku a cestu vpřed → meč a srdce.',
    arena: 'Před vstupem: zapamatovaná volba je zvýrazněná. Stačí ✓; druhý směr lze zvolit jedním klepnutím. Potvrzení zároveň spustí souboj, takže nepřidává další dialog.',
    board: 'Setkání mimo arénu: stejný proužek se ukáže před první sadou. Do potvrzení neběží čas ani útok nepřítele. Během souboje zůstane jen značka režimu; další tahy znovu nepotvrzuji.',
    coop: 'Každé dítě má vlastní řádek, modul a potvrzení. Jedno může trénovat, druhé jít dál. Souboj začne po obou ✓. V této ukázce mají děti rozlišovací portréty.',
  })[state.screen] + (state.started ? ' Návrh zde končí před spuštěním skutečného boje.' : '');
  stage.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const player = state[b.dataset.player]; player.mode = b.dataset.mode; player.ready = false; render();
  });
  stage.querySelectorAll('[data-module]').forEach(b => b.onclick = () => { state.A.module = b.dataset.module; render(); });
  stage.querySelectorAll('[data-ready]').forEach(b => b.onclick = () => {
    state[b.dataset.ready].ready = true;
    state.started = state.A.ready && (state.screen !== 'coop' || state.B.ready); render();
  });
  stage.querySelector('#leave-guild')?.addEventListener('click', () => open('arena'));
}
function open(screen) {
  state.screen = screen; state.started = false; state.A.ready = false; state.B.ready = false;
  history.replaceState(null, '', '#' + screen); render();
}
document.querySelectorAll('[data-screen]').forEach(b => b.onclick = () => open(b.dataset.screen));
document.querySelector('#words').onclick = e => { state.words = !state.words; e.currentTarget.setAttribute('aria-pressed', String(!state.words)); render(); };
document.querySelector('#mastered').onclick = e => {
  state.allMastered = !state.allMastered; e.currentTarget.setAttribute('aria-pressed', String(state.allMastered));
  if (state.allMastered) state.A.mode = state.B.mode = 'progress';
  state.started = false; state.A.ready = state.B.ready = false; render();
};
document.querySelector('#reset').onclick = () => open(state.screen);
window.practiceChoicePreview = { state, open };
render();

import layout from './scenes.json';
import model from './model.json';
import forms from '../fox-evolution-v4/manifest.json';
import { getExamPresentation } from '../../../src/ui/ExamPresentation';

// Independent review session. No saves, API calls, gameplay rewards or migrations.
const $ = selector => document.querySelector(selector);
const art = '../training-flow-v5/assets/';
const icons = '../fox-evolution-v1/assets/';
const profiles = {A: makeProfile('mixed'), B: makeProfile('locked')};
let owner = 'A', busy = false, generation = 0, animations = [], detailTarget = null;
const image = (src, cls = '', alt = '') => `<img src="${src}" class="${cls}" alt="${alt}" draggable="false">`;
const familyFor = id => model.families.find(f => f.modules.includes(id));
const profile = () => profiles[owner];
const power = family => family.modules.reduce((sum, id) => sum + model.rankContribution[profile().ranks[id]], 0);
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
const portrait = id => `/assets/ui/town-hud-a/portraits/${id === 'A' ? 'heroine' : 'hero'}-portrait.png`;
const foxPortrait = form => '../fox-evolution-v4/' + forms[form].asset;
function makeProfile(preset) {
  const ranks = {};
  model.families.forEach((family, row) => family.modules.forEach((id, col) => ranks[id] = model.presets[preset][row][col]));
  return {preset, ranks, form: formForPoints(Object.values(ranks).reduce((a, b) => a + b, 0)), selected: Object.keys(ranks).find(id => ranks[id] < 2) ?? 'A1'};
}
function formForPoints(points) { return model.appearance.milestones.findLastIndex(value => points >= value); }
function growth(p = profile()) {
  const points = Object.values(p.ranks).reduce((a, b) => a + b, 0);
  const form = p.form, final = form === model.appearance.milestones.length - 1;
  const next = Math.min(form + 1, model.appearance.milestones.length - 1);
  const start = model.appearance.milestones[form], end = model.appearance.milestones[next];
  return {points, form, next, final, value: final ? 1 : points - start, max: final ? 1 : end - start};
}
function place(element, data, width, height) {
  element.style.left = `${data.x / width * 100}%`;
  element.style.top = `${data.y / height * 100}%`;
  element.style.width = `${data.width / width * 100}%`;
  element.style.height = `${data.height / height * 100}%`;
  element.style.zIndex = data.depth;
}
for (const data of layout.elements) place($('#' + data.id), data, layout.width, layout.height);
for (const data of layout.detail.elements) {
  const element = $('#' + data.id); element.classList.add('placed');
  place(element, data, 900, 666.2084);
}
function shortExample(id) {
  if (id === 'comparison_symbols') return {text: '3 = 3', relation: true};
  if (id.endsWith('4')) return {text: '+  −', mixed: true};
  return {text: getExamPresentation(id).preview.replaceAll(' ', '')};
}
function stones(rank, nearest = false, showRanks = false) {
  return [1, 2].map(level => {
    const gained = rank >= level, next = nearest && rank + 1 === level;
    const cls = gained ? 'gained' : next ? 'next' : 'future';
    return `<span class="rune-stone ${cls}" data-level="${level}">${image(art + `rune-${gained ? 'active' : 'normal'}.webp`)}<span class="rune-mark" aria-hidden="true">${gained ? '✓' : '+'}</span>${showRanks ? `<span class="stone-rank" aria-hidden="true">${level === 1 ? 'I' : 'II'}</span>` : ''}</span>`;
  }).join('');
}
function renderGrowth(held = null) {
  const state = held ?? growth();
  const {form, next, final, value, max, points} = state;
  const current = $('#currentPortrait'), upcoming = $('#nextPortrait');
  current.dataset.form = String(form); upcoming.dataset.form = String(next);
  current.dataset.owner = owner; upcoming.dataset.owner = owner;
  current.querySelector('.portrait-fox').src = foxPortrait(form);
  current.querySelector('.portrait-fox').alt = forms[form].alt;
  upcoming.querySelector('.portrait-fox').src = foxPortrait(next);
  upcoming.querySelector('.portrait-fox').alt = forms[next].alt;
  current.querySelector('.portrait-rank').textContent = String(form + 1);
  upcoming.querySelector('.portrait-rank').textContent = final ? '✓' : String(next + 1);
  upcoming.querySelector('.portrait-label').textContent = final ? 'Hotovo' : 'Příště';
  upcoming.classList.toggle('future', !final); upcoming.classList.toggle('finished', final);
  $('#growthMilestones').innerHTML = model.appearance.milestones.map((_, i) => `<span class="milestone ${i <= form ? 'reached' : ''} ${i === form ? 'current' : ''}" aria-label="Podoba ${i + 1}${i <= form ? ', získaná' : ', budoucí'}">${image(icons + 'rune-frame.webp')}${image(foxPortrait(i), 'mini-fox')}<span class="mini-rank">${i + 1}</span>${i <= form ? '<span class="mini-check" aria-hidden="true">✓</span>' : ''}</span>`).join('');
  const track = $('#progressTrack');
  track.dataset.points = points; track.dataset.owner = owner;
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(max)); track.setAttribute('aria-valuenow', String(value));
  track.setAttribute('aria-label', final ? 'Vývoj podob dokončen' : 'Cesta k příští podobě');
  track.classList.toggle('finished', final);
  track.querySelector('.track-arrow').textContent = final ? '✓' : '➜';
  $('#progressFill').style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
  const target = profile().selected, family = familyFor(target), rank = profile().ranks[target];
  const example = shortExample(target), preview = example.relation ? '3<span class="relation-glyph">=</span>3' : example.text;
  const now = power(family), after = now + model.rankContribution[Math.min(2, rank + 1)] - model.rankContribution[rank];
  $('#selectedReward').innerHTML = `<span class="reward-example ${example.relation ? 'relation' : ''}">${preview}</span><span class="reward-arrow" aria-hidden="true">→</span><span class="reward-icon">${image(icons + 'rune-frame.webp')}${image(icons + family.id + '-1.webp', 'symbol')}</span><span class="reward-value">${now}${rank < 2 ? ' → ' + after : ' ✓'}</span>`;
  $('#selectedReward').dataset.target = target; $('#selectedReward').dataset.owner = owner;
  $('#selectedReward').setAttribute('aria-label', `Hráč ${owner === 'A' ? 1 : 2}, ${getExamPresentation(target).title}, ${family.label}, ${now}${rank < 2 ? ' na ' + after : ', získané'}`);
  $('#selectedReward').disabled = busy;
}
function render(hold = null) {
  $('#preset').value = profile().preset;
  $('#owners').innerHTML = ['A', 'B'].map(id => `<button class="owner" data-owner="${id}" aria-label="Hráč ${id === 'A' ? 1 : 2}" aria-pressed="${id === owner}">${image(portrait(id))}<span aria-hidden="true">${id === 'A' ? 1 : 2}</span></button>`).join('');
  $('#owners').querySelectorAll('button').forEach(button => button.onclick = () => {
    cancelEffects(); closeDetail(false); owner = button.dataset.owner; render();
  });
  $('#rows').replaceChildren();
  for (const [rowIndex, family] of model.families.entries()) {
    const currentPower = hold?.family === family.id ? hold.before : power(family);
    const nearest = family.modules.find(id => profile().ranks[id] < 2);
    const row = document.createElement('div');
    row.className = 'ability-row' + (currentPower === 0 ? ' locked' : '');
    row.dataset.family = family.id;
    row.setAttribute('aria-label', `${family.label}, síla ${currentPower}`);
    const rowsHost = layout.elements.find(element => element.id === 'rows');
    row.style.top = `${rowIndex * (layout.row.height + layout.row.gap) / rowsHost.height * 100}%`;
    row.style.height = `${layout.row.height / rowsHost.height * 100}%`;
    row.innerHTML = `<div class="row-part main-icon">${image(icons + 'rune-frame.webp', 'circle-frame')}${image(icons + family.id + '-1.webp', 'ability-artwork', family.label)}${currentPower === 0 ? image(art + 'journey-lock-closed.webp', 'main-lock', 'Zamčeno') : ''}</div><div class="row-part ability-name word">${family.label}</div><div class="row-part ability-power"><b>${currentPower}</b></div><div class="row-part module-lane" role="group" aria-label="Moduly schopnosti ${family.label}"></div>`;
    const parts = [['.main-icon', 'icon'], ['.ability-name', 'name'], ['.ability-power', 'power'], ['.module-lane', 'modules']];
    for (const [selector, name] of parts) place(row.querySelector(selector), layout.row[name], layout.row.width, layout.row.height);
    const lane = row.querySelector('.module-lane');
    for (const target of family.modules) {
      const example = shortExample(target), rank = profile().ranks[target], button = document.createElement('button');
      button.type = 'button'; button.className = 'module-button';
      button.dataset.target = target; button.dataset.owner = owner;
      button.setAttribute('aria-pressed', String(profile().selected === target));
      button.setAttribute('aria-label', `Hráč ${owner === 'A' ? 1 : 2}, ${getExamPresentation(target).title}, ${target}, ${rank === 0 ? 'zatím bez runy' : 'runa ' + (rank === 1 ? 'I' : 'II')}`);
      button.style.width = `${layout.row.module.width / layout.row.modules.width * 100}%`;
      button.disabled = busy;
      const preview = example.relation ? '3<span class="relation-glyph">=</span>3' : example.text;
      button.innerHTML = `<span class="module-surface"><span class="module-example ${example.text.length > 5 ? 'long' : ''} ${example.relation ? 'relation' : ''}">${preview}</span><span class="rune-pair">${stones(rank, target === nearest)}</span></span>`;
      button.onclick = () => { profile().selected = target; render(); openDetail(target); };
      lane.append(button);
    }
    $('#rows').append(row);
  }
  const complete = Object.values(profile().ranks).every(rank => rank === 2);
  $('#completion').innerHTML = complete ? '<span class="complete-symbol" aria-hidden="true">✓</span><span class="word">Hotovo</span>' : '';
  $('#award').disabled = busy || profile().ranks[profile().selected] === 2;
  const selected = profile().selected;
  $('#reviewStatus').textContent = `Hráč ${owner === 'A' ? 1 : 2} · ${getExamPresentation(selected).title} (${selected}) · ${familyFor(selected).label} · příspěvek modulu ${profile().ranks[selected]}/2. Ukázka má 21 skutečných ID modulů, ilustrační přiřazení rodin a dva nezávislé fiktivní profily.`;
  renderGrowth(hold?.growth);
  $('#reviewStatus').textContent += ` Společná cesta: ${growth().points}/42 jedinečných dosažení, podoba ${profile().form + 1}/5.`;
}
function openDetail(target) {
  detailTarget = target;
  const family = familyFor(target), rank = profile().ranks[target];
  const presentation = getExamPresentation(target);
  $('#detailTitle').textContent = presentation.title;
  $('#detailOwner').innerHTML = image(portrait(owner)) + `<span class="owner-number">${owner === 'A' ? 1 : 2}</span>`;
  if (target === 'comparison_symbols') $('#detailExample').innerHTML = '3<span class="relation-glyph">=</span>3';
  else $('#detailExample').textContent = presentation.preview;
  $('#detailExample').classList.toggle('relation', target === 'comparison_symbols');
  if (target.endsWith('4')) $('#detailExample').textContent = presentation.preview.split('     ')[0];
  $('#detailRunes').innerHTML = `<div class="detail-stones">${stones(rank, true, true)}</div><span class="detail-arrow" aria-hidden="true">→</span>`;
  const now = power(family), next = now + model.rankContribution[Math.min(2, rank + 1)] - model.rankContribution[rank];
  $('#detailPower').innerHTML = image(icons + family.id + '-1.webp', 'detail-power-icon', family.label) + `<div class="detail-numbers"><span>${now}</span>${rank < 2 ? `<span class="number-arrow" aria-hidden="true">→</span><strong>${next}</strong>` : '<span aria-label="Získané">✓</span>'}</div>`;
  $('#detail').hidden = false;
  $('#detail').dataset.owner = owner; $('#detail').dataset.target = target;
  $('#detailClose').focus({preventScroll: true});
}
function closeDetail(restore = true) {
  $('#detail').hidden = true;
  if (restore && detailTarget) $(`.module-button[data-target="${detailTarget}"]`)?.focus({preventScroll: true});
  detailTarget = null;
}
$('#detailClose').onclick = () => closeDetail();
$('#selectedReward').onclick = () => openDetail(profile().selected);
$('#detail').onclick = event => { if (event.target === $('#detail')) closeDetail(); };
document.addEventListener('keydown', event => {
  if ($('#detail').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
  if (event.key === 'Tab') { event.preventDefault(); $('#detailClose').focus({preventScroll: true}); }
});
function cancelEffects() {
  generation++; animations.forEach(animation => animation.cancel()); animations = [];
  $('#effects').replaceChildren(); busy = false;
}
async function play(element, frames, options) {
  if (reduced()) return;
  const animation = element.animate(frames, options); animations.push(animation);
  await animation.finished.catch(() => {});
}
async function award() {
  if (busy) return;
  const p = profile(), target = p.selected, oldRank = p.ranks[target];
  if (oldRank === 2) return;
  closeDetail(false);
  const token = ++generation, family = familyFor(target), before = power(family), priorGrowth = growth(p);
  p.ranks[target] = oldRank + 1;
  p.form = Math.max(p.form, formForPoints(growth(p).points)); busy = true;
  render({family: family.id, before, growth: priorGrowth});
  const stage = $('#stage').getBoundingClientRect();
  const source = $(`.module-button[data-target="${target}"] .rune-stone[data-level="${oldRank + 1}"]`).getBoundingClientRect();
  const host = $(`.ability-row[data-family="${family.id}"] .main-icon`);
  const destination = host.getBoundingClientRect();
  const spark = document.createElement('img');
  spark.src = art + 'rune-active.webp'; spark.className = 'travel-rune';
  spark.style.left = `${(source.x + source.width / 2 - stage.x) / stage.width * 100 - 2.5}%`;
  spark.style.top = `${(source.y + source.height / 2 - stage.y) / stage.height * 100 - 3.38}%`;
  $('#effects').append(spark);
  const dx = destination.x + destination.width / 2 - source.x - source.width / 2;
  const dy = destination.y + destination.height / 2 - source.y - source.height / 2;
  await play(spark, [{transform: 'translate(0,0)', opacity: 1}, {transform: `translate(${dx}px,${dy}px)`, opacity: 1}], {duration: 720, easing: 'ease-in-out', fill: 'forwards'});
  if (token !== generation) return;
  spark.remove(); busy = false; render();
  if (p.form > priorGrowth.form) {
    const halo = document.createElement('span'); halo.className = 'evolution-halo';
    $('#currentPortrait').append(halo);
    play(halo, [{opacity: 0}, {opacity: 1, offset: .25}, {opacity: 0}], {duration: 900}).then(() => halo.remove());
  }
  const updated = $(`.ability-row[data-family="${family.id}"]`);
  if (before === 0) {
    const ring = document.createElement('i'); ring.className = 'unlock-ring';
    updated.querySelector('.main-icon').append(ring);
    await play(ring, [{transform: 'scale(.7)', opacity: 0}, {transform: 'scale(1)', opacity: 1, offset: .3}, {transform: 'scale(1.3)', opacity: 0}], {duration: 720, easing: 'ease-out'});
    ring.remove();
  } else {
    const number = document.createElement('span'); number.className = 'gain-number';
    number.textContent = '+' + (power(family) - before);
    updated.querySelector('.ability-power').append(number);
    await play(number, [{transform: 'translateY(0)', opacity: 1}, {transform: 'translateY(-80%)', opacity: 0}], {duration: 900, easing: 'ease-out'});
    number.remove();
  }
}
$('#award').onclick = award;
$('#preset').onchange = event => { cancelEffects(); closeDetail(false); profiles[owner] = makeProfile(event.target.value); render(); };
$('#restart').onclick = () => { cancelEffects(); closeDetail(false); profiles[owner] = makeProfile(profile().preset); render(); };
$('#words').onclick = event => { const hidden = $('#stage').classList.toggle('no-words'); event.currentTarget.setAttribute('aria-pressed', String(hidden)); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelEffects(); render(); } });
window.foxAbilityReview = {
  snapshot: () => structuredClone({owner, profiles, busy, detailTarget, growth: growth(), powers: Object.fromEntries(model.families.map(family => [family.id, power(family)]))}),
};
render();

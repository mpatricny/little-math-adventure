const $=s=>document.querySelector(s);
const layout=await fetch('./scenes.json').then(r=>r.json());
const families=[{id:'shield',label:'Štít'},{id:'heal',label:'Léčení'},{id:'strike',label:'Útok'}];
const ranks={shield:2,heal:1,strike:3};
const state={body:2,used:new Set(),defense:false,health:12,tab:'forms',busy:false};
const names=['Základ','Blesk','Jako blesk'];
const asset=(family,rank)=>`assets/${family}-${rank}.webp`;
const image=(src,cls='',alt='')=>`<img class="${cls}" src="${src}" alt="${alt}" draggable="false">`;
for(const [sceneId,scene] of Object.entries(layout))for(const d of scene.elements){const e=$('#'+d.id);e.style.cssText=`left:${d.x/scene.width*100}%;top:${d.y/scene.height*100}%;width:${d.width/scene.width*100}%;height:${d.height/scene.height*100}%;z-index:${d.depth}`;}
$('#formGrid').innerHTML=names.map((n,i)=>`<article class="form-card">${image('../training-flow-v5/assets/tall-frame.webp','card-frame')}${image(`assets/body-${i}.webp`,'fox-design',n)}<h3>${n}</h3></article>`).join('');
function renderAbilities(){
 $('#abilityGrid').innerHTML='<span></span>'+['I','II','III'].map(n=>`<h3 class="tier-title">${n}</h3>`).join('')+families.map(f=>`<h3 class="family-label">${f.label}</h3>`+[1,2,3].map(rank=>`<button class="ability-choice" data-family="${f.id}" data-rank="${rank}" aria-label="${f.label}, stupeň ${rank}" aria-pressed="${ranks[f.id]===rank}"><span class="surface">${image('../training-flow-v5/assets/choice-frame.webp','choice-frame')}${image(asset(f.id,rank),'ability-art')}<span class="chosen" aria-hidden="true">✓</span></span></button>`).join('')).join('');
 document.querySelectorAll('.ability-choice').forEach(b=>b.onclick=()=>{ranks[b.dataset.family]=Number(b.dataset.rank);renderAbilities();resetBattle();renderRunes();});
}
function runeButton(f,layer=false){
 const spent=!layer&&state.used.has(f.id);
 return `<button class="rune-button ${spent?'spent':''}" data-power="${f.id}" aria-label="${f.label}, stupeň ${ranks[f.id]}${spent?', použito':''}" ${!layer&&(state.defense||state.busy||spent||state.health===0)?'disabled':''}><span class="surface">${image('assets/rune-frame.webp','rune-frame')}${image(asset(f.id,ranks[f.id]),'rune-icon')}${f.id==='strike'?`<span class="damage-value">${ranks.strike}</span>`:''}<span class="use-light" aria-hidden="true">${spent?'✓':''}</span>${!layer&&state.defense?image('../training-flow-v5/assets/journey-lock-closed.webp','temporary-lock'):''}</span></button>`;
}
function renderRunes(){
 $('#abilityDock').innerHTML=families.map(f=>runeButton(f)).join('');
 $('#layerRunes').innerHTML=families.map(f=>`<div class="layer-ability">${runeButton(f,true)}<span>${f.label} ${['I','II','III'][ranks[f.id]-1]}</span></div>`).join('');
 document.querySelectorAll('#abilityDock [data-power]').forEach(b=>b.onclick=()=>usePower(b.dataset.power));
 document.querySelectorAll('#layerRunes [data-power]').forEach(b=>b.onclick=()=>showLayer(b.dataset.power));
 $('#enemyHealth strong').textContent=state.health;
}
let animations=[],effectGeneration=0;
function clearEffects(){effectGeneration++;animations.forEach(a=>a.cancel());animations=[];for(const id of ['effectHost','heroEffect','enemyEffect','layerEffect'])$('#'+id).replaceChildren();state.busy=false;}
function resetBattle(){clearEffects();state.used.clear();state.health=12;renderRunes();}
function flash(host,family,rank,kind){
 const e=document.createElement('span');e.className='power-effect '+kind;
 if(kind==='protective'&&family==='shield')e.innerHTML='<svg class="shield-field" viewBox="0 0 320 360" aria-hidden="true"><path d="M160 20 292 65v103c0 81-67 140-132 176C95 308 28 249 28 168V65Z" fill="#42cffc10" stroke="#64edff" stroke-width="7"/><path d="M160 34 279 75v93c0 71-59 127-119 161C100 295 41 239 41 168V75Z" fill="none" stroke="#d2fbff" stroke-width="2" opacity=".75"/></svg>'+image(asset(family,rank),'effect-emblem');
 else e.innerHTML=image(asset(family,rank),'effect-symbol');
 host.append(e);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 if(reduced){e.classList.add('still');return Promise.resolve();}
 const frames=kind==='projectile'?[{transform:'translateX(0)',opacity:1},{transform:'translateX(46cqw)',opacity:1,offset:.72},{transform:'translateX(46cqw)',opacity:0}]:kind==='healing'?[{transform:'translateY(15%)',opacity:0},{transform:'translateY(0)',opacity:1,offset:.3},{transform:'translateY(-20%)',opacity:0}]:[{opacity:0},{opacity:1,offset:.25},{opacity:1,offset:.7},{opacity:0}];
 const a=e.animate(frames,{duration:kind==='projectile'?850:1300,easing:'ease-out',fill:'forwards'});animations.push(a);return a.finished.catch(()=>{}).then(()=>e.remove());
}
async function usePower(family){
 if(state.used.has(family)||state.defense||state.busy||state.health===0)return;
 const generation=effectGeneration;
 state.used.add(family);state.busy=true;renderRunes();
 if(family==='strike'){
  await flash($('#effectHost'),family,ranks[family],'projectile');
  if(generation!==effectGeneration)return;
  state.health=Math.max(0,state.health-ranks.strike);
  const n=document.createElement('strong');n.className='damage-pop';n.textContent='−'+ranks.strike;$('#enemyEffect').append(n);
 }else await flash($('#heroEffect'),family,ranks[family],family==='heal'?'healing':'protective');
 if(generation!==effectGeneration)return;
 state.busy=false;renderRunes();
}
function showLayer(family){
 clearEffects();if(!$('#showEffects').checked)return;
 flash($('#layerEffect'),family,ranks[family],family==='heal'?'healing':'protective');
}
function showTab(id){state.tab=id;clearEffects();document.querySelectorAll('[data-panel]').forEach(s=>s.hidden=s.id!==id);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===id)));renderRunes();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('#showCombination').onclick=()=>showTab('layers');
$('#combinationPreset').onclick=()=>{Object.assign(ranks,{shield:2,heal:1,strike:3});renderAbilities();resetBattle();renderRunes();};
$('#bodySelect').onchange=e=>{state.body=e.target.value;$('#combatFox').src=state.body==='source'?'assets/source-idle.png':`assets/body-${state.body}.webp`;};
$('#resetBattle').onclick=resetBattle;
$('#defense').onclick=()=>{state.defense=!state.defense;$('#defense').setAttribute('aria-pressed',String(state.defense));$('#battleStage').classList.toggle('defending',state.defense);renderRunes();};
$('#hideWords').onclick=()=>{$('#battleStage').classList.toggle('no-words');$('#hideWords').setAttribute('aria-pressed',String($('#battleStage').classList.contains('no-words')));};
$('#showBody').onchange=e=>$('#layerFox').hidden=!e.target.checked;
$('#showRunes').onchange=e=>$('#layerRunes').hidden=!e.target.checked;
$('#showEffects').onchange=()=>clearEffects();
$('#smallBodies').innerHTML=names.map((n,i)=>`<div>${image(`assets/body-${i}.webp`)}<span>${n}</span></div>`).join('');
renderAbilities();renderRunes();
const requested=new URLSearchParams(location.search).get('view');if(['forms','abilities','battle','layers'].includes(requested))showTab(requested);
await document.fonts.ready;
window.foxEvolutionPreview={ready:true,state,ranks,layout,showTab,resetBattle};

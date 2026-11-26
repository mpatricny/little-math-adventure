const $=s=>document.querySelector(s);
const layout=await fetch('./scenes.json').then(r=>r.json());
const old='../fox-evolution-v1/assets/';
const art='../training-flow-v5/assets/';
const families=[{id:'shield',label:'Štít'},{id:'heal',label:'Léčení'},{id:'strike',label:'Zásah'}];
const ranks={shield:2,heal:1,strike:2};
const battle={body:0,used:new Set(),defense:false,health:12,busy:false};
const growth={length:21,nodes:Array(21).fill(0),selected:0,form:0,busy:false};
let animations=[],generation=0,growthAnimations=[],growthGeneration=0;
const img=(src,cls='',alt='')=>`<img src="${src}" class="${cls}" alt="${alt}" draggable="false">`;
const asset=(f,r)=>`${old}${f}-${r}.webp`;
const body=i=>`assets/body-${i}.webp`;
const pips=n=>`<span class="rune-pips" aria-hidden="true"><i class="${n>0?'on':''}"></i><i class="${n>1?'on':''}"></i></span>`;
const milestones=()=>growth.length===21?[0,4,10,20,32]:[0,2,4,6,8];
const total=()=>growth.nodes.reduce((a,b)=>a+b,0);
const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
for(const name of ['battle','growth']){const scene=layout[name];for(const d of scene.elements){const e=$('#'+d.id);e.style.cssText=`left:${d.x/scene.width*100}%;top:${d.y/scene.height*100}%;width:${d.width/scene.width*100}%;height:${d.height/scene.height*100}%;z-index:${d.depth}`;}}
$('#formGrid').innerHTML=Array.from({length:5},(_,i)=>`<article class="form-card">${img(art+'tall-frame.webp','card-frame')}${img(body(i),'fox-design',`Podoba ${i+1}`)}<h3>Podoba ${i+1}</h3></article>`).join('');
$('#milestoneNotes').innerHTML=[0,4,10,20,32].map((n,i)=>`<div><strong>${n}</strong><span>${i?`alespoň ${n/2} uzlů`:'po záchraně'}</span></div>`).join('');
$('#expressionGrid').innerHTML=['Vlídná','Zvědavá','Hravá'].map((n,i)=>`<article class="expression-card ${i===1?'recommended':''}">${img(art+'tall-frame.webp','card-frame')}${img(`assets/expression-${i}.webp`,'fox-design',n)}${i===1?'<span class="recommended-tag">Doporučená</span>':''}<h3>${n}</h3></article>`).join('');
$('#bodySelect').innerHTML=Array.from({length:5},(_,i)=>`<option value="${i}">Podoba ${i+1}</option>`).join('')+'<option value="source">Současný zdroj</option>';
$('#smallBodies').innerHTML=Array.from({length:5},(_,i)=>`<div>${img(body(i),'',`Podoba ${i+1}`)}<span>${i+1}</span></div>`).join('');

function renderAbilities(){
 $('#abilityGrid').innerHTML='<span></span>'+['I','II'].map((n,i)=>`<h3 class="tier-title">${n}<small>${i?'Legenda':'Velmistr'} · návrh</small></h3>`).join('')+families.map(f=>`<h3 class="family-label">${f.label}</h3>`+[1,2].map(rank=>`<button class="ability-choice" data-family="${f.id}" data-rank="${rank}" aria-label="${f.label}, runa ${rank}" aria-pressed="${ranks[f.id]===rank}"><span class="surface">${img(art+'choice-frame.webp','choice-frame')}${img(asset(f.id,rank),'ability-art')}<span class="chosen" aria-hidden="true">✓</span></span></button>`).join('')).join('');
 document.querySelectorAll('.ability-choice').forEach(b=>b.onclick=()=>{ranks[b.dataset.family]=Number(b.dataset.rank);renderAbilities();resetBattle();});
}
function renderRunes(){
 $('#abilityDock').innerHTML=families.map(f=>{
  const spent=battle.used.has(f.id),disabled=battle.defense||battle.busy||spent||battle.health===0;
  return `<button class="rune-button ${spent?'spent':''}" data-power="${f.id}" aria-label="${f.label}, runa ${ranks[f.id]}${spent?', použito':''}" ${disabled?'disabled':''}><span class="surface">${img(old+'rune-frame.webp','rune-frame')}${img(asset(f.id,ranks[f.id]),'rune-icon')}${f.id==='strike'?`<span class="damage-value">${ranks.strike}</span>`:pips(ranks[f.id])}<span class="use-light" aria-hidden="true">${spent?'✓':''}</span>${battle.defense?img(art+'journey-lock-closed.webp','temporary-lock'):''}</span></button>`;
 }).join('');
 document.querySelectorAll('[data-power]').forEach(b=>b.onclick=()=>usePower(b.dataset.power));
 $('#enemyHealth strong').textContent=battle.health;
 $('#defense').disabled=battle.busy;
}
function clearBattleEffects(){generation++;animations.forEach(a=>a.cancel());animations=[];for(const id of ['effectHost','heroEffect','enemyEffect'])$('#'+id).replaceChildren();battle.busy=false;}
function resetBattle(){clearBattleEffects();battle.used.clear();battle.health=12;renderRunes();}
async function effect(host,family,kind){
 const e=document.createElement('span');e.className='power-effect '+kind;
 e.innerHTML=family==='shield'?'<svg class="shield-field" viewBox="0 0 320 360" aria-hidden="true"><path d="M160 20 292 65v103c0 81-67 140-132 176C95 308 28 249 28 168V65Z" fill="#42cffc10" stroke="#64edff" stroke-width="7"/><path d="M160 34 279 75v93c0 71-59 127-119 161C100 295 41 239 41 168V75Z" fill="none" stroke="#d2fbff" stroke-width="2"/></svg>'+img(asset(family,ranks[family]),'effect-emblem'):img(asset(family,ranks[family]),'effect-symbol');
 host.append(e);
 if(reduced())return;
 const frames=kind==='projectile'?[{transform:'translateX(0)',opacity:1},{transform:'translateX(46cqw)',opacity:1,offset:.72},{transform:'translateX(46cqw)',opacity:0}]:kind==='healing'?[{transform:'translateY(15%)',opacity:0},{transform:'translateY(0)',opacity:1,offset:.3},{transform:'translateY(-20%)',opacity:0}]:[{opacity:0},{opacity:1,offset:.25},{opacity:1,offset:.7},{opacity:0}];
 const a=e.animate(frames,{duration:kind==='projectile'?850:1300,easing:'ease-out',fill:'forwards'});animations.push(a);await a.finished.catch(()=>{});e.remove();
}
async function usePower(family){
 if(battle.used.has(family)||battle.defense||battle.busy||battle.health===0)return;
 const token=generation;battle.used.add(family);battle.busy=true;renderRunes();
 if(family==='strike'){
  await effect($('#effectHost'),family,'projectile');if(token!==generation)return;
  battle.health=Math.max(0,battle.health-ranks.strike);
  const n=document.createElement('strong');n.className='damage-pop';n.textContent='−'+ranks.strike;$('#enemyEffect').append(n);
 }else await effect($('#heroEffect'),family,family==='heal'?'healing':'protective');
 if(token!==generation)return;battle.busy=false;renderRunes();
}
function renderGrowth(displayForm=growth.form){
 const points=total(),steps=milestones(),current=displayForm,next=Math.min(4,current+1);
 $('#currentPortrait .portrait-fox').src=body(current);$('#nextPortrait .portrait-fox').src=body(next);
 $('#nextPortrait .word').textContent=current===4?'Hotovo':'Příště';
 $('#growthMilestones').innerHTML=steps.map((_,i)=>`<div class="milestone-dot ${i<=current?'reached':''} ${i===current?'current':''}" aria-label="Podoba ${i+1}${i<=current?', získaná':''}">${img(old+'rune-frame.webp')}${img(body(i),'mini-fox')}${i<=current?'<span class="mini-check" aria-hidden="true">✓</span>':''}</div>`).join('');
 const fraction=current===4?1:(points-steps[current])/(steps[next]-steps[current]);
 $('#progressFill').style.width=`${Math.max(0,Math.min(1,fraction))*100}%`;
 $('#progressTrack').setAttribute('aria-valuemin',0);$('#progressTrack').setAttribute('aria-valuemax',steps[next]-steps[current]||1);$('#progressTrack').setAttribute('aria-valuenow',current===4?1:points-steps[current]);
 const family=families[growth.selected%3],rank=growth.nodes[growth.selected];
 $('#selectedReward').innerHTML=`<span class="reward-node">${growth.selected+1}</span><span class="reward-arrow" aria-hidden="true">→</span><span class="reward-rune">${img(old+'rune-frame.webp')}${img(asset(family.id,Math.max(1,rank)),'rank-art')}${pips(rank)}</span>${rank===2?'<span class="reward-complete" aria-hidden="true">✓</span>':''}`;
 $('#moduleGrid').classList.toggle('short-path',growth.length===4);
 const moduleHost=growth.length===4?layout.moduleLayout.shortPath:layout.growth.elements.find(e=>e.id==='moduleGrid');
 for(const [css,key,axis] of [['left','x','width'],['top','y','height'],['width','width','width'],['height','height','height']])$('#moduleGrid').style[css]=`${moduleHost[key]/layout.growth[axis]*100}%`;
 $('#moduleGrid').innerHTML=growth.nodes.map((rank,i)=>`<button class="module-button ${rank===2?'complete':''}" data-module="${i}" aria-pressed="${i===growth.selected}" aria-label="Uzel ${i+1}, ${families[i%3].label}, ${rank} ze 2 nových stupňů"><span class="surface"><span class="module-number">${i+1}</span>${img(asset(families[i%3].id,Math.max(1,rank)),'module-symbol')}${pips(rank)}</span></button>`).join('');
 document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>{cancelGrowthEffect();growth.selected=Number(b.dataset.module);renderGrowth();});
 $('#award').disabled=rank>=2||growth.busy;
 $('#growthSummary').textContent=`Návrhářská evidence: ${points} z ${growth.length*2} jedinečných příspěvků · ${growth.nodes.filter(n=>n>0).length} různých uzlů · podoba ${current+1} z 5. Vybraný uzel ${growth.selected+1}: ${rank}/2. ${rank===2?'Oba nové stupně už započítány.':'Kliknutí na „Nový stupeň“ simuluje skutečně nový úspěch.'}`;
}
function cancelGrowthEffect(){growthGeneration++;growthAnimations.forEach(a=>a.cancel());growthAnimations=[];$('#growthEffect').replaceChildren();document.querySelectorAll('.growth-spark,.growth-halo').forEach(e=>e.remove());growth.busy=false;}
async function awardGrowth(){
 if(growth.busy||growth.nodes[growth.selected]>=2)return;
 const oldForm=growth.form,token=growthGeneration;
 growth.nodes[growth.selected]++;const points=total();growth.form=Math.max(growth.form,milestones().findLastIndex(x=>points>=x));growth.busy=true;renderGrowth(reduced()?growth.form:oldForm);
 if(!reduced()){
  const stage=$('#growthStage'),from=$(`[data-module="${growth.selected}"]`).getBoundingClientRect(),to=$('#progressTrack').getBoundingClientRect(),box=stage.getBoundingClientRect();
  const spark=document.createElement('span');spark.className='growth-spark';spark.style.left=`${from.left+from.width/2-box.left-14}px`;spark.style.top=`${from.top+from.height/2-box.top-14}px`;stage.append(spark);
  const a=spark.animate([{translate:'0 0',opacity:1},{translate:`${to.left+to.width/2-from.left-from.width/2}px ${to.top-from.top-from.height/2}px`,opacity:1,offset:.8},{translate:`${to.left+to.width/2-from.left-from.width/2}px ${to.top-from.top-from.height/2}px`,opacity:0}],{duration:700,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});growthAnimations.push(a);await a.finished.catch(()=>{});spark.remove();
  if(token!==growthGeneration)return;
  if(growth.form!==oldForm){renderGrowth();const halo=document.createElement('span');halo.className='growth-halo';$('#currentPortrait').append(halo);const h=halo.animate([{opacity:0},{opacity:1,offset:.25},{opacity:0}],{duration:850});growthAnimations.push(h);await h.finished.catch(()=>{});halo.remove();}
 }
 if(token!==growthGeneration)return;growth.busy=false;renderGrowth();
}
function resetGrowth(points=0){
 cancelGrowthEffect();growth.nodes=Array.from({length:growth.length},(_,i)=>Math.max(0,Math.min(2,points-i*2)));growth.selected=Math.min(growth.length-1,Math.floor(points/2));growth.form=milestones().findLastIndex(x=>points>=x);renderGrowth();
}
function renderMilestoneSelect(){const steps=milestones();$('#milestoneSelect').innerHTML=steps.map((n,i)=>`<option value="${n}">Podoba ${i+1} · ${n} příspěvků</option>`).join('');}
function showTab(id){
 if(!['forms','expressions','growth','abilities','battle'].includes(id))id='forms';
 clearBattleEffects();cancelGrowthEffect();
 document.querySelectorAll('[data-panel]').forEach(s=>s.hidden=s.id!==id);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===id)));
 if(id==='battle')resetBattle();if(id==='growth')renderGrowth();
 const url=new URL(location.href);url.searchParams.set('view',id);history.replaceState(null,'',url);
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('#showCombination').onclick=()=>showTab('battle');
$('#bodySelect').onchange=e=>{battle.body=e.target.value;$('#combatFox').src=battle.body==='source'?old+'source-idle.png':body(battle.body);};
$('#resetBattle').onclick=resetBattle;
$('#defense').onclick=()=>{if(battle.busy)return;battle.defense=!battle.defense;$('#defense').setAttribute('aria-pressed',String(battle.defense));$('#battleStage').classList.toggle('defending',battle.defense);renderRunes();};
for(const [button,stage] of [['hideWords','battleStage'],['hideGrowthWords','growthStage']])$('#'+button).onclick=()=>{$('#'+stage).classList.toggle('no-words');$('#'+button).setAttribute('aria-pressed',String($('#'+stage).classList.contains('no-words')));};
$('#award').onclick=awardGrowth;
$('#resetGrowth').onclick=()=>{$('#milestoneSelect').value='0';resetGrowth();};
$('#milestoneSelect').onchange=e=>resetGrowth(Number(e.target.value));
$('#pathLength').onchange=e=>{growth.length=Number(e.target.value);renderMilestoneSelect();resetGrowth();};
renderAbilities();renderRunes();renderMilestoneSelect();renderGrowth();showTab(new URLSearchParams(location.search).get('view')||'forms');
await document.fonts.ready;
window.foxEvolutionPreview={ready:true,battle,growth,ranks,layout,showTab,resetBattle,resetGrowth};

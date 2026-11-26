import { getReviewSession } from '../shared/practice-journey.ts';
import petDefinitions from '../../../public/assets/data/pets.json';
const layout=await fetch('./scenes.json').then(r=>r.json());
const foxDefinition=petDefinitions.find(p=>p.id==='pet_catacomb_A');
const $=s=>document.querySelector(s), session=getReviewSession();
const params=new URLSearchParams(location.search),embedded=params.get('embedded')==='1';
document.body.classList.toggle('embedded',embedded);
const art='../training-flow-v5/assets/';
const icons={
 clock:'<circle cx="16" cy="17" r="11"/><path d="M16 10v8l5 3M12 2h8M16 2v4"/>',
 lock:'<rect x="6" y="14" width="20" height="15" rx="3"/><path d="M10 14V9a6 6 0 0 1 12 0v5M16 20v4"/>',
 open:'<rect x="6" y="14" width="20" height="15" rx="3"/><path d="M11 14V8a6 6 0 0 1 12-1M16 20v4"/>',
 check:'<path d="m5 16 8 8L28 7"/>', replay:'<path d="M27 13A12 12 0 1 0 27 23M27 3v10H17"/>',
 book:'<path d="M16 8C11 4 6 4 2 6v21c5-2 9-1 14 2 5-3 9-4 14-2V6c-4-2-9-2-14 2v21"/><path d="m8 15 4 4 8-9"/>',
 cards:'<rect x="2" y="4" width="12" height="23" rx="3"/><rect x="18" y="4" width="12" height="23" rx="3"/><path d="M5 10h6M8 7v6M21 10h6M5 19l3 3 4-6M21 19l3 3 4-6"/>',
 swords:'<path d="M3 3l20 20m-4-2 5-5M29 3 9 23m4-2-5-5M21 24l6 6M11 24l-6 6"/>',
 star:'<path d="m16 2 4 9 10 1-7 7 2 11-9-6-9 6 2-11-7-7 10-1z"/>',
};
const svg=n=>`<svg viewBox="0 0 32 32" aria-hidden="true">${icons[n]}</svg>`;
const geometry=d=>`left:${d.x}px;top:${d.y}px;width:${d.width}px;height:${d.height}px;z-index:${d.depth??1}`;
for(const scene of Object.values(layout.scenes))for(const d of scene.elements){const e=document.getElementById(d.id);if(e)e.style.cssText=geometry(d);}
function lockArtwork(reason){
 const state=['open','complete'].includes(reason)?'open':'closed';
 return `<img class="lock-normal" src="${art}journey-lock-${state}.webp" alt=""><img class="lock-active" src="${art}journey-lock-${state}-active.webp" alt="">${reason==='complete'?`<span class="lock-complete">${svg('check')}</span>`:''}`;
}
function foxGuide(m){
 const rescued=m.fox.status!=='locked',owned=m.fox.status==='owned';
 const cards=[
  {state:rescued?'done':'current',label:'Katakomby',content:`<img class="step-door" src="${art}pet-doorway.webp" alt=""><img class="step-rescue-fox" src="${art}journey-fox.webp" alt="">`},
  {state:owned?'done':rescued?'current':'future',label:'U Pythie',content:`<img class="step-workshop" src="/assets/library/originals/468e5fe1-b2e89f57.webp" alt=""><span class="step-amulet"><img src="${art}pet-amulet-normal.webp" alt="Amulet"><strong>${foxDefinition.requiredAmulet.value}</strong></span>`},
  {state:owned?'current done':'future',label:'Parťák',content:`<img class="step-owner" src="${portrait(owner)}" alt=""><img class="step-companion" src="${art}fox-reward.webp" alt="Runová liška">`}
 ];
 return cards.map((card,i)=>`<div class="fox-step ${card.state}" data-step="${layout.scenes.guide.foxSteps[i].id}" style="${geometry(layout.scenes.guide.foxSteps[i])}"><img class="step-frame" src="${art}tall-frame.webp" alt=""><span class="step-scene">${card.content}</span><strong class="step-label words">${card.label}</strong>${card.state.includes('done')?`<span class="step-check">${svg('check')}</span>`:''}</div>`).join('')+layout.scenes.guide.foxArrows.map((d,i)=>`<span class="fox-step-arrow ${i===0&&rescued||owned?'passed':''}" style="${geometry(d)}" aria-hidden="true">→</span>`).join('');
}
const seconds=n=>n===null?'—':`${(n/1000).toLocaleString('cs-CZ',{maximumFractionDigits:1})} s`;
const portrait=owner=>`/assets/ui/town-hud-a/portraits/${owner==='A'?'heroine':'hero'}-portrait.png`;
let owner=params.get('owner')==='B'?'B':'A';
let focus=session.modules(owner).some(m=>m.targetId===params.get('targetId'))?params.get('targetId'):session.preference(owner).targetId;
let returnTo=null,screen='overview',guideKind=null,frameReady=false,pendingRoute=null;
let audio;
function speakExam(){audio??=new Audio('./audio/exam-preview.wav');audio.currentTime=0;audio.play().catch(()=>{});}
function view(name){screen=name;$('#fit').hidden=false;$('#flowHost').hidden=true;$('#boardHost').hidden=true;
 $('#entrance').hidden=name!=='entrance';$('#overview').hidden=name!=='overview';closeGuide();render();}
function closeGuide(){guideKind=null;$('#guide').hidden=true;$('#overview').inert=false;if(audio){audio.pause();audio.currentTime=0;}}
function render(){
 const selected=session.preference(owner).targetId,modules=session.modules(owner),current=session.snapshot(owner,focus);
 $('#owners').innerHTML=['A','B'].map(o=>`<button class="owner ${owner===o?'selected':''}" data-owner="${o}" aria-label="Hráč ${o==='A'?1:2}" aria-pressed="${owner===o}"><img src="${portrait(o)}" alt=""><b>${o==='A'?1:2}</b></button>`).join('');
 $('#rows').innerHTML=modules.map((m,i)=>`<div class="module-row ${m.targetId===focus?'focused':''}" style="${geometry(layout.scenes.overview.elements.find(d=>d.id==='moduleRow'+i))}" data-id="${m.targetId}">
 <button class="module-choice clear" data-target="${m.targetId}" aria-label="Vybrat ${m.title}" aria-pressed="${m.targetId===selected}">
 <span class="surface"><strong class="module-title words">${m.title}</strong><span class="speed-current">${svg('clock')}${seconds(m.speed.value)}</span>
 <span class="speed-goal">${seconds(m.speed.target)}</span><span class="speed-track"><i style="width:${100*m.speed.progress}%"></i><span class="threshold"></span></span>
 ${m.targetId===selected?`<span class="selection-mark">${svg('check')}</span>`:''}</span></button>
 <button class="gate clear ${m.lockReason}" style="${geometry(layout.scenes.overview.moduleGate)}" data-gate="${m.targetId}" aria-label="${m.title}: ${m.lockReason==='open'?'vstoupit':'stav zámku'}"><span class="gate-surface bitmap-lock">${lockArtwork(m.lockReason)}</span></button></div>`).join('');
 $('#mainOpenLock').innerHTML=lockArtwork(current.lockReason);$('#mainDoor').dataset.lock=current.lockReason;
 $('#foxPath .words').textContent=current.fox.status==='locked'?'Cesta k lišce':current.fox.status==='at_pythia'?'U Pythie':'Tvůj parťák';
 $('.entrance-progress i').style.width=`${current.speed.progress*100}%`;
 $('#demoTrial').disabled=!current.readiness.ready||current.state==='mastery';
 $('#demoBind').disabled=current.fox.status!=='at_pythia';
 $('#reviewStatus').textContent=`Hráč ${owner==='A'?1:2} · ${current.title} · vybraný modul se pamatuje, režim se tu nepřepíná. Rychlost je medián. Dveře používají společný runtime výpočet včetně zkoušky a spolehlivosti. Dokončený modul lze v tomto návrhu dál vybrat; nové bonusy po mastery ještě nejsou implementované.`;
 document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{focus=b.dataset.target;session.chooseTarget(owner,focus);});
 document.querySelectorAll('[data-gate]').forEach(b=>b.onclick=()=>{focus=b.dataset.gate;render();showGuide(session.snapshot(owner,focus).lockReason);});
 document.querySelectorAll('[data-owner]').forEach(b=>b.onclick=()=>{owner=b.dataset.owner;focus=session.preference(owner).targetId;closeGuide();render();});
}
function action(text,kind,fn){const b=$('#guideAction');b.innerHTML=`<span class="surface"><img class="action-frame" src="../mathboard-variants-v4/assets/plaque.webp" alt=""><span class="action-label">${svg(kind)}<span class="words">${text}</span></span></span>`;b.onclick=fn;}
function showGuide(kind){
 guideKind=kind;$('#guide').hidden=false;$('#overview').inert=true;const m=session.snapshot(owner,focus),pics=$('#guidePictures');
 pics.className=kind==='pythia'||kind==='fox'?'fox-guide':'';
 if(kind==='exam'){
  $('#guideTitle').textContent='Nejdřív zkouška';
  pics.innerHTML=`<img class="mentor" src="${art}zyx-portrait.webp" alt="Zyx"><div class="exam-demo"><span class="book-cue">${svg('book')}</span><span class="demo-arrow">→</span><span class="lock-cue"><span class="closed-cue bitmap-lock">${lockArtwork('exam')}</span><i class="bitmap-lock">${lockArtwork('open')}</i></span></div>`;
  action('Zpět','check',closeGuide);speakExam();
 }else if(kind==='open'){
  $('#guideTitle').textContent='Výzva';pics.innerHTML=`<div class="trial-cards">${Array.from({length:10},()=>`<span>${svg('book')}</span>`).join('')}</div><div class="hearts">${m.challenge==='fluency_challenge'?'♥ ♥ ♥':'♥ ♥'}</div><div class="trial-path">${svg('swords')}<b>→</b><img src="${art}fox-reward.webp" alt="Runová liška"></div>`;
  action('Vstoupit','swords',()=>{closeGuide();$('#fit').hidden=true;$('#boardHost').hidden=false;$('#board').src='../mathboard-variants-v4/index.html?mode=exam';});
 }else if(kind==='pythia'||kind==='fox'){
  $('#guideTitle').textContent=m.fox.status==='owned'?'Tvůj parťák':m.fox.status==='at_pythia'?'U Pythie':'Cesta k lišce';
  pics.innerHTML=foxGuide(m);
  action('Zpět','check',closeGuide);
 }else{
  $('#guideTitle').textContent=kind==='complete'?'Mistr':kind==='evidence'?'Ještě trénink':'Rychlost';
  pics.innerHTML=`<div class="speed-demo">${svg(kind==='complete'?'star':kind==='evidence'?'cards':'clock')}<strong>${seconds(m.speed.value)}</strong><b>→</b><span><span class="speed-lock bitmap-lock">${lockArtwork(kind)}</span><strong>${seconds(m.speed.target)}</strong></span></div>`;
  action('Trénovat','replay',()=>{session.chooseTarget(owner,focus);closeGuide();session.route({view:'before-battle',owner,targetId:focus,returnTo:'catacombs'});});
 }
}
function route(r){
 owner=r.owner;focus=r.targetId;returnTo=r.returnTo??null;
 if(r.view==='catacombs'){view('overview');return;}
 if(r.view==='pythia'){view('overview');showGuide('pythia');return;}
 if(embedded){return;}
 closeGuide();$('#fit').hidden=true;$('#boardHost').hidden=true;$('#flowHost').hidden=false;
 pendingRoute=r;
 if(!$('#flow').src){$('#flow').src=`../training-flow-v5/index.html?embedded=1&screen=${r.view==='before-battle'?'coop':r.view}&owner=${r.owner}&targetId=${encodeURIComponent(r.targetId)}`;}
 else if(frameReady){$('#flow').contentWindow.flowPreview?.route?.(r);}
}
function applyPendingRoute(){
 const child=$('#flow').contentWindow;
 if(!child.flowPreview?.ready)return;
 frameReady=true;
 $('#flow').contentDocument?.body.classList.toggle('no-words',document.body.classList.contains('no-words'));
 if(pendingRoute){const value=pendingRoute;pendingRoute=null;child.flowPreview.route(value);}
}
$('#flow').onload=()=>{
 const child=$('#flow').contentWindow;
 if(child.flowPreview?.ready)applyPendingRoute();
 else child.addEventListener('flow-preview-ready',applyPendingRoute,{once:true});
};
const unsubscribe=session.subscribe(e=>{if(e.type==='route')route(e.route);else render();});
window.addEventListener('pagehide',()=>{unsubscribe();audio?.pause();},{once:true});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
$('#door').onclick=()=>view('overview');$('#close').onclick=$('#confirm').onclick=()=>returnTo?session.route({view:returnTo,owner,targetId:focus,returnTo:'catacombs'}):view('entrance');
$('#mainDoor').onclick=()=>showGuide(session.snapshot(owner,focus).lockReason);$('#foxPath').onclick=()=>showGuide('fox');
$('#guideBack').onclick=closeGuide;$('#boardBack').onclick=()=>view('overview');
$('#beforeBattle').onclick=()=>session.route({view:'before-battle',owner,targetId:focus,returnTo:'catacombs'});
function battle(faster){session.demoBattle(owner,faster);session.route({view:'victory',owner,targetId:session.preference(owner).targetId,returnTo:'catacombs'});}
$('#demoWin').onclick=()=>battle(true);$('#demoSame').onclick=()=>battle(false);
$('#demoExam').onclick=()=>{session.chooseTarget(owner,focus);session.demoExam(owner);view('overview');};
$('#demoTrial').onclick=()=>{session.chooseTarget(owner,focus);const result=session.demoTrial(owner);if(result)session.route({view:'pet',owner,targetId:result.targetId,returnTo:'catacombs'});};
$('#demoBind').onclick=()=>{session.demoBind(owner);view('overview');showGuide('pythia');};
$('#reset').onclick=()=>{session.reset();owner='A';focus='B1';returnTo=null;view('overview');};
$('#words').onclick=()=>{const on=document.body.classList.toggle('no-words');$('#words').setAttribute('aria-pressed',String(on));const doc=$('#flow').contentDocument;doc?.body.classList.toggle('no-words',on);};
const resize=()=>$('#stage').style.transform=`scale(${$('#fit').clientWidth/1280})`;
new ResizeObserver(resize).observe($('#fit'));
window.catacombPreview={session,view,route,ready:false,get owner(){return owner;},get focus(){return focus;}};
await document.fonts.ready;render();view(location.hash==='#entrance'?'entrance':'overview');resize();
window.catacombPreview.ready=true;window.dispatchEvent(new Event('catacomb-preview-ready'));

import Phaser from 'phaser';
import { MathBoard } from '../../../src/ui/MathBoard';
import { createMathBoardView, MathBoardView } from '../../../src/ui/mathboard/MathBoardView';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { gameAudio } from '../../../src/audio/AudioDirector';
import { resolveDamageAfterDefense } from '../../../src/systems/CombatDamageSystem';
import type { MathProblem } from '../../../src/types';
import { FoxSprite } from './FoxSprite';
import { BattleEffects, type Box } from './BattleEffects';
import './style.css';

type Owner='A'|'B';type Family='shield'|'heal'|'strike';type Phase='battle'|'math'|'defense'|'target'|'victory';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const base='/docs/design-drafts/fox-battle-v5/',familyArt='/docs/design-drafts/fox-evolution-v1/assets/';
const frame='/assets/ui/battle/round-action-frame.png',hpFrame='/assets/ui/mock/battle-hud/v2/status-frame-v2.png';
const names={A:'Ada',B:'Borek'},portraits={A:'/assets/ui/town-hud-a/portraits/heroine-portrait.png',B:'/assets/ui/town-hud-a/portraits/hero-portrait.png'};
const colors={A:'#99cf78',B:'#81dbea'},families:Family[]=['shield','heal','strike'];
const [layout,model,forms,motionManifest]=await Promise.all(['scenes.json','model.json','../fox-evolution-v4/manifest.json','../fox-animation-v1/manifest.json'].map(p=>fetch(base+p).then(r=>r.json())));
const state={owner:'A' as Owner,abilityOwner:'A' as Owner,phase:'battle' as Phase,returnPhase:'battle' as Phase,selected:0,busy:false,guide:false,form:0,reduced:false,
 players:{A:{hp:14,maxHp:24,shield:0,potions:2,used:new Set<Family>(),locked:new Set<Family>()},B:{hp:10,maxHp:24,shield:0,potions:1,used:new Set<Family>(),locked:new Set<Family>()}},
 enemies:structuredClone(model.enemies),taught:new Set<Family>(),answers:[] as any[],events:[] as any[],generation:0};
let scene:FoxMathScene;let effects:BattleEffects;let guideReturn:Phase='battle';let guideFamily:Family='shield';
const animations=new Set<Animation>();const art=(f:Family)=>familyArt+f+'-1.webp';
const guideAnimations=new Set<Animation>();
const image=(src:string,cls='',alt='')=>'<img src="'+src+'" class="'+cls+'" alt="'+alt+'" draggable="false">';
const reduced=()=>state.reduced||matchMedia('(prefers-reduced-motion:reduce)').matches;
const foxSprites={A:new FoxSprite($<HTMLCanvasElement>('fox'),motionManifest,reduced,model.approvedMotionForms),B:new FoxSprite($<HTMLCanvasElement>('foxB'),motionManifest,reduced,model.approvedMotionForms)};
await Promise.all(Object.values(foxSprites).map(fox=>fox.load(forms.map((f:any)=>model.restSources?.[f.id]??'/docs/design-drafts/fox-evolution-v4/'+f.asset),'/docs/design-drafts/fox-animation-v1/')));
const host=(id:string)=>layout.scenes.FoxBattlePrototype.elements.find((e:any)=>e.id===id);
const point=(id:string)=>{const h=host(id);return{x:h.x,y:h.y}};
const box=(id:string):Box=>{const h=scene.builder.get(id)!,def=host(id);return{x:h.x,y:h.y,width:def.width,height:def.height,depth:h.depth};};
const effectRig=(owner:Owner)=>{const compact=['math','defense'].includes(state.phase)&&!state.guide;return{compact,body:box(compact?'abilityOwner'+owner:'hero'+owner),health:box(compact?'abilityOwner'+owner:'hp'+owner),shield:box((compact?'portraitShield':'airShield')+owner)};};
const log=(type:string,detail:object={})=>{state.events.push({type,owner:state.abilityOwner,...detail});if(state.events.length>30)state.events.shift();};

function health(id:string,hp:number,max:number,owner?:Owner){
 const e=$(id);if(!e.querySelector('.hp-track'))e.innerHTML='<span class="hp-track"><span class="hp-fill" style="display:block"></span></span>'+image(hpFrame)+'<strong class="hp-value"></strong>';
 e.querySelector<HTMLElement>('.hp-fill')!.style.width=Math.max(0,hp/max*100)+'%';
 e.querySelector('.hp-value')!.textContent=hp+' / '+max;
 e.classList.toggle('enemy-hp',id.startsWith('enemy'));if(owner)e.dataset.owner=owner;
 e.setAttribute('aria-label',String(hp)+' z '+max+' životů');
}
function control(id:string,icon:string,opts:{power?:string;disabled?:boolean;locked?:boolean;used?:boolean;temporary?:boolean;full?:boolean;help?:boolean}={}){
 const b=$<HTMLButtonElement>(id);b.setAttribute('aria-disabled',String(!!opts.disabled));
 b.classList.toggle('locked',!!opts.locked);b.classList.toggle('used',!!opts.used);b.classList.toggle('temporary',!!opts.temporary);b.classList.toggle('full',!!opts.full);
 b.innerHTML='<span class="surface">'+image(frame,'frame')+'<span class="halo"></span>'+(icon?image(icon,'icon'):'')+
 (opts.help?'<span class="help-mark">?</span>':'')+(opts.power!==undefined?'<span class="power">'+opts.power+'</span>':'')+
 (families.includes(id as Family)?'<span class="charge"></span>':'')+
 (opts.locked?image('/docs/design-drafts/training-flow-v5/assets/journey-lock-closed.webp','lock'):opts.temporary?'<span class="pause-mark">Ⅱ</span>':'')+'</span>';
}
function ownerPortrait(id:string,owner:Owner,choice=false){
 const p=state.players[owner],e=$(id);e.style.setProperty('--owner-color',colors[owner]);
 if(e.dataset.owner!==owner){e.dataset.owner=owner;e.innerHTML=image(frame)+image(portraits[owner],'portrait-art')+'<span class="owner-badge">'+(owner==='A'?1:2)+'</span>'+
  (choice?'<span class="mini-hp"><i></i></span>'+image(art('shield'),'mini-shield'):'');}
 if(choice){e.querySelector<HTMLElement>('.mini-hp i')!.style.width=p.hp/p.maxHp*100+'%';e.querySelector<HTMLImageElement>('.mini-shield')!.hidden=p.shield===0;}
 if(choice){e.setAttribute('aria-pressed',String(state.abilityOwner===owner));e.setAttribute('aria-disabled',String(state.busy||state.guide||['target','defense','victory'].includes(state.phase)));}
}
function render(){
 const p=state.players[state.owner],ap=state.players[state.abilityOwner];
 $('stage').style.setProperty('--owner-color',colors[state.abilityOwner]);$('stage').classList.toggle('targeting',state.phase==='target'&&!state.busy);
 $('stage').classList.toggle('reduced',reduced());
 health('hpA',state.players.A.hp,state.players.A.maxHp,'A');health('hpB',state.players.B.hp,state.players.B.maxHp,'B');health('dockHp',p.hp,p.maxHp);
 $('dockHp').classList.toggle('active-shield',p.shield>0);
 $('shieldBadge').innerHTML=p.shield?image(art('shield'))+'<strong>'+p.shield+'</strong>':'';
 $('ownerName').textContent=names[state.owner];ownerPortrait('ownerPortrait',state.owner);
 ownerPortrait('abilityOwnerA','A',true);ownerPortrait('abilityOwnerB','B',true);
 foxSprites.A.setForm(state.form);foxSprites.B.setForm(state.form);
 state.enemies.forEach((enemy:any,i:number)=>{const e=$<HTMLButtonElement>('enemy'+i);e.classList.toggle('dead',enemy.hp<=0);e.classList.toggle('selected',state.selected===i&&enemy.hp>0);
  e.setAttribute('aria-disabled',String(enemy.hp<=0||state.busy||state.guide||!['battle','target'].includes(state.phase)));health('enemyHp'+i,enemy.hp,enemy.maxHp);});
 const blocked=state.busy||state.guide||['defense','target','victory'].includes(state.phase);
 for(const family of families){
  const locked=ap.locked.has(family),used=ap.used.has(family),full=family==='heal'&&ap.hp===ap.maxHp;
  control(family,art(family),{power:(family==='heal'?'+':'')+model.powers[family],disabled:blocked||locked||used||full,locked,used,temporary:!used&&!locked&&blocked,full});
  $(family).setAttribute('aria-label',names[state.abilityOwner]+' — '+({shield:'Liščí štít',heal:'Liščí léčení',strike:'Liščí zásah'}[family])+(used?', použito':locked?', zamčeno':full?', plné zdraví':''));
 }
 control('potion','/assets/ui/town-hud-a/character-book/red-potion.png',{power:String(p.potions),disabled:state.phase!=='battle'||state.busy||state.guide||p.potions===0||p.hp===p.maxHp});
 control('attack','/assets/ui/mock/prep-buttons/v2/prep-sword-normal-v2.png',{disabled:state.phase!=='battle'||state.busy||state.guide,temporary:['math','defense','target'].includes(state.phase)});
 control('help','',{help:true,disabled:state.busy||state.guide||state.phase==='target'});
 $('targetHint').hidden=state.phase!=='target'||state.busy;$('cancelTarget').hidden=state.phase!=='target'||state.busy;$('victory').hidden=state.phase!=='victory';
 const showBoard=['math','defense'].includes(state.phase)&&!state.guide;$('stage').classList.toggle('math-open',showBoard);$('math').classList.toggle('shown',showBoard);$('math').classList.toggle('suspended',state.busy||state.guide);
 $<HTMLSelectElement>('owner').disabled=state.busy||state.guide||state.phase!=='battle';
 $<HTMLButtonElement>('hitShield').disabled=state.busy||state.guide||!['battle','math'].includes(state.phase)||ap.shield<=0;
 effects?.sync({A:state.players.A.shield,B:state.players.B.shield},model.powers.shield);
 $('audit').textContent=JSON.stringify(snapshot(),null,2);
}
function snapshot(){return {phase:state.phase,activeMathOwner:state.owner,abilityOwner:state.abilityOwner,busy:state.busy,
 players:Object.fromEntries((['A','B']as Owner[]).map(k=>[k,{...state.players[k],used:[...state.players[k].used],locked:[...state.players[k].locked]}])),
 enemies:state.enemies.map((e:any)=>e.hp),question:scene?.board?.getActiveProblemSnapshot(),answers:state.answers,events:state.events,effects:effects?.snapshot()};}
function pauseMath(on:boolean){if(!scene)return;scene.view?.setPaused(on);if(on)scene.scene.pause();else scene.scene.resume();}
function clearEffects(){state.generation++;animations.forEach(a=>a.cancel());animations.clear();guideAnimations.forEach(a=>a.cancel());guideAnimations.clear();effects?.reset();Object.values(foxSprites).forEach(fox=>fox.reset());$('effectLayer').replaceChildren();state.busy=false;state.guide=false;$('guide').hidden=true;pauseMath(false);}
async function animate(el:HTMLElement,frames:Keyframe[],duration:number){
 const a=el.animate(reduced()?[{opacity:1},{opacity:1}]:frames,{duration:reduced()?110:duration,easing:'ease-out',fill:'forwards'});
 animations.add(a);await a.finished.catch(()=>{});animations.delete(a);el.remove();
}
function effectElement(x:number,y:number,w:number,h:number,html:string,cls=''){
 const e=document.createElement('span');e.className='effect '+cls;e.style.cssText='left:'+(x-w/2)/12.8+'%;top:'+(y-h/2)/7.2+'%;width:'+w/12.8+'%;height:'+h/7.2+'%';e.innerHTML=html;$('effectLayer').append(e);return e;
}
async function numberAt(value:string,pos:{x:number;y:number},damage=false){
 const e=effectElement(pos.x,pos.y-20,110,60,value,'effect-number'+(damage?' damage':''));
 await animate(e,[{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)',offset:.2},{opacity:1,offset:.7},{opacity:0,transform:'translateY(-16px)'}],850);
}
function valid(family:Family){const p=state.players[state.abilityOwner];return !state.busy&&!state.guide&&!['target','defense','victory'].includes(state.phase)&&!p.used.has(family)&&!p.locked.has(family)&&!(family==='heal'&&p.hp>=p.maxHp);}
async function use(family:Family){
 if(!valid(family))return;
 if(!state.taught.has(family)){openGuide(family);return;}
 if(family==='strike'){state.returnPhase=state.phase;state.phase='target';pauseMath(true);render();log('targeting');return;}
 const owner=state.abilityOwner,p=state.players[owner],token=state.generation;
 state.busy=true;p.used.add(family);pauseMath(true);
 const gain=family==='heal'?Math.min(model.powers.heal,p.maxHp-p.hp):model.powers.shield;
 const motion=foxSprites[owner].play('cast');
 if(family==='heal')p.hp+=gain;else p.shield+=gain;
 const effect=family==='heal'?effects.heal(owner,gain):effects.shieldApply(owner,p.shield);
 log('ability',{family,owner,gain});render();
 await Promise.all([motion,effect]);
 if(token!==state.generation)return;state.busy=false;pauseMath(false);render();
}
async function target(i:number){
 if(state.busy||state.guide||state.enemies[i].hp<=0)return;
 if(state.phase==='battle'){state.selected=i;render();return;}
 if(state.phase!=='target')return;
 const owner=state.abilityOwner,p=state.players[owner];if(p.used.has('strike')||p.locked.has('strike'))return;
 const token=state.generation;state.selected=i;state.busy=true;p.used.add('strike');
 const damage=Math.min(state.enemies[i].hp,model.powers.strike);render();
 const motion=foxSprites[owner].play('attack');await effects.projectile(point(owner==='A'?'fox':'foxB'),point('enemy'+i),'strike',{owner,target:i});
 if(token!==state.generation)return;state.enemies[i].hp-=damage;log('ability',{family:'strike',owner,target:i,damage});render();
 await Promise.all([motion,effects.strikeImpact(owner,i,point('enemy'+i),damage,box('enemyHp'+i))]);
 if(token!==state.generation)return;state.busy=false;
 if(state.enemies.every((e:any)=>e.hp===0))finishVictory();else{state.phase=state.returnPhase;if(state.enemies[state.selected].hp===0)state.selected=state.enemies.findIndex((e:any)=>e.hp>0);pauseMath(false);render();}
}
function cancelTarget(){if(state.phase!=='target'||state.busy)return;state.phase=state.returnPhase;pauseMath(false);log('target-cancel');render();}
function finishVictory(){state.phase='victory';pauseMath(false);scene.board.hide();render();}
function reset(){
 clearEffects();scene?.board?.hide();state.phase='battle';state.selected=0;state.answers=[];state.events=[];state.abilityOwner=state.owner;
 state.enemies=structuredClone(model.enemies);
 for(const o of ['A','B'] as Owner[])Object.assign(state.players[o],{hp:o==='A'?14:10,maxHp:24,shield:0,potions:o==='A'?2:1,used:new Set(),locked:new Set()});
 const scenario=$<HTMLSelectElement>('scenario').value;
 if(scenario==='locked')for(const o of ['A','B']as Owner[])state.players[o].locked=new Set(families);
 if(scenario==='used')for(const o of ['A','B']as Owner[])state.players[o].used=new Set(families);
 if(scenario==='full')for(const o of ['A','B']as Owner[])state.players[o].hp=24;
 if(scenario==='last'){state.enemies.forEach((e:any,i:number)=>e.hp=i===1?3:0);state.selected=1;}
 render();
}
async function potion(){
 const p=state.players[state.owner];if(state.phase!=='battle'||state.busy||state.guide||p.potions===0||p.hp===p.maxHp)return;
 const token=state.generation,gain=Math.min(6,p.maxHp-p.hp);state.busy=true;p.potions--;p.hp+=gain;render();await numberAt('+'+gain,point('hero'+state.owner));
 if(token!==state.generation)return;state.busy=false;render();
}
async function resolveIncoming(owner:Owner,incoming:number,blocked=0){
 const token=state.generation,p=state.players[owner],afterBlock=resolveDamageAfterDefense(incoming,blocked).damage;
 const before=p.shield,absorbed=Math.min(afterBlock,before),lost=Math.min(p.hp,afterBlock-absorbed);
 const r=effectRig(owner),to=before>0?effects.shieldPoint(owner):{x:r.body.x,y:r.body.y};
 const enemy=state.enemies.findIndex((e:any)=>e.hp>0),from=r.compact?{x:to.x+70,y:to.y-10}:point('enemy'+Math.max(0,enemy));
 await effects.projectile(from,to,'incoming',{owner});if(token!==state.generation)return;
 p.shield-=absorbed;p.hp-=lost;
 const block=absorbed>0?effects.block(owner,before,p.shield,absorbed):Promise.resolve();
 const hurt=lost>0?effects.hurt(owner,lost):Promise.resolve();
 log('incoming',{owner,incoming,blocked,absorbed,lost});render();await Promise.all([block,hurt]);
}
async function previewShieldHit(){
 if(state.busy||state.guide||!['battle','math'].includes(state.phase)||state.players[state.abilityOwner].shield<=0)return;
 const token=state.generation;state.busy=true;pauseMath(true);render();await resolveIncoming(state.abilityOwner,model.previewShieldHit);
 if(token!==state.generation)return;state.busy=false;pauseMath(false);render();
}
async function complete(damage:number,results:boolean[],timings:number[]){
 const token=state.generation,defense=state.phase==='defense';state.busy=true;state.phase='battle';scene.board.hide();render();
 if(defense){
  await resolveIncoming(state.owner,model.incoming,scene.view.state.blocked);
 }else{
  const enemy=state.enemies[state.selected],resolved=resolveDamageAfterDefense(damage,enemy.defense),lost=Math.min(enemy.hp,resolved.damage);enemy.hp-=lost;
  log('normal-attack',{owner:state.owner,target:state.selected,damage:lost,results,timings});render();await numberAt('−'+lost,{x:host('enemy'+state.selected).x,y:host('enemy'+state.selected).y-70},true);
 }
 if(token!==state.generation)return;state.busy=false;if(state.enemies.every((e:any)=>e.hp<=0))finishVictory();else{if(state.enemies[state.selected].hp===0)state.selected=state.enemies.findIndex((e:any)=>e.hp>0);render();}
}
function openGuide(family:Family='shield'){
 if(state.busy||state.phase==='target'||state.phase==='defense'||state.phase==='victory')return;
 guideReturn=state.phase;state.guide=true;guideFamily=family;pauseMath(true);
 $('guide').hidden=false;$('guide').innerHTML='<h2 class="word">Liščí pomoc</h2><button class="cancel" id="closeGuide" aria-label="Zavřít ukázku">×</button><div class="guide-options">'+families.map(f=>'<button class="action" data-demo="'+f+'" aria-label="Předvést '+f+'"><span class="surface">'+image(frame,'frame')+image(art(f),'icon')+'</span></button>').join('')+'</div><div id="guideResult" class="guide-result"></div><button id="tryAbility" class="try-ability" aria-label="Zkusit schopnost">→</button>';
 $('closeGuide').onclick=closeGuide;$('tryAbility').onclick=closeGuide;document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(b=>b.onclick=()=>demo(b.dataset.demo as Family));render();demo(family);
}
function demo(family:Family){
 guideFamily=family;state.taught.add(family);
 guideAnimations.forEach(a=>a.cancel());guideAnimations.clear();
 const source=family==='strike'?'assets/enemy.webp':portraits[state.abilityOwner],n=model.powers[family],p=state.players[state.abilityOwner];
 const demoMax=family==='strike'?model.enemies[0].maxHp:p.maxHp,demoHp=family==='strike'?demoMax:Math.max(0,demoMax-n);
 const before=demoHp/demoMax*100,after=(family==='heal'?Math.min(demoMax,demoHp+n):family==='strike'?Math.max(0,demoHp-n):demoHp)/demoMax*100;
 $('guideResult').innerHTML=image(art(family),'demo-rune')+'<span>→</span><span class="demo-actor">'+image(source)+
 '<span class="demo-health"><i style="width:'+after+'%"></i></span>'+(family==='shield'?image(art('shield'),'demo-shield'):'')+'</span><strong>'+(family==='heal'?'+':family==='strike'?'−':'')+n+'</strong>';
 document.querySelectorAll<HTMLElement>('[data-demo]').forEach(b=>b.classList.toggle('demo-selected',b.dataset.demo===family));
 if(!reduced()){
  const rune=$('guideResult').querySelector('.demo-rune')!,bar=$('guideResult').querySelector('.demo-health i')!;
  const moving=rune.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX(38px)',opacity:.5},{transform:'translateX(0)',opacity:1}],{duration:900});
  const filling=bar.animate([{width:before+'%'},{width:before+'%',offset:.4},{width:after+'%'}],{duration:1300,fill:'forwards'});
  guideAnimations.add(moving);guideAnimations.add(filling);
 }
 log('demonstration',{family,damageEarned:0});$('audit').textContent=JSON.stringify(snapshot(),null,2);
}
function closeGuide(){if(!state.guide)return;guideAnimations.forEach(a=>a.cancel());guideAnimations.clear();state.guide=false;$('guide').hidden=true;state.phase=guideReturn;pauseMath(false);render();$(guideFamily).focus();}

class FoxMathScene extends Phaser.Scene{
 board!:MathBoard;view!:MathBoardView;builder!:SceneBuilder;
 constructor(){super('FoxMath');}
 preload(){
  const assets:Record<string,string>={'ui-math-board':'/assets/ui/math-board-larger.webp','ui-button':'/assets/ui/small_board_button.webp',
   'prep-frame-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-v2.png','prep-frame-rail-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-rail-v2.png','prep-frame-cap-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-cap-v2.png',
   'prep-sword-normal-v2':'/assets/ui/mock/prep-buttons/v2/prep-sword-normal-v2.png','prep-shield-normal-v2':'/assets/ui/mock/prep-buttons/v2/prep-shield-normal-v2.png',
   'town-hud-heroine-portrait':portraits.A,'town-hud-hero-portrait':portraits.B};
  for(const [key,file]of Object.entries({'parchment':'parchment','answer':'answer-wood','plaque':'plaque','shop':'shop-frame','catacomb':'catacomb-frame','exam':'exam-frame','fist-normal':'fist-normal','fist-active':'fist-active'}))assets['mathboard-'+key+'-v4']='/assets/ui/mathboard-v4/'+file+'.webp';
  for(const [key,url]of Object.entries(assets))this.load.image(key,url);
  this.load.svg('comparison-apple','/assets/ui/comparison/apple.svg',{scale:2});
  this.load.on('loaderror',(f:any)=>$('loading').textContent='Chybí obrázek: '+f.key);
 }
 create(){
  scene=this;gameAudio().settings.effects=0;this.cache.json.add('scenes',layout);this.cache.json.add('assets',{ui:{containers:{empty:{type:'container'}}}});
  this.builder=new SceneBuilder(this);this.builder.buildScene('FoxBattlePrototype');
  for(const def of layout.scenes.FoxBattlePrototype.elements){const h=this.builder.get(def.id) as Phaser.GameObjects.Container,e=$(def.id);if(!e)continue;
   e.style.left=(h.x-def.width/2)/12.8+'%';e.style.top=(h.y-def.height/2)/7.2+'%';e.style.width=def.width/12.8+'%';e.style.height=def.height/7.2+'%';e.style.zIndex=String(h.depth);}
  effects=new BattleEffects($('stage'),reduced,effectRig);
  this.board=new MathBoard(this,(damage,results,timings)=>void complete(damage,results,timings),(s,onDemo)=>{
   this.view=createMathBoardView(s,onDemo,()=>({activePlayer:state.owner==='A'?1:2,portraits:['town-hud-heroine-portrait','town-hud-hero-portrait']}));return this.view;});
  this.board.setPersonalBonusCallback(()=>({damage:0,baselineMs:null,quick:false}));
  this.board.setFirstAnswerCallback(answer=>{state.answers.push({id:answer.problem.id,owner:state.owner,correct:answer.correct,time:answer.responseTimeMs});render();});
  this.board.hide();$('loading').remove();render();
  (window as any).foxBattle={state,snapshot,scene:this,reset,use,target,openGuide,closeGuide,cancelTarget,foxSprites,effects,previewShieldHit,
   startMath:(defense=false)=>this.startMath(defense),layout};
 }
 startMath(defense=false){
  if(state.busy||state.guide||state.phase!=='battle')return;
  state.phase=defense?'defense':'math';pauseMath(false);
  const examples=defense?[[2,3]]:[[2,3],[3,1],[4,2]];
  const problems=examples.map(([a,b],i)=>({id:'fox-preview-'+state.owner+'-'+i,operand1:a,operand2:b,operator:'+',answer:a+b,choices:[a+b-1,a+b,a+b+1],difficulty:1,source:'player',damageMultiplier:2})) as MathProblem[];
  this.board.show(problems,{presentation:'sequential',defense:defense?{power:3,incomingDamage:model.incoming}:undefined,telemetryContext:'isolated_fox_ui_preview'});render();
 }
}
for(const family of families)$(family).onclick=()=>void use(family);
for(let i=0;i<3;i++)$('enemy'+i).onclick=()=>void target(i);
for(const owner of ['A','B']as Owner[])$('abilityOwner'+owner).onclick=()=>{if(state.busy||state.guide||['target','defense','victory'].includes(state.phase))return;state.abilityOwner=owner;render();};
 $('attack').onclick=()=>scene?.startMath();$('potion').onclick=()=>void potion();$('cancelTarget').onclick=cancelTarget;$('help').onclick=()=>openGuide();
 $('reset').onclick=reset;$('again').onclick=reset;$('incoming').onclick=()=>{if(state.busy||state.guide)return;if(state.phase!=='battle'){scene.board.hide();state.phase='battle';}scene.startMath(true);};
 $('hitShield').onclick=()=>void previewShieldHit();
 $<HTMLSelectElement>('owner').onchange=e=>{state.owner=(e.target as HTMLSelectElement).value as Owner;state.abilityOwner=state.owner;render();};
 $<HTMLSelectElement>('form').innerHTML=forms.map((f:any,i:number)=>'<option value="'+i+'">'+f.id+' · '+f.name+'</option>').join('');
 $<HTMLSelectElement>('form').onchange=e=>{state.form=Number((e.target as HTMLSelectElement).value);render();};
 $('scenario').onchange=reset;
 $('words').onclick=()=>{const on=$('stage').classList.toggle('no-words');$('words').setAttribute('aria-pressed',String(on));};
 $('reduce').onclick=()=>{state.reduced=!state.reduced;$('reduce').setAttribute('aria-pressed',String(state.reduced));render();};
 document.addEventListener('visibilitychange',()=>{for(const set of [animations,guideAnimations])set.forEach(a=>document.hidden?a.pause():a.play());});
 await document.fonts.load('700 84px Gelasio');
 new Phaser.Game({type:new URLSearchParams(location.search).get('renderer')==='canvas'?Phaser.CANVAS:Phaser.AUTO,parent:'math',width:1280,height:720,transparent:true,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true},audio:{noAudio:true},scene:[FoxMathScene]});

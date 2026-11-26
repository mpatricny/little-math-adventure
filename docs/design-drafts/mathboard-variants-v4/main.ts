import Phaser from 'phaser';
import { MathBoard } from '../../../src/ui/MathBoard';
import { gameAudio } from '../../../src/audio/AudioDirector';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { PersonalBattleBonuses, type PersonalAnswerBonus } from '../../../src/systems/PersonalBattleBonuses';
import type { MasteryData } from '../../../src/types';
import type { LearningHistoryAttempt } from '../../../src/systems/LearningHistory';
import { VariantsView } from './VariantsView';
import { ImpactView, type ImpactInput } from './ImpactView';
import { ContextView } from './ContextView';
import { samples, modes, type Mode } from './catalog';
import './style.css';

const base='/docs/design-drafts/mathboard-variants-v4/',params=new URLSearchParams(location.search);
let selected=samples.find(s=>s.id===params.get('sample'))?.id??'addition';
let mode:Mode=modes.find(m=>m.id===params.get('mode'))?.id??'attack';
let count=[1,3,6].includes(Number(params.get('count')))?Number(params.get('count')):3,player=1,scene:PreviewScene;
const state={completions:0,damage:0,results:[] as boolean[],timings:[] as number[],bonuses:[] as PersonalAnswerBonus[]};
const combat=()=>['attack','sword','pet','practice','coop'].includes(mode);
const impactCases:Record<string,ImpactInput>={normal:{raw:13,defense:3,hp:20},blocked:{raw:2,defense:8,hp:20},zero:{raw:0,defense:3,hp:20},last:{raw:13,defense:3,hp:6}};

// Synthetic history stays in memory. The production bonus engine, not the renderer,
// decides quick +1 from this frozen eight-second reference for each task form.
function previewHistory():MasteryData{
  const attempts:LearningHistoryAttempt[]=[],seen=new Set<string>();
  for(const sample of samples){
    const stage=sample.problem.comparisonMeta?.stage,key=stage?`comparison:${stage}`:'A1:result_unknown';if(seen.has(key))continue;seen.add(key);
    for(let i=0;i<10;i++)attempts.push({source:stage?'comparison':'mastery',problemKey:stage?`${key}:2:3`:'A1:2+3:result_unknown',
      timestamp:1700000000000+i*10000,correct:true,responseTimeMs:8000,assisted:false,
      ...(stage?{}:{subAtomId:'A1',form:'result_unknown'})} as LearningHistoryAttempt);
  }
  return {bands:{},subAtoms:{},problemRecords:{},globalSolveSequence:0,fightCount:0,retryPool:[],slowPool:[],currentPool:[],currentPoolIndex:0,
    lastPoolProblems:[],lastStruggleOfferFight:0,coopAutoPromotionBases:{},learningHistory:{version:1,attempts}} as unknown as MasteryData;
}

class PreviewScene extends Phaser.Scene{
  board!:MathBoard;view!:VariantsView;impact!:ImpactView;builder!:SceneBuilder;context!:ContextView;
  private bonuses!:PersonalBattleBonuses;private elapsed=0;private transition:Phaser.Tweens.Tween|null=null;
  constructor(){super('MathBoardVariantsPreview');}
  preload(){
    const images:Record<string,string>={arena:base+'assets/arena.webp',parchment:base+'assets/parchment.webp',wood:base+'assets/answer-wood.webp',plaque:base+'assets/plaque.webp',
      sword:'/assets/ui/mock/prep-buttons/v2/prep-sword-normal-v2.png',shield:'/assets/ui/mock/prep-buttons/v2/prep-shield-normal-v2.png',
      girl:'/assets/ui/town-hud-a/portraits/heroine-portrait.png',boy:'/assets/ui/town-hud-a/portraits/hero-portrait.png',
      'ui-math-board':'/assets/ui/math-board-larger.webp','ui-button':'/assets/ui/small_board_button.webp',
      'prep-frame-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-v2.png','prep-frame-rail-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-rail-v2.png','prep-frame-cap-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-cap-v2.png'};
    for(const [key,path]of Object.entries(images))this.load.image(key,path);
    for(const key of ['shop-frame','catacomb-frame','exam-frame','fist-normal','fist-active'])this.load.image(key,base+'assets/'+key+'.webp');
    this.load.image('shop-room','/assets/images/shop/original-shop-interior-counter-85.webp');
    this.load.image('guild-room','/assets/images/guild/mathoria-guild-interior.webp');
    this.load.image('catacomb-room','/assets/images/backgrounds/catacomb-rune-chamber.webp');
    this.load.spritesheet('fox','/assets/sprites/catacombs/rune-fox-compact.webp',{frameWidth:512,frameHeight:512,endFrame:0});
    for(const [key,file]of Object.entries({'comparison-apple':'apple','comparison-crocodile':'crocodile','comparison-equal-jaws':'equal-jaws','comparison-equal':'equal','comparison-greater':'greater'}))this.load.svg(key,`/assets/ui/comparison/${file}.svg`,{scale:2});
    this.load.json('scenes',base+'scenes.json');
    this.load.on('loaderror',(file:any)=>{document.getElementById('load-status')!.textContent='Chybí obrázek: '+file.key;});
  }
  create(){
    scene=this;gameAudio().settings.effects=0;this.cache.json.add('assets',{ui:{containers:{empty:{type:'container'}}}});
    this.builder=new SceneBuilder(this);this.builder.buildScene('MathBoardVariants');
    this.context=new ContextView(this,this.builder);
    this.impact=new ImpactView(this,this.builder);
    this.board=new MathBoard(this,(damage,results,timings)=>{
      Object.assign(state,{completions:state.completions+1,damage,results,timings});
      if(combat())this.showImpact({raw:damage,defense:3,hp:20});
      else if(mode==='defense')this.showImpact({raw:8,defense:this.view.state.blocked,hp:20,target:'hero'});
      else this.view.complete(()=>this.startExample());
    },(s,onDemo)=>{this.view=new VariantsView(s,this.builder,onDemo);this.configure();return this.view;});
    this.board.setPersonalBonusCallback(evidence=>{const bonus=this.bonuses.answer(evidence);state.bonuses.push(bonus);return combat()?bonus:{...bonus,damage:0};});
    this.board.setActiveProblemChangedCallback(snapshot=>{if(snapshot)this.elapsed=0;});
    this.input.keyboard?.on('keydown',(event:KeyboardEvent)=>{
      if(this.transition||event.target instanceof HTMLSelectElement||event.target instanceof HTMLButtonElement||event.target instanceof HTMLInputElement)return;
      const index=['1','2','3'].indexOf(event.key);if(index!==-1)this.board.submitChoice(index as 0|1|2);
      if(event.key==='Enter'||event.key==='ArrowRight')this.view.advance();
    });
    document.addEventListener('visibilitychange',()=>this.impact.pause(document.hidden));
    document.getElementById('load-status')!.remove();this.startExample();
    (window as any).variants={scene:this,board:this.board,get view(){return scene.view;},get impact(){return scene.impact;},
      get state(){return {...state,...scene.view.state,impact:{...scene.impact.state},context:scene.context.state};},samples,modes,
      choose:(sample:string,nextMode:Mode=mode,nextCount=count)=>{selected=sample;mode=nextMode;count=nextCount;this.startExample();},
      showImpact:(which:string)=>this.showImpact(impactCases[which]??impactCases.normal)};
    if(params.get('impact'))this.showImpact(impactCases[params.get('impact')!]??impactCases.normal);
  }
  private configure(){if(this.view){this.view.mode=mode;this.view.player=player;}}
  startExample(){
    this.transition?.stop();this.transition=null;this.impact.hide();this.elapsed=0;this.bonuses=new PersonalBattleBonuses(previewHistory());
    Object.assign(state,{completions:0,damage:0,results:[],timings:[],bonuses:[]});this.configure();
    const source=samples.find(s=>s.id===selected)??samples[0],actualCount=mode==='defense'?1:count;
    this.context.configure(mode,actualCount);this.impact.hud.setVisible(combat()||mode==='defense');
    document.querySelector<HTMLElement>('.impact-controls')!.hidden=!(combat()||mode==='defense');
    const problems=Array.from({length:actualCount},(_,i)=>{
      const p=structuredClone(source.problem);p.id=selected+'-'+i;p.source=mode==='pet'?'pet':mode==='sword'?'sword':'player';
      p.damageMultiplier=mode==='sword'?6:mode==='pet'?3:combat()?4:1;
      if(!p.comparisonMeta)p.masteryKey='A1:2+3:result_unknown';
      if(p.comparisonMeta){p.comparisonMeta.exam=['exam','catacomb'].includes(mode);if(p.comparisonMeta.exam)delete p.comparisonMeta.autoArithmeticHintMs;}
      if(selected==='addition'&&i%3){p.operand1=i%3===1?3:4;p.operand2=i%3===1?1:2;p.answer=p.operand1+p.operand2;p.choices=[p.answer-1,p.answer,p.answer+1];}
      return p;
    });
    this.board.setDamageDisplayEnabled(combat()||mode==='defense');
    this.board.show(problems,{presentation:'sequential',support:{symbolAnswers:6},defense:mode==='defense'?{power:3,incomingDamage:8}:undefined,telemetryContext:'isolated_mathboard_visual_preview'});
    (document.getElementById('sample') as HTMLSelectElement).value=selected;(document.getElementById('mode') as HTMLSelectElement).value=mode;
    const batch=document.getElementById('count') as HTMLSelectElement;batch.value=String(actualCount);batch.disabled=mode==='defense';
    document.getElementById('player')!.hidden=mode!=='coop';document.getElementById('player')!.textContent=`Hráč ${player}`;
    const url=new URL(location.href);url.searchParams.set('sample',selected);url.searchParams.set('mode',mode);url.searchParams.set('count',String(count));url.searchParams.delete('impact');history.replaceState(null,'',url);
  }
  showImpact(input:ImpactInput){
    this.transition?.stop();this.view.cancel();this.view.setEnabled(false);
    this.transition=this.tweens.add({targets:this.view.root,y:-685,alpha:.6,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?80:480,ease:'Cubic.easeIn',onComplete:()=>{
      this.board.hide();this.impact.show({...input,source:mode==='sword'?'sword':mode==='pet'?'paw':'fist'},()=>{if(mode==='coop')player=player===1?2:1;this.startExample();});this.transition=null;
    }});
  }
  update(_t:number,dt:number){
    if(!this.view)return;const s=this.view.state,impact=this.impact.state;
    this.context.progress(s.results.filter(Boolean).length);
    document.getElementById('status')!.textContent=impact.phase!=='idle'?`${impact.raw} − ${impact.blocked} = ${impact.damage} · ♥ ${impact.hpBefore} → ${impact.hpAfter}`:
      `${samples.find(s=>s.id===selected)?.label} · ${s.results.length} / ${mode==='defense'?1:count}`;
    if(mode==='catacomb'&&this.board.getActiveProblemSnapshot()&&!document.hidden){this.elapsed+=dt;this.view.tickTimer(1-this.elapsed/15000);
      if(this.elapsed>=15000){const p=samples.find(s=>s.id===selected)!.problem;this.board.submitChoice(p.choices.findIndex(c=>c!==p.answer) as 0|1|2);}}
  }
}

let group:HTMLOptGroupElement|null=null;
for(const sample of samples){if(group?.label!==sample.group){group=document.createElement('optgroup');group.label=sample.group;document.getElementById('sample')!.append(group);}
  const option=document.createElement('option');option.value=sample.id;option.textContent=sample.label;group.append(option);}
for(const m of modes){const option=document.createElement('option');option.value=m.id;option.textContent=m.label;document.getElementById('mode')!.append(option);}
document.getElementById('sample')!.onchange=e=>{selected=(e.target as HTMLSelectElement).value;scene?.startExample();};
document.getElementById('mode')!.onchange=e=>{mode=(e.target as HTMLSelectElement).value as Mode;scene?.startExample();};
document.getElementById('count')!.onchange=e=>{count=Number((e.target as HTMLSelectElement).value);scene?.startExample();};
document.getElementById('replay')!.onclick=()=>scene?.startExample();
document.getElementById('player')!.onclick=()=>{player=player===1?2:1;scene?.startExample();};
document.getElementById('impact')!.onclick=()=>scene?.showImpact(impactCases[(document.getElementById('impact-case') as HTMLSelectElement).value]);
document.getElementById('impact-case')!.onchange=()=>scene?.showImpact(impactCases[(document.getElementById('impact-case') as HTMLSelectElement).value]);
document.getElementById('fullscreen')!.onclick=()=>document.getElementById('stage')!.requestFullscreen();
document.getElementById('words')!.onclick=e=>{const b=e.currentTarget as HTMLButtonElement,on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));document.body.classList.toggle('no-words',on);};

void document.fonts.load('700 86px Gelasio').then(()=>new Phaser.Game({type:params.get('renderer')==='canvas'?Phaser.CANVAS:Phaser.AUTO,parent:'game',width:1326,height:941,
  backgroundColor:'#e8c587',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false},audio:{noAudio:true},scene:[PreviewScene]}));

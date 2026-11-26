import Phaser from 'phaser';
import { MathBoard } from '../../../src/ui/MathBoard';
import { gameAudio } from '../../../src/audio/AudioDirector';
import type { MathProblem } from '../../../src/types';
import { ReferenceView } from './ReferenceView';
import './style.css';

const base='/docs/design-drafts/mathboard-reference-v3/';
const params=new URLSearchParams(location.search);
let scene:ReferenceScene;
let hiddenWords=false;
const state={charges:0,completions:0,damage:0,results:[] as boolean[],timings:[] as number[]};
const fixture=(a:number,b:number,choices:number[],i:number):MathProblem=>({id:`reference-${i}`,operand1:a,operand2:b,operator:'+',answer:a+b,choices,
  source:'player',damageMultiplier:4,showVisualHint:false,hintType:'none',masteryKey:`A1:${a}+${b}:result_unknown`});
const batch=[fixture(2,3,[4,5,6],0),fixture(3,1,[3,4,5],1),fixture(2,3,[4,5,6],2)];

class ReferenceScene extends Phaser.Scene{
  board!:MathBoard;view!:ReferenceView;
  constructor(){super('MathBoardReferencePreview');}
  preload(){
    const images:Record<string,string>={'reference-art':base+'assets/arena-parchment.webp','reference-wood':base+'assets/answer-wood.webp',
      'ui-math-board':'/assets/ui/math-board-larger.webp','ui-button':'/assets/ui/small_board_button.webp',
      'prep-frame-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-v2.png','prep-frame-rail-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-rail-v2.png','prep-frame-cap-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-cap-v2.png'};
    for(const [key,path]of Object.entries(images))this.load.image(key,path);
    this.load.svg('reference-apple','/assets/ui/comparison/apple.svg',{scale:2});
    this.load.json('scenes',base+'scenes.json');
    this.load.on('loaderror',(file:any)=>{document.getElementById('load-status')!.textContent='Chybí obrázek: '+file.key;});
  }
  create(){
    scene=this;gameAudio().settings.effects=0;
    this.cache.json.add('assets',{ui:{containers:{empty:{type:'container'}}}});
    this.board=new MathBoard(this,(damage,results,timings)=>{
      Object.assign(state,{damage,results,timings,completions:state.completions+1});
      this.view.complete(()=>this.restart());this.report();
    },s=>{this.view=new ReferenceView(s);return this.view;});
    // The shared board retains the existing production charge rule: four charges
    // add one damage. This visual revision does not change learning or combat.
    this.board.setSpeedChargeCallback(charges=>{state.charges+=charges;const bonus=Math.floor(state.charges/4);state.charges%=4;return bonus;});
    this.board.setActiveProblemChangedCallback(()=>this.report());
    this.input.keyboard?.on('keydown',(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLButtonElement)return;
      const i=['1','2','3'].indexOf(e.key);if(i!==-1)this.board.submitChoice(i as 0|1|2);
      if(e.key==='ArrowRight'||e.key==='Enter')this.view.advance();
    });
    document.getElementById('load-status')!.remove();this.restart();
    (window as any).referencePreview={scene:this,board:this.board,get view(){return scene.view;},get state(){return {...state,...scene.view.state};}};
  }
  restart(){Object.assign(state,{charges:0,completions:0,damage:0,results:[],timings:[]});
    this.board.show(structuredClone(batch),{presentation:'sequential',telemetryContext:'isolated_visual_reference'});this.view.setWordsHidden(hiddenWords);this.report();}
  report(){if(!this.view)return;const s=this.view.state;document.getElementById('status')!.textContent=state.completions?'Tah dokončen':s.results.length?`${s.results.length} / 3 · ${s.damage} síly`:'Vyber odpověď';}
  update(){this.report();}
}
document.getElementById('replay')!.onclick=()=>scene?.restart();
document.getElementById('reference')!.onclick=e=>{const b=e.currentTarget as HTMLElement;const show=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(show));
  document.getElementById('reference-image')!.hidden=!show;
  // Comparing artwork must not run the answer clock under an obscured board.
  if(scene){if(show)scene.scene.pause();else scene.scene.resume();}
};
document.getElementById('fullscreen')!.onclick=()=>document.getElementById('stage')!.requestFullscreen();
document.getElementById('words')!.onclick=e=>{hiddenWords=!hiddenWords;(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(hiddenWords));scene?.view.setWordsHidden(hiddenWords);};
async function start(){
  await document.fonts.load('700 86px Gelasio');
  new Phaser.Game({type:params.get('renderer')==='canvas'?Phaser.CANVAS:Phaser.AUTO,parent:'game',width:1326,height:941,backgroundColor:'#e8c587',
    scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false},audio:{noAudio:true},scene:[ReferenceScene]});
}
void start().catch(()=>{document.getElementById('load-status')!.textContent='Nepodařilo se načíst písmo';});

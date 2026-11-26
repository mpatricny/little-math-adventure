import Phaser from 'phaser';
import { MathBoard } from '../../../src/ui/MathBoard';
import { gameAudio } from '../../../src/audio/AudioDirector';
import { samples, modes, type Mode } from './catalog';
import { WorkshopView } from './WorkshopView';
import './style.css';

const base='/docs/design-drafts/mathboard-workshop-v2/';
const params=new URLSearchParams(location.search);
let selected=samples.find(s=>s.id===params.get('sample'))?.id??'addition';
let mode:Mode=modes.find(m=>m.id===params.get('mode'))?.id??'attack';
let count=Number(params.get('count')??1),player=1,hiddenWords=false;
let scene:WorkshopScene;
const state={completions:0,results:[] as boolean[],timings:[] as number[],damage:0,charges:0};

class WorkshopScene extends Phaser.Scene {
    board!:MathBoard;view!:WorkshopView;elapsed=0;
    constructor(){super('MathBoardWorkshopPreview');}
    preload(){
        const entries:Record<string,string>={
            'ui-math-board':'/assets/ui/math-board-larger.webp','ui-button':'/assets/ui/small_board_button.webp',
            'answer-frame':base+'assets/answer-frame.png',
            'background':'/assets/images/mock/silverpond-arena/silverpond-water-arena.webp',
            'sword':'/assets/ui/mock/prep-buttons/v2/prep-sword-normal-v2.png','shield':'/assets/ui/mock/prep-buttons/v2/prep-shield-normal-v2.png',
            'girl':'/assets/ui/town-hud-a/portraits/heroine-portrait.png','boy':'/assets/ui/town-hud-a/portraits/hero-portrait.png',
            'prep-frame-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-v2.png',
            'prep-frame-rail-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-rail-v2.png','prep-frame-cap-v2':'/assets/ui/mock/prep-buttons/v2/prep-frame-cap-v2.png',
        };
        for(const [key,path]of Object.entries(entries))this.load.image(key,path);
        for(const [key,file]of Object.entries({'comparison-apple':'apple','comparison-crocodile':'crocodile','comparison-equal-jaws':'equal-jaws','comparison-equal':'equal','comparison-greater':'greater'}))this.load.svg(key,`/assets/ui/comparison/${file}.svg`,{scale:2});
        this.load.json('scenes',base+'scenes.json');
        this.load.on('loaderror',(file:any)=>document.getElementById('load-status')!.textContent='Nelze načíst: '+file.key);
    }
    create(){
        scene=this;gameAudio().settings.effects=0;this.cache.json.add('assets',{ui:{containers:{empty:{type:'container'}}}});
        const bg=this.add.image(640,360,'background');bg.setScale(Math.max(1280/bg.width,720/bg.height));
        this.add.rectangle(640,360,1280,720,0x14283a,.25);
        this.board=new MathBoard(this,(damage,results,timings)=>{
            state.completions++;state.results=results;state.timings=timings;state.damage=damage;
            this.view.showCompletion(()=>{if(mode==='coop')player=player===1?2:1;this.startExample();});this.report();
        },(s,demo)=>{this.view=new WorkshopView(s,demo);this.configureView();return this.view;});
        this.board.setSpeedChargeCallback(charges=>{if(!['attack','sword','pet','coop'].includes(mode))return 0;state.charges+=charges;const bonus=Math.floor(state.charges/4);state.charges%=4;return bonus;});
        this.board.setActiveProblemChangedCallback(s=>{if(s){this.elapsed=0;}this.report();});
        this.input.keyboard?.on('keydown',(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)return;
            const index=['1','2','3'].indexOf(event.key);if(index!==-1)this.board.submitChoice(index as 0|1|2);});
        document.getElementById('load-status')!.remove();this.startExample();
        (window as any).workshop={scene:this,board:this.board,get view(){return scene.view;},get state(){return {...state,...scene.view.state};},samples,modes};
    }
    configureView(){this.view.mode=mode;this.view.player=player;this.view.hideWords=hiddenWords;this.view.energy=0;}
    startExample(){
        this.elapsed=0;state.charges=0;state.results=[];state.timings=[];state.damage=0;state.completions=0;
        const sample=samples.find(s=>s.id===selected)!;
        const problems=Array.from({length:count},(_,i)=>{
            const p=structuredClone(sample.problem);p.id=selected+'-'+i;
            p.source=mode==='pet'?'pet':mode==='sword'?'sword':'player';p.damageMultiplier=mode==='sword'?6:mode==='pet'?3:4;
            if(['attack','sword','pet','coop'].includes(mode)&&!p.comparisonMeta)p.masteryKey='A1:2+3:result_unknown';
            if(p.comparisonMeta){p.comparisonMeta.exam=['exam','catacomb'].includes(mode);if(p.comparisonMeta.exam)delete p.comparisonMeta.autoArithmeticHintMs;}
            return p;
        });
        if(this.view)this.configureView();
        this.board.setDamageDisplayEnabled(['attack','sword','pet','defense','coop'].includes(mode));
        this.board.show(problems,{presentation:'sequential',defense:mode==='defense'?{power:3,incomingDamage:8}:undefined,
            support:{symbolAnswers:6},telemetryContext:'ui_workshop'});
        document.getElementById('sample-title')!.textContent=sample.label;
        document.getElementById('mode-title')!.textContent=modes.find(m=>m.id===mode)!.label;
        document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sample===selected)));
        document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
        this.report();
    }
    update(_t:number,dt:number){this.report();if(mode==='catacomb'&&this.board?.getActiveProblemSnapshot()&&!document.hidden){this.elapsed+=dt;this.view.tickTimer(1-this.elapsed/15000);
        if(this.elapsed>=15000){const p=samples.find(s=>s.id===selected)!.problem;this.board.submitChoice(p.choices.findIndex(c=>c!==p.answer) as 0|1|2);}}
    }
    report(){if(!this.view)return;document.getElementById('session-result')!.textContent=this.view.state.results.length?
        `${this.view.state.results.map(x=>x?'✓':'×').join('  ')} · ${['attack','sword','pet','coop'].includes(mode)?this.view.state.damage+' síly':this.view.state.results.filter(Boolean).length+' správně'}`:'Vyber odpověď na tabuli';}
}

const examples=document.getElementById('examples')!;let group='';
for(const s of samples){if(s.group!==group){group=s.group;const h=document.createElement('h3');h.textContent=group;examples.append(h);}const button=document.createElement('button');button.dataset.sample=s.id;button.textContent=s.label;button.onclick=()=>{selected=s.id;scene?.startExample();};examples.append(button);}
for(const m of modes){const b=document.createElement('button');b.dataset.mode=m.id;b.textContent=m.label;b.onclick=()=>{mode=m.id;scene?.startExample();};document.getElementById('modes')!.append(b);}
document.getElementById('replay')!.onclick=()=>scene?.startExample();
document.getElementById('count')!.onchange=e=>{count=Number((e.target as HTMLSelectElement).value);scene?.startExample();};
document.getElementById('words')!.onclick=e=>{hiddenWords=!hiddenWords;(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(hiddenWords));scene?.startExample();};
document.getElementById('fullscreen')!.onclick=()=>document.getElementById('game')!.requestFullscreen();
document.getElementById('inventory-toggle')!.onclick=()=>{const el=document.getElementById('inventory')!;el.hidden=!el.hidden;};
document.getElementById('audio')!.onclick=e=>{const on=(e.currentTarget as HTMLElement).getAttribute('aria-pressed')!=='true';(e.currentTarget as HTMLElement).setAttribute('aria-pressed',String(on));gameAudio().setVolume('effects',on?0.6:0);};

new Phaser.Game({type:params.get('renderer')==='canvas'?Phaser.CANVAS:Phaser.AUTO,parent:'game',width:1280,height:720,backgroundColor:'#142437',
    scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false},audio:{noAudio:true},scene:[WorkshopScene]});

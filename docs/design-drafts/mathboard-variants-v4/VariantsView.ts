import Phaser from 'phaser';
import type { MathProblem, ComparisonStageId } from '../../../src/types';
import type { MathBoardPresentation } from '../../../src/ui/MathBoard';
import type { MathBoardDefense } from '../../../src/ui/SequentialMathView';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { ComparisonProblemView, comparisonGlyph, drawComparisonSlot, drawComparisonSymbol, type ComparisonHost } from '../../../src/ui/ComparisonProblemView';
import { createComparisonDemoProblems } from '../../../src/systems/ComparisonLearningSystem';
import { formatMathProblem, getComparisonExpressions } from '../../../src/utils/formatMathProblem';
import { modes, type Mode } from './catalog';
import { CREAM, GREEN, RED, host, art, text, change, centerInk, icon, socket, Motion } from './Art';

type Button={root:Phaser.GameObjects.Container;surface:Phaser.GameObjects.Container;highlight:Phaser.GameObjects.Graphics;
  mark:Phaser.GameObjects.Container;symbol:Phaser.GameObjects.GameObject;enabled:boolean;pressed:boolean;selected:boolean};

/** Presentation only. The production MathBoard owns every attempt, timer and bonus. */
export class VariantsView implements MathBoardPresentation {
  readonly root:Phaser.GameObjects.Container;
  readonly origin:ComparisonHost;
  readonly hints:Phaser.GameObjects.Image[]=[];
  readonly buttons:Button[]=[];
  readonly next:Button;
  readonly demo:Button;
  private question:Phaser.GameObjects.Container;
  private parchment:Phaser.GameObjects.Image;
  private feedback:Phaser.GameObjects.Container;
  private progress:Phaser.GameObjects.Container;
  private source:Phaser.GameObjects.Container;
  private incoming:Phaser.GameObjects.Container;
  private owner:Phaser.GameObjects.Container;
  private counter:Phaser.GameObjects.Text;
  private increment:Phaser.GameObjects.Container;
  private timer:Phaser.GameObjects.Graphics;
  private transient:Phaser.GameObjects.Container;
  private comparison:ComparisonProblemView|null=null;
  private relation:Phaser.GameObjects.Container|null=null;
  private slot:Phaser.GameObjects.Container|null=null;
  private problem!:MathProblem;
  private defense:MathBoardDefense|null=null;
  private pending:(()=>void)|null=null;
  private motion:Motion;
  private lastDamage=0;
  private blocked=0;
  private quickBlock=false;
  private quick=0;
  private teaching=false;
  private paused=false;
  private completed=false;
  private phase='ready';
  private counts={index:0,total:3,results:[] as boolean[],damage:0,show:true};
  mode:Mode='attack';
  player=1;
  get state(){return {mode:this.mode,problem:this.problem?.id,accepting:this.buttons.some(b=>b.enabled),pendingNext:!!this.pending,
    results:[...this.counts.results],damage:this.counts.damage,displayedTotal:Number(this.counter.text),blocked:this.blocked,
    teaching:this.teaching,completed:this.completed,phase:this.phase,quick:this.quick,quickBlock:this.quickBlock};}
  constructor(private scene:Phaser.Scene,private builder:SceneBuilder,private onDemo:()=>void){
    this.origin=host(builder,'board');this.motion=new Motion(scene);
    this.root=scene.add.container(0,0).setName('variantsMathBoard').setDepth(this.origin.depth);
    const h=this.h('parchment');this.parchment=art(scene,'parchment',h.width,h.height,h.x,h.y).setDepth(h.depth);this.root.add(this.parchment);
    this.question=this.group('question');this.feedback=this.group('feedback');this.progress=this.group('progress');
    this.source=this.group('source');this.incoming=this.group('incoming');this.owner=this.group('owner');this.increment=this.group('increment');
    const ch=this.h('counter');this.counter=text(scene,ch.x,ch.y,'0',84,CREAM).setDepth(ch.depth);this.root.add(this.counter);
    const th=this.h('timer');this.timer=scene.add.graphics().setPosition(th.x,th.y).setDepth(th.depth);this.root.add(this.timer);
    this.transient=scene.add.container(0,0);this.root.add(this.transient);
    this.next=this.control(this.h('next'),icon(scene,'next',43),()=>this.advance(),false);
    this.demo=this.control(this.h('demo'),icon(scene,'play',30),()=>this.onDemo(),true);
    this.root.add([this.next.root,this.demo.root]);this.demo.root.setVisible(false);
  }
  private h(id:string){return host(this.builder,id,this.origin);}
  private group(id:string){const h=this.h(id),c=this.scene.add.container(h.x,h.y).setDepth(h.depth);this.root.add(c);return c;}
  private control(h:ComparisonHost,symbol:Phaser.GameObjects.GameObject,callback:()=>void,round=false):Button{
    const root=this.scene.add.container(h.x,h.y).setSize(h.width,h.height).setDepth(h.depth);
    const surface=this.scene.add.container(0,0),highlight=this.scene.add.graphics(),mark=this.scene.add.container(76,-33).setVisible(false);
    if(round)surface.add(socket(this.scene,Math.min(h.width,h.height)-4));
    surface.add([highlight,symbol,mark]);root.add(surface).setInteractive({useHandCursor:true});
    const b={root,surface,highlight,mark,symbol,enabled:false,pressed:false,selected:false};
    root.on('pointerover',()=>{if(b.enabled)this.lift(b,-3);});
    root.on('pointerdown',()=>{if(b.enabled){b.pressed=true;this.lift(b,2);}});
    root.on('pointerout',()=>{b.pressed=false;this.lift(b,0);if(!b.selected)highlight.clear();});
    root.on('pointerup',()=>{if(!b.enabled||!b.pressed)return;b.pressed=false;this.lift(b,0);callback();});return b;
  }
  private makeAnswer(i:number,symbol:Phaser.GameObjects.GameObject,callback:()=>void){
    const h=this.h('answer'+i),b=this.control(h,symbol,callback);
    const frame=art(this.scene,'wood',h.width,h.height),shadow=art(this.scene,'wood',h.width,h.height,0,5).setTint(0x2c170a).setAlpha(.24);
    b.root.addAt(shadow,0);b.surface.addAt(frame,0);b.root.setName('answer-'+i);
    b.root.on('pointerover',()=>{if(b.enabled)b.highlight.clear().lineStyle(2,0xffe8a6,.8).strokeRoundedRect(-96,-48,192,94,13);});
    this.buttons.push(b);this.root.add(b.root);
  }
  private lift(b:Button,y:number){this.scene.tweens.killTweensOf(b.surface);b.surface.setX(0);this.motion.tween({targets:b.surface,y,duration:100,ease:'Sine.easeOut'});}
  private enable(b:Button,on:boolean){b.enabled=on;b.pressed=false;this.scene.tweens.killTweensOf(b.surface);b.surface.setPosition(0,0);
    if(!b.selected)b.highlight.clear();if(on)b.root.setInteractive({useHandCursor:true});else b.root.disableInteractive();}
  private isCombat(){return ['attack','sword','pet','defense','practice','coop'].includes(this.mode);}
  private sourceKind(){return this.defense?'shield':modes.find(m=>m.id===this.mode)!.icon;}
  private readyIncrement(){this.increment.removeAll(true);const value=this.isCombat()?this.defense?.power??this.problem.damageMultiplier??1:1;
    this.increment.add(text(this.scene,this.mode.startsWith('prep')?13:0,0,`+${value}`,61,'#c8b586'));
    if(this.mode.startsWith('prep'))this.increment.add(icon(this.scene,'rune',35,0xc8b586).setX(-69));
  }
  showQuestion(problem:MathProblem,onChoice:(index:0|1|2)=>void){
    this.cancel();this.clearQuestion();this.teaching=false;this.completed=false;this.phase='ready';this.problem=problem;this.lastDamage=this.counts.damage;
    this.blocked=0;this.quickBlock=false;this.quick=0;this.root.setVisible(true).setY(0).setAlpha(1);
    const frame=this.mode.startsWith('prep')?'shop-frame':this.mode==='catacomb'?'catacomb-frame':this.mode==='exam'?'exam-frame':'parchment';
    const h=this.h('parchment');this.parchment.setTexture(frame).setScale(Math.min(h.width/this.parchment.width,h.height/this.parchment.height));
    this.source.removeAll(true);this.source.add(icon(this.scene,this.sourceKind(),this.sourceKind()==='sword'?87:68));this.source.setVisible(true);this.counter.setVisible(true);
    this.readyIncrement();this.increment.setVisible(true);this.incoming.removeAll(true);
    if(this.defense)this.incoming.add([icon(this.scene,'sword',40).setX(-27),text(this.scene,29,0,String(this.defense.incomingDamage),45)]);
    this.owner.removeAll(true);
    if(this.mode==='practice')this.owner.add([socket(this.scene,76),icon(this.scene,'replay',35)]);
    if(this.mode==='coop')for(let i=1;i<=2;i++){
      const portrait=art(this.scene,i===1?'girl':'boy',78,78,0,(i-1)*96).setAlpha(i===this.player?1:.35);
      this.owner.add([socket(this.scene,84).setY((i-1)*96),portrait]);
      if(i===this.player)this.owner.add(this.scene.add.circle(0,(i-1)*96,42).setStrokeStyle(3,0xffdc83).setFillStyle(0,0));
    }
    const meta=problem.comparisonMeta,comparison=getComparisonExpressions(problem);
    if(meta&&['size','count','number'].includes(meta.representation)){
      const q=this.h('question'),relative=(id:string)=>{const h=this.h(id);return {...h,x:h.x-q.x,y:h.y-q.y};};
      this.comparison=new ComparisonProblemView(this.scene,problem,{left:relative('left'),right:relative('right'),relation:relative('relation')},0x603a1c);
      for(const side of [this.comparison.left,this.comparison.right])for(const child of side.list){
        if(child instanceof Phaser.GameObjects.Text){child.setFontFamily('Gelasio, Georgia, serif').setFontSize(meta.stage==='number_crocodile'?52:84);centerInk(child);}
        else if((meta.representation==='count'||meta.stage==='number_crocodile')&&child instanceof Phaser.GameObjects.Image){child.x*=1.3;child.setScale(child.scaleX*1.3);}
      }
      this.question.add(this.comparison.root);
    }else if(comparison){
      const long=comparison.left.length+comparison.right.length>14,size=long?58:70;
      const left=text(this.scene,0,0,comparison.left.replaceAll('-','−'),size),right=text(this.scene,0,0,comparison.right.replaceAll('-','−'),size);
      const gap=140,width=left.width+right.width+gap;left.setX(-width/2+left.width/2);right.setX(width/2-right.width/2);
      this.relation=this.scene.add.container(-width/2+left.width+gap/2,0);this.relation.add(drawComparisonSlot(this.scene,94,84));this.question.add([left,right,this.relation]);
    }else{
      const tokens=formatMathProblem(problem,'question').replaceAll('-','−').split(' '),size=tokens.length>6?64:84;
      const children=tokens.map(t=>t==='?'?this.createSlot(size):t==='='?drawComparisonSymbol(this.scene,1,size*1.08,0x603a1c):text(this.scene,0,0,t,size));
      const widths=children.map((c,i)=>tokens[i]==='?'?84:tokens[i]==='='?size*1.08:(c as Phaser.GameObjects.Text).width);
      const total=widths.reduce((a,b)=>a+b,0)+(children.length-1)*22;let x=-total/2;
      children.forEach((c,i)=>{c.setX(x+widths[i]/2);x+=widths[i]+22;this.question.add(c);});
    }
    problem.choices.forEach((value,i)=>{
      const symbol=comparison?(meta?.showCrocodile?comparisonGlyph(this.scene,value,false,118):drawComparisonSymbol(this.scene,value,100,0x603a1c)):text(this.scene,0,-1,String(value),82);
      this.makeAnswer(i,symbol,()=>onChoice(i as 0|1|2));
      const hh=this.h('hint'+i),hint=comparisonGlyph(this.scene,value,false,52).setPosition(hh.x,hh.y).setVisible(false).setDepth(hh.depth);
      this.hints.push(hint);this.root.add(hint);
    });
    this.demo.root.setVisible(Boolean(meta&&!meta.exam));this.setNext(false,'next');this.timer.clear();
    this.question.setAlpha(0);this.motion.tween({targets:this.question,alpha:1,duration:180});
  }
  private createSlot(size:number){this.slot=this.scene.add.container(0,0);this.slot.setData('fontSize',size);this.slot.add(drawComparisonSlot(this.scene,82,84));return this.slot;}
  updateProgress(index:number,total:number,results:boolean[],damage:number,show:boolean){
    this.counts={index,total,results:[...results],damage,show};this.progress.removeAll(true);
    if(!results.length){this.lastDamage=0;change(this.counter,'0');}
    else if(results.length===index){change(this.counter,String(this.isCombat()?damage:results.filter(Boolean).length));}
    for(let i=0;i<total;i++){
      const x=i*41,fill=results[i]===true?GREEN:results[i]===false?RED:0xa77d3d;
      this.progress.add(this.scene.add.circle(x,2,17,0x6f3f1c));this.progress.add(this.scene.add.circle(x,0,16,fill).setStrokeStyle(i===index?2.5:1.5,i===index?0xffe4a2:0xd5aa62));
      if(results[i]!==undefined)this.progress.add(icon(this.scene,results[i]?'check':'cross',22).setX(x));
    }
  }
  setDefense(defense:MathBoardDefense|null){this.defense=defense;}
  showDefenseResult(blocked:number,quick:boolean){this.blocked=blocked;this.quickBlock=quick;}
  showSpeedBonus(quick:number){this.quick=quick;}
  setEnabled(on:boolean){this.buttons.forEach(b=>this.enable(b,on));this.enable(this.demo,on);}
  resetSurfaces(){[...this.buttons,this.next,this.demo].forEach(b=>{b.pressed=false;this.scene.tweens.killTweensOf(b.surface);b.surface.setPosition(0,0);if(!b.selected)b.highlight.clear();});}
  showHints(){this.hints.forEach(h=>h.setVisible(true));}
  hideHints(){this.hints.forEach(h=>h.setVisible(false));}
  showArithmeticHint(){this.feedback.removeAll(true);this.explain();}
  private mark(button:Button,correct:boolean){
    button.selected=true;button.highlight.clear().fillStyle(correct?GREEN:RED,.09).lineStyle(3,correct?GREEN:RED,.95).fillRoundedRect(-95,-47,190,92,12).strokeRoundedRect(-95,-47,190,92,12);
    button.mark.removeAll(true);button.mark.add([this.scene.add.circle(0,0,17,correct?GREEN:RED).setStrokeStyle(2,0xf7d18a),icon(this.scene,correct?'check':'cross',23)]);
    button.mark.setVisible(true).setAlpha(0);this.motion.tween({targets:button.mark,alpha:1,duration:160});
  }
  answer(correct:boolean,choice:number,done:()=>void){
    this.setEnabled(false);this.hideHints();this.phase=correct?'base':'wrong';this.mark(this.buttons[choice],correct);
    const b=this.buttons[choice],base=this.isCombat()?this.defense?.power??this.problem.damageMultiplier??1:1;
    const target=this.defense?this.blocked:this.isCombat()?this.counts.damage:this.counts.results.filter(Boolean).length;
    const previous=this.defense?0:this.isCombat()?this.lastDamage:this.counts.results.slice(0,-1).filter(Boolean).length;
    const earned=target-previous,first=Math.min(base,earned),bonus=earned-first;
    this.increment.removeAll(true);this.increment.add(text(this.scene,0,0,correct?`+${first}`:'0',66,correct?CREAM:'#dda383'));
    if(!correct)this.increment.add(icon(this.scene,'cross',25,0xda9674).setX(79));
    if(correct){
      this.revealAnswer(true);this.flyAnswer(choice);
      this.motion.later(380,()=>this.transfer(previous,first,false));
      if(bonus>0)this.motion.later(1010,()=>{this.phase='quick';this.increment.removeAll(true);this.increment.add([icon(this.scene,'bolt',37).setX(-63),text(this.scene,12,0,`+${bonus}`,64,'#ffdb65')]);this.transfer(previous+first,bonus,true);});
      this.motion.later(bonus>0?1690:1050,()=>{this.phase='answered';this.increment.removeAll(true);
        this.increment.add(icon(this.scene,'check',42,0xb2d680).setX(bonus>0||this.mode.startsWith('prep')?-29:0));
        if(bonus>0)this.increment.add(icon(this.scene,'bolt',40).setX(35));
        else if(this.mode.startsWith('prep'))this.increment.add(icon(this.scene,'rune',36).setX(35));this.offerNext(done);});
    }else{
      this.motion.tween({targets:b.surface,x:{from:-4,to:4},duration:60,yoyo:true,repeat:2,onComplete:()=>b.surface.setX(0)});
      if(this.slot){this.slot.removeAll(true);this.slot.add(text(this.scene,0,0,String(this.problem.choices[choice]),this.slot.getData('fontSize'),'#a64b32'));}
      this.explain();
      if(this.comparison)this.motion.later(750,()=>this.illustrate(()=>{this.phase='answered';this.offerNext(done);}));
      else this.motion.later(1500,()=>{this.revealAnswer(false);this.phase='answered';this.offerNext(done);});
    }
  }
  private transfer(previous:number,amount:number,quick:boolean){
    const flying=text(this.scene,this.increment.x,this.increment.y,`+${amount}`,64,quick?'#ffdf64':CREAM);this.transient.add(flying);this.root.bringToTop(this.transient);
    this.increment.setAlpha(.18);
    this.motion.tween({targets:flying,x:this.counter.x,y:this.counter.y,alpha:{from:1,to:.12},duration:430,ease:'Cubic.easeInOut',onComplete:()=>{
      flying.destroy();change(this.counter,String(previous+amount));this.counter.setShadow(0,0,quick?'#ffd44f':'#ffdc90',14,true,true);this.increment.setAlpha(1);
      this.motion.later(300,()=>this.counter.setShadow(0,0,'#000',0,false,false));
    }});
  }
  private flyAnswer(choice:number){
    if(!this.slot)return;const b=this.buttons[choice],q=this.h('question');
    const flying=text(this.scene,b.root.x,b.root.y,String(this.problem.answer),82,'#4a7b32');this.transient.add(flying);this.slot.setAlpha(0);
    this.motion.tween({targets:flying,x:q.x+this.slot.x,y:q.y,alpha:{from:1,to:.15},duration:420,ease:'Cubic.easeInOut',onComplete:()=>{flying.destroy();this.slot?.setAlpha(1);}});
  }
  private revealAnswer(correct:boolean){
    const ink=correct?0x447b35:0x79522d;
    if(this.slot){this.slot.removeAll(true);this.slot.add(text(this.scene,0,0,String(this.problem.answer),this.slot.getData('fontSize'),correct?'#447b35':'#79522d'));}
    if(this.relation){this.relation.removeAll(true);this.relation.add(drawComparisonSymbol(this.scene,this.problem.answer,86,ink));}
    if(this.comparison){this.comparison.relation.removeAll(true);this.comparison.relation.add(this.problem.comparisonMeta?.showCrocodile?comparisonGlyph(this.scene,this.problem.answer,false,100):drawComparisonSymbol(this.scene,this.problem.answer,86,ink));}
  }
  private equation(label:string,size:number,y=0){
    const c=this.scene.add.container(0,y),tokens=label.split(/\s+/).filter(Boolean),items=tokens.map(t=>/^[<>=]$/.test(t)?drawComparisonSymbol(this.scene,['<','=','>'].indexOf(t),size*1.18,0x603a1c):text(this.scene,0,0,t,size));
    const widths=items.map((it,i)=>/^[<>=]$/.test(tokens[i])?size*1.18:(it as Phaser.GameObjects.Text).width);let x=-(widths.reduce((a,b)=>a+b,0)+(items.length-1)*12)/2;
    items.forEach((it,i)=>{it.setPosition(x+widths[i]/2,0);c.add(it);x+=widths[i]+12;});return c;
  }
  private explain(){
    this.feedback.removeAll(true);const p=this.problem,cmp=getComparisonExpressions(p);
    if(cmp){
      if(p.comparisonMeta&&p.comparisonMeta.representation!=='expression')return;
      const op=(a:number,b:number,o:string)=>o==='+'?a+b:o==='-'?a-b:a*b;
      let a=op(p.operand1,p.operand2,p.operator),b=p.operand3??0;
      if(p.problemType==='comparison_eq_vs_eq')b=op(b,p.operand4!,p.operator3!);
      else if(p.operand4!==undefined){a=op(a,p.operand3!,p.operator2!);b=p.operand4;}
      if(p.comparisonMeta){a=p.comparisonMeta.leftValue;b=p.comparisonMeta.rightValue;}
      this.feedback.add(this.equation(`${a} ${['<','=','>'][p.answer]} ${b}`,37));return;
    }
    if(p.problemType==='missing_operand'||p.operand3!==undefined){
      this.feedback.add(this.equation(formatMathProblem(p,'answer').replaceAll('-','−'),28,-17));this.operationModel(p);return;
    }
    if(p.operator==='*'){
      const spacing=86;for(let group=0;group<p.operand1;group++){
        const x=(group-(p.operand1-1)/2)*spacing;this.feedback.add(this.scene.add.graphics().lineStyle(1.5,0x9a7846,.8).strokeRoundedRect(x-34,-25,68,50,8));
        for(let j=0;j<p.operand2;j++)this.feedback.add(art(this.scene,'comparison-apple',21,21,x+(j%2-.5)*25,(Math.floor(j/2)-.5)*23));
      }return;
    }
    const n=p.operator==='-'?p.operand1:p.operand1+p.operand2,step=35,gap=p.operator==='+'?36:0,start=-((n-1)*step+gap)/2;
    for(let i=0;i<n;i++){
      const x=start+i*step+(i>=p.operand1?gap:0),apple=art(this.scene,'comparison-apple',29,29,x,0);this.feedback.add(apple);
      if(p.operator==='-'&&i>=p.answer){apple.setAlpha(.4);this.feedback.add(this.scene.add.graphics().lineStyle(3,RED).lineBetween(x-12,-15,x+12,15));}
      if(p.operator==='+'&&i===p.operand1-1)this.feedback.add(text(this.scene,x+(step+gap)/2,0,'+',28));
    }
  }
  private operationModel(p:MathProblem){
    const items=Array.from({length:p.operand1},()=>({removed:false,group:0}));
    const apply=(op:string,n:number,group:number)=>{if(op==='+')for(let i=0;i<n;i++)items.push({removed:false,group});else if(op==='-'){let remaining=n;for(let i=items.length-1;i>=0&&remaining;i--)if(!items[i].removed){items[i].removed=true;remaining--;}}};
    apply(p.operator,p.problemType==='missing_operand'?p.answer:p.operand2,1);if(p.operand3!==undefined&&p.operator2)apply(p.operator2,p.operand3,2);
    const step=24;items.forEach((item,i)=>{const x=(i-(items.length-1)/2)*step;this.feedback.add(this.scene.add.circle(x,20,7,item.group===0?0xa57435:0x487c76,item.removed?.35:1));
      if(item.removed)this.feedback.add(this.scene.add.graphics().lineStyle(2.5,RED).lineBetween(x-7,12,x+7,28));});
  }
  playDemo(stage:ComparisonStageId,done:()=>void){
    this.cancel();const examples=createComparisonDemoProblems(stage);let i=0;
    const next=()=>{if(i===examples.length){this.teaching=false;done();return;}
      this.showQuestion(examples[i++],()=>{});this.teaching=true;this.setEnabled(false);this.demo.root.setVisible(false);
      this.source.setVisible(false);this.counter.setVisible(false);this.increment.removeAll(true);this.increment.add(icon(this.scene,'play',38));
      this.motion.later(stage==='size_crocodile'?1000:750,()=>this.illustrate(()=>this.motion.later(650,next)));
    };next();
  }
  private illustrate(done:()=>void){
    if(!this.comparison){this.explain();this.revealAnswer(false);this.motion.later(900,done);return;}
    const p=this.problem,v=this.comparison,b=this.buttons[p.choices.indexOf(p.answer)],q=this.h('question');
    const mouth=comparisonGlyph(this.scene,p.answer,false,118).setPosition(b.root.x,b.root.y);this.transient.add(mouth);this.root.bringToTop(this.transient);
    const pace=p.comparisonMeta?.stage==='size_crocodile'?1.3:1;
    this.motion.tween({targets:mouth,x:q.x+v.relation.x,y:q.y+v.relation.y,duration:650*pace,ease:'Sine.easeInOut',onComplete:()=>{
      mouth.destroy();v.reveal(false);
      if(p.answer===1){v.pairEqual();this.motion.later(1000*pace,()=>{v.clearPairing();this.revealAnswer(true);done();});return;}
      const side=p.answer===0?v.right:v.left,items=side.list.filter(o=>o instanceof Phaser.GameObjects.Image||o instanceof Phaser.GameObjects.Text) as Array<Phaser.GameObjects.Image|Phaser.GameObjects.Text>;
      const originals=items.map(item=>({item,x:item.x,y:item.y,scale:item.scaleX}));
      originals.forEach(({item},i)=>this.motion.tween({targets:item,x:v.relation.x-side.x,y:v.relation.y-side.y,scale:.05,alpha:0,duration:300*pace,delay:i*140*pace}));
      this.motion.later((items.length*140+500)*pace,()=>{originals.forEach(({item,x,y,scale})=>item.setPosition(x,y).setScale(scale).setAlpha(1));this.revealAnswer(true);done();});
    }});
  }
  private setNext(on:boolean,kind:string){this.next.surface.remove(this.next.symbol,true);this.next.symbol=icon(this.scene,kind,kind==='sword'?51:43);this.next.surface.add(this.next.symbol);
    this.next.root.setVisible(true);this.next.surface.setAlpha(on?1:.25);this.enable(this.next,on);}
  private offerNext(done:()=>void){this.pending=done;this.setNext(true,this.counts.results.length===this.counts.total&&this.isCombat()?this.sourceKind():'next');}
  advance(){if(this.paused||!this.pending)return;const next=this.pending;this.pending=null;this.setNext(false,'next');next();}
  complete(replay:()=>void){this.completed=true;this.phase='complete';this.pending=replay;this.setNext(true,'replay');}
  tickTimer(ratio:number){const h=this.h('timer');this.timer.clear().fillStyle(0x76542e,.3).fillRoundedRect(-h.width/2,-4,h.width,8,4);
    this.timer.fillStyle(ratio>.25?0x4e8878:0xb97138).fillRoundedRect(-h.width/2,-4,Math.max(0,ratio)*h.width,8,4);}
  setWordsHidden(_hidden:boolean){} // The entire player-facing canvas already uses pictures and numerals only.
  setPaused(on:boolean){this.paused=on;this.motion.pause(on);this.resetSurfaces();}
  cancel(){this.motion.cancel();this.pending=null;this.transient.removeAll(true);this.increment?.setAlpha(1);this.counter?.setShadow(0,0,'#000',0,false,false);this.resetSurfaces();}
  private clearQuestion(){this.question.removeAll(true);this.feedback.removeAll(true);this.buttons.splice(0).forEach(b=>b.root.destroy(true));this.hints.splice(0).forEach(h=>h.destroy());this.comparison=null;this.relation=null;this.slot=null;}
  hide(){this.cancel();this.setEnabled(false);this.root.setVisible(false);}
  destroy(){this.cancel();this.root.destroy(true);}
}

import Phaser from 'phaser';
import type { MathProblem, ComparisonStageId } from '../../../src/types';
import type { MathBoardPresentation } from '../../../src/ui/MathBoard';
import type { MathBoardDefense } from '../../../src/ui/SequentialMathView';
import type { ComparisonHost } from '../../../src/ui/ComparisonProblemView';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';

const INK='#603a1c',CREAM='#fff0bc',GREEN=0x4e873b,RED=0xac5039;
type AnswerButton={root:Phaser.GameObjects.Container;surface:Phaser.GameObjects.Container;highlight:Phaser.GameObjects.Graphics;mark:Phaser.GameObjects.Container;
  label:Phaser.GameObjects.Text;enabled:boolean;pressed:boolean;selected:boolean};

/** One faithful visual slice, using MathBoard's actual first-answer/batch flow. */
export class ReferenceView implements MathBoardPresentation{
  readonly root:Phaser.GameObjects.Container;
  readonly origin:ComparisonHost;
  readonly hints:Phaser.GameObjects.Image[]=[];
  readonly buttons:AnswerButton[]=[];
  private builder:SceneBuilder;
  private question:Phaser.GameObjects.Container;
  private solution:Phaser.GameObjects.Container;
  private power:Phaser.GameObjects.Container;
  private feedback:Phaser.GameObjects.Container;
  private progress:Phaser.GameObjects.Container;
  private transient:Phaser.GameObjects.Container;
  private speed:Phaser.GameObjects.Container;
  private totalLabel:Phaser.GameObjects.Text;
  private totalValue:Phaser.GameObjects.Text;
  readonly next:Phaser.GameObjects.Container;
  private timers=new Set<Phaser.Time.TimerEvent>();
  private tweens=new Set<Phaser.Tweens.Tween>();
  private pending:(()=>void)|null=null;
  private problem!:MathProblem;
  private counts={index:0,total:3,results:[] as boolean[],damage:0};
  private lastDamage=0;
  private speedCharges=0;
  private completed=false;
  private paused=false;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

  get state(){return {problem:this.problem?.id,results:[...this.counts.results],damage:this.counts.damage,pendingNext:!!this.pending,
    accepting:this.buttons.some(b=>b.enabled),completed:this.completed};}
  constructor(private scene:Phaser.Scene){
    this.builder=new SceneBuilder(scene);this.builder.buildScene('MathBoardReference');this.origin=this.host('board',false);
    const h=this.host('backdrop',false);const backdrop=scene.add.image(h.x,h.y,'reference-art').setDepth(h.depth);
    backdrop.setScale(Math.min(h.width/backdrop.width,h.height/backdrop.height));
    this.root=scene.add.container(0,0).setName('referenceMathBoard').setDepth(this.origin.depth);
    this.question=scene.add.container(0,0);this.root.add(this.question);
    this.solution=this.group('solution');this.power=this.group('power');this.feedback=this.group('feedback');
    this.progress=scene.add.container(0,0);this.root.add(this.progress);
    this.speed=this.group('speed');this.transient=scene.add.container(0,0);this.root.add(this.transient);
    const l=this.host('totalLabel'),n=this.host('totalValue');
    this.totalLabel=this.text(l.x,l.y,'Celkem',29,CREAM).setDepth(l.depth);this.totalValue=this.text(n.x,n.y,'0',64,CREAM).setDepth(n.depth);
    this.root.add([this.totalLabel,this.totalValue]);
    const next=this.host('continue');this.next=scene.add.container(next.x,next.y).setSize(next.width,next.height).setDepth(next.depth).setVisible(false);
    this.next.setInteractive({useHandCursor:true});this.next.on('pointerup',()=>this.advance());
    this.next.on('pointerover',()=>this.next.setAlpha(.8));this.next.on('pointerout',()=>this.next.setAlpha(1));this.root.add(this.next);
  }
  private host(id:string,relative=true):ComparisonHost{const o=this.builder.get<Phaser.GameObjects.Container>(id),d=this.builder.getElementDef(id);
    if(!o||!d?.width||!d.height)throw Error('Missing reference layout host: '+id);
    return {x:o.x-(relative?this.origin.x:0),y:o.y-(relative?this.origin.y:0),width:d.width,height:d.height,depth:o.depth};}
  private group(id:string){const h=this.host(id),c=this.scene.add.container(h.x,h.y).setDepth(h.depth);this.root.add(c);return c;}
  private text(x:number,y:number,value:string,size:number,color=INK){const t=this.scene.add.text(x,y,value,{fontFamily:'Gelasio, Georgia, serif',fontSize:size,fontStyle:'bold',color,resolution:2});this.centerInk(t);return t;}
  private centerInk(t:Phaser.GameObjects.Text){const c=t.canvas,p=t.context.getImageData(0,0,c.width,c.height).data;let l=c.width,r=0,top=c.height,b=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(p[(y*c.width+x)*4+3]>32){l=Math.min(l,x);r=Math.max(r,x);top=Math.min(top,y);b=Math.max(b,y);}
    t.setOrigin(l<=r?(l+r+1)/(2*c.width):.5,top<=b?(top+b+1)/(2*c.height):.5);}
  private updateText(t:Phaser.GameObjects.Text,v:string){t.setText(v);this.centerInk(t);}
  private later(ms:number,fn:()=>void){const timer=this.scene.time.delayedCall(ms,()=>{this.timers.delete(timer);fn();});this.timers.add(timer);return timer;}
  private animate(config:Phaser.Types.Tweens.TweenBuilderConfig){const tween=this.scene.tweens.add({...config,duration:this.reduced?0:config.duration,
    onComplete:()=>{this.tweens.delete(tween);(config.onComplete as (()=>void)|undefined)?.();}});this.tweens.add(tween);return tween;}
  private glyph(kind:'check'|'cross'|'arrow'|'replay',size:number,color=0xfff1c6){const g=this.scene.add.graphics().lineStyle(4,color,1);const s=size/32;
    if(kind==='check')g.strokePoints([{x:-11,y:0},{x:-3,y:8},{x:12,y:-10}]);
    if(kind==='cross'){g.lineBetween(-9,-9,9,9);g.lineBetween(-9,9,9,-9);}
    if(kind==='arrow'){g.lineBetween(-13,0,13,0);g.strokePoints([{x:3,y:-11},{x:15,y:0},{x:3,y:11}]);}
    if(kind==='replay'){g.beginPath();g.arc(0,0,12,.1,Math.PI*1.75,false);g.strokePath();g.strokePoints([{x:10,y:-17},{x:10,y:-5},{x:-2,y:-5}]);}
    g.setScale(s);return g;}
  private bolt(color=0xffd658){const c=this.scene.add.container(0,0);const points=[{x:4,y:-35},{x:-22,y:5},{x:-3,y:5},{x:-9,y:34},{x:23,y:-8},{x:5,y:-8}];
    c.add(this.scene.add.graphics().fillStyle(0x412005,.55).fillPoints(points,true).setPosition(2,4));
    c.add(this.scene.add.graphics().fillStyle(color).lineStyle(2,0xffef9d).fillPoints(points,true).strokePoints(points,true));return c;}
  private makeButton(i:number,value:number,click:()=>void){const h=this.host('answer'+i),root=this.scene.add.container(h.x,h.y).setSize(h.width,h.height).setDepth(h.depth);
    const art=this.scene.add.image(0,0,'reference-wood');art.setScale(Math.min(h.width/art.width,h.height/art.height));
    const shadow=this.scene.add.image(0,5,'reference-wood').setScale(art.scaleX).setTint(0x2c170a).setAlpha(.24);
    const label=this.text(0,-1,String(value),82),highlight=this.scene.add.graphics(),mark=this.scene.add.container(76,-32).setVisible(false);
    const surface=this.scene.add.container(0,0,[art,highlight,label,mark]);root.add([shadow,surface]).setInteractive({useHandCursor:true});
    const b:AnswerButton={root,surface,highlight,mark,label,enabled:false,pressed:false,selected:false};
    const hover=()=>{if(!b.enabled)return;this.lift(b,-3);highlight.clear().lineStyle(2,0xffe7a4,.85).strokeRoundedRect(-96,-48,192,94,13);};
    root.on('pointerover',hover);root.on('pointerdown',()=>{if(b.enabled){b.pressed=true;this.lift(b,2);}});
    root.on('pointerout',()=>{b.pressed=false;this.lift(b,0);if(!b.selected)highlight.clear();});
    root.on('pointerup',()=>{if(!b.enabled||!b.pressed)return;b.pressed=false;this.lift(b,0);click();});
    this.root.add(root);this.buttons.push(b);
  }
  private lift(b:AnswerButton,y:number){this.scene.tweens.killTweensOf(b.surface);this.animate({targets:b.surface,y,duration:100,ease:'Sine.easeOut'});}
  showQuestion(problem:MathProblem,onChoice:(i:0|1|2)=>void){
    this.cancel();this.completed=false;this.root.setVisible(true);this.problem=problem;this.lastDamage=this.counts.damage;this.speedCharges=0;
    this.question.removeAll(true);this.solution.removeAll(true);this.feedback.removeAll(true);this.power.removeAll(true);this.speed.removeAll(true);
    this.buttons.splice(0).forEach(b=>b.root.destroy(true));
    for(const [id,value]of [['operandA',problem.operand1],['operator','+'],['operandB',problem.operand2],['equals','=']] as const){
      const h=this.host(id);this.question.add(this.text(h.x,h.y,String(value),id==='equals'?96:86).setDepth(h.depth));}
    const slot=this.scene.add.graphics().lineStyle(3,0x947146,.65);
    // An empty, generous answer slot; the numeral arrives from the selected tile.
    for(let x=-37;x<32;x+=17){slot.lineBetween(x,-41,Math.min(x+9,37),-41);slot.lineBetween(x,41,Math.min(x+9,37),41);}
    for(let y=-31;y<32;y+=17){slot.lineBetween(-43,y,-43,Math.min(y+9,31));slot.lineBetween(43,y,43,Math.min(y+9,31));}
    this.solution.add(slot);this.power.add(this.text(0,0,String(problem.damageMultiplier??4),76,CREAM));
    this.speed.add(this.bolt(0xb68a43).setAlpha(.42));this.next.setVisible(false);
    problem.choices.forEach((v,i)=>this.makeButton(i,v,()=>onChoice(i as 0|1|2)));
    this.question.setAlpha(0);this.animate({targets:this.question,alpha:1,duration:180});
  }
  setEnabled(on:boolean){this.buttons.forEach(b=>{b.enabled=on;b.pressed=false;this.scene.tweens.killTweensOf(b.surface);b.surface.setPosition(0,0);
    if(!b.selected)b.highlight.clear();if(on)b.root.setInteractive({useHandCursor:true});else b.root.disableInteractive();});}
  resetSurfaces(){this.buttons.forEach(b=>{b.pressed=false;this.scene.tweens.killTweensOf(b.surface);b.surface.setPosition(0,0);if(!b.selected)b.highlight.clear();});}
  updateProgress(index:number,total:number,results:boolean[],damage:number,_show:boolean){this.counts={index,total,results:[...results],damage};this.progress.removeAll(true);
    if(index===0&&!results.length){this.lastDamage=0;this.updateText(this.totalValue,'0');}
    for(let i=0;i<3;i++){const h=this.host('progress'+i);if(results[i]===undefined){if(i===index)this.progress.add(this.scene.add.circle(h.x,h.y,16).setStrokeStyle(2,0xffe0a0,.9));continue;}
      this.progress.add(this.scene.add.circle(h.x,h.y,16,results[i]?GREEN:RED).setStrokeStyle(1.5,0xffe6a4));this.progress.add(this.glyph(results[i]?'check':'cross',22).setPosition(h.x,h.y));}
  }
  showSpeedBonus(charges:number){this.speedCharges=charges;}
  answer(correct:boolean,choice:number,done:()=>void){
    this.setEnabled(false);const b=this.buttons[choice];b.selected=true;
    b.highlight.clear().fillStyle(correct?GREEN:RED,.09).lineStyle(3,correct?GREEN:RED,.95).fillRoundedRect(-95,-47,190,92,12).strokeRoundedRect(-95,-47,190,92,12);
    b.mark.add(this.scene.add.circle(0,0,17,correct?GREEN:RED).setStrokeStyle(2,0xf7d18a));b.mark.add(this.glyph(correct?'check':'cross',23));b.mark.setVisible(true).setAlpha(0);
    this.animate({targets:b.mark,alpha:1,duration:160});
    this.solution.removeAll(true);const value=this.text(0,0,String(this.problem.choices[choice]),86,correct?'#447b35':'#a64b32');this.solution.add(value);
    this.power.removeAll(true);const base=this.problem.damageMultiplier??4,damage=this.counts.damage-this.lastDamage,bonus=damage-base;
    if(correct&&bonus>0){this.power.add([this.text(-91,0,String(base),70,CREAM),this.text(-28,0,`+${bonus}`,48,'#ffdb65'),this.text(32,0,'→',61,CREAM),this.text(100,0,String(damage),90,CREAM)]);}
    else this.power.add(this.text(0,0,String(correct?damage:0),76,correct?CREAM:'#dba17a'));
    if(correct&&this.speedCharges){this.speed.removeAll(true);this.speed.add(this.bolt());const ring=this.scene.add.graphics().lineStyle(3,0xffda66,.9).strokeCircle(0,0,43);this.speed.addAt(ring,0);
      this.animate({targets:ring,alpha:{from:1,to:.2},duration:550,yoyo:true,repeat:1});}
    if(correct){
      const flying=this.text(b.root.x,b.root.y,String(this.problem.answer),82,'#4a7b32');this.transient.add(flying);this.root.bringToTop(this.transient);value.setAlpha(0);
      this.animate({targets:flying,x:this.solution.x,y:this.solution.y,alpha:{from:1,to:.15},duration:420,ease:'Cubic.easeInOut',onComplete:()=>{flying.destroy();value.setAlpha(1);}});
      this.later(420,()=>this.transferTotal());this.later(1050,()=>this.offerNext(done));
    }else{
      this.animate({targets:b.surface,x:{from:-4,to:4},duration:60,yoyo:true,repeat:2,onComplete:()=>b.surface.setX(0)});
      this.showObjects();this.later(1200,()=>{this.updateText(value,String(this.problem.answer));value.setColor('#447b35');});this.later(1500,()=>this.offerNext(done));
    }
  }
  private transferTotal(){const pulse={value:this.lastDamage};this.animate({targets:pulse,value:this.counts.damage,duration:450,ease:'Cubic.easeOut',onUpdate:()=>this.updateText(this.totalValue,String(Math.round(pulse.value)))});
    const spark=this.scene.add.circle(this.power.x+112,this.power.y+28,5,0xffe293);this.transient.add(spark);
    this.animate({targets:spark,x:this.totalValue.x,y:this.totalValue.y,alpha:{from:1,to:0},duration:500,ease:'Cubic.easeIn',onComplete:()=>spark.destroy()});
    this.lastDamage=this.counts.damage;}
  private showObjects(){const a=this.problem.operand1,b=this.problem.operand2,spacing=42,gap=48,total=(a+b-1)*spacing+gap,start=-total/2;
    for(let i=0;i<a+b;i++){const x=start+i*spacing+(i>=a?gap:0),apple=this.scene.add.image(x,0,'reference-apple').setAlpha(0);apple.setScale(35/apple.width);this.feedback.add(apple);
      this.animate({targets:apple,alpha:1,duration:160,delay:i*90});}
    const plus=this.text(start+(a-.5)*spacing+gap/2,0,'+',28);this.feedback.add(plus);
  }
  private offerNext(done:()=>void){this.pending=done;this.next.removeAll(true);this.next.add(this.glyph('arrow',36));this.next.setVisible(true).setAlpha(0);this.animate({targets:this.next,alpha:1,duration:180});}
  advance(){if(this.paused||!this.pending)return;const f=this.pending;this.pending=null;this.next.setVisible(false);f();}
  complete(restart:()=>void){this.completed=true;this.pending=restart;this.next.removeAll(true);this.next.add(this.glyph('replay',34));this.next.setVisible(true);}
  setWordsHidden(hidden:boolean){this.totalLabel.setVisible(!hidden);}
  setPaused(paused:boolean){this.paused=paused;this.timers.forEach(t=>t.paused=paused);this.tweens.forEach(t=>paused?t.pause():t.resume());this.resetSurfaces();}
  cancel(){this.timers.forEach(t=>t.remove(false));this.timers.clear();this.tweens.forEach(t=>t.stop());this.tweens.clear();this.pending=null;this.transient.removeAll(true);this.resetSurfaces();}
  hide(){this.cancel();this.root.setVisible(false);}
  destroy(){this.cancel();this.root.destroy(true);}
  // The first reference slice is arithmetic only; no comparison/defense fixtures are exposed.
  setDefense(_defense:MathBoardDefense|null){}
  showDefenseResult(_blocked:number,_quick:boolean){}
  showHints(){}
  hideHints(){}
  showArithmeticHint(){this.feedback.removeAll(true);this.showObjects();}
  playDemo(_stage:ComparisonStageId,done:()=>void){done();}
}

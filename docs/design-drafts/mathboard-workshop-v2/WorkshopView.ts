import Phaser from 'phaser';
import type { MathProblem, ComparisonStageId } from '../../../src/types';
import type { MathBoardPresentation } from '../../../src/ui/MathBoard';
import type { MathBoardDefense } from '../../../src/ui/SequentialMathView';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { ComparisonProblemView, comparisonGlyph, drawComparisonSlot, drawComparisonSymbol, type ComparisonHost } from '../../../src/ui/ComparisonProblemView';
import { createComparisonDemoProblems } from '../../../src/systems/ComparisonLearningSystem';
import { formatMathProblem, getComparisonExpressions } from '../../../src/utils/formatMathProblem';
import { modes, type Mode } from './catalog';

const INK='#50351f', CREAM='#fff3d0', GOLD=0xe5bb66;
type Button={root:Phaser.GameObjects.Container;surface:Phaser.GameObjects.Container;mark:Phaser.GameObjects.Container;symbol:Phaser.GameObjects.GameObject; enabled:boolean;pressed:boolean};
export class WorkshopView implements MathBoardPresentation {
    root:Phaser.GameObjects.Container;
    origin:ComparisonHost;
    hints:Phaser.GameObjects.Image[]=[];
    readonly buttons:Button[]=[];
    private builder:SceneBuilder;
    private question:Phaser.GameObjects.Container;
    private feedback:Phaser.GameObjects.Container;
    private progress:Phaser.GameObjects.Container;
    private power:Phaser.GameObjects.Container;
    private total:Phaser.GameObjects.Container;
    private source:Phaser.GameObjects.Container;
    private incoming:Phaser.GameObjects.Container;
    private title:Phaser.GameObjects.Text;
    private timer:Phaser.GameObjects.Graphics;
    private energyMeter:Phaser.GameObjects.Container;
    private transient:Phaser.GameObjects.Container;
    private next:Button;
    private demo:Button;
    private problem!:MathProblem;
    private comparison:ComparisonProblemView|null=null;
    private relation:Phaser.GameObjects.Container|null=null;
    private slot:Phaser.GameObjects.Container|null=null;
    private defense:MathBoardDefense|null=null;
    private timers=new Set<Phaser.Time.TimerEvent>();
    private tweens=new Set<Phaser.Tweens.Tween>();
    private pendingNext:(()=>void)|null=null;
    private generation=0;
    private speed=0;
    private blocked=0;
    private quickBlock=false;
    private teaching=false;
    private counts:{index:number;total:number;results:boolean[];damage:number;show:boolean}={index:0,total:1,results:[],damage:0,show:true};
    mode:Mode='attack';
    hideWords=false;
    player=1;
    energy=0;
    get state(){return {mode:this.mode,problem:this.problem?.id,accepting:this.buttons.some(b=>b.enabled),pendingNext:!!this.pendingNext,
        results:[...this.counts.results],damage:this.counts.damage,teaching:this.teaching,generation:this.generation};}
    constructor(private scene:Phaser.Scene,private onDemo:()=>void){
        this.builder=new SceneBuilder(scene);this.builder.buildScene('MathBoardWorkshop');this.origin=this.host('board',false);
        this.root=scene.add.container(0,0).setDepth(this.origin.depth).setVisible(false);
        this.transient=scene.add.container(0,0);this.root.add(this.transient);
        const parchment=scene.add.image(0,0,'ui-math-board');parchment.setScale(Math.min(this.origin.width/parchment.width,this.origin.height/parchment.height));this.root.add(parchment);
        this.question=this.group('question');this.feedback=this.group('feedback');this.progress=this.group('progress');this.power=this.group('power');
        this.total=this.group('total');this.source=this.group('owner');this.incoming=this.group('incoming');
        const th=this.host('title');this.title=this.text(th.x,th.y,'',24,INK);this.root.add(this.title);
        const timer=this.host('timer');this.timer=scene.add.graphics().setPosition(timer.x,timer.y);this.root.add(this.timer);
        this.energyMeter=scene.add.container(timer.x,timer.y);this.root.add(this.energyMeter);
        this.next=this.makeButton(this.host('next'),this.icon('next',26),()=>{const next=this.pendingNext;this.pendingNext=null;this.next.root.setVisible(false);next?.();});
        this.next.root.setVisible(false);this.root.add(this.next.root);
        this.demo=this.makeButton(this.host('demo'),this.icon('play',25),()=>this.onDemo());this.root.add(this.demo.root);
    }
    private host(id:string,relative=true):ComparisonHost {const o=this.builder.get<Phaser.GameObjects.Container>(id)!;const d=this.builder.getElementDef(id)!;
        return {x:o.x-(relative?this.origin.x:0),y:o.y-(relative?this.origin.y:0),width:d.width!,height:d.height!,depth:o.depth};}
    private group(id:string){const h=this.host(id);const g=this.scene.add.container(h.x,h.y).setDepth(h.depth);this.root.add(g);return g;}
    private text(x:number,y:number,label:string,size=56,color=INK){
        const text=this.scene.add.text(x,y,label,{fontFamily:/\d/.test(label)?'Arial, sans-serif':'Georgia, serif',fontSize:size,fontStyle:'bold',color,resolution:2}).setOrigin(.5);
        // Center the drawn ink rather than the font's line box.
        const canvas=text.canvas,pixels=text.context.getImageData(0,0,canvas.width,canvas.height).data;
        let x0=canvas.width,y0=canvas.height,x1=0,y1=0;
        for(let yy=0;yy<canvas.height;yy++)for(let xx=0;xx<canvas.width;xx++)if(pixels[(yy*canvas.width+xx)*4+3]>32){x0=Math.min(x0,xx);x1=Math.max(x1,xx);y0=Math.min(y0,yy);y1=Math.max(y1,yy);}
        if(x0<=x1)text.setOrigin((x0+x1+1)/(2*canvas.width),(y0+y1+1)/(2*canvas.height));
        return text;
    }
    private icon(kind:string,size=36,ink=0xffedb9){const c=this.scene.add.container(0,0);const g=this.scene.add.graphics();c.add(g);const s=size/36;
        if(kind==='sword'||kind==='shield'){const im=this.scene.add.image(0,0,kind);im.setScale(size*1.7/Math.max(im.width,im.height));c.add(im);}
        else {g.lineStyle(4,ink,1).fillStyle(ink,1);
            if(kind==='paw'){g.fillEllipse(0,6,23,18);[-12,-4,5,13].forEach((x,i)=>g.fillEllipse(x,[-6,-13,-13,-6][i],8,10));}
            if(kind==='star'){g.fillPoints(Array.from({length:10},(_,i)=>new Phaser.Geom.Point(Math.sin(i*Math.PI/5)*(i%2?8:19),-Math.cos(i*Math.PI/5)*(i%2?8:19))),true);}
            if(kind==='bolt')g.fillPoints([{x:4,y:-20},{x:-13,y:3},{x:0,y:3},{x:-4,y:20},{x:14,y:-5},{x:1,y:-5}],true);
            if(kind==='check')g.strokePoints([{x:-12,y:0},{x:-3,y:9},{x:14,y:-11}]);
            if(kind==='cross'){g.lineBetween(-10,-10,10,10);g.lineBetween(-10,10,10,-10);}
            if(kind==='next'){g.lineBetween(-12,0,12,0);g.strokePoints([{x:3,y:-11},{x:14,y:0},{x:3,y:11}]);}
            if(kind==='play')g.fillTriangle(-8,-13,-8,13,14,0);
            g.setScale(s);
        } return c;}
    /** Authored three-part frame: fixed corner caps, only the straight center grows. */
    private frame(w:number,h:number){const c=this.scene.add.container(0,0),t=this.scene.textures.get('answer-frame'),f=t.get();const cap=280;
        if(!t.has('left')){t.add('left',0,0,0,cap,f.height);t.add('middle',0,cap,0,f.width-cap*2,f.height);t.add('right',0,f.width-cap,0,cap,f.height);}
        const scale=h/f.height,cw=cap*scale;
        c.add([this.scene.add.image(-w/2+cw/2,0,'answer-frame','left').setScale(scale),
            this.scene.add.image(0,0,'answer-frame','middle').setDisplaySize(w-2*cw+.5,h),
            this.scene.add.image(w/2-cw/2,0,'answer-frame','right').setScale(scale)]);return c;}
    private makeButton(h:ComparisonHost,symbol:Phaser.GameObjects.GameObject,callback:()=>void):Button{
        const root=this.scene.add.container(h.x,h.y).setSize(h.width,h.height).setDepth(h.depth);
        const shadow=this.frame(h.width,h.height).setY(5).setAlpha(.25);shadow.list.forEach((i:any)=>i.setTint(0x1a130c));
        const surface=this.scene.add.container(0,0),mark=this.scene.add.container(h.width/2-10,-h.height/2+7).setVisible(false);
        surface.add([this.frame(h.width,h.height),symbol,mark]);root.add([shadow,surface]);
        const b={root,surface,mark,symbol,enabled:true,pressed:false};root.setInteractive({useHandCursor:true});
        root.on('pointerover',()=>{if(b.enabled)this.lift(b,-4);});root.on('pointerout',()=>{b.pressed=false;this.lift(b,0);});
        root.on('pointerdown',()=>{if(b.enabled){b.pressed=true;this.lift(b,1);}});
        root.on('pointerup',()=>{if(!b.enabled||!b.pressed)return;b.pressed=false;this.lift(b,0);callback();});return b;
    }
    private lift(b:Button,y:number){this.scene.tweens.killTweensOf(b.surface);this.animate({targets:b.surface,y,duration:110,ease:'Sine.easeOut'});}
    private enable(b:Button,on:boolean){b.enabled=on;b.pressed=false;this.scene.tweens.killTweensOf(b.surface);b.surface.setY(0);if(on)b.root.setInteractive({useHandCursor:true});else b.root.disableInteractive();}
    private mark(b:Button,correct:boolean){b.mark.removeAll(true);b.mark.add(this.scene.add.circle(0,0,19,correct?0x327766:0xa33c38).setStrokeStyle(2,0xffe2a0));b.mark.add(this.icon(correct?'check':'cross',21));b.mark.setVisible(true);
        this.animate({targets:b.mark,scale:{from:.3,to:1},duration:250,ease:'Back.easeOut'});
        if(!correct)this.animate({targets:b.surface,x:{from:-4,to:4},duration:65,yoyo:true,repeat:2,onComplete:()=>b.surface.setX(0)});
    }
    showQuestion(problem:MathProblem,onChoice:(index:0|1|2)=>void){
        this.cancel();this.clearQuestion();this.teaching=false;this.problem=problem;this.root.setVisible(true);this.speed=0;this.blocked=0;this.quickBlock=false;
        const mode=modes.find(m=>m.id===this.mode)!;this.title.setText(mode.title).setVisible(!this.hideWords);
        this.power.removeAll(true);this.power.add(this.frame(360,82));this.power.add(this.icon(mode.icon,48).setPosition(-119,0));
        this.power.add(this.text(18,0,this.isCombat()?String(this.defense?.power??problem.damageMultiplier??1):this.mode.startsWith('prep')?'◇':'★',49,CREAM));
        this.source.removeAll(true);if(this.mode==='coop'){const face=this.scene.add.image(-28,0,this.player===1?'girl':'boy').setDisplaySize(54,54);this.source.add([face,this.text(23,0,String(this.player),28)]);}
        this.incoming.removeAll(true);if(this.defense){this.incoming.add(this.icon('sword',38).setPosition(-37,0));this.incoming.add(this.text(19,0,String(this.defense.incomingDamage),38));}
        const meta=problem.comparisonMeta,comparison=getComparisonExpressions(problem);
        if(meta&&['size','count','number'].includes(meta.representation)){
            const absolute=(id:string)=>{const h=this.host(id),q=this.host('question');return {...h,x:h.x-q.x,y:h.y-q.y};};
            this.comparison=new ComparisonProblemView(this.scene,problem,{left:absolute('left'),right:absolute('right'),relation:absolute('relation')});this.question.add(this.comparison.root);
            if(meta.representation==='count'||meta.stage==='number_crocodile')for(const side of [this.comparison.left,this.comparison.right])side.setScale(1.3);
        }else if(comparison){
            const long=comparison.left.length+comparison.right.length>14,size=long?48:58;
            const left=this.text(0,0,comparison.left.replaceAll('-', '−'),size),right=this.text(0,0,comparison.right.replaceAll('-','−'),size);
            const width=left.width+right.width+150;left.setX(-width/2+left.width/2);right.setX(width/2-right.width/2);
            this.relation=this.scene.add.container(-width/2+left.width+75,0);this.relation.add(drawComparisonSlot(this.scene,88,78));this.question.add([left,right,this.relation]);
        }else{
            const tokens=formatMathProblem(problem,'question').replaceAll('-','−').split(' '),size=tokens.length>6?54:66;
            const children=tokens.map(t=>t==='?'?this.createSlot():this.text(0,0,t,t==='='?size*1.15:size));
            const widths=children.map((c:any)=>c===this.slot?84:c.width),total=widths.reduce((a,b)=>a+b,0)+(children.length-1)*18;let x=-total/2;
            children.forEach((c:any,i)=>{c.setX(x+widths[i]/2);x+=widths[i]+18;this.question.add(c);});
        }
        for(let i=0;i<3;i++){
            const h=this.host(`answer${i}`);const sym=comparison?(meta?.showCrocodile?comparisonGlyph(this.scene,problem.choices[i],false,96):drawComparisonSymbol(this.scene,problem.choices[i],76,0xffedc3)):this.text(0,0,String(problem.choices[i]),60,CREAM);
            const b=this.makeButton(h,sym,()=>onChoice(i as 0|1|2));b.root.setName('workshop-answer-'+i);this.buttons.push(b);this.root.add(b.root);
            const hh=this.host('hint'+i);const hint=comparisonGlyph(this.scene,problem.choices[i],false,68).setPosition(hh.x,hh.y).setVisible(false);this.hints.push(hint);this.root.add(hint);
        }
        this.demo.root.setVisible(Boolean(meta&&!meta.exam));this.next.root.setVisible(false);this.timer.clear();this.drawEnergy();
        this.question.setAlpha(0);this.animate({targets:this.question,alpha:1,duration:220});
    }
    private createSlot(){this.slot=this.scene.add.container(0,0);this.slot.add(drawComparisonSlot(this.scene,80,80));return this.slot;}
    private isCombat(){return ['attack','sword','pet','defense','coop'].includes(this.mode);}
    updateProgress(index:number,total:number,results:boolean[],damage:number,show:boolean){this.counts={index,total,results:[...results],damage,show};this.progress.removeAll(true);
        const spacing=Math.min(36,250/Math.max(1,total));for(let i=0;i<total;i++){
            const x=(i-(total-1)/2)*spacing;this.progress.add(this.scene.add.circle(x,0,12,results[i]===true?0x397864:results[i]===false?0xa64c40:0xc4a276).setStrokeStyle(i===index?3:1,i===index?0x644326:0x947346));
            if(results[i]!==undefined)this.progress.add(this.icon(results[i]?'check':'cross',15).setPosition(x,0));
        }
        this.total.removeAll(true);this.total.add(this.frame(240,62));this.total.add(this.icon(this.mode==='defense'?'shield':this.isCombat()?'sword':this.mode.startsWith('prep')?'bolt':'star',32).setPosition(-78,0));
        this.total.add(this.text(24,0,this.mode==='defense'?String(this.blocked):this.isCombat()?String(damage):`${results.filter(Boolean).length} / ${total}`,34,CREAM));
    }
    setDefense(d:MathBoardDefense|null){this.defense=d;}
    showSpeedBonus(charges:number){if(this.isCombat())this.speed=charges;}
    private drawEnergy(){this.energyMeter.removeAll(true);this.energyMeter.setVisible(this.isCombat()&&!this.defense&&!this.teaching);
        this.energyMeter.add(this.icon('bolt',20,0x795424).setPosition(-74,0));
        for(let i=0;i<4;i++){const x=(i-1.5)*32;const g=this.scene.add.graphics().fillStyle(0xe7ac3f,1).lineStyle(2,0x87632f);
            const pts=[{x,y:-10},{x:x+12,y:0},{x,y:10},{x:x-12,y:0}];if(i<this.energy)g.fillPoints(pts,true);g.strokePoints(pts,true);this.energyMeter.add(g);}}
    showDefenseResult(blocked:number,quick:boolean){this.blocked=blocked;this.quickBlock=quick;}
    setEnabled(on:boolean){this.buttons.forEach(b=>this.enable(b,on));this.enable(this.demo,on);}
    resetSurfaces(){[...this.buttons,this.demo,this.next].forEach(b=>{this.scene.tweens.killTweensOf(b.surface);b.surface.setPosition(0,0);});}
    showHints(){this.hints.forEach(h=>h.setVisible(true));}
    hideHints(){this.hints.forEach(h=>h.setVisible(false));}
    showArithmeticHint(){this.feedback.removeAll(true);this.drawExplanation();}
    answer(correct:boolean,choice:number,done:()=>void){
        this.setEnabled(false);this.hideHints();this.mark(this.buttons[choice],correct);
        this.power.removeAll(true);this.power.add(this.frame(360,82));this.power.add(this.icon(this.defense?'shield':modes.find(m=>m.id===this.mode)!.icon,46).setPosition(-119,0));
        const energyBonus=correct&&!this.defense?Math.floor((this.energy+this.speed)/4):0;
        if(correct&&!this.defense)this.energy=(this.energy+this.speed)%4;this.drawEnergy();
        const n=correct?(this.defense?this.blocked:(this.problem.damageMultiplier??1)+energyBonus):0;
        this.power.add(this.text(12,0,this.isCombat()?String(n):correct?'✓':'×',50,CREAM));
        if(this.speed||this.quickBlock){this.power.add(this.icon('bolt',25).setPosition(122,-5));this.power.add(this.text(121,25,this.quickBlock?'×2':`+${this.speed}`,20,CREAM));}
        this.feedback.removeAll(true);this.feedback.add(this.icon(correct?'check':'cross',30).setPosition(-350,0));
        if(correct){
            const badge=this.scene.add.circle(-350,0,22,0x397864);this.feedback.addAt(badge,0);
            const eq=this.equation(formatMathProblem(this.problem,'answer').replace('Správně: ','').replaceAll('-','−'),30);this.feedback.add(eq);
            if(this.comparison)this.comparison.reveal();if(this.relation){this.relation.removeAll(true);this.relation.add(drawComparisonSymbol(this.scene,this.problem.answer,61,0x4d6c43));}
            if(this.slot){this.slot.removeAll(true);this.slot.add(this.text(0,0,String(this.problem.answer),64,'#397864'));}
            const flight=this.icon(this.defense?'shield':this.isCombat()?'sword':'star',25).setPosition(this.power.x,this.power.y);this.transient.add(flight);this.root.bringToTop(this.transient);
            this.animate({targets:flight,x:this.total.x,y:this.total.y,alpha:{from:1,to:0},duration:700,ease:'Cubic.easeIn',onComplete:()=>flight.destroy()});
        }else{
            this.feedback.addAt(this.scene.add.circle(-350,0,22,0xa64c40),0);
            this.drawExplanation();
            if(this.slot){this.slot.removeAll(true);this.slot.add(this.text(0,0,String(this.problem.answer),64,'#836b4c'));}
            if(this.comparison)this.later(600,()=>this.illustrate(()=>this.finishFeedback(done)));
        }
        const c=this.counts;this.updateProgress(c.index,c.total,c.results,c.damage,c.show);
        if(correct||!this.comparison)this.later(800,()=>this.finishFeedback(done));
    }
    private finishFeedback(done:()=>void){this.pendingNext=done;this.next.root.setVisible(true);this.enable(this.next,true);}
    private drawExplanation(){
        const p=this.problem,cmp=getComparisonExpressions(p);
        if(cmp){if(!p.comparisonMeta||p.comparisonMeta.representation==='expression'){
            const op=(a:number,b:number,o:string)=>o==='+'?a+b:o==='-'?a-b:a*b;
            let a=op(p.operand1,p.operand2,p.operator),b=p.operand3??0;
            if(p.problemType==='comparison_eq_vs_eq')b=op(b,p.operand4!,p.operator3!);
            else if(p.operand4!==undefined){a=op(a,p.operand3!,p.operator2!);b=p.operand4;}
            if(p.comparisonMeta){a=p.comparisonMeta.leftValue;b=p.comparisonMeta.rightValue;}
            this.feedback.add(this.equation(`${a}   ${['<','=','>'][p.answer]}   ${b}`,36));
            if(this.relation){this.relation.removeAll(true);this.relation.add(drawComparisonSymbol(this.scene,p.answer,61,0x765331));}
        }return;}
        // A concrete set model for +, − and ×. The equation remains intact above it.
        if(p.problemType==='missing_operand'||p.operand3!==undefined){
            this.feedback.add(this.equation(formatMathProblem(p,'answer').replaceAll('-','−'),30,-13));
            this.drawOperationModel(p);return;
        }
        if(p.operator==='*'){
            const count=Math.min(5,p.operand1),spacing=75;for(let g=0;g<count;g++){const x=(g-(count-1)/2)*spacing;
                const outline=this.scene.add.graphics().lineStyle(1,0x9a7846,.8).strokeRoundedRect(x-29,-25,58,50,8);this.feedback.add(outline);
                for(let j=0;j<p.operand2;j++)this.feedback.add(this.scene.add.circle(x+(j%2-.5)*18,(Math.floor(j/2)-.5)*18,6,0xab7935));}
            return;
        }
        const n=p.operator==='-'?p.operand1:p.operand1+p.operand2,step=29,groupGap=p.operator==='+'?42:0,start=-((n-1)*step+groupGap)/2;
        for(let i=0;i<n;i++){const x=start+i*step+(i>=p.operand1?groupGap:0);const apple=this.scene.add.image(x,0,'comparison-apple');
            apple.setScale(25/apple.width);this.feedback.add(apple);
            if(p.operator==='-'&&i>=p.answer){apple.setAlpha(.4);this.feedback.add(this.scene.add.graphics().lineStyle(3,0xa64c40).lineBetween(x-10,-13,x+10,13));}
            if(p.operator==='+'&&i===p.operand1-1)this.feedback.add(this.text(x+(step+groupGap)/2,0,'+',27));
        }
    }
    private drawOperationModel(p:MathProblem){
        const items:Array<{removed:boolean;group:number}>=Array.from({length:p.operand1},()=>({removed:false,group:0}));
        const apply=(op:string,n:number,group:number)=>{if(op==='+')for(let i=0;i<n;i++)items.push({removed:false,group});
            else if(op==='-'){let remaining=n;for(let i=items.length-1;i>=0&&remaining;i--)if(!items[i].removed){items[i].removed=true;remaining--;}}};
        apply(p.operator,p.problemType==='missing_operand'?p.answer:p.operand2,1);
        if(p.operand3!==undefined&&p.operator2)apply(p.operator2,p.operand3,2);
        const step=23;let x=-(items.length-1)*step/2;
        items.forEach((item,i)=>{const dot=this.scene.add.circle(x,27,7,item.group===0?0xa57435:0x487c76,item.removed?.35:1);this.feedback.add(dot);
            if(item.removed)this.feedback.add(this.scene.add.graphics().lineStyle(2.5,0xa64c40).lineBetween(x-7,19,x+7,35));
            if(i&&items[i-1].group!==item.group)this.feedback.add(this.text(x-step/2,45,'+',13));x+=step;});
    }
    private equation(label:string,size:number,y=0){
        const g=this.scene.add.container(0,y),tokens=label.split(/\s+/).filter(Boolean);
        const items=tokens.map(t=>/^[<>=]$/.test(t)?drawComparisonSymbol(this.scene,['<','=','>'].indexOf(t),size*1.12,0x50351f):this.text(0,0,t,size));
        const widths=items.map((item,i)=>/^[<>=]$/.test(tokens[i])?size*1.12:(item as Phaser.GameObjects.Text).width);
        let x=-(widths.reduce((a,b)=>a+b,0)+(items.length-1)*12)/2;
        items.forEach((item,i)=>{item.setPosition(x+widths[i]/2,0);g.add(item);x+=widths[i]+12;});return g;
    }
    playDemo(stage:ComparisonStageId,done:()=>void){
        this.cancel();const examples=createComparisonDemoProblems(stage);let i=0;
        const next=()=>{if(i===examples.length){this.teaching=false;done();return;}
            this.showQuestion(examples[i++],()=>{});this.teaching=true;this.setEnabled(false);this.demo.root.setVisible(false);this.power.setVisible(false);this.total.setVisible(false);this.energyMeter.setVisible(false);
            this.title.setText('Podívej').setVisible(!this.hideWords);this.later(stage==='size_crocodile'?1000:750,()=>this.illustrate(()=>this.later(650,next)));
        };next();
    }
    private illustrate(done:()=>void){
        if(!this.comparison){this.drawExplanation();this.later(900,done);return;}
        const p=this.problem,v=this.comparison,b=this.buttons[p.choices.indexOf(p.answer)];
        const q=this.host('question'),target={x:q.x+v.relation.x,y:q.y+v.relation.y};
        const mouth=comparisonGlyph(this.scene,p.answer,false,96).setPosition(b.root.x,b.root.y);this.transient.add(mouth);this.root.bringToTop(this.transient);
        this.animate({targets:mouth,x:target.x,y:target.y,duration:650,ease:'Sine.easeInOut',onComplete:()=>{
            mouth.destroy();v.reveal(false);
            if(p.answer===1){v.pairEqual();this.later(1000,()=>{v.clearPairing();v.reveal();done();});return;}
            const side=p.answer===0?v.right:v.left;
            const items=side.list.filter((o:any)=>o.type==='Image'||o.type==='Text') as any[];
            const originals=items.map(item=>({item,x:item.x,y:item.y,scale:item.scaleX}));
            originals.forEach(({item},i)=>this.animate({targets:item,x:(v.relation.x-side.x)/side.scaleX,y:(v.relation.y-side.y)/side.scaleY,scale:.05,alpha:0,duration:300,delay:i*140}));
            this.later(items.length*140+500,()=>{originals.forEach(({item,x,y,scale})=>item.setPosition(x,y).setScale(scale).setAlpha(1));v.reveal();done();});
        }});
    }
    showCompletion(replay:()=>void){this.next.root.setVisible(true);this.pendingNext=replay;this.enable(this.next,true);
        this.title.setText('Hotovo!').setVisible(!this.hideWords);this.feedback.removeAll(true);
        const n=this.counts.results.filter(Boolean).length;this.feedback.add(this.text(0,0,`${n} / ${this.counts.total}`,44));
        for(let i=0;i<(n>0?12:0);i++){const star=this.icon('star',9+i%3*3).setPosition(0,-60);this.feedback.add(star);
            this.animate({targets:star,x:Math.cos(i*Math.PI/6)*130,y:Math.sin(i*Math.PI/6)*45,alpha:0,duration:900,delay:i*25});}
    }
    tickTimer(ratio:number){this.timer.clear().fillStyle(0x3f2b1f,.25).fillRoundedRect(-245,-5,490,10,5).fillStyle(ratio>.25?0x568d8c:0xc78245).fillRoundedRect(-245,-5,490*Math.max(0,ratio),10,5);}
    private later(delay:number,callback:()=>void){const gen=this.generation;const t=this.scene.time.delayedCall(delay,()=>{this.timers.delete(t);if(gen===this.generation)callback();});this.timers.add(t);}
    private animate(config:Phaser.Types.Tweens.TweenBuilderConfig){const t=this.scene.tweens.add(config);this.tweens.add(t);t.once('complete',()=>this.tweens.delete(t));}
    setPaused(on:boolean){this.timers.forEach(t=>t.paused=on);this.tweens.forEach(t=>on?t.pause():t.resume());}
    cancel(){this.generation++;this.timers.forEach(t=>t.remove(false));this.timers.clear();this.tweens.forEach(t=>t.stop());this.tweens.clear();this.pendingNext=null;this.transient.removeAll(true);}
    private clearQuestion(){this.question.removeAll(true);this.feedback.removeAll(true);this.buttons.forEach(b=>b.root.destroy(true));this.buttons.length=0;this.hints.forEach(h=>h.destroy());this.hints.length=0;
        this.comparison=null;this.relation=null;this.slot=null;this.power.setVisible(true);this.total.setVisible(true);}
    hide(){this.cancel();this.setEnabled(false);this.root.setVisible(false);}
    destroy(){this.cancel();this.root.destroy(true);}
}

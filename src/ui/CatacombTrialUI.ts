import Phaser from 'phaser';
import type { MathProblem } from '../types';
import { SceneBuilder } from '../systems/SceneBuilder';
import { MedievalActionButton } from './MedievalActionButton';
import { formatMathProblem, getComparisonExpressions } from '../utils/formatMathProblem';
import { ComparisonExpressionView } from './ComparisonExpressionView';
import { ComparisonProblemView, comparisonGlyph } from './ComparisonProblemView';
import { comparisonChoiceWidth } from './ComparisonPresentation';

type Host = {x:number; y:number; width:number; height:number; depth:number};
type Presentation = {title:string; subtitle:string; body:string; bodyFontSize?:number; stats:string; statsFontSize?:number; frame?:number; primary:string; onPrimary:()=>void; secondary?:string; onSecondary?:()=>void};

/** Shared slate, bronze and rune presentation for the complete catacomb trial. */
export class CatacombTrialUI {
    readonly root: Phaser.GameObjects.Container;
    private question: Phaser.GameObjects.Text;
    private comparison: ComparisonExpressionView | ComparisonProblemView | null = null;
    private feedback: Phaser.GameObjects.Text;
    private choices: MedievalActionButton[];
    private problem: MathProblem | null = null;
    private startedAt = 0;
    private answered = false;
    private modal?: Phaser.GameObjects.Container;

    constructor(private scene: Phaser.Scene, private builder: SceneBuilder,
        private onAnswer:(damage:number, results:boolean[], timings:number[])=>void) {
        const h = this.host('catacombQuestionPanel');
        this.root = scene.add.container(0,0).setDepth(h.depth).setVisible(false);
        this.root.add(this.panel(h));
        this.root.add(this.text('catacombQuestionLabel', 'PROLOM KOUZLO', 12, '#b9a17c'));
        this.question = this.text('catacombQuestion', '', 30, '#fff3d4');
        this.feedback = this.text('catacombFeedback', '', 14, '#c0d7df');
        this.root.add([this.question,this.feedback]);
        this.choices = [1,2,3].map((n,index) => {
            const host=this.host(`catacombAnswer${n}`);
            const button=new MedievalActionButton(scene,{...host,label:'',layout:'text',accent:0x70c7cb,labelFontSize:24,
                onClick:()=>this.answer(index)});
            this.root.add(button.root);
            return button;
        });
        this.root.sort('depth');
    }

    private host(id:string):Host {
        const object=this.builder.get<Phaser.GameObjects.Container>(id)!;
        const def=this.builder.getElementDef(id)!;
        return {x:object.x,y:object.y,depth:object.depth,width:def.width!,height:def.height!};
    }

    private text(id:string,value:string,size:number,color:string):Phaser.GameObjects.Text {
        const h=this.host(id);
        return this.scene.add.text(h.x,h.y,value,{resolution:2,fontFamily:'Georgia, serif',fontSize:`${size}px`,
            color,align:'center',wordWrap:{width:h.width},lineSpacing:6}).setOrigin(0.5).setName(id).setDepth(h.depth);
    }

    private panel(h:Host):Phaser.GameObjects.Graphics {
        const g=this.scene.add.graphics().setDepth(h.depth);
        const x=h.x-h.width/2,y=h.y-h.height/2;
        g.fillStyle(0x03070c,0.6);g.fillRoundedRect(x+6,y+10,h.width,h.height,20);
        g.fillStyle(0x111e29,0.98);g.fillRoundedRect(x,y,h.width,h.height,18);
        g.lineStyle(3,0x9a7447,1);g.strokeRoundedRect(x,y,h.width,h.height,18);
        g.lineStyle(1,0xc6a977,0.5);g.strokeRoundedRect(x+8,y+8,h.width-16,h.height-16,12);
        for(const dx of [18,h.width-18]) for(const dy of [18,h.height-18]) {
            g.fillStyle(0x253f4c);g.fillCircle(x+dx,y+dy,5);g.lineStyle(1,0xe4c082);g.strokeCircle(x+dx,y+dy,5);
        }
        return g;
    }

    show(problems:MathProblem[]):void {
        this.problem=problems[0];this.answered=false;this.startedAt=Date.now();
        this.question.setText(formatMathProblem(this.problem, 'question'));this.feedback.setText('');
        this.comparison?.destroy(); this.comparison = null;
        const comparison = Boolean(getComparisonExpressions(this.problem));
        this.question.setVisible(!comparison);
        if (this.problem.comparisonMeta) {
            this.comparison = new ComparisonProblemView(this.scene, this.problem, {
                left: this.host('catacombComparisonLeft'),
                right: this.host('catacombComparisonRight'),
                relation: this.host('catacombComparisonRelation'),
            }, 0xfff3d4);
            this.root.add(this.comparison.root);
        } else if (comparison) {
            this.comparison = new ComparisonExpressionView(this.scene, this.problem, {
                ...this.host('catacombQuestion'), fontSize: 30, color: '#fff3d4',
            });
            this.root.add(this.comparison.root);
        }
        this.choices.forEach((button,i)=>{
            const choice=this.problem!.choices[i];
            (button.root.getData('comparisonGlyph') as Phaser.GameObjects.Image | undefined)?.destroy();
            button.root.setData('comparisonGlyph', null);
            button.setLabel(comparison?'':String(choice),24).setEnabled(true);
            if (comparison) {
                const glyph = comparisonGlyph(this.scene, choice, true, comparisonChoiceWidth(button.root.width, button.root.height * 0.72))
                    .setPosition(button.label.x, button.label.y);
                button.label.parentContainer.add(glyph);
                button.root.setData('comparisonGlyph', glyph);
            }
            button.setPresentationState('enabled');
        });
        this.root.setVisible(true);
    }
    hide():void {this.root.setVisible(false);this.problem=null;}
    private answer(index:number):void {
        if(!this.problem||this.answered)return;
        this.answered=true;
        const correct=this.problem.choices[index]===this.problem.answer;
        if (this.problem.comparisonMeta) this.problem.comparisonMeta.selectedRelation = (['less', 'equal', 'greater'] as const)[this.problem.choices[index]];
        this.choices.forEach(b=>b.setEnabled(false));
        this.choices[index].setPresentationState(correct?'selected':'disabled');
        this.comparison?.reveal();
        this.feedback.setColor(correct?'#a7e0b0':'#ffc0a5').setText(this.comparison ? (correct?'✓':'×') : correct?'Správně':formatMathProblem(this.problem,'answer'));
        this.onAnswer(correct?1:0,[correct],[Date.now()-this.startedAt]);
    }

    showPanel(p:Presentation):Phaser.GameObjects.Container {
        this.modal?.destroy();
        const h=this.host('catacombModal');
        const root=this.scene.add.container(0,0).setDepth(h.depth);
        const backdrop=this.host('catacombBackdrop');
        root.add(this.scene.add.rectangle(backdrop.x,backdrop.y,backdrop.width,backdrop.height,0x03080f,0.82)
            .setDepth(backdrop.depth).setInteractive());
        root.add(this.panel(h));
        root.add(this.text('catacombEyebrow','CECHOVNÍ KATAKOMBY',13,'#b99a69'));
        root.add(this.text('catacombTitle',p.title,30,'#ffe5af'));
        root.add(this.text('catacombSubtitle',p.subtitle,15,'#9dd7dd'));
        const portrait=this.host('catacombPortrait');
        root.add(this.scene.add.circle(portrait.x,portrait.y,portrait.width/2,0x1c3341).setStrokeStyle(2,0x557985).setDepth(portrait.depth));
        const fox=this.scene.add.sprite(portrait.x,portrait.y,'rune-fox-sheet',p.frame??0).setDepth(portrait.depth);
        fox.setScale(Math.min(portrait.width/fox.width,portrait.height/fox.height));
        const animation=p.frame===30?'rune-fox-freed':'rune-fox-idle';
        if(this.scene.anims.exists(animation))fox.play(animation);
        root.add(fox);
        root.add(this.text('catacombBody',p.body,p.bodyFontSize??18,'#e0e7e8'));
        root.add(this.text('catacombStats',p.stats,p.statsFontSize??15,'#e6c58d'));
        const primary=new MedievalActionButton(this.scene,{...this.host('catacombPrimary'),label:p.primary,
            layout:'text',accent:0x73b9be,labelFontSize:19,onClick:p.onPrimary});
        root.add(primary.root);
        if(p.secondary&&p.onSecondary){
            const secondary=new MedievalActionButton(this.scene,{...this.host('catacombSecondary'),label:p.secondary,
                layout:'text',accent:0xab9168,labelFontSize:17,onClick:p.onSecondary});
            root.add(secondary.root);
        }
        root.sort('depth');
        this.modal=root;
        return root;
    }
}

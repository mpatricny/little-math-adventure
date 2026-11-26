import Phaser from 'phaser';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import { resolveDamageAfterDefense } from '../../../src/systems/CombatDamageSystem';
import { drawComparisonSymbol } from '../../../src/ui/ComparisonProblemView';
import { art, text, change, icon, socket, host, Motion, CREAM } from './Art';

export interface ImpactInput { raw:number; defense:number; hp:number; target?:'enemy'|'hero';source?:'fist'|'sword'|'paw' }
export class ImpactView {
  readonly root:Phaser.GameObjects.Container;
  readonly hud:Phaser.GameObjects.Container;
  readonly replay:Phaser.GameObjects.Container;
  private motion:Motion;
  private summary:Phaser.GameObjects.Container;
  private effects:Phaser.GameObjects.Container;
  private hpValue:Phaser.GameObjects.Text;
  private hpBar:Phaser.GameObjects.Graphics;
  private shieldValue:Phaser.GameObjects.Text;
  private heroValue:Phaser.GameObjects.Text;
  private heroBar:Phaser.GameObjects.Graphics;
  private shield:Phaser.GameObjects.Container;
  private values:Phaser.GameObjects.Text[]=[];
  private finished:(()=>void)|null=null;
  state={phase:'idle',raw:0,defense:3,blocked:0,damage:0,hpBefore:20,hpAfter:20,hpLost:0,target:'enemy'};
  constructor(private scene:Phaser.Scene,private builder:SceneBuilder){
    this.motion=new Motion(scene);const root=host(builder,'impact');this.root=scene.add.container(root.x,root.y).setDepth(root.depth).setVisible(false);
    this.summary=scene.add.container(0,0);this.effects=scene.add.container(0,0);this.root.add([this.summary,this.effects]);
    const hh=host(builder,'hud');this.hud=scene.add.container(hh.x,hh.y).setDepth(hh.depth);
    const enemy=this.health('enemyHealth');this.hpValue=enemy.value;this.hpBar=enemy.bar;
    const hero=this.health('heroHealth');this.heroValue=hero.value;this.heroBar=hero.bar;
    const sh=host(builder,'enemyShield'),shield=scene.add.container(sh.x,sh.y).setDepth(sh.depth);this.shield=shield;
    shield.add([socket(scene,sh.width-3),icon(scene,'shield',41).setX(-1)]);
    this.shieldValue=text(scene,0,3,'3',38,CREAM).setShadow(0,2,'#143841',3,true,true);shield.add(this.shieldValue);this.hud.add(shield);
    const rh=host(builder,'impactReplay');this.replay=scene.add.container(rh.x,rh.y).setSize(rh.width,rh.height).setDepth(rh.depth);
    const surface=scene.add.container(0,0,[socket(scene,84),icon(scene,'replay',36)]);this.replay.add(surface).setInteractive({useHandCursor:true}).setVisible(false);
    let down=false;this.replay.on('pointerover',()=>surface.setY(-3));this.replay.on('pointerout',()=>{down=false;surface.setY(0);});
    this.replay.on('pointerdown',()=>{down=true;surface.setY(2);});this.replay.on('pointerup',()=>{surface.setY(0);if(down){down=false;this.finished?.();}});this.root.add(this.replay);
    this.resetHud();
  }
  private health(id:string){
    const h=host(this.builder,id),c=this.scene.add.container(h.x,h.y).setDepth(h.depth);c.add(art(this.scene,'plaque',h.width,h.height));
    c.add(icon(this.scene,'heart',28,0xe85f54).setX(-h.width*.30));
    const value=text(this.scene,24,-5,'20',35,CREAM),bar=this.scene.add.graphics();c.add([value,bar]);this.hud.add(c);return {value,bar};
  }
  private drawHp(bar:Phaser.GameObjects.Graphics,hp:number,max:number){bar.clear().fillStyle(0x592f25).fillRoundedRect(-48,20,113,7,3);
    if(hp>0)bar.fillStyle(hp/max>.25?0xd95848:0xeea65a).fillRoundedRect(-48,20,113*Math.min(1,hp/max),7,3);}
  resetHud(){change(this.hpValue,'20');change(this.heroValue,'20');change(this.shieldValue,'3');
    [this.hpValue,this.heroValue,this.shieldValue].forEach(t=>t.setShadow(0,0,'#000',0,false,false));
    this.drawHp(this.hpBar,20,20);this.drawHp(this.heroBar,20,20);this.shield.setVisible(true);}
  private cell(id:string,value:number,kind:string,color:number){
    const h=host(this.builder,id),c=this.scene.add.container(h.x,h.y).setDepth(h.depth);
    c.add(icon(this.scene,kind,kind==='sword'?43:42,color).setY(-45));const t=text(this.scene,0,25,String(value),74,CREAM);c.add(t);this.summary.add(c);return t;
  }
  show(input:ImpactInput,finished:()=>void){
    this.cancel();this.finished=finished;this.root.setVisible(true);this.replay.setVisible(false);this.summary.removeAll(true);
    const result=resolveDamageAfterDefense(input.raw,input.defense),lost=Math.min(input.hp,result.damage),target=input.target??'enemy';
    this.state={phase:'charge',raw:result.rawDamage,defense:result.defense,blocked:result.blockedDamage,damage:result.damage,hpBefore:input.hp,hpAfter:Math.max(0,input.hp-lost),hpLost:lost,target};
    this.resetHud();const victim=target==='hero'?this.heroValue:this.hpValue,victimBar=target==='hero'?this.heroBar:this.hpBar;
    change(victim,String(input.hp));this.drawHp(victimBar,input.hp,input.hp);change(this.shieldValue,String(input.defense));this.shield.setVisible(target==='enemy');
    const card=host(this.builder,'impactCard');this.summary.add(art(this.scene,'plaque',card.width,card.height,card.x,card.y).setDepth(card.depth));
    this.values=[this.cell('rawDamage',result.rawDamage,input.source??'fist',0xffdd7e),this.cell('blockedDamage',result.blockedDamage,'shield',0xa9def6),this.cell('finalDamage',result.damage,'heart',0xed7e65)];
    const minus=host(this.builder,'minus'),equals=host(this.builder,'equals');
    this.summary.add(text(this.scene,minus.x,minus.y,'−',56,'#c8b99d'));
    this.summary.add(drawComparisonSymbol(this.scene,1,86,0xc8b99d).setPosition(equals.x,equals.y));
    this.values[1].setAlpha(.35);this.values[2].setAlpha(.35);this.glow(this.values[0],'#ffd47a');
    const origin=host(this.builder,target==='hero'?'enemyLaunch':'heroLaunch'),barrier=host(this.builder,target==='hero'?'heroBarrier':'enemyBarrier');
    const packet=this.scene.add.container(origin.x,origin.y);packet.add(art(this.scene,'plaque',226,70));packet.add(icon(this.scene,input.source??'fist',30).setX(-63));
    const packetValue=text(this.scene,21,0,String(result.rawDamage),43,CREAM);packet.add(packetValue);this.effects.add(packet);packet.setAlpha(0);
    this.motion.tween({targets:packet,alpha:1,duration:300});
    this.motion.later(700,()=>{this.state.phase='travel';this.motion.tween({targets:packet,x:barrier.x,y:barrier.y,duration:820,ease:'Cubic.easeInOut'});});
    this.motion.later(1570,()=>{
      this.state.phase='block';this.values[1].setAlpha(1);this.glow(this.values[1],'#9ce4ff');this.glow(this.shieldValue,'#92dbff');
      const shield=icon(this.scene,'shield',100).setPosition(barrier.x,barrier.y);this.effects.add(shield);shield.setAlpha(0);
      this.motion.tween({targets:shield,alpha:1,duration:200});
      const reduction=text(this.scene,barrier.x,barrier.y-113,`−${result.blockedDamage}`,49,'#b7edff').setShadow(0,2,'#164d65',5,true,true);this.effects.add(reduction);
      this.motion.tween({targets:reduction,y:barrier.y-151,alpha:{from:1,to:0},duration:1100,delay:550});
      this.motion.tween({targets:packet,alpha:.15,duration:170});
      this.motion.later(780,()=>{change(packetValue,String(result.damage));this.values[2].setAlpha(1);this.glow(this.values[2],result.damage?'#ffb99c':'#b7edff');
        this.motion.tween({targets:shield,alpha:0,duration:280,onComplete:()=>shield.destroy()});this.motion.tween({targets:packet,alpha:1,duration:220});});
    });
    this.motion.later(2570,()=>{
      this.state.phase='hit';const victimHost=host(this.builder,target==='hero'?'heroHit':'enemyHit');
      if(result.damage>0)this.motion.tween({targets:packet,x:victimHost.x,y:victimHost.y,alpha:0,duration:540,ease:'Cubic.easeIn',onComplete:()=>packet.destroy()});
      else this.motion.tween({targets:packet,alpha:0,duration:300,onComplete:()=>packet.destroy()});
      this.motion.later(500,()=>{
        if(lost>0){const loss=text(this.scene,victimHost.x,victimHost.y-34,`−${lost}`,63,'#fff0c4').setShadow(0,2,'#8d3025',7,true,true);this.effects.add(loss);
          this.motion.tween({targets:loss,y:victimHost.y-117,alpha:{from:1,to:0},duration:1100,delay:400});}
        else{const shield=icon(this.scene,'shield',54).setPosition(victimHost.x,victimHost.y-35);shield.add(icon(this.scene,'check',30));this.effects.add(shield);this.motion.tween({targets:shield,alpha:0,duration:600,delay:900});}
        this.glow(victim,lost>0?'#ff8a70':'#a9e4f6');
        const counter={value:input.hp};this.motion.tween({targets:counter,value:this.state.hpAfter,duration:700,ease:'Cubic.easeOut',onUpdate:()=>{change(victim,String(Math.round(counter.value)));this.drawHp(victimBar,counter.value,input.hp);}});
      });
    });
    this.motion.later(4500,()=>{this.state.phase='done';this.replay.setVisible(true);});
  }
  private glow(t:Phaser.GameObjects.Text,color:string){t.setShadow(0,0,color,17,true,true);this.motion.later(720,()=>t.setShadow(0,0,'#000',0,false,false));}
  pause(on:boolean){this.motion.pause(on);}
  cancel(){this.motion.cancel();this.effects.removeAll(true);this.values.forEach(t=>{if(t.active)t.setShadow(0,0,'#000',0,false,false);});this.state.phase='idle';}
  hide(){this.cancel();this.root.setVisible(false);this.resetHud();}
}

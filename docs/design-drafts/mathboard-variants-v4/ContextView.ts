import Phaser from 'phaser';
import { SceneBuilder } from '../../../src/systems/SceneBuilder';
import preparation from '../../../src/data/preparation.json';
import { art, host, icon, socket, Motion } from './Art';
import type { Mode } from './catalog';

/** Context is presentation only. No equipment, exam or pet reward is granted here. */
export class ContextView {
  readonly root:Phaser.GameObjects.Container;
  private background:Phaser.GameObjects.Image;
  private tokens:Phaser.GameObjects.Container;
  private motion:Motion;
  private mode:Mode='attack';
  private count=3;
  private last=-1;
  constructor(private scene:Phaser.Scene,private builder:SceneBuilder){
    const bg=host(builder,'backdrop');
    this.background=art(scene,'arena',bg.width,bg.height,bg.x,bg.y).setDepth(bg.depth);
    const h=host(builder,'context');this.root=scene.add.container(h.x,h.y).setDepth(h.depth);
    this.tokens=scene.add.container(0,0);this.motion=new Motion(scene);
  }
  configure(mode:Mode,count:number){
    this.motion.cancel();this.mode=mode;this.count=count;this.last=-1;this.root.removeAll(true);
    const isPrep=mode.startsWith('prep'),special=isPrep||mode==='exam'||mode==='catacomb';
    const key=isPrep?'shop-room':mode==='exam'?'guild-room':mode==='catacomb'?'catacomb-room':'arena';
    const bg=host(this.builder,'backdrop');this.background.setTexture(key).setScale(Math.max(1326/this.background.width,941/this.background.height));
    this.background.setPosition(bg.x,bg.y);this.root.setVisible(special);if(!special)return;
    const panel=host(this.builder,'contextPanel'),item=host(this.builder,'contextItem'),owner=host(this.builder,'contextOwner');
    this.root.add(art(this.scene,'plaque',panel.width,panel.height,panel.x,panel.y));
    this.root.add([socket(this.scene,owner.width).setPosition(owner.x,owner.y),art(this.scene,'girl',owner.width-12,owner.height-12,owner.x,owner.y)]);
    if(isPrep)this.root.add(icon(this.scene,mode==='prep-sword'?'sword':'shield',130).setPosition(item.x,item.y));
    else if(mode==='catacomb'){
      const fox=this.scene.add.image(item.x,item.y,'fox',0);fox.setScale(Math.min(item.width/fox.width,item.height/fox.height));this.root.add(fox);
    }else{
      const seal=this.scene.add.container(item.x,item.y,[this.scene.add.circle(0,0,56,0x791f22).setStrokeStyle(5,0xe2ac53),icon(this.scene,'star',59)]);
      this.root.add(seal);
    }
    const h=host(this.builder,'contextTokens');this.tokens=this.scene.add.container(h.x,h.y);this.root.add(this.tokens);this.progress(0);
  }
  progress(correct:number){
    if(!this.root.visible||correct===this.last)return;
    const previous=this.last;this.last=correct;this.tokens.removeAll(true);
    const prep=this.mode.startsWith('prep'),n=prep?preparation.maxCharges:this.count,filled=Math.min(n,correct),gap=n>3?49:70;
    for(let i=0;i<n;i++){
      const x=(i-(n-1)/2)*gap,c=this.scene.add.container(x,0,[socket(this.scene,n>3?42:55)]);
      c.add(icon(this.scene,prep||this.mode==='catacomb'?'rune':'check',n>3?25:34,i<filled?0x9fe9ed:0x796643));this.tokens.add(c);
      if(i===filled-1&&correct>previous&&previous>=0){c.setAlpha(.2);this.motion.tween({targets:c,alpha:1,duration:420});}
    }
    if(filled===n){const h=host(this.builder,'contextDone');this.root.add(icon(this.scene,'check',48,0xabe18d).setPosition(h.x,h.y));}
  }
  get state(){return {theme:this.mode,visible:this.root.visible,earned:this.last,background:this.background.texture.key};}
}

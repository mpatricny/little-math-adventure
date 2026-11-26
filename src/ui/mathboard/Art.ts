import Phaser from 'phaser';
import { SceneBuilder } from '../../systems/SceneBuilder';
import type { ComparisonHost } from '../ComparisonProblemView';

export const INK = '#603a1c', CREAM = '#fff0bc', GREEN = 0x4e873b, RED = 0xac5039;

export function host(builder: SceneBuilder, id: string, origin = {x: 0, y: 0}): ComparisonHost {
  const object = builder.get<Phaser.GameObjects.Container>(id), def = builder.getElementDef(id);
  if (!object || !def?.width || !def.height) throw new Error('Missing layout host: ' + id);
  return {x: object.x-origin.x, y: object.y-origin.y, width: def.width, height: def.height, depth: object.depth};
}

export function centerInk(t: Phaser.GameObjects.Text) {
  const c = t.canvas, pixels = t.context.getImageData(0, 0, c.width, c.height).data;
  let left = c.width, right = 0, top = c.height, bottom = 0;
  for (let y=0; y<c.height; y++) for (let x=0; x<c.width; x++) if (pixels[(y*c.width+x)*4+3]>32) {
    left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
  }
  t.setOrigin(left<=right ? (left+right+1)/(2*c.width) : .5, top<=bottom ? (top+bottom+1)/(2*c.height) : .5);
  return t;
}
export function text(scene: Phaser.Scene, x: number, y: number, value: string, size=64, color=INK) {
  return centerInk(scene.add.text(x,y,value,{fontFamily:'Gelasio, Georgia, serif',fontSize:size,fontStyle:'bold',color,resolution:2}));
}
export function change(t: Phaser.GameObjects.Text, value: string) { t.setText(value); centerInk(t); }
export function art(scene: Phaser.Scene, key: string, w: number, h: number, x=0, y=0) {
  const image = scene.add.image(x,y,TEXTURES[key] ?? key);
  return image.setScale(Math.min(w/image.width,h/image.height));
}
export function icon(scene: Phaser.Scene, kind: string, size=48, color=0xffe8a0) {
  const c=scene.add.container(0,0);
  if(kind==='fist') { c.add(art(scene,'fist-normal',size*1.8,size*1.8)); return c; }
  if(kind==='sword'||kind==='shield') { c.add(art(scene,kind,size*1.5,size*1.5)); return c; }
  const g=scene.add.graphics().lineStyle(3.4,color).fillStyle(color), s=size/36;
  if(kind==='paw') { g.fillEllipse(0,7,23,18); [-12,-4,5,13].forEach((x,i)=>g.fillEllipse(x,[-6,-13,-13,-6][i],8,10)); }
  if(kind==='star') g.fillPoints(Array.from({length:10},(_,i)=>new Phaser.Geom.Point(Math.sin(i*Math.PI/5)*(i%2?8:18),-Math.cos(i*Math.PI/5)*(i%2?8:18))),true);
  if(kind==='bolt') {
    const p=[{x:4,y:-19},{x:-12,y:3},{x:0,y:3},{x:-4,y:19},{x:14,y:-5},{x:2,y:-5}];
    g.fillPoints(p,true).lineStyle(1,0xfff4bc).strokePoints(p,true);
  }
  if(kind==='check') g.strokePoints([{x:-11,y:0},{x:-3,y:8},{x:12,y:-10}]);
  if(kind==='cross') { g.lineBetween(-9,-9,9,9); g.lineBetween(-9,9,9,-9); }
  if(kind==='next') { g.lineBetween(-13,0,13,0); g.strokePoints([{x:3,y:-11},{x:15,y:0},{x:3,y:11}]); }
  if(kind==='play') g.fillTriangle(-8,-12,-8,12,13,0);
  if(kind==='replay') { g.beginPath().arc(0,0,12,.1,Math.PI*1.75,false).strokePath(); g.strokePoints([{x:10,y:-17},{x:10,y:-5},{x:-2,y:-5}]); }
  if(kind==='heart') {
    g.fillStyle(0x6c1c20).fillCircle(-7,-6,10).fillCircle(7,-6,10).fillTriangle(-16,-2,16,-2,0,19);
    g.fillStyle(color).fillCircle(-6,-7,8).fillCircle(6,-7,8).fillTriangle(-14,-4,14,-4,0,16);
    g.fillStyle(0xffc5a3,.75).fillEllipse(-7,-10,7,3);
  }
  if(kind==='rune') g.lineStyle(2.5,color).strokePoints([{x:0,y:-17},{x:12,y:0},{x:0,y:17},{x:-12,y:0}],true).lineBetween(0,-10,0,10);
  c.add(g.setScale(s)); return c;
}
export function socket(scene: Phaser.Scene, size: number) {
  const c=scene.add.container(0,0),r=size/2;
  c.add(scene.add.circle(0,3,r,0x49230d,.5));
  c.add(scene.add.circle(0,0,r,0x633b1e).setStrokeStyle(2,0x61320f));
  c.add(scene.add.circle(0,0,r-4,0x352b26).setStrokeStyle(3,0xe2ad50));
  c.add(scene.add.circle(0,-1,r-7,0x49362b).setStrokeStyle(1,0xffdf8a)); return c;
}

/** Animation ownership keeps restarts and hidden tabs from advancing old examples. */
export class Motion {
  private timers=new Set<Phaser.Time.TimerEvent>();
  private tweens=new Set<Phaser.Tweens.Tween>();
  private generation=0;
  private paused=false;
  readonly reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private scene: Phaser.Scene) {}
  later(ms: number, fn:()=>void) {
    const generation=this.generation;
    const timer=this.scene.time.delayedCall(ms,()=>{this.timers.delete(timer);if(generation===this.generation)fn();});
    timer.paused=this.paused;this.timers.add(timer); return timer;
  }
  tween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    const tween=this.scene.tweens.add({...config,duration:this.reduced?Math.min(60,Number(config.duration??0)):config.duration});
    if(this.paused)tween.pause();
    this.tweens.add(tween); tween.once('complete',()=>this.tweens.delete(tween)); return tween;
  }
  pause(on:boolean) { this.paused=on;this.timers.forEach(t=>t.paused=on);this.tweens.forEach(t=>on?t.pause():t.resume()); }
  cancel() { this.generation++;this.timers.forEach(t=>t.remove(false));this.timers.clear();this.tweens.forEach(t=>t.stop());this.tweens.clear(); }
}

// Literal keys allow the scene asset manifest to preload every required layer.
export const TEXTURES: Record<string, string> = {
  parchment: 'mathboard-parchment-v4', wood: 'mathboard-answer-v4', plaque: 'mathboard-plaque-v4',
  'shop-frame': 'mathboard-shop-v4', 'catacomb-frame': 'mathboard-catacomb-v4', 'exam-frame': 'mathboard-exam-v4',
  'fist-normal': 'mathboard-fist-normal-v4', 'fist-active': 'mathboard-fist-active-v4',
  sword: 'prep-sword-normal-v2', shield: 'prep-shield-normal-v2',
  girl: 'town-hud-heroine-portrait', boy: 'town-hud-hero-portrait',
};

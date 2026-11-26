type Owner='A'|'B';
export type Box={x:number;y:number;width:number;height:number;depth:number};
type Rig={body:Box;health:Box;shield:Box;compact:boolean};
type Point={x:number;y:number};
type Job={kind:string;owner?:Owner;target?:number;elapsed:number;duration:number;draw:(ctx:CanvasRenderingContext2D,p:number)=>void;done:()=>void};
type Shield={canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;power:number;max:number;rig?:Rig;pulse?:{kind:'apply'|'hit';progress:number;before:number;after:number}};

/** Local light only. Character images, frames and math layout remain untouched. */
export class BattleEffects {
 private canvas=document.createElement('canvas');
 private ctx:CanvasRenderingContext2D;
 private jobs:Job[]=[];
 private shields={} as Record<Owner,Shield>;
 private previous=0;
 private hadEffects=false;
 constructor(private stage:HTMLElement,private reduce:()=>boolean,private rig:(owner:Owner)=>Rig){
  this.canvas.className='fox-vfx-canvas';this.canvas.width=2560;this.canvas.height=1440;this.canvas.setAttribute('aria-hidden','true');
  this.ctx=this.canvas.getContext('2d')!;stage.append(this.canvas);
  for(const owner of ['A','B'] as Owner[]){
   const canvas=document.createElement('canvas');canvas.className='fox-air-shield';canvas.dataset.shieldOwner=owner;canvas.setAttribute('aria-hidden','true');stage.append(canvas);
   this.shields[owner]={canvas,ctx:canvas.getContext('2d')!,power:0,max:5};
  }
  requestAnimationFrame(this.tick);
 }
 sync(powers:Record<Owner,number>,max:number){
  for(const owner of ['A','B'] as Owner[]){
   const s=this.shields[owner],r=this.rig(owner),b=r.shield;s.power=powers[owner];s.max=max;s.rig=r;
   s.canvas.style.cssText=`left:${(b.x-b.width/2)/12.8}%;top:${(b.y-b.height/2)/7.2}%;width:${b.width/12.8}%;height:${b.height/7.2}%;z-index:${b.depth}`;
   const w=Math.round(b.width*2),h=Math.round(b.height*2);if(s.canvas.width!==w||s.canvas.height!==h){s.canvas.width=w;s.canvas.height=h;}
   this.drawShield(s);
  }
 }
 reset(){const jobs=this.jobs.splice(0);for(const job of jobs)job.done();for(const s of Object.values(this.shields)){s.pulse=undefined;s.power=0;this.drawShield(s);}this.ctx.clearRect(0,0,2560,1440);this.hadEffects=false;}
 snapshot(){return {jobs:this.jobs.map(j=>({kind:j.kind,owner:j.owner,target:j.target,progress:j.elapsed/j.duration})),shields:Object.fromEntries(Object.entries(this.shields).map(([o,s])=>[o,{power:s.power,compact:s.rig?.compact,pulse:s.pulse?.kind}]))};}
 private run(kind:string,duration:number,draw:Job['draw'],meta:{owner?:Owner;target?:number}={}){
  return new Promise<void>(done=>this.jobs.push({kind,duration,draw,...meta,elapsed:0,done}));
 }
 private tick=(now:number)=>{
  const dt=this.previous?Math.min(50,now-this.previous):0;this.previous=now;
  if(!document.hidden){
   if(this.jobs.length||this.hadEffects){this.ctx.clearRect(0,0,2560,1440);this.ctx.setTransform(2,0,0,2,0,0);this.hadEffects=this.jobs.length>0;
    for(const j of [...this.jobs]){if(!this.jobs.includes(j))continue;j.elapsed+=dt;this.ctx.save();j.draw(this.ctx,Math.min(1,j.elapsed/j.duration));this.ctx.restore();if(j.elapsed>=j.duration){this.jobs=this.jobs.filter(x=>x!==j);j.done();}}
    this.ctx.resetTransform();
   }
   for(const s of Object.values(this.shields))if(s.pulse)this.drawShield(s);
  }
  requestAnimationFrame(this.tick);
 };
 private glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){
  ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.35,color+'99');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 private text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,color:string,size:number){
  ctx.font=`bold ${size}px Georgia`;ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#123b39';ctx.strokeText(value,x,y);ctx.fillStyle=color;ctx.fillText(value,x,y);
 }
 private numberPoint(r:Rig){return r.compact?{x:r.body.x,y:r.body.y-r.body.height*.4}:{x:r.health.x,y:r.health.y-22};}
 hurt(owner:Owner,damage:number){
  const r=this.rig(owner),n=this.numberPoint(r),calm=this.reduce();return this.run('hp-loss',calm?350:800,(ctx,p)=>{
   ctx.globalAlpha=Math.min(1,p*7,(1-p)*4);this.text(ctx,'−'+damage,n.x,n.y-(calm?0:p*8),'#ffd9b8',r.compact?27:31);
  },{owner});
 }
 heal(owner:Owner,gain:number){
  const r=this.rig(owner),b=r.body,n=this.numberPoint(r),compact=r.compact,calm=this.reduce();
  return this.run('heal',calm?460:1150,(ctx,p)=>{
   const envelope=Math.sin(Math.PI*p),radius=b.width*(compact?.48:.38),cy=b.y+b.height*.36;
   this.glow(ctx,b.x,b.y,Math.max(radius,30),'#8ff4dc',envelope*.24);
   ctx.save();ctx.globalAlpha=envelope*.8;ctx.strokeStyle='#afffe9';ctx.lineWidth=compact?2:3;ctx.shadowColor='#67dfd1';ctx.shadowBlur=8;
   ctx.beginPath();ctx.ellipse(b.x,cy,radius,radius*.24,0,0,Math.PI*2);ctx.stroke();ctx.restore();
   if(!calm)for(let i=0;i<(compact?8:16);i++){
    const q=(p*1.15+i*.073)%1,angle=i*2.399+p*.8,x=b.x+Math.cos(angle)*radius*(.45+(i%3)*.22),y=b.y+b.height*.37-q*b.height*.87;
    const alpha=Math.sin(Math.PI*q)*envelope,color=i%3?'#a4ffdf':'#ffe4a3',size=(compact?3:4)+(i%3)*1.1;
    this.glow(ctx,x,y,size*3,color,alpha*.65);ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.translate(x,y);
    ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.28,-size*.28);ctx.lineTo(size,0);ctx.lineTo(size*.28,size*.28);ctx.lineTo(0,size);ctx.lineTo(-size*.28,size*.28);ctx.lineTo(-size,0);ctx.lineTo(-size*.28,-size*.28);ctx.closePath();ctx.fill();ctx.restore();
   }
   ctx.globalAlpha=Math.min(1,p*7,(1-p)*5);this.text(ctx,'+'+gain,n.x,n.y-(calm?0:p*10),'#d4ffbb',compact?27:31);
  },{owner});
 }
 shieldApply(owner:Owner,power:number){
  const s=this.shields[owner],calm=this.reduce();const pulse={kind:'apply' as const,progress:0,before:0,after:power};s.pulse=pulse;
  return this.run('shield-apply',calm?300:850,(_ctx,p)=>pulse.progress=p,{owner}).then(()=>{if(s.pulse===pulse)s.pulse=undefined;this.drawShield(s);});
 }
 shieldPoint(owner:Owner){const b=this.rig(owner).shield;return {x:b.x+b.width*.18,y:b.y};}
 projectile(from:Point,to:Point,kind:'strike'|'incoming',meta:{owner:Owner;target?:number}){
  const calm=this.reduce(),duration=calm?160:kind==='strike'?290:390;
  return this.run(kind+'-flight',duration,(ctx,p)=>{
   const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,head=calm?1:p,tail=calm?.84:Math.max(0,p-.28),color=kind==='strike'?'#83f5ff':'#ffd693';
   const points:Point[]=[];for(let i=0;i<=8;i++){const t=tail+(head-tail)*i/8,jag=calm?0:Math.sin(i*2.8)*Math.sin(Math.PI*i/8)*5;points.push({x:from.x+dx*t+nx*jag,y:from.y+dy*t+ny*jag});}
   ctx.globalAlpha=calm?.65:Math.min(1,p*8);ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor=color;ctx.shadowBlur=calm?0:12;
   for(const [width,stroke]of [[7,color+'66'],[2.5,'#fff4cf']] as const){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.beginPath();points.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.stroke();}
   this.glow(ctx,from.x+dx*head,from.y+dy*head,calm?7:13,color,.7);
  },meta);
 }
 strikeImpact(owner:Owner,target:number,at:Point,damage:number,health:Box){
  const calm=this.reduce();return this.run('strike-impact',calm?380:800,(ctx,p)=>{
   const alpha=Math.sin(Math.PI*p),radius=15+p*49;
   this.glow(ctx,at.x,at.y,calm?33:55,'#b2f8ff',alpha*.38);
   ctx.save();ctx.globalAlpha=alpha*.85;ctx.strokeStyle='#acfcff';ctx.lineWidth=3;ctx.shadowColor='#6bd6ef';ctx.shadowBlur=7;
   ctx.beginPath();ctx.arc(at.x,at.y,calm?26:radius,0,Math.PI*2);ctx.stroke();
   if(!calm)for(let i=0;i<8;i++){const a=i*Math.PI/4+.2;ctx.beginPath();ctx.moveTo(at.x+Math.cos(a)*radius*.65,at.y+Math.sin(a)*radius*.65);ctx.lineTo(at.x+Math.cos(a)*(radius+11),at.y+Math.sin(a)*(radius+11));ctx.stroke();}ctx.restore();
   ctx.globalAlpha=Math.min(1,p*8,(1-p)*4);this.text(ctx,'−'+damage,health.x,health.y+49-(calm?0:p*12),'#ffe4a7',32);
  },{owner,target});
 }
 block(owner:Owner,before:number,after:number,absorbed:number){
  const s=this.shields[owner],r=this.rig(owner),b=r.shield,calm=this.reduce(),pulse={kind:'hit' as const,progress:0,before,after};s.pulse=pulse;
  return this.run('shield-block',calm?380:950,(ctx,p)=>{
   pulse.progress=p;ctx.globalAlpha=Math.min(1,p*7,(1-p)*4);
   this.text(ctx,'−'+absorbed,b.x+b.width*.25,b.y-(r.compact?22:65),'#bdf6ff',r.compact?24:28);
  },{owner}).then(()=>{if(s.pulse===pulse)s.pulse=undefined;this.drawShield(s);});
 }
 private drawShield(s:Shield){
  const {ctx,canvas:c,pulse,rig:r}=s;if(!r)return;
  ctx.resetTransform();ctx.clearRect(0,0,c.width,c.height);c.hidden=s.power<=0&&!pulse;if(c.hidden)return;
  ctx.setTransform(c.width/100,0,0,c.height/190,0,0);
  const p=pulse?.progress??1,hit=pulse?.kind==='hit',calm=this.reduce(),strength=Math.max(s.power,hit?(pulse!.before*(1-p)+pulse!.after*p):0)/Math.max(1,s.max);
  let alpha=.4+strength*.5;if(pulse?.kind==='apply')alpha*=Math.min(1,p*4);if(hit&&s.power===0)alpha*=1-p;
  ctx.globalAlpha=alpha;
  const wave=hit&&!calm?Math.sin(p*Math.PI*4)*Math.sin(Math.PI*p)*7:0;
  const path=new Path2D();path.moveTo(18,15);path.bezierCurveTo(79+wave,30,91+wave,143,18,175);path.quadraticCurveTo(42+wave*.2,95,18,15);
  const fill=ctx.createLinearGradient(18,0,83,0);fill.addColorStop(0,'#72e9ff08');fill.addColorStop(.72,'#4abfe93b');fill.addColorStop(1,'#c3faff7a');ctx.fillStyle=fill;ctx.fill(path);
  ctx.strokeStyle='#adf3ff';ctx.lineWidth=r.compact?2.8:2;ctx.shadowColor='#66d7ed';ctx.shadowBlur=6;ctx.stroke(path);ctx.shadowBlur=0;
  ctx.beginPath();ctx.moveTo(27,35);ctx.bezierCurveTo(64,59,66,128,27,155);ctx.strokeStyle='#d6fcff77';ctx.lineWidth=1;ctx.stroke();
  if(pulse){ctx.save();ctx.clip(path);ctx.globalAlpha=Math.sin(Math.PI*p)*.8;ctx.strokeStyle='#e5ffff';ctx.lineWidth=2;
   for(let i=0;i<(calm?1:3);i++){const radius=calm?24:Math.max(0,(p-i*.15)*130);ctx.beginPath();ctx.ellipse(67,91,radius*.6,radius,0,0,Math.PI*2);ctx.stroke();}ctx.restore();}
  const shown=hit?Math.ceil(pulse!.before+(pulse!.after-pulse!.before)*Math.min(1,p*2)):s.power;
  for(let i=0;i<s.max;i++){ctx.beginPath();ctx.arc(r.compact?66:22+i*10,r.compact?60+i*17:175,3.1,0,Math.PI*2);ctx.fillStyle=i<shown?'#cbffff':'#23566b';ctx.fill();}
  ctx.resetTransform();
 }
}

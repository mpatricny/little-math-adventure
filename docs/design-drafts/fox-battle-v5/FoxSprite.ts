type Motion = 'idle' | 'attack' | 'cast';
type Clip = { sheet:string; columns:number; playback:number[]; fps:number; loop:boolean; direction:string };
type Manifest = { frameWidth:number; frameHeight:number; forms:Record<string,{motions:Record<Motion,Clip>}> };
const inFlight=new Map<string,Promise<HTMLImageElement>>();
function loadImage(src:string){
 if(!inFlight.has(src)){
  const promise=(async()=>{
   const img=new Image();img.src=src;
   try{await img.decode();}catch{img.src=src+'?retry='+Date.now();await img.decode();}
   return img;
  })();
  inFlight.set(src,promise);
  void promise.then(()=>inFlight.delete(src),()=>inFlight.delete(src));
 }
 return inFlight.get(src)!;
}

/** Plays only approved, forward video frames. Other fox forms remain stills. */
export class FoxSprite {
 private form=-1;
 private motion:Motion='idle';
 private elapsed=0;
 private previous=0;
 private frame=0;
 private done:(()=>void)|null=null;
 private context:CanvasRenderingContext2D;
 private still:HTMLImageElement|null=null;
 private stills:string[]=[];
 private base='';
 private generation=0;
 private clips:Record<Motion,Clip>|null=null;
 private sheets=new Map<Motion,HTMLImageElement>();

 constructor(private canvas:HTMLCanvasElement,private manifest:Manifest,private reduce:()=>boolean,private approvedForms:readonly string[]=[]){
  canvas.width=manifest.frameWidth;canvas.height=manifest.frameHeight;
  this.context=canvas.getContext('2d')!;
 }
 async load(stills:string[],base:string){
  this.stills=stills;this.base=base;requestAnimationFrame(this.tick);await this.setForm(0);
 }
 async setForm(form:number){
  if(this.form===form)return;
  const token=++this.generation;this.form=form;this.clips=null;this.sheets.clear();this.still=null;this.reset();
  try{
   const still=await loadImage(this.stills[form]);if(token!==this.generation)return;
   this.still=still;this.draw();
   const formId=String(form+1).padStart(2,'0');
   // The author approved only forms 01 and 04; 02/03/05 await revised motion.
   // Asset existence is not approval.
   if(!this.approvedForms.includes(formId))return;
   const clips=this.manifest.forms[formId]?.motions;if(!clips)return;
   const entries=await Promise.all((['idle','attack','cast'] as Motion[]).map(async motion=>{
    const clip=clips[motion];
    if(clip.direction!=='forward'||clip.playback.some((frame,i,all)=>i>0&&frame<all[i-1]))throw Error('Fox clips must play forward');
    return [motion,await loadImage(this.base+clip.sheet)] as const;
   }));
   if(token!==this.generation)return;
   this.clips=clips;this.sheets=new Map(entries);this.reset();
  }catch(error){if(token===this.generation)console.warn('Fox animation unavailable; keeping the approved still.',error);}
 }
 reset(){this.done?.();this.done=null;this.motion='idle';this.elapsed=0;this.frame=0;this.draw();}
 play(motion:'attack'|'cast'){
  this.done?.();this.done=null;
  if(!this.clips||this.reduce()){this.reset();return Promise.resolve();}
  this.motion=motion;this.elapsed=0;this.frame=0;this.draw();
  return new Promise<void>(resolve=>this.done=resolve);
 }
 snapshot(){return {form:this.form,motion:this.motion,frame:this.frame,animated:!!this.clips,direction:'forward'};}
 private tick=(now:number)=>{
  const dt=this.previous?Math.min(50,now-this.previous):0;this.previous=now;
  if(!document.hidden&&this.clips){
   if(this.reduce()){if(this.motion!=='idle')this.reset();this.frame=0;this.draw();}
   else {
    const clip=this.clips[this.motion];this.elapsed+=dt;
    const index=Math.floor(this.elapsed*clip.fps/1000);
    if(index>=clip.playback.length&&!clip.loop)this.reset();
    else {const next=clip.playback[index%clip.playback.length];if(next!==this.frame){this.frame=next;this.draw();}}
   }
  }
  requestAnimationFrame(this.tick);
 };
 private draw(){
  const {context:ctx,canvas:c}=this;ctx.clearRect(0,0,c.width,c.height);
  if(this.form<0)return;
  // All reviewed video sources face left. Friendly pets face the enemies on
  // the right, as in the production pet flipX contract. Static form 04 was
  // authored facing right and is the only fallback that needs no mirror.
  ctx.save();
  if(this.clips||this.form!==3){ctx.translate(c.width,0);ctx.scale(-1,1);}
  if(!this.clips){if(this.still)ctx.drawImage(this.still,0,0,c.width,c.height);ctx.restore();return;}
  const clip=this.clips[this.motion],img=this.sheets.get(this.motion);if(!img){ctx.restore();return;}
  const sx=this.frame%clip.columns*c.width,sy=Math.floor(this.frame/clip.columns)*c.height;
  ctx.drawImage(img,sx,sy,c.width,c.height,0,0,c.width,c.height);
  ctx.restore();
 }
}

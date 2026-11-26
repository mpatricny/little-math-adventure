import manifest from './manifest.json';
import forms from '../fox-evolution-v4/manifest.json';
import {drawFoxLight,foxLightAnchor} from './effects.js';
const $ = selector => document.querySelector(selector);
const context = $('#preview').getContext('2d');
const query=new URLSearchParams(location.search);
let id = /^0[1-5]$/.test(query.get('form')??'')?query.get('form'):'01';
let motion = ['idle','attack','cast'].includes(query.get('motion'))?query.get('motion'):'idle', playing = !matchMedia('(prefers-reduced-motion:reduce)').matches;
let right = false, frame = 0, image = null, loaded = false, version = 0, elapsed = 0, last = 0;
let light=true;
const cache = new Map();
const info = () => manifest.forms[id]?.motions[motion];
const still = () => manifest.forms[id]?.sourceStill;
$('#forms').innerHTML = forms.map((form,index) => `<button class="form" data-id="${String(index+1).padStart(2,'0')}" aria-label="Podoba ${index+1}" aria-pressed="${index===0}"><img src="${manifest.forms[String(index+1).padStart(2,'0')]?.sourceStill ?? '../fox-evolution-v4/'+form.asset}" alt=""><b>${index+1}</b></button>`).join('');
function paint(){
 context.clearRect(0,0,512,512);
 if(!loaded || !image) return;
 const entry = info(), cell = entry ? entry.playback[frame % entry.playback.length] : 0;
 context.save();
 if(right){context.translate(512,0);context.scale(-1,1);}
 if(!entry){context.drawImage(image,0,0,512,512);context.restore();return;}
 context.drawImage(image,cell%entry.columns*512,Math.floor(cell/entry.columns)*512,512,512,0,0,512,512);
 if(light)drawFoxLight(context,{motion,progress:cell/Math.max(1,entry.frames-1),reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,anchor:foxLightAnchor(id,motion,cell)});
 context.restore();
}
function controls(){
 $('#formTitle').textContent = `Liška ${Number(id)}`;
 $('#play').disabled=!info();
 document.querySelectorAll('[data-motion]').forEach(button=>button.disabled=!manifest.forms[id]?.motions[button.dataset.motion]);
 document.querySelectorAll('.form').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id===id)));
 document.querySelectorAll('[data-motion]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.motion===motion)));
 $('#play').setAttribute('aria-pressed',String(playing));$('#play').textContent=!info()?'Připravuje se':playing?'Pozastavit':'Přehrát';
 $('#direction').setAttribute('aria-pressed',String(right));
}
async function load(){
 const token = ++version;loaded=false;frame=0;elapsed=0;paint();controls();
 $('#sheetLink').hidden=true;$('#previewLink').hidden=true;$('#canvasHost').setAttribute('aria-busy','true');
 const entry=info();
 if(!entry){
  if(still()){const img=new Image();img.src=still();try{await img.decode();if(token!==version)return;image=img;loaded=true;paint();}catch{}}
  $('#status').textContent='Nový postoj · pohyb se připravuje';$('#canvasHost').setAttribute('aria-busy','false');return;
 }
 $('#status').textContent='Načítání…';
 if(!cache.has(entry.sheet))cache.set(entry.sheet,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=entry.sheet;}));
 try{const result=await cache.get(entry.sheet);if(token!==version)return;image=result;loaded=true;$('#status').textContent=`${entry.frames} snímků · ${entry.fps} snímků/s`;$('#sheetLink').href=entry.sheet;$('#previewLink').href=entry.preview;$('#sheetLink').hidden=false;$('#previewLink').hidden=false;$('#canvasHost').setAttribute('aria-busy','false');paint();}
 catch{if(token===version){$('#status').textContent='Náhled není dostupný';$('#canvasHost').setAttribute('aria-busy','false');}}
}
document.querySelectorAll('.form').forEach(button=>button.onclick=()=>{id=button.dataset.id;load();});
document.querySelectorAll('[data-motion]').forEach(button=>button.onclick=()=>{motion=button.dataset.motion;load();});
$('#play').onclick=()=>{playing=!playing;controls();};
$('#backdrop').onclick=()=>{const light=document.body.classList.toggle('light');$('#backdrop').setAttribute('aria-pressed',String(light));$('#backdrop').textContent=light?'Tmavé pozadí':'Světlé pozadí';};
$('#direction').onclick=()=>{right=!right;controls();paint();};
$('#light').onclick=()=>{light=!light;$('#light').setAttribute('aria-pressed',String(light));paint();};
function tick(now){
 const delta=last?Math.min(100,now-last):0;last=now;
 if(loaded&&info()&&playing&&!document.hidden){elapsed+=delta;const period=1000/info().fps;if(elapsed>=period){frame=(frame+Math.floor(elapsed/period))%info().playback.length;elapsed%=period;paint();}}
 requestAnimationFrame(tick);
}
window.foxAnimationReview={snapshot:()=>({id,motion,playing,right,frame,loaded,version,light,entry:info()}),
 showFrame:(value)=>{playing=false;frame=Math.max(0,Math.min(Number(value),(info()?.playback.length??1)-1));elapsed=0;controls();paint();}};
load();requestAnimationFrame(tick);

const forms=await fetch('manifest.json').then(response=>{if(!response.ok)throw new Error('Manifest unavailable');return response.json()});
const lineup=document.querySelector('#lineup');
const comparison=document.querySelector('#comparison');
const detailImage=document.querySelector('#detail-image');
let selected=1;
let lastTrigger=null;
for(const form of forms){
 const button=document.createElement('button');
 button.className='form-card';button.type='button';button.dataset.form=form.id;
 button.setAttribute('aria-label',`${form.id}. ${form.name} — zvětšit`);button.setAttribute('aria-pressed','false');
 const title=document.createElement('span');title.className='card-title';
 const number=document.createElement('span');number.className='number';number.textContent=String(form.id).padStart(2,'0');
 const name=document.createElement('h3');name.textContent=form.name;title.append(number,name);
 const art=document.createElement('span');art.className='art';
 const img=document.createElement('img');img.src=form.asset;img.alt=form.alt;img.width=1200;img.height=1200;img.decoding='async';art.append(img);
 const caption=document.createElement('span');caption.className='card-caption';
 for(const [key,style] of [['feature','feature'],['pose','pose']]){const text=document.createElement('span');text.className=style;text.textContent=form[key];caption.append(text)}
 const zoom=document.createElement('span');zoom.className='zoom';zoom.textContent='↗';zoom.setAttribute('aria-hidden','true');
 button.append(title,art,caption,zoom);button.addEventListener('click',()=>{lastTrigger=button;show(form.id,true)});lineup.append(button);
}
function show(id,scroll=false){
 selected=id;const form=forms.find(value=>value.id===id);
 detailImage.src=form.asset;detailImage.alt=form.alt;
 document.querySelector('#detail-name').textContent=form.name;
 document.querySelector('#detail-tag').textContent=id===1?'ZÁKLAD':'NOVÝ NÁVRH';
 document.querySelector('#full-size').href=form.master;
 document.querySelector('#detail-count').textContent=`${id} / ${forms.length}`;
 document.querySelectorAll('.form-card').forEach(card=>card.setAttribute('aria-pressed',String(Number(card.dataset.form)===id)));
 comparison.hidden=false;
 history.replaceState(null,'',`?form=${id}`);
 if(scroll)comparison.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
document.querySelector('#previous').addEventListener('click',()=>show(selected===1?forms.length:selected-1));
document.querySelector('#next').addEventListener('click',()=>show(selected===forms.length?1:selected+1));
document.querySelector('#close-comparison').addEventListener('click',()=>{
 comparison.hidden=true;document.querySelectorAll('.form-card').forEach(card=>card.setAttribute('aria-pressed','false'));
 history.replaceState(null,'',location.pathname);lastTrigger?.focus();
});
document.querySelector('#background').addEventListener('click',event=>{
 const light=document.body.classList.toggle('light');event.currentTarget.setAttribute('aria-pressed',String(light));event.currentTarget.textContent=light?'Tmavé pozadí':'Světlé pozadí';
});
const initial=Number(new URLSearchParams(location.search).get('form'));
if(forms.some(form=>form.id===initial))show(initial);

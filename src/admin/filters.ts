import { el, button } from './components';
import { navigate } from './router';
const apiKeys=new Set(['from','to','fromDay','toDay','preset','data','learningActor','profile','session','participant','skill','region','mode','device','release','search','result','assistance','state','location','stage','detailScope','limit','cursor','sort']);
export function apiQuery(extra:Record<string,string|null>={}){const query=new URLSearchParams(location.search);
    const keys:string[]=[];query.forEach((_v,k)=>keys.push(k));for(const key of keys)if(!apiKeys.has(key))query.delete(key);
    for(const [key,value]of Object.entries(extra)){if(value===null)query.delete(key);else query.set(key,value);}
    return query;}
export function updateFilters(values:Record<string,string|null>){const q=new URLSearchParams(location.search);q.delete('cursor');
    for(const [k,v]of Object.entries(values)){if(v)q.set(k,v);else q.delete(k);}
    navigate(location.pathname+(q.size?'?'+q:''));}
function select(label:string,name:string,options:Array<[string,string]>,q:URLSearchParams,immediate=false){const input=el('select') as HTMLSelectElement;input.name=name;
    for(const [value,text]of options){const opt=el('option',text) as HTMLOptionElement;opt.value=value;input.append(opt);}input.value=q.get(name)??options[0][0];
    if(immediate)input.addEventListener('change',()=>updateFilters({[name]:input.value}));const host=el('label',label);host.append(input);return host;}
export function filters(onRefresh:()=>void){const q=new URLSearchParams(location.search),host=el('section',undefined,'filters');host.setAttribute('aria-label','Filtry statistik');
    const presets=el('div',undefined,'period-buttons');for(const [id,title]of [['today','Dnes'],['yesterday','Včera'],['7d','7 dní'],['30d','30 dní']]){
        const b=button(title,()=>updateFilters({preset:id,from:null,to:null,fromDay:null,toDay:null}));b.setAttribute('aria-pressed',String(!q.has('fromDay')&&!q.has('from')&&(q.get('preset')??'7d')===id));presets.append(b);}
    host.append(presets,select('Záznamy','data',[['normal','Běžné hraní'],['test','Testování'],['all','Vše']],q,true),button('Obnovit',onRefresh));
    const details=el('details'),summary=el('summary','Vlastní období a další filtry');details.append(summary);
    const form=el('form',undefined,'advanced') as HTMLFormElement;
    for(const [name,title]of [['fromDay','Od'],['toDay','Do včetně']]){const input=el('input') as HTMLInputElement;input.type='date';input.name=name;input.value=q.get(name)??'';
        const label=el('label',title);label.append(input);form.append(label);}
    for(const [name,title]of [['search','Hledat hráče'],['release','Verze hry'],['skill','Dovednost']]){const input=el('input') as HTMLInputElement;input.name=name;input.maxLength=100;input.value=q.get(name)??'';
        const label=el('label',title);label.append(input);form.append(label);}
    form.append(select('Zařízení','device',[['','Všechna'],['desktop','Počítač'],['tablet','Tablet'],['mobile','Mobil']],q),
        select('Režim','mode',[['','Oba'],['solo','Solo'],['coop','Co-op']],q),
        select('Oblast','region',[['','Všechny'],['mathoria','Město'],['forest','Les'],['silverpond','Silverpond'],['catacombs','Katakomby']],q),
        select('Početní výkon','learningActor',[['unmarked','Bez označení Dospělý'],['adult','Dospělý'],['all','Všichni']],q));
    form.append(select('První odpověď','result',[['','Všechny'],['correct','Správná'],['wrong','Chybná']],q),
        select('Pomoc','assistance',[['','Vše'],['yes','Ukázaná pomoc'],['no','Bez pomoci'],['unknown','Historicky neznámá']],q));
    if(location.pathname.startsWith('/admin/sessions'))form.append(select('Stav sezení','state',[['','Všechny'],['active','Probíhá'],['paused','Pozastaveno'],['ended','Ukončeno'],['unconfirmed','Konec nepotvrzen'],['incomplete','Neúplné']],q));
    const submit=el('button','Použít') as HTMLButtonElement;submit.type='submit';form.append(submit,button('Vymazat filtry',()=>navigate(location.pathname)));
    form.addEventListener('submit',e=>{e.preventDefault();const values:Record<string,string|null>={};new FormData(form).forEach((v,k)=>values[k]=String(v)||null);
        updateFilters({...values,from:null,to:null});});details.append(form);host.append(details);return host;}

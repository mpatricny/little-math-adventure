import type { Metric, ReportMeta } from '../../server/src/contracts/analytics';
import { href, navigate } from './router';
export function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function button(label:string,action:()=>void){const node=el('button',label);node.type='button';node.addEventListener('click',action);return node;}
export function link(title:string,path:string,extra:Record<string,string|null>={}){const a=el('a',title);a.href=href(path,extra);a.dataset.internal='true';return a;}
export const number=(v:number|null|undefined)=>v==null?'Nezaznamenáno':new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1}).format(v);
export const percent=(v:number|null|undefined)=>v==null?'Nezaznamenáno':number(v)+' %';
export function duration(v:number|null|undefined){if(v==null)return 'Nezaznamenáno';if(v>0&&v<100)return '< 0,1 s';const sec=Math.round(v/1000);return v<10_000?`${number(v/1000)} s`:sec<60?`${sec} s`:sec<3600?`${Math.floor(sec/60)} min ${sec%60} s`:`${Math.floor(sec/3600)} h ${Math.round(sec%3600/60)} min`;}
export function date(v:any){if(!v)return 'Nezaznamenáno';const d=new Date(v);return Number.isNaN(d.getTime())?'Nejistý čas':new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'short',timeStyle:'short'}).format(d);}
export function panel(title:string,...nodes:Node[]){const p=el('section',undefined,'panel');p.append(el('h2',title),...nodes);return p;}
export function empty(text='Ve vybraném období nejsou záznamy.'){return el('p',text,'empty');}
export function badge(text:string,kind='muted'){return el('span',text,'badge '+kind);}
export const status=(s:string)=>({ended:'Ukončeno',active:'Probíhá',paused:'Pozastaveno',unconfirmed:'Konec nepotvrzen',incomplete:'Neúplné',verified:'Ověřeno',unresolved:'Nejasná identita',locked:'Zamčeno',training:'Procvičování',secure:'Jistota',fluent:'Plynulost',mastery:'Mistrovství'}[s]??s);
export function skillName(id:string){const match=/^([A-E])([1-4])$/.exec(id);if(!match)return ({size:'Velikost',count:'Počet',objects_number:'Předměty a čísla',number_symbol:'Čísla',expressions_supported:'Výrazy s pomocí',expressions:'Výrazy'}[id]??id);
    const range={A:'0–5',B:'6–8',C:'0–10',D:'11–20',E:'0–20'}[match[1]];const action={'1':'Sčítání','2':'Odčítání','3':'Tři operandy','4':'Mix'}[match[2]];
    return `${id} · ${action} ${match[1]==='E'&&['1','2'].includes(match[2])?'přes 10':'('+range+')'}`;}
export const formName=(s:string)=>({result_unknown:'Najdi výsledek',missing_part:'Doplň chybějící část',compare_equation_vs_number:'Příklad a číslo',compare_equation_vs_equation:'Dva příklady'}[s]??s);
export const sceneNames:Record<string,string>={TownScene:'Město',ArenaScene:'Aréna',BattleScene:'Souboj',ForestRiddleScene:'Lesní most',ForestRoomScene:'Les',ForestMapScene:'Cesta lesem',ForestCampScene:'Odpočívadlo',ForestPuzzleScene:'Lesní hádanka',GuardianLairScene:'Les – Strážce',ForestCrystalRewardScene:'Lesní krystal',SilverpondScene:'Silverpond',SilverpondTownMockScene:'Silverpond',UnderwaterRoomScene:'Podvodní svět',UnderwaterDescentScene:'Ponor',SilverpondFairyRewardScene:'Osvobozená víla',GuildScene:'Zkoušky',CrystalForgeScene:'Krystalová kovárna',ManaCollectionScene:'Sbírání many',CatacombTrialScene:'Katakomby',ShopScene:'Obchod',PythiaWorkshopScene:'Pythiina dílna',WitchHutScene:'Pythiina dílna',ZyxCrystalMachineScene:'Zyxův krystal',ZyxRocketInterludeScene:'Zyxova loď'};
export const locationName=(value:string|null|undefined)=>value?(sceneNames[value]??value):'Nezaznamenáno';
export const deviceName=(value:string|null|undefined)=>value?({desktop:'Počítač',tablet:'Tablet',mobile:'Mobil',unknown:'Nezaznamenáno'}[value]??value):'Nezaznamenáno';
export function table(headers:string[],rows:Array<Array<string|number|null|Node>>,caption?:string){const host=el('div'),wrap=el('div',undefined,'table-wrap'),t=el('table');if(headers.length>=6)t.className='wide-table';
    if(caption){const note=el('p',caption,'muted');note.id='table-note-'+crypto.randomUUID();t.setAttribute('aria-describedby',note.id);host.append(note);}
    const head=el('thead'),tr=el('tr');for(const title of headers){const th=el('th',title);th.scope='col';tr.append(th);}head.append(tr);t.append(head);
    const body=el('tbody');for(const row of rows){const tr=el('tr');for(const value of row){const td=el('td');if(value instanceof Node)td.append(value);else td.textContent=value==null?'Nezaznamenáno':String(value);tr.append(td);}body.append(tr);}t.append(body);wrap.append(t);if(!rows.length)wrap.append(empty());host.append(wrap);return host;}
export function metricValue(m:Metric){return m.status==='unavailable'?'Ještě neměříme':m.unit==='ms'?duration(m.value):m.unit==='percent'?percent(m.value):number(m.value);}
export function cards(items:Array<{title:string;metric:Metric;detail:string;path?:string;previous?:Metric}>){const host=el('div',undefined,'cards');for(const c of items){const node=c.path?link('',c.path):el('div');node.className='card';
    node.append(el('span',c.title,'card-label'),el('strong',metricValue(c.metric)),el('small',c.detail));if(c.previous)node.append(el('small','Předchozí období: '+metricValue(c.previous)));
    if(c.metric.status==='partial')node.append(badge('Částečná data','warn'));host.append(node);}return host;}
export function metadata(meta:ReportMeta){const h=el('aside',undefined,'metadata');h.append(el('p',`Praha · ${date(meta.from)} – ${date(meta.to)} · načteno ${date(meta.generatedAt)}`),
    el('p',`Vyřazeno odpovědí: testy ${meta.excluded.tests}, dospělý ${meta.excluded.adults}. Konflikty: ${meta.excluded.conflicts}.`));
    for(const warning of meta.warnings)h.append(el('p',warning,'warning'));return h;}
export function pager(data:{nextCursor?:string|null;total?:number},onNext:(cursor:string)=>void){const host=el('div',undefined,'pager');host.append(el('span',`${number(data.total)} záznamů`));
    if(data.nextCursor)host.append(button('Další stránka',()=>onNext(data.nextCursor!)));return host;}
export function timeline(items:any[]){const list=el('ol',undefined,'timeline');const kinds:Record<string,string>={page_view:'Otevřená stránka',play_clicked:'Klik na Hrát',game_menu_ready:'Menu připraveno',profile_created:'Nový hráč',profile_imported:'Import profilu',profile_activated:'Hráč aktivován',play_started:'Začátek hraní',play_resumed:'Pokračování po načtení',play_ended:'Konec hraní',scene_entered:'Vstup do scény',scene_left:'Odchod ze scény',encounter_started:'Začátek souboje',encounter_finished:'Výsledek souboje',skill_changed:'Změna dovednosti',milestone_reached:'Milník',problem_presented:'Zadání',assistance_shown:'Ukázaná pomoc',problem_corrected:'Pozdější oprava',problem_abandoned:'Nezodpovězeno',first_answer:'První odpověď',client_error:'Chyba hry',asset_error:'Chyba načítání',save_error:'Chyba uložení',visibility_changed:'Viditelnost stránky',pause_changed:'Pauza',loading_changed:'Načítání',coverage_gap:'Mezera v měření',puzzle_started:'Začátek hádanky',puzzle_submitted:'Pokus o hádanku',puzzle_completed:'Vyřešená hádanka'};
    for(const item of items){const li=el('li'),p=item.payload??{};li.dataset.occurredAt=item.occurredAt;li.append(el('time',date(item.occurredAt)),el('strong',kinds[item.kind]??item.kind));
        let detail=p.question??p.scene??p.milestone??p.encounter??p.reason??p.code??'';if(p.scene)detail=locationName(p.scene);if(item.kind==='first_answer')detail=`${p.question} → ${p.selected??'Nezaznamenáno'} · ${p.correct?'správně':'chyba'} · ${duration(p.responseTimeMs)}`;
        if(item.kind==='visibility_changed')detail=p.hidden?'Stránka skrytá':'Stránka viditelná';
        if(item.kind==='pause_changed')detail=p.paused?'Pozastaveno':'Pokračování';
        if(item.kind==='loading_changed')detail=p.loading?'Začátek načítání':'Načítání dokončeno';
        if(p.result)detail+=` · ${p.result==='victory'?'vítězství':p.result==='defeat'?'porážka':p.result}`;li.append(el('span',detail));list.append(li);}return items.length?list:empty();}
export function answerTable(items:any[]){return table(['Čas','Zadání','Volba','První odpověď','Čas řešení','Pomoc','Dovednost / místo','Detail'],items.map(a=>{const details=el('details');details.append(el('summary','Zadání a pokusy'),
    el('p','Možnosti: '+(a.choices?.join(' · ')??'Historicky neznámé')),el('p','Správná volba: '+(a.correctAnswer??'Nezaznamenáno')),
    el('p',`Kontext: ${a.context} · čas ${a.clockQuality==='observed'?'měřený':a.clockQuality==='uncertain'?'nejistý':'historický'}`),
    el('p',`Vznik: ${a.release??'historicky neznámá verze'} · upload: ${a.uploadRelease} · přijato ${date(a.receivedAt)}`));
    for(const step of a.laterAttempts??[])details.append(el('p',`${date(step.occurredAt)} → ${step.selected??'Nezaznamenáno'} · ${step.correct?'správně':'chyba'} (opravný pokus)`));
    return [
    el('time',date(a.occurredAt),'timestamp'),a.question,a.selected==null?badge('Historicky neznámá'):String(a.selected),badge(a.correct?'Správně':'Chyba',a.correct?'good':'bad'),
    a.clockQuality==='uncertain'?'Nejistý čas':duration(a.responseTimeMs),a.assisted===null?'Nezaznamenáno':a.assisted?'Ano':'Ne',`${skillName(a.skill)} · ${locationName(a.scene)}${a.role?' · '+a.role:''}`,details];}),
    'První volby; oprava chybné odpovědi není další příklad.');}
export function chart(title:string,rows:any[],keys:Array<[string,string]>){const host=el('section',undefined,'panel');host.append(el('h2',title));if(!rows.length){host.append(empty());return host;}
    const path=location.pathname.replace(/^\/admin\//,'');
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 680 170');svg.setAttribute('role','img');svg.setAttribute('aria-label',title);
    const max=Math.max(1,...rows.flatMap(r=>keys.map(([key])=>r[key]??0))),colors=['#e0b965','#6fd4c4'];
    const x=(i:number)=>40+i*600/Math.max(1,rows.length-1),y=(v:number)=>136-v/max*112;
    const label=(text:string,a:number,b:number)=>{const node=document.createElementNS(ns,'text');node.textContent=text;node.setAttribute('x',String(a));node.setAttribute('y',String(b));node.setAttribute('fill','#b6c4d1');node.setAttribute('font-size','13');svg.append(node);};
    label(number(max),3,28);label('0',15,140);
    const bucketLabel=(value:string)=>value.includes('T')?new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):value.slice(8)+'.'+value.slice(5,7)+'.';
    [...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].forEach(i=>label(bucketLabel(rows[i].date),x(i)-16,160));
    const legend=el('p',undefined,'chart-legend');
    keys.forEach(([key,title],i)=>{
        let segment:string[]=[];
        const draw=()=>{if(!segment.length)return;const line=document.createElementNS(ns,'polyline');line.setAttribute('points',segment.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',colors[i]);line.setAttribute('stroke-width','3');svg.append(line);segment=[];};
        rows.forEach((r,n)=>{if(r[key]==null){draw();return;}segment.push(`${x(n)},${y(r[key])}`);const point=document.createElementNS(ns,'circle');point.setAttribute('cx',String(x(n)));point.setAttribute('cy',String(y(r[key])));point.setAttribute('r','4');point.setAttribute('fill',colors[i]);const hint=document.createElementNS(ns,'title');hint.textContent=`${r.date}: ${title} ${number(r[key])}`;point.append(hint);
            if(!r.date.includes('T')){point.setAttribute('tabindex','0');point.setAttribute('role','link');point.setAttribute('aria-label',`Vybrat den ${r.date}`);point.style.cursor='pointer';
                const go=()=>navigate(href(path,{fromDay:r.date,toDay:r.date,preset:null,cursor:null}));point.addEventListener('click',go);point.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});}
            svg.append(point);});draw();
        const name=el('span',title);name.style.color=colors[i];legend.append(name);
    });
    host.append(svg,legend);const details=el('details');details.append(el('summary','Číselná data grafu'),table([rows[0].date.includes('T')?'Hodina':'Den',...keys.map(k=>k[1])],rows.map(r=>[r.date.includes('T')?date(r.date):link(r.date,path,{fromDay:r.date,toDay:r.date,preset:null,cursor:null}),...keys.map(([k])=>r[k]==null?'Neměřeno':number(r[k]))])));host.append(details);return host;}

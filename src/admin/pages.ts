import type { AdminApi } from './api';
import { apiQuery, updateFilters } from './filters';
import { answerTable, badge, cards, chart, date, duration, el, empty, link, locationName, deviceName, metadata, number, pager, panel, percent, status, skillName, formName, table, timeline, button } from './components';

export const pageTitles:Record<string,string>={overview:'Přehled',traffic:'Návštěvnost',players:'Hráči',sessions:'Hraní',accounts:'Účty','data-quality':'Stav dat',visits:'Webová návštěva'};
const sessionRows=(items:any[])=>table(['Začátek / konec','Hráči','Aktivní čas','Příklady','Poslední místo','Stav'],items.map(s=>{
    const dates=el('div');dates.append(link(date(s.startedAt),'sessions/'+encodeURIComponent(s.id)),el('p',s.endedAt?'Konec '+date(s.endedAt):'Poslední kontakt '+date(s.lastReceivedAt),'muted'));
    const players=el('div',s.participants.map((p:any)=>p.name).join(' + ')||'Nezaznamenáno');players.append(el('p',s.mode==='coop'?'Co-op':'Solo','muted'));
    const time=el('div',duration(s.activeTimeMs));if(s.startedAt&&s.endedAt)time.append(el('p','Od startu do konce '+duration(Date.parse(s.endedAt)-Date.parse(s.startedAt)),'muted'));
    const answers=el('div',number(s.attempts));answers.append(el('p',`${s.correct}/${s.attempts} · ${percent(s.accuracy)}`,'muted'));
    const state=el('div');state.append(badge(status(s.status),s.status==='incomplete'?'warn':'muted'));if(s.hasError)state.append(badge('Zaznamenaná chyba','bad'));state.append(el('p',`${deviceName(s.device)} · ${s.release??'Nezaznamenáno'}`,'muted'));
    return [dates,players,time,answers,locationName(s.lastLocation),state];}));
const next=(cursor:string)=>updateFilters({cursor});
function tabs(options:Array<[string,string]>,selected:string){const host=el('nav',undefined,'tabs');host.setAttribute('aria-label','Detail');
    for(const [id,title]of options){const a=link(title,location.pathname.slice('/admin/'.length),{tab:id});a.setAttribute('aria-current',selected===id?'page':'false');host.append(a);}return host;}
function annotationButton(api:AdminApi,type:'profile'|'session'|'visit',id:string,onRefresh:()=>void){return button('Označit test / dospělý',()=>{
    const dialog=el('dialog'),form=el('form');dialog.append(form);form.append(el('h2','Analytické označení'),el('p','Nemění uloženou hru. Označení lze odvolat ve Stavu dat.'));
    const label=el('select');for(const [value,title]of [['test','Testování – vyřadit ze souhrnů'],['adult','Dospělý – oddělit početní výkon']]){const o=el('option',title);o.value=value;label.append(o);}
    label.setAttribute('aria-label','Druh označení');const reason=el('input');reason.required=true;reason.maxLength=300;reason.placeholder='Důvod označení';reason.setAttribute('aria-label','Důvod');
    const from=el('input'),to=el('input');from.type=to.type='datetime-local';const f=el('label','Od (volitelné)'),t=el('label','Do (volitelné)');f.append(from);t.append(to);
    const error=el('p',undefined,'warning'),submit=el('button','Uložit');submit.type='submit';form.append(label,reason,f,t,error,submit,button('Zrušit',()=>dialog.close()));
    form.addEventListener('submit',async e=>{e.preventDefault();if(!!from.value!==!!to.value){error.textContent='Vyplň oba konce intervalu, nebo je nech prázdné.';return;}
        submit.disabled=true;try{await api.annotate({mutationId:crypto.randomUUID(),targetType:type,targetId:id,label:label.value,reason:reason.value,
            ...(from.value?{from:new Date(from.value).toISOString(),to:new Date(to.value).toISOString()}: {})});dialog.close();onRefresh();}
        catch(e){error.textContent=e instanceof Error?e.message:'Uložení se nezdařilo.';}finally{submit.disabled=false;}});
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();});}
export async function renderPage(api:AdminApi,page:string,id:string|null,refresh:()=>void):Promise<HTMLElement>{
    const host=el('div',undefined,'page-content'),query=apiQuery();const tab=new URLSearchParams(location.search).get('tab')??'summary';
    const report=await api.report(id?`${page}/${encodeURIComponent(id)}`:page,query);const d=report.data;
    if(page==='sessions'&&id&&query.get('detailScope')==='whole'){query.set('from',report.meta.from);query.set('to',report.meta.to);query.delete('fromDay');query.delete('toDay');}
    host.append(el('h1',id?({players:d.name??'Hráč',sessions:'Detail hraní',accounts:'Google účet',visits:'Detail návštěvy'}[page]??pageTitles[page]):pageTitles[page]));
    if(page==='overview'){
        const c=d.cards,previous=d.previous?.cards;host.append(cards([
            {title:'Návštěvnost',metric:c.visits,detail:`${number(c.visitors.value)} měřených návštěvníků`,path:'traffic'},
            {title:'Kliknutí na Hrát',metric:c.playClicks,detail:`Konverze ${percent(c.clickConversion.value)} (${c.clickConversion.numerator} / ${c.clickConversion.denominator} návštěv)`,path:'traffic'},
            {title:'Google registrace',metric:c.registrations,detail:`Celkem ${number(c.accounts.value)} Google účtů`,path:'accounts'},
            {title:'Aktivní hráči',metric:c.activePlayers,detail:`Nových ${number(c.newPlayers.value)} · celkem ${number(c.players.value)} profilů`,path:'players'},
            {title:'Hraní',metric:c.sessions,detail:`Aktivní čas ${duration(c.gameTime.value)} · medián ${duration(c.medianGameTime.value)}`,path:'sessions'},
            {title:'Příklady',metric:c.attempts,detail:`První správnost ${percent(c.accuracy.value)} (${c.accuracy.samples?Math.round(c.accuracy.value*c.accuracy.samples/100):0}/${c.accuracy.samples??0}) · medián ${duration(c.medianResponseTime.value)}`,path:'players'},
        ].map((card,i)=>({...card,previous:previous?.[['visits','playClicks','registrations','activePlayers','sessions','attempts'][i]]}))));
        if(d.previous)host.append(el('p',`Srovnání se stejně dlouhým obdobím ${date(d.previous.from)} – ${date(d.previous.to)}. Dnešní den je neúplný.`,'muted'));
        const charts=el('div',undefined,'two-column');charts.append(chart('Návštěvy a kliknutí',d.daily,[['visits','Návštěvy'],['playClicks','Kliknutí']]),chart('Hráči a příklady',d.daily,[['activePlayers','Hráči'],['attempts','Příklady']]));host.append(charts);
        const funnel=table(['Krok návštěvy','Počet','Z předchozího kroku'],d.funnel.map((s:any,i:number)=>[link(s.step,'traffic',{stage:s.filter}),number(s.value),i===0?'100 %':d.funnel[i-1].value?percent(100*s.value/d.funnel[i-1].value):'–']));
        const pair=el('div',undefined,'two-column');pair.append(panel('Od webu k první odpovědi',funnel,el('p',`Přímé vstupy do hry: ${d.directGameVisits}. Google není podmínkou hraní.`,'muted')),
            panel('Poslední zaznamenaná místa',table(['Místo','Sezení'],Object.entries(d.lastLocations).map(([key,v])=>[link(locationName(key),'sessions',{region:null,location:key}),String(v)]))));host.append(pair,panel('Posledních deset hraní',sessionRows(d.recentSessions)));
    }else if(page==='traffic'&&!id){
        host.append(cards([{title:'Návštěvy',metric:{value:d.measured?d.visits:null,status:d.measured?'measured':'unavailable',unit:'count'},detail:'Měřené, nikoli všichni lidé'},
            {title:'Čas na webu',metric:{value:d.measured?d.webTimeMs:null,status:d.measured?'measured':'unavailable',unit:'ms'},detail:'Viditelná aktivní stránka'},
            {title:'Kliknutí na Hrát',metric:{value:d.measured?d.playClicks:null,status:d.measured?'measured':'unavailable',unit:'count'},detail:'Všechny potvrzené kliky'}]));
        host.append(el('p',`${d.visitors} měřených návštěvníků · ${d.pageViews} zobrazení stránek · ${d.returningVisitors} vracejících se prohlížečů · medián webového času ${duration(d.medianWebTimeMs)} · průměr ${duration(d.meanWebTimeMs)}.`,'muted'),
            chart(d.hourly.length?'Návštěvnost po hodinách':'Návštěvnost po dnech',d.hourly.length?d.hourly:d.daily,[['visits','Návštěvy'],['playClicks','Kliknutí']]));
        const groups=el('div',undefined,'two-column');groups.append(panel('Zdroje a kampaně',table(['Zdroj','Návštěvy','S kliknutím','S odpovědí'],d.sourceRows.map((r:any)=>[r.source,r.visits,r.clicked,r.answered]))),
            panel('Stránky',table(['Stránka','Návštěvy','Zobrazení','Webový čas'],d.pages.map((r:any)=>[r.route,r.visits,r.pageViews,duration(r.webTimeMs)]))),
            panel('Zařízení',table(['Typ','Počet'],Object.entries(d.devices).map(([k,v])=>[deviceName(k),String(v)]))),
            panel('Tlačítka Hrát',table(['Umístění','Kliknutí','Návštěvy'],d.placementRows.map((r:any)=>[r.placement,r.clicks,r.visits]))));host.append(groups);
        const visits=await api.report('visits',query);host.append(panel('Jednotlivé návštěvy',table(['Začátek','Zařízení','Zdroj','Čas na webu','Hrát','První odpověď'],visits.data.items.map((v:any)=>[
            link(date(v.startedAt),'visits/'+encodeURIComponent(v.id)),deviceName(v.device),v.referrer||'Přímá',duration(v.activeTimeMs),String(v.playClicks),v.answered?'Ano':'Ne'])),pager(visits.data,next)));
    }else if(page==='players'&&!id){host.append(panel('Herní profily',table(['Hráč','Poslední odpověď','Hraní / čas','Příklady','Správnost','Dovednost','Poslední místo','Identita'],d.items.map((p:any)=>[
        link(p.name+' · '+p.id.slice(0,8),'players/'+p.id),date(p.lastActivityAt),`${number(p.sessionsCount)} · ${duration(p.sharedTimeMs)}`,number(p.attempts),
        `${p.correct}/${p.attempts} · ${percent(p.accuracy)}`,p.lastSkill?skillName(p.lastSkill):'Nezaznamenáno',locationName(p.lastLocation),badge(status(p.identityStatus),p.identityStatus==='unresolved'?'warn':'good')])),
        el('p','Čas co-opu je společný; časy obou hráčů se nesčítají jako délka jednoho hraní.','muted'),pager(d,next)));
    }else if(page==='players'&&id){
        host.append(el('p',`Profil ${id} · poprvé viděn ${date(d.firstObservedAt)} · poslední odpověď ${date(d.lastActivityAt)} · vytvoření ${date(d.createdAt)}`,'muted'),annotationButton(api,'profile',id,refresh),
            tabs([['summary','Souhrn'],['learning','Dovednosti'],['sessions','Hraní'],['answers','Příklady']],tab));
        if(tab==='answers'){const answers=await api.report('attempts',apiQuery({profile:id}));host.append(panel('Odpovědi hráče',answerTable(answers.data.items),pager(answers.data,next)));}
        else if(tab==='learning'){const learning=await api.report(`players/${id}/learning`,query);host.append(panel('Početní výkon',table(['Dovednost','Příklady','První správnost','Pomoc','Medián správných','Stav savu'],learning.data.items.map((s:any)=>[skillName(s.skill),number(s.attempts),`${s.correct}/${s.attempts} · ${percent(s.accuracy)}`,`${s.assisted} · neznámá ${s.unobservedAssistance}`,duration(s.medianResponseTimeMs),s.state?status(s.state):'Nezaznamenáno']))));
            for(const s of learning.data.items)host.append(panel(skillName(s.skill)+' · formy',table(['Forma','Příklady','Správně','Medián'],s.forms.map((f:any)=>[formName(f.form),f.attempts,`${f.correct}/${f.attempts}`,duration(f.medianResponseTimeMs)]))));}
        else if(tab==='sessions')host.append(panel('Sezení hráče',sessionRows(d.sessions)));
        else {host.append(panel('Za vybrané období',table(['Příklady','Správně','První správnost','Medián správných'],[[number(d.attempts),number(d.correct),percent(d.accuracy),duration(d.medianResponseTimeMs)]])),
            el('p',`${d.sessionsCount} začátků hraní · ${duration(d.sharedTimeMs)} společného herního času v období. Čas v co-opu není součet času obou dětí.`,'muted'),
            panel('Poslední doložený stav',el('p',`${locationName(d.lastLocation)} · ${d.lastProblem??'Bez doloženého příkladu'}`),
                el('p',`Úroveň ${d.state?.player?.level??'Nezaznamenáno'} · vstupní úroveň ${d.state?.mathStats?.masteryData?.selectedStartBand??'Nezaznamenáno'}`),
                el('p',`Celkem doložených odpovědí ${number(d.lifetime.attempts)} · ${d.activeDays} aktivních dní v období. Placement není odehrané učení.`),
                table(['Kapitola','Stav'],Object.entries(d.state?.mathStats?.masteryData?.subAtoms??{}).map(([key,value]:[string,any])=>[skillName(key),status(value.state)])),
                el('p',`Snímek: zařízení ${d.stateSource.deviceId??'neznámé'}, revize ${d.stateSource.revision??'neznámá'}, uložení ${date(d.stateSource.clientSavedAt)}, přijato ${date(d.stateSource.receivedAt)}.`,'muted')),
            panel('Identita a vazby',el('p',`${d.sourceCopies} kopií profilu · ${status(d.identityStatus)} · ${d.linkedAccounts.length} rodičovských účtů`),
                table(['Google účet'],d.linkedAccountDetails.map((a:any)=>[link(a.email,'accounts/'+encodeURIComponent(a.id))])),
                table(['Zařízení','Revize','Uloženo','Přijato','Úroveň'],d.sourceStates.map((s:any)=>[s.deviceId??'Nezaznamenáno',s.revision,date(s.clientSavedAt),date(s.receivedAt),s.level]))),panel('Poslední hraní',sessionRows(d.sessions.slice(-5))));}
    }else if(page==='sessions'&&!id){host.append(el('p',`${d.summary.sessions} sezení · aktivní čas ${duration(d.summary.activeTimeMs)} · medián ${duration(d.summary.medianTimeMs)} · ${d.summary.withErrors} se zaznamenanou chybou.`),panel('Herní sezení',sessionRows(d.items),pager(d,next)));}
    else if(page==='sessions'&&id){host.append(el('p',`${date(d.startedAt)} → ${date(d.endedAt)} · ${status(d.status)} · ${d.mode==='coop'?'Co-op':'Solo'} · ${d.release}`),
        annotationButton(api,'session',id,refresh),tabs([['summary','Souhrn'],['timeline','Časová osa'],['answers','Příklady']],tab));
        host.append(tabs([['period','Vybrané období'],['whole','Celý průběh']],query.get('detailScope')??'period'));
        const scopeTabs=host.lastElementChild!;for(const a of Array.from(scopeTabs.querySelectorAll('a'))){const url=new URL((a as HTMLAnchorElement).href);const value=url.searchParams.get('tab')!;
            url.searchParams.set('tab',tab);url.searchParams.set('detailScope',value);(a as HTMLAnchorElement).href=url.pathname+url.search;}
        if(tab==='answers'){const choose=el('div',undefined,'tabs');choose.append(link('Oba hráči','sessions/'+encodeURIComponent(id),{tab:'answers',participant:null}));for(const p of d.participants)choose.append(link(`${p.role}: ${p.name}`,'sessions/'+encodeURIComponent(id),{tab:'answers',participant:p.rawProfileId}));
            const answersQuery=new URLSearchParams(query);answersQuery.set('session',id);
            const answers=await api.report('attempts',answersQuery);host.append(choose,panel('První odpovědi',answerTable(answers.data.items),pager(answers.data,next)));}
        else if(tab==='timeline'){const historyQuery=new URLSearchParams(query);if(!historyQuery.has('sort'))historyQuery.set('sort','oldest');
            const order=el('nav',undefined,'tabs');order.setAttribute('aria-label','Pořadí událostí');
            for(const [value,title]of [['oldest','Od začátku'],['newest','Od konce']]){const a=link(title,'sessions/'+encodeURIComponent(id),{tab:'timeline',sort:value});a.setAttribute('aria-current',historyQuery.get('sort')===value?'page':'false');order.append(a);}
            const history=await api.report(`sessions/${encodeURIComponent(id)}/timeline`,historyQuery);host.append(panel('Časová osa',order,timeline(history.data.items),pager(history.data,next)));}
        else {host.append(panel('Souhrn sezení',table(['Aktivní hraní','Načítání','Příklady','Správnost'],[[duration(d.activeTimeMs),duration(d.loadingTimeMs),number(d.attempts),percent(d.accuracy)]]),
            el('p',`Poslední doložené místo: ${locationName(d.lastLocation)}. ${d.status==='unconfirmed'?'Chybějící konec neznamená prokázané opuštění hry.':''}`),
            el('p',`Poslední aktivita ${date(d.lastActivityAt)} · data přijata ${date(d.lastReceivedAt)} · ${deviceName(d.device)}. ${d.hasError?'V sezení je zaznamenaná technická chyba.':''}`,'muted')),
            panel('Účastníci',table(['Hráč','Příklady','Správně'],d.participants.map((p:any)=>[p.profileId?link(`${p.role}: ${p.name}`,'players/'+p.profileId):p.name,
                number(d.attemptItems.filter((a:any)=>a.rawProfileId===p.rawProfileId).length),number(d.attemptItems.filter((a:any)=>a.rawProfileId===p.rawProfileId&&a.correct).length)]))),
            panel('Poslední události',timeline(d.timeline.slice(-8))));}
    }else if(page==='visits'&&id){host.append(el('p',`${date(d.startedAt)} · ${d.device} · ${d.referrer||'Přímá návštěva'}`),annotationButton(api,'visit',id,refresh),
        panel('Návštěva',el('p',`Čas na webu ${duration(d.activeTimeMs)} · ${d.pageViews} otevřených stránek · ${d.playClicks} kliknutí Hrát`),...d.sessions.map((s:string)=>link('Otevřít hraní','sessions/'+encodeURIComponent(s)))),panel('Události',timeline(d.timeline)));
    }else if(page==='accounts'&&!id){const count=(value:number)=>({value,status:'measured' as const,unit:'count' as const});host.append(el('p','Anonymní prohlížeč není Google účet. Opakované přihlášení není nová registrace.','muted'),
        cards([{title:'Nové Google registrace',metric:count(d.newRegistrations),detail:'Za vybrané období'},
            {title:'Google účty celkem',metric:count(d.totalAccounts),detail:`${d.linkedPlayers} propojených herních profilů`},
            {title:'Účty s hraním',metric:count(d.activeAccounts),detail:`${d.unlinkedAccounts} účtů bez propojeného hráče`}]),
        chart('Registrace po dnech',d.daily,[['registrations','Registrace']]),
        panel('Google účty',table(['Účet','Registrace','Poslední potvrzený login','Herní profily','Poslední hraní'],d.items.map((a:any)=>[link(a.email,'accounts/'+encodeURIComponent(a.id)),date(a.registeredAt),date(a.lastLoginAt),a.profiles.map((p:any)=>p.name).join(', ')||'Bez propojení',date(a.lastActivityAt)])),pager(d,next)));
    }else if(page==='accounts'&&id)host.append(panel(d.email,el('p',`Registrace ${date(d.registeredAt)} · poslední login ${date(d.lastLoginAt)}`),
        table(['Propojený hráč'],d.profiles.map((p:any)=>[link(p.name,'players/'+p.id)]))));
    else if(page==='data-quality'){
        host.append(panel('Pokrytí měření',table(['Měření','Od','Verze','Stav'],d.coverage.map((c:any)=>[c.capability,date(c.changedAt),String(c.version),badge(c.enabled?'Zapnuto':'Vypnuto',c.enabled?'good':'warn')]))),
            panel('Sjednocení dat',table(['Zdrojové profily','Sjednocené profily','Raw odpovědi','Logické odpovědi','Historické odpovědi'],[[d.rawProfiles,d.canonicalProfiles,d.rawAttempts,d.logicalAttempts,d.oldAnswers]]),
                el('p',`Pozdní uploady: ${d.lateUploads}. Sezení bez doloženého konce: ${d.sessionsWithoutEnd}.`)),
            panel('Nejasnosti a konflikty',table(['Typ','Poprvé','Naposledy','Výskyty','Stav','Evidence'],d.issues.map((i:any)=>{const details=el('details');details.append(el('summary','Zdroje'),el('pre',JSON.stringify(i.details,null,2)));
                return [i.kind,date(i.first_seen_at),date(i.last_seen_at),String(i.occurrences),i.status,details];}))),
            panel('Příjem událostí',table(['Hodina','Verze klienta','Přijato','Retry','Konflikt'],d.ingest.slice(0,48).map((i:any)=>[date(i.bucket),i.uploader_release,String(i.accepted),String(i.duplicates),String(i.conflicts)]))));
        const annotations=await api.report('annotations',query),items=annotations.data.items;host.append(panel('Označení a audit',table(['Cíl','Označení','Důvod','Čas','Akce'],items.map((a:any)=>[
            `${a.target_type} · ${a.target_id}`,a.label,a.reason,date(a.created_at),a.action==='revoke'?badge('Odvoláno'):items.some((b:any)=>b.reverts_id===a.id)?badge('Odvoláno'):
                button('Odvolat',async()=>{const reason=prompt('Důvod odvolání označení:');if(!reason)return;try{await api.revoke(a.id,reason);refresh();}catch(e){alert(e instanceof Error?e.message:'Chyba');}})]))));
    }else host.append(empty('Stránka neexistuje.'));
    host.dataset.environment=report.meta.environment;host.append(metadata(report.meta));return host;
}

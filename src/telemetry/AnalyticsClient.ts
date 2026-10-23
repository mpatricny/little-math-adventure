import { analyticsTiming, type ClientEvent, type EventKind, type Participant } from '../../server/src/contracts/analytics';
import { gameplayId, type GameplayAttempt, type CapturedGameplay } from './gameplayData';
import { openGameplayStore, type GameplayStore } from './GameplayStore';
import { openAnalyticsStore, type AnalyticsStore } from './AnalyticsStore';
import { ActivityClock } from './ActivityClock';

const consentKey='cislokraj-analytics-permission-v1';
export function measurementAllowed(){try{return JSON.parse(localStorage.getItem(consentKey)??'null')?.allowed===true;}catch{return false;}}
export function measurementSince(){try{return Number(JSON.parse(localStorage.getItem(consentKey)??'null')?.since??Infinity);}catch{return Infinity;}}
export function setMeasurementAllowed(allowed:boolean){try{localStorage.setItem(consentKey,JSON.stringify({allowed,since:Date.now()}));}catch{}
    window.dispatchEvent(new Event('cislokraj-measurement-changed'));}
export type GameContext={profileId:string;role:'A'|'B';scene:string;slot:number;name:string;participants:Participant[]};
export class AnalyticsClient {
    readonly clock=new ActivityClock(); readonly runId=gameplayId(); readonly tabId=gameplayId();
    private seq=0;private visitorId='';private visitId='';private sessionId:string|undefined;
    private store:AnalyticsStore|undefined;private gameplay:GameplayStore|undefined;private ready:Promise<void>|undefined;
    private enabled=false;private disposed=false;private flushing=false;private retryAt=0;private context:GameContext|undefined;
    private loading=false;private paused=false;private lastInput=Date.now();private hiddenAt=0;private windows:any[]=[];
    private timer:number|undefined;private failures=0;private sessionKey='';private pendingTasks=new Set<Promise<unknown>>();
    private beginning:Promise<void>=Promise.resolve();private generation=0;
    private menuScene:string|undefined;private lastScene:{scene:string;region:string;room?:string}|undefined;private dropped=0;
    private errorWindows=new Map<string,number>();
    private authContextAt=0;private authContextVisit='';private linkingAuth=false;
    constructor(private surface:'web'|'game',private release=import.meta.env.VITE_APP_RELEASE??'development'){}
    private track<T>(p:Promise<T>):Promise<T>{this.pendingTasks.add(p);void p.finally(()=>this.pendingTasks.delete(p)).catch(()=>{});return p;}
    start(){
        const refresh=()=>void this.refresh();
        window.addEventListener('cislokraj-measurement-changed',refresh);window.addEventListener('storage',this.onStorage);
        window.addEventListener('online',this.onOnline);window.addEventListener('pagehide',this.onPageHide);
        document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('pointerdown',this.onInput,{passive:true});
        document.addEventListener('keydown',this.onInput,{passive:true});
        this.timer=window.setInterval(()=>this.tick(),1000);void this.refresh();
        return ()=>{this.disposed=true;clearInterval(this.timer);window.removeEventListener('cislokraj-measurement-changed',refresh);
            window.removeEventListener('storage',this.onStorage);window.removeEventListener('online',this.onOnline);window.removeEventListener('pagehide',this.onPageHide);
            document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('pointerdown',this.onInput);document.removeEventListener('keydown',this.onInput);
            this.end('destroy');void Promise.allSettled([...this.pendingTasks]).then(()=>{this.store?.close();this.gameplay?.close();});};
    }
    private onStorage=(e:StorageEvent)=>{if(e.key===consentKey)void this.refresh();};
    private onOnline=()=>{this.retryAt=0;this.failures=0;if(!measurementAllowed())this.clearAuthContext();void this.flush();};
    private onInput=()=>{this.lastInput=Date.now();if(this.enabled&&this.visitId)this.touchVisit();};
    private onPageHide=()=>{
        this.tick();this.flushWindows();let tab='';try{tab=sessionStorage.getItem('cislokraj-play-lease-key')??'';if(this.sessionId)sessionStorage.setItem('cislokraj-play-resume-run',this.runId);}catch{}
        if(tab)void this.store?.updateMeta<any>(`session:${tab}`,old=>old?.run===this.runId?{...old,released:true,last:Date.now()}:old).catch(()=>{});
        void this.flush(true);
    };
    private onVisibility=()=>{
        this.tick();if(document.hidden)this.hiddenAt=Date.now();
        else if(this.hiddenAt&&Date.now()-this.hiddenAt>=analyticsTiming.sessionGapMs){this.end('pause_timeout');if(this.context)void this.begin(this.context);}
        this.emit('visibility_changed',{hidden:document.hidden});this.flushWindows();void this.flush();
    };
    private async refresh(){
        if(this.disposed)return;
        if(!measurementAllowed()){
            if(this.enabled)this.clearAuthContext();
            this.generation++;this.enabled=false;this.windows=[];this.sessionId=undefined;this.sessionKey='';
            await Promise.allSettled([...this.pendingTasks]);await this.store?.clear();await this.gameplay?.clearPending?.();return;
        }
        if(this.enabled)return;
        if(this.ready)return this.ready;
        this.ready=this.initialize().catch(()=>{}).finally(()=>{this.ready=undefined;});return this.ready;
    }
    private async initialize(){
        const response=await fetch('/v1/analytics/config',{cache:'no-store',signal:AbortSignal.timeout(5000)}).catch(()=>null);
        let config:any=null;if(response?.ok)config=await response.json();
        // Last permitted configuration enables already-authorized offline play only.
        if(config){try{localStorage.setItem('cislokraj-analytics-config',JSON.stringify(config));}catch{}}
        else try{config=JSON.parse(localStorage.getItem('cislokraj-analytics-config')??'null');}catch{}
        if(!config?.enabled||!measurementAllowed()||this.disposed)return;
        this.store??=await openAnalyticsStore();this.gameplay??=await openGameplayStore();
        const now=Date.now();this.visitorId=await this.store.updateMeta<string>('visitorId',v=>v??gameplayId());
        const visit=await this.store.updateMeta<{id:string;lastInput:number}>('visit',v=>v&&now-v.lastInput<analyticsTiming.sessionGapMs?v:{id:gameplayId(),lastInput:now});
        this.visitId=visit.id;this.enabled=true;this.lastInput=now;
        window.dispatchEvent(new Event('cislokraj-analytics-config-changed'));
        this.emit('page_view',{route:this.surface==='web'?'/':'/hra/',referrer:this.referrer(),device:this.device(),...this.utm()});
        if(this.menuScene)this.emit('game_menu_ready',{scene:this.menuScene});
        if(this.context)await this.begin(this.context);
        if(this.lastScene&&this.context)this.emit('scene_entered',this.lastScene,this.context.profileId);
        void this.flush();
    }
    private device(){return window.matchMedia('(pointer: coarse)').matches?(Math.min(innerWidth,innerHeight)<600?'mobile':'tablet'):'desktop';}
    private referrer(){try{return document.referrer?new URL(document.referrer).hostname:'';}catch{return '';}}
    private utm(){const q=new URLSearchParams(location.search),result:Record<string,string>={};
        for(const [query,key]of [['utm_source','utmSource'],['utm_medium','utmMedium'],['utm_campaign','utmCampaign']]){const value=q.get(query);if(value)result[key]=value.slice(0,160);}return result;}
    private touchVisit(){const now=Date.now();void this.store?.updateMeta<{id:string;lastInput:number}>('visit',v=>{
        if(v&&now-v.lastInput>=analyticsTiming.sessionGapMs)this.visitId=gameplayId();
        return {id:this.visitId,lastInput:now};}).catch(()=>{});}
    emit(kind:EventKind,payload:Record<string,unknown>,profileId?:string,encounterRunId?:string,dedupeKey?:string){
        if(!this.enabled||!measurementAllowed()||!this.store)return;
        if(['client_error','asset_error','save_error'].includes(kind)){
            const key=`${kind}:${payload.scene}:${payload.fingerprint}`,now=Date.now();
            if(now-(this.errorWindows.get(key)??0)<60_000)return;
            this.errorWindows.set(key,now);if(this.errorWindows.size>200)this.errorWindows.delete(this.errorWindows.keys().next().value!);
        }
        const event:ClientEvent={schemaVersion:1,id:gameplayId(),kind,visitorId:this.visitorId,visitId:this.visitId,runId:this.runId,
            seq:this.seq++,occurredAt:Date.now(),monotonicMs:performance.now(),sourceRelease:this.release,payload,
            ...(this.sessionId?{playSessionId:this.sessionId}:{}),...((profileId??this.context?.profileId)?{profileId:profileId??this.context?.profileId}:{}),...(encounterRunId?{encounterRunId}:{})};
        const store=this.store,generation=this.generation,roster=this.context?JSON.stringify(this.context.participants):'';
        const save=()=>{if(generation!==this.generation||!this.enabled||!measurementAllowed())return;
            if(!event.playSessionId&&roster&&roster===this.sessionKey)event.playSessionId=this.sessionId;
            return store.put(event,dedupeKey);};
        // Scene creation may finish before its lease transaction. Preserve occurrence time/order,
        // but attach the session only to the original roster, never to a subsequently selected child.
        void this.track(!event.playSessionId&&roster?this.beginning.then(save):Promise.resolve(save())).catch(()=>{this.dropped++;});
    }
    milestone(milestone:string,participants:Participant[]){this.emit('milestone_reached',{milestone,participants,origin:'earned'},
        participants.find(p=>p.role==='A')?.profileId,undefined,`milestone:${participants.map(p=>p.profileId).sort().join(':')}:${milestone}`);}
    begin(context:GameContext):Promise<void>{
        if(this.sessionId&&this.sessionKey!==JSON.stringify(context.participants))this.end('switch');
        this.context=context;
        const generation=this.generation;
        this.beginning=this.beginning.catch(()=>{}).then(()=>this.beginLease(context,generation));
        return this.beginning;
    }
    whenSessionReady(){return this.beginning;}
    sessionFor(participants:Participant[]){return this.sessionKey===JSON.stringify(participants)?this.sessionId:undefined;}
    isEnabled(){return this.enabled&&measurementAllowed();}
    async persist(){await Promise.allSettled([...this.pendingTasks]);}
    private async beginLease(context:GameContext,generation:number){
        if(generation!==this.generation||!this.enabled||!this.store)return;
        const key=JSON.stringify(context.participants);if(this.sessionId&&this.sessionKey===key)return;
        if(this.sessionId)this.end('switch');
        let tabKey:string,resumeRun='';try{tabKey=sessionStorage.getItem('cislokraj-play-tab')??gameplayId();sessionStorage.setItem('cislokraj-play-tab',tabKey);resumeRun=sessionStorage.getItem('cislokraj-play-resume-run')??'';}catch{tabKey=this.tabId;}
        const now=Date.now(),runId=this.runId;
        type Lease={id:string;key:string;run:string;last:number;ended:boolean;released?:boolean;resumed?:boolean;previousRunId?:string};
        const lease=await this.store.updateMeta<Lease>(`session:${tabKey}`,old=>{
            // A simultaneous cloned tab may share sessionStorage, but cannot take an active run's lease.
            const resume=old&&!old.ended&&old.key===key&&now-old.last<analyticsTiming.sessionGapMs&&(old.released||old.run===resumeRun||now-old.last>30_000);
            return {id:resume?old.id:gameplayId(),key,run:runId,last:now,ended:false,resumed:!!resume,...(resume?{previousRunId:old.run}:{})};});
        if(generation!==this.generation||!this.enabled||!measurementAllowed())return;
        this.sessionId=lease.id;this.sessionKey=key;this.clock.sample(Date.now(),performance.now(),this.state());
        try{sessionStorage.setItem('cislokraj-play-lease-key',tabKey);}catch{}
        this.emit(lease.resumed?'play_resumed':'play_started',{mode:context.participants.length===2?'coop':'solo',participants:context.participants,tabId:this.tabId,
            ...(lease.previousRunId?{previousRunId:lease.previousRunId}:{})},context.profileId);
        this.emit('profile_activated',{role:context.role},context.profileId);
    }
    end(reason:'menu'|'switch'|'pause_timeout'|'quit'|'destroy'){
        if(this.sessionId){this.flushWindows();this.emit('play_ended',{reason});const id=this.sessionId;
            let tab='';try{tab=sessionStorage.getItem('cislokraj-play-lease-key')??'';}catch{}
            if(tab)void this.store?.updateMeta<any>(`session:${tab}`,old=>old?.id===id?{...old,ended:true}:old).catch(()=>{});
        }this.sessionId=undefined;this.sessionKey='';if(reason==='menu'||reason==='quit')this.context=undefined;
    }
    setContext(context:GameContext){if(this.context?.profileId!==context.profileId){this.tick();this.flushWindows();}this.context=context;}
    setLoading(loading:boolean){if(this.loading===loading)return;this.tick();this.loading=loading;this.clock.sample(Date.now(),performance.now(),this.state());this.emit('loading_changed',{loading});}
    setPaused(paused:boolean){if(this.paused===paused)return;this.tick();this.paused=paused;this.clock.sample(Date.now(),performance.now(),this.state());this.emit('pause_changed',{paused});}
    menuReady(scene:string){this.menuScene=scene;this.lastScene=undefined;this.emit('game_menu_ready',{scene});}
    scene(scene:string,region:string,room?:string){this.menuScene=undefined;this.lastScene={scene,region,...(room?{room}:{})};if(this.context)this.context={...this.context,scene};this.emit('scene_entered',this.lastScene,this.context?.profileId);}
    contextSnapshot(){return this.context?{...this.context,participants:this.context.participants.map(p=>({...p})),sessionId:this.sessionId,runId:this.runId,release:this.release}:null;}
    private state(){return document.hidden?'hidden':this.loading?'loading':this.paused?'paused':this.sessionId?'game-active':
        this.surface==='web'&&Date.now()-this.lastInput<analyticsTiming.webIdleMs?'web-active':'paused';}
    private tick(){
        const now=Date.now();
        const window=this.clock.sample(now,performance.now(),this.state());if(!this.enabled)return;
        if(window&&!['hidden','paused'].includes(window.state)){window.uncertain=window.state==='game-active'&&now-this.lastInput>=analyticsTiming.uncertainMs;const last=this.windows.at(-1);
            if(last&&last.state===window.state&&last.uncertain===window.uncertain&&last.end===window.start&&last.durationMs+window.durationMs<60_000){last.end=window.end;last.durationMs+=window.durationMs;last.cumulativeMs=window.cumulativeMs;}
            else this.windows.push(window);}
        if(now-(this.lastFlush??0)>=analyticsTiming.heartbeatMs){this.flushWindows();void this.flush();this.lastFlush=now;
            let tab='';try{tab=sessionStorage.getItem('cislokraj-play-lease-key')??'';}catch{}
            if(tab&&this.sessionId)void this.store?.updateMeta<any>(`session:${tab}`,old=>old?.run===this.runId?{...old,last:now}:old).catch(()=>{});}
    }
    private lastFlush=0;
    private flushWindows(){for(const w of this.windows)this.emit('activity_window',w);this.windows=[];}
    async queueAnswer(profile:CapturedGameplay,attempt:GameplayAttempt){if(!this.enabled||!measurementAllowed()||!this.gameplay)return;
        await this.track(this.gameplay.enqueueAttempt!(profile,attempt));void this.flush();}
    async linkAnswer(profileId:string,presentationId:string,legacyEventKey:string){if(!this.enabled||!this.store)return;
        await this.track(this.store.addLink(profileId,{presentationId,legacyEventKey}));void this.flush();}
    private clearAuthContext(){void fetch('/v1/analytics/auth-context',{method:'DELETE',credentials:'include',keepalive:true}).catch(()=>{});this.authContextAt=0;this.authContextVisit='';}
    async authContext(){if(!this.enabled||!measurementAllowed()||!this.gameplay||this.linkingAuth||
        this.authContextVisit===this.visitId&&Date.now()-this.authContextAt<600_000)return;
        this.linkingAuth=true;const visit=this.visitId;
        try{const token=await this.gameplay.browserToken(),response=await fetch('/v1/analytics/auth-context',{method:'POST',credentials:'include',keepalive:true,
            headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({visitId:visit}),signal:AbortSignal.timeout(2000)});
            if(response.ok){if(!this.isEnabled())this.clearAuthContext();else{this.authContextAt=Date.now();this.authContextVisit=visit;}}}
        catch{}finally{this.linkingAuth=false;}}
    async flush(keepalive=false){
        if(!this.enabled||!measurementAllowed()||this.disposed||!this.store||!this.gameplay||this.flushing||Date.now()<this.retryAt)return;
        this.flushing=true;
        try {
            await Promise.allSettled([...this.pendingTasks]);if(!this.enabled||!measurementAllowed())return;
            const headers={'Content-Type':'application/json',Authorization:`Bearer ${await this.gameplay.browserToken()}`};
            const post=async(path:string,body:unknown)=>fetch(path,{method:'POST',credentials:'include',headers,body:JSON.stringify(body),
                keepalive:keepalive&&JSON.stringify(body).length<60_000,signal:AbortSignal.timeout(8000)});
            const checked=(response:Response)=>{if(response.ok)return;
                const after=response.headers.get('Retry-After'),delay=after?(Number.isFinite(Number(after))?Number(after)*1000:Date.parse(after)-Date.now()):0;
                if(delay>0)this.retryAt=Math.max(this.retryAt,Date.now()+Math.min(delay,3_600_000));throw new Error('upload_http_'+response.status);};
            const identity=await post('/v1/gameplay/session',{deviceId:await this.gameplay.deviceId()});checked(identity);
            const {accountId}=await identity.json();
            for(const profile of await this.gameplay.profiles()){
                const pending=await this.gameplay.pending(profile.id),attempts=pending.filter(a=>!!a.details.observation&&a.timestamp>=measurementSince());
                const links=await this.store.pendingLinks(profile.id);if(!attempts.length&&!links.length)continue;
                if(!await this.gameplay.bind(profile.id,accountId))continue;
                const response=await post('/v1/gameplay/batch',{version:2,accountId,profileId:profile.id,deviceId:await this.gameplay.deviceId(),
                    slotNumber:profile.slotNumber,revision:profile.revision,savedAt:profile.savedAt,release:this.release,attempts,observationLinks:links});
                if(response.status===400){const {observedAttemptSchema}=await import('../../server/src/contracts/gameplaySchema');
                    const invalid=attempts.filter(a=>!observedAttemptSchema.safeParse(a).success||(a.details.observation as any)?.profileId!==profile.id);
                    if(invalid.length){await this.gameplay.quarantine?.(profile.id,invalid.map(a=>a.eventKey),'invalid_observation');
                        this.emit('coverage_gap',{reason:'invalid_observation',dropped:invalid.length});}}
                checked(response);const receipt=await response.json();
                if(receipt.stored!==true||receipt.profileId!==profile.id||receipt.revision!==profile.revision||!Array.isArray(receipt.eventKeys)||
                    receipt.eventKeys.length!==attempts.length||!attempts.every(a=>receipt.eventKeys.includes(a.eventKey)))throw new Error('receipt');
                await this.gameplay.acknowledge(profile.id,profile.acknowledgedRevision,receipt.eventKeys);
                if(Array.isArray(receipt.observationLinks))await this.store.ackLinks(profile.id,receipt.observationLinks.map((l:any)=>l.presentationId));
            }
            const pending=await this.store.pending(),events:ClientEvent[]=[];let bytes=128+this.release.length;
            for(const event of pending){const size=new TextEncoder().encode(JSON.stringify(event)).length+1;if(bytes+size>240*1024)break;events.push(event);bytes+=size;}
            if(events.length){const response=await post('/v1/analytics/batch',{version:1,release:this.release,events});
                if(response.status===400){const {clientEventSchema}=await import('../../server/src/domain/analytics/contracts');
                    const invalid=events.filter(e=>!clientEventSchema.safeParse(e).success);
                    for(const event of invalid)await this.store.quarantine(event,'invalid_event');
                    if(invalid.length)this.emit('coverage_gap',{reason:'invalid_event',dropped:invalid.length});}
                checked(response);const receipt=await response.json();
                const ack=[...(receipt.acceptedIds??[]),...(receipt.duplicateIds??[]),...(receipt.quarantinedIds??[])];
                if(receipt.stored!==true||ack.length!==events.length||new Set(ack).size!==ack.length||!events.every(e=>ack.includes(e.id)))throw new Error('receipt');
                await this.store.ack(ack);void this.authContext();}
            this.failures=0;
            if(this.dropped){const count=this.dropped;this.dropped=0;this.emit('coverage_gap',{reason:'local_queue_unavailable',dropped:count});}
        }catch{
            this.retryAt=Math.max(this.retryAt,Date.now()+Math.min(60_000,5000*2**this.failures++)*(0.8+Math.random()*0.4));}
        finally{this.flushing=false;}
    }
}
let client:AnalyticsClient|undefined;
export function analytics(){return client;}
export function startAnalytics(surface:'web'|'game'){client=new AnalyticsClient(surface);return client.start();}

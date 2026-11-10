import type { ClientEvent } from '../../server/src/contracts/analytics';
export const idbResult=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export const idbDone=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});
export async function openAnalyticsStore() {
    const request=indexedDB.open('cislokraj-analytics-v1',1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('events',{keyPath:'id'});db.createObjectStore('meta');};
    const db=await idbResult(request);db.onversionchange=()=>db.close();
    return {
        async put(event:ClientEvent,dedupeKey?:string){const tx=db.transaction(['events','meta'],'readwrite'),done=idbDone(tx),store=tx.objectStore('events'),meta=tx.objectStore('meta');
            if(dedupeKey&&await idbResult(meta.get('once:'+dedupeKey))){await done;return;}
            const bytes=new TextEncoder().encode(JSON.stringify(event)).length;
            const queuedBytes=Number(await idbResult(meta.get('queuedBytes'))??0);
            if(await idbResult(store.count())>=20_000||queuedBytes+bytes>20*1024*1024){tx.abort();await done.catch(()=>{});throw new Error('analytics_queue_full');}
            store.put(event);meta.put(queuedBytes+bytes,'queuedBytes');if(dedupeKey)meta.put(true,'once:'+dedupeKey);await done;},
        async pending(){return await idbResult(db.transaction('events').objectStore('events').getAll(undefined,100)) as ClientEvent[];},
        async ack(ids:string[]){const tx=db.transaction(['events','meta'],'readwrite'),done=idbDone(tx),events=tx.objectStore('events'),meta=tx.objectStore('meta');
            let bytes=Number(await idbResult(meta.get('queuedBytes'))??0);
            for(const id of new Set(ids)){const old=await idbResult(events.get(id));if(old)bytes-=new TextEncoder().encode(JSON.stringify(old)).length;events.delete(id);}
            meta.put(Math.max(0,bytes),'queuedBytes');await done;},
        async quarantine(event:ClientEvent,reason:string){const tx=db.transaction(['events','meta'],'readwrite'),done=idbDone(tx),events=tx.objectStore('events'),meta=tx.objectStore('meta');
            const old=await idbResult(events.get(event.id));if(!old){await done;return;}
            const history=await idbResult(meta.get('quarantine'))??[];
            meta.put([...history,{event:old,reason,at:Date.now()}].slice(-100),'quarantine');
            const bytes=Number(await idbResult(meta.get('queuedBytes'))??0)-new TextEncoder().encode(JSON.stringify(old)).length;
            meta.put(Math.max(0,bytes),'queuedBytes');events.delete(event.id);await done;},
        async clear(){const tx=db.transaction(['events','meta'],'readwrite'),done=idbDone(tx);tx.objectStore('events').clear();tx.objectStore('meta').clear();await done;},
        async updateMeta<T>(key:string,update:(old:T|undefined)=>T){const tx=db.transaction('meta','readwrite'),done=idbDone(tx),store=tx.objectStore('meta');
            const value=update(await idbResult(store.get(key)));store.put(value,key);await done;return value;},
        async pendingLinks(profileId:string){return (await idbResult(db.transaction('meta').objectStore('meta').get(`links:${profileId}`))??[]) as Array<{presentationId:string;legacyEventKey:string}>;},
        async addLink(profileId:string,link:{presentationId:string;legacyEventKey:string}){return this.updateMeta<Array<typeof link>>(`links:${profileId}`,old=>
            [...(old??[]).filter(x=>x.presentationId!==link.presentationId),link]);},
        async ackLinks(profileId:string,ids:string[]){return this.updateMeta<Array<{presentationId:string;legacyEventKey:string}>>(`links:${profileId}`,old=>(old??[]).filter(x=>!ids.includes(x.presentationId)));},
        close(){db.close();},
    };
}
export type AnalyticsStore=Awaited<ReturnType<typeof openAnalyticsStore>>;

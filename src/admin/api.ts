import type { Report } from '../../server/src/contracts/analytics';
export class ApiError extends Error {constructor(readonly status:number){super(status===401?'Přihlášení vypršelo.':status===403?'Tento účet nemá přístup.':status===503?'Administrace zatím není zapnutá.':status===400?'Neplatný filtr.':'Data se nepodařilo načíst.');}}
export class AdminApi {
    private controller=new AbortController();csrf='';
    cancel(){this.controller.abort();this.controller=new AbortController();}
    async request<T>(path:string,options:RequestInit={}):Promise<T>{const signal=this.controller.signal;
        const timeout=new AbortController(),abort=()=>timeout.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,10_000);
        try{const response=await fetch('/v1/admin/'+path,{...options,credentials:'include',cache:'no-store',signal:timeout.signal,
            headers:{Accept:'application/json',...options.headers}});
            if(!response.ok)throw new ApiError(response.status);return response.json();
        }catch(e){if(timeout.signal.aborted&&!signal.aborted)throw new Error('API neodpovídá. Zkus Obnovit.');throw e;}
        finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}}
    report<T=any>(resource:string,query:URLSearchParams){return this.request<Report<T>>(resource+(query.size?'?'+query:''));}
    annotate(input:unknown){return this.request<{id:string}>('annotations',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf},body:JSON.stringify(input)});}
    revoke(id:string,reason:string){return this.request('annotations/'+encodeURIComponent(id)+'/revoke',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf},
        body:JSON.stringify({mutationId:crypto.randomUUID(),reason})});}
}

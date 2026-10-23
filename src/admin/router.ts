export const navigation=[['','Přehled'],['traffic','Návštěvnost'],['players','Hráči'],['sessions','Hraní'],['accounts','Účty'],['data-quality','Stav dat']] as const;
export function validAdminPath(path:string){return /^\/admin\/(?:traffic|players(?:\/[^/?#]+)?|sessions(?:\/[^/?#]+)?|visits(?:\/[^/?#]+)?|accounts(?:\/[^/?#]+)?|data-quality)?\/?$/.test(path);}
export function currentRoute(){const path=location.pathname==='/admin.html'?'/admin/':location.pathname;
    if(!validAdminPath(path))return {page:'not-found',id:null};
    const [page='',encoded]=path.replace(/^\/admin\//,'').replace(/\/$/,'').split('/');
    let id:string|null=null;try{id=encoded?decodeURIComponent(encoded):null;}catch{return {page:'not-found',id:null};}
    return {page:page||'overview',id};}
export function href(path:string,extra:Record<string,string|null>={}){const q=new URLSearchParams(location.search);q.delete('cursor');q.delete('tab');q.delete('participant');
    for(const [key,value]of Object.entries(extra)){if(value===null)q.delete(key);else q.set(key,value);}
    return `/admin/${path}${q.size?'?'+q:''}`;}
export function navigate(url:string){const target=new URL(url,location.origin);if(target.origin!==location.origin||!validAdminPath(target.pathname))return;
    history.pushState(null,'',target.pathname+target.search);window.dispatchEvent(new PopStateEvent('popstate'));}

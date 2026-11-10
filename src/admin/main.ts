import './styles.css';
import { signOutGoogle, startGoogleSignIn } from '../auth/googleAuth';
import { AdminApi, ApiError } from './api';
import { currentRoute, navigation, navigate, validAdminPath } from './router';
import { button, el, link, badge } from './components';
import { filters } from './filters';
import { renderPage } from './pages';

const root=document.getElementById('admin-root')!,api=new AdminApi();let epoch=0,busy=false,authorized=false,navigationCollapsed=false;
function clear(){epoch++;api.cancel();api.csrf='';authorized=false;root.replaceChildren(el('p','Ověřuji přístup…','initial'));}
function gate(error:unknown){authorized=false;api.csrf='';const host=el('main',undefined,'gate');host.append(el('span','ČÍSLOKRAJ','eyebrow'),el('h1','Statistiky'));
    const state=error instanceof ApiError?error.status:0;host.append(el('p',error instanceof Error?error.message:'Administrace není dostupná.'));
    if(state===401){host.append(button('Přihlásit přes Google',async()=>{try{const path=validAdminPath(location.pathname)?location.pathname:'/admin/';
        sessionStorage.setItem('cislokraj-admin-return',path+location.search);location.assign(await startGoogleSignIn('/admin/'));}catch(e){host.append(el('p',e instanceof Error?e.message:'Přihlášení se nepodařilo.','warning'));}}));}
    else if(state===403)host.append(button('Odhlásit a změnit účet',logout));
    else host.append(button('Opakovat',()=>void load(true)));host.append(el('a','Zpět na web'));(host.lastChild as HTMLAnchorElement).href='/';root.replaceChildren(host);}
async function logout(){clear();try{await signOutGoogle();gate(new ApiError(401));}catch{gate(new Error('Odhlášení se nepodařilo. Zkus to znovu.'));}}
async function load(recheck=false,quiet=false){if(busy&&!recheck)return;const scroll=quiet?[window.scrollX,window.scrollY]:null;busy=true;api.cancel();const own=++epoch;
    try{
        if(recheck||!authorized){const bootstrap=await api.request<any>('bootstrap');if(own!==epoch)return;api.csrf=bootstrap.csrfToken;authorized=true;
            const saved=sessionStorage.getItem('cislokraj-admin-return');if(saved){sessionStorage.removeItem('cislokraj-admin-return');const target=new URL(saved,location.origin);
                if(target.origin===location.origin&&validAdminPath(target.pathname))history.replaceState(null,'',target.pathname+target.search);}}
        const route=currentRoute();if(route.page==='not-found'){gate(new Error('Stránka neexistuje.'));return;}
        const shell=el('div',undefined,'shell'),sidebar=el('aside',undefined,'sidebar'),brand=link('Číslokraj','');brand.className='brand';sidebar.append(brand,el('span','STATISTIKY','eyebrow'));
        const nav=el('nav');nav.setAttribute('aria-label','Administrace');for(const [path,title]of navigation){const a=link(title,path);if((path||'overview')===route.page)a.setAttribute('aria-current','page');nav.append(a);}sidebar.append(nav);
        const body=el('main'),header=el('header',undefined,'topbar'),environment=badge('Ověřuji prostředí');
        const menu=button('Menu',()=>{navigationCollapsed=!navigationCollapsed;shell.classList.toggle('navigation-hidden',navigationCollapsed);menu.setAttribute('aria-expanded',String(!navigationCollapsed));});
        menu.className='menu-toggle';menu.setAttribute('aria-expanded',String(!navigationCollapsed));shell.classList.toggle('navigation-hidden',navigationCollapsed);
        header.append(menu,el('span','Soukromý přehled'),environment,button('Odhlásit',logout));body.append(header,filters(()=>void load(true)));
        const loading=el('p','Načítám data…','empty');body.append(loading);shell.append(sidebar,body);if(own!==epoch)return;root.replaceChildren(shell);
        const content=await renderPage(api,route.page,route.id,()=>void load(true));if(own!==epoch)return;loading.replaceWith(content);environment.textContent=content.dataset.environment==='prd'?'PRODUKCE':'DEV';
        if(scroll)window.scrollTo(scroll[0],scroll[1]);
    }catch(e){if(own!==epoch||e instanceof DOMException&&e.name==='AbortError')return;
        if(e instanceof ApiError&&(e.status===401||e.status===403||e.status===503))gate(e);
        else {root.querySelector('.empty')?.remove();const error=el('section',undefined,'error');error.append(el('h2','Načtení se nezdařilo'),el('p',e instanceof Error?e.message:'API neodpovídá. Není to nulový počet hráčů.'),button('Opakovat',()=>void load(true)));(root.querySelector('main')??root).append(error);}
    }finally{if(own===epoch)busy=false;}
}
document.addEventListener('click',e=>{const a=(e.target as Element).closest<HTMLAnchorElement>('a[data-internal]');if(!a||e.defaultPrevented||(e as MouseEvent).metaKey||(e as MouseEvent).ctrlKey)return;
    e.preventDefault();navigate(a.href);});
window.addEventListener('popstate',()=>{busy=false;void load();});
window.addEventListener('pagehide',clear);
window.addEventListener('pageshow',e=>{if(e.persisted){clear();busy=false;void load(true);}});
window.addEventListener('cislokraj-auth-changed',()=>{clear();busy=false;void load(true);});
setInterval(()=>{if(!document.hidden&&authorized&&!document.querySelector('dialog[open],details[open]')&&
    !document.activeElement?.matches('input,select,textarea'))void load(true,true);},30_000);
void load(true);

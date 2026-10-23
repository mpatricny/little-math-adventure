import { analytics, measurementAllowed, setMeasurementAllowed, startAnalytics } from './AnalyticsClient';
startAnalytics('web');
const status=document.querySelector<HTMLElement>('[data-measurement-status]');
function render(){if(status)status.textContent=measurementAllowed()?'Měření je na tomto zařízení povolené.':'Měření je vypnuté. Hra i místní ukládání fungují bez něj.';}
document.querySelector('[data-measurement-allow]')?.addEventListener('click',()=>{setMeasurementAllowed(true);render();});
document.querySelector('[data-measurement-decline]')?.addEventListener('click',()=>{setMeasurementAllowed(false);render();});
window.addEventListener('cislokraj-measurement-changed',render);window.addEventListener('storage',render);render();
document.querySelectorAll<HTMLAnchorElement>('a[href="/hra/"]').forEach((anchor,index)=>anchor.addEventListener('click',async event=>{
    const client=analytics();client?.emit('play_clicked',{placement:['header','hero','account','footer'][index]??'other'});
    if(!client?.isEnabled()||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    // Wait only for the local durable write, never for a network response.
    await Promise.race([client.persist(),new Promise(resolve=>setTimeout(resolve,200))]);
    location.assign(anchor.href);
}));

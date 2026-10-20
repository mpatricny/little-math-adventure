const style = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#152219;color:#f6ebca;font:18px Arial,sans-serif}
main{max-width:760px;margin:24px auto;padding:24px}h1{font:700 32px Georgia,serif}h2{font:700 22px Georgia,serif}
section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:20px 0}
article{border:2px solid #ad884f;border-radius:12px;padding:16px;background:#23362b;overflow-wrap:anywhere}
article strong{font:700 24px Georgia,serif}article div{margin-top:10px}nav{display:flex;gap:14px;flex-wrap:wrap}
button,a{font:700 18px Arial,sans-serif;min-height:52px;padding:14px 20px;border:2px solid #c19a58;border-radius:10px;background:#f0d394;color:#1c281f;text-decoration:none;cursor:pointer}
button:hover,a:hover{background:#ffe8b7}button:active,a:active{box-shadow:inset 0 3px 0 #9b7a43}button:disabled{opacity:.5;cursor:default}
label{display:flex;align-items:center;min-height:44px}
output{display:block;min-height:52px;padding:18px 0;font-weight:bold}small{color:#d7d3ba}input{width:22px;height:22px;margin-right:12px}
</style>`;

export function devSaveManagePage() {
    return `<!doctype html><html lang="cs"><meta charset="utf-8"><title>Uložené hry</title>${style}
<main><h1>💾 Uložené hry</h1><h2>🖥 Na Macu</h2><section id="profiles"></section>
<nav><button id="backup">💾 ZÁLOHOVAT</button><button id="restore">↩ OBNOVIT</button><a href="/">▶ HRÁT</a></nav>
<output id="status" aria-live="polite"></output></main>
<script type="module">
import { readDevSaves, fetchDevCatalog, captureDevSaves, restoreDevSaves } from '/src/systems/DevSaveSync.ts';
import { devSaveRollbackReasons } from '/src/systems/devSaveProgress.mjs';
const profiles=document.getElementById('profiles'),status=document.getElementById('status');
let catalog;const selections=new Set();
async function refresh(){catalog=await fetchDevCatalog();const local=readDevSaves();profiles.replaceChildren();selections.clear();
 for(const record of catalog.records){const card=document.createElement('article'),label=document.createElement('label'),box=document.createElement('input'),name=document.createElement('strong'),level=document.createElement('div'),date=document.createElement('div');
 box.type='checkbox';box.checked=true;selections.add(record.profileId);box.onchange=()=>box.checked?selections.add(record.profileId):selections.delete(record.profileId);
 name.textContent=record.save.player.name;level.textContent='⭐ '+record.save.player.level;date.textContent=new Date(record.save.timestamp).toLocaleString('cs-CZ');
 label.append(box,name);card.append(label,level,date);
 const here=local.find(entry=>entry.save.player.gameplayProfileId===record.profileId);
 if(here&&devSaveRollbackReasons(here.save,record.save).length){const warning=document.createElement('div');warning.textContent='⚠ STARŠÍ NA MACU';warning.style.color='#ffd391';card.append(warning);}
 profiles.append(card);}
 if(!catalog.records.length)status.textContent='Žádná záloha';}
async function action(button,work){button.disabled=true;status.textContent='⏳';try{await work();status.textContent='✓ HOTOVO';}catch(error){status.textContent='⚠ '+error.message;}finally{button.disabled=false;}}
document.getElementById('backup').onclick=event=>action(event.currentTarget,async()=>{await captureDevSaves(readDevSaves(),catalog);await refresh();});
document.getElementById('restore').onclick=event=>action(event.currentTarget,async()=>{await restoreDevSaves(catalog.records.filter(record=>selections.has(record.profileId)),catalog.serverId);});
refresh().catch(()=>status.textContent='⚠ Mac nedostupný');
</script></html>`;
}

/** Standalone rescue page: reads the old origin without starting or upgrading a game. */
export function devSaveRecoveryPage() {
    return `<!doctype html><html lang="cs"><meta charset="utf-8"><title>Záloha z tabletu</title>${style}
<main><h1>💾 Záloha z tabletu</h1><section id="profiles"></section><nav><button id="capture">💾 ZÁLOHOVAT</button></nav><output id="status" aria-live="polite"></output></main>
<script>
const prefix='littleMathAdventure_slot_',profiles=document.getElementById('profiles'),status=document.getElementById('status'),button=document.getElementById('capture');
const saves=[];for(let sourceSlot=0;sourceSlot<8;sourceSlot++){const raw=localStorage.getItem(prefix+sourceSlot);if(!raw)continue;try{const save=JSON.parse(raw);if(!save.player||!save.mathStats)throw Error();saves.push({sourceSlot,save,raw});const card=document.createElement('article'),name=document.createElement('strong'),level=document.createElement('div'),date=document.createElement('div');name.textContent=save.player.name;level.textContent='⭐ '+save.player.level;date.textContent=new Date(save.timestamp).toLocaleString('cs-CZ');card.append(name,level,date);profiles.append(card);}catch{status.textContent='⚠ Poškozené uložení';button.disabled=true;}}
if(!saves.length){status.textContent='Žádné uložené hry';button.disabled=true;}
button.onclick=async()=>{button.disabled=true;status.textContent='⏳';try{
 const response=await fetch('/__dev-saves/api');if(!response.ok)throw Error('Mac nedostupný');const catalog=await response.json();
 const writes=saves.map(({sourceSlot,save})=>{if(!save.player.gameplayProfileId)throw Error('Chybí identita');return {sourceSlot,save,baseRevision:catalog.records.find(record=>record.profileId===save.player.gameplayProfileId)?.revision??0};});
 if(saves.some(entry=>localStorage.getItem(prefix+entry.sourceSlot)!==entry.raw))throw Error('Hra se změnila');
 const result=await fetch('/__dev-saves/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'commit',serverId:catalog.serverId,writes})});
 if(!result.ok){const error=await result.json();throw Error(error.error==='older_progress'?'Starší uložená hra':result.status===409?'Dvě verze hry':'Záloha selhala');}status.textContent='✓ ULOŽENO NA MACU';
 }catch(error){status.textContent='⚠ '+error.message;button.disabled=false;}};
</script></html>`;
}

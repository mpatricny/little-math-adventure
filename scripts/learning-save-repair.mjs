import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// A reviewed local plan changes mastery only. It never imports an older player
// object or guesses progress from a name, combat stats or the total answer count.
export function learningStatsHash(stats) {
    return createHash('sha256').update(JSON.stringify(stats)).digest('hex');
}

export function prepareLearningRepair(plan, bundle) {
    if (bundle.id !== plan.id || !Array.isArray(bundle.saves)
        || bundle.saves.length !== plan.entries.length) throw new Error('Neodpovídající záloha.');
    return plan.entries.map(entry => {
        const matches = bundle.saves.filter(save => save.sourceSlot === entry.sourceSlot);
        const save = matches[0]?.save;
        if (matches.length !== 1 || save?.player?.name !== entry.playerName || !save.mathStats) {
            throw new Error('Na tomto zařízení nejsou očekávané profily. Nic se nezměnilo.');
        }
        const hash = learningStatsHash(save.mathStats);
        if (hash !== entry.beforeHash && hash !== entry.afterHash) {
            throw new Error('Od zálohy přibylo hraní nebo se změnil postup. Nic se nezměnilo; ulož novou diagnostickou zálohu.');
        }
        const repaired = structuredClone(save);
        repaired.mathStats.masteryData = structuredClone(entry.masteryData);
        if (learningStatsHash(repaired.mathStats) !== entry.afterHash) throw new Error('Neplatný plán opravy.');
        return { sourceSlot: entry.sourceSlot, save: repaired };
    });
}

function pageHtml(plan) {
    // Only the summary and slot numbers are embedded, never save contents.
    const info = JSON.stringify({ id: plan.id, summary: plan.summary, slots: plan.entries.map(entry => entry.sourceSlot) }).replaceAll('<', '\\u003c');
    return `<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Obnova učebního postupu</title>
<style>body{background:#172132;color:#eee;font:18px/1.55 system-ui;max-width:680px;margin:24px auto;padding:20px}h1{font:700 30px Georgia;color:#f2d58a}button,a{font:inherit;padding:14px 20px;background:#f2d58a;color:#172132;border:2px solid #b39960;border-radius:8px;display:inline-block;text-decoration:none}button:disabled{opacity:.6}button:hover,a:hover{background:#ffe7ae}pre{white-space:pre-wrap;font:inherit}#result{padding:14px 0}</style>
<h1>Obnova učebního postupu</h1><pre id="summary"></pre>
<p>Nejdřív zavři ostatní záložky s touto hrou na tabletu, aby stará rozehraná hra opravu nepřepsala.</p>
<p>Před změnou se uloží další záloha na tabletu i na počítači.</p>
<button id="apply">Zálohovat a opravit postup</button><div id="result" role="status"></div><a id="play" href="/" hidden style="display:none">Spustit hru</a>
<script>
const plan=${info};document.getElementById('summary').textContent=plan.summary;
const button=document.getElementById('apply'),result=document.getElementById('result');
button.onclick=async()=>{
 button.disabled=true;result.textContent='Kontroluji zálohu…';
 const originals=plan.slots.map(sourceSlot=>({sourceSlot,key:'littleMathAdventure_slot_'+sourceSlot,raw:localStorage.getItem('littleMathAdventure_slot_'+sourceSlot)}));
 try {
  const saves=originals.map(entry=>({sourceSlot:entry.sourceSlot,save:JSON.parse(entry.raw)}));
  const response=await fetch('/__learning-repair/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:plan.id,saves})});
  const prepared=await response.json();if(!response.ok)throw new Error(prepared.error);
  if(originals.some(entry=>localStorage.getItem(entry.key)!==entry.raw))throw new Error('Uložená hra se během kontroly změnila. Zavři hru a zkus opravu znovu.');
  const backupKey='littleMathAdventure_repair_backup_'+plan.id;
  if(localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,JSON.stringify({id:plan.id,saves}));
  try {
   for(const entry of prepared.saves)localStorage.setItem('littleMathAdventure_slot_'+entry.sourceSlot,JSON.stringify(entry.save));
   for(const entry of prepared.saves)if(localStorage.getItem('littleMathAdventure_slot_'+entry.sourceSlot)!==JSON.stringify(entry.save))throw new Error('Uložení se nepodařilo ověřit.');
  } catch(error) {for(const entry of originals){if(entry.raw===null)localStorage.removeItem(entry.key);else localStorage.setItem(entry.key,entry.raw);}throw error;}
  const receipt=await fetch('/__learning-repair/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:plan.id,saves:prepared.saves})});
  if(!receipt.ok)throw new Error('Oprava je uložená, ale počítač zatím nepotvrdil kontrolu. Stiskni tlačítko znovu.');
  result.textContent='Hotovo. Oprava na tomto zařízení je uložená a ověřená. Spusť hru odkazem níže.';
  document.getElementById('play').style.display='inline-block';document.getElementById('play').hidden=false;
 } catch(error){result.textContent=error.message;button.disabled=false;}
};
</script></html>`;
}

export function registerLearningRepair(server, root) {
    const directory = path.join(root, 'artifacts/save-diagnostics');
    server.middlewares.use('/__learning-repair', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        let plan;
        try { plan = JSON.parse(readFileSync(path.join(directory, 'repair-plan.json'), 'utf8')); }
        catch { res.statusCode = 404; res.end('Oprava zatím není připravena.'); return; }
        if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(pageHtml(plan)); return;
        }
        let sameOrigin = false;
        try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { /* invalid origin */ }
        if (req.method !== 'POST' || !sameOrigin || !['/prepare', '/receipt'].includes(req.url)) {
            res.statusCode = 403; res.end(); return;
        }
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 4_000_000) { res.statusCode = 413; res.end(); req.destroy(); }
        });
        req.on('end', () => {
            if (res.writableEnded) return;
            res.setHeader('Content-Type', 'application/json');
            try {
                const bundle = JSON.parse(body);
                const saves = prepareLearningRepair(plan, bundle);
                const phase = req.url === '/receipt' ? 'after' : 'before';
                if (phase === 'after' && bundle.saves.some(entry => learningStatsHash(entry.save.mathStats)
                    !== plan.entries.find(target => target.sourceSlot === entry.sourceSlot)?.afterHash)) throw new Error('Opravu nelze ověřit.');
                mkdirSync(directory, { recursive: true });
                const qa = req.headers['x-learning-qa'] === '1';
                writeFileSync(path.join(directory, `repair-${qa ? 'qa-' : ''}${phase}-${Date.now()}.json`), JSON.stringify({
                    format: 'little-math-adventure-save-bundle', version: 1, exportedAt: Date.now(),
                    repairId: plan.id, qa, userAgent: req.headers['user-agent'], saves: bundle.saves,
                }, null, 2), { flag: 'wx' });
                res.end(JSON.stringify(phase === 'before' ? { saves } : { ok: true }));
            } catch (error) {
                res.statusCode = 409; res.end(JSON.stringify({ error: error.message }));
            }
        });
    });
}

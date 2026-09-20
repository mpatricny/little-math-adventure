import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerLearningRepair } from './learning-save-repair.mjs';

/** Local development only: a read-only save snapshot for debugging device-specific progress. */
export function learningSaveDiagnosticsPlugin(root) {
    return {
        name: 'learning-save-diagnostics',
        apply: 'serve',
        configureServer(server) {
            registerLearningRepair(server, root);
            server.middlewares.use('/__learning-diagnostics', (req, res) => {
                res.setHeader('Cache-Control', 'no-store');
                if (req.method === 'GET') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kontrola postupu</title>
<style>body{background:#172132;color:#eee;font:18px system-ui;max-width:620px;margin:40px auto;padding:20px}button{font:inherit;padding:16px;background:#f2d58a;border:0;border-radius:8px}pre{white-space:pre-wrap}</style>
<h1>Kontrola uloženého postupu</h1><p>Vytvoří zálohu savů Kitten a Eli na tomto vývojovém počítači. Hru ani uložený postup na zařízení nemění.</p>
<button id="check">Uložit diagnostickou zálohu</button><pre id="result"></pre>
<script>
document.getElementById('check').onclick=async()=>{
 const saves=[];for(let slot=0;slot<8;slot++){const raw=localStorage.getItem('littleMathAdventure_slot_'+slot);if(!raw)continue;const save=JSON.parse(raw);if(['kitten','eli'].includes(save.player?.name?.toLowerCase()))saves.push({sourceSlot:slot,save});}
 const result=document.getElementById('result');if(!saves.length){result.textContent='Na této adrese nejsou savy Kitten ani Eli. Otevři tento odkaz na stejné adrese jako hru.';return;}
 const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'little-math-adventure-save-bundle',version:1,exportedAt:Date.now(),activeSlot:Number(localStorage.getItem('littleMathAdventure_activeSlot')),saves})});
 result.textContent=response.ok?'Záloha je uložená pro kontrolu. Můžeš se vrátit do hry.':'Zálohu se nepodařilo uložit.';
};
</script>`);
                    return;
                }
                if (req.method !== 'POST' || !req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) {
                    res.statusCode = 403; res.end(); return;
                }
                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                    if (body.length > 4_000_000) { res.statusCode = 413; res.end(); req.destroy(); }
                });
                req.on('end', () => {
                    try {
                        const bundle = JSON.parse(body);
                        if (bundle.format !== 'little-math-adventure-save-bundle' || !Array.isArray(bundle.saves)
                            || bundle.saves.length > 8 || bundle.saves.some(entry => !entry.save?.player || !entry.save?.mathStats)) throw new Error('Invalid save bundle');
                        const directory = path.join(root, 'artifacts/save-diagnostics');
                        mkdirSync(directory, { recursive: true });
                        const name = `snapshot-${Date.now()}.json`;
                        writeFileSync(path.join(directory, name), JSON.stringify(bundle, null, 2), { flag: 'wx' });
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: true }));
                    } catch {
                        res.statusCode = 400; res.end('Invalid save bundle');
                    }
                });
            });
        },
    };
}

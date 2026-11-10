// Real image-to-video production. Every paid mutation is journaled before sending.
// A pending operation is deliberately never retried after an ambiguous response.
import fs from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../artifacts/sorceress/underwater-expansion/', import.meta.url);
const [action = 'status', selected, motion, take] = process.argv.slice(2);
const specs = JSON.parse(await fs.readFile(new URL('../scripts/underwater-expansion-specs.json', import.meta.url), 'utf8'));
const slugs = selected ? [selected] : Object.keys(specs);
if (slugs.some(slug => !specs[slug])) throw new Error('Unknown creature');
await fs.mkdir(root, { recursive: true });
if (!['check', 'probe', 'prompt-hash'].includes(action)) {
    const lockFile = new URL('pipeline.lock', root);
    let lock;
    try { lock = await fs.open(lockFile, 'wx'); }
    catch { throw new Error('Pipeline is locked; inspect the running process and journal before another operation'); }
    await lock.writeFile(JSON.stringify({ pid: process.pid, action, startedAt: new Date().toISOString() }) + '\n');
    await lock.close();
    process.once('exit', () => { try { unlinkSync(lockFile); } catch { /* A crash leaves a safe stale lock. */ } });
}
const manifestFile = new URL('jobs.json', root);
let manifest;
try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; manifest = {}; }
const persist = async () => {
    const temporary = new URL('jobs.json.tmp', root);
    await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n');
    await fs.rename(temporary, manifestFile);
};
const sha = data => createHash('sha256').update(data).digest('hex');
const approvals = JSON.parse(await fs.readFile(new URL('approvals.json', root), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{}'; throw error;
}));
const approve = (entry, bytes, label) => {
    if (!entry?.approvedBy || entry.sha256 !== sha(bytes)) throw new Error(`${label}: missing approval for these exact bytes`);
};
let credential = process.env.SORCERESS_API_KEY?.trim();
async function request(endpoint, body) {
    if (!credential) {
        try { credential = (await fs.readFile(new URL('../.local-credentials/sorceress.key', import.meta.url), 'utf8')).trim(); }
        catch { /* The ignored stable file is optional; retain the legacy pointer fallback. */ }
        if (!credential) {
            try {
                const keyPath = (await fs.readFile(new URL('../.local-credentials/sorceress.path', import.meta.url), 'utf8')).trim();
                credential = (await fs.readFile(keyPath, 'utf8')).trim();
            } catch { throw new Error('Local Sorceress credential unavailable (environment, stable file and legacy pointer checked)'); }
        }
        if (!credential) throw new Error('Missing local Sorceress credential');
    }
    const response = await fetch(`https://sorceress.games/api/v1/${endpoint}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
    });
    const json = await response.json();
    if (!response.ok || json.success === false) {
        const error = new Error(`Sorceress ${endpoint}: HTTP ${response.status}; request explicitly rejected`);
        error.confirmedRejected = true; error.httpStatus = response.status;
        throw error;
    }
    return json.data ?? json;
}
async function mutate(record, operation, endpoint, body) {
    const entry = record.operations ??= {};
    const prior = entry[operation];
    if (prior?.result) return prior.result;
    if (prior) throw new Error(`${operation}: previous ${prior.state} request recorded; inspect Sorceress before retrying`);
    entry[operation] = { startedAt: new Date().toISOString(), requestSha256: sha(JSON.stringify(body)), state: 'pending' };
    await persist();
    let result;
    try { result = await request(endpoint, body); }
    catch (error) {
        if (error.confirmedRejected) {
            entry[operation].state = 'rejected'; entry[operation].httpStatus = error.httpStatus;
            await persist();
        }
        // Neither a rejected nor an uncertain operation is automatically retried.
        throw error;
    }
    entry[operation].state = 'complete';
    entry[operation].result = result;
    await persist();
    return result;
}
const shared = 'Locked orthographic three-quarter game camera, locked scale, center and baseline. Perfectly static uniform vivid green #00FF00 matte. No green reflections, spill, grading or shadows on the subject. Preserve the canonical blue, pearl, gold and violet palette, exact face, anatomy, shell, armor and attached crystal shapes. One complete creature facing left, with generous empty safety margin around its maximum motion, every extremity and effect. Articulated anatomical motion only. No camera movement, zoom, framing drift, whole-silhouette warping or stretching, extra or missing anatomy, detached parts, style changes, external target, background motion, text or ghosting. No part or effect may touch the frame edge. Start from the supplied canonical pose and framing. Maintain at least 12 percent clear matte border around the maximum extent of the creature and every effect at every moment; never recenter or zoom to follow motion. ';

if (action === 'prompt-hash') {
    if (!selected || !specs[selected].actions[motion]) throw new Error('Use prompt-hash seahorse|nautilus action');
    console.log(sha(shared+specs[selected].anatomy+specs[selected].actions[motion]));
} else if (action === 'probe') {
    // Existing free read-only status verifies DNS, authorization and API shape
    // before a paid mutation can become uncertain inside the journal.
    const prior = JSON.parse(await fs.readFile(new URL('../artifacts/sorceress/underwater-finalists/jobs.json', import.meta.url), 'utf8'));
    const known = Object.values(prior).flatMap(spec => spec.jobs ?? [])[0];
    if (!known?.jobId) throw new Error('No existing job available for read-only probe');
    const result = await request(`jobs/${known.jobId}`);
    console.log(`Read-only Sorceress probe: ${result.status}`);
} else if (action === 'submit') {
    for (const slug of slugs) {
        const spec = specs[slug];
        const canonical = await fs.readFile(new URL(`${slug}-canonical-green.png`, root));
        approve(approvals.canonicals?.[slug], canonical, `${slug} canonical`);
        const record = manifest[slug] ??= { prefix: spec.prefix, canonicalSha256: sha(canonical) };
        if (record.canonicalSha256 !== sha(canonical)) throw new Error(`${slug}: canonical changed after submission`);
        if (record.jobs?.length) { console.log(`${slug}: already submitted; no duplicate charge`); continue; }
        if (!record.publicUrl) {
            const upload = await request('tools/file_upload', { filename: `${slug}-canonical-green.png`, contentType: 'image/png' });
            if (!upload.uploadUrl || !upload.publicUrl) throw new Error('Missing upload URLs');
            const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: canonical });
            if (!response.ok) throw new Error('Canonical upload failed');
            record.publicUrl = upload.publicUrl; await persist();
        }
        if (!record.characterAssetId) {
            const created = await mutate(record, 'createCharacter', 'tools/autosprite_create_character', {
                imageUrl: record.publicUrl, name: spec.name, prompt: shared + spec.anatomy + 'Canonical full body neutral pose.',
            });
            record.characterAssetId = created.assetId ?? created.characterAssetId;
            if (!record.characterAssetId) throw new Error('Missing character asset ID');
            await persist();
        }
        const animations = Object.entries(spec.actions).map(([label, prompt]) => ({ label, prompt: shared + spec.anatomy + prompt, duration: 1 }));
        record.request = { characterAssetId: record.characterAssetId, model: 'imagine-1.5', resolution: '720p', animations };
        const result = await mutate(record, 'animate', 'tools/autosprite_animate', record.request);
        if (result.jobs?.length !== animations.length) throw new Error('Unexpected animation job count; inspect service');
        record.jobs = result.jobs.map((job, index) => ({ jobId: job.jobId, assetId: job.assetId, label: animations[index].label }));
        await persist(); console.log(`${slug}: four real video jobs submitted`);
    }
} else if (action === 'retake') {
    if (!selected || !specs[selected].actions[motion] || !/^v(?:[2-9]|[1-9]\d+)$/.test(take ?? '')) {
        throw new Error('Use retake seahorse|nautilus idle|attack|defend|defeat v2 (explicit unique revision)');
    }
    const record=manifest[selected];
    if (!record?.characterAssetId || !record.jobs?.some(job=>job.label===motion)) throw new Error('Original motion must exist before a retake');
    const identity=`${selected}/${motion}/${take}`;
    const prompt=shared+specs[selected].anatomy+specs[selected].actions[motion];
    const approval=approvals.retakes?.[identity];
    if (!approval?.approvedBy || !approval.reason || approval.promptSha256!==sha(prompt)) {
        throw new Error('A retake needs an explicit parent/Astra decision and approval of the exact revised prompt');
    }
    if (record.jobs.some(job=>job.label===motion && job.take===take)) {
        console.log(`${identity}: already submitted; no duplicate charge`);
    } else {
        const retake=(record.retakes??={})[identity]??={approval,request:{characterAssetId:record.characterAssetId,
            model:'imagine-1.5',resolution:'720p',animations:[{label:motion,prompt,duration:1}]}};
        if (sha(JSON.stringify(retake.request.animations[0].prompt))!==sha(JSON.stringify(prompt))) throw new Error('Retake prompt changed after journaling');
        const result=await mutate(retake,'animate','tools/autosprite_animate',retake.request);
        if (result.jobs?.length!==1) throw new Error('Unexpected retake job count; inspect service');
        const index=record.jobs.findIndex(job=>job.label===motion),previous=record.jobs[index];
        if (!(record.history??=[]).some(job=>job.jobId===previous.jobId))record.history.push(previous);
        record.jobs[index]={jobId:result.jobs[0].jobId,assetId:result.jobs[0].assetId,label:motion,take,approvedRetakeBy:approval.approvedBy};
        await persist();console.log(`${identity}: one real replacement video submitted; original preserved in history`);
    }
} else if (action === 'status') {
    for (const slug of slugs) for (const job of manifest[slug]?.jobs ?? []) {
        if (job.localFile) { console.log(`${slug}/${job.label}: downloaded for review`); continue; }
        const result = await request(`jobs/${job.jobId}`);
        console.log(`${slug}/${job.label}: ${result.status}`);
        if (!['completed', 'succeeded'].includes(result.status)) continue;
        const urls = [];
        const walk = value => {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (['mediaUrl', 'videoUrl', 'outputUrl'].includes(key) && typeof child === 'string') urls.push(child);
                else walk(child);
            }
        };
        walk(result);
        if (!urls.length) {
            const pack = await request('tools/autosprite_get_character', { characterAssetId: manifest[slug].characterAssetId });
            const find = value => { if (!value || typeof value !== 'object') return;
                if (value.assetId === job.assetId) walk(value); else Object.values(value).forEach(find); };
            find(pack);
        }
        if (!urls.length) throw new Error('Completed job has no video URL');
        const video = await fetch(urls[0],{signal:AbortSignal.timeout(60000)}); if (!video.ok) throw new Error('Video download failed');
        job.localFile = `${slug}-${job.label}${job.take ? `-${job.take}` : ''}-raw.mp4`;
        await fs.writeFile(new URL(job.localFile, root), Buffer.from(await video.arrayBuffer()));
        await persist(); console.log(`${slug}/${job.label}: saved for visual review`);
    }
} else if (action === 'key') {
    for (const slug of slugs) for (const job of manifest[slug]?.jobs ?? []) {
        const bytes = await fs.readFile(new URL(job.localFile, root));
        approve(approvals.videos?.[`${slug}/${job.label}`], bytes, `${slug}/${job.label} video`);
        if (job.keyJobId) continue;
        const result = await mutate(job, 'key', 'tools/autosprite_key', {
            assetId: job.assetId, sampleEvery: 4, keyColor: 'auto', tolerance: 40, maxSide: 512, force: true,
        });
        job.keyJobId = result.jobs?.[0]?.jobId ?? result.jobId;
        if (!job.keyJobId) throw new Error('Missing keying job ID');
        await persist(); console.log(`${slug}/${job.label}: approved video submitted for Every 4 keying`);
    }
} else if (action === 'key-status') {
    for (const slug of slugs) for (const job of manifest[slug]?.jobs ?? []) {
        if (!job.keyJobId || job.keyFile) continue;
        const result = await request(`jobs/${job.keyJobId}`);
        console.log(`${slug}/${job.label}: keying ${result.status}`);
        if (!['completed', 'succeeded'].includes(result.status)) continue;
        let sheetUrl, metadata;
        const walk = value => {
            if (!value || typeof value !== 'object') return;
            if (value.spriteSheetUrl) sheetUrl = value.spriteSheetUrl;
            if (value.frameW && value.frameH) metadata = value;
            Object.values(value).forEach(walk);
        }; walk(result);
        if (!sheetUrl || !metadata) throw new Error('Missing keyed sheet or geometry');
        const response = await fetch(sheetUrl,{signal:AbortSignal.timeout(60000)}); if (!response.ok) throw new Error('Sheet download failed');
        job.keyFile = `${slug}-${job.label}${job.take ? `-${job.take}` : ''}-autosprite.png`;
        await fs.writeFile(new URL(job.keyFile, root), Buffer.from(await response.arrayBuffer()));
        job.keyMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/url/i.test(key)));
        await persist();
    }
} else if (action === 'check') {
    for (const slug of slugs) {
        const bytes = await fs.readFile(new URL(`${slug}-canonical-green.png`, root));
        approve(approvals.canonicals?.[slug], bytes, slug);
        console.log(`${slug}: exact canonical approved; ${Object.keys(specs[slug].actions).length} motions ready; ${fileURLToPath(root)}`);
    }
} else throw new Error('Use check, submit, status, key or key-status [creature]');

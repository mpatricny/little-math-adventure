// Real image-to-video production. Credentials never enter output, URLs or metadata.
import fs from 'node:fs/promises';
const api = 'https://sorceress.games/api/v1';
const keyPath = (await fs.readFile(new URL('../.local-credentials/sorceress.path', import.meta.url), 'utf8')).trim();
const key = (await fs.readFile(keyPath, 'utf8')).trim();
if (!key) throw new Error('Missing local Sorceress key');
const friendly = process.argv.includes('--friendly');
const root = new URL(`../artifacts/sorceress/${friendly ? 'underwater-friendly-guardian' : 'underwater-finalists'}/`, import.meta.url);
const shared = 'Locked orthographic three-quarter game camera, locked scale, center and baseline. Perfectly static uniform vivid green #00FF00 matte. No green reflections, rim, spill, shadow or grading on the creature. Preserve the canonical blue, cyan, purple, white and gold palette, exact face, anatomy, jewelry and crystal shapes. One complete creature facing left, with generous empty safety margin around its maximum motion, all extremities and every effect. Articulated anatomical motion only. No camera motion, zoom, framing drift, whole-silhouette warping or stretching, extra or missing limbs, duplicate eyes, detached parts, style changes, external target, background movement, text or ghosting. No part or effect may touch the frame edge. The source transparency is replaced only by the flat green matte. ';
const specs = {
    jellyfish: {
        name: 'Silverpond Pearl Jellyfish — canonical enemy',
        anatomy: 'One transparent domed bell with one large internal pearl, two eyes, gold circlet and attached blue forehead diamond, all canonical flowing tentacles with attached jewelry. ',
        actions: {
            idle: 'Two-second in-place idle: one gentle articulated bell contraction, tentacles slowly curl and uncurl independently, one blink, internal pearl softly pulses; return to the initial pose. No translation or attack.',
            attack: 'One-second in-place attack: briefly draw the tentacles inward, then snap the two forward tentacles toward the left with a compact electric pulse INSIDE the tentacle span. Hold readable follow-through. Keep full tentacles and effect in frame.',
            defend: 'One-second hurt/defense: tentacles curl toward the pearl, the bell flinches subtly at an imaginary impact from the left, eyes close briefly; hold a guarded pose. Do not attack or change anatomy.',
            defeat: 'One-second non-graphic defeat: angry eyes relax, tentacles droop, purple energy fades, bell settles slightly while the pearl and gold jewelry stay intact. End in a still exhausted pose, do not vanish or recover.',
        },
    },
    guardian: {
        name: 'Silverpond Guardian of the Depths — canonical enemy',
        anatomy: 'One upright coiled serpentine water dragon, one head, two webbed forearms with attached gold cuffs, continuous long cyan scaled tail, white belly, gold-edged head fins and tail fin, purple-blue crystals on the back. Preserve all these exact features. ',
        actions: {
            idle: 'Two-second in-place vigilant idle: subtle chest breathing, one blink, small independent tail-tip sway and head-fin flex. Coiled body and root remain fixed. Return to initial pose. No attack.',
            attack: 'Phase one, one-second in-place attack: brief neck anticipation followed by a compact leftward snapping bite and forward forearm rake. Tail counterbalances locally. No projectile. Hold readable follow-through.',
            'attack-tide': 'Phase two, one-second in-place tidal attack: both webbed forearms sweep from low to high toward the left, head fins flare, a compact crescent of cyan water forms BETWEEN the palms then fades. Tail stays coiled. Hold follow-through; all water remains inside the generous margin.',
            'attack-crystal': 'Phase three, one-second in-place crystal attack: briefly recoil the head, back crystals brighten purple, then drive both palms toward the left while an internal purple-blue energy surge travels along the back crystals. Do not grow new crystals. No external projectile. End in strong follow-through.',
            defend: 'One-second hurt/defense: bring webbed forearms across the chest, flinch the head backward slightly at an imaginary left impact, tighten the continuous tail coil, hold a guarded stance. No attack.',
            defeat: 'One-second non-graphic defeat: lower head and both arms, relax the tail coil locally, dim purple corruption while keeping all crystals, fins and jewelry intact. Settle into a still exhausted pose; no collapse outside frame, no explosion, no disappearance or recovery.',
        },
    },
};
if (friendly) {
    delete specs.jellyfish;
    specs.guardian.name = 'Silverpond Guardian of the Depths — freed friendly companion';
    specs.guardian.anatomy = 'One friendly upright coiled serpentine water dragon, one head, two webbed forearms with gold cuffs, one continuous cyan tail, white belly, gold-edged fins and clean BLUE crystals on the back. Preserve the supplied kind face and exact anatomy. No purple corruption, angry eyes, teeth display or combat effects. ';
    specs.guardian.actions = {
        idle: 'Two-second peaceful in-place friendly idle for an underwater companion after rescue. Keep a gentle closed-mouth smile. One slow relaxed blink, subtle chest breathing, a small reassuring head nod, independent flowing head fins and a softly curling tail tip. Forearms stay relaxed, not guarding or attacking. Keep the root coil, center, scale and camera fixed. Return smoothly to the initial pose. It must look alive, calm, grateful and approachable; no whole-body translation, no threat, no particles.'
    };
}
async function request(endpoint, body) {
    const response = await fetch(`${api}/${endpoint}`, { method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
    const json = await response.json();
    if (!response.ok || json.success === false) throw new Error(`Sorceress ${endpoint}: HTTP ${response.status}, request rejected`);
    return json.data ?? json;
}
const action = process.argv[2] ?? 'status';
const manifestFile = new URL('jobs.json', root);
let manifest;
try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; manifest = {}; }
await fs.mkdir(root, { recursive: true });
const persist = () => fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
if (action === 'submit') {
    for (const [slug, spec] of Object.entries(specs)) {
        if (manifest[slug]?.jobs?.length) { console.log(`${slug}: already submitted; no duplicate charge`); continue; }
        let characterAssetId = manifest[slug]?.characterAssetId;
        if (!characterAssetId) {
            const upload = await request('tools/file_upload', { filename: `${slug}-canonical-green.png`, contentType: 'image/png' });
            if (!upload.uploadUrl || !upload.publicUrl) throw new Error('Missing upload URLs');
            const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' },
                body: await fs.readFile(new URL(`${slug}-canonical-green.png`, root)) });
            if (!response.ok) throw new Error('Canonical upload failed');
            const created = await request('tools/autosprite_create_character', { imageUrl: upload.publicUrl,
                name: spec.name, prompt: shared + spec.anatomy + 'Canonical full body neutral pose.' });
            characterAssetId = created.assetId ?? created.characterAssetId;
            if (!characterAssetId) throw new Error('Missing character asset ID');
            manifest[slug] = { characterAssetId }; await persist();
        }
        const animations = Object.entries(spec.actions).map(([label, prompt]) => ({ label, prompt: shared + spec.anatomy + prompt, duration: 1 }));
        // Save the request before submission. Do not retry an uncertain submission automatically.
        manifest[slug].request = { characterAssetId, model: 'imagine-1.5', resolution: '720p', animations };
        if (manifest[slug].submissionStarted) throw new Error(`${slug}: previous submission uncertain; inspect Sorceress before retrying`);
        manifest[slug].submissionStarted = true; await persist();
        const result = await request('tools/autosprite_animate', manifest[slug].request);
        if (result.jobs?.length !== animations.length) throw new Error('Unexpected animation job count');
        manifest[slug].jobs = result.jobs.map((job, i) => ({ jobId: job.jobId, assetId: job.assetId, label: animations[i].label }));
        await persist(); console.log(`${slug}: ${result.jobs.length} real video jobs submitted`);
    }
} else if (action === 'status') {
    for (const [slug, spec] of Object.entries(manifest)) for (const job of spec.jobs ?? []) {
        if (job.localFile) { console.log(`${slug}/${job.label}: downloaded for review`); continue; }
        const result = await request(`jobs/${job.jobId}`);
        console.log(`${slug}/${job.label}: ${result.status}`);
        if (!['completed', 'succeeded'].includes(result.status)) continue;
        const urls = [];
        const walk = value => {
            if (!value || typeof value !== 'object') return;
            for (const [k, v] of Object.entries(value)) {
                if (['mediaUrl', 'videoUrl', 'outputUrl'].includes(k) && typeof v === 'string') urls.push(v);
                else walk(v);
            }
        };
        walk(result);
        if (!urls.length) {
            const pack = await request('tools/autosprite_get_character', { characterAssetId: spec.characterAssetId });
            const find = value => { if (!value || typeof value !== 'object') return;
                if (value.assetId === job.assetId) walk(value); else Object.values(value).forEach(find); };
            find(pack);
        }
        if (!urls.length) throw new Error('Completed job has no video URL');
        const video = await fetch(urls[0]); if (!video.ok) throw new Error('Video download failed');
        job.localFile = `${slug}-${job.label}-raw.mp4`;
        await fs.writeFile(new URL(job.localFile, root), Buffer.from(await video.arrayBuffer()));
        await persist(); console.log(`${slug}/${job.label}: saved for visual review`);
    }
} else if (action === 'key') {
    // Run only after the raw videos pass visual inspection.
    for (const [slug, spec] of Object.entries(manifest)) for (const job of spec.jobs ?? []) {
        if (job.keyJobId) continue;
        if (job.keyStarted) throw new Error('Uncertain keying request; inspect service before retrying');
        job.keyStarted = true; await persist();
        const result = await request('tools/autosprite_key', { assetId: job.assetId, sampleEvery: 4, keyColor: 'auto', tolerance: 40, maxSide: 512, force: true });
        job.keyJobId = result.jobs?.[0]?.jobId ?? result.jobId;
        if (!job.keyJobId) throw new Error('Missing keying job ID');
        await persist(); console.log(`${slug}/${job.label}: AutoSprite keying submitted`);
    }
} else if (action === 'key-status') {
    for (const [slug, spec] of Object.entries(manifest)) for (const job of spec.jobs ?? []) {
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
        const response = await fetch(sheetUrl); if (!response.ok) throw new Error('Sheet download failed');
        job.keyFile = `${slug}-${job.label}-autosprite.png`;
        await fs.writeFile(new URL(job.keyFile, root), Buffer.from(await response.arrayBuffer()));
        // URLs are not needed in local production metadata.
        job.keyMetadata = Object.fromEntries(Object.entries(metadata).filter(([k]) => !/url/i.test(k)));
        await persist();
    }
} else throw new Error('Use submit, status, key or key-status');

// Real video-model motion for the five companion appearances. Never logs credentials.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/sorceress/fox-companion-v1');
const api = 'https://sorceress.games/api/v1';
const keyPath = (await fs.readFile('.local-credentials/sorceress.path', 'utf8')).trim();
const key = (await fs.readFile(keyPath, 'utf8')).trim();
if (!key) throw new Error('Missing local Sorceress credential');
const command = process.argv[2] ?? 'status';
const requested = process.argv.slice(3);
const ids = requested.length ? requested : ['01', '02', '03', '04', '05'];
if (ids.some(id => !/^0[1-5]$/.test(id))) throw new Error('Use appearance IDs 01–05');
await fs.mkdir(root, {recursive: true});
const manifestPath = path.join(root, 'jobs.json');
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const persist = () => fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const shared = 'Use the supplied approved detailed fantasy fox exactly, a single friendly companion with orange and white fur, amber eyes, turquoise rune markings and the exact gold details of this appearance. Keep its original left-facing three-quarter view, exact face and gentle expression. Four anatomically correct legs, two ears and ONE fluffy tail. Locked orthographic game camera, scale, ground baseline, center, lighting, palette and art style. Perfectly static uniform #00FF00 chroma background with no texture, ground, platform, plants, shadow, reflection or green spill. All anatomical motion is articulated, never whole-body warping, squash, stretch or morphing. Leave the generous supplied safety margin empty: no ear, paw, tail or effect may touch any edge. No camera movement, zoom, reframing, rotation of the character to another view, locomotion across the frame, detached parts, extra limbs, silhouette ghosting, new markings, external target, words or numbers. No floating particles or projectiles; those are separate runtime effects. ';
const motions = {
  idle: 'Two-second calm idle loop in the original pose. Subtle chest breathing, one relaxed blink, a small independent ear twitch and gentle tail-tip sway. Planted paws and root stay fixed. Do not move the whole silhouette up and down. Ease back to the same starting pose and friendly expression. No attack or continuous turning.',
  attack: 'One-second normal pet melee attack directed LEFT, all in place. Briefly lower the shoulders in anticipation, make one compact quick forward forepaw swipe and a small head thrust, then settle into the original pose. Articulate shoulder, elbow and wrist naturally; hindquarters stay on the same ground baseline and root stays centered. No biting violence, snarling, projectile, explosion, slash trail or additional weapon. Preserve friendly identity while looking determined.',
  cast: 'One-second gentle ability-casting gesture in place. Lift one forepaw a little, incline the head toward that paw and lift the chin in a short confident nod, while the existing turquoise runes brighten briefly within their exact shapes. Return to the original pose and calm friendly expression. No new rune shapes, shield, heart, bolts, rays, external glow cloud or particles. Runtime effects will separately show shield, healing or strike; this clip contains only the articulated fox and a restrained internal rune-light pulse.',
};
async function request(endpoint, body) {
  const response = await fetch(`${api}/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json();
  if (!response.ok || json.success === false) throw new Error(`Sorceress rejected ${endpoint}, HTTP ${response.status}`);
  return json.data ?? json;
}
function mediaUrls(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [name, child] of Object.entries(value)) {
    if (['mediaUrl', 'videoUrl', 'outputUrl'].includes(name) && typeof child === 'string') output.push(child);
    else mediaUrls(child, output);
  }
  return output;
}
if (command === 'submit') {
  for (const id of ids) {
    let entry = manifest[id] ??= {};
    if (entry.jobs?.length) { console.log(`${id}: already submitted, no duplicate generation`); continue; }
    if (entry.submissionStarted) throw new Error(`${id}: uncertain prior submission; inspect service before retrying`);
    const input = path.join(root, `fox-${id}-canonical-green.png`);
    await fs.access(input);
    if (!entry.characterAssetId) {
      const upload = await request('tools/file_upload', {filename: `fox-${id}-canonical-green.png`, contentType: 'image/png'});
      if (!upload.uploadUrl || !upload.publicUrl) throw new Error('Missing upload URLs');
      const uploaded = await fetch(upload.uploadUrl, {method: 'PUT', headers: {'Content-Type': 'image/png'}, body: await fs.readFile(input), signal: AbortSignal.timeout(60000)});
      if (!uploaded.ok) throw new Error('Canonical upload failed');
      const created = await request('tools/autosprite_create_character', {imageUrl: upload.publicUrl, name: `Friendly rune fox, appearance ${id}`, prompt: shared + 'Full-body canonical reference.'});
      entry.characterAssetId = created.assetId ?? created.characterAssetId;
      if (!entry.characterAssetId) throw new Error('Missing character asset ID');
      await persist();
    }
    entry.request = {characterAssetId: entry.characterAssetId, model: 'imagine-1.5', resolution: '720p',
      animations: Object.entries(motions).map(([label, prompt]) => ({label, prompt: shared + prompt, duration: 1}))};
    entry.submissionStarted = true; await persist();
    const result = await request('tools/autosprite_animate', entry.request);
    if (result.jobs?.length !== 3) throw new Error('Expected three motion jobs; inspect service, do not auto-resubmit');
    entry.jobs = result.jobs.map((job, index) => ({jobId: job.jobId, assetId: job.assetId, label: entry.request.animations[index].label}));
    await persist(); console.log(`${id}: three real video jobs submitted`);
  }
} else if (command === 'status') {
  for (const id of ids) for (const job of manifest[id]?.jobs ?? []) {
    if (job.localFile) {console.log(`${id}/${job.label}: downloaded`); continue;}
    const result = await request(`jobs/${job.jobId}`);
    job.status = result.status; await persist();
    console.log(`${id}/${job.label}: ${result.status}`);
    if (!['completed', 'succeeded'].includes(result.status)) continue;
    let urls = mediaUrls(result);
    if (!urls.length) {
      const pack = await request('tools/autosprite_get_character', {characterAssetId: manifest[id].characterAssetId});
      const find = value => {if (!value || typeof value !== 'object') return; if (value.assetId === job.assetId) urls.push(...mediaUrls(value)); else Object.values(value).forEach(find);}; find(pack);
    }
    if (!urls.length) throw new Error('Completed video URL missing');
    const video = await fetch(urls[0], {signal: AbortSignal.timeout(60000)});
    if (!video.ok) throw new Error('Video download failed');
    const filename = `fox-${id}-${job.label}-raw.mp4`;
    await fs.writeFile(path.join(root, filename), Buffer.from(await video.arrayBuffer()));
    job.localFile = filename; await persist(); console.log(`${id}/${job.label}: saved for source review`);
  }
} else if (command === 'key') {
  const reviews = JSON.parse(await fs.readFile(path.join(root, 'approved-windows.json'), 'utf8'));
  for (const id of ids) for (const job of manifest[id]?.jobs ?? []) {
    if (job.keyJobId) continue;
    if (!reviews[`${id}/${job.label}`]?.approved) {console.log(`Review pending; NOT keyed: ${id}/${job.label}`);continue;}
    if (job.keyStarted) throw new Error('Uncertain keying submission; inspect service before retrying');
    job.keyStarted = true; await persist();
    const result = await request('tools/autosprite_key', {assetId: job.assetId, sampleEvery: 4, keyColor: 'auto', tolerance: 40, maxSide: 512, force: true});
    job.keyJobId = result.jobs?.[0]?.jobId ?? result.jobId;
    if (!job.keyJobId) throw new Error('Missing keying job ID');
    await persist(); console.log(`${id}/${job.label}: keying submitted`);
  }
} else if (command === 'key-status') {
  const pending = ids.flatMap(id => (manifest[id]?.jobs ?? []).filter(job => job.keyJobId && !job.keyFile).map(job => ({id,job})));
  const results = await Promise.allSettled(pending.map(async ({id,job}) => {
    const result = await request(`jobs/${job.keyJobId}`);
    console.log(`${id}/${job.label}: keying ${result.status}`);
    if (!['completed', 'succeeded'].includes(result.status)) return;
    let url, metadata;
    const walk = value => {if (!value || typeof value !== 'object') return; if (value.spriteSheetUrl) url = value.spriteSheetUrl; if (value.frameW && value.frameH) metadata = value; Object.values(value).forEach(walk);}; walk(result);
    if (!url || !metadata) throw new Error('Missing keyed sheet or geometry');
    const image = await fetch(url, {signal: AbortSignal.timeout(60000)});
    if (!image.ok) throw new Error('Keyed sheet download failed');
    job.keyFile = `fox-${id}-${job.label}-autosprite.png`;
    await fs.writeFile(path.join(root, job.keyFile), Buffer.from(await image.arrayBuffer()));
    job.keyMetadata = Object.fromEntries(Object.entries(metadata).filter(([name]) => !/url/i.test(name)));
  }));
  await persist();
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
} else throw new Error('Use submit, status, key or key-status');

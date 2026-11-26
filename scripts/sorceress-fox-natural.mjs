// Real video-model motion for the five companion appearances. Never logs credentials.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/sorceress/fox-companion-v2');
const api = 'https://sorceress.games/api/v1';
const keyPath = (await fs.readFile('.local-credentials/sorceress.path', 'utf8')).trim();
const key = (await fs.readFile(keyPath, 'utf8')).trim();
if (!key) throw new Error('Missing local Sorceress credential');
const command = process.argv[2] ?? 'status';
const requested = process.argv.slice(3);
const ids = requested.length ? requested : ['02'];
if (ids.some(id => !/^0[235]$/.test(id))) throw new Error('Use revised appearance IDs 02, 03 or 05');
await fs.mkdir(root, {recursive: true});
const manifestPath = path.join(root, 'jobs.json');
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const persist = () => fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const shared = 'Animate this EXACT supplied friendly fantasy fox from its natural four-paw standing posture. Preserve its face, eye color, orange/white fur, turquoise markings, gold edges, mane and single tail. Four normal connected canine legs, two ears, no human arms. Preserve the illustration style and left-facing slight three-quarter view. Natural canine anatomy, weight and joint motion; a comfortable almost level back, never an arched, twisting, broken or stretching spine. The source pose is a neutral standing rest, not a permanently raised paw or play-bow. The first and last frames return to this neutral standing pose. The fox may shift its weight and step naturally during an action; do NOT freeze its hips while bending the front half. Locked camera, subject scale and ground level; constant lighting. Entire creature comfortably within the central 75% throughout. Every paw, ear, tail and fur tip stays far from all frame edges. Perfect flat #00FF00 background. No scene, ground, shadow, external target, props, weapon, particles, floating pieces, extra limbs, duplicate paws, ghosting, whole-body squash/stretch, morphing, zoom or camera movement. ';
const motions = {
 idle: 'A genuine two-second seamless forward idle loop. The first frame is exactly the original supplied image, including its scale and empty margins. Calmly stand supported on all four paws. A very slight natural breathing cycle, a relaxed blink and tiny independent ear movement, then complete the cycle in the same starting stance and motion phase. Keep the tail silhouette in its original curled shape; do not swing or straighten the tail sideways. Keep the natural comfortable spine and stable footing. No dramatic gesture or full-body bounce. No reverse playback. Occasional stretches or paw lifts will be separate later variations; this clip is the ordinary standing idle.',
 attack: 'One ordinary compact canine attack toward the LEFT over two seconds: begin with a short standing pause; shift weight forward, step the nearer front paw forward by one paw length as the head and chest advance together in a brief quick lunge; then take that step back and settle naturally on all four paws in the original standing pose. The hind legs articulate normally to support the small weight shift. Maintain a comfortable canine spine throughout: no bowing, raised rump, back arch, torso twist, detached or human-like paw swipe. No jump, spin, high kick or large body displacement. One clear short forward-and-recover action, with the final third of the clip resting in the starting stance.',
 cast: 'One restrained two-second magical gesture while naturally standing on all four paws: ears perk, head makes a small confident nod toward the left, then the head and ears relax back to the original natural standing pose. The first frame is exactly the supplied image, including its scale and empty margins. Keep the turquoise rune colors and their brightness exactly as supplied for the whole clip; all magical light is added by the game separately. The paws stay comfortably planted, the back stays almost level. Do not lift an arm, rear up, bow or contort the torso. No external particles or magic objects. One gentle gesture followed by a resting final third.',
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
      const created = await request('tools/autosprite_create_character', {imageUrl: upload.publicUrl, name: `Natural standing rune fox V2, appearance ${id}`, prompt: shared + 'Full-body canonical reference.'});
      entry.characterAssetId = created.assetId ?? created.characterAssetId;
      if (!entry.characterAssetId) throw new Error('Missing character asset ID');
      await persist();
    }
    entry.request = {characterAssetId: entry.characterAssetId, startPoseId: 'original', model: 'imagine-1.5', resolution: '720p',
      animations: Object.entries(motions).map(([label, prompt]) => ({label, prompt: shared + prompt, duration: 2, startPoseId: 'original'}))};
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

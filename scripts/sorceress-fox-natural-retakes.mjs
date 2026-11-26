// Explicitly bounded V2 retakes; preserve original jobs and videos for review.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/sorceress/fox-companion-v2');
const output = path.join(root, 'take-02');
await fs.mkdir(output, { recursive: true });
const originals = JSON.parse(await fs.readFile(path.join(root, 'jobs.json'), 'utf8'));
const filename = path.join(output, 'jobs.json');
let records = {};
try { records = JSON.parse(await fs.readFile(filename, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const persist = () => fs.writeFile(filename, JSON.stringify(records, null, 2) + '\n');
const key = (await fs.readFile((await fs.readFile('.local-credentials/sorceress.path', 'utf8')).trim(), 'utf8')).trim();
async function call(endpoint, body) {
  const r = await fetch('https://sorceress.games/api/v1/' + endpoint, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  const json = await r.json();
  if (!r.ok || json.success === false) throw Error(`Sorceress error ${r.status}: ${endpoint}`);
  return json.data ?? json;
}
const actions = {
  idle: 'A seamless forward-only idle loop. Stand naturally on four paws. One soft blink and a tiny ear twitch, extremely subtle breathing, then return to the exact original pose and phase. The entire tail stays in its original curled silhouette: no wag, straightening or tail extension. No reverse playback.',
  cast: 'One restrained magical gesture: all four paws planted, a small natural nod of the head and perk of the ears, followed by a return to the exact original stance. Keep all rune colors and brightness exactly as supplied; the game adds light separately. No bow, arched back, raised paw or movement of the hips.',
  attack: 'One compact natural attack from the original standing pose. Maintain the exact original three-quarter camera view; never turn into a pure side profile. Keep the original upright curled white tail and its gold/cyan markings exactly intact. After a short standing pause, make one short front-paw step and lean the head and chest a tiny amount toward the left, supported by naturally bending legs. Keep the back comfortable and nearly level. Then step back into the exact original standing pose by 1.4 seconds. No jump, crouch, play-bow, lifted rump or planted hips with a bending torso. No tail lowering, wagging or sideways straightening. All effects will be added by the game separately.',
};
const command = process.argv[2];
if (command === 'submit') {
  const id = process.argv[3], labels = process.argv.slice(4);
  if (!/^0[235]$/.test(id) || !labels.length || labels.some(label => !actions[label])) throw Error('Use submit 02/03/05 idle/attack/cast');
  const characterAssetId = originals[id]?.characterAssetId;
  if (!characterAssetId) throw Error('Missing approved canonical character');
  for (const label of labels) {
    const slug = `${id}/${label}`;
    if (records[slug]?.jobId) { console.log(`${slug}: already submitted`); continue; }
    if (records[slug]?.started) throw Error('Uncertain submission; inspect service before retrying');
    const prompt = `Animate the EXACT ORIGINAL reference image. The first and last frames must preserve its exact four-paw standing posture, scale, position, colors, bright cyan markings, fur, face and anatomy. ${actions[label]} Locked camera, scale, ground baseline and lighting. Keep the creature at the original small size, in the center of the frame. Maintain wide perfectly flat #00ff00 margins on all four sides. Every fur tip remains fully visible and far from the frame boundary. Absolutely no crop, zoom, enlargement, camera drift, color change, silhouette ghosting, duplicated limbs, twisting spine, whole-body squash/stretch, external light, particles, floor, shadow or other objects. A real natural articulated canine movement, no image warp.`;
    const request = { characterAssetId, startPoseId: 'original', model: 'imagine-1.5', resolution: '720p',
      animations: [{ label: `${label}-natural-take-02`, prompt, duration: 2, startPoseId: 'original' }] };
    records[slug] = { started: true, request }; await persist();
    const result = await call('tools/autosprite_animate', request);
    const job = result.jobs?.[0]; if (!job?.jobId) throw Error('Missing video job');
    Object.assign(records[slug], { jobId: job.jobId, assetId: job.assetId, label }); await persist();
    console.log(`${slug}: retake submitted`);
  }
} else if (command === 'status') {
  for (const [slug, entry] of Object.entries(records)) {
    if (entry.localFile) continue;
    const result = await call('jobs/' + entry.jobId); entry.status = result.status; await persist();
    console.log(`${slug}: ${result.status}`);
    if (!['completed', 'succeeded'].includes(result.status)) continue;
    const url = result.videoUrl ?? result.video?.url ?? result.url;
    if (!url) throw Error('Missing completed video URL');
    const video = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!video.ok) throw Error('Video download failed');
    entry.localFile = `fox-${slug.replace('/', '-')}-raw.mp4`;
    await fs.writeFile(path.join(output, entry.localFile), Buffer.from(await video.arrayBuffer())); await persist();
  }
} else throw Error('Use submit or status');

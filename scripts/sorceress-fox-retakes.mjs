// Bounded, reviewable retakes. Original jobs and source clips remain untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('artifacts/sorceress/fox-companion-v1');
const take=process.env.FOX_VIDEO_TAKE??'take-02';
const videoModel=process.env.FOX_VIDEO_MODEL??'wan-2.7';
if(!/^take-0[234]$/.test(take)||!['wan-2.7','imagine-1.5'].includes(videoModel))throw Error('Unsupported retake');
const output = path.join(root, take);
await fs.mkdir(output, {recursive:true});
const key = (await fs.readFile((await fs.readFile('.local-credentials/sorceress.path','utf8')).trim(),'utf8')).trim();
const originals = JSON.parse(await fs.readFile(path.join(root,'jobs.json'),'utf8'));
const filename = path.join(output,'jobs.json');
let records = {};
try { records = JSON.parse(await fs.readFile(filename,'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
const save = () => fs.writeFile(filename,JSON.stringify(records,null,2)+'\n');
async function call(endpoint, body) {
  const r=await fetch('https://sorceress.games/api/v1/'+endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const j=await r.json(); if(!r.ok||j.ok===false||j.success===false) throw Error(`Service error ${r.status}: ${endpoint}`);return j.data??j;
}
const identity = {
  '01':'Keep the raised near forepaw, small turquoise forehead diamond and single turquoise shoulder spiral.',
  '02':'Keep the tilted head, white front stockings, large upturned white-tipped tail and its ONE broad turquoise ribbon with gold edges.',
  '03':'Keep the exact playful bow posture: shoulders low, both white forelegs stretched forward, hips raised. Keep the giant upright fluffy tail, predominantly WHITE, with TWO long curved turquoise ribbons with gold edges. Those two bands must stay clearly visible and unchanged. Keep the exact complex turquoise body markings and fluffy white chest.',
  '04':'Keep the exact walking stance, flowing white mane and white stockings, and elaborate gold-bordered turquoise markings covering the back and large tail.',
  '05':'Keep the exact seated pose throughout: hindquarters remain sitting, both front feet on the baseline. Keep the enormous white mane and huge white tail curled to the side, with the exact gold-edged turquoise star patterns. Do not stand up.',
};
const motion = {
  idle:'Create a seamless forward-playing idle LOOP, one complete cycle returning precisely to the supplied starting pose, including head, ears and tail, with no camera shift. One natural blink, tiny articulated ear twitch and barely perceptible chest breathing. Tail remains almost still; only its very tip moves a tiny amount and returns. No floating pieces or detached tufts of fur. Start and end at the same rest pose and velocity. No reverse or ping-pong motion.',
  attack:'Make one short compact attack gesture toward the LEFT: move one forepaw forward in a small swipe, incline the head slightly toward it, then return to the exact reference pose. Keep the hind paws and body root in the same place. No leaping or translation.',
  cast:'Make one short gentle spell gesture: incline the head, briefly raise one forepaw just a little, then return to the exact reference pose. Existing turquoise markings may brighten gently within their existing shapes. No particles, projectiles or external effects.',
};
const command=process.argv[2];
if(command==='submit') {
  const id=process.argv[3], labels=process.argv.slice(4);
  if(!identity[id]||!labels.length||labels.some(x=>!motion[x])) throw Error('Use submit 01–05 idle/attack/cast');
  let characterAssetId=originals[id].characterAssetId;
  if((take==='take-03'&&id==='05')||(take==='take-04'&&id==='03')){
    const saved=path.join(output,`padded-character-${id}.json`);
    try{characterAssetId=JSON.parse(await fs.readFile(saved,'utf8')).characterAssetId;}
    catch(e){
      if(e.code!=='ENOENT')throw e;
      const upload=await call('tools/file_upload',{filename:`fox-${id}-padded-canonical.png`,contentType:'image/png'});
      const uploaded=await fetch(upload.uploadUrl,{method:'PUT',headers:{'Content-Type':'image/png'},body:await fs.readFile(path.join(output,`fox-${id}-canonical-green.png`))});if(!uploaded.ok)throw Error('Upload failed');
      const created=await call('tools/autosprite_create_character',{imageUrl:upload.publicUrl,name:`Rune fox ${id} with generous animation margin`,prompt:identity[id]});characterAssetId=created.assetId??created.characterAssetId;if(!characterAssetId)throw Error('Missing character');
      await fs.writeFile(saved,JSON.stringify({characterAssetId}));
    }
  }
  for(const label of labels) {
    const slug=`${id}/${label}`;
    if(records[slug]?.jobId) {console.log(slug+': already submitted');continue;}
    if(records[slug]?.started) throw Error('Uncertain submission: '+slug);
    const prompt=`Animate the EXACT supplied image. The first video frame must be visually identical to the supplied reference; preserve its pose, proportions, markings, fur colors, face, view angle, size and location. ${identity[id]} ${motion[label]} Locked camera and scale. The fox remains fully within the middle 70% of the square frame, with generous empty safety margins on every side throughout. Background remains a perfectly flat solid green #00ff00. There is only this one fox. The gesture is practiced in empty space: absolutely no target, opponent, prop, second creature, extra paw or object entering from outside the frame. No floor, shadow, scene, plants, text, extra limbs, extra tail, redraw, redesign, camera motion, zoom, rotation, squash or stretch. The fox keeps exactly the same anatomy and illustration style in every frame.`;
    const request={characterAssetId,startPoseId:'original',model:videoModel,resolution:'720p',animations:[{label:`${label}-${take}`,prompt,duration:2,startPoseId:'original'}]};
    records[slug]={started:true,reason:'Bounded identity, loop and margin retake; original takes retained',request};await save();
    const r=await call('tools/autosprite_animate',request);const job=r.jobs?.[0];if(!job?.jobId)throw Error('Missing video job');
    Object.assign(records[slug],{jobId:job.jobId,assetId:job.assetId});await save();console.log(slug+': identity retake submitted');
  }
} else if(command==='status') {
  for(const [slug,entry] of Object.entries(records)) {
    if(entry.localFile)continue;
    const r=await call('jobs/'+entry.jobId);entry.status=r.status;await save();console.log(slug+': '+r.status);
    if(!['completed','succeeded'].includes(r.status))continue;
    const url=r.videoUrl??r.video?.url??r.url;if(!url)throw Error('Missing raw video');
    const video=await fetch(url);if(!video.ok)throw Error('Download failed');const file='fox-'+slug.replace('/','-')+'-raw.mp4';await fs.writeFile(path.join(output,file),Buffer.from(await video.arrayBuffer()));entry.localFile=file;await save();
  }
} else throw Error('Use submit or status');

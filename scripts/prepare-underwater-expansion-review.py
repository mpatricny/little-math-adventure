"""Browser-compatible review copies of real video; raw bytes stay authoritative."""
from pathlib import Path
import json
from fractions import Fraction
import av

ROOT=Path(__file__).resolve().parents[1]/'artifacts/sorceress/underwater-expansion'
OUT=ROOT/'review'
OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'jobs.json').read_text())
cards=[]
for slug,spec in manifest.items():
    for job in spec['jobs']:
        if not job.get('localFile'):continue
        source=ROOT/job['localFile'];name=source.stem
        with av.open(str(source)) as original:
            codec=original.streams.video[0].codec_context.name
            rate=original.streams.video[0].average_rate
            width,height=original.streams.video[0].width,original.streams.video[0].height
            if not (OUT/f'{name}.mp4').exists():
                with av.open(str(OUT/f'{name}.mp4'),mode='w',options={'movflags':'faststart'}) as review:
                    stream=review.add_stream('libx264',rate=rate)
                    stream.width=width;stream.height=height;stream.pix_fmt='yuv420p'
                    stream.options={'crf':'17','preset':'fast','profile':'baseline'}
                    for i,frame in enumerate(original.decode(video=0)):
                        frame=frame.reformat(format='yuv420p');frame.pts=i;frame.time_base=Fraction(1,rate)
                        for packet in stream.encode(frame):review.mux(packet)
                    for packet in stream.encode():review.mux(packet)
        # Copy only public review media into this isolated server root.
        for suffix in ['review.png','all-native-review.png','review.webp','source-first.png','source-last.png','source-extent.png','source-motion.png']:
            path=ROOT/f'{name}-{suffix}'
            if path.exists():(OUT/path.name).write_bytes(path.read_bytes())
        title=f'{slug} / {job["label"]} / {job.get("take","v1")}'
        cards.append(f'<article><h2>{title}</h2><video controls loop muted playsinline preload="metadata" src="{name}.mp4"></video>'
            f'<p>Original codec {codec}; {width} × {height}; {rate} FPS. Same decoded geometry and motion; review codec only. Approve raw source hash.</p>'
            f'<a href="{name}-review.png">Every 4 + last</a> · <a href="{name}-all-native-review.png">Every native frame</a> · <a href="{name}-source-extent.png">Extent</a> · '
            f'<a href="{name}-source-motion.png">Motion</a><img loading="lazy" src="{name}-review.png"></article>')
        print(title,'browser copy ready; original codec',codec,flush=True)
html='<!doctype html><meta charset="utf-8"><title>Underwater raw video review</title><style>body{background:#18232e;color:#eee;font:16px system-ui;margin:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px}video{width:100%;max-height:580px}img{width:100%;margin-top:14px}a{color:#8edfff}article{min-width:0;background:#223241;padding:18px}p{font-size:13px;line-height:1.4}</style><h1>Actual source video review</h1><p>Read-only artifact page. No game, profiles, or API calls. Original raw files and source-review.json remain authoritative.</p><main>'+''.join(cards)+'</main>'
(OUT/'index.html').write_text(html)

# Production is reviewed separately from source approval. Copy exact normalized
# PNGs and preview bytes; this page never reads the job/credential manifests.
production=None
if (ROOT/'production.json').exists():
    production=json.loads((ROOT/'production.json').read_text())
elif list(ROOT.glob('*-frames/00.png')):
    # Review is also useful after extraction but before a completed metadata
    # transaction. This never creates production metadata or a verifier receipt.
    specs=json.loads((Path(__file__).parent/'underwater-expansion-specs.json').read_text())
    approvals=json.loads((ROOT/'approvals.json').read_text())
    production={'creatures':{}}
    for slug,spec in specs.items():
        creature={'prefix':spec['prefix'],'actions':{}}
        for action in ['idle','attack','defend','defeat']:
            folder=ROOT/f'{spec["prefix"]}-{action}-frames'
            count=len(list(folder.glob('*.png')))
            if not count:continue
            approval=approvals['videos'][f'{slug}/{action}']
            creature['actions'][action]={'frameCount':count,'sourceWindow':[approval['startFrame'],approval['endFrame']],
                'playbackFrames':list(range(count))+list(range(count-2,0,-1)) if action=='idle' else list(range(count))}
        production['creatures'][slug]=creature
if production:
    production_cards=[]
    for creature in production['creatures'].values():
        for action,data in creature['actions'].items():
            name=f'{creature["prefix"]}-{action}'
            for suffix in ['preview.webp','contact-light.png','contact-dark.png']:
                source=ROOT/f'{name}-{suffix}';(OUT/source.name).write_bytes(source.read_bytes())
            frame_paths=[]
            for i in range(data['frameCount']):
                source=ROOT/f'{name}-frames'/f'{i:02}.png'
                destination=f'{name}-frame-{i:02}.png';(OUT/destination).write_bytes(source.read_bytes());frame_paths.append(destination)
            production_cards.append(f'<article data-frames=\'{json.dumps(frame_paths)}\' data-sequence=\'{json.dumps(data["playbackFrames"])}\'>'
                f'<h2>{name}</h2><p>{data["frameCount"]} frames · 512 × 512 · 6 FPS · native {data["sourceWindow"]} / Every 4</p>'
                f'<canvas width="512" height="512"></canvas><p class="frame"></p>'
                '<button data-action="play">Play / pause</button> <button data-action="first">First</button> '
                '<button data-action="previous">Previous</button> <button data-action="next">Next</button> '
                '<button data-action="last">Last</button> <button data-action="background">Light / dark</button>'
                f'<p><a href="{name}-contact-light.png">All frames / light</a> · <a href="{name}-contact-dark.png">All frames / dark</a> · '
                f'<a href="{name}-preview.webp">Assembled WebP loop</a></p></article>')
    production_html='''<!doctype html><meta charset="utf-8"><title>Normalized production motion review</title>
<style>body{background:#18232e;color:#eee;font:16px system-ui;margin:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px}canvas{width:100%;max-width:512px;background:#182833}a{color:#8edfff}article{min-width:0;background:#223241;padding:18px}p{font-size:13px}button{padding:8px;margin:2px}</style>
<h1>Normalized production motion review</h1><p>Exact extracted PNG frames. Continuous playback at six FPS; idle ping-pongs. Source and production need separate approval.</p><main>'''+''.join(production_cards)+'''</main><script>
document.querySelectorAll('article').forEach(async card=>{
 const files=JSON.parse(card.dataset.frames),sequence=JSON.parse(card.dataset.sequence);
 const images=await Promise.all(files.map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src=src})));
 const canvas=card.querySelector('canvas'),context=canvas.getContext('2d');let frame=0,position=0,playing=true;
 const draw=()=>{context.clearRect(0,0,512,512);context.drawImage(images[frame],0,0);card.querySelector('.frame').textContent=`Frame ${frame} / ${images.length-1}`};
 card.querySelectorAll('button').forEach(button=>button.onclick=()=>{
  const action=button.dataset.action;if(action==='background'){canvas.style.background=canvas.style.background?'':'#e8e8e4';return}
  if(action==='play'){playing=!playing;return}playing=false;
  frame=action==='first'?0:action==='last'?images.length-1:Math.max(0,Math.min(images.length-1,frame+(action==='next'?1:-1)));
  position=Math.max(0,sequence.indexOf(frame));draw();
 });draw();setInterval(()=>{if(playing){position=(position+1)%sequence.length;frame=sequence[position];draw()}},1000/6);
});</script>'''
    (OUT/'production.html').write_text(production_html)
    print('Separate exact-frame production review ready: production.html',flush=True)

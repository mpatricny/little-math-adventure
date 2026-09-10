"""Check remote AutoSprite frame timing/geometry against the approved source video."""
from pathlib import Path
import json
import av
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'artifacts/sorceress/underwater-finalists'
manifest = json.loads((ROOT / 'jobs.json').read_text())
for slug, spec in manifest.items():
    for job in spec['jobs']:
        if not job.get('keyFile'):
            continue
        meta = job['keyMetadata']
        sheet = Image.open(ROOT / job['keyFile']).convert('RGBA')
        with av.open(str(ROOT / job['localFile'])) as video:
            rate = float(video.streams.video[0].average_rate)
            raw = [np.asarray(f.to_image().convert('RGB').resize((512,512), Image.Resampling.LANCZOS)).astype(float)
                   for f in video.decode(video=0)]
        raw_masks = np.array([(f[:,:,1]-np.maximum(f[:,:,0],f[:,:,2])) < 55 for f in raw])
        matches = []
        for i in range(meta['frameCount']):
            x, y = i % meta['cols'] * 512, i // meta['cols'] * 512
            tile = np.asarray(sheet.crop((x,y,x+512,y+512)))
            mask = tile[:,:,3] > 127
            iou = np.array([np.sum(m & mask)/max(1,np.sum(m | mask)) for m in raw_masks])
            match = int(iou.argmax())
            matches.append({'key':i,'source':match,'iou':round(float(iou[match]),4)})
        print(slug,job['label'],'sourceFPS',rate,'remoteFPS',meta.get('sourceFps'),matches,flush=True)
